/**
 * Arena Web Worker — wrapper sobre runBootstrap + buildArenaMarket + runArena.
 *
 * Orquesta el pipeline end-to-end del caso de estudio TBSC desde un input
 * serializable. El worker es responsable de:
 *   1. Correr runBootstrap (dummy portfolio para forzar la rama RF + emitir
 *      yieldPaths y etfReturns que arena necesita).
 *   2. buildArenaMarket: arma los retornos de bullets reales + extensiones
 *      vía computeBulletReturns, y compone equity/cash sleeves.
 *   3. runArena: forward loop USD con cashflowStep + maturity events.
 *
 * Protocolo:
 *   main → worker: { id, payload: ArenaJobInput }
 *   worker → main: { id, ok: true, result: ArenaJobOutput } | { id, ok: false, error }
 *
 * Se transfiere ownership de los buffers grandes para evitar copias.
 */

/// <reference lib="webworker" />

import {
  DEFAULT_BOOTSTRAP_CONFIG,
  getYieldBounds,
  runBootstrap,
} from '../domain/bootstrap';
import { defaultBulletLineup } from '../domain/bullets';
import { makeLoanEvent } from '../domain/cashflow';
import {
  buildArenaMarket,
  runArena,
  type ArenaConfig,
  type ArenaEvent,
  type ArenaStats,
} from '../domain/arena';
import {
  DEFAULT_ROLLOVER_THRESHOLDS,
  type RolloverThresholds,
} from '../domain/rollover';
import type { Ticker } from '../data/market.generated';
import type { ExpandedPortfolio } from '../domain/types';

// =====================================================================
// PROTOCOLO PÚBLICO
// =====================================================================

export type ArenaJobInput = {
  // ---- Plan & bullets ----
  /**
   * Bullets reales del ladder. Si null/omitido, usa defaultBulletLineup()
   * (iBonds 2026-2034 + 2 sintéticos), que es el ladder TBSC default.
   */
  realBullets?:
    | null
    | Array<{
        name: string;
        maturityY: number;
        durInitY: number;
        isSynthetic: boolean;
      }>;
  nExtensions?: number; // default 25
  extensionSpacingY?: number; // default 1.0
  bulletTotalPct: number; // 0..1
  equityPct: number;
  cashPct: number;
  eqtyMin?: number; // default 0.10
  eqtyMax?: number; // default 0.50
  equityMix: Array<{ ticker: string; weight: number }>;
  cashTicker: string;
  initialSpread: number; // decimal, e.g., 0.011

  // ---- Thresholds rollover (override DEFAULT_ROLLOVER_THRESHOLDS) ----
  thresholds?: Partial<RolloverThresholds>;
  rolloverEnabled?: boolean; // default true

  // ---- Flows ----
  inflowBaseAnnual?: number; // default 250_000
  inflowGrowth?: number; // default 0

  // ---- Loan ----
  loanEvent?:
    | null
    | {
        triggerMonth: number;
        amountPctAum: number;
        rateFactor?: number;
        rateSpreadBp?: number;
        rateBase?: 'sofr' | 'uy3y';
        termMonths?: number;
      };

  // ---- Market dimensions ----
  initialAumUsd: number;
  horizonMonths: number;
  nSims: number;
  seed: number;
  blockSize?: number;

  // ---- Otros ----
  cashBandUpper?: number; // default 0.05

  // ---- DPF1Y baseline override ----
  /**
   * Tasa inicial fija del DPF1Y baseline (decimal anual). Si null/omitido,
   * se computa como UST1Y inicial + initialSpread. El spread implícito
   * (override − UST1Y inicial) se preserva en renovaciones anuales.
   */
  dpfRateOverride?: number | null;

  // ---- Sleeve duration cap ----
  /**
   * Si se pasa, el lineup default se filtra a vintages con maturityY <= este
   * valor. Útil para escenarios de tasas largo plazo desfavorable donde el
   * cliente prefiere acortar duración (e.g., 4 deja ID26-ID29). Si null/
   * omitido, lineup completo (~11y). Ignorado si payload.realBullets viene
   * con un lineup explícito.
   */
  maxBulletYears?: number | null;

  // ---- Cap mensual de equity ----
  // No expuesto en el ArenaJobInput público: el worker SIEMPRE enforza la
  // banda dura eqtyMax cada mes. Para correr el motor sin el cap mensual
  // (e.g., parity tests con el motor Python) usar runArena directamente
  // desde TS pasando enforceMonthlyEquityCap=false en ArenaConfig.

  // ---- All-in fee ----
  /**
   * Fee anual total a deducir del AUM, en basis points (1 bp = 0.01%).
   * Cubre TER de los ETFs subyacentes, custodia, asesoría, intermediación
   * — todos los costos NO modelados explícitamente por el motor (que opera
   * sobre returns brutos de los ETFs).
   *
   * El fee se aplica como post-process: el motor matemático corre intacto
   * (preservando paridad Python) y al final se multiplica el AUM mensual
   * por (1 − fee_annual)^(t/12). Equivalente económicamente a deducir el
   * fee del NAV cada mes; aproximación de primer orden para fees pequeños
   * porque NO altera las decisiones operativas del motor (rebalanceos,
   * cascada de ventas forzadas). Diferencia vs. modelo "true" con fee
   * deducido step-by-step: <0.5% en finalAum para fees ≤50 bp.
   *
   * Default 0 (motor reporta retornos brutos, comportamiento previo). En
   * el PDF entregable, si feeBps > 0, los stats reportados son NETOS.
   */
  allInFeeBps?: number;
};

export type ArenaJobOutput = {
  /** AUM gross per sim per mes, sim-major [nSims × (H+1)]. */
  aumPath: Float64Array;
  /** Net wealth (AUM − loan_balance). */
  netWealthPath: Float64Array;
  /** Sleeve AUMs [nSims × (H+1) × 3] (0=bullets, 1=equity, 2=cash). */
  sleevePath: Float64Array;
  /** Loan balance path [nSims × (H+1)]. */
  loanBalancePath: Float64Array;
  /**
   * DPF1Y baseline per-sim — depósito 1y rolling con renovación anual usando
   * los mismos yield paths que la estrategia (paired).
   */
  dpfBaselinePath: Float64Array;
  events: ArenaEvent[];
  regimeCounts: { A: number; B: number; C: number };
  stats: ArenaStats;
  /** Cumulative metrics post-final (n_sims arrays). */
  cumInterestPaid: Float64Array;
  cumForcedEquitySales: Float64Array;
  cumForcedBulletSales: Float64Array;
  cumLoanShortfall: Float64Array;
  allBulletNames: string[];
  meta: {
    nSims: number;
    horizonMonths: number;
    elapsedBootstrapMs: number;
    elapsedArenaMs: number;
  };
};

type IncomingMessage = {
  id: string;
  payload: ArenaJobInput;
};

type OkResponse = {
  id: string;
  ok: true;
  result: ArenaJobOutput;
};

type ErrResponse = {
  id: string;
  ok: false;
  error: string;
};

type ProgressResponse = {
  id: string;
  progress: true;
  stage: 'bootstrap' | 'arena';
  completedPaths?: number;
  totalPaths?: number;
};

export type ArenaWorkerResponse = OkResponse | ErrResponse | ProgressResponse;

// =====================================================================
// EJECUCIÓN DEL JOB
// =====================================================================

function executeJob(id: string, payload: ArenaJobInput): {
  response: OkResponse;
  transferBuffers: ArrayBuffer[];
} {
  const t0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  // ----- Validaciones tempranas -----
  if (!Number.isFinite(payload.initialAumUsd) || payload.initialAumUsd <= 0) {
    throw new Error(`initialAumUsd inválido: ${payload.initialAumUsd}`);
  }
  if (!Number.isInteger(payload.horizonMonths) || payload.horizonMonths < 1) {
    throw new Error(`horizonMonths inválido: ${payload.horizonMonths}`);
  }
  if (!Number.isInteger(payload.nSims) || payload.nSims < 1) {
    throw new Error(`nSims inválido: ${payload.nSims}`);
  }
  const allocSum = payload.bulletTotalPct + payload.equityPct + payload.cashPct;
  if (Math.abs(allocSum - 1) > 1e-6) {
    throw new Error(
      `allocation suma ${allocSum.toFixed(4)} ≠ 1 (bullets+equity+cash)`,
    );
  }

  // ----- Bullets reales -----
  const realBullets = payload.realBullets
    ? payload.realBullets.map((b) => ({
        name: b.name,
        maturityY: b.maturityY,
        durInitY: b.durInitY,
        isSynthetic: b.isSynthetic,
      }))
    : defaultBulletLineup(undefined, payload.maxBulletYears);

  // ----- Step 1: runBootstrap con portfolio dummy.
  // Necesitamos yieldPaths + etfReturns. El portfolio puede ser irrelevante,
  // usamos 100% cashTicker. ----
  const dummyPortfolio: ExpandedPortfolio = {
    etfs: { [payload.cashTicker as Ticker]: 100 } as Partial<Record<Ticker, number>>,
    fixed: { FIXED6: 0, FIXED9: 0 },
    totalWeight: 100,
  };
  const blockSize = payload.blockSize ?? DEFAULT_BOOTSTRAP_CONFIG.blockSize;
  const tBoot0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const boot = runBootstrap({
    portfolios: { A: dummyPortfolio, B: dummyPortfolio },
    horizonMonths: payload.horizonMonths,
    config: {
      ...DEFAULT_BOOTSTRAP_CONFIG,
      nPaths: payload.nSims,
      seed: payload.seed,
      blockSize,
    },
    outputYieldPaths: true,
    outputEtfReturns: true,
  });
  const tBoot1 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  // ----- Step 2: buildArenaMarket -----
  const initialCurve: [number, number, number, number] = [
    getYieldBounds('IRX').initial,
    getYieldBounds('FVX').initial,
    getYieldBounds('TNX').initial,
    getYieldBounds('TYX').initial,
  ];
  const equityMix = payload.equityMix.map((m) => ({
    ticker: m.ticker as Ticker,
    weight: m.weight,
  }));
  const nExtensions = payload.nExtensions ?? 25;
  const extensionSpacingY = payload.extensionSpacingY ?? 1.0;
  const market = buildArenaMarket({
    realBullets,
    nExtensions,
    extensionSpacingY,
    equityMix,
    cashTicker: payload.cashTicker as Ticker,
    initialSpread: payload.initialSpread,
    initialCurve,
    nSims: payload.nSims,
    horizonMonths: payload.horizonMonths,
    yieldPaths: boot.yieldPaths!,
    etfReturns: boot.etfReturns!,
  });

  // ----- Step 3: runArena -----
  const thresholds: RolloverThresholds = {
    ...DEFAULT_ROLLOVER_THRESHOLDS,
    ...(payload.thresholds ?? {}),
  };
  const loanEvent = payload.loanEvent
    ? makeLoanEvent({
        triggerMonth: payload.loanEvent.triggerMonth,
        amountPctAum: payload.loanEvent.amountPctAum,
        rateFactor: payload.loanEvent.rateFactor,
        rateSpreadBp: payload.loanEvent.rateSpreadBp,
        rateBase: payload.loanEvent.rateBase,
        termMonths: payload.loanEvent.termMonths,
      })
    : null;
  const tArena0 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  const config: ArenaConfig = {
    rolloverPlan: {
      bullets: realBullets,
      bulletTotalPct: payload.bulletTotalPct,
      equityPct: payload.equityPct,
      cashPct: payload.cashPct,
      eqtyMin: payload.eqtyMin ?? 0.10,
      eqtyMax: payload.eqtyMax ?? 0.50,
      equityMix,
      cashTicker: payload.cashTicker as Ticker,
      initialSpread: payload.initialSpread,
    },
    rolloverThresholds: thresholds,
    loanEvent,
    inflowBaseAnnual: payload.inflowBaseAnnual ?? 250_000,
    inflowGrowth: payload.inflowGrowth ?? 0,
    initialAumUsd: payload.initialAumUsd,
    nExtensions,
    extensionSpacingY,
    cashBandUpper: payload.cashBandUpper ?? 0.05,
    rolloverEnabled: payload.rolloverEnabled ?? true,
    dpfRateOverride: payload.dpfRateOverride ?? null,
    // Hardcoded true: el caso de estudio enforza la banda dura del
    // rollover mensualmente, sin opción de desactivar desde el UI. Las
    // parity tests usan runArena directo (no pasan por este worker) y
    // pueden setear false vía ArenaConfig si necesitan la rama vieja.
    enforceMonthlyEquityCap: true,
  };
  const arenaOut = runArena(config, market);
  const tArena1 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  // ----- All-in fee post-process -----
  // Aplica el descuento del fee (TER + custodia + asesoría + intermediación)
  // a los paths simulados y recomputa los stats. NO toca el motor matemático
  // — preserva paridad Python. Ver doc del campo allInFeeBps en ArenaJobInput
  // para justificación matemática y limitaciones de la aproximación.
  const feeBps = payload.allInFeeBps ?? 0;
  const processed = feeBps > 0
    ? applyAllInFee(arenaOut, feeBps, payload.horizonMonths, payload.nSims, payload.initialAumUsd)
    : arenaOut;

  // ----- Build response -----
  const result: ArenaJobOutput = {
    aumPath: processed.aumPath,
    netWealthPath: processed.netWealthPath,
    sleevePath: processed.sleevePath,
    loanBalancePath: arenaOut.loanBalancePath,
    dpfBaselinePath: processed.dpfBaselinePath,
    events: arenaOut.events,
    regimeCounts: arenaOut.regimeCounts,
    stats: processed.stats,
    cumInterestPaid: arenaOut.finalState.cumInterestPaid,
    cumForcedEquitySales: arenaOut.finalState.cumForcedEquitySales,
    cumForcedBulletSales: arenaOut.finalState.cumForcedBulletSales,
    cumLoanShortfall: arenaOut.finalState.cumLoanShortfall,
    allBulletNames: arenaOut.allBullets.map((b) => b.name),
    meta: {
      nSims: payload.nSims,
      horizonMonths: payload.horizonMonths,
      elapsedBootstrapMs: tBoot1 - tBoot0,
      elapsedArenaMs: tArena1 - tArena0,
    },
  };

  // Transferir ownership de buffers grandes (sin copia entre worker y main).
  const transferBuffers: ArrayBuffer[] = [
    result.aumPath.buffer as ArrayBuffer,
    result.netWealthPath.buffer as ArrayBuffer,
    result.sleevePath.buffer as ArrayBuffer,
    result.loanBalancePath.buffer as ArrayBuffer,
    result.dpfBaselinePath.buffer as ArrayBuffer,
    result.cumInterestPaid.buffer as ArrayBuffer,
    result.cumForcedEquitySales.buffer as ArrayBuffer,
    result.cumForcedBulletSales.buffer as ArrayBuffer,
    result.cumLoanShortfall.buffer as ArrayBuffer,
  ];

  // Reportar wall-clock total — útil para logs.
  const t1 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  console.info(
    `[arena.worker] total ${(t1 - t0).toFixed(0)}ms ` +
      `(bootstrap ${(tBoot1 - tBoot0).toFixed(0)}ms, ` +
      `arena ${(tArena1 - tArena0).toFixed(0)}ms)`,
  );

  return { response: { id, ok: true, result }, transferBuffers };
}

// =====================================================================
// ALL-IN FEE POST-PROCESS
// =====================================================================

type ArenaOutLike = {
  aumPath: Float64Array;
  netWealthPath: Float64Array;
  sleevePath: Float64Array;
  loanBalancePath: Float64Array;
  dpfBaselinePath: Float64Array;
  events: ArenaEvent[];
  regimeCounts: { A: number; B: number; C: number };
  stats: ArenaStats;
  finalState: {
    cumInterestPaid: Float64Array;
    cumForcedEquitySales: Float64Array;
    cumForcedBulletSales: Float64Array;
    cumLoanShortfall: Float64Array;
  };
  allBullets: { name: string }[];
};

/**
 * Deduce el all-in fee anual (en bps) de los paths simulados. Estrategia:
 *   1. Factor mensual de decay: f = (1 − fee_annual)^(1/12)
 *   2. Factors acumulados: factor[t] = f^t (factor[0] = 1)
 *   3. Multiplicar aumPath, netWealthPath, sleevePath, dpfBaselinePath por
 *      factor[t] — equivalente económicamente a deducir el fee del NAV
 *      mensualmente.
 *   4. Recomputar stats sobre los paths netos.
 *
 * NO toca loanBalancePath ni los cum* del préstamo (el costo del préstamo es
 * extra-portfolio en términos nominales del cliente; el fee del manager se
 * aplica sobre el AUM del fondo).
 */
function applyAllInFee(
  arenaOut: ArenaOutLike,
  feeBps: number,
  horizonMonths: number,
  nSims: number,
  initialAum: number,
): ArenaOutLike {
  const Hp1 = horizonMonths + 1;
  const feeAnnualDecimal = feeBps / 10000;
  const monthlyFactor = Math.pow(1 - feeAnnualDecimal, 1 / 12);

  // Vector pre-computado de decay factor por mes
  const decay = new Float64Array(Hp1);
  decay[0] = 1;
  for (let t = 1; t < Hp1; t++) decay[t] = decay[t - 1] * monthlyFactor;

  // Aplicar a aumPath y netWealthPath
  const aum = new Float64Array(arenaOut.aumPath.length);
  const net = new Float64Array(arenaOut.netWealthPath.length);
  for (let s = 0; s < nSims; s++) {
    for (let t = 0; t < Hp1; t++) {
      const idx = s * Hp1 + t;
      aum[idx] = arenaOut.aumPath[idx] * decay[t];
      net[idx] = arenaOut.netWealthPath[idx] * decay[t];
    }
  }
  // Aplicar a sleevePath (3 sleeves por (s, t))
  const sleeve = new Float64Array(arenaOut.sleevePath.length);
  for (let s = 0; s < nSims; s++) {
    for (let t = 0; t < Hp1; t++) {
      const base = (s * Hp1 + t) * 3;
      sleeve[base + 0] = arenaOut.sleevePath[base + 0] * decay[t];
      sleeve[base + 1] = arenaOut.sleevePath[base + 1] * decay[t];
      sleeve[base + 2] = arenaOut.sleevePath[base + 2] * decay[t];
    }
  }
  // Aplicar al DPF baseline también — el cliente puede tener fee aplicable
  // al "qué pasa si no hago nada fancy"; mantenerlo apples-to-apples evita
  // que el DPF baseline parezca mejor de lo que es en términos netos.
  const dpf = new Float64Array(arenaOut.dpfBaselinePath.length);
  for (let s = 0; s < nSims; s++) {
    for (let t = 0; t < Hp1; t++) {
      const idx = s * Hp1 + t;
      dpf[idx] = arenaOut.dpfBaselinePath[idx] * decay[t];
    }
  }

  // Recomputar stats sobre paths netos. Replicamos la fórmula de arena.ts
  // (líneas 640–685): netReturn[s] = (finalNet − initial − totalInflows) /
  // initial; medianas y anualizado vía pow(1+r, 12/H).
  const totalInflows = arenaOut.stats.totalInflows;
  const finalAums = new Float64Array(nSims);
  const finalNets = new Float64Array(nSims);
  const netReturns = new Float64Array(nSims);
  let nPos = 0;
  for (let s = 0; s < nSims; s++) {
    finalAums[s] = aum[s * Hp1 + horizonMonths];
    finalNets[s] = net[s * Hp1 + horizonMonths];
    netReturns[s] = (finalNets[s] - initialAum - totalInflows) / initialAum;
    if (netReturns[s] > 0) nPos++;
  }
  const sortedR = Float64Array.from(netReturns);
  sortedR.sort();
  const annFactor = 12.0 / horizonMonths;
  const med = quantile(sortedR, 0.5);
  const p5 = quantile(sortedR, 0.05);
  const p95 = quantile(sortedR, 0.95);

  const stats: ArenaStats = {
    initialAum: arenaOut.stats.initialAum,
    totalInflows,
    finalAumMed: medianOf(finalAums),
    finalNetMed: medianOf(finalNets),
    netReturnP5: p5,
    netReturnMed: med,
    netReturnP95: p95,
    annNetMed: med > -1 ? Math.pow(1 + med, annFactor) - 1 : -1,
    annNetP5: p5 > -1 ? Math.pow(1 + p5, annFactor) - 1 : -1,
    annNetP95: Math.pow(1 + p95, annFactor) - 1,
    probPos: nPos / nSims,
    // cum* del préstamo se mantienen (operan sobre la deuda extra-portfolio
    // y no son afectados por el fee del manager del fondo).
    loanCumInterestMed: arenaOut.stats.loanCumInterestMed,
    forcedEquityMed: arenaOut.stats.forcedEquityMed,
    forcedBulletMed: arenaOut.stats.forcedBulletMed,
    loanShortfallMed: arenaOut.stats.loanShortfallMed,
  };

  return {
    ...arenaOut,
    aumPath: aum,
    netWealthPath: net,
    sleevePath: sleeve,
    dpfBaselinePath: dpf,
    stats,
  };
}

function quantile(sortedArr: Float64Array, p: number): number {
  const n = sortedArr.length;
  if (n === 0) return 0;
  const idx = Math.max(0, Math.min(n - 1, Math.floor(p * (n - 1))));
  return sortedArr[idx];
}

function medianOf(arr: Float64Array): number {
  const sorted = Float64Array.from(arr);
  sorted.sort();
  return quantile(sorted, 0.5);
}

self.onmessage = (event: MessageEvent<IncomingMessage>) => {
  const { id, payload } = event.data;
  try {
    const { response, transferBuffers } = executeJob(id, payload);
    self.postMessage(response, { transfer: transferBuffers });
  } catch (err) {
    const response: ErrResponse = {
      id,
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(response);
  }
};

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
    : defaultBulletLineup();

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
  };
  const arenaOut = runArena(config, market);
  const tArena1 =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();

  // ----- Build response -----
  const result: ArenaJobOutput = {
    aumPath: arenaOut.aumPath,
    netWealthPath: arenaOut.netWealthPath,
    sleevePath: arenaOut.sleevePath,
    loanBalancePath: arenaOut.loanBalancePath,
    events: arenaOut.events,
    regimeCounts: arenaOut.regimeCounts,
    stats: arenaOut.stats,
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

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
  HISTORICAL_DEFAULT_DATA,
  DEFAULT_BOOTSTRAP_BLOCK_YEARS,
  type BulletSleeveType,
} from '../domain/defaults';
import {
  buildArenaMarket,
  runArena,
  type ArenaConfig,
  type ArenaEvent,
  type ArenaMarket,
  type ArenaStats,
} from '../domain/arena';
import {
  DEFAULT_ROLLOVER_THRESHOLDS,
  type RolloverThresholds,
} from '../domain/rollover';
import {
  initBootstrapState,
  sampleReturnFromBucket,
  type TTMPanel,
  type BucketSleeveType,
} from '../domain/bulletBucketBootstrap';
import { createExtensionBullets } from '../domain/arena';
import type { BulletDef } from '../domain/bullets';
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
        /** Spread sobre curva treasury para este bullet. Si no se pasa, usa
         * el initialSpread del payload. Usado para bullets HY (~400bp). */
        spreadOverride?: number;
      }>;
  /**
   * Pesos iniciales por bullet (length = realBullets.length). Si se omite,
   * equal-weight entre los bullets vivos. Útil cuando combinamos bullets
   * de distinta calidad crediticia (IG + HY) con asignaciones distintas.
   */
  bulletInitialWeights?: ReadonlyArray<number>;
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

  /**
   * Fracción del sleeve "renta fija" (bulletTotalPct) que se asigna al
   * componente HY perpetual (GHYG). 0 ≤ hyWeight ≤ 1. Default 0 = todo
   * el sleeve va al ladder IG iBonds. Cuando > 0:
   *   - IG ladder: bulletTotalPct × (1 − hyWeight) × initialAUM
   *   - HY (GHYG): bulletTotalPct × hyWeight × initialAUM
   * El worker extrae automáticamente los retornos GHYG del bootstrap.
   */
  hyWeight?: number;
  /**
   * Fracción del AUM total al sleeve "Activos Reales" (0..1). Default 0
   * = 3 sleeves originales (bullets/equity/cash) suman 100%. Cuando > 0,
   * los 4 sleeves deben sumar 100%.
   */
  realAssetsPct?: number;
  /**
   * Mix interno del sleeve "Activos Reales". El worker blendea los retornos
   * de los tickers en proporción a sus pesos para producir el realAssetsReturns
   * que consume el motor. Default omitido → no se construye el sleeve.
   *
   * Componentes válidos hoy (MVP con data existente):
   *   - RWO: REITs globales (real estate)
   *   - IEI: Treasury 3-7y (proxy de TIPS sintético)
   *   - IXC: Energy global (proxy de commodities)
   */
  realAssetsMix?: Array<{ ticker: string; weight: number }>;

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
        /**
         * 'loan' (default) = préstamo amortizing, deuda servida mes a mes.
         * 'sell' = venta inmediata vía cascada, sin deuda, AUM cae en escalón.
         */
        method?: 'loan' | 'sell';
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

  // ---- Bullet returns engine (PR #8b) ----
  /**
   * Motor de cálculo de retornos de bullets. 'parametric' (default) usa
   * el modelo curve + spread + duration decay del motor original — paridad
   * Python preservada. 'bucket-bootstrap' usa el panel TTM empírico
   * publicado por estudios-a-la-medida.
   *
   * Cuando es 'bucket-bootstrap', se requiere `ttmPanel` en el payload.
   * Si no llega, el worker revierte automáticamente a 'parametric'.
   */
  bulletReturnsEngine?: 'parametric' | 'bucket-bootstrap';
  /**
   * Panel TTM cargado desde estudios-a-la-medida/data/bullets_ttm_panel.json
   * (via useTTMPanel hook en el cliente). Solo se usa cuando
   * bulletReturnsEngine === 'bucket-bootstrap'. Si null/omitido con engine
   * = 'bucket-bootstrap', el worker revierte a 'parametric'.
   */
  ttmPanel?: TTMPanel | null;
};

export type ArenaJobOutput = {
  /** AUM gross per sim per mes, sim-major [nSims × (H+1)]. */
  aumPath: Float64Array;
  /**
   * AUM "Hold-to-Maturity" — versión paralela donde los bullets reciben un
   * haircut por defaults acumulados (bootstrap histórico Moody's) en vez de
   * vender a mercado. Equity y cash se valoran siempre a mercado (no tienen
   * "vencimiento"). Útil para mostrar al cliente qué patrimonio recibiría si
   * se queda hasta vencimiento natural de cada bullet, **incluida la
   * dispersión de tasas de rollover entre paths** (path A renueva al 6%,
   * path B al 3% → trayectorias distintas a 20y).
   */
  aumPathHTM: Float64Array;
  /** Net wealth (AUM − loan_balance). */
  netWealthPath: Float64Array;
  /**
   * AUM en TÉRMINOS REALES (USD a poder adquisitivo del t=0). Definido como
   * `aumPath[s][t] / inflationIndex[s][t]`, donde inflationIndex es producto
   * cumulativo de (1 + inflación mensual) sampleada del bootstrap. Si está
   * arriba de initialAum, el endowment ganó poder adquisitivo. Si está
   * abajo, lo perdió a pesar de crecer en términos nominales.
   */
  aumPathReal: Float64Array;
  /** Net wealth real (= aumPathReal − loanBalance/inflationIndex). */
  netWealthPathReal: Float64Array;
  /**
   * Índice de inflación cumulativo per-sim, sim-major [nSims × (H+1)].
   * inflationIndex[s][0] = 1. inflationIndex[s][t] = Π(1+inflación[s][k]) k=0..t-1.
   * Útil para reconstruir el AUM real en cualquier subset y para reference
   * lines del fan chart en modo "Real".
   */
  inflationIndexPath: Float64Array;
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
    /**
     * Seed PRNG usado por esta corrida. Persistido para reproducibilidad —
     * embebido en el PDF de disclaimers para que el cliente (o auditor) pueda
     * recomputar exactamente las mismas trayectorias en una sesión futura.
     */
    seed: number;
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
  const allocSum = payload.bulletTotalPct + payload.equityPct + payload.cashPct + (payload.realAssetsPct ?? 0);
  if (Math.abs(allocSum - 1) > 1e-6) {
    throw new Error(
      `allocation suma ${allocSum.toFixed(4)} ≠ 1 (bullets+equity+realAssets+cash)`,
    );
  }

  // ----- Bullets reales -----
  const realBullets = payload.realBullets
    ? payload.realBullets.map((b) => ({
        name: b.name,
        maturityY: b.maturityY,
        durInitY: b.durInitY,
        isSynthetic: b.isSynthetic,
        spreadOverride: b.spreadOverride,
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
    outputInflationPaths: true,
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
  const hyWeight = payload.hyWeight ?? 0;
  // Cuando el usuario setea maxBulletYears, capeamos también la maturityY de
  // los sintéticos de rollover — así el ladder se mantiene ≤ N años toda la
  // vida del estudio, no solo en el lineup inicial. payload.maxBulletYears
  // viene del store cuando maxBulletYearsEnabled=true.
  const extensionMaxMaturityY = payload.maxBulletYears ?? undefined;
  const market = buildArenaMarket({
    realBullets,
    nExtensions,
    extensionSpacingY,
    extensionMaxMaturityY,
    equityMix,
    cashTicker: payload.cashTicker as Ticker,
    initialSpread: payload.initialSpread,
    initialCurve,
    nSims: payload.nSims,
    horizonMonths: payload.horizonMonths,
    yieldPaths: boot.yieldPaths!,
    etfReturns: boot.etfReturns!,
    hyTicker: hyWeight > 0 ? ('GHYG' as Ticker) : null,
  });

  // ----- Real Assets sleeve: blend de retornos del mix interno -----
  // Para cada ticker del mix, multiplicamos por su peso normalizado y sumamos.
  // Si realAssetsPct = 0 o no hay mix, no construimos nada (mantiene null).
  const realAssetsPct = payload.realAssetsPct ?? 0;
  let realAssetsReturnsArr: Float32Array | null = null;
  if (realAssetsPct > 0 && payload.realAssetsMix && payload.realAssetsMix.length > 0) {
    const totW = payload.realAssetsMix.reduce((s, m) => s + m.weight, 0);
    if (totW > 0) {
      const total = payload.nSims * payload.horizonMonths;
      const blended = new Float32Array(total);
      for (const item of payload.realAssetsMix) {
        const w = item.weight / totW;
        const series = boot.etfReturns?.[item.ticker as Ticker];
        if (series && w > 0) {
          for (let i = 0; i < total; i++) blended[i] += w * series[i];
        }
      }
      realAssetsReturnsArr = blended;
    }
  }
  // Adjunta realAssetsReturns al market (tipo ArenaMarket lo soporta opcional)
  const marketWithRA = realAssetsReturnsArr
    ? { ...market, realAssetsReturns: realAssetsReturnsArr }
    : market;

  // ----- Step 2b: bucket bootstrap override (opcional, PR #8b) -----
  // Si el usuario activó bucket-bootstrap y el panel está disponible,
  // reemplazar market.bulletReturns con samples del bucket TTM empírico.
  // Esto deja todo el resto del market (yieldPaths, equityReturns,
  // cashReturns) intacto — el override es per-bullet, per-path, per-mes.
  //
  // Si engine='parametric' o panel no disponible, no se hace nada (motor
  // paramétrico actual con paridad Python preservada).
  const useBucketBootstrap =
    payload.bulletReturnsEngine === 'bucket-bootstrap' && payload.ttmPanel != null;
  const finalMarket = useBucketBootstrap
    ? overrideBulletReturnsWithBucketBootstrap(
        marketWithRA,
        [
          ...realBullets,
          ...createExtensionBullets(
            realBullets,
            nExtensions,
            extensionSpacingY,
            extensionMaxMaturityY,
          ),
        ],
        payload.ttmPanel!,
        payload.nSims,
        payload.horizonMonths,
        payload.seed,
      )
    : marketWithRA;

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
        method: payload.loanEvent.method,
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
      bulletInitialWeights: payload.bulletInitialWeights ?? null,
      hyWeight,
      realAssetsPct,
    },
    rolloverThresholds: thresholds,
    loanEvent,
    inflowBaseAnnual: payload.inflowBaseAnnual ?? 250_000,
    inflowGrowth: payload.inflowGrowth ?? 0,
    initialAumUsd: payload.initialAumUsd,
    nExtensions,
    extensionSpacingY,
    extensionMaxMaturityY,
    cashBandUpper: payload.cashBandUpper ?? 0.05,
    rolloverEnabled: payload.rolloverEnabled ?? true,
    dpfRateOverride: payload.dpfRateOverride ?? null,
    // Hardcoded true: el caso de estudio enforza la banda dura del
    // rollover mensualmente, sin opción de desactivar desde el UI. Las
    // parity tests usan runArena directo (no pasan por este worker) y
    // pueden setear false vía ArenaConfig si necesitan la rama vieja.
    enforceMonthlyEquityCap: true,
  };
  const arenaOut = runArena(config, finalMarket);
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

  // ----- Hold-to-maturity post-process -----
  // Para cada path simulado, computar el AUM "a vencimiento" paralelo al
  // AUM "a mercado". Bullets: valor mark-to-market × (1 - default haircut
  // acumulado samplado del histórico Moody's con block bootstrap 3y).
  // Equity y cash: a mercado siempre. NO toca el motor matemático.
  //
  // Cuando hyWeight > 0 (parte del sleeve "renta fija" es HY GHYG), usamos
  // un sleeveType blended para el haircut: el rate efectivo es
  // (1-wHY)×IG-default-rate + wHY×HY-default-rate. Por simplicidad
  // pasamos el sleeve mayoritario (donde > 50%, normalmente IG) y luego
  // ajustamos los stats con un factor multiplicativo del haircut blend.
  // Esto es una aprox first-order; un refinamiento más limpio sería
  // muestrear dos bloques (IG y HY) por path y aplicar a cada componente.
  const sleeveType: BulletSleeveType = hyWeight >= 0.5 ? 'hy' : 'ig';
  const aumPathHTM = computeHoldToMaturityPath(
    processed,
    payload.horizonMonths,
    payload.nSims,
    payload.seed,
    sleeveType,
  );

  // ----- Real-return post-process -----
  // Computa el índice de inflación cumulativo por path desde inflationPaths
  // (sampleado en el bootstrap, acoplado a yields). Luego deflacta el AUM.
  // Si por algún motivo no hay inflationPaths (no debería pasar, lo pedimos
  // arriba), reportamos AUM real = nominal (degradación silenciosa).
  const Hp1 = payload.horizonMonths + 1;
  const aumPathReal = new Float64Array(payload.nSims * Hp1);
  const netWealthPathReal = new Float64Array(payload.nSims * Hp1);
  const inflationIndexPath = new Float64Array(payload.nSims * Hp1);
  const inflPaths = boot.inflationPaths;
  for (let s = 0; s < payload.nSims; s++) {
    let idx = 1.0; // inflation index al inicio del mes t=0 (= antes de cualquier inflación)
    inflationIndexPath[s * Hp1 + 0] = idx;
    aumPathReal[s * Hp1 + 0] = processed.aumPath[s * Hp1 + 0] / idx;
    netWealthPathReal[s * Hp1 + 0] = processed.netWealthPath[s * Hp1 + 0] / idx;
    for (let t = 1; t <= payload.horizonMonths; t++) {
      const r = inflPaths ? inflPaths[s * payload.horizonMonths + (t - 1)] : 0;
      idx *= 1 + r;
      inflationIndexPath[s * Hp1 + t] = idx;
      aumPathReal[s * Hp1 + t] = processed.aumPath[s * Hp1 + t] / idx;
      netWealthPathReal[s * Hp1 + t] = processed.netWealthPath[s * Hp1 + t] / idx;
    }
  }

  // ----- Stats reales (deflactados) -----
  const initialAumReal = payload.initialAumUsd; // por def. inflationIndex[t=0]=1
  const finalAumReals = new Float64Array(payload.nSims);
  const finalNetReals = new Float64Array(payload.nSims);
  const realNetReturns = new Float64Array(payload.nSims);
  let nPreserved = 0;
  for (let s = 0; s < payload.nSims; s++) {
    const idxFinal = inflationIndexPath[s * Hp1 + payload.horizonMonths];
    finalAumReals[s] = processed.aumPath[s * Hp1 + payload.horizonMonths] / idxFinal;
    finalNetReals[s] = processed.netWealthPath[s * Hp1 + payload.horizonMonths] / idxFinal;
    // Total inflows real-deflactados (aproximación: usamos el index final como
    // proxy del momento promedio de aportación; refinamiento posible pero pequeño)
    const totalInflowsReal = processed.stats.totalInflows / idxFinal;
    realNetReturns[s] = (finalNetReals[s] - initialAumReal - totalInflowsReal) / initialAumReal;
    if (finalAumReals[s] >= initialAumReal) nPreserved++;
  }
  const sortedRealR = Float64Array.from(realNetReturns);
  sortedRealR.sort();
  const realAnnFactor = 12.0 / payload.horizonMonths;
  const rMed = quantile(sortedRealR, 0.5);
  const rP5 = quantile(sortedRealR, 0.05);
  const rP95 = quantile(sortedRealR, 0.95);

  const enrichedStats: ArenaStats = {
    ...processed.stats,
    realFinalAumMed: medianOf(finalAumReals),
    realFinalNetMed: medianOf(finalNetReals),
    realNetReturnP5: rP5,
    realNetReturnMed: rMed,
    realNetReturnP95: rP95,
    realAnnNetMed: rMed > -1 ? Math.pow(1 + rMed, realAnnFactor) - 1 : -1,
    realAnnNetP5: rP5 > -1 ? Math.pow(1 + rP5, realAnnFactor) - 1 : -1,
    realAnnNetP95: Math.pow(1 + rP95, realAnnFactor) - 1,
    realProbPreservedPower: nPreserved / payload.nSims,
  };

  // ----- Build response -----
  const result: ArenaJobOutput = {
    aumPath: processed.aumPath,
    aumPathHTM,
    netWealthPath: processed.netWealthPath,
    aumPathReal,
    netWealthPathReal,
    inflationIndexPath,
    sleevePath: processed.sleevePath,
    loanBalancePath: arenaOut.loanBalancePath,
    dpfBaselinePath: processed.dpfBaselinePath,
    events: arenaOut.events,
    regimeCounts: arenaOut.regimeCounts,
    stats: enrichedStats,
    cumInterestPaid: arenaOut.finalState.cumInterestPaid,
    cumForcedEquitySales: arenaOut.finalState.cumForcedEquitySales,
    cumForcedBulletSales: arenaOut.finalState.cumForcedBulletSales,
    cumLoanShortfall: arenaOut.finalState.cumLoanShortfall,
    allBulletNames: arenaOut.allBullets.map((b) => b.name),
    meta: {
      nSims: payload.nSims,
      horizonMonths: payload.horizonMonths,
      seed: payload.seed,
      elapsedBootstrapMs: tBoot1 - tBoot0,
      elapsedArenaMs: tArena1 - tArena0,
    },
  };

  // Transferir ownership de buffers grandes (sin copia entre worker y main).
  const transferBuffers: ArrayBuffer[] = [
    result.aumPath.buffer as ArrayBuffer,
    result.aumPathHTM.buffer as ArrayBuffer,
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
    soldOnEventMed: arenaOut.stats.soldOnEventMed,
    realizedGainOnSaleMed: arenaOut.stats.realizedGainOnSaleMed,
    // Las métricas reales se llenan en el caller (outer worker) que tiene
    // acceso a inflationIndexPath. Acá las dejamos en 0 para satisfacer el
    // tipo; serán sobreescritas vía enrichedStats.
    realFinalAumMed: 0,
    realFinalNetMed: 0,
    realNetReturnP5: 0,
    realNetReturnMed: 0,
    realNetReturnP95: 0,
    realAnnNetMed: 0,
    realAnnNetP5: 0,
    realAnnNetP95: 0,
    realProbPreservedPower: 0,
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

// =====================================================================
// HOLD-TO-MATURITY POST-PROCESS
// =====================================================================

/**
 * PRNG simple seedeable (Mulberry32) — independiente del bootstrap del motor
 * para que el haircut HTM no afecte la reproducibilidad del run principal.
 * Derivamos un seed distinto desde el seed del payload + offset.
 */
function makePrng(seed: number): () => number {
  let s = (seed | 0) + 0x9E3779B9;
  return function next() {
    s |= 0;
    s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Computa el AUM "Hold-to-Maturity" path en paralelo al AUM "a mercado".
 *
 * Modelo conceptual:
 *   - Bullets: si el cliente se queda hasta el vencimiento natural, recibe
 *     el nominal pendiente menos defaults acumulados. Mark-to-market
 *     intermedio (curva, spread) NO importa para esta valuación.
 *   - Equity, cash: a mercado siempre (no tienen vencimiento).
 *
 * Implementación (aproximación de primer orden):
 *   HTM[s][t] = bullets_mtm[s][t] × (1 − haircut[s][t]) + equity[s][t] + cash[s][t]
 *
 *   Donde haircut[s][t] crece monotónicamente con t, samplado del histórico
 *   Moody's con block bootstrap de 3 años (preserva autocorrelación: GFC
 *   2008-2010 estuvieron juntos, no aislados).
 *
 *   Aproximación: usa bullets_mtm como proxy de nominal pendiente. En la
 *   práctica el nominal está cerca del mtm en bullets IG (carry-yield ~ par),
 *   pero puede divergir cuando la curva se mueve fuerte. Para fees ≤50bp
 *   y movimientos curve <200bp anuales, el error es <2% en finalAumHTM.
 *
 * Diferencia esperada vs aumPath (a mercado):
 *   - HTM banda P5-P95 es modestamente más angosta que mtm (~85% del ancho)
 *     porque bullets per-path conserva la rollover dispersion + algo de mtm,
 *     pero el haircut por defaults es chico para IG.
 *   - HTM mean ≈ mtm mean (sin sesgo sistemático)
 *   - HTM no tiene el spike-down de stress episodes (defaults son pequeños
 *     en IG; en HY el spike sí aparece pero atenuado vs mtm)
 */
function computeHoldToMaturityPath(
  out: ArenaOutLike,
  horizonMonths: number,
  nSims: number,
  baseSeed: number,
  sleeveType: BulletSleeveType,
): Float64Array {
  const Hp1 = horizonMonths + 1;
  const aumHTM = new Float64Array(nSims * Hp1);
  const nObs = HISTORICAL_DEFAULT_DATA.length;
  const blockSize = DEFAULT_BOOTSTRAP_BLOCK_YEARS;

  // Usamos bullets[s][t] PER-PATH (no la mediana cross-paths).
  //
  // Decisión semántica (2026-06-03): la valuación HTM debe reflejar la
  // dispersión legítima de las TASAS DE ROLLOVER entre paths — cuando el
  // bullet ID26 vence, el path A renueva al 6% y el path B al 3%; a lo
  // largo de 20y eso genera trayectorias HTM materialmente distintas. Si
  // colapsáramos bullets a la mediana, esa dispersión desaparece (cosa
  // que se hizo en una iteración previa intentando "achicar la banda HTM
  // vs MtM"). El cliente quiere ver el rollover dispersion, no esconderlo.
  //
  // Trade-off conocido: bullets[s][t] incluye también la vol mark-to-market
  // de curva y spread (~3-5% por año de mtm noise sobre los bullets). Esa
  // vol técnicamente NO afecta al cliente HTM. Pero a 20y, el rollover
  // dispersion domina (>>> mtm noise por reversión a par) — la diferencia
  // entre HTM y MtM se mantiene visible (~85% del ancho de MtM vs ~70%
  // con el modelo de mediana), y la mediana HTM y MtM están alineadas.
  //
  // Sanity check con maxBulletYears=1: el ladder se comporta como rolling
  // 1y DPF, y el HTM matchea DPF1Y baseline path-a-path (ambos siguen el
  // yield path y renuevan al rate observado en cada vencimiento).

  for (let s = 0; s < nSims; s++) {
    // PRNG per-path: seed derivado para reproducibilidad por path
    const prng = makePrng(baseSeed + s * 7919); // 7919 primo aleatorio
    // Pre-computar el haircut acumulado mes a mes por block bootstrap.
    // En cada año entero del horizonte, samplear un bloque consecutivo
    // del histórico y aplicar pro-rated mensualmente.
    const haircut = new Float64Array(Hp1); // 1 − (1 − loss)^t cumulativo
    let cumLossFactor = 1.0; // (1 − loss_total), va decreciendo
    let blockStart = 0;
    let blockIdx = blockSize; // forzar refresh en el primer paso
    let currentYearLoss = 0;
    haircut[0] = 0;
    for (let t = 1; t < Hp1; t++) {
      const yearOfT = Math.floor((t - 1) / 12);
      const isNewYear = ((t - 1) % 12) === 0;
      if (isNewYear) {
        // ¿Hay que sortear nuevo bloque?
        if (blockIdx >= blockSize) {
          const maxStart = Math.max(0, nObs - blockSize);
          blockStart = Math.floor(prng() * (maxStart + 1));
          blockIdx = 0;
        }
        const obs = HISTORICAL_DEFAULT_DATA[blockStart + blockIdx];
        const defRate = sleeveType === 'ig' ? obs.igRate : obs.hyRate;
        const lgd = 1 - obs.recoveryRate;
        currentYearLoss = defRate * lgd;
        blockIdx++;
      }
      // Aplicar 1/12 del loss anual a este mes
      const monthlyFactor = Math.pow(1 - currentYearLoss, 1 / 12);
      cumLossFactor *= monthlyFactor;
      haircut[t] = 1 - cumLossFactor;
      // Suprimir warning del compilador sobre yearOfT no usado (sirve para debug)
      void yearOfT;
    }

    // Aplicar a cada mes: HTM[s][t] = bullets[s][t] × (1 - hc) + equity[s][t] + cash[s][t]
    // Per-path en los 3 sleeves → la dispersión cross-path refleja
    // diferencias en yield paths (rollover dispersion en bullets, equity
    // moves, cash moves) y en haircut (block bootstrap de Moody's).
    for (let t = 0; t < Hp1; t++) {
      const base = (s * Hp1 + t) * 3;
      const bullets = out.sleevePath[base + 0];
      const equity = out.sleevePath[base + 1];
      const cash = out.sleevePath[base + 2];
      aumHTM[s * Hp1 + t] = bullets * (1 - haircut[t]) + equity + cash;
    }
  }

  return aumHTM;
}

// =====================================================================
// BUCKET BOOTSTRAP OVERRIDE (PR #8b)
// =====================================================================

/**
 * Override de market.bulletReturns con samples del bucket TTM empírico.
 *
 * Para cada bullet (real o extensión) y para cada path simulado, samplea
 * mes a mes del bucket TTM correspondiente al TTM efectivo en ese mes.
 *
 * Joint sampling per path (versión 1, simplificada):
 *   - Cada bullet en (path p, mes m) usa un PRNG independiente seedeado
 *     desde (seed_global, p, b).
 *   - Esto NO preserva joint sampling con equity/cash, pero es coherente
 *     intra-bullet a lo largo del tiempo (stationary bootstrap).
 *   - Versión futura puede preservar joint con un PRNG por path
 *     compartido entre bullets.
 *
 * Si el TTM del bullet ≤ 0 (vencido), se mantiene el retorno paramétrico
 * original (es 0 efectivo porque el motor ya considera bullets vencidos).
 *
 * Sleeve type: hardcoded 'ig' por ahora — todos los bullets del lineup
 * son IG Corp. Cuando se agregue HY (sleeve separado), el sleeve type
 * pasará a ser metadata del BulletDef.
 */
function overrideBulletReturnsWithBucketBootstrap(
  market: ArenaMarket,
  allBullets: BulletDef[],
  panel: TTMPanel,
  nSims: number,
  horizonMonths: number,
  seed: number,
): ArenaMarket {
  const sleeveType: BucketSleeveType = 'ig';
  const newBulletReturns: Float32Array[] = [];

  for (let b = 0; b < allBullets.length; b++) {
    const bullet = allBullets[b];
    const series = new Float32Array(nSims * horizonMonths);
    // El paramétrico original — fallback cuando TTM ≤ 0
    const originalSeries = market.bulletReturns[b];

    for (let p = 0; p < nSims; p++) {
      // PRNG por path × bullet — reproducibilidad
      const prng = makePrng(seed + p * 7919 + b * 13);
      const state = initBootstrapState();

      for (let m = 0; m < horizonMonths; m++) {
        const idx = p * horizonMonths + m;
        // TTM al inicio del mes m (en meses)
        const ttmYears = bullet.maturityY - m / 12;
        if (ttmYears <= 0) {
          // Bullet vencido — usar el paramétrico (motor ya lo trata como 0)
          series[idx] = originalSeries[idx];
          continue;
        }
        const ttmMonths = Math.max(1, Math.round(ttmYears * 12));
        const ret = sampleReturnFromBucket(panel, sleeveType, ttmMonths, state, prng);
        series[idx] = ret;
      }
    }
    newBulletReturns.push(series);
  }

  return {
    ...market,
    bulletReturns: newBulletReturns,
  };
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

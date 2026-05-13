/**
 * arena.ts — Orquestador end-to-end del simulador.
 *
 * Port de `code/arena_extended.py`. Combina los engines:
 *   - bullets.ts:    retornos paramétricos por bullet (consumidor del yield path)
 *   - rollover.ts:   classifyRegime A/B/C (clasificación per-sim de la curva)
 *   - cashflow.ts:   inflow / LoanEvent / cascada / rebalance
 *   - Extensiones:   N bullets sintéticos pre-creados (+1y arriba del longest real)
 *                    que reciben principal cada vez que vence un bullet.
 *
 * Diferencias vs rollover.ts:
 *   - Trabaja en **AUMs en USD absolutos**, no en fracciones normalizadas.
 *   - El destino de un evento de maturity es SIEMPRE la próxima extensión libre
 *     (no el bullet vivo más largo). Esto preserva la estructura de escalera.
 *   - eqty_max/min se aplican como fracción del AUM CURRENT total, no del 1.0.
 *
 * Orden por iteración t (matchea Python §1-4):
 *   1. Aplicar returns mensuales a cada sleeve (bullets, equity, cash)
 *   2. cashflowStep (inflow → loan trigger → cascada → rebalance)
 *   3. Procesar eventos de maturity cuyo `maturity_month == t + 1`
 *   4. Snapshot AUMs
 */

import type { Ticker } from '../data/market.generated';
import {
  computeBulletReturns,
  type BulletDef,
} from './bullets';
import {
  classifyRegime,
  DEFAULT_ROLLOVER_THRESHOLDS,
  type RolloverPlan,
  type RolloverThresholds,
} from './rollover';
import {
  cashflowStep,
  computeMonthlyInflow,
  initializeState,
  totalAum,
  type CashFlowState,
  type CashFlowMarket,
  type LoanEvent,
} from './cashflow';

// =====================================================================
// TIPOS PÚBLICOS
// =====================================================================

export type ArenaConfig = {
  /** Plan del ladder + sleeves (reusa el tipo de rollover.ts). */
  rolloverPlan: RolloverPlan;
  /** Umbrales de régimen A/B/C. Default = DEFAULT_ROLLOVER_THRESHOLDS. */
  rolloverThresholds?: RolloverThresholds;
  /** Préstamo opcional. */
  loanEvent?: LoanEvent | null;
  /** Inflow anual base en USD (default 250k). */
  inflowBaseAnnual?: number;
  /** Crecimiento anual decimal del inflow (default 0). */
  inflowGrowth?: number;
  /** AUM inicial en USD (e.g., 5_000_000). */
  initialAumUsd: number;
  /** Bullets sintéticos pre-creados (+spacing × k del longest real). Default 10. */
  nExtensions?: number;
  /** Espaciado en años entre extensiones (default 1.0). */
  extensionSpacingY?: number;
  /** Cash share máximo antes de rebalancear (default 0.05). */
  cashBandUpper?: number;
  /** False = buy-and-hold sin rollover (default true). */
  rolloverEnabled?: boolean;
  /**
   * Override de la tasa inicial del DPF1Y baseline (decimal anual).
   * Si null/omitido, se computa como UST1Y inicial + plan.initialSpread.
   * El spread implícito (override − UST1Y inicial) se mantiene en
   * renovaciones futuras.
   */
  dpfRateOverride?: number | null;
  /**
   * Si true, el cashflowStep enforza el cap de equity (`plan.eqtyMax`)
   * cada mes: el rebalanceo del exceso de cash diluye hacia bullets
   * cuando equity ya está overweight, y si el peso vivo sigue arriba
   * del cap después del rebalanceo, se vende exceso a bullets.
   * Default false para preservar paridad con el motor Python actual.
   */
  enforceMonthlyEquityCap?: boolean;
};

/**
 * Contexto de mercado pre-computado. Consumidor típico:
 *   1. Corre runBootstrap con `outputYieldPaths: true` y `outputEtfReturns: true`
 *      sobre un portafolio dummy (los portfolio returns se descartan).
 *   2. Llama computeBulletReturns(all_bullets, initialCurve, yieldPaths, spread)
 *      para producir per-bullet returns.
 *   3. Construye equity_returns como Σ_t (mix_weight_t × etfReturns[t]).
 *   4. Toma cash_returns = etfReturns[cashTicker].
 */
export type ArenaMarket = {
  /**
   * Per-bullet returns mensuales. Length = (real bullets + extensiones).
   * Cada Float32Array es row-major [nSims × horizonMonths] sim-major.
   * El orden debe coincidir con `[...realBullets, ...extensions]` que
   * produce `createExtensionBullets`.
   */
  bulletReturns: ReadonlyArray<Float32Array>;
  /** Retornos mensuales del sleeve equity, ya ponderado. [nSims × horizonMonths]. */
  equityReturns: Float32Array;
  /** Retornos mensuales del cash ticker. [nSims × horizonMonths]. */
  cashReturns: Float32Array;
  /** Yield paths simulados (necesarios para clasificar régimen y para uy3y del loan). */
  yieldPaths: {
    readonly IRX: Float32Array;
    readonly FVX: Float32Array;
    readonly TNX: Float32Array;
    readonly TYX: Float32Array;
  };
  /**
   * Curva inicial pre-bootstrap (yields al cierre del último mes histórico,
   * IRX/FVX/TNX/TYX en decimal). Usada por DPF1Y baseline para lockear la
   * tasa al t=0 antes de las renovaciones anuales. OPCIONAL: si no está,
   * runArena cae back al yield path del sim 0 en mes 0.
   */
  initialCurve?: readonly [number, number, number, number];
  nSims: number;
  horizonMonths: number;
};

export type ArenaEvent = {
  /** Mes 1-indexed en que el bullet venció. */
  t: number;
  /** Bullet que venció (nombre, NO índice). */
  matureBullet: string;
  /** Bullet destino (nombre) o "FALLBACK_EQUITY" si extensiones agotadas. */
  destBullet: string;
  regimeCounts: { A: number; B: number; C: number };
  yLongMedian: number;
  principalMedian: number;
};

export type ArenaStats = {
  initialAum: number;
  totalInflows: number;
  finalAumMed: number;
  finalNetMed: number;
  netReturnP5: number;
  netReturnMed: number;
  netReturnP95: number;
  annNetMed: number;
  annNetP5: number;
  annNetP95: number;
  probPos: number;
  loanCumInterestMed: number;
  forcedEquityMed: number;
  forcedBulletMed: number;
  loanShortfallMed: number;
};

export type ArenaOutput = {
  /** AUM gross per sim per mes. Row-major [nSims × (H+1)]. */
  aumPath: Float64Array;
  /** AUM − loanBalance per sim per mes. */
  netWealthPath: Float64Array;
  /** Sleeve AUMs row-major [nSims × (H+1) × 3] (0=bullets, 1=equity, 2=cash). */
  sleevePath: Float64Array;
  /** Loan balance per sim per mes. Row-major [nSims × (H+1)]. */
  loanBalancePath: Float64Array;
  /**
   * DPF1Y baseline path per-sim. Row-major [nSims × (H+1)].
   * Modelo: depósito a plazo 1y rolling — la tasa se lockea al UST1Y del
   * sim al inicio y se renueva cada 12 meses al UST1Y vigente en ese sim.
   * Paired con los mismos yieldPaths que la estrategia → comparación
   * apples-to-apples sim por sim.
   */
  dpfBaselinePath: Float64Array;
  /** Bullet holdings opcional, row-major [nSims × (H+1) × nTotal]. */
  bulletHoldings?: Float64Array;
  events: ArenaEvent[];
  regimeCounts: { A: number; B: number; C: number };
  stats: ArenaStats;
  /** Estado final completo (cum_interest, cum_forced_sales, etc.). */
  finalState: CashFlowState;
  /** Lista completa de bullets (reales + extensiones). */
  allBullets: BulletDef[];
};

// =====================================================================
// HELPERS PÚBLICOS
// =====================================================================

/**
 * Crea n_extensions BulletDef sintéticos +k × spacingY arriba del bullet real
 * más largo. dur_init_y = 0.93 × maturity_y (regla IG corp).
 */
export function createExtensionBullets(
  realBullets: ReadonlyArray<BulletDef>,
  nExtensions: number,
  spacingY = 1.0,
): BulletDef[] {
  if (nExtensions <= 0) return [];
  let longest = -Infinity;
  for (const b of realBullets) if (b.maturityY > longest) longest = b.maturityY;
  if (!Number.isFinite(longest)) {
    throw new Error('createExtensionBullets: realBullets vacío');
  }
  const out: BulletDef[] = [];
  for (let k = 1; k <= nExtensions; k++) {
    const m = longest + k * spacingY;
    out.push({
      name: `EXT${k.toString().padStart(2, '0')}`,
      maturityY: m,
      durInitY: 0.93 * m,
      isSynthetic: true,
    });
  }
  return out;
}

/**
 * Ordena los bullets por maturity_month ascendente y produce eventos en orden
 * cronológico. Cada evento tiene `dest_b_idx = n_real + ext_counter`, o -1 si
 * las extensiones se agotaron.
 *
 * Convención: `event_t = maturity_month`, evento se dispara al final de la
 * iteración `t = event_t - 1` (compatible con rollover.py / cashflow.py).
 */
export function buildMaturityEventSchedule(
  maturityMonth: Int32Array,
  nReal: number,
  nExtensions: number,
  nMonths: number,
): { eventT: number; matureBIdx: number; destBIdx: number }[] {
  const total = nReal + nExtensions;
  if (maturityMonth.length !== total) {
    throw new Error(
      `buildMaturityEventSchedule: maturityMonth length ${maturityMonth.length} ≠ nReal+nExt ${total}`,
    );
  }
  // Argsort por maturityMonth
  const order = Array.from({ length: total }, (_, i) => i);
  order.sort((a, b) => maturityMonth[a] - maturityMonth[b]);

  const events: { eventT: number; matureBIdx: number; destBIdx: number }[] = [];
  let extCounter = 0;
  for (const b of order) {
    const m = maturityMonth[b];
    if (m <= 0 || m > nMonths) continue;
    const dest = extCounter < nExtensions ? nReal + extCounter : -1;
    extCounter++;
    events.push({ eventT: m, matureBIdx: b, destBIdx: dest });
  }
  return events;
}

/**
 * Para cada mes t ∈ [0, nMonths], devuelve el índice del bullet vivo más corto
 * (maturityMonth > t). Si no hay bullets vivos, devuelve 0.
 */
export function buildShortestIdxPath(
  maturityMonth: Int32Array,
  nMonths: number,
): Int32Array {
  const out = new Int32Array(nMonths + 1);
  for (let t = 0; t <= nMonths; t++) {
    let bestIdx = 0;
    let bestM = Number.MAX_SAFE_INTEGER;
    let foundAlive = false;
    for (let i = 0; i < maturityMonth.length; i++) {
      if (maturityMonth[i] > t && maturityMonth[i] < bestM) {
        bestM = maturityMonth[i];
        bestIdx = i;
        foundAlive = true;
      }
    }
    out[t] = foundAlive ? bestIdx : 0;
  }
  return out;
}

// =====================================================================
// HELPERS INTERNOS
// =====================================================================

function median(arr: ArrayLike<number>): number {
  const a = Float64Array.from(arr);
  a.sort();
  const n = a.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return a[(n - 1) >> 1];
  return 0.5 * (a[n / 2 - 1] + a[n / 2]);
}

function pctSorted(sorted: Float64Array, p: number): number {
  const n = sorted.length;
  return sorted[Math.floor(p * (n - 1))];
}

// =====================================================================
// MOTOR PRINCIPAL
// =====================================================================

export function runArena(
  config: ArenaConfig,
  market: ArenaMarket,
  options: { outputBulletHoldings?: boolean } = {},
): ArenaOutput {
  const plan = config.rolloverPlan;
  const thresholds = config.rolloverThresholds ?? DEFAULT_ROLLOVER_THRESHOLDS;
  const inflowBaseAnnual = config.inflowBaseAnnual ?? 250_000;
  const inflowGrowth = config.inflowGrowth ?? 0;
  const nExtensions = config.nExtensions ?? 10;
  const extensionSpacingY = config.extensionSpacingY ?? 1.0;
  const cashBandUpper = config.cashBandUpper ?? 0.05;
  const rolloverEnabled = config.rolloverEnabled ?? true;

  const { nSims, horizonMonths: H } = market;
  const Hp1 = H + 1;

  // ----- Setup bullets reales + extensiones -----
  const realBullets = plan.bullets;
  const extensions = createExtensionBullets(realBullets, nExtensions, extensionSpacingY);
  const allBullets: BulletDef[] = [...realBullets, ...extensions];
  const nReal = realBullets.length;
  const nTotal = allBullets.length;

  if (market.bulletReturns.length !== nTotal) {
    throw new Error(
      `runArena: market.bulletReturns length ${market.bulletReturns.length} ≠ nReal+nExt ${nTotal}. ` +
        `Asegurate de pasar bullet returns para los ${nReal} reales + ${nExtensions} extensiones.`,
    );
  }
  for (let b = 0; b < nTotal; b++) {
    if (market.bulletReturns[b].length !== nSims * H) {
      throw new Error(
        `runArena: bulletReturns[${b}].length=${market.bulletReturns[b].length} ≠ nSims*H=${nSims * H}`,
      );
    }
  }
  if (market.equityReturns.length !== nSims * H || market.cashReturns.length !== nSims * H) {
    throw new Error(
      `runArena: equity/cash returns length inconsistente con nSims*H=${nSims * H}`,
    );
  }

  const maturityMonth = new Int32Array(nTotal);
  for (let b = 0; b < nTotal; b++) {
    maturityMonth[b] = Math.ceil(allBullets[b].maturityY * 12);
  }

  const eventsSchedule = buildMaturityEventSchedule(
    maturityMonth,
    nReal,
    nExtensions,
    H,
  );
  const eventsByMonth = new Map<number, typeof eventsSchedule>();
  for (const ev of eventsSchedule) {
    const list = eventsByMonth.get(ev.eventT) ?? [];
    list.push(ev);
    eventsByMonth.set(ev.eventT, list);
  }

  const shortestIdxPath = buildShortestIdxPath(maturityMonth, H);

  // ----- Initial state en USD absoluto -----
  const AUM0 = config.initialAumUsd;
  const activeRealAtStart: boolean[] = [];
  let nActiveReal = 0;
  for (let b = 0; b < nReal; b++) {
    const isActive = maturityMonth[b] > 0;
    activeRealAtStart.push(isActive);
    if (isActive) nActiveReal++;
  }
  if (nActiveReal === 0) {
    throw new Error('runArena: ningún bullet real activo al inicio');
  }

  const bulletAumInit = new Float64Array(nTotal);
  if (plan.bulletInitialWeights) {
    if (plan.bulletInitialWeights.length !== nReal) {
      throw new Error(
        `runArena: plan.bulletInitialWeights length ${plan.bulletInitialWeights.length} ≠ nReal ${nReal}`,
      );
    }
    let s = 0;
    for (const w of plan.bulletInitialWeights) s += w;
    if (s <= 0) throw new Error('runArena: bulletInitialWeights suma ≤ 0');
    for (let b = 0; b < nReal; b++) {
      bulletAumInit[b] = (AUM0 * plan.bulletTotalPct * plan.bulletInitialWeights[b]) / s;
    }
  } else {
    const share = (AUM0 * plan.bulletTotalPct) / nActiveReal;
    for (let b = 0; b < nReal; b++) {
      bulletAumInit[b] = activeRealAtStart[b] ? share : 0;
    }
  }

  const state = initializeState({
    nSims,
    initialCashAum: AUM0 * plan.cashPct,
    initialEquityAum: AUM0 * plan.equityPct,
    initialBulletAums: bulletAumInit,
    nBullets: nTotal,
  });

  // ----- Output buffers (sim-major: [s * (H+1) + t]) -----
  const aumPath = new Float64Array(nSims * Hp1);
  const sleevePath = new Float64Array(nSims * Hp1 * 3);
  const loanBalancePath = new Float64Array(nSims * Hp1);
  const bulletHoldings = options.outputBulletHoldings
    ? new Float64Array(nSims * Hp1 * nTotal)
    : null;

  const snapshot = (tIdx: number): void => {
    const totals = totalAum(state);
    for (let s = 0; s < nSims; s++) {
      aumPath[s * Hp1 + tIdx] = totals[s];
      const off = s * Hp1 * 3 + tIdx * 3;
      let bSum = 0;
      const bOff = s * nTotal;
      for (let b = 0; b < nTotal; b++) bSum += state.bulletAums[bOff + b];
      sleevePath[off + 0] = bSum;
      sleevePath[off + 1] = state.equityAum[s];
      sleevePath[off + 2] = state.cashAum[s];
      loanBalancePath[s * Hp1 + tIdx] = state.loanBalance[s];
      if (bulletHoldings) {
        const bhOff = s * Hp1 * nTotal + tIdx * nTotal;
        for (let b = 0; b < nTotal; b++) bulletHoldings[bhOff + b] = state.bulletAums[bOff + b];
      }
    }
  };
  snapshot(0);

  const events: ArenaEvent[] = [];
  const regimeCounts = { A: 0, B: 0, C: 0 };

  const planAllocDict = {
    bullets: plan.bulletTotalPct,
    equity: plan.equityPct,
    cash: plan.cashPct,
  };

  // Buffer reusable para `cashflowStep` market.yStateT (per-sim curva al cierre del mes t)
  const yStateT = new Float64Array(nSims * 4);
  const market_: CashFlowMarket = { yStateT };

  // ----- Main forward loop -----
  for (let t = 0; t < H; t++) {
    // 1. Aplicar retornos mensuales (USD)
    for (let s = 0; s < nSims; s++) {
      const cell = s * H + t;
      const bOff = s * nTotal;
      for (let b = 0; b < nTotal; b++) {
        state.bulletAums[bOff + b] *= 1 + market.bulletReturns[b][cell];
      }
      state.equityAum[s] *= 1 + market.equityReturns[cell];
      state.cashAum[s] *= 1 + market.cashReturns[cell];
    }

    // Construir y_state_t (curva al cierre del mes t) per-sim
    for (let s = 0; s < nSims; s++) {
      const cell = s * H + t;
      yStateT[s * 4 + 0] = market.yieldPaths.IRX[cell];
      yStateT[s * 4 + 1] = market.yieldPaths.FVX[cell];
      yStateT[s * 4 + 2] = market.yieldPaths.TNX[cell];
      yStateT[s * 4 + 3] = market.yieldPaths.TYX[cell];
    }

    // 2. cashflowStep (inflow → loan → cascada → rebalance)
    cashflowStep({
      t,
      state,
      planAlloc: planAllocDict,
      loanEvent: config.loanEvent && t === config.loanEvent.triggerMonth ? config.loanEvent : null,
      market: market_,
      inflowBaseAnnual,
      inflowGrowth,
      cashBandUpper,
      bulletShortestIdx: shortestIdxPath[t],
      enforceMonthlyEquityCap: config.enforceMonthlyEquityCap === true,
      eqtyMax: plan.eqtyMax,
    });

    // 3. Procesar eventos de maturity (maturity_month == t+1)
    if (rolloverEnabled) {
      const evList = eventsByMonth.get(t + 1);
      if (evList) {
        for (const ev of evList) {
          const bMat = ev.matureBIdx;
          const dest = ev.destBIdx;

          // Principal vencido (copia)
          const principal = new Float64Array(nSims);
          let principalSum = 0;
          for (let s = 0; s < nSims; s++) {
            principal[s] = state.bulletAums[s * nTotal + bMat];
            principalSum += principal[s];
          }
          if (principalSum === 0) {
            // Limpiar y continuar
            for (let s = 0; s < nSims; s++) state.bulletAums[s * nTotal + bMat] = 0;
            continue;
          }

          if (dest >= 0) {
            // Regimen A/B/C — distribución per-sim
            const totalsNow = totalAum(state);
            let countA = 0;
            let countB = 0;
            let countC = 0;
            let yLongAcc = 0;
            const yLongArr = new Float64Array(nSims);

            for (let s = 0; s < nSims; s++) {
              const yIdx = s * H + t;
              const yLong = market.yieldPaths.TNX[yIdx];
              const yShort = market.yieldPaths.IRX[yIdx];
              yLongArr[s] = yLong;
              yLongAcc += yLong;
              const regime = classifyRegime(yLong, yShort, thresholds);

              const eqtyMaxAum = plan.eqtyMax * totalsNow[s];
              const bOff = s * nTotal;
              const p = principal[s];

              if (regime === 'A') {
                const eqExcess = state.equityAum[s] > eqtyMaxAum
                  ? state.equityAum[s] - eqtyMaxAum
                  : 0;
                state.bulletAums[bOff + dest] += p + eqExcess;
                state.equityAum[s] -= eqExcess;
                countA++;
              } else if (regime === 'B') {
                const X = thresholds.xToEquity;
                const toEqTarget = p * X;
                const availEq = Math.max(0, eqtyMaxAum - state.equityAum[s]);
                const toEq = Math.min(toEqTarget, availEq);
                const toDest = p - toEq;
                state.equityAum[s] += toEq;
                state.bulletAums[bOff + dest] += toDest;
                countB++;
              } else {
                state.bulletAums[bOff + dest] += p;
                countC++;
              }
              state.bulletAums[bOff + bMat] = 0;
            }

            regimeCounts.A += countA;
            regimeCounts.B += countB;
            regimeCounts.C += countC;

            if (events.length < 100) {
              events.push({
                t: t + 1,
                matureBullet: allBullets[bMat].name,
                destBullet: allBullets[dest].name,
                regimeCounts: { A: countA, B: countB, C: countC },
                yLongMedian: median(yLongArr),
                principalMedian: median(principal),
              });
            }
          } else {
            // Fallback: extensiones agotadas → principal a equity
            for (let s = 0; s < nSims; s++) {
              state.equityAum[s] += principal[s];
              state.bulletAums[s * nTotal + bMat] = 0;
            }
            if (events.length < 100) {
              events.push({
                t: t + 1,
                matureBullet: allBullets[bMat].name,
                destBullet: 'FALLBACK_EQUITY',
                regimeCounts: { A: 0, B: 0, C: 0 },
                yLongMedian: 0,
                principalMedian: median(principal),
              });
            }
          }
        }
      }
    }

    // 4. Snapshot
    snapshot(t + 1);
  }

  // ----- DPF1Y baseline per-sim (paired con los yield paths del bootstrap) -----
  // Modelo: depósito a plazo 1y rolling. Cada 12 meses se renueva la tasa al
  // UST1Y vigente en ese sim (interpolación lineal IRX→FVX a maturity 1y),
  // más un spread fijo. La tasa permanece constante entre renovaciones.
  //
  // Override opcional: si config.dpfRateOverride está seteado, la tasa
  // inicial se fija al valor del cliente (e.g., "el banco me ofrece 5.25%").
  // El SPREAD IMPLÍCITO (override − UST1Y inicial) se preserva en las
  // renovaciones: si las tasas suben, el DPF renovado mantiene la prima
  // del cliente sobre el UST1Y vigente.
  //
  // Resultado paired: la sim s del DPF baseline ve los mismos yields que la
  // sim s de la estrategia → comparación apples-to-apples sim por sim.
  const dpfBaselinePath = new Float64Array(nSims * Hp1);
  const UST1Y_INTERP_K = (1.0 - 0.25) / (5.0 - 0.25); // interp lineal IRX→FVX a 1y
  // Fallback: si market no trae initialCurve, usamos el yield al cierre del
  // mes 0 del sim 0. Diferencia es pequeña (1 paso de simulación).
  const irx0 = market.initialCurve?.[0] ?? market.yieldPaths.IRX[0];
  const fvx0 = market.initialCurve?.[1] ?? market.yieldPaths.FVX[0];
  const ust1y_initial = irx0 + (fvx0 - irx0) * UST1Y_INTERP_K;
  const dpfOverride = config.dpfRateOverride;
  const DPF_SPREAD = dpfOverride != null
    ? dpfOverride - ust1y_initial  // spread implícito desde la oferta del banco
    : plan.initialSpread;          // default IG corp
  const initial_dpf_rate = dpfOverride != null ? dpfOverride : ust1y_initial + DPF_SPREAD;

  for (let s = 0; s < nSims; s++) {
    let balance = AUM0;
    dpfBaselinePath[s * Hp1 + 0] = balance;
    let lockedRate = initial_dpf_rate;
    for (let t = 0; t < H; t++) {
      // Renewal cada 12 meses (excepto t=0, que usa la tasa inicial)
      if (t > 0 && t % 12 === 0) {
        const yIdx = s * H + (t - 1); // yield al cierre del mes t-1
        const irx = market.yieldPaths.IRX[yIdx];
        const fvx = market.yieldPaths.FVX[yIdx];
        const ust1y = irx + (fvx - irx) * UST1Y_INTERP_K;
        lockedRate = ust1y + DPF_SPREAD;
      }
      // Carry mensual con la tasa lockeada + inflow del mes
      balance = balance * (1 + lockedRate / 12);
      balance += computeMonthlyInflow(t, inflowBaseAnnual, inflowGrowth);
      dpfBaselinePath[s * Hp1 + (t + 1)] = balance;
    }
  }

  // ----- Stats -----
  const netWealthPath = new Float64Array(nSims * Hp1);
  for (let s = 0; s < nSims; s++) {
    for (let t = 0; t <= H; t++) {
      const idx = s * Hp1 + t;
      netWealthPath[idx] = aumPath[idx] - loanBalancePath[idx];
    }
  }

  let totalInflows = 0;
  for (let t = 0; t < H; t++) {
    totalInflows += computeMonthlyInflow(t, inflowBaseAnnual, inflowGrowth);
  }

  const initialAum = aumPath[0]; // same for all sims (deterministic init)
  const netReturns = new Float64Array(nSims);
  let nPos = 0;
  for (let s = 0; s < nSims; s++) {
    const finalNet = netWealthPath[s * Hp1 + H];
    netReturns[s] = (finalNet - initialAum - totalInflows) / initialAum;
    if (netReturns[s] > 0) nPos++;
  }

  const sortedR = Float64Array.from(netReturns);
  sortedR.sort();
  const annFactor = 12.0 / H;
  const med = pctSorted(sortedR, 0.5);
  const p5 = pctSorted(sortedR, 0.05);
  const p95 = pctSorted(sortedR, 0.95);

  // Medianas sobre cum_* per sim
  const finalAums = new Float64Array(nSims);
  const finalNets = new Float64Array(nSims);
  for (let s = 0; s < nSims; s++) {
    finalAums[s] = aumPath[s * Hp1 + H];
    finalNets[s] = netWealthPath[s * Hp1 + H];
  }

  const stats: ArenaStats = {
    initialAum,
    totalInflows,
    finalAumMed: median(finalAums),
    finalNetMed: median(finalNets),
    netReturnP5: p5,
    netReturnMed: med,
    netReturnP95: p95,
    annNetMed: med > -1 ? Math.pow(1 + med, annFactor) - 1 : -1,
    annNetP5: p5 > -1 ? Math.pow(1 + p5, annFactor) - 1 : -1,
    annNetP95: Math.pow(1 + p95, annFactor) - 1,
    probPos: nPos / nSims,
    loanCumInterestMed: median(state.cumInterestPaid),
    forcedEquityMed: median(state.cumForcedEquitySales),
    forcedBulletMed: median(state.cumForcedBulletSales),
    loanShortfallMed: median(state.cumLoanShortfall),
  };

  const out: ArenaOutput = {
    dpfBaselinePath,
    aumPath,
    netWealthPath,
    sleevePath,
    loanBalancePath,
    events,
    regimeCounts,
    stats,
    finalState: state,
    allBullets,
  };
  if (bulletHoldings) out.bulletHoldings = bulletHoldings;
  return out;
}

// =====================================================================
// HELPER DE ALTO NIVEL — buildArenaMarket (caller convenience)
// =====================================================================

export type BuildArenaMarketSpec = {
  /** Bullets reales (sin extensiones). Las extensiones se agregan internamente. */
  realBullets: ReadonlyArray<BulletDef>;
  nExtensions?: number;
  extensionSpacingY?: number;
  equityMix: ReadonlyArray<{ ticker: Ticker; weight: number }>;
  cashTicker: Ticker;
  initialSpread: number;
  initialCurve: readonly [number, number, number, number];
  nSims: number;
  horizonMonths: number;
  /**
   * ETF returns y yield paths pre-computados por runBootstrap (con
   * `outputYieldPaths: true` y `outputEtfReturns: true`).
   */
  yieldPaths: ArenaMarket['yieldPaths'];
  etfReturns: Readonly<Record<string, Float32Array>>;
};

/**
 * Construye el ArenaMarket a partir del output de runBootstrap.
 *
 * Operaciones:
 *   - Genera bullet returns para realBullets + extensiones vía computeBulletReturns
 *   - Construye equity_returns ponderando ETFs del equityMix
 *   - Toma cash_returns del cashTicker
 *
 * El consumer típico llama runBootstrap antes y pasa su output aquí.
 */
export function buildArenaMarket(spec: BuildArenaMarketSpec): ArenaMarket {
  const extensions = createExtensionBullets(
    spec.realBullets,
    spec.nExtensions ?? 10,
    spec.extensionSpacingY ?? 1.0,
  );
  const allBullets = [...spec.realBullets, ...extensions];

  const bullet = computeBulletReturns({
    bullets: allBullets,
    initialCurve: spec.initialCurve,
    yieldPaths: spec.yieldPaths,
    nPaths: spec.nSims,
    horizonMonths: spec.horizonMonths,
    initialSpread: spec.initialSpread,
  });

  const total = spec.nSims * spec.horizonMonths;
  const equityReturns = new Float32Array(total);
  let eqSum = 0;
  for (const item of spec.equityMix) eqSum += item.weight;
  if (Math.abs(eqSum - 1) > 1e-6) {
    throw new Error(`buildArenaMarket: equityMix suma ${eqSum.toFixed(6)} ≠ 1`);
  }
  for (const item of spec.equityMix) {
    const series = spec.etfReturns[item.ticker];
    if (!series) {
      throw new Error(`buildArenaMarket: ticker equity "${item.ticker}" no presente en etfReturns`);
    }
    if (series.length !== total) {
      throw new Error(
        `buildArenaMarket: etfReturns[${item.ticker}].length=${series.length} ≠ nSims*H=${total}`,
      );
    }
    for (let i = 0; i < total; i++) equityReturns[i] += item.weight * series[i];
  }

  const cashSeries = spec.etfReturns[spec.cashTicker];
  if (!cashSeries) {
    throw new Error(`buildArenaMarket: cashTicker "${spec.cashTicker}" no presente en etfReturns`);
  }
  if (cashSeries.length !== total) {
    throw new Error(`buildArenaMarket: cash series length inconsistente`);
  }

  return {
    bulletReturns: bullet.returns,
    equityReturns,
    cashReturns: cashSeries,
    yieldPaths: spec.yieldPaths,
    initialCurve: spec.initialCurve,
    nSims: spec.nSims,
    horizonMonths: spec.horizonMonths,
  };
}

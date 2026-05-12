/**
 * rollover.ts — Motor de rollover táctico para escalera de bonos a vencimiento.
 *
 * Port de `code/rollover.py` (estudios-a-la-medida). Forward-path simulation
 * que consume el output de `runBootstrap` (yield paths + ETF returns) y aplica
 * reglas de rollover A/B/C cuando vence cada bullet, en función del estado de
 * la curva treasury simulada.
 *
 * Convenciones de layout (matching `runBootstrap`):
 *   - sim-major, time-minor: `arr[s * H + t]` o `arr[s * (H+1) + t]`.
 *   - 3D arrays se aplanan: `bulletHoldings[s * (H+1) * nBullets + t * nBullets + b]`.
 *
 * Regímenes (ver ROLLOVER_ENGINE.md):
 *   A (tasas altas + curva pronunciada) → todo principal al bullet más largo,
 *      además trim equity si excede `eqtyMax`.
 *   B (tasas bajas o curva flat/invertida) → split (1−X) bullet más largo + X
 *      equity, sujeto a banda dura `eqtyMax`.
 *   C (default) → todo principal al bullet más largo (extensión simple).
 *
 * No mutamos `runBootstrap` ni `bullets.ts`. Recomponemos sus outputs.
 */

import type { Ticker } from '../data/market.generated';
import type { BulletDef } from './bullets';
import { computeBulletReturns } from './bullets';

// =====================================================================
// TIPOS PÚBLICOS
// =====================================================================

export type RolloverRegime = 'A' | 'B' | 'C';

export type EquityMixItem = {
  ticker: Ticker;
  weight: number; // 0..1, dentro del equity sleeve (deben sumar 1)
};

export type RolloverPlan = {
  bullets: ReadonlyArray<BulletDef>;
  /** Fracción inicial del portafolio al sleeve bullets (0..1). */
  bulletTotalPct: number;
  /** Fracción inicial al sleeve equity (0..1). */
  equityPct: number;
  /** Fracción inicial al sleeve cash (0..1). */
  cashPct: number;
  /** Banda dura inferior de equity (0..1). Default 0.0. */
  eqtyMin: number;
  /** Banda dura superior de equity (0..1). Default 0.5. */
  eqtyMax: number;
  /** Mix interno del sleeve equity. Pesos deben sumar 1. */
  equityMix: ReadonlyArray<EquityMixItem>;
  /** Ticker del sleeve cash (típicamente BIL o SHY). */
  cashTicker: Ticker;
  /**
   * Pesos iniciales por bullet (length = bullets.length, normalizado a 1).
   * Si null, equal-weight entre los bullets vivos al inicio (maturityY > 0).
   */
  bulletInitialWeights?: ReadonlyArray<number> | null;
  /** Spread inicial sobre la curva treasury, en decimal. Usado en computeBulletReturns. */
  initialSpread: number;
};

export type RolloverThresholds = {
  /** TNX > thetaHigh ⇒ "tasas altas" (regimen A candidate). */
  thetaHigh: number;
  /** TNX < thetaLow ⇒ "tasas bajas" (regimen B candidate). */
  thetaLow: number;
  /** (TNX − IRX) > thetaSteep ⇒ "curva steep" (regimen A candidate). */
  thetaSteep: number;
  /** (TNX − IRX) < thetaFlat ⇒ "curva flat/invertida" (regimen B candidate). */
  thetaFlat: number;
  /** Regimen B: fracción del principal vencido que va a equity. */
  xToEquity: number;
};

/**
 * Defaults calibrados sobre historia US treasury (TNX media ~4%, slope ~50bp).
 * Coinciden con `code/rollover.py::RolloverThresholds`.
 */
export const DEFAULT_ROLLOVER_THRESHOLDS: RolloverThresholds = {
  thetaHigh: 0.045,
  thetaLow: 0.035,
  thetaSteep: 0.0100,
  thetaFlat: 0.0025,
  xToEquity: 0.40,
};

export type RolloverEvent = {
  /** Mes 1-indexed en que el bullet venció. */
  month: number;
  /** Bullet que venció. */
  bulletName: string;
  /** Bullet de destino más largo (null si no quedaban bullets vivos). */
  destinationBullet: string | null;
  /** Conteo de sims por régimen en este evento. */
  regimeCounts: { A: number; B: number; C: number };
  /** Mediana sobre sims del yield largo (TNX) en el evento. */
  yLongMedian: number;
  yShortMedian: number;
  slopeMedian: number;
  /** Mediana del principal vencido sobre los nPaths. */
  principalMedian: number;
};

export type RolloverContext = {
  yieldPaths: {
    readonly IRX: Float32Array;
    readonly FVX: Float32Array;
    readonly TNX: Float32Array;
    readonly TYX: Float32Array;
  };
  /** Retornos ETF mensuales (sim-major) provenientes de runBootstrap con outputEtfReturns=true. */
  etfReturns: Readonly<Record<string, Float32Array>>;
  /** Curva treasury en t=0 (mismo orden IRX/FVX/TNX/TYX). */
  initialCurve: readonly [number, number, number, number];
  nPaths: number;
  horizonMonths: number;
  /**
   * Override opcional: si presente, salta el cómputo interno de
   * `computeBulletReturns` y usa estos retornos directamente. Length =
   * plan.bullets.length, cada Float32Array [nPaths × horizonMonths] sim-major.
   *
   * Use-cases:
   *   - Tests de paridad con Python (inyectar bullet returns idénticos)
   *   - Pre-cómputo de bullet returns una sola vez para múltiples llamadas a
   *     runRollover con planes que comparten el mismo lineup de bullets
   */
  bulletReturnsOverride?: ReadonlyArray<Float32Array>;
};

export type RolloverInput = {
  plan: RolloverPlan;
  thresholds?: RolloverThresholds;
  ctx: RolloverContext;
  /** False = buy-and-hold (sin rollover). Default true. */
  rolloverEnabled?: boolean;
  /** Máximo de eventos detallados en `eventsLog`. Default 50. */
  logMaxEvents?: number;
  /**
   * Si true, emite `bulletHoldings` row-major [nPaths × (H+1) × nBullets].
   * Opt-in: para 5000 sims × 360 meses × 11 bullets son ~79 MB.
   */
  outputBulletHoldings?: boolean;
};

export type RolloverStats = {
  p5: number;
  p25: number;
  med: number;
  p75: number;
  p95: number;
  mean: number;
  probPos: number;
  annMed: number;
  annP5: number;
  annP95: number;
};

export type RolloverOutput = {
  /** Wealth path por sim: arr[s * (H+1) + t]. wealth[0] = 1.0. */
  wealthPath: Float32Array;
  /** Sleeve weights por sim, row-major [nPaths × (H+1) × 3] (0=bullets, 1=equity, 2=cash). */
  sleevePath: Float32Array;
  /** Solo si `outputBulletHoldings=true`. Layout [nPaths × (H+1) × nBullets]. */
  bulletHoldings?: Float32Array;
  /** Lista de eventos de rollover (uno por bullet maduro). Hasta `logMaxEvents`. */
  eventsLog: RolloverEvent[];
  /** Conteo total de regímenes A/B/C sumado sobre todos los eventos × sims. */
  regimeCounts: { A: number; B: number; C: number };
  stats: RolloverStats;
  /** Retornos finales ordenados (length nPaths). */
  finalsSorted: Float32Array;
  nPaths: number;
  horizonMonths: number;
};

// =====================================================================
// CLASIFICACIÓN DE RÉGIMEN
// =====================================================================

/**
 * Clasifica el régimen A/B/C dado un nivel de TNX (yLong) y IRX (yShort).
 * - A = high & steep
 * - B = (NOT A) & (low OR flat)
 * - C = NOT A AND NOT B
 */
export function classifyRegime(
  yLong: number,
  yShort: number,
  th: RolloverThresholds,
): RolloverRegime {
  const slope = yLong - yShort;
  if (yLong > th.thetaHigh && slope > th.thetaSteep) return 'A';
  if (yLong < th.thetaLow || slope < th.thetaFlat) return 'B';
  return 'C';
}

// =====================================================================
// HELPERS INTERNOS
// =====================================================================

function median(arr: ArrayLike<number>): number {
  const sorted = Float32Array.from(arr as ArrayLike<number>);
  sorted.sort();
  const n = sorted.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return sorted[(n - 1) >> 1];
  return 0.5 * (sorted[n / 2 - 1] + sorted[n / 2]);
}

function validatePlan(plan: RolloverPlan): void {
  const w = plan.bulletTotalPct + plan.equityPct + plan.cashPct;
  if (Math.abs(w - 1) > 1e-6) {
    throw new Error(
      `runRollover: pesos iniciales (bullet+equity+cash)=${w.toFixed(6)} ≠ 1`,
    );
  }
  if (plan.eqtyMin < 0 || plan.eqtyMax > 1 || plan.eqtyMin > plan.eqtyMax) {
    throw new Error(
      `runRollover: bandas equity inválidas [${plan.eqtyMin}, ${plan.eqtyMax}]`,
    );
  }
  if (plan.equityPct < plan.eqtyMin - 1e-9 || plan.equityPct > plan.eqtyMax + 1e-9) {
    throw new Error(
      `runRollover: equityPct=${plan.equityPct} fuera de banda [${plan.eqtyMin}, ${plan.eqtyMax}]`,
    );
  }
  if (plan.bullets.length === 0) {
    throw new Error('runRollover: plan.bullets vacío');
  }
  let sumEq = 0;
  for (const item of plan.equityMix) {
    if (!Number.isFinite(item.weight) || item.weight < 0) {
      throw new Error(`runRollover: equity ${item.ticker} peso inválido ${item.weight}`);
    }
    sumEq += item.weight;
  }
  if (Math.abs(sumEq - 1) > 1e-6) {
    throw new Error(`runRollover: equityMix suma ${sumEq.toFixed(6)} ≠ 1`);
  }
  if (plan.bulletInitialWeights) {
    if (plan.bulletInitialWeights.length !== plan.bullets.length) {
      throw new Error(
        `runRollover: bulletInitialWeights length ${plan.bulletInitialWeights.length} ≠ bullets length ${plan.bullets.length}`,
      );
    }
    let s = 0;
    for (const w of plan.bulletInitialWeights) s += w;
    if (Math.abs(s - 1) > 1e-6) {
      throw new Error(`runRollover: bulletInitialWeights suma ${s.toFixed(6)} ≠ 1`);
    }
  }
}

function computeEquityReturns(
  plan: RolloverPlan,
  etfReturns: Readonly<Record<string, Float32Array>>,
  nPaths: number,
  horizonMonths: number,
): Float32Array {
  const total = nPaths * horizonMonths;
  const eqRet = new Float32Array(total);
  for (const item of plan.equityMix) {
    const series = etfReturns[item.ticker];
    if (!series) {
      throw new Error(
        `runRollover: ticker equity "${item.ticker}" no presente en ctx.etfReturns`,
      );
    }
    if (series.length !== total) {
      throw new Error(
        `runRollover: etfReturns[${item.ticker}].length=${series.length} ≠ nPaths*H=${total}`,
      );
    }
    const w = item.weight;
    for (let i = 0; i < total; i++) eqRet[i] += w * series[i];
  }
  return eqRet;
}

function getCashReturns(
  plan: RolloverPlan,
  etfReturns: Readonly<Record<string, Float32Array>>,
  nPaths: number,
  horizonMonths: number,
): Float32Array {
  const series = etfReturns[plan.cashTicker];
  if (!series) {
    throw new Error(
      `runRollover: cashTicker "${plan.cashTicker}" no presente en ctx.etfReturns`,
    );
  }
  if (series.length !== nPaths * horizonMonths) {
    throw new Error(
      `runRollover: etfReturns[${plan.cashTicker}].length inconsistente`,
    );
  }
  return series;
}

// =====================================================================
// MOTOR PRINCIPAL
// =====================================================================

export function runRollover(input: RolloverInput): RolloverOutput {
  const { plan, ctx } = input;
  const thresholds = input.thresholds ?? DEFAULT_ROLLOVER_THRESHOLDS;
  const rolloverEnabled = input.rolloverEnabled ?? true;
  const logMaxEvents = input.logMaxEvents ?? 50;
  const outputBulletHoldings = input.outputBulletHoldings === true;

  validatePlan(plan);

  const { nPaths, horizonMonths } = ctx;
  const H = horizonMonths;
  const Hp1 = H + 1;
  const nBullets = plan.bullets.length;

  // Maturity month por bullet (1-indexed; coincide con Python `int(ceil(maturity_y * 12))`).
  const maturityMonth = new Int32Array(nBullets);
  for (let b = 0; b < nBullets; b++) {
    maturityMonth[b] = Math.ceil(plan.bullets[b].maturityY * 12);
  }

  // ---- Pesos iniciales por bullet ----
  const bw0 = new Float32Array(nBullets);
  if (plan.bulletInitialWeights) {
    for (let b = 0; b < nBullets; b++) bw0[b] = plan.bulletInitialWeights[b];
  } else {
    let activeCount = 0;
    for (let b = 0; b < nBullets; b++) if (maturityMonth[b] > 0) activeCount++;
    if (activeCount === 0) throw new Error('runRollover: ningún bullet vivo al inicio');
    for (let b = 0; b < nBullets; b++) {
      if (maturityMonth[b] > 0) bw0[b] = 1 / activeCount;
    }
  }

  // ---- Retornos pre-computados ----
  // Bullets: del módulo bullets, alimentado por los mismos yield paths que ya
  //   simuló el bootstrap. Se respeta initialSpread. Si el caller pasa
  //   `bulletReturnsOverride`, lo usamos directamente (útil para parity tests).
  let bulletRet: ReadonlyArray<Float32Array>;
  if (ctx.bulletReturnsOverride) {
    if (ctx.bulletReturnsOverride.length !== nBullets) {
      throw new Error(
        `runRollover: bulletReturnsOverride length ${ctx.bulletReturnsOverride.length} ≠ nBullets ${nBullets}`,
      );
    }
    for (let b = 0; b < nBullets; b++) {
      if (ctx.bulletReturnsOverride[b].length !== nPaths * H) {
        throw new Error(
          `runRollover: bulletReturnsOverride[${b}].length=${ctx.bulletReturnsOverride[b].length} ≠ nPaths*H=${nPaths * H}`,
        );
      }
    }
    bulletRet = ctx.bulletReturnsOverride;
  } else {
    bulletRet = computeBulletReturns({
      bullets: plan.bullets,
      initialCurve: ctx.initialCurve,
      yieldPaths: ctx.yieldPaths,
      nPaths,
      horizonMonths: H,
      initialSpread: plan.initialSpread,
    }).returns; // Float32Array[nBullets], cada uno [nPaths × H]
  }

  const equityRet = computeEquityReturns(plan, ctx.etfReturns, nPaths, H);
  const cashRet = getCashReturns(plan, ctx.etfReturns, nPaths, H);

  // ---- Estado por sim (reusado en el inner loop). Layout: [s * nBullets + b] ----
  const bulletW = new Float32Array(nPaths * nBullets);
  const equityW = new Float32Array(nPaths);
  const cashW = new Float32Array(nPaths);
  for (let s = 0; s < nPaths; s++) {
    for (let b = 0; b < nBullets; b++) {
      bulletW[s * nBullets + b] = bw0[b] * plan.bulletTotalPct;
    }
    equityW[s] = plan.equityPct;
    cashW[s] = plan.cashPct;
  }

  // ---- Output buffers ----
  const wealthPath = new Float32Array(nPaths * Hp1);
  for (let s = 0; s < nPaths; s++) wealthPath[s * Hp1] = 1.0;

  const sleevePath = new Float32Array(nPaths * Hp1 * 3);
  for (let s = 0; s < nPaths; s++) {
    let bSum = 0;
    for (let b = 0; b < nBullets; b++) bSum += bulletW[s * nBullets + b];
    const off = s * Hp1 * 3;
    sleevePath[off + 0] = bSum;
    sleevePath[off + 1] = equityW[s];
    sleevePath[off + 2] = cashW[s];
  }

  const bulletHoldings: Float32Array | null = outputBulletHoldings
    ? new Float32Array(nPaths * Hp1 * nBullets)
    : null;
  if (bulletHoldings) {
    for (let s = 0; s < nPaths; s++) {
      const off = s * Hp1 * nBullets;
      for (let b = 0; b < nBullets; b++) bulletHoldings[off + b] = bulletW[s * nBullets + b];
    }
  }

  const eventsLog: RolloverEvent[] = [];
  const regimeCounts = { A: 0, B: 0, C: 0 };

  // Buffers reusados por evento de maturity (evitan re-alloc)
  const principalBuf = new Float32Array(nPaths);

  // ---- Forward loop ----
  for (let t = 0; t < H; t++) {
    // 1. Portfolio return + wealth update + drift de pesos (vectorizado sobre sims).
    for (let s = 0; s < nPaths; s++) {
      const cell = s * H + t;
      const rEq = equityRet[cell];
      const rCa = cashRet[cell];

      let rBullets = 0;
      const wOff = s * nBullets;
      for (let b = 0; b < nBullets; b++) {
        rBullets += bulletW[wOff + b] * bulletRet[b][cell];
      }
      const rTotal = rBullets + equityW[s] * rEq + cashW[s] * rCa;

      // Update wealth (sim-major layout)
      const wpIdx = s * Hp1 + (t + 1);
      wealthPath[wpIdx] = wealthPath[s * Hp1 + t] * (1 + rTotal);

      // Drift weights multiplicativamente
      const denom = 1 + rTotal !== 0 ? 1 + rTotal : 1.0;
      for (let b = 0; b < nBullets; b++) {
        const idx = wOff + b;
        bulletW[idx] = (bulletW[idx] * (1 + bulletRet[b][cell])) / denom;
      }
      equityW[s] = (equityW[s] * (1 + rEq)) / denom;
      cashW[s] = (cashW[s] * (1 + rCa)) / denom;
    }

    // 2. Maturity events: bullets con maturityMonth == t+1 vencen en este step.
    if (rolloverEnabled) {
      for (let bIdx = 0; bIdx < nBullets; bIdx++) {
        if (maturityMonth[bIdx] !== t + 1) continue;

        // Principal vencido (copia de bullet_w[:, bIdx])
        let principalSum = 0;
        for (let s = 0; s < nPaths; s++) {
          principalBuf[s] = bulletW[s * nBullets + bIdx];
          principalSum += principalBuf[s];
        }
        if (principalSum === 0) continue;

        // Bullet vivo más largo (excluyendo el que venció)
        let longestB = -1;
        let longestMatY = -Infinity;
        for (let b = 0; b < nBullets; b++) {
          if (b === bIdx) continue;
          if (maturityMonth[b] > t + 1 && plan.bullets[b].maturityY > longestMatY) {
            longestMatY = plan.bullets[b].maturityY;
            longestB = b;
          }
        }

        if (longestB === -1) {
          // No quedan bullets vivos → principal a equity (fallback)
          for (let s = 0; s < nPaths; s++) {
            equityW[s] += principalBuf[s];
            bulletW[s * nBullets + bIdx] = 0;
          }
          if (eventsLog.length < logMaxEvents) {
            eventsLog.push({
              month: t + 1,
              bulletName: plan.bullets[bIdx].name,
              destinationBullet: null,
              regimeCounts: { A: 0, B: 0, C: 0 },
              yLongMedian: 0,
              yShortMedian: 0,
              slopeMedian: 0,
              principalMedian: median(principalBuf),
            });
          }
          continue;
        }

        // Curva al cierre del mes t (índice [s * H + t])
        // Aplicamos la regla per-sim — vectorización compleja en JS no compensa
        // por el costo de un branch simple.
        let countA = 0;
        let countB = 0;
        let countC = 0;
        const X = thresholds.xToEquity;

        // Para diagnóstico del evento
        const yLongArr = new Float32Array(nPaths);
        const yShortArr = new Float32Array(nPaths);

        for (let s = 0; s < nPaths; s++) {
          const yIdx = s * H + t;
          const yLong = ctx.yieldPaths.TNX[yIdx];
          const yShort = ctx.yieldPaths.IRX[yIdx];
          yLongArr[s] = yLong;
          yShortArr[s] = yShort;

          const regime = classifyRegime(yLong, yShort, thresholds);

          const principal = principalBuf[s];
          const wOff = s * nBullets;

          if (regime === 'A') {
            // Trim equity si excede eqtyMax
            const eqExcess = equityW[s] > plan.eqtyMax ? equityW[s] - plan.eqtyMax : 0;
            bulletW[wOff + longestB] += principal + eqExcess;
            equityW[s] -= eqExcess;
            bulletW[wOff + bIdx] = 0;
            countA++;
          } else if (regime === 'B') {
            const toEqTarget = principal * X;
            const availEq = plan.eqtyMax - equityW[s];
            const toEqActual = Math.max(0, Math.min(toEqTarget, availEq));
            const toBulletActual = principal - toEqActual;
            equityW[s] += toEqActual;
            bulletW[wOff + longestB] += toBulletActual;
            bulletW[wOff + bIdx] = 0;
            countB++;
          } else {
            // regime === 'C'
            bulletW[wOff + longestB] += principal;
            bulletW[wOff + bIdx] = 0;
            countC++;
          }
        }

        regimeCounts.A += countA;
        regimeCounts.B += countB;
        regimeCounts.C += countC;

        if (eventsLog.length < logMaxEvents) {
          const yLM = median(yLongArr);
          const yShM = median(yShortArr);
          eventsLog.push({
            month: t + 1,
            bulletName: plan.bullets[bIdx].name,
            destinationBullet: plan.bullets[longestB].name,
            regimeCounts: { A: countA, B: countB, C: countC },
            yLongMedian: yLM,
            yShortMedian: yShM,
            slopeMedian: yLM - yShM,
            principalMedian: median(principalBuf),
          });
        }
      }
    }

    // 3. Snapshot post-eventos
    for (let s = 0; s < nPaths; s++) {
      let bSum = 0;
      for (let b = 0; b < nBullets; b++) bSum += bulletW[s * nBullets + b];
      const off = s * Hp1 * 3 + (t + 1) * 3;
      sleevePath[off + 0] = bSum;
      sleevePath[off + 1] = equityW[s];
      sleevePath[off + 2] = cashW[s];
    }
    if (bulletHoldings) {
      for (let s = 0; s < nPaths; s++) {
        const off = s * Hp1 * nBullets + (t + 1) * nBullets;
        const wOff = s * nBullets;
        for (let b = 0; b < nBullets; b++) bulletHoldings[off + b] = bulletW[wOff + b];
      }
    }
  }

  // ---- Stats finales ----
  const finals = new Float32Array(nPaths);
  for (let s = 0; s < nPaths; s++) finals[s] = wealthPath[s * Hp1 + H] - 1;
  const finalsSorted = Float32Array.from(finals);
  finalsSorted.sort();
  const n = finalsSorted.length;
  const pct = (p: number): number => finalsSorted[Math.floor(p * (n - 1))];

  let sum = 0;
  let nPos = 0;
  for (let s = 0; s < n; s++) {
    sum += finals[s];
    if (finals[s] > 0) nPos++;
  }
  const mean = sum / n;
  const annFactor = 12.0 / H;

  const stats: RolloverStats = {
    p5: pct(0.05),
    p25: pct(0.25),
    med: pct(0.50),
    p75: pct(0.75),
    p95: pct(0.95),
    mean,
    probPos: nPos / n,
    annMed: Math.pow(1 + pct(0.50), annFactor) - 1,
    annP5: pct(0.05) > -1 ? Math.pow(1 + pct(0.05), annFactor) - 1 : -1,
    annP95: Math.pow(1 + pct(0.95), annFactor) - 1,
  };

  const out: RolloverOutput = {
    wealthPath,
    sleevePath,
    eventsLog,
    regimeCounts,
    stats,
    finalsSorted,
    nPaths,
    horizonMonths: H,
  };
  if (bulletHoldings) out.bulletHoldings = bulletHoldings;
  return out;
}

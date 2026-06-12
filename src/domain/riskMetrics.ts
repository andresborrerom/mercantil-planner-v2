/**
 * riskMetrics.ts — atribución de riesgo del portafolio.
 *
 * Issue #28 follow-up. Computa contribuciones de riesgo (component VaR),
 * marginal VaR, correlaciones y métricas asociadas a partir de los
 * retornos mensuales históricos de cada ETF (data layer:
 * src/data/market.generated.ts, 244M × 45 tickers).
 *
 * Convenciones:
 *   - Retornos mensuales (decimal). Anualización: σ_annual = σ_monthly × √12,
 *     Σ_annual = Σ_monthly × 12 (asume retornos IID stationary — proxy
 *     razonable a horizonte de 1y).
 *   - VaR paramétrico Gaussiano 1-tail:
 *       VaR_α = z_α × σ_portfolio  (en términos relativos)
 *       VaR_α($) = AUM × z_α × σ_portfolio
 *     z_α = 1.645 para 95%, 2.326 para 99%.
 *   - Component VaR (Euler attribution):
 *       Component_i = z_α × w_i × (Σw)_i / σ_p
 *       Σ Component_i = VaR total — la atribución suma exactamente.
 *
 * Pure functions — sin React, sin Zustand. Testeable bit-a-bit.
 */
import { RETURNS, TICKERS, N_TICKERS, N_MONTHS, type Ticker } from '../data/market.generated';

/** z-score 1-tail Gaussian para confianzas estándar. */
export const Z_SCORES: Record<number, number> = {
  0.90: 1.282,
  0.95: 1.645,
  0.975: 1.960,
  0.99: 2.326,
};

const TICKER_TO_IDX: Map<string, number> = new Map(TICKERS.map((t, i) => [t, i]));

/**
 * Mapea un exposureTicker (del data layer de exposure) → ticker del market
 * data. Necesario porque IBDS/HYG no están en TICKERS — usamos proxies:
 *  - IBDS (iBonds IG ladder) → LQD (IG corp ETF, ~8y duration efectiva)
 *  - HYG (iBonds HY proxy)   → GHYG (Global HY, único HY en el universo)
 * El resto mapea identidad.
 */
export function mapToMarketTicker(exposureTicker: string): Ticker | null {
  if (exposureTicker === 'IBDS') return 'LQD';
  if (exposureTicker === 'HYG') return 'GHYG';
  if (TICKER_TO_IDX.has(exposureTicker)) return exposureTicker as Ticker;
  return null;
}

/** Extrae el vector de retornos mensuales de un ticker (length = N_MONTHS). */
export function getReturnsForTicker(ticker: Ticker): Float64Array {
  const idx = TICKER_TO_IDX.get(ticker);
  if (idx === undefined) throw new Error(`Ticker desconocido: ${ticker}`);
  const out = new Float64Array(N_MONTHS);
  for (let m = 0; m < N_MONTHS; m++) {
    out[m] = RETURNS[m * N_TICKERS + idx];
  }
  return out;
}

/**
 * Matriz de retornos para una lista de tickers.
 * Layout: matrix[t][i] = retorno mensual del ticker i en mes t.
 */
export function getReturnsMatrix(tickers: readonly Ticker[]): number[][] {
  const N = tickers.length;
  const matrix: number[][] = [];
  const tickerIdxs = tickers.map((t) => {
    const idx = TICKER_TO_IDX.get(t);
    if (idx === undefined) throw new Error(`Ticker desconocido: ${t}`);
    return idx;
  });
  for (let m = 0; m < N_MONTHS; m++) {
    const row = new Array(N);
    for (let i = 0; i < N; i++) row[i] = RETURNS[m * N_TICKERS + tickerIdxs[i]];
    matrix.push(row);
  }
  return matrix;
}

/** Media columna a columna. */
export function meanVector(matrix: number[][]): number[] {
  const T = matrix.length;
  if (T === 0) return [];
  const N = matrix[0].length;
  const out = new Array(N).fill(0);
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) out[i] += matrix[t][i];
  }
  for (let i = 0; i < N; i++) out[i] /= T;
  return out;
}

/**
 * Matriz de covarianza muestral (denominador T-1). Anualiza por defecto
 * multiplicando por 12 — para usar con retornos mensuales y vol anual.
 */
export function covarianceMatrix(matrix: number[][], annualize = true): number[][] {
  const T = matrix.length;
  if (T < 2) throw new Error('covarianceMatrix necesita al menos 2 observaciones');
  const N = matrix[0].length;
  const mean = meanVector(matrix);
  const cov: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < N; i++) {
      const di = matrix[t][i] - mean[i];
      for (let j = i; j < N; j++) {
        cov[i][j] += di * (matrix[t][j] - mean[j]);
      }
    }
  }
  const denom = T - 1;
  const scale = annualize ? 12 / denom : 1 / denom;
  for (let i = 0; i < N; i++) {
    for (let j = i; j < N; j++) {
      cov[i][j] *= scale;
      if (j !== i) cov[j][i] = cov[i][j];
    }
  }
  return cov;
}

/** Matriz de correlación = D^(-1/2) Σ D^(-1/2), donde D = diag(Σ). */
export function correlationMatrix(cov: number[][]): number[][] {
  const N = cov.length;
  const stddev = new Array(N);
  for (let i = 0; i < N; i++) stddev[i] = Math.sqrt(Math.max(cov[i][i], 0));
  const corr: number[][] = Array.from({ length: N }, () => new Array(N).fill(0));
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const sij = stddev[i] * stddev[j];
      corr[i][j] = sij > 0 ? cov[i][j] / sij : 0;
      // Clip exact 1 en la diagonal (puede salir 0.9999... por float)
      if (i === j) corr[i][j] = 1;
    }
  }
  return corr;
}

/** σ_p = √(w' Σ w). */
export function portfolioVol(weights: number[], cov: number[][]): number {
  const N = weights.length;
  let v = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      v += weights[i] * weights[j] * cov[i][j];
    }
  }
  return Math.sqrt(Math.max(v, 0));
}

/**
 * Marginal contribution to vol: ∂σ_p/∂w_i = (Σw)_i / σ_p.
 * Si σ_p ≈ 0 (todo cash), devuelve ceros.
 */
export function marginalVol(weights: number[], cov: number[][]): number[] {
  const N = weights.length;
  const sigma = portfolioVol(weights, cov);
  if (sigma < 1e-12) return new Array(N).fill(0);
  const out = new Array(N).fill(0);
  for (let i = 0; i < N; i++) {
    let row = 0;
    for (let j = 0; j < N; j++) row += cov[i][j] * weights[j];
    out[i] = row / sigma;
  }
  return out;
}

/**
 * Component contribution to vol: c_i = w_i × marginal_i. Σ c_i = σ_p.
 */
export function componentVol(weights: number[], cov: number[][]): number[] {
  const marg = marginalVol(weights, cov);
  return weights.map((w, i) => w * marg[i]);
}

/**
 * Component VaR_i = z_α × component_vol_i. Σ component_VaR_i = VaR_α total.
 * Default 95% (z=1.645).
 */
export function componentVaR(weights: number[], cov: number[][], confidence = 0.95): number[] {
  const z = Z_SCORES[confidence] ?? 1.645;
  return componentVol(weights, cov).map((c) => z * c);
}

/** VaR total parametrico Gaussiano 1-tail (en fracción del AUM). */
export function portfolioVaR(weights: number[], cov: number[][], confidence = 0.95): number {
  const z = Z_SCORES[confidence] ?? 1.645;
  return z * portfolioVol(weights, cov);
}

/**
 * Posición agregada por ticker market-data (no por vintage).
 * Input para todos los compute_* de abajo.
 */
export type RiskPosition = {
  /** Ticker en el universo de market.generated.ts. */
  ticker: Ticker;
  /** Peso AUM (0..1). */
  weight: number;
  /** Label client-facing (puede agrupar — "iBonds IG ladder"). */
  label: string;
  /** Sleeve de origen (para agrupar atribución). */
  sleeve: 'Bullets' | 'Equity' | 'Cash' | 'RealAssets';
};

/** Resultado de un análisis de atribución de riesgo. */
export type RiskAttribution = {
  positions: RiskPosition[];
  /** Vol anualizada del portafolio (decimal). */
  portfolioVol: number;
  /** VaR anualizado al confidence dado (decimal). */
  portfolioVaR: number;
  confidence: number;
  /** Contribución de cada posición al VaR (decimal, suma = portfolioVaR). */
  componentVaR: number[];
  /** % del VaR total (decimal, suma = 1). */
  componentVaRPct: number[];
  /** Marginal VaR de cada posición (∂VaR/∂w_i). */
  marginalVaR: number[];
  /** Matriz de correlación entre las posiciones (NxN). */
  correlation: number[][];
  /** Matriz de covarianza (NxN, anualizada). */
  covariance: number[][];
};

/**
 * Análisis completo. Si dos positions colapsan en el mismo market ticker,
 * sus weights se suman (i.e., dos posiciones que ambas mapean a LQD se
 * combinan en una sola posición de cara al cálculo de riesgo, evitando
 * que la matriz de covarianza tenga columnas/filas duplicadas).
 */
export function computeRiskAttribution(
  positions: RiskPosition[],
  confidence = 0.95,
): RiskAttribution {
  // Agregar positions que comparten ticker
  const byTicker = new Map<Ticker, RiskPosition>();
  for (const p of positions) {
    if (p.weight <= 0) continue;
    const existing = byTicker.get(p.ticker);
    if (existing) {
      byTicker.set(p.ticker, { ...existing, weight: existing.weight + p.weight });
    } else {
      byTicker.set(p.ticker, { ...p });
    }
  }
  const merged = Array.from(byTicker.values());
  if (merged.length === 0) {
    return {
      positions: [],
      portfolioVol: 0,
      portfolioVaR: 0,
      confidence,
      componentVaR: [],
      componentVaRPct: [],
      marginalVaR: [],
      correlation: [],
      covariance: [],
    };
  }
  const tickers = merged.map((p) => p.ticker);
  const weights = merged.map((p) => p.weight);
  const matrix = getReturnsMatrix(tickers);
  const cov = covarianceMatrix(matrix);
  const corr = correlationMatrix(cov);
  const sigma = portfolioVol(weights, cov);
  const z = Z_SCORES[confidence] ?? 1.645;
  const VaR = z * sigma;
  const marg = marginalVol(weights, cov).map((m) => z * m);
  const comp = componentVaR(weights, cov, confidence);
  const compPct = VaR > 1e-12 ? comp.map((c) => c / VaR) : comp.map(() => 0);
  return {
    positions: merged,
    portfolioVol: sigma,
    portfolioVaR: VaR,
    confidence,
    componentVaR: comp,
    componentVaRPct: compPct,
    marginalVaR: marg,
    correlation: corr,
    covariance: cov,
  };
}

/**
 * Drawdown de un path: para cada t, dd[t] = (peak[t] - path[t]) / peak[t],
 * donde peak[t] = max(path[0..t]). Devuelve drawdown (positivo, e.g.,
 * 0.18 = -18% del peak).
 *
 * Esta función opera sobre UN solo path. Para cross-sim stats (mediana,
 * p95) hay que correrla por cada sim del aumPath y agregar.
 */
export function pathDrawdown(path: ArrayLike<number>): Float64Array {
  const T = path.length;
  const dd = new Float64Array(T);
  let peak = -Infinity;
  for (let t = 0; t < T; t++) {
    if (path[t] > peak) peak = path[t];
    dd[t] = peak > 0 ? (peak - path[t]) / peak : 0;
  }
  return dd;
}

/**
 * Max drawdown de un path (escalar). Convenience function — equivale a
 * Math.max(...pathDrawdown(path)) pero sin allocar el array intermedio.
 */
export function pathMaxDrawdown(path: ArrayLike<number>): number {
  const T = path.length;
  let peak = -Infinity;
  let maxDD = 0;
  for (let t = 0; t < T; t++) {
    if (path[t] > peak) peak = path[t];
    if (peak > 0) {
      const dd = (peak - path[t]) / peak;
      if (dd > maxDD) maxDD = dd;
    }
  }
  return maxDD;
}

/** Percentil de un array de números (interpolación lineal). */
export function percentile(values: ArrayLike<number>, p: number): number {
  if (values.length === 0) return 0;
  const sorted = Array.from(values).sort((a, b) => a - b);
  const rank = p * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  const frac = rank - lo;
  return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/**
 * Cross-sim drawdown summary: para un aumPath layout [nSims × (H+1)],
 * computa la distribución del max drawdown across sims.
 */
export function crossSimMaxDrawdown(
  aumPath: ArrayLike<number>,
  nSims: number,
  horizonMonths: number,
): { med: number; p95: number; p99: number } {
  const Hp1 = horizonMonths + 1;
  const maxDDs = new Float64Array(nSims);
  const buf = new Float64Array(Hp1);
  for (let s = 0; s < nSims; s++) {
    for (let t = 0; t < Hp1; t++) buf[t] = aumPath[s * Hp1 + t];
    maxDDs[s] = pathMaxDrawdown(buf);
  }
  return {
    med: percentile(maxDDs, 0.5),
    p95: percentile(maxDDs, 0.95),
    p99: percentile(maxDDs, 0.99),
  };
}

/**
 * Stats completos de drawdown sobre todas las sims: cross-time percentiles
 * (mediana + p95 del drawdown en cada t) Y cross-sim percentiles del max DD.
 *
 * El primer set se usa para el chart "underwater equity curve" (drawdown
 * over time); el segundo para tiles de stats (issue #30).
 *
 * Layout aumPath: [nSims × (H+1)] row-major.
 *
 * Memoria: aloca un Float64Array de tamaño nSims × (H+1). Para
 * nSims=5000 × H=240 son ~9.6MB — aceptable en browser.
 */
export function computeDrawdownStats(
  aumPath: ArrayLike<number>,
  nSims: number,
  horizonMonths: number,
): {
  /** Mediana del drawdown en cada t (length Hp1, valores 0..1). */
  ddMed: Float64Array;
  /** P95 del drawdown en cada t — el "5% peor" caso. */
  ddP95: Float64Array;
  /** Mediana del max DD across sims (escalar). */
  maxDDMed: number;
  /** P95 del max DD across sims (escalar — el peor 5% de los maxDDs). */
  maxDDP95: number;
  /** P99 (peor 1%). */
  maxDDP99: number;
} {
  const Hp1 = horizonMonths + 1;
  // Storage: dd[s][t] full matrix
  const ddArr = new Float64Array(nSims * Hp1);
  const maxDDs = new Float64Array(nSims);
  for (let s = 0; s < nSims; s++) {
    let peak = -Infinity;
    let maxDD = 0;
    for (let t = 0; t < Hp1; t++) {
      const v = aumPath[s * Hp1 + t];
      if (v > peak) peak = v;
      const dd = peak > 0 ? (peak - v) / peak : 0;
      ddArr[s * Hp1 + t] = dd;
      if (dd > maxDD) maxDD = dd;
    }
    maxDDs[s] = maxDD;
  }
  // Per-t percentiles
  const ddMed = new Float64Array(Hp1);
  const ddP95 = new Float64Array(Hp1);
  const colBuf = new Float64Array(nSims);
  for (let t = 0; t < Hp1; t++) {
    for (let s = 0; s < nSims; s++) colBuf[s] = ddArr[s * Hp1 + t];
    ddMed[t] = percentile(colBuf, 0.5);
    ddP95[t] = percentile(colBuf, 0.95);
  }
  return {
    ddMed,
    ddP95,
    maxDDMed: percentile(maxDDs, 0.5),
    maxDDP95: percentile(maxDDs, 0.95),
    maxDDP99: percentile(maxDDs, 0.99),
  };
}

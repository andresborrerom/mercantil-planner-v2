/**
 * Tests para riskMetrics.ts.
 *
 * Cubre:
 *   - Identity invariants: ΣcomponentVaR == portfolioVaR (Euler)
 *   - Casos analíticos: 1-asset portfolio, 2-asset perfecto-correlated
 *   - Correlation matrix simétrica + diagonal = 1
 *   - Drawdown: V-shape, monotónico ascendente
 *   - Cross-sim percentiles ordenados
 *   - mapToMarketTicker: IBDS→LQD, HYG→GHYG, identity case
 */
import { describe, expect, it } from 'vitest';
import {
  covarianceMatrix,
  correlationMatrix,
  portfolioVol,
  marginalVol,
  componentVol,
  componentVaR,
  portfolioVaR,
  computeRiskAttribution,
  pathDrawdown,
  pathMaxDrawdown,
  percentile,
  crossSimMaxDrawdown,
  mapToMarketTicker,
  Z_SCORES,
  getReturnsMatrix,
} from './riskMetrics';

describe('mapToMarketTicker', () => {
  it('mapea IBDS → LQD (proxy iBonds IG ladder)', () => {
    expect(mapToMarketTicker('IBDS')).toBe('LQD');
  });
  it('mapea HYG → GHYG (HYG no está en TICKERS)', () => {
    expect(mapToMarketTicker('HYG')).toBe('GHYG');
  });
  it('identidad para tickers en TICKERS', () => {
    expect(mapToMarketTicker('USMV')).toBe('USMV');
    expect(mapToMarketTicker('SCHD')).toBe('SCHD');
    expect(mapToMarketTicker('BIL')).toBe('BIL');
    expect(mapToMarketTicker('INFL')).toBe('INFL');
  });
  it('null para tickers desconocidos', () => {
    expect(mapToMarketTicker('FOO')).toBe(null);
    expect(mapToMarketTicker('')).toBe(null);
  });
});

describe('covarianceMatrix', () => {
  it('matriz 2x2 simétrica con diagonal positiva', () => {
    const data = [
      [0.01, 0.02],
      [-0.02, 0.01],
      [0.03, -0.01],
      [0.0, 0.02],
    ];
    const cov = covarianceMatrix(data, false);
    expect(cov.length).toBe(2);
    expect(cov[0].length).toBe(2);
    expect(cov[0][1]).toBeCloseTo(cov[1][0], 12);
    expect(cov[0][0]).toBeGreaterThan(0);
    expect(cov[1][1]).toBeGreaterThan(0);
  });

  it('anualiza × 12 cuando annualize=true', () => {
    const data = [
      [0.01, 0.02],
      [-0.02, 0.01],
      [0.03, -0.01],
      [0.0, 0.02],
    ];
    const covM = covarianceMatrix(data, false);
    const covA = covarianceMatrix(data, true);
    expect(covA[0][0] / covM[0][0]).toBeCloseTo(12, 6);
    expect(covA[1][1] / covM[1][1]).toBeCloseTo(12, 6);
  });
});

describe('correlationMatrix', () => {
  it('diagonal = 1, valores en [-1, 1]', () => {
    const matrix = getReturnsMatrix(['USMV', 'SCHD', 'BIL']);
    const cov = covarianceMatrix(matrix);
    const corr = correlationMatrix(cov);
    for (let i = 0; i < corr.length; i++) {
      expect(corr[i][i]).toBe(1);
      for (let j = 0; j < corr[i].length; j++) {
        expect(corr[i][j]).toBeGreaterThanOrEqual(-1.000001);
        expect(corr[i][j]).toBeLessThanOrEqual(1.000001);
      }
    }
  });

  it('USMV y SCHD correlacionados positivamente (ambos S&P 500 equity)', () => {
    const matrix = getReturnsMatrix(['USMV', 'SCHD']);
    const cov = covarianceMatrix(matrix);
    const corr = correlationMatrix(cov);
    expect(corr[0][1]).toBeGreaterThan(0.7);
  });

  it('USMV y BIL casi descorrelacionados (equity vs cash)', () => {
    const matrix = getReturnsMatrix(['USMV', 'BIL']);
    const cov = covarianceMatrix(matrix);
    const corr = correlationMatrix(cov);
    // Correlación equity vs T-bills históricamente baja
    expect(Math.abs(corr[0][1])).toBeLessThan(0.5);
  });
});

describe('portfolioVol & componentVol', () => {
  it('1-asset portfolio: portfolioVol = sqrt(diag)', () => {
    const cov = [[0.04]];
    const w = [1];
    expect(portfolioVol(w, cov)).toBeCloseTo(0.2, 9);
  });

  it('2-asset 50/50 con cov independiente: σ_p < σ_max (diversificación)', () => {
    const cov = [
      [0.04, 0.0],
      [0.0, 0.04],
    ];
    const w = [0.5, 0.5];
    expect(portfolioVol(w, cov)).toBeCloseTo(0.2 / Math.sqrt(2), 9);
  });

  it('componentVol suma a portfolioVol (Euler)', () => {
    const matrix = getReturnsMatrix(['USMV', 'SCHD', 'BIL']);
    const cov = covarianceMatrix(matrix);
    const w = [0.3, 0.3, 0.4];
    const sigma = portfolioVol(w, cov);
    const comp = componentVol(w, cov);
    const sum = comp.reduce((s, c) => s + c, 0);
    expect(sum).toBeCloseTo(sigma, 9);
  });

  it('marginal × weight = componentVol per asset', () => {
    const matrix = getReturnsMatrix(['USMV', 'SCHD', 'BIL']);
    const cov = covarianceMatrix(matrix);
    const w = [0.3, 0.3, 0.4];
    const marg = marginalVol(w, cov);
    const comp = componentVol(w, cov);
    for (let i = 0; i < w.length; i++) {
      expect(w[i] * marg[i]).toBeCloseTo(comp[i], 9);
    }
  });

  it('all-cash portfolio: σ_p y componentes finitos (no NaN)', () => {
    const cov = [[1e-10]];
    const w = [1];
    const sigma = portfolioVol(w, cov);
    expect(Number.isFinite(sigma)).toBe(true);
    const marg = marginalVol(w, cov);
    expect(Number.isFinite(marg[0])).toBe(true);
  });
});

describe('componentVaR & portfolioVaR', () => {
  it('componentVaR suma a portfolioVaR', () => {
    const matrix = getReturnsMatrix(['USMV', 'SCHD', 'BIL']);
    const cov = covarianceMatrix(matrix);
    const w = [0.3, 0.3, 0.4];
    const VaR = portfolioVaR(w, cov, 0.95);
    const comp = componentVaR(w, cov, 0.95);
    expect(comp.reduce((s, c) => s + c, 0)).toBeCloseTo(VaR, 9);
  });

  it('z_99 > z_95: VaR 99 > VaR 95', () => {
    const matrix = getReturnsMatrix(['USMV', 'SCHD']);
    const cov = covarianceMatrix(matrix);
    const w = [0.5, 0.5];
    const VaR95 = portfolioVaR(w, cov, 0.95);
    const VaR99 = portfolioVaR(w, cov, 0.99);
    expect(VaR99).toBeGreaterThan(VaR95);
    expect(VaR99 / VaR95).toBeCloseTo(Z_SCORES[0.99] / Z_SCORES[0.95], 6);
  });
});

describe('computeRiskAttribution', () => {
  it('TBSC default: bullets+equity+cash → componentVaR suma a portfolioVaR', () => {
    const positions = [
      { ticker: 'LQD' as const, weight: 0.65, label: 'iBonds IG ladder', sleeve: 'Bullets' as const },
      { ticker: 'USMV' as const, weight: 0.15, label: 'USMV', sleeve: 'Equity' as const },
      { ticker: 'SCHD' as const, weight: 0.15, label: 'SCHD', sleeve: 'Equity' as const },
      { ticker: 'BIL' as const, weight: 0.05, label: 'BIL', sleeve: 'Cash' as const },
    ];
    const result = computeRiskAttribution(positions, 0.95);
    const compSum = result.componentVaR.reduce((s, c) => s + c, 0);
    expect(compSum).toBeCloseTo(result.portfolioVaR, 9);
    expect(result.componentVaRPct.reduce((s, c) => s + c, 0)).toBeCloseTo(1, 9);
  });

  it('positions con weight 0 se descartan', () => {
    const positions = [
      { ticker: 'USMV' as const, weight: 0.5, label: 'USMV', sleeve: 'Equity' as const },
      { ticker: 'SCHD' as const, weight: 0, label: 'SCHD', sleeve: 'Equity' as const },
      { ticker: 'BIL' as const, weight: 0.5, label: 'BIL', sleeve: 'Cash' as const },
    ];
    const result = computeRiskAttribution(positions);
    expect(result.positions).toHaveLength(2);
  });

  it('positions con mismo ticker se mergean', () => {
    // Si por algún caveat el iBonds IG y otro proxy mapean al mismo LQD,
    // el computeRiskAttribution debe sumar weights, no duplicar columnas.
    const positions = [
      { ticker: 'LQD' as const, weight: 0.3, label: 'A', sleeve: 'Bullets' as const },
      { ticker: 'LQD' as const, weight: 0.2, label: 'B', sleeve: 'Bullets' as const },
      { ticker: 'USMV' as const, weight: 0.5, label: 'USMV', sleeve: 'Equity' as const },
    ];
    const result = computeRiskAttribution(positions);
    expect(result.positions).toHaveLength(2);
    const lqd = result.positions.find((p) => p.ticker === 'LQD')!;
    expect(lqd.weight).toBeCloseTo(0.5, 9);
  });

  it('equity sleeve aporta más al VaR que su peso AUM (alpha de riesgo)', () => {
    // Endowment típico: bullets 65% AUM pero 20-30% del VaR; equity 30% AUM
    // pero 60-75% del VaR. Reflejo de que equity tiene 4× la vol de bonds.
    const positions = [
      { ticker: 'LQD' as const, weight: 0.65, label: 'iBonds IG', sleeve: 'Bullets' as const },
      { ticker: 'USMV' as const, weight: 0.30, label: 'USMV', sleeve: 'Equity' as const },
      { ticker: 'BIL' as const, weight: 0.05, label: 'BIL', sleeve: 'Cash' as const },
    ];
    const result = computeRiskAttribution(positions);
    const idxLQD = result.positions.findIndex((p) => p.ticker === 'LQD');
    const idxUSMV = result.positions.findIndex((p) => p.ticker === 'USMV');
    // USMV aporta más al VaR per dollar que LQD
    expect(result.marginalVaR[idxUSMV]).toBeGreaterThan(result.marginalVaR[idxLQD]);
    // Equity contribuye más al VaR que su peso (>30% del VaR)
    expect(result.componentVaRPct[idxUSMV]).toBeGreaterThan(0.30);
    // Bullets contribuye menos al VaR que su peso (<65% del VaR)
    expect(result.componentVaRPct[idxLQD]).toBeLessThan(0.65);
  });
});

describe('pathDrawdown', () => {
  it('path monotónicamente ascendente: dd = 0 en todo punto', () => {
    const dd = pathDrawdown([100, 110, 120, 130]);
    for (const v of dd) expect(v).toBeCloseTo(0, 9);
  });

  it('V-shape: dd profundo en el valle, 0 al recuperar peak', () => {
    const dd = pathDrawdown([100, 80, 60, 80, 100, 120]);
    expect(dd[0]).toBe(0);
    expect(dd[1]).toBeCloseTo(0.2, 9); // 100→80
    expect(dd[2]).toBeCloseTo(0.4, 9); // 100→60
    expect(dd[3]).toBeCloseTo(0.2, 9); // peak sigue siendo 100
    expect(dd[4]).toBeCloseTo(0, 9);
    expect(dd[5]).toBeCloseTo(0, 9);
  });

  it('pathMaxDrawdown coincide con max(pathDrawdown)', () => {
    const path = [100, 80, 90, 60, 70, 90, 50, 80];
    const dd = pathDrawdown(path);
    expect(pathMaxDrawdown(path)).toBeCloseTo(Math.max(...dd), 12);
  });
});

describe('percentile', () => {
  it('mediana de [1..9] = 5', () => {
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9], 0.5)).toBeCloseTo(5, 9);
  });
  it('p0 = min, p1 = max', () => {
    const arr = [10, 5, 7, 1, 9];
    expect(percentile(arr, 0)).toBe(1);
    expect(percentile(arr, 1)).toBe(10);
  });
  it('p95 cerca del max para n=20', () => {
    const arr = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(percentile(arr, 0.95)).toBeCloseTo(19.05, 6);
  });
});

describe('crossSimMaxDrawdown', () => {
  it('paths flat: maxDD = 0 en todo percentil', () => {
    // 3 sims, 4 meses cada uno, todos planos en 100
    const flat = new Float64Array([100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100, 100]);
    const result = crossSimMaxDrawdown(flat, 3, 3);
    expect(result.med).toBeCloseTo(0, 9);
    expect(result.p95).toBeCloseTo(0, 9);
  });

  it('percentiles ordenados med ≤ p95 ≤ p99', () => {
    const path = new Float64Array(50 * 13); // 50 sims, 12 meses + initial
    for (let s = 0; s < 50; s++) {
      // sim s tiene un drawdown proporcional a s
      for (let t = 0; t < 13; t++) {
        path[s * 13 + t] = t === 6 ? 100 - s : 100;
      }
    }
    const result = crossSimMaxDrawdown(path, 50, 12);
    expect(result.med).toBeLessThanOrEqual(result.p95 + 1e-9);
    expect(result.p95).toBeLessThanOrEqual(result.p99 + 1e-9);
  });
});

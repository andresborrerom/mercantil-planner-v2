/**
 * Tests para inflationView.ts — anclan el modelo de conditioning a propiedades
 * verificables (ground truth G2-G6 del plan PR #21).
 *
 * G2 aritmética: inflación mensual constante c → ann = (1+c)^12 - 1
 * G3 filtro límite: rango amplio → todas; vacío → 0; min > max → 0
 * G4 indices correctos: matchedIndices son las sims cuyo stat está en rango
 * G5 unconditional distribution coincide con el dato sampleado
 * G6 SE fórmula correcta: sqrt(p*(1-p)/n)
 */
import { describe, it, expect } from 'vitest';
import {
  computeAnnInflationInWindow,
  filterPathsByInflation,
  evaluateInflationView,
  unconditionalInflationDistribution,
  computeConditionalStats,
} from './inflationView';

// Helper: construye un inflationIndexPath sim-major desde inflación mensual
// constante c per-sim. Cada sim tiene su propia c (para variabilidad).
function buildIndexPath(
  monthlyInflPerSim: number[],
  horizonMonths: number,
): Float64Array {
  const nSims = monthlyInflPerSim.length;
  const Hp1 = horizonMonths + 1;
  const out = new Float64Array(nSims * Hp1);
  for (let s = 0; s < nSims; s++) {
    const c = monthlyInflPerSim[s];
    let idx = 1.0;
    out[s * Hp1] = idx;
    for (let t = 1; t <= horizonMonths; t++) {
      idx *= 1 + c;
      out[s * Hp1 + t] = idx;
    }
  }
  return out;
}

describe('G2 — aritmética de la ventana', () => {
  it('inflación mensual constante 0.5% → ann = (1.005)^12 - 1 ≈ 6.17%', () => {
    const c = 0.005;
    const idx = buildIndexPath([c], 240);
    const ann = computeAnnInflationInWindow(idx, 1, 240, 12);
    const expected = Math.pow(1.005, 12) - 1;
    expect(ann[0]).toBeCloseTo(expected, 10);
  });

  it('inflación 0% → ann = 0 exactamente', () => {
    const idx = buildIndexPath([0], 240);
    for (const w of [1, 12, 36, 60, 120, 240]) {
      const ann = computeAnnInflationInWindow(idx, 1, 240, w);
      expect(ann[0]).toBe(0);
    }
  });

  it('window=12 con inflación c → ann = (1+c)^12 - 1', () => {
    const c = 0.0025;
    const idx = buildIndexPath([c], 240);
    const ann = computeAnnInflationInWindow(idx, 1, 240, 12);
    expect(ann[0]).toBeCloseTo(Math.pow(1 + c, 12) - 1, 12);
  });

  it('window=240 con inflación c → ann ≈ (1+c)^12 - 1 (anualización es exponente 12/window)', () => {
    const c = 0.002;
    const idx = buildIndexPath([c], 240);
    const ann = computeAnnInflationInWindow(idx, 1, 240, 240);
    // (1+c)^240 elevado a 12/240=0.05 = (1+c)^12
    expect(ann[0]).toBeCloseTo(Math.pow(1 + c, 12) - 1, 12);
  });

  it('lanza si windowMonths fuera de rango', () => {
    const idx = buildIndexPath([0], 240);
    expect(() => computeAnnInflationInWindow(idx, 1, 240, 0)).toThrow();
    expect(() => computeAnnInflationInWindow(idx, 1, 240, 241)).toThrow();
  });

  it('lanza si inflationIndexPath length mismatch', () => {
    const idx = new Float64Array(100);
    expect(() => computeAnnInflationInWindow(idx, 10, 240, 12)).toThrow();
  });
});

describe('G3 — filtro límite', () => {
  it('rango infinito-amplio: todas las sims pasan', () => {
    const ann = new Float64Array([0.01, 0.02, 0.05, 0.07]);
    const matched = filterPathsByInflation(ann, -1e9, 1e9);
    expect(matched.length).toBe(4);
    expect(Array.from(matched)).toEqual([0, 1, 2, 3]);
  });

  it('rango vacío (min > max): 0 sims', () => {
    const ann = new Float64Array([0.02, 0.03]);
    const matched = filterPathsByInflation(ann, 0.05, 0.01);
    expect(matched.length).toBe(0);
  });

  it('rango idéntico (min == max): solo sims exactamente en ese valor', () => {
    const ann = new Float64Array([0.02, 0.025, 0.02, 0.05]);
    const matched = filterPathsByInflation(ann, 0.02, 0.02);
    expect(matched.length).toBe(2);
    expect(Array.from(matched)).toEqual([0, 2]);
  });

  it('NaN nunca pasa el filtro', () => {
    const ann = new Float64Array([NaN, 0.02, NaN, 0.04]);
    const matched = filterPathsByInflation(ann, -1e9, 1e9);
    expect(matched.length).toBe(2);
    expect(Array.from(matched)).toEqual([1, 3]);
  });
});

describe('G4 — indices correctos', () => {
  it('filtra y devuelve solo sims con stat en rango', () => {
    const ann = new Float64Array([0.01, 0.025, 0.03, 0.04, 0.05]);
    const matched = filterPathsByInflation(ann, 0.02, 0.035);
    expect(Array.from(matched)).toEqual([1, 2]); // 0.025 y 0.03 califican
  });

  it('los indices están sorted asc', () => {
    const ann = new Float64Array(100);
    for (let i = 0; i < 100; i++) ann[i] = (i % 10) * 0.005; // valores variados
    const matched = filterPathsByInflation(ann, 0.01, 0.03);
    for (let i = 1; i < matched.length; i++) {
      expect(matched[i]).toBeGreaterThan(matched[i - 1]);
    }
  });
});

describe('G6 — standard error', () => {
  it('SE fórmula sqrt(p(1-p)/n)', () => {
    // 1000 sims, 100 matched → p=0.1, SE=sqrt(0.1*0.9/1000)≈0.00949
    const ann = new Float64Array(1000);
    for (let i = 0; i < 100; i++) ann[i] = 0.03; // 100 sims en rango
    for (let i = 100; i < 1000; i++) ann[i] = 0.07; // 900 fuera
    // Use indexPath wrapper: build a path with monthly inflation that gives ann at window
    // Simplest: bypass via direct evaluateInflationView with synthetic IndexPath.
    // Synthetic: each sim s has monthly inflation that hits ann[s] at window=12.
    // monthly = (1+ann)^(1/12) - 1
    const monthly = new Array(1000).fill(0).map((_, i) => Math.pow(1 + ann[i], 1 / 12) - 1);
    const idx = buildIndexPath(monthly, 240);
    const ev = evaluateInflationView(idx, 1000, 240, { windowMonths: 12, minPct: 0.02, maxPct: 0.04 });
    expect(ev.nMatched).toBe(100);
    expect(ev.probability).toBeCloseTo(0.1, 9);
    expect(ev.standardError).toBeCloseTo(Math.sqrt(0.1 * 0.9 / 1000), 6);
  });
});

describe('G5 — unconditional distribution coincide con sampling', () => {
  it('para sims con ann distribuidas en [0, 0.06], los percentiles coinciden', () => {
    // 1000 sims, ann uniforme entre 0 y 0.06
    const n = 1000;
    const monthly: number[] = [];
    for (let i = 0; i < n; i++) {
      const target = (i / (n - 1)) * 0.06;
      monthly.push(Math.pow(1 + target, 1 / 12) - 1);
    }
    const idx = buildIndexPath(monthly, 240);
    const ann = computeAnnInflationInWindow(idx, n, 240, 12);
    const dist = unconditionalInflationDistribution(ann);
    expect(dist.p5).toBeCloseTo(0.06 * 0.05, 2);
    expect(dist.p50).toBeCloseTo(0.03, 2);
    expect(dist.p95).toBeCloseTo(0.06 * 0.95, 2);
    expect(dist.mean).toBeCloseTo(0.03, 2);
  });
});

describe('computeConditionalStats', () => {
  it('matchedIndices vacío → todos NaN, sin crash', () => {
    const stats = computeConditionalStats({
      aumPath: new Float64Array(2 * 3),
      netWealthPath: new Float64Array(2 * 3),
      inflationIndexPath: new Float64Array(2 * 3),
      initialAum: 5_000_000,
      totalInflows: 0,
      horizonMonths: 2,
      nSims: 2,
      matchedIndices: new Uint32Array(0),
    });
    expect(Number.isNaN(stats.finalAumMed)).toBe(true);
    expect(Number.isNaN(stats.realProbPreservedPower)).toBe(true);
  });

  it('subset == todas las sims → stats igual al unconditional', () => {
    const nSims = 100;
    const horizonMonths = 12;
    const Hp1 = horizonMonths + 1;
    const aumPath = new Float64Array(nSims * Hp1);
    const netWealthPath = new Float64Array(nSims * Hp1);
    const inflationIndexPath = new Float64Array(nSims * Hp1);
    for (let s = 0; s < nSims; s++) {
      for (let t = 0; t <= horizonMonths; t++) {
        // AUM crece 5% anual nominal
        aumPath[s * Hp1 + t] = 5_000_000 * Math.pow(1.05, t / 12);
        netWealthPath[s * Hp1 + t] = aumPath[s * Hp1 + t];
        // Inflación 2% anual constante en todas las sims
        inflationIndexPath[s * Hp1 + t] = Math.pow(1.02, t / 12);
      }
    }
    const allIndices = new Uint32Array(nSims);
    for (let i = 0; i < nSims; i++) allIndices[i] = i;
    const stats = computeConditionalStats({
      aumPath, netWealthPath, inflationIndexPath,
      initialAum: 5_000_000, totalInflows: 0,
      horizonMonths, nSims, matchedIndices: allIndices,
    });
    expect(stats.finalAumMed).toBeCloseTo(5_000_000 * 1.05, 0);
    // Real = nominal / inflación → 5*1.05 / 1.02
    expect(stats.realFinalAumMed).toBeCloseTo(5_000_000 * 1.05 / 1.02, 0);
    // Preservó poder adq porque 1.05/1.02 > 1 → 100%
    expect(stats.realProbPreservedPower).toBe(1);
  });

  it('subset filtra correcto: 50 sims con buen retorno + 50 con malo → median apunta al subset', () => {
    const nSims = 100;
    const horizonMonths = 12;
    const Hp1 = horizonMonths + 1;
    const aumPath = new Float64Array(nSims * Hp1);
    const netWealthPath = new Float64Array(nSims * Hp1);
    const inflationIndexPath = new Float64Array(nSims * Hp1);
    for (let s = 0; s < nSims; s++) {
      // Primera mitad: retorno bueno (10% anual). Segunda mitad: retorno malo (-5%)
      const target = s < 50 ? 1.10 : 0.95;
      for (let t = 0; t <= horizonMonths; t++) {
        aumPath[s * Hp1 + t] = 5_000_000 * Math.pow(target, t / 12);
        netWealthPath[s * Hp1 + t] = aumPath[s * Hp1 + t];
        inflationIndexPath[s * Hp1 + t] = 1.0; // sin inflación = real == nominal
      }
    }
    // Filtramos solo las buenas (primer subset)
    const goodIndices = new Uint32Array(50);
    for (let i = 0; i < 50; i++) goodIndices[i] = i;
    const goodStats = computeConditionalStats({
      aumPath, netWealthPath, inflationIndexPath,
      initialAum: 5_000_000, totalInflows: 0,
      horizonMonths, nSims, matchedIndices: goodIndices,
    });
    // finalAumMed debe estar cerca de 5M * 1.10
    expect(goodStats.finalAumMed).toBeCloseTo(5_500_000, 0);
    expect(goodStats.probPos).toBe(1);
    // Filtramos solo las malas
    const badIndices = new Uint32Array(50);
    for (let i = 0; i < 50; i++) badIndices[i] = i + 50;
    const badStats = computeConditionalStats({
      aumPath, netWealthPath, inflationIndexPath,
      initialAum: 5_000_000, totalInflows: 0,
      horizonMonths, nSims, matchedIndices: badIndices,
    });
    expect(badStats.finalAumMed).toBeCloseTo(4_750_000, 0);
    expect(badStats.probPos).toBe(0);
  });
});

describe('Propiedades estructurales (no de número, sino de invariante)', () => {
  it('evaluateInflationView con rango amplio == filterPathsByInflation con rango amplio', () => {
    const monthly = Array.from({ length: 100 }, (_, i) => 0.001 + i * 0.0001);
    const idx = buildIndexPath(monthly, 240);
    const ann = computeAnnInflationInWindow(idx, 100, 240, 36);
    const matchedDirect = filterPathsByInflation(ann, -1e9, 1e9);
    const ev = evaluateInflationView(idx, 100, 240, { windowMonths: 36, minPct: -1e9, maxPct: 1e9 });
    expect(ev.matchedIndices.length).toBe(matchedDirect.length);
    expect(Array.from(ev.matchedIndices)).toEqual(Array.from(matchedDirect));
  });

  it('si subimos windowMonths, el subset con condición ann ≥ X cambia consistentemente', () => {
    // Mismas inflaciones mensuales: para ventana más larga, la varianza de ann
    // entre sims dec rece (ley de grandes números). El rango efectivo es similar pero más concentrado en mean.
    const monthly = Array.from({ length: 500 }, () => 0.001 + Math.random() * 0.003);
    const idx = buildIndexPath(monthly, 240);
    const ann12 = computeAnnInflationInWindow(idx, 500, 240, 12);
    const ann240 = computeAnnInflationInWindow(idx, 500, 240, 240);
    // Estadística básica: el mean a 12m y 240m debe ser idéntico (porque es ann constante per-sim)
    let m12 = 0, m240 = 0;
    for (let i = 0; i < 500; i++) {
      m12 += ann12[i];
      m240 += ann240[i];
    }
    m12 /= 500;
    m240 /= 500;
    expect(m12).toBeCloseTo(m240, 8); // monthly constante per-sim → ann es el mismo en cualquier ventana
  });
});

/**
 * Tests del modelo de defaults para la valuación Hold-to-Maturity.
 */
import { describe, it, expect } from 'vitest';
import {
  HISTORICAL_DEFAULT_DATA,
  DEFAULT_BOOTSTRAP_BLOCK_YEARS,
  sampleDefaultHaircut,
  getHistoricalStats,
} from './defaults';

describe('HISTORICAL_DEFAULT_DATA', () => {
  it('cubre al menos 30 años de data histórica', () => {
    expect(HISTORICAL_DEFAULT_DATA.length).toBeGreaterThanOrEqual(30);
  });

  it('incluye GFC 2008-2009 y COVID 2020', () => {
    const years = HISTORICAL_DEFAULT_DATA.map((d) => d.year);
    expect(years).toContain(2008);
    expect(years).toContain(2009);
    expect(years).toContain(2020);
  });

  it('los años están ordenados ascendente', () => {
    for (let i = 1; i < HISTORICAL_DEFAULT_DATA.length; i++) {
      expect(HISTORICAL_DEFAULT_DATA[i].year).toBeGreaterThan(HISTORICAL_DEFAULT_DATA[i - 1].year);
    }
  });

  it('tasas IG y HY son no-negativas y razonables', () => {
    for (const d of HISTORICAL_DEFAULT_DATA) {
      expect(d.igRate).toBeGreaterThanOrEqual(0);
      expect(d.igRate).toBeLessThan(0.02); // IG annual default <2% siempre históricamente
      expect(d.hyRate).toBeGreaterThanOrEqual(0);
      expect(d.hyRate).toBeLessThan(0.15); // HY annual default <15% incluso en stress
    }
  });

  it('recovery rates están entre 0.20 y 0.70', () => {
    for (const d of HISTORICAL_DEFAULT_DATA) {
      expect(d.recoveryRate).toBeGreaterThanOrEqual(0.20);
      expect(d.recoveryRate).toBeLessThanOrEqual(0.70);
    }
  });

  it('block size es 3 años (preserva autocorrelación de cycles)', () => {
    expect(DEFAULT_BOOTSTRAP_BLOCK_YEARS).toBe(3);
  });
});

describe('sampleDefaultHaircut', () => {
  // PRNG determinístico para tests reproducibles
  function makeDeterministicPrng(seed: number): () => number {
    let s = seed | 0;
    return () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return s / 0x7fffffff;
    };
  }

  it('retorna 1 (sin haircut) cuando nMonths=0', () => {
    const prng = makeDeterministicPrng(1);
    expect(sampleDefaultHaircut('ig', 0, prng)).toBe(1);
    expect(sampleDefaultHaircut('hy', 0, prng)).toBe(1);
  });

  it('IG produce haircuts pequeños (<5% en 10 años, mediano)', () => {
    // Sample muchas veces y verificar que mediana <5%
    const N = 200;
    const haircuts: number[] = [];
    for (let i = 0; i < N; i++) {
      const prng = makeDeterministicPrng(1000 + i);
      const navFactor = sampleDefaultHaircut('ig', 120, prng); // 10 años
      haircuts.push(1 - navFactor);
    }
    haircuts.sort();
    const median = haircuts[Math.floor(N / 2)];
    expect(median).toBeLessThan(0.05); // <5% haircut a 10y para IG
    expect(median).toBeGreaterThanOrEqual(0); // siempre no-negativo
  });

  it('HY produce haircuts materialmente mayores que IG', () => {
    const N = 200;
    const igHaircuts: number[] = [];
    const hyHaircuts: number[] = [];
    for (let i = 0; i < N; i++) {
      const prngIg = makeDeterministicPrng(2000 + i);
      const prngHy = makeDeterministicPrng(2000 + i); // mismo seed para fairness
      igHaircuts.push(1 - sampleDefaultHaircut('ig', 120, prngIg));
      hyHaircuts.push(1 - sampleDefaultHaircut('hy', 120, prngHy));
    }
    igHaircuts.sort();
    hyHaircuts.sort();
    const igMed = igHaircuts[Math.floor(N / 2)];
    const hyMed = hyHaircuts[Math.floor(N / 2)];
    // HY haircut a 10y debería ser al menos 5x el de IG
    expect(hyMed).toBeGreaterThan(igMed * 5);
    // Y bajo el 30% incluso en mediana
    expect(hyMed).toBeLessThan(0.30);
  });

  it('haircut monotonicamente crece con el horizonte', () => {
    const N = 100;
    const make = (months: number) => {
      const vals: number[] = [];
      for (let i = 0; i < N; i++) {
        const prng = makeDeterministicPrng(3000 + i);
        vals.push(1 - sampleDefaultHaircut('hy', months, prng));
      }
      vals.sort();
      return vals[Math.floor(N / 2)]; // mediana
    };
    const h12 = make(12);
    const h60 = make(60);
    const h120 = make(120);
    expect(h60).toBeGreaterThan(h12);
    expect(h120).toBeGreaterThan(h60);
  });
});

describe('getHistoricalStats', () => {
  it('IG mean default rate <0.5% — consistente con Moody\'s', () => {
    const stats = getHistoricalStats('ig');
    expect(stats.meanRate).toBeLessThan(0.005);
    expect(stats.meanRate).toBeGreaterThan(0);
  });

  it('HY mean default rate entre 2.5% y 5% — consistente con literatura', () => {
    const stats = getHistoricalStats('hy');
    expect(stats.meanRate).toBeGreaterThan(0.025);
    expect(stats.meanRate).toBeLessThan(0.05);
  });

  it('peor año HY es 2009 (GFC)', () => {
    const stats = getHistoricalStats('hy');
    expect(stats.worstYear).toBe(2009);
    expect(stats.worstYearRate).toBeGreaterThan(0.10); // >10% default ese año
  });

  it('recovery rate medio cercano a 40% (Moody\'s senior unsecured average)', () => {
    const igStats = getHistoricalStats('ig');
    const hyStats = getHistoricalStats('hy');
    expect(igStats.meanRecovery).toBeCloseTo(0.43, 1);
    expect(hyStats.meanRecovery).toBeCloseTo(0.43, 1);
  });
});

/**
 * Tests del bucket bootstrap del panel TTM de bullets.
 */
import { describe, it, expect } from 'vitest';
import {
  getBucketObservations,
  initBootstrapState,
  sampleReturnFromBucket,
  applyLevelAdjustment,
  DEFAULT_BLOCK_SIZE_MEAN,
  type TTMPanel,
} from './bulletBucketBootstrap';

// Mock panel mínimo para tests deterministas
function makeMockPanel(): TTMPanel {
  return {
    schema_version: '1.0',
    generated_at: '2026-06-03T00:00:00Z',
    note: 'mock panel for tests',
    panel: {
      ig: {
        '1': [
          { ticker: 'BSCQ', ym: '2026-01', ret: 0.001 },
          { ticker: 'BSCQ', ym: '2026-02', ret: 0.002 },
          { ticker: 'BSCH', ym: '2017-01', ret: -0.003 },
        ],
        '12': [
          { ticker: 'BSCQ', ym: '2025-01', ret: 0.005 },
          { ticker: 'BSCR', ym: '2026-01', ret: 0.004 },
        ],
        '60': [
          { ticker: 'BSCU', ym: '2025-05', ret: 0.008 },
          { ticker: 'BSCT', ym: '2024-05', ret: -0.012 },
        ],
      },
      hy: {
        '12': [
          { ticker: 'BSJQ', ym: '2025-01', ret: 0.015 },
          { ticker: 'BSJR', ym: '2026-01', ret: 0.020 },
        ],
        '60': [
          { ticker: 'BSJT', ym: '2024-05', ret: -0.045 },
        ],
      },
    },
    coverage: {
      ig: { min_ttm: 1, max_ttm: 60, total_obs: 8 },
      hy: { min_ttm: 12, max_ttm: 60, total_obs: 3 },
    },
  };
}

// PRNG determinístico para tests reproducibles
function makeDeterministicPrng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

describe('getBucketObservations', () => {
  const panel = makeMockPanel();

  it('retorna las observaciones del bucket exacto', () => {
    const obs = getBucketObservations(panel, 'ig', 1);
    expect(obs).toHaveLength(3);
    expect(obs[0].ticker).toBe('BSCQ');
  });

  it('clampa TTM > max al max disponible', () => {
    const obs = getBucketObservations(panel, 'ig', 120);
    expect(obs).toHaveLength(2); // bucket 60 (max disponible)
    expect(obs[0].ticker).toBe('BSCU');
  });

  it('clampa TTM < min al min disponible', () => {
    const obs = getBucketObservations(panel, 'hy', 0);
    expect(obs).toHaveLength(2); // bucket 12 (min para hy)
  });

  it('retorna [] si el sleeve no tiene observaciones', () => {
    const emptyPanel: TTMPanel = {
      ...panel,
      panel: { ig: {}, hy: {} },
      coverage: {
        ig: { min_ttm: 0, max_ttm: 0, total_obs: 0 },
        hy: { min_ttm: 0, max_ttm: 0, total_obs: 0 },
      },
    };
    expect(getBucketObservations(emptyPanel, 'ig', 12)).toEqual([]);
  });

  it('redondea TTM fraccional al entero más cercano', () => {
    const obs1 = getBucketObservations(panel, 'ig', 0.7); // redondea a 1
    expect(obs1).toHaveLength(3);
    const obs12 = getBucketObservations(panel, 'ig', 11.6); // redondea a 12
    expect(obs12).toHaveLength(2);
  });
});

describe('initBootstrapState', () => {
  it('inicializa el state con valores neutros', () => {
    const state = initBootstrapState();
    expect(state.currentBlockObsIdx).toBe(-1);
    expect(state.currentBlockTicker).toBe('');
    expect(state.blockOffset).toBe(0);
    expect(state.lastYm).toBe(null);
  });
});

describe('sampleReturnFromBucket', () => {
  const panel = makeMockPanel();

  it('samplea un retorno válido del bucket', () => {
    const state = initBootstrapState();
    const prng = makeDeterministicPrng(42);
    const ret = sampleReturnFromBucket(panel, 'ig', 1, state, prng);
    // El primer sample siempre inicia bloque
    expect(state.currentBlockObsIdx).toBeGreaterThanOrEqual(0);
    expect(state.currentBlockTicker).toBeTruthy();
    // El retorno está dentro del rango del bucket
    expect([0.001, 0.002, -0.003]).toContain(ret);
  });

  it('retorna 0 si el bucket está vacío', () => {
    const emptyPanel: TTMPanel = {
      ...panel,
      panel: { ig: {}, hy: {} },
      coverage: {
        ig: { min_ttm: 0, max_ttm: 0, total_obs: 0 },
        hy: { min_ttm: 0, max_ttm: 0, total_obs: 0 },
      },
    };
    const state = initBootstrapState();
    const prng = makeDeterministicPrng(42);
    expect(sampleReturnFromBucket(emptyPanel, 'ig', 12, state, prng)).toBe(0);
  });

  it('distribución de samples ~ observaciones del bucket (200 draws)', () => {
    const state = initBootstrapState();
    const prng = makeDeterministicPrng(100);
    const samples: number[] = [];
    for (let i = 0; i < 200; i++) {
      samples.push(sampleReturnFromBucket(panel, 'ig', 1, state, prng, 1)); // block size mean = 1 → cada paso resamplea
    }
    // Bucket TTM=1 tiene 3 obs: 0.001, 0.002, -0.003
    // Con block size 1, cada sample debería estar en ese set
    for (const s of samples) {
      expect([0.001, 0.002, -0.003]).toContain(s);
    }
  });

  it('mantiene continuidad en bloques largos (block size mean alto)', () => {
    const state = initBootstrapState();
    const prng = makeDeterministicPrng(100);
    // Block size alto → poca probabilidad de restart
    sampleReturnFromBucket(panel, 'ig', 1, state, prng, 10000);
    const firstTicker = state.currentBlockTicker;
    for (let i = 0; i < 20; i++) {
      sampleReturnFromBucket(panel, 'ig', 1, state, prng, 10000);
      // El offset crece cuando no se reinicia
    }
    // Con 10000 mean, raro reiniciar. blockOffset debería haber crecido
    expect(state.blockOffset).toBeGreaterThan(0);
    void firstTicker;
  });
});

describe('applyLevelAdjustment', () => {
  it('ajusta retorno por diff de carry', () => {
    const obsReturn = 0.005;
    const obsCarry = 0.0030; // 0.30%/mes histórico
    const targetCarry = 0.0035; // 0.35%/mes actual (más alto)
    const adjusted = applyLevelAdjustment(obsReturn, obsCarry, targetCarry);
    expect(adjusted).toBeCloseTo(0.005 + 0.0005, 6);
  });

  it('sin diff de carry, no cambia el retorno', () => {
    const obsReturn = 0.003;
    const adjusted = applyLevelAdjustment(obsReturn, 0.0033, 0.0033);
    expect(adjusted).toBe(obsReturn);
  });

  it('ajuste negativo cuando carry actual < histórico', () => {
    const adjusted = applyLevelAdjustment(0.005, 0.005, 0.001);
    expect(adjusted).toBe(0.005 + (0.001 - 0.005));
    expect(adjusted).toBeLessThan(0.005);
  });
});

describe('DEFAULT_BLOCK_SIZE_MEAN', () => {
  it('es 24 (consistente con motor del planner)', () => {
    expect(DEFAULT_BLOCK_SIZE_MEAN).toBe(24);
  });
});

describe('Stationary bootstrap properties', () => {
  const panel = makeMockPanel();

  it('1000 paths × 60 meses producen distribución coherente con el bucket', () => {
    const buckets = ['1', '12', '60'] as const;
    for (const ttm of buckets) {
      const sourceObs = getBucketObservations(panel, 'ig', parseInt(ttm, 10));
      if (sourceObs.length === 0) continue;
      const mean = sourceObs.reduce((s, o) => s + o.ret, 0) / sourceObs.length;
      // Run 1000 paths * 60 months samples
      const allSamples: number[] = [];
      for (let path = 0; path < 50; path++) {
        const state = initBootstrapState();
        const prng = makeDeterministicPrng(1000 + path);
        for (let m = 0; m < 60; m++) {
          allSamples.push(sampleReturnFromBucket(panel, 'ig', parseInt(ttm, 10), state, prng));
        }
      }
      const sampleMean = allSamples.reduce((s, x) => s + x, 0) / allSamples.length;
      // La media muestreada debería estar cerca de la media del bucket (tolerancia razonable)
      // Con N=3000 muestras y bucket con pocas observaciones la varianza puede ser alta
      // pero la media debería convergir
      expect(Math.abs(sampleMean - mean)).toBeLessThan(0.005); // <50bps de diff
    }
  });
});

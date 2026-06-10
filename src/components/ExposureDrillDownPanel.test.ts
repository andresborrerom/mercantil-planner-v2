/**
 * Tests para la agregación de exposición.
 *
 * Cubre:
 *   - expandConfigToPositions: el TBSC default expande a las posiciones esperadas
 *   - aggregateGeo: ponderación correcta cuando hay mezcla US / DM-ex-US
 *   - aggregateSectors: suma de % por sector across múltiples ETFs
 *   - aggregateCredit: mapeo 'N/A' del data layer → 'Equity' en el output
 *   - Unclassified bucket cuando un ETF no tiene data (CAPE en equityMix)
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_CASE_CONFIG, type CaseStudyConfig } from '../state/caseStudyStore';
import {
  expandConfigToPositions,
  aggregateGeo,
  aggregateSectors,
  aggregateCredit,
} from './ExposureDrillDownPanel';

describe('expandConfigToPositions', () => {
  it('default TBSC: 65% bullets (iBonds IG) + 30% equity (USMV+SCHD) + 5% BIL', () => {
    const positions = expandConfigToPositions(DEFAULT_CASE_CONFIG);
    expect(positions).toHaveLength(4); // IBDS, USMV, SCHD, BIL
    const totalW = positions.reduce((s, p) => s + p.weight, 0);
    expect(totalW).toBeCloseTo(1.0, 9);

    const bullets = positions.find((p) => p.sleeve === 'Bullets')!;
    expect(bullets.exposureTicker).toBe('IBDS');
    expect(bullets.weight).toBeCloseTo(0.65, 9);

    const equityPositions = positions.filter((p) => p.sleeve === 'Equity');
    expect(equityPositions).toHaveLength(2);
    const usmv = equityPositions.find((p) => p.exposureTicker === 'USMV')!;
    const schd = equityPositions.find((p) => p.exposureTicker === 'SCHD')!;
    expect(usmv.weight).toBeCloseTo(0.15, 9); // 30% * 50%
    expect(schd.weight).toBeCloseTo(0.15, 9);

    const cash = positions.find((p) => p.sleeve === 'Cash')!;
    expect(cash.exposureTicker).toBe('BIL');
    expect(cash.weight).toBeCloseTo(0.05, 9);
  });

  it('real assets sleeve aparece cuando realAssetsPct > 0', () => {
    const config: CaseStudyConfig = {
      ...DEFAULT_CASE_CONFIG,
      bulletTotalPct: 0.50,
      equityPct: 0.30,
      cashPct: 0.05,
      realAssetsPct: 0.15,
    };
    const positions = expandConfigToPositions(config);
    const realAssets = positions.filter((p) => p.sleeve === 'RealAssets');
    expect(realAssets).toHaveLength(4); // INFL + RWO + IEI + IXC
    const realTotal = realAssets.reduce((s, p) => s + p.weight, 0);
    expect(realTotal).toBeCloseTo(0.15, 9);
  });

  it('bulletMix con iBonds-HY y GHYG agrega entries adicionales en Bullets', () => {
    const config: CaseStudyConfig = {
      ...DEFAULT_CASE_CONFIG,
      bulletMix: [
        { ticker: 'iBonds', weight: 0.5 },
        { ticker: 'iBonds-HY', weight: 0.3 },
        { ticker: 'GHYG', weight: 0.2 },
      ],
    };
    const positions = expandConfigToPositions(config);
    const bullets = positions.filter((p) => p.sleeve === 'Bullets');
    expect(bullets).toHaveLength(3);
    const tickers = bullets.map((p) => p.exposureTicker).sort();
    expect(tickers).toEqual(['GHYG', 'HYG', 'IBDS']);
    // 65% bulletTotalPct × pesos normalizados de mix
    const ig = bullets.find((p) => p.exposureTicker === 'IBDS')!;
    expect(ig.weight).toBeCloseTo(0.65 * 0.5, 9);
  });
});

describe('aggregateGeo', () => {
  it('TBSC default: 100% US (iBonds IG, USMV, SCHD, BIL todos US)', () => {
    const positions = expandConfigToPositions(DEFAULT_CASE_CONFIG);
    const { buckets, unclassified } = aggregateGeo(positions);
    expect(unclassified).toBeCloseTo(0, 9);
    expect(buckets['US']).toBeCloseTo(1.0, 2); // tolerancia 1% por sub-3% no-US del fondo en SCHD/USMV
  });

  it('config con ACWI en equity mix → exposición DM-ex-US y EM aparece', () => {
    const config: CaseStudyConfig = {
      ...DEFAULT_CASE_CONFIG,
      equityMix: [{ ticker: 'ACWI', weight: 1 }],
    };
    const positions = expandConfigToPositions(config);
    const { buckets } = aggregateGeo(positions);
    // ACWI tiene ~60% US, ~30% DM-ex-US, ~10% EM
    // Sleeve equity = 30%, así que la contribución no-US del portafolio total es relevante
    expect(buckets['DM-ex-US']).toBeGreaterThan(0.05);
    expect(buckets['EM']).toBeGreaterThan(0.0);
  });
});

describe('aggregateSectors', () => {
  it('TBSC default: suma de pesos sectoriales = 1 (sin unclassified)', () => {
    const positions = expandConfigToPositions(DEFAULT_CASE_CONFIG);
    const { buckets, unclassified } = aggregateSectors(positions);
    const total = Object.values(buckets).reduce((s, v) => s + v, 0) + unclassified;
    expect(total).toBeCloseTo(1.0, 3);
    expect(unclassified).toBeCloseTo(0, 3); // todos los ETFs default tienen sectors data
  });

  it('TBSC default: Government Treasury ≥ 5% (de BIL)', () => {
    const positions = expandConfigToPositions(DEFAULT_CASE_CONFIG);
    const { buckets } = aggregateSectors(positions);
    expect(buckets['Government Treasury']).toBeGreaterThanOrEqual(0.05);
  });

  it('Financial Services aparece en TBSC default (vía iBoxx IG ~28%)', () => {
    const positions = expandConfigToPositions(DEFAULT_CASE_CONFIG);
    const { buckets } = aggregateSectors(positions);
    // 65% bullets × 28% Financial Services = 18.2%, + equity contribution
    expect(buckets['Financial Services']).toBeGreaterThanOrEqual(0.15);
  });
});

describe('aggregateCredit', () => {
  it('TBSC default: 65% IG + 30% Equity + 5% Treasury', () => {
    const positions = expandConfigToPositions(DEFAULT_CASE_CONFIG);
    const { buckets } = aggregateCredit(positions);
    expect(buckets['IG']).toBeCloseTo(0.65, 9);
    expect(buckets['Equity']).toBeCloseTo(0.30, 9);
    expect(buckets['Treasury']).toBeCloseTo(0.05, 9);
    expect(buckets['HY']).toBeCloseTo(0, 9);
  });

  it('config con GHYG y iBonds-HY: HY aparece', () => {
    const config: CaseStudyConfig = {
      ...DEFAULT_CASE_CONFIG,
      bulletMix: [
        { ticker: 'iBonds', weight: 0.5 },
        { ticker: 'iBonds-HY', weight: 0.3 },
        { ticker: 'GHYG', weight: 0.2 },
      ],
    };
    const positions = expandConfigToPositions(config);
    const { buckets } = aggregateCredit(positions);
    // 65% bullets × (30% HY iBonds + 20% GHYG) = 32.5% HY
    expect(buckets['HY']).toBeCloseTo(0.65 * 0.5, 9);
    expect(buckets['IG']).toBeCloseTo(0.65 * 0.5, 9);
  });
});

describe('Unclassified handling', () => {
  it('config con CAPE en equityMix: parte de equity cae en unclassified de geo/sectors', () => {
    const config: CaseStudyConfig = {
      ...DEFAULT_CASE_CONFIG,
      equityMix: [
        { ticker: 'USMV', weight: 0.5 },
        { ticker: 'CAPE', weight: 0.5 },
      ],
    };
    const positions = expandConfigToPositions(config);
    const geoAgg = aggregateGeo(positions);
    const sectorsAgg = aggregateSectors(positions);
    // CAPE = 30% equityPct × 50% mix = 15% del AUM, sin geo/sectors
    expect(geoAgg.unclassified).toBeCloseTo(0.15, 3);
    expect(sectorsAgg.unclassified).toBeCloseTo(0.15, 3);
  });
});

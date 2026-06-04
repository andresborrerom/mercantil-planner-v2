/**
 * Benchmark del worker para distintos nSims × horizonMonths.
 * Mide tiempo real (no extrapolación) en el motor actual (post PR #19).
 * Sirve para fijar default nSims con datos reales, no intuición.
 */
import { DEFAULT_BOOTSTRAP_CONFIG, getYieldBounds, runBootstrap } from '../src/domain/bootstrap';
import { defaultBulletLineup } from '../src/domain/bullets';
import { buildArenaMarket, runArena, type ArenaConfig } from '../src/domain/arena';
import type { Ticker } from '../src/data/market.generated';
import type { ExpandedPortfolio } from '../src/domain/types';

const dummy: ExpandedPortfolio = { etfs: { BIL: 100 }, fixed: { FIXED6: 0, FIXED9: 0 }, totalWeight: 100 };

function runOnce(nSims: number, hMonths: number): { totalMs: number; bootMs: number; arenaMs: number } {
  const tBoot0 = performance.now();
  const boot = runBootstrap({
    portfolios: { A: dummy, B: dummy }, horizonMonths: hMonths,
    config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: nSims, seed: 42 },
    outputYieldPaths: true, outputEtfReturns: true, outputInflationPaths: true,
  });
  const tBoot1 = performance.now();
  const realBullets = defaultBulletLineup(new Date(2026, 4, 7));
  const initCurve: [number,number,number,number] = [
    getYieldBounds('IRX').initial, getYieldBounds('FVX').initial,
    getYieldBounds('TNX').initial, getYieldBounds('TYX').initial,
  ];
  const equityMix = [{ ticker: 'USMV' as Ticker, weight: 0.5 }, { ticker: 'SCHD' as Ticker, weight: 0.5 }];
  const market = buildArenaMarket({
    realBullets, nExtensions: 25, extensionSpacingY: 1.0, equityMix,
    cashTicker: 'BIL' as Ticker, initialSpread: 0.011, initialCurve: initCurve,
    nSims, horizonMonths: hMonths, yieldPaths: boot.yieldPaths!, etfReturns: boot.etfReturns!,
  });
  const cfg: ArenaConfig = {
    rolloverPlan: {
      bullets: realBullets, bulletTotalPct: 0.65, equityPct: 0.30, cashPct: 0.05,
      eqtyMin: 0.10, eqtyMax: 0.50, equityMix, cashTicker: 'BIL' as Ticker, initialSpread: 0.011,
    },
    loanEvent: null, inflowBaseAnnual: 250_000, inflowGrowth: 0, initialAumUsd: 5_000_000,
    nExtensions: 25, extensionSpacingY: 1.0, cashBandUpper: 0.05, rolloverEnabled: true,
  };
  const tArena0 = performance.now();
  runArena(cfg, market);
  const tArena1 = performance.now();
  return { totalMs: tArena1 - tBoot0, bootMs: tBoot1 - tBoot0, arenaMs: tArena1 - tArena0 };
}

// Medición real: corremos cada config 2 veces, tomamos el min (warmup descartado)
function bench(nSims: number, hMonths: number): { totalMs: number; bootMs: number; arenaMs: number } {
  runOnce(nSims, hMonths); // warmup
  const r1 = runOnce(nSims, hMonths);
  const r2 = runOnce(nSims, hMonths);
  return r1.totalMs < r2.totalMs ? r1 : r2;
}

console.log('nSims | hMonths | Total (s) | Boot (s) | Arena (s) | Notas estabilidad');
console.log('------|---------|-----------|----------|-----------|------------------');
const configs = [
  [500, 240],
  [1000, 240],
  [2000, 240],
  [5000, 240],
  [10000, 240],
];
for (const [n, h] of configs) {
  const r = bench(n, h);
  const SEp95 = Math.sqrt(0.05 * 0.95 / n);
  console.log(`${n.toString().padStart(5)} | ${h.toString().padStart(7)} | ${(r.totalMs / 1000).toFixed(2).padStart(9)} | ${(r.bootMs / 1000).toFixed(2).padStart(8)} | ${(r.arenaMs / 1000).toFixed(2).padStart(9)} | SE(p95)~${SEp95.toFixed(3)}`);
}

/**
 * run-tbsc.ts — Reproduce el caso TBSC desde v2 y compara contra Python.
 *
 * Replica `code/run_loan_scenarios.py` del repo estudios-a-la-medida:
 *   - 5M AUM endowment, 120 meses (10y), 300 sims, seed 42
 *   - $250k/yr inflow, sin growth
 *   - Ladder iBonds 2026-2034 + 2 sintéticos (defaultBulletLineup)
 *   - Equity mix: 50% USMV + 50% SCHD. Cash: BIL
 *   - 65/30/5 plan, eqty_min 10%, eqty_max 50%
 *   - Rollover táctico A/B/C (DEFAULT_ROLLOVER_THRESHOLDS)
 *   - 3 escenarios: NoLoan, LoanConservative (10% mes 60, 36m), LoanMax (30% mes 36, 36m)
 *
 * Diferencias conocidas con Python (NO bit-exact):
 *   - Block sampling: Python usa block_min=6, block_max=24 random; v2 usa fixed 12.
 *   - Spread bullets: Python sample de distribución IG (~110bp media); v2 usa scalar 0.011.
 *   - PRNG: Python numpy default_rng vs v2 mulberry32.
 *
 * Esperamos:
 *   - Medianas (ann_med, final_aum_med) dentro de ~5% de Python.
 *   - Percentiles p5/p95 dentro de ~10%.
 *   - Regime breakdown A/B/C: cualitativamente similar (B dominante en TNX bajo).
 */
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DEFAULT_BOOTSTRAP_CONFIG, getYieldBounds, runBootstrap } from '../src/domain/bootstrap';
import { defaultBulletLineup } from '../src/domain/bullets';
import { makeLoanEvent, type LoanEvent } from '../src/domain/cashflow';
import {
  buildArenaMarket,
  runArena,
  type ArenaConfig,
} from '../src/domain/arena';
import type { Ticker } from '../src/data/market.generated';
import type { ExpandedPortfolio } from '../src/domain/types';

// =====================================================================
// CONFIG (matchea code/run_loan_scenarios.py)
// =====================================================================

const INITIAL_AUM = 5_000_000;
const N_MONTHS = 120;
const N_SIMS = 300;
const SEED = 42;
const INFLOW = 250_000;
const INITIAL_SPREAD = 0.011; // 110 bp (media histórica IG corp)

type ScenarioName = 'NoLoan' | 'LoanConservative' | 'LoanMax';

const SCENARIOS: { name: ScenarioName; loan: LoanEvent | null }[] = [
  { name: 'NoLoan', loan: null },
  {
    name: 'LoanConservative',
    loan: makeLoanEvent({ triggerMonth: 60, amountPctAum: 0.10, termMonths: 36 }),
  },
  {
    name: 'LoanMax',
    loan: makeLoanEvent({ triggerMonth: 36, amountPctAum: 0.30, termMonths: 36 }),
  },
];

// =====================================================================
// EJECUCIÓN
// =====================================================================

function pct(sorted: Float64Array, p: number): number {
  return sorted[Math.floor(p * (sorted.length - 1))];
}

function median(arr: ArrayLike<number>): number {
  const a = Float64Array.from(arr as Float64Array);
  a.sort();
  return pct(a, 0.5);
}

function runScenario(name: ScenarioName, loan: LoanEvent | null) {
  console.log(`\n[${name}] Corriendo...`);
  const t0 = Date.now();

  // Step 1: runBootstrap para obtener yieldPaths + etfReturns.
  // Portafolio dummy (100% BIL) — no usamos portfolioReturnsA/B.
  const dummyPortfolio: ExpandedPortfolio = {
    etfs: { BIL: 100 },
    fixed: { FIXED6: 0, FIXED9: 0 },
    totalWeight: 100,
  };
  const boot = runBootstrap({
    portfolios: { A: dummyPortfolio, B: dummyPortfolio },
    horizonMonths: N_MONTHS,
    config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: N_SIMS, seed: SEED },
    outputYieldPaths: true,
    outputEtfReturns: true,
  });

  // Step 2: Construir ArenaMarket
  const realBullets = defaultBulletLineup(new Date(2026, 4, 7));
  const initialCurve: [number, number, number, number] = [
    getYieldBounds('IRX').initial,
    getYieldBounds('FVX').initial,
    getYieldBounds('TNX').initial,
    getYieldBounds('TYX').initial,
  ];
  const equityMix = [
    { ticker: 'USMV' as Ticker, weight: 0.5 },
    { ticker: 'SCHD' as Ticker, weight: 0.5 },
  ];
  const market = buildArenaMarket({
    realBullets,
    nExtensions: 25,
    extensionSpacingY: 1.0,
    equityMix,
    cashTicker: 'BIL' as Ticker,
    initialSpread: INITIAL_SPREAD,
    initialCurve,
    nSims: N_SIMS,
    horizonMonths: N_MONTHS,
    yieldPaths: boot.yieldPaths!,
    etfReturns: boot.etfReturns!,
  });

  // Step 3: runArena
  const config: ArenaConfig = {
    rolloverPlan: {
      bullets: realBullets,
      bulletTotalPct: 0.65,
      equityPct: 0.30,
      cashPct: 0.05,
      eqtyMin: 0.10,
      eqtyMax: 0.50,
      equityMix,
      cashTicker: 'BIL' as Ticker,
      initialSpread: INITIAL_SPREAD,
    },
    loanEvent: loan,
    inflowBaseAnnual: INFLOW,
    inflowGrowth: 0,
    initialAumUsd: INITIAL_AUM,
    nExtensions: 25,
    extensionSpacingY: 1.0,
    cashBandUpper: 0.05,
    rolloverEnabled: true,
  };
  const out = runArena(config, market);

  // Stats
  const finalAums = new Float64Array(N_SIMS);
  for (let s = 0; s < N_SIMS; s++) {
    finalAums[s] = out.aumPath[s * (N_MONTHS + 1) + N_MONTHS];
  }
  const finalAumsSorted = Float64Array.from(finalAums);
  finalAumsSorted.sort();

  const elapsed = Date.now() - t0;
  console.log(`  done in ${elapsed}ms`);

  const totalEvents = out.regimeCounts.A + out.regimeCounts.B + out.regimeCounts.C;
  return {
    name,
    config: {
      loan_event: loan === null ? null : {
        trigger_month: loan.triggerMonth,
        amount_pct_aum: loan.amountPctAum,
        term_months: loan.termMonths,
      },
    },
    metrics: {
      ann_med: out.stats.annNetMed,
      ann_p5: out.stats.annNetP5,
      ann_p95: out.stats.annNetP95,
      net_return_med: out.stats.netReturnMed,
      net_return_p5: out.stats.netReturnP5,
      net_return_p95: out.stats.netReturnP95,
      prob_pos: out.stats.probPos,
      final_aum_med: out.stats.finalAumMed,
      final_aum_p5: pct(finalAumsSorted, 0.05),
      final_aum_p95: pct(finalAumsSorted, 0.95),
      n_rollover_events: totalEvents,
      regime_pct_A: totalEvents > 0 ? out.regimeCounts.A / totalEvents : 0,
      regime_pct_B: totalEvents > 0 ? out.regimeCounts.B / totalEvents : 0,
      regime_pct_C: totalEvents > 0 ? out.regimeCounts.C / totalEvents : 0,
      loan_interest_med: out.stats.loanCumInterestMed,
      forced_equity_med: out.stats.forcedEquityMed,
      forced_bullet_med: out.stats.forcedBulletMed,
      loan_shortfall_med: out.stats.loanShortfallMed,
    },
  };
}

// =====================================================================
// MAIN
// =====================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));

console.log('='.repeat(70));
console.log('TBSC case — v2 (arena.ts) vs Python (arena_extended.py)');
console.log('='.repeat(70));
console.log(`Config: AUM=$${INITIAL_AUM.toLocaleString()}, ${N_MONTHS}m, ${N_SIMS} sims, seed=${SEED}`);
console.log(`        inflow=$${INFLOW.toLocaleString()}/yr, ladder iBonds 2026-2034 + sintéticos`);

const results: Record<string, unknown> = {};
for (const { name, loan } of SCENARIOS) {
  results[name] = runScenario(name, loan);
}

// Load Python reference para comparación
const pyPath = resolve(__dirname, '../../ESTUDIOS A LA MEDIDA/outputs/loan_scenarios.json');
let pyRef: Record<string, { metrics: Record<string, number> }> | null = null;
try {
  const pyDoc = JSON.parse(readFileSync(pyPath, 'utf-8'));
  pyRef = pyDoc.scenarios;
} catch (e) {
  console.warn(`\nWARN: no se pudo cargar Python reference (${pyPath}): ${(e as Error).message}`);
}

// Print tabla comparativa
console.log('\n' + '='.repeat(70));
console.log('COMPARACIÓN v2 vs Python (referencia loan_scenarios.json)');
console.log('='.repeat(70));

const headers = ['Scenario', 'ann_med', 'ann_p5', 'ann_p95', 'final_med ($M)', 'prob_pos'];
console.log(headers.map((h) => h.padEnd(16)).join(''));

for (const { name } of SCENARIOS) {
  const v2 = (results[name] as { metrics: Record<string, number> }).metrics;
  console.log(`\n${name}`);
  const v2Row = [
    '  v2',
    `${(v2.ann_med * 100).toFixed(2)}%`,
    `${(v2.ann_p5 * 100).toFixed(2)}%`,
    `${(v2.ann_p95 * 100).toFixed(2)}%`,
    `$${(v2.final_aum_med / 1e6).toFixed(2)}M`,
    `${(v2.prob_pos * 100).toFixed(0)}%`,
  ];
  console.log(v2Row.map((c) => c.padEnd(16)).join(''));
  if (pyRef && pyRef[name]) {
    const py = pyRef[name].metrics;
    const pyRow = [
      '  Python',
      `${(py.ann_med * 100).toFixed(2)}%`,
      `${(py.ann_p5 * 100).toFixed(2)}%`,
      `${(py.ann_p95 * 100).toFixed(2)}%`,
      `$${(py.final_aum_med / 1e6).toFixed(2)}M`,
      `${(py.prob_pos * 100).toFixed(0)}%`,
    ];
    console.log(pyRow.map((c) => c.padEnd(16)).join(''));
    const dMed = (v2.ann_med - py.ann_med) * 100;
    const dP5 = (v2.ann_p5 - py.ann_p5) * 100;
    const dP95 = (v2.ann_p95 - py.ann_p95) * 100;
    const dFinal = ((v2.final_aum_med - py.final_aum_med) / py.final_aum_med) * 100;
    const diffRow = [
      '  Δ (v2-Py)',
      `${dMed >= 0 ? '+' : ''}${dMed.toFixed(2)}pp`,
      `${dP5 >= 0 ? '+' : ''}${dP5.toFixed(2)}pp`,
      `${dP95 >= 0 ? '+' : ''}${dP95.toFixed(2)}pp`,
      `${dFinal >= 0 ? '+' : ''}${dFinal.toFixed(2)}%`,
      '',
    ];
    console.log(diffRow.map((c) => c.padEnd(16)).join(''));
  }
}

// Regime breakdown
console.log('\n' + '='.repeat(70));
console.log('REGIME BREAKDOWN (NoLoan scenario)');
console.log('='.repeat(70));
const noloanV2 = (results.NoLoan as { metrics: Record<string, number> }).metrics;
console.log(`  v2:     A=${(noloanV2.regime_pct_A * 100).toFixed(1)}%  ` +
            `B=${(noloanV2.regime_pct_B * 100).toFixed(1)}%  ` +
            `C=${(noloanV2.regime_pct_C * 100).toFixed(1)}%  ` +
            `(n_events=${noloanV2.n_rollover_events})`);
if (pyRef && pyRef.NoLoan) {
  const py = pyRef.NoLoan.metrics;
  console.log(`  Python: A=${(py.regime_pct_A * 100).toFixed(1)}%  ` +
              `B=${(py.regime_pct_B * 100).toFixed(1)}%  ` +
              `C=${(py.regime_pct_C * 100).toFixed(1)}%  ` +
              `(n_events=${py.n_rollover_events})`);
}

// Dump JSON
const outPath = resolve(__dirname, '../outputs/tbsc-v2.json');
mkdirSync(dirname(outPath), { recursive: true });
const fullOutput = {
  generated_by: 'scripts/run-tbsc.ts',
  config: {
    initial_aum_usd: INITIAL_AUM,
    n_months: N_MONTHS,
    n_sims: N_SIMS,
    seed: SEED,
    inflow_base_annual: INFLOW,
    initial_spread: INITIAL_SPREAD,
    strategy: 'LadderRoll (Option B, tactical A/B/C) — v2 arena.ts',
  },
  scenarios: results,
};
writeFileSync(outPath, JSON.stringify(fullOutput, null, 2));
console.log(`\nJSON output -> ${outPath}`);

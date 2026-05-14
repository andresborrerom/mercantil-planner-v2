/**
 * arena.parity.test.ts — Validación de paridad arena.ts <-> arena_extended.py.
 *
 * Carga `tests/fixtures/arena_parity.json` y verifica para cada escenario que:
 *   - aum_path, sleeve_path, loan_balance_path, net_wealth_path coinciden
 *     sim-por-sim mes-por-mes
 *   - final_state (cash/equity/bullet AUMs + loan stats + cum_*) coincide
 *   - regime_counts y events coinciden exactamente
 */
import { describe, expect, it } from 'vitest';
import fixtureJson from '../../tests/fixtures/arena_parity.json';
import { runArena, type ArenaConfig, type ArenaMarket } from './arena';
import { makeLoanEvent, type LoanEvent } from './cashflow';
import type { RolloverPlan } from './rollover';
import type { BulletDef } from './bullets';
import type { Ticker } from '../data/market.generated';

type FixtureBullet = {
  name: string;
  maturity_y: number;
  dur_init_y: number;
  is_synthetic: boolean;
};

type FixtureScenario = {
  name: string;
  n_months: number;
  n_sims: number;
  n_real_bullets: number;
  n_extensions: number;
  ext_spacing_y: number;
  real_bullets: FixtureBullet[];
  plan: {
    bullet_total_pct: number;
    equity_pct: number;
    cash_pct: number;
    eqty_min: number;
    eqty_max: number;
    bullet_initial_weights: number[] | null;
  };
  thresholds: {
    theta_high: number;
    theta_low: number;
    theta_steep: number;
    theta_flat: number;
    x_to_equity: number;
  };
  loan_event: {
    trigger_month: number;
    amount_pct_aum: number;
    rate_factor?: number;
    rate_spread_bp?: number;
    rate_base?: 'sofr' | 'uy3y';
    term_months?: number;
  } | null;
  initial_aum_usd: number;
  cash_band_upper: number;
  rollover_enabled: boolean;
  enforce_monthly_equity_cap?: boolean;
  inflow_base_annual: number;
  inflow_growth: number;
  curve_decimal: [number, number, number, number];
  yield_paths_sim_major: { IRX: number[]; FVX: number[]; TNX: number[]; TYX: number[] };
  bullet_returns_sim_major: number[][];
  equity_returns_sim_major: number[];
  cash_returns_sim_major: number[];
  expected: {
    aum_path_per_sim_per_mes: number[];
    sleeve_path_per_sim_per_mes: number[];
    loan_balance_path: number[];
    net_wealth_path: number[];
    regime_counts: { A: number; B: number; C: number };
    events: { t: number; mature_b: string; dest_b: string; n_A: number; n_B: number; n_C: number }[];
    final_state: {
      cash_aum: number[];
      equity_aum: number[];
      bullet_aums: number[];
      loan_balance: number[];
      loan_active: number[];
      cum_interest_paid: number[];
      cum_forced_equity_sales: number[];
      cum_forced_bullet_sales: number[];
      cum_loan_shortfall: number[];
    };
    n_total_bullets: number;
    all_bullet_names: string[];
  };
};

type Fixture = {
  generated_by: string;
  purpose: string;
  scenarios: FixtureScenario[];
};

const fixture = fixtureJson as unknown as Fixture;

function toF32(arr: number[]): Float32Array {
  return Float32Array.from(arr);
}

function buildInputs(scen: FixtureScenario): { config: ArenaConfig; market: ArenaMarket } {
  const bullets: BulletDef[] = scen.real_bullets.map((b) => ({
    name: b.name,
    maturityY: b.maturity_y,
    durInitY: b.dur_init_y,
    isSynthetic: b.is_synthetic,
  }));
  const plan: RolloverPlan = {
    bullets,
    bulletTotalPct: scen.plan.bullet_total_pct,
    equityPct: scen.plan.equity_pct,
    cashPct: scen.plan.cash_pct,
    eqtyMin: scen.plan.eqty_min,
    eqtyMax: scen.plan.eqty_max,
    equityMix: [{ ticker: 'USMV' as Ticker, weight: 1.0 }], // dummy — bullet_returns override del market
    cashTicker: 'BIL' as Ticker,
    bulletInitialWeights: scen.plan.bullet_initial_weights,
    initialSpread: 0,
  };
  let loan: LoanEvent | null = null;
  if (scen.loan_event) {
    loan = makeLoanEvent({
      triggerMonth: scen.loan_event.trigger_month,
      amountPctAum: scen.loan_event.amount_pct_aum,
      rateFactor: scen.loan_event.rate_factor,
      rateSpreadBp: scen.loan_event.rate_spread_bp,
      rateBase: scen.loan_event.rate_base,
      termMonths: scen.loan_event.term_months,
    });
  }
  const config: ArenaConfig = {
    rolloverPlan: plan,
    rolloverThresholds: {
      thetaHigh: scen.thresholds.theta_high,
      thetaLow: scen.thresholds.theta_low,
      thetaSteep: scen.thresholds.theta_steep,
      thetaFlat: scen.thresholds.theta_flat,
      xToEquity: scen.thresholds.x_to_equity,
    },
    loanEvent: loan,
    inflowBaseAnnual: scen.inflow_base_annual,
    inflowGrowth: scen.inflow_growth,
    initialAumUsd: scen.initial_aum_usd,
    nExtensions: scen.n_extensions,
    extensionSpacingY: scen.ext_spacing_y,
    cashBandUpper: scen.cash_band_upper,
    rolloverEnabled: scen.rollover_enabled,
    enforceMonthlyEquityCap: scen.enforce_monthly_equity_cap === true,
  };
  const market: ArenaMarket = {
    bulletReturns: scen.bullet_returns_sim_major.map(toF32),
    equityReturns: toF32(scen.equity_returns_sim_major),
    cashReturns: toF32(scen.cash_returns_sim_major),
    yieldPaths: {
      IRX: toF32(scen.yield_paths_sim_major.IRX),
      FVX: toF32(scen.yield_paths_sim_major.FVX),
      TNX: toF32(scen.yield_paths_sim_major.TNX),
      TYX: toF32(scen.yield_paths_sim_major.TYX),
    },
    nSims: scen.n_sims,
    horizonMonths: scen.n_months,
  };
  return { config, market };
}

// Tolerancia: con 48 meses y 5M AUM, accumulación de roundoff puede ser ~1e-5
// absoluto en valores grandes. Para valores pequeños (cum_*, loan_balance) usamos
// 1e-7. Como Float32 returns × float64 AUM amplifica el roundoff, permitimos
// tolerancia relativa 1e-5 en addition to la absoluta.
const ABS_TOL_AUM = 1e-4;   // path values en USD pueden ser grandes (5M)
const REL_TOL_AUM = 1e-7;
const ABS_TOL_SMALL = 1e-5; // cum_* y loan stats arrancan en 0

function expectClose(
  actual: number,
  expected: number,
  label: string,
  absTol = ABS_TOL_AUM,
  relTol = REL_TOL_AUM,
): void {
  const abs = Math.abs(actual - expected);
  const rel = Math.abs(expected) > 1e-9 ? abs / Math.abs(expected) : abs;
  if (abs > absTol && rel > relTol) {
    throw new Error(`${label}: actual=${actual} expected=${expected} abs=${abs} rel=${rel}`);
  }
  expect(true).toBe(true);
}

describe('arena paridad TS <-> Python', () => {
  it('fixture cargado', () => {
    expect(fixture.scenarios.length).toBeGreaterThan(0);
    expect(fixture.generated_by).toContain('dump_arena_parity.py');
  });

  for (const scen of fixture.scenarios) {
    describe(`escenario: ${scen.name}`, () => {
      const { config, market } = buildInputs(scen);
      const out = runArena(config, market);

      it('regime_counts coinciden exactamente', () => {
        expect(out.regimeCounts).toEqual(scen.expected.regime_counts);
      });

      it('events: mismo número y mismas asignaciones', () => {
        expect(out.events).toHaveLength(scen.expected.events.length);
        for (let i = 0; i < scen.expected.events.length; i++) {
          const a = out.events[i];
          const e = scen.expected.events[i];
          expect(a.t).toBe(e.t);
          expect(a.matureBullet).toBe(e.mature_b);
          expect(a.destBullet).toBe(e.dest_b);
          expect(a.regimeCounts.A).toBe(e.n_A);
          expect(a.regimeCounts.B).toBe(e.n_B);
          expect(a.regimeCounts.C).toBe(e.n_C);
        }
      });

      it('aum_path coincide sim-por-sim mes-por-mes', () => {
        const Hp1 = scen.n_months + 1;
        for (let s = 0; s < scen.n_sims; s++) {
          for (let t = 0; t <= scen.n_months; t++) {
            const idx = s * Hp1 + t;
            expectClose(out.aumPath[idx], scen.expected.aum_path_per_sim_per_mes[idx],
              `aum_path[${s},${t}]`);
          }
        }
      });

      it('sleeve_path coincide sim-por-sim mes-por-mes', () => {
        const Hp1 = scen.n_months + 1;
        for (let s = 0; s < scen.n_sims; s++) {
          for (let t = 0; t <= scen.n_months; t++) {
            for (let k = 0; k < 3; k++) {
              const idx = s * Hp1 * 3 + t * 3 + k;
              expectClose(out.sleevePath[idx], scen.expected.sleeve_path_per_sim_per_mes[idx],
                `sleeve_path[${s},${t},${k}]`);
            }
          }
        }
      });

      it('loan_balance_path coincide', () => {
        const Hp1 = scen.n_months + 1;
        for (let s = 0; s < scen.n_sims; s++) {
          for (let t = 0; t <= scen.n_months; t++) {
            const idx = s * Hp1 + t;
            expectClose(out.loanBalancePath[idx], scen.expected.loan_balance_path[idx],
              `loan_balance_path[${s},${t}]`, ABS_TOL_SMALL, REL_TOL_AUM);
          }
        }
      });

      it('net_wealth_path coincide', () => {
        const Hp1 = scen.n_months + 1;
        for (let s = 0; s < scen.n_sims; s++) {
          for (let t = 0; t <= scen.n_months; t++) {
            const idx = s * Hp1 + t;
            expectClose(out.netWealthPath[idx], scen.expected.net_wealth_path[idx],
              `net_wealth_path[${s},${t}]`);
          }
        }
      });

      it('final_state.cash_aum coincide sim-por-sim', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(out.finalState.cashAum[s], scen.expected.final_state.cash_aum[s],
            `cash_aum[${s}]`);
        }
      });

      it('final_state.equity_aum coincide sim-por-sim', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(out.finalState.equityAum[s], scen.expected.final_state.equity_aum[s],
            `equity_aum[${s}]`);
        }
      });

      it('final_state.bullet_aums coincide sim-por-bullet', () => {
        const nTotal = scen.expected.n_total_bullets;
        for (let s = 0; s < scen.n_sims; s++) {
          for (let b = 0; b < nTotal; b++) {
            const idx = s * nTotal + b;
            expectClose(out.finalState.bulletAums[idx],
              scen.expected.final_state.bullet_aums[idx],
              `bullet_aums[${s},${b}]`);
          }
        }
      });

      it('final_state.loan_balance + loan_active coinciden', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(out.finalState.loanBalance[s],
            scen.expected.final_state.loan_balance[s],
            `loan_balance[${s}]`, ABS_TOL_SMALL, REL_TOL_AUM);
          expect(out.finalState.loanActive[s]).toBe(scen.expected.final_state.loan_active[s]);
        }
      });

      it('final_state cumulative metrics coinciden', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(out.finalState.cumInterestPaid[s],
            scen.expected.final_state.cum_interest_paid[s],
            `cum_interest_paid[${s}]`, ABS_TOL_SMALL, REL_TOL_AUM);
          expectClose(out.finalState.cumForcedEquitySales[s],
            scen.expected.final_state.cum_forced_equity_sales[s],
            `cum_forced_equity_sales[${s}]`, ABS_TOL_SMALL, REL_TOL_AUM);
          expectClose(out.finalState.cumForcedBulletSales[s],
            scen.expected.final_state.cum_forced_bullet_sales[s],
            `cum_forced_bullet_sales[${s}]`, ABS_TOL_SMALL, REL_TOL_AUM);
          expectClose(out.finalState.cumLoanShortfall[s],
            scen.expected.final_state.cum_loan_shortfall[s],
            `cum_loan_shortfall[${s}]`, ABS_TOL_SMALL, REL_TOL_AUM);
        }
      });

      it('all_bullets names coinciden', () => {
        const expectedNames = scen.expected.all_bullet_names;
        expect(out.allBullets.map((b) => b.name)).toEqual(expectedNames);
      });
    });
  }
});

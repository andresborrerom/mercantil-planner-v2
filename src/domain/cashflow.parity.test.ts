/**
 * cashflow.parity.test.ts — Validación de paridad cashflow.ts <-> cashflow.py.
 *
 * Carga `tests/fixtures/cashflow_parity.json` generado por
 * `code/dump_cashflow_parity.py`. Cada escenario contiene:
 *   - inputs (estado inicial, plan, loan, market, params)
 *   - expected_final_state (snapshot post N meses)
 *
 * El test TS reconstruye CashFlowState, corre N llamadas a cashflowStep y
 * verifica el snapshot final sim-por-sim con tolerancia tight.
 */
import { describe, expect, it } from 'vitest';
import fixtureJson from '../../tests/fixtures/cashflow_parity.json';
import {
  cashflowStep,
  initializeState,
  makeLoanEvent,
  type CashFlowMarket,
  type CashFlowState,
  type LoanEvent,
  type PlanAlloc,
} from './cashflow';

type FixtureScenario = {
  name: string;
  n_sims: number;
  n_bullets: number;
  n_months: number;
  initial_cash: number;
  initial_equity: number;
  initial_bullets: number[];
  curve_decimal: [number, number, number, number];
  plan_alloc: { bullets: number; equity: number; cash: number };
  loan_event: {
    trigger_month: number;
    amount_pct_aum: number;
    rate_factor?: number;
    rate_spread_bp?: number;
    term_months?: number;
  } | null;
  inflow_base_annual: number;
  inflow_growth: number;
  cash_band_upper: number;
  bullet_shortest_idx: number;
  enforce_monthly_equity_cap?: boolean;
  eqty_max?: number | null;
  expected_final_state: {
    cash_aum: number[];
    equity_aum: number[];
    bullet_aums: number[];
    loan_balance: number[];
    loan_payment_per_month: number[];
    loan_rate_monthly: number[];
    loan_months_remaining: number[];
    loan_active: number[];
    cum_interest_paid: number[];
    cum_forced_equity_sales: number[];
    cum_forced_bullet_sales: number[];
    cum_loan_shortfall: number[];
  };
};

type Fixture = {
  generated_by: string;
  purpose: string;
  scenarios: FixtureScenario[];
};

const fixture = fixtureJson as unknown as Fixture;

function buildYStateFlat(
  curve: [number, number, number, number],
  nSims: number,
): Float64Array {
  const out = new Float64Array(nSims * 4);
  for (let s = 0; s < nSims; s++) {
    out[s * 4 + 0] = curve[0];
    out[s * 4 + 1] = curve[1];
    out[s * 4 + 2] = curve[2];
    out[s * 4 + 3] = curve[3];
  }
  return out;
}

function runScenarioTs(scen: FixtureScenario): CashFlowState {
  const state = initializeState({
    nSims: scen.n_sims,
    initialCashAum: scen.initial_cash,
    initialEquityAum: scen.initial_equity,
    initialBulletAums: scen.initial_bullets,
    nBullets: scen.n_bullets,
  });
  const market: CashFlowMarket = { yStateT: buildYStateFlat(scen.curve_decimal, scen.n_sims) };

  let loan: LoanEvent | null = null;
  if (scen.loan_event) {
    loan = makeLoanEvent({
      triggerMonth: scen.loan_event.trigger_month,
      amountPctAum: scen.loan_event.amount_pct_aum,
      rateFactor: scen.loan_event.rate_factor,
      rateSpreadBp: scen.loan_event.rate_spread_bp,
      termMonths: scen.loan_event.term_months,
    });
  }
  const planAlloc: PlanAlloc = scen.plan_alloc;

  for (let t = 0; t < scen.n_months; t++) {
    cashflowStep({
      t,
      state,
      planAlloc,
      loanEvent: loan && t === loan.triggerMonth ? loan : null,
      market,
      inflowBaseAnnual: scen.inflow_base_annual,
      inflowGrowth: scen.inflow_growth,
      cashBandUpper: scen.cash_band_upper,
      bulletShortestIdx: scen.bullet_shortest_idx,
      enforceMonthlyEquityCap: scen.enforce_monthly_equity_cap === true,
      eqtyMax: scen.eqty_max ?? undefined,
    });
  }
  return state;
}

// Tolerancia: Python float64 vs TS Float64Array → idealmente idéntico. Permitimos
// 1e-7 absoluto por roundoff acumulado en 72 iteraciones del peor caso.
const ABS_TOL = 1e-7;
const REL_TOL = 1e-9;

function expectClose(actual: number, expected: number, label: string): void {
  const abs = Math.abs(actual - expected);
  const rel = Math.abs(expected) > 1e-9 ? abs / Math.abs(expected) : abs;
  if (abs > ABS_TOL && rel > REL_TOL) {
    throw new Error(
      `${label}: actual=${actual} expected=${expected} (abs=${abs}, rel=${rel})`,
    );
  }
  expect(true).toBe(true); // mantener contador de assertions
}

describe('cashflow paridad TS <-> Python', () => {
  it('fixture cargado', () => {
    expect(fixture.scenarios.length).toBeGreaterThan(0);
    expect(fixture.generated_by).toContain('dump_cashflow_parity.py');
  });

  for (const scen of fixture.scenarios) {
    describe(`escenario: ${scen.name}`, () => {
      const state = runScenarioTs(scen);
      const exp = scen.expected_final_state;

      it('cash_aum coincide sim-por-sim', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(state.cashAum[s], exp.cash_aum[s], `cash_aum[${s}]`);
        }
      });

      it('equity_aum coincide sim-por-sim', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(state.equityAum[s], exp.equity_aum[s], `equity_aum[${s}]`);
        }
      });

      it('bullet_aums coincide sim-por-bullet', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          for (let b = 0; b < scen.n_bullets; b++) {
            const idx = s * scen.n_bullets + b;
            expectClose(state.bulletAums[idx], exp.bullet_aums[idx], `bullet_aums[${s},${b}]`);
          }
        }
      });

      it('loan_balance coincide', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(state.loanBalance[s], exp.loan_balance[s], `loan_balance[${s}]`);
        }
      });

      it('loan_payment_per_month coincide', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(
            state.loanPaymentPerMonth[s],
            exp.loan_payment_per_month[s],
            `loan_payment_per_month[${s}]`,
          );
        }
      });

      it('loan_rate_monthly coincide', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(state.loanRateMonthly[s], exp.loan_rate_monthly[s], `loan_rate_monthly[${s}]`);
        }
      });

      it('loan_months_remaining coincide exactamente', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expect(state.loanMonthsRemaining[s]).toBe(exp.loan_months_remaining[s]);
        }
      });

      it('loan_active coincide exactamente', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expect(state.loanActive[s]).toBe(exp.loan_active[s]);
        }
      });

      it('cum_interest_paid coincide', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(state.cumInterestPaid[s], exp.cum_interest_paid[s], `cum_interest_paid[${s}]`);
        }
      });

      it('cum_forced_equity_sales coincide', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(
            state.cumForcedEquitySales[s],
            exp.cum_forced_equity_sales[s],
            `cum_forced_equity_sales[${s}]`,
          );
        }
      });

      it('cum_forced_bullet_sales coincide', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(
            state.cumForcedBulletSales[s],
            exp.cum_forced_bullet_sales[s],
            `cum_forced_bullet_sales[${s}]`,
          );
        }
      });

      it('cum_loan_shortfall coincide', () => {
        for (let s = 0; s < scen.n_sims; s++) {
          expectClose(state.cumLoanShortfall[s], exp.cum_loan_shortfall[s], `cum_loan_shortfall[${s}]`);
        }
      });
    });
  }
});

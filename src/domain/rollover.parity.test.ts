/**
 * rollover.parity.test.ts — Validación de paridad numérica con Python.
 *
 * Carga `tests/fixtures/rollover_parity.json` generado por
 * `code/dump_rollover_parity.py`. Cada escenario contiene:
 *   - inputs (curva, retornos pre-computados sim-major, plan, thresholds)
 *   - expected (wealth final per sim, stats, regime counts, eventos)
 *
 * El test TS construye runRollover con `bulletReturnsOverride` para inyectar
 * los mismos bullet returns que usó Python, y verifica que todos los outputs
 * coinciden sim-por-sim con tolerancia tight (~1e-5 absoluto en wealth).
 */
import { describe, expect, it } from 'vitest';
import fixtureJson from '../../tests/fixtures/rollover_parity.json';
import {
  runRollover,
  type RolloverInput,
  type RolloverThresholds,
  type RolloverPlan,
} from './rollover';
import type { BulletDef } from './bullets';
import type { Ticker } from '../data/market.generated';

// =====================================================================
// Tipos del fixture (mirror del schema en dump_rollover_parity.py)
// =====================================================================

type FixtureBullet = {
  name: string;
  maturity_y: number;
  dur_init_y: number;
  is_synthetic: boolean;
};

type FixturePlan = {
  bullet_total_pct: number;
  equity_pct: number;
  cash_pct: number;
  eqty_min: number;
  eqty_max: number;
  bullet_initial_weights: number[] | null;
};

type FixtureThresholds = {
  theta_high: number;
  theta_low: number;
  theta_steep: number;
  theta_flat: number;
  x_to_equity: number;
};

type FixtureEvent = {
  month: number;
  bullet: string;
  destination: string | null;
  n_A: number;
  n_B: number;
  n_C: number;
};

type FixtureScenario = {
  name: string;
  rollover_enabled: boolean;
  n_months: number;
  n_sims: number;
  curve_decimal: [number, number, number, number];
  bullets: FixtureBullet[];
  plan: FixturePlan;
  thresholds: FixtureThresholds;
  yield_TNX_sim_major: number[];
  yield_IRX_sim_major: number[];
  yield_FVX_sim_major: number[];
  yield_TYX_sim_major: number[];
  equity_returns_sim_major: number[];
  cash_returns_sim_major: number[];
  bullet_returns_sim_major: number[][];
  expected: {
    wealth_final_per_sim: number[];
    sleeve_final_per_sim: number[][]; // (n_sims, 3)
    stats: {
      p5: number;
      p25: number;
      med: number;
      p75: number;
      p95: number;
      mean: number;
      prob_pos: number;
    };
    regime_counts: { A: number; B: number; C: number };
    events: FixtureEvent[];
  };
};

type Fixture = {
  generated_by: string;
  purpose: string;
  scenarios: FixtureScenario[];
};

const fixture = fixtureJson as unknown as Fixture;

// =====================================================================
// Helpers
// =====================================================================

function toF32(arr: number[]): Float32Array {
  return Float32Array.from(arr);
}

function buildRolloverInput(scen: FixtureScenario): RolloverInput {
  const bullets: BulletDef[] = scen.bullets.map((b) => ({
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
    equityMix: [{ ticker: 'USMV', weight: 1.0 }],
    cashTicker: 'BIL' as Ticker,
    bulletInitialWeights: scen.plan.bullet_initial_weights,
    initialSpread: 0, // ignorado porque pasamos bulletReturnsOverride
  };

  const thresholds: RolloverThresholds = {
    thetaHigh: scen.thresholds.theta_high,
    thetaLow: scen.thresholds.theta_low,
    thetaSteep: scen.thresholds.theta_steep,
    thetaFlat: scen.thresholds.theta_flat,
    xToEquity: scen.thresholds.x_to_equity,
  };

  // ETF returns: solo necesitamos USMV (equity) y BIL (cash). Las series
  // vienen flat sim-major desde el fixture, así que las cargamos como están.
  const etfReturns: Record<string, Float32Array> = {
    USMV: toF32(scen.equity_returns_sim_major),
    BIL: toF32(scen.cash_returns_sim_major),
  };

  return {
    plan,
    thresholds,
    rolloverEnabled: scen.rollover_enabled,
    ctx: {
      yieldPaths: {
        IRX: toF32(scen.yield_IRX_sim_major),
        FVX: toF32(scen.yield_FVX_sim_major),
        TNX: toF32(scen.yield_TNX_sim_major),
        TYX: toF32(scen.yield_TYX_sim_major),
      },
      etfReturns,
      initialCurve: scen.curve_decimal,
      nPaths: scen.n_sims,
      horizonMonths: scen.n_months,
      bulletReturnsOverride: scen.bullet_returns_sim_major.map(toF32),
    },
  };
}

// =====================================================================
// Tests de paridad
// =====================================================================

describe('rollover paridad TS <-> Python', () => {
  it('fixture cargado correctamente', () => {
    expect(fixture.scenarios.length).toBeGreaterThan(0);
    expect(fixture.generated_by).toContain('dump_rollover_parity.py');
  });

  for (const scen of fixture.scenarios) {
    describe(`escenario: ${scen.name}`, () => {
      const input = buildRolloverInput(scen);
      const out = runRollover(input);

      it('wealth final coincide sim-por-sim con tolerancia tight', () => {
        const Hp1 = scen.n_months + 1;
        const expected = scen.expected.wealth_final_per_sim;
        let maxAbs = 0;
        let maxRel = 0;
        for (let s = 0; s < scen.n_sims; s++) {
          const actual = out.wealthPath[s * Hp1 + scen.n_months];
          const exp = expected[s];
          const absDiff = Math.abs(actual - exp);
          const relDiff = exp !== 0 ? absDiff / Math.abs(exp) : absDiff;
          if (absDiff > maxAbs) maxAbs = absDiff;
          if (relDiff > maxRel) maxRel = relDiff;
        }
        // Float32 vs Python float64: esperamos ~1e-6 relativo de error de precisión
        // por el roundoff en cada drift step. Permitimos hasta 1e-5 absoluto.
        expect(maxAbs).toBeLessThan(1e-5);
        expect(maxRel).toBeLessThan(1e-5);
      });

      it('sleeve final coincide sim-por-sim', () => {
        const Hp1 = scen.n_months + 1;
        const expected = scen.expected.sleeve_final_per_sim;
        for (let s = 0; s < scen.n_sims; s++) {
          const off = s * Hp1 * 3 + scen.n_months * 3;
          for (let k = 0; k < 3; k++) {
            expect(Math.abs(out.sleevePath[off + k] - expected[s][k])).toBeLessThan(1e-5);
          }
        }
      });

      it('stats finales coinciden (p5/p25/med/p75/p95/mean/probPos)', () => {
        const exp = scen.expected.stats;
        expect(out.stats.p5).toBeCloseTo(exp.p5, 5);
        expect(out.stats.p25).toBeCloseTo(exp.p25, 5);
        expect(out.stats.med).toBeCloseTo(exp.med, 5);
        expect(out.stats.p75).toBeCloseTo(exp.p75, 5);
        expect(out.stats.p95).toBeCloseTo(exp.p95, 5);
        expect(out.stats.mean).toBeCloseTo(exp.mean, 5);
        expect(out.stats.probPos).toBeCloseTo(exp.prob_pos, 5);
      });

      it('regime counts coinciden EXACTAMENTE', () => {
        expect(out.regimeCounts).toEqual(scen.expected.regime_counts);
      });

      it('número de eventos coincide', () => {
        expect(out.eventsLog).toHaveLength(scen.expected.events.length);
      });

      it('events log: secuencia de bullets vencidos coincide', () => {
        for (let i = 0; i < scen.expected.events.length; i++) {
          const actEv = out.eventsLog[i];
          const expEv = scen.expected.events[i];
          expect(actEv.bulletName).toBe(expEv.bullet);
          expect(actEv.destinationBullet).toBe(expEv.destination);
          expect(actEv.month).toBe(expEv.month);
          expect(actEv.regimeCounts.A).toBe(expEv.n_A);
          expect(actEv.regimeCounts.B).toBe(expEv.n_B);
          expect(actEv.regimeCounts.C).toBe(expEv.n_C);
        }
      });
    });
  }
});

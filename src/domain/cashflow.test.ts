/**
 * cashflow.test.ts — Tests del motor cashflow + LoanEvent.
 *
 * Cubre los 3 tests T1/T2/T3 de `code/cashflow.py` + casos adicionales:
 *   T1: amortización pura (sin inflows, sin retornos, cash suficiente)
 *   T2: inflows + rebalanceo a strategic allocation (sin préstamo)
 *   T3: orden cash → equity → bullet en ventas forzadas
 *   + Helpers puros: computeLoanRate, computeAmortizingPayment,
 *     computeMonthlyInflow, interpolateUy3Y
 *   + Validaciones LoanEvent
 *   + Rebalanceo distribución bullets proporcional al peso vivo
 */
import { describe, it, expect } from 'vitest';
import {
  cashflowStep,
  initializeState,
  totalAum,
  netWealth,
  makeLoanEvent,
  computeLoanRate,
  computeAmortizingPayment,
  computeMonthlyInflow,
  interpolateUy3Y,
  type CashFlowMarket,
  type PlanAlloc,
  type LoanEvent,
} from './cashflow';

// =====================================================================
// Helpers
// =====================================================================

function flatCurveYstate(nSims: number, level = 0.04): Float64Array {
  const out = new Float64Array(nSims * 4);
  for (let s = 0; s < nSims; s++) {
    out[s * 4 + 0] = level;
    out[s * 4 + 1] = level;
    out[s * 4 + 2] = level;
    out[s * 4 + 3] = level;
  }
  return out;
}

// =====================================================================
// Helpers puros
// =====================================================================

describe('computeLoanRate', () => {
  it('scalar: factor × (uy3y + spread/10000)', () => {
    expect(computeLoanRate(0.04, 250, 0.7)).toBeCloseTo(0.7 * (0.04 + 0.025), 10);
    expect(computeLoanRate(0.03, 200, 0.8)).toBeCloseTo(0.8 * (0.03 + 0.02), 10);
  });

  it('array: vectorizado', () => {
    const out = computeLoanRate([0.04, 0.05, 0.03], 250, 0.7) as Float64Array;
    expect(out[0]).toBeCloseTo(0.7 * 0.065, 10);
    expect(out[1]).toBeCloseTo(0.7 * 0.075, 10);
    expect(out[2]).toBeCloseTo(0.7 * 0.055, 10);
  });
});

describe('computeAmortizingPayment', () => {
  it('scalar: r > 0', () => {
    // $300k @ 4.55%/yr, 36 meses
    const r = 0.0455 / 12;
    const pmt = computeAmortizingPayment(300_000, r, 36) as number;
    const expected = (300_000 * r) / (1 - Math.pow(1 + r, -36));
    expect(pmt).toBeCloseTo(expected, 6);
  });

  it('scalar: r = 0 → P/n', () => {
    expect(computeAmortizingPayment(36_000, 0, 36)).toBe(1000);
  });

  it('array: vectorizado', () => {
    const out = computeAmortizingPayment([300_000, 100_000], [0.005, 0], 36) as Float64Array;
    expect(out[0]).toBeCloseTo((300_000 * 0.005) / (1 - Math.pow(1.005, -36)), 6);
    expect(out[1]).toBeCloseTo(100_000 / 36, 10);
  });
});

describe('computeMonthlyInflow', () => {
  it('growth=0 → constante', () => {
    expect(computeMonthlyInflow(0, 250_000, 0)).toBeCloseTo(20833.333, 2);
    expect(computeMonthlyInflow(11, 250_000, 0)).toBeCloseTo(20833.333, 2);
    expect(computeMonthlyInflow(12, 250_000, 0)).toBeCloseTo(20833.333, 2);
  });

  it('growth=2%/año → escala por año k', () => {
    const m0 = computeMonthlyInflow(0, 250_000, 0.02);
    const m12 = computeMonthlyInflow(12, 250_000, 0.02);
    const m24 = computeMonthlyInflow(24, 250_000, 0.02);
    expect(m0).toBeCloseTo(20833.333, 2);
    expect(m12).toBeCloseTo(m0 * 1.02, 4);
    expect(m24).toBeCloseTo(m0 * 1.02 * 1.02, 4);
  });
});

describe('interpolateUy3Y', () => {
  it('interpola lineal entre IRX (0.25y) y FVX (5y)', () => {
    const y = new Float64Array([
      // s=0: IRX=2%, FVX=5%
      0.02, 0.05, 0.04, 0.045,
      // s=1: IRX=4%, FVX=4%
      0.04, 0.04, 0.04, 0.04,
    ]);
    const out = interpolateUy3Y(y, 2);
    // k = (3 - 0.25) / (5 - 0.25) = 2.75/4.75 = 0.5789...
    const k = 2.75 / 4.75;
    expect(out[0]).toBeCloseTo(0.02 + (0.05 - 0.02) * k, 10);
    expect(out[1]).toBeCloseTo(0.04, 10);
  });
});

// =====================================================================
// LoanEvent validaciones
// =====================================================================

describe('makeLoanEvent', () => {
  it('aplica defaults razonables', () => {
    const ev = makeLoanEvent({ triggerMonth: 0, amountPctAum: 0.25 });
    expect(ev.rateFactor).toBe(0.7);
    expect(ev.rateSpreadBp).toBe(250);
    expect(ev.termMonths).toBe(36);
    expect(ev.repaymentMode).toBe('amortizing');
  });

  it('rechaza amountPctAum fuera de [0, 0.30]', () => {
    expect(() => makeLoanEvent({ triggerMonth: 0, amountPctAum: 0.35 })).toThrow(/0.30/);
    expect(() => makeLoanEvent({ triggerMonth: 0, amountPctAum: -0.05 })).toThrow();
  });

  it('rechaza term_months <= 0', () => {
    expect(() => makeLoanEvent({ triggerMonth: 0, amountPctAum: 0.1, termMonths: 0 }))
      .toThrow(/termMonths/);
  });

  it('rechaza triggerMonth negativo', () => {
    expect(() => makeLoanEvent({ triggerMonth: -1, amountPctAum: 0.1 }))
      .toThrow(/triggerMonth/);
  });
});

// =====================================================================
// T1: amortización pura
// =====================================================================

describe('cashflowStep T1 — amortización pura', () => {
  it('amortiza completamente $300k @ 4.55% en 36 meses sin shortfall', () => {
    const nSims = 5;
    const state = initializeState({
      nSims,
      initialCashAum: 1_000_000,
      initialEquityAum: 0,
      initialBulletAums: [0],
      nBullets: 1,
    });
    const loan = makeLoanEvent({ triggerMonth: 0, amountPctAum: 0.30, termMonths: 36 });

    const market: CashFlowMarket = { yStateT: flatCurveYstate(nSims, 0.04) };

    const expectedRate = 0.7 * (0.04 + 0.025); // 4.55%
    const expectedAmount = 0.30 * 1_000_000;   // $300k
    const rM = expectedRate / 12;
    const expectedPmt = (expectedAmount * rM) / (1 - Math.pow(1 + rM, -36));
    const expectedTotalInterest = expectedPmt * 36 - expectedAmount;
    const expectedFinalCash = 1_000_000 - expectedPmt * 36;

    for (let t = 0; t < 36; t++) {
      cashflowStep({
        t,
        state,
        planAlloc: { bullets: 0, equity: 0, cash: 1 },
        loanEvent: t === 0 ? loan : null,
        market,
        inflowBaseAnnual: 0,
        cashBandUpper: 2.0, // > 100% para deshabilitar rebalance
      });
    }

    expect(state.loanPaymentPerMonth[0]).toBeCloseTo(expectedPmt, 2);
    expect(state.cumInterestPaid[0]).toBeCloseTo(expectedTotalInterest, 1);
    expect(state.loanBalance[0]).toBeLessThan(0.01);
    expect(state.cashAum[0]).toBeCloseTo(expectedFinalCash, 1);
    expect(state.cumForcedEquitySales[0]).toBe(0);
    expect(state.cumForcedBulletSales[0]).toBe(0);
    expect(state.cumLoanShortfall[0]).toBe(0);
  });
});

// =====================================================================
// T2: inflows + rebalanceo a strategic allocation (sin préstamo)
// =====================================================================

describe('cashflowStep T2 — inflows + rebalanceo', () => {
  it('inflow anual $250k se rebalancea a 65/30/5 sin préstamo', () => {
    const nSims = 5;
    const initialTotal = 800_000;
    const state = initializeState({
      nSims,
      initialCashAum: 0.05 * initialTotal,
      initialEquityAum: 0.30 * initialTotal,
      initialBulletAums: [0.325 * initialTotal, 0.325 * initialTotal],
      nBullets: 2,
    });
    const market: CashFlowMarket = { yStateT: flatCurveYstate(nSims, 0.04) };
    const planAlloc: PlanAlloc = { bullets: 0.65, equity: 0.30, cash: 0.05 };

    for (let t = 0; t < 12; t++) {
      cashflowStep({
        t,
        state,
        planAlloc,
        loanEvent: null,
        market,
        inflowBaseAnnual: 250_000,
        inflowGrowth: 0,
        cashBandUpper: 0.05,
      });
    }

    const totals = totalAum(state);
    const expectedTotal = initialTotal + 250_000;
    const expectedCash = 0.05 * expectedTotal;
    const expectedEquity = 0.30 * expectedTotal;
    const expectedBullets = 0.65 * expectedTotal;

    expect(totals[0]).toBeCloseTo(expectedTotal, 0);
    expect(state.cashAum[0]).toBeCloseTo(expectedCash, 0);
    expect(state.equityAum[0]).toBeCloseTo(expectedEquity, 0);
    const bSum = state.bulletAums[0] + state.bulletAums[1];
    expect(bSum).toBeCloseTo(expectedBullets, 0);
  });
});

// =====================================================================
// T3: orden de prelación cash → equity → bullet en ventas forzadas
// =====================================================================

describe('cashflowStep T3 — cascada de ventas forzadas', () => {
  it('mes 1: cash 1000 → 0, equity 5000 → 1000, bullet intacto (pmt=5000)', () => {
    const state = initializeState({
      nSims: 1,
      initialCashAum: 1_000,
      initialEquityAum: 5_000,
      initialBulletAums: [50_000],
      nBullets: 1,
    });
    // Setup directo del préstamo (bypass del trigger) para forzar cascada
    state.loanBalance[0] = 50_000;
    state.loanPaymentPerMonth[0] = 5_000;
    state.loanRateMonthly[0] = 0.005; // 6%/yr
    state.loanMonthsRemaining[0] = 10;
    state.loanActive[0] = 1;

    const market: CashFlowMarket = { yStateT: flatCurveYstate(1, 0.04) };

    cashflowStep({
      t: 0,
      state,
      planAlloc: { bullets: 1, equity: 0, cash: 0 },
      loanEvent: null,
      market,
      inflowBaseAnnual: 0,
      cashBandUpper: 2.0,
    });

    expect(state.cashAum[0]).toBeCloseTo(0, 6);
    expect(state.equityAum[0]).toBeCloseTo(1_000, 6);
    expect(state.bulletAums[0]).toBe(50_000); // intacto
    expect(state.cumForcedEquitySales[0]).toBeCloseTo(4_000, 6);
    expect(state.cumForcedBulletSales[0]).toBe(0);
  });

  it('mes 2: equity 1000 → 0, bullet 50000 → 46000 (otra pmt=5000)', () => {
    const state = initializeState({
      nSims: 1,
      initialCashAum: 1_000,
      initialEquityAum: 5_000,
      initialBulletAums: [50_000],
      nBullets: 1,
    });
    state.loanBalance[0] = 50_000;
    state.loanPaymentPerMonth[0] = 5_000;
    state.loanRateMonthly[0] = 0.005;
    state.loanMonthsRemaining[0] = 10;
    state.loanActive[0] = 1;

    const market: CashFlowMarket = { yStateT: flatCurveYstate(1, 0.04) };

    // Mes 1
    cashflowStep({
      t: 0,
      state,
      planAlloc: { bullets: 1, equity: 0, cash: 0 },
      loanEvent: null,
      market,
      inflowBaseAnnual: 0,
      cashBandUpper: 2.0,
    });
    // Mes 2
    cashflowStep({
      t: 1,
      state,
      planAlloc: { bullets: 1, equity: 0, cash: 0 },
      loanEvent: null,
      market,
      inflowBaseAnnual: 0,
      cashBandUpper: 2.0,
    });

    expect(state.equityAum[0]).toBeCloseTo(0, 6);
    expect(state.bulletAums[0]).toBeCloseTo(46_000, 6);
    expect(state.cumForcedEquitySales[0]).toBeCloseTo(5_000, 6);
    expect(state.cumForcedBulletSales[0]).toBeCloseTo(4_000, 6);
  });
});

// =====================================================================
// Distribución de bullets proporcional al peso vivo (NO equal-weight)
// =====================================================================

describe('cashflowStep — rebalanceo distribución proporcional', () => {
  it('exceso de cash se distribuye a bullets proporcional a su peso vivo', () => {
    const state = initializeState({
      nSims: 1,
      initialCashAum: 200_000,    // cash 25% (over band)
      initialEquityAum: 240_000,  // 30%
      // bullets desiguales: 60k + 300k = 360k (= 45%)
      initialBulletAums: [60_000, 300_000],
      nBullets: 2,
    });
    // total = 800k, cash_share = 200/800 = 25% > 5%
    // excess = 200 - 0.05*800 = 160k
    // non_cash = 0.95
    // to_bullets = 160 * 0.65/0.95 = 109.47k
    // to_equity = 160 * 0.30/0.95 = 50.53k
    // bullet[0] gets 60/360 = 16.67% of 109.47k = 18.25k
    // bullet[1] gets 300/360 = 83.33% of 109.47k = 91.23k
    const market: CashFlowMarket = { yStateT: flatCurveYstate(1, 0.04) };

    cashflowStep({
      t: 0,
      state,
      planAlloc: { bullets: 0.65, equity: 0.30, cash: 0.05 },
      loanEvent: null,
      market,
      inflowBaseAnnual: 0,
      cashBandUpper: 0.05,
    });

    const excess = 160_000;
    const toBullets = excess * (0.65 / 0.95);
    const toEquity = excess * (0.30 / 0.95);
    expect(state.cashAum[0]).toBeCloseTo(0.05 * 800_000, 2);
    expect(state.equityAum[0]).toBeCloseTo(240_000 + toEquity, 2);
    expect(state.bulletAums[0]).toBeCloseTo(60_000 + (60 / 360) * toBullets, 2);
    expect(state.bulletAums[1]).toBeCloseTo(300_000 + (300 / 360) * toBullets, 2);
  });

  it('si todos los bullets están en 0, distribuye equal-weight', () => {
    const state = initializeState({
      nSims: 1,
      initialCashAum: 500_000,
      initialEquityAum: 100_000,
      initialBulletAums: [0, 0, 0],
      nBullets: 3,
    });
    const market: CashFlowMarket = { yStateT: flatCurveYstate(1, 0.04) };

    cashflowStep({
      t: 0,
      state,
      planAlloc: { bullets: 0.6, equity: 0.4, cash: 0 },
      loanEvent: null,
      market,
      inflowBaseAnnual: 0,
      cashBandUpper: 0.0, // todo el cash se va
    });

    // total inicial = 600k, cash_share = 100% > 0% → rebalance todo
    // excess = 500k. to_bullets = 500 * 0.6 = 300k. to_equity = 500 * 0.4 = 200k.
    // Equal-weight: cada bullet recibe 100k.
    expect(state.cashAum[0]).toBeCloseTo(0, 2);
    expect(state.equityAum[0]).toBeCloseTo(300_000, 2);
    for (let b = 0; b < 3; b++) {
      expect(state.bulletAums[b]).toBeCloseTo(100_000, 2);
    }
  });
});

// =====================================================================
// netWealth = totalAum - loanBalance
// =====================================================================

describe('netWealth', () => {
  it('resta loan balance', () => {
    const state = initializeState({
      nSims: 2,
      initialCashAum: [100, 200],
      initialEquityAum: [300, 400],
      initialBulletAums: [500, 600, 700, 800], // (nSims*nBullets) = 2*2
      nBullets: 2,
    });
    state.loanBalance[0] = 200;
    state.loanBalance[1] = 100;
    const net = netWealth(state);
    // s=0: 100 + 300 + 500 + 600 - 200 = 1300
    // s=1: 200 + 400 + 700 + 800 - 100 = 2000
    expect(net[0]).toBe(1300);
    expect(net[1]).toBe(2000);
  });
});

// =====================================================================
// Loan triggered + accounting
// =====================================================================

describe('cashflowStep — trigger LoanEvent', () => {
  it('al disparar préstamo, se crea liability pero NO se suma a cash_aum', () => {
    const state = initializeState({
      nSims: 1,
      initialCashAum: 100_000,
      initialEquityAum: 500_000,
      initialBulletAums: [400_000],
      nBullets: 1,
    });
    const market: CashFlowMarket = { yStateT: flatCurveYstate(1, 0.04) };
    const loan: LoanEvent = makeLoanEvent({
      triggerMonth: 0,
      amountPctAum: 0.20,
      termMonths: 36,
    });

    cashflowStep({
      t: 0,
      state,
      planAlloc: { bullets: 0.4, equity: 0.5, cash: 0.1 },
      loanEvent: loan,
      market,
      inflowBaseAnnual: 0,
      cashBandUpper: 2.0,
    });

    // total_aum inicial = 1_000_000. Amount = 200_000. El cashflowStep en t=0
    // dispara el préstamo Y paga la primera cuota (cascada cash → equity → bullet).
    expect(state.loanActive[0]).toBe(1);
    expect(state.loanMonthsRemaining[0]).toBe(36 - 1);

    const r = (0.7 * 0.065) / 12; // 4.55% / 12
    const expectedPmt = (200_000 * r) / (1 - Math.pow(1 + r, -36));
    const firstInterest = 200_000 * r;
    const firstPrincipal = expectedPmt - firstInterest;

    // El balance se redujo por el principal del primer pago.
    expect(state.loanBalance[0]).toBeCloseTo(200_000 - firstPrincipal, 2);
    // Cash NO recibió el principal del préstamo (decisión modelado: el préstamo
    // es para gastos extra-portfolio), solo se redujo por el pago.
    expect(state.cashAum[0]).toBeCloseTo(100_000 - expectedPmt, 2);
    expect(state.cumInterestPaid[0]).toBeCloseTo(firstInterest, 2);
  });
});

// =====================================================================
// Cap mensual de equity (enforceMonthlyEquityCap)
// =====================================================================
describe('cashflowStep — enforceMonthlyEquityCap', () => {
  it('drift sin inflow: vende exceso de equity a bullets', () => {
    // Setup: equity ya está por encima del cap por drift de mercado de
    // meses previos. No hay inflow ni rebalanceo de cash en este mes
    // (porque cashShare < 5%). El cap mensual debe forzar la venta.
    const nSims = 1;
    const state = initializeState({
      nSims,
      initialCashAum: 30_000,     // 3% del total — no dispara rebalance de cash
      initialEquityAum: 600_000,  // 60% del total — sobre el cap 50%
      initialBulletAums: [200_000, 170_000], // 37%
      nBullets: 2,
    });
    const totalBefore = totalAum(state)[0];
    const market: CashFlowMarket = { yStateT: flatCurveYstate(nSims, 0.04) };
    const planAlloc: PlanAlloc = { bullets: 0.65, equity: 0.30, cash: 0.05 };

    cashflowStep({
      t: 0,
      state,
      planAlloc,
      loanEvent: null,
      market,
      inflowBaseAnnual: 0,
      cashBandUpper: 0.05,
      enforceMonthlyEquityCap: true,
      eqtyMax: 0.50,
    });

    const totalAfter = totalAum(state)[0];
    // Total preservado (la venta es interna, no sale plata del portafolio)
    expect(totalAfter).toBeCloseTo(totalBefore, 2);
    // Equity exactamente en el cap
    expect(state.equityAum[0] / totalAfter).toBeCloseTo(0.50, 6);
    // Exceso ($100k = 60% − 50%) repartido a bullets proporcional al peso vivo
    const bSum = state.bulletAums[0] + state.bulletAums[1];
    expect(bSum).toBeCloseTo(200_000 + 170_000 + 100_000, 2);
    // Proporción mantenida: bullet 0 era 200/(200+170) ≈ 0.5405 del bSum vivo
    expect(state.bulletAums[0] / bSum).toBeCloseTo(200_000 / 370_000, 6);
  });

  it('inflow diluye sin necesidad de venta cuando el aporte alcanza', () => {
    // Setup: equity overweight pero por poco. El inflow del mes redirige
    // su porción de equity hacia bullets, así equity termina exactamente en
    // el cap sin necesidad de vender.
    const nSims = 1;
    const state = initializeState({
      nSims,
      initialCashAum: 100_000,
      initialEquityAum: 510_000,   // 51% del millón — sobre el cap por 1pt
      initialBulletAums: [195_000, 195_000],
      nBullets: 2,
    });
    const market: CashFlowMarket = { yStateT: flatCurveYstate(nSims, 0.04) };
    const planAlloc: PlanAlloc = { bullets: 0.65, equity: 0.30, cash: 0.05 };

    cashflowStep({
      t: 0,
      state,
      planAlloc,
      loanEvent: null,
      market,
      inflowBaseAnnual: 250_000,
      cashBandUpper: 0.05,
      enforceMonthlyEquityCap: true,
      eqtyMax: 0.50,
    });

    const totalAfter = totalAum(state)[0];
    // Equity en el cap (o ligeramente por debajo, si la dilución sobró)
    expect(state.equityAum[0] / totalAfter).toBeLessThanOrEqual(0.50 + 1e-9);
    // No debió haber venta forzada por cap — solo redistribución del inflow.
    // Si la dilución alcanza, equityAum no decrece respecto al inicial 510k.
    expect(state.equityAum[0]).toBeGreaterThanOrEqual(510_000 - 1e-6);
  });

  it('default OFF: comportamiento histórico, equity puede superar el cap', () => {
    // Sin pasar el flag, el cap mensual no se aplica y la sim termina con
    // equity > 50% (es el bug que queríamos arreglar — confirmado acá).
    const nSims = 1;
    const state = initializeState({
      nSims,
      initialCashAum: 30_000,
      initialEquityAum: 600_000,
      initialBulletAums: [370_000],
      nBullets: 1,
    });
    const market: CashFlowMarket = { yStateT: flatCurveYstate(nSims, 0.04) };
    const planAlloc: PlanAlloc = { bullets: 0.65, equity: 0.30, cash: 0.05 };

    cashflowStep({
      t: 0,
      state,
      planAlloc,
      loanEvent: null,
      market,
      inflowBaseAnnual: 0,
      cashBandUpper: 0.05,
      // enforceMonthlyEquityCap no pasado — default false
    });

    const total = totalAum(state)[0];
    expect(state.equityAum[0] / total).toBeCloseTo(0.60, 6); // sigue overweight
  });

  it('enforce=true sin eqtyMax lanza error explícito', () => {
    const nSims = 1;
    const state = initializeState({
      nSims,
      initialCashAum: 30_000,
      initialEquityAum: 600_000,
      initialBulletAums: [370_000],
      nBullets: 1,
    });
    const market: CashFlowMarket = { yStateT: flatCurveYstate(nSims, 0.04) };
    const planAlloc: PlanAlloc = { bullets: 0.65, equity: 0.30, cash: 0.05 };

    expect(() =>
      cashflowStep({
        t: 0,
        state,
        planAlloc,
        loanEvent: null,
        market,
        inflowBaseAnnual: 0,
        cashBandUpper: 0.05,
        enforceMonthlyEquityCap: true,
        // eqtyMax intencionalmente omitido
      }),
    ).toThrow(/eqtyMax/);
  });
});

/**
 * cashflow.ts — Inflows del endowment + préstamo + rebalanceo táctico.
 *
 * Port de `code/cashflow.py`. Stateful (muta `CashFlowState` en place) y
 * vectorizado sobre n_sims, para integrarse en un forward loop por encima
 * de runRollover/runBootstrap (H5 conectará los flujos al wealth path).
 *
 * Convenciones (matchean Python):
 *   - AUMs en USD absolutos (no fracciones).
 *   - Tasas en decimal anual (e.g., 0.0455 = 4.55%). Conversión a mensual = /12.
 *   - Tipos numéricos: Float64Array para AUMs y métricas; Int32 para counters
 *     enteros; Uint8 para flags booleanos.
 *
 * Decisiones de modelado (mismas que Python):
 *   - El principal del préstamo NO se suma a cash_aum (se va a gastos
 *     operativos extra-portfolio). Solo crea liability.
 *   - Cascada de pago: cash → equity → bullet más corto.
 *   - Exceso de cash sobre la banda se rebalancea a bullets/equity, distribuyendo
 *     bullets proporcional al peso vivo (preserva la estructura de la escalera).
 */

// =====================================================================
// TIPOS PÚBLICOS
// =====================================================================

export type LoanEvent = {
  /** Mes 0-indexed en que se dispara el préstamo. */
  triggerMonth: number;
  /** Fracción del AUM total al momento del disparo (0..0.65). */
  amountPctAum: number;
  /** Multiplicador sobre la tasa base (default 1.0). */
  rateFactor: number;
  /** Spread del banco sobre la tasa base, en bp (default 150 = 1.50%
   *  — oferta Mercantil SOFR + 150bps, mercado estándar cobra SOFR + 220bps). */
  rateSpreadBp: number;
  /** Tasa base: 'sofr' (default, usa IRX como proxy) o 'uy3y' (UST3Y interpolada,
   *  comportamiento histórico antes de rev 2026). */
  rateBase: 'sofr' | 'uy3y';
  /** Plazo en meses (default 36). */
  termMonths: number;
  /** Solo 'amortizing' por ahora. */
  repaymentMode: 'amortizing';
};

/**
 * Construye un LoanEvent con defaults razonables. Valida que los parámetros
 * estén en rango.
 *
 * Defaults Mercantil SFI (revisión 2026):
 *   - rateBase='sofr'  → IRX como proxy de SOFR
 *   - rateSpreadBp=150 → oferta Mercantil (mercado estándar es 220bps)
 *   - rateFactor=1.0   → sin discount adicional (el discount está absorbido
 *                        en el spread reducido)
 *   - amountPctAum hasta 0.65 del AUM al desembolso (antes 0.30).
 */
export function makeLoanEvent(partial: {
  triggerMonth: number;
  amountPctAum: number;
  rateFactor?: number;
  rateSpreadBp?: number;
  rateBase?: 'sofr' | 'uy3y';
  termMonths?: number;
  repaymentMode?: 'amortizing';
}): LoanEvent {
  const ev: LoanEvent = {
    triggerMonth: partial.triggerMonth,
    amountPctAum: partial.amountPctAum,
    rateFactor: partial.rateFactor ?? 1.0,
    rateSpreadBp: partial.rateSpreadBp ?? 150.0,
    rateBase: partial.rateBase ?? 'sofr',
    termMonths: partial.termMonths ?? 36,
    repaymentMode: partial.repaymentMode ?? 'amortizing',
  };
  if (ev.amountPctAum < 0 || ev.amountPctAum > 0.65) {
    throw new Error(
      `makeLoanEvent: amountPctAum=${ev.amountPctAum} fuera de [0, 0.65] ` +
      `(spec rev 2026: max 65% del AUM al desembolso)`,
    );
  }
  if (ev.rateBase !== 'sofr' && ev.rateBase !== 'uy3y') {
    throw new Error(
      `makeLoanEvent: rateBase='${ev.rateBase}' inválido (debe ser 'sofr' o 'uy3y')`,
    );
  }
  if (ev.repaymentMode !== 'amortizing') {
    throw new Error(`makeLoanEvent: solo amortizing soportado`);
  }
  if (ev.termMonths <= 0) {
    throw new Error(`makeLoanEvent: termMonths debe ser > 0`);
  }
  if (ev.triggerMonth < 0) {
    throw new Error(`makeLoanEvent: triggerMonth no puede ser negativo`);
  }
  return ev;
}

export type PlanAlloc = {
  bullets: number; // fracción strategic (0..1)
  equity: number;
  cash: number;
};

export type CashFlowMarket = {
  /**
   * Curva treasury al cierre del mes t, layout [s * 4 + node]
   * con node ∈ {0:IRX, 1:FVX, 2:TNX, 3:TYX}, en decimal.
   */
  yStateT: Float64Array;
};

/**
 * Estado mutable del módulo. Análogo a la dataclass Python pero con typed
 * arrays. `bulletAums` es row-major [nSims × nBullets].
 */
export type CashFlowState = {
  nSims: number;
  nBullets: number;

  cashAum: Float64Array;
  equityAum: Float64Array;
  bulletAums: Float64Array; // [s * nBullets + b]

  loanBalance: Float64Array;
  loanPaymentPerMonth: Float64Array;
  loanRateMonthly: Float64Array;
  loanMonthsRemaining: Int32Array;
  loanActive: Uint8Array; // 0/1

  cumInterestPaid: Float64Array;
  cumForcedEquitySales: Float64Array;
  cumForcedBulletSales: Float64Array;
  cumLoanShortfall: Float64Array;
};

export type CashFlowStepLog = {
  t: number;
  inflow: number;
  loanTriggered?: boolean;
  loanAmountMed?: number;
  loanRateAnnualMed?: number;
  loanPaymentMed?: number;
  loanPmtMed?: number;
  loanInterestMed?: number;
  loanBalanceMed?: number;
  forcedEquitySaleMed?: number;
  forcedBulletSaleMed?: number;
  shortfallMed?: number;
  nActiveLoans?: number;
  rebalancedExcessMed?: number;
  nSimsRebalanced?: number;
  /**
   * Diagnóstico del paso 5 (cap mensual de equity). Mediana del monto
   * vendido de equity a bullets cuando equity > eqtyMax después del
   * rebalanceo de cash. Solo presente si enforceMonthlyEquityCap=true
   * y al menos 1 sim tuvo overshoot.
   */
  equityCapSoldMed?: number;
  /** Cantidad de sims donde se vendió equity por el cap mensual. */
  nSimsEquityCapSold?: number;
};

// =====================================================================
// FÁBRICA DE STATE
// =====================================================================

/**
 * Inicializa CashFlowState. `initialBulletAums` puede ser:
 *   - length nBullets: se replica en cada sim
 *   - length nSims*nBullets: usado tal cual (row-major)
 */
export function initializeState(input: {
  nSims: number;
  initialCashAum: number | ArrayLike<number>;
  initialEquityAum: number | ArrayLike<number>;
  initialBulletAums: ArrayLike<number>;
  nBullets: number;
}): CashFlowState {
  const { nSims, nBullets } = input;
  const bulletAums = new Float64Array(nSims * nBullets);
  const ba = input.initialBulletAums;
  if (ba.length === nBullets) {
    // Replicar
    for (let s = 0; s < nSims; s++) {
      for (let b = 0; b < nBullets; b++) {
        bulletAums[s * nBullets + b] = ba[b];
      }
    }
  } else if (ba.length === nSims * nBullets) {
    for (let i = 0; i < nSims * nBullets; i++) bulletAums[i] = ba[i];
  } else {
    throw new Error(
      `initializeState: initialBulletAums length ${ba.length} ≠ ${nBullets} ni ${nSims * nBullets}`,
    );
  }

  const cashAum = new Float64Array(nSims);
  const equityAum = new Float64Array(nSims);
  const fillScalarOrArray = (
    target: Float64Array,
    src: number | ArrayLike<number>,
  ): void => {
    if (typeof src === 'number') {
      target.fill(src);
    } else {
      if (src.length !== nSims) {
        throw new Error(`initializeState: array length ${src.length} ≠ nSims ${nSims}`);
      }
      for (let s = 0; s < nSims; s++) target[s] = src[s];
    }
  };
  fillScalarOrArray(cashAum, input.initialCashAum);
  fillScalarOrArray(equityAum, input.initialEquityAum);

  return {
    nSims,
    nBullets,
    cashAum,
    equityAum,
    bulletAums,
    loanBalance: new Float64Array(nSims),
    loanPaymentPerMonth: new Float64Array(nSims),
    loanRateMonthly: new Float64Array(nSims),
    loanMonthsRemaining: new Int32Array(nSims),
    loanActive: new Uint8Array(nSims),
    cumInterestPaid: new Float64Array(nSims),
    cumForcedEquitySales: new Float64Array(nSims),
    cumForcedBulletSales: new Float64Array(nSims),
    cumLoanShortfall: new Float64Array(nSims),
  };
}

/** AUM bruto per sim (no resta loan_balance). */
export function totalAum(state: CashFlowState, out?: Float64Array): Float64Array {
  const dst = out ?? new Float64Array(state.nSims);
  for (let s = 0; s < state.nSims; s++) {
    let bSum = 0;
    const off = s * state.nBullets;
    for (let b = 0; b < state.nBullets; b++) bSum += state.bulletAums[off + b];
    dst[s] = state.cashAum[s] + state.equityAum[s] + bSum;
  }
  return dst;
}

/** Wealth neta per sim = totalAum − loanBalance. */
export function netWealth(state: CashFlowState, out?: Float64Array): Float64Array {
  const dst = totalAum(state, out);
  for (let s = 0; s < state.nSims; s++) dst[s] -= state.loanBalance[s];
  return dst;
}

// =====================================================================
// FUNCIONES PURAS (helpers de tasas y flujos)
// =====================================================================

/**
 * Tasa anual decimal del préstamo: factor × (base_rate + spread_bp/10000).
 *
 * Defaults Mercantil 2026: SOFR + 150bps directo (factor=1.0).
 * Para el modo histórico usar factor=0.70, spreadBp=250.
 *
 * @param baseRate tasa base anual decimal (SOFR proxy IRX, o UST3Y); scalar
 *                 o array (n_sims)
 * @param spreadBp spread en bp (default 150 = 1.50%, oferta Mercantil — el
 *                 mercado estándar cobra 220bps)
 * @param factor   multiplicador (default 1.0)
 */
export function computeLoanRate(
  baseRate: number | ArrayLike<number>,
  spreadBp = 150.0,
  factor = 1.0,
): number | Float64Array {
  const sBp = spreadBp / 10000.0;
  if (typeof baseRate === 'number') return factor * (baseRate + sBp);
  const out = new Float64Array(baseRate.length);
  for (let i = 0; i < baseRate.length; i++) out[i] = factor * (baseRate[i] + sBp);
  return out;
}

/**
 * Cuota mensual nivelada para amortización fija.
 *   pmt = P * r / (1 - (1+r)^-n).
 *   Si r==0, pmt = P/n.
 * Vectoriza si `principal`/`rateMonthly` son arrays.
 */
export function computeAmortizingPayment(
  principal: number | ArrayLike<number>,
  rateMonthly: number | ArrayLike<number>,
  nMonths: number,
): number | Float64Array {
  const isArrP = typeof principal !== 'number';
  const isArrR = typeof rateMonthly !== 'number';
  if (!isArrP && !isArrR) {
    const P = principal as number;
    const r = rateMonthly as number;
    return r === 0 ? P / nMonths : (P * r) / (1.0 - Math.pow(1.0 + r, -nMonths));
  }
  const n = isArrP
    ? (principal as ArrayLike<number>).length
    : (rateMonthly as ArrayLike<number>).length;
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const P = isArrP ? (principal as ArrayLike<number>)[i] : (principal as number);
    const r = isArrR ? (rateMonthly as ArrayLike<number>)[i] : (rateMonthly as number);
    out[i] = r === 0 ? P / nMonths : (P * r) / (1.0 - Math.pow(1.0 + r, -nMonths));
  }
  return out;
}

/**
 * Inflow del mes t (0-based). Escalable año-on-año.
 * En el año k (t = 12k..12k+11), inflow = (baseAnnual/12) × (1+growth)^k.
 */
export function computeMonthlyInflow(t: number, baseAnnual = 250_000, growth = 0): number {
  const baseMonthly = baseAnnual / 12.0;
  const yearsElapsed = Math.floor(t / 12);
  return baseMonthly * Math.pow(1.0 + growth, yearsElapsed);
}

/**
 * UST3Y interpolado lineal entre IRX (0.25y) y FVX (5y).
 * `yStateT` layout: [s * 4 + node] con node 0=IRX, 1=FVX, 2=TNX, 3=TYX.
 * Devuelve Float64Array de length nSims.
 */
export function interpolateUy3Y(yStateT: Float64Array, nSims: number): Float64Array {
  const out = new Float64Array(nSims);
  const k = (3.0 - 0.25) / (5.0 - 0.25); // ≈ 0.578947...
  for (let s = 0; s < nSims; s++) {
    const irx = yStateT[s * 4 + 0];
    const fvx = yStateT[s * 4 + 1];
    out[s] = irx + (fvx - irx) * k;
  }
  return out;
}

/** Mediana de un array (no muta el input). */
function median(arr: ArrayLike<number>): number {
  const a = Float64Array.from(arr);
  a.sort();
  const n = a.length;
  if (n === 0) return 0;
  if (n % 2 === 1) return a[(n - 1) >> 1];
  return 0.5 * (a[n / 2 - 1] + a[n / 2]);
}

// =====================================================================
// CASHFLOW STEP — función principal (muta state)
// =====================================================================

export type CashFlowStepInput = {
  t: number;
  state: CashFlowState;
  planAlloc: PlanAlloc;
  loanEvent: LoanEvent | null;
  market: CashFlowMarket;
  inflowBaseAnnual?: number;
  inflowGrowth?: number;
  /** Cash share máximo antes de rebalancear (default 0.05 = 5%). */
  cashBandUpper?: number;
  /**
   * Índice del bullet más corto vivo por sim. Si scalar, aplica a todos. Si
   * array length nSims, varía por sim. Default 0.
   */
  bulletShortestIdx?: number | ArrayLike<number>;
  /**
   * Si true, el rebalanceo del exceso de cash redirige la parte de equity
   * cuando equity ya excede `eqtyMax` (los aportes diluyen hacia bullets en
   * vez de mantener el peso estratégico de equity). Adicionalmente, después
   * del rebalanceo se verifica el peso de equity y, si sigue por encima
   * del cap, se vende exceso a bullets (proporcional al peso vivo).
   *
   * Default false para preservar paridad con el motor Python actual. El
   * caso de estudio del UI lo activa para que la banda dura del rollover
   * se respete mensualmente, no solo en eventos de vencimiento.
   */
  enforceMonthlyEquityCap?: boolean;
  /** Cap duro del peso de equity. Requerido si enforceMonthlyEquityCap=true. */
  eqtyMax?: number;
};

/**
 * Un mes de cashflow accounting. MUTA `state` in-place. Devuelve log diagnóstico.
 *
 * Orden de operaciones (idéntico a Python §1-4):
 *   1. Si t == loanEvent.triggerMonth y no hay préstamo activo, dispara préstamo.
 *   2. Acumula inflow del mes en cash_aum (vectorizado: mismo monto a todas las sims).
 *   3. Si hay préstamo activo (alguna sim), paga cuota con cascada cash → equity → bullet[shortest].
 *   4. Si cash_share > cashBandUpper, rebalancea el exceso a bullets+equity.
 */
export function cashflowStep(input: CashFlowStepInput): CashFlowStepLog {
  const { t, state, planAlloc, loanEvent, market } = input;
  const inflowBaseAnnual = input.inflowBaseAnnual ?? 250_000;
  const inflowGrowth = input.inflowGrowth ?? 0.0;
  const cashBandUpper = input.cashBandUpper ?? 0.05;
  const bulletShortestSrc: number | ArrayLike<number> = input.bulletShortestIdx ?? 0;

  const log: CashFlowStepLog = { t, inflow: 0 };
  const { nSims, nBullets } = state;

  // -----------------------------------------------------------------
  // 1. Trigger préstamo (solo si nadie tiene préstamo activo).
  // -----------------------------------------------------------------
  if (loanEvent !== null && t === loanEvent.triggerMonth) {
    let anyActive = false;
    for (let s = 0; s < nSims; s++) {
      if (state.loanActive[s]) {
        anyActive = true;
        break;
      }
    }
    if (!anyActive) {
      // Tasa base según loanEvent.rateBase:
      //   "sofr" (default 2026): IRX como proxy de SOFR (matchea oferta
      //                          Mercantil SOFR + 150bps).
      //   "uy3y": UST3Y interpolada (comportamiento histórico antes rev 2026).
      let baseRate: Float64Array;
      if (loanEvent.rateBase === 'sofr') {
        baseRate = new Float64Array(nSims);
        for (let s = 0; s < nSims; s++) baseRate[s] = market.yStateT[s * 4 + 0]; // IRX
      } else {
        baseRate = interpolateUy3Y(market.yStateT, nSims);
      }
      const rateAnnual = computeLoanRate(baseRate, loanEvent.rateSpreadBp, loanEvent.rateFactor) as Float64Array;
      const totals = totalAum(state);
      const amounts = new Float64Array(nSims);
      const rateMonthly = new Float64Array(nSims);
      for (let s = 0; s < nSims; s++) {
        amounts[s] = totals[s] * loanEvent.amountPctAum;
        rateMonthly[s] = rateAnnual[s] / 12.0;
      }
      const pmt = computeAmortizingPayment(amounts, rateMonthly, loanEvent.termMonths) as Float64Array;

      for (let s = 0; s < nSims; s++) {
        state.loanBalance[s] = amounts[s];
        state.loanPaymentPerMonth[s] = pmt[s];
        state.loanRateMonthly[s] = rateMonthly[s];
        state.loanMonthsRemaining[s] = loanEvent.termMonths;
        state.loanActive[s] = 1;
      }

      log.loanTriggered = true;
      log.loanAmountMed = median(amounts);
      log.loanRateAnnualMed = median(rateAnnual);
      log.loanPaymentMed = median(pmt);
    }
  }

  // -----------------------------------------------------------------
  // 2. Inflow del mes (mismo monto en todas las sims, determinístico).
  // -----------------------------------------------------------------
  const inflowT = computeMonthlyInflow(t, inflowBaseAnnual, inflowGrowth);
  for (let s = 0; s < nSims; s++) state.cashAum[s] += inflowT;
  log.inflow = inflowT;

  // -----------------------------------------------------------------
  // 3. Pago del préstamo (cascada cash → equity → bullet[shortest]).
  // -----------------------------------------------------------------
  let anyActive = false;
  for (let s = 0; s < nSims; s++) {
    if (state.loanActive[s]) {
      anyActive = true;
      break;
    }
  }
  if (anyActive) {
    // Operamos per-sim. La rama "active only" se preserva: las sims con
    // loanActive=0 no se tocan.
    const pmtArr = new Float64Array(nSims);
    const interestArr = new Float64Array(nSims);
    const interestPaidArr = new Float64Array(nSims);
    const fromEquityArr = new Float64Array(nSims);
    const fromBulletArr = new Float64Array(nSims);
    const shortfallArr = new Float64Array(nSims);

    for (let s = 0; s < nSims; s++) {
      if (!state.loanActive[s]) continue;
      const balance = state.loanBalance[s];
      const rate = state.loanRateMonthly[s];
      const interest = balance * rate;
      interestArr[s] = interest;

      const pmtNominal = state.loanPaymentPerMonth[s];
      const pmt = Math.min(pmtNominal, balance + interest);
      pmtArr[s] = pmt;

      let needed = pmt;

      // Cascada cash → equity → bullet[shortest]
      const fromCash = Math.min(needed, state.cashAum[s]);
      state.cashAum[s] -= fromCash;
      needed -= fromCash;

      const fromEquity = Math.min(needed, state.equityAum[s]);
      state.equityAum[s] -= fromEquity;
      needed -= fromEquity;
      fromEquityArr[s] = fromEquity;

      const bIdx =
        typeof bulletShortestSrc === 'number'
          ? bulletShortestSrc
          : Number(bulletShortestSrc[s]);
      const bOff = s * nBullets + bIdx;
      const fromBullet = Math.min(needed, state.bulletAums[bOff]);
      state.bulletAums[bOff] -= fromBullet;
      needed -= fromBullet;
      fromBulletArr[s] = fromBullet;

      shortfallArr[s] = needed; // > 0 ⇒ no se pudo pagar el mes completo

      // Accounting: lo efectivamente pagado se asigna primero a interés
      const actuallyPaid = pmt - needed;
      const interestPaid = Math.min(actuallyPaid, interest);
      const principalPaid = actuallyPaid - interestPaid;
      interestPaidArr[s] = interestPaid;

      state.loanBalance[s] = balance - principalPaid;
      state.cumInterestPaid[s] += interestPaid;
      state.cumForcedEquitySales[s] += fromEquity;
      state.cumForcedBulletSales[s] += fromBullet;
      state.cumLoanShortfall[s] += needed;
      state.loanMonthsRemaining[s] -= 1;

      // Desactivar si pagado o término cumplido
      if (state.loanBalance[s] <= 1e-6 || state.loanMonthsRemaining[s] <= 0) {
        state.loanActive[s] = 0;
        state.loanBalance[s] = 0;
        state.loanMonthsRemaining[s] = 0;
      }
    }

    // Diagnóstico: medianas SOLO sobre sims que tenían loan activo a inicio del paso.
    // Para alinearnos con Python que usa `pmt`, `interest`, etc. sobre el subset
    // `active`. Aquí los arrays llenan ceros donde la sim no estaba activa, así
    // que filtramos antes de medianar.
    const activeAtStart: number[] = [];
    for (let s = 0; s < nSims; s++) {
      if (pmtArr[s] > 0 || interestArr[s] > 0) activeAtStart.push(s);
    }
    if (activeAtStart.length > 0) {
      const collect = (src: Float64Array): Float64Array => {
        const out = new Float64Array(activeAtStart.length);
        for (let i = 0; i < activeAtStart.length; i++) out[i] = src[activeAtStart[i]];
        return out;
      };
      log.loanPmtMed = median(collect(pmtArr));
      log.loanInterestMed = median(collect(interestPaidArr));
      log.forcedEquitySaleMed = median(collect(fromEquityArr));
      log.forcedBulletSaleMed = median(collect(fromBulletArr));
      log.shortfallMed = median(collect(shortfallArr));
    }
    log.loanBalanceMed = median(state.loanBalance);
    let nAct = 0;
    for (let s = 0; s < nSims; s++) if (state.loanActive[s]) nAct++;
    log.nActiveLoans = nAct;
  }

  // -----------------------------------------------------------------
  // 4. Rebalanceo del exceso de cash sobre cashBandUpper.
  //    Solo validamos planAlloc.cash si hay al menos una sim que necesite
  //    rebalance (matchea Python: el check está dentro de `if over.any():`).
  //    Si enforceMonthlyEquityCap=true, la porción de equity del exceso de
  //    cash se capa al headroom disponible (eqtyMax - peso vivo), de modo
  //    que los aportes "diluyen" hacia bullets en vez de mantener equity
  //    overweight.
  // -----------------------------------------------------------------
  const enforceCap = input.enforceMonthlyEquityCap === true;
  const eqtyMax = input.eqtyMax;
  if (enforceCap && (eqtyMax === undefined || eqtyMax < 0 || eqtyMax > 1)) {
    throw new Error(
      `cashflowStep: enforceMonthlyEquityCap=true requiere eqtyMax en [0,1], recibido ${eqtyMax}`,
    );
  }

  const totals = totalAum(state);
  const overSims: number[] = [];
  for (let s = 0; s < nSims; s++) {
    const safeTotal = totals[s] > 1e-9 ? totals[s] : 1e-9;
    const cashShare = state.cashAum[s] / safeTotal;
    if (cashShare > cashBandUpper) overSims.push(s);
  }

  if (overSims.length > 0) {
    const nonCash = 1.0 - planAlloc.cash;
    if (nonCash <= 0) {
      throw new Error(
        `cashflowStep: planAlloc.cash=${planAlloc.cash} no deja espacio para bullets/equity`,
      );
    }
    const bulletShareNorm = planAlloc.bullets / nonCash;
    const equityShareNorm = planAlloc.equity / nonCash;

    let nRebalanced = 0;
    const excessLog: number[] = [];
    for (const s of overSims) {
      const excess = state.cashAum[s] - cashBandUpper * totals[s];
      let toEquity = excess * equityShareNorm;
      let toBulletsTotal = excess * bulletShareNorm;

      if (enforceCap) {
        // Cap la porción a equity al headroom restante (eqtyMaxAum − peso vivo).
        // Lo que no entra a equity se reasigna a bullets, así el exceso de
        // cash se consume entero sin overshoot del cap.
        const eqtyMaxAum = (eqtyMax as number) * totals[s];
        const headroom = Math.max(0, eqtyMaxAum - state.equityAum[s]);
        if (toEquity > headroom) {
          const overflow = toEquity - headroom;
          toEquity = headroom;
          toBulletsTotal += overflow;
        }
      }

      // Distribuir bullets proporcional al peso vivo
      const bOff = s * nBullets;
      let bSum = 0;
      for (let b = 0; b < nBullets; b++) bSum += state.bulletAums[bOff + b];
      if (bSum > 0) {
        for (let b = 0; b < nBullets; b++) {
          const prop = state.bulletAums[bOff + b] / bSum;
          state.bulletAums[bOff + b] += prop * toBulletsTotal;
        }
      } else {
        // Si todos los bullets están en 0, repartir equal-weight
        const each = toBulletsTotal / nBullets;
        for (let b = 0; b < nBullets; b++) state.bulletAums[bOff + b] += each;
      }
      state.equityAum[s] += toEquity;
      state.cashAum[s] -= excess;

      excessLog.push(excess);
      nRebalanced++;
    }
    log.rebalancedExcessMed = median(excessLog);
    log.nSimsRebalanced = nRebalanced;
  }

  // -----------------------------------------------------------------
  // 5. Enforcement final del cap de equity (solo si enforceMonthlyEquityCap=true).
  //    Si después del rebalanceo del paso 4 el peso de equity sigue por
  //    encima del cap (drift de mercado mes a mes que el aporte solo no
  //    alcanzó a diluir), se vende el excedente a bullets, proporcional al
  //    peso vivo. Si no hay bullets vivos (raro), va a cash.
  // -----------------------------------------------------------------
  if (enforceCap) {
    const totals2 = totalAum(state);
    let nForcedSold = 0;
    const forcedSoldLog: number[] = [];
    for (let s = 0; s < nSims; s++) {
      const safeTotal = totals2[s] > 1e-9 ? totals2[s] : 1e-9;
      const eqtyShare = state.equityAum[s] / safeTotal;
      if (eqtyShare > (eqtyMax as number) + 1e-9) {
        const eqtyMaxAum = (eqtyMax as number) * totals2[s];
        const sellAmount = state.equityAum[s] - eqtyMaxAum;
        state.equityAum[s] = eqtyMaxAum;

        const bOff = s * nBullets;
        let bSum = 0;
        for (let b = 0; b < nBullets; b++) bSum += state.bulletAums[bOff + b];
        if (bSum > 0) {
          for (let b = 0; b < nBullets; b++) {
            const prop = state.bulletAums[bOff + b] / bSum;
            state.bulletAums[bOff + b] += prop * sellAmount;
          }
        } else {
          state.cashAum[s] += sellAmount;
        }

        forcedSoldLog.push(sellAmount);
        nForcedSold++;
      }
    }
    if (nForcedSold > 0) {
      log.equityCapSoldMed = median(forcedSoldLog);
      log.nSimsEquityCapSold = nForcedSold;
    }
  }

  return log;
}

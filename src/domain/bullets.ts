/**
 * src/domain/bullets.ts — Modelo paramétrico de bullets (v2 H2a).
 *
 * Port de `estudios-a-la-medida/code/bullet_tier.py` a TypeScript.
 *
 * Bullet = ETF de bonos a vencimiento (iBonds UCITS, BulletShares). Modelado
 * con descomposición explícita:
 *
 *   r_t = carry + curve + roll + convex
 *
 * donde
 *   carry  = ytm(t-1, m_{t-1}) / 12
 *   curve  = − dur_{t-1} × Δy_curve
 *   roll   = − dur_{t-1} × Δy_roll              (POSITIVO en curva positiva)
 *   convex = 0.5 × cv × Δy_total²
 *
 *   Δy_total = ytm(t, m_t)        − ytm(t-1, m_{t-1})    cambio total
 *   Δy_curve = ytm(t,   m_{t-1})  − ytm(t-1, m_{t-1})    componente shift de curva
 *   Δy_roll  = ytm(t-1, m_t)      − ytm(t-1, m_{t-1})    componente roll-down
 *
 * Convención de yields: DECIMAL (0.04 = 4%), NO porcentaje.
 *
 * Curva treasury: 4 nodos en [0.25, 5, 10, 30] años, interpolación lineal entre
 * nodos y extrapolación plana fuera. (El Python original usa PCHIP monotónico
 * scipy; lineal alcanza para nuestra precisión y evita la dep de PCHIP en TS.)
 *
 * Tests: ver `bullets.test.ts` — replica T1/T2/T3 del Python.
 */

/** Maduridades (años) de los nodos de la curva treasury. */
export const NODE_MATURITIES: readonly number[] = [0.25, 5.0, 10.0, 30.0];

/** Nombres de los nodos, en el orden de NODE_MATURITIES. */
export const NODE_NAMES = ['IRX', 'FVX', 'TNX', 'TYX'] as const;

export type NodeName = (typeof NODE_NAMES)[number];

/** Decay de duración: para corporate IG la duración modificada cae casi 1:1 con el tiempo. */
export const DUR_DECAY_PER_YEAR = 1.0;

/**
 * Definición de un bullet (real o sintético).
 *
 *   name           identificador interno (e.g., 'ID28', 'ID35S')
 *   maturityY      años a vencimiento desde t=0 (e.g., 2.6 para Dec 2028 con t0=May 2026)
 *   durInitY       duración modificada inicial en años (~0.93 × maturityY para IG)
 *   isSynthetic    si true, ytm inicial se deriva de la curva en t=0 + spread
 *                  si false, ytm puede pasarse externamente vía ytmOverride
 *   ytmOverride    yield inicial fijado externamente (decimal); opcional
 */
export interface BulletDef {
  readonly name: string;
  readonly maturityY: number;
  readonly durInitY: number;
  readonly isSynthetic: boolean;
  readonly ytmOverride?: number;
}

/**
 * Interpola un yield a una maturidad arbitraria usando los 4 nodos de la curva.
 *
 * @param nodeYields  yields en decimal en los 4 nodos [IRX, FVX, TNX, TYX]
 * @param maturity    maturidad a evaluar en años (e.g., 3.5)
 * @returns           yield interpolado en decimal
 *
 * Outside [0.25, 30] usa extrapolación plana (igual al nodo más cercano).
 */
export function interpCurve(nodeYields: ArrayLike<number>, maturity: number): number {
  if (nodeYields.length !== 4) {
    throw new Error(`interpCurve: expected 4 node yields, got ${nodeYields.length}`);
  }
  if (maturity <= NODE_MATURITIES[0]) return nodeYields[0];
  if (maturity >= NODE_MATURITIES[3]) return nodeYields[3];
  for (let i = 0; i < 3; i++) {
    const m0 = NODE_MATURITIES[i];
    const m1 = NODE_MATURITIES[i + 1];
    if (maturity >= m0 && maturity <= m1) {
      const t = (maturity - m0) / (m1 - m0);
      return nodeYields[i] * (1 - t) + nodeYields[i + 1] * t;
    }
  }
  // Unreachable given the guards above
  return nodeYields[3];
}

/**
 * Convexidad por defecto del bullet, derivada de la duración.
 *   cv ≈ dur² + dur
 *
 * Regla empírica calibrada en `bullet_tier.py` — captura el orden de magnitud
 * correcto sin necesidad de calibración fina por vintage. La convexidad decae
 * con dur² conforme el bullet madura.
 */
export function convexityFromDur(durY: number): number {
  return durY * durY + durY;
}

// =============================================================================
// CÁLCULO MENSUAL DE RETORNO (single bullet, single month)
// =============================================================================

/**
 * Estado de entrada para calcular el retorno mensual de un bullet:
 *
 *   ytmPrev        ytm(t-1, m_{t-1})  yield a la maturidad anterior al inicio del mes
 *   ytmT           ytm(t,   m_t)       yield a la maturidad nueva al fin del mes
 *   ytmCurveOnly   ytm(t,   m_{t-1})   yield a la maturidad ANTERIOR pero con curva nueva
 *                  (sirve para aislar el componente curve del componente roll)
 *   durPrev        duración del bullet al inicio del mes (años)
 *   cv             convexidad (años²)
 */
export interface BulletMonthInput {
  readonly ytmPrev: number;
  readonly ytmT: number;
  readonly ytmCurveOnly: number;
  readonly durPrev: number;
  readonly cv: number;
}

/** Descomposición del retorno mensual del bullet. */
export interface BulletMonthDecomp {
  readonly total: number;
  readonly carry: number;
  readonly curve: number;
  readonly roll: number;
  readonly convex: number;
}

/**
 * Calcula el retorno mensual de un bullet descompuesto en carry / curve / roll / convex.
 *
 * Formula (ver bullet_tier.py docstring):
 *   Δy_total = ytmT − ytmPrev
 *   Δy_curve = ytmCurveOnly − ytmPrev   (cuánto cambió la curva a la maturidad fija m_{t-1})
 *   Δy_roll  = ytmT − ytmCurveOnly      (cuánto cambió por moverse a m_t en la curva nueva)
 *
 *   r = carry − dur × Δy_curve − dur × Δy_roll + 0.5 × cv × Δy_total²
 */
export function bulletReturnDecomp(input: BulletMonthInput): BulletMonthDecomp {
  const dyTotal = input.ytmT - input.ytmPrev;
  const dyCurve = input.ytmCurveOnly - input.ytmPrev;
  const dyRoll  = input.ytmT - input.ytmCurveOnly;

  const carry  = input.ytmPrev / 12;
  const curve  = -input.durPrev * dyCurve;
  const roll   = -input.durPrev * dyRoll;
  const convex = 0.5 * input.cv * dyTotal * dyTotal;

  return {
    total: carry + curve + roll + convex,
    carry,
    curve,
    roll,
    convex,
  };
}

// =============================================================================
// TRAYECTORIA DEL BULLET — multi-month, sin bootstrap (deterministic curve)
// =============================================================================

/**
 * Simula la trayectoria de un bullet sobre una secuencia DETERMINÍSTICA de
 * curvas (útil para tests y validación analítica). Para Monte Carlo con
 * bootstrap, ver el integrador en bootstrap.ts (H2b).
 *
 * @param bullet    definición del bullet
 * @param curves    matriz de curvas (T+1 filas × 4 columnas) — curva al inicio
 *                  más T curvas posteriores. curves[0] = curva en t=0.
 * @param spread0   spread inicial sobre la curva treasury (decimal); fijo durante
 *                  la trayectoria
 * @returns         array de length T con descomposición por mes
 */
export function simulateBulletPath(
  bullet: BulletDef,
  curves: ReadonlyArray<readonly number[]>,
  spread0: number = 0,
): BulletMonthDecomp[] {
  if (curves.length < 2) {
    throw new Error('simulateBulletPath: necesita al menos 2 filas de curva (initial + 1 future)');
  }
  const T = curves.length - 1;
  const out: BulletMonthDecomp[] = new Array(T);

  // Estado: maturity y duration evolucionan mes a mes
  let mPrev = bullet.maturityY;
  let durPrev = bullet.durInitY;
  let ytmPrev: number;

  if (bullet.ytmOverride !== undefined && !bullet.isSynthetic) {
    ytmPrev = bullet.ytmOverride;
  } else {
    ytmPrev = interpCurve(curves[0], mPrev) + spread0;
  }
  const cv = convexityFromDur(durPrev);

  for (let t = 0; t < T; t++) {
    const mT = mPrev - 1 / 12;
    const curveT = curves[t + 1];
    // ytm a la maturidad ANTERIOR con curva NUEVA — aísla el componente curve
    const ytmCurveOnly = interpCurve(curveT, mPrev) + spread0;
    // ytm a la maturidad NUEVA con curva NUEVA
    const ytmT = interpCurve(curveT, mT) + spread0;

    out[t] = bulletReturnDecomp({
      ytmPrev,
      ytmT,
      ytmCurveOnly,
      durPrev,
      cv,
    });

    // Avanzar estado
    mPrev = mT;
    durPrev = Math.max(0, durPrev - 1 / 12);
    ytmPrev = ytmT;
  }

  return out;
}

// =============================================================================
// MONTE CARLO BULLET RETURNS (vectorizado para integrarse en el worker)
// =============================================================================

export interface ComputeBulletReturnsInput {
  readonly bullets: ReadonlyArray<BulletDef>;
  /** Curva en t=0 (antes del primer paso), en decimal: [IRX, FVX, TNX, TYX]. */
  readonly initialCurve: readonly [number, number, number, number];
  /** Yield paths end-of-month simulados, decimal. Cada Float32Array de length [nPaths × horizonMonths]. */
  readonly yieldPaths: {
    readonly IRX: Float32Array;
    readonly FVX: Float32Array;
    readonly TNX: Float32Array;
    readonly TYX: Float32Array;
  };
  readonly nPaths: number;
  readonly horizonMonths: number;
  /** Spread sobre la curva treasury, en decimal. e.g., 0.011 = 110 bp. */
  readonly initialSpread: number;
}

export interface ComputeBulletReturnsOutput {
  /** Para cada bullet, Float32Array row-major [nPaths × horizonMonths] con retorno mensual. */
  readonly returns: ReadonlyArray<Float32Array>;
  /** Para cada bullet, Uint8Array row-major [nPaths × horizonMonths] (1 = vivo, 0 = vencido). */
  readonly alive: ReadonlyArray<Uint8Array>;
}

/**
 * Calcula los retornos mensuales de un conjunto de bullets a lo largo de N
 * paths bootstrap, dada la trayectoria de yields ya simulada (con damping).
 *
 * Aprovecha que la worker ya simula el yield path una vez, así que solo le
 * pasamos esos paths y NO recomputamos la dinámica de tasas. La integración
 * con bootstrap.ts está en `runBootstrap` (H2b).
 *
 * Memoria: nBullets × nPaths × horizonMonths × 4 bytes (returns) + 1 byte
 * (alive). Para 11 bullets × 5000 paths × 120 meses = ~33 MB returns + 6.6 MB
 * alive. Aceptable.
 */
export function computeBulletReturns(input: ComputeBulletReturnsInput): ComputeBulletReturnsOutput {
  const { bullets, initialCurve, yieldPaths, nPaths, horizonMonths, initialSpread } = input;
  const nBullets = bullets.length;

  // Allocate output buffers
  const returns: Float32Array[] = new Array(nBullets);
  const alive: Uint8Array[] = new Array(nBullets);
  for (let b = 0; b < nBullets; b++) {
    returns[b] = new Float32Array(nPaths * horizonMonths);
    alive[b] = new Uint8Array(nPaths * horizonMonths);
  }

  // Per-bullet state buffers (reusados across sims con reset al inicio de cada sim)
  const matState = new Float32Array(nBullets);
  const durState = new Float32Array(nBullets);

  // Buffer de curvas (evita re-allocar cada iteración)
  const prevCurve = new Float32Array(4);
  const newCurve = new Float32Array(4);

  for (let s = 0; s < nPaths; s++) {
    // Reset estado por sim
    for (let b = 0; b < nBullets; b++) {
      matState[b] = bullets[b].maturityY;
      durState[b] = bullets[b].durInitY;
    }
    // Initial curve at t=0
    prevCurve[0] = initialCurve[0];
    prevCurve[1] = initialCurve[1];
    prevCurve[2] = initialCurve[2];
    prevCurve[3] = initialCurve[3];

    const sOff = s * horizonMonths;
    for (let t = 0; t < horizonMonths; t++) {
      const cellIdx = sOff + t;
      newCurve[0] = yieldPaths.IRX[cellIdx];
      newCurve[1] = yieldPaths.FVX[cellIdx];
      newCurve[2] = yieldPaths.TNX[cellIdx];
      newCurve[3] = yieldPaths.TYX[cellIdx];

      for (let b = 0; b < nBullets; b++) {
        const mPrev = matState[b];
        if (mPrev <= 0) {
          // Bullet ya venció — retornos 0, no vivo
          returns[b][cellIdx] = 0;
          alive[b][cellIdx] = 0;
          continue;
        }
        const mNew = mPrev - 1 / 12;
        const durPrev = durState[b];
        const cv = convexityFromDur(durPrev);

        const ytmPrev = interpCurve(prevCurve, mPrev) + initialSpread;
        const ytmCurveOnly = interpCurve(newCurve, mPrev) + initialSpread;
        // Usamos max(mNew, 0.001) para evitar interpolar fuera del rango cuando el bullet está casi vencido
        const mNewClamped = mNew > 0.001 ? mNew : 0.001;
        const ytmT = interpCurve(newCurve, mNewClamped) + initialSpread;

        const dyTotal = ytmT - ytmPrev;
        const dyCurve = ytmCurveOnly - ytmPrev;
        const dyRoll  = ytmT - ytmCurveOnly;

        const carry  = ytmPrev / 12;
        const curveR = -durPrev * dyCurve;
        const rollR  = -durPrev * dyRoll;
        const convex = 0.5 * cv * dyTotal * dyTotal;

        returns[b][cellIdx] = carry + curveR + rollR + convex;
        alive[b][cellIdx] = mNew > 0 ? 1 : 0;

        // Update state para próximo mes
        matState[b] = mNew;
        durState[b] = durPrev - 1 / 12;
        if (durState[b] < 0) durState[b] = 0;
      }

      // prevCurve = newCurve para próxima iteración
      prevCurve[0] = newCurve[0];
      prevCurve[1] = newCurve[1];
      prevCurve[2] = newCurve[2];
      prevCurve[3] = newCurve[3];
    }
  }

  return { returns, alive };
}

// =============================================================================
// CONSTRUCCIÓN DE LADDER POR DEFAULT (caso TBSC: iBonds 2026-2034)
// =============================================================================

/**
 * Calcula los meses (decimales) entre dos fechas, asumiendo mes calendario.
 */
export function monthsBetween(dFrom: Date, dTo: Date): number {
  const months = (dTo.getFullYear() - dFrom.getFullYear()) * 12 + (dTo.getMonth() - dFrom.getMonth());
  const daysDiff = dTo.getDate() - dFrom.getDate();
  return months + daysDiff / 30.4375;
}

/**
 * Lineup default del caso TBSC: iBonds UCITS USD Corporate vintages 2026–2034
 * (9 reales) + 2 sintéticos para extender hasta 2036. Cada uno con duración
 * inicial = 0.93 × maturity (regla de pulgar IG corporate).
 *
 * @param t0  fecha de referencia (default: 2026-05-15)
 */
export function defaultBulletLineup(t0?: Date): BulletDef[] {
  const start = t0 ?? new Date(2026, 4, 15); // mes 4 = mayo (0-indexed)
  const dec15 = (y: number) => new Date(y, 11, 15);

  const bullets: BulletDef[] = [];

  // iBonds reales 2026-2034
  for (let v = 2026; v <= 2034; v++) {
    const mY = monthsBetween(start, dec15(v)) / 12;
    bullets.push({
      name: `ID${(v % 100).toString().padStart(2, '0')}`,
      maturityY: mY,
      durInitY: mY * 0.93,
      isSynthetic: false,
    });
  }
  // Sintéticos para extender el ladder
  for (const v of [2035, 2036]) {
    const mY = monthsBetween(start, dec15(v)) / 12;
    bullets.push({
      name: `ID${(v % 100).toString().padStart(2, '0')}S`,
      maturityY: mY,
      durInitY: mY * 0.93,
      isSynthetic: true,
    });
  }
  return bullets;
}

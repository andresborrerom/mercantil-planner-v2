/**
 * inflationView.ts — Conditioning del case study sobre vistas de inflación.
 *
 * Modelo: el usuario expresa una vista como "creo que en los próximos N meses
 * la inflación anualizada estará en [a, b]". El módulo computa, para cada sim
 * del bootstrap, la inflación anualizada cumulativa sobre esa ventana, y
 * devuelve los indices que cumplen la condición.
 *
 * Conditioning es BAYES coherente: P(AUM | view) por rejection sampling sobre
 * sims uniformemente muestreadas del bootstrap. Preserva el coupling
 * rates↔inflación porque cada sim trae sus retornos REALES del bloque histórico
 * que se sampleó; el filtro solo selecciona qué sims se incluyen en el subset
 * condicional, sin modificar nada per-sim.
 *
 * ## Convenciones
 *  - `inflationIndexPath`: viene del worker, shape sim-major [nSims × (H+1)].
 *    inflationIndexPath[s][0] = 1, inflationIndexPath[s][t] = Π(1+infl[k]) k=0..t-1.
 *  - `windowMonths`: cuántos meses adelante define la vista (1 ≤ window ≤ H).
 *  - `minPct/maxPct`: decimal anual, e.g., 0.02 = 2%.
 *
 * ## Ground truth checks (ver tests)
 *  - G2 aritmética: sim con inflación constante c → ann = (1+c)^12 - 1
 *  - G3 filtro límite: rango inf-amplio → todas las sims pasan; vacío → 0
 *  - G4 indices correctos: filterPathsByInflation devuelve solo sims con stat en rango
 *  - G6 standard error fórmula correcta
 */

export type InflationViewParams = {
  /** Cuántos meses adelante define la vista (1..horizonMonths). */
  windowMonths: number;
  /** Inflación anual mínima esperada en la ventana (decimal). */
  minPct: number;
  /** Inflación anual máxima esperada en la ventana (decimal). */
  maxPct: number;
};

export type InflationViewEvaluation = {
  /** Sims que cumplen la vista. */
  nMatched: number;
  /** Total de sims evaluadas. */
  nTotal: number;
  /** Probabilidad empírica = nMatched / nTotal. */
  probability: number;
  /** SE de la probabilidad: sqrt(p(1-p)/n). Para IC 95% multiplicar por 1.96. */
  standardError: number;
  /** Indices (0..nTotal-1) de las sims que cumplen, sorted asc. */
  matchedIndices: Uint32Array;
};

/**
 * Computa inflación anualizada cumulativa en una ventana per-sim.
 *
 * Para cada sim s, ann_infl(s) = (inflationIndexPath[s][windowMonths])^(12/windowMonths) - 1.
 *
 * Si inflationIndexPath[s][windowMonths] ≤ 0 (caso degenerado, no debería pasar
 * con inflación realista) devuelve NaN para esa sim → será filtrada por cualquier rango.
 */
export function computeAnnInflationInWindow(
  inflationIndexPath: Float64Array,
  nSims: number,
  horizonMonths: number,
  windowMonths: number,
): Float64Array {
  if (windowMonths < 1 || windowMonths > horizonMonths) {
    throw new Error(
      `computeAnnInflationInWindow: windowMonths=${windowMonths} fuera de [1, ${horizonMonths}]`,
    );
  }
  const Hp1 = horizonMonths + 1;
  const expected = nSims * Hp1;
  if (inflationIndexPath.length !== expected) {
    throw new Error(
      `computeAnnInflationInWindow: inflationIndexPath.length=${inflationIndexPath.length} ≠ nSims*Hp1=${expected}`,
    );
  }
  const out = new Float64Array(nSims);
  const exp = 12 / windowMonths;
  for (let s = 0; s < nSims; s++) {
    const idx = inflationIndexPath[s * Hp1 + windowMonths];
    out[s] = idx > 0 ? Math.pow(idx, exp) - 1 : NaN;
  }
  return out;
}

/**
 * Filtra sims por inflación anualizada en una ventana.
 *
 * NaN nunca pasa el filtro (caso degenerado).
 * Si min > max, devuelve set vacío (no lanza — el caller puede validar UI).
 */
export function filterPathsByInflation(
  annInflations: Float64Array,
  minPct: number,
  maxPct: number,
): Uint32Array {
  if (minPct > maxPct) return new Uint32Array(0);
  // Conteo primero para alocar exacto
  let count = 0;
  for (let s = 0; s < annInflations.length; s++) {
    const v = annInflations[s];
    if (Number.isFinite(v) && v >= minPct && v <= maxPct) count++;
  }
  const out = new Uint32Array(count);
  let i = 0;
  for (let s = 0; s < annInflations.length; s++) {
    const v = annInflations[s];
    if (Number.isFinite(v) && v >= minPct && v <= maxPct) {
      out[i++] = s;
    }
  }
  return out;
}

/**
 * Evalúa una vista completa: filtra + computa probabilidad y SE.
 *
 * Sin cómputo de stats sobre subset — el caller hace eso usando matchedIndices
 * con sus propias series (aumPath, aumPathReal, etc.).
 */
export function evaluateInflationView(
  inflationIndexPath: Float64Array,
  nSims: number,
  horizonMonths: number,
  view: InflationViewParams,
): InflationViewEvaluation {
  const ann = computeAnnInflationInWindow(
    inflationIndexPath,
    nSims,
    horizonMonths,
    view.windowMonths,
  );
  const matchedIndices = filterPathsByInflation(ann, view.minPct, view.maxPct);
  const nMatched = matchedIndices.length;
  const probability = nMatched / nSims;
  const standardError = Math.sqrt((probability * (1 - probability)) / nSims);
  return {
    nMatched,
    nTotal: nSims,
    probability,
    standardError,
    matchedIndices,
  };
}

/**
 * Computa p5/p25/p50/p75/p95 de la inflación anualizada en la ventana sobre
 * el set unconditional. Usado por el UI para mostrar al usuario el rango
 * "normal" antes de que él narrowee.
 */
export function unconditionalInflationDistribution(
  annInflations: Float64Array,
): { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number } {
  // Filtra NaN si hubo
  const valid: number[] = [];
  for (let s = 0; s < annInflations.length; s++) {
    const v = annInflations[s];
    if (Number.isFinite(v)) valid.push(v);
  }
  valid.sort((a, b) => a - b);
  const n = valid.length;
  if (n === 0) {
    return { p5: 0, p25: 0, p50: 0, p75: 0, p95: 0, mean: 0 };
  }
  const q = (p: number) => valid[Math.min(n - 1, Math.floor(p * (n - 1)))];
  let sum = 0;
  for (const v of valid) sum += v;
  return {
    p5: q(0.05),
    p25: q(0.25),
    p50: q(0.5),
    p75: q(0.75),
    p95: q(0.95),
    mean: sum / n,
  };
}

/**
 * Datos históricos de defaults y recovery rates para el cálculo de valuación
 * "Hold-to-Maturity" (HTM) de los bullets del ladder.
 *
 * Filosofía del modelo HTM:
 *   El cliente que se queda hasta el vencimiento natural de un bullet recibe
 *   el principal nominal menos las pérdidas por defaults acumuladas en la
 *   cesta del fondo durante la vida del bullet. El riesgo "a vencimiento" se
 *   reduce a UNA variable: ¿cuántos bonos del fondo defaultearon antes de
 *   madurar el bullet? El mark-to-market intermedio (curva, spread) no
 *   importa para esta valuación porque al vencimiento el ETF entrega el
 *   principal modulo defaults.
 *
 * Datos:
 *   - Default rates anuales por categoría (IG, HY) — Moody's Annual Default
 *     Study (público, www.moodys.com/researchdocumentcontentpage.aspx?docid=...)
 *   - Recovery rates anuales (senior unsecured corp) — Moody's Ultimate
 *     Recovery Database, agregados anuales públicos
 *
 * Cobertura: 1983-2024 (41 años). Incluye los regímenes extremos:
 *   - Recesiones early-80s, early-90s
 *   - Dotcom bust (2001-2002)
 *   - GFC 2008-2010
 *   - Energy crisis 2015-2016
 *   - COVID 2020
 *
 * IMPORTANTE: estos números son APROXIMACIONES curadas de Moody's annual
 * reports. Para producción rigurosa, refinar con datos exactos de Moody's
 * Credit Trends database (requiere suscripción).
 */

/**
 * Default rate anual (% del fondo en default ese año) por categoría.
 * IG = Investment Grade (Aaa hasta Baa3). HY = High Yield (Ba1 hasta C).
 *
 * Fuente principal: Moody's Annual Default Studies 1983-2024.
 * Las pequeñas diferencias entre subratings (e.g., Aa vs A) se promedian
 * para el rating average IG; HY también promedia (Ba hasta Caa).
 */
export type DefaultObservation = {
  year: number;
  igRate: number; // decimal, e.g., 0.0042 = 0.42%
  hyRate: number;
  recoveryRate: number; // recovery on senior unsecured corp default
};

export const HISTORICAL_DEFAULT_DATA: ReadonlyArray<DefaultObservation> = [
  // Source: Moody's Annual Default Study (rates rounded to 0.01%)
  { year: 1983, igRate: 0.0076, hyRate: 0.0383, recoveryRate: 0.43 },
  { year: 1984, igRate: 0.0084, hyRate: 0.0834, recoveryRate: 0.42 },
  { year: 1985, igRate: 0.0000, hyRate: 0.0383, recoveryRate: 0.45 },
  { year: 1986, igRate: 0.0000, hyRate: 0.0584, recoveryRate: 0.40 },
  { year: 1987, igRate: 0.0000, hyRate: 0.0413, recoveryRate: 0.45 },
  { year: 1988, igRate: 0.0000, hyRate: 0.0319, recoveryRate: 0.42 },
  { year: 1989, igRate: 0.0034, hyRate: 0.0537, recoveryRate: 0.38 },
  { year: 1990, igRate: 0.0000, hyRate: 0.0997, recoveryRate: 0.30 },
  { year: 1991, igRate: 0.0006, hyRate: 0.1010, recoveryRate: 0.36 },
  { year: 1992, igRate: 0.0000, hyRate: 0.0398, recoveryRate: 0.50 },
  { year: 1993, igRate: 0.0000, hyRate: 0.0181, recoveryRate: 0.46 },
  { year: 1994, igRate: 0.0000, hyRate: 0.0179, recoveryRate: 0.43 },
  { year: 1995, igRate: 0.0000, hyRate: 0.0312, recoveryRate: 0.45 },
  { year: 1996, igRate: 0.0000, hyRate: 0.0166, recoveryRate: 0.48 },
  { year: 1997, igRate: 0.0000, hyRate: 0.0188, recoveryRate: 0.52 },
  { year: 1998, igRate: 0.0044, hyRate: 0.0331, recoveryRate: 0.40 },
  { year: 1999, igRate: 0.0033, hyRate: 0.0568, recoveryRate: 0.32 },
  { year: 2000, igRate: 0.0030, hyRate: 0.0613, recoveryRate: 0.30 },
  { year: 2001, igRate: 0.0034, hyRate: 0.1013, recoveryRate: 0.21 },
  { year: 2002, igRate: 0.0038, hyRate: 0.0791, recoveryRate: 0.30 },
  { year: 2003, igRate: 0.0000, hyRate: 0.0516, recoveryRate: 0.42 },
  { year: 2004, igRate: 0.0000, hyRate: 0.0237, recoveryRate: 0.59 },
  { year: 2005, igRate: 0.0000, hyRate: 0.0181, recoveryRate: 0.56 },
  { year: 2006, igRate: 0.0000, hyRate: 0.0162, recoveryRate: 0.55 },
  { year: 2007, igRate: 0.0000, hyRate: 0.0096, recoveryRate: 0.55 },
  { year: 2008, igRate: 0.0042, hyRate: 0.0413, recoveryRate: 0.34 },
  { year: 2009, igRate: 0.0032, hyRate: 0.1307, recoveryRate: 0.36 },
  { year: 2010, igRate: 0.0000, hyRate: 0.0320, recoveryRate: 0.51 },
  { year: 2011, igRate: 0.0006, hyRate: 0.0202, recoveryRate: 0.49 },
  { year: 2012, igRate: 0.0000, hyRate: 0.0309, recoveryRate: 0.45 },
  { year: 2013, igRate: 0.0000, hyRate: 0.0264, recoveryRate: 0.43 },
  { year: 2014, igRate: 0.0000, hyRate: 0.0204, recoveryRate: 0.43 },
  { year: 2015, igRate: 0.0010, hyRate: 0.0349, recoveryRate: 0.32 },
  { year: 2016, igRate: 0.0010, hyRate: 0.0561, recoveryRate: 0.34 },
  { year: 2017, igRate: 0.0000, hyRate: 0.0301, recoveryRate: 0.49 },
  { year: 2018, igRate: 0.0000, hyRate: 0.0188, recoveryRate: 0.55 },
  { year: 2019, igRate: 0.0010, hyRate: 0.0282, recoveryRate: 0.47 },
  { year: 2020, igRate: 0.0007, hyRate: 0.0855, recoveryRate: 0.56 },
  { year: 2021, igRate: 0.0000, hyRate: 0.0175, recoveryRate: 0.57 },
  { year: 2022, igRate: 0.0005, hyRate: 0.0170, recoveryRate: 0.50 },
  { year: 2023, igRate: 0.0008, hyRate: 0.0534, recoveryRate: 0.42 },
  { year: 2024, igRate: 0.0010, hyRate: 0.0418, recoveryRate: 0.40 },
];

/** Tamaño del bloque para bootstrap. 3 años preserva autocorrelación de
 *  default cycles (e.g., GFC 2008-2010 estuvieron juntos; energy crisis
 *  2015-2016 también). Block sampling > i.i.d. para este caso. */
export const DEFAULT_BOOTSTRAP_BLOCK_YEARS = 3;

/** Sleeve sobre el cual se aplica el modelo de defaults. */
export type BulletSleeveType = 'ig' | 'hy';

/**
 * Aplica un haircut por defaults a un principal nominal a lo largo de
 * `nYears` años, sampleando del histórico con block bootstrap de 3 años.
 *
 * Retorna el NAV factor restante (e.g., 0.97 = 97% del nominal sobrevive).
 *
 * El bootstrap se hace con un PRNG seedeable para reproducibilidad.
 */
export function sampleDefaultHaircut(
  sleeveType: BulletSleeveType,
  nMonths: number,
  prngFloat: () => number,
): number {
  if (nMonths <= 0) return 1;

  const nObservations = HISTORICAL_DEFAULT_DATA.length;
  const blockSize = DEFAULT_BOOTSTRAP_BLOCK_YEARS;

  let navFactor = 1.0;
  let monthsCovered = 0;
  while (monthsCovered < nMonths) {
    // Sortear el inicio del bloque (3 años consecutivos del histórico).
    // Asegurar que el bloque cabe dentro del array.
    const maxStart = Math.max(0, nObservations - blockSize);
    const blockStart = Math.floor(prngFloat() * (maxStart + 1));

    for (let i = 0; i < blockSize && monthsCovered < nMonths; i++) {
      const obs = HISTORICAL_DEFAULT_DATA[blockStart + i];
      const defaultRate = sleeveType === 'ig' ? obs.igRate : obs.hyRate;
      const lossGivenDefault = 1 - obs.recoveryRate;
      const yearLoss = defaultRate * lossGivenDefault;

      // Para cubrir un año completo o lo que reste de los nMonths.
      const monthsThisYear = Math.min(12, nMonths - monthsCovered);
      const monthlyLossFactor = Math.pow(1 - yearLoss, monthsThisYear / 12);
      navFactor *= monthlyLossFactor;
      monthsCovered += monthsThisYear;
    }
  }

  return navFactor;
}

/**
 * Devuelve la tasa anual default rate del año sampleado y la recovery,
 * útil para reporting / charts del PDF (no para el cálculo principal).
 */
export function getHistoricalStats(sleeveType: BulletSleeveType): {
  meanRate: number;
  worstYearRate: number;
  worstYear: number;
  meanRecovery: number;
} {
  let sumRate = 0;
  let worstRate = 0;
  let worstYear = 0;
  let sumRecovery = 0;
  for (const obs of HISTORICAL_DEFAULT_DATA) {
    const rate = sleeveType === 'ig' ? obs.igRate : obs.hyRate;
    sumRate += rate;
    sumRecovery += obs.recoveryRate;
    if (rate > worstRate) {
      worstRate = rate;
      worstYear = obs.year;
    }
  }
  const n = HISTORICAL_DEFAULT_DATA.length;
  return {
    meanRate: sumRate / n,
    worstYearRate: worstRate,
    worstYear,
    meanRecovery: sumRecovery / n,
  };
}

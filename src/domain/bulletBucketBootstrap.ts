/**
 * Bucket bootstrap del panel TTM de bullets — alternativa empírica al modelo
 * paramétrico (curve + spread + duration decay).
 *
 * El panel TTM vive en estudios-a-la-medida/data/bullets_ttm_panel.json
 * (publicado via GitHub Pages). Estructura:
 *   panel.ig: { "0": [obs...], "1": [...], ..., "120": [...] }
 *   panel.hy: { "0": [...], ..., "101": [...] }
 *
 * Cada obs: { ticker, ym, ret }
 *   - ticker: BulletShares Corp IG (BSCQ-BSCZ) o HY (BSJQ-BSJX) o vintage vencido
 *   - ym: year-month de la observación (e.g., "2020-03")
 *   - ret: retorno mensual decimal del ETF en ese mes
 *
 * Algoritmo (stationary bootstrap):
 *   1. Para cada path y mes simulado, conocer el TTM del bullet (TTM_t).
 *   2. Cada mes hay probabilidad 1/E[blockSize] de comenzar un nuevo bloque
 *      (default: 1/24 ≈ 4.2%).
 *   3. Al iniciar nuevo bloque: samplear el mes calendario inicial Z y el
 *      bullet ticker fuente (TICKER_T) del bucket TTM_t.
 *   4. Mes a mes: aplicar al ret observado en (TICKER_T, Z+t_in_block).
 *      Si la observación no existe (ticker no vivo ese mes calendario),
 *      buscar la siguiente disponible del mismo bucket.
 *   5. Joint sampling: TODOS los bullets en el path comparten el mismo mes
 *      calendario Z + offset → preservan correlaciones cross-asset.
 *   6. Ajuste de nivel: opcional, ver applyLevelAdjustment().
 *
 * Para validación de coherencia ver bulletBucketBootstrap.test.ts.
 */

export type TTMPanelObservation = {
  ticker: string;
  ym: string;  // year-month "YYYY-MM"
  ret: number; // retorno mensual decimal
};

export type TTMPanelSleeve = {
  // bucket TTM en meses → lista de observaciones
  [ttmMonths: string]: TTMPanelObservation[];
};

export type TTMPanel = {
  schema_version: string;
  generated_at: string;
  note?: string;
  panel: {
    ig: TTMPanelSleeve;
    hy: TTMPanelSleeve;
  };
  coverage: {
    ig: { min_ttm: number; max_ttm: number; total_obs: number };
    hy: { min_ttm: number; max_ttm: number; total_obs: number };
  };
};

export type BucketSleeveType = 'ig' | 'hy';

/** Default block size esperado (geometric distribution mean). */
export const DEFAULT_BLOCK_SIZE_MEAN = 24;

/**
 * Obtiene observaciones del bucket TTM correspondiente.
 * Si el bucket exacto no existe, busca el más cercano (clamping a [min, max]).
 */
export function getBucketObservations(
  panel: TTMPanel,
  sleeveType: BucketSleeveType,
  ttmMonths: number,
): TTMPanelObservation[] {
  const sleeve = panel.panel[sleeveType];
  const cov = panel.coverage[sleeveType];

  // Clampear el TTM al rango disponible
  const clamped = Math.max(cov.min_ttm, Math.min(cov.max_ttm, Math.round(ttmMonths)));
  return sleeve[String(clamped)] ?? [];
}

/**
 * Stationary bootstrap state. Mantiene el estado mes a mes del sampler
 * para un path específico.
 *
 * Cada mes:
 *   1. Con probabilidad 1/blockSizeMean, iniciar nuevo bloque (resamplear).
 *   2. En caso contrario, continuar el bloque actual (incrementar offset).
 */
export type StationaryBootstrapState = {
  /** Mes calendario inicial del bloque actual (índice en obs array). */
  currentBlockObsIdx: number;
  /** Ticker fuente del bloque actual. */
  currentBlockTicker: string;
  /** Offset dentro del bloque (cuántos meses lleva muestreados). */
  blockOffset: number;
  /** Mes calendario del último sample. */
  lastYm: string | null;
};

/**
 * Inicializa el state del stationary bootstrap.
 * Llamar al inicio de cada path simulado.
 */
export function initBootstrapState(): StationaryBootstrapState {
  return {
    currentBlockObsIdx: -1,
    currentBlockTicker: '',
    blockOffset: 0,
    lastYm: null,
  };
}

/**
 * Samplea un retorno del bucket TTM con stationary bootstrap.
 *
 * @param panel              Panel TTM cargado
 * @param sleeveType         'ig' o 'hy'
 * @param ttmMonths          TTM actual del bullet en meses
 * @param state              State del bootstrap (mutado in-place)
 * @param prng               PRNG seedeable [0, 1)
 * @param blockSizeMean      Media del block size (default 24)
 * @returns                  Retorno mensual sampleado
 */
export function sampleReturnFromBucket(
  panel: TTMPanel,
  sleeveType: BucketSleeveType,
  ttmMonths: number,
  state: StationaryBootstrapState,
  prng: () => number,
  blockSizeMean: number = DEFAULT_BLOCK_SIZE_MEAN,
): number {
  const obs = getBucketObservations(panel, sleeveType, ttmMonths);
  if (obs.length === 0) {
    // Sin data en el bucket — retornar 0 (fallback seguro)
    return 0;
  }

  // Decidir: ¿iniciar nuevo bloque o continuar el actual?
  // FORZAR restart si el state apunta a índice inválido en el bucket actual
  // (el bucket cambia cuando el TTM del bullet cambia entre meses; el state
  // se mantiene pero el bucket puede ser distinto). Esto evita undefined-reads.
  const indexInBounds =
    state.currentBlockObsIdx >= 0 && state.currentBlockObsIdx < obs.length;
  const restartProb = 1 / blockSizeMean;
  const shouldRestart = !indexInBounds || prng() < restartProb;

  if (shouldRestart) {
    // Iniciar nuevo bloque: samplear obs inicial uniformemente
    state.currentBlockObsIdx = Math.floor(prng() * obs.length);
    state.currentBlockTicker = obs[state.currentBlockObsIdx].ticker;
    state.blockOffset = 0;
  } else {
    // Continuar bloque: incrementar offset
    state.blockOffset++;
  }

  // Buscar la observación: misma ticker, ym+offset
  const startObs = obs[state.currentBlockObsIdx];
  const startYm = startObs.ym;
  const targetYm = addMonthsToYm(startYm, state.blockOffset);

  // Buscar en obs por ticker + ym
  const match = obs.find((o) => o.ticker === state.currentBlockTicker && o.ym === targetYm);
  if (match) {
    state.lastYm = match.ym;
    return match.ret;
  }

  // No hay observación para este ticker en este mes — resamplear forzosamente
  state.currentBlockObsIdx = Math.floor(prng() * obs.length);
  state.currentBlockTicker = obs[state.currentBlockObsIdx].ticker;
  state.blockOffset = 0;
  state.lastYm = obs[state.currentBlockObsIdx].ym;
  return obs[state.currentBlockObsIdx].ret;
}

/**
 * Suma N meses a un year-month "YYYY-MM".
 */
function addMonthsToYm(ym: string, monthsToAdd: number): string {
  const [yStr, mStr] = ym.split('-');
  const y = parseInt(yStr, 10);
  const m = parseInt(mStr, 10);
  const totalMonths = y * 12 + (m - 1) + monthsToAdd;
  const newY = Math.floor(totalMonths / 12);
  const newM = (totalMonths % 12) + 1;
  return `${newY}-${String(newM).padStart(2, '0')}`;
}

/**
 * Ajuste de nivel: dado un retorno observado y un nivel de yield histórico,
 * ajustarlo al nivel de yield actual simulado.
 *
 * Fórmula:
 *   ret_ajustado = ret_observado + (carry_actual - carry_histórico)
 *
 * Donde:
 *   carry_actual = (yield_curve_simulada + spread_actual) / 12
 *   carry_histórico = (yield_curve_histórica + spread_típico) / 12
 *
 * Esto preserva la dinámica del histórico (deltas de yield, defaults
 * implícitos en el retorno) pero anclado al nivel de tasas actual del
 * path simulado.
 *
 * @param obsReturn         Retorno observado del bucket
 * @param obsCarry          Carry mensual estimado del histórico (yield/12)
 * @param targetCarry       Carry mensual actual del path simulado (yield/12)
 */
export function applyLevelAdjustment(
  obsReturn: number,
  obsCarry: number,
  targetCarry: number,
): number {
  return obsReturn + (targetCarry - obsCarry);
}

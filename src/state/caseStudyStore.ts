/**
 * caseStudyStore — Zustand store independiente para la sección "Caso de Estudio".
 *
 * Separado del store principal (A vs B portfolios) porque los modelos mentales
 * son distintos:
 *   - Store principal: dos portafolios paralelos con AMCs/Signatures, comparación.
 *   - Case study: UN portafolio con ladder + tactical rollover + loan + inflows
 *     en USD absoluto.
 *
 * Estado:
 *   - config: ArenaJobInput parcial editable desde la UI (algunos defaults se
 *     calculan en el worker, ver arena.worker.ts).
 *   - status / result / error: ciclo de vida de la corrida.
 *
 * Defaults: TBSC realistic (5M, 120m, 300 sims, 250k inflow, ladder default,
 * USMV+SCHD 50/50, BIL cash, sin préstamo).
 */
import { create } from 'zustand';
import { DEFAULT_ROLLOVER_THRESHOLDS, type RolloverThresholds } from '../domain/rollover';
import { monthsBetween } from '../domain/bullets';
import type { TTMPanel } from '../domain/bulletBucketBootstrap';
import type { ArenaJobInput, ArenaJobOutput } from '../workers/arena.worker';

export type CaseStudyStatus = 'idle' | 'running' | 'done' | 'error';

/** Subset editable del ArenaJobInput. El resto (realBullets, cashTicker) se fija. */
export type CaseStudyConfig = {
  initialAumUsd: number;
  horizonMonths: number;
  nSims: number;
  seed: number;
  bulletTotalPct: number;
  equityPct: number;
  cashPct: number;
  /**
   * Asignación al sleeve "Activos Reales" (inflation-sensitive). Default 0 →
   * los 3 sleeves originales (bullets+equity+cash) suman 100%, comportamiento
   * idéntico al previo. Cuando > 0, los 4 sleeves deben sumar 100%.
   *
   * Composición inicial (real data del bootstrap):
   *  - RWO: SPDR Dow Jones Global REIT (real estate global)
   *  - IEI: iShares 3-7y Treasury (proxy de TIPS sintético — capta duration
   *    intermedia con inflation kicker via CPI bootstrap)
   *  - IXC: iShares Global Energy (proxy de commodities reales)
   *
   * En PR follow-up agregamos TIPS, Gold, Infrastructure UCITS reales desde
   * EODHD. Esta MVP usa lo que ya está en el data pipeline.
   */
  realAssetsPct: number;
  /**
   * Mix interno del sleeve "Activos Reales". Default 40% RWO + 40% IEI + 20% IXC.
   * El usuario puede ajustar via slider auto-balance (igual que bulletMix).
   */
  realAssetsMix: ReadonlyArray<{ ticker: 'RWO' | 'IEI' | 'IXC'; weight: number }>;
  eqtyMin: number;
  eqtyMax: number;
  initialSpread: number; // decimal, 0.011 = 110bp
  inflowBaseAnnual: number;
  inflowGrowth: number;
  loanEnabled: boolean;
  loanTriggerMonth: number;
  loanAmountPctAum: number;
  loanTermMonths: number;
  /**
   * Método de financiamiento del evento (cuando loanEnabled=true):
   *  - 'loan' (default): el endowment toma préstamo bancario, lo sirve con
   *    su cashflow mensual. AUM intacto al disparo.
   *  - 'sell': el endowment vende el monto directamente. AUM cae en escalón
   *    al disparo, sin deuda posterior.
   * Permite comparar las dos estrategias para una necesidad de capital
   * conocida — para el case study del colegio, financiar la nueva ala.
   */
  loanMethod: 'loan' | 'sell';
  thresholds: RolloverThresholds;
  rolloverEnabled: boolean;
  cashBandUpper: number;
  /**
   * Mix custom del sleeve de equity. Cada entry { ticker, weight } pesa
   * dentro del sleeve (no del AUM total — eso lo hace equityPct). Los pesos
   * son los del UI; configToJobInput los normaliza a suma=1 al envío.
   *
   * Default del entregable: USMV 50% / SCHD 50% (is_default=true en el meta
   * JSON del catálogo). El selector custom permite explorar otros mixes sin
   * cambiar el default.
   */
  equityMix: ReadonlyArray<{ ticker: string; weight: number }>;
  /**
   * Mix interno del sleeve "renta fija" (bullets). Tres componentes:
   *  - iBonds: ladder iBonds UCITS USD Corp IG (9 vintages Dec 2026–2034)
   *  - iBonds-HY: mini-ladder iBonds UCITS USD HY Corp (2 vintages: IU28 Dec 2028,
   *    IU29 Dec 2029). Oferta UCITS confirmada de BlackRock lanzada Oct 2025.
   *  - GHYG: iShares Global HY Corp UCITS ETF (perpetual)
   *
   * Pesos normalizan al envío. Los 3 componentes operan distinto:
   *  - iBonds IG: ladder convencional, rollover táctico A/B/C
   *  - iBonds HY: bullets defined-maturity con spread HY (~400bp). Cuando IU28/29
   *    vencen, principal se reinvierte en GHYG (no hay vintages HY UCITS más allá
   *    de 2029 a fecha actual).
   *  - GHYG: perpetual, no rollover. Se vende antes que bullets en cascada.
   *
   * Default: iBonds 100%, resto 0% — preserva comportamiento TBSC inicial.
   */
  bulletMix: ReadonlyArray<{ ticker: 'iBonds' | 'iBonds-HY' | 'GHYG'; weight: number }>;
  /**
   * Override de la tasa inicial del DPF1Y baseline (decimal anual, e.g.,
   * 0.0525 = 5.25%). Útil cuando el cliente trae una oferta concreta del
   * banco. Si null, se usa UST1Y inicial + initialSpread (default).
   * Renovaciones en t=12, 24, ... usan UST1Y(bootstrap) + spread implícito
   * (override − UST1Y inicial), preservando el nivel ofertado en relación
   * al treasury 1y.
   */
  dpfRateOverride: number | null;
  /**
   * Toggle: si true, el sleeve de bullets se acota a vintages con
   * maturity ≤ maxBulletYears. Si false, lineup completo (~11y, default).
   * Útil para escenarios de tasas largo plazo desfavorable.
   */
  maxBulletYearsEnabled: boolean;
  /** Cap de duración del sleeve cuando maxBulletYearsEnabled=true. */
  maxBulletYears: number;
  /**
   * Fee anual total en basis points (1 bp = 0.01%). Cubre TER de los ETFs
   * subyacentes, custodia, asesoría e intermediación — todos los costos no
   * modelados explícitamente por el motor (que opera sobre returns brutos).
   *
   * Se aplica como post-process en el worker (no toca el motor matemático,
   * preserva paridad Python). Si > 0, todos los stats reportados son netos.
   * Default 0 — comportamiento previo del TBSC se preserva.
   */
  allInFeeBps: number;
  /**
   * Residencia fiscal del cliente. Determina qué familias de ETFs son
   * elegibles. 'offshore' = non-US Person — UCITS solo (Reg S + estate
   * tax US-situs + withholding); 'us-resident' = US Person/resident —
   * US-registered + UCITS disponibles. Default 'offshore' (el mercado
   * principal de Mercantil SFI).
   */
  clientResidency: 'offshore' | 'us-resident';
  /**
   * Motor de cálculo de retornos de bullets.
   *  - 'parametric' (default): modelo paramétrico actual (curve + spread +
   *    duration decay). Preserva paridad Python.
   *  - 'bucket-bootstrap': bucket bootstrap del panel TTM histórico
   *    (estudios-a-la-medida/data/bullets_ttm_panel.json publicado en
   *    Pages). Reproduce mejor stylized facts empíricos (COVID 2020,
   *    rate shock 2022) pero requiere fetch del panel al cargar el
   *    planner. Si el panel no se carga, el motor revierte a 'parametric'.
   *
   * Default 'parametric' para preservar el comportamiento del primer
   * entregable TBSC. El usuario opta in via toggle en sección Avanzado.
   */
  bulletReturnsEngine: 'parametric' | 'bucket-bootstrap';
  /**
   * Condicionamiento por vista de inflación. Cuando enabled=true, el chart
   * y los stats se computan SOLO sobre las sims donde la inflación
   * anualizada acumulada en `inflationConditioningHorizonMonths` cae en
   * [inflationConditioningMinPct, inflationConditioningMaxPct] decimal.
   *
   * Default: deshabilitado, horizonte=36 (3y), rango=[0%, 10%] (= todo el
   * rango plausible, así si el usuario lo prende sin tocar nada todavía
   * ve casi todas las sims pasar el filtro). Auto-scaling de nSims al
   * commitear si el filtro deja <1000 sims (regla §4 del modelo).
   */
  inflationConditioningEnabled: boolean;
  inflationConditioningHorizonMonths: number;
  inflationConditioningMinPct: number; // decimal anual, e.g. 0.02 = 2%
  inflationConditioningMaxPct: number;
};

export const DEFAULT_CASE_CONFIG: CaseStudyConfig = {
  initialAumUsd: 5_000_000,
  horizonMonths: 240,
  nSims: 5000,
  seed: 42,
  bulletTotalPct: 0.65,
  equityPct: 0.30,
  cashPct: 0.05,
  realAssetsPct: 0, // default OFF — preserva comportamiento previo (3 sleeves)
  realAssetsMix: [
    { ticker: 'RWO', weight: 0.40 },
    { ticker: 'IEI', weight: 0.40 },
    { ticker: 'IXC', weight: 0.20 },
  ],
  eqtyMin: 0.10,
  eqtyMax: 0.50,
  initialSpread: 0.011,
  inflowBaseAnnual: 250_000,
  inflowGrowth: 0,
  loanEnabled: false,
  loanTriggerMonth: 60,
  loanAmountPctAum: 0.10,
  loanTermMonths: 36,
  loanMethod: 'loan',
  thresholds: { ...DEFAULT_ROLLOVER_THRESHOLDS },
  rolloverEnabled: true,
  cashBandUpper: 0.05,
  dpfRateOverride: null,
  maxBulletYearsEnabled: false,
  maxBulletYears: 4,
  equityMix: [
    { ticker: 'USMV', weight: 0.5 },
    { ticker: 'SCHD', weight: 0.5 },
  ],
  bulletMix: [
    { ticker: 'iBonds', weight: 1 },
    { ticker: 'iBonds-HY', weight: 0 },
    { ticker: 'GHYG', weight: 0 },
  ],
  allInFeeBps: 0,
  clientResidency: 'offshore',
  bulletReturnsEngine: 'parametric', // default preserva paridad Python
  inflationConditioningEnabled: false,
  inflationConditioningHorizonMonths: 36, // 3y default
  inflationConditioningMinPct: 0,
  inflationConditioningMaxPct: 0.10, // 10% — rango histórico amplio
};

/** Convierte CaseStudyConfig → ArenaJobInput aplicando defaults fijos. */
export function configToJobInput(
  config: CaseStudyConfig,
  ttmPanel?: TTMPanel | null,
  /**
   * Override del seed. Cuando se pasa, sobreescribe `config.seed`. Usado
   * por el case study para randomizar el seed en cada corrida (UI hide
   * + autorandom). Si no se pasa, usa `config.seed` (modo legacy o dev).
   */
  overrideSeed?: number,
): ArenaJobInput {
  // Normaliza pesos del mix al envío. El UI mantiene pesos arbitrarios para
  // permitir edición fluida (sliders independientes); el motor requiere suma=1.
  const totalW = config.equityMix.reduce((s, m) => s + m.weight, 0);
  if (!(totalW > 0)) {
    throw new Error(
      'configToJobInput: equityMix con suma de pesos <= 0. Seleccioná al menos un ticker.',
    );
  }
  const equityMixNormalized = config.equityMix.map((m) => ({
    ticker: m.ticker,
    weight: m.weight / totalW,
  }));

  // Normaliza bulletMix. Tres componentes:
  //  - iBonds IG ladder
  //  - iBonds-HY mini-ladder (IU28/IU29)
  //  - GHYG perpetual (hyWeight)
  let wIG = 1;
  let wIBondsHY = 0;
  let hyWeight = 0;
  const bulletTotalW = config.bulletMix.reduce((s, m) => s + m.weight, 0);
  if (bulletTotalW > 0) {
    const igEntry = config.bulletMix.find((m) => m.ticker === 'iBonds');
    const iBondsHyEntry = config.bulletMix.find((m) => m.ticker === 'iBonds-HY');
    const ghygEntry = config.bulletMix.find((m) => m.ticker === 'GHYG');
    wIG = igEntry ? igEntry.weight / bulletTotalW : 0;
    wIBondsHY = iBondsHyEntry ? iBondsHyEntry.weight / bulletTotalW : 0;
    hyWeight = ghygEntry ? ghygEntry.weight / bulletTotalW : 0;
  }
  // Clamp por seguridad — el motor lanza si está fuera de [0,1]
  wIG = Math.max(0, Math.min(1, wIG));
  wIBondsHY = Math.max(0, Math.min(1, wIBondsHY));
  hyWeight = Math.max(0, Math.min(1, hyWeight));
  // Renormalize por si los clamps cambian la suma (defensivo)
  const sLad = wIG + wIBondsHY + hyWeight;
  if (sLad > 0) {
    wIG /= sLad; wIBondsHY /= sLad; hyWeight /= sLad;
  } else {
    wIG = 1; // fallback seguro
  }
  // El ladder (IG + iBondsHY) excluye el componente perpetual (GHYG).
  // bulletInitialWeights se construye proporcional sobre los bullets del ladder.
  const ladderWeight = wIG + wIBondsHY;
  // Lineup INICIAL explícito: solo iBonds UCITS reales (Dec 2026 – Dec 2034).
  // Estos son los productos que el cliente offshore PUEDE COMPRAR HOY en el
  // mercado UCITS. NO se incluyen sintéticos en el lineup inicial — no hay
  // productos UCITS con maturity > 2034 en el mercado actual.
  //
  // Sin embargo, para el ROLLOVER TÁCTICO durante la simulación, sí se
  // permiten bullets sintéticos representando la asunción de que
  // "BlackRock seguirá lanzando nuevas vintages anualmente con TTM ~8.6y"
  // (consistente con el patrón histórico desde 2014). Esos sintéticos NO
  // son productos del lineup inicial — son "el siguiente bullet 8y que
  // estará disponible cuando llegue el momento del rollover". Si los
  // eliminamos completamente, el principal liberado tras vencer bullets
  // cae en FALLBACK_EQUITY (todo a equity), lo cual NO refleja la
  // realidad operativa (el cliente puede comprar nuevos vintages a futuro).
  const today = new Date(2026, 4, 15); // 2026-05-15 — anclado al lineup TBSC
  const dec15 = (y: number) => new Date(y, 11, 15);
  // Bullets reales del ladder. Puede mezclar IG y HY si el usuario activa
  // iBonds-HY en el mix. Cada bullet trae su spreadOverride (HY → 400bp).
  // bulletInitialWeights asigna la proporción IG vs HY del ladder.
  type BulletEntry = {
    name: string;
    maturityY: number;
    durInitY: number;
    isSynthetic: boolean;
    spreadOverride?: number;
    /** Peso interno del ladder de IG (suma 1) — se multiplica por wIG después */
    isIG: boolean;
  };
  let ucitsRealBullets: BulletEntry[] = [];
  // 1. IG ladder — iBonds USD Corp Dec 2026-2034
  for (let v = 2026; v <= 2034; v++) {
    const mY = monthsBetween(today, dec15(v)) / 12;
    if (mY <= 0) continue;
    ucitsRealBullets.push({
      name: `ID${(v % 100).toString().padStart(2, '0')}`,
      maturityY: mY,
      durInitY: mY * 0.93,
      isSynthetic: false,
      isIG: true,
    });
  }
  // 2. HY ladder — iBonds USD HY Corp IU28 (Dec 2028), IU29 (Dec 2029).
  //    Solo se incluye en el lineup cuando el usuario activó iBonds-HY en el mix.
  //    Spread HY típico: 400bp. Duration init slightly menor (HY corp tiene
  //    coupons más altos → modified duration ~0.85 × maturity vs IG ~0.93).
  if (wIBondsHY > 0) {
    const HY_SPREAD = 0.04; // 400bp típico HY corp
    for (const v of [2028, 2029]) {
      const mY = monthsBetween(today, dec15(v)) / 12;
      if (mY <= 0) continue;
      ucitsRealBullets.push({
        name: `IU${(v % 100).toString().padStart(2, '0')}`,
        maturityY: mY,
        durInitY: mY * 0.85,
        isSynthetic: false,
        spreadOverride: HY_SPREAD,
        isIG: false,
      });
    }
  }
  // Cap de duración: filtra el lineup inicial a vintages con maturity ≤ maxBulletYears.
  // Con max=1y solo ID26 (~0.58y al 2026-05-15) sobrevive — el rollover engine cubre
  // el resto generando sintéticos a 1y de spacing arriba del más largo. Es válido
  // tener 1 sola vintage real en el lineup inicial (no requiere ≥2 que pide
  // defaultBulletLineup; ese check es del helper Python-parity, no del motor).
  if (config.maxBulletYearsEnabled) {
    const filtered = ucitsRealBullets.filter((b) => b.maturityY <= config.maxBulletYears);
    if (filtered.length === 0) {
      throw new Error(
        `maxBulletYears=${config.maxBulletYears} deja 0 vintages reales. ` +
          `El lineup UCITS más corto es ID26 (~0.58y). Subí el cap a ≥1.`,
      );
    }
    ucitsRealBullets = filtered;
  }
  // bulletInitialWeights: asigna AUM per-bullet del ladder en proporción al mix.
  // - bullets IG: cada uno recibe (wIG / nIG) del peso total del ladder
  // - bullets HY iBonds: cada uno recibe (wIBondsHY / nIBondsHY) del peso total
  // Cuando wIBondsHY=0, no hay bullets HY → weights = uniformes sobre los IG.
  // El motor normaliza internamente.
  const nIG = ucitsRealBullets.filter((b) => b.isIG).length;
  const nHY = ucitsRealBullets.filter((b) => !b.isIG).length;
  const bulletInitialWeights = ladderWeight > 0
    ? ucitsRealBullets.map((b) =>
        b.isIG
          ? (nIG > 0 ? wIG / nIG : 0)
          : (nHY > 0 ? wIBondsHY / nHY : 0),
      )
    : ucitsRealBullets.map(() => 1 / Math.max(ucitsRealBullets.length, 1));

  // Strip el helper field `isIG` antes de mandar al worker (no es parte de la API)
  const realBulletsForWorker = ucitsRealBullets.map(({ isIG: _isIG, ...rest }) => {
    void _isIG;
    return rest;
  });

  return {
    realBullets: realBulletsForWorker,
    bulletInitialWeights,
    // 25 sintéticos para rollover futuro (asunción razonable de continuidad
    // de la oferta UCITS). Cobertura efectiva post-vencimientos hasta ~34y.
    // Coherente con horizonte default 20y del caso TBSC.
    nExtensions: 25,
    extensionSpacingY: 1.0,
    bulletTotalPct: config.bulletTotalPct,
    equityPct: config.equityPct,
    cashPct: config.cashPct,
    eqtyMin: config.eqtyMin,
    eqtyMax: config.eqtyMax,
    equityMix: equityMixNormalized,
    hyWeight,
    realAssetsPct: config.realAssetsPct,
    realAssetsMix: config.realAssetsMix.map((m) => ({ ticker: m.ticker, weight: m.weight })),
    cashTicker: 'BIL',
    initialSpread: config.initialSpread,
    thresholds: config.thresholds,
    rolloverEnabled: config.rolloverEnabled,
    inflowBaseAnnual: config.inflowBaseAnnual,
    inflowGrowth: config.inflowGrowth,
    loanEvent: config.loanEnabled
      ? {
          triggerMonth: config.loanTriggerMonth,
          amountPctAum: config.loanAmountPctAum,
          termMonths: config.loanTermMonths,
          method: config.loanMethod,
        }
      : null,
    initialAumUsd: config.initialAumUsd,
    horizonMonths: config.horizonMonths,
    nSims: config.nSims,
    seed: overrideSeed ?? config.seed,
    cashBandUpper: config.cashBandUpper,
    dpfRateOverride: config.dpfRateOverride,
    maxBulletYears: config.maxBulletYearsEnabled ? config.maxBulletYears : null,
    allInFeeBps: config.allInFeeBps,
    bulletReturnsEngine: config.bulletReturnsEngine,
    // El panel TTM se pasa al worker SOLO cuando el motor es bucket-bootstrap.
    // En modo paramétrico es innecesario (y postMessage es más rápido sin
    // transferir el panel ~230KB).
    ttmPanel:
      config.bulletReturnsEngine === 'bucket-bootstrap' && ttmPanel ? ttmPanel : null,
    // Nota: enforceMonthlyEquityCap se hardcodea a true dentro del worker,
    // no se pasa por payload. Esto evita que algún cambio futuro al store
    // termine accidentalmente desactivando el cap mensual.
  };
}

/**
 * Variante guardada — snapshot del config + result actuales con un label
 * descriptivo. Permite overlay de medianas en el fan chart sin perder el
 * resultado activo. Útil para comparar C-conservador / C-equilibrado /
 * C-agresivo en paralelo sobre los mismos paths del bootstrap.
 */
export type SavedVariant = {
  id: string;
  label: string;
  config: CaseStudyConfig;
  result: ArenaJobOutput;
  color: string; // tailwind/css color hex para el overlay
  /**
   * Si true, la mediana de esta variante se overlay-ea en el fan chart.
   * Default visibility on add: solo la PRIMERA y la última (recien creada)
   * quedan visibles. Las del medio quedan en false; el usuario las marca a
   * mano para verlas. Evita saturar el chart con 8 medianas overlayed.
   */
  visible: boolean;
};

/** Máximo de variantes guardadas simultáneamente (por memoria y legibilidad). */
export const MAX_SAVED_VARIANTS = 8;

/**
 * Colores para overlays de variantes. Evitamos:
 *  - Verde (#3a8a4e): reservado para la línea "Capital + aportes acumulados"
 *  - Naranja (#F58220): reservado para Custom — mediana y bandas p5-p95 / p25-p75
 *  - Gris (#6B7280): reservado para DPF1Y — mediana y bandas
 *  - Gris claro (#888): reservado para "Capital inicial"
 *
 * Quedan: azul, púrpura, teal, magenta, rojo. Suficiente contraste entre
 * ellos y con los colores reservados.
 */
const VARIANT_COLORS = [
  '#003566', '#7c3aed', '#0d9488', '#db2777',
  '#0891b2', '#a16207', '#15803d', '#9f1239',
] as const;

/**
 * Metadata del estudio anterior — cuando el usuario sube un PDF previo,
 * guardamos la fecha original y la fecha del seguimiento para mostrarlas
 * en el panel ("Generado: X · Seguimiento: Y, N días después").
 */
export type StudyTracking = {
  previousDate: string; // ISO datetime del PDF subido
  previousSessionId: string;
  trackingDays: number;
};

type CaseStudyState = {
  config: CaseStudyConfig;
  status: CaseStudyStatus;
  result: ArenaJobOutput | null;
  error: string | null;
  savedVariants: SavedVariant[];
  /** Setteada cuando se sube un PDF anterior. null si arrancamos desde cero. */
  tracking: StudyTracking | null;
  // Actions
  setConfig: (patch: Partial<CaseStudyConfig>) => void;
  setThreshold: (key: keyof RolloverThresholds, value: number) => void;
  resetConfig: () => void;
  setStatus: (status: CaseStudyStatus) => void;
  setResult: (result: ArenaJobOutput) => void;
  setError: (error: string) => void;
  saveCurrentAsVariant: (label: string) => void;
  /**
   * Auto-guarda como variante el resultado dado (típicamente el `result`
   * actual antes de ser reemplazado por una nueva corrida). El label se
   * pasa ya construido (auto-generado por el caller). Actualiza la
   * visibilidad de las demás: primera siempre visible, nueva siempre
   * visible, las del medio se ocultan. Si excede MAX, descarta la oldest
   * NO-FIJA (no la primera).
   */
  autoSaveVariant: (params: {
    label: string;
    config: CaseStudyConfig;
    result: ArenaJobOutput;
  }) => void;
  /** Toggle de visibilidad de una variante. */
  setVariantVisibility: (id: string, visible: boolean) => void;
  /** Edita el label de una variante (rename manual). */
  renameVariant: (id: string, label: string) => void;
  removeVariant: (id: string) => void;
  clearVariants: () => void;
  /**
   * Restaura el store desde un state container extraído de un PDF "Estudio a
   * la Medida" previo. Reemplaza config, result y savedVariants; setea
   * tracking con la fecha del PDF anterior. Util para flujo de seguimiento.
   */
  restoreFromPdf: (params: {
    config: CaseStudyConfig;
    result: ArenaJobOutput | null;
    savedVariants: SavedVariant[];
    tracking: StudyTracking;
  }) => void;
  clearTracking: () => void;
};

export const useCaseStudyStore = create<CaseStudyState>((set) => ({
  config: { ...DEFAULT_CASE_CONFIG },
  status: 'idle',
  result: null,
  error: null,
  savedVariants: [],
  tracking: null,
  setConfig: (patch) =>
    set((s) => ({ config: { ...s.config, ...patch } })),
  setThreshold: (key, value) =>
    set((s) => ({
      config: { ...s.config, thresholds: { ...s.config.thresholds, [key]: value } },
    })),
  resetConfig: () => set({ config: { ...DEFAULT_CASE_CONFIG } }),
  setStatus: (status) => set({ status }),
  setResult: (result) => set({ result, status: 'done', error: null }),
  setError: (error) => set({ error, status: 'error' }),
  saveCurrentAsVariant: (label) =>
    set((s) => {
      if (!s.result) return s;
      if (s.savedVariants.length >= MAX_SAVED_VARIANTS) return s;
      const used = new Set(s.savedVariants.map((v) => v.color));
      const color = VARIANT_COLORS.find((c) => !used.has(c)) ?? VARIANT_COLORS[0];
      const id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const cleanLabel = label.trim() || `Variante ${s.savedVariants.length + 1}`;
      return {
        savedVariants: [
          ...s.savedVariants,
          { id, label: cleanLabel, config: { ...s.config }, result: s.result, color, visible: true },
        ],
      };
    }),
  autoSaveVariant: ({ label, config, result }) =>
    set((s) => {
      // El nuevo variant va al FINAL del array. Mark visibility:
      //   - el primero del array (índice 0) siempre visible (= la "inicial")
      //   - el nuevo (este que estamos agregando) visible
      //   - los del medio se ocultan automáticamente (el usuario los re-prende
      //     a mano si quiere comparar). Esto cumple la regla "max 2 default
      //     visibles" sin tener que reasignar al cargar.
      const used = new Set(s.savedVariants.map((v) => v.color));
      const color = VARIANT_COLORS.find((c) => !used.has(c)) ?? VARIANT_COLORS[0];
      const id = `v-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      const newVariant: SavedVariant = {
        id,
        label: label.trim() || `Corrida #${s.savedVariants.length + 1}`,
        config: { ...config },
        result,
        color,
        visible: true,
      };
      // Reset visibility de los existentes: primero queda como está (debería
      // ser visible=true), resto se oculta.
      let next = s.savedVariants.map((v, idx) => ({
        ...v,
        visible: idx === 0 ? v.visible : false,
      }));
      // Si excedemos el cap, descartamos el más viejo NO-PRIMERO (siempre
      // preservamos el primero como ancla "inicial").
      if (next.length + 1 > MAX_SAVED_VARIANTS) {
        const dropIdx = 1; // segundo del array es el más viejo después del ancla
        next = [...next.slice(0, dropIdx), ...next.slice(dropIdx + 1)];
      }
      return { savedVariants: [...next, newVariant] };
    }),
  setVariantVisibility: (id, visible) =>
    set((s) => ({
      savedVariants: s.savedVariants.map((v) => (v.id === id ? { ...v, visible } : v)),
    })),
  renameVariant: (id, label) =>
    set((s) => ({
      savedVariants: s.savedVariants.map((v) =>
        v.id === id ? { ...v, label: label.trim() || v.label } : v,
      ),
    })),
  removeVariant: (id) =>
    set((s) => ({ savedVariants: s.savedVariants.filter((v) => v.id !== id) })),
  clearVariants: () => set({ savedVariants: [] }),
  restoreFromPdf: ({ config, result, savedVariants, tracking }) =>
    set({
      config: { ...config },
      result,
      savedVariants: savedVariants.map((v) => ({ ...v })),
      tracking,
      status: result ? 'done' : 'idle',
      error: null,
    }),
  clearTracking: () => set({ tracking: null }),
}));

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
  eqtyMin: number;
  eqtyMax: number;
  initialSpread: number; // decimal, 0.011 = 110bp
  inflowBaseAnnual: number;
  inflowGrowth: number;
  loanEnabled: boolean;
  loanTriggerMonth: number;
  loanAmountPctAum: number;
  loanTermMonths: number;
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
   * Issuer del ladder de bonos. Decisión OPERATIVA (qué ETFs concretos
   * compra Mercantil para el cliente), no de exposición económica — el
   * motor matemático modela paramétricamente el ladder (curve + spread +
   * duration decay) idéntico para los tres issuers, porque empíricamente
   * iBonds UCITS y BulletShares UCITS son indistinguibles en correlación
   * y diff de yield (<5bp; ver UNIVERSO.md §1.3 de estudios-a-la-medida).
   *
   * La diferencia entre opciones se refleja en:
   *  - Issuer risk: 100% BlackRock vs 100% Invesco vs split 50-50
   *  - AUM de cada ETF (relevante para look-through y disclaimers)
   *  - Vintages disponibles: iBonds UCITS cubre 2026-2034; BulletShares
   *    UCITS solo 2026-2030 → 'bulletshares-ucits' solo aplica a horizon
   *    cortos; 'split-50-50' se degrada a iBonds-only para vintages
   *    posteriores a 2030.
   *
   * Restricciones por residencia fiscal:
   *  - clientResidency='offshore' (default): solo UCITS disponibles.
   *  - clientResidency='us-resident': UCITS + US BulletShares (no
   *    implementado en este PR; queda para PR posterior).
   */
  bulletIssuer: 'iBonds' | 'bulletshares-ucits' | 'split-50-50';
  /**
   * Residencia fiscal del cliente. Determina qué familias de ETFs son
   * elegibles. 'offshore' = non-US Person — UCITS solo (Reg S + estate
   * tax US-situs + withholding); 'us-resident' = US Person/resident —
   * US-registered + UCITS disponibles. Default 'offshore' (el mercado
   * principal de Mercantil SFI).
   */
  clientResidency: 'offshore' | 'us-resident';
};

export const DEFAULT_CASE_CONFIG: CaseStudyConfig = {
  initialAumUsd: 5_000_000,
  horizonMonths: 240,
  nSims: 500,
  seed: 42,
  bulletTotalPct: 0.65,
  equityPct: 0.30,
  cashPct: 0.05,
  eqtyMin: 0.10,
  eqtyMax: 0.50,
  initialSpread: 0.011,
  inflowBaseAnnual: 250_000,
  inflowGrowth: 0,
  loanEnabled: false,
  loanTriggerMonth: 60,
  loanAmountPctAum: 0.10,
  loanTermMonths: 36,
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
  allInFeeBps: 0,
  bulletIssuer: 'iBonds',
  clientResidency: 'offshore',
};

/** Convierte CaseStudyConfig → ArenaJobInput aplicando defaults fijos. */
export function configToJobInput(config: CaseStudyConfig): ArenaJobInput {
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
  return {
    realBullets: null, // worker usará defaultBulletLineup()
    nExtensions: 25,
    extensionSpacingY: 1.0,
    bulletTotalPct: config.bulletTotalPct,
    equityPct: config.equityPct,
    cashPct: config.cashPct,
    eqtyMin: config.eqtyMin,
    eqtyMax: config.eqtyMax,
    equityMix: equityMixNormalized,
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
        }
      : null,
    initialAumUsd: config.initialAumUsd,
    horizonMonths: config.horizonMonths,
    nSims: config.nSims,
    seed: config.seed,
    cashBandUpper: config.cashBandUpper,
    dpfRateOverride: config.dpfRateOverride,
    maxBulletYears: config.maxBulletYearsEnabled ? config.maxBulletYears : null,
    allInFeeBps: config.allInFeeBps,
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
};

/** Máximo de variantes guardadas simultáneamente (por memoria y legibilidad). */
export const MAX_SAVED_VARIANTS = 4;

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
const VARIANT_COLORS = ['#003566', '#7c3aed', '#0d9488', '#db2777'] as const;

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
          { id, label: cleanLabel, config: { ...s.config }, result: s.result, color },
        ],
      };
    }),
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

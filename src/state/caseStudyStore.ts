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

type CaseStudyState = {
  config: CaseStudyConfig;
  status: CaseStudyStatus;
  result: ArenaJobOutput | null;
  error: string | null;
  savedVariants: SavedVariant[];
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
};

export const useCaseStudyStore = create<CaseStudyState>((set) => ({
  config: { ...DEFAULT_CASE_CONFIG },
  status: 'idle',
  result: null,
  error: null,
  savedVariants: [],
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
}));

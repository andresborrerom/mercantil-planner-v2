/**
 * Tipos del PDF "Estudio a la Medida" (pestaña Caso de Estudio).
 *
 * Estructura paralela a src/pdf/state/types.ts (que es del Comparador A/B).
 * Los dos PDFs son outputs distintos del mismo planner; comparten infra
 * (theme, BrandBar, PdfFooter, embed via metadata.ts) pero su state
 * container es independiente.
 */
import type { CaseStudyConfig, SavedVariant } from '../../../state/caseStudyStore';
import type { ArenaJobOutput } from '../../../workers/arena.worker';

/** Tipo de cliente — afecta vocabulario y la sección de política de inversión. */
export type ClientType = 'natural' | 'juridica';

/** Subtipo (jurídica) — opcional, mejora vocabulario. */
export type JuridicaSubtype =
  | 'endowment'
  | 'fundacion'
  | 'colegio'
  | 'empresa'
  | 'familia'
  | 'otro';

/** Marco Wealth Way (mismo set que el PDF A/B). Se deriva del horizonte/flujos por default. */
export type WealthBucket = 'liquidity' | 'longevity' | 'legacy';

export type PdfLocale = 'es' | 'en' | 'fr' | 'de';
export type StudyVersion = 'completa' | 'ejecutiva';

export type StudyModules = {
  /** Apéndice de stress tests por régimen histórico. */
  stressTests: boolean;
  /** Sensibilidades / análisis comparativos. */
  sensitivities: boolean;
  /** Nota metodológica detallada (bootstrap, asunciones). */
  methodology: boolean;
  /** Detalle de sleeves al estilo del panel — análisis profundo. */
  sleevesDetail: boolean;
};

/**
 * State container que viaja embebido al PDF. Al subir un PDF anterior se
 * extrae este objeto y se restituye el caseStudyStore — permite seguimiento
 * sin perder configuración.
 */
export type EstudioMedidaStateContainer = {
  schemaVersion: 1;
  generatedAt: string; // ISO datetime
  sessionId: string;
  client: {
    name: string;
    type: ClientType;
    subtype?: JuridicaSubtype;
    /** Sólo natural — opcional, mejora la sección "horizonte y edad de confianza". */
    age?: number;
    /** Sólo jurídica — nombre del órgano decisor ("Comité de Inversiones", etc.). */
    governance?: string;
    /** Bucket Wealth Way (derivado o override del modal). */
    bucket: WealthBucket;
  };
  advisor: {
    name: string;
    note?: string;
  };
  locale: PdfLocale;
  version: StudyVersion;
  modules: StudyModules;
  config: CaseStudyConfig;
  /** Result del worker — embebido para que la simulación se vea idéntica al rehidratar. */
  result: ArenaJobOutput | null;
  savedVariants: SavedVariant[];
};

export const ESTUDIO_MEDIDA_SCHEMA_VERSION = 1 as const;

/** Key del Info dictionary del PDF — distinto del del A/B (`MawmState`). */
export const ESTUDIO_MEDIDA_INFO_KEY = 'EstudioMedidaState' as const;

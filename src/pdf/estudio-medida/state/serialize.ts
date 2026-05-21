/**
 * Serialización / deserialización del state container del PDF "Estudio a la
 * Medida". Empareja con upload.ts y download.ts.
 */
import type { CaseStudyConfig, SavedVariant } from '../../../state/caseStudyStore';
import type { ArenaJobOutput } from '../../../workers/arena.worker';
import type {
  ClientType,
  EstudioMedidaStateContainer,
  JuridicaSubtype,
  PdfLocale,
  StudyModules,
  StudyVersion,
  WealthBucket,
} from './types';
import { ESTUDIO_MEDIDA_SCHEMA_VERSION } from './types';

/** Inputs del modal — superset de los del A/B con tipo de cliente. */
export type EstudioMedidaFormInputs = {
  clientName: string;
  clientType: ClientType;
  clientSubtype?: JuridicaSubtype;
  clientAge?: number;
  clientGovernance?: string;
  bucket: WealthBucket;
  advisorName: string;
  advisorNote?: string;
  version: StudyVersion;
  locale: PdfLocale;
  modules: StudyModules;
};

const SLUG_DIACRITICS = /[̀-ͯ]/g;

export function clientSlug(name: string): string {
  return name
    .normalize('NFD')
    .replace(SLUG_DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isoSlug(d: Date): string {
  return (
    `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}` +
    `-${pad2(d.getHours())}${pad2(d.getMinutes())}`
  );
}

function random4(): string {
  return Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
}

export function generateSessionId(
  slug: string,
  clientType: ClientType,
  when = new Date(),
): string {
  return `estmed-${slug || 'cliente'}-${clientType}-${isoSlug(when)}-${random4()}`;
}

export function pdfFileName(
  slug: string,
  clientType: ClientType,
  version: StudyVersion,
): string {
  const safeSlug = slug || 'cliente';
  const suffix = version === 'ejecutiva' ? '-ejec' : '';
  return `estudio-medida-${safeSlug}-${clientType}${suffix}.pdf`;
}

/**
 * Bucket Wealth Way default derivado del config. Heurística:
 *  - horizonte < 60m → liquidity
 *  - horizonte ≥ 240m sin retiros netos → legacy
 *  - resto → longevity (default seguro)
 */
export function deriveBucket(config: CaseStudyConfig): WealthBucket {
  if (config.horizonMonths < 60) return 'liquidity';
  if (config.horizonMonths >= 240 && config.inflowBaseAnnual >= 0) return 'legacy';
  return 'longevity';
}

export type SerializeInputs = {
  form: EstudioMedidaFormInputs;
  config: CaseStudyConfig;
  result: ArenaJobOutput | null;
  savedVariants: SavedVariant[];
  generatedAt?: Date;
};

export function buildEstudioMedidaStateContainer(
  inputs: SerializeInputs,
): EstudioMedidaStateContainer {
  const generatedAt = inputs.generatedAt ?? new Date();
  const slug = clientSlug(inputs.form.clientName);
  const note = inputs.form.advisorNote?.trim();
  return {
    schemaVersion: ESTUDIO_MEDIDA_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    sessionId: generateSessionId(slug, inputs.form.clientType, generatedAt),
    client: {
      name: inputs.form.clientName.trim() || 'Cliente',
      type: inputs.form.clientType,
      ...(inputs.form.clientSubtype ? { subtype: inputs.form.clientSubtype } : {}),
      ...(inputs.form.clientAge !== undefined ? { age: inputs.form.clientAge } : {}),
      ...(inputs.form.clientGovernance
        ? { governance: inputs.form.clientGovernance.trim() }
        : {}),
      bucket: inputs.form.bucket,
    },
    advisor: {
      name: inputs.form.advisorName.trim() || '—',
      ...(note ? { note } : {}),
    },
    locale: inputs.form.locale,
    version: inputs.form.version,
    modules: { ...inputs.form.modules },
    config: inputs.config,
    result: inputs.result,
    savedVariants: inputs.savedVariants,
  };
}

import type { usePlannerStore } from '../../state/store';
import type { PdfLocale, PdfStateContainer, PdfVersion, WealthBucket } from './types';
import { PDF_STATE_SCHEMA_VERSION } from './types';

export type StoreSnapshot = ReturnType<typeof usePlannerStore.getState>;

export type PdfFormInputs = {
  clientName: string;
  advisorName: string;
  bucket: WealthBucket;
  version: PdfVersion;
  locale: PdfLocale;
  modules: {
    stressTests: boolean;
    sensitivities: boolean;
    methodology: boolean;
  };
  /** Carta personalizada del asesor (sección A2 del PDF). Opcional. */
  advisorNote?: string;
};

const SLUG_DIACRITICS = /[̀-ͯ]/g;

/** Lowercase, sin acentos, espacios y caracteres no alfanuméricos → guion único. */
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
  // 4 hex chars — suficiente para desambiguar PDFs generados en el mismo minuto.
  return Math.floor(Math.random() * 0x10000)
    .toString(16)
    .padStart(4, '0');
}

export function generateSessionId(slug: string, bucket: WealthBucket, when = new Date()): string {
  return `mawm-${slug || 'cliente'}-${bucket}-${isoSlug(when)}-${random4()}`;
}

export function pdfFileName(
  slug: string,
  bucket: WealthBucket,
  version: PdfVersion,
): string {
  const safeSlug = slug || 'cliente';
  const suffix = version === 'ejecutiva' ? '-ejec' : '';
  return `${safeSlug}-${bucket}${suffix}.pdf`;
}

/**
 * Combina el snapshot del store con los inputs del form y produce un
 * PdfStateContainer listo para embeber en el PDF generado.
 */
export function buildPdfStateContainer(
  snapshot: StoreSnapshot,
  form: PdfFormInputs,
  options: { generatedAt?: Date } = {},
): PdfStateContainer {
  const generatedAt = options.generatedAt ?? new Date();
  const slug = clientSlug(form.clientName);
  const note = form.advisorNote?.trim();
  return {
    schemaVersion: PDF_STATE_SCHEMA_VERSION,
    generatedAt: generatedAt.toISOString(),
    sessionId: generateSessionId(slug, form.bucket, generatedAt),
    client: { name: form.clientName.trim() || 'Cliente', bucket: form.bucket },
    advisor: {
      name: form.advisorName.trim() || '—',
      ...(note ? { note } : {}),
    },
    locale: form.locale,
    version: form.version,
    modules: { ...form.modules },
    planner: {
      portfolioA: snapshot.portfolioA,
      portfolioB: snapshot.portfolioB,
      plan: snapshot.plan,
      bootstrap: snapshot.bootstrap,
      window: { ...snapshot.window },
    },
  };
}

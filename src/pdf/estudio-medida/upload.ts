/**
 * Lectura de un PDF "Estudio a la Medida" subido por el usuario. Extrae el
 * state container embebido en metadata y lo devuelve para que el componente
 * pueda restituir el caseStudyStore (config + result + variantes guardadas)
 * y mostrar el seguimiento desde el estudio anterior.
 *
 * IMPORTANTE: este flujo SOLO acepta PDFs generados por el planner v2 ramo
 * Estudio a la Medida — el Info dict key (`EstudioMedidaState`) es distinto
 * del PDF del Comparador A/B (`MawmState`), así que un PDF de la otra
 * pestaña no se confunde con éste.
 */
import { extractEstudioMedidaStateFromPdf } from './state/metadata';
import type { EstudioMedidaStateContainer } from './state/types';
import { ESTUDIO_MEDIDA_SCHEMA_VERSION } from './state/types';

export type UploadResult =
  | { kind: 'ok'; state: EstudioMedidaStateContainer; previousDate: Date; trackingDays: number }
  | { kind: 'no-state'; reason: 'PDF sin state container embebido (no es un Estudio a la Medida generado por el planner v2).' }
  | { kind: 'incompatible'; reason: string }
  | { kind: 'error'; reason: string };

export async function loadEstudioMedidaFromPdf(file: File): Promise<UploadResult> {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const state = await extractEstudioMedidaStateFromPdf(bytes);
    if (!state) {
      return {
        kind: 'no-state',
        reason: 'PDF sin state container embebido (no es un Estudio a la Medida generado por el planner v2).',
      };
    }
    if (state.schemaVersion !== ESTUDIO_MEDIDA_SCHEMA_VERSION) {
      return {
        kind: 'incompatible',
        reason: `Schema version ${state.schemaVersion} no soportada (esta versión del planner espera ${ESTUDIO_MEDIDA_SCHEMA_VERSION}).`,
      };
    }
    const previousDate = new Date(state.generatedAt);
    const trackingDays = Math.floor(
      (Date.now() - previousDate.getTime()) / (1000 * 60 * 60 * 24),
    );
    return { kind: 'ok', state, previousDate, trackingDays };
  } catch (err) {
    return {
      kind: 'error',
      reason: err instanceof Error ? err.message : String(err),
    };
  }
}

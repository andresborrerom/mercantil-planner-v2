/**
 * Descarga del PDF "Estudio a la Medida". Análogo a src/pdf/download.ts pero
 * con el factory y metadata específicos del Estudio.
 */
import { pdf } from '@react-pdf/renderer';

import i18n from '../../i18n';
import { createEstudioMedidaPdfDocument } from './EstudioMedidaPdf';
import { embedEstudioMedidaStateInPdf } from './state/metadata';
import type { EstudioMedidaStateContainer } from './state/types';

export type GenerateOptions = {
  filename: string;
  viewerWindow?: Window | null;
};

export async function generateAndDownloadEstudioMedidaPdf(
  state: EstudioMedidaStateContainer,
  opts: GenerateOptions,
): Promise<void> {
  if (i18n.language !== state.locale) {
    await i18n.changeLanguage(state.locale);
  }
  try {
    const element = createEstudioMedidaPdfDocument(state);
    const baseBlob = await pdf(element).toBlob();
    const baseBytes = new Uint8Array(await baseBlob.arrayBuffer());
    const enriched = await embedEstudioMedidaStateInPdf(baseBytes, state);
    const finalBlob = new Blob([new Uint8Array(enriched)], { type: 'application/pdf' });
    const url = URL.createObjectURL(finalBlob);
    triggerDownload(url, opts.filename);
    if (opts.viewerWindow && !opts.viewerWindow.closed) {
      opts.viewerWindow.location.replace(url);
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    if (opts.viewerWindow && !opts.viewerWindow.closed) {
      opts.viewerWindow.close();
    }
    throw err;
  }
}

function triggerDownload(url: string, filename: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

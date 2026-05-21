/**
 * Embed / extract del state container del Estudio a la Medida en el Info
 * dictionary del PDF. Usa key propia (`EstudioMedidaState`) para no colisionar
 * con el state container del Comparador A/B (`MawmState`).
 */
import { PDFDocument, PDFDict, PDFHexString, PDFName, PDFString } from 'pdf-lib';

import type { EstudioMedidaStateContainer } from './types';
import { ESTUDIO_MEDIDA_INFO_KEY } from './types';

function getInfoDictUnsafe(doc: PDFDocument): PDFDict {
  return (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict();
}

export async function embedEstudioMedidaStateInPdf(
  pdfBytes: Uint8Array,
  state: EstudioMedidaStateContainer,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const json = JSON.stringify(state);
  const infoDict = getInfoDictUnsafe(doc);
  infoDict.set(PDFName.of(ESTUDIO_MEDIDA_INFO_KEY), PDFHexString.fromText(json));
  doc.setProducer('Mercantil AWM Planner / estudio-a-la-medida');
  doc.setSubject(`Mercantil — Estudio a la Medida (${state.client.type})`);
  doc.setKeywords(['estudio-medida', 'mercantil', 'planner', state.locale]);
  return doc.save();
}

export async function extractEstudioMedidaStateFromPdf(
  pdfBytes: Uint8Array,
): Promise<EstudioMedidaStateContainer | null> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const infoDict = getInfoDictUnsafe(doc);
  const raw = infoDict.get(PDFName.of(ESTUDIO_MEDIDA_INFO_KEY));
  if (!raw) return null;
  const decoded =
    raw instanceof PDFHexString || raw instanceof PDFString
      ? raw.decodeText()
      : String(raw);
  try {
    return JSON.parse(decoded) as EstudioMedidaStateContainer;
  } catch {
    return null;
  }
}

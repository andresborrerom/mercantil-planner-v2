import { PDFDocument, PDFDict, PDFHexString, PDFName, PDFString } from 'pdf-lib';

import type { PdfStateContainer } from './types';
import { PDF_STATE_XMP_NAMESPACE, PDF_STATE_XMP_PREFIX } from './types';

const KEY_NAME = 'MawmState';

// pdf-lib marca getInfoDict() como private aunque es estable y necesario para
// custom keys del Info dictionary. Migrar a embedded files (doc.attach) si
// pdf-lib expone un API público para custom Info entries.
function getInfoDictUnsafe(doc: PDFDocument): PDFDict {
  return (doc as unknown as { getInfoDict(): PDFDict }).getInfoDict();
}

export async function embedStateInPdf(
  pdfBytes: Uint8Array,
  state: PdfStateContainer,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const json = JSON.stringify(state);
  const infoDict = getInfoDictUnsafe(doc);
  // PDFHexString.fromText codifica UTF-16BE con BOM — soporta unicode completo
  // (PDFString.of solo soporta ASCII / PDFDocEncoding y se rompe con acentos).
  infoDict.set(PDFName.of(KEY_NAME), PDFHexString.fromText(json));
  doc.setProducer(`Mercantil AWM Planner / xmp-ns ${PDF_STATE_XMP_NAMESPACE}`);
  doc.setSubject(`Mercantil AWM — Plan personal de inversión (${state.client.bucket})`);
  doc.setKeywords([PDF_STATE_XMP_PREFIX, 'mercantil-awm', 'planner', state.locale]);
  return doc.save();
}

export async function extractStateFromPdf(
  pdfBytes: Uint8Array,
): Promise<PdfStateContainer | null> {
  const doc = await PDFDocument.load(pdfBytes, { ignoreEncryption: true });
  const infoDict = getInfoDictUnsafe(doc);
  const raw = infoDict.get(PDFName.of(KEY_NAME));
  if (!raw) return null;
  const decoded =
    raw instanceof PDFHexString || raw instanceof PDFString
      ? raw.decodeText()
      : String(raw);
  try {
    return JSON.parse(decoded) as PdfStateContainer;
  } catch {
    return null;
  }
}

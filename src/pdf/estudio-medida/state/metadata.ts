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

/**
 * Strip Float64Array paths del result antes de stringify. Razón: JSON.stringify
 * sobre Float64Array produce `{"0":v0,"1":v1,...}` con ~25 chars por valor.
 * Con nSims=5000 × horizon=240 × 10 arrays son ~16M doubles → ~400MB de JSON,
 * lo que tumba el browser (OOM) o explota el PDFHexString.
 *
 * Además el roundtrip JSON.stringify→JSON.parse ya rompía el tipo (Float64Array
 * → Object plano), así que el chart del upload ya estaba roto silenciosamente.
 *
 * Mantenemos: config, stats, meta, regimeCounts, events (livianos). El upload
 * restituye configuración + resumen estadístico; el chart pide re-correr la
 * simulación (mismo seed embedido → idénticos resultados).
 */
function stripHeavyPathsForEmbed(
  state: EstudioMedidaStateContainer,
): EstudioMedidaStateContainer {
  const stripResult = (result: EstudioMedidaStateContainer['result']) => {
    if (!result) return result;
    const empty = new Float64Array(0);
    return {
      meta: result.meta,
      stats: result.stats,
      regimeCounts: result.regimeCounts,
      events: result.events,
      allBulletNames: result.allBulletNames,
      // Paths/typed-arrays set a Float64Array vacío (sentinela "stripped").
      aumPath: empty,
      aumPathHTM: empty,
      aumPathReal: empty,
      sleevePath: empty,
      realAssetsPath: empty,
      netWealthPath: empty,
      netWealthPathReal: empty,
      loanBalancePath: empty,
      dpfBaselinePath: empty,
      inflationIndexPath: empty,
      cumInterestPaid: empty,
      cumForcedEquitySales: empty,
      cumForcedBulletSales: empty,
      cumLoanShortfall: empty,
    } as typeof result;
  };
  return {
    ...state,
    result: stripResult(state.result),
    savedVariants: state.savedVariants.map((v) => ({
      ...v,
      result: stripResult(v.result)!,
    })),
  };
}

export async function embedEstudioMedidaStateInPdf(
  pdfBytes: Uint8Array,
  state: EstudioMedidaStateContainer,
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(pdfBytes);
  const lightState = stripHeavyPathsForEmbed(state);
  const json = JSON.stringify(lightState);
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

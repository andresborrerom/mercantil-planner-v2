/**
 * Genera PDFs de muestra del módulo PDF de cierre, uno por locale,
 * en research/samples/. Para validación visual rápida.
 *
 * Uso:
 *   npx tsx scripts/generate-pdf-samples.ts
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToBuffer } from '@react-pdf/renderer';

import { createMercantilPdfDocument } from '../src/pdf/MercantilPdf';
import { embedStateInPdf } from '../src/pdf/state/metadata';
import { PDF_STATE_SCHEMA_VERSION, type PdfLocale, type PdfStateContainer } from '../src/pdf/state/types';
import i18n, { SUPPORTED_LOCALES } from '../src/i18n';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLES_DIR = resolve(__dirname, '..', 'research', 'samples');

function buildSampleState(locale: PdfLocale): PdfStateContainer {
  return {
    schemaVersion: PDF_STATE_SCHEMA_VERSION,
    generatedAt: '2026-05-05T18:00:00.000Z',
    sessionId: `mawm-2026-05-05-pocho-longevity-${locale}-001`,
    client: { name: 'Pocho Borrero', bucket: 'longevity' },
    advisor: { name: 'Andrés Borrero · Mercantil AWM' },
    locale,
    version: 'completa',
    modules: { stressTests: true, sensitivities: true, methodology: true },
    planner: {
      portfolioA: { kind: 'signature', id: 'Balanceado' },
      portfolioB: { kind: 'signature', id: 'Crecimiento' },
      plan: {
        initialCapital: 1_500_000,
        horizonMonths: 240,
        mode: 'real',
        inflationPct: 2.5,
        rules: [
          {
            id: 'r1',
            label: 'Aporte mensual',
            sign: 'deposit',
            amount: 5000,
            frequency: 'monthly',
            startMonth: 1,
            endMonth: null,
            growthPct: 3,
          },
        ],
      },
      bootstrap: {
        seed: 42,
        nPaths: 5000,
        blockSize: 12,
        fixed6Annual: 0.06,
        fixed9Annual: 0.09,
      },
      window: { startMonth: 1, endMonth: 240 },
    },
  };
}

async function generateForLocale(locale: PdfLocale): Promise<void> {
  await i18n.changeLanguage(locale);
  const state = buildSampleState(locale);
  const element = createMercantilPdfDocument(state);
  const baseBytes = await renderToBuffer(element);
  const enriched = await embedStateInPdf(new Uint8Array(baseBytes), state);
  const filename = `pocho-longevity.${locale}.pdf`;
  const outPath = resolve(SAMPLES_DIR, filename);
  await writeFile(outPath, enriched);
  console.log(`✓ ${filename}  (${(enriched.byteLength / 1024).toFixed(1)} KB)`);
}

async function main(): Promise<void> {
  await mkdir(SAMPLES_DIR, { recursive: true });
  console.log(`Generando muestras en ${SAMPLES_DIR}\n`);
  for (const locale of SUPPORTED_LOCALES) {
    await generateForLocale(locale);
  }
  console.log(`\nListo. Abrí los PDFs en research/samples/ para validación visual.`);
}

main().catch((err) => {
  console.error('Falló la generación de muestras:', err);
  process.exitCode = 1;
});

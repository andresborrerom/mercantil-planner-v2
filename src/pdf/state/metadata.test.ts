import { describe, expect, it } from 'vitest';
import { PDFDocument } from 'pdf-lib';

import { embedStateInPdf, extractStateFromPdf } from './metadata';
import { PDF_STATE_SCHEMA_VERSION } from './types';
import type { PdfStateContainer } from './types';

const sampleState: PdfStateContainer = {
  schemaVersion: PDF_STATE_SCHEMA_VERSION,
  generatedAt: '2026-05-05T15:00:00.000Z',
  sessionId: 'mawm-2026-05-05-pocho-longevity-001',
  client: { name: 'Pocho', bucket: 'longevity' },
  advisor: { name: 'Andrés Borrero' },
  locale: 'es',
  version: 'completa',
  modules: { stressTests: true, sensitivities: true, methodology: true },
  planner: {
    portfolioA: { kind: 'signature', id: 'Balanceado' },
    portfolioB: { kind: 'signature', id: 'Crecimiento' },
    plan: {
      initialCapital: 1_500_000.5,
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

async function buildBlankPdf(): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.addPage();
  return doc.save();
}

describe('PDF state container — round-trip embed/extract', () => {
  it('embebe el state y lo extrae intacto', async () => {
    const blank = await buildBlankPdf();
    const enriched = await embedStateInPdf(blank, sampleState);
    const extracted = await extractStateFromPdf(enriched);
    expect(extracted).toEqual(sampleState);
  });

  it('devuelve null cuando el PDF no tiene state embebido', async () => {
    const blank = await buildBlankPdf();
    const extracted = await extractStateFromPdf(blank);
    expect(extracted).toBeNull();
  });

  it('preserva floats con decimales (initialCapital)', async () => {
    const blank = await buildBlankPdf();
    const enriched = await embedStateInPdf(blank, sampleState);
    const extracted = await extractStateFromPdf(enriched);
    expect(extracted?.planner.plan.initialCapital).toBe(1_500_000.5);
  });

  it('preserva caracteres acentuados y unicode en strings', async () => {
    const stateWithUnicode: PdfStateContainer = {
      ...sampleState,
      client: { name: 'Núñez Müller — François 漢字', bucket: 'liquidity' },
      advisor: { name: 'José Andrés Borrero' },
    };
    const blank = await buildBlankPdf();
    const enriched = await embedStateInPdf(blank, stateWithUnicode);
    const extracted = await extractStateFromPdf(enriched);
    expect(extracted?.client.name).toBe('Núñez Müller — François 漢字');
    expect(extracted?.advisor.name).toBe('José Andrés Borrero');
  });

  it('soporta los 4 locales y los 3 buckets', async () => {
    const locales: PdfStateContainer['locale'][] = ['es', 'en', 'fr', 'de'];
    const buckets: PdfStateContainer['client']['bucket'][] = [
      'liquidity',
      'longevity',
      'legacy',
    ];
    const blank = await buildBlankPdf();
    for (const locale of locales) {
      for (const bucket of buckets) {
        const variant: PdfStateContainer = {
          ...sampleState,
          locale,
          client: { ...sampleState.client, bucket },
        };
        const enriched = await embedStateInPdf(blank, variant);
        const extracted = await extractStateFromPdf(enriched);
        expect(extracted?.locale).toBe(locale);
        expect(extracted?.client.bucket).toBe(bucket);
      }
    }
  });

  it('schemaVersion sale como 1 (forward-compat anchor)', async () => {
    const blank = await buildBlankPdf();
    const enriched = await embedStateInPdf(blank, sampleState);
    const extracted = await extractStateFromPdf(enriched);
    expect(extracted?.schemaVersion).toBe(1);
  });
});

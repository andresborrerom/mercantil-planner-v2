/**
 * Verifica end-to-end que los PDFs generados en research/samples/
 * tienen el state container extraíble e íntegro.
 *
 * Uso: npx tsx --tsconfig tsconfig.app.json scripts/verify-pdf-samples.ts
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { extractStateFromPdf } from '../src/pdf/state/metadata';
import { SUPPORTED_LOCALES } from '../src/i18n';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SAMPLES_DIR = resolve(__dirname, '..', 'research', 'samples');

async function verify(locale: string): Promise<boolean> {
  const path = resolve(SAMPLES_DIR, `pocho-longevity.${locale}.pdf`);
  const bytes = await readFile(path);
  const state = await extractStateFromPdf(new Uint8Array(bytes));
  if (!state) {
    console.log(`✗ ${locale}: NO state extractable`);
    return false;
  }
  const ok =
    state.locale === locale &&
    state.client.name === 'Pocho Borrero' &&
    state.client.bucket === 'longevity' &&
    state.planner.plan.initialCapital === 1_500_000 &&
    state.schemaVersion === 1;
  console.log(
    `${ok ? '✓' : '✗'} ${locale}: state extraído — cliente=${state.client.name}, ` +
      `bucket=${state.client.bucket}, capital=${state.planner.plan.initialCapital}`,
  );
  return ok;
}

async function main(): Promise<void> {
  console.log('Verificando round-trip end-to-end (PDF renderizado → extracción de state):\n');
  let allOk = true;
  for (const locale of SUPPORTED_LOCALES) {
    const ok = await verify(locale);
    if (!ok) allOk = false;
  }
  console.log(`\n${allOk ? '✓ Round-trip end-to-end OK en los 4 locales' : '✗ FALLA'}`);
  if (!allOk) process.exitCode = 1;
}

main().catch((err) => {
  console.error('Verificación falló:', err);
  process.exitCode = 1;
});

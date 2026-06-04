#!/usr/bin/env node
/**
 * fetch-infl.mjs — One-shot script para agregar INFL al data pipeline.
 *
 * Pasos:
 *   1. Fetch INFL.US (Horizon Kinetics Inflation Beneficiaries ETF) desde EODHD
 *      desde 2020-12 (necesitamos un mes anterior al primer return).
 *   2. Computa retornos mensuales totales (adjusted_close-based).
 *   3. Aligna a la grilla de DATES del CSV existente (2006-01 a 2026-04).
 *   4. Pre-2021: NaN (la impuación se hace en build-data.mjs con proxy=IXC).
 *   5. Agrega columna INFL al final del CSV.
 *
 * Idempotente: si INFL ya está en el CSV, no lo duplica (rewrite limpio).
 *
 * Uso: node scripts/fetch-infl.mjs
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '..', 'data', 'mercantil_retornos_backfilled.csv');

const TOKEN = process.env.EODHD_API_KEY;
if (!TOKEN) {
  console.error('[fetch-infl] Falta EODHD_API_KEY en env');
  process.exit(1);
}

async function fetchINFL() {
  // Fetch monthly bars desde 2020-12 (necesitamos 2020-12 close para
  // computar el return de 2021-01)
  const url = `https://eodhd.com/api/eod/INFL.US?api_token=${TOKEN}&from=2020-12-01&to=2026-05-31&period=m&fmt=json`;
  console.log(`[fetch-infl] GET INFL.US monthly bars 2020-12 → 2026-05`);
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`EODHD HTTP ${res.status}: ${await res.text()}`);
  }
  const bars = await res.json();
  console.log(`[fetch-infl] ✓ ${bars.length} bars recibidos`);
  return bars;
}

// Computa retornos mensuales desde adjusted_close. Agrupa por YYYY-MM.
function computeMonthlyReturns(bars) {
  // EODHD devuelve un bar por mes con date al primer día del mes (o cercano).
  // Computamos return = adj_close[t] / adj_close[t-1] - 1
  // y devolvemos un map { 'YYYY-MM' -> return }
  const byMonth = new Map();
  for (const b of bars) {
    const ym = b.date.slice(0, 7); // 'YYYY-MM'
    byMonth.set(ym, b.adjusted_close);
  }
  const sortedYms = [...byMonth.keys()].sort();
  const returns = new Map();
  for (let i = 1; i < sortedYms.length; i++) {
    const prevYm = sortedYms[i - 1];
    const curYm = sortedYms[i];
    const prev = byMonth.get(prevYm);
    const cur = byMonth.get(curYm);
    if (Number.isFinite(prev) && prev > 0 && Number.isFinite(cur)) {
      returns.set(curYm, cur / prev - 1);
    }
  }
  return returns;
}

function readCsv(path) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '').trim();
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(',');
  const rows = lines.slice(1).map((line) => line.split(','));
  return { header, rows };
}

function writeCsv(path, header, rows) {
  const lines = [header.join(',')];
  for (const r of rows) lines.push(r.join(','));
  writeFileSync(path, lines.join('\n') + '\n', 'utf8');
}

async function main() {
  const bars = await fetchINFL();
  const returns = computeMonthlyReturns(bars);
  console.log(`[fetch-infl] ✓ ${returns.size} monthly returns computados`);
  const sampleYms = [...returns.keys()].slice(0, 3);
  for (const ym of sampleYms) console.log(`  ${ym}: ${(returns.get(ym) * 100).toFixed(2)}%`);

  // Leer CSV existente
  const { header, rows } = readCsv(CSV_PATH);
  console.log(`[fetch-infl] CSV existente: ${rows.length} meses × ${header.length - 1} tickers`);

  // Idempotencia: si INFL ya está en header, lo removemos y re-agregamos
  let inflIdx = header.indexOf('INFL');
  if (inflIdx >= 0) {
    console.log(`[fetch-infl] INFL ya existe en columna ${inflIdx}, re-emitiendo`);
    header.splice(inflIdx, 1);
    for (const r of rows) r.splice(inflIdx, 1);
  }

  // Agregar columna INFL al final
  header.push('INFL');
  let filled = 0, nan = 0;
  for (const row of rows) {
    const ym = row[0];
    if (returns.has(ym)) {
      row.push(returns.get(ym).toFixed(8));
      filled++;
    } else {
      row.push(''); // NaN → build-data.mjs lo imputa con proxy
      nan++;
    }
  }
  console.log(`[fetch-infl] ${filled} meses con data real INFL, ${nan} meses con NaN (proxy en build-data)`);

  writeCsv(CSV_PATH, header, rows);
  console.log(`[fetch-infl] ✓ CSV emitido — INFL en columna ${header.length - 1}`);
}

main().catch((e) => {
  console.error('[fetch-infl] ERROR:', e.message);
  process.exit(1);
});

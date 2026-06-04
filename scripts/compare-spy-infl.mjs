#!/usr/bin/env node
/**
 * Compara retornos SPY vs INFL — todo con data REAL (sin proxies).
 *
 * INFL launched 2021-01-12 → primer return real es 2021-02.
 * Comparamos el periodo overlap completo: 2021-02 a 2026-04 (51 meses).
 *
 * Stats:
 *   - Retorno total acumulado
 *   - Retorno anualizado (CAGR)
 *   - Vol anualizada (std dev × sqrt(12))
 *   - Sharpe (vs rf=0 simplificacion)
 *   - Max drawdown
 *   - Hit ratio (% meses positivos)
 *   - Correlacion mes-a-mes
 *
 * Tambien: rolling 12m de cada uno + comparacion en sub-periodos clave.
 */

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '..', 'data', 'mercantil_retornos_backfilled.csv');

const text = readFileSync(CSV_PATH, 'utf8').replace(/^﻿/, '').trim();
const lines = text.split(/\r?\n/);
const header = lines[0].split(',');
const ixSPY = header.indexOf('SPY');
const ixINFL = header.indexOf('INFL');
if (ixSPY < 0) { console.error('SPY not found'); process.exit(1); }
if (ixINFL < 0) { console.error('INFL not found'); process.exit(1); }

const dates = [];
const spy = [];
const infl = [];
for (let i = 1; i < lines.length; i++) {
  const cols = lines[i].split(',');
  const ym = cols[0];
  const s = parseFloat(cols[ixSPY]);
  const n = parseFloat(cols[ixINFL]);
  dates.push(ym);
  spy.push(Number.isFinite(s) ? s : NaN);
  infl.push(Number.isFinite(n) ? n : NaN);
}

// Período real de INFL = donde el ticker tiene data (no proxy)
// INFL launched 2021-01 → primer return real es 2021-02
const startReal = '2021-02';
const startIdx = dates.indexOf(startReal);
if (startIdx < 0) { console.error(`Start ${startReal} not in dates`); process.exit(1); }

console.log(`Comparativo SPY vs INFL — periodo REAL ${startReal} a ${dates[dates.length-1]}`);
console.log(`Meses comparados: ${dates.length - startIdx}\n`);

// Slice al periodo real
const dSlice = dates.slice(startIdx);
const sSlice = spy.slice(startIdx);
const iSlice = infl.slice(startIdx);

// Stats helpers
function mean(arr) { return arr.reduce((s, v) => s + v, 0) / arr.length; }
function stdev(arr, mu) {
  return Math.sqrt(arr.reduce((s, v) => s + (v - mu) ** 2, 0) / (arr.length - 1));
}
function cumprod(arr) {
  let p = 1;
  return arr.map((v) => (p *= 1 + v));
}
function maxDrawdown(returns) {
  const cum = cumprod(returns);
  let peak = cum[0], maxDd = 0;
  for (const v of cum) {
    if (v > peak) peak = v;
    const dd = (v - peak) / peak;
    if (dd < maxDd) maxDd = dd;
  }
  return maxDd;
}
function corr(a, b) {
  const muA = mean(a), muB = mean(b);
  let num = 0, dA = 0, dB = 0;
  for (let i = 0; i < a.length; i++) {
    num += (a[i] - muA) * (b[i] - muB);
    dA += (a[i] - muA) ** 2;
    dB += (b[i] - muB) ** 2;
  }
  return num / Math.sqrt(dA * dB);
}

// Métricas
const n = sSlice.length;
const totalSpy = cumprod(sSlice).pop() - 1;
const totalInfl = cumprod(iSlice).pop() - 1;
const yearsActual = n / 12;
const cagrSpy = Math.pow(1 + totalSpy, 1 / yearsActual) - 1;
const cagrInfl = Math.pow(1 + totalInfl, 1 / yearsActual) - 1;
const meanSpy = mean(sSlice);
const meanInfl = mean(iSlice);
const stdSpy = stdev(sSlice, meanSpy);
const stdInfl = stdev(iSlice, meanInfl);
const volAnnSpy = stdSpy * Math.sqrt(12);
const volAnnInfl = stdInfl * Math.sqrt(12);
const sharpSpy = (meanSpy * 12) / volAnnSpy;
const sharpInfl = (meanInfl * 12) / volAnnInfl;
const mddSpy = maxDrawdown(sSlice);
const mddInfl = maxDrawdown(iSlice);
const posSpy = sSlice.filter((v) => v > 0).length / n;
const posInfl = iSlice.filter((v) => v > 0).length / n;
const correl = corr(sSlice, iSlice);

const pct = (x) => `${(x * 100).toFixed(2)}%`;
console.log('STATS GLOBALES (periodo 2021-02 a 2026-04):');
console.log('Metric                         SPY            INFL');
console.log('────────────────────────────── ───────────── ─────────────');
console.log(`Retorno total acumulado        ${pct(totalSpy).padStart(13)} ${pct(totalInfl).padStart(13)}`);
console.log(`CAGR (anualizado)              ${pct(cagrSpy).padStart(13)} ${pct(cagrInfl).padStart(13)}`);
console.log(`Volatilidad anualizada         ${pct(volAnnSpy).padStart(13)} ${pct(volAnnInfl).padStart(13)}`);
console.log(`Sharpe ratio (rf=0)            ${sharpSpy.toFixed(2).padStart(13)} ${sharpInfl.toFixed(2).padStart(13)}`);
console.log(`Max drawdown                   ${pct(mddSpy).padStart(13)} ${pct(mddInfl).padStart(13)}`);
console.log(`Meses positivos (hit ratio)    ${pct(posSpy).padStart(13)} ${pct(posInfl).padStart(13)}`);
console.log(`Correlación mensual            ${correl.toFixed(3)}`);

// Sub-periodos clave
console.log('\nRETORNOS ANUALIZADOS POR SUB-PERIODO:');
const subPeriods = [
  ['2021-02 → 2021-12 (inflación creciendo)', '2021-02', '2021-12'],
  ['2022-01 → 2022-12 (inflación spike, rates suben)', '2022-01', '2022-12'],
  ['2023-01 → 2023-12 (recuperación, rates altas)', '2023-01', '2023-12'],
  ['2024-01 → 2024-12 (normalización)', '2024-01', '2024-12'],
  ['2025-01 → 2026-04 (último período)', '2025-01', '2026-04'],
];

console.log('Periodo                                              SPY ann  INFL ann');
console.log('──────────────────────────────────────────────────── ──────── ────────');
for (const [label, start, end] of subPeriods) {
  const si = dates.indexOf(start), ei = dates.indexOf(end);
  if (si < 0 || ei < 0 || si > ei) continue;
  const sub_s = spy.slice(si, ei + 1);
  const sub_i = infl.slice(si, ei + 1);
  if (sub_s.some((v) => !Number.isFinite(v)) || sub_i.some((v) => !Number.isFinite(v))) {
    console.log(`${label.padEnd(52)} (data parcial — saltando)`);
    continue;
  }
  const totS = cumprod(sub_s).pop() - 1;
  const totI = cumprod(sub_i).pop() - 1;
  const yrs = sub_s.length / 12;
  const annS = Math.pow(1 + totS, 1 / yrs) - 1;
  const annI = Math.pow(1 + totI, 1 / yrs) - 1;
  console.log(`${label.padEnd(52)} ${pct(annS).padStart(7)}  ${pct(annI).padStart(7)}`);
}

console.log('\nLECTURA DEL DATO:');
const delta = cagrInfl - cagrSpy;
if (delta > 0) {
  console.log(`• INFL le ganó a SPY por ${pct(delta)} anual en el período completo.`);
} else {
  console.log(`• SPY le ganó a INFL por ${pct(-delta)} anual en el período completo.`);
}
if (volAnnInfl > volAnnSpy) {
  console.log(`• INFL es ${(volAnnInfl / volAnnSpy).toFixed(2)}x más volátil que SPY.`);
} else {
  console.log(`• INFL es ${(volAnnSpy / volAnnInfl).toFixed(2)}x menos volátil que SPY.`);
}
console.log(`• Correlación ${correl.toFixed(2)} — ${
  correl > 0.7 ? 'alta, se mueven similar' :
  correl > 0.4 ? 'moderada, comparten direccional pero divergen en magnitudes' :
  'baja, diversificación real entre los dos'
}.`);

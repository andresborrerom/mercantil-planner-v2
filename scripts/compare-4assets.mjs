#!/usr/bin/env node
/**
 * compare-4assets.mjs — Tabla comparativa SPY vs INFL vs TIPS vs CPI.
 * Métricas: CAGR, vol, Sharpe (rf=BIL CAGR), max DD, hit ratio, correlaciones,
 * y subperíodos clave del régimen inflacionario.
 *
 * Período: 2021-02 → 2026-04 (63 meses, overlap real de INFL desde launch).
 *
 * Output: JSON a /tmp/compare-4assets.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const TOKEN = process.env.EODHD_API_KEY;
if (!TOKEN) { console.error('Falta EODHD_API_KEY'); process.exit(1); }

const CSV_PATH = resolve(__dirname, '..', 'data', 'mercantil_retornos_backfilled.csv');
const MARKET_GEN_PATH = resolve(__dirname, '..', 'src/data/market.generated.ts');

async function fetchMonthly(ticker) {
  const url = `https://eodhd.com/api/eod/${ticker}?api_token=${TOKEN}&from=2020-12-01&to=2026-05-31&period=m&fmt=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${ticker} HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function barsToReturns(bars) {
  const byMonth = new Map();
  for (const b of bars) byMonth.set(b.date.slice(0, 7), b.adjusted_close);
  const sorted = [...byMonth.keys()].sort();
  const returns = new Map();
  for (let i = 1; i < sorted.length; i++) {
    const p = byMonth.get(sorted[i - 1]), c = byMonth.get(sorted[i]);
    if (Number.isFinite(p) && p > 0 && Number.isFinite(c)) returns.set(sorted[i], c / p - 1);
  }
  return returns;
}

function readCsvCol(path, col) {
  const text = readFileSync(path, 'utf8').replace(/^﻿/, '').trim();
  const lines = text.split(/\r?\n/);
  const header = lines[0].split(',');
  const idx = header.indexOf(col);
  if (idx < 0) throw new Error(`col ${col} no encontrada`);
  const out = new Map();
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const v = parseFloat(cells[idx]);
    if (Number.isFinite(v)) out.set(cells[0], v);
  }
  return out;
}

function loadInflation() {
  const text = readFileSync(MARKET_GEN_PATH, 'utf8');
  const datesMatch = text.match(/export const DATES: readonly string\[\] = \[([^\]]+)\]/);
  const inflMatch = text.match(/export const INFLATION: Float32Array = new Float32Array\(\[([^\]]+)\]\)/);
  if (!datesMatch || !inflMatch) throw new Error('parse market.generated falló');
  const dates = datesMatch[1].split(',').map((s) => s.trim().replace(/['"]/g, ''));
  const infl = inflMatch[1].split(',').map(parseFloat);
  const out = new Map();
  for (let i = 0; i < dates.length; i++) if (Number.isFinite(infl[i])) out.set(dates[i], infl[i]);
  return out;
}

// Stats helpers
const mean = (a) => a.reduce((s, v) => s + v, 0) / a.length;
const stdev = (a) => { const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / a.length); };
const annVol = (rs) => stdev(rs) * Math.sqrt(12);
const cagr = (rs) => { let l = 0; for (const r of rs) l += Math.log(1 + r); return Math.exp(l * 12 / rs.length) - 1; };
const totalRet = (rs) => { let p = 1; for (const r of rs) p *= 1 + r; return p - 1; };
const hitRate = (rs) => rs.filter((r) => r > 0).length / rs.length;
const corr = (a, b) => { const ma = mean(a), mb = mean(b); let n = 0, da = 0, db = 0; for (let i = 0; i < a.length; i++) { n += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return n / Math.sqrt(da * db); };
const maxDD = (rs) => { let peak = 1, val = 1, mdd = 0; for (const r of rs) { val *= 1 + r; if (val > peak) peak = val; const dd = val / peak - 1; if (dd < mdd) mdd = dd; } return mdd; };

function alignSeries(maps, yms) {
  return yms.map((ym) => maps.map((m) => m.get(ym)));
}

async function main() {
  console.log('[fetch] TIP.US y BIL.US (rf benchmark, faltan en CSV)…');
  const tipBars = await fetchMonthly('TIP.US');
  const bilBars = await fetchMonthly('BIL.US');
  const tipRet = barsToReturns(tipBars);
  const bilRet = barsToReturns(bilBars);
  console.log(`  TIP: ${tipRet.size} · BIL: ${bilRet.size} meses`);

  const spyRet = readCsvCol(CSV_PATH, 'SPY');
  const inflRet = readCsvCol(CSV_PATH, 'INFL'); // ya tiene proxy pre-2021 + real post
  const cpiM = loadInflation();
  console.log(`  CSV: SPY ${spyRet.size}, INFL ${inflRet.size} (incl. proxy); CPI ${cpiM.size}`);

  // Overlap: 2021-02 a 2026-04 — REAL post-launch de INFL
  const allYms = [...inflRet.keys()].filter((y) => y >= '2021-02' && y <= '2026-04').sort();
  // Filtrar a INFL real (post 2021-02). Pero el CSV ahora tiene proxy pre-2021,
  // así que necesito otra fuente: re-fetch INFL real puro.
  console.log('[fetch] INFL.US (puro real, no proxy)…');
  const inflRealBars = await fetchMonthly('INFL.US');
  const inflReal = barsToReturns(inflRealBars);
  console.log(`  INFL real: ${inflReal.size} meses`);

  const overlapYms = allYms.filter((y) => spyRet.has(y) && inflReal.has(y) && tipRet.has(y) && cpiM.has(y) && bilRet.has(y));
  console.log(`  Overlap: ${overlapYms.length} meses (${overlapYms[0]} → ${overlapYms[overlapYms.length - 1]})`);

  const spy = overlapYms.map((y) => spyRet.get(y));
  const infl = overlapYms.map((y) => inflReal.get(y));
  const tip = overlapYms.map((y) => tipRet.get(y));
  const cpi = overlapYms.map((y) => cpiM.get(y));
  const bil = overlapYms.map((y) => bilRet.get(y));

  // Risk-free benchmark = BIL CAGR (no usar inflación porque eso confunde el Sharpe)
  const rfAnn = cagr(bil);
  console.log(`  RF benchmark (BIL CAGR): ${(rfAnn * 100).toFixed(2)}%`);

  const sharpe = (rs) => (cagr(rs) - rfAnn) / annVol(rs);

  const stats = {
    period: `${overlapYms[0]} → ${overlapYms[overlapYms.length - 1]}`,
    months: overlapYms.length,
    rfAnn,
    metrics: {
      SPY: { totalRet: totalRet(spy), cagr: cagr(spy), vol: annVol(spy), sharpe: sharpe(spy), maxDD: maxDD(spy), hitRate: hitRate(spy) },
      INFL: { totalRet: totalRet(infl), cagr: cagr(infl), vol: annVol(infl), sharpe: sharpe(infl), maxDD: maxDD(infl), hitRate: hitRate(infl) },
      TIPS: { totalRet: totalRet(tip), cagr: cagr(tip), vol: annVol(tip), sharpe: sharpe(tip), maxDD: maxDD(tip), hitRate: hitRate(tip) },
      CPI: { totalRet: totalRet(cpi), cagr: cagr(cpi), vol: annVol(cpi), hitRate: hitRate(cpi) },
    },
    correlations: {
      'SPY-INFL': corr(spy, infl), 'SPY-TIPS': corr(spy, tip), 'SPY-CPI': corr(spy, cpi),
      'INFL-TIPS': corr(infl, tip), 'INFL-CPI': corr(infl, cpi),
      'TIPS-CPI': corr(tip, cpi),
    },
    subperiods: [],
  };

  // Sub-periods
  const subs = [
    { name: '2021-02 → 2021-12', from: '2021-02', to: '2021-12', desc: 'Inflación creciendo, tasas todavía bajas' },
    { name: '2022', from: '2022-01', to: '2022-12', desc: 'Spike inflación + Fed subiendo agresivo' },
    { name: '2023', from: '2023-01', to: '2023-12', desc: 'Recuperación equity, tasas altas' },
    { name: '2024', from: '2024-01', to: '2024-12', desc: 'Normalización' },
    { name: '2025-26', from: '2025-01', to: '2026-04', desc: 'Último período' },
  ];
  for (const s of subs) {
    const yms = overlapYms.filter((y) => y >= s.from && y <= s.to);
    if (yms.length === 0) continue;
    const idx = yms.map((y) => overlapYms.indexOf(y));
    const get = (arr) => idx.map((i) => arr[i]);
    stats.subperiods.push({
      name: s.name, desc: s.desc, months: yms.length,
      SPY: totalRet(get(spy)), INFL: totalRet(get(infl)), TIPS: totalRet(get(tip)), CPI: totalRet(get(cpi)),
    });
  }
  writeFileSync('/tmp/compare-4assets.json', JSON.stringify(stats, null, 2));
  console.log('\n✓ Stats guardadas en /tmp/compare-4assets.json');
  console.log(`\nMain metrics (${stats.period}, ${stats.months} meses):`);
  for (const [name, m] of Object.entries(stats.metrics)) {
    const sharpe = m.sharpe !== undefined ? `Sharpe ${m.sharpe.toFixed(2)} · ` : '';
    const maxdd = m.maxDD !== undefined ? `MaxDD ${(m.maxDD * 100).toFixed(2)}% · ` : '';
    console.log(`  ${name.padEnd(5)}: CAGR ${(m.cagr * 100).toFixed(2)}% · Vol ${(m.vol * 100).toFixed(2)}% · ${sharpe}${maxdd}Hit ${(m.hitRate * 100).toFixed(0)}%`);
  }
  console.log('\nCorrelaciones mensuales:');
  for (const [k, v] of Object.entries(stats.correlations)) console.log(`  ${k}: ${v.toFixed(2)}`);
}
main().catch((e) => { console.error('ERR:', e.message); process.exit(1); });

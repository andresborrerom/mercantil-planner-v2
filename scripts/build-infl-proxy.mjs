#!/usr/bin/env node
/**
 * build-infl-proxy.mjs — Construye proxy sintético de INFL desde 2006-01.
 *
 * Motivación: INFL (lanzamiento 2021-01) tiene solo 63 meses reales en el CSV.
 * El bootstrap del simulador muestrea 244 meses → 74% del pool actualmente
 * usa IXC (Energy) como proxy, sesgando la CAGR proyectada hacia abajo (~4.3%)
 * cuando el INFL real post-launch lleva 17.89% CAGR.
 *
 * Solución: basket de 5 ETFs cuyas exposiciones replican el modelo de negocio:
 *   - BIL (T-Bills 1-3m)             ← dampener de beta (cash-like)
 *   - IXC (energy global)            ← land/royalty oil&gas (32% INFL real)
 *   - GDX (gold miners)              ← precious metals royalty (15%)
 *   - IAI (US broker/exchange)       ← exchanges (15%)
 *   - SPY (broad US)                 ← catch-all (28%: utilities, ag, residual)
 *
 * (MXI descartado en v2: con peso 1.9% en NNLS no agregaba señal, solo
 * varianza estimada. BIL agregado en v3: el optimizador exageraba beta sin
 * componente low-vol — exageraba subidas y bajadas. BIL le da grado de libertad
 * para dampear.)
 *
 * Pesos: NNLS con Σw=1 y w≥0, fitteado en overlap 2021-02 → 2026-04.
 * Train/holdout split: 80/20 para reportar tracking error out-of-sample.
 *
 * Cobertura: para meses donde GDX o IAI no tienen data (4 meses iniciales,
 * 2006-01 → 2006-04), renormalizamos los pesos de los componentes disponibles
 * (Σ_avail w_i = 1). Cero NaN en el output.
 *
 * Output:
 *   - Imprime pesos óptimos, R² in/out, CAGR comparado vs IXC-only y vs INFL real
 *   - Re-emite CSV: columna INFL = sintética pre-2021-02, real desde 2021-02
 *   - Si --dry-run, NO toca el CSV (solo reporta)
 *
 * Uso: node scripts/build-infl-proxy.mjs [--dry-run]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CSV_PATH = resolve(__dirname, '..', 'data', 'mercantil_retornos_backfilled.csv');
const DRY_RUN = process.argv.includes('--dry-run');

const TOKEN = process.env.EODHD_API_KEY;
if (!TOKEN) {
  console.error('[build-infl-proxy] Falta EODHD_API_KEY en env');
  process.exit(1);
}

// ---------- Fetch helpers ----------

async function fetchMonthlyBars(ticker, from, to) {
  const url = `https://eodhd.com/api/eod/${ticker}?api_token=${TOKEN}&from=${from}&to=${to}&period=m&fmt=json`;
  console.log(`[fetch] ${ticker} ${from} → ${to}`);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`EODHD ${ticker} HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

function barsToMonthlyReturns(bars) {
  const byMonth = new Map();
  for (const b of bars) byMonth.set(b.date.slice(0, 7), b.adjusted_close);
  const sorted = [...byMonth.keys()].sort();
  const returns = new Map();
  for (let i = 1; i < sorted.length; i++) {
    const prev = byMonth.get(sorted[i - 1]);
    const cur = byMonth.get(sorted[i]);
    if (Number.isFinite(prev) && prev > 0 && Number.isFinite(cur)) {
      returns.set(sorted[i], cur / prev - 1);
    }
  }
  return returns;
}

// ---------- CSV ----------

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

function getCol(header, rows, ticker) {
  const idx = header.indexOf(ticker);
  if (idx < 0) throw new Error(`Ticker ${ticker} no está en el CSV`);
  const out = new Map();
  for (const r of rows) {
    const ym = r[0];
    const v = r[idx];
    if (v !== '' && v != null) {
      const num = parseFloat(v);
      if (Number.isFinite(num)) out.set(ym, num);
    }
  }
  return out;
}

// ---------- NNLS con sum-to-1 (projected gradient descent) ----------

function nnlsWithSimplex(X, y, opts = {}) {
  const { lr = 0.05, maxIter = 50000, tol = 1e-10 } = opts;
  const n = X.length;        // observaciones
  const k = X[0].length;     // componentes
  // Init: uniforme
  let w = new Array(k).fill(1 / k);

  const dot = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
  const matVec = (M, v) => M.map((row) => dot(row, v));
  const matTVec = (M, v) => {
    const out = new Array(M[0].length).fill(0);
    for (let i = 0; i < M.length; i++) for (let j = 0; j < M[0].length; j++) out[j] += M[i][j] * v[i];
    return out;
  };

  const projectSimplex = (v) => {
    // Project v onto {w : w_i >= 0, sum w_i = 1}
    // Algorithm: sort descending, find threshold (Wang & Carreira-Perpiñán 2013)
    const sorted = [...v].sort((a, b) => b - a);
    let cssv = 0;
    let rho = -1;
    for (let i = 0; i < sorted.length; i++) {
      cssv += sorted[i];
      const t = (cssv - 1) / (i + 1);
      if (sorted[i] - t > 0) rho = i;
    }
    let theta = 0;
    for (let i = 0; i <= rho; i++) theta += sorted[i];
    theta = (theta - 1) / (rho + 1);
    return v.map((x) => Math.max(x - theta, 0));
  };

  let prevLoss = Infinity;
  for (let iter = 0; iter < maxIter; iter++) {
    const pred = matVec(X, w);
    const res = pred.map((p, i) => p - y[i]);
    const grad = matTVec(X, res).map((g) => (2 * g) / n);
    let wNew = w.map((wi, i) => wi - lr * grad[i]);
    wNew = projectSimplex(wNew);
    const loss = res.reduce((s, r) => s + r * r, 0) / n;
    if (Math.abs(prevLoss - loss) < tol && iter > 100) break;
    prevLoss = loss;
    w = wNew;
  }
  return w;
}

// ---------- Stats helpers ----------

function cagr(returns) {
  let logSum = 0, n = 0;
  for (const r of returns) { logSum += Math.log(1 + r); n++; }
  if (n === 0) return NaN;
  return Math.exp((logSum * 12) / n) - 1;
}

function r2(yTrue, yPred) {
  const mean = yTrue.reduce((s, v) => s + v, 0) / yTrue.length;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < yTrue.length; i++) {
    ssRes += (yTrue[i] - yPred[i]) ** 2;
    ssTot += (yTrue[i] - mean) ** 2;
  }
  return 1 - ssRes / ssTot;
}

function trackingErrorAnn(yTrue, yPred) {
  const diff = yTrue.map((y, i) => y - yPred[i]);
  const mean = diff.reduce((s, v) => s + v, 0) / diff.length;
  const variance = diff.reduce((s, v) => s + (v - mean) ** 2, 0) / diff.length;
  return Math.sqrt(variance * 12);
}

function volAnn(series) {
  const m = series.reduce((s, v) => s + v, 0) / series.length;
  const v = series.reduce((s, x) => s + (x - m) ** 2, 0) / series.length;
  return Math.sqrt(v * 12);
}

function betaTo(y, x) {
  const mx = x.reduce((s, v) => s + v, 0) / x.length;
  const my = y.reduce((s, v) => s + v, 0) / y.length;
  let cov = 0, vx = 0;
  for (let i = 0; i < x.length; i++) { cov += (x[i] - mx) * (y[i] - my); vx += (x[i] - mx) ** 2; }
  return cov / vx;
}

// ---------- Main ----------

async function main() {
  // 1. Leer CSV: BIL, IXC, SPY ya están. INFL también (63 reales + 181 NaN).
  console.log('[step 1] Leyendo CSV existente…');
  const { header, rows } = readCsv(CSV_PATH);
  const bilRet = getCol(header, rows, 'BIL');
  const ixcRet = getCol(header, rows, 'IXC');
  const spyRet = getCol(header, rows, 'SPY');
  const inflReal = getCol(header, rows, 'INFL');
  console.log(`  BIL: ${bilRet.size} · IXC: ${ixcRet.size} · SPY: ${spyRet.size} · INFL real: ${inflReal.size}`);

  // 2. Fetchear GDX e IAI desde EODHD
  console.log('[step 2] Fetcheando GDX e IAI desde EODHD…');
  const gdxBars = await fetchMonthlyBars('GDX.US', '2005-12-01', '2026-05-31');
  const iaiBars = await fetchMonthlyBars('IAI.US', '2005-12-01', '2026-05-31');
  const gdxRet = barsToMonthlyReturns(gdxBars);
  const iaiRet = barsToMonthlyReturns(iaiBars);
  console.log(`  GDX: ${gdxRet.size} meses · IAI: ${iaiRet.size} meses`);

  // 3. Construir matriz X (componentes) y vector y (INFL real) para el overlap
  // Overlap = meses donde los 5 componentes + INFL real tienen valor
  const allYms = [...inflReal.keys()].sort();
  const overlapYms = allYms.filter((ym) =>
    bilRet.has(ym) && ixcRet.has(ym) && spyRet.has(ym) && gdxRet.has(ym) && iaiRet.has(ym)
  );
  console.log(`[step 3] Overlap completo: ${overlapYms.length} meses (${overlapYms[0]} → ${overlapYms[overlapYms.length-1]})`);

  // 4. Train/holdout split: primeros 80% para fit, último 20% para validar
  const nTrain = Math.floor(overlapYms.length * 0.8);
  const trainYms = overlapYms.slice(0, nTrain);
  const holdoutYms = overlapYms.slice(nTrain);
  console.log(`  Train: ${trainYms.length} meses (${trainYms[0]} → ${trainYms[trainYms.length-1]})`);
  console.log(`  Holdout: ${holdoutYms.length} meses (${holdoutYms[0]} → ${holdoutYms[holdoutYms.length-1]})`);

  const componentNames = ['BIL', 'IXC', 'GDX', 'IAI', 'SPY'];
  const components = [bilRet, ixcRet, gdxRet, iaiRet, spyRet];

  const buildXY = (yms) => {
    const X = yms.map((ym) => components.map((m) => m.get(ym)));
    const y = yms.map((ym) => inflReal.get(ym));
    return { X, y };
  };
  const train = buildXY(trainYms);
  const holdout = buildXY(holdoutYms);

  // 5. Fit NNLS con sum-to-1
  console.log('[step 4] Fitting NNLS con Σw=1, w≥0…');
  const w = nnlsWithSimplex(train.X, train.y);
  console.log('  Pesos óptimos:');
  componentNames.forEach((name, i) => console.log(`    ${name}: ${(w[i] * 100).toFixed(2)}%`));
  console.log(`    suma: ${(w.reduce((s, x) => s + x, 0) * 100).toFixed(2)}%`);

  // 6. Predicciones in-sample y out-of-sample
  const predTrain = train.X.map((row) => row.reduce((s, v, i) => s + v * w[i], 0));
  const predHoldout = holdout.X.map((row) => row.reduce((s, v, i) => s + v * w[i], 0));
  const r2Train = r2(train.y, predTrain);
  const r2Holdout = r2(holdout.y, predHoldout);
  const teTrain = trackingErrorAnn(train.y, predTrain);
  const teHoldout = trackingErrorAnn(holdout.y, predHoldout);
  console.log('[step 5] Validación:');
  console.log(`  R² in-sample:    ${r2Train.toFixed(4)}`);
  console.log(`  R² out-of-sample: ${r2Holdout.toFixed(4)}`);
  console.log(`  Tracking error in-sample (anualizado):    ${(teTrain * 100).toFixed(2)}%`);
  console.log(`  Tracking error out-of-sample (anualizado): ${(teHoldout * 100).toFixed(2)}%`);
  // Vol y beta para verificar dampening
  const volInfl = volAnn(train.y);
  const volSynth = volAnn(predTrain);
  const beta = betaTo(predTrain, train.y);
  console.log(`  Vol anualizada INFL real (train):       ${(volInfl * 100).toFixed(2)}%`);
  console.log(`  Vol anualizada Sintético (train):       ${(volSynth * 100).toFixed(2)}%`);
  console.log(`  Ratio vol Sintético/INFL:               ${(volSynth / volInfl).toFixed(3)}x`);
  console.log(`  Beta Sintético vs INFL (train):         ${beta.toFixed(3)}`);

  // 7. Computar serie sintética COMPLETA (2006-01 → 2026-04)
  // Para meses donde algún componente no tiene data, renormalizamos los pesos
  // de los componentes disponibles (Σ_avail = 1). Cero NaN en el output.
  console.log('[step 6] Computando serie sintética completa (con renormalización)…');
  const allCsvYms = rows.map((r) => r[0]);
  const synthetic = new Map();
  let nFullBasket = 0, nRenorm = 0, nNoData = 0;
  let renormDetails = [];
  for (const ym of allCsvYms) {
    const avail = components.map((m, i) => m.has(ym) ? i : -1).filter((i) => i >= 0);
    if (avail.length === 0) { nNoData++; continue; }
    const wSum = avail.reduce((s, i) => s + w[i], 0);
    if (wSum <= 1e-12) { nNoData++; continue; }
    let ret = 0;
    for (const i of avail) ret += (w[i] / wSum) * components[i].get(ym);
    synthetic.set(ym, ret);
    if (avail.length === components.length) {
      nFullBasket++;
    } else {
      nRenorm++;
      const missing = componentNames.filter((_, i) => !avail.includes(i)).join(',');
      renormDetails.push(`    ${ym}: faltó ${missing} → renormalizado a [${avail.map(i => componentNames[i]).join('+')}]`);
    }
  }
  console.log(`  Meses con basket completo: ${nFullBasket} · renormalizados: ${nRenorm} · sin data: ${nNoData}`);
  if (renormDetails.length > 0 && renormDetails.length <= 10) {
    console.log('  Detalle de renormalizados:');
    renormDetails.forEach((d) => console.log(d));
  }

  // 8. CAGR comparado para contexto: pre-2021-02 (donde el proxy importa)
  console.log('[step 7] CAGR pre-2021-02 (el período que actualmente usa IXC):');
  const preCutoff = (ym) => ym < '2021-02';
  const preIxc = allCsvYms.filter(preCutoff).filter((y) => ixcRet.has(y)).map((y) => ixcRet.get(y));
  const preSpy = allCsvYms.filter(preCutoff).filter((y) => spyRet.has(y)).map((y) => spyRet.get(y));
  const preSynth = allCsvYms.filter(preCutoff).filter((y) => synthetic.has(y)).map((y) => synthetic.get(y));
  console.log(`  IXC (proxy actual):       CAGR ${(cagr(preIxc) * 100).toFixed(2)}% (${preIxc.length} meses)`);
  console.log(`  SPY (referencia):         CAGR ${(cagr(preSpy) * 100).toFixed(2)}% (${preSpy.length} meses)`);
  console.log(`  PROXY SINTÉTICO nuevo:    CAGR ${(cagr(preSynth) * 100).toFixed(2)}% (${preSynth.length} meses)`);

  // 9. Pool blendeado (cómo va a quedar el bootstrap después)
  const postReal = allCsvYms.filter((y) => y >= '2021-02').filter((y) => inflReal.has(y)).map((y) => inflReal.get(y));
  const blended = [...preSynth, ...postReal];
  console.log(`[step 8] Pool BLENDEADO (lo que el bootstrap va a samplear):`);
  console.log(`  PROXY pre-2021 (${preSynth.length}) + INFL real post (${postReal.length}) = ${blended.length} meses`);
  console.log(`  CAGR blendeada: ${(cagr(blended) * 100).toFixed(2)}%`);
  console.log(`  (vs CAGR pool actual con IXC: ${(cagr([...preIxc, ...postReal]) * 100).toFixed(2)}%)`);

  // 9b. Emitir JSON con series para el chart (INFL real, SPY, CPI) rebaseadas a 100
  console.log('\n[step 8b] Emitiendo data del chart a /tmp/infl-spy-cpi-chart-data.json…');
  // Cargar CPI desde market.generated.ts
  const marketGen = readFileSync(resolve(__dirname, '..', 'src/data/market.generated.ts'), 'utf8');
  const inflMatch = marketGen.match(/export const INFLATION: Float32Array = new Float32Array\(\[([^\]]+)\]\)/);
  if (!inflMatch) throw new Error('No pude parsear INFLATION en market.generated.ts');
  const cpiMonthly = inflMatch[1].split(',').map(parseFloat);
  console.log(`  CPI mensual cargado: ${cpiMonthly.length} meses`);

  // Construir series desde 2021-02 (cuando empieza INFL real)
  const startYm = '2021-02';
  const chartYms = allCsvYms.filter((ym) => ym >= startYm);
  const startIdxFull = allCsvYms.indexOf(startYm);
  let inflCum = 100, spyCum = 100, cpiCum = 100, synthCum = 100;
  const chartData = [];
  for (let i = 0; i < chartYms.length; i++) {
    const ym = chartYms[i];
    const globalIdx = startIdxFull + i;
    const rInfl = inflReal.get(ym);
    const rSpy = spyRet.get(ym);
    const rCpi = cpiMonthly[globalIdx];
    const rSynth = synthetic.get(ym);
    if (Number.isFinite(rInfl)) inflCum *= 1 + rInfl;
    if (Number.isFinite(rSpy)) spyCum *= 1 + rSpy;
    if (Number.isFinite(rCpi)) cpiCum *= 1 + rCpi;
    if (Number.isFinite(rSynth)) synthCum *= 1 + rSynth;
    chartData.push({
      ym,
      infl: +inflCum.toFixed(4),
      spy: +spyCum.toFixed(4),
      cpi: +cpiCum.toFixed(4),
      synth: +synthCum.toFixed(4),
    });
  }
  // Stats del período
  const cagrFromCum = (start, end, months) => Math.pow(end / start, 12 / months) - 1;
  const nM = chartData.length;
  const stats = {
    period: `${startYm} → ${chartYms[chartYms.length - 1]}`,
    months: nM,
    inflCagr: cagrFromCum(100, inflCum, nM),
    spyCagr: cagrFromCum(100, spyCum, nM),
    cpiCagr: cagrFromCum(100, cpiCum, nM),
    synthCagr: cagrFromCum(100, synthCum, nM),
    weights: Object.fromEntries(componentNames.map((n, i) => [n, +w[i].toFixed(4)])),
  };
  console.log('  CAGR período overlap:');
  console.log(`    INFL real: ${(stats.inflCagr * 100).toFixed(2)}%`);
  console.log(`    SPY:       ${(stats.spyCagr * 100).toFixed(2)}%`);
  console.log(`    Sintético: ${(stats.synthCagr * 100).toFixed(2)}%`);
  console.log(`    CPI (inflación realizada anualizada): ${(stats.cpiCagr * 100).toFixed(2)}%`);
  writeFileSync('/tmp/infl-spy-cpi-chart-data.json', JSON.stringify({ stats, chartData }, null, 2));
  console.log(`  ✓ ${chartData.length} puntos escritos`);

  if (DRY_RUN) {
    console.log('\n[dry-run] No se modifica el CSV.');
    return;
  }

  // 10. Re-emitir CSV: INFL = sintético pre-2021-02, real desde 2021-02
  console.log('\n[step 9] Re-emitiendo CSV con INFL = sintético + real…');
  const inflIdx = header.indexOf('INFL');
  let nFilled = 0, nKeptReal = 0, nStillNan = 0;
  for (const row of rows) {
    const ym = row[0];
    if (ym >= '2021-02' && inflReal.has(ym)) {
      // Mantener real
      nKeptReal++;
    } else if (synthetic.has(ym)) {
      row[inflIdx] = synthetic.get(ym).toFixed(8);
      nFilled++;
    } else {
      row[inflIdx] = '';
      nStillNan++;
    }
  }
  console.log(`  ${nKeptReal} meses INFL real preservados · ${nFilled} meses con proxy sintético · ${nStillNan} NaN restantes`);
  writeCsv(CSV_PATH, header, rows);
  console.log(`[done] CSV actualizado.`);
}

main().catch((e) => {
  console.error('[build-infl-proxy] ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
});

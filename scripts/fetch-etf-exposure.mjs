#!/usr/bin/env node
/**
 * fetch-etf-exposure.mjs — Pull EODHD fundamentals para los ETFs del case study
 * y generar src/data/etf-exposure.ts (dictionary committeada).
 *
 * Cobertura inicial (TBSC default + opcionales):
 *   - Bullets US-equivalents (proxy de iBonds UCITS): IBDR..IBDZ (Dec 2026-2034)
 *   - Equity sleeve: catálogo de useEquityMeta.ts
 *   - Cash: BIL, SHY
 *   - RealAssets: INFL, RWO, IEI, IXC
 *   - Opcionales: GHYG (HY ladder), HYG, AGG, LQD
 *
 * Output:
 *   - src/data/etf-exposure.ts (TypeScript, exporta ETF_EXPOSURE record)
 *
 * Re-correr trimestralmente — EODHD actualiza holdings con lag de ~30-45 días.
 *
 * Env requeridas: EODHD_API_KEY
 *
 * Uso: node scripts/fetch-etf-exposure.mjs
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '..', 'src', 'data', 'etf-exposure.ts');

const TOKEN = process.env.EODHD_API_KEY;
if (!TOKEN) {
  console.error('ERROR: EODHD_API_KEY no está en env.');
  process.exit(1);
}

// ---------- Universo ----------
// Cada entry: ticker EODHD → metadata adicional manual (creditQuality, sleeve hint).
// El sleeve hint es informativo; el mapping ETF→sleeve real vive en el componente
// (depende del config del case study), no acá.

const UNIVERSE = [
  // Bullets — iBonds US (proxy del iBonds UCITS UCITS-EUR del TBSC)
  { ticker: 'IBDR.US', creditQuality: 'IG', note: 'iBonds Dec 2026 Term Corp (proxy de UCITS)' },
  { ticker: 'IBDS.US', creditQuality: 'IG', note: 'iBonds Dec 2027 Term Corp (proxy de UCITS)' },
  { ticker: 'IBDT.US', creditQuality: 'IG', note: 'iBonds Dec 2028 Term Corp (proxy de UCITS)' },
  { ticker: 'IBDU.US', creditQuality: 'IG', note: 'iBonds Dec 2029 Term Corp (proxy de UCITS)' },
  { ticker: 'IBDV.US', creditQuality: 'IG', note: 'iBonds Dec 2030 Term Corp (proxy de UCITS)' },
  { ticker: 'IBDW.US', creditQuality: 'IG', note: 'iBonds Dec 2031 Term Corp (proxy de UCITS)' },
  { ticker: 'IBDX.US', creditQuality: 'IG', note: 'iBonds Dec 2032 Term Corp (proxy de UCITS)' },
  { ticker: 'IBDY.US', creditQuality: 'IG', note: 'iBonds Dec 2033 Term Corp (proxy de UCITS)' },
  { ticker: 'IBDZ.US', creditQuality: 'IG', note: 'iBonds Dec 2034 Term Corp (proxy de UCITS)' },

  // Bullets opcionales — HY
  { ticker: 'GHYG.US', creditQuality: 'HY', note: 'iShares Global HY Corp UCITS (proxy US)' },
  { ticker: 'HYG.US',  creditQuality: 'HY', note: 'iShares iBoxx HY Corp' },

  // Equity sleeve
  { ticker: 'USMV.US', creditQuality: 'N/A', note: 'iShares MSCI USA Min Vol' },
  { ticker: 'SCHD.US', creditQuality: 'N/A', note: 'Schwab US Dividend' },
  { ticker: 'SPY.US',  creditQuality: 'N/A', note: 'SPDR S&P 500' },
  { ticker: 'ACWI.US', creditQuality: 'N/A', note: 'iShares MSCI ACWI' },
  { ticker: 'SPLV.US', creditQuality: 'N/A', note: 'Invesco S&P 500 Low Vol' },
  { ticker: 'NOBL.US', creditQuality: 'N/A', note: 'ProShares Dividend Aristocrats' },
  { ticker: 'SPHQ.US', creditQuality: 'N/A', note: 'Invesco S&P 500 Quality' },
  { ticker: 'SPYD.US', creditQuality: 'N/A', note: 'SPDR S&P 500 High Dividend' },
  { ticker: 'OEF.US',  creditQuality: 'N/A', note: 'iShares S&P 100' },
  { ticker: 'QQQ.US',  creditQuality: 'N/A', note: 'Invesco QQQ Trust' },
  { ticker: 'IJR.US',  creditQuality: 'N/A', note: 'iShares Core S&P Small-Cap' },
  { ticker: 'RSP.US',  creditQuality: 'N/A', note: 'Invesco S&P 500 Equal Weight' },
  { ticker: 'SPMO.US', creditQuality: 'N/A', note: 'Invesco S&P 500 Momentum' },
  { ticker: 'CAPE.US', creditQuality: 'N/A', note: 'Barclays ETN+ Shiller CAPE' },

  // Cash
  { ticker: 'BIL.US', creditQuality: 'Treasury', note: 'SPDR Bloomberg 1-3M T-Bill' },
  { ticker: 'SHY.US', creditQuality: 'Treasury', note: 'iShares 1-3Y Treasury' },

  // Real Assets
  { ticker: 'INFL.US', creditQuality: 'N/A', note: 'Horizon Kinetics Inflation Beneficiaries' },
  { ticker: 'RWO.US',  creditQuality: 'N/A', note: 'SPDR Dow Jones Global Real Estate' },
  { ticker: 'IEI.US',  creditQuality: 'Treasury', note: 'iShares 3-7Y Treasury' },
  { ticker: 'IXC.US',  creditQuality: 'N/A', note: 'iShares Global Energy' },

  // Fixed income complementarios (por si entran a algún case study)
  { ticker: 'AGG.US', creditQuality: 'IG', note: 'iShares Core US Aggregate Bond' },
  { ticker: 'LQD.US', creditQuality: 'IG', note: 'iShares iBoxx IG Corp' },
];

// ---------- Bucketing de geografía ----------
// EODHD World_Regions devuelve estos labels. Mapeamos a 3 buckets MVP.

const GEO_BUCKET_MAP = {
  'North America':        'US',           // mayormente US, Canadá <3% en la mayoría
  'United Kingdom':       'DM-ex-US',
  'Europe Developed':     'DM-ex-US',
  'Japan':                'DM-ex-US',
  'Australasia':          'DM-ex-US',
  'Asia Developed':       'DM-ex-US',
  'Asia Emerging':        'EM',
  'Europe Emerging':      'EM',
  'Africa/Middle East':   'EM',
  'Latin America':        'EM',
};

// ---------- Overrides manuales (donde EODHD no expone breakdown) ----------
//
// EODHD NO entrega Sector_Weights ni Country_Weights para bond ETFs. Llenamos
// estos campos manualmente desde fact sheets de iShares/SPDR (snapshot fact sheets
// 2026-Q1, fuentes públicas).
//
// Para bonds:
//   - Geografía: emisores del fondo (US-corp vs intl-corp).
//   - Sectores: GICS-like de los issuers (no de los instrumentos).
// Para tesoros: geo=100% US, sector único 'Government Treasury' (100%).
//
// La distribución iBoxx Liquid IG es estable trans-vintage; aplicamos el mismo
// breakdown a las 9 vintages de iBonds (IBDR..IBDZ). Si en un futuro EODHD
// agrega esto al ETF_Data, removemos overrides.

const IBOXX_LIQUID_IG_SECTORS = {
  'Financial Services':      28,
  'Industrials':             12,
  'Technology':              12,
  'Healthcare':              11,
  'Consumer Cyclicals':       8,
  'Communication Services':   7,
  'Consumer Defensive':       7,
  'Energy':                   7,
  'Utilities':                6,
  'Real Estate':              2,
};

const IBOXX_LIQUID_HY_SECTORS = {
  'Communication Services':  16,
  'Consumer Cyclicals':      14,
  'Industrials':             12,
  'Energy':                  12,
  'Healthcare':              10,
  'Consumer Defensive':       8,
  'Financial Services':       7,
  'Technology':               6,
  'Utilities':                6,
  'Basic Materials':          5,
  'Real Estate':              4,
};

const AGG_SECTORS = {
  'Government Treasury':     42,
  'Agency MBS':              25,
  'Financial Services':       7,
  'Industrials':              5,
  'Consumer Defensive':       3,
  'Utilities':                3,
  'Technology':               3,
  'Consumer Cyclicals':       3,
  'Communication Services':   3,
  'Healthcare':               3,
  'Energy':                   2,
  'Real Estate':              1,
};

const TREASURY_SECTORS = { 'Government Treasury': 100 };

// Map ticker -> override. null override significa "no aplicar".
// Cada override es parcial: si especificás solo `sectors`, el `geo` viene de EODHD.
const MANUAL_OVERRIDES = {
  // iBonds IG (9 vintages) — todas usan iBoxx Liquid IG distribution
  IBDR: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  IBDS: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  IBDT: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  IBDU: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  IBDV: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  IBDW: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  IBDX: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  IBDY: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  IBDZ: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },

  // HY corporate
  HYG:  { geo: { US: 95, 'DM-ex-US': 5,  EM: 0 }, sectors: IBOXX_LIQUID_HY_SECTORS },
  GHYG: { geo: { US: 60, 'DM-ex-US': 35, EM: 5 }, sectors: IBOXX_LIQUID_HY_SECTORS },

  // IG corporate (LQD ~= iBoxx IG, AGG = Treasury + MBS + IG corp)
  LQD: { geo: { US: 88, 'DM-ex-US': 12, EM: 0 }, sectors: IBOXX_LIQUID_IG_SECTORS },
  AGG: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: AGG_SECTORS },

  // Tesoros US
  BIL: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: TREASURY_SECTORS },
  SHY: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: TREASURY_SECTORS },
  IEI: { geo: { US: 100, 'DM-ex-US': 0, EM: 0 }, sectors: TREASURY_SECTORS },

  // CAPE — ETN sectorial rotativo; sin data útil. Lo dejamos sin sectors/geo y
  // el componente mostrará un mensaje "Estrategia de rotación sectorial — sin
  // breakdown estable".
  CAPE: null,
};

// ---------- Fetch ----------

async function fetchFundamentals(ticker) {
  const url = `https://eodhd.com/api/fundamentals/${ticker}?api_token=${TOKEN}&fmt=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${ticker}`);
  return res.json();
}

function bucketGeos(worldRegions) {
  const out = { 'US': 0, 'DM-ex-US': 0, 'EM': 0 };
  if (!worldRegions) return out;
  for (const [label, v] of Object.entries(worldRegions)) {
    const bucket = GEO_BUCKET_MAP[label];
    const pct = parseFloat(v?.['Equity_%'] || '0');
    if (bucket && Number.isFinite(pct)) {
      out[bucket] += pct;
    }
  }
  // Si total = 0 (ej. bond ETF puro sin equity), devolver vacío
  const total = out['US'] + out['DM-ex-US'] + out['EM'];
  if (total < 0.1) return null;
  // Normalizar a 100 (EODHD a veces no suma exacto)
  for (const k of Object.keys(out)) out[k] = +(out[k] * 100 / total).toFixed(2);
  return out;
}

function extractSectors(sectorWeights) {
  if (!sectorWeights) return null;
  const out = {};
  for (const [label, v] of Object.entries(sectorWeights)) {
    const pct = parseFloat(v?.['Equity_%'] || '0');
    if (Number.isFinite(pct) && pct > 0) {
      out[label] = +pct.toFixed(2);
    }
  }
  if (Object.keys(out).length === 0) return null;
  // Normalizar a 100
  const total = Object.values(out).reduce((s, v) => s + v, 0);
  if (total < 0.1) return null;
  for (const k of Object.keys(out)) out[k] = +(out[k] * 100 / total).toFixed(2);
  return out;
}

function extractFixedIncome(fi) {
  if (!fi) return null;
  const dur = parseFloat(fi?.EffectiveDuration?.['Fund_%'] || 'NaN');
  const ytm = parseFloat(fi?.YieldToMaturity?.['Fund_%'] || 'NaN');
  return {
    effectiveDuration: Number.isFinite(dur) ? +dur.toFixed(2) : null,
    yieldToMaturity:   Number.isFinite(ytm) ? +ytm.toFixed(2) : null,
  };
}

// ---------- Main ----------

async function main() {
  console.log(`[fetch-etf-exposure] Pulling ${UNIVERSE.length} ETFs from EODHD...`);
  const results = {};
  const errors = [];

  for (const { ticker, creditQuality, note } of UNIVERSE) {
    const base = ticker.replace(/\.US$/, '');
    try {
      const d = await fetchFundamentals(ticker);
      const etf = d?.ETF_Data || {};
      const name = d?.General?.Name || base;

      const geoApi     = bucketGeos(etf.World_Regions);
      const sectorsApi = extractSectors(etf.Sector_Weights);
      // Solo emitir fixedIncome para bonos/tesoros. Para equity (creditQuality 'N/A')
      // EODHD a veces devuelve Fixed_Income con ceros — no informativo.
      const fixedIncome = (creditQuality === 'N/A') ? null : extractFixedIncome(etf.Fixed_Income);

      // Aplicar overrides manuales (para bonds que EODHD no expone)
      const override = MANUAL_OVERRIDES[base];
      const geo     = override === null ? null : (override?.geo     ?? geoApi);
      const sectors = override === null ? null : (override?.sectors ?? sectorsApi);
      const sourceSectors = override?.sectors ? 'manual (iBoxx index)'
                         : sectorsApi          ? 'EODHD'
                         : 'N/A';
      const sourceGeo = override?.geo ? 'manual (fact sheet)'
                      : geoApi         ? 'EODHD'
                      : 'N/A';

      results[base] = {
        ticker: base,
        name,
        creditQuality,
        note,
        geo,
        sectors,
        fixedIncome,
        sourceGeo,
        sourceSectors,
      };

      const geoSum = geo ? `geo:${(geo['US']+geo['DM-ex-US']+geo['EM']).toFixed(0)}%` : 'geo:N/A';
      const secSum = sectors ? `sectors:${Object.keys(sectors).length}` : 'sectors:N/A';
      console.log(`  ${base.padEnd(6)} ${name.slice(0, 40).padEnd(40)} ${geoSum} ${secSum}`);
    } catch (err) {
      errors.push({ ticker, error: err.message });
      console.log(`  ${base.padEnd(6)} ERROR: ${err.message}`);
    }
  }

  console.log(`\n[fetch-etf-exposure] ${Object.keys(results).length} fetched OK, ${errors.length} errors.`);

  // ---------- Write TS file ----------
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const header = `/**
 * ETF exposure dictionary — geografía, sectores, calidad crediticia.
 *
 * AUTO-GENERADO por scripts/fetch-etf-exposure.mjs desde EODHD fundamentals.
 * NO editar a mano — re-correr el script y commitear el output.
 *
 * Snapshot: ${snapshotDate}
 * Fuente:   EODHD ETF fundamentals API (World_Regions, Sector_Weights, Fixed_Income)
 *
 * Cobertura: ${Object.keys(results).length} ETFs del case study TBSC + opcionales.
 * Re-correr trimestralmente (EODHD actualiza holdings con lag ~30-45 días).
 */

export type GeoBucket = 'US' | 'DM-ex-US' | 'EM';

export type CreditQuality = 'IG' | 'HY' | 'Treasury' | 'N/A';

export type ETFExposure = {
  /** Ticker base (sin sufijo .US) */
  ticker: string;
  /** Nombre legible del ETF */
  name: string;
  /** Etiqueta agregada de calidad crediticia. 'N/A' para equity puro. */
  creditQuality: CreditQuality;
  /** Comentario interno (proxies, notas de uso). */
  note: string;
  /**
   * Breakdown de geografía por bucket MVP (suma a 100 si presente).
   * null si no aplica (ej. ETN sin posición física estable).
   */
  geo: Record<GeoBucket, number> | null;
  /**
   * Breakdown sectorial GICS-like + categorías de bond (suma a 100 si presente).
   * null si no aplica.
   */
  sectors: Record<string, number> | null;
  /** Métricas de fixed income (null para equity puro). */
  fixedIncome: {
    effectiveDuration: number | null;
    yieldToMaturity: number | null;
  } | null;
  /** Fuente del breakdown de geo (EODHD vs override manual). Para auditar. */
  sourceGeo: string;
  /** Fuente del breakdown sectorial (EODHD vs override manual). Para auditar. */
  sourceSectors: string;
};

export const ETF_EXPOSURE_SNAPSHOT_DATE = '${snapshotDate}';

export const ETF_EXPOSURE: Record<string, ETFExposure> = ${JSON.stringify(results, null, 2)};
`;

  writeFileSync(OUT_PATH, header, 'utf8');
  console.log(`[fetch-etf-exposure] Wrote ${OUT_PATH}`);

  if (errors.length > 0) {
    console.log('\nErrores:');
    for (const e of errors) console.log(`  ${e.ticker}: ${e.error}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[fetch-etf-exposure] FATAL:', err);
  process.exit(1);
});

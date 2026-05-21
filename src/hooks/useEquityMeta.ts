/**
 * Hook + cache singleton para el catálogo de equity custom servido por
 * estudios-a-la-medida via GitHub Pages. Vive en hooks/ (no en components/)
 * para que React Fast Refresh no se queje de mezclar componentes + non-components.
 *
 * URL canónica:
 *   https://andresborrerom.github.io/estudios-a-la-medida/data/equity_universe_meta.json
 *
 * Si el fetch falla, devolvemos el FALLBACK inline mantenido en este módulo
 * (alineado con refresh_equity_custom.py::write_meta() del backend). El
 * banner amarillo del selector indica cuál de los dos está activo.
 */
import { useMemo, useSyncExternalStore } from 'react';

// =====================================================================
// SHAPE del meta JSON publicado por estudios-a-la-medida
// =====================================================================

export type EquityMeta = {
  schema_version: string;
  generated_at: string;
  note?: string;
  default_proposal: Record<string, number>;
  tickers: EquityTickerMeta[];
};

export type EquityTickerMeta = {
  ticker: string;
  name: string;
  category: string;
  description: string;
  is_default: boolean;
  default_weight?: number;
  in_proposal?: boolean;
  in_motor_base?: boolean;
  proxy: { ticker: string; name: string; covers: string; rationale: string } | null;
  caveats: string[];
  history_effective_start?: string;
  history_effective_end?: string;
  n_months?: number;
};

export const META_URL =
  'https://andresborrerom.github.io/estudios-a-la-medida/data/equity_universe_meta.json';

// =====================================================================
// FALLBACK inline — sincronizado con
// estudios-a-la-medida/code/refresh_equity_custom.py::write_meta()
// =====================================================================

export const INLINE_FALLBACK: EquityMeta = {
  schema_version: '1.0',
  generated_at: 'inline-fallback',
  note: 'Catálogo inline del planner v2 (fallback). Si ves este banner es porque el fetch al meta JSON publicado en estudios-a-la-medida falló — la versión inline puede estar desactualizada respecto a la generada en CI.',
  default_proposal: { USMV: 0.5, SCHD: 0.5 },
  tickers: [
    {
      ticker: 'USMV', name: 'iShares MSCI USA Min Vol Factor ETF', category: 'EqLowVol',
      description: 'MSCI USA Min Vol — baja volatilidad',
      is_default: true, default_weight: 0.5, in_proposal: true,
      proxy: null, caveats: [],
    },
    {
      ticker: 'SCHD', name: 'Schwab US Dividend Equity ETF', category: 'EqDiv',
      description: 'Schwab US Dividend Equity — dividendos de calidad',
      is_default: true, default_weight: 0.5, in_proposal: true,
      proxy: null, caveats: [],
    },
    {
      ticker: 'SPLV', name: 'Invesco S&P 500 Low Volatility ETF', category: 'EqLowVol',
      description: 'S&P 500 Low Volatility — baja vol alternativa',
      is_default: false, in_proposal: false, proxy: null, caveats: [],
    },
    {
      ticker: 'NOBL', name: 'ProShares S&P 500 Dividend Aristocrats ETF', category: 'EqDiv',
      description: 'Dividend Aristocrats — historial 25y+ subiendo dividendos',
      is_default: false, in_proposal: false, proxy: null, caveats: [],
    },
    {
      ticker: 'SPHQ', name: 'Invesco S&P 500 Quality ETF', category: 'EqQuality',
      description: 'S&P 500 Quality — alta ROE, baja deuda',
      is_default: false, in_proposal: false, proxy: null, caveats: [],
    },
    {
      ticker: 'SPYD', name: 'SPDR Portfolio S&P 500 High Dividend ETF', category: 'EqHiDiv',
      description: 'S&P 500 alto dividendo (top 80 por yield)',
      is_default: false, in_proposal: false, proxy: null, caveats: [],
    },
    {
      ticker: 'OEF', name: 'iShares S&P 100 ETF', category: 'EqMegaCap',
      description: 'S&P 100 — 100 mayores empresas US (mega-cap)',
      is_default: false, in_proposal: false, proxy: null, caveats: [],
    },
    {
      ticker: 'QQQ', name: 'Invesco QQQ Trust', category: 'EqGrowth',
      description: 'NASDAQ-100 — tech & growth mega-cap',
      is_default: false, in_proposal: false, proxy: null,
      caveats: ['Concentración sectorial alta (~50% tech).'],
    },
    {
      ticker: 'IJR', name: 'iShares Core S&P Small-Cap ETF', category: 'EqSmallCap',
      description: 'S&P SmallCap 600 — empresas pequeñas US',
      is_default: false, in_proposal: false, proxy: null,
      caveats: ['Vol más alta que large caps.'], in_motor_base: true,
    },
    {
      ticker: 'RSP', name: 'Invesco S&P 500 Equal Weight ETF', category: 'EqEqualW',
      description: 'S&P 500 ponderado igual (vs cap-weighted estándar)',
      is_default: false, in_proposal: false, proxy: null, caveats: [],
    },
    {
      ticker: 'SPMO', name: 'Invesco S&P 500 Momentum ETF', category: 'EqMomentum',
      description: 'S&P 500 factor momentum',
      is_default: false, in_proposal: false,
      proxy: {
        ticker: 'PDP', name: 'Invesco DWA Momentum ETF',
        covers: '2007-04 a 2015-10 (exclusive)',
        rationale: 'Mismo factor (momentum US large cap), metodología distinta (DWA relative-strength Point & Figure vs S&P Momentum Index). Pre-2007-03 no hay proxy razonable en universo ETF.',
      },
      caveats: [
        'Retorno realizado fuertemente influenciado por el régimen pro-momentum 2015-2026; forward-looking probablemente menor.',
        'Pre-2015-10 proxied con PDP (Invesco DWA Momentum ETF).',
      ],
    },
    {
      ticker: 'SPY', name: 'SPDR S&P 500 ETF Trust', category: 'EqLargeBlend',
      description: 'S&P 500 estándar — mercado US amplio',
      is_default: false, in_proposal: false, proxy: null, caveats: [], in_motor_base: true,
    },
    {
      ticker: 'ACWI', name: 'iShares MSCI ACWI ETF', category: 'EqGlobal',
      description: 'MSCI ACWI — global desarrollado + emergente',
      is_default: false, in_proposal: false, proxy: null, caveats: [], in_motor_base: true,
    },
    {
      ticker: 'CAPE', name: 'Barclays ETN+ Shiller CAPE', category: 'EqShillerRot',
      description: 'ETN Shiller CAPE — rotación sectorial value',
      is_default: false, in_proposal: false,
      proxy: {
        ticker: 'RPV', name: 'Invesco S&P 500 Pure Value ETF',
        covers: '2006-04 a 2022-04 (exclusive)',
        rationale: 'El ETN CAPE original (2012) fue suspendido; yfinance solo expone el relisting de 2022. RPV mantiene el sesgo value pero pierde la rotación sectorial específica del índice Shiller CAPE.',
      },
      caveats: [
        'ETN (no ETF) — deuda senior Barclays, riesgo de contraparte, tratamiento fiscal distinto al de un ETF; consultar con asesor fiscal antes de inversión sustancial.',
        'Pre-2022-04 proxied con RPV (Invesco S&P 500 Pure Value ETF).',
      ],
    },
  ],
};

// =====================================================================
// Cache singleton — un solo fetch por sesión de browser
// =====================================================================

export type LoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; meta: EquityMeta }
  | { kind: 'fallback'; meta: EquityMeta; reason: string };

let cachedState: LoadState = { kind: 'idle' };
const subscribers = new Set<() => void>();

function notify(s: LoadState) {
  cachedState = s;
  subscribers.forEach((fn) => fn());
}

async function loadMeta(): Promise<void> {
  if (cachedState.kind === 'ok' || cachedState.kind === 'loading') return;
  notify({ kind: 'loading' });
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(META_URL, { signal: ctrl.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as EquityMeta;
    if (!Array.isArray(json.tickers) || json.tickers.length === 0) {
      throw new Error('respuesta sin tickers[]');
    }
    notify({ kind: 'ok', meta: json });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    notify({ kind: 'fallback', meta: INLINE_FALLBACK, reason });
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  if (cachedState.kind === 'idle') void loadMeta();
  return () => {
    subscribers.delete(cb);
  };
}

export function useEquityMeta(): LoadState {
  return useSyncExternalStore(
    subscribe,
    () => cachedState,
    () => cachedState,
  );
}

/**
 * Lookup por ticker. Devuelve null si el meta todavía no terminó de cargar.
 */
export function useEquityCatalogByTicker(): Record<string, EquityTickerMeta> | null {
  const state = useEquityMeta();
  return useMemo(() => {
    if (state.kind !== 'ok' && state.kind !== 'fallback') return null;
    const out: Record<string, EquityTickerMeta> = {};
    for (const t of state.meta.tickers) out[t.ticker] = t;
    return out;
  }, [state]);
}

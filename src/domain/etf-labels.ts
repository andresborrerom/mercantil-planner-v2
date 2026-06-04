/**
 * Labels cortos descriptivos en español para los 37 ETFs del dataset.
 *
 * Consumido por la UI de views (dropdowns y chips) cuando el asesor/cliente
 * condiciona sobre un ETF individual. El formato es:
 *   - `short`: nombre corto legible (preferentemente ≤ 28 chars)
 *   - `group`: categoría para agrupar en el dropdown
 *
 * **Criterio de naming:**
 *   - Español Panamá (el asesor habla con clientes panameños).
 *   - "Tesoros" en vez de "Treasuries" (más universal).
 *   - Duraciones en años cuando aplica ("Tesoros 7-10y").
 *   - Índices/tipos breves ("S&P 500", "Growth US", "Value US").
 *   - Sin ticker entre paréntesis en el label principal — el dropdown muestra
 *     short; el ticker se puede mostrar como metadata secundaria.
 *
 * v2 H1 (2026-05-12): agregados USMV, SPLV, SCHD, NOBL (low-vol / dividendo)
 * y SHY (cash short Treasury).
 */

import { TICKERS, type Ticker } from '../data/market.generated';

export type EtfGroup =
  | 'treasuries'
  | 'fixedIncome'
  | 'equityBroad'
  | 'equityStyle'
  | 'equityLowVolDiv'
  | 'equitySector';

export type EtfLabel = {
  short: string;
  group: EtfGroup;
};

export const GROUP_LABELS: Record<EtfGroup, string> = {
  treasuries: 'Tesoros US',
  fixedIncome: 'Renta fija global',
  equityBroad: 'Acciones amplias',
  equityStyle: 'Estilos (EEUU)',
  equityLowVolDiv: 'Baja vol / Dividendo (EEUU)',
  equitySector: 'Sectores globales',
};

/**
 * Orden canónico de presentación de los grupos en el dropdown.
 */
export const GROUP_ORDER: readonly EtfGroup[] = [
  'treasuries',
  'fixedIncome',
  'equityBroad',
  'equityStyle',
  'equityLowVolDiv',
  'equitySector',
] as const;

/**
 * Diccionario ticker → label. Hardcodeado para los 32 tickers del dataset.
 * Ver §8 del spec (INSTRUCCIONES-PLANNER.md) para el mapeo original.
 */
export const ETF_LABELS: Readonly<Record<Ticker, EtfLabel>> = {
  // Tesoros US por duración
  BIL: { short: 'Tesoros 1-3m', group: 'treasuries' },
  SPTS: { short: 'Tesoros 1-3y', group: 'treasuries' },
  SHY: { short: 'Tesoros 1-3y (SHY)', group: 'treasuries' },
  IEI: { short: 'Tesoros 3-7y', group: 'treasuries' },
  IEF: { short: 'Tesoros 7-10y', group: 'treasuries' },
  SPTL: { short: 'Tesoros 20+y', group: 'treasuries' },

  // Renta fija global
  IGOV: { short: 'Soberanos desarr. ex-US', group: 'fixedIncome' },
  AGG: { short: 'RF agregada US', group: 'fixedIncome' },
  LQD: { short: 'Corporativa IG', group: 'fixedIncome' },
  GHYG: { short: 'High yield global', group: 'fixedIncome' },
  EMB: { short: 'Emergente soberana', group: 'fixedIncome' },
  CEMB: { short: 'Emergente corporativa', group: 'fixedIncome' },

  // Acciones amplias
  SPY: { short: 'S&P 500', group: 'equityBroad' },
  ACWI: { short: 'Acciones globales', group: 'equityBroad' },
  ACWX: { short: 'Globales ex-US', group: 'equityBroad' },
  EZU: { short: 'Eurozona', group: 'equityBroad' },
  EWJ: { short: 'Japón', group: 'equityBroad' },
  URTH: { short: 'Desarrolladas', group: 'equityBroad' },
  EEM: { short: 'Emergentes', group: 'equityBroad' },
  IJR: { short: 'Small caps US', group: 'equityBroad' },

  // Estilos US
  IWD: { short: 'Value US', group: 'equityStyle' },
  IWF: { short: 'Growth US', group: 'equityStyle' },

  // Estilos / factores adicionales US — v2 H6 (equity custom del comité)
  SPHQ: { short: 'Quality S&P 500', group: 'equityStyle' },
  RSP: { short: 'S&P 500 equal weight', group: 'equityStyle' },
  SPMO: { short: 'Momentum S&P 500', group: 'equityStyle' },
  CAPE: { short: 'Shiller CAPE rotation', group: 'equityStyle' },
  OEF: { short: 'S&P 100 mega cap', group: 'equityBroad' },
  QQQ: { short: 'NASDAQ-100', group: 'equityBroad' },

  // Baja volatilidad / Dividendo (EEUU) — v2 H1
  USMV: { short: 'Baja vol MSCI US', group: 'equityLowVolDiv' },
  SPLV: { short: 'Baja vol S&P 500', group: 'equityLowVolDiv' },
  SCHD: { short: 'Dividendo Schwab', group: 'equityLowVolDiv' },
  NOBL: { short: 'Aristócratas dividendo', group: 'equityLowVolDiv' },
  SPYD: { short: 'S&P 500 high dividend', group: 'equityLowVolDiv' },

  // Sectores globales
  IXN: { short: 'Tecnología', group: 'equitySector' },
  IXG: { short: 'Financieras', group: 'equitySector' },
  RXI: { short: 'Consumo discrecional', group: 'equitySector' },
  EXI: { short: 'Industrial', group: 'equitySector' },
  IXJ: { short: 'Salud', group: 'equitySector' },
  IXP: { short: 'Comunicaciones', group: 'equitySector' },
  KXI: { short: 'Consumo básico', group: 'equitySector' },
  MXI: { short: 'Materiales', group: 'equitySector' },
  IXC: { short: 'Energía', group: 'equitySector' },
  RWO: { short: 'Real estate global', group: 'equitySector' },
  JXI: { short: 'Utilities', group: 'equitySector' },
  INFL: { short: 'Anti-inflación equity', group: 'equitySector' },
};

/** Lookup del label (lanza error si el ticker no existe). */
export function getEtfLabel(ticker: Ticker): EtfLabel {
  const label = ETF_LABELS[ticker];
  if (!label) throw new Error(`getEtfLabel: ticker desconocido ${ticker}`);
  return label;
}

/**
 * Formato "short (TICKER)" para dropdowns donde el asesor puede querer ver el
 * ticker como referencia operativa. El short es la etiqueta primaria.
 */
export function formatEtfLabel(ticker: Ticker): string {
  return `${getEtfLabel(ticker).short} (${ticker})`;
}

/**
 * Retorna los tickers agrupados en el orden canónico de `GROUP_ORDER`. Útil
 * para construir dropdowns con <optgroup>.
 */
export function tickersByGroup(): Readonly<Record<EtfGroup, readonly Ticker[]>> {
  const result: Record<EtfGroup, Ticker[]> = {
    treasuries: [],
    fixedIncome: [],
    equityBroad: [],
    equityStyle: [],
    equityLowVolDiv: [],
    equitySector: [],
  };
  for (const ticker of TICKERS) {
    const label = ETF_LABELS[ticker];
    if (label) result[label.group].push(ticker);
  }
  // Freeze internamente para prevenir mutación accidental en consumers.
  return result;
}

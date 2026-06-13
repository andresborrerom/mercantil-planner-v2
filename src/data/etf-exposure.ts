/**
 * ETF exposure dictionary — geografía, sectores, calidad crediticia.
 *
 * AUTO-GENERADO por scripts/fetch-etf-exposure.mjs desde EODHD fundamentals.
 * NO editar a mano — re-correr el script y commitear el output.
 *
 * Snapshot: 2026-06-10
 * Fuente:   EODHD ETF fundamentals API (World_Regions, Sector_Weights, Fixed_Income)
 *
 * Cobertura: 33 ETFs del case study TBSC + opcionales.
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

export const ETF_EXPOSURE_SNAPSHOT_DATE = '2026-06-10';

export const ETF_EXPOSURE: Record<string, ETFExposure> = {
  "IBDR": {
    "ticker": "IBDR",
    "name": "iShares iBonds Dec 2026 Term Corporate ETF",
    "creditQuality": "IG",
    "note": "iBonds Dec 2026 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 0.29,
      "yieldToMaturity": 4.19
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IBDS": {
    "ticker": "IBDS",
    "name": "iShares iBonds Dec 2027 Term Corporate ETF",
    "creditQuality": "IG",
    "note": "iBonds Dec 2027 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 1.03,
      "yieldToMaturity": 4.26
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IBDT": {
    "ticker": "IBDT",
    "name": "iShares iBonds Dec 2028 Term Corporate ETF",
    "creditQuality": "IG",
    "note": "iBonds Dec 2028 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 1.91,
      "yieldToMaturity": 4.42
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IBDU": {
    "ticker": "IBDU",
    "name": "iShares Trust - iShares iBonds Dec 2029 Term Corporate ETF",
    "creditQuality": "IG",
    "note": "iBonds Dec 2029 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 2.76,
      "yieldToMaturity": 4.55
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IBDV": {
    "ticker": "IBDV",
    "name": "iShares Trust - iShares iBonds Dec 2030 Term Corporate ETF",
    "creditQuality": "IG",
    "note": "iBonds Dec 2030 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 3.63,
      "yieldToMaturity": 4.64
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IBDW": {
    "ticker": "IBDW",
    "name": "iShares Trust - iShares iBonds Dec 2031 Term Corporate ETF",
    "creditQuality": "IG",
    "note": "iBonds Dec 2031 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 4.48,
      "yieldToMaturity": 4.8
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IBDX": {
    "ticker": "IBDX",
    "name": "iShares Trust - iShares iBonds Dec 2032 Term Corporate ETF",
    "creditQuality": "IG",
    "note": "iBonds Dec 2032 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 5.4,
      "yieldToMaturity": 4.15
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IBDY": {
    "ticker": "IBDY",
    "name": "iShares iBonds Dec 2033 Term Corporate ETF",
    "creditQuality": "IG",
    "note": "iBonds Dec 2033 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 5.78,
      "yieldToMaturity": 4.99
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IBDZ": {
    "ticker": "IBDZ",
    "name": "iShares Trust",
    "creditQuality": "IG",
    "note": "iBonds Dec 2034 Term Corp (proxy de UCITS)",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 6.35,
      "yieldToMaturity": 5.14
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "GHYG": {
    "ticker": "GHYG",
    "name": "iShares US & Intl High Yield Corp Bond ETF",
    "creditQuality": "HY",
    "note": "iShares Global HY Corp UCITS (proxy US)",
    "geo": {
      "US": 60,
      "DM-ex-US": 35,
      "EM": 5
    },
    "sectors": {
      "Communication Services": 16,
      "Consumer Cyclicals": 14,
      "Industrials": 12,
      "Energy": 12,
      "Healthcare": 10,
      "Consumer Defensive": 8,
      "Financial Services": 7,
      "Technology": 6,
      "Utilities": 6,
      "Basic Materials": 5,
      "Real Estate": 4
    },
    "fixedIncome": {
      "effectiveDuration": 2.85,
      "yieldToMaturity": 6.58
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "HYG": {
    "ticker": "HYG",
    "name": "iShares iBoxx $ High Yield Corporate Bond ETF",
    "creditQuality": "HY",
    "note": "iShares iBoxx HY Corp",
    "geo": {
      "US": 95,
      "DM-ex-US": 5,
      "EM": 0
    },
    "sectors": {
      "Communication Services": 16,
      "Consumer Cyclicals": 14,
      "Industrials": 12,
      "Energy": 12,
      "Healthcare": 10,
      "Consumer Defensive": 8,
      "Financial Services": 7,
      "Technology": 6,
      "Utilities": 6,
      "Basic Materials": 5,
      "Real Estate": 4
    },
    "fixedIncome": {
      "effectiveDuration": 2.97,
      "yieldToMaturity": 6.88
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "USMV": {
    "ticker": "USMV",
    "name": "iShares MSCI USA Min Vol Factor ETF",
    "creditQuality": "N/A",
    "note": "iShares MSCI USA Min Vol",
    "geo": {
      "US": 97.68,
      "DM-ex-US": 1.4,
      "EM": 0.91
    },
    "sectors": {
      "Basic Materials": 2.37,
      "Consumer Cyclicals": 5.69,
      "Financial Services": 11.35,
      "Real Estate": 2.39,
      "Communication Services": 6.02,
      "Energy": 2.83,
      "Industrials": 6.06,
      "Technology": 34.75,
      "Consumer Defensive": 9.25,
      "Healthcare": 12.44,
      "Utilities": 6.85
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "SCHD": {
    "ticker": "SCHD",
    "name": "Schwab U.S. Dividend Equity ETF",
    "creditQuality": "N/A",
    "note": "Schwab US Dividend",
    "geo": {
      "US": 99.72,
      "DM-ex-US": 0.23,
      "EM": 0.05
    },
    "sectors": {
      "Consumer Cyclicals": 6.37,
      "Financial Services": 9.17,
      "Communication Services": 5.66,
      "Energy": 15.24,
      "Industrials": 7.47,
      "Technology": 19.09,
      "Consumer Defensive": 18.15,
      "Healthcare": 18.82,
      "Utilities": 0.03
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "SPY": {
    "ticker": "SPY",
    "name": "SPDR S&P 500 ETF Trust",
    "creditQuality": "N/A",
    "note": "SPDR S&P 500",
    "geo": {
      "US": 99.6,
      "DM-ex-US": 0.3,
      "EM": 0.1
    },
    "sectors": {
      "Basic Materials": 1.69,
      "Consumer Cyclicals": 9.5,
      "Financial Services": 11.2,
      "Real Estate": 1.82,
      "Communication Services": 10.38,
      "Energy": 3.27,
      "Industrials": 7.94,
      "Technology": 39.2,
      "Consumer Defensive": 4.47,
      "Healthcare": 8.43,
      "Utilities": 2.09
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "ACWI": {
    "ticker": "ACWI",
    "name": "iShares MSCI ACWI ETF",
    "creditQuality": "N/A",
    "note": "iShares MSCI ACWI",
    "geo": {
      "US": 66.61,
      "DM-ex-US": 26.9,
      "EM": 6.49
    },
    "sectors": {
      "Basic Materials": 3.62,
      "Consumer Cyclicals": 8.85,
      "Financial Services": 15.24,
      "Real Estate": 1.59,
      "Communication Services": 8.3,
      "Energy": 3.84,
      "Industrials": 10.26,
      "Technology": 33.88,
      "Consumer Defensive": 4.48,
      "Healthcare": 7.59,
      "Utilities": 2.35
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "SPLV": {
    "ticker": "SPLV",
    "name": "Invesco S&P 500® Low Volatility ETF",
    "creditQuality": "N/A",
    "note": "Invesco S&P 500 Low Vol",
    "geo": {
      "US": 98.93,
      "DM-ex-US": 1.07,
      "EM": 0
    },
    "sectors": {
      "Basic Materials": 2.13,
      "Consumer Cyclicals": 3.98,
      "Financial Services": 21.07,
      "Real Estate": 17.84,
      "Communication Services": 0.79,
      "Energy": 2.72,
      "Industrials": 11.35,
      "Technology": 1.86,
      "Consumer Defensive": 9.33,
      "Healthcare": 4.03,
      "Utilities": 24.9
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "NOBL": {
    "ticker": "NOBL",
    "name": "ProShares S&P 500 Dividend Aristocrats ETF",
    "creditQuality": "N/A",
    "note": "ProShares Dividend Aristocrats",
    "geo": {
      "US": 97.27,
      "DM-ex-US": 2.73,
      "EM": 0
    },
    "sectors": {
      "Basic Materials": 10.09,
      "Consumer Cyclicals": 5.1,
      "Financial Services": 12.92,
      "Real Estate": 4.58,
      "Energy": 2.97,
      "Industrials": 20.49,
      "Technology": 4.71,
      "Consumer Defensive": 23.03,
      "Healthcare": 10.46,
      "Utilities": 5.64
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "SPHQ": {
    "ticker": "SPHQ",
    "name": "Invesco S&P 500® Quality ETF",
    "creditQuality": "N/A",
    "note": "Invesco S&P 500 Quality",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Basic Materials": 2.04,
      "Consumer Cyclicals": 4.33,
      "Financial Services": 12.03,
      "Communication Services": 2.25,
      "Energy": 0.66,
      "Industrials": 23.03,
      "Technology": 32.96,
      "Consumer Defensive": 14.04,
      "Healthcare": 7.87,
      "Utilities": 0.78
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "SPYD": {
    "ticker": "SPYD",
    "name": "SPDR® Portfolio S&P 500 High Dividend ETF",
    "creditQuality": "N/A",
    "note": "SPDR S&P 500 High Dividend",
    "geo": {
      "US": 97.75,
      "DM-ex-US": 2.25,
      "EM": 0
    },
    "sectors": {
      "Basic Materials": 2.97,
      "Consumer Cyclicals": 6.92,
      "Financial Services": 12.08,
      "Real Estate": 26.9,
      "Communication Services": 4.61,
      "Energy": 8.85,
      "Industrials": 2.33,
      "Technology": 3.22,
      "Consumer Defensive": 15.72,
      "Healthcare": 5.24,
      "Utilities": 11.17
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "OEF": {
    "ticker": "OEF",
    "name": "iShares S&P 100 ETF",
    "creditQuality": "N/A",
    "note": "iShares S&P 100",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Basic Materials": 0.5,
      "Consumer Cyclicals": 9.77,
      "Financial Services": 9.96,
      "Real Estate": 0.32,
      "Communication Services": 13.03,
      "Energy": 2.41,
      "Industrials": 4.99,
      "Technology": 45.35,
      "Consumer Defensive": 4.87,
      "Healthcare": 8.03,
      "Utilities": 0.78
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "QQQ": {
    "ticker": "QQQ",
    "name": "Invesco QQQ Trust",
    "creditQuality": "N/A",
    "note": "Invesco QQQ Trust",
    "geo": {
      "US": 98.31,
      "DM-ex-US": 1.07,
      "EM": 0.61
    },
    "sectors": {
      "Basic Materials": 1.03,
      "Consumer Cyclicals": 10.97,
      "Financial Services": 0.17,
      "Communication Services": 13.84,
      "Energy": 0.54,
      "Industrials": 2.62,
      "Technology": 59.53,
      "Consumer Defensive": 6.48,
      "Healthcare": 3.68,
      "Utilities": 1.14
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "IJR": {
    "ticker": "IJR",
    "name": "iShares Core S&P Small-Cap ETF",
    "creditQuality": "N/A",
    "note": "iShares Core S&P Small-Cap",
    "geo": {
      "US": 99.36,
      "DM-ex-US": 0.22,
      "EM": 0.41
    },
    "sectors": {
      "Basic Materials": 5,
      "Consumer Cyclicals": 12.97,
      "Financial Services": 16.05,
      "Real Estate": 7.43,
      "Communication Services": 3.49,
      "Energy": 5.58,
      "Industrials": 15.09,
      "Technology": 17.97,
      "Consumer Defensive": 3.64,
      "Healthcare": 10.91,
      "Utilities": 1.86
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "RSP": {
    "ticker": "RSP",
    "name": "Invesco S&P 500® Equal Weight ETF",
    "creditQuality": "N/A",
    "note": "Invesco S&P 500 Equal Weight",
    "geo": {
      "US": 99.07,
      "DM-ex-US": 0.73,
      "EM": 0.2
    },
    "sectors": {
      "Basic Materials": 3.91,
      "Consumer Cyclicals": 9.83,
      "Financial Services": 13.9,
      "Real Estate": 6.15,
      "Communication Services": 3.77,
      "Energy": 4.08,
      "Industrials": 14.37,
      "Technology": 21.06,
      "Consumer Defensive": 6.18,
      "Healthcare": 11.17,
      "Utilities": 5.56
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "SPMO": {
    "ticker": "SPMO",
    "name": "Invesco S&P 500® Momentum ETF",
    "creditQuality": "N/A",
    "note": "Invesco S&P 500 Momentum",
    "geo": {
      "US": 99.69,
      "DM-ex-US": 0,
      "EM": 0.31
    },
    "sectors": {
      "Basic Materials": 1.59,
      "Consumer Cyclicals": 1.23,
      "Financial Services": 5.78,
      "Real Estate": 0.9,
      "Communication Services": 8.46,
      "Energy": 3.18,
      "Industrials": 12.35,
      "Technology": 55.24,
      "Consumer Defensive": 3.93,
      "Healthcare": 6.16,
      "Utilities": 1.18
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "CAPE": {
    "ticker": "CAPE",
    "name": "Barclays ETN+ Shiller Capet ETN",
    "creditQuality": "N/A",
    "note": "Barclays ETN+ Shiller CAPE",
    "geo": null,
    "sectors": null,
    "fixedIncome": null,
    "sourceGeo": "N/A",
    "sourceSectors": "N/A"
  },
  "BIL": {
    "ticker": "BIL",
    "name": "SPDR® Bloomberg 1-3 Month T-Bill ETF",
    "creditQuality": "Treasury",
    "note": "SPDR Bloomberg 1-3M T-Bill",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Government Treasury": 100
    },
    "fixedIncome": {
      "effectiveDuration": 0.16,
      "yieldToMaturity": 3.67
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "SHY": {
    "ticker": "SHY",
    "name": "iShares 1-3 Year Treasury Bond ETF",
    "creditQuality": "Treasury",
    "note": "iShares 1-3Y Treasury",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Government Treasury": 100
    },
    "fixedIncome": {
      "effectiveDuration": 1.87,
      "yieldToMaturity": 3.88
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "INFL": {
    "ticker": "INFL",
    "name": "Horizon Kinetics Inflation Beneficiaries ETF",
    "creditQuality": "N/A",
    "note": "Horizon Kinetics Inflation Beneficiaries",
    "geo": {
      "US": 85.96,
      "DM-ex-US": 14.04,
      "EM": 0
    },
    "sectors": {
      "Basic Materials": 21.8,
      "Financial Services": 25.11,
      "Real Estate": 1.26,
      "Communication Services": 0.3,
      "Energy": 41.95,
      "Industrials": 1.88,
      "Consumer Defensive": 3.45,
      "Healthcare": 1.24,
      "Utilities": 3.01
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "RWO": {
    "ticker": "RWO",
    "name": "SPDR® Dow Jones Global Real Estate ETF",
    "creditQuality": "N/A",
    "note": "SPDR Dow Jones Global Real Estate",
    "geo": {
      "US": 74.36,
      "DM-ex-US": 23.04,
      "EM": 2.6
    },
    "sectors": {
      "Real Estate": 100
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "IEI": {
    "ticker": "IEI",
    "name": "iShares 3-7 Year Treasury Bond ETF",
    "creditQuality": "Treasury",
    "note": "iShares 3-7Y Treasury",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Government Treasury": 100
    },
    "fixedIncome": {
      "effectiveDuration": 4.27,
      "yieldToMaturity": 4.03
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "IXC": {
    "ticker": "IXC",
    "name": "iShares Global Energy ETF",
    "creditQuality": "N/A",
    "note": "iShares Global Energy",
    "geo": {
      "US": 74.15,
      "DM-ex-US": 23,
      "EM": 2.85
    },
    "sectors": {
      "Energy": 100
    },
    "fixedIncome": null,
    "sourceGeo": "EODHD",
    "sourceSectors": "EODHD"
  },
  "AGG": {
    "ticker": "AGG",
    "name": "iShares Core U.S. Aggregate Bond ETF",
    "creditQuality": "IG",
    "note": "iShares Core US Aggregate Bond",
    "geo": {
      "US": 100,
      "DM-ex-US": 0,
      "EM": 0
    },
    "sectors": {
      "Government Treasury": 42,
      "Agency MBS": 25,
      "Financial Services": 7,
      "Industrials": 5,
      "Consumer Defensive": 3,
      "Utilities": 3,
      "Technology": 3,
      "Consumer Cyclicals": 3,
      "Communication Services": 3,
      "Healthcare": 3,
      "Energy": 2,
      "Real Estate": 1
    },
    "fixedIncome": {
      "effectiveDuration": 5.74,
      "yieldToMaturity": 4.65
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  },
  "LQD": {
    "ticker": "LQD",
    "name": "iShares iBoxx $ Investment Grade Corporate Bond ETF",
    "creditQuality": "IG",
    "note": "iShares iBoxx IG Corp",
    "geo": {
      "US": 88,
      "DM-ex-US": 12,
      "EM": 0
    },
    "sectors": {
      "Financial Services": 28,
      "Industrials": 12,
      "Technology": 12,
      "Healthcare": 11,
      "Consumer Cyclicals": 8,
      "Communication Services": 7,
      "Consumer Defensive": 7,
      "Energy": 7,
      "Utilities": 6,
      "Real Estate": 2
    },
    "fixedIncome": {
      "effectiveDuration": 7.95,
      "yieldToMaturity": 5.29
    },
    "sourceGeo": "manual (fact sheet)",
    "sourceSectors": "manual (iBoxx index)"
  }
};

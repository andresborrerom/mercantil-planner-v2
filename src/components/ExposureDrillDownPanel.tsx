/**
 * ExposureDrillDownPanel — vista de exposición del portafolio.
 *
 * Issue #28. Complemento estructural al fan chart: responde "¿a qué está
 * expuesto el fondo HOY?" mientras el chart responde "¿cómo le va a ir?".
 *
 * Tres dimensiones (tabs):
 *   - Geografía (US / DM-ex-US / EM)
 *   - Sectores (GICS-like ~11 buckets + Treasury/MBS para bonds)
 *   - Calidad crediticia (IG / HY / Treasury / Equity)
 *
 * Tres niveles de agregación (renderizados los 3 simultáneamente):
 *   - Portafolio: barra única con el split total
 *   - Por sleeve: 1 barra por sleeve (Bullets / Equity / Cash / RealAssets)
 *   - Por ETF: tabla con cada ETF (collapsible)
 *
 * Data viene de src/data/etf-exposure.ts (auto-generado desde EODHD +
 * overrides manuales iBoxx para bonds). Si un ETF no tiene geo/sectors
 * (ej. CAPE ETN), su peso aparece como "Sin clasificar" para mantener
 * el bar al 100%.
 */

import { useMemo, useState } from 'react';
import type { CaseStudyConfig } from '../state/caseStudyStore';
import {
  ETF_EXPOSURE,
  ETF_EXPOSURE_SNAPSHOT_DATE,
} from '../data/etf-exposure';

type Dimension = 'geo' | 'sectors' | 'credit';
type SleeveName = 'Bullets' | 'Equity' | 'Cash' | 'RealAssets';

const SLEEVE_LABELS: Record<SleeveName, string> = {
  Bullets: 'Bullets',
  Equity: 'Equity',
  Cash: 'Cash',
  RealAssets: 'Activos Reales',
};

const SLEEVE_COLORS: Record<SleeveName, string> = {
  Bullets:    '#003566', // navy
  Equity:     '#E97031', // orange
  Cash:       '#6B7280', // slate gray
  RealAssets: '#C9A84C', // gold
};

/**
 * Posición agregada por ticker (no por vintage individual). Para `iBonds`
 * (IG ladder de 9 vintages), usamos IBDS como representativo — todas las
 * vintages tienen el mismo perfil de exposure (iBoxx Liquid IG index).
 */
type Position = {
  /** Ticker del ETF_EXPOSURE para lookup. */
  exposureTicker: string;
  /** Label client-facing (puede agrupar vintages — "iBonds IG ladder"). */
  label: string;
  /** Peso del AUM total (0..1). */
  weight: number;
  sleeve: SleeveName;
};

/**
 * Expande el config en posiciones por ETF agregadas. Cada posición tiene
 * un peso AUM (0..1) que es: (sleeve allocation) × (ticker weight within sleeve).
 *
 * Convenciones:
 *  - Bullets · iBonds → representado por IBDS (proxy del ladder IG completo,
 *    todas las vintages comparten exposure profile)
 *  - Bullets · iBonds-HY → representado por HYG (proxy del underlying iBoxx HY)
 *  - Bullets · GHYG → directo
 *  - Cash → BIL (cashTicker fijo en el store)
 */
function expandConfigToPositions(config: CaseStudyConfig): Position[] {
  const positions: Position[] = [];

  // Bullets sleeve — distribuir bulletTotalPct según bulletMix normalizado
  const bulletTotal = config.bulletMix.reduce((s, m) => s + m.weight, 0);
  if (bulletTotal > 0 && config.bulletTotalPct > 0) {
    for (const m of config.bulletMix) {
      if (m.weight <= 0) continue;
      const wAum = (m.weight / bulletTotal) * config.bulletTotalPct;
      if (m.ticker === 'iBonds') {
        positions.push({
          exposureTicker: 'IBDS',
          label: 'iBonds IG ladder (9 vintages)',
          weight: wAum,
          sleeve: 'Bullets',
        });
      } else if (m.ticker === 'iBonds-HY') {
        positions.push({
          exposureTicker: 'HYG',
          label: 'iBonds HY ladder (IU28+IU29)',
          weight: wAum,
          sleeve: 'Bullets',
        });
      } else if (m.ticker === 'GHYG') {
        positions.push({
          exposureTicker: 'GHYG',
          label: 'GHYG (HY corp perpetual)',
          weight: wAum,
          sleeve: 'Bullets',
        });
      }
    }
  }

  // Equity sleeve
  const equityTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);
  if (equityTotal > 0 && config.equityPct > 0) {
    for (const m of config.equityMix) {
      if (m.weight <= 0) continue;
      const wAum = (m.weight / equityTotal) * config.equityPct;
      positions.push({
        exposureTicker: m.ticker,
        label: m.ticker,
        weight: wAum,
        sleeve: 'Equity',
      });
    }
  }

  // Cash sleeve — BIL hardcoded en arena.worker.ts
  if (config.cashPct > 0) {
    positions.push({
      exposureTicker: 'BIL',
      label: 'BIL (T-Bills 1-3M)',
      weight: config.cashPct,
      sleeve: 'Cash',
    });
  }

  // Real assets sleeve
  if (config.realAssetsPct > 0) {
    const realTotal = config.realAssetsMix.reduce((s, m) => s + m.weight, 0);
    if (realTotal > 0) {
      for (const m of config.realAssetsMix) {
        if (m.weight <= 0) continue;
        const wAum = (m.weight / realTotal) * config.realAssetsPct;
        positions.push({
          exposureTicker: m.ticker,
          label: m.ticker,
          weight: wAum,
          sleeve: 'RealAssets',
        });
      }
    }
  }

  return positions;
}

/** Suma pesos por bucket de geo, devolviendo fracciones del AUM (0..1). */
function aggregateGeo(positions: Position[]): { buckets: Record<string, number>; unclassified: number } {
  const out: Record<string, number> = { US: 0, 'DM-ex-US': 0, EM: 0 };
  let unclassified = 0;
  for (const pos of positions) {
    const etf = ETF_EXPOSURE[pos.exposureTicker];
    if (!etf?.geo) { unclassified += pos.weight; continue; }
    for (const [bucket, pct] of Object.entries(etf.geo)) {
      out[bucket] = (out[bucket] || 0) + (pos.weight * pct) / 100;
    }
  }
  return { buckets: out, unclassified };
}

function aggregateSectors(positions: Position[]): { buckets: Record<string, number>; unclassified: number } {
  const out: Record<string, number> = {};
  let unclassified = 0;
  for (const pos of positions) {
    const etf = ETF_EXPOSURE[pos.exposureTicker];
    if (!etf?.sectors) { unclassified += pos.weight; continue; }
    for (const [sector, pct] of Object.entries(etf.sectors)) {
      out[sector] = (out[sector] || 0) + (pos.weight * pct) / 100;
    }
  }
  return { buckets: out, unclassified };
}

function aggregateCredit(positions: Position[]): { buckets: Record<string, number>; unclassified: number } {
  const out: Record<string, number> = { Treasury: 0, IG: 0, HY: 0, Equity: 0 };
  let unclassified = 0;
  for (const pos of positions) {
    const etf = ETF_EXPOSURE[pos.exposureTicker];
    if (!etf) { unclassified += pos.weight; continue; }
    // 'N/A' del data layer (equity puro) se renombra a 'Equity' aquí
    const bucket = etf.creditQuality === 'N/A' ? 'Equity' : etf.creditQuality;
    out[bucket] += pos.weight;
  }
  return { buckets: out, unclassified };
}

function aggregate(positions: Position[], dim: Dimension) {
  if (dim === 'geo') return aggregateGeo(positions);
  if (dim === 'sectors') return aggregateSectors(positions);
  return aggregateCredit(positions);
}

/**
 * Paletas por dimensión. Geo y credit tienen orden fijo (semánticamente
 * jerárquico: US primero, IG primero). Sectors se ordenan por peso al render.
 */
const GEO_COLORS: Record<string, string> = {
  US:          '#003566', // navy — mayoría típica
  'DM-ex-US':  '#3B5BA9', // navy-soft
  EM:          '#C9A84C', // gold
};

const CREDIT_COLORS: Record<string, string> = {
  Treasury: '#475569', // slate-dark — más seguro, "estabilidad"
  IG:       '#003566', // navy — calidad
  HY:       '#E97031', // orange — riesgo crediticio
  Equity:   '#7c3aed', // purple — distintivo
};

// Paleta cíclica para sectores (~11 categorías GICS + Treasury/MBS para bonds)
const SECTOR_PALETTE = [
  '#003566', '#E97031', '#C9A84C', '#7c3aed', '#0d9488', '#db2777',
  '#0891b2', '#a16207', '#15803d', '#9f1239', '#475569', '#9333ea',
  '#0369a1', '#65a30d',
];

function colorFor(dim: Dimension, key: string, idx: number): string {
  if (dim === 'geo')    return GEO_COLORS[key] ?? '#999';
  if (dim === 'credit') return CREDIT_COLORS[key] ?? '#999';
  return SECTOR_PALETTE[idx % SECTOR_PALETTE.length];
}

/**
 * Stacked bar horizontal con segmentos coloreados. Labels solo en segmentos
 * ≥6% (legible). Tooltip nativo via `title`.
 */
function StackedBar({
  segments,
  dim,
}: {
  segments: { key: string; pct: number; color: string }[];
  dim: Dimension;
}) {
  const total = segments.reduce((s, x) => s + x.pct, 0);
  if (total <= 0.001) {
    return (
      <div className="h-6 rounded bg-mercantil-line dark:bg-mercantil-dark-line/40 flex items-center justify-center text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate">
        sin asignación
      </div>
    );
  }
  return (
    <div className="h-7 w-full rounded overflow-hidden flex shadow-sm" role="img" aria-label={`Exposición ${dim}`}>
      {segments.map((seg) => {
        const widthPct = (seg.pct / total) * 100;
        const showLabel = widthPct >= 6;
        return (
          <div
            key={seg.key}
            style={{ width: `${widthPct}%`, backgroundColor: seg.color }}
            className="flex items-center justify-center text-[10.5px] font-medium text-white whitespace-nowrap overflow-hidden"
            title={`${seg.key}: ${(seg.pct * 100).toFixed(1)}%`}
          >
            {showLabel && <span className="px-1 truncate">{seg.key} {(seg.pct * 100).toFixed(0)}%</span>}
          </div>
        );
      })}
    </div>
  );
}

/**
 * Convierte el output del aggregate (buckets + unclassified) en segmentos
 * ordenados por peso descendente, con colores asignados según dimensión.
 */
function toSegments(
  result: { buckets: Record<string, number>; unclassified: number },
  dim: Dimension,
): { key: string; pct: number; color: string }[] {
  const entries = Object.entries(result.buckets).filter(([, v]) => v > 0.0005);
  // Geo y credit en orden fijo (semántico); sectors ordenado por peso
  if (dim !== 'sectors') {
    const order = dim === 'geo' ? ['US', 'DM-ex-US', 'EM']
                                : ['Treasury', 'IG', 'HY', 'Equity'];
    entries.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  } else {
    entries.sort(([, a], [, b]) => b - a);
  }
  const segs = entries.map(([key, pct], i) => ({ key, pct, color: colorFor(dim, key, i) }));
  if (result.unclassified > 0.0005) {
    segs.push({ key: 'Sin clasificar', pct: result.unclassified, color: '#9CA3AF' });
  }
  return segs;
}

/**
 * Card de leyenda — chip color + key + % alineado. Compacto, muestra todos
 * los buckets incluso los pequeños (que no caben como label en la barra).
 */
function Legend({ segments }: { segments: { key: string; pct: number; color: string }[] }) {
  if (segments.length === 0) return null;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 mt-2 text-xs">
      {segments.map((s) => (
        <div key={s.key} className="flex items-center gap-1.5 tabular-nums">
          <span className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: s.color }} />
          <span className="text-mercantil-slate dark:text-mercantil-dark-slate truncate">{s.key}</span>
          <span className="ml-auto text-mercantil-ink dark:text-mercantil-dark-ink font-medium">
            {(s.pct * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ExposureDrillDownPanel({ config }: { config: CaseStudyConfig }) {
  const [dim, setDim] = useState<Dimension>('geo');
  const [etfDetailOpen, setEtfDetailOpen] = useState(false);

  const positions = useMemo(() => expandConfigToPositions(config), [config]);

  // Nivel 1: portafolio completo
  const portfolioAgg = useMemo(() => aggregate(positions, dim), [positions, dim]);
  const portfolioSegs = useMemo(() => toSegments(portfolioAgg, dim), [portfolioAgg, dim]);

  // Nivel 2: por sleeve
  const sleeveBreakdown = useMemo(() => {
    const sleeves: SleeveName[] = ['Bullets', 'Equity', 'Cash', 'RealAssets'];
    return sleeves.map((sleeve) => {
      const subPositions = positions.filter((p) => p.sleeve === sleeve);
      const sleeveTotalAum = subPositions.reduce((s, p) => s + p.weight, 0);
      if (sleeveTotalAum <= 0) return null;
      // Reescalamos pesos del sleeve a fracciones de SU AUM (no del total) para
      // que la barra del sleeve sume 100% — la fracción del AUM total se
      // muestra como subtítulo.
      const scaled = subPositions.map((p) => ({ ...p, weight: p.weight / sleeveTotalAum }));
      const agg = aggregate(scaled, dim);
      const segs = toSegments(agg, dim);
      return { sleeve, aumPct: sleeveTotalAum, segments: segs };
    }).filter((x): x is { sleeve: SleeveName; aumPct: number; segments: typeof portfolioSegs } => x !== null);
  }, [positions, dim, portfolioSegs]);

  // Nivel 3: por ETF (lista)
  const etfBreakdown = useMemo(() => {
    return positions
      .filter((p) => p.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .map((p) => {
        const scaled = [{ ...p, weight: 1 }]; // 100% del ETF, para mostrar SU breakdown interno
        const agg = aggregate(scaled, dim);
        const segs = toSegments(agg, dim);
        return { ...p, segments: segs };
      });
  }, [positions, dim]);

  const dimLabels: Record<Dimension, string> = {
    geo: 'Geografía',
    sectors: 'Sectores',
    credit: 'Calidad crediticia',
  };

  const dimDescriptions: Record<Dimension, string> = {
    geo: 'Buckets MVP: US / DM-ex-US (Europa+Japón+Asia desarrollada) / EM. Refleja domicilio de issuers (para bonos) y país listing del emisor (para equity).',
    sectors: 'Buckets GICS-like (~11 sectores) + Treasury y Agency MBS para bonos soberanos. Sectores expresados como % del AUM total ponderado por la composición de cada ETF.',
    credit: 'Treasury / IG (investment-grade corp) / HY (high-yield corp) / Equity. Equity es el etiquetado contable — no implica calidad crediticia, separa renta variable de renta fija.',
  };

  return (
    <div data-testid="exposure-panel" className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
          Exposición del portafolio
        </h3>
        <span className="text-[11px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 tabular-nums">
          snapshot {ETF_EXPOSURE_SNAPSHOT_DATE}
        </span>
      </div>
      <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-4">
        Drill-down de la composición actual por tres dimensiones. Responde "¿a qué está expuesto el fondo hoy?".
        Es complementario al fan chart (que responde "¿cómo le va a ir?"). Data viene de las hojas de hechos
        de los ETFs subyacentes — para bonos, perfil de issuers del índice underlying (iBoxx Liquid IG/HY).
      </p>

      {/* Selector de dimensión */}
      <div className="inline-flex rounded-full border border-mercantil-line dark:border-mercantil-dark-line p-0.5 bg-mercantil-mist dark:bg-mercantil-dark-bg/40 mb-4">
        {(['geo', 'sectors', 'credit'] as Dimension[]).map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDim(d)}
            className={
              dim === d
                ? 'px-4 py-1.5 text-xs font-semibold rounded-full bg-mercantil-orange text-white shadow-sm'
                : 'px-4 py-1.5 text-xs font-medium rounded-full text-mercantil-slate dark:text-mercantil-dark-slate hover:text-mercantil-orange'
            }
          >
            {dimLabels[d]}
          </button>
        ))}
      </div>

      <p className="text-[11px] italic text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
        {dimDescriptions[dim]}
      </p>

      {/* NIVEL 1 — Portafolio */}
      <div className="mb-5">
        <div className="text-xs uppercase tracking-wider text-mercantil-ink dark:text-mercantil-dark-ink font-semibold mb-1.5">
          Portafolio total
        </div>
        <StackedBar segments={portfolioSegs} dim={dim} />
        <Legend segments={portfolioSegs} />
      </div>

      {/* NIVEL 2 — Por sleeve */}
      <div className="mb-5">
        <div className="text-xs uppercase tracking-wider text-mercantil-ink dark:text-mercantil-dark-ink font-semibold mb-2">
          Por sleeve
        </div>
        <div className="space-y-3">
          {sleeveBreakdown.map((s) => (
            <div key={s.sleeve}>
              <div className="flex items-baseline justify-between gap-2 mb-1">
                <div className="flex items-baseline gap-2">
                  <span
                    className="inline-block w-2 h-2 rounded-sm"
                    style={{ backgroundColor: SLEEVE_COLORS[s.sleeve] }}
                  />
                  <span className="text-xs font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">
                    {SLEEVE_LABELS[s.sleeve]}
                  </span>
                  <span className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
                    {(s.aumPct * 100).toFixed(0)}% del AUM
                  </span>
                </div>
              </div>
              <StackedBar segments={s.segments} dim={dim} />
            </div>
          ))}
        </div>
      </div>

      {/* NIVEL 3 — Por ETF (collapsible) */}
      <details
        open={etfDetailOpen}
        onToggle={(e) => setEtfDetailOpen((e.target as HTMLDetailsElement).open)}
        className="rounded border border-mercantil-line dark:border-mercantil-dark-line"
      >
        <summary className="px-3 py-2 cursor-pointer text-xs font-semibold uppercase tracking-wider text-mercantil-ink dark:text-mercantil-dark-ink list-none flex items-center justify-between">
          <span>Por ETF · {etfBreakdown.length} posiciones</span>
          <span className="text-mercantil-orange transition-transform" style={{ transform: etfDetailOpen ? 'rotate(180deg)' : 'none' }}>
            ▾
          </span>
        </summary>
        <div className="px-3 pb-3 pt-1 space-y-2.5">
          {etfBreakdown.map((p) => {
            const meta = ETF_EXPOSURE[p.exposureTicker];
            const hasData = (dim === 'credit') ? !!meta
                          : (dim === 'geo') ? !!meta?.geo
                          : !!meta?.sectors;
            return (
              <div key={`${p.sleeve}-${p.exposureTicker}-${p.label}`} className="border-t border-mercantil-line/60 dark:border-mercantil-dark-line/60 pt-2 first:border-t-0 first:pt-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div className="flex items-baseline gap-1.5 min-w-0">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-sm flex-shrink-0"
                      style={{ backgroundColor: SLEEVE_COLORS[p.sleeve] }}
                    />
                    <span className="text-xs font-semibold text-mercantil-ink dark:text-mercantil-dark-ink truncate">
                      {p.label}
                    </span>
                    <span className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate truncate">
                      · {SLEEVE_LABELS[p.sleeve]}
                    </span>
                  </div>
                  <span className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums whitespace-nowrap">
                    {(p.weight * 100).toFixed(1)}% AUM
                  </span>
                </div>
                {hasData ? (
                  <StackedBar segments={p.segments} dim={dim} />
                ) : (
                  <div className="text-[11px] italic text-mercantil-slate dark:text-mercantil-dark-slate px-2 py-1 bg-mercantil-mist dark:bg-mercantil-dark-bg/40 rounded">
                    {p.exposureTicker === 'CAPE'
                      ? 'Estrategia de rotación sectorial Shiller CAPE — sin breakdown estable trans-mes.'
                      : 'Sin breakdown disponible para esta dimensión.'}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </details>

      <p className="mt-3 text-[10.5px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
        Para bonos (iBonds IG/HY, GHYG, HYG, LQD, AGG, BIL, SHY, IEI): geografía y sectores reflejan composición del
        índice underlying (iBoxx Liquid IG, iBoxx Liquid HY, Bloomberg US Agg). Para equity: data oficial de cada
        fondo. Re-snapshot trimestral desde EODHD vía <code>scripts/fetch-etf-exposure.mjs</code>.
      </p>
    </div>
  );
}

// Tipos re-exportados para tests si hace falta
export type { Position, Dimension, SleeveName };
export { expandConfigToPositions, aggregateGeo, aggregateSectors, aggregateCredit };

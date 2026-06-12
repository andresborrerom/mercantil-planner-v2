/**
 * ExposureDrillDownPanel — vista de exposición del portafolio (Sankey).
 *
 * Issue #28. Complemento estructural al fan chart: responde "¿a qué está
 * expuesto el fondo HOY?" mientras el chart responde "¿cómo le va a ir?".
 *
 * Tres dimensiones (tabs): Geografía / Sectores / Calidad crediticia.
 *
 * Visualización: diagrama Sankey de 3 capas que cuenta la cascada
 *   Sleeve → ETF → Categoría
 *
 * Cada cinta tiene grosor proporcional al peso AUM. Color del flujo
 * heredado del sleeve origen (Bullets=navy, Equity=orange, Cash=slate,
 * RealAssets=gold). Tabla compacta abajo con totales por categoría.
 *
 * Para sectores con >8 buckets, los pequeños se colapsan en "Otros".
 * Cuando un ETF no tiene breakdown para la dimensión (ej. CAPE), su flujo
 * va a un nodo "Sin clasificar" — la cinta siempre balancea el AUM.
 *
 * Data viene de src/data/etf-exposure.ts (auto-generado desde EODHD +
 * overrides manuales iBoxx para bonds).
 */

import { useMemo, useState } from 'react';
import { Sankey, Tooltip } from 'recharts';
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
  Bullets:    '#003566',
  Equity:     '#E97031',
  Cash:       '#6B7280',
  RealAssets: '#C9A84C',
};

type Position = {
  exposureTicker: string;
  /** Label largo (tooltip). */
  label: string;
  /** Label corto para mostrar en el nodo del Sankey. */
  shortLabel: string;
  weight: number;
  sleeve: SleeveName;
};

function expandConfigToPositions(config: CaseStudyConfig): Position[] {
  const positions: Position[] = [];

  const bulletTotal = config.bulletMix.reduce((s, m) => s + m.weight, 0);
  if (bulletTotal > 0 && config.bulletTotalPct > 0) {
    for (const m of config.bulletMix) {
      if (m.weight <= 0) continue;
      const wAum = (m.weight / bulletTotal) * config.bulletTotalPct;
      if (m.ticker === 'iBonds') {
        positions.push({
          exposureTicker: 'IBDS',
          label: 'iBonds IG ladder (9 vintages)',
          shortLabel: 'iBonds IG',
          weight: wAum,
          sleeve: 'Bullets',
        });
      } else if (m.ticker === 'iBonds-HY') {
        positions.push({
          exposureTicker: 'HYG',
          label: 'iBonds HY ladder (IU28+IU29)',
          shortLabel: 'iBonds HY',
          weight: wAum,
          sleeve: 'Bullets',
        });
      } else if (m.ticker === 'GHYG') {
        positions.push({
          exposureTicker: 'GHYG',
          label: 'GHYG (HY corp perpetual)',
          shortLabel: 'GHYG',
          weight: wAum,
          sleeve: 'Bullets',
        });
      }
    }
  }

  const equityTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);
  if (equityTotal > 0 && config.equityPct > 0) {
    for (const m of config.equityMix) {
      if (m.weight <= 0) continue;
      const wAum = (m.weight / equityTotal) * config.equityPct;
      positions.push({
        exposureTicker: m.ticker,
        label: m.ticker,
        shortLabel: m.ticker,
        weight: wAum,
        sleeve: 'Equity',
      });
    }
  }

  if (config.cashPct > 0) {
    positions.push({
      exposureTicker: 'BIL',
      label: 'BIL (T-Bills 1-3M)',
      shortLabel: 'BIL',
      weight: config.cashPct,
      sleeve: 'Cash',
    });
  }

  if (config.realAssetsPct > 0) {
    const realTotal = config.realAssetsMix.reduce((s, m) => s + m.weight, 0);
    if (realTotal > 0) {
      for (const m of config.realAssetsMix) {
        if (m.weight <= 0) continue;
        const wAum = (m.weight / realTotal) * config.realAssetsPct;
        positions.push({
          exposureTicker: m.ticker,
          label: m.ticker,
          shortLabel: m.ticker,
          weight: wAum,
          sleeve: 'RealAssets',
        });
      }
    }
  }

  return positions;
}

function aggregateGeo(positions: Position[]) {
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

function aggregateSectors(positions: Position[]) {
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

function aggregateCredit(positions: Position[]) {
  const out: Record<string, number> = { Treasury: 0, IG: 0, HY: 0, Equity: 0 };
  let unclassified = 0;
  for (const pos of positions) {
    const etf = ETF_EXPOSURE[pos.exposureTicker];
    if (!etf) { unclassified += pos.weight; continue; }
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

const GEO_COLORS: Record<string, string> = {
  US:          '#003566',
  'DM-ex-US':  '#3B5BA9',
  EM:          '#C9A84C',
};

const CREDIT_COLORS: Record<string, string> = {
  Treasury: '#475569',
  IG:       '#003566',
  HY:       '#E97031',
  Equity:   '#7c3aed',
};

const SECTOR_PALETTE = [
  '#003566', '#E97031', '#C9A84C', '#7c3aed', '#0d9488', '#db2777',
  '#0891b2', '#a16207', '#15803d', '#9f1239', '#475569', '#9333ea',
];

const UNCLASSIFIED_COLOR = '#9CA3AF';

function colorForCategory(dim: Dimension, key: string, idx: number): string {
  if (key === 'Sin clasificar' || key === 'Otros') return UNCLASSIFIED_COLOR;
  if (dim === 'geo')    return GEO_COLORS[key] ?? '#999';
  if (dim === 'credit') return CREDIT_COLORS[key] ?? '#999';
  return SECTOR_PALETTE[idx % SECTOR_PALETTE.length];
}

/** Para sectores con muchos buckets, top N + "Otros" para mantener el chart legible. */
const MAX_CATEGORY_NODES = 8;

type SankeyNodeData = {
  name: string;
  /** Tipo de capa: 0 sleeve, 1 etf, 2 category. */
  nodeType: 'sleeve' | 'etf' | 'category';
  color: string;
  /** Peso AUM total (0..1) — para tooltip y rendering. */
  weight: number;
};

type SankeyLinkData = {
  source: number;
  target: number;
  value: number;
  /** Color heredado del sleeve origen (mismo para todo el chain del sleeve). */
  sleeveColor: string;
};

function buildSankeyData(positions: Position[], dim: Dimension): {
  nodes: SankeyNodeData[];
  links: SankeyLinkData[];
} {
  if (positions.length === 0) return { nodes: [], links: [] };

  // ---- Capa 0: sleeves (solo con peso > 0) ----
  const sleeveOrder: SleeveName[] = ['Bullets', 'Equity', 'Cash', 'RealAssets'];
  const sleeveWeights = new Map<SleeveName, number>();
  for (const p of positions) {
    sleeveWeights.set(p.sleeve, (sleeveWeights.get(p.sleeve) ?? 0) + p.weight);
  }
  const activeSleeves = sleeveOrder.filter((s) => (sleeveWeights.get(s) ?? 0) > 0);

  // ---- Capa 1: ETFs (en orden por sleeve, agrupados) ----
  const etfList = positions
    .filter((p) => p.weight > 0)
    .sort((a, b) => {
      const si = activeSleeves.indexOf(a.sleeve) - activeSleeves.indexOf(b.sleeve);
      if (si !== 0) return si;
      return b.weight - a.weight;
    });

  // ---- Capa 2: categorías (con top-N + Otros si sectors) ----
  const totalAgg = aggregate(positions, dim);
  let categoryList: { name: string; weight: number }[] = Object.entries(totalAgg.buckets)
    .filter(([, v]) => v > 0.0005)
    .map(([name, weight]) => ({ name, weight }));

  // Determinar nombres de las categorías "top" — el resto va a "Otros"
  const otrosCategories = new Set<string>();
  if (dim === 'sectors') {
    categoryList.sort((a, b) => b.weight - a.weight);
    if (categoryList.length > MAX_CATEGORY_NODES) {
      const top = categoryList.slice(0, MAX_CATEGORY_NODES - 1);
      const rest = categoryList.slice(MAX_CATEGORY_NODES - 1);
      for (const r of rest) otrosCategories.add(r.name);
      const otrosWeight = rest.reduce((s, c) => s + c.weight, 0);
      categoryList = [...top, { name: 'Otros', weight: otrosWeight }];
    }
  } else if (dim === 'geo') {
    const order = ['US', 'DM-ex-US', 'EM'];
    categoryList.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  } else {
    const order = ['Treasury', 'IG', 'HY', 'Equity'];
    categoryList.sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  }

  if (totalAgg.unclassified > 0.0005) {
    categoryList.push({ name: 'Sin clasificar', weight: totalAgg.unclassified });
  }

  // ---- Combinar en nodos finales ----
  const sleeveNodes: SankeyNodeData[] = activeSleeves.map((s) => ({
    name: `${SLEEVE_LABELS[s]} (${((sleeveWeights.get(s) ?? 0) * 100).toFixed(0)}%)`,
    nodeType: 'sleeve',
    color: SLEEVE_COLORS[s],
    weight: sleeveWeights.get(s) ?? 0,
  }));

  const etfNodes: SankeyNodeData[] = etfList.map((p) => ({
    name: p.shortLabel,
    nodeType: 'etf',
    color: SLEEVE_COLORS[p.sleeve],
    weight: p.weight,
  }));

  const catNodes: SankeyNodeData[] = categoryList.map((c, i) => ({
    name: `${c.name} (${(c.weight * 100).toFixed(1)}%)`,
    nodeType: 'category',
    color: colorForCategory(dim, c.name, i),
    weight: c.weight,
  }));

  const nodes = [...sleeveNodes, ...etfNodes, ...catNodes];
  const sleeveOffset = 0;
  const etfOffset = sleeveNodes.length;
  const catOffset = sleeveNodes.length + etfNodes.length;

  // ---- Links capa 0 → capa 1 (sleeve → ETF) ----
  const links: SankeyLinkData[] = [];
  etfList.forEach((p, i) => {
    const sleeveIdx = activeSleeves.indexOf(p.sleeve);
    links.push({
      source: sleeveOffset + sleeveIdx,
      target: etfOffset + i,
      value: p.weight,
      sleeveColor: SLEEVE_COLORS[p.sleeve],
    });
  });

  // ---- Links capa 1 → capa 2 (ETF → categoría) ----
  const catNameToIdx = new Map(categoryList.map((c, i) => [c.name, catOffset + i]));
  const otrosIdx = catNameToIdx.get('Otros');
  const sinClasIdx = catNameToIdx.get('Sin clasificar');

  etfList.forEach((p, etfIdx) => {
    const exposure = ETF_EXPOSURE[p.exposureTicker];
    let breakdown: Record<string, number> | null = null;
    if (dim === 'geo')    breakdown = exposure?.geo ?? null;
    if (dim === 'sectors') breakdown = exposure?.sectors ?? null;
    if (dim === 'credit') {
      if (exposure) {
        const bucket = exposure.creditQuality === 'N/A' ? 'Equity' : exposure.creditQuality;
        breakdown = { [bucket]: 100 };
      }
    }

    if (!breakdown) {
      if (sinClasIdx !== undefined) {
        links.push({
          source: etfOffset + etfIdx,
          target: sinClasIdx,
          value: p.weight,
          sleeveColor: SLEEVE_COLORS[p.sleeve],
        });
      }
      return;
    }

    let otrosContrib = 0;
    for (const [bucket, pct] of Object.entries(breakdown)) {
      const contrib = (p.weight * pct) / 100;
      if (contrib <= 0.0001) continue;
      if (otrosCategories.has(bucket)) {
        otrosContrib += contrib;
      } else {
        const tgt = catNameToIdx.get(bucket);
        if (tgt === undefined) continue;
        links.push({
          source: etfOffset + etfIdx,
          target: tgt,
          value: contrib,
          sleeveColor: SLEEVE_COLORS[p.sleeve],
        });
      }
    }
    if (otrosContrib > 0.0001 && otrosIdx !== undefined) {
      links.push({
        source: etfOffset + etfIdx,
        target: otrosIdx,
        value: otrosContrib,
        sleeveColor: SLEEVE_COLORS[p.sleeve],
      });
    }
  });

  return { nodes, links };
}

/**
 * Renderer custom para nodos. Coloca el label fuera del chart:
 * sleeves → label a la izquierda; ETFs y categorías → label a la derecha.
 * Sin labels en sleeves intermedios para evitar choque con flujos.
 */
type NodeRenderProps = {
  x: number;
  y: number;
  width: number;
  height: number;
  index: number;
  payload: SankeyNodeData;
};

function NodeRenderer(props: NodeRenderProps) {
  const { x, y, width, height, payload } = props;
  const isLeftSide = payload.nodeType === 'sleeve';
  const labelX = isLeftSide ? x - 6 : x + width + 6;
  const anchor = isLeftSide ? 'end' : 'start';
  const fontSize = payload.nodeType === 'etf' ? 10 : 11;
  const fontWeight = payload.nodeType === 'etf' ? 400 : 600;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={payload.color}
        fillOpacity={0.95}
      />
      <text
        x={labelX}
        y={y + height / 2}
        textAnchor={anchor}
        dominantBaseline="middle"
        fontSize={fontSize}
        fontWeight={fontWeight}
        className="fill-mercantil-ink dark:fill-mercantil-dark-ink"
      >
        {payload.name}
      </text>
    </g>
  );
}

/**
 * Renderer custom para links. Path curvado con el color del sleeve origen,
 * opacidad baja para que el conjunto sea legible (hover sube opacity).
 */
type LinkRenderProps = {
  sourceX: number;
  sourceY: number;
  sourceControlX: number;
  targetControlX: number;
  targetX: number;
  targetY: number;
  linkWidth: number;
  index: number;
  payload: {
    source: SankeyNodeData & { sourceLinks: unknown[]; targetLinks: unknown[] };
    target: SankeyNodeData;
    value: number;
    sleeveColor?: string;
  };
};

function LinkRenderer(props: LinkRenderProps) {
  const {
    sourceX, sourceY, sourceControlX, targetControlX, targetX, targetY, linkWidth, payload,
  } = props;
  const color = payload.sleeveColor ?? payload.source.color ?? '#9CA3AF';

  return (
    <path
      d={`
        M${sourceX},${sourceY}
        C${sourceControlX},${sourceY} ${targetControlX},${targetY} ${targetX},${targetY}
      `}
      stroke={color}
      strokeWidth={Math.max(1, linkWidth)}
      strokeOpacity={0.35}
      fill="none"
    />
  );
}

/** Tooltip custom — value es fracción AUM (0..1), mostrarlo como %. */
type TooltipProps = {
  active?: boolean;
  payload?: Array<{ payload: { source?: SankeyNodeData; target?: SankeyNodeData; value?: number; name?: string; weight?: number } }>;
};

function ExposureTooltip(props: TooltipProps) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const p = props.payload[0].payload;
  // Link tooltip
  if (p.source && p.target && p.value !== undefined) {
    return (
      <div className="rounded border border-mercantil-line bg-white dark:bg-mercantil-dark-panel dark:border-mercantil-dark-line shadow-md px-2.5 py-1.5 text-xs">
        <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">
          {p.source.name} → {p.target.name}
        </div>
        <div className="text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
          {(p.value * 100).toFixed(2)}% del AUM
        </div>
      </div>
    );
  }
  // Node tooltip
  if (p.name) {
    return (
      <div className="rounded border border-mercantil-line bg-white dark:bg-mercantil-dark-panel dark:border-mercantil-dark-line shadow-md px-2.5 py-1.5 text-xs">
        <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">{p.name}</div>
        {p.weight !== undefined && (
          <div className="text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
            {(p.weight * 100).toFixed(2)}% del AUM
          </div>
        )}
      </div>
    );
  }
  return null;
}

/** Tabla compacta de totales por categoría — complemento numérico al chart. */
function CategorySummary({
  positions,
  dim,
}: {
  positions: Position[];
  dim: Dimension;
}) {
  const result = aggregate(positions, dim);
  let entries = Object.entries(result.buckets).filter(([, v]) => v > 0.0005);
  if (dim !== 'sectors') {
    const order = dim === 'geo' ? ['US', 'DM-ex-US', 'EM'] : ['Treasury', 'IG', 'HY', 'Equity'];
    entries.sort(([a], [b]) => order.indexOf(a) - order.indexOf(b));
  } else {
    entries.sort(([, a], [, b]) => b - a);
  }
  if (result.unclassified > 0.0005) entries.push(['Sin clasificar', result.unclassified]);

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-3 gap-y-1 text-xs">
      {entries.map(([key, pct], i) => (
        <div key={key} className="flex items-center gap-1.5 tabular-nums">
          <span
            className="inline-block w-2.5 h-2.5 rounded-sm flex-shrink-0"
            style={{ backgroundColor: colorForCategory(dim, key, i) }}
          />
          <span className="text-mercantil-slate dark:text-mercantil-dark-slate truncate">{key}</span>
          <span className="ml-auto text-mercantil-ink dark:text-mercantil-dark-ink font-medium">
            {(pct * 100).toFixed(1)}%
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ExposureDrillDownPanel({ config }: { config: CaseStudyConfig }) {
  const [dim, setDim] = useState<Dimension>('geo');

  const positions = useMemo(() => expandConfigToPositions(config), [config]);
  const sankeyData = useMemo(() => buildSankeyData(positions, dim), [positions, dim]);

  const dimLabels: Record<Dimension, string> = {
    geo: 'Geografía',
    sectors: 'Sectores',
    credit: 'Calidad crediticia',
  };

  const dimDescriptions: Record<Dimension, string> = {
    geo: 'Buckets MVP: US / DM-ex-US (Europa+Japón+Asia desarrollada) / EM. Refleja domicilio de issuers (para bonos) y país listing del emisor (para equity).',
    sectors: 'Buckets GICS-like (~11 sectores) + Treasury y Agency MBS para bonos soberanos. Top 7 + "Otros" cuando hay más de 8 buckets activos.',
    credit: 'Treasury / IG (investment-grade corp) / HY (high-yield corp) / Equity. Equity es etiquetado contable — no implica calidad crediticia, separa renta variable de renta fija.',
  };

  // Altura dinámica: más alta para sectores (más nodos del lado derecho)
  const chartHeight = dim === 'sectors' ? 520 : 380;

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
      <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
        Cascada <strong>Sleeve → ETF → Categoría</strong>: cada cinta es proporcional al peso AUM y hereda el color del sleeve
        origen. Responde "¿a qué está expuesto el fondo hoy?" — complementario al fan chart. Hover en cualquier cinta para ver el detalle.
      </p>

      {/* Selector de dimensión */}
      <div className="inline-flex rounded-full border border-mercantil-line dark:border-mercantil-dark-line p-0.5 bg-mercantil-mist dark:bg-mercantil-dark-bg/40 mb-3">
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

      <p className="text-[11px] italic text-mercantil-slate dark:text-mercantil-dark-slate mb-2">
        {dimDescriptions[dim]}
      </p>

      {/* Chart Sankey */}
      {sankeyData.nodes.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-xs text-mercantil-slate dark:text-mercantil-dark-slate italic border border-dashed border-mercantil-line dark:border-mercantil-dark-line rounded">
          Sin asignación — verificá que la allocation sume 100%.
        </div>
      ) : (
        <div className="w-full overflow-x-auto">
          <Sankey
            width={920}
            height={chartHeight}
            data={sankeyData}
            nodePadding={22}
            nodeWidth={10}
            linkCurvature={0.5}
            iterations={64}
            margin={{ top: 8, right: 200, bottom: 8, left: 100 }}
            node={NodeRenderer as never}
            link={LinkRenderer as never}
          >
            <Tooltip content={<ExposureTooltip />} />
          </Sankey>
        </div>
      )}

      {/* Mini-tabla de totales por categoría */}
      <div className="mt-3 pt-3 border-t border-mercantil-line dark:border-mercantil-dark-line">
        <div className="text-[11px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-1.5">
          Totales por categoría
        </div>
        <CategorySummary positions={positions} dim={dim} />
      </div>

      <p className="mt-3 text-[10.5px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
        Para bonos (iBonds IG/HY, GHYG, HYG, LQD, AGG, BIL, SHY, IEI): geografía y sectores reflejan composición del
        índice underlying (iBoxx Liquid IG, iBoxx Liquid HY, Bloomberg US Agg). Para equity: data oficial de cada fondo.
        Re-snapshot trimestral desde EODHD vía <code>scripts/fetch-etf-exposure.mjs</code>.
      </p>
    </div>
  );
}

// Re-exports para tests
export type { Position, Dimension, SleeveName };
export { expandConfigToPositions, aggregateGeo, aggregateSectors, aggregateCredit, buildSankeyData };

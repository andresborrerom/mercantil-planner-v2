/**
 * RiskPanel — atribución de riesgo del portafolio actual.
 *
 * Issue #28 follow-up. Tres visualizaciones tabbed sobre el mismo
 * análisis de riesgo (covarianza histórica × pesos del portafolio):
 *
 *   1. Component VaR — barra comparativa "% AUM vs % VaR" por sleeve.
 *      Responde "¿de dónde viene mi riesgo?". Sleeve con %VaR < %AUM
 *      está sub-aportando riesgo (diversificador); el inverso es un
 *      risk amplifier (esperado en equity, problemático en otros).
 *
 *   2. Asignación vs riesgo — scatter weight% (X) vs VaR% (Y) por
 *      posición. Diagonal 45° = neutralidad. Arriba = amplifica riesgo
 *      para su weight; abajo = lo modera (diversifica).
 *
 *   3. Heatmap de correlaciones — matriz NxN con celdas coloreadas.
 *      Rojo = correlación positiva alta, azul = negativa, blanco = 0.
 *      Visualiza si las posiciones son genuinamente diversificadoras o
 *      están moviéndose juntas.
 *
 * Math: ver src/domain/riskMetrics.ts (Component VaR via Euler,
 * cov anualizada de 244 meses de retornos históricos, mapeo de tickers
 * de exposure a tickers de market data).
 */
import { useMemo, useState } from 'react';
import { CartesianGrid, ReferenceLine, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from 'recharts';
import type { CaseStudyConfig } from '../state/caseStudyStore';
import {
  computeRiskAttribution,
  mapToMarketTicker,
  type RiskAttribution,
  type RiskPosition,
} from '../domain/riskMetrics';

type View = 'component' | 'scatter' | 'heatmap';
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

/**
 * Expande el config a posiciones risk-ready (cada una con ticker market-data
 * y label client-facing). Análogo a expandConfigToPositions del
 * ExposureDrillDownPanel pero usando mapToMarketTicker para resolver los
 * tickers de los iBonds (IBDS→LQD, etc).
 */
function expandConfigToRiskPositions(config: CaseStudyConfig): RiskPosition[] {
  const positions: RiskPosition[] = [];
  const pushIfValid = (
    exposureTicker: string,
    label: string,
    weight: number,
    sleeve: SleeveName,
  ) => {
    if (weight <= 0) return;
    const marketTicker = mapToMarketTicker(exposureTicker);
    if (!marketTicker) return; // skip si el ticker no está en market data
    positions.push({ ticker: marketTicker, label, weight, sleeve });
  };

  const bulletTotal = config.bulletMix.reduce((s, m) => s + m.weight, 0);
  if (bulletTotal > 0 && config.bulletTotalPct > 0) {
    for (const m of config.bulletMix) {
      const wAum = (m.weight / bulletTotal) * config.bulletTotalPct;
      if (m.ticker === 'iBonds') pushIfValid('IBDS', 'iBonds IG ladder', wAum, 'Bullets');
      else if (m.ticker === 'iBonds-HY') pushIfValid('HYG', 'iBonds HY ladder', wAum, 'Bullets');
      else if (m.ticker === 'GHYG') pushIfValid('GHYG', 'GHYG perpetual', wAum, 'Bullets');
    }
  }

  const equityTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);
  if (equityTotal > 0 && config.equityPct > 0) {
    for (const m of config.equityMix) {
      const wAum = (m.weight / equityTotal) * config.equityPct;
      pushIfValid(m.ticker, m.ticker, wAum, 'Equity');
    }
  }

  if (config.cashPct > 0) pushIfValid('BIL', 'BIL', config.cashPct, 'Cash');

  if (config.realAssetsPct > 0) {
    const realTotal = config.realAssetsMix.reduce((s, m) => s + m.weight, 0);
    if (realTotal > 0) {
      for (const m of config.realAssetsMix) {
        const wAum = (m.weight / realTotal) * config.realAssetsPct;
        pushIfValid(m.ticker, m.ticker, wAum, 'RealAssets');
      }
    }
  }

  return positions;
}

/** Suma de pesos por sleeve para mostrar la línea "% AUM" del side-by-side. */
function aggregateBySleeve(
  positions: RiskPosition[],
  values: number[],
): { sleeve: SleeveName; total: number }[] {
  const map = new Map<SleeveName, number>();
  positions.forEach((p, i) => {
    map.set(p.sleeve, (map.get(p.sleeve) ?? 0) + values[i]);
  });
  const order: SleeveName[] = ['Bullets', 'Equity', 'Cash', 'RealAssets'];
  return order
    .filter((s) => (map.get(s) ?? 0) > 0)
    .map((s) => ({ sleeve: s, total: map.get(s) ?? 0 }));
}

function fmtPct(decimal: number, digits = 1): string {
  return `${(decimal * 100).toFixed(digits)}%`;
}

function fmtMoney(usd: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(usd);
}

/**
 * Component VaR view — barras side-by-side "% AUM vs % VaR" por sleeve.
 * Conta de la insight central: equity (vol 4× la de bonds) aporta MAS al
 * VaR que su weight sugiere; bullets aportan menos. Cash es ~neutral.
 */
function ComponentVaRView({
  attribution,
  initialAum,
}: {
  attribution: RiskAttribution;
  initialAum: number;
}) {
  const weights = attribution.positions.map((p) => p.weight);
  const sleevesAum = aggregateBySleeve(attribution.positions, weights);
  const sleevesVaR = aggregateBySleeve(attribution.positions, attribution.componentVaRPct);

  // Combinar en un solo array sortable
  const merged = sleevesAum.map((s) => ({
    sleeve: s.sleeve,
    aumPct: s.total,
    varPct: sleevesVaR.find((v) => v.sleeve === s.sleeve)?.total ?? 0,
  }));

  return (
    <div>
      {/* Headline metric */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatTile
          label="VaR portafolio (anual)"
          value={fmtPct(attribution.portfolioVaR, 1)}
          hint={`${(attribution.confidence * 100).toFixed(0)}% confianza`}
        />
        <StatTile
          label="VaR en USD"
          value={fmtMoney(initialAum * attribution.portfolioVaR)}
          hint="sobre AUM inicial"
        />
        <StatTile
          label="Volatilidad anual"
          value={fmtPct(attribution.portfolioVol, 1)}
          hint="sigma portfolio"
        />
        <StatTile
          label="N° posiciones"
          value={String(attribution.positions.length)}
          hint="ETFs distintos"
        />
      </div>

      {/* Bar comparativo por sleeve */}
      <div className="text-xs uppercase tracking-wider font-semibold text-mercantil-ink dark:text-mercantil-dark-ink mb-2">
        Contribución por sleeve — % AUM vs % VaR
      </div>
      <div className="space-y-3">
        {merged.map((s) => (
          <div key={s.sleeve}>
            <div className="flex items-baseline gap-2 mb-1">
              <span
                className="inline-block w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: SLEEVE_COLORS[s.sleeve] }}
              />
              <span className="text-sm font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">
                {SLEEVE_LABELS[s.sleeve]}
              </span>
              <span className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate ml-auto tabular-nums">
                {fmtPct(s.aumPct, 0)} AUM → {fmtPct(s.varPct, 0)} VaR
              </span>
            </div>
            <DualBar
              aumPct={s.aumPct}
              varPct={s.varPct}
              color={SLEEVE_COLORS[s.sleeve]}
            />
          </div>
        ))}
      </div>

      {/* Tabla por posición */}
      <details className="mt-4 rounded border border-mercantil-line dark:border-mercantil-dark-line">
        <summary className="px-3 py-2 cursor-pointer text-xs font-semibold uppercase tracking-wider text-mercantil-ink dark:text-mercantil-dark-ink list-none flex items-center justify-between">
          <span>Detalle por posición · {attribution.positions.length} ETFs</span>
          <span className="text-mercantil-orange">▾</span>
        </summary>
        <div className="px-3 pb-3 pt-1">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate">
                <th className="text-left py-1.5 font-medium">Posición</th>
                <th className="text-right py-1.5 font-medium">Peso AUM</th>
                <th className="text-right py-1.5 font-medium">Contrib. VaR</th>
                <th className="text-right py-1.5 font-medium">Marginal VaR</th>
                <th className="text-right py-1.5 font-medium">VaR / AUM</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {attribution.positions.map((p, i) => {
                const ratio = p.weight > 0 ? attribution.componentVaRPct[i] / p.weight : 0;
                const ratioTone = ratio > 1.2 ? 'text-red-600 dark:text-red-400'
                                 : ratio < 0.8 ? 'text-green-700 dark:text-green-400'
                                 : 'text-mercantil-slate dark:text-mercantil-dark-slate';
                return (
                  <tr key={`${p.sleeve}-${p.ticker}-${p.label}`} className="border-b border-mercantil-line/60 dark:border-mercantil-dark-line/60 last:border-0">
                    <td className="py-1.5 flex items-center gap-1.5">
                      <span
                        className="inline-block w-1.5 h-1.5 rounded-sm flex-shrink-0"
                        style={{ backgroundColor: SLEEVE_COLORS[p.sleeve] }}
                      />
                      <span className="text-mercantil-ink dark:text-mercantil-dark-ink font-medium">{p.label}</span>
                      <span className="text-mercantil-slate dark:text-mercantil-dark-slate text-[10px]">
                        ({SLEEVE_LABELS[p.sleeve]})
                      </span>
                    </td>
                    <td className="text-right">{fmtPct(p.weight, 1)}</td>
                    <td className="text-right text-mercantil-ink dark:text-mercantil-dark-ink font-semibold">
                      {fmtPct(attribution.componentVaRPct[i], 1)}
                    </td>
                    <td className="text-right">{fmtPct(attribution.marginalVaR[i], 1)}</td>
                    <td className={`text-right font-medium ${ratioTone}`}>
                      {ratio.toFixed(2)}×
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[10px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic mt-2">
            <strong>VaR/AUM ratio</strong>: &gt;1× = amplifica riesgo para su weight; &lt;1× = diversifica.
            <strong> Marginal VaR</strong>: si subo $1 de esta posición, el VaR sube en este %.
          </p>
        </div>
      </details>
    </div>
  );
}

/**
 * Barra dual: arriba % AUM, abajo % VaR. Ambas con el mismo color (sleeve)
 * pero la de VaR más oscura. El contraste visual cuenta la story.
 */
function DualBar({
  aumPct,
  varPct,
  color,
}: {
  aumPct: number;
  varPct: number;
  color: string;
}) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate w-12 flex-shrink-0">AUM</span>
        <div className="flex-1 h-3 bg-mercantil-mist dark:bg-mercantil-dark-bg/40 rounded">
          <div
            className="h-full rounded"
            style={{ width: `${aumPct * 100}%`, backgroundColor: color, opacity: 0.6 }}
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-mercantil-slate dark:text-mercantil-dark-slate w-12 flex-shrink-0">VaR</span>
        <div className="flex-1 h-3 bg-mercantil-mist dark:bg-mercantil-dark-bg/40 rounded">
          <div
            className="h-full rounded"
            style={{ width: `${varPct * 100}%`, backgroundColor: color }}
          />
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded border border-mercantil-line dark:border-mercantil-dark-line p-2.5 bg-mercantil-mist/50 dark:bg-mercantil-dark-bg/30">
      <div className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-0.5">
        {label}
      </div>
      <div className="text-lg font-semibold text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums">
        {value}
      </div>
      {hint && (
        <div className="text-[10px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 mt-0.5">
          {hint}
        </div>
      )}
    </div>
  );
}

/**
 * Scatter view: cada posición es un punto (X=peso%, Y=%VaR), tamaño por
 * marginal VaR. Diagonal 45° marca la neutralidad.
 */
type ScatterDatum = {
  x: number; // weight pct (0..100)
  y: number; // var pct (0..100)
  z: number; // marginal var, para el tamaño del bubble
  label: string;
  sleeve: SleeveName;
  ticker: string;
  marginalVaR: number;
};

function ScatterView({ attribution }: { attribution: RiskAttribution }) {
  const data = attribution.positions.map((p, i) => ({
    x: p.weight * 100,
    y: attribution.componentVaRPct[i] * 100,
    z: Math.max(50, attribution.marginalVaR[i] * 1000), // visual scaling
    label: p.label,
    sleeve: p.sleeve,
    ticker: p.ticker,
    marginalVaR: attribution.marginalVaR[i],
  } satisfies ScatterDatum));

  const maxAxis = Math.ceil(Math.max(...data.map((d) => Math.max(d.x, d.y)), 5) / 5) * 5 + 5;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">Leyenda:</span>
        {(['Bullets', 'Equity', 'Cash', 'RealAssets'] as SleeveName[]).map((s) =>
          data.some((d) => d.sleeve === s) ? (
            <div key={s} className="flex items-center gap-1.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full"
                style={{ backgroundColor: SLEEVE_COLORS[s] }}
              />
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                {SLEEVE_LABELS[s]}
              </span>
            </div>
          ) : null,
        )}
      </div>

      <div className="w-full overflow-x-auto">
        <ScatterChart
          width={760}
          height={420}
          margin={{ top: 20, right: 30, bottom: 50, left: 50 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EF" />
          <XAxis
            type="number"
            dataKey="x"
            domain={[0, maxAxis]}
            label={{ value: '% del AUM', position: 'bottom', offset: 10, fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            fontSize={11}
          />
          <YAxis
            type="number"
            dataKey="y"
            domain={[0, maxAxis]}
            label={{ value: '% del VaR', angle: -90, position: 'left', offset: 25, fontSize: 11 }}
            tickFormatter={(v) => `${v}%`}
            fontSize={11}
          />
          <ZAxis dataKey="z" range={[80, 800]} />
          <Tooltip content={<ScatterTooltip />} cursor={{ strokeDasharray: '3 3' }} />
          {/* Diagonal 45° = neutralidad */}
          <ReferenceLine
            segment={[{ x: 0, y: 0 }, { x: maxAxis, y: maxAxis }]}
            stroke="#9CA3AF"
            strokeDasharray="4 4"
            label={{ value: 'Neutralidad (45°)', position: 'insideTopRight', fontSize: 10, fill: '#6B7280' }}
          />
          {(['Bullets', 'Equity', 'Cash', 'RealAssets'] as SleeveName[]).map((s) => {
            const sleeveData = data.filter((d) => d.sleeve === s);
            if (sleeveData.length === 0) return null;
            return (
              <Scatter
                key={s}
                name={SLEEVE_LABELS[s]}
                data={sleeveData}
                fill={SLEEVE_COLORS[s]}
                fillOpacity={0.7}
              />
            );
          })}
        </ScatterChart>
      </div>

      <p className="mt-2 text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate italic">
        Cada punto es una posición. <strong>Arriba de la diagonal</strong> = amplifica riesgo (% VaR &gt; % AUM).
        <strong> Abajo</strong> = diversifica (% VaR &lt; % AUM). Tamaño del bubble proporcional al marginal VaR.
      </p>
    </div>
  );
}

function ScatterTooltip(props: { active?: boolean; payload?: Array<{ payload: ScatterDatum }> }) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const d = props.payload[0].payload;
  const ratio = d.x > 0 ? d.y / d.x : 0;
  return (
    <div className="rounded border border-mercantil-line bg-white dark:bg-mercantil-dark-panel dark:border-mercantil-dark-line shadow-md px-2.5 py-1.5 text-xs">
      <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">{d.label}</div>
      <div className="text-mercantil-slate dark:text-mercantil-dark-slate text-[11px]">{SLEEVE_LABELS[d.sleeve]} · ticker {d.ticker}</div>
      <div className="mt-1 text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums">
        Weight: <strong>{d.x.toFixed(1)}%</strong> · VaR: <strong>{d.y.toFixed(1)}%</strong>
      </div>
      <div className="text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
        VaR/AUM ratio: <strong>{ratio.toFixed(2)}×</strong> · Marginal VaR: {(d.marginalVaR * 100).toFixed(2)}%
      </div>
    </div>
  );
}

/**
 * Heatmap de correlaciones — matriz NxN custom SVG.
 * Color: blanco al medio, rojo hacia +1, azul hacia -1.
 */
function correlationColor(corr: number): string {
  // Normalizamos a [-1, 1] y mapeamos a un gradiente.
  // -1 → azul navy (#003566)
  //  0 → blanco
  // +1 → rojo (#9f1239)
  const t = Math.max(-1, Math.min(1, corr));
  if (t >= 0) {
    // 0 (blanco) → 1 (rojo)
    const r = Math.round(255 - (255 - 159) * t);
    const g = Math.round(255 - (255 - 18) * t);
    const b = Math.round(255 - (255 - 57) * t);
    return `rgb(${r}, ${g}, ${b})`;
  } else {
    const a = -t;
    const r = Math.round(255 - (255 - 0) * a);
    const g = Math.round(255 - (255 - 53) * a);
    const b = Math.round(255 - (255 - 102) * a);
    return `rgb(${r}, ${g}, ${b})`;
  }
}

function HeatmapView({ attribution }: { attribution: RiskAttribution }) {
  const N = attribution.positions.length;
  if (N === 0) {
    return <div className="text-xs italic text-mercantil-slate dark:text-mercantil-dark-slate">Sin posiciones para correlacionar.</div>;
  }

  const cellSize = N <= 4 ? 64 : N <= 6 ? 52 : 44;
  const labelWidth = 130;
  const headerHeight = 80;
  const totalWidth = labelWidth + N * cellSize + 20;
  const totalHeight = headerHeight + N * cellSize + 20;

  return (
    <div>
      <div className="w-full overflow-x-auto">
        <svg width={totalWidth} height={totalHeight} className="text-mercantil-ink dark:text-mercantil-dark-ink">
          {/* Labels columnas (rotados) */}
          {attribution.positions.map((p, j) => {
            const x = labelWidth + j * cellSize + cellSize / 2;
            const y = headerHeight - 8;
            return (
              <text
                key={`col-${j}`}
                x={x}
                y={y}
                textAnchor="start"
                transform={`rotate(-45, ${x}, ${y})`}
                fontSize={10}
                fill="currentColor"
              >
                {p.label.length > 18 ? p.label.slice(0, 15) + '…' : p.label}
              </text>
            );
          })}

          {/* Celdas + labels filas */}
          {attribution.positions.map((p, i) => {
            const y = headerHeight + i * cellSize;
            return (
              <g key={`row-${i}`}>
                <text
                  x={labelWidth - 6}
                  y={y + cellSize / 2}
                  textAnchor="end"
                  dominantBaseline="middle"
                  fontSize={10}
                  fill="currentColor"
                >
                  {p.label.length > 18 ? p.label.slice(0, 15) + '…' : p.label}
                </text>
                <circle
                  cx={6}
                  cy={y + cellSize / 2}
                  r={3.5}
                  fill={SLEEVE_COLORS[p.sleeve]}
                />
                {attribution.correlation[i].map((corr, j) => {
                  const cx = labelWidth + j * cellSize;
                  const showText = cellSize >= 44;
                  const textColor = Math.abs(corr) > 0.55 ? '#fff' : '#0B1020';
                  return (
                    <g key={`${i}-${j}`}>
                      <rect
                        x={cx}
                        y={y}
                        width={cellSize}
                        height={cellSize}
                        fill={correlationColor(corr)}
                        stroke="#fff"
                        strokeWidth={1.5}
                      />
                      {showText && (
                        <text
                          x={cx + cellSize / 2}
                          y={y + cellSize / 2}
                          textAnchor="middle"
                          dominantBaseline="middle"
                          fontSize={11}
                          fontWeight={500}
                          fill={textColor}
                        >
                          {corr.toFixed(2)}
                        </text>
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      </div>

      {/* Leyenda del gradiente */}
      <div className="mt-2 flex items-center gap-3 text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate">
        <span>Correlación:</span>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: correlationColor(-1) }} />
          <span>−1</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded-sm border border-mercantil-line" style={{ backgroundColor: correlationColor(0) }} />
          <span>0</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-4 rounded-sm" style={{ backgroundColor: correlationColor(1) }} />
          <span>+1</span>
        </div>
        <span className="italic ml-2">
          Calculada sobre 244 meses (2006-01 → 2026-04).
        </span>
      </div>
    </div>
  );
}

export default function RiskPanel({
  config,
  initialAum,
}: {
  config: CaseStudyConfig;
  initialAum: number;
}) {
  const [view, setView] = useState<View>('component');
  const [confidence, setConfidence] = useState<number>(0.95);

  const riskPositions = useMemo(() => expandConfigToRiskPositions(config), [config]);
  const attribution = useMemo(
    () => computeRiskAttribution(riskPositions, confidence),
    [riskPositions, confidence],
  );

  const viewLabels: Record<View, string> = {
    component: 'Contribución al riesgo',
    scatter: 'Asignación vs riesgo',
    heatmap: 'Correlaciones',
  };

  return (
    <div
      data-testid="risk-panel"
      className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
          Riesgo del portafolio
        </h3>
        <span className="text-[11px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
          parametrico Gaussiano · cov histórica 244M
        </span>
      </div>
      <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
        Atribución del riesgo total a las posiciones individuales (Component VaR via Euler). Responde
        "¿de dónde viene mi riesgo?" — complementario a la exposición (qué) y al fan chart (cuánto se mueve).
      </p>

      {/* Selectores: vista + confianza */}
      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <div className="inline-flex rounded-full border border-mercantil-line dark:border-mercantil-dark-line p-0.5 bg-mercantil-mist dark:bg-mercantil-dark-bg/40">
          {(['component', 'scatter', 'heatmap'] as View[]).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              className={
                view === v
                  ? 'px-4 py-1.5 text-xs font-semibold rounded-full bg-mercantil-orange text-white shadow-sm'
                  : 'px-4 py-1.5 text-xs font-medium rounded-full text-mercantil-slate dark:text-mercantil-dark-slate hover:text-mercantil-orange'
              }
            >
              {viewLabels[v]}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 text-xs">
          <span className="text-mercantil-slate dark:text-mercantil-dark-slate">Confianza VaR:</span>
          <select
            value={confidence}
            onChange={(e) => setConfidence(parseFloat(e.target.value))}
            className="rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink px-2 py-1 text-xs"
          >
            <option value={0.95}>95%</option>
            <option value={0.99}>99%</option>
          </select>
        </div>
      </div>

      {/* Cuerpo según vista */}
      {attribution.positions.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-xs text-mercantil-slate dark:text-mercantil-dark-slate italic border border-dashed border-mercantil-line dark:border-mercantil-dark-line rounded">
          Sin asignación — verificá que la allocation sume 100%.
        </div>
      ) : view === 'component' ? (
        <ComponentVaRView attribution={attribution} initialAum={initialAum} />
      ) : view === 'scatter' ? (
        <ScatterView attribution={attribution} />
      ) : (
        <HeatmapView attribution={attribution} />
      )}

      <p className="mt-3 text-[10.5px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
        VaR paramétrico (Gaussiano 1-tail anual) computado sobre matriz de covarianza histórica
        de los retornos mensuales 2006-01 → 2026-04. Asume retornos IID stationary — proxy razonable
        a horizonte 1y. No captura tail risk de eventos no Gaussianos (use el fan chart para eso).
        iBonds IG ladder usa LQD como proxy de riesgo; iBonds HY usa GHYG.
      </p>
    </div>
  );
}

// Re-exports para tests
export { expandConfigToRiskPositions };

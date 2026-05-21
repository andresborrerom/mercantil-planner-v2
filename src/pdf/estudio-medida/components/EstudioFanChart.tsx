/**
 * Fan chart SVG del aumPath para el PDF "Estudio a la Medida".
 *
 * Renderizado con primitivas SVG nativas de @react-pdf/renderer (NO recharts —
 * recharts es DOM-only). Toma `aumPath` (Float64Array, shape
 * nSims × (horizonMonths + 1)) y calcula percentiles in-memory.
 *
 * Diseño minimalista: bandas P5–P95 y P25–P75 + mediana sólida. Línea gris
 * punteada del capital inicial como ancla visual.
 */
import { Svg, Polygon, Polyline, Line, Text as SvgText, G } from '@react-pdf/renderer';

import { colors } from '../../theme/colors';
import { fonts, fontSize } from '../../theme/typography';

const CHART_WIDTH = 482;
const CHART_HEIGHT = 220;
const PAD_LEFT = 60;
const PAD_RIGHT = 12;
const PAD_TOP = 10;
const PAD_BOTTOM = 26;

const innerW = CHART_WIDTH - PAD_LEFT - PAD_RIGHT;
const innerH = CHART_HEIGHT - PAD_TOP - PAD_BOTTOM;

const tickLabelStyle = {
  fontFamily: fonts.sans,
  fontSize: fontSize.micro,
} as const;

type Props = {
  /** Float64Array de shape nSims × (horizonMonths + 1). */
  aumPath: Float64Array;
  nSims: number;
  horizonMonths: number;
  initialAum: number;
};

/**
 * Calcula percentiles por mes y devuelve arrays p5/p25/p50/p75/p95
 * (en millones de USD para legibilidad en el chart).
 */
function computePercentiles(
  aumPath: Float64Array,
  nSims: number,
  horizonMonths: number,
): { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] } {
  const Hp1 = horizonMonths + 1;
  const p5: number[] = [];
  const p25: number[] = [];
  const p50: number[] = [];
  const p75: number[] = [];
  const p95: number[] = [];
  const col = new Float64Array(nSims);
  for (let t = 0; t < Hp1; t++) {
    for (let s = 0; s < nSims; s++) col[s] = aumPath[s * Hp1 + t];
    const sorted = Float64Array.from(col).sort();
    p5.push(sorted[Math.floor(0.05 * (nSims - 1))] / 1e6);
    p25.push(sorted[Math.floor(0.25 * (nSims - 1))] / 1e6);
    p50.push(sorted[Math.floor(0.50 * (nSims - 1))] / 1e6);
    p75.push(sorted[Math.floor(0.75 * (nSims - 1))] / 1e6);
    p95.push(sorted[Math.floor(0.95 * (nSims - 1))] / 1e6);
  }
  return { p5, p25, p50, p75, p95 };
}

export function EstudioFanChart({ aumPath, nSims, horizonMonths, initialAum }: Props) {
  const { p5, p25, p50, p75, p95 } = computePercentiles(aumPath, nSims, horizonMonths);
  const initialM = initialAum / 1e6;

  // Y-scale dinámico — incluye también initialAum por si las bandas no lo cubren.
  let yMax = initialM;
  let yMin = initialM;
  for (let t = 0; t <= horizonMonths; t++) {
    if (p95[t] > yMax) yMax = p95[t];
    if (p5[t] < yMin) yMin = p5[t];
  }
  yMax *= 1.05;
  yMin = Math.max(0, yMin * 0.95);
  if (yMax === yMin) yMax = yMin + 1;

  const xScale = (t: number): number => PAD_LEFT + (t / horizonMonths) * innerW;
  const yScale = (v: number): number => PAD_TOP + innerH * (1 - (v - yMin) / (yMax - yMin));

  const polyBand = (lo: number[], hi: number[]): string => {
    const parts: string[] = [];
    for (let t = 0; t <= horizonMonths; t++) {
      parts.push(`${xScale(t)},${yScale(hi[t])}`);
    }
    for (let t = horizonMonths; t >= 0; t--) {
      parts.push(`${xScale(t)},${yScale(lo[t])}`);
    }
    return parts.join(' ');
  };

  const polyLine = (series: number[]): string =>
    series.map((v, t) => `${xScale(t)},${yScale(v)}`).join(' ');

  // Ticks del eje X — años redondos (cada 12 meses hasta el horizonte).
  const xTicks: number[] = [];
  const stepM = horizonMonths <= 72 ? 12 : horizonMonths <= 240 ? 24 : 60;
  for (let t = 0; t <= horizonMonths; t += stepM) xTicks.push(t);
  if (xTicks[xTicks.length - 1] !== horizonMonths) xTicks.push(horizonMonths);

  // Ticks del eje Y — 5 marcas equidistantes.
  const yTicks: number[] = [];
  for (let i = 0; i <= 4; i++) yTicks.push(yMin + (yMax - yMin) * (i / 4));

  return (
    <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
      {/* Bandas P5-P95 (más clara) y P25-P75 (más oscura) */}
      <Polygon points={polyBand(p5, p95)} fill={colors.orange} fillOpacity={0.12} />
      <Polygon points={polyBand(p25, p75)} fill={colors.orange} fillOpacity={0.28} />
      {/* Mediana sólida */}
      <Polyline points={polyLine(p50)} stroke={colors.orangeDeep} strokeWidth={1.5} fill="none" />
      {/* Línea horizontal del capital inicial */}
      <Line
        x1={PAD_LEFT}
        y1={yScale(initialM)}
        x2={PAD_LEFT + innerW}
        y2={yScale(initialM)}
        stroke={colors.muted}
        strokeWidth={0.5}
        strokeDasharray="2 3"
      />
      {/* Eje Y — ticks + labels */}
      {yTicks.map((v, i) => (
        <G key={`y-${i}`}>
          <Line
            x1={PAD_LEFT}
            y1={yScale(v)}
            x2={PAD_LEFT + innerW}
            y2={yScale(v)}
            stroke={colors.hairline}
            strokeWidth={0.25}
          />
          <SvgText
            x={PAD_LEFT - 6}
            y={yScale(v) + 3}
            style={tickLabelStyle}
            fill={colors.muted}
            textAnchor="end"
          >
            {v < 1 ? `$${(v * 1000).toFixed(0)}k` : `$${v.toFixed(1)}M`}
          </SvgText>
        </G>
      ))}
      {/* Eje X — ticks (en años) */}
      {xTicks.map((t, i) => (
        <G key={`x-${i}`}>
          <Line
            x1={xScale(t)}
            y1={PAD_TOP + innerH}
            x2={xScale(t)}
            y2={PAD_TOP + innerH + 3}
            stroke={colors.muted}
            strokeWidth={0.5}
          />
          <SvgText
            x={xScale(t)}
            y={PAD_TOP + innerH + 13}
            style={tickLabelStyle}
            fill={colors.muted}
            textAnchor="middle"
          >
            {(t / 12).toFixed(0)}y
          </SvgText>
        </G>
      ))}
    </Svg>
  );
}

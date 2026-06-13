/**
 * DrawdownPanel — curva de drawdown del portafolio + stats #30.
 *
 * Issue #30 + extensión de #28. Cubre la pregunta "¿qué tan dolorosos
 * son los baches?" con dos vistas:
 *   - Stats tiles: max drawdown mediano y p95, nominal y real
 *   - Underwater curve: drawdown(t) mediano + banda p95 a lo largo del
 *     horizonte de simulación
 *
 * Math: ver computeDrawdownStats en src/domain/riskMetrics.ts. Para cada
 * sim s computa el path de drawdown
 *   dd[s][t] = (peak[s][0..t] - aumPath[s][t]) / peak[s][0..t]
 * y luego cross-sim percentiles per t (mediana y p95).
 *
 * Drawdown convención del chart: graficado como número NEGATIVO (estilo
 * "underwater equity curve") — Y va de un mínimo negativo (más doloroso)
 * hasta 0 (sin drawdown). Así el chart "se sumerge" cuando hay caídas.
 *
 * Toggle Nominal/Real: el chart y los stats se computan sobre aumPath o
 * aumPathReal según el modo. La inflación añade típicamente 1-3pp al
 * drawdown real (los baches reales son MÁS profundos porque el poder
 * adquisitivo no recupera tan rápido como el nominal).
 */
import { useMemo, useState } from 'react';
import {
  Area,
  ComposedChart,
  CartesianGrid,
  Line,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { ArenaJobOutput } from '../workers/arena.worker';
import type { CaseStudyConfig } from '../state/caseStudyStore';
import { computeDrawdownStats } from '../domain/riskMetrics';

function fmtPct(decimal: number, digits = 1): string {
  return `${(decimal * 100).toFixed(digits)}%`;
}

function StatTile({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'warn';
}) {
  const valueClass =
    tone === 'warn'
      ? 'text-orange-700 dark:text-orange-400'
      : 'text-mercantil-ink dark:text-mercantil-dark-ink';
  return (
    <div className="rounded border border-mercantil-line dark:border-mercantil-dark-line p-2.5 bg-mercantil-mist/50 dark:bg-mercantil-dark-bg/30">
      <div className="text-[10px] uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate mb-0.5">
        {label}
      </div>
      <div className={`text-lg font-semibold tabular-nums ${valueClass}`}>{value}</div>
      {hint && (
        <div className="text-[10px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 mt-0.5">
          {hint}
        </div>
      )}
    </div>
  );
}

type Mode = 'nominal' | 'real';

type DDPoint = {
  /** Mes desde el inicio (0..H). */
  monthIdx: number;
  /** Año desde el inicio (decimal, 0..horizonYears). */
  yearIdx: number;
  /** Drawdown mediano en signo NEGATIVO para el "underwater" feel. */
  ddMedNeg: number;
  /** Drawdown p95 (peor 5%) en signo negativo. */
  ddP95Neg: number;
};

/** Custom tooltip — muestra magnitudes en valor absoluto y con %. */
function DDTooltip(props: {
  active?: boolean;
  payload?: Array<{ payload: DDPoint }>;
}) {
  if (!props.active || !props.payload || props.payload.length === 0) return null;
  const p = props.payload[0].payload;
  return (
    <div className="rounded border border-mercantil-line bg-white dark:bg-mercantil-dark-panel dark:border-mercantil-dark-line shadow-md px-2.5 py-1.5 text-xs">
      <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink mb-0.5 tabular-nums">
        Año {p.yearIdx.toFixed(1)} · mes {p.monthIdx}
      </div>
      <div className="flex items-center gap-1.5 text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#003566' }} />
        DD mediano: <strong>{fmtPct(-p.ddMedNeg)}</strong>
      </div>
      <div className="flex items-center gap-1.5 text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
        <span className="inline-block w-2 h-2 rounded-sm" style={{ backgroundColor: '#E97031' }} />
        DD p95 (peor 5%): <strong>{fmtPct(-p.ddP95Neg)}</strong>
      </div>
    </div>
  );
}

export default function DrawdownPanel({
  result,
  config,
}: {
  result: ArenaJobOutput;
  config: CaseStudyConfig;
}) {
  const [mode, setMode] = useState<Mode>('nominal');
  const horizonMonths = config.horizonMonths;
  const horizonYears = horizonMonths / 12;
  const nSims = config.nSims;

  // Stats para ambos modos — los 4 tiles muestran nominal y real lado a lado
  // siempre. El chart respeta el toggle.
  const ddNominal = useMemo(
    () => computeDrawdownStats(result.aumPath, nSims, horizonMonths),
    [result.aumPath, nSims, horizonMonths],
  );
  const ddReal = useMemo(
    () => computeDrawdownStats(result.aumPathReal, nSims, horizonMonths),
    [result.aumPathReal, nSims, horizonMonths],
  );

  // Data para el chart según modo seleccionado
  const chartData: DDPoint[] = useMemo(() => {
    const stats = mode === 'real' ? ddReal : ddNominal;
    const Hp1 = stats.ddMed.length;
    const data = new Array<DDPoint>(Hp1);
    for (let t = 0; t < Hp1; t++) {
      data[t] = {
        monthIdx: t,
        yearIdx: t / 12,
        ddMedNeg: -stats.ddMed[t],
        ddP95Neg: -stats.ddP95[t],
      };
    }
    return data;
  }, [mode, ddNominal, ddReal]);

  // Y-axis: dynamic — desde el min del p95 (peor punto) hasta 0, con 10% padding
  const yMin = useMemo(() => {
    let m = 0;
    for (const p of chartData) if (p.ddP95Neg < m) m = p.ddP95Neg;
    return Math.floor((m * 1.1) * 100) / 100; // round down to next %
  }, [chartData]);

  // X-axis ticks: cada año entero
  const xTicks = useMemo(() => {
    const out: number[] = [];
    for (let y = 0; y <= horizonYears; y++) out.push(y);
    return out;
  }, [horizonYears]);

  const headlineNominal = ddNominal.maxDDP95;
  const headlineReal = ddReal.maxDDP95;
  // Highlight tone si el max DD p95 supera el 20% (umbral cualitativo de
  // "doloroso pero recuperable"); >30% es "severo".
  const toneFor = (dd: number): 'default' | 'warn' => (dd > 0.20 ? 'warn' : 'default');

  return (
    <div
      data-testid="drawdown-panel"
      className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5"
    >
      <div className="flex items-baseline justify-between gap-3 mb-1 flex-wrap">
        <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
          Drawdown — el dolor de los baches
        </h3>
        <span className="text-[11px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
          {nSims.toLocaleString()} sims · horizonte {horizonYears.toFixed(0)}y
        </span>
      </div>
      <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
        ¿Qué tan profundas son las caídas del portafolio respecto a su peak previo? Mientras el fan chart muestra
        "a dónde va", esta vista muestra "qué tan duros son los baches del camino". Drawdown = caída desde el peak
        previo — recupera cuando el path vuelve a superarlo.
      </p>

      {/* Stats tiles — 4 boxes nominales y reales, mediana y p95 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatTile
          label="Max DD mediano · nominal"
          value={fmtPct(ddNominal.maxDDMed)}
          hint="caso típico"
        />
        <StatTile
          label="Max DD p95 · nominal"
          value={fmtPct(headlineNominal)}
          hint="5% peor escenario"
          tone={toneFor(headlineNominal)}
        />
        <StatTile
          label="Max DD mediano · real"
          value={fmtPct(ddReal.maxDDMed)}
          hint="poder adquisitivo"
        />
        <StatTile
          label="Max DD p95 · real"
          value={fmtPct(headlineReal)}
          hint="5% peor real"
          tone={toneFor(headlineReal)}
        />
      </div>

      {/* Toggle Nominal/Real */}
      <div className="inline-flex rounded-full border border-mercantil-line dark:border-mercantil-dark-line p-0.5 bg-mercantil-mist dark:bg-mercantil-dark-bg/40 mb-3">
        {(['nominal', 'real'] as Mode[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={
              mode === m
                ? 'px-4 py-1.5 text-xs font-semibold rounded-full bg-mercantil-orange text-white shadow-sm'
                : 'px-4 py-1.5 text-xs font-medium rounded-full text-mercantil-slate dark:text-mercantil-dark-slate hover:text-mercantil-orange'
            }
          >
            {m === 'nominal' ? 'Nominal' : 'Real (post-inflación)'}
          </button>
        ))}
      </div>

      {/* Underwater curve */}
      <div className="w-full overflow-x-auto">
        <ComposedChart
          width={920}
          height={340}
          data={chartData}
          margin={{ top: 16, right: 28, bottom: 36, left: 50 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EF" />
          <XAxis
            type="number"
            dataKey="yearIdx"
            domain={[0, horizonYears]}
            ticks={xTicks}
            tickFormatter={(v) => `${v}y`}
            fontSize={11}
            label={{ value: 'Años desde inicio', position: 'bottom', offset: 8, fontSize: 11 }}
          />
          <YAxis
            domain={[yMin, 0]}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            fontSize={11}
            label={{
              value: 'Drawdown',
              angle: -90,
              position: 'left',
              offset: 20,
              fontSize: 11,
            }}
          />
          <ReferenceLine y={0} stroke="#9CA3AF" strokeWidth={1} />
          {/* Área de p95 (peor 5% de los sims) — naranja translúcida */}
          <Area
            type="monotone"
            dataKey="ddP95Neg"
            stroke="#E97031"
            strokeWidth={1.5}
            fill="#E97031"
            fillOpacity={0.18}
            isAnimationActive={false}
          />
          {/* Mediana — línea sólida navy */}
          <Line
            type="monotone"
            dataKey="ddMedNeg"
            stroke="#003566"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          <Tooltip content={<DDTooltip />} cursor={{ stroke: '#9CA3AF', strokeDasharray: '3 3' }} />
        </ComposedChart>
      </div>

      {/* Leyenda simple */}
      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-0.5 bg-mercantil-navy" />
          <span>Drawdown mediano (caso típico)</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-4 h-2 bg-mercantil-orange/30 border-t border-mercantil-orange" />
          <span>p95 (peor 5%)</span>
        </div>
      </div>

      <p className="mt-3 text-[10.5px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
        Drawdown computado mes a mes vs el peak previo del path. El <strong>max DD</strong> es la caída más
        profunda observada en cada sim; la mediana y p95 son cross-sim. El gap entre nominal y real refleja el
        impacto de la inflación en el poder adquisitivo —
        en el caso real, los baches son más duros porque la inflación erosiona el peak previo mientras el path
        intenta recuperar.
      </p>
    </div>
  );
}

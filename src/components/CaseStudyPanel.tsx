/**
 * CaseStudyPanel — UI del orquestador end-to-end (caso TBSC y variantes).
 *
 * Inputs editables:
 *   - Market: initialAumUsd, horizonMonths, nSims, seed
 *   - Allocation: bullet/equity/cash (suman 1)
 *   - Flujos: inflow base anual + growth
 *   - Préstamo: toggle + trigger month + amount % + term
 *   - Avanzados (collapsible): spread, eqty bands, thresholds, rollover toggle
 *
 * Outputs:
 *   - Stats card (ann_med, p5/p95, final_aum_med, prob_pos)
 *   - Regime breakdown
 *   - Wealth fan chart (net wealth percentiles)
 *   - Sleeve evolution stacked area (medianas por sleeve)
 *
 * Worker arena.worker.ts ejecuta runBootstrap + buildArenaMarket + runArena.
 */
import { useCallback, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useArenaWorker } from '../hooks/useArenaWorker';
import {
  configToJobInput,
  DEFAULT_CASE_CONFIG,
  useCaseStudyStore,
} from '../state/caseStudyStore';

// =====================================================================
// HELPERS
// =====================================================================

function pctPath(
  arr: Float64Array,
  nSims: number,
  Hp1: number,
  ps: readonly number[],
): number[][] {
  const out: number[][] = [];
  const col = new Float64Array(nSims);
  for (let t = 0; t < Hp1; t++) {
    for (let s = 0; s < nSims; s++) col[s] = arr[s * Hp1 + t];
    const sorted = Float64Array.from(col);
    sorted.sort();
    out.push(ps.map((p) => sorted[Math.floor(p * (nSims - 1))]));
  }
  return out;
}

function sleeveMedians(
  sleevePath: Float64Array,
  nSims: number,
  Hp1: number,
): { bullets: number[]; equity: number[]; cash: number[] } {
  const bullets: number[] = [];
  const equity: number[] = [];
  const cash: number[] = [];
  const colB = new Float64Array(nSims);
  const colE = new Float64Array(nSims);
  const colC = new Float64Array(nSims);
  for (let t = 0; t < Hp1; t++) {
    for (let s = 0; s < nSims; s++) {
      const off = s * Hp1 * 3 + t * 3;
      colB[s] = sleevePath[off + 0];
      colE[s] = sleevePath[off + 1];
      colC[s] = sleevePath[off + 2];
    }
    colB.sort();
    colE.sort();
    colC.sort();
    const m = Math.floor(0.5 * (nSims - 1));
    bullets.push(colB[m]);
    equity.push(colE[m]);
    cash.push(colC[m]);
  }
  return { bullets, equity, cash };
}

function fmtMoney(usd: number): string {
  if (usd >= 1e6) return `$${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `$${(usd / 1e3).toFixed(0)}k`;
  return `$${usd.toFixed(0)}`;
}

function fmtPct(decimal: number, digits = 2): string {
  return `${(decimal * 100).toFixed(digits)}%`;
}

// =====================================================================
// INPUT COMPONENTS
// =====================================================================

type NumInputProps = {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
  min?: number;
  max?: number;
  suffix?: string;
  hint?: string;
};

function NumInput({ label, value, onChange, step, min, max, suffix, hint }: NumInputProps) {
  return (
    <label className="flex flex-col text-xs">
      <span className="font-medium text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
        {label}
        {hint && (
          <span className="ml-1 text-mercantil-slate/60 dark:text-mercantil-dark-slate/60 font-normal">
            ({hint})
          </span>
        )}
      </span>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={Number.isFinite(value) ? value : 0}
          step={step ?? 1}
          min={min}
          max={max}
          onChange={(e) => {
            const v = parseFloat(e.target.value);
            if (Number.isFinite(v)) onChange(v);
          }}
          className="flex-1 px-2 py-1 rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink text-sm"
        />
        {suffix && (
          <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
            {suffix}
          </span>
        )}
      </div>
    </label>
  );
}

// =====================================================================
// MAIN COMPONENT
// =====================================================================

export default function CaseStudyPanel() {
  const config = useCaseStudyStore((s) => s.config);
  const setConfig = useCaseStudyStore((s) => s.setConfig);
  const setThreshold = useCaseStudyStore((s) => s.setThreshold);
  const resetConfig = useCaseStudyStore((s) => s.resetConfig);
  const status = useCaseStudyStore((s) => s.status);
  const result = useCaseStudyStore((s) => s.result);
  const error = useCaseStudyStore((s) => s.error);
  const setStatus = useCaseStudyStore((s) => s.setStatus);
  const setResult = useCaseStudyStore((s) => s.setResult);
  const setError = useCaseStudyStore((s) => s.setError);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const worker = useArenaWorker();

  // ---- Validación de allocation ----
  const allocSum = config.bulletTotalPct + config.equityPct + config.cashPct;
  const allocValid = Math.abs(allocSum - 1) < 1e-6;

  const handleRun = useCallback(async () => {
    setStatus('running');
    try {
      const out = await worker.run(configToJobInput(config));
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [config, worker, setStatus, setResult, setError]);

  // ---- Chart data (memo: solo recomputa cuando cambia result) ----
  const wealthChartData = useMemo(() => {
    if (!result) return [];
    const { nSims, horizonMonths } = result.meta;
    const Hp1 = horizonMonths + 1;
    const ps = [0.05, 0.25, 0.5, 0.75, 0.95];
    const netPct = pctPath(result.netWealthPath, nSims, Hp1, ps);
    const data: { month: number; p5: number; p25: number; p50: number; p75: number; p95: number }[] = [];
    for (let t = 0; t < Hp1; t++) {
      data.push({
        month: t,
        p5: netPct[t][0] / 1e6,
        p25: netPct[t][1] / 1e6,
        p50: netPct[t][2] / 1e6,
        p75: netPct[t][3] / 1e6,
        p95: netPct[t][4] / 1e6,
      });
    }
    return data;
  }, [result]);

  const sleeveChartData = useMemo(() => {
    if (!result) return [];
    const { nSims, horizonMonths } = result.meta;
    const Hp1 = horizonMonths + 1;
    const m = sleeveMedians(result.sleevePath, nSims, Hp1);
    return m.bullets.map((b, t) => ({
      month: t,
      bullets: b / 1e6,
      equity: m.equity[t] / 1e6,
      cash: m.cash[t] / 1e6,
    }));
  }, [result]);

  const totalEvents = result
    ? result.regimeCounts.A + result.regimeCounts.B + result.regimeCounts.C
    : 0;

  return (
    <div className="space-y-6">
      {/* ============== INPUTS ============== */}
      <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5 space-y-5">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">
            Caso de Estudio
          </h2>
          <button
            onClick={resetConfig}
            className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate hover:text-mercantil-orange"
          >
            Reset a defaults
          </button>
        </div>

        {/* --- Market dimensions --- */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
            Mercado
          </legend>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <NumInput
              label="AUM inicial"
              value={config.initialAumUsd}
              onChange={(v) => setConfig({ initialAumUsd: v })}
              step={100_000}
              min={100_000}
              suffix="USD"
            />
            <NumInput
              label="Horizonte"
              value={config.horizonMonths}
              onChange={(v) => setConfig({ horizonMonths: Math.round(v) })}
              step={12}
              min={12}
              max={360}
              suffix="m"
              hint={`${(config.horizonMonths / 12).toFixed(0)}y`}
            />
            <NumInput
              label="Simulaciones"
              value={config.nSims}
              onChange={(v) => setConfig({ nSims: Math.round(v) })}
              step={100}
              min={50}
              max={10000}
            />
            <NumInput
              label="Seed"
              value={config.seed}
              onChange={(v) => setConfig({ seed: Math.round(v) })}
              step={1}
              min={0}
            />
          </div>
        </fieldset>

        {/* --- Allocation --- */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
            Allocation estratégico (deben sumar 100%)
          </legend>
          <div className="grid grid-cols-3 gap-3">
            <NumInput
              label="Ladder (bullets)"
              value={config.bulletTotalPct * 100}
              onChange={(v) => setConfig({ bulletTotalPct: v / 100 })}
              step={1}
              min={0}
              max={100}
              suffix="%"
            />
            <NumInput
              label="Equity (USMV+SCHD)"
              value={config.equityPct * 100}
              onChange={(v) => setConfig({ equityPct: v / 100 })}
              step={1}
              min={0}
              max={100}
              suffix="%"
            />
            <NumInput
              label="Cash (BIL)"
              value={config.cashPct * 100}
              onChange={(v) => setConfig({ cashPct: v / 100 })}
              step={1}
              min={0}
              max={100}
              suffix="%"
            />
          </div>
          {!allocValid && (
            <p className="text-xs text-red-600 dark:text-red-400">
              Suma actual: {(allocSum * 100).toFixed(1)}% (debe ser 100%)
            </p>
          )}
        </fieldset>

        {/* --- Flows --- */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
            Flujos (aportes anuales del endowment)
          </legend>
          <div className="grid grid-cols-2 gap-3">
            <NumInput
              label="Inflow base"
              value={config.inflowBaseAnnual}
              onChange={(v) => setConfig({ inflowBaseAnnual: v })}
              step={10_000}
              min={0}
              suffix="USD/yr"
            />
            <NumInput
              label="Crecimiento anual"
              value={config.inflowGrowth * 100}
              onChange={(v) => setConfig({ inflowGrowth: v / 100 })}
              step={0.5}
              min={0}
              max={20}
              suffix="%/yr"
            />
          </div>
        </fieldset>

        {/* --- Loan --- */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.loanEnabled}
                onChange={(e) => setConfig({ loanEnabled: e.target.checked })}
                className="accent-mercantil-orange h-3.5 w-3.5"
              />
              Préstamo bancario (opcional)
            </label>
          </legend>
          {config.loanEnabled && (
            <div className="grid grid-cols-3 gap-3 pl-5">
              <NumInput
                label="Mes de disparo"
                value={config.loanTriggerMonth}
                onChange={(v) => setConfig({ loanTriggerMonth: Math.round(v) })}
                step={6}
                min={0}
                max={config.horizonMonths - 1}
                hint={`año ${(config.loanTriggerMonth / 12).toFixed(1)}`}
              />
              <NumInput
                label="Monto % AUM"
                value={config.loanAmountPctAum * 100}
                onChange={(v) => setConfig({ loanAmountPctAum: v / 100 })}
                step={1}
                min={0}
                max={30}
                suffix="%"
              />
              <NumInput
                label="Plazo"
                value={config.loanTermMonths}
                onChange={(v) => setConfig({ loanTermMonths: Math.round(v) })}
                step={6}
                min={6}
                max={120}
                suffix="m"
              />
            </div>
          )}
        </fieldset>

        {/* --- Advanced --- */}
        <div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate hover:text-mercantil-orange"
          >
            {showAdvanced ? '▼' : '▶'} Avanzado (spread, banda equity, thresholds rollover)
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3 border-l-2 border-mercantil-line dark:border-mercantil-dark-line pl-4">
              <div className="grid grid-cols-3 gap-3">
                <NumInput
                  label="Spread bullets"
                  value={config.initialSpread * 10000}
                  onChange={(v) => setConfig({ initialSpread: v / 10000 })}
                  step={5}
                  min={0}
                  max={500}
                  suffix="bp"
                  hint="sobre treasury"
                />
                <NumInput
                  label="Equity min"
                  value={config.eqtyMin * 100}
                  onChange={(v) => setConfig({ eqtyMin: v / 100 })}
                  step={5}
                  min={0}
                  max={100}
                  suffix="%"
                />
                <NumInput
                  label="Equity max"
                  value={config.eqtyMax * 100}
                  onChange={(v) => setConfig({ eqtyMax: v / 100 })}
                  step={5}
                  min={0}
                  max={100}
                  suffix="%"
                />
              </div>
              <div className="grid grid-cols-3 gap-3 md:grid-cols-5">
                <NumInput
                  label="θ_high"
                  value={config.thresholds.thetaHigh * 100}
                  onChange={(v) => setThreshold('thetaHigh', v / 100)}
                  step={0.1}
                  suffix="%"
                  hint="TNX alta"
                />
                <NumInput
                  label="θ_low"
                  value={config.thresholds.thetaLow * 100}
                  onChange={(v) => setThreshold('thetaLow', v / 100)}
                  step={0.1}
                  suffix="%"
                  hint="TNX baja"
                />
                <NumInput
                  label="θ_steep"
                  value={config.thresholds.thetaSteep * 10000}
                  onChange={(v) => setThreshold('thetaSteep', v / 10000)}
                  step={5}
                  suffix="bp"
                />
                <NumInput
                  label="θ_flat"
                  value={config.thresholds.thetaFlat * 10000}
                  onChange={(v) => setThreshold('thetaFlat', v / 10000)}
                  step={5}
                  suffix="bp"
                />
                <NumInput
                  label="X→equity"
                  value={config.thresholds.xToEquity * 100}
                  onChange={(v) => setThreshold('xToEquity', v / 100)}
                  step={5}
                  min={0}
                  max={100}
                  suffix="%"
                  hint="regimen B"
                />
              </div>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={config.rolloverEnabled}
                  onChange={(e) => setConfig({ rolloverEnabled: e.target.checked })}
                  className="accent-mercantil-orange h-3.5 w-3.5"
                />
                <span>Rollover táctico habilitado</span>
                <span className="text-mercantil-slate/60 dark:text-mercantil-dark-slate/60">
                  ({!config.rolloverEnabled ? 'buy-and-hold' : 'A/B/C en vencimientos'})
                </span>
              </label>
            </div>
          )}
        </div>

        {/* --- Run button --- */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
            Defaults: TBSC (5M, 10y, ladder iBonds + 25 extensiones, USMV+SCHD, BIL).
          </div>
          <button
            onClick={handleRun}
            disabled={!allocValid || status === 'running'}
            className="px-6 py-2 rounded bg-mercantil-orange text-white text-sm font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-mercantil-orange/90 transition-colors"
          >
            {status === 'running' ? 'Simulando…' : 'Correr simulación'}
          </button>
        </div>

        {error && (
          <div className="mt-2 p-3 rounded bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-800 dark:text-red-200">
            Error: {error}
          </div>
        )}
      </div>

      {/* ============== RESULTS ============== */}
      {result && (
        <div className="space-y-4">
          {/* Stats card */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-3">
              Stats finales (sobre {result.meta.nSims} simulaciones)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <StatBox label="Retorno anual mediano" value={fmtPct(result.stats.annNetMed)} />
              <StatBox label="Anual p5" value={fmtPct(result.stats.annNetP5)} />
              <StatBox label="Anual p95" value={fmtPct(result.stats.annNetP95)} />
              <StatBox label="Prob > 0" value={fmtPct(result.stats.probPos, 0)} />
              <StatBox label="AUM final mediano" value={fmtMoney(result.stats.finalAumMed)} />
              <StatBox label="Net wealth mediano" value={fmtMoney(result.stats.finalNetMed)} />
            </div>
          </div>

          {/* Regime + loan breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
              <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-3">
                Rollover: regímenes ({totalEvents} eventos × sim)
              </h3>
              <div className="space-y-2">
                <RegimeBar label="A (tasas altas + slope steep)" count={result.regimeCounts.A} total={totalEvents} colorClass="bg-emerald-500" />
                <RegimeBar label="B (tasas bajas o curva flat)" count={result.regimeCounts.B} total={totalEvents} colorClass="bg-amber-500" />
                <RegimeBar label="C (zona neutral)" count={result.regimeCounts.C} total={totalEvents} colorClass="bg-mercantil-navy" />
              </div>
            </div>
            <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
              <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-3">
                Préstamo: costos & ventas forzadas (medianas)
              </h3>
              <div className="space-y-2 text-sm">
                <LoanRow label="Interés total pagado" value={fmtMoney(result.stats.loanCumInterestMed)} />
                <LoanRow label="Ventas forzadas equity" value={fmtMoney(result.stats.forcedEquityMed)} />
                <LoanRow label="Ventas forzadas bullet" value={fmtMoney(result.stats.forcedBulletMed)} />
                <LoanRow label="Shortfall acumulado" value={fmtMoney(result.stats.loanShortfallMed)} />
              </div>
            </div>
          </div>

          {/* Wealth fan chart */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-3">
              Net wealth path — percentiles ($ millones)
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={wealthChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    label={{ value: 'Mes', position: 'insideBottom', offset: -2 }}
                    tickFormatter={(v: number) => `${(v / 12).toFixed(0)}y`}
                  />
                  <YAxis label={{ value: '$M', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    formatter={(v) => `$${(typeof v === 'number' ? v : 0).toFixed(2)}M`}
                    labelFormatter={(v) => `Mes ${v} (año ${(typeof v === 'number' ? v / 12 : 0).toFixed(1)})`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="p95" stackId="bands" stroke="none" fill="#003566" fillOpacity={0.1} name="p5-p95 (90%)" />
                  <Area type="monotone" dataKey="p5" stackId="bands2" stroke="none" fill="#003566" fillOpacity={0.1} />
                  <Area type="monotone" dataKey="p75" stackId="bands3" stroke="none" fill="#003566" fillOpacity={0.25} name="p25-p75 (50%)" />
                  <Area type="monotone" dataKey="p25" stackId="bands4" stroke="none" fill="#003566" fillOpacity={0.25} />
                  <Line type="monotone" dataKey="p50" stroke="#F58220" strokeWidth={2} dot={false} name="Mediana" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Sleeve evolution */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-3">
              Evolución de sleeves — medianas ($ millones)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sleeveChartData}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    tickFormatter={(v: number) => `${(v / 12).toFixed(0)}y`}
                  />
                  <YAxis label={{ value: '$M', angle: -90, position: 'insideLeft' }} />
                  <Tooltip
                    formatter={(v) => `$${(typeof v === 'number' ? v : 0).toFixed(2)}M`}
                    labelFormatter={(v) => `Mes ${typeof v === 'number' ? v : 0}`}
                  />
                  <Legend />
                  <Area type="monotone" dataKey="bullets" stackId="1" stroke="#003566" fill="#003566" fillOpacity={0.7} name="Bullets" />
                  <Area type="monotone" dataKey="equity" stackId="1" stroke="#F58220" fill="#F58220" fillOpacity={0.7} name="Equity" />
                  <Area type="monotone" dataKey="cash" stackId="1" stroke="#888" fill="#888" fillOpacity={0.5} name="Cash" />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance metadata */}
          <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate text-center">
            Wall-clock: bootstrap {result.meta.elapsedBootstrapMs.toFixed(0)}ms +{' '}
            arena {result.meta.elapsedArenaMs.toFixed(0)}ms. Estrategia: ladder iBonds
            + tactical rollover{config.rolloverEnabled ? '' : ' (BH)'}{config.loanEnabled ? ' + loan' : ''}.
          </div>
        </div>
      )}
    </div>
  );
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate uppercase tracking-wider">
        {label}
      </div>
      <div className="text-lg font-semibold text-mercantil-ink dark:text-mercantil-dark-ink mt-0.5">
        {value}
      </div>
    </div>
  );
}

function RegimeBar({ label, count, total, colorClass }: { label: string; count: number; total: number; colorClass: string }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-mercantil-ink dark:text-mercantil-dark-ink">{label}</span>
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">{count.toLocaleString()} ({pct.toFixed(1)}%)</span>
      </div>
      <div className="h-2 bg-mercantil-line dark:bg-mercantil-dark-line rounded overflow-hidden">
        <div className={`h-full ${colorClass}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function LoanRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-mercantil-slate dark:text-mercantil-dark-slate">{label}</span>
      <span className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink">{value}</span>
    </div>
  );
}

// Suprime warning de import sin usar (DEFAULT_CASE_CONFIG es útil para tests/exports futuros)
export const _DEFAULT_REF = DEFAULT_CASE_CONFIG;

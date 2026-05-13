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
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { computeMonthlyInflow } from '../domain/cashflow';
import RangeSlider from './RangeSlider';
import { useArenaWorker } from '../hooks/useArenaWorker';
import {
  configToJobInput,
  DEFAULT_CASE_CONFIG,
  useCaseStudyStore,
  type CaseStudyConfig,
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

  // Ventana temporal del fan chart — empieza en "Total" tras cada simulación.
  // Estado local (no en store) porque es transitorio: si el usuario cambia el
  // horizonte y vuelve a correr, queremos reset automático a Total.
  const [window, setWindow] = useState<{ startMonth: number; endMonth: number } | null>(null);
  useEffect(() => {
    if (result) {
      setWindow({ startMonth: 0, endMonth: result.meta.horizonMonths });
    }
  }, [result]);

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
  // Bands se guardan como tuplas [lower, upper] para que recharts pinte solo
  // el rango entre p5-p95 / p25-p75 (no desde 0 hasta el valor). Mismo patrón
  // que el FanChart original del Comparador A/B.
  //
  // `deposit`: serie temporal del baseline "solo ahorrar sin invertir". Arranca
  // en initialAUM y crece cada mes por el inflow correspondiente. NO es una
  // línea horizontal — es una piecewise-linear que sube con cada aporte. Con
  // growth=0 queda casi recta; con growth>0 los escalones se aceleran cada año.
  const wealthChartData = useMemo(() => {
    if (!result) return [];
    const { nSims, horizonMonths } = result.meta;
    const Hp1 = horizonMonths + 1;
    const ps = [0.05, 0.25, 0.5, 0.75, 0.95];
    const netPct = pctPath(result.netWealthPath, nSims, Hp1, ps);
    const data: {
      month: number;
      p50: number;
      band5095: [number, number];
      band2575: [number, number];
      deposit: number; // capital + aportes acumulados hasta el cierre del mes t
      // Para tooltip individual:
      p5: number;
      p25: number;
      p75: number;
      p95: number;
    }[] = [];
    let cumDepositUsd = result.stats.initialAum;
    for (let t = 0; t < Hp1; t++) {
      const p5 = netPct[t][0] / 1e6;
      const p25 = netPct[t][1] / 1e6;
      const p50 = netPct[t][2] / 1e6;
      const p75 = netPct[t][3] / 1e6;
      const p95 = netPct[t][4] / 1e6;
      data.push({
        month: t,
        p50,
        band5095: [p5, p95],
        band2575: [p25, p75],
        deposit: cumDepositUsd / 1e6,
        p5, p25, p75, p95,
      });
      // Inflow del mes t se acumula DESPUÉS de capturar el deposit del mes t,
      // así data[0].deposit = initial y data[1].deposit = initial + inflow_0.
      // Matchea el orden de cashflowStep en arena (inflow llega en step t).
      if (t < horizonMonths) {
        cumDepositUsd += computeMonthlyInflow(t, config.inflowBaseAnnual, config.inflowGrowth);
      }
    }
    return data;
  }, [result, config.inflowBaseAnnual, config.inflowGrowth]);

  // Referencia simple: capital inicial es la única línea horizontal del chart.
  const initialAumM = result ? result.stats.initialAum / 1e6 : 0;

  // Ticks anuales del X-axis. Si la ventana es corta (<24m) usamos cada 3m.
  const xTicks = useMemo(() => {
    if (!result || !window) return [];
    const len = window.endMonth - window.startMonth;
    const step = len <= 24 ? 3 : len <= 72 ? 12 : 24;
    const ticks: number[] = [];
    // Anclar al múltiplo de step más cercano DENTRO de la ventana
    const startTick = Math.ceil(window.startMonth / step) * step;
    for (let t = startTick; t <= window.endMonth; t += step) ticks.push(t);
    return ticks;
  }, [result, window]);

  // Y-domain DINÁMICO calculado solo sobre data dentro del window.
  // Incluye p5, p95 (bandas) y la serie deposit (aportes acumulados), además
  // de la ReferenceLine de capital inicial. Esto garantiza que toda la
  // información visible quede dentro del eje, sin importar la ventana elegida.
  const wealthYDomain = useMemo<[number, number]>(() => {
    if (!result || !window || wealthChartData.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const p of wealthChartData) {
      if (p.month < window.startMonth || p.month > window.endMonth) continue;
      if (p.p5 < min) min = p.p5;
      if (p.p95 > max) max = p.p95;
      if (p.deposit < min) min = p.deposit;
      if (p.deposit > max) max = p.deposit;
    }
    // Incluir capital inicial (horizontal) si cae dentro de la ventana
    if (initialAumM < min) min = initialAumM;
    if (initialAumM > max) max = initialAumM;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const range = max - min;
    const pad = range > 0 ? range * 0.05 : Math.abs(max) * 0.05 || 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [result, window, wealthChartData, initialAumM]);

  // Chips de período rápido. 15y y 20y solo se muestran si el horizonte de la
  // simulación los cubre. El chip "Total" queda al final con el horizonte exacto.
  const periodChips = useMemo(() => {
    if (!result) return [];
    const H = result.meta.horizonMonths;
    const base = [
      { label: '1y', months: 12 },
      { label: '3y', months: 36 },
      { label: '5y', months: 60 },
      { label: '10y', months: 120 },
      { label: '15y', months: 180 },
      { label: '20y', months: 240 },
    ].filter((c) => c.months <= H && c.months !== H);
    // El chip "Total" siempre va al final y representa el horizonte real
    base.push({ label: 'Total', months: H });
    return base;
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

          {/* Detalle de sleeves (collapsible) */}
          <SleevesDetailPanel config={config} />

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
            <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-1">
              Net wealth path — percentiles ($ millones)
            </h3>
            <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
              Línea naranja = mediana sobre las {result.meta.nSims} simulaciones. Bandas azules = 50% (p25–p75) y 90%
              (p5–p95) de los caminos posibles. La línea gris punteada es el capital inicial; la verde es capital + aportes
              acumulados (el piso de "solo ahorrar sin invertir"). La propuesta agrega valor si el camino mediano queda
              por encima de la verde.
            </p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={wealthChartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    type="number"
                    domain={window ? [window.startMonth, window.endMonth] : [0, result.meta.horizonMonths]}
                    allowDataOverflow
                    ticks={xTicks}
                    tickFormatter={(v: number) => {
                      const y = v / 12;
                      return Number.isInteger(y) ? `${y}y` : `${y.toFixed(1)}y`;
                    }}
                    fontSize={11}
                  />
                  <YAxis
                    width={64}
                    domain={wealthYDomain}
                    allowDataOverflow
                    tickFormatter={(v: number) => v < 1 ? `$${(v * 1000).toFixed(0)}k` : `$${v.toFixed(1)}M`}
                    fontSize={11}
                  />
                  <Tooltip
                    formatter={(v, name) => {
                      if (Array.isArray(v)) {
                        const [lo, hi] = v as [number, number];
                        return [`$${lo.toFixed(2)}M – $${hi.toFixed(2)}M`, name];
                      }
                      const n = typeof v === 'number' ? v : 0;
                      return [`$${n.toFixed(2)}M`, name];
                    }}
                    labelFormatter={(v) => {
                      const m = typeof v === 'number' ? v : 0;
                      return `Mes ${m} (año ${(m / 12).toFixed(1)})`;
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="line"
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />
                  {/* Bandas: dataKey tupla [lower, upper] → recharts pinta solo entre los 2 valores */}
                  <Area
                    type="monotone"
                    dataKey="band5095"
                    stroke="none"
                    fill="#003566"
                    fillOpacity={0.12}
                    name="p5–p95 (90%)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="band2575"
                    stroke="none"
                    fill="#003566"
                    fillOpacity={0.28}
                    name="p25–p75 (50%)"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="p50"
                    stroke="#F58220"
                    strokeWidth={2}
                    dot={false}
                    name="Mediana"
                    isAnimationActive={false}
                  />
                  {/* Serie deposit: capital inicial + aportes acumulados mes a mes.
                       Es una línea creciente (no horizontal) que arranca en el
                       capital y sube por cada inflow. */}
                  <Line
                    type="stepAfter"
                    dataKey="deposit"
                    stroke="#3a8a4e"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    dot={false}
                    name="Capital + aportes acumulados"
                    isAnimationActive={false}
                  />
                  {/* Capital inicial: única línea verdaderamente horizontal */}
                  <ReferenceLine
                    y={initialAumM}
                    stroke="#888"
                    strokeDasharray="2 4"
                    strokeWidth={1}
                    label={{ value: `Capital inicial`, position: 'insideTopLeft', fontSize: 10, fill: '#888' }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            {/* Window slider + chips (match FanChart original del Comparador A/B) */}
            {window && (
              <div className="mt-4 space-y-2">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                    Ventana: <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">mes {window.startMonth}–{window.endMonth}</strong>{' '}
                    (año {(window.startMonth / 12).toFixed(1)}–{(window.endMonth / 12).toFixed(1)}, {window.endMonth - window.startMonth} meses)
                  </div>
                  <div className="flex items-center gap-1 flex-wrap">
                    {periodChips.map((chip) => {
                      const active = window.startMonth === 0 && window.endMonth === chip.months;
                      return (
                        <button
                          key={chip.label}
                          onClick={() => setWindow({ startMonth: 0, endMonth: chip.months })}
                          className={`px-2.5 py-1 text-xs rounded border transition-colors ${
                            active
                              ? 'bg-mercantil-orange border-mercantil-orange text-white'
                              : 'bg-white dark:bg-mercantil-dark-panel border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate hover:border-mercantil-orange hover:text-mercantil-orange'
                          }`}
                        >
                          {chip.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <RangeSlider
                  min={0}
                  max={result.meta.horizonMonths}
                  start={window.startMonth}
                  end={window.endMonth}
                  minWindow={6}
                  onChange={(s, e) => setWindow({ startMonth: s, endMonth: e })}
                  formatValue={(v) => `m${v} (${(v / 12).toFixed(1)}y)`}
                />
              </div>
            )}

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
              <div className="p-3 rounded border border-mercantil-line dark:border-mercantil-dark-line">
                <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Lado izquierdo · corto plazo:</strong>{' '}
                las bandas son angostas. El riesgo dominante es <strong>volatilidad mark-to-market</strong> — drawdowns
                puntuales que la junta vería en el reporting trimestral.
              </div>
              <div className="p-3 rounded border border-mercantil-line dark:border-mercantil-dark-line">
                <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Lado derecho · largo plazo:</strong>{' '}
                las bandas se ensanchan pero el piso suele estar por encima de los aportes acumulados. El riesgo
                deja de ser volatilidad y pasa a ser <strong>no cumplir el objetivo</strong> por haber sido
                demasiado conservador.
              </div>
            </div>
          </div>

          {/* Sleeve evolution */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-3">
              Evolución de sleeves — medianas ($ millones)
            </h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={sleeveChartData} margin={{ top: 8, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis
                    dataKey="month"
                    type="number"
                    domain={window ? [window.startMonth, window.endMonth] : [0, result.meta.horizonMonths]}
                    allowDataOverflow
                    ticks={xTicks}
                    tickFormatter={(v: number) => {
                      const y = v / 12;
                      return Number.isInteger(y) ? `${y}y` : `${y.toFixed(1)}y`;
                    }}
                    fontSize={11}
                  />
                  <YAxis
                    width={64}
                    tickFormatter={(v: number) => v < 1 ? `$${(v * 1000).toFixed(0)}k` : `$${v.toFixed(1)}M`}
                    fontSize={11}
                  />
                  <Tooltip
                    formatter={(v, name) => {
                      const n = typeof v === 'number' ? v : 0;
                      return [`$${n.toFixed(2)}M`, name];
                    }}
                    labelFormatter={(v) => {
                      const m = typeof v === 'number' ? v : 0;
                      return `Mes ${m} (año ${(m / 12).toFixed(1)})`;
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    iconType="square"
                    wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                  />
                  <Area type="monotone" dataKey="bullets" stackId="1" stroke="#003566" fill="#003566" fillOpacity={0.7} name="Bullets" isAnimationActive={false} />
                  <Area type="monotone" dataKey="equity" stackId="1" stroke="#F58220" fill="#F58220" fillOpacity={0.7} name="Equity" isAnimationActive={false} />
                  <Area type="monotone" dataKey="cash" stackId="1" stroke="#888" fill="#888" fillOpacity={0.5} name="Cash" isAnimationActive={false} />
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

// =====================================================================
// SLEEVES DETAIL — explicación didáctica de los 3 sleeves del case study
// =====================================================================

function SleevesDetailPanel({ config }: { config: CaseStudyConfig }) {
  const bulletAumPct = (config.bulletTotalPct * 100).toFixed(0);
  const equityAumPct = (config.equityPct * 100).toFixed(0);
  const cashAumPct = (config.cashPct * 100).toFixed(0);
  const eqtyMin = (config.eqtyMin * 100).toFixed(0);
  const eqtyMax = (config.eqtyMax * 100).toFixed(0);
  const spreadBp = (config.initialSpread * 10000).toFixed(0);

  return (
    <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
      <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-1">
        Detalle de los sleeves
      </h3>
      <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
        Un <em>sleeve</em> es un subconjunto del portafolio con su propio mandato, regla operativa y benchmark.
        El caso de estudio usa 3 sleeves: <strong>Bullets</strong> (ladder de bonos), <strong>Equity</strong>{' '}
        (sleeve de acciones) y <strong>Cash</strong> (buffer de liquidez). Cada uno se opera con reglas distintas
        — los eventos del modelo (vencimientos, ventas forzadas por préstamo, rebalanceo) actúan a nivel sleeve,
        no a nivel ticker individual.
      </p>

      <div className="space-y-2">
        {/* SLEEVE BULLETS */}
        <details className="rounded border border-mercantil-line dark:border-mercantil-dark-line">
          <summary className="px-4 py-3 cursor-pointer flex items-center justify-between bg-mercantil-bg-soft/30">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#003566' }} />
              <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Sleeve Bullets</strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                {bulletAumPct}% del AUM · ladder iBonds corporativo IG
              </span>
            </span>
            <span className="text-xs text-mercantil-orange">click para detalle ▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <p>
              Escalera de 11 bullets investment-grade corporativos USD: 9 vintages reales 2026–2034
              (BlackRock iBonds UCITS USD Corp Term ETFs) + 2 sintéticos 2035S/2036S. Inicialización equal-weight
              (1/11 ≈ 9.1% del sleeve por bullet). Es el <strong>motor de carry estable</strong> del portafolio.
            </p>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Diversificación interna por plazo
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• <strong>Corto</strong> (&lt;3y) — 3 bullets ID26/27/28 → 27.3% del ladder, {(0.273 * config.bulletTotalPct * 100).toFixed(1)}% del AUM</li>
                <li>• <strong>Medio</strong> (3–6y) — 3 bullets ID29/30/31 → 27.3% del ladder, {(0.273 * config.bulletTotalPct * 100).toFixed(1)}% del AUM</li>
                <li>• <strong>Largo</strong> (6–9y) — 3 bullets ID32/33/34 → 27.3% del ladder, {(0.273 * config.bulletTotalPct * 100).toFixed(1)}% del AUM</li>
                <li>• <strong>Extra-largo</strong> (9–11y) — 2 sintéticos ID35S/36S → 18.2% del ladder, {(0.182 * config.bulletTotalPct * 100).toFixed(1)}% del AUM</li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Diversificación interna de crédito
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• <strong>Calidad crediticia</strong>: investment grade (rating BBB– o superior; promedio del índice ~A3/A-). Sin high yield, sin emerging corporate.</li>
                <li>• <strong>Multi-emisor</strong>: cada iBond UCITS replica un índice Bloomberg corporativo con ~200–400 emisores (financieros, industriales, healthcare, comunicaciones, utilities, consumo). No hay exposure significativa a un emisor único — el peso máximo por emisor es típicamente &lt;3%.</li>
                <li>• <strong>Riesgo de default</strong>: tasa histórica IG anual ~0.10–0.30% (depende del rating). En el peor año (2008–2009) los IG tocaron ~0.40%. Sobre 11 bullets × ~300 emisores ≈ 3.300 bonos individuales, el efecto de un default específico es muy pequeño (típicamente recovery ~40% → loss-given-default por default ~0.18% del bono afectado).</li>
                <li>• <strong>Spread modelado</strong>: {spreadBp} bp sobre la curva Treasury (configurable en panel Avanzado). Media histórica IG corp: ~110 bp; rango típico 70–250 bp; picos crisis: 400–600 bp.</li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Geografía
              </div>
              <p className="text-xs">
                100% deuda USD. Emisores diversificados globalmente: USA (~55%), Europa desarrollada (~25%),
                Reino Unido (~8%), Canadá (~5%), Japón / resto Asia desarrollada (~7%). Todos con deuda emitida
                en USD (no hay riesgo cambiario operativo). No hay emerging market corporate.
              </p>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Duración y convexidad
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• Duración inicial por bullet ≈ 0.93 × maturity (regla IG corp). Rango: 0.6y (ID26 corto) a 9.9y (ID36S extra-largo).</li>
                <li>• <strong>Duración promedio del ladder</strong>: ~5.0–5.5y al inicio. Decrece monótonamente con el tiempo (cada bullet va perdiendo duration mensual).</li>
                <li>• <strong>Convexidad</strong>: aprox. duration² + duration (aprox cuadrática del coupon-paying bond). Convexidad positiva = el bullet gana más en una caída de tasas que lo que pierde en una subida equivalente. Importa más en bullets largos.</li>
                <li>• <strong>Roll-down</strong>: cuando la curva está positiva (TNX &gt; FVX &gt; IRX), cada bullet baja por la curva al envejecer → captura yield decreciente → ganancia "roll" adicional al carry. Es el motor de alpha del ladder en mercados normales.</li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Regla operativa al vencimiento
              </div>
              <p className="text-xs">
                Cada bullet vence en su fecha exacta y libera principal. Si <strong>rollover táctico</strong> está habilitado,
                ese principal se redistribuye según el régimen de tasas vigente (A/B/C) — destino primario: el siguiente bullet
                sintético (extensión natural de la escalera, default 25 extensiones a +1 año cada una). Si rollover está
                deshabilitado, el principal queda en cash (buy &amp; hold).
              </p>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Liquidez operativa
              </div>
              <p className="text-xs">
                Los iBonds UCITS son ETFs listados con liquidez intradía. Bid/ask típico: 5–15 bp en condiciones
                normales, hasta 50 bp en estrés. El modelo NO penaliza por transaction cost — asume liquidación
                clean al NAV.
              </p>
            </div>
          </div>
        </details>

        {/* SLEEVE EQUITY */}
        <details className="rounded border border-mercantil-line dark:border-mercantil-dark-line">
          <summary className="px-4 py-3 cursor-pointer flex items-center justify-between bg-mercantil-bg-soft/30">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#F58220' }} />
              <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Sleeve Equity</strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                {equityAumPct}% del AUM · 50% USMV + 50% SCHD · banda [{eqtyMin}%, {eqtyMax}%]
              </span>
            </span>
            <span className="text-xs text-mercantil-orange">click para detalle ▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <p>
              Sleeve <strong>defensivo de calidad</strong>: NO es un sleeve de crecimiento. La decisión fue priorizar
              downside protection sobre upside máximo, dado el horizonte y el riesgo reputacional para la junta de
              un drawdown grande en reporting trimestral.
            </p>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Composición: 2 ETFs
              </div>
              <ul className="text-xs space-y-1.5">
                <li>
                  <strong>USMV (50% del sleeve)</strong> — iShares MSCI USA Min Vol Factor ETF.
                  ~190 holdings seleccionados por optimización de volatilidad mínima sobre el universo MSCI USA.
                  Expense ratio 0.15%. AUM &gt; $30B. Bias hacia healthcare, consumer staples, comunicaciones.
                  Volatilidad histórica ~12% anual (vs ~15% del S&amp;P 500).
                </li>
                <li>
                  <strong>SCHD (50% del sleeve)</strong> — Schwab US Dividend Equity ETF.
                  ~100 holdings con ≥10 años de dividendos consecutivos, screen de calidad fundamental
                  (cash flow / debt, ROE, dividend growth). Expense ratio 0.06%. AUM &gt; $60B. Bias hacia
                  financieros, industriales, healthcare, energy. Yield ~3.5%.
                </li>
              </ul>
              <p className="text-xs mt-2 italic text-mercantil-slate dark:text-mercantil-dark-slate">
                Overlap USMV ∩ SCHD: ~25–30 holdings comunes (large cap defensivo + dividendo alto suelen coincidir).
                Eso amplifica el bias defensivo combinado.
              </p>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Diversificación interna (mix 50/50 combinado)
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• <strong>Holdings únicos</strong>: ~260 acciones distintas (USMV ~190 + SCHD ~100 − overlap ~30).</li>
                <li>• <strong>Peso máximo por acción</strong>: típicamente &lt;2% en USMV, &lt;5% en SCHD. Combinado: &lt;3% por nombre.</li>
                <li>• <strong>Sectores top</strong> (aproximado, varía trimestralmente): Healthcare 16%, Financieros 13%, Industriales 13%, Consumo Básico 12%, Tecnología 12%, Consumo Discrecional 9%, Comunicaciones 9%, Energía 6%, Utilities 5%, Materiales 4%, Real Estate 1%. <strong>Ningún sector excede 18%</strong>.</li>
                <li>• <strong>Capitalización</strong>: 100% large &amp; mid cap (no small caps). USMV permite mid; SCHD es predominantemente large cap.</li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Geografía
              </div>
              <p className="text-xs">
                <strong>100% Estados Unidos</strong> por construcción de ambos ETFs. Sin internacional desarrollado,
                sin emergentes. Es un sesgo deliberado: el universo USA tiene la mejor diversificación
                sectorial doméstica y la liquidez más profunda para los flujos del endowment. Si en una revisión
                futura la junta valora diversificación geográfica, se puede sustituir 30–50% del sleeve por ACWX
                (ex-US developed) o ACWI (global) sin tocar el resto del modelo.
              </p>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Riesgo y comportamiento histórico
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• <strong>Volatilidad anualizada</strong>: ~12% (vs 15% S&amp;P, 18% NASDAQ). Captura ~80–85% del upside del mercado en bull market y solo ~60% del downside en bear (asymmetry deseable).</li>
                <li>• <strong>Drawdown histórico peor</strong>: USMV en 2020 COVID: −22% (vs −34% S&amp;P). SCHD en 2022 bear: −16% (vs −19% S&amp;P).</li>
                <li>• <strong>Correlación con bullets IG</strong>: 0.2–0.4 (positiva pero baja). En crisis de 2008–2009 sube a 0.6 temporalmente.</li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Banda dura y rol en rollover táctico
              </div>
              <p className="text-xs">
                Banda dura configurada en <strong>[{eqtyMin}%, {eqtyMax}%]</strong> del AUM total.
                Si el AUM equity excede {eqtyMax}%, el rollover táctico recorta en eventos A. Si cae por debajo de
                {' '}{eqtyMin}%, no se vende — solo se compra cuando hay régimen B (tasas bajas / curva flat) y se
                aprovecha el principal vencido para reforzar la posición barata.
              </p>
            </div>
          </div>
        </details>

        {/* SLEEVE CASH */}
        <details className="rounded border border-mercantil-line dark:border-mercantil-dark-line">
          <summary className="px-4 py-3 cursor-pointer flex items-center justify-between bg-mercantil-bg-soft/30">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm" style={{ background: '#888' }} />
              <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Sleeve Cash</strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                {cashAumPct}% del AUM · BIL (T-Bills 1–3m) · target {(config.cashBandUpper * 100).toFixed(0)}%
              </span>
            </span>
            <span className="text-xs text-mercantil-orange">click para detalle ▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <p>
              <strong>Buffer de liquidez operativa</strong>. No es un sleeve de retorno — su rol es absorber
              flujos (inflows del endowment, cuotas del préstamo si está activado, exceso de rebalanceo) y
              servir de primera línea en la cascada de ventas forzadas.
            </p>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Composición
              </div>
              <p className="text-xs">
                <strong>100% BIL</strong> — SPDR Bloomberg 1-3 Month T-Bill ETF. Subyacente: T-Bills del Tesoro
                de USA con vencimiento entre 1 y 3 meses. Expense ratio 0.135%. AUM &gt; $40B. Liquidez intradía
                con bid/ask &lt;1 bp en condiciones normales.
              </p>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Riesgo de crédito
              </div>
              <p className="text-xs">
                <strong>Cero riesgo de crédito corporativo</strong>. Riesgo soberano US (AA+ S&amp;P, Aaa Moody's).
                Los T-Bills son obligaciones directas del Tesoro de USA — el activo libre-de-riesgo
                por excelencia. En el universo de productos financieros líquidos en USD, no hay nada con menor
                riesgo crediticio.
              </p>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Duración y sensibilidad a tasas
              </div>
              <p className="text-xs">
                <strong>Duración ~0.15 años (~2 meses)</strong>. Cambio de 100 bp en tasas cortas → cambio de
                ~0.15% en el precio del sleeve. Esencialmente insensible a tasas — el carry sigue la tasa del
                Fed Funds + ~5 bp.
              </p>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Rol operativo en el modelo
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• <strong>Primera línea en cascada de pago</strong>: cuando hay préstamo activo y se paga la cuota mensual, primero se vacía cash, después equity, después bullet corto.</li>
                <li>• <strong>Absorción de inflows</strong>: los $250k/yr del endowment entran como cash y se acumulan hasta superar la banda ({(config.cashBandUpper * 100).toFixed(0)}% del AUM total).</li>
                <li>• <strong>Trigger de rebalanceo</strong>: cuando cash share supera {(config.cashBandUpper * 100).toFixed(0)}%, el exceso se distribuye a bullets (proporcional al peso vivo de cada bullet) y a equity (según plan strategic 65/30/5). Esto mantiene la composición target sin operaciones discrecionales.</li>
                <li>• <strong>Margen de seguridad</strong>: en el escenario de préstamo + caída de mercados, el cash sleeve evita ventas forzadas inmediatas de bullets cuando hay un mes adverso.</li>
              </ul>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

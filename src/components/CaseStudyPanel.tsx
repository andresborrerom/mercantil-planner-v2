/**
 * CaseStudyPanel — UI del orquestador end-to-end del Caso de Estudio.
 * El cliente parametriza su propio caso desde el panel; el modelo del
 * primer entregable (TBSC, endowment colegial) sigue disponible como
 * config inicial via DEFAULT_CASE_CONFIG.
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
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { getYieldBounds } from '../domain/bootstrap';
import RangeSlider from './RangeSlider';
import EquityMixSelector from './EquityMixSelector';
import BulletMixSelector from './BulletMixSelector';
import RealAssetsMixSelector from './RealAssetsMixSelector';
import EstudioMedidaActions from './EstudioMedidaActions';
import { useEquityCatalogByTicker } from '../hooks/useEquityMeta';
import { useTTMPanel } from '../hooks/useTTMPanel';
import {
  computeAnnInflationInWindow,
  computeConditionalStats,
  evaluateInflationView,
  unconditionalInflationDistribution,
} from '../domain/inflationView';
import { useArenaWorker } from '../hooks/useArenaWorker';
import {
  configToJobInput,
  DEFAULT_CASE_CONFIG,
  MAX_SAVED_VARIANTS,
  useCaseStudyStore,
  type CaseStudyConfig,
  type SavedVariant,
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

/**
 * Versión de pctPath que opera SOLO sobre un subset de sims (matchedIndices).
 * Usada cuando hay conditioning activo — los percentiles condicionales se
 * computan sobre el subset que cumple la vista. Si subsetIndices es null o
 * length=nSims, equivale a pctPath sobre todas las sims.
 */
function pctPathSubset(
  arr: Float64Array,
  nSims: number,
  Hp1: number,
  ps: readonly number[],
  subsetIndices: Uint32Array | null,
): number[][] {
  if (subsetIndices === null) return pctPath(arr, nSims, Hp1, ps);
  const n = subsetIndices.length;
  if (n === 0) {
    // Sin sims condicionales: devolvemos NaN para todos los percentiles.
    // El caller decide si mostrar warning o data degradada.
    return Array.from({ length: Hp1 }, () => ps.map(() => NaN));
  }
  const out: number[][] = [];
  const col = new Float64Array(n);
  for (let t = 0; t < Hp1; t++) {
    for (let i = 0; i < n; i++) col[i] = arr[subsetIndices[i] * Hp1 + t];
    const sorted = Float64Array.from(col);
    sorted.sort();
    out.push(ps.map((p) => sorted[Math.floor(p * (n - 1))]));
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

// Props compartidos para los Tooltips de recharts: anclado arriba-izquierda
// del área del chart, fuente compacta. La pin posición evita que tape la
// data cuando el usuario mueve el cursor.
const TOOLTIP_PROPS = {
  position: { x: 12, y: 8 },
  wrapperStyle: { fontSize: '9.5px', pointerEvents: 'none' as const, zIndex: 50 },
  contentStyle: {
    padding: '5px 8px',
    fontSize: '9.5px',
    lineHeight: 1.3,
    borderRadius: 4,
    background: 'rgba(255, 255, 255, 0.96)',
    border: '1px solid #e5e7ef',
    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  },
  itemStyle: { padding: '1px 0', fontSize: '9.5px' },
  labelStyle: { fontWeight: 600, marginBottom: 2, fontSize: '10px' },
};

// =====================================================================
// AUTO-LABEL BUILDER PARA CORRIDAS GUARDADAS
// =====================================================================

/**
 * Construye un label descriptivo para auto-guardado de variantes.
 * Captura los DELTAS más relevantes vs el DEFAULT_CASE_CONFIG (allocation,
 * mix de equity/RF, préstamo, max ladder años). Si el config es idéntico
 * al default, devuelve "default". Timestamp del lado del caller.
 */
function buildAutoLabel(config: CaseStudyConfig, runNumber: number): string {
  const deltas: string[] = [];
  const def = DEFAULT_CASE_CONFIG;
  // Allocation: solo si distinto del 65/30/5
  if (
    Math.abs(config.bulletTotalPct - def.bulletTotalPct) > 1e-6 ||
    Math.abs(config.equityPct - def.equityPct) > 1e-6 ||
    Math.abs(config.cashPct - def.cashPct) > 1e-6
  ) {
    deltas.push(
      `${Math.round(config.bulletTotalPct * 100)}/${Math.round(config.equityPct * 100)}/${Math.round(config.cashPct * 100)}`,
    );
  }
  // HY mix activado
  const hyW = config.bulletMix.find((m) => m.ticker === 'GHYG')?.weight ?? 0;
  const igW = config.bulletMix.find((m) => m.ticker === 'iBonds')?.weight ?? 1;
  const totW = hyW + igW;
  if (totW > 0 && hyW / totW > 0.001) {
    deltas.push(`HY ${Math.round((hyW / totW) * 100)}%`);
  }
  // Max ladder años activado
  if (config.maxBulletYearsEnabled) {
    deltas.push(`max ladder ${config.maxBulletYears}y`);
  }
  // Préstamo o venta
  if (config.loanEnabled) {
    const verb = config.loanMethod === 'sell' ? 'vender' : 'préstamo';
    deltas.push(`${verb} ${Math.round(config.loanAmountPctAum * 100)}% mes ${config.loanTriggerMonth}`);
  }
  // Bucket bootstrap engine
  if (config.bulletReturnsEngine === 'bucket-bootstrap') {
    deltas.push('bucket bootstrap');
  }
  // Equity mix custom (distinto a USMV/SCHD 50/50)
  const eqUSMV = config.equityMix.find((m) => m.ticker === 'USMV')?.weight ?? 0;
  const eqSCHD = config.equityMix.find((m) => m.ticker === 'SCHD')?.weight ?? 0;
  const eqTot = config.equityMix.reduce((s, m) => s + m.weight, 0);
  const isDefaultEq =
    eqTot > 0 &&
    Math.abs(eqUSMV / eqTot - 0.5) < 1e-6 &&
    Math.abs(eqSCHD / eqTot - 0.5) < 1e-6 &&
    config.equityMix.length === 2;
  if (!isDefaultEq) {
    deltas.push('mix equity custom');
  }
  const summary = deltas.length === 0 ? 'default' : deltas.join(' · ');
  return `Corrida #${runNumber} · ${summary}`;
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

function formatDraft(v: number): string {
  if (!Number.isFinite(v)) return '0';
  if (Number.isInteger(v)) return String(v);
  // Hasta 3 decimales para no mostrar ruido tipo "0.011000000001"
  return String(Math.round(v * 1000) / 1000);
}

function NumInput({ label, value, onChange, min, max, suffix, hint }: NumInputProps) {
  // Draft local del input. Permite estados intermedios (vacío, "5.", "-")
  // sin perder lo que el usuario está escribiendo. El valor canónico vive en
  // `value` (controlado por el padre). Solo se commitea (clamp + propagate)
  // en blur o Enter; el onChange intermedio propaga si es un número válido.
  const [draft, setDraft] = useState<string>(formatDraft(value));
  const lastSyncedRef = useRef<number>(value);

  useEffect(() => {
    if (value !== lastSyncedRef.current) {
      setDraft(formatDraft(value));
      lastSyncedRef.current = value;
    }
  }, [value]);

  const commit = (txt: string) => {
    const parsed = parseFloat(txt);
    if (!Number.isFinite(parsed)) {
      setDraft(formatDraft(value));
      return;
    }
    let clamped = parsed;
    if (min !== undefined && clamped < min) clamped = min;
    if (max !== undefined && clamped > max) clamped = max;
    setDraft(formatDraft(clamped));
    if (clamped !== value) {
      lastSyncedRef.current = clamped;
      onChange(clamped);
    }
  };

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
          type="text"
          inputMode="decimal"
          value={draft}
          onChange={(e) => {
            const next = e.target.value;
            setDraft(next);
            // Propagación intermedia solo si parsea como número válido;
            // strings tipo "", "5.", "-" se quedan en draft pero no avisan al padre.
            const parsed = parseFloat(next);
            if (Number.isFinite(parsed) && next.trim() !== '' && /^-?\d*\.?\d+$/.test(next.trim())) {
              if (parsed !== value) {
                lastSyncedRef.current = parsed;
                onChange(parsed);
              }
            }
          }}
          onBlur={(e) => commit(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(formatDraft(value));
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
          onFocus={(e) => e.currentTarget.select()}
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

/**
 * Input pequeño para la tasa override del DPF. Acepta null (sin override).
 * Usa el mismo patrón draft local que NumInput para permitir edición fluida
 * (clear con Backspace + retypear sin que se trabe).
 */
function DpfRateInput({
  value,
  defaultRate,
  onChange,
}: {
  value: number | null; // decimal, e.g., 0.0525 = 5.25%. null = sin override
  defaultRate: number; // tasa default que se mostraría sin override (para placeholder)
  onChange: (v: number | null) => void;
}) {
  const initialText = value !== null ? formatDraft(value * 100) : '';
  const [draft, setDraft] = useState<string>(initialText);
  const lastSyncedRef = useRef<number | null>(value);

  useEffect(() => {
    if (value !== lastSyncedRef.current) {
      setDraft(value !== null ? formatDraft(value * 100) : '');
      lastSyncedRef.current = value;
    }
  }, [value]);

  const commit = (txt: string) => {
    const trimmed = txt.trim();
    if (trimmed === '') {
      setDraft('');
      if (value !== null) {
        lastSyncedRef.current = null;
        onChange(null);
      }
      return;
    }
    const parsed = parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 50) {
      // Inválido — revertir al valor previo
      setDraft(value !== null ? formatDraft(value * 100) : '');
      return;
    }
    setDraft(formatDraft(parsed));
    const nextDecimal = parsed / 100;
    if (nextDecimal !== value) {
      lastSyncedRef.current = nextDecimal;
      onChange(nextDecimal);
    }
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      placeholder={formatDraft(defaultRate * 100)}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => commit(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
        if (e.key === 'Escape') {
          setDraft(value !== null ? formatDraft(value * 100) : '');
          (e.currentTarget as HTMLInputElement).blur();
        }
      }}
      onFocus={(e) => e.currentTarget.select()}
      className="w-16 px-2 py-1 rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink text-xs text-right"
      title="Tasa nominal anual del DPF en t=0. Dejá vacío para usar UST1Y inicial + spread default."
    />
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
  const savedVariants = useCaseStudyStore((s) => s.savedVariants);
  const autoSaveVariant = useCaseStudyStore((s) => s.autoSaveVariant);
  const setVariantVisibility = useCaseStudyStore((s) => s.setVariantVisibility);
  const renameVariant = useCaseStudyStore((s) => s.renameVariant);
  const removeVariant = useCaseStudyStore((s) => s.removeVariant);
  const clearVariants = useCaseStudyStore((s) => s.clearVariants);
  // Toggle de baseline DPF1Y. Default ON: el cliente debe ver siempre el
  // "qué pasa si no hago nada fancy" para entender el valor relativo de la
  // propuesta. Aplica a personas naturales y jurídicas por igual.
  const [showDpfBaseline, setShowDpfBaseline] = useState(true);
  // Toggle "A Mercado / A Vencimiento" del fan chart. Default A Mercado
  // (comportamiento histórico del panel). Cuando se prende HTM, el chart
  // muestra el aumPathHTM (bullets con haircut por defaults, equity/cash
  // a mercado). El Y-axis se mantiene sobre AMBOS paths para que el toggle
  // no haga saltar el eje y se vea claramente la diferencia de ancho.
  const [valuationMode, setValuationMode] = useState<'mtm' | 'htm'>('mtm');
  // Toggle "Nominal / Real" — Real deflacta el AUM por la inflación bootstrapped
  // mes a mes (FRED CPIAUCSL, sampleada junto con yields para preservar la
  // correlación rates↔inflation). En Real, el flat de $5M = preservar poder
  // adquisitivo del t=0; por arriba ganamos, por abajo perdimos.
  const [returnView, setReturnView] = useState<'nominal' | 'real'>('nominal');

  // Sim index para el "camino individual" — una sola simulación de las N para
  // ilustrar la dinámica concreta de cada estrategia. Se re-samplea al cambiar
  // result o variantes, o por click del usuario.
  const [singlePathSimIdx, setSinglePathSimIdx] = useState<number | null>(null);
  useEffect(() => {
    if (result) {
      const minSims = Math.min(
        result.meta.nSims,
        ...savedVariants.map((v) => v.result.meta.nSims),
      );
      if (singlePathSimIdx === null || singlePathSimIdx >= minSims) {
        setSinglePathSimIdx(Math.floor(Math.random() * minSims));
      }
    }
    // No resampleamos al cambiar savedVariants si el idx sigue siendo válido —
    // eso permite "agregar variante y ver el mismo sim path con la nueva línea".
  }, [result, savedVariants, singlePathSimIdx]);

  const resampleSinglePath = useCallback(() => {
    if (!result) return;
    const minSims = Math.min(
      result.meta.nSims,
      ...savedVariants.map((v) => v.result.meta.nSims),
    );
    setSinglePathSimIdx(Math.floor(Math.random() * minSims));
  }, [result, savedVariants]);

  const [showAdvanced, setShowAdvanced] = useState(false);
  const worker = useArenaWorker();
  // Panel TTM se carga via hook compartido (cache singleton). Se pasa al
  // worker solo si config.bulletReturnsEngine === 'bucket-bootstrap'.
  // Si el panel no está cargado (loading o unavailable), configToJobInput
  // lo recibe como null y el worker revierte a paramétrico automáticamente.
  const ttmPanelState = useTTMPanel();
  const ttmPanel = ttmPanelState.kind === 'ok' ? ttmPanelState.panel : null;

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
  const allocSum = config.bulletTotalPct + config.equityPct + config.cashPct + config.realAssetsPct;
  const allocValid = Math.abs(allocSum - 1) < 1e-6;

  // Track el config que produjo el `result` actual. Lo seteamos justo
  // ANTES de submitir al worker (lazy capture); cuando vuelve, queda
  // como "el config que generó este result". La PRÓXIMA corrida usa
  // este snapshot para auto-guardar la variante previa con su config
  // correcto (no el config actual que ya fue modificado por el usuario).
  const resultConfigRef = useRef<CaseStudyConfig | null>(null);

  const handleRun = useCallback(async () => {
    setStatus('running');
    try {
      // Cada corrida usa un seed RANDOM diferente, salvo que la URL traiga
      // ?seed=N (modo dev/reproducibilidad). Ver el patrón en el doc:
      // queremos que el cliente vea la varianza entre corridas → confianza
      // en el modelo. El seed usado se persiste en result.meta.seed y se
      // embebe en el PDF para auditoría.
      const url = new URL(globalThis.location.href);
      const urlSeed = url.searchParams.get('seed');
      const overrideSeed =
        urlSeed !== null && /^\d+$/.test(urlSeed)
          ? Number(urlSeed)
          : Math.floor(Math.random() * 1e9);
      // Capturamos el config que va a producir este result (snapshot).
      // Si ya hay un result previo, su config es el que estaba en el ref
      // ANTES de este reemplazo. Lo guardamos como variante con su config
      // correcto.
      const configSnapshot: CaseStudyConfig = { ...config };
      const out = await worker.run(configToJobInput(config, ttmPanel, overrideSeed));
      // Auto-guarda el result PREVIO como variante con label descriptivo
      // antes de reemplazarlo. Así el cliente acumula corridas comparables
      // sin tener que apretar "Guardar variante" manualmente. La primera
      // corrida no genera auto-save (no hay nada previo).
      if (result && resultConfigRef.current) {
        const runNumber = savedVariants.length + 1;
        const label = buildAutoLabel(resultConfigRef.current, runNumber);
        autoSaveVariant({
          label,
          config: resultConfigRef.current,
          result,
        });
      }
      resultConfigRef.current = configSnapshot;
      setResult(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [config, ttmPanel, worker, setStatus, setResult, setError, autoSaveVariant, result, savedVariants.length]);

  // DPF1Y baseline percentiles per-mes — viene del worker per-sim (paired con
  // los yield paths del bootstrap). Cada 12 meses el sim lockea la tasa al
  // UST1Y vigente en ese path + spread. Las bandas p5–p95 / p25–p75 reflejan
  // la varianza de las renovaciones futuras: si el bootstrap sampleó periodos
  // de tasas subiendo, ese sim termina más alto. Equivalente al fan del Cap 0
  // del PDF original.
  const dpfBaselineBands = useMemo<{
    p50: number[];
    p25: number[];
    p75: number[];
    p5: number[];
    p95: number[];
  } | null>(() => {
    if (!result) return null;
    const { nSims, horizonMonths } = result.meta;
    const Hp1 = horizonMonths + 1;
    const ps = [0.05, 0.25, 0.5, 0.75, 0.95];
    const percentilesPerMes = pctPath(result.dpfBaselinePath, nSims, Hp1, ps);
    const p5: number[] = [], p25: number[] = [], p50: number[] = [], p75: number[] = [], p95: number[] = [];
    for (let t = 0; t < Hp1; t++) {
      p5.push(percentilesPerMes[t][0] / 1e6);
      p25.push(percentilesPerMes[t][1] / 1e6);
      p50.push(percentilesPerMes[t][2] / 1e6);
      p75.push(percentilesPerMes[t][3] / 1e6);
      p95.push(percentilesPerMes[t][4] / 1e6);
    }
    return { p5, p25, p50, p75, p95 };
  }, [result]);


  // Tasa anualizada inicial del DPF (la del mes 0, antes de renovaciones).
  // Para la UI label. Usa el initial curve del dataset.
  const dpfRateAnnual = useMemo(() => {
    const irx = getYieldBounds('IRX').initial;
    const fvx = getYieldBounds('FVX').initial;
    const ust1y = irx + (fvx - irx) * ((1.0 - 0.25) / (5.0 - 0.25));
    return ust1y + config.initialSpread;
  }, [config.initialSpread]);

  // Bandas pre-computadas por variante guardada (mes a mes), respetando
  // los toggles current (returnView, valuationMode). Cada variante guarda
  // su result COMPLETO (aumPath/aumPathHTM/inflationIndexPath) — recomputamos
  // sus bandas según el modo de visualización actual para que el cliente
  // siempre vea "peras con peras" en la comparación.
  //
  // Performance: O(8 variantes × 5000 sims × sort × 241 meses) ≈ 100ms por
  // recompute. Se recomputa al cambiar variants o toggles.
  const variantBands = useMemo<Record<string, {
    p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[];
  }>>(() => {
    const out: Record<string, { p5: number[]; p25: number[]; p50: number[]; p75: number[]; p95: number[] }> = {};
    const isReal = returnView === 'real';
    const isHtm = valuationMode === 'htm';
    for (const v of savedVariants) {
      const { nSims, horizonMonths } = v.result.meta;
      const Hp1 = horizonMonths + 1;
      // Pick the right source path based on toggles. The variant has all 4
      // combinations available via its stored aumPath / aumPathHTM /
      // inflationIndexPath.
      const basePath = isHtm ? v.result.aumPathHTM : v.result.aumPath;
      let pathToUse: Float64Array = basePath;
      if (isReal) {
        const idx = v.result.inflationIndexPath;
        const deflated = new Float64Array(basePath.length);
        for (let i = 0; i < basePath.length; i++) {
          const f = idx[i] || 1;
          deflated[i] = basePath[i] / f;
        }
        pathToUse = deflated;
      }
      const p5: number[] = [];
      const p25: number[] = [];
      const p50: number[] = [];
      const p75: number[] = [];
      const p95: number[] = [];
      const col = new Float64Array(nSims);
      for (let t = 0; t < Hp1; t++) {
        for (let s = 0; s < nSims; s++) col[s] = pathToUse[s * Hp1 + t];
        const sorted = Float64Array.from(col);
        sorted.sort();
        p5.push(sorted[Math.floor(0.05 * (nSims - 1))] / 1e6);
        p25.push(sorted[Math.floor(0.25 * (nSims - 1))] / 1e6);
        p50.push(sorted[Math.floor(0.5 * (nSims - 1))] / 1e6);
        p75.push(sorted[Math.floor(0.75 * (nSims - 1))] / 1e6);
        p95.push(sorted[Math.floor(0.95 * (nSims - 1))] / 1e6);
      }
      out[v.id] = { p5, p25, p50, p75, p95 };
    }
    return out;
  }, [savedVariants, returnView, valuationMode]);

  // ---- Chart data (memo: solo recomputa cuando cambia result, config o variantes) ----
  // Bands se guardan como tuplas [lower, upper] para que recharts pinte solo
  // el rango entre p5-p95 / p25-p75 (no desde 0 hasta el valor). Mismo patrón
  // que el FanChart original del Comparador A/B.
  //
  // `deposit`: serie temporal del baseline "solo ahorrar sin invertir". Arranca
  // en initialAUM y crece cada mes por el inflow correspondiente. NO es una
  // Conditioning por vista de inflación. Si está habilitado, computamos
  // la evaluación de la vista (subset de sims que cumplen) y la usamos
  // para subsetear los percentiles del chart y los stats. Si está
  // deshabilitado, viewEvaluation queda null y se opera sobre todas las sims.
  const viewEvaluation = useMemo(() => {
    if (!result) return null;
    if (!config.inflationConditioningEnabled) return null;
    return evaluateInflationView(
      result.inflationIndexPath,
      result.meta.nSims,
      result.meta.horizonMonths,
      {
        windowMonths: config.inflationConditioningHorizonMonths,
        minPct: config.inflationConditioningMinPct,
        maxPct: config.inflationConditioningMaxPct,
      },
    );
  }, [
    result,
    config.inflationConditioningEnabled,
    config.inflationConditioningHorizonMonths,
    config.inflationConditioningMinPct,
    config.inflationConditioningMaxPct,
  ]);

  // Stats condicionales: cuando viewEvaluation tiene matchedIndices, recompute
  // los stats clave sobre ese subset. Cuando no hay conditioning o no hubo
  // match, fallback a result.stats (lo que el worker computó sobre todas las sims).
  const effectiveStats = useMemo(() => {
    if (!result) return null;
    if (!viewEvaluation || viewEvaluation.nMatched === 0) return result.stats;
    const sub = computeConditionalStats({
      aumPath: result.aumPath,
      netWealthPath: result.netWealthPath,
      inflationIndexPath: result.inflationIndexPath,
      initialAum: result.stats.initialAum,
      totalInflows: result.stats.totalInflows,
      horizonMonths: result.meta.horizonMonths,
      nSims: result.meta.nSims,
      matchedIndices: viewEvaluation.matchedIndices,
    });
    // Mergear: stats originales (campos que NO se recomputan, e.g. loanCumInterestMed)
    // + los recomputados desde el subset
    return {
      ...result.stats,
      ...sub,
    };
  }, [result, viewEvaluation]);

  // Distribución unconditional de la inflación en la ventana (siempre, para
  // que la UI muestre "rango natural del modelo" como referencia visual).
  // Se consume en el panel de conditioning (Step 4 de PR #21).
  const unconditionalInflStats = useMemo(() => {
    if (!result) return null;
    const ann = computeAnnInflationInWindow(
      result.inflationIndexPath,
      result.meta.nSims,
      result.meta.horizonMonths,
      config.inflationConditioningHorizonMonths,
    );
    return unconditionalInflationDistribution(ann);
  }, [result, config.inflationConditioningHorizonMonths]);

  // línea horizontal — es una piecewise-linear que sube con cada aporte. Con
  // growth=0 queda casi recta; con growth>0 los escalones se aceleran cada año.
  //
  // Cada variante guardada agrega un campo dinámico `v_<variantId>` con la
  // mediana de ESA variante en cada mes, para overlay en el chart.
  const wealthChartData = useMemo(() => {
    if (!result) return [];
    const { nSims, horizonMonths } = result.meta;
    const Hp1 = horizonMonths + 1;
    const ps = [0.05, 0.25, 0.5, 0.75, 0.95];
    // En modo "Real" el AUM se deflacta por el índice de inflación cumulativo
    // per-path (bootstrap CPI). Las series HTM y MtM se cuelgan del mismo
    // factor por path para que el toggle MtM/HTM sea ortogonal al Real/Nominal.
    const isReal = returnView === 'real';
    let aumSource = result.aumPath;
    let htmSource = result.aumPathHTM;
    if (isReal) {
      // Deflactar: aum_real[s][t] = aum[s][t] / inflationIndex[s][t]
      const idx = result.inflationIndexPath;
      aumSource = new Float64Array(result.aumPath.length);
      htmSource = new Float64Array(result.aumPathHTM.length);
      for (let i = 0; i < aumSource.length; i++) {
        const f = idx[i] || 1;
        aumSource[i] = result.aumPath[i] / f;
        htmSource[i] = result.aumPathHTM[i] / f;
      }
    }
    // Conditioning: si la vista está habilitada y matcheó ≥1 sim, usamos el
    // subset de matchedIndices. Si no, todas las sims (comportamiento previo).
    const subsetIndices = viewEvaluation && viewEvaluation.nMatched > 0
      ? viewEvaluation.matchedIndices
      : null;
    // AUM "a mercado" — valoración estándar mark-to-market con curva + spread.
    const netPct = pctPathSubset(aumSource, nSims, Hp1, ps, subsetIndices);
    // AUM "a vencimiento" (HTM) — bullets con haircut por defaults (bootstrap
    // Moody's), curva y spread NO afectan la valuación de bullets vivos.
    // Equity y cash siempre a mercado. Banda típicamente mucho más angosta.
    const htmPct = pctPathSubset(htmSource, nSims, Hp1, ps, subsetIndices);
    type Point = {
      month: number;
      // Mark-to-market (valoración estándar)
      p50: number;
      band5095: [number, number];
      band2575: [number, number];
      p5: number; p25: number; p75: number; p95: number;
      // Hold-to-maturity (con haircut de defaults, sin volatilidad de curva)
      p50HTM: number;
      band5095HTM: [number, number];
      band2575HTM: [number, number];
      p5HTM: number; p25HTM: number; p75HTM: number; p95HTM: number;
      deposit: number;
      dpf?: number;
      dpfBand5095?: [number, number];
      dpfBand2575?: [number, number];
      [variantKey: string]: number | [number, number] | undefined;
    };
    const data: Point[] = [];
    let cumDepositUsd = result.stats.initialAum;
    for (let t = 0; t < Hp1; t++) {
      const p5 = netPct[t][0] / 1e6;
      const p25 = netPct[t][1] / 1e6;
      const p50 = netPct[t][2] / 1e6;
      const p75 = netPct[t][3] / 1e6;
      const p95 = netPct[t][4] / 1e6;
      const p5h = htmPct[t][0] / 1e6;
      const p25h = htmPct[t][1] / 1e6;
      const p50h = htmPct[t][2] / 1e6;
      const p75h = htmPct[t][3] / 1e6;
      const p95h = htmPct[t][4] / 1e6;
      const point: Point = {
        month: t,
        p50, band5095: [p5, p95], band2575: [p25, p75],
        p5, p25, p75, p95,
        p50HTM: p50h, band5095HTM: [p5h, p95h], band2575HTM: [p25h, p75h],
        p5HTM: p5h, p25HTM: p25h, p75HTM: p75h, p95HTM: p95h,
        deposit: cumDepositUsd / 1e6,
      };
      // DPF baseline bands: mediana + p5-p95 + p25-p75 sobre las N sims del
      // DPF1Y rolling computado por el worker (paired con yield paths). Tiene
      // varianza real porque la tasa se renueva con los yields de cada path.
      if (dpfBaselineBands && dpfBaselineBands.p50[t] !== undefined) {
        point.dpf = dpfBaselineBands.p50[t];
        point.dpfBand5095 = [dpfBaselineBands.p5[t], dpfBaselineBands.p95[t]];
        point.dpfBand2575 = [dpfBaselineBands.p25[t], dpfBaselineBands.p75[t]];
      }
      // Overlay: fan chart completo de cada variante guardada (mediana + bandas).
      // Las bandas se computan respetando los toggles Real/Nominal y MtM/HTM para
      // que la comparación sea siempre "peras con peras" (la variante usa SU
      // propio result.aumPath/HTM/inflationIndexPath con su seed original; el
      // toggle cambia qué slice del result se muestra).
      for (const v of savedVariants) {
        const bands = variantBands[v.id];
        if (!bands) continue;
        const m = bands.p50[t];
        const p5v = bands.p5[t];
        const p95v = bands.p95[t];
        const p25v = bands.p25[t];
        const p75v = bands.p75[t];
        if (m !== undefined) point[`v_${v.id}`] = m;
        if (p5v !== undefined && p95v !== undefined) {
          point[`v_${v.id}_b5095`] = [p5v, p95v];
        }
        if (p25v !== undefined && p75v !== undefined) {
          point[`v_${v.id}_b2575`] = [p25v, p75v];
        }
      }
      data.push(point);
      // Inflow del mes t se acumula DESPUÉS de capturar el deposit del mes t,
      // así data[0].deposit = initial y data[1].deposit = initial + inflow_0.
      if (t < horizonMonths) {
        cumDepositUsd += computeMonthlyInflow(t, config.inflowBaseAnnual, config.inflowGrowth);
      }
    }
    return data;
  }, [result, config.inflowBaseAnnual, config.inflowGrowth, savedVariants, variantBands, dpfBaselineBands, returnView, viewEvaluation]);

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
      // El Y-domain considera AMBAS valuaciones (a mercado + a vencimiento)
      // simultáneamente para que el toggle entre ellas no haga saltar el eje
      // — el cliente debe ver visualmente cómo la banda HTM es más angosta.
      if (p.p5 < min) min = p.p5;
      if (p.p95 > max) max = p.p95;
      if (p.p5HTM < min) min = p.p5HTM;
      if (p.p95HTM > max) max = p.p95HTM;
      if (p.deposit < min) min = p.deposit;
      if (p.deposit > max) max = p.deposit;
      // DPF baseline (mediana + bandas) si está habilitado
      if (showDpfBaseline) {
        if (typeof p.dpf === 'number') {
          if (p.dpf < min) min = p.dpf;
          if (p.dpf > max) max = p.dpf;
        }
        const dpfBand95 = p.dpfBand5095;
        if (Array.isArray(dpfBand95)) {
          if (dpfBand95[0] < min) min = dpfBand95[0];
          if (dpfBand95[1] > max) max = dpfBand95[1];
        }
      }
      // Incluir medianas de variantes si están en la ventana
      for (const v of savedVariants) {
        const m = p[`v_${v.id}`];
        if (typeof m === 'number') {
          if (m < min) min = m;
          if (m > max) max = m;
        }
      }
    }
    if (initialAumM < min) min = initialAumM;
    if (initialAumM > max) max = initialAumM;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const range = max - min;
    const pad = range > 0 ? range * 0.05 : Math.abs(max) * 0.05 || 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [result, window, wealthChartData, initialAumM, savedVariants, showDpfBaseline]);

  // Data del camino individual: para la sim escogida, extrae netWealth en
  // cada mes del run actual + cada variante guardada. Pairing implícito:
  // mismo simIdx funciona porque el bootstrap es seed-deterministic — el
  // sim s en el run actual usa los mismos bloques históricos que el sim s
  // de cualquier variante guardada que comparta seed.
  const singlePathData = useMemo(() => {
    if (!result || singlePathSimIdx === null) return [];
    const { horizonMonths, nSims } = result.meta;
    const Hp1 = horizonMonths + 1;
    if (singlePathSimIdx >= nSims) return [];
    type SingleP = {
      month: number;
      current: number;
      deposit: number;
      dpf?: number;
      [variantKey: string]: number | undefined;
    };
    const data: SingleP[] = [];
    let cumDepositUsd = result.stats.initialAum;
    for (let t = 0; t < Hp1; t++) {
      const point: SingleP = {
        month: t,
        // AUM gross (ver comentario en wealthChartData)
        current: result.aumPath[singlePathSimIdx * Hp1 + t] / 1e6,
        deposit: cumDepositUsd / 1e6,
      };
      // En camino individual, DPF usa el path de ESE sim específico (no la
      // mediana). Mismo simIdx → paired con la estrategia.
      if (singlePathSimIdx < result.meta.nSims) {
        point.dpf = result.dpfBaselinePath[singlePathSimIdx * Hp1 + t] / 1e6;
      }
      for (const v of savedVariants) {
        const vH = v.result.meta.horizonMonths;
        const vHp1 = vH + 1;
        if (singlePathSimIdx < v.result.meta.nSims && t <= vH) {
          point[`v_${v.id}`] = v.result.aumPath[singlePathSimIdx * vHp1 + t] / 1e6;
        }
      }
      data.push(point);
      if (t < horizonMonths) {
        cumDepositUsd += computeMonthlyInflow(t, config.inflowBaseAnnual, config.inflowGrowth);
      }
    }
    return data;
  }, [result, savedVariants, singlePathSimIdx, config.inflowBaseAnnual, config.inflowGrowth]);

  // Y domain del single path: ajusta solo a la data dentro del window (igual
  // que el fan chart) considerando current + cada variante.
  const singlePathYDomain = useMemo<[number, number]>(() => {
    if (!result || !window || singlePathData.length === 0) return [0, 1];
    let min = Infinity;
    let max = -Infinity;
    for (const p of singlePathData) {
      if (p.month < window.startMonth || p.month > window.endMonth) continue;
      if (p.current < min) min = p.current;
      if (p.current > max) max = p.current;
      if (p.deposit < min) min = p.deposit;
      if (p.deposit > max) max = p.deposit;
      if (showDpfBaseline && typeof p.dpf === 'number') {
        if (p.dpf < min) min = p.dpf;
        if (p.dpf > max) max = p.dpf;
      }
      for (const v of savedVariants) {
        const m = p[`v_${v.id}`];
        if (typeof m === 'number') {
          if (m < min) min = m;
          if (m > max) max = m;
        }
      }
    }
    if (initialAumM < min) min = initialAumM;
    if (initialAumM > max) max = initialAumM;
    if (!Number.isFinite(min) || !Number.isFinite(max)) return [0, 1];
    const range = max - min;
    const pad = range > 0 ? range * 0.05 : Math.abs(max) * 0.05 || 0.1;
    return [Math.max(0, min - pad), max + pad];
  }, [result, window, singlePathData, initialAumM, savedVariants, showDpfBaseline]);

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
              label="All-in fee"
              value={config.allInFeeBps}
              onChange={(v) => setConfig({ allInFeeBps: Math.round(v) })}
              step={5}
              min={0}
              max={500}
              suffix="bp/yr"
              hint={config.allInFeeBps > 0 ? `${(config.allInFeeBps / 100).toFixed(2)}% · TER + custodia + asesoría` : 'TER + custodia + asesoría'}
            />
          </div>
        </fieldset>

        {/* --- Allocation --- */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
            Allocation estratégico (los 4 sleeves deben sumar 100%)
          </legend>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
              label="Equity"
              value={config.equityPct * 100}
              onChange={(v) => setConfig({ equityPct: v / 100 })}
              step={1}
              min={0}
              max={100}
              suffix="%"
              hint="mix configurable abajo"
            />
            <NumInput
              label="Activos reales"
              value={config.realAssetsPct * 100}
              onChange={(v) => setConfig({ realAssetsPct: v / 100 })}
              step={1}
              min={0}
              max={100}
              suffix="%"
              hint="anti-inflación · mix abajo"
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
          {/* Bandas de equity: estratégicas (definen hasta dónde el rollover
              táctico puede mover el equity arriba o abajo). Se ponen acá, no
              en Avanzado, porque son parte de la decisión de perfil de cliente. */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-mercantil-line dark:border-mercantil-dark-line">
            <NumInput
              label="Equity mínimo"
              value={config.eqtyMin * 100}
              onChange={(v) => setConfig({ eqtyMin: v / 100 })}
              step={5}
              min={0}
              max={100}
              suffix="%"
              hint="banda dura del rollover"
            />
            <NumInput
              label="Equity máximo"
              value={config.eqtyMax * 100}
              onChange={(v) => setConfig({ eqtyMax: v / 100 })}
              step={5}
              min={0}
              max={100}
              suffix="%"
              hint="banda dura del rollover"
            />
          </div>
          {/* Mix interno del sleeve de renta fija (bullets).
              Default: 100% iBonds UCITS USD Corp IG, 0% HY. El cliente puede
              activar HY (GHYG perpetual) ajustando los pesos. */}
          <div className="pt-2 border-t border-mercantil-line dark:border-mercantil-dark-line">
            <div className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-2">
              Renta fija — mix interno
            </div>
            <BulletMixSelector
              value={config.bulletMix as { ticker: 'iBonds' | 'iBonds-HY' | 'GHYG'; weight: number }[]}
              onChange={(next) => setConfig({ bulletMix: next })}
            />
          </div>

          {/* Mix interno del sleeve de Activos Reales. Solo visible cuando
              realAssetsPct > 0 (sleeve activado en allocation). */}
          {config.realAssetsPct > 0 && (
            <div className="pt-2 border-t border-mercantil-line dark:border-mercantil-dark-line">
              <div className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-2">
                Activos reales — mix interno (anti-inflación)
              </div>
              <RealAssetsMixSelector
                value={config.realAssetsMix as { ticker: 'RWO' | 'IEI' | 'IXC' | 'INFL'; weight: number }[]}
                onChange={(next) => setConfig({ realAssetsMix: next })}
              />
            </div>
          )}

          {/* Mix custom del sleeve de equity. Default = USMV 50% / SCHD 50%
              (el del entregable). El selector expone el catálogo completo
              servido por estudios-a-la-medida via GitHub Pages, con fallback
              inline si el fetch falla. */}
          <div className="pt-2 border-t border-mercantil-line dark:border-mercantil-dark-line">
            <div className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-2">
              Renta variable — mix custom
            </div>
            <EquityMixSelector
              value={config.equityMix}
              onChange={(next) => setConfig({ equityMix: next })}
            />
          </div>
          {/* Cap de duración del sleeve. Default OFF: lineup completo (ID26-ID36S,
              ~11y). Cuando se prende, filtra el lineup a vintages <= N años. Útil
              si el cliente espera un escenario de tasas largo plazo desfavorable
              y quiere acortar duración (e.g., 4y deja ID26-ID29). */}
          <div className="grid grid-cols-2 gap-3 pt-2 border-t border-mercantil-line dark:border-mercantil-dark-line items-end">
            <label className="flex items-center gap-2 text-xs text-mercantil-slate dark:text-mercantil-dark-slate cursor-pointer">
              <input
                type="checkbox"
                checked={config.maxBulletYearsEnabled}
                onChange={(e) => setConfig({ maxBulletYearsEnabled: e.target.checked })}
                className="accent-mercantil-orange h-3.5 w-3.5"
              />
              <span>
                Limitar duración del sleeve{' '}
                <span className="text-mercantil-slate/60 dark:text-mercantil-dark-slate/60">
                  (default OFF = 11y máx)
                </span>
              </span>
            </label>
            {config.maxBulletYearsEnabled && (
              <NumInput
                label="Máximo años"
                value={config.maxBulletYears}
                onChange={(v) => setConfig({ maxBulletYears: v })}
                step={1}
                min={1}
                max={11}
                suffix="años"
                hint="solo vintages ≤ N años en el ladder. Con 1y rolea ~anualmente"
              />
            )}
          </div>

          {/* Residencia fiscal del cliente. El ladder en sí queda fijo a
              iShares iBonds UCITS USD Corp (2026–2034) — BulletShares UCITS
              quedó excluido porque es IG-only, distributing y solo cubre
              hasta 2030. */}
          <div className="pt-2 border-t border-mercantil-line dark:border-mercantil-dark-line space-y-2">
            <label className="flex flex-col text-xs">
              <span className="font-medium text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
                Residencia fiscal del cliente
                <span className="ml-1 text-mercantil-slate/60 dark:text-mercantil-dark-slate/60 font-normal">
                  (filtra opciones de ETFs)
                </span>
              </span>
              <select
                value={config.clientResidency}
                onChange={(e) => setConfig({ clientResidency: e.target.value as typeof config.clientResidency })}
                className="px-2 py-1 rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink text-sm"
              >
                <option value="offshore">Offshore (non-US Person) — solo UCITS</option>
                <option value="us-resident">US-resident / US Person — UCITS + US-registered</option>
              </select>
            </label>
          </div>
        </fieldset>

        {/* --- Flows --- */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
            Flujos (aportes anuales)
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

        {/* --- Vista condicional de inflación (opcional) --- */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.inflationConditioningEnabled}
                onChange={(e) => setConfig({ inflationConditioningEnabled: e.target.checked })}
                className="accent-mercantil-orange h-3.5 w-3.5"
              />
              Vista condicional de inflación (opcional)
            </label>
          </legend>
          {config.inflationConditioningEnabled && (
            <div className="pl-5 space-y-2">
              <p className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate">
                Filtra las sims donde la inflación anualizada acumulada en los próximos N meses cae en el rango.
                El chart y los stats se computan solo sobre el subset. No re-corre la simulación — opera sobre el bootstrap.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <NumInput
                  label="Horizonte (meses)"
                  value={config.inflationConditioningHorizonMonths}
                  onChange={(v) => setConfig({ inflationConditioningHorizonMonths: Math.round(v) })}
                  step={6}
                  min={1}
                  max={config.horizonMonths}
                  hint={`= ${(config.inflationConditioningHorizonMonths / 12).toFixed(1)} años`}
                />
                <NumInput
                  label="Mín %"
                  value={config.inflationConditioningMinPct * 100}
                  onChange={(v) => setConfig({ inflationConditioningMinPct: v / 100 })}
                  step={0.25}
                  min={-5}
                  max={20}
                  suffix="%"
                />
                <NumInput
                  label="Máx %"
                  value={config.inflationConditioningMaxPct * 100}
                  onChange={(v) => setConfig({ inflationConditioningMaxPct: v / 100 })}
                  step={0.25}
                  min={-5}
                  max={20}
                  suffix="%"
                />
              </div>
              {config.inflationConditioningMinPct >= config.inflationConditioningMaxPct && (
                <p className="text-[11px] text-red-600 dark:text-red-400">
                  ⚠ El mínimo debe ser menor al máximo.
                </p>
              )}
              {/* Display de evaluación viva — solo cuando hay result.
                  Muestra: rango natural del modelo (referencia) + % sims que
                  caen en la vista del usuario + warning si es muy raro */}
              {result && unconditionalInflStats && viewEvaluation && (
                <ConditioningEvaluationDisplay
                  view={viewEvaluation}
                  unconditional={unconditionalInflStats}
                />
              )}
            </div>
          )}
        </fieldset>

        {/* --- Evento de financiamiento (préstamo o venta) --- */}
        <fieldset className="space-y-2">
          <legend className="text-xs uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={config.loanEnabled}
                onChange={(e) => setConfig({ loanEnabled: e.target.checked })}
                className="accent-mercantil-orange h-3.5 w-3.5"
              />
              Evento de financiamiento (opcional)
            </label>
          </legend>
          {config.loanEnabled && (
            <div className="pl-5 space-y-3">
              <div>
                <label className="flex flex-col text-xs">
                  <span className="font-medium text-mercantil-slate dark:text-mercantil-dark-slate mb-1">
                    Método
                    <span className="ml-1 text-mercantil-slate/60 dark:text-mercantil-dark-slate/60 font-normal">
                      (cómo se cubre la necesidad de capital)
                    </span>
                  </span>
                  <select
                    value={config.loanMethod}
                    onChange={(e) => setConfig({ loanMethod: e.target.value as 'loan' | 'sell' })}
                    className="px-2 py-1 rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink text-sm"
                  >
                    <option value="loan">Préstamo bancario — AUM intacto, deuda servida con cashflow</option>
                    <option value="sell">Vender — AUM cae en escalón, sin deuda</option>
                  </select>
                </label>
                {config.loanMethod === 'sell' && (
                  <p className="text-[11px] italic text-mercantil-slate dark:text-mercantil-dark-slate mt-1">
                    Se vende el monto vía cascada cash → equity → HY → bullets (corto primero).
                    La ganancia realizada (sobre el cost basis del aporte acumulado) se reporta en el panel de stats.
                  </p>
                )}
              </div>
              <div className={`grid ${config.loanMethod === 'loan' ? 'grid-cols-3' : 'grid-cols-2'} gap-3`}>
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
                  max={65}
                  suffix="%"
                  hint={config.loanMethod === 'loan' ? 'hasta 65% (oferta Mercantil)' : 'a vender del AUM'}
                />
                {config.loanMethod === 'loan' && (
                  <NumInput
                    label="Plazo"
                    value={config.loanTermMonths}
                    onChange={(v) => setConfig({ loanTermMonths: Math.round(v) })}
                    step={6}
                    min={6}
                    max={120}
                    suffix="m"
                  />
                )}
              </div>
            </div>
          )}
        </fieldset>

        {/* --- Advanced --- */}
        <div>
          <button
            onClick={() => setShowAdvanced((v) => !v)}
            className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate hover:text-mercantil-orange"
          >
            {showAdvanced ? '▼' : '▶'} Avanzado (spread bullets, thresholds rollover A/B/C)
          </button>
          {showAdvanced && (
            <div className="mt-3 space-y-3 border-l-2 border-mercantil-line dark:border-mercantil-dark-line pl-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
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
              </div>
              {config.allInFeeBps > 0 && (
                <p className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate italic">
                  Stats reportados son <strong>netos</strong> del all-in fee de {config.allInFeeBps} bp/yr
                  ({(config.allInFeeBps / 100).toFixed(2)}% anual). Se descuenta del NAV mensualmente como
                  post-process; el motor matemático (bootstrap, regímenes, cascada) corre intacto sobre
                  retornos brutos. Diferencia vs. modelo con fee deducido step-by-step: &lt;0.5% en
                  finalAum para fees ≤50 bp.
                </p>
              )}
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
              {/* Motor de retornos de bullets — opt-in del bucket bootstrap.
                  Default 'parametric' preserva paridad Python del primer
                  entregable. El bucket bootstrap usa el panel TTM empírico
                  publicado por estudios-a-la-medida. */}
              <BulletEngineToggle
                currentValue={config.bulletReturnsEngine}
                onChange={(v) => setConfig({ bulletReturnsEngine: v })}
              />
            </div>
          )}
        </div>

        {/* --- Run button --- */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
            Configuración preconfigurada: 5M USD, 20y, ladder inicial UCITS reales iBonds Dec 2026–2034 (TTM máx 8.6y al inicio). Rollover táctico asume continuidad de la oferta UCITS — nuevos vintages estarán disponibles a futuro. USMV+SCHD, BIL.
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

      {/* Estudio a la Medida — siempre visible.
          Sin simulación corrida: el botón "Subir estudio anterior" permite
          retomar un seguimiento desde un PDF previo, restituyendo config +
          result automáticamente. Con simulación corrida: el botón "Generar"
          arma el entregable del cliente. */}
      <EstudioMedidaActions />

      {/* ============== RESULTS ============== */}
      {result && (
        <div className="space-y-4">
          {/* Stats card nominal — effectiveStats refleja el subset cuando hay
              conditioning activo. result.stats sigue siendo el referente
              unconditional. */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-3">
              Stats finales nominales (sobre {viewEvaluation && viewEvaluation.nMatched > 0
                ? `${viewEvaluation.nMatched} de ${result.meta.nSims} sims condicionales`
                : `${result.meta.nSims} simulaciones`})
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <StatBox label="Retorno anual mediano" value={fmtPct((effectiveStats ?? result.stats).annNetMed)} />
              <StatBox label="Anual p5" value={fmtPct((effectiveStats ?? result.stats).annNetP5)} />
              <StatBox label="Anual p95" value={fmtPct((effectiveStats ?? result.stats).annNetP95)} />
              <StatBox label="Prob > 0" value={fmtPct((effectiveStats ?? result.stats).probPos, 0)} />
              <StatBox label="AUM final mediano" value={fmtMoney((effectiveStats ?? result.stats).finalAumMed)} />
              <StatBox label="Net wealth mediano" value={fmtMoney((effectiveStats ?? result.stats).finalNetMed)} />
            </div>
          </div>

          {/* Stats card real (deflactado por inflación bootstrapped) */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-2">
              Stats finales reales — poder adquisitivo
            </h3>
            <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
              AUM deflactado mes a mes por inflación bootstrapped (FRED CPIAUCSL acoplada a yields).
              Si el AUM real final ≥ AUM inicial, el endowment preservó poder adquisitivo.
              {viewEvaluation && viewEvaluation.nMatched > 0 && (
                <span className="ml-1 italic">Stats computados sobre subset condicional.</span>
              )}
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
              <StatBox label="Retorno real anual mediano" value={fmtPct((effectiveStats ?? result.stats).realAnnNetMed)} />
              <StatBox label="Real anual p5" value={fmtPct((effectiveStats ?? result.stats).realAnnNetP5)} />
              <StatBox label="Real anual p95" value={fmtPct((effectiveStats ?? result.stats).realAnnNetP95)} />
              <StatBox label="Preservó poder adq." value={fmtPct((effectiveStats ?? result.stats).realProbPreservedPower, 0)} />
              <StatBox label="AUM real final" value={fmtMoney((effectiveStats ?? result.stats).realFinalAumMed)} />
              <StatBox label="Net wealth real" value={fmtMoney((effectiveStats ?? result.stats).realFinalNetMed)} />
            </div>
          </div>

          {/* Detalle de sleeves (collapsible) */}
          <SleevesDetailPanel config={config} />

          {/* Rollover regimes — panel explicativo con barras + cards collapsible */}
          <RegimesDetailPanel result={result} config={config} totalEvents={totalEvents} />

          {/* Costos del evento de financiamiento */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-3">
              {config.loanEnabled && config.loanMethod === 'sell'
                ? 'Venta: monto realizado & ganancia (medianas)'
                : 'Préstamo: costos & ventas forzadas (medianas)'}
            </h3>
            <div className="space-y-2 text-sm">
              {config.loanEnabled && config.loanMethod === 'sell' ? (
                <>
                  <LoanRow label="Monto vendido en el evento" value={fmtMoney(result.stats.soldOnEventMed)} />
                  <LoanRow
                    label="Ganancia realizada (vs cost basis)"
                    value={fmtMoney(result.stats.realizedGainOnSaleMed)}
                  />
                  <LoanRow label="Ventas forzadas equity (otras causas)" value={fmtMoney(result.stats.forcedEquityMed)} />
                  <LoanRow label="Ventas forzadas bullet (otras causas)" value={fmtMoney(result.stats.forcedBulletMed)} />
                </>
              ) : (
                <>
                  <LoanRow label="Interés total pagado" value={fmtMoney(result.stats.loanCumInterestMed)} />
                  <LoanRow label="Ventas forzadas equity" value={fmtMoney(result.stats.forcedEquityMed)} />
                  <LoanRow label="Ventas forzadas bullet" value={fmtMoney(result.stats.forcedBulletMed)} />
                  <LoanRow label="Shortfall acumulado" value={fmtMoney(result.stats.loanShortfallMed)} />
                </>
              )}
            </div>
          </div>

          {/* Comparador de variantes (strip de save/list/clear) */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
                Comparador de variantes
              </h3>
              <div className="flex items-center gap-3 flex-wrap">
                <label className="flex items-center gap-1.5 text-xs text-mercantil-slate dark:text-mercantil-dark-slate cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showDpfBaseline}
                    onChange={(e) => setShowDpfBaseline(e.target.checked)}
                    className="accent-mercantil-orange h-3.5 w-3.5"
                  />
                  <span className="flex items-center gap-1">
                    <span className="inline-block w-3 h-[2px] align-middle" style={{ background: '#6B7280' }} />
                    DPF1Y tasa inicial
                  </span>
                </label>
                {showDpfBaseline && (
                  <div className="flex items-center gap-1 text-xs">
                    <DpfRateInput
                      value={config.dpfRateOverride}
                      defaultRate={dpfRateAnnual}
                      onChange={(v) => setConfig({ dpfRateOverride: v })}
                    />
                    <span className="text-mercantil-slate dark:text-mercantil-dark-slate">% nominal</span>
                    {config.dpfRateOverride !== null && (
                      <button
                        onClick={() => setConfig({ dpfRateOverride: null })}
                        className="text-mercantil-slate/60 hover:text-red-600 ml-1"
                        title="Volver al default (UST1Y + spread)"
                      >
                        ×
                      </button>
                    )}
                  </div>
                )}
                {savedVariants.length > 0 && (
                  <button
                    onClick={clearVariants}
                    className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate hover:text-red-600"
                  >
                    Limpiar variantes
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
              Cada corrida queda guardada automáticamente con un label descriptivo. Marcá el checkbox para mostrar su
              mediana en el fan chart. Por default mostramos la <strong>primera corrida</strong> (ancla de referencia)
              y la <strong>última</strong> (la actual). Las del medio quedan ocultas; marcá las que quieras comparar.
              Cap {MAX_SAVED_VARIANTS} variantes — al exceder, descartamos la más vieja no-anclada. Click en el label
              para renombrar manualmente.
              {' '}El <strong>DPF1Y baseline</strong> simula "renovar depósito a plazo cada 12 meses" — paired con los
              mismos yield paths del bootstrap.
            </p>
            <div className="space-y-1">
              {savedVariants.length === 0 && (
                <p className="text-xs text-mercantil-slate/60 dark:text-mercantil-dark-slate/60 italic">
                  Aún no hay corridas guardadas. Apretá "Correr simulación" — la primera corrida se mostrará en el chart;
                  desde la segunda en adelante, se acumulan acá para comparar.
                </p>
              )}
              {savedVariants.map((v, idx) => (
                <VariantRow
                  key={v.id}
                  variant={v}
                  isAnchor={idx === 0}
                  onToggleVisibility={(visible) => setVariantVisibility(v.id, visible)}
                  onRename={(label) => renameVariant(v.id, label)}
                  onRemove={() => removeVariant(v.id)}
                />
              ))}
            </div>
          </div>

          {/* Wealth fan chart */}
          <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
            <div className="flex items-start justify-between gap-3 flex-wrap mb-1">
              <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
                AUM del fondo — percentiles ($ millones)
                <span
                  className="ml-2 font-normal text-[10px] text-mercantil-slate/50 dark:text-mercantil-dark-slate/50 tabular-nums"
                  title="Seed PRNG de esta corrida. Cada corrida usa uno random distinto para que el cliente vea la robustez (poca variación entre corridas = modelo robusto). Embebido en el PDF para auditoría."
                >
                  seed {result.meta.seed}
                </span>
              </h3>
              {/* Dos toggles ortogonales:
                  1. Nominal / Real: el segundo deflacta por CPI bootstrapped
                  2. A mercado / A vencimiento: valuación del ladder */}
              <div className="flex items-center gap-3 text-xs flex-wrap">
                <div className="flex items-center gap-1">
                  <span className="text-mercantil-slate dark:text-mercantil-dark-slate mr-1">Términos:</span>
                  <button
                    type="button"
                    onClick={() => setReturnView('nominal')}
                    className={`px-2 py-1 rounded border transition ${
                      returnView === 'nominal'
                        ? 'border-mercantil-orange bg-mercantil-orange text-white'
                        : 'border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate hover:border-mercantil-orange'
                    }`}
                    title="USD corrientes — el número del extracto trimestral."
                  >
                    Nominal
                  </button>
                  <button
                    type="button"
                    onClick={() => setReturnView('real')}
                    className={`px-2 py-1 rounded border transition ${
                      returnView === 'real'
                        ? 'border-mercantil-orange bg-mercantil-orange text-white'
                        : 'border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate hover:border-mercantil-orange'
                    }`}
                    title="USD deflactado por CPI bootstrapped (FRED CPIAUCSL). El flat al capital inicial = preservar poder adquisitivo."
                  >
                    Real
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-mercantil-slate dark:text-mercantil-dark-slate mr-1">Valuación:</span>
                  <button
                    type="button"
                    onClick={() => setValuationMode('mtm')}
                    className={`px-2 py-1 rounded border transition ${
                      valuationMode === 'mtm'
                        ? 'border-mercantil-orange bg-mercantil-orange text-white'
                        : 'border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate hover:border-mercantil-orange'
                    }`}
                  >
                    A mercado
                  </button>
                  <button
                    type="button"
                    onClick={() => setValuationMode('htm')}
                    className={`px-2 py-1 rounded border transition ${
                      valuationMode === 'htm'
                        ? 'border-mercantil-orange bg-mercantil-orange text-white'
                        : 'border-mercantil-line dark:border-mercantil-dark-line text-mercantil-slate dark:text-mercantil-dark-slate hover:border-mercantil-orange'
                    }`}
                    title="Valor a vencimiento natural de cada bullet — bullets con haircut por defaults (bootstrap Moody's), equity y cash a mercado. Refleja qué patrimonio recibe el cliente si se queda al ladder hasta el último bullet."
                  >
                    A vencimiento
                  </button>
                </div>
              </div>
            </div>
            <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
              {returnView === 'real' && (
                <span className="block mb-1">
                  <strong>Vista en términos reales</strong>: el AUM está deflactado por inflación mensual
                  sampleada del bootstrap (FRED CPIAUCSL acoplada a los yields para preservar correlación
                  histórica). El flat al capital inicial = preservación de poder adquisitivo del t=0. Por arriba
                  ganamos en USD constantes; por abajo perdimos a pesar de crecer en USD corrientes.
                </span>
              )}
              {valuationMode === 'mtm' ? (
                <>
                  <strong>A mercado</strong>: línea naranja = mediana sobre las {result.meta.nSims} simulaciones.
                  Bandas = 50% (p25–p75) y 90% (p5–p95) de los caminos posibles. Refleja el valor que el cliente
                  vería en su extracto trimestral — incluye volatilidad de curva, spread y defaults.
                </>
              ) : (
                <>
                  <strong>A vencimiento</strong>: línea naranja = mediana sobre las {result.meta.nSims} simulaciones,
                  valorando bullets con haircut por defaults (bootstrap histórico Moody's 1983–2024). La curva, el
                  spread y el sentiment de mercado <em>NO afectan</em> esta valuación de bullets vivos. Es el
                  patrimonio que el cliente recibe si se queda al ladder hasta el vencimiento natural de cada bullet.
                  Equity y cash siguen a mercado (no tienen vencimiento).
                </>
              )}
              {config.loanEnabled && valuationMode === 'mtm' && (
                <> El <strong>AUM del fondo</strong> es bruto: el préstamo (extra-portfolio) NO se descuenta de
                este path. El fondo solo paga las cuotas mensuales (cash → equity → bullet en cascada), por eso
                no hay brincos visibles al desembolso — solo crecimiento marginalmente más lento durante el plazo.</>
              )}
              {savedVariants.length > 0 && (
                <> Las líneas de colores son medianas de variantes guardadas para comparar.</>
              )}
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
                    {...TOOLTIP_PROPS}
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
                  {/* Bandas: dataKey tupla [lower, upper] → recharts pinta solo
                      entre los 2 valores. Cambia entre 'band5095'/'band2575'/'p50'
                      (a mercado) y 'band5095HTM'/'band2575HTM'/'p50HTM' (a vencimiento)
                      según el toggle. */}
                  <Area
                    type="monotone"
                    dataKey={valuationMode === 'htm' ? 'band5095HTM' : 'band5095'}
                    stroke="none"
                    fill="#F58220"
                    fillOpacity={0.10}
                    name="p5–p95 (90%)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey={valuationMode === 'htm' ? 'band2575HTM' : 'band2575'}
                    stroke="none"
                    fill="#F58220"
                    fillOpacity={0.24}
                    name="p25–p75 (50%)"
                    isAnimationActive={false}
                  />
                  <Line
                    type="monotone"
                    dataKey={valuationMode === 'htm' ? 'p50HTM' : 'p50'}
                    stroke="#F58220"
                    strokeWidth={2}
                    dot={false}
                    name={valuationMode === 'htm' ? 'Mediana — a vencimiento' : 'Mediana — a mercado'}
                    isAnimationActive={false}
                  />
                  {/* Overlay de fan chart completo de variantes guardadas:
                       bandas p5-p95 (90%) + p25-p75 (50%) + mediana. Solo
                       las visibles (checkbox marcado). Default: primera
                       (ancla) + última visible. Bandas con fillOpacity baja
                       para no saturar visual con varias variantes overlay. */}
                  {savedVariants.filter((v) => v.visible).flatMap((v) => [
                    <Area
                      key={`${v.id}-b5095`}
                      type="monotone"
                      dataKey={`v_${v.id}_b5095`}
                      stroke="none"
                      fill={v.color}
                      fillOpacity={0.08}
                      name={`${v.label} — p5–p95`}
                      isAnimationActive={false}
                      legendType="none"
                    />,
                    <Area
                      key={`${v.id}-b2575`}
                      type="monotone"
                      dataKey={`v_${v.id}_b2575`}
                      stroke="none"
                      fill={v.color}
                      fillOpacity={0.15}
                      name={`${v.label} — p25–p75`}
                      isAnimationActive={false}
                      legendType="none"
                    />,
                    <Line
                      key={`${v.id}-median`}
                      type="monotone"
                      dataKey={`v_${v.id}`}
                      stroke={v.color}
                      strokeWidth={1.75}
                      dot={false}
                      name={v.label}
                      isAnimationActive={false}
                      connectNulls
                    />,
                  ])}
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
                  {/* DPF1Y bandas + mediana — del worker, paired con yield paths */}
                  {showDpfBaseline && (
                    <>
                      <Area
                        type="monotone"
                        dataKey="dpfBand5095"
                        stroke="none"
                        fill="#6B7280"
                        fillOpacity={0.10}
                        name="DPF p5–p95"
                        isAnimationActive={false}
                      />
                      <Area
                        type="monotone"
                        dataKey="dpfBand2575"
                        stroke="none"
                        fill="#6B7280"
                        fillOpacity={0.24}
                        name="DPF p25–p75"
                        isAnimationActive={false}
                      />
                      <Line
                        type="monotone"
                        dataKey="dpf"
                        stroke="#6B7280"
                        strokeWidth={1.5}
                        strokeDasharray="2 6"
                        dot={false}
                        name="DPF1Y mediana (renovación anual)"
                        isAnimationActive={false}
                      />
                    </>
                  )}
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
                puntuales visibles en el reporting trimestral del cliente.
              </div>
              <div className="p-3 rounded border border-mercantil-line dark:border-mercantil-dark-line">
                <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Lado derecho · largo plazo:</strong>{' '}
                las bandas se ensanchan pero el piso suele estar por encima de los aportes acumulados. El riesgo
                deja de ser volatilidad y pasa a ser <strong>no cumplir el objetivo</strong> por haber sido
                demasiado conservador.
              </div>
            </div>
          </div>

          {/* Camino individual — una simulación aleatoria (click para resamplear) */}
          {singlePathSimIdx !== null && singlePathData.length > 0 && (
            <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium">
                  Camino individual — simulación #{singlePathSimIdx + 1} de {result.meta.nSims}
                </h3>
                <button
                  onClick={resampleSinglePath}
                  className="px-3 py-1 text-xs rounded bg-mercantil-orange text-white hover:bg-mercantil-orange/90"
                >
                  🎲 Otra simulación aleatoria
                </button>
              </div>
              <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
                Una de las {result.meta.nSims} trayectorias simuladas — muestra la <strong>dinámica concreta</strong> que las
                medianas esconden: drawdowns puntuales, recuperaciones, el momento exacto en que un préstamo o un evento
                de rollover impacta el AUM. <strong>Click en "Otra simulación"</strong> para muestrear otra al azar.
                {savedVariants.length > 0 && (
                  <> Si tenés variantes guardadas, todas se evalúan en el <strong>mismo</strong> camino del bootstrap
                  (paired) — la diferencia que ves entre líneas es solo de config, no de azar.</>
                )}
              </p>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={singlePathData}
                    margin={{ top: 8, right: 16, left: 0, bottom: 4 }}
                    onClick={resampleSinglePath}
                    style={{ cursor: 'pointer' }}
                  >
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
                      domain={singlePathYDomain}
                      allowDataOverflow
                      tickFormatter={(v: number) => v < 1 ? `$${(v * 1000).toFixed(0)}k` : `$${v.toFixed(1)}M`}
                      fontSize={11}
                    />
                    <Tooltip
                      {...TOOLTIP_PROPS}
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
                      iconType="line"
                      wrapperStyle={{ fontSize: 11, paddingTop: 4 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="current"
                      stroke="#F58220"
                      strokeWidth={2}
                      dot={false}
                      name="Run actual"
                      isAnimationActive={false}
                    />
                    {savedVariants.filter((v) => v.visible).map((v) => (
                      <Line
                        key={v.id}
                        type="monotone"
                        dataKey={`v_${v.id}`}
                        stroke={v.color}
                        strokeWidth={1.75}
                        dot={false}
                        name={v.label}
                        isAnimationActive={false}
                        connectNulls
                      />
                    ))}
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
                    {/* DPF1Y para este sim específico — paired con la trayectoria de tasas */}
                    {showDpfBaseline && (
                      <Line
                        type="monotone"
                        dataKey="dpf"
                        stroke="#6B7280"
                        strokeWidth={1.5}
                        strokeDasharray="2 6"
                        dot={false}
                        name={`DPF1Y (este sim · renovación anual)`}
                        isAnimationActive={false}
                      />
                    )}
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
              <p className="text-[11px] text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 mt-2 italic">
                Tip: si tenés un préstamo activado y ves una caída brusca alrededor del mes de disparo, ese es el
                pago inicial chocando contra cash. Si la caída se prolonga, está habiendo venta forzada de equity
                o bullets. El camino individual te muestra esto que las medianas suavizan.
              </p>
            </div>
          )}

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
                    {...TOOLTIP_PROPS}
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

/**
 * Fila de una variante guardada: checkbox de visibilidad + label
 * (click-to-edit) + botón remove. La primera variante (isAnchor=true)
 * se muestra con un icono de ancla; no se puede eliminar (es la
 * referencia del comparativo).
 */
function VariantRow({
  variant,
  isAnchor,
  onToggleVisibility,
  onRename,
  onRemove,
}: {
  variant: SavedVariant;
  isAnchor: boolean;
  onToggleVisibility: (visible: boolean) => void;
  onRename: (label: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(variant.label);
  useEffect(() => {
    if (!editing) setDraft(variant.label);
  }, [editing, variant.label]);

  const commit = () => {
    onRename(draft);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded border border-mercantil-line dark:border-mercantil-dark-line bg-mercantil-bg-soft/20 dark:bg-mercantil-dark-panel/40">
      <input
        type="checkbox"
        checked={variant.visible}
        onChange={(e) => onToggleVisibility(e.target.checked)}
        className="accent-mercantil-orange h-3.5 w-3.5 flex-shrink-0"
        aria-label={`Mostrar ${variant.label} en el chart`}
      />
      <span
        className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0"
        style={{ background: variant.color }}
      />
      {isAnchor && (
        <span title="Corrida de referencia (no se borra automáticamente)" className="text-[11px] flex-shrink-0">
          ⚓
        </span>
      )}
      {editing ? (
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
            if (e.key === 'Escape') {
              setDraft(variant.label);
              setEditing(false);
            }
          }}
          onFocus={(e) => e.currentTarget.select()}
          className="flex-1 min-w-0 px-2 py-0.5 text-xs rounded border border-mercantil-orange bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink"
          autoFocus
        />
      ) : (
        <span
          className="flex-1 min-w-0 text-xs text-mercantil-ink dark:text-mercantil-dark-ink truncate cursor-pointer hover:underline"
          onClick={() => setEditing(true)}
          title="Click para renombrar"
        >
          {variant.label}
        </span>
      )}
      <button
        onClick={onRemove}
        className="text-mercantil-slate/60 dark:text-mercantil-dark-slate/60 hover:text-red-600 text-sm leading-none flex-shrink-0"
        aria-label={`Quitar ${variant.label}`}
        title="Eliminar variante"
      >
        ×
      </button>
    </div>
  );
}

/**
 * Display lateral del conditioning: muestra el rango natural del modelo
 * para la ventana actual + % de sims que caen en la vista del usuario.
 * El color del % refleja la robustez estadística:
 *  - verde: ≥1000 sims condicionales → análisis confiable
 *  - amarillo: 200-999 → análisis aceptable con caveat
 *  - rojo: <200 → vista demasiado rara, considerar ampliar
 */
function ConditioningEvaluationDisplay({
  view,
  unconditional,
}: {
  view: { nMatched: number; nTotal: number; probability: number; standardError: number };
  unconditional: { p5: number; p25: number; p50: number; p75: number; p95: number; mean: number };
}) {
  const pct = (x: number) => `${(x * 100).toFixed(2)}%`;
  let badgeColor = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300';
  let badgeText = 'análisis confiable';
  if (view.nMatched < 200) {
    badgeColor = 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300';
    badgeText = 'vista muy rara — considerá ampliar el rango';
  } else if (view.nMatched < 1000) {
    badgeColor = 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300';
    badgeText = 'banda con incertidumbre estadística mayor';
  }
  return (
    <div className="mt-2 p-2 rounded border border-mercantil-line dark:border-mercantil-dark-line bg-mercantil-bg-soft/30 dark:bg-mercantil-dark-panel/40 text-[11px] space-y-1">
      <div>
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">Rango natural del modelo (sin condicionar):</span>{' '}
        <span className="font-medium text-mercantil-ink dark:text-mercantil-dark-ink tabular-nums">
          p5={pct(unconditional.p5)} · p50={pct(unconditional.p50)} · p95={pct(unconditional.p95)}
        </span>
      </div>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">Tu vista corresponde al</span>
        <span className="font-semibold tabular-nums text-mercantil-orange">
          {pct(view.probability)}
        </span>
        <span className="text-mercantil-slate dark:text-mercantil-dark-slate">
          de las sims ({view.nMatched} de {view.nTotal} · SE ±{(view.standardError * 100).toFixed(2)}pp)
        </span>
      </div>
      <div className={`inline-block px-2 py-0.5 rounded ${badgeColor}`}>
        {badgeText}
      </div>
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

/**
 * Toggle del motor de retornos de bullets. Consume el panel TTM via useTTMPanel
 * y muestra el estado de carga + permite opt-in al bucket bootstrap si el
 * panel está disponible.
 *
 * Si el panel no se carga (offline o Pages caída), el toggle queda
 * disabled y el motor automáticamente usa 'parametric'.
 */
function BulletEngineToggle({
  currentValue,
  onChange,
}: {
  currentValue: 'parametric' | 'bucket-bootstrap';
  onChange: (v: 'parametric' | 'bucket-bootstrap') => void;
}) {
  const panelState = useTTMPanel();
  const panelOk = panelState.kind === 'ok';
  const panelLoading = panelState.kind === 'loading';

  return (
    <div className="flex flex-col gap-1 text-xs mt-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={currentValue === 'bucket-bootstrap'}
          disabled={!panelOk}
          onChange={(e) => onChange(e.target.checked ? 'bucket-bootstrap' : 'parametric')}
          className="accent-mercantil-orange h-3.5 w-3.5 disabled:opacity-50"
        />
        <span className={!panelOk ? 'text-mercantil-slate/60 dark:text-mercantil-dark-slate/60' : ''}>
          Motor bullets: bucket bootstrap empírico
        </span>
        <span className="text-mercantil-slate/60 dark:text-mercantil-dark-slate/60">
          {currentValue === 'bucket-bootstrap'
            ? '(panel TTM empírico)'
            : '(paramétrico — curve + spread + duration decay)'}
        </span>
      </label>
      {panelLoading && (
        <span className="text-mercantil-slate/60 dark:text-mercantil-dark-slate/60 italic pl-6">
          Cargando panel TTM…
        </span>
      )}
      {panelState.kind === 'unavailable' && (
        <span className="text-amber-700 dark:text-amber-400 italic pl-6">
          ⚠ Panel TTM no disponible ({panelState.reason}) — toggle deshabilitado, motor revierte a paramétrico
        </span>
      )}
      {panelState.kind === 'ok' && (
        <span className="text-mercantil-slate/60 dark:text-mercantil-dark-slate/60 italic pl-6">
          Panel TTM cargado · IG {panelState.panel.coverage.ig.total_obs} obs · HY {panelState.panel.coverage.hy.total_obs} obs
        </span>
      )}
    </div>
  );
}

/**
 * Bloque del Sleeve Equity para mix custom — reemplaza las secciones rígidas
 * (Diversificación 50/50, Geografía 100% USA, Riesgo histórico USMV/SCHD) por
 * un breakdown dinámico computado a partir del meta JSON del catálogo:
 *   - Factores presentes: agrupados por `category`, sumando pesos
 *   - Avisos de splice histórico: tickers cuyo `proxy != null`
 *   - Mensaje aclaratorio sobre por qué no mostramos cifras de geografía/vol
 *     (que en el default eran estimadas a mano por el equipo del estudio)
 */
const CATEGORY_LABEL_ES: Record<string, string> = {
  EqLowVol: 'Baja volatilidad',
  EqDiv: 'Dividendo de calidad',
  EqHiDiv: 'Dividendo alto',
  EqQuality: 'Quality (alta ROE / baja deuda)',
  EqMegaCap: 'Mega-cap',
  EqGrowth: 'Growth / Tech',
  EqSmallCap: 'Small-cap',
  EqEqualW: 'Equal weight',
  EqMomentum: 'Momentum',
  EqLargeBlend: 'Large blend (S&P 500)',
  EqGlobal: 'Global (ACWI)',
  EqShillerRot: 'Rotación Shiller CAPE',
};

function CustomMixFactorBreakdown({
  mix,
  total,
  catalog,
}: {
  mix: ReadonlyArray<{ ticker: string; weight: number }>;
  total: number;
  catalog: Record<string, import('../hooks/useEquityMeta').EquityTickerMeta> | null;
}) {
  // Suma de pesos normalizados por categoría
  const byCategory: Record<string, { pct: number; tickers: string[] }> = {};
  let unknownPct = 0;
  for (const m of mix) {
    const t = catalog?.[m.ticker];
    const wNorm = total > 0 ? m.weight / total : 0;
    if (!t) {
      unknownPct += wNorm;
      continue;
    }
    if (!byCategory[t.category]) byCategory[t.category] = { pct: 0, tickers: [] };
    byCategory[t.category].pct += wNorm;
    byCategory[t.category].tickers.push(m.ticker);
  }
  const sortedCategories = Object.entries(byCategory).sort((a, b) => b[1].pct - a[1].pct);

  // Tickers con proxy (splice histórico)
  const splicedTickers = mix
    .map((m) => catalog?.[m.ticker])
    .filter((t): t is import('../hooks/useEquityMeta').EquityTickerMeta => !!t && t.proxy !== null);

  if (!catalog) {
    return (
      <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate italic">
        Cargando catálogo para construir el breakdown del mix custom…
      </div>
    );
  }

  return (
    <>
      <div>
        <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
          Factores presentes en el mix custom
        </div>
        <ul className="text-xs space-y-0.5">
          {sortedCategories.map(([cat, info]) => (
            <li key={cat}>
              • <strong>{CATEGORY_LABEL_ES[cat] ?? cat}</strong>: {Math.round(info.pct * 100)}%
              del sleeve ({info.tickers.join(', ')})
            </li>
          ))}
          {unknownPct > 0 && (
            <li className="text-mercantil-slate/70 dark:text-mercantil-dark-slate/70">
              • Sin categoría: {Math.round(unknownPct * 100)}% (ticker no presente en el meta)
            </li>
          )}
        </ul>
        <p className="text-[11px] mt-2 italic text-mercantil-slate dark:text-mercantil-dark-slate">
          Las cifras de diversificación interna, geografía y volatilidad histórica del default
          (USMV+SCHD) no se replican para mixes custom — esos números los estimó manualmente
          el equipo del estudio y no están parametrizados en el meta JSON. El simulador igual
          corre con la serie histórica real de cada ticker (spliceada cuando aplica, ver abajo).
        </p>
      </div>

      {splicedTickers.length > 0 && (
        <div>
          <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
            Splice histórico en el bootstrap
          </div>
          <ul className="text-xs space-y-1">
            {splicedTickers.map((t) => (
              <li key={t.ticker}>
                <strong>{t.ticker}</strong> ← proxy <strong>{t.proxy!.ticker}</strong>{' '}
                ({t.proxy!.covers}). {t.proxy!.rationale}
              </li>
            ))}
          </ul>
          <p className="text-[11px] mt-1 italic text-mercantil-slate dark:text-mercantil-dark-slate">
            El bootstrap del motor usa la serie spliceada como una sola — los retornos
            pre-splice provienen del proxy, etiquetados con el ticker canonical. Eso da una
            distribución estable para tickers de historia corta, a costa de asumir que el
            proxy captura el mismo factor.
          </p>
        </div>
      )}
    </>
  );
}

// =====================================================================
// REGIMES DETAIL — explicación didáctica de los 3 regímenes A/B/C
// =====================================================================

type ArenaJobOutputForRegimes = {
  regimeCounts: { A: number; B: number; C: number };
};

function RegimesDetailPanel({
  result,
  config,
  totalEvents,
}: {
  result: ArenaJobOutputForRegimes;
  config: CaseStudyConfig;
  totalEvents: number;
}) {
  const th = config.thresholds;
  const pct = (n: number) => (totalEvents > 0 ? (n / totalEvents) * 100 : 0);
  const pctA = pct(result.regimeCounts.A);
  const pctB = pct(result.regimeCounts.B);
  const pctC = pct(result.regimeCounts.C);
  const xToEqPct = (th.xToEquity * 100).toFixed(0);
  const thetaHighPct = (th.thetaHigh * 100).toFixed(2);
  const thetaLowPct = (th.thetaLow * 100).toFixed(2);
  const thetaSteepBp = (th.thetaSteep * 10000).toFixed(0);
  const thetaFlatBp = (th.thetaFlat * 10000).toFixed(0);
  const eqtyMaxPct = (config.eqtyMax * 100).toFixed(0);

  return (
    <div className="bg-white dark:bg-mercantil-dark-panel rounded-lg border border-mercantil-line dark:border-mercantil-dark-line p-5">
      <h3 className="text-sm uppercase tracking-wider text-mercantil-slate dark:text-mercantil-dark-slate font-medium mb-1">
        Rollover táctico — regímenes A/B/C
      </h3>
      <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
        Cuando vence un bullet, la regla observa el estado de la curva treasury y clasifica el momento en
        uno de tres regímenes. Cada uno tiene una acción específica para el principal liberado.
        Los conteos abajo son <strong>{totalEvents.toLocaleString()} eventos × simulación</strong> (cada bullet
        × cada sim que lo vio vencer). La distribución te dice <strong>qué tipo de mercado dominó</strong> a lo
        largo de las simulaciones.
      </p>

      {/* Barras compactas con % */}
      <div className="space-y-2 mb-4">
        <RegimeBar label="A · tasas altas + slope steep" count={result.regimeCounts.A} total={totalEvents} colorClass="bg-emerald-500" />
        <RegimeBar label="B · tasas bajas o curva flat/invertida" count={result.regimeCounts.B} total={totalEvents} colorClass="bg-amber-500" />
        <RegimeBar label="C · zona neutral" count={result.regimeCounts.C} total={totalEvents} colorClass="bg-mercantil-navy" />
      </div>

      <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mb-3">
        Lectura inmediata: <strong>{pctA.toFixed(1)}% A / {pctB.toFixed(1)}% B / {pctC.toFixed(1)}% C</strong>.
        {pctB > 50 && ' La dominancia de B refleja que el bootstrap muestrea mucho 2009–2021 (era de tasas bajas).'}
        {pctA > 30 && ' La presencia material de A sugiere que el modelo capturó periodos de tasas elevadas.'}
      </p>

      <div className="space-y-2">
        {/* RÉGIMEN A */}
        <details className="rounded border border-mercantil-line dark:border-mercantil-dark-line">
          <summary className="px-4 py-3 cursor-pointer flex items-center justify-between bg-mercantil-bg-soft/30">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-emerald-500" />
              <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Régimen A — tasas altas + curva pronunciada</strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                {pctA.toFixed(1)}% de eventos
              </span>
            </span>
            <span className="text-xs text-mercantil-orange">click para detalle ▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Condición de disparo
              </div>
              <p className="text-xs">
                TNX (yield 10y) <strong>&gt; θ_high = {thetaHighPct}%</strong> <em>Y</em> slope (TNX − IRX)
                <strong> &gt; θ_steep = {thetaSteepBp} bp</strong>. Tasas largas elevadas Y curva con prima de
                plazo positiva amplia. Es el escenario clásico de "fin de ciclo de subidas con expectativa de
                cortar pronto" — el bono largo paga mucho carry, hay convicción de duración.
              </p>
            </div>
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Acción al vencer un bullet
              </div>
              <p className="text-xs">
                Principal vencido → <strong>bullet sintético siguiente (el más largo del ladder)</strong>.
                Además, si el equity está por encima de la banda <strong>{eqtyMaxPct}%</strong>, se trim el
                exceso y se suma también al bullet largo. El intent es <strong>cargar duración</strong> mientras
                las tasas siguen altas: el carry compensa, y si las tasas bajan después, el roll-down captura
                ganancia adicional.
              </p>
            </div>
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Cuándo es bueno que A esté presente
              </div>
              <p className="text-xs">
                Una proporción de A entre 15–25% es señal de un bootstrap balanceado que captura
                periodos como 2007 o 2023. Si es &gt;40%, el bootstrap está sobre-ponderando esos años
                — revisar la ventana histórica. Si es &lt;5%, el modelo casi nunca ve "mercado de carry alto"
                — perdés la oportunidad de extender duración.
              </p>
            </div>
          </div>
        </details>

        {/* RÉGIMEN B */}
        <details className="rounded border border-mercantil-line dark:border-mercantil-dark-line">
          <summary className="px-4 py-3 cursor-pointer flex items-center justify-between bg-mercantil-bg-soft/30">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-amber-500" />
              <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Régimen B — tasas bajas o curva flat/invertida</strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                {pctB.toFixed(1)}% de eventos
              </span>
            </span>
            <span className="text-xs text-mercantil-orange">click para detalle ▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Condición de disparo
              </div>
              <p className="text-xs">
                <strong>NO se cumple A</strong> Y al menos una de: TNX <strong>&lt; θ_low = {thetaLowPct}%</strong>
                <em> O </em> slope <strong>&lt; θ_flat = {thetaFlatBp} bp</strong>. Es el escenario de "RF cara,
                equity barato relativo": las tasas largas no compensan duración, la curva flat o invertida
                sugiere expectativa de recesión / corte de tasas.
              </p>
            </div>
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Acción al vencer un bullet
              </div>
              <p className="text-xs">
                Split del principal: <strong>(1 − X) = {(100 - parseFloat(xToEqPct))}%</strong> al bullet sintético
                largo, <strong>X = {xToEqPct}%</strong> al sleeve equity (sujeto a banda dura <strong>{eqtyMaxPct}%</strong>).
                Si el equity ya está en el tope, lo que sobra va al bullet. El intent es <strong>reciclar capital
                al activo más barato relativo</strong>: cuando RF está cara, rotamos parte hacia equity defensivo;
                cuando equity también está caro (banda llena), nos quedamos en RF.
              </p>
            </div>
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Cuándo es bueno que B esté presente
              </div>
              <p className="text-xs">
                B es el régimen del bootstrap moderno (2010–2021 fue casi todo B en USA). Es esperable que
                domine si la ventana histórica incluye QE. <strong>{pctB.toFixed(0)}% B</strong> con el bootstrap
                actual de 2006–2026 está dentro de lo normal. El parámetro <strong>X = {xToEqPct}%</strong> es
                el más sensible para diferenciar perfiles: conservador 30%, equilibrado 40%, agresivo 50%.
              </p>
            </div>
          </div>
        </details>

        {/* RÉGIMEN C */}
        <details className="rounded border border-mercantil-line dark:border-mercantil-dark-line">
          <summary className="px-4 py-3 cursor-pointer flex items-center justify-between bg-mercantil-bg-soft/30">
            <span className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm bg-mercantil-navy" />
              <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Régimen C — zona neutral</strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                {pctC.toFixed(1)}% de eventos
              </span>
            </span>
            <span className="text-xs text-mercantil-orange">click para detalle ▾</span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Condición de disparo
              </div>
              <p className="text-xs">
                <strong>NO A, NO B</strong>. Tasas en zona intermedia (entre θ_low y θ_high) y curva con slope
                moderado (entre θ_flat y θ_steep). El "estado base" de mercado normal — sin señales fuertes
                ni a favor de duración ni a favor de equity.
              </p>
            </div>
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Acción al vencer un bullet
              </div>
              <p className="text-xs">
                <strong>100% al bullet sintético siguiente</strong>. Se extiende la escalera tal cual, sin
                operaciones tácticas. La acción default cuando no hay señal clara. Mantiene la duración
                estructural del ladder y no introduce ruido por trading en mercados sin convicción.
              </p>
            </div>
            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Cuándo es bueno que C esté presente
              </div>
              <p className="text-xs">
                C ~20–30% es saludable — refleja que no todo el mercado está en extremo. Si es &gt;50%,
                el motor casi nunca está tomando decisiones tácticas (los thresholds son demasiado laxos);
                ajustar θ_high abajo y θ_steep abajo. Si es &lt;10%, el motor está siempre en modo táctico
                (los thresholds son demasiado estrictos); ajustar al revés.
              </p>
            </div>
          </div>
        </details>
      </div>

      <div className="mt-4 p-3 rounded bg-mercantil-bg-soft/40 border border-mercantil-line dark:border-mercantil-dark-line text-xs">
        <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">Para el cliente:</strong>{' '}
        la regla A/B/C no es una decisión discrecional — es una <strong>regla escrita, paired bootstrap,
        determinista dado el seed</strong>. Mercantil opera la regla; el cliente (o su comité, según el
        caso) calibra parámetros (X, eqty_max, thresholds) en la sesión inicial. Eso queda documentado
        en las directrices de inversión del entregable final.
      </div>
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
  // Mix de equity normalizado para el summary del card. El config guarda
  // pesos arbitrarios; acá los presentamos como % del sleeve (suma=100).
  const equityMixTotal = config.equityMix.reduce((s, m) => s + m.weight, 0);
  const equityMixSummary =
    config.equityMix.length === 0 || equityMixTotal <= 0
      ? 'sin tickers'
      : config.equityMix
          .map((m) => `${Math.round((m.weight / equityMixTotal) * 100)}% ${m.ticker}`)
          .join(' + ');
  // Texto contextual de la composición — el bloque de descripciones de la
  // card de equity se construye desde el mix actual en vez del antiguo
  // "USMV+SCHD" hardcoded.
  const isDefaultMix =
    config.equityMix.length === 2 &&
    config.equityMix.every((m) =>
      (m.ticker === 'USMV' || m.ticker === 'SCHD') &&
      Math.abs(m.weight / equityMixTotal - 0.5) < 1e-9,
    );
  // Catálogo (meta JSON o fallback inline) para mostrar info por ticker en
  // el bloque custom — descripción, categoría, proxies y caveats salen de ahí.
  const catalog = useEquityCatalogByTicker();

  // Ladder fijo a iShares iBonds UCITS USD Corp — único issuer ofrecido.
  // BulletShares UCITS quedó excluido (IG-only, distributing, cobertura
  // hasta 2030 solamente). El motor matemático opera paramétricamente
  // sobre el ladder; los tickers concretos son decisión operativa.
  const bulletIssuerLabel = 'iBonds UCITS (BlackRock)';
  const ladderProviderText =
    'Lineup inicial: 9 vintages reales investment-grade corporativos USD — BlackRock iBonds UCITS USD Corp Term ETFs Dec 2026–Dec 2034 (ID26.L–ID34.L). Inicialización equal-weight (~11% del sleeve por bullet). TTM máximo al inicio: ~8.6 años, limitado a la oferta UCITS hoy disponible. Es el motor de carry estable del portafolio. Para rollover táctico durante la simulación, el modelo asume continuidad de la oferta UCITS — nuevos vintages con TTM ~8y estarán disponibles cuando llegue el momento de reinvertir (consistente con el patrón histórico de BlackRock de lanzar nueva vintage anualmente desde 2014).';
  const residencyNote = config.clientResidency === 'us-resident'
    ? 'Cliente US-resident — selección elegible adicional: munis si se activa el toggle correspondiente. Estate tax US-situs no es problema (exención US$13M). El ladder ofrecido sigue siendo iBonds UCITS por simplicidad operativa.'
    : 'Cliente offshore (non-US Person) — solo UCITS por defecto. Si se elige US-registered en el dropdown, aplica withholding 30% sobre distribuciones + estate tax US-situs (exención US$60k). Ver Apéndice fiscal del PDF.';

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

      <div className="space-y-3">
        {/* SLEEVE BULLETS — diseño mejorado con left-border accent + gradient summary */}
        <details className="group rounded-lg border border-mercantil-line dark:border-mercantil-dark-line overflow-hidden bg-white dark:bg-mercantil-dark-panel transition-shadow hover:shadow-md">
          <summary
            className="px-4 py-3.5 cursor-pointer flex items-start justify-between gap-3 list-none border-l-4"
            style={{
              borderLeftColor: '#003566',
              background: 'linear-gradient(90deg, rgba(0,53,102,0.06) 0%, transparent 35%)',
            }}
          >
            <span className="flex items-baseline gap-2.5 flex-wrap min-w-0">
              <strong className="text-sm text-mercantil-ink dark:text-mercantil-dark-ink whitespace-nowrap">
                Sleeve Bullets
              </strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate font-medium tabular-nums">
                {bulletAumPct}% del AUM
              </span>
              <span className="text-xs text-mercantil-slate/70 dark:text-mercantil-dark-slate/70">
                · ladder {bulletIssuerLabel}
              </span>
            </span>
            <span className="text-xs text-mercantil-orange whitespace-nowrap flex-shrink-0 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <p>
              {ladderProviderText} Es el <strong>motor de carry estable</strong> del portafolio.
            </p>
            <p className="text-xs italic text-mercantil-slate dark:text-mercantil-dark-slate">
              {residencyNote}
            </p>

            {(() => {
              const ig = config.bulletMix.find((m) => m.ticker === 'iBonds')?.weight ?? 0;
              const iby = config.bulletMix.find((m) => m.ticker === 'iBonds-HY')?.weight ?? 0;
              const ghyg = config.bulletMix.find((m) => m.ticker === 'GHYG')?.weight ?? 0;
              const tot = ig + iby + ghyg;
              const wIG = tot > 0 ? ig / tot : 1;
              const wIBondsHY = tot > 0 ? iby / tot : 0;
              const wGHYG = tot > 0 ? ghyg / tot : 0;
              if (wIBondsHY < 1e-9 && wGHYG < 1e-9) return null;
              return (
                <div className="rounded border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/10 p-2.5">
                  <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1.5">
                    Mix interno renta fija
                  </div>
                  <ul className="text-xs space-y-1">
                    <li>• <strong>Ladder IG (iBonds UCITS)</strong>: {Math.round(wIG * 100)}% del sleeve · {(wIG * config.bulletTotalPct * 100).toFixed(1)}% del AUM</li>
                    {wIBondsHY > 1e-9 && (
                      <li>• <strong>Ladder HY (iBonds IU28+IU29)</strong>: {Math.round(wIBondsHY * 100)}% del sleeve · {(wIBondsHY * config.bulletTotalPct * 100).toFixed(1)}% del AUM
                        <span className="block text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate ml-3 mt-0.5">
                          Spread modelado: 400bp típico HY. Solo 2 vintages disponibles (BlackRock lanzó la familia Oct 2025). Cuando vencen, principal se reinvierte en GHYG si está activo, o en bullets IG sintéticos.
                        </span>
                      </li>
                    )}
                    {wGHYG > 1e-9 && (
                      <li>• <strong>HY perpetual (GHYG)</strong>: {Math.round(wGHYG * 100)}% del sleeve · {(wGHYG * config.bulletTotalPct * 100).toFixed(1)}% del AUM
                        <span className="block text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate ml-3 mt-0.5">
                          Sin vencimientos. Compounding con retornos observados del ETF. En cascada de pago se vende ANTES que los bullets reales. Rollover táctico A/B/C solo aplica al ladder IG.
                        </span>
                      </li>
                    )}
                  </ul>
                </div>
              );
            })()}

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Diversificación interna por plazo
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• <strong>Corto</strong> (&lt;3y) — 3 bullets ID26/27/28 → 33.3% del ladder, {(0.333 * config.bulletTotalPct * 100).toFixed(1)}% del AUM</li>
                <li>• <strong>Medio</strong> (3–6y) — 3 bullets ID29/30/31 → 33.3% del ladder, {(0.333 * config.bulletTotalPct * 100).toFixed(1)}% del AUM</li>
                <li>• <strong>Largo</strong> (6–9y) — 3 bullets ID32/33/34 → 33.3% del ladder, {(0.333 * config.bulletTotalPct * 100).toFixed(1)}% del AUM</li>
                <li className="text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">Sin tramo extra-largo en el lineup inicial — la oferta UCITS no incluye vintages &gt;2034 hoy. Vintages futuros (rollover) se modelan asumiendo continuidad de la oferta con TTM ~8y.</li>
              </ul>
            </div>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Diversificación interna de crédito
              </div>
              <ul className="text-xs space-y-0.5">
                <li>• <strong>Calidad crediticia del ladder IG</strong>: investment grade (rating BBB– o superior; promedio del índice ~A3/A-). El componente GHYG (si está activo) suma exposición HY rated BB/B/CCC.</li>
                <li>• <strong>Multi-emisor</strong>: cada iBond UCITS replica un índice Bloomberg corporativo con ~200–400 emisores (financieros, industriales, healthcare, comunicaciones, utilities, consumo). No hay exposure significativa a un emisor único — el peso máximo por emisor es típicamente &lt;3%.</li>
                <li>• <strong>Riesgo de default</strong>: tasa histórica IG anual ~0.10–0.30% (depende del rating). En el peor año (2008–2009) los IG tocaron ~0.40%. Sobre 9 bullets × ~300 emisores ≈ 2.700 bonos individuales, el efecto de un default específico es muy pequeño (típicamente recovery ~40% → loss-given-default por default ~0.18% del bono afectado).</li>
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

        {/* SLEEVE EQUITY — diseño mejorado */}
        <details className="group rounded-lg border border-mercantil-line dark:border-mercantil-dark-line overflow-hidden bg-white dark:bg-mercantil-dark-panel transition-shadow hover:shadow-md">
          <summary
            className="px-4 py-3.5 cursor-pointer flex items-start justify-between gap-3 list-none border-l-4"
            style={{
              borderLeftColor: '#F58220',
              background: 'linear-gradient(90deg, rgba(245,130,32,0.07) 0%, transparent 35%)',
            }}
          >
            <span className="flex items-baseline gap-2.5 flex-wrap min-w-0">
              <strong className="text-sm text-mercantil-ink dark:text-mercantil-dark-ink whitespace-nowrap">
                Sleeve Equity
              </strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate font-medium tabular-nums">
                {equityAumPct}% del AUM
              </span>
              <span className="text-xs text-mercantil-slate/70 dark:text-mercantil-dark-slate/70">
                · {equityMixSummary} · banda [{eqtyMin}%, {eqtyMax}%]
              </span>
            </span>
            <span className="text-xs text-mercantil-orange whitespace-nowrap flex-shrink-0 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <p>
              Sleeve <strong>defensivo de calidad</strong>: NO es un sleeve de crecimiento. La decisión fue priorizar
              downside protection sobre upside máximo, dado el horizonte y el costo (operativo y emocional)
              de un drawdown grande visible en el reporting trimestral.
            </p>

            <div>
              <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1">
                Composición actual
              </div>
              {isDefaultMix ? (
                <>
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
                </>
              ) : (
                <ul className="text-xs space-y-1.5">
                  {config.equityMix.map((m) => {
                    const t = catalog?.[m.ticker];
                    return (
                      <li key={m.ticker}>
                        <strong>
                          {m.ticker} ({Math.round((m.weight / equityMixTotal) * 100)}% del sleeve)
                        </strong>
                        {t && (
                          <>
                            {' '}— {t.name}. {t.description}.
                            {t.proxy && (
                              <span className="text-amber-700 dark:text-amber-300">
                                {' '}Historia spliceada con <strong>{t.proxy.ticker}</strong> ({t.proxy.covers}):{' '}
                                {t.proxy.rationale}
                              </span>
                            )}
                            {t.caveats.length > 0 && (
                              <ul className="mt-0.5 ml-2 space-y-0.5">
                                {t.caveats.map((c, i) => (
                                  <li
                                    key={i}
                                    className="text-[11px] text-amber-700 dark:text-amber-300"
                                  >
                                    ⚠ {c}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {isDefaultMix ? (
              <>
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
                    sectorial doméstica y la liquidez más profunda para los flujos del cliente. Si en una revisión
                    futura se valora diversificación geográfica, se puede sustituir 30–50% del sleeve por ACWX
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
              </>
            ) : (
              <CustomMixFactorBreakdown
                mix={config.equityMix}
                total={equityMixTotal}
                catalog={catalog}
              />
            )}

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

        {/* SLEEVE ACTIVOS REALES (4to sleeve, opcional) — solo se muestra si activado */}
        {config.realAssetsPct > 0 && (() => {
          const raPct = (config.realAssetsPct * 100).toFixed(0);
          const mixTot = config.realAssetsMix.reduce((s, m) => s + m.weight, 0);
          const wINFL = mixTot > 0 ? (config.realAssetsMix.find((m) => m.ticker === 'INFL')?.weight ?? 0) / mixTot : 0;
          const wRWO = mixTot > 0 ? (config.realAssetsMix.find((m) => m.ticker === 'RWO')?.weight ?? 0) / mixTot : 0;
          const wIEI = mixTot > 0 ? (config.realAssetsMix.find((m) => m.ticker === 'IEI')?.weight ?? 0) / mixTot : 0;
          const wIXC = mixTot > 0 ? (config.realAssetsMix.find((m) => m.ticker === 'IXC')?.weight ?? 0) / mixTot : 0;
          return (
            <details className="group rounded-lg border border-mercantil-line dark:border-mercantil-dark-line overflow-hidden bg-white dark:bg-mercantil-dark-panel transition-shadow hover:shadow-md">
              <summary
                className="px-4 py-3.5 cursor-pointer flex items-start justify-between gap-3 list-none border-l-4"
                style={{
                  borderLeftColor: '#0d9488',
                  background: 'linear-gradient(90deg, rgba(13,148,136,0.07) 0%, transparent 35%)',
                }}
              >
                <span className="flex items-baseline gap-2.5 flex-wrap min-w-0">
                  <strong className="text-sm text-mercantil-ink dark:text-mercantil-dark-ink whitespace-nowrap">
                    Sleeve Activos Reales
                  </strong>
                  <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate font-medium tabular-nums">
                    {raPct}% del AUM
                  </span>
                  <span className="text-xs text-mercantil-slate/70 dark:text-mercantil-dark-slate/70">
                    · INFL {Math.round(wINFL * 100)}% · RWO {Math.round(wRWO * 100)}% · IEI {Math.round(wIEI * 100)}% · IXC {Math.round(wIXC * 100)}%
                  </span>
                </span>
                <span className="text-xs text-mercantil-orange whitespace-nowrap flex-shrink-0 transition-transform group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="px-4 pb-4 pt-2 text-sm space-y-3">
                <p>
                  Sleeve de <strong>anti-inflación</strong> con activos reales. Composición default blendea: equity anti-inflación
                  (INFL, Horizon Kinetics), real estate (RWO), proxy de TIPS sintético (IEI) y commodities (IXC).
                  Cuando el toggle "Vista condicional de inflación" está activo, este sleeve ayuda a entender cómo se comporta
                  el portafolio en escenarios de inflación elevada.
                </p>
                <div className="rounded border border-teal-200 dark:border-teal-700/40 bg-teal-50 dark:bg-teal-900/10 p-2.5">
                  <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1.5">
                    Composición y rol operativo
                  </div>
                  <ul className="text-xs space-y-1">
                    <li>• <strong>INFL ({Math.round(wINFL * 100)}%)</strong>: Horizon Kinetics Inflation Beneficiaries — equity de empresas que se benefician estructuralmente de inflación (asset-light, royalty, commodities producers). <em>Data real desde 2021-01</em>; pre-2021 imputado con IXC como proxy.</li>
                    <li>• <strong>RWO ({Math.round(wRWO * 100)}%)</strong>: REITs globales — real estate con rentas tied-to-inflation. Vol ~15-20%, sensible a tasas.</li>
                    <li>• <strong>IEI ({Math.round(wIEI * 100)}%)</strong>: Treasury 3-7y — <em>proxy de TIPS sintético</em>. MVP. PR follow-up: TIPS UCITS (ITPS).</li>
                    <li>• <strong>IXC ({Math.round(wIXC * 100)}%)</strong>: Energy global — <em>proxy de commodities reales</em>. MVP. PR follow-up: Gold (SGLN), Infrastructure (INFR).</li>
                  </ul>
                </div>
                <div className="rounded border border-amber-200 dark:border-amber-700/40 bg-amber-50 dark:bg-amber-900/10 p-2.5">
                  <div className="font-semibold text-mercantil-ink dark:text-mercantil-dark-ink text-xs uppercase tracking-wider mb-1.5">
                    Reglas operativas del sleeve
                  </div>
                  <ul className="text-xs space-y-1">
                    <li>• <strong>Cascada de pago</strong>: en stress (préstamo/venta), el sleeve se vende ANTES que HY y bullets — orden: cash → equity → activos reales → HY → bullets[shortest]. Tiene liquidez similar a equity.</li>
                    <li>• <strong>Sin rollover táctico</strong>: no participa de los regímenes A/B/C (esos operan sobre el ladder IG).</li>
                    <li>• <strong>Rebalanceo</strong>: cuando el exceso de cash supera la banda, una proporción regresa a este sleeve según el target % en la allocation.</li>
                  </ul>
                </div>
                <p className="text-xs italic text-mercantil-slate dark:text-mercantil-dark-slate">
                  <strong>MVP scope</strong>: 3 componentes con data real existente del bootstrap (RWO real, IEI y IXC como proxies). En PR
                  follow-up agregaremos TIPS UCITS (ITPS), Gold UCITS (SGLN) e Infrastructure UCITS (INFR) desde EODHD para una
                  composición más fiel a "real assets" de un endowment institucional.
                </p>
              </div>
            </details>
          );
        })()}

        {/* SLEEVE CASH */}
        <details className="group rounded-lg border border-mercantil-line dark:border-mercantil-dark-line overflow-hidden bg-white dark:bg-mercantil-dark-panel transition-shadow hover:shadow-md">
          <summary
            className="px-4 py-3.5 cursor-pointer flex items-start justify-between gap-3 list-none border-l-4"
            style={{
              borderLeftColor: '#6B7280',
              background: 'linear-gradient(90deg, rgba(107,114,128,0.07) 0%, transparent 35%)',
            }}
          >
            <span className="flex items-baseline gap-2.5 flex-wrap min-w-0">
              <strong className="text-sm text-mercantil-ink dark:text-mercantil-dark-ink whitespace-nowrap">
                Sleeve Cash
              </strong>
              <span className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate font-medium tabular-nums">
                {cashAumPct}% del AUM
              </span>
              <span className="text-xs text-mercantil-slate/70 dark:text-mercantil-dark-slate/70">
                · BIL (T-Bills 1–3m) · target {(config.cashBandUpper * 100).toFixed(0)}%
              </span>
            </span>
            <span className="text-xs text-mercantil-orange whitespace-nowrap flex-shrink-0 transition-transform group-open:rotate-180">
              ▾
            </span>
          </summary>
          <div className="px-4 pb-4 pt-2 text-sm space-y-3">
            <p>
              <strong>Buffer de liquidez operativa</strong>. No es un sleeve de retorno — su rol es absorber
              flujos (aportes recurrentes, cuotas del préstamo si está activado, exceso de rebalanceo) y
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
                <li>• <strong>Absorción de aportes</strong>: los {fmtMoney(config.inflowBaseAnnual)}/yr de aportes entran como cash y se acumulan hasta superar la banda ({(config.cashBandUpper * 100).toFixed(0)}% del AUM total).</li>
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

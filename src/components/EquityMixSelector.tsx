/**
 * EquityMixSelector — multi-select + sliders del universo de equity custom.
 *
 * El catálogo (meta JSON + fallback inline) vive en hooks/useEquityMeta.ts.
 *
 * Default state: USMV 50% / SCHD 50% (lo del entregable PDF). El comité abre
 * el selector para EXPLORAR otros mixes; el default del entregable no cambia.
 *
 * Los pesos del UI son libres (0–100 por ticker). configToJobInput los
 * normaliza a suma=1 al envío. Acá mostramos el % normalizado bajo cada
 * slider en tiempo real para no esconder la suma efectiva.
 */
import { useMemo, useState } from 'react';
import { TICKERS, type Ticker } from '../data/market.generated';
import { useEquityMeta, type EquityMeta, type EquityTickerMeta } from '../hooks/useEquityMeta';

// =====================================================================
// COMPONENTE
// =====================================================================

type EquityMixSelectorProps = {
  value: ReadonlyArray<{ ticker: string; weight: number }>;
  onChange: (next: Array<{ ticker: string; weight: number }>) => void;
};

const SUPPORTED_TICKERS = new Set<string>(TICKERS as readonly string[]);

export default function EquityMixSelector({ value, onChange }: EquityMixSelectorProps) {
  const state = useEquityMeta();
  const [expanded, setExpanded] = useState(false);

  const meta: EquityMeta | null =
    state.kind === 'ok' || state.kind === 'fallback' ? state.meta : null;

  const activeWeights = useMemo<Record<string, number>>(() => {
    const out: Record<string, number> = {};
    for (const m of value) out[m.ticker] = m.weight;
    return out;
  }, [value]);

  const totalW = useMemo(() => value.reduce((s, m) => s + m.weight, 0), [value]);

  const isCustom = useMemo(() => {
    // El "default propuesta" = USMV 0.5 + SCHD 0.5 exactos. Cualquier otra cosa
    // es custom. Comparamos tras normalizar (totalW puede ser != 1 si el user
    // mueve sliders fuera de balance — la UI vive en pesos arbitrarios).
    if (value.length !== 2 || totalW <= 0) return true;
    const norm: Record<string, number> = {};
    for (const m of value) norm[m.ticker] = m.weight / totalW;
    return !(Math.abs((norm['USMV'] ?? 0) - 0.5) < 1e-9 && Math.abs((norm['SCHD'] ?? 0) - 0.5) < 1e-9);
  }, [value, totalW]);

  const toggle = (ticker: string) => {
    if (activeWeights[ticker] !== undefined) {
      const next = value.filter((m) => m.ticker !== ticker).map((m) => ({ ...m }));
      if (next.length === 0) return; // No permitir vaciar (mínimo 1)
      onChange(next);
    } else {
      // Al activar, arranca con peso = promedio de los activos (o 0.5 si vacío)
      const avg = totalW > 0 ? totalW / value.length : 0.5;
      onChange([...value.map((m) => ({ ...m })), { ticker, weight: avg }]);
    }
  };

  const setWeight = (ticker: string, weight: number) => {
    const clamped = Math.max(0, Math.min(1, weight));
    onChange(
      value.map((m) => (m.ticker === ticker ? { ticker, weight: clamped } : { ...m })),
    );
  };

  const resetToDefault = () => {
    onChange([
      { ticker: 'USMV', weight: 0.5 },
      { ticker: 'SCHD', weight: 0.5 },
    ]);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
          Mix actual:{' '}
          <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">
            {value.length > 0 ? (
              value
                .map(
                  (m) =>
                    `${m.ticker} ${totalW > 0 ? Math.round((m.weight / totalW) * 100) : 0}%`,
                )
                .join(' · ')
            ) : (
              <span className="text-red-600">sin tickers</span>
            )}
          </strong>
          {!isCustom && (
            <span className="ml-2 text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
              (default propuesta)
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {isCustom && (
            <button
              onClick={resetToDefault}
              type="button"
              className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate hover:text-mercantil-orange underline"
              title="Volver al mix por defecto del entregable (USMV 50% / SCHD 50%)"
            >
              Reset a default
            </button>
          )}
          <button
            onClick={() => setExpanded((v) => !v)}
            type="button"
            className="text-xs text-mercantil-orange hover:underline"
          >
            {expanded ? '▼ Cerrar selector' : '▶ Personalizar mix de equity'}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border border-mercantil-line dark:border-mercantil-dark-line rounded p-3 bg-mercantil-bg-soft/30 dark:bg-mercantil-dark-panel/50 space-y-3">
          {state.kind === 'loading' && (
            <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
              Cargando catálogo de tickers…
            </div>
          )}
          {state.kind === 'fallback' && (
            <div className="text-xs p-2 rounded border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
              ⚠ No se pudo cargar el catálogo desde GitHub Pages ({state.reason}). Usando
              versión inline; los datos pueden estar desactualizados respecto al backend.
            </div>
          )}
          {meta && (
            <>
              <p className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
                Universo del comité (alimentado por <code className="text-[10px]">estudios-a-la-medida</code>).
                Los pesos son libres dentro del sleeve de equity y se normalizan al
                100% al correr la simulación (suma actual:{' '}
                <strong>{(totalW * 100).toFixed(0)}%</strong>). Mínimo 1 ticker.
              </p>
              <div className="space-y-2">
                {meta.tickers.map((t) => (
                  <TickerCard
                    key={t.ticker}
                    meta={t}
                    isActive={activeWeights[t.ticker] !== undefined}
                    weight={activeWeights[t.ticker] ?? 0}
                    totalW={totalW}
                    canDeactivate={value.length > 1}
                    onToggle={() => toggle(t.ticker)}
                    onWeightChange={(w) => setWeight(t.ticker, w)}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// =====================================================================
// TickerCard — una card por ticker del catálogo
// =====================================================================

function TickerCard({
  meta,
  isActive,
  weight,
  totalW,
  canDeactivate,
  onToggle,
  onWeightChange,
}: {
  meta: EquityTickerMeta;
  isActive: boolean;
  weight: number;
  totalW: number;
  canDeactivate: boolean;
  onToggle: () => void;
  onWeightChange: (weight: number) => void;
}) {
  const supported = SUPPORTED_TICKERS.has(meta.ticker as Ticker);
  const normalizedPct = isActive && totalW > 0 ? (weight / totalW) * 100 : 0;

  return (
    <div
      className={`rounded border p-2.5 transition-colors ${
        isActive
          ? 'border-mercantil-orange/50 bg-white dark:bg-mercantil-dark-panel'
          : 'border-mercantil-line dark:border-mercantil-dark-line bg-white/50 dark:bg-mercantil-dark-panel/50'
      } ${!supported ? 'opacity-60' : ''}`}
    >
      <div className="flex items-start justify-between gap-3">
        <label className="flex items-start gap-2 cursor-pointer flex-1 min-w-0">
          <input
            type="checkbox"
            checked={isActive}
            disabled={!supported || (isActive && !canDeactivate)}
            onChange={onToggle}
            className="accent-mercantil-orange h-3.5 w-3.5 mt-0.5 flex-shrink-0"
            title={
              !supported
                ? `${meta.ticker} no está en el dataset del motor del planner (todavía).`
                : isActive && !canDeactivate
                  ? 'No podés desactivar el último ticker activo — el sleeve necesita al menos uno.'
                  : undefined
            }
          />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 flex-wrap">
              <strong className="text-mercantil-ink dark:text-mercantil-dark-ink text-sm">
                {meta.ticker}
              </strong>
              {meta.is_default && (
                <span
                  className="px-1.5 py-0.5 text-[10px] rounded bg-mercantil-orange/10 text-mercantil-orange border border-mercantil-orange/30"
                  title="Forma parte del default del entregable PDF."
                >
                  default
                </span>
              )}
              {meta.in_motor_base && (
                <span className="px-1.5 py-0.5 text-[10px] rounded bg-mercantil-navy/10 text-mercantil-navy dark:text-mercantil-dark-ink border border-mercantil-navy/30">
                  motor base
                </span>
              )}
              {meta.proxy && (
                <span
                  className="px-1.5 py-0.5 text-[10px] rounded bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 border border-amber-300 dark:border-amber-700"
                  title={`Pre-${meta.proxy.covers}: proxied con ${meta.proxy.ticker} (${meta.proxy.name}). ${meta.proxy.rationale}`}
                >
                  Proxy: {meta.proxy.ticker}
                </span>
              )}
              {!supported && (
                <span
                  className="px-1.5 py-0.5 text-[10px] rounded bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border border-red-300 dark:border-red-700"
                  title="Este ticker está en el meta del backend pero el dataset del motor del planner v2 aún no lo incluye."
                >
                  no en motor
                </span>
              )}
            </div>
            <div
              className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate mt-0.5"
              title={meta.name}
            >
              {meta.description}
            </div>
            {meta.caveats.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {meta.caveats.map((c, i) => (
                  <li
                    key={i}
                    className="text-[11px] text-amber-700 dark:text-amber-300 leading-tight"
                  >
                    ⚠ {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </label>
        {isActive && (
          <div className="flex flex-col items-end gap-0.5 flex-shrink-0 w-32">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={Math.round(weight * 100)}
              onChange={(e) => onWeightChange(parseInt(e.target.value, 10) / 100)}
              className="w-32 accent-mercantil-orange"
            />
            <div className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate tabular-nums">
              peso{' '}
              <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">
                {Math.round(weight * 100)}
              </strong>{' '}
              → <strong className="text-mercantil-orange">{normalizedPct.toFixed(0)}%</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * BulletMixSelector — mix interno del sleeve "renta fija".
 *
 * Tres componentes fijos:
 *  - iBonds UCITS USD Corp IG (ladder defined-maturity 2026–2034, modelo paramétrico)
 *  - iBonds UCITS USD HY Corp (mini-ladder IU28+IU29, defined-maturity 2028–2029)
 *  - GHYG (iShares Global HY Corp UCITS, perpetual)
 *
 * UX: slider 0–100 + input numérico draft local. Auto-balance al mover:
 * cuando el cliente mueve un slider, los OTROS se ajustan proporcionalmente
 * para mantener la suma en 100. Análogo a allocation principal — no hay
 * normalización al envío, la suma siempre vale 100 en el storage.
 */
import { useEffect, useRef, useState } from 'react';

export type BulletMixTicker = 'iBonds' | 'iBonds-HY' | 'GHYG';
export type BulletMixItem = { ticker: BulletMixTicker; weight: number };

type Props = {
  value: ReadonlyArray<BulletMixItem>;
  onChange: (next: BulletMixItem[]) => void;
};

const TICKERS: BulletMixTicker[] = ['iBonds', 'iBonds-HY', 'GHYG'];

const LABELS: Record<BulletMixTicker, { name: string; subtitle: string }> = {
  iBonds: {
    name: 'iBonds IG (BlackRock)',
    subtitle: 'Ladder defined-maturity 9 vintages Dec 2026–2034 + sintéticos. Investment-grade. Spread ~110bp.',
  },
  'iBonds-HY': {
    name: 'iBonds HY (BlackRock)',
    subtitle: 'Mini-ladder defined-maturity IU28 (Dec 2028) + IU29 (Dec 2029). High-yield, spread ~400bp. Lanzados Oct 2025 — solo 2 vintages disponibles hoy.',
  },
  GHYG: {
    name: 'GHYG',
    subtitle: 'iShares Global HY Corp UCITS (perpetual, ~$2B AUM). HY sin vencimiento — útil para complementar el HY ladder cuando se necesita exposición fuera del rango 2028–2029.',
  },
};

const DEFAULT_MIX: BulletMixItem[] = [
  { ticker: 'iBonds', weight: 1 },
  { ticker: 'iBonds-HY', weight: 0 },
  { ticker: 'GHYG', weight: 0 },
];

/**
 * Aplica auto-balance al cambiar el peso de un componente:
 * mantiene la suma en 1 reduciendo/aumentando proporcionalmente los otros.
 * Si otros suman 0 y el target baja, se distribuye el delta equal-weight.
 */
function rebalance(
  current: ReadonlyArray<BulletMixItem>,
  changedTicker: BulletMixTicker,
  newWeight: number,
): BulletMixItem[] {
  const target = Math.max(0, Math.min(1, newWeight));
  const others = current.filter((m) => m.ticker !== changedTicker);
  const othersSum = others.reduce((s, m) => s + m.weight, 0);
  const remaining = 1 - target;
  let nextOthers: BulletMixItem[];
  if (othersSum > 1e-9) {
    // Escala proporcional
    const factor = remaining / othersSum;
    nextOthers = others.map((m) => ({ ticker: m.ticker, weight: m.weight * factor }));
  } else if (others.length > 0) {
    // Otros estaban en 0: distribuir el remaining equal-weight entre ellos
    nextOthers = others.map((m) => ({ ticker: m.ticker, weight: remaining / others.length }));
  } else {
    nextOthers = [];
  }
  // Reconstruir en el mismo orden de TICKERS
  const byTicker = new Map<BulletMixTicker, number>();
  byTicker.set(changedTicker, target);
  for (const o of nextOthers) byTicker.set(o.ticker, o.weight);
  return TICKERS.map((t) => ({ ticker: t, weight: byTicker.get(t) ?? 0 }));
}

export default function BulletMixSelector({ value, onChange }: Props) {
  const totalW = value.reduce((s, m) => s + m.weight, 0);
  // isDefault: 100% iBonds IG, resto 0
  const isDefault =
    totalW > 0 &&
    (() => {
      const ig = value.find((m) => m.ticker === 'iBonds');
      return ig !== undefined && Math.abs(ig.weight / totalW - 1) < 1e-9;
    })();

  const getWeight = (ticker: BulletMixTicker): number =>
    value.find((m) => m.ticker === ticker)?.weight ?? 0;

  const setWeight = (ticker: BulletMixTicker, w: number) => {
    onChange(rebalance(value, ticker, w));
  };

  const reset = () => onChange(DEFAULT_MIX.map((m) => ({ ...m })));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
          Mix actual:{' '}
          <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">
            {TICKERS
              .map((t) => `${t} ${totalW > 0 ? Math.round((getWeight(t) / totalW) * 100) : 0}%`)
              .join(' · ')}
          </strong>
          {isDefault && (
            <span className="ml-2 text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
              (default — 100% IG)
            </span>
          )}
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-mercantil-orange hover:underline"
          >
            Reset al default (100% IG)
          </button>
        )}
      </div>

      <div className="space-y-2">
        {TICKERS.map((ticker) => {
          const w = getWeight(ticker);
          const pctNorm = totalW > 0 ? (w / totalW) * 100 : 0;
          return (
            <MixRow
              key={ticker}
              ticker={ticker}
              weight={w}
              pctNorm={pctNorm}
              onChange={(v) => setWeight(ticker, v)}
            />
          );
        })}
      </div>

      {totalW <= 0 && (
        <p className="text-[11px] text-red-600 dark:text-red-400">
          Suma 0% — subí al menos un componente para correr la simulación.
        </p>
      )}
    </div>
  );
}

type RowProps = {
  ticker: BulletMixTicker;
  weight: number; // 0..1
  pctNorm: number; // 0..100 normalizado
  onChange: (next: number) => void;
};

/**
 * Una fila del mix. Slider 0–100 + input numérico % con auto-balance.
 * El draft del input se commitea en blur; el slider commitea en cada cambio.
 */
function MixRow({ ticker, weight, pctNorm, onChange }: RowProps) {
  const label = LABELS[ticker];
  const [draft, setDraft] = useState<string>(`${Math.round(weight * 100)}`);
  const lastSyncedRef = useRef(weight);

  useEffect(() => {
    if (Math.abs(weight - lastSyncedRef.current) > 1e-9) {
      setDraft(`${Math.round(weight * 100)}`);
      lastSyncedRef.current = weight;
    }
  }, [weight]);

  const commit = (txt: string) => {
    const parsed = parseFloat(txt.trim());
    if (!Number.isFinite(parsed)) {
      setDraft(`${Math.round(weight * 100)}`);
      return;
    }
    const clampedPct = Math.max(0, Math.min(100, parsed));
    const next = clampedPct / 100;
    setDraft(`${Math.round(clampedPct)}`);
    if (Math.abs(next - weight) > 1e-9) {
      lastSyncedRef.current = next;
      onChange(next);
    }
  };

  return (
    <div className="flex items-start gap-3 py-1">
      <div className="flex-1 min-w-0">
        <div className="text-xs font-medium text-mercantil-ink dark:text-mercantil-dark-ink">
          {label.name}
          <span className="ml-2 text-mercantil-orange tabular-nums">
            {pctNorm.toFixed(0)}%
          </span>
        </div>
        <div className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate">
          {label.subtitle}
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round(weight * 100)}
            onChange={(e) => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isFinite(v)) return;
              const next = v / 100;
              setDraft(`${v}`);
              lastSyncedRef.current = next;
              onChange(next);
            }}
            className="flex-1 accent-mercantil-orange"
          />
          <input
            type="text"
            inputMode="decimal"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur();
              if (e.key === 'Escape') {
                setDraft(`${Math.round(weight * 100)}`);
                (e.currentTarget as HTMLInputElement).blur();
              }
            }}
            onFocus={(e) => e.currentTarget.select()}
            className="w-14 px-2 py-1 rounded border border-mercantil-line dark:border-mercantil-dark-line bg-white dark:bg-mercantil-dark-panel text-mercantil-ink dark:text-mercantil-dark-ink text-xs text-right tabular-nums"
          />
          <span className="text-[11px] text-mercantil-slate dark:text-mercantil-dark-slate">%</span>
        </div>
      </div>
    </div>
  );
}

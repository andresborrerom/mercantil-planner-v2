/**
 * RealAssetsMixSelector — mix interno del sleeve "Activos Reales".
 *
 * Tres componentes fijos (MVP con data existente del bootstrap):
 *  - RWO: SPDR Dow Jones Global REIT (real estate global, real)
 *  - IEI: iShares 3-7y Treasury (proxy de TIPS sintético — duration intermedia
 *        con inflation kicker via CPI bootstrap)
 *  - IXC: iShares Global Energy (proxy de commodities reales)
 *
 * UX igual a BulletMixSelector: slider 0–100 + input numérico + auto-balance.
 *
 * En PR follow-up se agregarán TIPS, Gold y Infrastructure UCITS reales
 * desde EODHD para reemplazar los proxies.
 */
import { useEffect, useRef, useState } from 'react';

export type RealAssetsMixTicker = 'RWO' | 'IEI' | 'IXC';
export type RealAssetsMixItem = { ticker: RealAssetsMixTicker; weight: number };

type Props = {
  value: ReadonlyArray<RealAssetsMixItem>;
  onChange: (next: RealAssetsMixItem[]) => void;
};

const TICKERS: RealAssetsMixTicker[] = ['RWO', 'IEI', 'IXC'];

const LABELS: Record<RealAssetsMixTicker, { name: string; subtitle: string }> = {
  RWO: {
    name: 'RWO — REITs globales',
    subtitle: 'SPDR Dow Jones Global REIT (real estate). Cobertura US + desarrollados + emergentes. Sensible a tasas y demanda real.',
  },
  IEI: {
    name: 'IEI — Treasury 3-7y (proxy de TIPS sintético)',
    subtitle: 'iShares Treasury 3-7y. MVP: usamos esta serie como proxy de TIPS sintético. Captura duración intermedia. En PR follow-up agregaremos TIPS UCITS reales (ITPS) desde EODHD.',
  },
  IXC: {
    name: 'IXC — Energy global (proxy de commodities)',
    subtitle: 'iShares Global Energy. MVP: usamos esta serie como proxy de exposición a commodities reales. En PR follow-up agregaremos Gold (SGLN) e Infrastructure (INFR).',
  },
};

const DEFAULT_MIX: RealAssetsMixItem[] = [
  { ticker: 'RWO', weight: 0.40 },
  { ticker: 'IEI', weight: 0.40 },
  { ticker: 'IXC', weight: 0.20 },
];

function rebalance(
  current: ReadonlyArray<RealAssetsMixItem>,
  changedTicker: RealAssetsMixTicker,
  newWeight: number,
): RealAssetsMixItem[] {
  const target = Math.max(0, Math.min(1, newWeight));
  const others = current.filter((m) => m.ticker !== changedTicker);
  const othersSum = others.reduce((s, m) => s + m.weight, 0);
  const remaining = 1 - target;
  let nextOthers: RealAssetsMixItem[];
  if (othersSum > 1e-9) {
    const factor = remaining / othersSum;
    nextOthers = others.map((m) => ({ ticker: m.ticker, weight: m.weight * factor }));
  } else if (others.length > 0) {
    nextOthers = others.map((m) => ({ ticker: m.ticker, weight: remaining / others.length }));
  } else {
    nextOthers = [];
  }
  const byTicker = new Map<RealAssetsMixTicker, number>();
  byTicker.set(changedTicker, target);
  for (const o of nextOthers) byTicker.set(o.ticker, o.weight);
  return TICKERS.map((t) => ({ ticker: t, weight: byTicker.get(t) ?? 0 }));
}

export default function RealAssetsMixSelector({ value, onChange }: Props) {
  const totalW = value.reduce((s, m) => s + m.weight, 0);
  const isDefault =
    totalW > 0 &&
    (() => {
      const r = value.find((m) => m.ticker === 'RWO');
      const i = value.find((m) => m.ticker === 'IEI');
      const x = value.find((m) => m.ticker === 'IXC');
      return r && i && x &&
        Math.abs(r.weight / totalW - 0.40) < 1e-2 &&
        Math.abs(i.weight / totalW - 0.40) < 1e-2 &&
        Math.abs(x.weight / totalW - 0.20) < 1e-2;
    })();

  const getWeight = (ticker: RealAssetsMixTicker): number =>
    value.find((m) => m.ticker === ticker)?.weight ?? 0;

  const setWeight = (ticker: RealAssetsMixTicker, w: number) => {
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
              (default — 40/40/20)
            </span>
          )}
        </div>
        {!isDefault && (
          <button
            type="button"
            onClick={reset}
            className="text-[11px] text-mercantil-orange hover:underline"
          >
            Reset al default (40/40/20)
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
  ticker: RealAssetsMixTicker;
  weight: number;
  pctNorm: number;
  onChange: (next: number) => void;
};

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
          <span className="ml-2 text-mercantil-orange tabular-nums">{pctNorm.toFixed(0)}%</span>
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

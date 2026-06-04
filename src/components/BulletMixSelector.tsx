/**
 * BulletMixSelector — mix interno del sleeve "renta fija".
 *
 * Dos componentes fijos:
 *  - iBonds UCITS USD Corp IG (ladder defined-maturity, modelo paramétrico)
 *  - GHYG (iShares Global HY Corp UCITS, perpetual, retornos del bootstrap)
 *
 * UI análoga a EquityMixSelector pero simplificada a estos 2 ítems. Slider
 * + input numérico (draft local) por componente. Display del % normalizado
 * en vivo. Reset al default (100/0).
 */
import { useEffect, useRef, useState } from 'react';

export type BulletMixItem = { ticker: 'iBonds' | 'GHYG'; weight: number };

type Props = {
  value: ReadonlyArray<BulletMixItem>;
  onChange: (next: BulletMixItem[]) => void;
};

const LABELS: Record<BulletMixItem['ticker'], { name: string; subtitle: string }> = {
  iBonds: {
    name: 'iBonds UCITS USD Corp IG',
    subtitle: 'Ladder defined-maturity, Dec 2026–2034 + sintéticos. Investment-grade.',
  },
  GHYG: {
    name: 'GHYG',
    subtitle: 'iShares Global HY Corp UCITS (perpetual). High-yield, ~$2B AUM.',
  },
};

const DEFAULT_MIX: BulletMixItem[] = [
  { ticker: 'iBonds', weight: 1 },
  { ticker: 'GHYG', weight: 0 },
];

export default function BulletMixSelector({ value, onChange }: Props) {
  const totalW = value.reduce((s, m) => s + m.weight, 0);
  const isDefault =
    value.length === 2 &&
    totalW > 0 &&
    (() => {
      const ig = value.find((m) => m.ticker === 'iBonds');
      const hy = value.find((m) => m.ticker === 'GHYG');
      return ig && hy && Math.abs(ig.weight / totalW - 1) < 1e-9 && Math.abs(hy.weight / totalW) < 1e-9;
    })();

  const getWeight = (ticker: BulletMixItem['ticker']): number =>
    value.find((m) => m.ticker === ticker)?.weight ?? 0;

  const setWeight = (ticker: BulletMixItem['ticker'], w: number) => {
    const clamped = Math.max(0, Math.min(1, w));
    const exists = value.some((m) => m.ticker === ticker);
    const next: BulletMixItem[] = exists
      ? value.map((m) => (m.ticker === ticker ? { ticker, weight: clamped } : { ...m }))
      : [...value.map((m) => ({ ...m })), { ticker, weight: clamped }];
    onChange(next);
  };

  const reset = () => onChange(DEFAULT_MIX.map((m) => ({ ...m })));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-xs text-mercantil-slate dark:text-mercantil-dark-slate">
          Mix actual:{' '}
          <strong className="text-mercantil-ink dark:text-mercantil-dark-ink">
            {value
              .map((m) => `${m.ticker} ${totalW > 0 ? Math.round((m.weight / totalW) * 100) : 0}%`)
              .join(' · ')}
          </strong>
          {isDefault && (
            <span className="ml-2 text-mercantil-slate/70 dark:text-mercantil-dark-slate/70 italic">
              (default — sin HY)
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
        {(['iBonds', 'GHYG'] as const).map((ticker) => {
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
  ticker: BulletMixItem['ticker'];
  weight: number; // 0..1 raw (no normalizado)
  pctNorm: number; // 0..100 normalizado
  onChange: (next: number) => void;
};

/**
 * Una fila del mix. Slider (rango 0–1) + input numérico draft local con %
 * relativo (0–100) para edición fina. Edita el peso raw del mix; el caller
 * normaliza al envío.
 */
function MixRow({ ticker, weight, pctNorm, onChange }: RowProps) {
  const label = LABELS[ticker];
  // Draft para edición fina: el usuario tipea % raw (0..100). Si quiere 30%
  // tipea 30 → weight = 0.30. Al blur, propaga.
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

/**
 * Hook + cache singleton para el panel TTM bucketed de bullets, servido por
 * estudios-a-la-medida via GitHub Pages. Sigue el mismo patrón que
 * useEquityMeta — cache singleton + useSyncExternalStore.
 *
 * URL canónica:
 *   https://andresborrerom.github.io/estudios-a-la-medida/data/bullets_ttm_panel.json
 *
 * Si el fetch falla, el state es { kind: 'unavailable' } y el motor revierte
 * al modo paramétrico actual (sin bucket bootstrap). El usuario lo ve como
 * "modo bucket bootstrap deshabilitado por falta de panel".
 */
import { useSyncExternalStore } from 'react';
import type { TTMPanel } from '../domain/bulletBucketBootstrap';

export const TTM_PANEL_URL =
  'https://andresborrerom.github.io/estudios-a-la-medida/data/bullets_ttm_panel.json';

export type PanelLoadState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'ok'; panel: TTMPanel }
  | { kind: 'unavailable'; reason: string };

let cachedState: PanelLoadState = { kind: 'idle' };
const subscribers = new Set<() => void>();

function notify(s: PanelLoadState) {
  cachedState = s;
  subscribers.forEach((fn) => fn());
}

async function loadPanel(): Promise<void> {
  if (cachedState.kind === 'ok' || cachedState.kind === 'loading') return;
  notify({ kind: 'loading' });
  try {
    const ctrl = new AbortController();
    const timeoutId = setTimeout(() => ctrl.abort(), 10000);
    const res = await fetch(TTM_PANEL_URL, { signal: ctrl.signal });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as TTMPanel;
    if (!json.panel || !json.panel.ig || !json.panel.hy) {
      throw new Error('panel inválido — sin sleeves ig/hy');
    }
    notify({ kind: 'ok', panel: json });
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    notify({ kind: 'unavailable', reason });
  }
}

function subscribe(cb: () => void): () => void {
  subscribers.add(cb);
  if (cachedState.kind === 'idle') void loadPanel();
  return () => {
    subscribers.delete(cb);
  };
}

export function useTTMPanel(): PanelLoadState {
  return useSyncExternalStore(
    subscribe,
    () => cachedState,
    () => cachedState,
  );
}

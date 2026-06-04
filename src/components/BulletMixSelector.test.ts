/**
 * Tests del helper `rebalance` del BulletMixSelector.
 *
 * Ground truth invariantes:
 *  - Suma siempre = 1 después de rebalance
 *  - newWeight del target respetado
 *  - Otros se reducen/aumentan proporcionalmente al peso actual
 *  - Edge cases: target=0, target=1, otros=0
 */
import { describe, it, expect } from 'vitest';

// Replico el helper para testearlo aislado (es una función pura del componente)
type BulletMixTicker = 'iBonds' | 'iBonds-HY' | 'GHYG';
type BulletMixItem = { ticker: BulletMixTicker; weight: number };
const TICKERS: BulletMixTicker[] = ['iBonds', 'iBonds-HY', 'GHYG'];

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
    const factor = remaining / othersSum;
    nextOthers = others.map((m) => ({ ticker: m.ticker, weight: m.weight * factor }));
  } else if (others.length > 0) {
    nextOthers = others.map((m) => ({ ticker: m.ticker, weight: remaining / others.length }));
  } else {
    nextOthers = [];
  }
  const byTicker = new Map<BulletMixTicker, number>();
  byTicker.set(changedTicker, target);
  for (const o of nextOthers) byTicker.set(o.ticker, o.weight);
  return TICKERS.map((t) => ({ ticker: t, weight: byTicker.get(t) ?? 0 }));
}

const sum = (arr: ReadonlyArray<BulletMixItem>) => arr.reduce((s, m) => s + m.weight, 0);

describe('rebalance — invariantes', () => {
  it('suma siempre 1 después de cambiar cualquier slider', () => {
    const initial: BulletMixItem[] = [
      { ticker: 'iBonds', weight: 0.5 },
      { ticker: 'iBonds-HY', weight: 0.3 },
      { ticker: 'GHYG', weight: 0.2 },
    ];
    for (const t of TICKERS) {
      for (const newW of [0, 0.25, 0.5, 0.75, 1]) {
        const out = rebalance(initial, t, newW);
        expect(sum(out)).toBeCloseTo(1, 10);
      }
    }
  });

  it('newWeight del target se respeta exactamente', () => {
    const initial: BulletMixItem[] = [
      { ticker: 'iBonds', weight: 0.5 },
      { ticker: 'iBonds-HY', weight: 0.3 },
      { ticker: 'GHYG', weight: 0.2 },
    ];
    const out = rebalance(initial, 'iBonds-HY', 0.6);
    const targetItem = out.find((m) => m.ticker === 'iBonds-HY');
    expect(targetItem?.weight).toBe(0.6);
  });

  it('proporciones de los otros se preservan al rebalancear', () => {
    // iBonds 0.5, GHYG 0.5 (ratio 1:1) → cambio iBonds-HY de 0 a 0.4 → otros bajan a 0.3 cada uno
    const initial: BulletMixItem[] = [
      { ticker: 'iBonds', weight: 0.5 },
      { ticker: 'iBonds-HY', weight: 0 },
      { ticker: 'GHYG', weight: 0.5 },
    ];
    const out = rebalance(initial, 'iBonds-HY', 0.4);
    const ib = out.find((m) => m.ticker === 'iBonds')?.weight ?? 0;
    const gh = out.find((m) => m.ticker === 'GHYG')?.weight ?? 0;
    expect(ib).toBeCloseTo(0.3, 10);
    expect(gh).toBeCloseTo(0.3, 10);
  });

  it('si otros son 0 y subo el target, los otros se distribuyen equal-weight', () => {
    const initial: BulletMixItem[] = [
      { ticker: 'iBonds', weight: 0 },
      { ticker: 'iBonds-HY', weight: 1 },
      { ticker: 'GHYG', weight: 0 },
    ];
    const out = rebalance(initial, 'iBonds-HY', 0.5);
    const ib = out.find((m) => m.ticker === 'iBonds')?.weight ?? 0;
    const gh = out.find((m) => m.ticker === 'GHYG')?.weight ?? 0;
    expect(ib).toBeCloseTo(0.25, 10); // remaining 0.5 / 2 otros
    expect(gh).toBeCloseTo(0.25, 10);
  });

  it('target = 1 → otros van a 0', () => {
    const initial: BulletMixItem[] = [
      { ticker: 'iBonds', weight: 0.5 },
      { ticker: 'iBonds-HY', weight: 0.3 },
      { ticker: 'GHYG', weight: 0.2 },
    ];
    const out = rebalance(initial, 'iBonds', 1);
    expect(out.find((m) => m.ticker === 'iBonds')?.weight).toBe(1);
    expect(out.find((m) => m.ticker === 'iBonds-HY')?.weight).toBe(0);
    expect(out.find((m) => m.ticker === 'GHYG')?.weight).toBe(0);
  });

  it('target = 0 → otros suben proporcional para sumar 1', () => {
    const initial: BulletMixItem[] = [
      { ticker: 'iBonds', weight: 0.5 },
      { ticker: 'iBonds-HY', weight: 0.3 },
      { ticker: 'GHYG', weight: 0.2 },
    ];
    const out = rebalance(initial, 'iBonds', 0);
    const ihy = out.find((m) => m.ticker === 'iBonds-HY')?.weight ?? 0;
    const gh = out.find((m) => m.ticker === 'GHYG')?.weight ?? 0;
    // Original: iBonds-HY:GHYG = 0.3:0.2 = 3:2 → escalado a 1.0 → 0.6:0.4
    expect(ihy).toBeCloseTo(0.6, 10);
    expect(gh).toBeCloseTo(0.4, 10);
  });

  it('clamp: newWeight > 1 se trata como 1', () => {
    const initial: BulletMixItem[] = [
      { ticker: 'iBonds', weight: 0.5 },
      { ticker: 'iBonds-HY', weight: 0.3 },
      { ticker: 'GHYG', weight: 0.2 },
    ];
    const out = rebalance(initial, 'iBonds', 1.5);
    expect(out.find((m) => m.ticker === 'iBonds')?.weight).toBe(1);
    expect(sum(out)).toBe(1);
  });

  it('clamp: newWeight < 0 se trata como 0', () => {
    const initial: BulletMixItem[] = [
      { ticker: 'iBonds', weight: 0.5 },
      { ticker: 'iBonds-HY', weight: 0.3 },
      { ticker: 'GHYG', weight: 0.2 },
    ];
    const out = rebalance(initial, 'iBonds', -0.5);
    expect(out.find((m) => m.ticker === 'iBonds')?.weight).toBe(0);
    expect(sum(out)).toBe(1);
  });

  it('output siempre en orden TICKERS', () => {
    const initial: BulletMixItem[] = [
      { ticker: 'GHYG', weight: 0.5 },
      { ticker: 'iBonds', weight: 0.3 },
      { ticker: 'iBonds-HY', weight: 0.2 },
    ];
    const out = rebalance(initial, 'GHYG', 0.4);
    expect(out.map((m) => m.ticker)).toEqual(['iBonds', 'iBonds-HY', 'GHYG']);
  });
});

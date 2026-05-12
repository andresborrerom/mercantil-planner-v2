/**
 * arena.test.ts — Tests del orquestador end-to-end.
 *
 * Cubre:
 *   - Helpers: createExtensionBullets, buildMaturityEventSchedule, buildShortestIdxPath
 *   - Forma del output: aumPath, sleevePath, loanBalancePath, stats, finalState
 *   - Integración con bootstrap real + buildArenaMarket
 *   - Régimen forzado (escenario A puro / C puro)
 *   - Loan triggered: liability creada, principal sin sumar a cash
 *   - BuyAndHold: sin eventos de maturity en horizons cortos donde nada vence
 */
import { describe, expect, it } from 'vitest';
import {
  buildArenaMarket,
  buildMaturityEventSchedule,
  buildShortestIdxPath,
  createExtensionBullets,
  runArena,
  type ArenaConfig,
  type ArenaMarket,
} from './arena';
import type { BulletDef } from './bullets';
import { defaultBulletLineup } from './bullets';
import { makeLoanEvent } from './cashflow';
import type { RolloverPlan } from './rollover';
import {
  DEFAULT_BOOTSTRAP_CONFIG,
  getYieldBounds,
  runBootstrap,
} from './bootstrap';
import type { ExpandedPortfolio } from './types';

// =====================================================================
// Helpers
// =====================================================================

function makeBullets(maturities: number[]): BulletDef[] {
  return maturities.map((m, i) => ({
    name: `B${i}`,
    maturityY: m,
    durInitY: m * 0.93,
    isSynthetic: false,
  }));
}

function flatYieldPaths(
  curve: { IRX: number; FVX: number; TNX: number; TYX: number },
  nSims: number,
  H: number,
): ArenaMarket['yieldPaths'] {
  const total = nSims * H;
  return {
    IRX: Float32Array.from({ length: total }, () => curve.IRX),
    FVX: Float32Array.from({ length: total }, () => curve.FVX),
    TNX: Float32Array.from({ length: total }, () => curve.TNX),
    TYX: Float32Array.from({ length: total }, () => curve.TYX),
  };
}

function constantBulletReturns(
  nBullets: number,
  nSims: number,
  H: number,
  rMonthly: number,
): Float32Array[] {
  return Array.from({ length: nBullets }, () =>
    Float32Array.from({ length: nSims * H }, () => rMonthly),
  );
}

function basicPlan(bullets: BulletDef[]): RolloverPlan {
  return {
    bullets,
    bulletTotalPct: 0.65,
    equityPct: 0.30,
    cashPct: 0.05,
    eqtyMin: 0.0,
    eqtyMax: 0.50,
    equityMix: [{ ticker: 'USMV', weight: 1.0 }],
    cashTicker: 'BIL',
    initialSpread: 0,
  };
}

// =====================================================================
// HELPERS
// =====================================================================

describe('createExtensionBullets', () => {
  it('genera n extensiones spacedY arriba del bullet más largo', () => {
    const real = makeBullets([1, 3, 5]);
    const ext = createExtensionBullets(real, 3, 1.0);
    expect(ext).toHaveLength(3);
    expect(ext[0].maturityY).toBe(6);
    expect(ext[1].maturityY).toBe(7);
    expect(ext[2].maturityY).toBe(8);
    expect(ext[0].name).toBe('EXT01');
    expect(ext[2].name).toBe('EXT03');
    expect(ext[0].durInitY).toBeCloseTo(0.93 * 6, 10);
    expect(ext[0].isSynthetic).toBe(true);
  });

  it('respeta extensionSpacingY no-1', () => {
    const real = makeBullets([5]);
    const ext = createExtensionBullets(real, 2, 0.5);
    expect(ext[0].maturityY).toBeCloseTo(5.5, 10);
    expect(ext[1].maturityY).toBeCloseTo(6.0, 10);
  });

  it('nExtensions=0 → array vacío', () => {
    expect(createExtensionBullets(makeBullets([1, 3]), 0)).toEqual([]);
  });

  it('rechaza realBullets vacío', () => {
    expect(() => createExtensionBullets([], 5)).toThrow();
  });
});

describe('buildMaturityEventSchedule', () => {
  it('produce eventos en orden cronológico, asigna extensiones consecutivas', () => {
    // maturity_month: real=[12, 6, 24], ext=[36, 48]. n_real=3, n_ext=2.
    const mat = new Int32Array([12, 6, 24, 36, 48]);
    const evs = buildMaturityEventSchedule(mat, 3, 2, 60);
    expect(evs).toHaveLength(5);
    // Ordenados por maturity_month asc
    expect(evs[0]).toEqual({ eventT: 6, matureBIdx: 1, destBIdx: 3 });  // B[1] @ 6m → dest=ext0=idx3
    expect(evs[1]).toEqual({ eventT: 12, matureBIdx: 0, destBIdx: 4 }); // B[0] @ 12m → dest=ext1=idx4
    expect(evs[2]).toEqual({ eventT: 24, matureBIdx: 2, destBIdx: -1 }); // sin extensiones
    expect(evs[3]).toEqual({ eventT: 36, matureBIdx: 3, destBIdx: -1 });
    expect(evs[4]).toEqual({ eventT: 48, matureBIdx: 4, destBIdx: -1 });
  });

  it('eventos fuera del horizonte se descartan', () => {
    const mat = new Int32Array([6, 60, 240]);
    const evs = buildMaturityEventSchedule(mat, 3, 0, 36);
    expect(evs).toHaveLength(1);
    expect(evs[0].eventT).toBe(6);
  });
});

describe('buildShortestIdxPath', () => {
  it('devuelve el bullet vivo más corto para cada t', () => {
    // maturity_month: [12, 6, 24]
    const mat = new Int32Array([12, 6, 24]);
    const path = buildShortestIdxPath(mat, 24);
    expect(path[0]).toBe(1);   // B[1] vence en 6 (más corto vivo)
    expect(path[5]).toBe(1);   // B[1] aún no vence (6 > 5)
    expect(path[6]).toBe(0);   // B[1] vence; B[0] vence en 12 es el más corto
    expect(path[12]).toBe(2);  // B[0] vence; solo B[2] queda
    expect(path[24]).toBe(0);  // nada vivo → fallback 0
  });
});

// =====================================================================
// runArena — forma de output
// =====================================================================

describe('runArena — forma de output', () => {
  it('produce aumPath, sleevePath, loanBalancePath con dimensiones correctas', () => {
    const bullets = makeBullets([1, 3, 5]);
    const plan = basicPlan(bullets);
    const nSims = 20;
    const H = 24;
    const nTotal = 3 + 10; // real + default extensions
    const market: ArenaMarket = {
      bulletReturns: constantBulletReturns(nTotal, nSims, H, 0.004),
      equityReturns: Float32Array.from({ length: nSims * H }, () => 0.006),
      cashReturns: Float32Array.from({ length: nSims * H }, () => 0.003),
      yieldPaths: flatYieldPaths({ IRX: 0.03, FVX: 0.035, TNX: 0.04, TYX: 0.045 }, nSims, H),
      nSims,
      horizonMonths: H,
    };
    const config: ArenaConfig = {
      rolloverPlan: plan,
      initialAumUsd: 1_000_000,
      inflowBaseAnnual: 250_000,
    };
    const out = runArena(config, market);
    expect(out.aumPath.length).toBe(nSims * (H + 1));
    expect(out.sleevePath.length).toBe(nSims * (H + 1) * 3);
    expect(out.loanBalancePath.length).toBe(nSims * (H + 1));
    expect(out.allBullets).toHaveLength(nTotal);
    // AUM inicial debe coincidir per sim (deterministic init)
    for (let s = 0; s < nSims; s++) {
      expect(out.aumPath[s * (H + 1)]).toBeCloseTo(1_000_000, 2);
    }
  });

  it('outputBulletHoldings opt-in produce buffer [nSims × (H+1) × nTotal]', () => {
    const bullets = makeBullets([1]);
    const plan = basicPlan(bullets);
    const nSims = 5;
    const H = 12;
    const nTotal = 1 + 10;
    const market: ArenaMarket = {
      bulletReturns: constantBulletReturns(nTotal, nSims, H, 0),
      equityReturns: new Float32Array(nSims * H),
      cashReturns: new Float32Array(nSims * H),
      yieldPaths: flatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, nSims, H),
      nSims,
      horizonMonths: H,
    };
    const out = runArena(
      { rolloverPlan: plan, initialAumUsd: 1_000_000, inflowBaseAnnual: 0, nExtensions: 10 },
      market,
      { outputBulletHoldings: true },
    );
    expect(out.bulletHoldings).toBeInstanceOf(Float64Array);
    expect(out.bulletHoldings!.length).toBe(nSims * (H + 1) * nTotal);
  });
});

// =====================================================================
// Comportamiento determinístico
// =====================================================================

describe('runArena — escenario determinístico (returns 0, sin loan, sin inflow)', () => {
  it('wealth se mantiene en initialAumUsd cuando no hay returns ni flujos', () => {
    // Bullet único vence después del horizonte → no hay eventos
    const bullets = makeBullets([5]);
    const plan = basicPlan(bullets);
    const nSims = 10;
    const H = 12;
    const nTotal = 1 + 10;
    const market: ArenaMarket = {
      bulletReturns: constantBulletReturns(nTotal, nSims, H, 0),
      equityReturns: new Float32Array(nSims * H),
      cashReturns: new Float32Array(nSims * H),
      yieldPaths: flatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, nSims, H),
      nSims,
      horizonMonths: H,
    };
    const out = runArena({
      rolloverPlan: plan,
      initialAumUsd: 1_000_000,
      inflowBaseAnnual: 0,
      inflowGrowth: 0,
      nExtensions: 10,
    }, market);

    for (let s = 0; s < nSims; s++) {
      expect(out.aumPath[s * (H + 1) + H]).toBeCloseTo(1_000_000, 2);
      expect(out.loanBalancePath[s * (H + 1) + H]).toBe(0);
    }
    expect(out.events).toHaveLength(0);
    expect(out.regimeCounts).toEqual({ A: 0, B: 0, C: 0 });
  });
});

describe('runArena — régimen C forzado', () => {
  it('curva neutral → todos los rollovers son C, principal va a dest bullet', () => {
    // Bullet 0.5y vence en mes 6
    const bullets: BulletDef[] = [
      { name: 'EARLY', maturityY: 0.5, durInitY: 0.5 * 0.93, isSynthetic: true },
    ];
    const plan = basicPlan(bullets);
    const nSims = 20;
    const H = 12;
    const nTotal = 1 + 5;
    const market: ArenaMarket = {
      bulletReturns: constantBulletReturns(nTotal, nSims, H, 0),
      equityReturns: new Float32Array(nSims * H),
      cashReturns: new Float32Array(nSims * H),
      // TNX 4%, slope 100bp → C
      yieldPaths: flatYieldPaths({ IRX: 0.030, FVX: 0.035, TNX: 0.040, TYX: 0.045 }, nSims, H),
      nSims,
      horizonMonths: H,
    };
    const out = runArena({
      rolloverPlan: plan,
      initialAumUsd: 1_000_000,
      inflowBaseAnnual: 0,
      nExtensions: 5,
    }, market);

    expect(out.events).toHaveLength(1);
    expect(out.events[0].matureBullet).toBe('EARLY');
    expect(out.events[0].destBullet).toBe('EXT01');
    expect(out.regimeCounts.C).toBe(nSims);
    expect(out.regimeCounts.A).toBe(0);
    expect(out.regimeCounts.B).toBe(0);
  });
});

describe('runArena — extensiones agotadas → FALLBACK_EQUITY', () => {
  it('cuando dest=-1, principal va a equity y evento se logea como fallback', () => {
    const bullets: BulletDef[] = [
      { name: 'B1', maturityY: 0.5, durInitY: 0.5 * 0.93, isSynthetic: true },
      { name: 'B2', maturityY: 1.0, durInitY: 1.0 * 0.93, isSynthetic: true },
    ];
    const plan = basicPlan(bullets);
    const nSims = 5;
    const H = 18;
    // nExtensions=1: solo 1 extensión disponible. Vencen 2 bullets reales → 2do queda sin dest.
    const nExt = 1;
    const nTotal = 2 + nExt;
    const market: ArenaMarket = {
      bulletReturns: constantBulletReturns(nTotal, nSims, H, 0),
      equityReturns: new Float32Array(nSims * H),
      cashReturns: new Float32Array(nSims * H),
      yieldPaths: flatYieldPaths({ IRX: 0.03, FVX: 0.035, TNX: 0.04, TYX: 0.045 }, nSims, H),
      nSims,
      horizonMonths: H,
    };
    const out = runArena({
      rolloverPlan: plan,
      initialAumUsd: 1_000_000,
      inflowBaseAnnual: 0,
      nExtensions: nExt,
    }, market);
    // 2 eventos: B1 vence m6 → dest=EXT01. B2 vence m12 → dest=-1 → FALLBACK_EQUITY.
    expect(out.events).toHaveLength(2);
    expect(out.events[0].destBullet).toBe('EXT01');
    expect(out.events[1].destBullet).toBe('FALLBACK_EQUITY');
  });
});

// =====================================================================
// LoanEvent integration
// =====================================================================

describe('runArena — LoanEvent', () => {
  it('al disparar préstamo, loanBalance > 0 desde el trigger en adelante', () => {
    const bullets = makeBullets([5]);
    const plan = basicPlan(bullets);
    const nSims = 5;
    const H = 12;
    const nTotal = 1 + 5;
    const market: ArenaMarket = {
      bulletReturns: constantBulletReturns(nTotal, nSims, H, 0),
      equityReturns: new Float32Array(nSims * H),
      cashReturns: new Float32Array(nSims * H),
      yieldPaths: flatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, nSims, H),
      nSims,
      horizonMonths: H,
    };
    const out = runArena({
      rolloverPlan: plan,
      initialAumUsd: 1_000_000,
      inflowBaseAnnual: 0,
      nExtensions: 5,
      loanEvent: makeLoanEvent({ triggerMonth: 3, amountPctAum: 0.20, termMonths: 12 }),
    }, market);
    for (let s = 0; s < nSims; s++) {
      // Antes del trigger: balance = 0
      expect(out.loanBalancePath[s * (H + 1) + 2]).toBe(0);
      // Justo después del trigger (t=3): balance > 0
      expect(out.loanBalancePath[s * (H + 1) + 4]).toBeGreaterThan(0);
    }
    // Loan principal = 200_000 (20% de 1M), cum interest debe ser > 0
    expect(out.stats.loanCumInterestMed).toBeGreaterThan(0);
  });
});

// =====================================================================
// buildArenaMarket integration
// =====================================================================

describe('buildArenaMarket — integración con runBootstrap', () => {
  it('construye ArenaMarket coherente desde runBootstrap real', () => {
    const portfolio: ExpandedPortfolio = {
      etfs: { BIL: 100 },
      fixed: { FIXED6: 0, FIXED9: 0 },
      totalWeight: 100,
    };
    const nSims = 20;
    const H = 24;
    const boot = runBootstrap({
      portfolios: { A: portfolio, B: portfolio },
      horizonMonths: H,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: nSims, seed: 7 },
      outputYieldPaths: true,
      outputEtfReturns: true,
    });
    expect(boot.yieldPaths).toBeDefined();
    expect(boot.etfReturns).toBeDefined();

    const realBullets = defaultBulletLineup().slice(0, 3);
    const initialCurve: [number, number, number, number] = [
      getYieldBounds('IRX').initial,
      getYieldBounds('FVX').initial,
      getYieldBounds('TNX').initial,
      getYieldBounds('TYX').initial,
    ];
    const market = buildArenaMarket({
      realBullets,
      nExtensions: 5,
      equityMix: [{ ticker: 'USMV', weight: 1.0 }],
      cashTicker: 'BIL',
      initialSpread: 0.011,
      initialCurve,
      nSims,
      horizonMonths: H,
      yieldPaths: boot.yieldPaths!,
      etfReturns: boot.etfReturns!,
    });

    expect(market.bulletReturns.length).toBe(3 + 5);
    expect(market.equityReturns.length).toBe(nSims * H);
    expect(market.cashReturns.length).toBe(nSims * H);
    expect(market.yieldPaths).toBe(boot.yieldPaths);

    // Pasamos al runArena para sanity check
    const out = runArena({
      rolloverPlan: {
        bullets: realBullets,
        bulletTotalPct: 0.65,
        equityPct: 0.30,
        cashPct: 0.05,
        eqtyMin: 0.10,
        eqtyMax: 0.50,
        equityMix: [{ ticker: 'USMV', weight: 1.0 }],
        cashTicker: 'BIL',
        initialSpread: 0.011,
      },
      initialAumUsd: 5_000_000,
      inflowBaseAnnual: 250_000,
      nExtensions: 5,
    }, market);

    expect(out.stats.initialAum).toBeCloseTo(5_000_000, 2);
    expect(out.stats.totalInflows).toBeCloseTo(250_000 * 2, 2); // 2 años de inflow
    expect(out.stats.finalAumMed).toBeGreaterThan(5_000_000); // creció por carry + inflows
  });
});

describe('buildArenaMarket — validaciones', () => {
  it('rechaza si equityMix no suma 1', () => {
    expect(() =>
      buildArenaMarket({
        realBullets: makeBullets([5]),
        equityMix: [{ ticker: 'USMV', weight: 0.7 }],
        cashTicker: 'BIL',
        initialSpread: 0,
        initialCurve: [0.04, 0.04, 0.04, 0.04],
        nSims: 5,
        horizonMonths: 12,
        yieldPaths: flatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, 5, 12),
        etfReturns: {
          USMV: new Float32Array(5 * 12),
          BIL: new Float32Array(5 * 12),
        },
      }),
    ).toThrow(/equityMix/);
  });
});

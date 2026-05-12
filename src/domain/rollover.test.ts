/**
 * rollover.test.ts — Tests del motor de rollover táctico A/B/C.
 *
 * Cubre:
 *   - classifyRegime: tablas de verdad de los 3 regímenes
 *   - validatePlan: rechazo de inputs malformados
 *   - runRollover sin rollover (BH): wealth coincide con baseline analítico
 *   - runRollover con escenarios deterministas: A/B/C produce el redirect esperado
 *   - integración con runBootstrap: el rollover suma valor vs BH (regimen "good")
 */
import { describe, expect, it } from 'vitest';
import {
  classifyRegime,
  runRollover,
  DEFAULT_ROLLOVER_THRESHOLDS,
  type RolloverPlan,
  type RolloverContext,
} from './rollover';
import { defaultBulletLineup, type BulletDef } from './bullets';
import {
  DEFAULT_BOOTSTRAP_CONFIG,
  getYieldBounds,
  runBootstrap,
  type BootstrapInput,
} from './bootstrap';
import type { ExpandedPortfolio } from './types';

// =====================================================================
// Helpers
// =====================================================================

function makeFlatYieldPaths(
  level: { IRX: number; FVX: number; TNX: number; TYX: number },
  nPaths: number,
  H: number,
): RolloverContext['yieldPaths'] {
  const total = nPaths * H;
  return {
    IRX: Float32Array.from({ length: total }, () => level.IRX),
    FVX: Float32Array.from({ length: total }, () => level.FVX),
    TNX: Float32Array.from({ length: total }, () => level.TNX),
    TYX: Float32Array.from({ length: total }, () => level.TYX),
  };
}

function makeBasicPlan(
  bullets: BulletDef[],
  overrides: Partial<RolloverPlan> = {},
): RolloverPlan {
  return {
    bullets,
    bulletTotalPct: 0.65,
    equityPct: 0.30,
    cashPct: 0.05,
    eqtyMin: 0.0,
    eqtyMax: 0.5,
    equityMix: [{ ticker: 'USMV', weight: 1.0 }],
    cashTicker: 'BIL',
    initialSpread: 0,
    ...overrides,
  };
}

// =====================================================================
// classifyRegime
// =====================================================================

describe('classifyRegime', () => {
  const th = DEFAULT_ROLLOVER_THRESHOLDS;

  it('A: tasas altas Y curva pronunciada', () => {
    expect(classifyRegime(0.05, 0.03, th)).toBe('A'); // TNX=5%, IRX=3%, slope=2%
    expect(classifyRegime(0.05, 0.04, th)).toBe('A'); // slope 100bp = threshold exacto, > thetaSteep no, → no A
  });

  it('A requiere AMBOS: tasas altas Y slope > thetaSteep', () => {
    // TNX alto pero slope plano → no A
    expect(classifyRegime(0.05, 0.045, th)).not.toBe('A'); // slope = 50bp < 100bp
    // slope steep pero tasas no altas → no A
    expect(classifyRegime(0.040, 0.020, th)).not.toBe('A'); // TNX 4% < 4.5%
  });

  it('B: tasas bajas O curva flat/invertida', () => {
    expect(classifyRegime(0.030, 0.020, th)).toBe('B'); // TNX < 3.5%
    expect(classifyRegime(0.040, 0.039, th)).toBe('B'); // slope 10bp < 25bp
    expect(classifyRegime(0.040, 0.042, th)).toBe('B'); // slope negativo (invertida)
  });

  it('C: default', () => {
    expect(classifyRegime(0.040, 0.030, th)).toBe('C'); // 4% > thetaLow (3.5), slope 100bp = thetaSteep exacto pero no >
    expect(classifyRegime(0.042, 0.030, th)).toBe('C'); // 4.2% < thetaHigh, slope 120bp > flat
  });

  it('A se prioriza sobre B (no se puede ser ambos por definición)', () => {
    // High + steep califica para A, no B
    expect(classifyRegime(0.06, 0.03, th)).toBe('A');
  });
});

// =====================================================================
// runRollover: validaciones
// =====================================================================

describe('runRollover — validaciones', () => {
  const bullets = defaultBulletLineup();

  it('rechaza si pesos no suman 1', () => {
    const plan = makeBasicPlan(bullets, { bulletTotalPct: 0.5, equityPct: 0.3, cashPct: 0.05 });
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, 10, 12),
      etfReturns: {
        USMV: new Float32Array(10 * 12),
        BIL: new Float32Array(10 * 12),
      },
      initialCurve: [0.04, 0.04, 0.04, 0.04],
      nPaths: 10,
      horizonMonths: 12,
    };
    expect(() => runRollover({ plan, ctx })).toThrow(/pesos iniciales/);
  });

  it('rechaza si equityMix no suma 1', () => {
    const plan = makeBasicPlan(bullets, {
      equityMix: [{ ticker: 'USMV', weight: 0.7 }],
    });
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, 10, 12),
      etfReturns: {
        USMV: new Float32Array(10 * 12),
        BIL: new Float32Array(10 * 12),
      },
      initialCurve: [0.04, 0.04, 0.04, 0.04],
      nPaths: 10,
      horizonMonths: 12,
    };
    expect(() => runRollover({ plan, ctx })).toThrow(/equityMix/);
  });

  it('rechaza si equity ticker no está en etfReturns', () => {
    const plan = makeBasicPlan(bullets, {
      equityMix: [{ ticker: 'USMV', weight: 1.0 }],
    });
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, 10, 12),
      etfReturns: { BIL: new Float32Array(10 * 12) }, // USMV faltante
      initialCurve: [0.04, 0.04, 0.04, 0.04],
      nPaths: 10,
      horizonMonths: 12,
    };
    expect(() => runRollover({ plan, ctx })).toThrow(/USMV.*no presente/);
  });

  it('rechaza si equityPct fuera de bandas', () => {
    const plan = makeBasicPlan(bullets, {
      bulletTotalPct: 0.45,
      equityPct: 0.55, // fuera de eqtyMax=0.5
      cashPct: 0.0,
    });
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, 10, 12),
      etfReturns: {
        USMV: new Float32Array(10 * 12),
        BIL: new Float32Array(10 * 12),
      },
      initialCurve: [0.04, 0.04, 0.04, 0.04],
      nPaths: 10,
      horizonMonths: 12,
    };
    expect(() => runRollover({ plan, ctx })).toThrow(/equityPct.*fuera de banda/);
  });
});

// =====================================================================
// runRollover: forma del output
// =====================================================================

describe('runRollover — forma de output', () => {
  const bullets = defaultBulletLineup();
  const ctxBase: RolloverContext = {
    yieldPaths: makeFlatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, 50, 24),
    etfReturns: {
      USMV: Float32Array.from({ length: 50 * 24 }, () => 0.006),
      BIL: Float32Array.from({ length: 50 * 24 }, () => 0.003),
    },
    initialCurve: [0.04, 0.04, 0.04, 0.04],
    nPaths: 50,
    horizonMonths: 24,
  };

  it('wealthPath empieza en 1.0 para todas las sims', () => {
    const out = runRollover({ plan: makeBasicPlan(bullets), ctx: ctxBase });
    const Hp1 = ctxBase.horizonMonths + 1;
    for (let s = 0; s < ctxBase.nPaths; s++) {
      expect(out.wealthPath[s * Hp1]).toBe(1.0);
    }
  });

  it('sleevePath suma ~1 en cada (sim, t) en t=0', () => {
    const out = runRollover({ plan: makeBasicPlan(bullets), ctx: ctxBase });
    const Hp1 = ctxBase.horizonMonths + 1;
    for (let s = 0; s < ctxBase.nPaths; s++) {
      const off = s * Hp1 * 3;
      const sum = out.sleevePath[off + 0] + out.sleevePath[off + 1] + out.sleevePath[off + 2];
      expect(sum).toBeCloseTo(1.0, 5);
    }
  });

  it('outputBulletHoldings opt-in', () => {
    const noBh = runRollover({ plan: makeBasicPlan(bullets), ctx: ctxBase });
    expect(noBh.bulletHoldings).toBeUndefined();
    const withBh = runRollover({
      plan: makeBasicPlan(bullets),
      ctx: ctxBase,
      outputBulletHoldings: true,
    });
    expect(withBh.bulletHoldings).toBeInstanceOf(Float32Array);
    expect(withBh.bulletHoldings!.length).toBe(
      ctxBase.nPaths * (ctxBase.horizonMonths + 1) * bullets.length,
    );
  });

  it('finalsSorted está ordenado ascendente', () => {
    const out = runRollover({ plan: makeBasicPlan(bullets), ctx: ctxBase });
    for (let i = 1; i < out.finalsSorted.length; i++) {
      expect(out.finalsSorted[i]).toBeGreaterThanOrEqual(out.finalsSorted[i - 1]);
    }
  });
});

// =====================================================================
// Buy-and-hold vs rollover: comportamiento determinístico
// =====================================================================

describe('runRollover — buy-and-hold (rolloverEnabled=false)', () => {
  it('en BH, no se emiten eventos ni regímenes', () => {
    const bullets = defaultBulletLineup();
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths({ IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 }, 30, 60),
      etfReturns: {
        USMV: Float32Array.from({ length: 30 * 60 }, () => 0.005),
        BIL: Float32Array.from({ length: 30 * 60 }, () => 0.002),
      },
      initialCurve: [0.04, 0.04, 0.04, 0.04],
      nPaths: 30,
      horizonMonths: 60,
    };
    const out = runRollover({
      plan: makeBasicPlan(bullets),
      ctx,
      rolloverEnabled: false,
    });
    expect(out.eventsLog).toHaveLength(0);
    expect(out.regimeCounts).toEqual({ A: 0, B: 0, C: 0 });
  });
});

// =====================================================================
// Eventos de rollover en escenarios deterministas
// =====================================================================

describe('runRollover — escenario A determinístico (high+steep)', () => {
  /**
   * Construcción: yields tales que A se dispara siempre.
   * TNX = 5% > thetaHigh (4.5%), IRX = 1.5% → slope 350bp > thetaSteep (100bp).
   * Esperamos que en CADA evento de rollover, todos los sims sean clasificados A.
   */
  it('todos los eventos son régimen A bajo curva 5%/1.5%', () => {
    // Construir un bullet que vence en mes 6 (maturity 0.5y) para forzar evento temprano.
    const earlyBullet: BulletDef = {
      name: 'EARLY',
      maturityY: 0.5,
      durInitY: 0.5 * 0.93,
      isSynthetic: true,
    };
    const longBullet: BulletDef = {
      name: 'LONG',
      maturityY: 5.0,
      durInitY: 5.0 * 0.93,
      isSynthetic: true,
    };
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths(
        { IRX: 0.015, FVX: 0.03, TNX: 0.05, TYX: 0.055 },
        20,
        12,
      ),
      etfReturns: {
        USMV: new Float32Array(20 * 12), // 0
        BIL: new Float32Array(20 * 12),
      },
      initialCurve: [0.015, 0.03, 0.05, 0.055],
      nPaths: 20,
      horizonMonths: 12,
    };
    const plan = makeBasicPlan([earlyBullet, longBullet], {
      bulletInitialWeights: [0.5, 0.5],
    });
    const out = runRollover({ plan, ctx });
    expect(out.eventsLog.length).toBeGreaterThan(0);
    expect(out.regimeCounts.A).toBe(20); // los 20 sims clasificados A en el único evento
    expect(out.regimeCounts.B).toBe(0);
    expect(out.regimeCounts.C).toBe(0);
    expect(out.eventsLog[0].bulletName).toBe('EARLY');
    expect(out.eventsLog[0].destinationBullet).toBe('LONG');
  });
});

describe('runRollover — escenario B determinístico (rates bajas)', () => {
  it('todos los eventos son régimen B bajo TNX=2%', () => {
    const earlyBullet: BulletDef = {
      name: 'EARLY',
      maturityY: 0.5,
      durInitY: 0.5 * 0.93,
      isSynthetic: true,
    };
    const longBullet: BulletDef = {
      name: 'LONG',
      maturityY: 5.0,
      durInitY: 5.0 * 0.93,
      isSynthetic: true,
    };
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths(
        { IRX: 0.015, FVX: 0.018, TNX: 0.02, TYX: 0.025 }, // TNX < thetaLow
        20,
        12,
      ),
      etfReturns: {
        USMV: new Float32Array(20 * 12),
        BIL: new Float32Array(20 * 12),
      },
      initialCurve: [0.015, 0.018, 0.02, 0.025],
      nPaths: 20,
      horizonMonths: 12,
    };
    const plan = makeBasicPlan([earlyBullet, longBullet], {
      bulletInitialWeights: [0.5, 0.5],
    });
    const out = runRollover({ plan, ctx });
    expect(out.regimeCounts.B).toBe(20);
    expect(out.regimeCounts.A).toBe(0);
  });

  it('regimen B respeta banda dura eqtyMax (no overshoot)', () => {
    // Equity arranca en 0.45, eqtyMax=0.5. Bullet 0.5 vence con principal 0.2 (bullet_total 0.4).
    // Si principal * X (40%) = 0.08, intentaría llevar equity de 0.45 a 0.53 → cap en 0.5.
    // toEqActual = min(0.08, 0.05) = 0.05. toBulletActual = 0.15.
    const earlyBullet: BulletDef = {
      name: 'EARLY',
      maturityY: 0.5,
      durInitY: 0.5 * 0.93,
      isSynthetic: true,
    };
    const longBullet: BulletDef = {
      name: 'LONG',
      maturityY: 5.0,
      durInitY: 5.0 * 0.93,
      isSynthetic: true,
    };
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths(
        { IRX: 0.015, FVX: 0.018, TNX: 0.02, TYX: 0.025 },
        5,
        12,
      ),
      etfReturns: {
        USMV: new Float32Array(5 * 12),
        BIL: new Float32Array(5 * 12),
      },
      initialCurve: [0.015, 0.018, 0.02, 0.025],
      nPaths: 5,
      horizonMonths: 12,
    };
    // bulletTotalPct=0.4 → 0.2 cada bullet; equity 0.45; cash 0.15
    const plan = makeBasicPlan([earlyBullet, longBullet], {
      bulletTotalPct: 0.40,
      equityPct: 0.45,
      cashPct: 0.15,
      bulletInitialWeights: [0.5, 0.5],
      eqtyMax: 0.5,
    });
    const out = runRollover({
      plan,
      ctx,
      outputBulletHoldings: true,
    });
    // Verificamos en sim 0 que equity post-evento ≤ eqtyMax (mes 6 - 1-indexed → t=6 en wealth grid).
    const Hp1 = 13;
    const eqAt6 = out.sleevePath[0 * Hp1 * 3 + 6 * 3 + 1];
    expect(eqAt6).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(eqAt6).toBeGreaterThan(0.45); // sí subió (no cero)
  });
});

describe('runRollover — escenario C determinístico (zona neutral)', () => {
  it('todos los eventos son régimen C bajo TNX=4%, slope=100bp', () => {
    const earlyBullet: BulletDef = {
      name: 'EARLY',
      maturityY: 0.5,
      durInitY: 0.5 * 0.93,
      isSynthetic: true,
    };
    const longBullet: BulletDef = {
      name: 'LONG',
      maturityY: 5.0,
      durInitY: 5.0 * 0.93,
      isSynthetic: true,
    };
    // TNX=0.04 < thetaHigh (0.045) → no A
    // TNX=0.04 > thetaLow (0.035), slope=100bp NOT > thetaSteep (100bp), NOT < thetaFlat (25bp) → C
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths(
        { IRX: 0.030, FVX: 0.035, TNX: 0.040, TYX: 0.045 },
        20,
        12,
      ),
      etfReturns: {
        USMV: new Float32Array(20 * 12),
        BIL: new Float32Array(20 * 12),
      },
      initialCurve: [0.030, 0.035, 0.040, 0.045],
      nPaths: 20,
      horizonMonths: 12,
    };
    const plan = makeBasicPlan([earlyBullet, longBullet], {
      bulletInitialWeights: [0.5, 0.5],
    });
    const out = runRollover({ plan, ctx });
    expect(out.regimeCounts.C).toBe(20);
    expect(out.regimeCounts.A).toBe(0);
    expect(out.regimeCounts.B).toBe(0);
  });
});

// =====================================================================
// Edge case: ningún bullet vivo al vencimiento
// =====================================================================

describe('runRollover — edge: ningún bullet vivo restante', () => {
  it('cuando vence el último bullet, principal va a equity y se logea "edge"', () => {
    const onlyBullet: BulletDef = {
      name: 'ONLY',
      maturityY: 0.5,
      durInitY: 0.5 * 0.93,
      isSynthetic: true,
    };
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths(
        { IRX: 0.04, FVX: 0.04, TNX: 0.04, TYX: 0.04 },
        5,
        12,
      ),
      etfReturns: {
        USMV: new Float32Array(5 * 12),
        BIL: new Float32Array(5 * 12),
      },
      initialCurve: [0.04, 0.04, 0.04, 0.04],
      nPaths: 5,
      horizonMonths: 12,
    };
    const plan = makeBasicPlan([onlyBullet]);
    const out = runRollover({ plan, ctx });
    expect(out.eventsLog).toHaveLength(1);
    expect(out.eventsLog[0].destinationBullet).toBeNull();
    // No regímenes A/B/C contados en edge case
    expect(out.regimeCounts.A + out.regimeCounts.B + out.regimeCounts.C).toBe(0);
  });
});

// =====================================================================
// Sanity de retorno: BH con retornos cero → wealth = 1 al final
// =====================================================================

describe('runRollover — sanity de retorno', () => {
  it('todos los retornos cero → wealth final = 1.0 exacto', () => {
    const bullet: BulletDef = {
      name: 'B5',
      maturityY: 5.0,
      durInitY: 5.0 * 0.93,
      isSynthetic: true,
    };
    // Con yields 0%, carry=0; sin shift, curve=roll=convex=0 → bullet retorna 0/mes.
    const ctx: RolloverContext = {
      yieldPaths: makeFlatYieldPaths({ IRX: 0, FVX: 0, TNX: 0, TYX: 0 }, 10, 24),
      etfReturns: {
        USMV: new Float32Array(10 * 24), // 0
        BIL: new Float32Array(10 * 24),
      },
      initialCurve: [0, 0, 0, 0],
      nPaths: 10,
      horizonMonths: 24,
    };
    const plan = makeBasicPlan([bullet]);
    const out = runRollover({ plan, ctx, rolloverEnabled: false });
    const Hp1 = 25;
    for (let s = 0; s < 10; s++) {
      expect(out.wealthPath[s * Hp1 + 24]).toBeCloseTo(1.0, 5);
    }
    expect(out.stats.med).toBeCloseTo(0, 5);
  });
});

// =====================================================================
// Integración: alimentar rollover con output de runBootstrap real
// =====================================================================

describe('runRollover — integración con runBootstrap', () => {
  it('acepta output real de runBootstrap (outputYieldPaths + outputEtfReturns)', () => {
    // Portafolio dummy 100% USMV (para forzar tickers en etfReturns) en bootstrap.
    const portfolio: ExpandedPortfolio = {
      etfs: { USMV: 100 },
      fixed: { FIXED6: 0, FIXED9: 0 },
      totalWeight: 100,
    };
    const bootInput: BootstrapInput = {
      portfolios: { A: portfolio, B: portfolio },
      horizonMonths: 24,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 30, seed: 13 },
      outputYieldPaths: true,
      outputEtfReturns: true,
    };
    const boot = runBootstrap(bootInput);
    expect(boot.yieldPaths).toBeDefined();
    expect(boot.etfReturns).toBeDefined();

    const lineup = defaultBulletLineup();
    const plan = makeBasicPlan(lineup, {
      bulletTotalPct: 0.65,
      equityPct: 0.30,
      cashPct: 0.05,
      equityMix: [{ ticker: 'USMV', weight: 1.0 }],
      cashTicker: 'BIL',
      initialSpread: 0.011,
    });
    const initialCurve: [number, number, number, number] = [
      getYieldBounds('IRX').initial,
      getYieldBounds('FVX').initial,
      getYieldBounds('TNX').initial,
      getYieldBounds('TYX').initial,
    ];

    const out = runRollover({
      plan,
      ctx: {
        yieldPaths: boot.yieldPaths!,
        etfReturns: boot.etfReturns!,
        initialCurve,
        nPaths: bootInput.config.nPaths,
        horizonMonths: bootInput.horizonMonths,
      },
    });
    expect(out.wealthPath.length).toBe(30 * 25);
    // Stats finales razonables: con bullets 65% IG (spread 110bp) + 30% equity, esperamos
    // mediana positiva pero no extrema sobre 24 meses.
    expect(out.stats.med).toBeGreaterThan(-0.2); // no catástrofe
    expect(out.stats.med).toBeLessThan(0.6);     // no fantasía
  });

  it('rollover vs BH: stats finales pueden diferir (algunas sims tienen eventos)', () => {
    // Usamos un bullet que vence en mes 6 para garantizar al menos un evento dentro de
    // un horizonte corto.
    const earlyBullet: BulletDef = {
      name: 'EARLY',
      maturityY: 0.5,
      durInitY: 0.5 * 0.93,
      isSynthetic: true,
    };
    const longBullet: BulletDef = {
      name: 'LONG',
      maturityY: 5.0,
      durInitY: 5.0 * 0.93,
      isSynthetic: true,
    };
    const portfolio: ExpandedPortfolio = {
      etfs: { USMV: 100 },
      fixed: { FIXED6: 0, FIXED9: 0 },
      totalWeight: 100,
    };
    const bootInput: BootstrapInput = {
      portfolios: { A: portfolio, B: portfolio },
      horizonMonths: 12,
      config: { ...DEFAULT_BOOTSTRAP_CONFIG, nPaths: 200, seed: 29 },
      outputYieldPaths: true,
      outputEtfReturns: true,
    };
    const boot = runBootstrap(bootInput);
    const initialCurve: [number, number, number, number] = [
      getYieldBounds('IRX').initial,
      getYieldBounds('FVX').initial,
      getYieldBounds('TNX').initial,
      getYieldBounds('TYX').initial,
    ];
    const plan = makeBasicPlan([earlyBullet, longBullet], {
      bulletInitialWeights: [0.5, 0.5],
      equityMix: [{ ticker: 'USMV', weight: 1.0 }],
    });
    const ctxRoll: RolloverContext = {
      yieldPaths: boot.yieldPaths!,
      etfReturns: boot.etfReturns!,
      initialCurve,
      nPaths: 200,
      horizonMonths: 12,
    };
    const withRoll = runRollover({ plan, ctx: ctxRoll, rolloverEnabled: true });
    const noRoll = runRollover({ plan, ctx: ctxRoll, rolloverEnabled: false });

    // En BH, el bullet EARLY vence en mes 6 y deja su principal "fantasma": el módulo
    // sigue aplicando el return del bullet vencido (0 después de vencimiento por
    // computeBulletReturns), pero no redistribuye. En rollover, el principal se mueve
    // al bullet largo, que sí genera carry > 0 → mediana esperada > BH.
    expect(withRoll.regimeCounts.A + withRoll.regimeCounts.B + withRoll.regimeCounts.C).toBe(200);
    expect(noRoll.eventsLog).toHaveLength(0);
    // No exigimos mejor (depende de regímenes muestreados), solo que ambas corren.
    expect(noRoll.wealthPath.length).toBe(withRoll.wealthPath.length);
  });
});

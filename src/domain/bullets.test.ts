/**
 * bullets.test.ts — Tests del modelo paramétrico de bullets.
 *
 * Replica los tests T1/T2/T3 de `bullet_tier.py` (Python original):
 *   T1: curva plana 4% durante 12 meses → bullet 5y rinde ~4% anualizado
 *   T2: shock +100bp paralelo en mes 1, bullet 10y → r = carry − dur×dy + 0.5×cv×dy²
 *   T3: curva positiva estable → bullet 5y captura roll-down > 0
 */
import { describe, it, expect } from 'vitest';
import {
  interpCurve,
  bulletReturnDecomp,
  convexityFromDur,
  simulateBulletPath,
  monthsBetween,
  defaultBulletLineup,
  NODE_MATURITIES,
  type BulletDef,
} from './bullets';

describe('interpCurve', () => {
  it('devuelve el nodo exacto en maturidades de nodo', () => {
    const y = [0.04, 0.045, 0.05, 0.055];
    for (let i = 0; i < 4; i++) {
      expect(interpCurve(y, NODE_MATURITIES[i])).toBeCloseTo(y[i], 10);
    }
  });

  it('interpola lineal entre nodos', () => {
    const y = [0.04, 0.05, 0.06, 0.07]; // nodos en 0.25, 5, 10, 30
    // Entre 0.25 y 5: en 2.625 (midpoint) debe ser (0.04+0.05)/2 = 0.045
    expect(interpCurve(y, 2.625)).toBeCloseTo(0.045, 10);
    // Entre 5 y 10: en 7.5 → (0.05+0.06)/2 = 0.055
    expect(interpCurve(y, 7.5)).toBeCloseTo(0.055, 10);
  });

  it('extrapola plana fuera del rango', () => {
    const y = [0.04, 0.045, 0.05, 0.055];
    expect(interpCurve(y, 0.1)).toBe(0.04);
    expect(interpCurve(y, 50)).toBe(0.055);
  });

  it('lanza si recibe número distinto de 4 nodos', () => {
    expect(() => interpCurve([0.04, 0.05, 0.06], 1)).toThrow();
    expect(() => interpCurve([0.04, 0.05, 0.06, 0.07, 0.08], 1)).toThrow();
  });
});

describe('convexityFromDur', () => {
  it('cv ≈ dur² + dur', () => {
    expect(convexityFromDur(5)).toBe(30);
    expect(convexityFromDur(10)).toBe(110);
    expect(convexityFromDur(0)).toBe(0);
  });
});

describe('bulletReturnDecomp — single month', () => {
  it('curva plana sin cambios → solo carry', () => {
    // ytm constante 4% en m_{t-1}, sin shift de curva, dur=4.65, cv=26
    const ytm = 0.04;
    const r = bulletReturnDecomp({
      ytmPrev: ytm,
      ytmT: ytm,        // sin cambio
      ytmCurveOnly: ytm, // sin shift
      durPrev: 4.65,
      cv: 26,
    });
    expect(r.curve).toBeCloseTo(0, 10);
    expect(r.roll).toBeCloseTo(0, 10);
    expect(r.convex).toBeCloseTo(0, 10);
    expect(r.carry).toBeCloseTo(ytm / 12, 10);
    expect(r.total).toBeCloseTo(ytm / 12, 10);
  });

  it('shock +100bp paralelo → curve component domina', () => {
    // Curva 4% plana. Aplicamos +100bp paralelo. ytmT y ytmCurveOnly ambos suben 100bp.
    // Para bullet 10y, dur ≈ 9.3, cv = 9.3² + 9.3 = 95.79
    const ytmPrev = 0.04;
    const shock = 0.01;
    const dur = 9.3;
    const cv = convexityFromDur(dur);
    const r = bulletReturnDecomp({
      ytmPrev,
      ytmT: ytmPrev + shock,           // shock paralelo, mismo en m_t como en m_{t-1}
      ytmCurveOnly: ytmPrev + shock,
      durPrev: dur,
      cv,
    });
    // r = ytm/12 − dur×0.01 − 0 + 0.5×cv×0.0001
    const expected = (ytmPrev / 12) - dur * shock + 0.5 * cv * shock * shock;
    expect(r.total).toBeCloseTo(expected, 6);
    expect(r.total).toBeCloseTo(-0.08488, 4); // = -8.488%, igual que T2 del Python
  });

  it('roll-down > 0 con curva positiva (sin shift)', () => {
    // Curva positiva estable: ytm(t-1, m_{t-1}=5y) = 4.5%, ytm(t-1, m_t=4.917y) = ~4.49%
    // Sin shift de curva: ytmCurveOnly = ytmPrev. Δy_roll = ytmT − ytmCurveOnly < 0
    // → r_roll = −dur × Δy_roll > 0 ✓
    const ytmPrev = 0.045;     // ytm a m_{t-1}=5y
    const ytmT = 0.0449;       // ytm a m_t=4.917y (menor)
    const ytmCurveOnly = 0.045; // curva no se movió a m_{t-1}
    const dur = 4.65;
    const cv = convexityFromDur(dur);
    const r = bulletReturnDecomp({ ytmPrev, ytmT, ytmCurveOnly, durPrev: dur, cv });
    expect(r.curve).toBeCloseTo(0, 8);
    expect(r.roll).toBeGreaterThan(0);
    expect(r.total).toBeGreaterThan(r.carry); // roll suma al retorno total
  });
});

describe('simulateBulletPath — T1 sanity', () => {
  it('T1: curva plana 4% durante 12 meses → bullet 5y rinde ~4% anualizado', () => {
    const flatCurve = [0.04, 0.04, 0.04, 0.04];
    const curves = new Array(13).fill(flatCurve);
    const bullet: BulletDef = {
      name: 'T1',
      maturityY: 5,
      durInitY: 5 * 0.93,
      isSynthetic: true,
    };
    const decomp = simulateBulletPath(bullet, curves, 0);
    expect(decomp).toHaveLength(12);

    // Retorno acumulado 12m
    const cum = decomp.reduce((acc, r) => acc * (1 + r.total), 1) - 1;
    expect(cum).toBeCloseTo(0.0407, 2); // ~4.07% (igual que T1 del Python, dentro de 1pp)

    // Sin shift de curva → carry domina, otros componentes ~0
    const carrySum = decomp.reduce((s, r) => s + r.carry, 0);
    const curveSum = decomp.reduce((s, r) => s + r.curve, 0);
    const rollSum = decomp.reduce((s, r) => s + r.roll, 0);
    const convexSum = decomp.reduce((s, r) => s + r.convex, 0);
    expect(carrySum).toBeCloseTo(0.04, 2);
    expect(curveSum).toBeCloseTo(0, 8);
    expect(rollSum).toBeCloseTo(0, 8);
    expect(convexSum).toBeCloseTo(0, 8);
  });
});

describe('simulateBulletPath — T2 sanity', () => {
  it('T2: shock +100bp en mes 1, bullet 10y → r = -8.49%', () => {
    const flat = [0.04, 0.04, 0.04, 0.04];
    const shocked = [0.05, 0.05, 0.05, 0.05]; // +100bp paralelo
    const curves = [flat, shocked]; // 1 mes: arranca flat, termina con shock
    const bullet: BulletDef = {
      name: 'T2',
      maturityY: 10,
      durInitY: 10 * 0.93,
      isSynthetic: true,
    };
    const decomp = simulateBulletPath(bullet, curves, 0);
    expect(decomp).toHaveLength(1);
    expect(decomp[0].total).toBeCloseTo(-0.08488, 4);
  });
});

describe('simulateBulletPath — T3 sanity', () => {
  it('T3: curva positiva estable → bullet 5y captura roll-down positivo en 12m', () => {
    // Curva inclinada: 2% en IRX, 4% en FVX, 5% en TNX, 5.5% en TYX
    const positive = [0.02, 0.04, 0.05, 0.055];
    const curves = new Array(13).fill(positive); // estable durante 12 meses
    const bullet: BulletDef = {
      name: 'T3',
      maturityY: 5,
      durInitY: 5 * 0.93,
      isSynthetic: true,
    };
    const decomp = simulateBulletPath(bullet, curves, 0);
    const rollSum = decomp.reduce((s, r) => s + r.roll, 0);
    const curveSum = decomp.reduce((s, r) => s + r.curve, 0);
    expect(rollSum).toBeGreaterThan(0); // roll-down positivo
    expect(curveSum).toBeCloseTo(0, 6); // sin shift de curva
  });
});

describe('monthsBetween', () => {
  it('mide meses calendario entre fechas', () => {
    // mayo 7 → diciembre 15 del mismo año = ~7.27 meses
    const d1 = new Date(2026, 4, 7);
    const d2 = new Date(2026, 11, 15);
    const m = monthsBetween(d1, d2);
    expect(m).toBeGreaterThan(7);
    expect(m).toBeLessThan(7.5);
  });
});

describe('defaultBulletLineup', () => {
  it('produce 11 bullets (9 reales 2026-2034 + 2 sintéticos 2035-2036)', () => {
    const lineup = defaultBulletLineup(new Date(2026, 4, 7));
    expect(lineup).toHaveLength(11);
    expect(lineup.filter(b => !b.isSynthetic)).toHaveLength(9);
    expect(lineup.filter(b => b.isSynthetic)).toHaveLength(2);
  });

  it('maturidades crecientes en orden', () => {
    const lineup = defaultBulletLineup(new Date(2026, 4, 7));
    for (let i = 1; i < lineup.length; i++) {
      expect(lineup[i].maturityY).toBeGreaterThan(lineup[i - 1].maturityY);
    }
  });

  it('nombres iBonds con prefijo ID y sufijo S si sintético', () => {
    const lineup = defaultBulletLineup(new Date(2026, 4, 7));
    const names = lineup.map(b => b.name);
    expect(names).toContain('ID26');
    expect(names).toContain('ID34');
    expect(names).toContain('ID35S');
    expect(names).toContain('ID36S');
  });

  it('maxYears=4 filtra a vintages ≤4y (ID26-ID29)', () => {
    const lineup = defaultBulletLineup(new Date(2026, 4, 7), 4);
    expect(lineup).toHaveLength(4);
    expect(lineup.map(b => b.name)).toEqual(['ID26', 'ID27', 'ID28', 'ID29']);
    for (const b of lineup) {
      expect(b.maturityY).toBeLessThanOrEqual(4);
    }
  });

  it('maxYears=7 filtra a vintages ≤7y (ID26-ID32)', () => {
    const lineup = defaultBulletLineup(new Date(2026, 4, 7), 7);
    expect(lineup).toHaveLength(7);
    expect(lineup.map(b => b.name)).toEqual(['ID26', 'ID27', 'ID28', 'ID29', 'ID30', 'ID31', 'ID32']);
  });

  it('maxYears=null deja lineup completo (= sin pasar maxYears)', () => {
    const lineup = defaultBulletLineup(new Date(2026, 4, 7), null);
    expect(lineup).toHaveLength(11);
  });

  it('maxYears muy bajo (<0.6) lanza porque quedan <2 vintages', () => {
    expect(() => defaultBulletLineup(new Date(2026, 4, 7), 0.5)).toThrow(/al menos 2/);
  });
});

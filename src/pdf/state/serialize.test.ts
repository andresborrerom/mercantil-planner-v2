import { describe, expect, it } from 'vitest';

import type { StoreSnapshot } from './serialize';
import {
  buildPdfStateContainer,
  clientSlug,
  generateSessionId,
  pdfFileName,
} from './serialize';

const fakeSnapshot: Pick<
  StoreSnapshot,
  'portfolioA' | 'portfolioB' | 'plan' | 'bootstrap' | 'window'
> = {
  portfolioA: { kind: 'signature', id: 'Balanceado' },
  portfolioB: { kind: 'signature', id: 'Crecimiento' },
  plan: {
    initialCapital: 250_000,
    horizonMonths: 240,
    mode: 'nominal',
    inflationPct: 2.5,
    rules: [],
  },
  bootstrap: {
    seed: 42,
    nPaths: 5000,
    blockSize: 12,
    fixed6Annual: 0.06,
    fixed9Annual: 0.09,
  },
  window: { startMonth: 1, endMonth: 240 },
};

describe('clientSlug', () => {
  it('quita acentos y espacios', () => {
    expect(clientSlug('Pocho Borrero')).toBe('pocho-borrero');
    expect(clientSlug('José María Núñez')).toBe('jose-maria-nunez');
    expect(clientSlug('  Andrés  Müller  ')).toBe('andres-muller');
  });
  it('colapsa caracteres no alfanuméricos', () => {
    expect(clientSlug('Cliente #1 (VIP)')).toBe('cliente-1-vip');
    expect(clientSlug('A___B---C')).toBe('a-b-c');
  });
  it('trim guiones de bordes', () => {
    expect(clientSlug('---hola---')).toBe('hola');
  });
  it('trunca a 60 chars', () => {
    expect(clientSlug('a'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe('pdfFileName', () => {
  it('formato completa = sin sufijo', () => {
    expect(pdfFileName('pocho', 'longevity', 'completa')).toBe('pocho-longevity.pdf');
  });
  it('formato ejecutiva = sufijo -ejec', () => {
    expect(pdfFileName('pocho', 'liquidity', 'ejecutiva')).toBe('pocho-liquidity-ejec.pdf');
  });
  it('slug vacío → cliente como fallback', () => {
    expect(pdfFileName('', 'legacy', 'completa')).toBe('cliente-legacy.pdf');
  });
});

describe('generateSessionId', () => {
  it('formato esperado', () => {
    const when = new Date('2026-05-05T18:30:00Z');
    const id = generateSessionId('pocho', 'longevity', when);
    expect(id).toMatch(/^mawm-pocho-longevity-\d{8}-\d{4}-[0-9a-f]{4}$/);
  });
  it('los IDs en el mismo minuto difieren por el random4', () => {
    const when = new Date('2026-05-05T18:30:00Z');
    const a = generateSessionId('pocho', 'longevity', when);
    const b = generateSessionId('pocho', 'longevity', when);
    // Pueden colisionar 1 en 65k, pero es improbable. Si flakea acá, el
    // approach del random4 está bien — solo hay que documentarlo.
    expect(a).not.toBe(b);
  });
});

describe('buildPdfStateContainer', () => {
  it('combina snapshot del store con inputs del form', () => {
    const when = new Date('2026-05-05T18:30:00Z');
    const result = buildPdfStateContainer(
      fakeSnapshot as StoreSnapshot,
      {
        clientName: 'Pocho Borrero',
        advisorName: 'Andrés Borrero',
        bucket: 'longevity',
        version: 'completa',
        locale: 'es',
        modules: { stressTests: true, sensitivities: true, methodology: true },
      },
      { generatedAt: when },
    );

    expect(result.schemaVersion).toBe(1);
    expect(result.generatedAt).toBe(when.toISOString());
    expect(result.sessionId).toMatch(/^mawm-pocho-borrero-longevity-/);
    expect(result.client).toEqual({ name: 'Pocho Borrero', bucket: 'longevity' });
    expect(result.advisor).toEqual({ name: 'Andrés Borrero' });
    expect(result.locale).toBe('es');
    expect(result.version).toBe('completa');
    expect(result.modules).toEqual({ stressTests: true, sensitivities: true, methodology: true });
    expect(result.planner.portfolioA).toEqual(fakeSnapshot.portfolioA);
    expect(result.planner.plan.initialCapital).toBe(250_000);
  });

  it('cliente y asesor vacíos → fallbacks legibles', () => {
    const result = buildPdfStateContainer(fakeSnapshot as StoreSnapshot, {
      clientName: '   ',
      advisorName: '',
      bucket: 'liquidity',
      version: 'ejecutiva',
      locale: 'en',
      modules: { stressTests: false, sensitivities: false, methodology: false },
    });
    expect(result.client.name).toBe('Cliente');
    expect(result.advisor.name).toBe('—');
  });

  it('inmutabilidad: el window del snapshot se clona', () => {
    const result = buildPdfStateContainer(fakeSnapshot as StoreSnapshot, {
      clientName: 'X',
      advisorName: 'Y',
      bucket: 'legacy',
      version: 'completa',
      locale: 'fr',
      modules: { stressTests: true, sensitivities: false, methodology: true },
    });
    expect(result.planner.window).not.toBe(fakeSnapshot.window);
    expect(result.planner.window).toEqual(fakeSnapshot.window);
  });
});

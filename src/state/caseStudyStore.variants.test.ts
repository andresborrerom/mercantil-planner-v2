/**
 * Tests para autoSaveVariant + visibility logic del store.
 * Ground truth: las reglas del store son deterministicas y verificables.
 *
 * G — propiedades chequeadas:
 *  - autoSaveVariant agrega visible=true
 *  - El primer variant (ancla) se queda visible=true cuando se agregan otros
 *  - Variants del medio quedan visible=false cuando se agrega uno nuevo
 *  - Cap de MAX_SAVED_VARIANTS respetado al exceder, descartando el segundo
 *    (no el ancla)
 *  - setVariantVisibility y renameVariant funcionan
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  useCaseStudyStore,
  DEFAULT_CASE_CONFIG,
  MAX_SAVED_VARIANTS,
  type SavedVariant,
} from './caseStudyStore';
import type { ArenaJobOutput } from '../workers/arena.worker';

const fakeResult = (seed: number): ArenaJobOutput =>
  ({ meta: { nSims: 10, horizonMonths: 12, seed, elapsedBootstrapMs: 0, elapsedArenaMs: 0 } } as never);

describe('autoSaveVariant — visibility rules', () => {
  beforeEach(() => {
    useCaseStudyStore.setState({ savedVariants: [] });
  });

  it('primera variante agregada: visible=true', () => {
    useCaseStudyStore.getState().autoSaveVariant({
      label: 'A',
      config: { ...DEFAULT_CASE_CONFIG },
      result: fakeResult(1),
    });
    const vs = useCaseStudyStore.getState().savedVariants;
    expect(vs).toHaveLength(1);
    expect(vs[0].visible).toBe(true);
    expect(vs[0].label).toBe('A');
  });

  it('segunda variante: primera mantiene visible=true, segunda visible=true', () => {
    const s = useCaseStudyStore.getState();
    s.autoSaveVariant({ label: 'A', config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(1) });
    s.autoSaveVariant({ label: 'B', config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(2) });
    const vs = useCaseStudyStore.getState().savedVariants;
    expect(vs).toHaveLength(2);
    expect(vs[0].visible).toBe(true);
    expect(vs[1].visible).toBe(true);
  });

  it('tercera variante: primera y nueva visibles, segunda (medio) oculta', () => {
    const s = useCaseStudyStore.getState();
    s.autoSaveVariant({ label: 'A', config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(1) });
    s.autoSaveVariant({ label: 'B', config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(2) });
    s.autoSaveVariant({ label: 'C', config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(3) });
    const vs = useCaseStudyStore.getState().savedVariants;
    expect(vs).toHaveLength(3);
    expect(vs[0].visible).toBe(true);
    expect(vs[1].visible).toBe(false); // del medio: oculta
    expect(vs[2].visible).toBe(true);
  });

  it('al exceder MAX_SAVED_VARIANTS, descarta el segundo (no la ancla)', () => {
    const s = useCaseStudyStore.getState();
    // Agrega MAX_SAVED_VARIANTS variantes
    for (let i = 0; i < MAX_SAVED_VARIANTS; i++) {
      s.autoSaveVariant({
        label: `V${i}`,
        config: { ...DEFAULT_CASE_CONFIG },
        result: fakeResult(i),
      });
    }
    let vs = useCaseStudyStore.getState().savedVariants;
    expect(vs).toHaveLength(MAX_SAVED_VARIANTS);
    expect(vs[0].label).toBe('V0'); // ancla original
    // Agrega una más → debe descartar el segundo (V1) y mantener V0 como ancla
    s.autoSaveVariant({
      label: 'VNew',
      config: { ...DEFAULT_CASE_CONFIG },
      result: fakeResult(99),
    });
    vs = useCaseStudyStore.getState().savedVariants;
    expect(vs).toHaveLength(MAX_SAVED_VARIANTS);
    expect(vs[0].label).toBe('V0'); // ancla preservada
    expect(vs[vs.length - 1].label).toBe('VNew');
    // V1 ya no esta en el array
    expect(vs.find((v) => v.label === 'V1')).toBeUndefined();
  });
});

describe('setVariantVisibility + renameVariant', () => {
  beforeEach(() => {
    useCaseStudyStore.setState({ savedVariants: [] });
  });

  it('setVariantVisibility cambia solo la variante target', () => {
    const s = useCaseStudyStore.getState();
    s.autoSaveVariant({ label: 'A', config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(1) });
    s.autoSaveVariant({ label: 'B', config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(2) });
    const before = useCaseStudyStore.getState().savedVariants;
    const targetId = before[1].id;
    s.setVariantVisibility(targetId, false);
    const after = useCaseStudyStore.getState().savedVariants;
    expect(after[0].visible).toBe(true); // no afectada
    expect(after[1].visible).toBe(false); // cambió
  });

  it('renameVariant cambia label, ignora vacío', () => {
    const s = useCaseStudyStore.getState();
    s.autoSaveVariant({ label: 'A', config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(1) });
    const id = useCaseStudyStore.getState().savedVariants[0].id;
    s.renameVariant(id, 'Renombrado');
    expect(useCaseStudyStore.getState().savedVariants[0].label).toBe('Renombrado');
    s.renameVariant(id, '   '); // trimea vacío
    expect(useCaseStudyStore.getState().savedVariants[0].label).toBe('Renombrado'); // no cambió
  });
});

describe('color asignación', () => {
  beforeEach(() => {
    useCaseStudyStore.setState({ savedVariants: [] });
  });

  it('cada variante recibe un color distinto cuando hay disponibles', () => {
    const s = useCaseStudyStore.getState();
    for (let i = 0; i < 4; i++) {
      s.autoSaveVariant({ label: `V${i}`, config: { ...DEFAULT_CASE_CONFIG }, result: fakeResult(i) });
    }
    const colors = useCaseStudyStore.getState().savedVariants.map((v: SavedVariant) => v.color);
    expect(new Set(colors).size).toBe(colors.length); // todos distintos
  });
});

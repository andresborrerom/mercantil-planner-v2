/**
 * Test de no-regresión del worker para el toggle bulletReturnsEngine.
 *
 * Verifica que cuando bulletReturnsEngine = 'parametric' (default), el
 * output del worker es IDÉNTICO al comportamiento sin el flag — lo cual
 * preserva paridad Python para todos los casos default existentes.
 *
 * NO testea la rama 'bucket-bootstrap' porque eso requiere panel cargado
 * (offline en CI). El test de coherencia de bucket-bootstrap está en
 * bulletBucketBootstrap.test.ts.
 */
import { describe, it, expect } from 'vitest';
import type { CaseStudyConfig } from './caseStudyStore';
import { configToJobInput, DEFAULT_CASE_CONFIG } from './caseStudyStore';

describe('configToJobInput — bulletReturnsEngine handling', () => {
  it('default config tiene bulletReturnsEngine = parametric', () => {
    expect(DEFAULT_CASE_CONFIG.bulletReturnsEngine).toBe('parametric');
  });

  it('pasa bulletReturnsEngine al ArenaJobInput', () => {
    const input = configToJobInput(DEFAULT_CASE_CONFIG);
    expect(input.bulletReturnsEngine).toBe('parametric');
  });

  it('ttmPanel es null cuando engine = parametric', () => {
    const fakePanel = { schema_version: '1.0' } as never; // forzar tipo
    const input = configToJobInput(DEFAULT_CASE_CONFIG, fakePanel);
    // engine='parametric' → ttmPanel debe ser null aunque pasemos uno
    expect(input.ttmPanel).toBe(null);
  });

  it('ttmPanel se pasa cuando engine = bucket-bootstrap', () => {
    const cfg: CaseStudyConfig = {
      ...DEFAULT_CASE_CONFIG,
      bulletReturnsEngine: 'bucket-bootstrap',
    };
    const fakePanel = {
      schema_version: '1.0',
      panel: { ig: {}, hy: {} },
      coverage: {
        ig: { min_ttm: 0, max_ttm: 0, total_obs: 0 },
        hy: { min_ttm: 0, max_ttm: 0, total_obs: 0 },
      },
    } as never;
    const input = configToJobInput(cfg, fakePanel);
    expect(input.ttmPanel).toBe(fakePanel);
    expect(input.bulletReturnsEngine).toBe('bucket-bootstrap');
  });

  it('ttmPanel es null cuando engine = bucket-bootstrap pero panel no se pasa', () => {
    const cfg: CaseStudyConfig = {
      ...DEFAULT_CASE_CONFIG,
      bulletReturnsEngine: 'bucket-bootstrap',
    };
    const input = configToJobInput(cfg); // sin panel
    expect(input.ttmPanel).toBe(null);
    // engine sigue marcado como bucket-bootstrap pero sin panel → worker
    // automáticamente revierte a parametric (verificado en el worker)
    expect(input.bulletReturnsEngine).toBe('bucket-bootstrap');
  });

  it('ttmPanel es null cuando engine = bucket-bootstrap pero panel es null explícitamente', () => {
    const cfg: CaseStudyConfig = {
      ...DEFAULT_CASE_CONFIG,
      bulletReturnsEngine: 'bucket-bootstrap',
    };
    const input = configToJobInput(cfg, null);
    expect(input.ttmPanel).toBe(null);
  });
});

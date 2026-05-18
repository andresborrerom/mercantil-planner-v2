# Prompt para nueva sesión de Claude Code — Mercantil Planner v2

Copia y pega todo el bloque de abajo al iniciar la sesión.

---

Estoy trabajando en el subproyecto **Mercantil Planner v2**. Lee estos archivos en este orden antes de hacer cualquier otra cosa:

1. `CLAUDE.md` — **fuente de verdad operativa del v2**. Patrones canónicos (worker→hook→store→component, FanChart pattern, draft local en inputs numéricos, sleeves como concepto operativo, paridad Python como contrato, `tsc -b` como source-of-truth). Advances que NO perder. Checklist para extender con un case study nuevo.
2. `INSTRUCCIONES-PLANNER.md` — spec original heredada de v1 (objetivo, stack, motores, UI, AMCs, criterio de aceptación). Si contradice CLAUDE.md, manda CLAUDE.md (es más reciente y refleja la realidad del v2).
3. `progreso-planner.md` — bitácora acumulativa append-only. La entrada **más reciente está al final** y corresponde al **2026-05-18** (housekeeping de documentación post-cierre TBSC).
4. `presentacion-2026-05-08.md` — guion de la presentación dada el 2026-05-08 (contexto de qué se demostró y qué retroalimentación llegó).
5. `research/decisiones-tecnicas-pdf.md` — decisiones técnicas del PDF (con OK explícito).
6. `../about-me.md` (perfil profesional de Andrés, compartido entre proyectos).

**NO leas** ningún otro `.md` de la carpeta raíz `../` — pertenecen a otro proyecto (Estudio de Benchmark Mercantil).

## Checklist antes de tocar código

- Verificá la branch actual. Por defecto trabajamos sobre `main`; si la tarea es exploratoria/refactor, abrí branch dedicada.
- Verificá que los 3 CSVs de `../mercantil_datos/` existen (`mercantil_retornos_backfilled.csv`, `mercantil_rf_decomposed.csv`, `mercantil_yields_mensuales.csv`).
- Corré `npx vitest run` y confirmá **570 tests verdes** (motores Comparador A/B + engines Caso de Estudio con paridad Python: bullets, bootstrap ladder, rollover, cashflow, arena).
- Corré `npm run sanity` y confirmá **5/5 verdes** (determinismo, convergencia SPY ±1pp, perf 5000×360 <15s, RF yield-path IEF, RF bounds BIL).
- Corré `npm run sanity:views` y confirmá **14 presets + ETF smoke tests verdes**.
- Corré `npm run build` como smoke test (esto es `tsc -b && vite build` — lo mismo que CI; CLAUDE.md §6 advierte que `tsc --noEmit` NO es suficiente porque CI valida `noUnusedLocals` y otras reglas estrictas).
- Si vas a tocar Caso de Estudio TBSC: corré `npm run tbsc:demo` y compará los percentiles contra los baselines del Python (`estudios-a-la-medida`).

## Estado al cierre del 2026-05-18

Repo: https://github.com/andresborrerom/mercantil-planner-v2 · Pages: https://andresborrerom.github.io/mercantil-planner-v2/

**Dos tabs en `App.tsx`:**

1. **Comparador A / B** (heredado de v1, NO romper). Compara dos portafolios con AMCs/Signatures. Fan chart maduro, slider de ventana, RegimesPanel, ViewsPanel, ExportBar PDF con secciones A · B · C · D · E (5 páginas, branding Mercantil + carta del asesor).
2. **Caso de Estudio** (v2, extensible). UN portafolio con ladder + tactical rollover + LoanEvent + inflows. TBSC (The British School Caracas, endowment $5M) ya entregado end-to-end. Worker `arena.worker.ts`, hook `useArenaWorker`, store separado `caseStudyStore.ts`, panel `CaseStudyPanel.tsx`. Fan chart con bandas DPF dorado / Custom naranja, comparador A/B/C de variantes, camino individual con re-sampleo, panel "Detalle de sleeves" (Bullets/Equity/Cash).

**Engines portados de Python con paridad bit-a-bit** (CLAUDE.md "Estado actual"):

| Motor TS | Tests unit | Tests paridad |
|---|---|---|
| `src/domain/bullets.ts` | 15 | — |
| `src/domain/bootstrap.ts` (ladder) | 8 | — |
| `src/domain/rollover.ts` | 22 | 31 |
| `src/domain/cashflow.ts` | 20 | 61 |
| `src/domain/arena.ts` | 15 | 61 |

**Suite total**: 570 vitest + 3 playwright. Cualquier cambio en estos motores debe pasar la paridad (tolerancia 1e-5/1e-7) — si rompés, hay un bug.

**Decisiones semánticas congeladas** (no revertir sin discusión):

- Fan chart del Caso de Estudio grafica **AUM gross**, NO net wealth. El préstamo es extra-portfolio (CLAUDE.md §2b).
- Cascada de pago: cash → equity → bullet[shortest]. Alineada con IPS implícito.
- Extension bullets: 25 default. Permite ladder hasta 30y.
- Yield damping fix (CEILING_MULTIPLIER=1.5, FLOOR_ADJUSTMENT=0.005, DAMPING_EXPONENT=2). Sin esto p95 a 20y se infla a $119M.
- Cap mensual de equity hardcoded a `true` en worker (no UI override).
- Préstamo TBSC: SOFR + 150bps · cap hasta 65% AUM.

## Próximos pasos prioritarios (en orden)

1. **PDF del Caso de Estudio TBSC** — existe para Comparador A/B; falta para la tab nueva. Próximo natural según CLAUDE.md "Próximas extensiones esperadas".
2. **Próximo case study particular** (otro endowment / fundación / family office cuando Pocho lo confirme). Decisión arquitectural primero: ¿extender `caseStudyStore` con campos nuevos (si la lógica es la misma) o crear `<Cliente>Store.ts` separado (si es genuinamente distinto)? Si el motor cambia (FX hedging / margin call activo / AUM en CLP), crear motor nuevo en `src/domain/` con su propia paridad Python — NO modificar `arena.ts` para soportar todos los casos (vas a romper TBSC).
3. **Tab de comparación entre case studies** cuando haya ≥2.
4. **Auth multi-usuario con Cloudflare Access** — dominio decidido: `mawm-lab.com` (fallbacks: `mbsadvisory-beta.com`, `mawm-beta.com`, `mawmlab.com`). Pocho compra él mismo bajo cuenta personal de Cloudflare. **NO comprado al cierre del 2026-05-18.** Después de comprar: vite.config base URL → DNS Cloudflare proxy → Access policy con lista de emails autorizados.
5. **Frentes abiertos pre-TBSC** (no urgentes):
   - **Redesign presets WealthWay** (ver memoria `project_planner_redesign_presets.md`). Renombrar `ahorroAcumulacion / jubilacion / herencia` a `liquidity / longevity / legacy` + alinear modelado con doctrina.
   - **Redesign ExportBar** (ver memoria `project_planner_redesign_exportbar.md`). Separar entregable cliente (botón naranja) de utilidades técnicas (Excel + Copy + Paste JSON).
   - GIF animado del drag-and-drop (~1h, requiere pre-generar PDF + simular `DataTransfer` drop event en Playwright).
   - Logo Mercantil AWM hi-res (PNG/SVG) para PDF y portada del instructivo — depende de Pocho.
   - Disclaimers EN/FR/DE (ES ya redactado en dossier sección 9.6).
6. **Secciones restantes del PDF Comparador A/B**: D1, D2, D3, F, G, H, I, J, K, L (sección modulares).
7. **Migración a Node 24** cuando expire deprecation de Node 20 (junio 2026).

## Pendientes de Pocho

- Logo Mercantil AWM en alta resolución (PNG/SVG).
- Paleta y tipografía corporativa final del PDF (hoy está aplicado branding base, ver `src/pdf/theme/`).
- Revisión por hablante nativo de FR y DE en los textos del PDF.
- Compra del dominio `mawm-lab.com`.

## Backlog Fase E

- Inflación nominal/real en cada corrida (idea Pocho: diferencial histórico curvas tasa-fija/inflación vs spread actual como proxy). NO MVP.

## Comandos clave

```bash
npm run dev                # Vite dev server en localhost:5173 (corre build-data.mjs primero)
npm run build              # tsc -b && vite build — mismo que CI
npm run preview            # Sirve dist/ para smoke test
npx vitest run             # 570 tests del dominio
npm run sanity             # 5 chequeos sanidad bootstrap (convergencia SPY, perf, RF)
npm run sanity:views       # 14 presets + ETF smoke tests
npm run tbsc:demo          # Reproduce TBSC y compara contra Python (estudios-a-la-medida)
npm run capture:instructivo # 22 PNGs del instructivo
npx tsx scripts/capture-gifs.ts # 8 GIFs animados
npx playwright test        # 3 e2e
```

## Patrón de push a producción (token bypass)

Credential Manager de Windows tiende a colgarse. Patrón confiable (CLAUDE.md §7):

```powershell
$token = (& <gh.exe> auth token).Trim()
& git push "https://x-access-token:$token@github.com/andresborrerom/mercantil-planner-v2.git" main
```

PowerShell marca "NativeCommandError" porque git escribe a stderr (progreso normal, no error). **Verificar siempre con `git ls-remote origin main` después.**

## Visor de documentos (auxiliar)

`npm run docs:viewer` regenera `research/index.html` (autocontenido, ~450 KB) — indexa los .md del planner root + research + samples + estudio benchmark.

---

Cuando todo esté verde, decime qué entendiste del estado actual del proyecto y proponé el siguiente paso. **Esperá mi OK antes de tocar archivos.**

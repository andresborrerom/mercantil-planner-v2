# Prompt para nueva sesión de Claude Code — Mercantil Planner

Copia y pega todo el bloque de abajo al iniciar la sesión.

---

Estoy trabajando en el subproyecto Mercantil Planner. Lee estos 4 archivos en este orden antes de hacer cualquier otra cosa:

1. `INSTRUCCIONES-PLANNER.md` completo (es la fuente de verdad del subproyecto)
2. `progreso-planner.md` — la bitácora acumulativa. Es append-only; la entrada **más reciente está al final** y corresponde a **Fase D.2** (cableado UI del PDF de cierre + adenda al dossier con feedback Pocho + CVaR/P5/P95 en motor, cerrada 2026-05-05 PM).
3. `research/decisiones-tecnicas-pdf.md` — decisiones técnicas del feature 2 (PDF) ya con OK explícito de Pocho.
4. `../about-me.md` (mi perfil profesional, compartido entre proyectos)

**NO leas** ningún otro `.md` de la carpeta raíz `../` — pertenecen a otro proyecto (Estudio de Benchmark).

Antes de tocar código, hacé el checklist del §14 del spec:

- Verificá que estás en branch `feature/pdf-cierre` (NO en `main`). Mi trabajo activo del PDF está ahí.
- Verificá que los 3 CSVs de `data/` existen.
- Corré `npm test` y confirmá que los **309 tests** pasan (motor del planner + state container PDF + serializador + tail risk CVaR).
- Corré `npm run sanity` y confirmá **5/5 verdes** (determinismo, convergencia SPY ±1pp, perf 5000×360 <15s, RF yield-path IEF, RF bounds BIL).
- Corré `npm run sanity:views` y confirmá **14 presets + ETF smoke tests verdes**.
- Corré `npm run build` como smoke test (debe pasar limpio).

## Estado al cierre del 2026-05-05 PM

Dos features grandes en curso:

**Feature 1 — Auth multi-usuario con Cloudflare Access** (BLOQUEADO en compra dominio):
- Dominio decidido: `mawm-lab.com` (fallbacks: `mbsadvisory-beta.com`, `mawm-beta.com`, `mawmlab.com` si .com no disponible).
- Pocho lo compra él mismo bajo cuenta personal de Cloudflare. **NO se ha comprado aún al cierre del 2026-05-05.** Próxima sesión arranca con esta tarea como primer paso.
- Paso a paso de compra documentado en mensajes de Claude del 2026-05-05 (resumen: Cloudflare Registrar → buscar dominio → checkout ~$10/año .com → contact info ICANN → verificar email → esperar 5-10 min hasta aparecer en Account).
- Después de comprar: configurar Cloudflare Access frente al hosting GH Pages (vite.config base URL → DNS Cloudflare proxy → Access policy con lista de emails autorizados de colegas asesores).

**Feature 2 — PDF de cierre con state container** (CABLEADO, en uso interno):
- Stack: `@react-pdf/renderer` + `react-i18next` + `pdf-lib`.
- Botón "Generar plan personal de inversión" funcional en `ExportBar`. Modal con form completo. Flujo end-to-end: form → render → embed metadata → download.
- 12 secciones planeadas (A→L del dossier sección 9): A (portada) y B (resumen ejecutivo) skeleton implementadas; **9 secciones restantes pendientes** con datos reales del store.
- Idiomas: ES/EN producción, FR/DE borrador con banner ⚠.
- Naming convention: `<cliente>-<bucket>[-ejec].pdf`.
- Wealth Way opción A: un bucket por estudio. Si el cliente tiene múltiples buckets → estudios separados con naming distinto.
- Métricas de cola en motor implementadas (CVaR + P5/P95 + meses negativos) — listas para sección E del PDF.

## Próximos pasos prioritarios (en orden)

1. **Compra del dominio `mawm-lab.com`** (Pocho ejecuta, te toca guiarlo si pide ayuda).
2. **Configuración Cloudflare Access** una vez dominio activo.
3. **Sección E del PDF** cableada a `computeTailRiskAtHorizons` + `computeFanChartBands` (P5/P95 ya disponibles).
4. **Importación de PDF (drag & drop)** → `extractStateFromPdf` → rehidratación del store con confirmación visual.
5. **9 secciones restantes** del PDF con datos reales del store (C, D, F, G, H, I, J, K, L).

## Pendientes de Pocho

- Logo Mercantil AWM en alta resolución (PNG/SVG) para el PDF.
- Paleta y tipografía corporativa final del PDF (placeholders profesionales hoy en `src/pdf/theme/`).
- Revisión por hablante nativo de FR y DE en los textos del PDF (banner BORRADOR activo hasta entonces).
- Disclaimers EN/FR/DE (ES ya redactado en dossier sección 9.6).

## Backlog Fase E

- Inflación nominal/real en cada corrida (idea Pocho: diferencial histórico curvas tasa-fija/inflación vs spread actual como proxy). NO MVP.

## Visor de documentos (auxiliar)

Para revisar el material del proyecto en un visor HTML local con sidebar fijo:

- `npm run docs:viewer` regenera `research/index.html` (autocontenido, ~450 KB).
- Indexa: 4 .md del planner root + 2 .md research + 4 PDFs samples + 4 .md del estudio benchmark.
- `index.html` y `samples/` están gitignored — se regeneran cada vez que cambia contenido.

Cuando todo esté verde, decime qué entendiste del estado actual del proyecto y proponé el siguiente paso. Esperá mi OK antes de tocar archivos.

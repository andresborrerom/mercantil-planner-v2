# Prompt para nueva sesión de Claude Code — Mercantil Planner

Copia y pega todo el bloque de abajo al iniciar la sesión.

---

Estoy trabajando en el subproyecto Mercantil Planner. Lee estos 4 archivos en este orden antes de hacer cualquier otra cosa:

1. `INSTRUCCIONES-PLANNER.md` completo (es la fuente de verdad del subproyecto — spec original).
2. `progreso-planner.md` — la bitácora acumulativa. Es append-only; la entrada **más reciente está al final** y corresponde al **2026-05-07** (8 GIFs animados + drag-and-drop PDF + sección C del PDF, todo desplegado a `main`).
3. `research/decisiones-tecnicas-pdf.md` — decisiones técnicas del PDF ya con OK explícito de Pocho.
4. `presentacion-2026-05-08.md` — guion de la presentación que di el 2026-05-08 (te puede dar contexto de qué se demostró y qué retroalimentación tuve).
5. `../about-me.md` (mi perfil profesional, compartido entre proyectos).

**NO leas** ningún otro `.md` de la carpeta raíz `../` — pertenecen a otro proyecto (Estudio de Benchmark Mercantil).

Antes de tocar código, hacé el checklist del §14 del spec:

- Verificá que estás en branch `feature/pdf-cierre` (NO en `main`). Mi trabajo activo del PDF está ahí.
- Verificá que los 3 CSVs de `data/` existen.
- Corré `npm test` y confirmá que los **337 tests** pasan (motor del planner + state container PDF + serializador + tail risk CVaR + drag-and-drop rehidratación).
- Corré `npm run sanity` y confirmá **5/5 verdes** (determinismo, convergencia SPY ±1pp, perf 5000×360 <15s, RF yield-path IEF, RF bounds BIL).
- Corré `npm run sanity:views` y confirmá **14 presets + ETF smoke tests verdes**.
- Corré `npm run build` como smoke test (debe pasar limpio — incluye `postbuild` que copia el instructivo HTML a `dist/instructivo/`).

## Estado al cierre del 2026-05-07

Día de cierre técnico antes de la presentación interna del 2026-05-08. **Tres deploys del día a `main`** vía CI/CD GitHub Pages:

- `64d7855` — 8 GIFs animados en instructivo (Playwright recordVideo + ffmpeg paleta 2-pass) + `presentacion-2026-05-08.md` con guion de 30 min + script reusable `scripts/capture-gifs.ts`.
- `65f82d7` — Drag-and-drop PDF rehidratación: nuevo `<PdfDropZone>` componente + helper `applyPdfStateToStore` testeado + 7 tests nuevos.
- `daa46ef` — Sección C del PDF (Configuración del plan) en 4 idiomas. PDF pasa de 3 a 4 páginas (A · B · **C** · E).

### Feature 1 — Auth multi-usuario con Cloudflare Access (BLOQUEADO en compra dominio)

- Dominio decidido: `mawm-lab.com` (fallbacks: `mbsadvisory-beta.com`, `mawm-beta.com`, `mawmlab.com` si .com no disponible).
- Pocho lo compra él mismo bajo cuenta personal de Cloudflare. **NO se ha comprado al cierre del 2026-05-07.** Sigue siendo el primer paso natural del Feature 1.
- Paso a paso de compra documentado en mensajes anteriores (resumen: Cloudflare Registrar → buscar dominio → checkout ~$10/año .com → contact info ICANN con WHOIS Privacy → verificar email → 5-10 min hasta aparecer en Account).
- Después de comprar: configurar Cloudflare Access frente al hosting GH Pages (vite.config base URL → DNS Cloudflare proxy → Access policy con lista de emails autorizados de colegas asesores).

### Feature 2 — PDF de cierre con state container (4 páginas + drag-and-drop FUNCIONAL)

Estado al 2026-05-07:
- Stack: `@react-pdf/renderer` + `react-i18next` + `pdf-lib`.
- **Botón "Generar plan personal de inversión" funcional** en `ExportBar`. Modal con form completo (cliente, asesor, bucket, versión, idioma, secciones modulares, carta personalizada).
- Flujo end-to-end: form → render → embed metadata XMP → download → drag-and-drop devuelta → rehidrata el store.
- **Drag-and-drop PDF FUNCIONAL** vía `<PdfDropZone>` montado en App root. Overlay azul durante drag-over, toasts ok/error con auto-dismiss 6s. Helper `applyPdfStateToStore` exportado y testeado (7 tests, incluyendo round-trip embed → extract → apply).
- Secciones implementadas: **A (portada), B (resumen ejecutivo skeleton), C (configuración del plan), E (proyecciones con fan chart SVG + tail risk CVaR + narrative)**. Total: **4 páginas**.
- Secciones pendientes: D1, D2, D3, **D4 (comparativo A vs B con fan chart paralelo — próximo natural)**, F (stress tests modular), G (sensibilidades modular), H, I, J, K (metodología modular), L.
- Idiomas: ES/EN producción, FR/DE borrador con prefijo `[BROUILLON]`/`[ENTWURF]`.
- Naming convention: `<cliente>-<bucket>[-ejec].pdf`.
- Wealth Way opción A: un bucket por estudio. Si el cliente tiene múltiples buckets → estudios separados con naming distinto.
- Métricas de cola en motor: CVaR + P5/P95 + meses negativos. Cableadas a sección E.

### Instructivo del asesor

- Deploy en `andresborrerom.github.io/mercantil-planner/instructivo/`.
- 11 partes (0 a 7 + 4b + 4c) renderizadas, mobile-first responsive con drawer hamburguesa + TOC sticky.
- **22 PNGs + 8 GIFs animados** integrados (commit `64d7855`).
- Botón "Guía del asesor" del header del planner abre el instructivo en pestaña nueva.
- Parte 4b actualizada al 2026-05-07: **drag-and-drop como camino primario**, pegar JSON como fallback explícito.
- Pendientes menores: 1 screenshot del PDF (depende de logo AWM), GIF del drag-and-drop, pinear `[X]` ambiguos en Parte 5 (opcional — stats panel ya están como screenshots).

## Próximos pasos prioritarios (en orden)

1. **Si hay feedback de la presentación 2026-05-08** — atender primero. Pocho avisará cualquier issue que haya surgido.
2. **D4 — Comparativo A vs B con fan chart paralelo** en PDF (próximo natural post-C).
3. **Compra del dominio `mawm-lab.com`** (Pocho ejecuta, te toca guiarlo si pide ayuda).
4. **Configuración Cloudflare Access** una vez dominio activo.
5. **Secciones restantes del PDF** (D1, D2, D3, F, G, H, I, J, K, L).
6. **Redesign presets WealthWay** — frente abierto el 2026-05-07 con OK explícito de Pocho. Ver memoria `project_planner_redesign_presets.md` (renombrar `ahorroAcumulacion / jubilacion / herencia` a `liquidity / longevity / legacy` + alinear el modelado financiero con la doctrina). Pedir alineamiento sobre 3 puntos abiertos antes de implementar.
7. **Redesign ExportBar** — frente abierto el 2026-05-07. Ver memoria `project_planner_redesign_exportbar.md` (separar entregable cliente del workflow técnico).
8. **GIF animado del drag-and-drop** (~1h, requiere pre-generar PDF en script + simular `DataTransfer` drop event).

## Pendientes de Pocho

- Logo Mercantil AWM en alta resolución (PNG/SVG) para el PDF y portada del instructivo.
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

## Pipeline operativo de captura visual

- **Screenshots del instructivo** (22 PNGs): `scripts/capture-instructivo.ts`. Pre-requisito: `npm run preview` corriendo en port 4173. Comando: `npm run capture:instructivo`.
- **GIFs del instructivo** (8 GIFs): `scripts/capture-gifs.ts`. Pre-requisito: `npm run preview` + `ffmpeg` en PATH (`winget install Gyan.FFmpeg.Essentials`). Comando: `npx tsx scripts/capture-gifs.ts` (corre los 8 specs) o filtrado por nombre parcial.
- **Build del instructivo HTML**: `npm run instructivo:build:dist` (production a `dist/instructivo/`). Se incluye automático en `npm run build` vía `postbuild`.

Cuando todo esté verde, decime qué entendiste del estado actual del proyecto y proponé el siguiente paso. **Esperá mi OK antes de tocar archivos.**

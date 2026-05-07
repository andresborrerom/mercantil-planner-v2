# Instructivo del Planificador Patrimonial — fuente Markdown

Carpeta de trabajo para el **instructivo comercial en PDF** del Planificador Patrimonial de Mercantil AWM. Los archivos `.md` de esta carpeta son la fuente de contenido; el PDF final se genera con Pandoc (ver sección de build al final).

## Audiencia y contexto de uso

- Equipo comercial completo (asesores senior + junior), usando el instructivo como material de capacitación y como ficha de consulta rápida.
- Contexto típico: el asesor arma el portafolio **junto con el cliente** en una reunión en vivo, con la herramienta abierta en pantalla.
- Principio rector: *"el riesgo real no es la volatilidad, es no cumplir el objetivo"*. El instructivo explica cada indicador bajo esa lente y, en paralelo, documenta el costo del camino (vol, drawdown, meses negativos) para generar un contrato emocional explícito con el cliente que facilite el seguimiento posterior.

## Índice

| Parte | Archivo | Estado al 2026-05-06 |
|---|---|---|
| 0 | `parte-0-portada.md` — portada + índice + carta editorial | borrador v1 — actualizar logo cuando esté listo |
| 1 | `parte-1-por-que-confiar.md` — racional metodológico | borrador v1 actualizado a Fase D.3 (CVaR + 330 tests + PDF cierre) |
| 2 | `parte-2-mapa-herramienta.md` — recorrido visual por la UI | borrador v1 — pendiente capturar 10 assets |
| 3 | `parte-3-los-cuatro-pasos.md` — manual operativo | borrador v1 — pendiente capturar 4 assets |
| 4 | `parte-4-glosario-nueve-indicadores.md` — 9 métricas + anexo CVaR | borrador v1 actualizado a Fase D.3 |
| 4b | `parte-4b-seguimiento-futuro.md` — uso en seguimientos | borrador v1 — pendiente capturar 4 assets |
| 4c | `parte-4c-manejo-de-views.md` — análisis condicional | borrador v1 actualizado a Fase C.4 (10 presets) |
| 5 | `parte-5-casos-cliente.md` — Pablo / Diana / Marta / Carlos | borrador v1 + cierre con PDF — pendiente pinear `[X]` |
| 6 | `parte-6-faq-y-limites.md` | borrador v1 actualizado con Q&A de PDF + auth |
| 7 | `parte-7-troubleshooting.md` | borrador v1 actualizado con sección PDF + auth |

## Cobertura del producto al cierre del 2026-05-06

Esta versión del instructivo cubre los siguientes features de la herramienta:

- Motor block bootstrap pareado sobre 32 ETFs, 5000 paths × 360 meses, RF yield-path reconstruction (Fase 2 cerrada).
- Toggle de AMCs propuestos con autofallback destructivo.
- Slider dual-thumb de ventana sincronizado entre fan chart y profile preview.
- Stats panel con 9 métricas en formato A vs B vs Δ.
- 10 presets de views: 4 sobre tasas, 5 sobre portafolio, 1 synchronized (estanflación SPY↓ Y TNX↑ ≥3m en 12m, Fase C.4).
- Builder dinámico de views: single, composite AND/OR, sincronizado mes a mes.
- Panel de regímenes históricos: Crisis 2008, COVID 2020, Inflación 2022 — dos interpretaciones simultáneas (tasas actuales / tasas del período).
- Métricas de cola (CVaR_5 / CVaR_95 / P5 / P95) en motor + sección E del PDF de cierre.
- PDF de cierre "Generar plan personal de inversión" — modal con form completo (cliente, asesor, bucket Wealth Way, versión, idioma, secciones modulares, carta personalizada). Naming convention `cliente-bucket[-ejec].pdf`.
- State container JSON embebido en metadata XMP del PDF, round-trip validado.
- 4 idiomas: ES/EN producción, FR/DE borrador con banner draft.
- Export Excel (xlsx) + clipboard JSON para compartir config.

Pendientes que se incorporarán al instructivo cuando se activen:

- **Auth Cloudflare Access** — bloqueado en compra del dominio `mawm-lab.com`. Cuando esté en producción, las partes 6 y 7 se actualizan con los detalles operativos finales.
- **Importación drag-and-drop de PDF** — actualmente la rehidratación entre sesiones es manual via *Copiar config* / *Pegar config JSON*. Cuando la importación esté en producción, parte 4b se actualiza con el flujo nuevo.
- **D4 — comparativo A vs B con fan chart paralelo en el PDF** — actualmente la sección E del PDF muestra sólo el portafolio A; cuando D4 esté implementada, parte 5 (casos cliente) se actualiza para reflejar que el comparativo vive ahí.

## Convenciones

- **Moneda**: USD con separador de miles por punto y decimal por coma (ej. `USD 1.200.000` o `USD 2,7 millones`).
- **Porcentajes**: un decimal cuando aporta (`7,5%`), sin decimal cuando no (`5%`).
- **Puntos porcentuales**: escribir "puntos porcentuales" o "pp" para diferenciar de porcentajes relativos.
- **Tono con el cliente**: siempre "usted". Las frases sugeridas al cliente van en *cursiva entre comillas*.
- **Tono con el asesor (lector del instructivo)**: neutral profesional, léxico bogotano.
- **Marcadores de assets pendientes**: `[GIF — duración, descripción, notas]` y `[SCREENSHOT — descripción, notas]`. Cada parte tiene al final una tabla consolidada con todos sus pendientes.

## Stack de producción (open-source)

- **Fuente**: Markdown (`.md`) en esta carpeta.
- **Screenshots**: Greenshot (captura con anotaciones) — https://getgreenshot.org
- **GIFs**: ScreenToGif — https://www.screentogif.com
- **Diagramas vectoriales**: Inkscape — https://inkscape.org
- **Edición de imágenes**: GIMP — https://www.gimp.org
- **Generación del PDF**: Pandoc + LaTeX (MiKTeX en Windows).
- **Fuentes**: Inter (UI) + IBM Plex Serif (texto largo), ambas con licencia OFL.

## Cómo grabar los GIFs y screenshots — guía rápida

Para mantener consistencia visual a lo largo del instructivo, seguir esta receta cuando se graben los assets pendientes:

### Configuración general antes de capturar

1. **Abrir la herramienta a 1280×800** mínimo. Cerrar otras pestañas y desactivar extensiones del navegador para evitar barras adicionales.
2. **Modo claro** por default (excepto cuando el asset explícitamente pide modo oscuro).
3. **Navegador**: Chrome o Edge en una pestaña limpia. F11 para ocultar barras del navegador si distrae.
4. **Caso sample default**: USD 1.500.000 capital inicial, horizonte 240 meses, modo real, inflación 2,5%, regla de aporte mensual USD 5.000 con crecimiento 3%, portafolio A = Balanceado, portafolio B = Crecimiento. Este es el mismo caso que usan los samples del PDF (`scripts/generate-pdf-samples.ts`) — mantener consistencia ayuda a que los visuales del instructivo y los samples del PDF "calcen".

### GIFs

1. **ScreenToGif** abre, click *Recorder* (F7), tamaño de captura ajustable.
2. **FPS sugerido**: 12-15. Más alto sólo si el movimiento del GIF es muy rápido (≤ 5 s con muchos clicks).
3. **Optimización**: al guardar, usar el preset *"Smaller — for sharing"* y verificar que el archivo final pese < 2 MB. Si pesa más, recortar fotogramas iniciales/finales y reducir el área de captura.
4. **Encuadre**: incluir sólo la zona relevante de la herramienta. Para un GIF del fan chart, no capturar todo el panel de stats — sólo el chart y el botón Simular.
5. **Naming**: `parte-N-asset-M-descripcion-corta.gif`. Ejemplo: `parte-2-2.6-toggle-overlay-fan-chart.gif`.

### Screenshots

1. **Greenshot** captura con tecla `Print Screen`. Usar *"Captura de región"* y seleccionar sólo el área relevante.
2. **Anotaciones**: Greenshot permite agregar flechas, círculos, números — usarlas con moderación. Una flecha por screenshot máximo, o un par de números si hay que ordenar pasos.
3. **Resolución**: PNG 96 DPI mínimo. Si se va a imprimir el PDF a A4, mejor 150 DPI.
4. **Naming**: `parte-N-asset-M-descripcion-corta.png`. Ejemplo: `parte-2-2.5-flow-editor-pablo.png`.

### Carpeta de assets

`instructivo/assets/` — todos los GIFs y screenshots viven ahí. **Sí se commitean al repo** para que GitHub Pages (y luego Cloudflare) los sirvan automáticamente sin flujo de upload paralelo. Los `.md` los referencian con paths relativos: `![Mapa de la herramienta](assets/parte-2-01-vista-completa.png)`.

Tamaño estimado total tras capturar los ~25 assets: ~12 MB. No hay impacto operativo en el repo.

## Build del PDF (cuando esté completo)

```bash
cd instructivo/
pandoc parte-0-*.md parte-1-*.md parte-2-*.md parte-3-*.md \
       parte-4-*.md parte-4b-*.md parte-4c-*.md \
       parte-5-*.md parte-6-*.md parte-7-*.md \
       -o instructivo-planificador-mercantil.pdf \
       --pdf-engine=xelatex \
       --toc \
       --number-sections \
       -V mainfont="IBM Plex Serif" \
       -V sansfont="Inter"
```

Los screenshots y GIFs viven en `instructivo/assets/` y se referencian con paths relativos desde los `.md`.

## Flujo de trabajo

1. **Completar borradores de contenido** (estado actual: 10 partes en borrador v1).
2. **Tomar screenshots y GIFs** con la herramienta abierta en vivo — cada parte tiene al final su lista consolidada de assets pendientes con instrucciones específicas. Total estimado: ~30 assets entre GIFs y screenshots, 4-6 horas de captura.
3. **Pinear los valores `[X]`** del parte 5 corriendo los 4 casos en la herramienta y reemplazando en el texto.
4. **Revisión editorial final** (un solo asesor senior lee el PDF completo y anota).
5. **Build con Pandoc**, revisión visual del PDF.
6. **Distribución interna** al equipo comercial.

## Inventario consolidado de assets

### ✅ Capturados automáticamente (22 PNG)

Todos generados con `npm run capture:instructivo` (Playwright). Output: `instructivo/assets/`. El script vive en `scripts/capture-instructivo.ts`.

| Parte | Cantidad | IDs |
|---|---|---|
| 2 | 10 | overview, header, selector, perfil, flujos, fan chart, stats, views, regimes, exportar |
| 3 | 3 | Pablo fan chart, Pablo stats, Views asimétrico |
| 4b | 3 | Marta original, Marta seguimiento, Modal PDF seguimiento |
| 4c | 1 | Sync builder (Fase C.4) |
| 5 | 4 | Pablo stats, Diana stats, Marta stats, Carlos stats |

Para regenerar (ej. tras cambios en la UI): `npm run preview` en una terminal + `npm run capture:instructivo` en otra. Los PNG se regeneran determinísticamente desde el state hidratado via "Pegar config JSON".

### ✅ GIFs animados — 8 de 9 hechos al 2026-05-07

Los GIFs se generan ahora con pipeline automatizado: `scripts/capture-gifs.ts` (Playwright `recordVideo` + ffmpeg paleta 2-pass). Pre-requisito: `npm run preview` corriendo en port 4173 + ffmpeg en PATH.

```
npx tsx scripts/capture-gifs.ts                  # corre los 8 specs definidos
npx tsx scripts/capture-gifs.ts toggle-overlay   # filtra por nombre parcial
$env:HEADED='1'; npx tsx scripts/capture-gifs.ts # modo headed para debug
```

| Asset | MB | Estado | Notas |
|---|---|---|---|
| `parte-2-03-toggle-amc-destructivo.gif` | 0.38 | ✅ | Re-grabado a 1.5x post feedback Pocho |
| `parte-2-09-sample-path.gif` | 1.26 | ✅ | 4 clicks, KPIs estables |
| `parte-2-10-toggle-overlay.gif` | 2.10 | ✅ | View asimétrico, alternar 3× |
| `parte-2-11-estanflacion-sincronizada.gif` | 2.29 | ✅ | Preset Sincronizado |
| `parte-2-14-modal-pdf.gif` | 2.45 | ✅ | Modal PDF recorrido sin generar |
| `parte-3-01-pablo-config-cero.gif` | 1.23 | ✅ | Configurar Pablo desde default |
| `parte-3-13-pdf-flow.gif` | 2.58 | ✅ | Flujo PDF end-to-end con descarga |
| `parte-4b-01-rehidratar.gif` | 2.50 | ✅ | Rehidratación fallback (pegar JSON) |
| Cierre Pablo (Parte 5) | — | ✅ reusado | Parte 5 reusa `parte-3-13-pdf-flow.gif` (mecánica idéntica para los 4 casos) |

**Pendiente:** GIF del drag-and-drop PDF (camino primario de Parte 4b). Requiere pre-generar PDF en el script y simular `DataTransfer` drop event en Playwright. Estimado ~1h. Mientras tanto, el instructivo describe el flujo en texto.

### ⏳ Pendientes manuales

**Screenshot**: `parte-4-anexo-cvar.png` — sección E del PDF de cierre. Abrir `research/samples/pocho-longevity.es.pdf` con Adobe Reader, página 3, capturar tabla con Greenshot.

**Logo**: `instructivo/assets/logo-mercantil.png` — entrega Pocho cuando esté listo el archivo hi-res.

**Pinear los `[X]` de Parte 5** (opcional): los placeholders narrativos en `parte-5-casos-cliente.md` (ej. `[USD X]`, `[A%]`, `[-Y%]`) refieren a métricas específicas por caso. Los stats panel de cada caso ya están como screenshots — el lector los interpreta visualmente. Si querés pinearlos en texto, los números reales están en las imágenes capturadas (ver `parte-5-{pablo,diana,marta,carlos}-stats.png`).

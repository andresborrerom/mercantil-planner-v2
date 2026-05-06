# Decisiones técnicas — Feature 2 (PDF de cierre)

Documento de decisiones para validar con OK explícito antes de seguir profundizando. Sesión 2026-05-05, branch `feature/pdf-cierre`.

---

## 1. Biblioteca para generar el PDF

**Decisión:** `@react-pdf/renderer` v4.x.

Ojo con la confusión común: hay dos paquetes parecidos.

| Paquete | Función | ¿Lo usamos? |
|---|---|---|
| `@react-pdf/renderer` | **Genera** PDFs declarativamente con componentes React (`<Document>`, `<Page>`, `<Text>`, `<View>`) | ✅ Sí |
| `react-pdf` | **Visualiza** PDFs en el navegador (wrapper de pdf.js) | ❌ No |

**Por qué:** API declarativa, integra con React 19, soporta charts via SVG, soporta metadata XMP custom (necesario para state container), tiene buenos resultados tipográficos, generación 100% client-side.

**Alternativas descartadas:**
- `pdfmake`: API basada en JSON, menos expresivo para layouts complejos. Inferior para charts.
- `jsPDF` + `html2canvas`: produce PDFs como imágenes (no texto seleccionable, no metadata). Inaceptable para entregable profesional.
- `Puppeteer` server-side: requiere backend. Descartado por la decisión de mantener arquitectura client-side.

---

## 2. Internacionalización (i18n)

**Decisión:** `i18next` + `react-i18next` + `i18next-browser-languagedetector`.

**Por qué:** estándar industrial, mantenido, soporta plurales, fechas, números formateados por locale, lazy-loading de bundles por idioma. La UI del planner queda lista también para i18n más adelante (no solo el PDF).

**Estructura:**

```
src/i18n/
  index.ts                  # config inicialización
  locales/
    es.json                 # español (calidad cliente final)
    en.json                 # inglés (calidad cliente final)
    fr.json                 # francés (BORRADOR — requiere revisión nativa)
    de.json                 # alemán (BORRADOR — requiere revisión nativa)
```

Los archivos JSON están organizados por namespace: `pdf.cover.title`, `pdf.exec.objective`, `pdf.disclaimer.forwardLooking`, etc. Para skeleton se crean placeholders mínimos en ES/EN — FR/DE quedan como copia de EN con marcador `[BORRADOR]` para que se vea en el PDF que necesita revisión.

---

## 3. State container — JSON embebido en metadata XMP

**Decisión:** se serializa el subset relevante del store de Zustand a JSON y se inyecta como **XMP custom metadata** en el PDF generado por `@react-pdf/renderer`.

**Cómo funciona técnicamente:**

- `@react-pdf/renderer` acepta `<Document>` con prop `producer` y un mecanismo para inyectar XMP metadata vía `customMetadata` (o lo equivalente en su API más reciente). Si la API no expone XMP custom directamente, se hace post-processing con `pdf-lib` (~50 KB extra) tras generar el PDF.
- El JSON se guarda bajo un namespace XMP propio: `xmlns:mawm="http://mawm-lab.com/xmp/1.0/"`. Campo `mawm:state` con el JSON serializado.
- Para extraer en sesiones futuras: drag & drop de PDF al planner → leer ArrayBuffer → parsear con `pdf-lib` → extraer `mawm:state` → `JSON.parse` → rehidratar store.

**Lo que va en el state JSON (subset relevante del store):**

```typescript
type PdfStateContainer = {
  version: 1;                              // versionar para forward-compat
  generatedAt: string;                     // ISO timestamp
  client: {
    name: string;                          // ej. "Pocho"
    bucket: 'liquidity' | 'longevity' | 'legacy';
  };
  locale: 'es' | 'en' | 'fr' | 'de';
  // Estado del planner (subset):
  portfolioA: PortfolioSpec;
  portfolioB: PortfolioSpec;
  plan: PlanSpec;
  bootstrap: BootstrapConfig;
  window: { startMonth: number; endMonth: number };
  // No se incluye Float32Array de retornos — son determinísticos dado seed + portafolios.
  // El planner los regenera al rehidratar.
};
```

**Validación crítica esta sesión:** voy a hacer un round-trip test (serializar → embeber → leer → parsear → comparar) en task #6. Si la API de `@react-pdf/renderer` no soporta XMP custom directamente, el plan B es post-process con `pdf-lib`.

**Riesgo conocido:** algunos visores de PDF "saneadores" (ej. compresores web) pueden eliminar metadata XMP custom. Mitigación: probar con Adobe Reader, Preview macOS, Chrome built-in viewer. Si es problema, plan C: adjuntar el JSON como **embedded file attachment** (también estándar PDF, más robusto contra saneamiento).

---

## 4. Naming convention de archivos generados

**Decisión:** `<cliente>-<bucket>[-ejec].pdf`

Ejemplos:
- `pocho-longevity.pdf` → versión completa (default, sin sufijo)
- `pocho-longevity-ejec.pdf` → versión ejecutiva
- `cliente-x-legacy.pdf`
- `cliente-x-legacy-ejec.pdf`

**Reglas:**
- Slug del cliente: lowercase, sin espacios (espacios → guion), sin acentos (`ñ→n`, `é→e`).
- Bucket: literal `liquidity`, `longevity` o `legacy`.
- Versión completa = sin sufijo (es la default — es el documento de seguimiento, lo más rico).
- Versión ejecutiva = sufijo `-ejec` (es el subset corto).

**Por qué lo más corto sin sufijo es la completa:** el flujo natural es que el asesor genera la completa (audita todo) y opcionalmente exporta una ejecutiva para que el cliente lea rápido. La completa es el archivo "de referencia".

---

## 5. Estructura de carpetas

```
src/
  pdf/
    index.ts                    # exports públicos del módulo
    MercantilPdf.tsx            # <Document> root con metadata
    sections/                   # 12 secciones A→L (creo skeleton de A y B en esta sesión)
      A_Cover.tsx
      B_ExecutiveSummary.tsx
      C_Profile.tsx             # TODO en sesión futura
      D_Portfolio.tsx           # TODO
      E_Projections.tsx         # TODO
      F_StressTests.tsx         # TODO (modular)
      G_Sensitivities.tsx       # TODO (modular)
      H_Costs.tsx               # TODO
      I_Monitoring.tsx          # TODO
      J_Glossary.tsx            # TODO
      K_Methodology.tsx         # TODO (modular)
      L_Disclaimers.tsx         # TODO
    components/                 # primitivos UI compartidos
      PdfHeader.tsx
      PdfFooter.tsx             # incluye versión + ID único en cada página
      PdfMetric.tsx             # número grande con label
      PdfTable.tsx              # tabla genérica con estilos consistentes
    state/
      types.ts                  # PdfStateContainer
      serialize.ts              # store → PdfStateContainer
      hydrate.ts                # PdfStateContainer → store actions
      metadata.ts               # XMP embedding helpers
    theme/
      colors.ts                 # paleta corporativa Mercantil AWM (TBD con Pocho)
      typography.ts             # par tipográfica serif+sans
      spacing.ts
    PdfPreview.tsx              # <PDFViewer> en UI del planner
    PdfDownloadButton.tsx       # <PDFDownloadLink> en UI
    PdfImportButton.tsx         # drag & drop / file input para rehidratar
  i18n/
    index.ts
    locales/
      es.json
      en.json
      fr.json
      de.json
```

---

## 6. Cómo se integra con la UI del planner (flujo asesor)

**Generación del PDF:**

1. Asesor termina de configurar simulación en la UI actual.
2. Click en botón nuevo "Exportar entregable" en `ExportBar`.
3. Se abre modal con form:
   - Nombre del cliente (text input).
   - Bucket Wealth Way (radio: Liquidity / Longevity / Legacy).
   - Versión (radio: Completa / Ejecutiva).
   - Idioma (radio: ES / EN / FR / DE).
   - Checklist de secciones modulares (F / G / K activables).
   - (Opcional) Carta personalizada del asesor (textarea, va en sección A2).
4. Click "Generar" → `<PDFDownloadLink>` produce el blob → download con naming convention.

**Importación de PDF (sesión futura):**

1. En `ExportBar` aparece también botón "Importar entregable previo".
2. Drag & drop o file input.
3. `pdf-lib` lee el ArrayBuffer, extrae `mawm:state` de XMP.
4. Se valida el version field, se rehidrata el store con las acciones equivalentes.
5. UI muestra confirmación con datos extraídos (cliente, bucket, fecha de generación) y banner "Sesión continuada desde entregable de [fecha]".

---

## 7. Naming del módulo en la UI

**Pendiente decisión Pocho:** el botón en `ExportBar` debe llamarse algo claro y profesional. Propuestas:

1. **"Exportar entregable"** ← genérico, claro
2. **"Generar carta de cierre"**
3. **"Generar plan personal de inversión"** ← mainstream-friendly
4. **"Exportar PDF"** ← técnico, menos profesional

Mi voto: **"Generar plan personal de inversión"** porque es el lenguaje del cliente final y se lee bien en el botón.

---

## 8. Lo que NO está decidido y necesita Pocho

- Naming del módulo en la UI (sección 7).
- Paleta exacta de colores de Mercantil AWM (theme/colors.ts).
- Par tipográfica final (theme/typography.ts).
- Logo de Mercantil AWM en alta resolución (PNG/SVG).
- Validación del state container approach (tras task #6 valido yo, pero Pocho confirma OK del approach).
- Contenido literal de cada sección (copy en ES/EN/FR/DE).

---

## Ítems de validación con OK explícito al volver

- [ ] §1 — `@react-pdf/renderer` como biblioteca PDF.
- [ ] §2 — `i18next` + `react-i18next` para idiomas.
- [ ] §3 — XMP custom metadata como state container, con plan B (file attachment) si XMP es saneado.
- [ ] §4 — Naming convention `<cliente>-<bucket>[-ejec].pdf`.
- [ ] §5 — Estructura de carpetas `src/pdf/` y `src/i18n/`.
- [ ] §6 — Flujo de generación e importación.
- [ ] §7 — Naming del botón en UI.

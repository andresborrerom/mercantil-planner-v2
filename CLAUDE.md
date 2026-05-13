# Guidance for Claude — mercantil-planner-v2

Este archivo es para futuras sesiones de Claude trabajando en este repo. Lee esto **completo antes de tocar código**, especialmente las secciones de "advances que NO perder" y "patrones canónicos".

---

## Propósito del repo

`mercantil-planner-v2` es la **segunda generación** de la herramienta interna de Mercantil SFI para construcción y simulación de portafolios. La v1 (`mercantil-planner`) sigue viva y NO se debe tocar — esta v2 es donde se desarrollan capacidades nuevas (case studies particulares por cliente).

Vivirán **múltiples case studies** dentro de esta v2 — el TBSC (The British School Caracas, endowment $5M) fue el primero pero habrá más. Por eso la arquitectura es modular: el componente `CaseStudyPanel` y el worker `arena.worker.ts` son la base extensible para los siguientes casos, no algo descartable.

---

## Estado actual (snapshot)

### Motores portados de Python (validados bit-a-bit con paridad tests)

| Motor TS | Port de Python | Tests unit | Tests paridad |
|----------|----------------|------------|---------------|
| `src/domain/bullets.ts` | `code/bullet_tier.py` | 15 (T1/T2/T3) | — |
| `src/domain/bootstrap.ts` ladder | `code/bootstrap_core.py` | 8 ladder integ. | — |
| `src/domain/rollover.ts` | `code/rollover.py` | 22 | 31 |
| `src/domain/cashflow.ts` | `code/cashflow.py` | 20 | 61 |
| `src/domain/arena.ts` | `code/arena_extended.py` | 15 | 61 |

**Suite total**: 570 vitest + 3 playwright. Cualquier cambio en estos motores **debe pasar la paridad** — si rompés tolerancia 1e-5/1e-7, hay un bug.

### UI canónica

**Dos tabs en `App.tsx`**:
1. **Comparador A / B** (heredado de v1, NO romper). Compara dos portafolios con AMCs/Signatures. Tiene FanChart maduro, slider de ventana, RegimesPanel, ViewsPanel, ExportBar PDF.
2. **Caso de Estudio** (v2, extensible). UN portafolio con ladder + tactical rollover + LoanEvent + inflows. Esta es la tab donde se desarrollan los case studies particulares.

### Deploy

- Repo: https://github.com/andresborrerom/mercantil-planner-v2
- Pages: https://andresborrerom.github.io/mercantil-planner-v2/
- `vite.config.ts` debe tener `base: '/mercantil-planner-v2/'` (NO `/mercantil-planner/` — esa era v1 y rompía Pages con pantalla negra).

---

## Patrones canónicos que NO romper

### 1. Worker → Hook → Store → Component

Para cualquier cálculo pesado en el browser, este es el flujo:

```
arena.worker.ts          ← cálculo (lee inputs, postMessage con result)
useArenaWorker.ts        ← React hook (crea worker en mount, .run() devuelve Promise)
caseStudyStore.ts        ← Zustand store separado del principal
CaseStudyPanel.tsx       ← UI que consume el hook + store
```

Replicá esto para los próximos case studies: cada caso particular debería tener su propio store-slice y panel, pero puede reusar el mismo worker si la lógica es la misma. NO mezcles dos case studies distintos en el mismo store; los modelos mentales se contaminan.

### 2. FanChart pattern (charts del v2 deben matchearlo)

El `FanChart.tsx` del Comparador A/B es el **patrón canónico** para charts de proyección patrimonial. Cualquier chart nuevo de bandas percentiles debe seguir este patrón, no inventar uno propio:

- **Bandas como tuplas** `dataKey={[lower, upper]}` (NO `<Area>` apilados desde 0 con stackIds distintos — eso pinta zona base fantasma).
- **X-axis** `type="number"` + `domain={[start, end]}` + `ticks=[...años]` (NO `type="category"` con tickFormatter redondeando — duplica labels).
- **Y-axis dinámico** computado solo sobre data DENTRO de la ventana visible, con padding 5%. Incluye en el cómputo las ReferenceLines (capital inicial, savings baseline) para que no queden fuera de pantalla.
- **Slider de ventana** con `RangeSlider` + chips de período (1y/3y/5y/10y/Total). El usuario espera poder zoomear sin re-correr la simulación — `window` es estado local React, no se reenvía al worker.
- **ReferenceLines** para baselines interpretables: capital inicial (gris punteado) y capital + aportes acumulados (verde punteado). Sin ellas la mediana flota en el vacío y nadie sabe si "agrega valor".

El `CaseStudyPanel` ya tiene este patrón. **Cuando crees el próximo case study, reusá `CaseStudyPanel` como referencia, no `FanChart` directamente** — FanChart es más complejo porque maneja A vs B + views condicionales.

### 3. Sleeves como concepto operativo

Un **sleeve** es un subconjunto del portafolio con su propia regla operativa, no solo una asset class. Los outputs del modelo (ventas forzadas, eventos, rebalance) operan **a nivel sleeve**. El `SleevesDetailPanel` dentro de `CaseStudyPanel.tsx` documenta los 3 sleeves (Bullets / Equity / Cash) con detalle de diversificación interna — replicalo para case studies con composiciones diferentes (mantené el mismo nivel de detalle).

### 4. Paridad Python como contrato

Cuando portes un motor nuevo de Python a TS, **siempre escribe el dump-script Python equivalente** que genera fixtures bit-a-bit en `tests/fixtures/*.json`. El patrón está en `code/dump_*_parity.py` del repo `estudios-a-la-medida`. Si no podés escribir paridad bit-a-bit (por diferencias de PRNG o block sampling), al menos hacé un script de comparación estadística (ver `scripts/run-tbsc.ts`) que muestre divergencias en medianas/percentiles.

### 5. `tsc -b` como source-of-truth

El typecheck local con `tsc --noEmit` NO es suficiente: el build de CI corre `tsc -b` (mode project references) que valida `noUnusedLocals: true` y otras reglas más estrictas. **Antes de cada commit corré**:

```bash
npm run build   # = tsc -b && vite build (lo mismo que CI)
npx vitest run  # 570/570 debe pasar
```

Si rompés cualquiera de los 2, no pushees. Las regresiones de noUnusedLocals ya rompieron Pages una vez (commit 7cced5d → 4 builds rotos hasta e637892).

### 6. Push a producción con token bypass

Credential Manager de Windows tiende a colgarse cuando trato de pushear. El patrón confiable está documentado en `~/.claude/projects/.../memory/reference_github_automation.md`:

```powershell
$token = (& <gh.exe> auth token).Trim()
& git push "https://x-access-token:$token@github.com/<owner>/<repo>.git" main
```

PowerShell marca "NativeCommandError" porque git escribe a stderr (es progreso normal, no error). **Verificar siempre con `git ls-remote origin main` después.**

---

## Advances que NO perder

### Engine (validados, no romper sin paridad test)

1. **Yield damping fix** (2026-05-12) en `bootstrap.ts` líneas 580–610. CEILING_MULTIPLIER=1.5, FLOOR_ADJUSTMENT=0.005, DAMPING_EXPONENT=2. Si cambiás esto, p95 a 20y se infla a $119M (era el bug original).

2. **Bullet pricing con curve+roll+convex decomposition** en `bullets.ts:bulletReturnDecomp`. NO simplifiques esto a "carry + duration × dy" — el roll-down es un componente crítico del alpha del ladder.

3. **Cascada de pago en `cashflow.ts:cashflowStep`**: orden exacto cash → equity → bullet[shortest]. NO cambies el orden, está alineado con el IPS implícito (proteger los bullets largos primero).

4. **Extension bullets en `arena.ts:createExtensionBullets`**: +1y arriba del longest real, 25 extensions default. Permite ladder de hasta 30y. Si reducís nExtensions, horizontes largos caen en FALLBACK_EQUITY (todo el principal vencido va a equity → distorsiona el modelo).

### UI (visibles, no romper sin alternativa equivalente)

1. **Tab "Comparador A / B"** intacta, con su flujo original A vs B. NO mezcles inputs del case study acá.

2. **Tab "Caso de Estudio"**:
   - Inputs jerárquicos: Mercado / Allocation / Flujos / Préstamo (toggle) / Avanzado (collapsible). Mantené esta jerarquía.
   - **Validación de allocation** (suma debe = 100%). Botón se deshabilita si no.
   - **Sección "Detalle de los sleeves"** con 3 cards collapsible (Bullets/Equity/Cash). Cualquier case study nuevo debe llevar su versión.
   - **Fan chart con slider + Y dinámico + chips de período + ReferenceLines + callouts pedagógicos** (corto plazo = volatilidad / largo plazo = no cumplir objetivo).

3. **Worker performance**: 500 sims × 120 meses corre en ~4s en el browser. NO regresiones de performance por cambios al engine sin justificación.

---

## Cómo extender — checklist para un case study nuevo

Imaginemos que viene otro endowment de cliente y necesitamos un caso aparte. Pasos:

1. **No clones `CaseStudyPanel.tsx` entero** — extendé `caseStudyStore.ts` con campos nuevos si la lógica es la misma, o crea `<Cliente>Store.ts` separado si es genuinamente distinto.

2. **Si la lógica del motor es la misma** (bullets + equity + cash + tactical rollover + optional loan), reusá `arena.worker.ts`. Solo cambia los **defaults** en el store del nuevo cliente.

3. **Si el motor cambia** (ej. cliente con AUM en CLP que requiere FX hedging, o con margin call activo), crea un motor nuevo en `src/domain/` con su propia paridad Python. NO modifiques `arena.ts` para soportar todos los casos — vas a romper el TBSC.

4. **El panel UI**: si es un cliente más en la misma categoría, sumá una sub-tab o un dropdown de cliente en `CaseStudyPanel`. Si es un dominio nuevo (ej. fondos pensionales), crea una tab nueva en `App.tsx` paralela al Comparador y al Caso de Estudio.

5. **Testá**:
   - `npm run build` ✓ (CI mode)
   - `npx vitest run` ✓ (570+ tests)
   - `npx playwright test case-study` ✓ (3 e2e mínimo)
   - Smoke manual del flujo end-to-end en `npm run dev`

6. **Push pattern** (token bypass) → verificar deploy en Pages → screenshot del resultado para confirmar visualmente.

---

## Referencias cruzadas

- Repo Python con motor original: `estudios-a-la-medida` (https://github.com/andresborrerom/estudios-a-la-medida). Mantenido por Andrés. v2 lee fixtures de paridad desde scripts ahí.
- Presentación TBSC: `presentacion/presentation_endowment.html` en `estudios-a-la-medida`. Tiene Cap 3b con composición detallada — buen modelo de profundidad de explicación a cliente.
- Memoria personal de Andrés (cross-session): `~/.claude/projects/C--Users-pocho-OneDrive-MERCANTIL-ESTUDIOS-A-LA-MEDIDA/memory/`. Lee `MEMORY.md` ahí antes de empezar — tiene contexto crítico sobre el cliente y el proyecto.

---

## Última actualización

2026-05-12 (sesión H5b + Cap 3b presentación + fix Pages + slider + sleeves + este CLAUDE.md).

Próximas extensiones esperadas:
- Más case studies particulares (otros endowments / fundaciones / family offices)
- PDF export del case study (existe para Comparador A/B)
- Tab de comparación entre case studies (cuando haya ≥2)
- Migración a Node 24 cuando expire deprecation de Node 20 (junio 2026)

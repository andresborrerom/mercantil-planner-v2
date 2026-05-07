/**
 * capture-gifs.ts — captura automatizada de los GIFs del instructivo.
 *
 * Estrategia: Playwright con recordVideo genera .webm; ffmpeg lo convierte a
 * .gif con paleta de 2 pasos para calidad alta y peso bajo.
 *
 * Pre-requisitos:
 *   - npm run preview corriendo en port 4173.
 *   - ffmpeg disponible en PATH.
 *
 * Uso:
 *   npx tsx scripts/capture-gifs.ts                # los 3 prioritarios
 *   $env:HEADED='1'; npx tsx scripts/capture-gifs.ts   (PowerShell, headed)
 *   npx tsx scripts/capture-gifs.ts sample          # solo el GIF llamado 'sample'
 */
import { chromium, type Page } from '@playwright/test';
import { mkdir, readdir, rm, stat } from 'node:fs/promises';
import path from 'node:path';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';

const execAsync = promisify(exec);

const ASSETS_DIR = path.resolve('instructivo', 'assets');
const VIDEO_DIR = path.resolve('scripts', '.gif-tmp');
const BASE_URL = 'http://localhost:4173/mercantil-planner/';
const HEADED = process.env.HEADED === '1';
const VIEWPORT = { width: 1280, height: 720 };

// Parámetros ffmpeg — ajustables si los GIFs salen muy pesados.
const FFMPEG_FPS = 10;
const FFMPEG_SCALE = 900; // 900px ancho, ~70% del viewport
// Buffer antes del primer frame de la acción — deja ver brevemente el estado pre-acción.
const PRE_ACTION_BUFFER_S = 0.5;

// ---------------------------------------------------------------------------
// Configs (duplicados de capture-instructivo.ts para mantener cada script
// autocontenido; si en el futuro se comparten más se extraen a un módulo).
// ---------------------------------------------------------------------------

const SAMPLE_CONFIG = {
  version: 1,
  portfolioA: { kind: 'signature', id: 'Balanceado' },
  portfolioB: { kind: 'signature', id: 'Crecimiento' },
  plan: {
    initialCapital: 1_500_000,
    horizonMonths: 240,
    mode: 'real',
    inflationPct: 2.5,
    rules: [
      {
        id: 'r1',
        label: 'Aporte mensual',
        sign: 'deposit',
        amount: 5000,
        frequency: 'monthly',
        startMonth: 1,
        endMonth: null,
        growthPct: 3,
      },
    ],
  },
  bootstrap: {
    seed: 42,
    nPaths: 5000,
    blockSize: 12,
    fixed6Annual: 0.06,
    fixed9Annual: 0.09,
  },
};

const PABLO_CONFIG = {
  ...SAMPLE_CONFIG,
  plan: {
    initialCapital: 100_000,
    horizonMonths: 300,
    mode: 'real',
    inflationPct: 2.5,
    rules: [
      {
        id: 'r1',
        label: 'Aporte mensual',
        sign: 'deposit',
        amount: 2000,
        frequency: 'monthly',
        startMonth: 1,
        endMonth: null,
        growthPct: 3,
      },
    ],
  },
};

/**
 * Caso para el GIF del toggle destructivo de "Mostrar AMCs propuestos".
 * Portafolio A en Custom mix con CashST 30% (propuesto) + GlFI 70%, toggle
 * inicialmente activo. Al destildar, autofallback colapsa a 100% GlFI.
 */
const TOGGLE_AMC_CONFIG = {
  version: 1,
  showProposedAmcs: true,
  portfolioA: {
    kind: 'custom',
    label: 'CashST + GlFI',
    weights: { CashST: 30, GlFI: 70 },
  },
  portfolioB: { kind: 'signature', id: 'Balanceado' },
  plan: SAMPLE_CONFIG.plan,
  bootstrap: SAMPLE_CONFIG.bootstrap,
};

/** Marta original — para el GIF de rehidratación por JSON. */
const MARTA_CONFIG = {
  ...SAMPLE_CONFIG,
  portfolioA: { kind: 'signature', id: 'Conservador' },
  portfolioB: { kind: 'signature', id: 'Balanceado' },
  plan: {
    initialCapital: 500_000,
    horizonMonths: 300,
    mode: 'real',
    inflationPct: 2.5,
    rules: [
      {
        id: 'r1',
        label: 'Retiro mensual',
        sign: 'withdraw',
        amount: 4000,
        frequency: 'monthly',
        startMonth: 1,
        endMonth: null,
        growthPct: 0,
      },
    ],
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function applyConfig(page: Page, config: typeof SAMPLE_CONFIG): Promise<void> {
  await page.goto(BASE_URL);
  const textarea = page.locator('textarea[placeholder*="version"]').first();
  await textarea.scrollIntoViewIfNeeded();
  await textarea.fill(JSON.stringify(config));
  await page.getByRole('button', { name: /^Aplicar$/i }).click();
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(200);
  const simulate = page.getByRole('button', { name: /Simular/i }).first();
  await simulate.waitFor({ state: 'visible' });
  await simulate.click();
  await page.getByText(/Última corrida/i).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
}

/**
 * Esconde los elementos secundarios del card "Exportar y compartir": botón
 * Excel, botón Copiar config, y la sección de pegar/aplicar JSON. Deja el
 * título y el botón naranja "Generar plan personal de inversión" visibles.
 *
 * Decisión: el card actual mezcla entregable cliente (botón naranja) con
 * utilidades técnicas. Para los GIFs queremos solo el entregable visible.
 * Frente futuro: refactorizar ExportBar para separarlos en el producto.
 */
async function hideExportBarSecondaries(page: Page): Promise<void> {
  await page.evaluate(() => {
    const cards = Array.from(document.querySelectorAll('.mp-card'));
    for (const card of cards) {
      const title = card.querySelector('h2');
      if (title?.textContent?.trim() !== 'Exportar y compartir') continue;

      // Esconder botones que NO son el principal (texto "Generar plan personal de inversión").
      for (const btn of Array.from(card.querySelectorAll('button'))) {
        const txt = btn.textContent ?? '';
        if (!txt.includes('Generar plan personal de inversión')) {
          (btn as HTMLElement).style.display = 'none';
        }
      }

      // Esconder la sección "Pegar config JSON para reconstruir" — es el último div con label + textarea.
      const pasteSection = card.querySelector('div.mt-4');
      if (pasteSection) (pasteSection as HTMLElement).style.display = 'none';
    }
  });
}

type GifSpec = {
  name: string;
  description: string;
  setup: (page: Page) => Promise<void>;
  record: (page: Page) => Promise<void>;
  /**
   * Si es true, NO se ocultan los elementos secundarios de la ExportBar.
   * Necesario para GIFs que muestran el textarea "Pegar config JSON" o
   * los botones Excel/Copiar (ej. flujo de rehidratación).
   */
  keepExportBarSecondaries?: boolean;
};

async function recordGif(spec: GifSpec): Promise<{ size: number; path: string }> {
  console.log(`\n[${spec.name}] ${spec.description}`);
  await rm(VIDEO_DIR, { recursive: true, force: true });
  await mkdir(VIDEO_DIR, { recursive: true });

  const contextStartMs = Date.now();
  const browser = await chromium.launch({ headless: !HEADED });
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: 1,
    recordVideo: { dir: VIDEO_DIR, size: VIEWPORT },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('mercantil-planner.theme', 'light');
    } catch {
      /* noop */
    }
  });

  let recordStartMs = contextStartMs;
  try {
    console.log(`  · setup`);
    await spec.setup(page);
    if (!spec.keepExportBarSecondaries) {
      await hideExportBarSecondaries(page);
    }
    await page.waitForTimeout(800); // estabilizar UI con elementos ocultos.
    recordStartMs = Date.now();
    console.log(`  · grabando acción...`);
    await spec.record(page);
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  // El webm se escribe al cerrar context.
  const files = await readdir(VIDEO_DIR);
  const webms = files.filter((f) => f.endsWith('.webm'));
  if (webms.length === 0) throw new Error(`[${spec.name}] no se generó webm`);
  const webmPath = path.join(VIDEO_DIR, webms[0]);
  const gifPath = path.join(ASSETS_DIR, `${spec.name}.gif`);
  const palettePath = path.join(VIDEO_DIR, 'palette.png');

  // Trim: descartar el setup. El video empieza al primer frame del context;
  // recortamos hasta `recordStartMs - PRE_ACTION_BUFFER_S` para conservar un
  // poquito del estado pre-acción.
  const trimSeconds = Math.max(
    0,
    (recordStartMs - contextStartMs) / 1000 - PRE_ACTION_BUFFER_S,
  );
  console.log(`  · webm → gif (paleta 2-pass, trim ${trimSeconds.toFixed(1)}s)...`);

  // Paso 1: generar paleta optimizada — usa solo el segmento útil para que la
  // paleta se ajuste a los colores que efectivamente quedan en el GIF final.
  await execAsync(
    `ffmpeg -y -ss ${trimSeconds} -i "${webmPath}" -vf "fps=${FFMPEG_FPS},scale=${FFMPEG_SCALE}:-1:flags=lanczos,palettegen=stats_mode=full" "${palettePath}"`,
  );
  // Paso 2: aplicar paleta.
  await execAsync(
    `ffmpeg -y -ss ${trimSeconds} -i "${webmPath}" -i "${palettePath}" -filter_complex "fps=${FFMPEG_FPS},scale=${FFMPEG_SCALE}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5" "${gifPath}"`,
  );

  await rm(VIDEO_DIR, { recursive: true, force: true });

  const s = await stat(gifPath);
  const sizeMb = s.size / 1024 / 1024;
  console.log(`  ✓ ${gifPath} (${sizeMb.toFixed(2)} MB)`);
  return { size: s.size, path: gifPath };
}

// ---------------------------------------------------------------------------
// GIF specs
// ---------------------------------------------------------------------------

const GIF_SAMPLE_PATH: GifSpec = {
  name: 'parte-2-09-sample-path',
  description: 'Click sample path x4 — KPIs no cambian, path sí.',
  async setup(page) {
    await applyConfig(page, SAMPLE_CONFIG);
    const card = page.locator('[title*="otro escenario"]').first();
    await card.evaluate((el) =>
      el.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await page.waitForTimeout(700);
  },
  async record(page) {
    const samplePath = page.locator('[title*="otro escenario"]').first();
    await page.waitForTimeout(1500); // estado inicial visible
    for (let i = 0; i < 4; i++) {
      await samplePath.click();
      await page.waitForTimeout(1400); // pausa para apreciar cada path nuevo
    }
    await page.waitForTimeout(1200); // último frame visible
  },
};

const GIF_TOGGLE_VIEWS: GifSpec = {
  name: 'parte-2-10-toggle-overlay',
  description: 'Vista asimétrica activa — alternar Toggle/Overlay 3 veces.',
  async setup(page) {
    await applyConfig(page, SAMPLE_CONFIG);

    // Expandir Views.
    const viewsCard = page
      .locator('.mp-card')
      .filter({ hasText: /Views — análisis condicional/ })
      .first();
    await viewsCard
      .getByRole('button', { name: /Views — análisis condicional/ })
      .first()
      .click();
    await page.waitForTimeout(300);
    await viewsCard.getByRole('button', { name: /Presets/ }).click();
    await page.waitForTimeout(300);
    await viewsCard.getByRole('button', { name: /Tasas suben 100 pbs/ }).click();
    await page.waitForTimeout(1500); // computa análisis asimétrico

    // Centrar el fan chart en viewport.
    const fanChart = page
      .locator('.mp-card')
      .filter({ hasText: /Proyección patrimonial/ })
      .first();
    await fanChart.evaluate((el) =>
      el.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await page.waitForTimeout(700);
  },
  async record(page) {
    const fanChart = page
      .locator('.mp-card')
      .filter({ hasText: /Proyección patrimonial/ })
      .first();

    // Los modos están como botones radio: "Overlay (ambos)" y "Toggle (uno a la vez)".
    const overlayBtn = fanChart.getByRole('button', { name: /Overlay/i }).first();
    const toggleBtn = fanChart.getByRole('button', { name: /^Toggle/i }).first();

    await page.waitForTimeout(1500); // estado inicial visible
    for (let i = 0; i < 3; i++) {
      await toggleBtn.click();
      await page.waitForTimeout(1400);
      await overlayBtn.click();
      await page.waitForTimeout(1400);
    }
    await page.waitForTimeout(1200);
  },
};

const GIF_PDF_FLOW: GifSpec = {
  name: 'parte-3-13-pdf-flow',
  description: 'Caso Pablo — generar plan personal de inversión end-to-end.',
  async setup(page) {
    await applyConfig(page, PABLO_CONFIG);
    const btn = page.getByRole('button', { name: /Generar plan personal de inversión/ });
    await btn.evaluate((el) =>
      el.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await page.waitForTimeout(700);
  },
  async record(page) {
    await page.waitForTimeout(1500); // mostrar el botón resaltado antes de clickear
    await page
      .getByRole('button', { name: /Generar plan personal de inversión/ })
      .click();
    await page.waitForTimeout(1200); // que el modal sea visible y no aparezca abrupto

    const modal = page
      .locator('form')
      .filter({ hasText: /Generar plan personal de inversión/ });
    await modal
      .locator('input[placeholder*="Pocho"]')
      .pressSequentially('Pablo Rodríguez', { delay: 70 });
    await page.waitForTimeout(600);
    await modal
      .locator('input[placeholder*="Andrés"]')
      .pressSequentially('Andrés Borrero', { delay: 70 });
    await page.waitForTimeout(600);
    await modal
      .locator('textarea[placeholder*="Mensaje"]')
      .pressSequentially(
        'Pablo — adjunto su plan a 25 años. Próxima revisión en 12 meses.',
        { delay: 30 },
      );
    await page.waitForTimeout(1200);

    // Click Generar PDF — esperar el download.
    const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
    await modal.getByRole('button', { name: /Generar PDF/ }).click();
    const download = await downloadPromise;
    await download.saveAs(path.join(VIDEO_DIR, 'pablo.pdf')); // se borra al rm el dir
    await page.waitForTimeout(2000); // mostrar que el archivo bajó
  },
};

// ---------------------------------------------------------------------------
// GIFs nuevos (post-2026-05-06)
// ---------------------------------------------------------------------------

/**
 * GIF #1 — Toggle "Mostrar AMCs propuestos" destructivo.
 * Empieza con A en Custom CashST 30% + GlFI 70% y toggle ON. Se destilda y se
 * vuelve a tildar; el cambio es destructivo (CashST no regresa).
 */
const GIF_TOGGLE_AMC_DESTRUCTIVO: GifSpec = {
  name: 'parte-2-03-toggle-amc-destructivo',
  description: 'Toggle "Mostrar AMCs propuestos" destructivo: CashST 30%/GlFI 70% → 100% GlFI → toggle ON sin restaurar.',
  async setup(page) {
    await applyConfig(page, TOGGLE_AMC_CONFIG as typeof SAMPLE_CONFIG);

    // El toggle "Mostrar AMCs propuestos" no se serializa en el config JSON.
    // Lo activamos vía UI antes de grabar para que CashST sea visible y el
    // spec custom no haya sido stripeado al pegar la config.
    const toggle = page.getByRole('checkbox', { name: /Mostrar AMCs propuestos/ }).first();
    await toggle.scrollIntoViewIfNeeded();
    if (!(await toggle.isChecked())) {
      await toggle.check();
    }
    await page.waitForTimeout(400);

    // Re-aplicar el spec con CashST 30% / GlFI 70% — el paste lo dejó como GlFI 100
    // si el toggle estaba off. Hacemos un segundo paste para garantizar el estado.
    const textarea = page.locator('textarea[placeholder*="version"]').first();
    await textarea.scrollIntoViewIfNeeded();
    await textarea.fill(JSON.stringify(TOGGLE_AMC_CONFIG));
    await page.getByRole('button', { name: /^Aplicar$/i }).click();
    await page.waitForTimeout(500);

    // Centrar el selector de portafolio A en la viewport.
    const cardA = page.locator('.mp-card').filter({ hasText: /Portafolio A/ }).first();
    await cardA.evaluate((el) =>
      el.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await page.waitForTimeout(700);
  },
  async record(page) {
    const toggle = page.getByRole('checkbox', { name: /Mostrar AMCs propuestos/ }).first();
    await page.waitForTimeout(1000); // estado inicial: CashST + GlFI visible
    await toggle.uncheck();
    await page.waitForTimeout(1200); // mostrar autofallback a 100% GlFI
    await toggle.check();
    await page.waitForTimeout(1200); // mostrar que CashST NO regresa
    await page.waitForTimeout(800);
  },
};

/**
 * GIF #2 — Estanflación sincronizada vs composite.
 * Sample config + Views card expandido + tab Presets. Activa el preset
 * "Estanflación sincronizada (≥3m en 12m)" del grupo Sincronizados.
 */
const GIF_ESTANFLACION_SINC: GifSpec = {
  name: 'parte-2-11-estanflacion-sincronizada',
  description: 'Activar preset "Estanflación sincronizada (≥3m en 12m)" — mostrar probabilidad/nMatched/condicionales.',
  async setup(page) {
    await applyConfig(page, SAMPLE_CONFIG);

    const viewsCard = page
      .locator('.mp-card')
      .filter({ hasText: /Views — análisis condicional/ })
      .first();
    await viewsCard
      .getByRole('button', { name: /Views — análisis condicional/ })
      .first()
      .click();
    await page.waitForTimeout(300);
    await viewsCard.getByRole('button', { name: /Presets/ }).click();
    await page.waitForTimeout(400);

    // Centrar el ViewsPanel.
    await viewsCard.evaluate((el) =>
      el.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await page.waitForTimeout(700);
  },
  async record(page) {
    const viewsCard = page
      .locator('.mp-card')
      .filter({ hasText: /Views — análisis condicional/ })
      .first();
    const preset = viewsCard.getByRole('button', { name: /Estanflación sincronizada/ }).first();

    await page.waitForTimeout(1500); // mostrar la lista de presets antes del click
    await preset.click();
    await page.waitForTimeout(2500); // computa view y muestra probabilidad/nMatched

    // Scroll suave para revelar las métricas condicionales debajo del preset.
    await viewsCard.evaluate((el) => {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    await page.waitForTimeout(2500);
    await page.waitForTimeout(1200);
  },
};

/**
 * GIF #3 — Modal "Generar plan personal de inversión" (form view, sin generar).
 * Muestra el botón deshabilitado, click en Simular para habilitarlo, abre el
 * modal, recorre el form y cierra con Cancelar.
 */
const GIF_MODAL_PDF_FORM: GifSpec = {
  name: 'parte-2-14-modal-pdf',
  description: 'Botón deshabilitado → Simular → habilitado → abrir modal → recorrer form → Cancelar.',
  async setup(page) {
    // Aplicar config sample SIN simular — para mostrar el botón deshabilitado.
    await page.goto(BASE_URL);
    const textarea = page.locator('textarea[placeholder*="version"]').first();
    await textarea.scrollIntoViewIfNeeded();
    await textarea.fill(JSON.stringify(SAMPLE_CONFIG));
    await page.getByRole('button', { name: /^Aplicar$/i }).click();
    await page.waitForTimeout(500);

    // Bajar al ExportBar — donde vive el botón "Generar plan personal de inversión".
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.mp-card'));
      const exportCard = cards.find((c) => c.querySelector('h2')?.textContent === 'Exportar y compartir');
      exportCard?.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(700);
  },
  async record(page) {
    await page.waitForTimeout(1500); // mostrar el botón deshabilitado

    // Subir al fan chart y simular.
    const fanChart = page
      .locator('.mp-card')
      .filter({ hasText: /Proyección patrimonial/ })
      .first();
    await fanChart.evaluate((el) =>
      el.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await page.waitForTimeout(700);
    const simulate = page.getByRole('button', { name: /Simular/i }).first();
    await simulate.click();
    await page.getByText(/Última corrida/i).waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1000);

    // Volver al ExportBar — botón ahora habilitado.
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.mp-card'));
      const exportCard = cards.find((c) => c.querySelector('h2')?.textContent === 'Exportar y compartir');
      exportCard?.scrollIntoView({ behavior: 'instant', block: 'center' });
    });
    await page.waitForTimeout(1500);

    // Click → modal abierto.
    await page
      .getByRole('button', { name: /Generar plan personal de inversión/ })
      .click();
    await page.waitForTimeout(1200);

    const modal = page
      .locator('form')
      .filter({ hasText: /Generar plan personal de inversión/ });

    // Recorrer el form: cliente, asesor, bucket, versión, idioma, carta.
    await modal.locator('input[placeholder*="Pocho"]').pressSequentially('Pablo Rodríguez', { delay: 50 });
    await page.waitForTimeout(500);
    await modal.locator('input[placeholder*="Andrés"]').pressSequentially('Andrés Borrero', { delay: 50 });
    await page.waitForTimeout(500);
    await modal.getByRole('button', { name: /Legado/ }).click();
    await page.waitForTimeout(500);
    await modal.getByRole('button', { name: /Ejecutiva/ }).click();
    await page.waitForTimeout(500);
    await modal.getByRole('button', { name: /English/ }).click();
    await page.waitForTimeout(500);
    await modal.getByRole('button', { name: /^Español$/ }).click();
    await page.waitForTimeout(500);
    await modal
      .locator('textarea[placeholder*="Mensaje"]')
      .pressSequentially('Plan a 25 años con revisión en 12 meses.', { delay: 30 });
    await page.waitForTimeout(1000);

    // Cerrar sin generar.
    await modal.getByRole('button', { name: /^Cancelar$/ }).click();
    await page.waitForTimeout(1500);
  },
};

/**
 * GIF #4 — Configurar caso Pablo desde cero (sin applyConfig).
 * Click en preset "Ahorro / Acumulación", después editar capital, horizonte,
 * modo, inflación y la regla de aporte para llegar a la config Pablo.
 */
const GIF_PABLO_CONFIG_CERO: GifSpec = {
  name: 'parte-3-01-pablo-config-cero',
  description: 'Configurar Pablo desde cero: preset Ahorro acumulación → editar capital, horizonte, modo, inflación y regla.',
  async setup(page) {
    await page.goto(BASE_URL);
    await page.waitForTimeout(500);

    // Centrar el FlowEditor — donde están los presets y los campos de plan.
    const flowCard = page
      .locator('.mp-card')
      .filter({ hasText: /Flujos y parámetros del plan/ })
      .first();
    await flowCard.evaluate((el) =>
      el.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await page.waitForTimeout(700);
  },
  async record(page) {
    const flowCard = page
      .locator('.mp-card')
      .filter({ hasText: /Flujos y parámetros del plan/ })
      .first();

    await page.waitForTimeout(1500); // estado inicial visible

    // 1. Click preset Ahorro / Acumulación.
    await flowCard.getByRole('button', { name: /Ahorro/ }).first().click();
    await page.waitForTimeout(1400);

    // 2. Editar capital inicial → 100000.
    const capitalInput = flowCard.locator('input[type="number"]').first();
    await capitalInput.click({ clickCount: 3 });
    await capitalInput.fill('100000');
    await page.waitForTimeout(1200);

    // 3. Editar horizonte → 300.
    const horizonInput = flowCard.locator('input[type="number"]').nth(1);
    await horizonInput.click({ clickCount: 3 });
    await horizonInput.fill('300');
    await page.waitForTimeout(1200);

    // 4. Modo → Real.
    const modeSelect = flowCard.locator('select').first();
    await modeSelect.selectOption('real');
    await page.waitForTimeout(1200);

    // 5. Inflación → 2.5 (suele estar ya en 2.5; tocamos para evidenciarla).
    const inflationInput = flowCard.locator('input[type="number"]').nth(2);
    await inflationInput.click({ clickCount: 3 });
    await inflationInput.fill('2.5');
    await page.waitForTimeout(1200);

    // 6. Editar la regla de aporte: monto a 2000.
    // El input del monto es el 4º number-input del card (tras capital, horizonte, inflación).
    const ruleAmountInput = flowCard.locator('input[type="number"]').nth(3);
    await ruleAmountInput.scrollIntoViewIfNeeded();
    await ruleAmountInput.click({ clickCount: 3 });
    await ruleAmountInput.fill('2000');
    await page.waitForTimeout(1400);

    await page.waitForTimeout(1500); // estado final visible
  },
};

/**
 * GIF #5 — Pegar JSON y rehidratar. Muestra cómo el flujo manual restaura
 * portafolios y plan al pegar la config en el textarea + click Aplicar.
 */
const GIF_REHIDRATAR_JSON: GifSpec = {
  name: 'parte-4b-01-rehidratar',
  description: 'Pegar config Marta en el textarea → Aplicar → portafolios y plan se restauran.',
  keepExportBarSecondaries: true,
  async setup(page) {
    // Estado inicial: aplicar SAMPLE_CONFIG (distinto a Marta) para que se note el cambio.
    await applyConfig(page, SAMPLE_CONFIG);

    // Centrar el ExportBar.
    const exportCard = page
      .locator('.mp-card')
      .filter({ hasText: /Exportar y compartir/ })
      .first();
    await exportCard.evaluate((el) =>
      el.scrollIntoView({ behavior: 'instant', block: 'center' }),
    );
    await page.waitForTimeout(700);
  },
  async record(page) {
    const exportCard = page
      .locator('.mp-card')
      .filter({ hasText: /Exportar y compartir/ })
      .first();
    const pasteTextarea = exportCard.locator('textarea[placeholder*="version"]').first();
    const applyBtn = exportCard.getByRole('button', { name: /^Aplicar$/ }).first();

    await page.waitForTimeout(1500); // mostrar estado sample

    // Pegar el JSON de Marta — usa fill (instantáneo) para simular paste.
    await pasteTextarea.click();
    await pasteTextarea.fill(JSON.stringify(MARTA_CONFIG));
    await page.waitForTimeout(1500); // mostrar el JSON pegado en el textarea

    // Click Aplicar.
    await applyBtn.click();
    await page.waitForTimeout(1000);

    // Subir al selector de portafolios para mostrar A/B restaurados.
    await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('.mp-card'));
      const portfolioCard = cards.find((c) => c.querySelector('h3')?.textContent?.includes('Portafolio A'));
      portfolioCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    await page.waitForTimeout(2500);
    await page.waitForTimeout(1500);
  },
};

const ALL_GIFS: GifSpec[] = [
  GIF_SAMPLE_PATH,
  GIF_TOGGLE_VIEWS,
  GIF_PDF_FLOW,
  GIF_TOGGLE_AMC_DESTRUCTIVO,
  GIF_ESTANFLACION_SINC,
  GIF_MODAL_PDF_FORM,
  GIF_PABLO_CONFIG_CERO,
  GIF_REHIDRATAR_JSON,
];

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  await mkdir(ASSETS_DIR, { recursive: true });

  const filter = process.argv[2];
  const selected = filter ? ALL_GIFS.filter((g) => g.name.includes(filter)) : ALL_GIFS;
  if (selected.length === 0) {
    console.error(`Sin GIFs para filtro "${filter}". Disponibles:`);
    ALL_GIFS.forEach((g) => console.error(`  - ${g.name}`));
    process.exit(1);
  }

  console.log(
    `capture-gifs — viewport ${VIEWPORT.width}×${VIEWPORT.height}, ${HEADED ? 'headed' : 'headless'}, ${FFMPEG_FPS} fps, scale ${FFMPEG_SCALE}px`,
  );
  console.log(`output: ${ASSETS_DIR}`);

  const results: { name: string; sizeMb: string }[] = [];
  for (const spec of selected) {
    try {
      const r = await recordGif(spec);
      results.push({ name: spec.name, sizeMb: (r.size / 1024 / 1024).toFixed(2) });
    } catch (err) {
      console.error(`✗ ${spec.name} falló:`, err);
      throw err;
    }
  }

  console.log('\n=== resumen ===');
  results.forEach((r) => console.log(`  ${r.name}.gif — ${r.sizeMb} MB`));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

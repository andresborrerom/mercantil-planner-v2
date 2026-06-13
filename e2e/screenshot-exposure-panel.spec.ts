/**
 * Script ad-hoc: screenshots del panel ExposureDrillDownPanel para review.
 * Corre en una sesión Playwright headed, navega al caso de estudio default,
 * corre la simulación y screenshotea cada dimensión + la vista por-ETF.
 *
 * Uso:
 *   npx playwright test scripts/screenshot-exposure-panel.mts --headed=false
 *
 * Output: tmp/screenshots/exposure-*.png
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';

const OUT_DIR = 'tmp/screenshots';

test.beforeAll(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test('screenshots de exposure drill-down panel', async ({ page }) => {
  test.setTimeout(180_000);
  // Forzar light mode para legibilidad
  await page.addInitScript(() => {
    try { localStorage.setItem('mercantil-theme', 'light'); } catch {}
  });
  await page.goto('/');

  // Click tab Caso de Estudio
  await page.getByRole('button', { name: /Caso de Estudio/i }).click();
  await page.waitForTimeout(300);

  // Simular
  const runBtn = page.getByRole('button', { name: /Correr simulación/i });
  await expect(runBtn).toBeEnabled({ timeout: 5_000 });
  await runBtn.click();

  // Wait for stats
  await expect(page.getByText(/Stats finales/i).first()).toBeVisible({ timeout: 90_000 });

  // Scroll al panel de exposición
  const exposureHeader = page.getByText(/Exposición del portafolio/i).first();
  await expect(exposureHeader).toBeVisible({ timeout: 5_000 });
  await exposureHeader.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  // Locate the panel container directamente por data-testid
  const panel = page.getByTestId('exposure-panel');
  await expect(panel).toBeVisible();

  // Movemos el mouse fuera del panel antes de cada captura para evitar
  // que un hover tooltip de Recharts quede dibujado en el screenshot.
  const mouseAway = async () => {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
  };

  await mouseAway();
  await panel.screenshot({ path: `${OUT_DIR}/exposure-1-geografia.png` });

  // Click Sectores
  await page.getByRole('button', { name: /^Sectores$/ }).click();
  await page.waitForTimeout(400);
  await panel.scrollIntoViewIfNeeded();
  await mouseAway();
  await panel.screenshot({ path: `${OUT_DIR}/exposure-2-sectores.png` });

  // Click Calidad crediticia
  await page.getByRole('button', { name: /Calidad crediticia/i }).click();
  await page.waitForTimeout(400);
  await panel.scrollIntoViewIfNeeded();
  await mouseAway();
  await panel.screenshot({ path: `${OUT_DIR}/exposure-3-credit.png` });

  console.log('screenshots emitidos en', OUT_DIR);
});

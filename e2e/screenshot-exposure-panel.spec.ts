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

  // Default = Geografía
  await panel.screenshot({ path: `${OUT_DIR}/exposure-1-geografia.png` });

  // Click Sectores
  await page.getByRole('button', { name: /^Sectores$/ }).click();
  await page.waitForTimeout(200);
  await panel.screenshot({ path: `${OUT_DIR}/exposure-2-sectores.png` });

  // Click Calidad crediticia
  await page.getByRole('button', { name: /Calidad crediticia/i }).click();
  await page.waitForTimeout(200);
  await panel.screenshot({ path: `${OUT_DIR}/exposure-3-credit.png` });

  // Volver a Geografía y abrir el detalle por ETF
  await page.getByRole('button', { name: /Geografía/i }).click();
  await page.waitForTimeout(150);
  const etfSummary = page.getByText(/Por ETF · \d+ posiciones/i);
  await etfSummary.click();
  await page.waitForTimeout(250);
  await panel.scrollIntoViewIfNeeded();
  await panel.screenshot({ path: `${OUT_DIR}/exposure-4-por-etf.png` });

  console.log('screenshots emitidos en', OUT_DIR);
});

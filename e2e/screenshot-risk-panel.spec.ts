/**
 * Screenshots del RiskPanel para review visual.
 * Output: tmp/screenshots/risk-*.png
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';

const OUT_DIR = 'tmp/screenshots';

test.beforeAll(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test('screenshots de RiskPanel (3 vistas)', async ({ page }) => {
  test.setTimeout(180_000);
  await page.addInitScript(() => {
    try { localStorage.setItem('mercantil-theme', 'light'); } catch {}
  });
  await page.goto('/');

  await page.getByRole('button', { name: /Caso de Estudio/i }).click();
  await page.waitForTimeout(300);

  const runBtn = page.getByRole('button', { name: /Correr simulación/i });
  await expect(runBtn).toBeEnabled({ timeout: 5_000 });
  await runBtn.click();
  await expect(page.getByText(/Stats finales/i).first()).toBeVisible({ timeout: 90_000 });

  const panel = page.getByTestId('risk-panel');
  await expect(panel).toBeVisible({ timeout: 5_000 });
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const mouseAway = async () => {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
  };

  // Vista 1: Contribución al riesgo (default)
  await mouseAway();
  await panel.screenshot({ path: `${OUT_DIR}/risk-1-component.png` });

  // Vista 2: Scatter
  await page.getByRole('button', { name: /Asignación vs riesgo/i }).click();
  await page.waitForTimeout(500);
  await panel.scrollIntoViewIfNeeded();
  await mouseAway();
  await panel.screenshot({ path: `${OUT_DIR}/risk-2-scatter.png` });

  // Vista 3: Heatmap
  await page.getByRole('button', { name: /^Correlaciones$/ }).click();
  await page.waitForTimeout(500);
  await panel.scrollIntoViewIfNeeded();
  await mouseAway();
  await panel.screenshot({ path: `${OUT_DIR}/risk-3-heatmap.png` });

  console.log('screenshots emitidos en', OUT_DIR);
});

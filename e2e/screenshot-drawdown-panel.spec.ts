/**
 * Screenshots del DrawdownPanel para review visual.
 * Output: tmp/screenshots/drawdown-*.png
 */
import { test, expect } from '@playwright/test';
import * as fs from 'node:fs';

const OUT_DIR = 'tmp/screenshots';

test.beforeAll(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
});

test('screenshots de DrawdownPanel (nominal + real)', async ({ page }) => {
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

  const panel = page.getByTestId('drawdown-panel');
  await expect(panel).toBeVisible({ timeout: 5_000 });
  await panel.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);

  const mouseAway = async () => {
    await page.mouse.move(0, 0);
    await page.waitForTimeout(250);
  };

  // Nominal (default)
  await mouseAway();
  await panel.screenshot({ path: `${OUT_DIR}/drawdown-1-nominal.png` });

  // Real
  await page.getByRole('button', { name: /Real \(post-inflación\)/i }).click();
  await page.waitForTimeout(500);
  await panel.scrollIntoViewIfNeeded();
  await mouseAway();
  await panel.screenshot({ path: `${OUT_DIR}/drawdown-2-real.png` });

  // Bonus: stats card del CaseStudyPanel con los 4 nuevos tiles (#30)
  const nominalCard = page.locator('h3', { hasText: /Stats finales nominales/i }).locator('..');
  await nominalCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await mouseAway();
  await nominalCard.screenshot({ path: `${OUT_DIR}/drawdown-3-stats-nominal.png` });

  const realCard = page.locator('h3', { hasText: /Stats finales reales/i }).locator('..');
  await realCard.scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  await mouseAway();
  await realCard.screenshot({ path: `${OUT_DIR}/drawdown-4-stats-real.png` });

  console.log('screenshots emitidos en', OUT_DIR);
});

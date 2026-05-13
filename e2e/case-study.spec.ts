/**
 * case-study.spec.ts — smoke test del panel Caso de Estudio (H5b).
 *
 * Verifica end-to-end:
 *   1. Tab "Caso de Estudio" cliqueable y renderiza el panel
 *   2. Defaults TBSC visibles
 *   3. Botón "Correr simulación" dispara worker
 *   4. Después de correr, aparecen stats finales + regime breakdown + charts
 *
 * No valida números exactos (path generation varía sim por sim).
 */
import { expect, test } from '@playwright/test';
import { setInitialTheme } from './helpers';

test.describe('Caso de Estudio panel (H5b)', () => {
  test('default TBSC corre y muestra stats + charts', async ({ page }) => {
    await setInitialTheme(page, 'light');
    await page.goto('/');

    // Click en la tab
    await page.getByRole('button', { name: /Caso de Estudio/i }).click();

    // Defaults visibles
    await expect(page.getByText(/Caso de Estudio/i).first()).toBeVisible();
    await expect(page.getByText(/AUM inicial/i)).toBeVisible();
    await expect(page.getByText(/Ladder \(bullets\)/i)).toBeVisible();

    // Botón habilitado (allocation default 65+30+5=100, válido)
    const runBtn = page.getByRole('button', { name: /Correr simulación/i });
    await expect(runBtn).toBeEnabled();
    await runBtn.click();

    // Esperar que terminen (botón vuelve a texto "Correr" sin "Simulando"; stats finales aparecen).
    await expect(page.getByText(/Stats finales/i)).toBeVisible({ timeout: 60_000 });

    // Verificar key results aparecen
    await expect(page.getByText(/Retorno anual mediano/i)).toBeVisible();
    await expect(page.getByText(/Rollover: regímenes/i)).toBeVisible();
    await expect(page.getByText(/Net wealth path/i)).toBeVisible();
    await expect(page.getByText(/Evolución de sleeves/i)).toBeVisible();

    // Verificar que el régimen B (default config TNX moderado) tiene al menos algunos eventos
    // (no validamos número exacto, solo presencia de la barra)
    await expect(page.getByText(/B \(tasas bajas/i)).toBeVisible();
  });

  test('toggle préstamo revela controles loan', async ({ page }) => {
    await setInitialTheme(page, 'light');
    await page.goto('/');
    await page.getByRole('button', { name: /Caso de Estudio/i }).click();

    const loanCheckbox = page.getByRole('checkbox', { name: /Préstamo bancario/i });
    await expect(loanCheckbox).not.toBeChecked();

    await loanCheckbox.check();
    await expect(page.getByText(/Mes de disparo/i)).toBeVisible();
    await expect(page.getByText(/Monto % AUM/i)).toBeVisible();

    await loanCheckbox.uncheck();
    await expect(page.getByText(/Mes de disparo/i)).not.toBeVisible();
  });

  test('allocation inválida deshabilita botón Correr', async ({ page }) => {
    await setInitialTheme(page, 'light');
    await page.goto('/');
    await page.getByRole('button', { name: /Caso de Estudio/i }).click();

    // Cambiar bullets a 80% → allocation suma 115% (inválido)
    const bulletsInput = page.getByLabel(/Ladder \(bullets\)/i);
    await bulletsInput.fill('80');

    await expect(page.getByText(/Suma actual: 115\.0%/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Correr simulación/i })).toBeDisabled();
  });
});

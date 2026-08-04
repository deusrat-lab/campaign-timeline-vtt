import { test, expect } from '@playwright/test';

/**
 * E2E приймальний сценарій (мобільні розміри). Покриває основний шлях MVP.
 * Запуск: npx playwright install && npm run test:e2e
 */

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    indexedDB.deleteDatabase('budget-db');
  });
});

test('перший запуск → створення бюджету через демо → активний місяць', async ({ page }) => {
  await page.goto('/');
  // 1. Перший запуск: пустий стан.
  await expect(page.getByText('Ще немає активного місяця')).toBeVisible();

  // Швидкий шлях до наповненого стану — демонстраційні дані.
  await page.goto('/settings');
  await page.getByRole('button', { name: /демонстраційні дані/ }).click();

  // 9. Побачити залишки: активний місяць із доходом.
  await expect(page.getByText('Активний')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Отриманий дохід')).toBeVisible();
  await expect(page.getByText('60 000,00 ₴').first()).toBeVisible();
});

test('додавання витрати оновлює залишок', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /демонстраційні дані/ }).click();
  await expect(page.getByText('Активний')).toBeVisible({ timeout: 10000 });

  await page.goto('/');
  await page.getByRole('button', { name: '+ Витрата' }).first().click();
  await page.getByPlaceholder('0').first().fill('500');
  await page.getByRole('button', { name: /Продукти/ }).first().click();
  await page.getByRole('button', { name: 'Зберегти витрату' }).click();
  await expect(page.getByText(/Витрату збережено/)).toBeVisible();
});

test('експорт даних доступний', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /демонстраційні дані/ }).click();
  await expect(page.getByText('Активний')).toBeVisible({ timeout: 10000 });

  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Експортувати дані/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^budget-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
});

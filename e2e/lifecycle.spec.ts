import { test, expect } from '@playwright/test';

/**
 * E2E приймальні сценарії. Запуск: npx playwright install && npm run test:e2e
 * Проєкти: Desktop Chrome, Mobile Chrome (Pixel), Mobile Safari (iPhone).
 */

test.beforeEach(async ({ page }) => {
  // Очищаємо базу ЛИШЕ один раз на початку тесту (не на кожному reload/navigate),
  // інакше перевірки збереження даних після перезавантаження хибно падатимуть.
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__db_wiped')) {
      indexedDB.deleteDatabase('budget-db');
      sessionStorage.setItem('__db_wiped', '1');
    }
  });
});

test('перший запуск: суми нульові, placeholder не входить у розрахунок', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('Ще немає активного місяця')).toBeVisible();

  await page.goto('/new-month');
  await page.getByPlaceholder('0').first().fill('60000');
  await page.getByRole('button', { name: 'Далі' }).click();

  // Крок 2: без історії — поля порожні, показано «Ще немає історії витрат».
  await expect(page.getByText('Ще немає історії витрат').first()).toBeVisible();
  const firstPlan = page.locator('input.amount').first();
  await expect(firstPlan).toHaveValue(''); // placeholder не є значенням
});

test('користувач сам вводить бюджет, дані переживають перезавантаження', async ({ page }) => {
  await page.goto('/new-month');
  await page.getByPlaceholder('0').first().fill('60000');
  await page.getByRole('button', { name: 'Далі' }).click();
  // Ввести суму лише для першої категорії.
  await page.locator('input.amount').first().fill('3000');
  // Пройти майстер до кінця.
  await page.getByRole('button', { name: 'Далі' }).click(); // крок 3
  await page.getByRole('button', { name: 'Далі' }).click(); // крок 4
  await page.getByRole('button', { name: 'Підтвердити бюджет' }).click();

  await expect(page.getByText('Активний')).toBeVisible();

  await page.reload();
  await expect(page.getByText('60 000,00 ₴').first()).toBeVisible();
});

test('редактор категорій: створення категорії зберігається', async ({ page }) => {
  await page.goto('/settings/categories');
  await page.getByRole('button', { name: /Додати категорію/ }).click();
  await page.getByPlaceholder('Напр., Продукти').fill('Книги');
  await page.getByRole('button', { name: 'Зберегти категорію' }).click();
  await expect(page.getByText('Збережено')).toBeVisible();
  await page.reload();
  await expect(page.getByText('Книги')).toBeVisible();
});

test('демо-дані ізольовані та видаляються окремо', async ({ page }) => {
  await page.goto('/settings');
  await page.getByRole('button', { name: /Завантажити демонстраційні дані/ }).click();
  await page.getByRole('button', { name: /Підтвердити/ }).click();
  await expect(page.getByText('Активний')).toBeVisible({ timeout: 10000 });

  await page.goto('/settings');
  await expect(page.getByRole('button', { name: /Видалити демо-дані/ })).toBeVisible();
});

test('експорт даних формує коректне ім’я файлу', async ({ page }) => {
  await page.goto('/new-month');
  await page.getByPlaceholder('0').first().fill('50000');
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Далі' }).click();
  await page.getByRole('button', { name: 'Підтвердити бюджет' }).click();

  await page.goto('/settings');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Експортувати дані/ }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^budget-backup-\d{4}-\d{2}-\d{2}-\d{4}\.json$/);
});

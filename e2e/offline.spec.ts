import { test, expect } from '@playwright/test';

/**
 * Офлайн-перевірка на production-збірці з service worker.
 * Сценарій: онлайн-запуск → реєстрація SW → офлайн → перезавантаження →
 * оболонка й маршрути працюють → локальна операція зберігається офлайн.
 */

test('PWA працює офлайн після першого запуску', async ({ page, context }) => {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('__db_wiped')) {
      indexedDB.deleteDatabase('budget-db');
      sessionStorage.setItem('__db_wiped', '1');
    }
  });

  // 1) Онлайн-запуск і реєстрація service worker.
  await page.goto('./');
  await expect(page.getByText('Ще немає активного місяця')).toBeVisible();
  await page.waitForFunction(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return regs.length > 0 && !!navigator.serviceWorker.controller;
  }, null, { timeout: 20000 });

  // 2) Створюємо категорію (запис у IndexedDB) поки онлайн.
  await page.goto('./#/settings/categories');
  await page.getByRole('button', { name: /Додати категорію/ }).click();
  await page.getByPlaceholder('Напр., Продукти').fill('Офлайн-тест');
  await page.getByRole('button', { name: 'Зберегти категорію' }).click();
  await expect(page.getByText('Збережено')).toBeVisible();

  // 3) Переходимо в офлайн.
  await context.setOffline(true);

  // 4) Перезавантаження офлайн — оболонка має відкритися з кешу SW.
  await page.reload();
  await expect(page.getByText('Категорії та пріоритети')).toBeVisible({ timeout: 15000 });
  // Дані збереглися офлайн.
  await expect(page.getByText('Офлайн-тест')).toBeVisible();

  // 5) Маршрути працюють офлайн (hash-навігація).
  await page.goto('./#/');
  await expect(page.getByText('Ще немає активного місяця')).toBeVisible();

  // 6) Додаємо категорію офлайн — має зберегтися локально.
  await page.goto('./#/settings/categories');
  await page.getByRole('button', { name: /Додати категорію/ }).click();
  await page.getByPlaceholder('Напр., Продукти').fill('Створено-офлайн');
  await page.getByRole('button', { name: 'Зберегти категорію' }).click();
  await expect(page.getByText('Збережено')).toBeVisible();

  // 7) Перезапуск офлайн — операція збережена.
  await page.reload();
  await expect(page.getByText('Створено-офлайн')).toBeVisible({ timeout: 15000 });

  // 8) Повернення онлайн — застосунок продовжує працювати.
  await context.setOffline(false);
  await page.goto('./#/');
  await expect(page.getByText('Ще немає активного місяця')).toBeVisible();
});

/**
 * Ідемпотентні міграції даних. Виконуються один раз (позначка в таблиці
 * `appMigrations`). Не видаляють користувацькі дані наосліп.
 */
import type { BudgetDB } from './db';
import { LEGACY_SEED_AMOUNTS } from './seed';
import { nowIso } from '../utils/id';

export interface Migration {
  id: string;
  description: string;
  run: (db: BudgetDB) => Promise<void>;
}

/**
 * m1: нульовий старт. Обнуляє min/desired ЛИШЕ для стартових категорій, які
 * досі мають рівно старі демо-значення шаблону і НЕ використовувалися
 * (немає планів/операцій). Реальні відредаговані значення не чіпаються.
 * Ідемпотентна: після обнулення значення вже 0, повторний запуск нічого не змінює.
 */
const m1_zeroStartSeedAmounts: Migration = {
  id: 'm1_zero_start_seed_amounts',
  description: 'Обнулити суми недоторканих стартових категорій (нульовий старт)',
  async run(db) {
    const cats = await db.categories.toArray();
    for (const cat of cats) {
      const legacy = LEGACY_SEED_AMOUNTS[cat.name];
      if (!legacy) continue; // не стартова категорія — не чіпаємо
      const matchesLegacy = cat.minAmount === legacy.min && cat.desiredAmount === legacy.desired;
      if (!matchesLegacy) continue; // користувач змінив — не чіпаємо
      if (cat.minAmount === 0 && cat.desiredAmount === 0) continue; // вже нуль
      const usedInPlans = await db.monthlyCategoryPlans.where('categoryId').equals(cat.id).count();
      const usedInTx = await db.transactions.where('categoryId').equals(cat.id).count();
      if (usedInPlans > 0 || usedInTx > 0) continue; // використовується — не чіпаємо
      await db.categories.update(cat.id, { minAmount: 0, desiredAmount: 0, updatedAt: nowIso() });
    }
  },
};

/**
 * m2: обнулити ціль стандартної накопичувальної цілі «Фінансова подушка», якщо
 * вона досі має старі демо-значення і не має історії поповнень.
 */
const m2_zeroStartSavings: Migration = {
  id: 'm2_zero_start_savings',
  description: 'Обнулити демо-ціль накопичень, якщо не використовувалась',
  async run(db) {
    const goals = await db.savingsGoals.toArray();
    for (const g of goals) {
      const looksLegacy =
        g.name === 'Фінансова подушка' &&
        g.currentAmount === 0 &&
        (g.targetAmount === 10_000_000 || g.monthlyContribution === 300_000);
      if (!looksLegacy) continue;
      const usedInTx = await db.transactions.where('savingsGoalId').equals(g.id).count();
      if (usedInTx > 0) continue;
      await db.savingsGoals.update(g.id, { targetAmount: 0, monthlyContribution: 0, updatedAt: nowIso() });
    }
  },
};

export const MIGRATIONS: Migration[] = [m1_zeroStartSeedAmounts, m2_zeroStartSavings];

/** Виконати всі ще не застосовані міграції. Ідемпотентно. */
export async function runMigrations(db: BudgetDB): Promise<string[]> {
  const applied: string[] = [];
  for (const m of MIGRATIONS) {
    const already = await db.appMigrations.get(m.id);
    if (already) continue;
    await m.run(db);
    await db.appMigrations.put({ id: m.id, appliedAt: nowIso(), description: m.description });
    applied.push(m.id);
  }
  return applied;
}

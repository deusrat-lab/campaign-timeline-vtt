import { describe, it, expect, beforeEach } from 'vitest';
import { BudgetDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { buildSeedCategories } from '../db/seed';
import { toMoney } from '../domain/money';
import { newId, nowIso } from '../utils/id';
import type { Category } from '../domain/models';

// Симулюємо стару базу з ненульовими сумами (як у попередній версії шаблону).
function legacyCategory(name: string, min: number, desired: number): Category {
  const ts = nowIso();
  return {
    id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
    name, emoji: '💊', section: 'Критично обов’язкове', priority: 1, kind: 'spending',
    minAmount: toMoney(min), desiredAmount: toMoney(desired),
    regular: true, rollover: false, active: true, sortOrder: 0,
  };
}

let db: BudgetDB;
beforeEach(async () => {
  db = new BudgetDB('migrate-test-' + Math.random().toString(36).slice(2));
  await db.open();
});

describe('міграція m1: нульовий старт', () => {
  it('обнуляє недоторкані стартові категорії зі старими демо-сумами', async () => {
    // «Ліки» у старому шаблоні: min 2000, desired 3200.
    await db.categories.add(legacyCategory('Ліки', 2000, 3200));
    await runMigrations(db);
    const cat = (await db.categories.toArray())[0];
    expect(cat.minAmount).toBe(0);
    expect(cat.desiredAmount).toBe(0);
  });

  it('НЕ чіпає категорію, яку користувач змінив (суми не збігаються зі старим шаблоном)', async () => {
    await db.categories.add(legacyCategory('Ліки', 2000, 9999)); // desired змінено
    await runMigrations(db);
    const cat = (await db.categories.toArray())[0];
    expect(cat.desiredAmount).toBe(toMoney(9999));
  });

  it('НЕ чіпає категорію, що вже використовується в планах/операціях', async () => {
    const cat = legacyCategory('Ліки', 2000, 3200);
    await db.categories.add(cat);
    await db.transactions.add({
      id: newId(), createdAt: nowIso(), updatedAt: nowIso(), monthId: 'm1',
      type: 'expense', amount: toMoney(100), date: '2026-08-01', categoryId: cat.id,
    });
    await runMigrations(db);
    const after = (await db.categories.get(cat.id))!;
    expect(after.desiredAmount).toBe(toMoney(3200)); // збережено
  });

  it('нова чиста установка вже має нульові суми (нічого змінювати не треба)', async () => {
    await db.categories.bulkPut(buildSeedCategories());
    const applied = await runMigrations(db);
    const cats = await db.categories.toArray();
    expect(cats.every((c) => c.minAmount === 0 && c.desiredAmount === 0)).toBe(true);
    // Повторний запуск ідемпотентний.
    const second = await runMigrations(db);
    expect(second.length).toBe(0);
    void applied;
  });

  it('ідемпотентна: повторний запуск не змінює вже застосовані міграції', async () => {
    await db.categories.add(legacyCategory('Ліки', 2000, 3200));
    const first = await runMigrations(db);
    expect(first).toContain('m1_zero_start_seed_amounts');
    const second = await runMigrations(db);
    expect(second.length).toBe(0);
  });
});

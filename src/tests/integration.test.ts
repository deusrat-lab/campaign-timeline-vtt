import { describe, it, expect, beforeEach } from 'vitest';
import { db, ensureSeeded } from '../db/db';
import {
  addExpense,
  addIncome,
  doTransfer,
  depositReserve,
  getOrCreateMonth,
  setMonthStatus,
  upsertPlan,
} from '../db/repositories';
import { closeMonth, createNextMonth, loadMonthView } from '../db/service';
import { toMoney } from '../domain/money';

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

describe('Інтеграція: повний місячний цикл', () => {
  beforeEach(async () => {
    await clearAll();
    await ensureSeeded();
  });

  it('створення місяця → дохід частинами → бюджет → витрати → перенос → резерв → закриття → наступний місяць', async () => {
    const month = await getOrCreateMonth('2026-08');
    expect(month.status).toBe('draft');

    // Дохід двома частинами
    await addIncome({ monthId: month.id, amount: toMoney(30000), note: 'Аванс' });
    await addIncome({ monthId: month.id, amount: toMoney(30000), note: 'Друга частина' });

    // Дві категорії з планами
    const cats = await db.categories.toArray();
    const food = cats.find((c) => c.name === 'Продукти')!;
    const cafe = cats.find((c) => c.name === 'Кафе та доставка')!;
    await upsertPlan(month.id, food.id, { planned: toMoney(12000) });
    await upsertPlan(month.id, cafe.id, { planned: toMoney(5000) });

    await setMonthStatus(month.id, 'active');

    // Витрати
    await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(11000) });
    await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(2000) }); // перевитрата 1000

    let view = await loadMonthView(month.id);
    expect(view.totals.actualIncome).toBe(toMoney(60000));
    const foodState = view.stateByCategory.get(food.id)!;
    expect(foodState.available).toBe(toMoney(-1000));
    expect(foodState.status).toBe('over');

    // Перенос із кафе у продукти
    await doTransfer({
      monthId: month.id,
      amount: toMoney(1000),
      destinationCategoryId: food.id,
      source: { type: 'category', categoryId: cafe.id },
      reason: 'Покриття перевитрати продуктів',
    });
    view = await loadMonthView(month.id);
    expect(view.stateByCategory.get(food.id)!.available).toBe(toMoney(0));
    expect(view.transfers.length).toBe(1);
    expect(view.transfers[0].sourceBalanceBefore).toBe(toMoney(5000));
    expect(view.transfers[0].sourceBalanceAfter).toBe(toMoney(4000));

    // Поповнення резерву
    const reserve = (await db.reserves.toArray()).find((r) => r.kind === 'monthly')!;
    await depositReserve(month.id, reserve.id, toMoney(3000));
    const reserveAfter = await db.reserves.get(reserve.id);
    expect(reserveAfter!.balance).toBe(toMoney(3000));

    // Зняття з резерву у категорію
    await doTransfer({
      monthId: month.id,
      amount: toMoney(1000),
      destinationCategoryId: cafe.id,
      source: { type: 'reserve', reserveId: reserve.id },
      reason: 'Потрібно на кафе',
    });
    expect((await db.reserves.get(reserve.id))!.balance).toBe(toMoney(2000));

    // Закриття місяця
    const summary = await closeMonth(month.id);
    expect(summary.actualIncome).toBe(toMoney(60000));
    expect(summary.transferCount).toBe(2);
    expect((await db.monthlyBudgets.get(month.id))!.status).toBe('closed');

    // Наступний місяць з пропозиціями
    const next = await createNextMonth(month.id);
    expect(next.monthKey).toBe('2026-09');
    expect(next.status).toBe('draft');
    const nextPlans = await db.monthlyCategoryPlans.where('monthId').equals(next.id).toArray();
    const foodPlanNext = nextPlans.find((p) => p.categoryId === food.id)!;
    // Пропозиція для продуктів має спиратися на факт ~13000 і бути > 0
    expect(foodPlanNext.suggested).toBeGreaterThan(0);
  });
});

import { describe, it, expect, beforeEach } from 'vitest';
import { db, ensureSeeded } from '../db/db';
import {
  addExpense,
  addIncome,
  doTransfer,
  depositReserve,
  getOrCreateMonth,
  setMonthStatus,
  updateTransaction,
  deleteTransfer,
  upsertPlan,
} from '../db/repositories';
import { loadMonthView } from '../db/service';
import { toMoney } from '../domain/money';

async function clearAll() {
  await Promise.all(db.tables.map((t) => t.clear()));
}

describe('Виправлення помилково введених операцій', () => {
  beforeEach(async () => {
    await clearAll();
    await ensureSeeded();
  });

  it('TEST A: редагування суми витрати не подвоює облік', async () => {
    const month = await getOrCreateMonth('2026-08');
    await addIncome({ monthId: month.id, amount: toMoney(60000) });
    const food = (await db.categories.toArray()).find((c) => c.name === 'Продукти')!;
    await upsertPlan(month.id, food.id, { planned: toMoney(3200) });
    const expense = await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(500) });

    let view = await loadMonthView(month.id);
    const balanceBefore = view.totals.actualCashBalance;
    const countBefore = view.transactions.length;

    await updateTransaction(expense.id, { amount: toMoney(350) });

    view = await loadMonthView(month.id);
    expect(view.transactions.length).toBe(countBefore);
    expect(view.totals.actualCashBalance).toBe(balanceBefore + toMoney(150));
    const stillSameTx = view.transactions.find((t) => t.id === expense.id)!;
    expect(stillSameTx.amount).toBe(toMoney(350));

    const audit = await db.auditLog.where('entityId').equals(expense.id).toArray();
    expect(audit.some((a) => a.action === 'update')).toBe(true);
  });

  it('TEST B: перенесення витрати між категоріями не змінює загальні суми', async () => {
    const month = await getOrCreateMonth('2026-08');
    await addIncome({ monthId: month.id, amount: toMoney(60000) });
    const cats = await db.categories.toArray();
    const food = cats.find((c) => c.name === 'Продукти')!;
    const cafe = cats.find((c) => c.name === 'Кафе та доставка')!;
    await upsertPlan(month.id, food.id, { planned: toMoney(12000) });
    await upsertPlan(month.id, cafe.id, { planned: toMoney(5000) });
    const expense = await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(500) });

    let view = await loadMonthView(month.id);
    const totalExpenseBefore = view.totals.totalExpense;
    const cashBefore = view.totals.actualCashBalance;

    await updateTransaction(expense.id, { categoryId: cafe.id });

    view = await loadMonthView(month.id);
    expect(view.stateByCategory.get(food.id)!.actual).toBe(0);
    expect(view.stateByCategory.get(cafe.id)!.actual).toBe(toMoney(500));
    expect(view.totals.totalExpense).toBe(totalExpenseBefore);
    expect(view.totals.actualCashBalance).toBe(cashBefore);
  });

  it('TEST C: редагування доходу перераховує cash balance', async () => {
    const month = await getOrCreateMonth('2026-08');
    const income = await addIncome({ monthId: month.id, amount: toMoney(60000) });

    let view = await loadMonthView(month.id);
    const cashBefore = view.totals.actualCashBalance;

    await updateTransaction(income.id, { amount: toMoney(59000) });

    view = await loadMonthView(month.id);
    expect(view.totals.actualIncome).toBe(toMoney(59000));
    expect(view.totals.actualCashBalance).toBe(cashBefore - toMoney(1000));
  });

  it('TEST D: перевитрата дозволена, статус over', async () => {
    const month = await getOrCreateMonth('2026-08');
    const food = (await db.categories.toArray()).find((c) => c.name === 'Продукти')!;
    await upsertPlan(month.id, food.id, { planned: toMoney(1000) });
    await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(1300) });

    const view = await loadMonthView(month.id);
    const state = view.stateByCategory.get(food.id)!;
    expect(state.actual).toBe(toMoney(1300));
    expect(state.available).toBe(toMoney(-300));
    expect(state.status).toBe('over');
  });

  it('TEST E: покриття дефіциту переносом не змінює загальні витрати чи баланс', async () => {
    const month = await getOrCreateMonth('2026-08');
    await addIncome({ monthId: month.id, amount: toMoney(60000) });
    const cats = await db.categories.toArray();
    const a = cats.find((c) => c.name === 'Продукти')!;
    const b = cats.find((c) => c.name === 'Кафе та доставка')!;
    await upsertPlan(month.id, a.id, { planned: toMoney(1000) });
    await upsertPlan(month.id, b.id, { planned: toMoney(2000) });
    await addExpense({ monthId: month.id, categoryId: a.id, amount: toMoney(1700) }); // over by 700

    let view = await loadMonthView(month.id);
    expect(view.stateByCategory.get(a.id)!.available).toBe(toMoney(-700));
    const totalExpenseBefore = view.totals.totalExpense;
    const cashBefore = view.totals.actualCashBalance;

    await doTransfer({
      monthId: month.id,
      amount: toMoney(700),
      destinationCategoryId: a.id,
      source: { type: 'category', categoryId: b.id },
    });

    view = await loadMonthView(month.id);
    expect(view.stateByCategory.get(a.id)!.available).toBe(toMoney(0));
    expect(view.totals.totalExpense).toBe(totalExpenseBefore);
    expect(view.totals.actualCashBalance).toBe(cashBefore);
  });

  it('заборонено редагувати перенос як звичайну транзакцію', async () => {
    const month = await getOrCreateMonth('2026-08');
    const reserve = (await db.reserves.toArray()).find((r) => r.kind === 'monthly')!;
    const cafe = (await db.categories.toArray()).find((c) => c.name === 'Кафе та доставка')!;
    await upsertPlan(month.id, cafe.id, { planned: toMoney(1000) });
    await depositReserve(month.id, reserve.id, toMoney(2000));
    const transfer = await doTransfer({
      monthId: month.id,
      amount: toMoney(500),
      destinationCategoryId: cafe.id,
      source: { type: 'reserve', reserveId: reserve.id },
    });
    expect(transfer.transactionId).toBeTruthy();
    await expect(updateTransaction(transfer.transactionId!, { amount: toMoney(400) })).rejects.toThrow();
  });

  it('doTransfer відхиляє перенос понад доступний залишок джерела', async () => {
    const month = await getOrCreateMonth('2026-08');
    const cats = await db.categories.toArray();
    const a = cats.find((c) => c.name === 'Продукти')!;
    const b = cats.find((c) => c.name === 'Кафе та доставка')!;
    await upsertPlan(month.id, a.id, { planned: toMoney(1000) });
    await upsertPlan(month.id, b.id, { planned: toMoney(100) });
    await expect(
      doTransfer({
        monthId: month.id,
        amount: toMoney(500),
        destinationCategoryId: a.id,
        source: { type: 'category', categoryId: b.id },
      }),
    ).rejects.toThrow();
  });

  it('doTransfer відхиляє переказ в ту саму категорію та нульову/від’ємну суму', async () => {
    const month = await getOrCreateMonth('2026-08');
    const a = (await db.categories.toArray()).find((c) => c.name === 'Продукти')!;
    await upsertPlan(month.id, a.id, { planned: toMoney(1000) });
    await expect(
      doTransfer({
        monthId: month.id,
        amount: toMoney(100),
        destinationCategoryId: a.id,
        source: { type: 'category', categoryId: a.id },
      }),
    ).rejects.toThrow();
    await expect(
      doTransfer({
        monthId: month.id,
        amount: 0,
        destinationCategoryId: a.id,
        source: { type: 'unallocated' },
      }),
    ).rejects.toThrow();
  });

  it('deleteTransfer скасовує перенос з резерву і повертає баланс без подвійного обліку', async () => {
    const month = await getOrCreateMonth('2026-08');
    await setMonthStatus(month.id, 'active');
    const reserve = (await db.reserves.toArray()).find((r) => r.kind === 'monthly')!;
    const cafe = (await db.categories.toArray()).find((c) => c.name === 'Кафе та доставка')!;
    await upsertPlan(month.id, cafe.id, { planned: toMoney(1000) });
    await depositReserve(month.id, reserve.id, toMoney(2000));

    const transfer = await doTransfer({
      monthId: month.id,
      amount: toMoney(500),
      destinationCategoryId: cafe.id,
      source: { type: 'reserve', reserveId: reserve.id },
    });
    expect((await db.reserves.get(reserve.id))!.balance).toBe(toMoney(1500));

    await deleteTransfer(transfer.id);

    expect((await db.reserves.get(reserve.id))!.balance).toBe(toMoney(2000));
    const view = await loadMonthView(month.id);
    expect(view.transfers.length).toBe(0);
    expect(view.stateByCategory.get(cafe.id)!.transfersIn).toBe(0);
    const linkedTx = await db.transactions.get(transfer.transactionId!);
    expect(linkedTx!.deletedAt).toBeTruthy();
  });
});

import { describe, it, expect } from 'vitest';
import { BudgetDB } from '../db/db';
import { runMigrations } from '../db/migrations';
import { toMoney } from '../domain/money';
import { newId, nowIso } from '../utils/id';
import type {
  Category,
  MonthlyBudget,
  MonthlyCategoryPlan,
  Transaction,
  Transfer,
  MonthlyClosure,
} from '../domain/models';

/**
 * Доводить, що runMigrations() не змінює жодних фінансових даних у базі,
 * яка вже має реальний вміст (категорії, місяці, операції, перенос, резерв,
 * накопичення, закриття). Цей реліз не додає нову версію Dexie, тому
 * очікується, що BEFORE === AFTER для всього, крім appMigrations.
 */
describe('Регресія міграції: збереження існуючих даних', () => {
  it('BEFORE === AFTER для лічильників, id та фінансових сум', async () => {
    const db = new BudgetDB('migration-regression-' + Math.random().toString(36).slice(2));
    await db.open();
    const ts = nowIso();

    const cat: Category = {
      id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
      name: 'Ліки', emoji: '💊', section: 'Критично обов’язкове', priority: 1, kind: 'spending',
      minAmount: 0, desiredAmount: 0, regular: true, rollover: false, active: true, sortOrder: 0,
    };
    await db.categories.add(cat);

    const closedMonth: MonthlyBudget = {
      id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
      monthKey: '2026-07', title: 'Липень 2026', status: 'closed',
      expectedIncome: toMoney(50000), openedAt: ts, closedAt: ts, reopenCount: 0,
    };
    const activeMonth: MonthlyBudget = {
      id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
      monthKey: '2026-08', title: 'Серпень 2026', status: 'active',
      expectedIncome: toMoney(60000), openedAt: ts, closedAt: null, reopenCount: 0,
    };
    await db.monthlyBudgets.bulkAdd([closedMonth, activeMonth]);

    const plan: MonthlyCategoryPlan = {
      id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
      monthId: activeMonth.id, categoryId: cat.id, planned: toMoney(3200), suggested: 0,
      priorityOverride: null, criticalOverride: false, disabled: false, rolloverIn: 0,
    };
    await db.monthlyCategoryPlans.add(plan);

    const income: Transaction = {
      id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
      monthId: activeMonth.id, type: 'income', amount: toMoney(60000), date: '2026-08-01',
    };
    const expense: Transaction = {
      id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
      monthId: activeMonth.id, type: 'expense', amount: toMoney(1500), date: '2026-08-05', categoryId: cat.id,
    };
    await db.transactions.bulkAdd([income, expense]);

    const reserve = { id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null, name: 'Резерв', emoji: '🛟', kind: 'monthly' as const, balance: toMoney(2000), active: true, sortOrder: 0 };
    await db.reserves.add(reserve);
    const savings = { id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null, name: 'Подушка', emoji: '🏦', currentAmount: toMoney(1000), targetAmount: toMoney(10000), monthlyContribution: 0, status: 'active' as const, sortOrder: 0 };
    await db.savingsGoals.add(savings);

    const transfer: Transfer = {
      id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
      monthId: activeMonth.id, amount: toMoney(500), date: '2026-08-06',
      sourceType: 'unallocated', destinationCategoryId: cat.id, initiator: 'user',
      sourceBalanceBefore: 0, sourceBalanceAfter: 0, transactionId: null,
    };
    await db.transfers.add(transfer);

    const closure: MonthlyClosure = {
      id: newId(), createdAt: ts, updatedAt: ts, deletedAt: null,
      monthId: closedMonth.id, closedAt: ts,
      summary: {
        actualIncome: toMoney(50000), totalExpense: toMoney(40000), toReserves: 0, toSavings: 0,
        fromReserves: 0, finalFree: toMoney(10000), savingsRateBps: 0, transactionCount: 0,
        transferCount: 0, categories: [],
      },
    };
    await db.monthlyClosures.add(closure);

    const before = await snapshot(db);

    await runMigrations(db);

    const after = await snapshot(db);
    expect(after).toEqual(before);
  });
});

async function snapshot(db: BudgetDB) {
  const [categories, months, plans, txs, transfers, reserves, savings, closures] = await Promise.all([
    db.categories.toArray(),
    db.monthlyBudgets.toArray(),
    db.monthlyCategoryPlans.toArray(),
    db.transactions.toArray(),
    db.transfers.toArray(),
    db.reserves.toArray(),
    db.savingsGoals.toArray(),
    db.monthlyClosures.toArray(),
  ]);
  const sortById = <T extends { id: string }>(arr: T[]) => [...arr].sort((a, b) => a.id.localeCompare(b.id));
  return {
    categoryIds: sortById(categories).map((c) => c.id),
    monthIds: sortById(months).map((m) => m.id),
    planIds: sortById(plans).map((p) => p.id),
    txIds: sortById(txs).map((t) => t.id),
    transferIds: sortById(transfers).map((t) => t.id),
    reserveIds: sortById(reserves).map((r) => r.id),
    savingsIds: sortById(savings).map((s) => s.id),
    closureIds: sortById(closures).map((c) => c.id),
    counts: {
      categories: categories.length,
      months: months.length,
      plans: plans.length,
      txs: txs.length,
      transfers: transfers.length,
      reserves: reserves.length,
      savings: savings.length,
      closures: closures.length,
    },
    incomeTotal: txs.filter((t) => t.type === 'income').reduce((a, t) => a + t.amount, 0),
    expenseTotal: txs.filter((t) => t.type === 'expense').reduce((a, t) => a + t.amount, 0),
    reserveBalances: sortById(reserves).map((r) => r.balance),
    savingsBalances: sortById(savings).map((s) => s.currentAmount),
    closureSummaries: sortById(closures).map((c) => c.summary),
  };
}

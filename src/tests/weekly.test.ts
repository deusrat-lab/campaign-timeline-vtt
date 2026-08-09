import { describe, it, expect } from 'vitest';
import { currentWeekBounds, computeWeeklyBudget } from '../domain/calculations/weekly';
import type { MonthTotals } from '../domain/calculations/balances';
import type { Transaction } from '../domain/models';
import { toMoney } from '../domain/money';

function totals(availableToSpend: number): MonthTotals {
  return {
    actualIncome: 0,
    totalExpense: 0,
    toReserves: 0,
    fromReserves: 0,
    toSavings: 0,
    fromSavings: 0,
    confirmedPlans: 0,
    unallocated: 0,
    actualCashBalance: 0,
    availableToSpend: toMoney(availableToSpend),
    deficit: 0,
  };
}

describe('currentWeekBounds', () => {
  it('звичайний повний тиждень всередині місяця', () => {
    // 2026-08-12 = середа
    const bounds = currentWeekBounds(new Date(2026, 7, 12), new Date(2026, 7, 1), new Date(2026, 7, 31));
    expect(bounds.start).toBe('2026-08-10'); // понеділок
    expect(bounds.end).toBe('2026-08-16'); // неділя
  });

  it('перший (частковий) тиждень місяця', () => {
    // 2026-08-01 = субота, тиждень 2026-07-27..2026-08-02, обрізаний до 08-01
    const bounds = currentWeekBounds(new Date(2026, 7, 1), new Date(2026, 7, 1), new Date(2026, 7, 31));
    expect(bounds.start).toBe('2026-08-01');
    expect(bounds.end).toBe('2026-08-02');
  });

  it('останній (частковий) тиждень місяця', () => {
    // 2026-08-31 = понеділок, тиждень 08-31..09-06, обрізаний до 08-31
    const bounds = currentWeekBounds(new Date(2026, 7, 31), new Date(2026, 7, 1), new Date(2026, 7, 31));
    expect(bounds.start).toBe('2026-08-31');
    expect(bounds.end).toBe('2026-08-31');
  });

  it('лютий (28 днів, невисокосний)', () => {
    const bounds = currentWeekBounds(new Date(2026, 1, 15), new Date(2026, 1, 1), new Date(2026, 1, 28));
    expect(bounds.start).toBe('2026-02-09');
    expect(bounds.end).toBe('2026-02-15');
  });

  it('місяць на 31 день, дата в середині', () => {
    const bounds = currentWeekBounds(new Date(2026, 0, 20), new Date(2026, 0, 1), new Date(2026, 0, 31));
    expect(bounds.start).toBe('2026-01-19');
    expect(bounds.end).toBe('2026-01-25');
  });

  it('сьогодні близько до кінця місяця', () => {
    const bounds = currentWeekBounds(new Date(2026, 3, 29), new Date(2026, 3, 1), new Date(2026, 3, 30));
    expect(bounds.start).toBe('2026-04-27');
    expect(bounds.end).toBe('2026-04-30');
  });
});

describe('computeWeeklyBudget', () => {
  const monthStart = new Date(2026, 7, 1);
  const monthEnd = new Date(2026, 7, 31);

  it('не ділить на 4 — розподіляє пропорційно дням, що лишились', () => {
    // Сьогодні 2026-08-10 (понеділок), лишилось 22 дні місяця, 7 днів тижня.
    const today = new Date(2026, 7, 10);
    const result = computeWeeklyBudget(totals(22000), [], today, monthStart, monthEnd);
    expect(result.daysLeftInMonth).toBe(22);
    expect(result.daysLeftInWeek).toBe(7);
    expect(result.safeWeeklyBudget).toBe(toMoney(7000)); // 22000 * 7/22
    expect(result.safeWeeklyBudget).not.toBe(toMoney(22000 / 4));
  });

  it('враховує вже витрачене цього тижня', () => {
    const today = new Date(2026, 7, 12);
    const txs: Transaction[] = [
      {
        id: '1', createdAt: '', updatedAt: '', deletedAt: null,
        monthId: 'm', type: 'expense', amount: toMoney(1200), date: '2026-08-11',
      },
      {
        id: '2', createdAt: '', updatedAt: '', deletedAt: null,
        monthId: 'm', type: 'expense', amount: toMoney(500), date: '2026-07-31', // поза тижнем
      },
    ];
    const result = computeWeeklyBudget(totals(20000), txs, today, monthStart, monthEnd);
    expect(result.spentThisWeek).toBe(toMoney(1200));
    expect(result.remainingThisWeek).toBe(result.safeWeeklyBudget - toMoney(1200));
  });

  it('відʼємний availableToSpend трактується як 0, а не негативний бюджет', () => {
    const today = new Date(2026, 7, 10);
    const result = computeWeeklyBudget(totals(-500), [], today, monthStart, monthEnd);
    expect(result.remainingSpendableMonth).toBe(0);
    expect(result.safeWeeklyBudget).toBe(0);
  });
});

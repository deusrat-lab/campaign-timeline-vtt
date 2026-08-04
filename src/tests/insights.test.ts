import { describe, it, expect } from 'vitest';
import { buildInsights, aggregatePeriod, type ClosedMonthPoint } from '../domain/calculations/insights';
import type { ClosureSummary } from '../domain/models';
import { toMoney } from '../domain/money';

function summary(p: Partial<ClosureSummary>): ClosureSummary {
  return {
    actualIncome: 0, totalExpense: 0, toReserves: 0, toSavings: 0, fromReserves: 0,
    finalFree: 0, savingsRateBps: 0, transactionCount: 0, transferCount: 0, categories: [],
    ...p,
  };
}

function point(monthKey: string, s: Partial<ClosureSummary>): ClosedMonthPoint {
  return { monthKey, title: monthKey, summary: summary(s) };
}

describe('insights', () => {
  it('порожній список → без винятків, без висновків', () => {
    expect(buildInsights([])).toEqual([]);
  });

  it('відсоток накопичень цього місяця', () => {
    const ins = buildInsights([
      point('2026-08', { actualIncome: toMoney(60000), toSavings: toMoney(4800), savingsRateBps: 800 }),
    ]);
    expect(ins.some((i) => i.text.includes('8% доходу'))).toBe(true);
  });

  it('зростання витрат порівняно з попереднім місяцем', () => {
    const ins = buildInsights([
      point('2026-08', { totalExpense: toMoney(20000) }),
      point('2026-07', { totalExpense: toMoney(18760) }),
    ]);
    // toLocaleString використовує нерозривні пробіли — нормалізуємо.
    expect(ins.some((i) => i.text.includes('зросли') && i.text.replace(/\s/g, ' ').includes('1 240'))).toBe(true);
  });

  it('перевитрата 3 місяці поспіль', () => {
    const line = (overspend: number) => ({
      categoryId: 'c1', name: 'Тварини', planned: toMoney(2000), actual: toMoney(2000) + overspend,
      deviation: overspend, overspend, coveredFrom: [],
    });
    const ins = buildInsights([
      point('2026-08', { categories: [line(toMoney(500))] }),
      point('2026-07', { categories: [line(toMoney(300))] }),
      point('2026-06', { categories: [line(toMoney(400))] }),
    ]);
    expect(ins.some((i) => i.text.includes('поспіль') && i.text.includes('Тварини'))).toBe(true);
  });

  it('aggregatePeriod рахує середні за N місяців', () => {
    const agg = aggregatePeriod([
      point('2026-08', { actualIncome: toMoney(60000), toSavings: toMoney(6000) }),
      point('2026-07', { actualIncome: toMoney(40000), toSavings: toMoney(2000) }),
    ], 3);
    expect(agg.months).toBe(2);
    expect(agg.income).toBe(toMoney(100000));
    expect(agg.savingsRatePct).toBe(8); // 8000/100000
  });
});

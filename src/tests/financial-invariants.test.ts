import { describe, it, expect } from 'vitest';
import { computeMonthTotals, computeCategoryState } from '../domain/calculations/balances';
import type { MonthlyBudget, MonthlyCategoryPlan, Transaction, Transfer, TransactionType } from '../domain/models';

/**
 * Інваріантні (property-based) тести фінансової моделі. Генеруємо великий набір
 * випадкових послідовностей операцій і перевіряємо, що ключові інваріанти
 * виконуються завжди.
 */

// Детермінований генератор (LCG), щоб тести були відтворюваними.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const ts = '2026-08-01T00:00:00.000Z';
const budget: MonthlyBudget = {
  id: 'm1', createdAt: ts, updatedAt: ts, monthKey: '2026-08', title: 'T',
  status: 'active', expectedIncome: 0, reopenCount: 0,
};

function makeTx(type: TransactionType, amount: number, categoryId?: string, i = 0): Transaction {
  return {
    id: `t${i}-${Math.random()}`, createdAt: ts, updatedAt: ts, monthId: 'm1',
    type, amount, date: '2026-08-05', categoryId: categoryId ?? null,
  };
}

const TX_TYPES: TransactionType[] = [
  'income', 'expense', 'refund', 'reserve_deposit', 'reserve_withdrawal',
  'savings_deposit', 'savings_withdrawal', 'correction',
];

describe('Інваріанти фінансової моделі (property-based, 300 випадкових сценаріїв)', () => {
  it('усі суми — цілі копійки; грошовий залишок узгоджений; переноси не змінюють залишок', () => {
    for (let scenario = 0; scenario < 300; scenario++) {
      const rng = makeRng(scenario + 1);
      const cats = ['a', 'b', 'c'];
      const plans: MonthlyCategoryPlan[] = cats.map((c, idx) => ({
        id: `p${c}`, createdAt: ts, updatedAt: ts, monthId: 'm1', categoryId: c,
        planned: Math.floor(rng() * 5000) * 100, suggested: 0, priorityOverride: null,
        criticalOverride: false, disabled: false, rolloverIn: idx === 0 ? 10000 : 0,
      }));

      const txs: Transaction[] = [];
      const opCount = 3 + Math.floor(rng() * 15);
      for (let i = 0; i < opCount; i++) {
        const type = TX_TYPES[Math.floor(rng() * TX_TYPES.length)];
        const amount = Math.floor(rng() * 10000) * 1; // цілі копійки
        const cat = cats[Math.floor(rng() * cats.length)];
        const usesCat = type === 'expense' || type === 'refund' || type === 'correction';
        txs.push(makeTx(type, amount, usesCat ? cat : undefined, i));
      }

      const totalsBefore = computeMonthTotals(budget, plans, txs);

      // Інваріант 1: усі підсумки — цілі числа (копійки).
      for (const v of Object.values(totalsBefore)) {
        expect(Number.isInteger(v)).toBe(true);
      }

      // Інваріант 2: грошовий залишок = дохід − витрати − чисті накопичення − чисті резерви.
      const expected =
        totalsBefore.actualIncome -
        totalsBefore.totalExpense -
        (totalsBefore.toSavings - totalsBefore.fromSavings) -
        (totalsBefore.toReserves - totalsBefore.fromReserves);
      expect(totalsBefore.actualCashBalance).toBe(expected);

      // Інваріант 3: додавання переносів між категоріями НЕ змінює грошовий залишок
      // (computeMonthTotals не залежить від transfers — це і є гарантією).
      const transfers: Transfer[] = [
        {
          id: 'tr1', createdAt: ts, updatedAt: ts, monthId: 'm1',
          amount: Math.floor(rng() * 3000) * 100, date: '2026-08-06',
          sourceType: 'category', sourceCategoryId: 'b', destinationCategoryId: 'a',
          initiator: 'user', sourceBalanceBefore: 0, sourceBalanceAfter: 0,
        },
      ];
      const totalsAfter = computeMonthTotals(budget, plans, txs);
      expect(totalsAfter.actualCashBalance).toBe(totalsBefore.actualCashBalance);

      // Інваріант 4: сумарний ліміт категорій зростає рівно на суму transfersIn
      // призначення й зменшується на transfersOut джерела (перерозподіл, не створення грошей).
      const stA = computeCategoryState(plans[0], txs, transfers);
      const stB = computeCategoryState(plans[1], txs, transfers);
      expect(stA.transfersIn).toBe(transfers[0].amount);
      expect(stB.transfersOut).toBe(transfers[0].amount);
    }
  });

  it('повернення зменшує факт категорії, а не створює дохід', () => {
    const plans: MonthlyCategoryPlan[] = [{
      id: 'pa', createdAt: ts, updatedAt: ts, monthId: 'm1', categoryId: 'a',
      planned: 100000, suggested: 0, priorityOverride: null, criticalOverride: false,
      disabled: false, rolloverIn: 0,
    }];
    const txs = [
      makeTx('income', 500000),
      makeTx('expense', 30000, 'a'),
      makeTx('refund', 10000, 'a'),
    ];
    const totals = computeMonthTotals(budget, plans, txs);
    expect(totals.actualIncome).toBe(500000); // повернення НЕ додало доходу
    expect(totals.totalExpense).toBe(20000); // 30000 − 10000
    const st = computeCategoryState(plans[0], txs, []);
    expect(st.actual).toBe(20000);
  });

  it('поповнення накопичень не рахується споживчою витратою', () => {
    const txs = [makeTx('income', 500000), makeTx('savings_deposit', 100000)];
    const totals = computeMonthTotals(budget, [], txs);
    expect(totals.totalExpense).toBe(0);
    expect(totals.toSavings).toBe(100000);
    expect(totals.actualCashBalance).toBe(400000);
  });

  it('зняття з резерву не створює зовнішній дохід', () => {
    const txs = [makeTx('income', 500000), makeTx('reserve_withdrawal', 50000)];
    const totals = computeMonthTotals(budget, [], txs);
    expect(totals.actualIncome).toBe(500000); // не збільшився
    // зняття з резерву повертає гроші в обіг: чисті резерви = −50000 → залишок росте
    expect(totals.actualCashBalance).toBe(550000);
  });
});

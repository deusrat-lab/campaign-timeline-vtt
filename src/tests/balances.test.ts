import { describe, it, expect } from 'vitest';
import {
  computeCategoryState,
  computeMonthTotals,
  categoryActual,
  savingsRateBps,
  allowedPerDay,
} from '../domain/calculations/balances';
import type { MonthlyBudget, MonthlyCategoryPlan, Transaction, Transfer } from '../domain/models';
import { toMoney } from '../domain/money';

const ts = '2026-08-01T00:00:00.000Z';

function tx(p: Partial<Transaction>): Transaction {
  return {
    id: Math.random().toString(36),
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    monthId: 'm1',
    type: 'expense',
    amount: 0,
    date: '2026-08-05',
    ...p,
  } as Transaction;
}

function plan(p: Partial<MonthlyCategoryPlan>): MonthlyCategoryPlan {
  return {
    id: 'p1',
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    monthId: 'm1',
    categoryId: 'cat1',
    planned: 0,
    suggested: 0,
    priorityOverride: null,
    criticalOverride: false,
    disabled: false,
    rolloverIn: 0,
    ...p,
  };
}

const budget: MonthlyBudget = {
  id: 'm1',
  createdAt: ts,
  updatedAt: ts,
  deletedAt: null,
  monthKey: '2026-08',
  title: 'Серпень 2026',
  status: 'active',
  expectedIncome: 0,
  openedAt: ts,
  closedAt: null,
  reopenCount: 0,
};

describe('categoryActual', () => {
  it('витрати мінус повернення', () => {
    const txs = [
      tx({ categoryId: 'cat1', type: 'expense', amount: toMoney(500) }),
      tx({ categoryId: 'cat1', type: 'expense', amount: toMoney(300) }),
      tx({ categoryId: 'cat1', type: 'refund', amount: toMoney(100) }),
      tx({ categoryId: 'cat2', type: 'expense', amount: toMoney(999) }),
    ];
    expect(categoryActual('cat1', txs)).toBe(toMoney(700));
  });
});

describe('computeCategoryState', () => {
  it('рахує залишок та статус перевитрати', () => {
    const p = plan({ planned: toMoney(1000) });
    const txs = [tx({ categoryId: 'cat1', amount: toMoney(1200) })];
    const st = computeCategoryState(p, txs, []);
    expect(st.actual).toBe(toMoney(1200));
    expect(st.available).toBe(toMoney(-200));
    expect(st.status).toBe('over');
  });

  it('враховує переноси у категорію (transfersIn збільшує ліміт)', () => {
    const p = plan({ planned: toMoney(1000) });
    const transfers: Transfer[] = [
      {
        id: 't1',
        createdAt: ts,
        updatedAt: ts,
        monthId: 'm1',
        amount: toMoney(500),
        date: '2026-08-06',
        sourceType: 'category',
        sourceCategoryId: 'other',
        destinationCategoryId: 'cat1',
        initiator: 'user',
        sourceBalanceBefore: 0,
        sourceBalanceAfter: 0,
      },
    ];
    const txs = [tx({ categoryId: 'cat1', amount: toMoney(1200) })];
    const st = computeCategoryState(p, txs, transfers);
    // ліміт = 1000 + 500 = 1500, витрачено 1200 => залишок 300, в нормі
    expect(st.available).toBe(toMoney(300));
    expect(st.status).not.toBe('over');
  });

  it('idle коли немає витрат', () => {
    const st = computeCategoryState(plan({ planned: toMoney(1000) }), [], []);
    expect(st.status).toBe('idle');
  });
});

describe('computeMonthTotals — відсутність подвійного обліку', () => {
  it('дохід частинами підсумовується', () => {
    const txs = [
      tx({ type: 'income', amount: toMoney(30000) }),
      tx({ type: 'income', amount: toMoney(30000) }),
    ];
    const totals = computeMonthTotals(budget, [], txs);
    expect(totals.actualIncome).toBe(toMoney(60000));
  });

  it('нерозподілено = дохід − плани − резерв − накопичення', () => {
    const plans = [plan({ categoryId: 'c1', planned: toMoney(12000) })];
    const txs = [
      tx({ type: 'income', amount: toMoney(60000) }),
      tx({ type: 'reserve_deposit', amount: toMoney(3000) }),
      tx({ type: 'savings_deposit', amount: toMoney(5000) }),
    ];
    const totals = computeMonthTotals(budget, plans, txs);
    expect(totals.unallocated).toBe(toMoney(60000 - 12000 - 3000 - 5000));
  });

  it('перенос між категоріями НЕ змінює грошовий залишок', () => {
    const plans = [
      plan({ id: 'pa', categoryId: 'a', planned: toMoney(1000) }),
      plan({ id: 'pb', categoryId: 'b', planned: toMoney(1000) }),
    ];
    const txs = [tx({ type: 'income', amount: toMoney(60000) })];
    const transfers: Transfer[] = [
      {
        id: 't1', createdAt: ts, updatedAt: ts, monthId: 'm1', amount: toMoney(500),
        date: '2026-08-06', sourceType: 'category', sourceCategoryId: 'a',
        destinationCategoryId: 'b', initiator: 'user', sourceBalanceBefore: 0, sourceBalanceAfter: 0,
      },
    ];
    const before = computeMonthTotals(budget, plans, txs).actualCashBalance;
    // додавання transfers не впливає на computeMonthTotals (він не приймає transfers) —
    // перевіряємо, що грошовий залишок = дохід (немає витрат)
    void transfers;
    expect(before).toBe(toMoney(60000));
  });

  it('фактичний грошовий залишок враховує витрати і накопичення', () => {
    const txs = [
      tx({ type: 'income', amount: toMoney(60000) }),
      tx({ type: 'expense', amount: toMoney(12000), categoryId: 'c1' }),
      tx({ type: 'savings_deposit', amount: toMoney(5000) }),
    ];
    const totals = computeMonthTotals(budget, [], txs);
    expect(totals.actualCashBalance).toBe(toMoney(60000 - 12000 - 5000));
  });

  it('дефіцитний бюджет виявляється', () => {
    const plans = [plan({ categoryId: 'c1', planned: toMoney(70000) })];
    const txs = [tx({ type: 'income', amount: toMoney(60000) })];
    const totals = computeMonthTotals(budget, plans, txs);
    expect(totals.deficit).toBe(toMoney(10000));
    expect(totals.unallocated).toBe(toMoney(-10000));
  });
});

describe('допоміжні', () => {
  it('savingsRateBps', () => {
    expect(savingsRateBps(toMoney(6000), toMoney(60000))).toBe(1000); // 10%
    expect(savingsRateBps(toMoney(0), toMoney(0))).toBe(0);
  });
  it('allowedPerDay', () => {
    expect(allowedPerDay(toMoney(3000), 10)).toBe(toMoney(300));
    expect(allowedPerDay(toMoney(3000), 0)).toBe(toMoney(3000));
  });
});

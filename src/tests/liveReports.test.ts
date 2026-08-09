import { describe, it, expect } from 'vitest';
import { spendingOverTime, topCategoriesBySpend } from '../domain/calculations/liveReport';
import type { Transaction } from '../domain/models';
import { toMoney } from '../domain/money';

function tx(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? Math.random().toString(36),
    createdAt: '',
    updatedAt: '',
    deletedAt: null,
    monthId: 'm',
    type: 'expense',
    amount: toMoney(0),
    date: '2026-08-01',
    ...partial,
  };
}

describe('spendingOverTime', () => {
  it('накопичує витрати по днях від початку місяця', () => {
    const txs = [
      tx({ date: '2026-08-01', amount: toMoney(100) }),
      tx({ date: '2026-08-03', amount: toMoney(200) }),
    ];
    const points = spendingOverTime(txs, '2026-08-01', '2026-08-03');
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({ date: '2026-08-01', cumulative: toMoney(100) });
    expect(points[1]).toEqual({ date: '2026-08-02', cumulative: toMoney(100) });
    expect(points[2]).toEqual({ date: '2026-08-03', cumulative: toMoney(300) });
  });

  it('TEST I: редагування суми витрати змінює графік рівно на різницю', () => {
    const original = tx({ id: 'e1', date: '2026-08-02', amount: toMoney(1000) });
    const before = spendingOverTime([original], '2026-08-01', '2026-08-02');
    expect(before[1].cumulative).toBe(toMoney(1000));

    const edited = { ...original, amount: toMoney(600) };
    const after = spendingOverTime([edited], '2026-08-01', '2026-08-02');
    expect(after[1].cumulative).toBe(toMoney(600));
    expect(before[1].cumulative - after[1].cumulative).toBe(toMoney(400));
  });

  it('враховує повернення як зменшення', () => {
    const txs = [
      tx({ date: '2026-08-01', amount: toMoney(500), type: 'expense' }),
      tx({ date: '2026-08-01', amount: toMoney(200), type: 'refund' }),
    ];
    const points = spendingOverTime(txs, '2026-08-01', '2026-08-01');
    expect(points[0].cumulative).toBe(toMoney(300));
  });
});

describe('topCategoriesBySpend', () => {
  it('сортує спадаюче й обмежує кількість', () => {
    const map = new Map([
      ['a', { actual: toMoney(100) }],
      ['b', { actual: toMoney(500) }],
      ['c', { actual: 0 }],
      ['d', { actual: toMoney(300) }],
    ]);
    const top = topCategoriesBySpend(map, 2);
    expect(top.map((t) => t.categoryId)).toEqual(['b', 'd']);
  });
});

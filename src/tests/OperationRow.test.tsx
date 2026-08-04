import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OperationRow } from '../components/OperationRow';
import type { Category, Transaction } from '../domain/models';
import { toMoney } from '../domain/money';

const cat: Category = {
  id: 'c1', createdAt: '', updatedAt: '', name: 'Продукти', emoji: '🛒',
  section: 'Базові потреби', priority: 2, kind: 'spending', minAmount: 0,
  desiredAmount: 0, regular: true, rollover: true, active: true, sortOrder: 0,
};

const tx: Transaction = {
  id: 't1', createdAt: '', updatedAt: '', monthId: 'm1', type: 'expense',
  amount: toMoney(1870), date: '2026-08-04', categoryId: 'c1',
};

describe('OperationRow', () => {
  it('показує назву категорії, дату та суму витрати зі знаком мінус', () => {
    render(<OperationRow tx={tx} categories={[cat]} />);
    expect(screen.getByText('Продукти')).toBeInTheDocument();
    expect(screen.getByText('2026-08-04')).toBeInTheDocument();
    // Форматер використовує нерозривні пробіли — крапка матчить будь-який пробіл.
    expect(screen.getByText(/−1.870,00.₴/)).toBeInTheDocument();
  });
});

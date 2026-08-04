import { useMemo, useState } from 'react';
import { useMonthView } from '../hooks/useDb';
import { OperationRow } from '../components/OperationRow';
import type { TransactionType } from '../domain/models';
import { uk } from '../i18n';

const FILTERS: { key: 'all' | TransactionType; label: string }[] = [
  { key: 'all', label: 'Усі' },
  { key: 'expense', label: 'Витрати' },
  { key: 'income', label: 'Доходи' },
  { key: 'refund', label: 'Повернення' },
  { key: 'reserve_deposit', label: 'Резерв' },
  { key: 'savings_deposit', label: 'Накопичення' },
];

export function OperationsPage({ monthId }: { monthId: string | null }) {
  const view = useMonthView(monthId);
  const [filter, setFilter] = useState<'all' | TransactionType>('all');

  const filtered = useMemo(() => {
    if (!view) return [];
    return [...view.transactions]
      .filter((t) => filter === 'all' || t.type === filter)
      .sort((a, b) => (b.date < a.date ? -1 : b.date > a.date ? 1 : b.createdAt < a.createdAt ? -1 : 1));
  }, [view, filter]);

  if (!view) {
    return <div className="empty"><div className="emoji">📋</div><p>Немає активного місяця.</p></div>;
  }

  return (
    <>
      <h1>{uk.nav.operations}</h1>
      <div className="chip-row mb">
        {FILTERS.map((f) => (
          <button key={f.key} className={`chip ${filter === f.key ? 'selected' : ''}`} onClick={() => setFilter(f.key)}>
            {f.label}
          </button>
        ))}
      </div>
      <div className="card">
        {filtered.length === 0 && <p className="muted center">Немає операцій за цим фільтром.</p>}
        {filtered.map((tx) => (
          <OperationRow key={tx.id} tx={tx} categories={view.categories} />
        ))}
      </div>
    </>
  );
}

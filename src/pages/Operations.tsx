import { useMemo, useState } from 'react';
import { useMonthView } from '../hooks/useDb';
import { OperationRow } from '../components/OperationRow';
import { OperationEditSheet } from '../components/OperationEditSheet';
import type { Transaction, TransactionType } from '../domain/models';
import { uk } from '../i18n';

const FILTERS: { key: 'all' | TransactionType; label: string }[] = [
  { key: 'all', label: 'Усі' },
  { key: 'expense', label: 'Витрати' },
  { key: 'income', label: 'Доходи' },
  { key: 'refund', label: 'Повернення' },
  { key: 'reserve_deposit', label: 'Резерв' },
  { key: 'reserve_withdrawal', label: 'З резерву' },
  { key: 'savings_deposit', label: 'Накопичення' },
  { key: 'savings_withdrawal', label: 'З накопичень' },
  { key: 'category_transfer', label: 'Переноси' },
  { key: 'correction', label: 'Коригування' },
];

type SortMode = 'newest' | 'oldest' | 'amountDesc' | 'amountAsc' | 'category';

const SORT_LABELS: Record<SortMode, string> = {
  newest: 'Спершу нові',
  oldest: 'Спершу старі',
  amountDesc: 'Сума ↓',
  amountAsc: 'Сума ↑',
  category: 'За категорією',
};

export function OperationsPage({ monthId }: { monthId: string | null }) {
  const view = useMonthView(monthId);
  const [filter, setFilter] = useState<'all' | TransactionType>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortMode>('newest');
  const [editing, setEditing] = useState<Transaction | null>(null);

  const filtered = useMemo(() => {
    if (!view) return [];
    const q = search.trim().toLowerCase();
    const catName = (t: Transaction) => (t.categoryId ? view.categories.find((c) => c.id === t.categoryId)?.name ?? '' : '');
    let list = [...view.transactions].filter((t) => filter === 'all' || t.type === filter);
    if (q) {
      list = list.filter(
        (t) =>
          catName(t).toLowerCase().includes(q) ||
          (t.note ?? '').toLowerCase().includes(q) ||
          String(t.amount / 100).includes(q),
      );
    }
    list.sort((a, b) => {
      switch (sort) {
        case 'oldest':
          return a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt < b.createdAt ? -1 : 1;
        case 'amountDesc':
          return b.amount - a.amount;
        case 'amountAsc':
          return a.amount - b.amount;
        case 'category':
          return catName(a).localeCompare(catName(b), 'uk');
        case 'newest':
        default:
          return b.date < a.date ? -1 : b.date > a.date ? 1 : b.createdAt < a.createdAt ? -1 : 1;
      }
    });
    return list;
  }, [view, filter, search, sort]);

  if (!view) {
    return <div className="empty"><div className="emoji">📋</div><p>Немає активного місяця.</p></div>;
  }

  return (
    <>
      <h1>{uk.nav.operations}</h1>
      <div className="field">
        <input
          className="input"
          placeholder="🔎 Пошук за категорією, нотаткою, сумою"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <div className="row mb">
        <select className="input" style={{ maxWidth: 200 }} value={sort} onChange={(e) => setSort(e.target.value as SortMode)}>
          {(Object.keys(SORT_LABELS) as SortMode[]).map((k) => (
            <option key={k} value={k}>{SORT_LABELS[k]}</option>
          ))}
        </select>
      </div>
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
          <OperationRow key={tx.id} tx={tx} categories={view.categories} onClick={setEditing} />
        ))}
      </div>

      <OperationEditSheet
        tx={editing}
        categories={view.categories}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </>
  );
}

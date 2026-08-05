import { useMemo, useState } from 'react';
import { Sheet, useToast } from './ui';
import { useMonthView } from '../hooks/useDb';
import { useMoneyFormat } from '../hooks/useFormat';
import { addExpense, softDeleteTransaction, upsertPlan } from '../db/repositories';
import { parseUahInput, toMoney } from '../domain/money';
import { isoDateOf } from '../utils/id';
import { uk } from '../i18n';
import { computeCategoryState } from '../domain/calculations/balances';
import { CategoryForm } from '../features/categories/CategoryForm';

export function ExpenseSheet({
  monthId,
  open,
  onClose,
  initialCategoryId,
}: {
  monthId: string | null;
  open: boolean;
  onClose: () => void;
  initialCategoryId?: string;
}) {
  const view = useMonthView(monthId);
  const fmt = useMoneyFormat();
  const toast = useToast();
  const [amountRaw, setAmountRaw] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>(initialCategoryId);
  const [date, setDate] = useState(isoDateOf(new Date()));
  const [note, setNote] = useState('');
  const [showCatForm, setShowCatForm] = useState(false);
  const sections = useMemo(
    () => (view ? Array.from(new Set(view.categories.map((c) => c.section))) : []),
    [view],
  );

  const activeCats = useMemo(() => {
    if (!view) return [];
    return view.plans
      .filter((p) => !p.disabled)
      .map((p) => view.categories.find((c) => c.id === p.categoryId))
      .filter((c): c is NonNullable<typeof c> => !!c && c.active)
      .sort((a, b) => a.priority - b.priority);
  }, [view]);

  const amount = toMoney(parseUahInput(amountRaw));
  const selectedState = useMemo(() => {
    if (!view || !categoryId) return null;
    const plan = view.plans.find((p) => p.categoryId === categoryId);
    if (!plan) return null;
    return computeCategoryState(plan, view.transactions, view.transfers);
  }, [view, categoryId]);

  const afterAvailable = selectedState ? selectedState.available - amount : null;

  async function save() {
    if (!monthId || !categoryId || amount <= 0) return;
    const tx = await addExpense({ monthId, categoryId, amount, date, note: note || undefined });
    toast({
      message: `Витрату збережено: ${fmt(amount)}`,
      undo: () => softDeleteTransaction(tx.id),
    });
    setAmountRaw('');
    setNote('');
    onClose();
  }

  if (!view) return null;

  return (
    <Sheet open={open} onClose={onClose} title={uk.expense.title}>
      <div className="field">
        <label>{uk.common.amount}, ₴</label>
        <input
          className="input amount lg"
          inputMode="decimal"
          autoFocus
          placeholder="0"
          value={amountRaw}
          onChange={(e) => setAmountRaw(e.target.value)}
        />
      </div>

      <div className="field">
        <label>{uk.common.category}</label>
        <div className="chip-row">
          {activeCats.map((c) => (
            <button
              key={c.id}
              className={`chip ${categoryId === c.id ? 'selected' : ''}`}
              onClick={() => setCategoryId(c.id)}
            >
              <span aria-hidden>{c.emoji}</span>
              {c.name}
            </button>
          ))}
          <button className="chip" onClick={() => setShowCatForm(true)}>＋ Нова</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="field">
          <label>{uk.common.date}</label>
          <input
            className="input"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="field">
          <label>
            {uk.common.note} <span className="muted">({uk.common.optional})</span>
          </label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </div>

      {selectedState && amount > 0 && (
        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="row">
            <span className="muted small">{uk.expense.newBalance}</span>
            <strong style={{ color: afterAvailable! < 0 ? 'var(--danger)' : 'var(--ok)' }}>
              {fmt(afterAvailable!)}
            </strong>
          </div>
          {afterAvailable! < 0 && (
            <p className="small" style={{ color: 'var(--danger)', margin: '8px 0 0' }}>
              ❗ {uk.expense.overLimit}. Після збереження можна перенести кошти з іншої категорії.
            </p>
          )}
        </div>
      )}

      <button className="btn primary block mt" disabled={!categoryId || amount <= 0} onClick={save}>
        {uk.expense.save}
      </button>

      {showCatForm && (
        <CategoryForm
          category={null}
          sections={sections}
          onClose={() => setShowCatForm(false)}
          onSaved={async (saved) => {
            setShowCatForm(false);
            // Додаємо план (0 грн) на поточний місяць, щоб категорія одразу зʼявилась,
            // і одразу обираємо її для витрати.
            if (monthId) await upsertPlan(monthId, saved.id, { planned: 0 });
            setCategoryId(saved.id);
          }}
        />
      )}
    </Sheet>
  );
}

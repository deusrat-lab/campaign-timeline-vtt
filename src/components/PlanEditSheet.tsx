import { useEffect, useState } from 'react';
import { Sheet, useToast } from './ui';
import { upsertPlan } from '../db/repositories';
import { parseUahInput, toMoney, toUah } from '../domain/money';
import type { Category, MonthlyCategoryPlan } from '../domain/models';

/** Аркуш редагування плану категорії на активний місяць (не чіпає Category.desiredAmount). */
export function PlanEditSheet({
  monthId,
  category,
  plan,
  open,
  onClose,
}: {
  monthId: string | null;
  category: Category | null;
  plan: MonthlyCategoryPlan | undefined;
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const [plannedRaw, setPlannedRaw] = useState('');
  const [note, setNote] = useState('');
  const [disabled, setDisabled] = useState(false);

  useEffect(() => {
    if (!open) return;
    setPlannedRaw(plan ? String(toUah(plan.planned)) : '0');
    setNote(plan?.note ?? '');
    setDisabled(plan?.disabled ?? false);
  }, [open, plan]);

  async function save() {
    if (!monthId || !category) return;
    await upsertPlan(monthId, category.id, {
      planned: toMoney(parseUahInput(plannedRaw)),
      note: note || undefined,
      disabled,
    });
    toast({ message: 'План оновлено' });
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={category ? `План: ${category.emoji} ${category.name}` : 'План'}>
      <div className="field">
        <label>План на цей місяць, ₴</label>
        <input
          className="input amount lg"
          inputMode="decimal"
          value={plannedRaw}
          onChange={(e) => setPlannedRaw(e.target.value)}
          placeholder="0"
        />
      </div>
      <div className="field">
        <label>Нотатка <span className="muted">(необов'язково)</span></label>
        <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
      </div>
      <label className="row" style={{ alignItems: 'center', gap: 8 }}>
        <input type="checkbox" checked={disabled} onChange={(e) => setDisabled(e.target.checked)} />
        Вимкнути категорію в цьому місяці
      </label>
      <button className="btn primary block mt" onClick={save}>Зберегти</button>
    </Sheet>
  );
}

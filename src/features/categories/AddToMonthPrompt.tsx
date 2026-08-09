import { useState } from 'react';
import { Sheet } from '../../components/ui';
import { parseUahInput, toMoney } from '../../domain/money';
import type { Category } from '../../domain/models';

/** Пропозиція одразу додати щойно створену категорію до поточного активного місяця. */
export function AddToMonthPrompt({
  category,
  onClose,
  onConfirm,
}: {
  category: Category;
  onClose: () => void;
  onConfirm: (planned: number) => void;
}) {
  const [plannedRaw, setPlannedRaw] = useState('');

  return (
    <Sheet open onClose={onClose} title="Додати до поточного місяця?">
      <p className="small muted">
        {category.emoji} {category.name} — додати цю категорію до бюджету поточного місяця?
      </p>
      <div className="field">
        <label>План на цей місяць, ₴ <span className="muted">(необов'язково)</span></label>
        <input
          className="input amount lg"
          inputMode="decimal"
          value={plannedRaw}
          placeholder="0"
          onChange={(e) => setPlannedRaw(e.target.value)}
        />
      </div>
      <div className="row mt">
        <button className="btn" onClick={onClose}>Не зараз</button>
        <button
          className="btn primary"
          style={{ flex: 1, marginLeft: 8 }}
          onClick={() => onConfirm(toMoney(parseUahInput(plannedRaw)))}
        >
          Додати
        </button>
      </div>
    </Sheet>
  );
}

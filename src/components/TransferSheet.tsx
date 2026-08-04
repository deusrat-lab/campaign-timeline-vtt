import { useMemo, useState } from 'react';
import { Sheet, useToast } from './ui';
import { useMonthView, useReserves, useSavings } from '../hooks/useDb';
import { useMoneyFormat } from '../hooks/useFormat';
import { doTransfer, type TransferSource } from '../db/repositories';
import { parseUahInput, toMoney } from '../domain/money';
import { uk } from '../i18n';
import { PROTECTED_PRIORITIES } from '../domain/models';

/**
 * Аркуш перенесення коштів. Пропонує джерела у безпечному порядку:
 * нерозподілені → комфорт/розваги → змінні категорії → резерв → накопичення.
 * Критичні категорії (пріоритет 1) не пропонуються як джерело.
 */
export function TransferSheet({
  monthId,
  open,
  onClose,
  destinationCategoryId,
}: {
  monthId: string | null;
  open: boolean;
  onClose: () => void;
  destinationCategoryId?: string;
}) {
  const view = useMonthView(monthId);
  const reserves = useReserves();
  const savings = useSavings();
  const fmt = useMoneyFormat();
  const toast = useToast();

  const [amountRaw, setAmountRaw] = useState('');
  const [destId, setDestId] = useState(destinationCategoryId ?? '');
  const [source, setSource] = useState<TransferSource | null>(null);
  const [reason, setReason] = useState('');

  const amount = toMoney(parseUahInput(amountRaw));

  const sources = useMemo(() => {
    if (!view) return [] as { label: string; emoji: string; source: TransferSource; balance: number; priority: number }[];
    const list: { label: string; emoji: string; source: TransferSource; balance: number; priority: number }[] = [];
    if (view.totals.unallocated > 0) {
      list.push({ label: uk.transfer.unallocated, emoji: '⚪', source: { type: 'unallocated' }, balance: view.totals.unallocated, priority: 0 });
    }
    for (const [catId, st] of view.stateByCategory) {
      const cat = view.categories.find((c) => c.id === catId);
      if (!cat || catId === destId) continue;
      if (PROTECTED_PRIORITIES.includes(cat.priority)) continue; // не чіпаємо критичні
      if (st.available <= 0) continue;
      list.push({ label: cat.name, emoji: cat.emoji, source: { type: 'category', categoryId: catId }, balance: st.available, priority: cat.priority });
    }
    for (const r of reserves ?? []) {
      if (r.balance <= 0) continue;
      list.push({ label: `${uk.transfer.reserve}: ${r.name}`, emoji: r.emoji, source: { type: 'reserve', reserveId: r.id }, balance: r.balance, priority: 8 });
    }
    for (const g of savings ?? []) {
      if (g.currentAmount <= 0) continue;
      list.push({ label: `${uk.transfer.savings}: ${g.name}`, emoji: g.emoji, source: { type: 'savings', savingsGoalId: g.id }, balance: g.currentAmount, priority: 9 });
    }
    // Безпечний порядок: спершу нерозподілені й нижчі пріоритети (комфорт=5, розваги=6),
    // потім змінні, резерв, накопичення.
    return list.sort((a, b) => sourceWeight(b) - sourceWeight(a));
  }, [view, reserves, savings, destId]);

  const destCats = useMemo(
    () => (view ? view.categories.filter((c) => c.active && view.plans.some((p) => p.categoryId === c.id && !p.disabled)) : []),
    [view],
  );

  async function submit() {
    if (!monthId || !destId || !source || amount <= 0) return;
    await doTransfer({ monthId, amount, destinationCategoryId: destId, source, reason: reason || undefined });
    toast({ message: `Перенесено ${fmt(amount)}` });
    setAmountRaw('');
    setReason('');
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title={uk.transfer.title}>
      <div className="field">
        <label>{uk.common.amount}, ₴</label>
        <input className="input amount" inputMode="decimal" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} placeholder="0" />
      </div>

      <div className="field">
        <label>{uk.transfer.to}</label>
        <select className="input" value={destId} onChange={(e) => setDestId(e.target.value)}>
          <option value="">—</option>
          {destCats.map((c) => (
            <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>{uk.transfer.from} <span className="muted small">(безпечний порядок)</span></label>
        <div className="chip-row">
          {sources.map((s, i) => {
            const sel = JSON.stringify(source) === JSON.stringify(s.source);
            return (
              <button key={i} className={`chip ${sel ? 'selected' : ''}`} onClick={() => setSource(s.source)}>
                <span aria-hidden>{s.emoji}</span>
                {s.label} · {fmt(s.balance)}
              </button>
            );
          })}
          {sources.length === 0 && <span className="muted small">Немає доступних джерел.</span>}
        </div>
      </div>

      <div className="field">
        <label>{uk.transfer.reason} <span className="muted">({uk.common.optional})</span></label>
        <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>

      <button className="btn primary block" disabled={!destId || !source || amount <= 0} onClick={submit}>
        {uk.transfer.title}
      </button>
    </Sheet>
  );
}

function sourceWeight(s: { priority: number }): number {
  // Вищий вага = пропонувати раніше. Нерозподілені(0) і розваги(6)/комфорт(5) — першими.
  const map: Record<number, number> = { 0: 100, 6: 90, 5: 80, 4: 40, 3: 50, 2: 45, 8: 20, 9: 10 };
  return map[s.priority] ?? 30;
}

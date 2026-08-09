/** Чисті функції для live-звітності активного місяця (без monthlyClosures). */
import type { Transaction } from '../models';
import { addMoney, type Money } from '../money';

export interface SpendingPoint {
  date: string; // 'YYYY-MM-DD'
  cumulative: Money;
}

/** Кумулятивні витрати по днях від початку місяця до сьогодні (включно). */
export function spendingOverTime(txs: Transaction[], monthStartIso: string, todayIso: string): SpendingPoint[] {
  const byDay = new Map<string, Money>();
  for (const t of txs) {
    if (t.type !== 'expense' && t.type !== 'correction' && t.type !== 'refund') continue;
    if (t.date < monthStartIso || t.date > todayIso) continue;
    const delta = t.type === 'refund' ? -t.amount : t.amount;
    byDay.set(t.date, addMoney(byDay.get(t.date) ?? 0, delta));
  }
  const points: SpendingPoint[] = [];
  let running = 0;
  for (const date of dateRange(monthStartIso, todayIso)) {
    running = addMoney(running, byDay.get(date) ?? 0);
    points.push({ date, cumulative: running < 0 ? 0 : running });
  }
  return points;
}

function dateRange(fromIso: string, toIso: string): string[] {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = new Date(fy, fm - 1, fd);
  const to = new Date(ty, tm - 1, td);
  const days: string[] = [];
  for (let d = from; d <= to; d.setDate(d.getDate() + 1)) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    days.push(`${y}-${m}-${day}`);
  }
  return days;
}

export interface TopCategoryLine {
  categoryId: string;
  actual: Money;
}

/** Топ категорій за фактичними витратами (спадання). */
export function topCategoriesBySpend(
  stateByCategory: Map<string, { actual: Money }>,
  limit = 5,
): TopCategoryLine[] {
  return [...stateByCategory.entries()]
    .map(([categoryId, st]) => ({ categoryId, actual: st.actual }))
    .filter((l) => l.actual > 0)
    .sort((a, b) => b.actual - a.actual)
    .slice(0, limit);
}

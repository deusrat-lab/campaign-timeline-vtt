import type { MonthView } from '../db/service';
import { computeWeeklyBudget } from '../domain/calculations/weekly';
import { useMoneyFormat } from '../hooks/useFormat';
import { daysInMonthOf } from '../utils/id';

function monthBounds(monthKey: string): { start: Date; end: Date } {
  const [y, m] = monthKey.split('-').map(Number);
  return { start: new Date(y, m - 1, 1), end: new Date(y, m - 1, daysInMonthOf(monthKey)) };
}

export function WeeklyBudgetCard({ view }: { view: MonthView }) {
  const fmt = useMoneyFormat();
  const { start, end } = monthBounds(view.month.monthKey);
  const today = new Date();
  const wk = computeWeeklyBudget(view.totals, view.transactions, today, start, end);

  const label = `${formatDay(wk.week.start)}–${formatDay(wk.week.end)}`;

  return (
    <div className="card">
      <div className="row">
        <span style={{ fontWeight: 600 }}>Цей тиждень</span>
        <span className="muted small">{label}</span>
      </div>
      <div className="grid-2 mt">
        <Stat label="Витрачено" value={fmt(wk.spentThisWeek)} />
        <Stat
          label="Залишилось"
          value={fmt(wk.remainingThisWeek)}
          tone={wk.remainingThisWeek < 0 ? 'danger' : 'ok'}
        />
        <Stat label="Безпечний бюджет" value={fmt(wk.safeWeeklyBudget)} />
        <Stat label="До кінця тижня" value={`${wk.daysLeftInWeek} дн.`} />
      </div>
      <p className="small muted mt" style={{ margin: '8px 0 0' }}>
        На весь місяць залишилось: {fmt(wk.remainingSpendableMonth)} · {wk.daysLeftInMonth} дн. до кінця місяця
      </p>
    </div>
  );
}

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${Number(d)}.${m}`;
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'ok' }) {
  const color = tone === 'danger' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : 'var(--text)';
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color }}>{value}</span>
    </div>
  );
}

import { Link } from 'react-router-dom';
import { useMonthView } from '../hooks/useDb';
import { useMoneyFormat } from '../hooks/useFormat';
import { Progress, StatusBadge } from '../components/ui';
import { PRIORITY_LABELS, type Priority } from '../domain/models';
import { allowedPerDay, forecastEndOfMonth } from '../domain/calculations/balances';
import { daysInMonthOf } from '../utils/id';
import { uk } from '../i18n';

export function BudgetPage({ monthId }: { monthId: string | null }) {
  const view = useMonthView(monthId);
  const fmt = useMoneyFormat();

  if (!view) {
    return (
      <div className="empty">
        <div className="emoji">📊</div>
        <p>Немає активного місяця.</p>
        <Link className="btn primary mt" to="/new-month">{uk.home.createMonth}</Link>
      </div>
    );
  }

  const { month } = view;
  const daysInMonth = daysInMonthOf(month.monthKey);
  const today = new Date();
  const isCurrent = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}` === month.monthKey;
  const dayOfMonth = isCurrent ? today.getDate() : daysInMonth;
  const daysLeft = Math.max(0, daysInMonth - dayOfMonth);

  // Групування за пріоритетом.
  const byPriority = new Map<Priority, { catId: string }[]>();
  for (const plan of view.plans) {
    const cat = view.categories.find((c) => c.id === plan.categoryId);
    if (!cat || plan.disabled) continue;
    const p = (plan.criticalOverride ? 1 : plan.priorityOverride ?? cat.priority) as Priority;
    if (!byPriority.has(p)) byPriority.set(p, []);
    byPriority.get(p)!.push({ catId: plan.categoryId });
  }
  const priorities = [...byPriority.keys()].sort((a, b) => a - b);

  return (
    <>
      <div className="row">
        <h1>{uk.nav.budget}</h1>
        <span className={`badge ${month.status === 'active' ? 'ok' : 'neutral'}`}>{uk.status[month.status]}</span>
      </div>

      {priorities.map((p) => (
        <section key={p}>
          <div className="section-title">{PRIORITY_LABELS[p]}</div>
          {byPriority.get(p)!.map(({ catId }) => {
            const cat = view.categories.find((c) => c.id === catId)!;
            const st = view.stateByCategory.get(catId)!;
            const forecast = forecastEndOfMonth(st.actual, dayOfMonth, daysInMonth);
            const perDay = allowedPerDay(st.available, daysLeft);
            return (
              <div key={catId} className="card">
                <div className="row">
                  <span style={{ fontWeight: 600 }}>{cat.emoji} {cat.name}</span>
                  <StatusBadge status={st.status} />
                </div>
                <div className="row mt small muted">
                  <span>План: {fmt(st.planned)}</span>
                  <span>Факт: {fmt(st.actual)}</span>
                  <span style={{ color: st.available < 0 ? 'var(--danger)' : 'var(--ok)' }}>
                    Залишок: {fmt(st.available)}
                  </span>
                </div>
                <div className="mt"><Progress ratioBps={st.usedRatioBps} status={st.status} /></div>
                {st.transfersIn > 0 && (
                  <p className="small muted mt" style={{ margin: '6px 0 0' }}>
                    🔄 Перенесено сюди: {fmt(st.transfersIn)}
                  </p>
                )}
                {month.status === 'active' && st.status !== 'idle' && (
                  <div className="row small muted mt">
                    <span>Прогноз: {fmt(forecast)}</span>
                    {daysLeft > 0 && st.available > 0 && <span>≈ {fmt(perDay)}/день · {daysLeft} дн.</span>}
                  </div>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {view.plans.length === 0 && (
        <div className="empty">
          <div className="emoji">🗂️</div>
          <p>Бюджет ще не складено.</p>
          <Link className="btn primary mt" to="/new-month">Скласти бюджет</Link>
        </div>
      )}
    </>
  );
}

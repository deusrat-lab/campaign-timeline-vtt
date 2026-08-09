import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMonthView } from '../hooks/useDb';
import { useMoneyFormat } from '../hooks/useFormat';
import { Progress, StatusBadge } from '../components/ui';
import { PlanEditSheet } from '../components/PlanEditSheet';
import { TransferSheet } from '../components/TransferSheet';
import { PRIORITY_LABELS, type Priority } from '../domain/models';
import { allowedPerDay, forecastEndOfMonth } from '../domain/calculations/balances';
import type { TransferSource } from '../db/repositories';
import { daysInMonthOf } from '../utils/id';
import { uk } from '../i18n';

const EMPTY_HELP = 'Категорії без плану, витрат і переносів приховані.';

export function BudgetPage({ monthId }: { monthId: string | null }) {
  const view = useMonthView(monthId);
  const fmt = useMoneyFormat();
  const [search, setSearch] = useState('');
  const [showEmpty, setShowEmpty] = useState(false);
  const [planCatId, setPlanCatId] = useState<string | null>(null);
  const [transferPreset, setTransferPreset] = useState<
    { destId?: string; amount?: number; source?: TransferSource } | null
  >(null);

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
  const q = search.trim().toLowerCase();

  const byPriority = new Map<Priority, { catId: string }[]>();
  for (const plan of view.plans) {
    const cat = view.categories.find((c) => c.id === plan.categoryId);
    if (!cat || plan.disabled) continue;
    const st = view.stateByCategory.get(plan.categoryId)!;
    const isEmpty =
      st.actual === 0 && plan.planned === 0 && st.transfersIn === 0 && st.transfersOut === 0 && plan.rolloverIn === 0;
    if (isEmpty && !showEmpty) continue;
    if (q && !cat.name.toLowerCase().includes(q) && !cat.section.toLowerCase().includes(q)) continue;
    const p = (plan.criticalOverride ? 1 : plan.priorityOverride ?? cat.priority) as Priority;
    if (!byPriority.has(p)) byPriority.set(p, []);
    byPriority.get(p)!.push({ catId: plan.categoryId });
  }
  const visiblePriorities = [...byPriority.keys()].sort((a, b) => a - b);

  const planCat = planCatId ? view.categories.find((c) => c.id === planCatId) ?? null : null;
  const planForCat = planCatId ? view.plans.find((p) => p.categoryId === planCatId) : undefined;

  return (
    <>
      <div className="row">
        <h1>{uk.nav.budget}</h1>
        <span className={`badge ${month.status === 'active' ? 'ok' : 'neutral'}`}>{uk.status[month.status]}</span>
      </div>

      <div className="field">
        <input
          className="input"
          placeholder="🔎 Знайти категорію"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>
      <label className="row small muted" style={{ alignItems: 'center', gap: 6, marginBottom: 8 }}>
        <input type="checkbox" checked={showEmpty} onChange={(e) => setShowEmpty(e.target.checked)} />
        Показати порожні
      </label>

      {visiblePriorities.map((p) => (
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
                {month.status !== 'closed' && st.status === 'over' && (
                  <div className="row mt">
                    <span className="small" style={{ color: 'var(--danger)' }}>
                      Дефіцит: {fmt(-st.available)}
                    </span>
                    <button
                      className="btn sm"
                      onClick={() =>
                        setTransferPreset({ destId: catId, amount: -st.available })
                      }
                    >
                      Покрити дефіцит
                    </button>
                  </div>
                )}
                {month.status !== 'closed' && st.status !== 'over' && st.available > 0 && (
                  <div className="row mt">
                    <span />
                    <button
                      className="btn sm ghost"
                      onClick={() =>
                        setTransferPreset({ source: { type: 'category', categoryId: catId } })
                      }
                    >
                      Перерозподілити залишок
                    </button>
                  </div>
                )}
                {month.status !== 'closed' && (
                  <button className="btn sm ghost mt" onClick={() => setPlanCatId(catId)}>
                    Змінити план
                  </button>
                )}
              </div>
            );
          })}
        </section>
      ))}

      {visiblePriorities.length === 0 && view.plans.length > 0 && (
        <p className="muted center mt">{q ? 'Нічого не знайдено.' : EMPTY_HELP}</p>
      )}

      {view.plans.length === 0 && (
        <div className="empty">
          <div className="emoji">🗂️</div>
          <p>Бюджет ще не складено.</p>
          <Link className="btn primary mt" to="/new-month">Скласти бюджет</Link>
        </div>
      )}

      <Link className="btn block mt" to="/settings/categories">🗂️ Керувати категоріями</Link>

      <PlanEditSheet
        monthId={monthId}
        category={planCat}
        plan={planForCat}
        open={planCatId !== null}
        onClose={() => setPlanCatId(null)}
      />
      <TransferSheet
        monthId={monthId}
        open={transferPreset !== null}
        onClose={() => setTransferPreset(null)}
        destinationCategoryId={transferPreset?.destId}
        initialAmount={transferPreset?.amount}
        initialSource={transferPreset?.source}
      />
    </>
  );
}

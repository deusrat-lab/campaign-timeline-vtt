import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMonthView, useReserves } from '../hooks/useDb';
import { useMoneyFormat } from '../hooks/useFormat';
import { TransferSheet } from '../components/TransferSheet';
import { WeeklyBudgetCard } from '../components/WeeklyBudgetCard';
import { setMonthStatus } from '../db/repositories';
import { uk } from '../i18n';
import { PRIORITY_LABELS } from '../domain/models';
import { OperationRow } from '../components/OperationRow';

export function HomePage({ monthId, onAddExpense }: { monthId: string | null; onAddExpense: () => void }) {
  const view = useMonthView(monthId);
  const reserves = useReserves();
  const fmt = useMoneyFormat();
  const [transferOpen, setTransferOpen] = useState(false);

  if (!monthId || !view) {
    return (
      <div className="empty" style={{ marginTop: 60 }}>
        <div className="emoji">📅</div>
        <h2>{uk.home.noMonth}</h2>
        <p className="muted">Створіть місяць і внесіть фактично отриману зарплату.</p>
        <Link className="btn primary mt" to="/new-month">
          {uk.home.createMonth}
        </Link>
      </div>
    );
  }

  const { month, totals, stateByCategory, categories } = view;
  const reserveTotal = (reserves ?? []).reduce((a, r) => a + r.balance, 0);
  const problems = [...stateByCategory.entries()]
    .filter(([, st]) => st.status === 'over' || st.status === 'reached')
    .map(([id, st]) => ({ cat: categories.find((c) => c.id === id), st }))
    .filter((p) => p.cat);

  const recent = [...view.transactions]
    .sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1))
    .slice(0, 6);

  return (
    <>
      <div className="row" style={{ marginBottom: 12 }}>
        <div>
          <h1 style={{ marginBottom: 2 }}>{month.title}</h1>
          <span className={`badge ${month.status === 'active' ? 'ok' : month.status === 'closed' ? 'neutral' : 'info'}`}>
            {uk.status[month.status]}
          </span>
        </div>
        <Link to="/settings" className="btn" aria-label={uk.nav.settings} style={{ minHeight: 44, padding: '0 14px' }}>
          ⚙️
        </Link>
      </div>

      {month.status === 'draft' && (
        <div className="card" style={{ background: 'var(--info-bg)' }}>
          <p className="small" style={{ margin: 0 }}>
            Місяць у стадії підготовки. Завершіть майстер бюджету, щоб активувати його.
          </p>
          <Link className="btn primary block mt" to="/new-month">
            Продовжити майстер
          </Link>
        </div>
      )}

      <div className="card">
        <div className="stat">
          <span className="stat-label">{uk.home.income}</span>
          <span className="stat-value big">{fmt(totals.actualIncome)}</span>
        </div>
        <div className="grid-2 mt">
          <Stat label={uk.home.spent} value={fmt(totals.totalExpense)} />
          <Stat label={uk.home.available} value={fmt(totals.availableToSpend)} />
          <Stat label={uk.home.unallocated} value={fmt(totals.unallocated)} tone={totals.unallocated < 0 ? 'danger' : 'neutral'} />
          <Stat label={uk.home.reserve} value={fmt(reserveTotal)} tone="info" />
          <Stat label={uk.home.saved} value={fmt(totals.toSavings)} tone="info" />
          <Stat
            label={totals.deficit > 0 ? uk.home.deficit : uk.home.surplus}
            value={fmt(totals.deficit > 0 ? totals.deficit : totals.unallocated < 0 ? 0 : totals.unallocated)}
            tone={totals.deficit > 0 ? 'danger' : 'ok'}
          />
        </div>
      </div>

      {month.status === 'active' && <WeeklyBudgetCard view={view} />}

      <div className="grid-2">
        {month.status !== 'closed' && (
          <button className="btn primary" onClick={onAddExpense}>➕ {uk.nav.expense}</button>
        )}
        {month.status !== 'closed' && (
          <button className="btn" onClick={() => setTransferOpen(true)}>🔄 {uk.transfer.title}</button>
        )}
        <Link className="btn" to="/budget">📊 {uk.nav.budget}</Link>
        {month.status === 'active' && (
          <Link className="btn" to={`/close/${monthId}`}>🏁 {uk.close.title}</Link>
        )}
      </div>

      {problems.length > 0 && (
        <>
          <div className="section-title">{uk.home.problemCategories}</div>
          <div className="card">
            {problems.map(({ cat, st }) => (
              <div key={cat!.id} className="row" style={{ padding: '8px 0' }}>
                <span>{cat!.emoji} {cat!.name} <span className="muted small">· {PRIORITY_LABELS[cat!.priority]}</span></span>
                <span style={{ color: 'var(--danger)', fontWeight: 700 }}>{fmt(st.available)}</span>
              </div>
            ))}
            <button className="btn block mt" onClick={() => setTransferOpen(true)}>
              Покрити перенесенням коштів
            </button>
          </div>
        </>
      )}

      <div className="section-title">{uk.home.recentOps}</div>
      <div className="card">
        {recent.length === 0 && <p className="muted center">Ще немає операцій.</p>}
        {recent.map((tx) => (
          <OperationRow key={tx.id} tx={tx} categories={categories} />
        ))}
        {recent.length > 0 && (
          <Link className="btn block mt" to="/operations">Усі операції</Link>
        )}
      </div>

      <TransferSheet monthId={monthId} open={transferOpen} onClose={() => setTransferOpen(false)} />

      {month.status === 'draft' && totals.confirmedPlans > 0 && (
        <button className="btn primary block mt" onClick={() => setMonthStatus(monthId, 'active')}>
          Активувати місяць
        </button>
      )}
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'ok' | 'info' | 'neutral' }) {
  const color =
    tone === 'danger' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : tone === 'info' ? 'var(--info)' : 'var(--text)';
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value" style={{ color }}>{value}</span>
    </div>
  );
}

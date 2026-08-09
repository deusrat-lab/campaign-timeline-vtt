import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { useMonthView } from '../hooks/useDb';
import { useMoneyFormat } from '../hooks/useFormat';
import { uk } from '../i18n';
import type { ClosureSummary } from '../domain/models';
import { buildInsights, type ClosedMonthPoint } from '../domain/calculations/insights';
import { spendingOverTime, topCategoriesBySpend } from '../domain/calculations/liveReport';
import { isoDateOf } from '../utils/id';
import type { MonthView } from '../db/service';

export function ReportsPage({ activeMonthId }: { activeMonthId: string | null }) {
  const fmt = useMoneyFormat();
  const activeView = useMonthView(activeMonthId);
  const closures = useLiveQuery(async () => {
    const list = await db.monthlyClosures.toArray();
    const withMonth = await Promise.all(
      list.map(async (c) => ({ closure: c, month: await db.monthlyBudgets.get(c.monthId) })),
    );
    return withMonth
      .filter((x) => x.month)
      .sort((a, b) => (b.month!.monthKey < a.month!.monthKey ? -1 : 1));
  }, []);

  if (!closures) return <div className="empty"><div className="emoji">⏳</div></div>;

  return (
    <>
      <h1>{uk.nav.reports}</h1>

      {activeView && activeView.month.status === 'active' && <LiveMonthReport view={activeView} fmt={fmt} />}

      {closures.length === 0 && (
        <div className="empty">
          <div className="emoji">📈</div>
          <p>Ще немає закритих місяців.</p>
          <p className="muted small">Закрийте перший місяць, щоб побачити підсумки та динаміку.</p>
        </div>
      )}

      {closures.length > 0 && (
        <Insights
          points={closures.map((c) => ({ monthKey: c.month!.monthKey, title: c.month!.title, summary: c.closure.summary }))}
        />
      )}

      {closures.length >= 2 && <Comparison items={closures.map((c) => ({ key: c.month!.monthKey, s: c.closure.summary }))} fmt={fmt} />}

      {closures.map(({ closure, month }) => {
        const s = closure.summary;
        return (
          <div className="card" key={closure.id}>
            <div className="row">
              <strong>{month!.title}</strong>
              <span className="badge neutral">{uk.status.closed}</span>
            </div>
            <div className="grid-2 mt small">
              <Kv label={uk.home.income} v={fmt(s.actualIncome)} />
              <Kv label={uk.home.spent} v={fmt(s.totalExpense)} />
              <Kv label="Накопичення" v={fmt(s.toSavings)} />
              <Kv label="Залишок" v={fmt(s.finalFree)} />
              <Kv label="% накопичень" v={`${(s.savingsRateBps / 100).toFixed(1)}%`} />
              <Kv label="Переносів" v={String(s.transferCount)} />
            </div>
            <IncomeExpenseBar income={s.actualIncome} expense={s.totalExpense} />
          </div>
        );
      })}
    </>
  );
}

/** Live-звіт активного місяця: рахується з поточних операцій, без очікування закриття. */
function LiveMonthReport({ view, fmt }: { view: MonthView; fmt: (m: number) => string }) {
  const { month, totals, categories, stateByCategory } = view;
  const monthStart = `${month.monthKey}-01`;
  const today = isoDateOf(new Date());
  const todayInMonth = today < monthStart ? monthStart : today;
  const points = spendingOverTime(view.transactions, monthStart, todayInMonth);
  const top = topCategoriesBySpend(stateByCategory, 5);
  const maxCumulative = Math.max(...points.map((p) => p.cumulative), 1);

  return (
    <div className="card" style={{ background: 'var(--surface-2)' }}>
      <div className="row">
        <div className="section-title" style={{ margin: 0 }}>Цей місяць (live)</div>
        <span className="badge ok">{uk.status.active}</span>
      </div>

      <div className="grid-2 mt small">
        <Kv label={uk.home.income} v={fmt(totals.actualIncome)} />
        <Kv label={uk.home.spent} v={fmt(totals.totalExpense)} />
        <Kv label={uk.home.available} v={fmt(totals.availableToSpend)} />
        <Kv label="Резерв (рух)" v={fmt(totals.toReserves - totals.fromReserves)} />
        <Kv label="Накопичення (рух)" v={fmt(totals.toSavings - totals.fromSavings)} />
        <Kv
          label={totals.deficit > 0 ? uk.home.deficit : uk.home.surplus}
          v={fmt(totals.deficit > 0 ? totals.deficit : totals.unallocated < 0 ? 0 : totals.unallocated)}
        />
      </div>

      {points.length > 1 && (
        <div className="mt">
          <div className="small muted" style={{ marginBottom: 4 }}>Витрати наростаючим підсумком</div>
          <div className="row" style={{ alignItems: 'flex-end', gap: 2, height: 48 }}>
            {points.map((p) => (
              <span
                key={p.date}
                title={`${p.date}: ${fmt(p.cumulative)}`}
                style={{
                  flex: 1,
                  minWidth: 2,
                  height: `${Math.max(4, (p.cumulative / maxCumulative) * 48)}px`,
                  background: 'var(--danger)',
                  borderRadius: 2,
                }}
              />
            ))}
          </div>
        </div>
      )}

      {top.length > 0 && (
        <div className="mt">
          <div className="small muted" style={{ marginBottom: 4 }}>Топ категорій за фактом</div>
          {top.map((line) => {
            const cat = categories.find((c) => c.id === line.categoryId);
            return (
              <div key={line.categoryId} className="row" style={{ padding: '3px 0' }}>
                <span className="small">{cat?.emoji} {cat?.name ?? '—'}</span>
                <span className="small" style={{ fontWeight: 600 }}>{fmt(line.actual)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Insights({ points }: { points: ClosedMonthPoint[] }) {
  const insights = buildInsights(points);
  if (insights.length === 0) return null;
  return (
    <div className="card" style={{ background: 'var(--info-bg)' }}>
      <div className="section-title" style={{ margin: '0 0 8px' }}>Короткі висновки</div>
      {insights.map((i, idx) => (
        <div key={idx} className="row" style={{ padding: '4px 0', alignItems: 'flex-start' }}>
          <span aria-hidden>{i.icon}</span>
          <span className="small" style={{ flex: 1 }}>{i.text}</span>
        </div>
      ))}
    </div>
  );
}

function Comparison({ items, fmt }: { items: { key: string; s: ClosureSummary }[]; fmt: (m: number) => string }) {
  const last3 = items.slice(0, 3);
  const avgIncome = Math.round(last3.reduce((a, i) => a + i.s.actualIncome, 0) / last3.length);
  const avgExpense = Math.round(last3.reduce((a, i) => a + i.s.totalExpense, 0) / last3.length);
  return (
    <div className="card" style={{ background: 'var(--surface-2)' }}>
      <div className="section-title" style={{ margin: '0 0 8px' }}>Порівняння (останні {last3.length} міс)</div>
      <div className="grid-2 small">
        <Kv label="Сер. дохід" v={fmt(avgIncome)} />
        <Kv label="Сер. витрати" v={fmt(avgExpense)} />
      </div>
    </div>
  );
}

function IncomeExpenseBar({ income, expense }: { income: number; expense: number }) {
  const max = Math.max(income, expense, 1);
  return (
    <div className="mt">
      <Bar label="Дохід" value={income} max={max} color="var(--ok)" />
      <Bar label="Витрати" value={expense} max={max} color="var(--danger)" />
    </div>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  return (
    <div style={{ margin: '4px 0' }}>
      <div className="small muted" style={{ marginBottom: 2 }}>{label}</div>
      <div className="progress"><span style={{ width: `${(value / max) * 100}%`, background: color }} /></div>
    </div>
  );
}

function Kv({ label, v }: { label: string; v: string }) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span style={{ fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>{v}</span>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { closeMonth, createNextMonth, preCloseChecklist, type CloseChecklist } from '../../db/service';
import { db, updateSettings } from '../../db/db';
import { reopenMonth } from '../../db/repositories';
import { useMoneyFormat } from '../../hooks/useFormat';
import { ConfirmButton } from '../../components/ui';
import { adviceFromClosure, type NextMonthAdvice } from '../../domain/calculations/recommendations';
import type { ClosureSummary } from '../../domain/models';
import { uk } from '../../i18n';

export function CloseMonthPage() {
  const { monthId } = useParams<{ monthId: string }>();
  const navigate = useNavigate();
  const fmt = useMoneyFormat();
  const [checklist, setChecklist] = useState<CloseChecklist | null>(null);
  const [summary, setSummary] = useState<ClosureSummary | null>(null);
  const [advice, setAdvice] = useState<NextMonthAdvice[]>([]);
  const [status, setStatus] = useState<'active' | 'closed' | null>(null);

  useEffect(() => {
    if (!monthId) return;
    (async () => {
      const m = await db.monthlyBudgets.get(monthId);
      setStatus(m?.status === 'closed' ? 'closed' : 'active');
      if (m?.status === 'closed') {
        const closure = await db.monthlyClosures.where('monthId').equals(monthId).first();
        if (closure) {
          setSummary(closure.summary);
          buildAdvice(closure.summary);
        }
      } else {
        setChecklist(await preCloseChecklist(monthId));
      }
    })();
  }, [monthId]);

  async function buildAdvice(s: ClosureSummary) {
    const cats = await db.categories.toArray();
    setAdvice(
      adviceFromClosure(
        s.categories.map((l) => {
          const cat = cats.find((c) => c.id === l.categoryId);
          return {
            categoryId: l.categoryId,
            name: l.name,
            planned: l.planned,
            actual: l.actual,
            priority: cat?.priority ?? 5,
            hadTransferIn: l.coveredFrom.length > 0,
          };
        }),
      ),
    );
  }

  async function doClose() {
    if (!monthId) return;
    const s = await closeMonth(monthId);
    setSummary(s);
    setStatus('closed');
    buildAdvice(s);
  }

  async function next() {
    if (!monthId) return;
    const m = await createNextMonth(monthId);
    await updateSettings({ lastMonthKey: m.monthKey });
    navigate('/new-month');
  }

  if (!monthId) return null;

  return (
    <>
      <h1>{uk.close.title}</h1>

      {status === 'active' && checklist && (
        <>
          <div className="section-title">{uk.close.check}</div>
          <div className="card">
            <CheckLine ok={!checklist.hasUnallocated} text={checklist.hasUnallocated ? `Є нерозподілені гроші: ${fmt(checklist.unallocated)}` : 'Нерозподілених грошей немає'} />
            <CheckLine ok={checklist.negativeCategories.length === 0} text={checklist.negativeCategories.length ? `Категорії у мінусі: ${checklist.negativeCategories.join(', ')}` : 'Немає категорій у мінусі'} />
            <CheckLine ok={checklist.deficit === 0} text={checklist.deficit ? `Дефіцит бюджету: ${fmt(checklist.deficit)}` : 'Дефіциту немає'} />
          </div>
          <p className="small muted">Ви можете закрити місяць навіть за наявності зауважень — вони збережуться в підсумку.</p>
          <ConfirmButton className="btn primary block" label={uk.close.confirm} confirmText="Натисніть ще раз, щоб закрити" onConfirm={doClose} />
        </>
      )}

      {status === 'closed' && summary && (
        <>
          <div className="section-title">{uk.close.summary}</div>
          <div className="card">
            <Line label={uk.home.income} value={fmt(summary.actualIncome)} />
            <Line label={uk.home.spent} value={fmt(summary.totalExpense)} />
            <Line label="У резерви" value={fmt(summary.toReserves)} />
            <Line label="У накопичення" value={fmt(summary.toSavings)} />
            <Line label="Знято з резервів" value={fmt(summary.fromReserves)} />
            <Line label="Кінцевий вільний залишок" value={fmt(summary.finalFree)} tone="ok" />
            <Line label="Відсоток накопичень" value={`${(summary.savingsRateBps / 100).toFixed(1)}%`} />
            <Line label="Операцій / переносів" value={`${summary.transactionCount} / ${summary.transferCount}`} />
          </div>

          <div className="section-title">Аналіз категорій</div>
          <div className="card">
            {summary.categories.filter((c) => c.actual > 0 || c.planned > 0).map((c) => (
              <div key={c.categoryId} className="row" style={{ padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <span>{c.name}</span>
                <span className="small">
                  {fmt(c.actual)} / {fmt(c.planned)}
                  {c.overspend > 0 && <span style={{ color: 'var(--danger)' }}> · перевитрата {fmt(c.overspend)}</span>}
                </span>
              </div>
            ))}
          </div>

          <div className="section-title">{uk.close.advice}</div>
          <div className="card">
            {advice.length === 0 && <p className="muted small">Бюджет збалансований — суттєвих рекомендацій немає.</p>}
            {advice.map((a, i) => (
              <div key={i} className="row" style={{ padding: '6px 0' }}>
                <span aria-hidden>{a.kind === 'increase' ? '⬆️' : a.kind === 'decrease' ? '⬇️' : a.kind === 'separate' ? '🗂️' : 'ℹ️'}</span>
                <span className="small" style={{ flex: 1 }}>{a.message}</span>
              </div>
            ))}
          </div>

          <button className="btn primary block" onClick={next}>{uk.close.createNext}</button>
          <div className="mt">
            <ConfirmButton className="btn block" label={uk.close.reopen} confirmText={uk.close.reopenWarn} onConfirm={async () => { await reopenMonth(monthId); navigate('/'); }} />
          </div>
        </>
      )}
    </>
  );
}

function CheckLine({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="row" style={{ padding: '6px 0' }}>
      <span aria-hidden>{ok ? '✅' : '⚠️'}</span>
      <span className="small" style={{ flex: 1 }}>{text}</span>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'ok' | 'danger' }) {
  return (
    <div className="row" style={{ padding: '4px 0' }}>
      <span className="muted">{label}</span>
      <strong style={{ color: tone === 'ok' ? 'var(--ok)' : tone === 'danger' ? 'var(--danger)' : 'var(--text)' }}>{value}</strong>
    </div>
  );
}

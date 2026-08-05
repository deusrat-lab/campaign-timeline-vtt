import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { db, updateSettings } from '../../db/db';
import {
  addIncome,
  depositReserve,
  depositSavings,
  getOrCreateMonth,
  setMonthStatus,
  upsertPlan,
} from '../../db/repositories';
import { buildSuggestions } from '../../db/service';
import { CATEGORY_EXAMPLE_HINTS } from '../../db/seed';
import { useReserves, useSavings } from '../../hooks/useDb';
import { useMoneyFormat } from '../../hooks/useFormat';
import { parseUahInput, toMoney } from '../../domain/money';
import type { Category, Id, MonthlyBudget } from '../../domain/models';
import { PRIORITY_LABELS, type Priority } from '../../domain/models';
import type { Suggestion } from '../../domain/calculations/recommendations';
import { isoDateOf, monthKeyOf } from '../../utils/id';
import { uk } from '../../i18n';
import { CategoryForm } from '../categories/CategoryForm';

interface PlanDraft {
  categoryId: Id;
  amountRaw: string;
  disabled: boolean;
  critical: boolean;
}

export function MonthWizard() {
  const navigate = useNavigate();
  const fmt = useMoneyFormat();
  const reserves = useReserves();
  const savings = useSavings();

  const [month, setMonth] = useState<MonthlyBudget | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [suggestions, setSuggestions] = useState<Map<Id, Suggestion>>(new Map());
  const [step, setStep] = useState(1);

  // Крок 1 — доходи (частинами)
  const [incomes, setIncomes] = useState<{ name: string; amountRaw: string; date: string }[]>([
    { name: 'Зарплата', amountRaw: '', date: isoDateOf(new Date()) },
  ]);

  // Крок 2 — плани
  const [drafts, setDrafts] = useState<Record<Id, PlanDraft>>({});

  // Крок 3 — резерв/накопичення
  const [reserveRaw, setReserveRaw] = useState('');
  const [savingsRaw, setSavingsRaw] = useState('');
  const [deficitSource, setDeficitSource] = useState('');

  const [showCatForm, setShowCatForm] = useState(false);

  async function loadData(monthId: Id) {
    const cats = (await db.categories.toArray()).filter(
      (c) => c.active && !c.archived && !c.deletedAt,
    );
    cats.sort((a, b) => a.priority - b.priority || a.sortOrder - b.sortOrder);
    setCategories(cats);
    const s = await buildSuggestions(monthId);
    setSuggestions(s);
    // Зберігаємо вже введені значення; для нових категорій — порожнє поле.
    setDrafts((prev) => {
      const d: Record<Id, PlanDraft> = {};
      for (const c of cats) {
        d[c.id] =
          prev[c.id] ??
          ({
            categoryId: c.id,
            // Нульовий старт: поле порожнє. Користувач вводить або приймає сам.
            amountRaw: '',
            disabled: false,
            critical: c.priority === 1,
          } as PlanDraft);
      }
      return d;
    });
  }

  useEffect(() => {
    (async () => {
      const key = monthKeyOf(new Date());
      const m = await getOrCreateMonth(key);
      setMonth(m);
      await updateSettings({ lastMonthKey: key });
      await loadData(m.id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalIncome = incomes.reduce((a, i) => a + toMoney(parseUahInput(i.amountRaw)), 0);
  const totalPlanned = useMemo(
    () =>
      Object.values(drafts)
        .filter((d) => !d.disabled)
        .reduce((a, d) => a + toMoney(parseUahInput(d.amountRaw)), 0),
    [drafts],
  );
  const reserveAmt = toMoney(parseUahInput(reserveRaw));
  const savingsAmt = toMoney(parseUahInput(savingsRaw));
  const committed = totalPlanned + reserveAmt + savingsAmt;
  const unallocated = totalIncome - committed;
  const deficit = unallocated < 0 ? -unallocated : 0;

  if (!month) return <div className="empty"><div className="emoji">⏳</div><p>Підготовка місяця…</p></div>;

  function setDraft(id: Id, patch: Partial<PlanDraft>) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function finish() {
    if (!month) return;
    for (const inc of incomes) {
      const amt = toMoney(parseUahInput(inc.amountRaw));
      if (amt > 0) await addIncome({ monthId: month.id, amount: amt, date: inc.date, note: inc.name });
    }
    for (const c of categories) {
      const d = drafts[c.id];
      if (!d) continue;
      await upsertPlan(month.id, c.id, {
        planned: d.disabled ? 0 : toMoney(parseUahInput(d.amountRaw)),
        suggested: suggestions.get(c.id)?.amount ?? 0,
        disabled: d.disabled,
        criticalOverride: d.critical && c.priority !== 1,
      });
    }
    if (reserveAmt > 0 && reserves?.[0]) await depositReserve(month.id, reserves[0].id, reserveAmt, 'Резерв місяця');
    if (savingsAmt > 0 && savings?.[0]) await depositSavings(month.id, savings[0].id, savingsAmt, 'Внесок місяця');
    await setMonthStatus(month.id, 'active');
    navigate('/');
  }

  const sections = Array.from(new Set(categories.map((c) => c.section)));

  function goBack() {
    if (step > 1) setStep(step - 1);
    else navigate('/');
  }

  return (
    <>
      <div className="row" style={{ marginBottom: 'var(--sp-2)' }}>
        <button className="btn sm ghost" aria-label={uk.common.back} onClick={goBack} style={{ minWidth: 40, marginLeft: -8 }}>←</button>
        <h1 style={{ flex: 1, margin: '0 0 0 4px', fontSize: 20 }}>{month.title}</h1>
        <span className="badge info">Крок {step}/4</span>
      </div>

      {step === 1 && (
        <section>
          <div className="section-title">{uk.wizard.step1}</div>
          <p className="small muted">Внесіть фактично отримані гроші. Дохід може приходити частинами.</p>
          {incomes.map((inc, i) => (
            <div className="card" key={i}>
              <div className="field">
                <label>{uk.wizard.incomeName}</label>
                <input className="input" value={inc.name} onChange={(e) => updateIncome(i, { name: e.target.value })} />
              </div>
              <div className="grid-2">
                <div className="field">
                  <label>{uk.common.amount}, ₴</label>
                  <input className="input amount lg" inputMode="decimal" value={inc.amountRaw}
                    onChange={(e) => updateIncome(i, { amountRaw: e.target.value })} placeholder="0" />
                </div>
                <div className="field">
                  <label>{uk.common.date}</label>
                  <input className="input" type="date" value={inc.date}
                    onChange={(e) => updateIncome(i, { date: e.target.value })} />
                </div>
              </div>
            </div>
          ))}
          <button className="btn block" onClick={() => setIncomes([...incomes, { name: '', amountRaw: '', date: isoDateOf(new Date()) }])}>
            ＋ {uk.wizard.addIncomePart}
          </button>
          <div className="card mt"><div className="row"><span className="muted">Разом отримано</span><strong>{fmt(totalIncome)}</strong></div></div>
          <button className="btn primary block mt" disabled={totalIncome <= 0} onClick={() => setStep(2)}>{uk.common.next}</button>
        </section>
      )}

      {step === 2 && (
        <section>
          <div className="section-title">{uk.wizard.step2}</div>
          {categories.map((c) => {
            const s = suggestions.get(c.id);
            const d = drafts[c.id];
            if (!d) return null;
            return (
              <div className="card" key={c.id} style={{ opacity: d.disabled ? 0.55 : 1 }}>
                <div className="row">
                  <span style={{ fontWeight: 600 }}>{c.emoji} {c.name}</span>
                  <span className="badge neutral">{PRIORITY_LABELS[(d.critical ? 1 : c.priority) as Priority]}</span>
                </div>
                {s && (
                  <ul className="small muted" style={{ margin: '8px 0', paddingLeft: 18 }}>
                    {s.explanation.slice(0, 2).map((e, i) => <li key={i}>{e}</li>)}
                  </ul>
                )}
                <div className="row">
                  <input className="input amount" style={{ maxWidth: 160 }} inputMode="decimal"
                    value={d.amountRaw} disabled={d.disabled}
                    placeholder={placeholderFor(c.name, s)}
                    onChange={(e) => setDraft(c.id, { amountRaw: e.target.value })} />
                  <div className="chip-row">
                    {/* «Прийняти» лише коли є реальна історія закритих місяців. */}
                    {s && s.hasHistory && s.amount > 0 && !d.disabled && (
                      <button className="chip" onClick={() => setDraft(c.id, { amountRaw: String(s.amount / 100) })}>
                        {uk.wizard.accept} {fmt(s.amount)}
                      </button>
                    )}
                    <button className={`chip ${d.disabled ? 'selected' : ''}`} onClick={() => setDraft(c.id, { disabled: !d.disabled })}>
                      {uk.wizard.disable}
                    </button>
                    {c.priority !== 1 && (
                      <button className={`chip ${d.critical ? 'selected' : ''}`} onClick={() => setDraft(c.id, { critical: !d.critical })}>
                        {uk.wizard.critical}
                      </button>
                    )}
                  </div>
                </div>
                {s?.reserveTopUp ? (
                  <p className="small" style={{ color: 'var(--info)', margin: '8px 0 0' }}>
                    💡 Порада: окреме поповнення цільового резерву {fmt(s.reserveTopUp)}.
                  </p>
                ) : null}
              </div>
            );
          })}
          <button className="btn block" onClick={() => setShowCatForm(true)}>＋ Додати категорію</button>
          <div className="card mt"><div className="row"><span className="muted">Заплановано</span><strong>{fmt(totalPlanned)}</strong></div></div>
          <NavRow onBack={() => setStep(1)} onNext={() => setStep(3)} />
        </section>
      )}

      {step === 3 && (
        <section>
          <div className="section-title">{uk.wizard.step3}</div>
          <p className="small muted">Резерв місяця та довгострокові накопичення — це окремі гроші, а не витрати.</p>
          <div className="card">
            <div className="field">
              <label>{uk.home.reserve} ({reserves?.[0]?.name ?? '—'})</label>
              <input className="input amount lg" inputMode="decimal" value={reserveRaw} onChange={(e) => setReserveRaw(e.target.value)} placeholder="0" />
            </div>
            <div className="field">
              <label>Накопичення ({savings?.[0]?.name ?? '—'})</label>
              <input className="input amount lg" inputMode="decimal" value={savingsRaw} onChange={(e) => setSavingsRaw(e.target.value)} placeholder="0" />
            </div>
          </div>
          <NavRow onBack={() => setStep(2)} onNext={() => setStep(4)} />
        </section>
      )}

      {step === 4 && (
        <section>
          <div className="section-title">{uk.wizard.step5}</div>
          <div className="card">
            <Line label={uk.home.income} value={fmt(totalIncome)} />
            <Line label="Плани категорій" value={fmt(totalPlanned)} />
            <Line label={uk.home.reserve} value={fmt(reserveAmt)} />
            <Line label="Накопичення" value={fmt(savingsAmt)} />
            <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '10px 0' }} />
            <Line
              label={unallocated < 0 ? uk.home.deficit : uk.home.unallocated}
              value={fmt(Math.abs(unallocated))}
              tone={unallocated < 0 ? 'danger' : 'ok'}
            />
          </div>

          {deficit > 0 && (
            <div className="card" style={{ background: 'var(--danger-bg)' }}>
              <p className="small" style={{ margin: '0 0 8px', color: 'var(--danger)' }}>❗ {uk.wizard.deficitWarning}</p>
              <input className="input" placeholder="Джерело покриття дефіциту" value={deficitSource} onChange={(e) => setDeficitSource(e.target.value)} />
            </div>
          )}

          <div className="row mt">
            <button className="btn" onClick={() => setStep(3)}>{uk.common.back}</button>
            <button
              className="btn primary"
              style={{ flex: 1, marginLeft: 8 }}
              disabled={totalIncome <= 0 || (deficit > 0 && !deficitSource.trim())}
              onClick={finish}
            >
              {uk.wizard.confirmBudget}
            </button>
          </div>
        </section>
      )}

      {showCatForm && month && (
        <CategoryForm
          category={null}
          sections={sections}
          onClose={() => setShowCatForm(false)}
          onSaved={async () => {
            setShowCatForm(false);
            await loadData(month.id);
          }}
        />
      )}
    </>
  );

  function updateIncome(i: number, patch: Partial<{ name: string; amountRaw: string; date: string }>) {
    setIncomes((prev) => prev.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  }
}

/**
 * Placeholder для поля плану. Показує приклад (з історії, якщо є; інакше —
 * необов'язкову підказку зі стартового шаблону). НЕ підставляється у значення.
 */
function placeholderFor(name: string, s?: Suggestion): string {
  if (s?.hasHistory && s.amount > 0) return `Напр., ${Math.round(s.amount / 100)}`;
  const hint = CATEGORY_EXAMPLE_HINTS[name];
  return hint ? `Напр., ${hint}` : '0';
}

function NavRow({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  return (
    <div className="row mt">
      <button className="btn" onClick={onBack}>{uk.common.back}</button>
      <button className="btn primary" style={{ flex: 1, marginLeft: 8 }} onClick={onNext}>{uk.common.next}</button>
    </div>
  );
}

function Line({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'ok' }) {
  return (
    <div className="row" style={{ padding: '4px 0' }}>
      <span className="muted">{label}</span>
      <strong style={{ color: tone === 'danger' ? 'var(--danger)' : tone === 'ok' ? 'var(--ok)' : 'var(--text)' }}>{value}</strong>
    </div>
  );
}

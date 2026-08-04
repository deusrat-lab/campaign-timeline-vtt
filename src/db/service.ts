/** Сервісний шар: агрегації для екранів та складні сценарії (закриття місяця). */
import { db, logAudit } from './db';
import type {
  Category,
  ClosureCategoryLine,
  ClosureSummary,
  Id,
  MonthlyBudget,
  MonthlyCategoryPlan,
  Transaction,
  Transfer,
} from '../domain/models';
import {
  computeCategoryState,
  computeMonthTotals,
  savingsRateBps,
  type CategoryState,
  type MonthTotals,
} from '../domain/calculations/balances';
import {
  suggestForCategory,
  type CategoryHistoryPoint,
  type Suggestion,
} from '../domain/calculations/recommendations';
import { addMoney, subMoney } from '../domain/money';
import { getOrCreateMonth, setMonthStatus, upsertPlan } from './repositories';
import { monthTitleUk, nextMonthKey, nowIso } from '../utils/id';

export interface MonthView {
  month: MonthlyBudget;
  plans: MonthlyCategoryPlan[];
  categories: Category[];
  transactions: Transaction[];
  transfers: Transfer[];
  totals: MonthTotals;
  stateByCategory: Map<Id, CategoryState>;
}

export async function loadMonthView(monthId: Id): Promise<MonthView> {
  const month = await db.monthlyBudgets.get(monthId);
  if (!month) throw new Error('Місяць не знайдено');
  const plans = await db.monthlyCategoryPlans.where('monthId').equals(monthId).toArray();
  const categories = await db.categories.toArray();
  const transactions = (await db.transactions.where('monthId').equals(monthId).toArray()).filter(
    (t) => !t.deletedAt,
  );
  const transfers = await db.transfers.where('monthId').equals(monthId).toArray();

  const totals = computeMonthTotals(month, plans, transactions);
  const stateByCategory = new Map<Id, CategoryState>();
  for (const plan of plans) {
    stateByCategory.set(plan.categoryId, computeCategoryState(plan, transactions, transfers));
  }
  return { month, plans, categories, transactions, transfers, totals, stateByCategory };
}

/** Історія фактів категорії за останні закриті місяці (від найновішого). */
export async function categoryHistory(
  categoryId: Id,
  excludeMonthId: Id,
  limit = 6,
): Promise<CategoryHistoryPoint[]> {
  const closed = (await db.monthlyBudgets.where('status').equals('closed').toArray())
    .filter((m) => m.id !== excludeMonthId)
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .slice(0, limit);

  const points: CategoryHistoryPoint[] = [];
  for (const m of closed) {
    const plan = await db.monthlyCategoryPlans
      .where('[monthId+categoryId]')
      .equals([m.id, categoryId])
      .first();
    const txs = (await db.transactions.where('monthId').equals(m.id).toArray()).filter(
      (t) => !t.deletedAt && t.categoryId === categoryId,
    );
    const actual = txs.reduce((a, t) => {
      if (t.type === 'expense' || t.type === 'correction') return addMoney(a, t.amount);
      if (t.type === 'refund') return subMoney(a, t.amount);
      return a;
    }, 0);
    const transfersIn = await db.transfers
      .where('monthId')
      .equals(m.id)
      .filter((tr) => tr.destinationCategoryId === categoryId)
      .count();
    points.push({
      monthKey: m.monthKey,
      planned: plan?.planned ?? 0,
      actual,
      hadTransferIn: transfersIn > 0,
    });
  }
  return points;
}

/** Побудувати пропозиції для всіх активних категорій нового місяця. */
export async function buildSuggestions(
  monthId: Id,
): Promise<Map<Id, Suggestion>> {
  const cats = (await db.categories.toArray()).filter(
    (c) => c.active && !c.archived && !c.deletedAt,
  );
  const result = new Map<Id, Suggestion>();
  for (const cat of cats) {
    const history = await categoryHistory(cat.id, monthId);
    result.set(cat.id, suggestForCategory({ category: cat, history }));
  }
  return result;
}

// ---- Закриття місяця ---------------------------------------------------

export interface CloseChecklist {
  hasUnallocated: boolean;
  unallocated: number;
  negativeCategories: string[];
  deficit: number;
}

export async function preCloseChecklist(monthId: Id): Promise<CloseChecklist> {
  const view = await loadMonthView(monthId);
  const negativeCategories: string[] = [];
  for (const [catId, st] of view.stateByCategory) {
    if (st.available < 0) {
      const cat = view.categories.find((c) => c.id === catId);
      if (cat) negativeCategories.push(cat.name);
    }
  }
  return {
    hasUnallocated: view.totals.unallocated > 0,
    unallocated: view.totals.unallocated,
    negativeCategories,
    deficit: view.totals.deficit,
  };
}

export async function closeMonth(monthId: Id): Promise<ClosureSummary> {
  const view = await loadMonthView(monthId);
  const { totals } = view;

  const categories: ClosureCategoryLine[] = view.plans.map((plan) => {
    const cat = view.categories.find((c) => c.id === plan.categoryId);
    const st = view.stateByCategory.get(plan.categoryId)!;
    const planned = addMoney(plan.planned, plan.rolloverIn);
    const deviation = subMoney(st.actual, planned);
    const overspend = st.actual > st.planned + st.transfersIn ? deviation : 0;
    const coveredFrom = view.transfers
      .filter((t) => t.destinationCategoryId === plan.categoryId)
      .map((t) => sourceLabel(t, view.categories));
    return {
      categoryId: plan.categoryId,
      name: cat?.name ?? '—',
      planned,
      actual: st.actual,
      deviation,
      overspend: overspend > 0 ? overspend : 0,
      coveredFrom,
    };
  });

  const summary: ClosureSummary = {
    actualIncome: totals.actualIncome,
    totalExpense: totals.totalExpense,
    toReserves: totals.toReserves,
    toSavings: totals.toSavings,
    fromReserves: totals.fromReserves,
    finalFree: totals.actualCashBalance,
    savingsRateBps: savingsRateBps(totals.toSavings, totals.actualIncome),
    transactionCount: view.transactions.length,
    transferCount: view.transfers.length,
    categories,
  };

  const now = nowIso();
  await db.monthlyClosures.put({
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    monthId,
    closedAt: now,
    summary,
  });
  await setMonthStatus(monthId, 'closed');
  await logAudit('monthlyBudget', monthId, 'close');
  return summary;
}

function sourceLabel(t: Transfer, cats: Category[]): string {
  if (t.sourceType === 'unallocated') return 'Нерозподілені';
  if (t.sourceType === 'category') return cats.find((c) => c.id === t.sourceCategoryId)?.name ?? 'Категорія';
  if (t.sourceType === 'reserve') return 'Резерв';
  if (t.sourceType === 'savings') return 'Накопичення';
  return '—';
}

/** Створити наступний місяць у статусі draft, підтягнувши перенос залишків. */
export async function createNextMonth(fromMonthId: Id): Promise<MonthlyBudget> {
  const from = await db.monthlyBudgets.get(fromMonthId);
  const key = from ? nextMonthKey(from.monthKey) : monthTitleUk('');
  const next = await getOrCreateMonth(key);

  // Підтягнути suggested суми як стартові плани.
  const suggestions = await buildSuggestions(next.id);
  for (const [categoryId, s] of suggestions) {
    await upsertPlan(next.id, categoryId, { suggested: s.amount, planned: 0 });
  }
  return next;
}

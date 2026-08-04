/**
 * Репозиторії: єдина точка запису у БД для бізнес-операцій.
 * UI не звертається до Dexie напряму для мутацій — лише через ці функції,
 * що гарантує коректність журналу операцій та відсутність подвійного обліку.
 */
import { db, logAudit } from './db';
import type {
  Category,
  Id,
  MonthStatus,
  MonthlyBudget,
  MonthlyCategoryPlan,
  PaymentMethod,
  Reserve,
  SavingsGoal,
  Transaction,
  Transfer,
} from '../domain/models';
import { isoDateOf, monthKeyOf, monthTitleUk, newId, nowIso } from '../utils/id';
import type { Money } from '../domain/money';
import { computeCategoryState } from '../domain/calculations/balances';

const ts = () => nowIso();

// ---- Місяці ------------------------------------------------------------

export async function getOrCreateMonth(monthKey: string): Promise<MonthlyBudget> {
  const existing = await db.monthlyBudgets.where('monthKey').equals(monthKey).first();
  if (existing) return existing;
  const now = ts();
  const month: MonthlyBudget = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    monthKey,
    title: monthTitleUk(monthKey),
    status: 'draft',
    expectedIncome: 0,
    openedAt: null,
    closedAt: null,
    reopenCount: 0,
  };
  await db.monthlyBudgets.add(month);
  await logAudit('monthlyBudget', month.id, 'create', monthKey);
  return month;
}

export async function setMonthStatus(monthId: Id, status: MonthStatus): Promise<void> {
  const patch: Partial<MonthlyBudget> = { status, updatedAt: ts() };
  if (status === 'active') patch.openedAt = ts();
  if (status === 'closed') patch.closedAt = ts();
  await db.monthlyBudgets.update(monthId, patch);
  await logAudit('monthlyBudget', monthId, status === 'closed' ? 'close' : 'update', status);
}

export async function reopenMonth(monthId: Id): Promise<void> {
  const m = await db.monthlyBudgets.get(monthId);
  if (!m) return;
  await db.monthlyBudgets.update(monthId, {
    status: 'active',
    closedAt: null,
    reopenCount: m.reopenCount + 1,
    updatedAt: ts(),
  });
  await db.monthlyClosures.where('monthId').equals(monthId).delete();
  await logAudit('monthlyBudget', monthId, 'reopen', `reopenCount=${m.reopenCount + 1}`);
}

// ---- Плани категорій ---------------------------------------------------

export async function upsertPlan(
  monthId: Id,
  categoryId: Id,
  patch: Partial<MonthlyCategoryPlan>,
): Promise<MonthlyCategoryPlan> {
  const existing = await db.monthlyCategoryPlans
    .where('[monthId+categoryId]')
    .equals([monthId, categoryId])
    .first();
  const now = ts();
  if (existing) {
    const updated = { ...existing, ...patch, updatedAt: now };
    await db.monthlyCategoryPlans.put(updated);
    return updated;
  }
  const plan: MonthlyCategoryPlan = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    monthId,
    categoryId,
    planned: 0,
    suggested: 0,
    priorityOverride: null,
    criticalOverride: false,
    disabled: false,
    rolloverIn: 0,
    ...patch,
  };
  await db.monthlyCategoryPlans.add(plan);
  return plan;
}

// ---- Операції ----------------------------------------------------------

interface AddExpenseInput {
  monthId: Id;
  categoryId: Id;
  amount: Money;
  date?: string;
  note?: string;
  paymentMethod?: PaymentMethod;
}

export async function addExpense(input: AddExpenseInput): Promise<Transaction> {
  return addTransaction({
    monthId: input.monthId,
    type: 'expense',
    amount: input.amount,
    date: input.date ?? isoDateOf(new Date()),
    categoryId: input.categoryId,
    note: input.note,
    paymentMethod: input.paymentMethod ?? null,
  });
}

interface AddIncomeInput {
  monthId: Id;
  amount: Money;
  date?: string;
  note?: string;
}

export async function addIncome(input: AddIncomeInput): Promise<Transaction> {
  return addTransaction({
    monthId: input.monthId,
    type: 'income',
    amount: input.amount,
    date: input.date ?? isoDateOf(new Date()),
    note: input.note,
  });
}

export async function addRefund(input: {
  monthId: Id;
  categoryId: Id;
  amount: Money;
  date?: string;
  note?: string;
  relatedTransactionId?: Id;
}): Promise<Transaction> {
  return addTransaction({
    monthId: input.monthId,
    type: 'refund',
    amount: input.amount,
    date: input.date ?? isoDateOf(new Date()),
    categoryId: input.categoryId,
    note: input.note,
    relatedTransactionId: input.relatedTransactionId ?? null,
  });
}

export async function addTransaction(
  data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt'>,
): Promise<Transaction> {
  const now = ts();
  const tx: Transaction = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...data,
  };
  await db.transactions.add(tx);
  await logAudit('transaction', tx.id, 'create', tx.type);
  return tx;
}

export async function softDeleteTransaction(id: Id): Promise<void> {
  await db.transactions.update(id, { deletedAt: ts(), updatedAt: ts() });
  await logAudit('transaction', id, 'delete');
}

// ---- Переноси між категоріями та джерелами -----------------------------

export type TransferSource =
  | { type: 'unallocated' }
  | { type: 'category'; categoryId: Id }
  | { type: 'reserve'; reserveId: Id }
  | { type: 'savings'; savingsGoalId: Id };

interface DoTransferInput {
  monthId: Id;
  amount: Money;
  destinationCategoryId: Id;
  source: TransferSource;
  reason?: string;
  date?: string;
}

/**
 * Виконати перенос коштів у категорію призначення з обраного джерела.
 * Створює запис Transfer (з залишками до/після) і, за потреби, пов'язану
 * операцію зняття з резерву/накопичень. Перенос між бюджетними категоріями
 * НЕ створює нову витрату та не змінює загальний грошовий залишок.
 */
export async function doTransfer(input: DoTransferInput): Promise<Transfer> {
  const now = ts();
  const date = input.date ?? isoDateOf(new Date());
  const { source } = input;

  let sourceBalanceBefore = 0;
  let sourceBalanceAfter = 0;
  let transactionId: Id | null = null;
  const transferBase: Partial<Transfer> = {
    sourceType: source.type,
  };

  if (source.type === 'category') {
    const state = await categoryBalance(input.monthId, source.categoryId);
    sourceBalanceBefore = state;
    sourceBalanceAfter = state - input.amount;
    transferBase.sourceCategoryId = source.categoryId;
  } else if (source.type === 'reserve') {
    const r = await db.reserves.get(source.reserveId);
    sourceBalanceBefore = r?.balance ?? 0;
    sourceBalanceAfter = sourceBalanceBefore - input.amount;
    await db.reserves.update(source.reserveId, { balance: sourceBalanceAfter, updatedAt: now });
    const tx = await addTransaction({
      monthId: input.monthId,
      type: 'reserve_withdrawal',
      amount: input.amount,
      date,
      reserveId: source.reserveId,
      destinationCategoryId: input.destinationCategoryId,
      note: input.reason,
    });
    transactionId = tx.id;
    transferBase.sourceReserveId = source.reserveId;
  } else if (source.type === 'savings') {
    const g = await db.savingsGoals.get(source.savingsGoalId);
    sourceBalanceBefore = g?.currentAmount ?? 0;
    sourceBalanceAfter = sourceBalanceBefore - input.amount;
    await db.savingsGoals.update(source.savingsGoalId, {
      currentAmount: sourceBalanceAfter,
      updatedAt: now,
    });
    const tx = await addTransaction({
      monthId: input.monthId,
      type: 'savings_withdrawal',
      amount: input.amount,
      date,
      savingsGoalId: source.savingsGoalId,
      destinationCategoryId: input.destinationCategoryId,
      note: input.reason,
    });
    transactionId = tx.id;
    transferBase.sourceSavingsGoalId = source.savingsGoalId;
  }

  const transfer: Transfer = {
    id: newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    monthId: input.monthId,
    amount: input.amount,
    date,
    sourceType: source.type,
    destinationCategoryId: input.destinationCategoryId,
    reason: input.reason,
    initiator: 'user',
    sourceBalanceBefore,
    sourceBalanceAfter,
    transactionId,
    ...transferBase,
  };
  await db.transfers.add(transfer);
  await logAudit('transfer', transfer.id, 'create', `${source.type}->category`);
  return transfer;
}

async function categoryBalance(monthId: Id, categoryId: Id): Promise<Money> {
  const plan = await db.monthlyCategoryPlans
    .where('[monthId+categoryId]')
    .equals([monthId, categoryId])
    .first();
  if (!plan) return 0;
  const txs = (await db.transactions.where('monthId').equals(monthId).toArray()).filter(
    (t) => !t.deletedAt,
  );
  const transfers = await db.transfers.where('monthId').equals(monthId).toArray();
  return computeCategoryState(plan, txs, transfers).available;
}

// ---- Резерви та накопичення -------------------------------------------

export async function depositReserve(
  monthId: Id,
  reserveId: Id,
  amount: Money,
  note?: string,
): Promise<void> {
  const r = await db.reserves.get(reserveId);
  if (!r) return;
  await db.reserves.update(reserveId, { balance: r.balance + amount, updatedAt: ts() });
  await addTransaction({ monthId, type: 'reserve_deposit', amount, date: isoDateOf(new Date()), reserveId, note });
}

export async function depositSavings(
  monthId: Id,
  savingsGoalId: Id,
  amount: Money,
  note?: string,
): Promise<void> {
  const g = await db.savingsGoals.get(savingsGoalId);
  if (!g) return;
  const current = g.currentAmount + amount;
  await db.savingsGoals.update(savingsGoalId, {
    currentAmount: current,
    status: current >= g.targetAmount && g.targetAmount > 0 ? 'reached' : g.status,
    updatedAt: ts(),
  });
  await addTransaction({ monthId, type: 'savings_deposit', amount, date: isoDateOf(new Date()), savingsGoalId, note });
}

// ---- Категорії ---------------------------------------------------------

export async function saveCategory(cat: Partial<Category> & { id?: Id }): Promise<Category> {
  const now = ts();
  if (cat.id) {
    const existing = await db.categories.get(cat.id);
    if (existing) {
      const updated = { ...existing, ...cat, updatedAt: now } as Category;
      await db.categories.put(updated);
      return updated;
    }
  }
  const created: Category = {
    id: cat.id ?? newId(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    name: cat.name ?? 'Нова категорія',
    emoji: cat.emoji ?? '📦',
    section: cat.section ?? 'Інше',
    priority: cat.priority ?? 5,
    kind: cat.kind ?? 'spending',
    minAmount: cat.minAmount ?? 0,
    desiredAmount: cat.desiredAmount ?? 0,
    regular: cat.regular ?? false,
    rollover: cat.rollover ?? false,
    usableAsSource: cat.usableAsSource ?? (cat.priority ?? 5) !== 1,
    active: cat.active ?? true,
    archived: cat.archived ?? false,
    favorite: cat.favorite ?? false,
    sortOrder: cat.sortOrder ?? 999,
    notes: cat.notes ?? '',
  };
  await db.categories.put(created);
  await logAudit('category', created.id, 'create');
  return created;
}

/** Чи використовується категорія (плани, операції, переноси, рекомендації). */
export async function isCategoryInUse(id: Id): Promise<boolean> {
  const [plans, txs, transfersTo, transfersFrom, recs] = await Promise.all([
    db.monthlyCategoryPlans.where('categoryId').equals(id).count(),
    db.transactions.where('categoryId').equals(id).count(),
    db.transfers.where('destinationCategoryId').equals(id).count(),
    db.transfers.filter((t) => t.sourceCategoryId === id).count(),
    db.recommendations.where('categoryId').equals(id).count(),
  ]);
  return plans + txs + transfersTo + transfersFrom + recs > 0;
}

export async function setCategoryActive(id: Id, active: boolean): Promise<void> {
  await db.categories.update(id, { active, updatedAt: ts() });
  await logAudit('category', id, 'update', active ? 'activate' : 'deactivate');
}

export async function archiveCategory(id: Id): Promise<void> {
  await db.categories.update(id, { archived: true, active: false, updatedAt: ts() });
  await logAudit('category', id, 'update', 'archive');
}

export async function restoreCategory(id: Id): Promise<void> {
  await db.categories.update(id, { archived: false, active: true, updatedAt: ts() });
  await logAudit('category', id, 'update', 'restore');
}

/**
 * Безпечне видалення. Якщо категорія використовується в історії — архівує
 * (не видаляє фізично), щоб не зламати закриті місяці й звіти.
 * Повертає, що фактично сталося.
 */
export async function deleteCategorySafe(id: Id): Promise<'deleted' | 'archived'> {
  if (await isCategoryInUse(id)) {
    await archiveCategory(id);
    return 'archived';
  }
  await db.categories.delete(id);
  await logAudit('category', id, 'delete', 'hard');
  return 'deleted';
}

export async function duplicateCategory(id: Id): Promise<Category | null> {
  const src = await db.categories.get(id);
  if (!src) return null;
  const now = ts();
  const copy: Category = {
    ...src,
    id: newId(),
    name: `${src.name} (копія)`,
    archived: false,
    active: true,
    sortOrder: src.sortOrder + 1,
    createdAt: now,
    updatedAt: now,
  };
  await db.categories.put(copy);
  await logAudit('category', copy.id, 'create', 'duplicate');
  return copy;
}

/** Пересунути категорію в межах свого пріоритету (обмін sortOrder із сусідом). */
export async function moveCategory(id: Id, dir: 'up' | 'down'): Promise<void> {
  const all = (await db.categories.toArray()).filter((c) => !c.archived);
  const cat = all.find((c) => c.id === id);
  if (!cat) return;
  const siblings = all
    .filter((c) => c.priority === cat.priority)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const idx = siblings.findIndex((c) => c.id === id);
  const swapWith = dir === 'up' ? siblings[idx - 1] : siblings[idx + 1];
  if (!swapWith) return;
  const now = ts();
  await db.categories.update(cat.id, { sortOrder: swapWith.sortOrder, updatedAt: now });
  await db.categories.update(swapWith.id, { sortOrder: cat.sortOrder, updatedAt: now });
}

/** Перейменувати розділ у всіх категоріях (розділи — це рядки на категоріях). */
export async function renameSection(oldName: string, newName: string): Promise<void> {
  const trimmed = newName.trim();
  if (!trimmed || trimmed === oldName) return;
  const cats = await db.categories.where('section').equals(oldName).toArray();
  const now = ts();
  await Promise.all(
    cats.map((c) => db.categories.update(c.id, { section: trimmed, updatedAt: now })),
  );
}

export const helperCurrentMonthKey = () => monthKeyOf(new Date());
export type { Reserve, SavingsGoal };

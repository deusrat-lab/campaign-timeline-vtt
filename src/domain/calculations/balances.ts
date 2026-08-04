/**
 * Чисті функції фінансових розрахунків. Жодного стану, жодного IndexedDB.
 * Уся арифметика — у цілих копійках. Гроші не рахуються двічі:
 *  - переказ між категоріями НЕ є новою витратою і не змінює загальний
 *    грошовий залишок;
 *  - переказ у накопичення змінює доступність, але не є споживчою витратою.
 */
import type {
  Id,
  MonthlyBudget,
  MonthlyCategoryPlan,
  Transaction,
  Transfer,
  Priority,
} from '../models';
import { addMoney, subMoney, type Money } from '../money';

export interface CategoryState {
  categoryId: Id;
  planned: Money; // план + перенесений залишок
  transfersIn: Money;
  transfersOut: Money;
  actual: Money; // фактичні витрати (витрати - повернення)
  available: Money; // скільки залишилось витратити
  usedRatioBps: number; // використано, у базисних пунктах (10000 = 100%)
  status: CategoryStatus;
  effectivePriority: Priority;
  disabled: boolean;
}

export type CategoryStatus =
  | 'idle' // не використовувалась
  | 'ok' // в нормі
  | 'fast' // витрачається швидше плану
  | 'near' // близько до ліміту
  | 'reached' // ліміт вичерпано
  | 'over'; // перевитрата

export interface MonthTotals {
  actualIncome: Money;
  totalExpense: Money;
  toReserves: Money; // фактичні поповнення резервів
  fromReserves: Money; // фактичні зняття з резервів
  toSavings: Money; // фактичні поповнення накопичень
  fromSavings: Money;
  confirmedPlans: Money; // сума підтверджених планів активних категорій
  unallocated: Money; // нерозподілені гроші
  actualCashBalance: Money; // фактичний грошовий залишок
  availableToSpend: Money; // доступно на нові витрати категорій
  deficit: Money; // >0 якщо план перевищує дохід
}

function sumBy(txs: Transaction[], pred: (t: Transaction) => boolean): Money {
  return txs.reduce((acc, t) => (pred(t) ? addMoney(acc, t.amount) : acc), 0);
}

/** Фактичні витрати категорії: expense та correction (+) мінус refund. */
export function categoryActual(categoryId: Id, txs: Transaction[]): Money {
  let total = 0;
  for (const t of txs) {
    if (t.categoryId !== categoryId) continue;
    if (t.type === 'expense') total = addMoney(total, t.amount);
    else if (t.type === 'refund') total = subMoney(total, t.amount);
    else if (t.type === 'correction') total = addMoney(total, t.amount);
  }
  return total;
}

export function computeCategoryState(
  plan: MonthlyCategoryPlan,
  txs: Transaction[],
  transfers: Transfer[],
): CategoryState {
  const transfersIn = transfers
    .filter((tr) => tr.destinationCategoryId === plan.categoryId)
    .reduce((a, tr) => addMoney(a, tr.amount), 0);
  const transfersOut = transfers
    .filter((tr) => tr.sourceType === 'category' && tr.sourceCategoryId === plan.categoryId)
    .reduce((a, tr) => addMoney(a, tr.amount), 0);

  const planned = addMoney(plan.planned, plan.rolloverIn);
  const actual = categoryActual(plan.categoryId, txs);
  const limit = subMoney(addMoney(planned, transfersIn), transfersOut);
  const available = subMoney(limit, actual);

  const usedRatioBps = limit > 0 ? Math.round((actual / limit) * 10000) : actual > 0 ? 10001 : 0;
  const status = deriveStatus(actual, limit, usedRatioBps);
  const effectivePriority = (plan.criticalOverride ? 1 : plan.priorityOverride) ?? undefined;

  return {
    categoryId: plan.categoryId,
    planned,
    transfersIn,
    transfersOut,
    actual,
    available,
    usedRatioBps,
    status,
    effectivePriority: (effectivePriority as Priority) ?? (0 as Priority),
    disabled: plan.disabled,
  };
}

function deriveStatus(actual: Money, limit: Money, usedBps: number): CategoryStatus {
  if (actual === 0) return 'idle';
  if (limit <= 0) return 'over';
  if (usedBps > 10000) return 'over';
  if (usedBps === 10000) return 'reached';
  if (usedBps >= 8500) return 'near';
  if (usedBps >= 6000) return 'fast';
  return 'ok';
}

/**
 * Прогноз використання до кінця місяця на основі середньоденної витрати.
 */
export function forecastEndOfMonth(
  actual: Money,
  dayOfMonth: number,
  daysInMonth: number,
): Money {
  if (dayOfMonth <= 0) return actual;
  const perDay = actual / dayOfMonth;
  return Math.round(perDay * daysInMonth);
}

/** Допустима витрата в день на залишок місяця. */
export function allowedPerDay(available: Money, daysLeft: number): Money {
  if (daysLeft <= 0) return available;
  return Math.round(available / daysLeft);
}

export function computeMonthTotals(
  _budget: MonthlyBudget,
  plans: MonthlyCategoryPlan[],
  txs: Transaction[],
): MonthTotals {
  const actualIncome = sumBy(txs, (t) => t.type === 'income');
  const refunds = sumBy(txs, (t) => t.type === 'refund');
  const grossExpense = sumBy(txs, (t) => t.type === 'expense');
  const corrections = sumBy(txs, (t) => t.type === 'correction');
  const totalExpense = subMoney(addMoney(grossExpense, corrections), refunds);

  const toReserves = sumBy(txs, (t) => t.type === 'reserve_deposit');
  const fromReserves = sumBy(txs, (t) => t.type === 'reserve_withdrawal');
  const toSavings = sumBy(txs, (t) => t.type === 'savings_deposit');
  const fromSavings = sumBy(txs, (t) => t.type === 'savings_withdrawal');

  const confirmedPlans = plans
    .filter((p) => !p.disabled)
    .reduce((a, p) => addMoney(a, p.planned), 0);

  // Нерозподілено = дохід − підтверджені плани − поповнення резервів − поповнення накопичень.
  const unallocated = subMoney(
    subMoney(subMoney(actualIncome, confirmedPlans), toReserves),
    toSavings,
  );

  // Фактичний грошовий залишок = дохід − витрати − чисті поповнення накопичень − чисті поповнення резервів.
  const netToSavings = subMoney(toSavings, fromSavings);
  const netToReserves = subMoney(toReserves, fromReserves);
  const actualCashBalance = subMoney(
    subMoney(subMoney(actualIncome, totalExpense), netToSavings),
    netToReserves,
  );

  // Доступно на нові витрати = залишок нерозподілених + сумарний залишок планів категорій.
  const plansRemaining = plans
    .filter((p) => !p.disabled)
    .reduce((a, p) => {
      const spent = categoryActual(p.categoryId, txs);
      return addMoney(a, subMoney(addMoney(p.planned, p.rolloverIn), spent));
    }, 0);
  const availableToSpend = addMoney(unallocated < 0 ? 0 : unallocated, plansRemaining);

  const deficit = unallocated < 0 ? -unallocated : 0;

  return {
    actualIncome,
    totalExpense,
    toReserves,
    fromReserves,
    toSavings,
    fromSavings,
    confirmedPlans,
    unallocated,
    actualCashBalance,
    availableToSpend,
    deficit,
  };
}

/** Відсоток накопичень від доходу, у базисних пунктах (100 = 1%). */
export function savingsRateBps(toSavings: Money, actualIncome: Money): number {
  if (actualIncome <= 0) return 0;
  return Math.round((toSavings / actualIncome) * 10000);
}

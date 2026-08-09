/**
 * Тижневий бюджет — проєкція, а не друга база: рахується детерміновано з
 * місяця, планів і операцій. Тиждень = понеділок–неділя, обрізаний межами
 * місяця (перший/останній тиждень можуть бути частковими).
 */
import type { Transaction } from '../models';
import { addMoney, subMoney, type Money } from '../money';
import type { MonthTotals } from './balances';

export interface WeekBounds {
  /** ISO 'YYYY-MM-DD', включно. */
  start: string;
  end: string;
}

function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + n);
  return copy;
}

/** Понеділок тижня, що містить `date` (ISO 8601: неділя = 0 → зсув на -6). */
function mondayOf(date: Date): Date {
  const day = date.getDay(); // 0=Нд..6=Сб
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return addDays(startOfDay(date), diffToMonday);
}

/**
 * Межі поточного календарного тижня, обрізані початком/кінцем місяця.
 * `today`, `monthStart`, `monthEnd` — включно.
 */
export function currentWeekBounds(today: Date, monthStart: Date, monthEnd: Date): WeekBounds {
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const clampedStart = monday < startOfDay(monthStart) ? startOfDay(monthStart) : monday;
  const clampedEnd = sunday > startOfDay(monthEnd) ? startOfDay(monthEnd) : sunday;
  return { start: toIsoDate(clampedStart), end: toIsoDate(clampedEnd) };
}

export interface WeeklyBudget {
  week: WeekBounds;
  spentThisWeek: Money;
  safeWeeklyBudget: Money;
  remainingThisWeek: Money;
  daysLeftInWeek: number;
  daysLeftInMonth: number;
  remainingSpendableMonth: Money;
}

/**
 * Безпечний тижневий бюджет: НЕ ділить місячний бюджет на 4. Базується на
 * тому, скільки реально лишилось витратити цього місяця (availableToSpend —
 * вже враховує нерозподілене й залишки планів категорій, а не сирий
 * actualCashBalance, який включає гроші, зарезервовані на резерви/накопичення),
 * і пропорційно розподіляє це на дні, що лишились у поточному тижні.
 */
export function computeWeeklyBudget(
  totals: MonthTotals,
  txs: Transaction[],
  today: Date,
  monthStart: Date,
  monthEnd: Date,
): WeeklyBudget {
  const week = currentWeekBounds(today, monthStart, monthEnd);
  const todayIso = toIsoDate(startOfDay(today));

  const spentThisWeek = txs.reduce((acc, t) => {
    if (t.type !== 'expense' && t.type !== 'correction' && t.type !== 'refund') return acc;
    if (t.date < week.start || t.date > week.end) return acc;
    if (t.type === 'refund') return subMoney(acc, t.amount);
    return addMoney(acc, t.amount);
  }, 0);

  const todayClamped = todayIso < week.start ? week.start : todayIso > week.end ? week.end : todayIso;
  const daysLeftInWeek = dayDiff(todayClamped, week.end) + 1;

  const monthEndIso = toIsoDate(startOfDay(monthEnd));
  const todayInMonth = todayIso > monthEndIso ? monthEndIso : todayIso;
  const daysLeftInMonth = Math.max(1, dayDiff(todayInMonth, monthEndIso) + 1);

  const remainingSpendableMonth = totals.availableToSpend < 0 ? 0 : totals.availableToSpend;
  const daysLeftInWeekClamped = Math.min(Math.max(daysLeftInWeek, 0), daysLeftInMonth);

  const safeWeeklyBudget = Math.round(
    (remainingSpendableMonth * daysLeftInWeekClamped) / daysLeftInMonth,
  );
  const remainingThisWeek = subMoney(safeWeeklyBudget, spentThisWeek);

  return {
    week,
    spentThisWeek,
    safeWeeklyBudget,
    remainingThisWeek,
    daysLeftInWeek: daysLeftInWeekClamped,
    daysLeftInMonth,
    remainingSpendableMonth,
  };
}

function dayDiff(fromIso: string, toIso: string): number {
  const [fy, fm, fd] = fromIso.split('-').map(Number);
  const [ty, tm, td] = toIso.split('-').map(Number);
  const from = Date.UTC(fy, fm - 1, fd);
  const to = Date.UTC(ty, tm - 1, td);
  return Math.round((to - from) / 86400000);
}

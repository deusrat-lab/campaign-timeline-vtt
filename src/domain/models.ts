/**
 * Доменні моделі. Проєктовані так, щоб у майбутньому додати серверну
 * синхронізацію без переписування: усі сутності мають стабільні id (uuid),
 * createdAt/updatedAt та м'яке видалення (deletedAt).
 */
import type { Money } from './money';

export type Id = string;
export type IsoDate = string; // 'YYYY-MM-DD'
export type IsoDateTime = string; // ISO 8601

export type Priority = 1 | 2 | 3 | 4 | 5 | 6;

export const PRIORITY_LABELS: Record<Priority, string> = {
  1: 'Критично обов’язкове',
  2: 'Базові потреби',
  3: 'Здоров’я і стабільність',
  4: 'Резерви і накопичення',
  5: 'Комфорт',
  6: 'Розваги',
};

/** Пріоритети, які застосунок ніколи не пропонує скорочувати автоматично. */
export const PROTECTED_PRIORITIES: Priority[] = [1];

export type CategoryKind = 'spending' | 'reserve' | 'savings';

export interface BaseEntity {
  id: Id;
  createdAt: IsoDateTime;
  updatedAt: IsoDateTime;
  deletedAt?: IsoDateTime | null;
}

export interface Category extends BaseEntity {
  name: string;
  emoji: string;
  section: string; // назва розділу (групи)
  priority: Priority;
  kind: CategoryKind;
  minAmount: Money; // мінімально допустима сума
  desiredAmount: Money; // бажана сума
  regular: boolean; // регулярна витрата
  rollover: boolean; // чи можна переносити залишок на наступний місяць
  usableAsSource?: boolean; // чи можна брати кошти цієї категорії як джерело переносу
  active: boolean; // тимчасово вимкнена, якщо false
  archived?: boolean; // заархівована: не пропонується в нових місяцях, лишається в історії
  favorite?: boolean; // обрана категорія (швидкий доступ)
  sortOrder: number;
  notes?: string;
}

export type MonthStatus = 'draft' | 'active' | 'closed';

export interface MonthlyBudget extends BaseEntity {
  /** Ключ місяця 'YYYY-MM'. */
  monthKey: string;
  title: string;
  status: MonthStatus;
  expectedIncome: Money; // очікуваний дохід (не є доступними грошима)
  openedAt?: IsoDateTime | null;
  closedAt?: IsoDateTime | null;
  reopenCount: number;
}

export interface MonthlyCategoryPlan extends BaseEntity {
  monthId: Id;
  categoryId: Id;
  planned: Money; // підтверджений план на місяць
  suggested: Money; // запропонована застосунком сума
  priorityOverride?: Priority | null; // тимчасова зміна пріоритету в цьому місяці
  criticalOverride: boolean; // позначено обов'язковим лише цього місяця
  disabled: boolean; // категорія тимчасово вимкнена в цьому місяці
  rolloverIn: Money; // перенесений залишок з минулого місяця
  note?: string;
}

export type TransactionType =
  | 'income'
  | 'expense'
  | 'category_transfer'
  | 'reserve_deposit'
  | 'reserve_withdrawal'
  | 'savings_deposit'
  | 'savings_withdrawal'
  | 'refund'
  | 'correction';

export type PaymentMethod = 'card' | 'cash' | 'transfer' | 'other';

export interface Transaction extends BaseEntity {
  monthId: Id;
  type: TransactionType;
  amount: Money; // завжди додатне; напрямок задає type
  date: IsoDate;
  categoryId?: Id | null;
  sourceCategoryId?: Id | null; // для переносів
  destinationCategoryId?: Id | null; // для переносів
  reserveId?: Id | null;
  savingsGoalId?: Id | null;
  note?: string;
  paymentMethod?: PaymentMethod | null;
  relatedTransactionId?: Id | null; // зв'язок для повернення / коррекції
}

export interface Transfer extends BaseEntity {
  monthId: Id;
  amount: Money;
  date: IsoDate;
  sourceType: 'unallocated' | 'category' | 'reserve' | 'savings';
  sourceCategoryId?: Id | null;
  sourceReserveId?: Id | null;
  sourceSavingsGoalId?: Id | null;
  destinationCategoryId: Id;
  reason?: string;
  initiator: 'user' | 'system';
  sourceBalanceBefore: Money;
  sourceBalanceAfter: Money;
  transactionId?: Id | null; // пов'язана операція
}

export type ReserveKind = 'monthly' | 'medical' | 'vet' | 'repair' | 'custom';

export interface Reserve extends BaseEntity {
  name: string;
  emoji: string;
  kind: ReserveKind;
  balance: Money;
  active: boolean;
  sortOrder: number;
  note?: string;
}

export interface SavingsGoal extends BaseEntity {
  name: string;
  emoji: string;
  currentAmount: Money;
  targetAmount: Money;
  monthlyContribution: Money;
  targetDate?: IsoDate | null;
  status: 'active' | 'reached' | 'paused';
  sortOrder: number;
  note?: string;
}

export interface MonthlyClosure extends BaseEntity {
  monthId: Id;
  closedAt: IsoDateTime;
  /** Знімок підсумків (JSON-серіалізовний). */
  summary: ClosureSummary;
}

export interface ClosureSummary {
  actualIncome: Money;
  totalExpense: Money;
  toReserves: Money;
  toSavings: Money;
  fromReserves: Money;
  finalFree: Money;
  savingsRateBps: number; // відсоток накопичень у базисних пунктах (100 = 1%)
  transactionCount: number;
  transferCount: number;
  categories: ClosureCategoryLine[];
}

export interface ClosureCategoryLine {
  categoryId: Id;
  name: string;
  planned: Money;
  actual: Money;
  deviation: Money; // actual - planned
  overspend: Money; // >0 якщо перевитрата
  coveredFrom: string[]; // назви джерел покриття
}

export interface Recommendation extends BaseEntity {
  monthId: Id;
  categoryId?: Id | null;
  kind: 'increase' | 'decrease' | 'reserve' | 'separate' | 'info';
  message: string;
  amount?: Money | null;
}

export interface AuditLogEntry extends BaseEntity {
  entity: string;
  entityId: Id;
  action: 'create' | 'update' | 'delete' | 'reopen' | 'close' | 'import';
  detail?: string;
}

export interface Settings {
  id: 'app'; // єдиний рядок
  theme: 'light' | 'dark' | 'system';
  locale: 'uk' | 'ru' | 'en';
  hideAmounts: boolean;
  lastMonthKey?: string | null;
  onboardingDone: boolean;
  backupReminderAt?: IsoDate | null;
  demoMonthId?: string | null; // id місяця з демо-даними (щоб не змішувати з реальними)
  schemaVersion: number;
}

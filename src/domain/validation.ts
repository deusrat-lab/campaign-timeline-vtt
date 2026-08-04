import { z } from 'zod';

const money = z.number().int();
const id = z.string().min(1);
const dt = z.string().min(1);

const base = {
  id,
  createdAt: dt,
  updatedAt: dt,
  deletedAt: dt.nullish(),
};

export const prioritySchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
  z.literal(6),
]);

export const categorySchema = z.object({
  ...base,
  name: z.string().min(1),
  emoji: z.string(),
  section: z.string(),
  priority: prioritySchema,
  kind: z.enum(['spending', 'reserve', 'savings']),
  minAmount: money,
  desiredAmount: money,
  regular: z.boolean(),
  rollover: z.boolean(),
  usableAsSource: z.boolean().optional(),
  active: z.boolean(),
  archived: z.boolean().optional(),
  favorite: z.boolean().optional(),
  sortOrder: z.number(),
  notes: z.string().optional(),
});

export const monthlyBudgetSchema = z.object({
  ...base,
  monthKey: z.string(),
  title: z.string(),
  status: z.enum(['draft', 'active', 'closed']),
  expectedIncome: money,
  openedAt: dt.nullish(),
  closedAt: dt.nullish(),
  reopenCount: z.number().int(),
});

export const monthlyCategoryPlanSchema = z.object({
  ...base,
  monthId: id,
  categoryId: id,
  planned: money,
  suggested: money,
  priorityOverride: prioritySchema.nullish(),
  criticalOverride: z.boolean(),
  disabled: z.boolean(),
  rolloverIn: money,
  note: z.string().optional(),
});

export const transactionSchema = z.object({
  ...base,
  monthId: id,
  type: z.enum([
    'income',
    'expense',
    'category_transfer',
    'reserve_deposit',
    'reserve_withdrawal',
    'savings_deposit',
    'savings_withdrawal',
    'refund',
    'correction',
  ]),
  amount: money.nonnegative(),
  date: z.string(),
  categoryId: id.nullish(),
  sourceCategoryId: id.nullish(),
  destinationCategoryId: id.nullish(),
  reserveId: id.nullish(),
  savingsGoalId: id.nullish(),
  note: z.string().optional(),
  paymentMethod: z.enum(['card', 'cash', 'transfer', 'other']).nullish(),
  relatedTransactionId: id.nullish(),
});

export const transferSchema = z.object({
  ...base,
  monthId: id,
  amount: money.nonnegative(),
  date: z.string(),
  sourceType: z.enum(['unallocated', 'category', 'reserve', 'savings']),
  sourceCategoryId: id.nullish(),
  sourceReserveId: id.nullish(),
  sourceSavingsGoalId: id.nullish(),
  destinationCategoryId: id,
  reason: z.string().optional(),
  initiator: z.enum(['user', 'system']),
  sourceBalanceBefore: money,
  sourceBalanceAfter: money,
  transactionId: id.nullish(),
});

export const reserveSchema = z.object({
  ...base,
  name: z.string(),
  emoji: z.string(),
  kind: z.enum(['monthly', 'medical', 'vet', 'repair', 'custom']),
  balance: money,
  active: z.boolean(),
  sortOrder: z.number(),
  note: z.string().optional(),
});

export const savingsGoalSchema = z.object({
  ...base,
  name: z.string(),
  emoji: z.string(),
  currentAmount: money,
  targetAmount: money,
  monthlyContribution: money,
  targetDate: z.string().nullish(),
  status: z.enum(['active', 'reached', 'paused']),
  sortOrder: z.number(),
  note: z.string().optional(),
});

export const monthlyClosureSchema = z.object({
  ...base,
  monthId: id,
  closedAt: dt,
  summary: z.record(z.string(), z.any()),
});

export const recommendationSchema = z.object({
  ...base,
  monthId: id,
  categoryId: id.nullish(),
  kind: z.enum(['increase', 'decrease', 'reserve', 'separate', 'info']),
  message: z.string(),
  amount: money.nullish(),
});

export const settingsSchema = z.object({
  id: z.literal('app'),
  theme: z.enum(['light', 'dark', 'system']),
  locale: z.enum(['uk', 'ru', 'en']),
  hideAmounts: z.boolean(),
  lastMonthKey: z.string().nullish(),
  onboardingDone: z.boolean(),
  backupReminderAt: z.string().nullish(),
  demoMonthId: z.string().nullish(),
  schemaVersion: z.number().int(),
});

export const EXPORT_FORMAT_VERSION = 1;

export const backupSchema = z.object({
  formatVersion: z.number().int(),
  exportedAt: dt,
  appVersion: z.string(),
  data: z.object({
    settings: z.array(settingsSchema),
    categories: z.array(categorySchema),
    monthlyBudgets: z.array(monthlyBudgetSchema),
    monthlyCategoryPlans: z.array(monthlyCategoryPlanSchema),
    transactions: z.array(transactionSchema),
    transfers: z.array(transferSchema),
    reserves: z.array(reserveSchema),
    reserveTransactions: z.array(transactionSchema),
    savingsGoals: z.array(savingsGoalSchema),
    savingsTransactions: z.array(transactionSchema),
    monthlyClosures: z.array(monthlyClosureSchema),
    recommendations: z.array(recommendationSchema),
  }),
});

export type Backup = z.infer<typeof backupSchema>;

import Dexie, { type Table } from 'dexie';
import type {
  AuditLogEntry,
  Category,
  MonthlyBudget,
  MonthlyCategoryPlan,
  MonthlyClosure,
  Recommendation,
  Reserve,
  SavingsGoal,
  Settings,
  Transaction,
  Transfer,
} from '../domain/models';
import { buildSeedCategories, buildSeedReserves, buildSeedSavings } from './seed';
import { nowIso } from '../utils/id';

export const SCHEMA_VERSION = 1;

/**
 * Версіонована схема IndexedDB через Dexie. Усі фінансові дані зберігаються тут.
 * Міграції додаються через нові .version() блоки; дані користувача не очищаються
 * при оновленні застосунку.
 */
export class BudgetDB extends Dexie {
  settings!: Table<Settings, string>;
  categories!: Table<Category, string>;
  monthlyBudgets!: Table<MonthlyBudget, string>;
  monthlyCategoryPlans!: Table<MonthlyCategoryPlan, string>;
  transactions!: Table<Transaction, string>;
  transfers!: Table<Transfer, string>;
  reserves!: Table<Reserve, string>;
  savingsGoals!: Table<SavingsGoal, string>;
  monthlyClosures!: Table<MonthlyClosure, string>;
  recommendations!: Table<Recommendation, string>;
  auditLog!: Table<AuditLogEntry, string>;

  constructor(name = 'budget-db') {
    super(name);
    this.version(1).stores({
      settings: 'id',
      categories: 'id, section, priority, active, sortOrder',
      monthlyBudgets: 'id, &monthKey, status, createdAt',
      monthlyCategoryPlans: 'id, monthId, categoryId, [monthId+categoryId]',
      transactions: 'id, monthId, categoryId, type, date, createdAt, [monthId+type], [monthId+categoryId]',
      transfers: 'id, monthId, destinationCategoryId, date, createdAt',
      reserves: 'id, kind, active, sortOrder',
      savingsGoals: 'id, status, sortOrder',
      monthlyClosures: 'id, monthId, closedAt',
      recommendations: 'id, monthId, categoryId',
      auditLog: 'id, entity, entityId, action, createdAt',
    });
  }
}

export const db = new BudgetDB();

const DEFAULT_SETTINGS: Settings = {
  id: 'app',
  theme: 'system',
  locale: 'uk',
  hideAmounts: false,
  lastMonthKey: null,
  onboardingDone: false,
  backupReminderAt: null,
  schemaVersion: SCHEMA_VERSION,
};

/** Ідемпотентна ініціалізація: створює налаштування та стартовий шаблон один раз. */
export async function ensureSeeded(database: BudgetDB = db): Promise<Settings> {
  return database.transaction(
    'rw',
    database.settings,
    database.categories,
    database.reserves,
    database.savingsGoals,
    async () => {
      let settings = await database.settings.get('app');
      if (!settings) {
        settings = { ...DEFAULT_SETTINGS };
        await database.settings.put(settings);
      }
      const catCount = await database.categories.count();
      if (catCount === 0) {
        await database.categories.bulkPut(buildSeedCategories());
        await database.reserves.bulkPut(buildSeedReserves());
        await database.savingsGoals.bulkPut(buildSeedSavings());
      }
      return settings;
    },
  );
}

export async function updateSettings(patch: Partial<Settings>): Promise<void> {
  const cur = (await db.settings.get('app')) ?? DEFAULT_SETTINGS;
  await db.settings.put({ ...cur, ...patch, id: 'app' });
}

export async function logAudit(
  entity: string,
  entityId: string,
  action: AuditLogEntry['action'],
  detail?: string,
): Promise<void> {
  const ts = nowIso();
  await db.auditLog.add({
    id: crypto.randomUUID(),
    entity,
    entityId,
    action,
    detail,
    createdAt: ts,
    updatedAt: ts,
  });
}

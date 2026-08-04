/** Експорт та імпорт повної локальної бази у JSON з перевіркою через Zod. */
import { db } from '../../db/db';
import { backupSchema, EXPORT_FORMAT_VERSION, type Backup } from '../../domain/validation';

const APP_VERSION = '0.2.0';

export async function exportBackup(): Promise<Backup> {
  const [
    settings,
    categories,
    monthlyBudgets,
    monthlyCategoryPlans,
    transactions,
    transfers,
    reserves,
    savingsGoals,
    monthlyClosures,
    recommendations,
  ] = await Promise.all([
    db.settings.toArray(),
    db.categories.toArray(),
    db.monthlyBudgets.toArray(),
    db.monthlyCategoryPlans.toArray(),
    db.transactions.toArray(),
    db.transfers.toArray(),
    db.reserves.toArray(),
    db.savingsGoals.toArray(),
    db.monthlyClosures.toArray(),
    db.recommendations.toArray(),
  ]);

  const reserveTransactions = transactions.filter(
    (t) => t.type === 'reserve_deposit' || t.type === 'reserve_withdrawal',
  );
  const savingsTransactions = transactions.filter(
    (t) => t.type === 'savings_deposit' || t.type === 'savings_withdrawal',
  );

  return {
    formatVersion: EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    data: {
      settings,
      categories,
      monthlyBudgets,
      monthlyCategoryPlans,
      transactions,
      transfers,
      reserves,
      reserveTransactions,
      savingsGoals,
      savingsTransactions,
      monthlyClosures,
      recommendations,
    },
  };
}

export function backupFilename(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(
    d.getHours(),
  )}${pad(d.getMinutes())}`;
  return `budget-backup-${stamp}.json`;
}

export function downloadBackup(backup: Backup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = backupFilename();
  a.click();
  URL.revokeObjectURL(url);
}

export interface ImportPreview {
  ok: boolean;
  error?: string;
  backup?: Backup;
  counts?: Record<string, number>;
}

export function parseBackup(raw: string): ImportPreview {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'Файл не є коректним JSON.' };
  }
  const parsed = backupSchema.safeParse(json);
  if (!parsed.success) {
    return { ok: false, error: 'Формат резервної копії не пройшов перевірку.' };
  }
  const d = parsed.data.data;
  return {
    ok: true,
    backup: parsed.data,
    counts: {
      categories: d.categories.length,
      monthlyBudgets: d.monthlyBudgets.length,
      transactions: d.transactions.length,
      transfers: d.transfers.length,
      reserves: d.reserves.length,
      savingsGoals: d.savingsGoals.length,
    },
  };
}

export type ImportMode = 'replace' | 'merge';

/** Застосувати резервну копію. Перед цим варто зробити резервну копію поточної бази. */
export async function applyBackup(backup: Backup, mode: ImportMode): Promise<void> {
  const d = backup.data;
  await db.transaction(
    'rw',
    [
      db.settings,
      db.categories,
      db.monthlyBudgets,
      db.monthlyCategoryPlans,
      db.transactions,
      db.transfers,
      db.reserves,
      db.savingsGoals,
      db.monthlyClosures,
      db.recommendations,
    ],
    async () => {
      if (mode === 'replace') {
        await Promise.all([
          db.categories.clear(),
          db.monthlyBudgets.clear(),
          db.monthlyCategoryPlans.clear(),
          db.transactions.clear(),
          db.transfers.clear(),
          db.reserves.clear(),
          db.savingsGoals.clear(),
          db.monthlyClosures.clear(),
          db.recommendations.clear(),
        ]);
      }
      const allTx = [...d.transactions, ...d.reserveTransactions, ...d.savingsTransactions];
      const uniqueTx = Array.from(new Map(allTx.map((t) => [t.id, t])).values());

      await db.settings.bulkPut(d.settings);
      await db.categories.bulkPut(d.categories);
      await db.monthlyBudgets.bulkPut(d.monthlyBudgets);
      await db.monthlyCategoryPlans.bulkPut(d.monthlyCategoryPlans);
      await db.transactions.bulkPut(uniqueTx);
      await db.transfers.bulkPut(d.transfers);
      await db.reserves.bulkPut(d.reserves);
      await db.savingsGoals.bulkPut(d.savingsGoals);
      await db.monthlyClosures.bulkPut(d.monthlyClosures as unknown as Parameters<typeof db.monthlyClosures.bulkPut>[0]);
      await db.recommendations.bulkPut(d.recommendations);
    },
  );
}

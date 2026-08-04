import { useLiveQuery } from 'dexie-react-hooks';
import { db, ensureSeeded } from '../db/db';
import { loadMonthView, type MonthView } from '../db/service';
import { useEffect, useState } from 'react';
import type { Settings } from '../domain/models';

export function useSettings(): Settings | undefined {
  return useLiveQuery(() => db.settings.get('app'), []);
}

/** Гарантує ініціалізацію бази (налаштування + стартовий шаблон). */
export function useEnsureSeeded(): boolean {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    ensureSeeded().then(() => setReady(true));
  }, []);
  return ready;
}

export function useMonths() {
  return useLiveQuery(
    () => db.monthlyBudgets.orderBy('monthKey').reverse().toArray(),
    [],
  );
}

/** Останній місяць за ключем (активний/чернетка), або null. */
export function useCurrentMonthId(settings?: Settings): string | null {
  const months = useMonths();
  if (!months || months.length === 0) return null;
  if (settings?.lastMonthKey) {
    const m = months.find((mm) => mm.monthKey === settings.lastMonthKey);
    if (m) return m.id;
  }
  const active = months.find((m) => m.status === 'active');
  return (active ?? months[0]).id;
}

/**
 * Живе перерахування MonthView. Слухає всі релевантні таблиці, щоб екран
 * оновлювався одразу після будь-якої операції.
 */
export function useMonthView(monthId: string | null): MonthView | undefined {
  return useLiveQuery(async () => {
    if (!monthId) return undefined;
    // Явно читаємо таблиці, щоб useLiveQuery відстежував залежності.
    await db.transactions.where('monthId').equals(monthId).primaryKeys();
    await db.transfers.where('monthId').equals(monthId).primaryKeys();
    await db.monthlyCategoryPlans.where('monthId').equals(monthId).primaryKeys();
    await db.categories.count();
    await db.reserves.count();
    const exists = await db.monthlyBudgets.get(monthId);
    if (!exists) return undefined;
    return loadMonthView(monthId);
  }, [monthId]);
}

export function useReserves() {
  return useLiveQuery(() => db.reserves.orderBy('sortOrder').toArray(), []);
}

export function useSavings() {
  return useLiveQuery(() => db.savingsGoals.orderBy('sortOrder').toArray(), []);
}

export function useCategories() {
  return useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
}

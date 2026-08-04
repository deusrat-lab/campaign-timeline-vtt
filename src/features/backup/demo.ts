/**
 * Демонстраційний сценарій (opt-in). Суми — лише шаблон, не обов'язкові
 * значення. Демо-дані ізольовані в окремому місяці й позначені у settings,
 * щоб не змішуватися з реальними та їх можна було видалити окремо.
 */
import { db, ensureSeeded, updateSettings } from '../../db/db';
import { addExpense, addIncome, getOrCreateMonth, setMonthStatus, upsertPlan } from '../../db/repositories';
import { toMoney } from '../../domain/money';
import { monthKeyOf } from '../../utils/id';

const DEMO_PLAN: Record<string, number> = {
  Ліки: 3200,
  'Ендокринолог та аналізи': 2000,
  Психотерапевт: 7000,
  'Корм і наповнювачі': 5000,
  Танці: 3000,
  Подарунки: 1450,
  Genshin: 300,
  Продукти: 12000,
  'Кафе та доставка': 5000,
  Таксі: 1500,
  Косметика: 3000,
};

export async function isDemoLoaded(): Promise<boolean> {
  const s = await db.settings.get('app');
  return !!s?.demoMonthId;
}

/** Завантажити демо-дані. Повторно не завантажує, якщо демо вже присутнє. */
export async function loadDemoData(): Promise<'loaded' | 'already'> {
  await ensureSeeded();
  if (await isDemoLoaded()) return 'already';

  const key = monthKeyOf(new Date());
  const month = await getOrCreateMonth(key);
  await updateSettings({ lastMonthKey: key, demoMonthId: month.id });

  await addIncome({ monthId: month.id, amount: toMoney(40000), note: 'Зарплата (демо)' });
  await addIncome({ monthId: month.id, amount: toMoney(20000), note: 'Друга частина (демо)' });

  const cats = await db.categories.toArray();
  for (const [name, amount] of Object.entries(DEMO_PLAN)) {
    const cat = cats.find((c) => c.name === name);
    if (cat) await upsertPlan(month.id, cat.id, { planned: toMoney(amount) });
  }

  await setMonthStatus(month.id, 'active');

  const food = cats.find((c) => c.name === 'Продукти');
  const cafe = cats.find((c) => c.name === 'Кафе та доставка');
  if (food) {
    await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(2340), note: 'демо' });
    await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(1870), note: 'демо' });
  }
  if (cafe) await addExpense({ monthId: month.id, categoryId: cafe.id, amount: toMoney(650), note: 'демо' });

  return 'loaded';
}

/** Видалити ЛИШЕ демо-дані (демо-місяць та пов'язані записи). */
export async function removeDemoData(): Promise<void> {
  const s = await db.settings.get('app');
  const demoMonthId = s?.demoMonthId;
  if (!demoMonthId) return;
  await db.transaction(
    'rw',
    [db.monthlyBudgets, db.monthlyCategoryPlans, db.transactions, db.transfers, db.monthlyClosures, db.recommendations, db.settings],
    async () => {
      await db.transactions.where('monthId').equals(demoMonthId).delete();
      await db.transfers.where('monthId').equals(demoMonthId).delete();
      await db.monthlyCategoryPlans.where('monthId').equals(demoMonthId).delete();
      await db.monthlyClosures.where('monthId').equals(demoMonthId).delete();
      await db.recommendations.where('monthId').equals(demoMonthId).delete();
      await db.monthlyBudgets.delete(demoMonthId);
      const cur = await db.settings.get('app');
      if (cur) await db.settings.put({ ...cur, demoMonthId: null, lastMonthKey: null });
    },
  );
}

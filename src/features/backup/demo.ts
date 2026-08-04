/** Opt-in демонстраційний сценарій. Суми — лише шаблон, не обов'язкові значення. */
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

export async function loadDemoData(): Promise<void> {
  await ensureSeeded();
  const key = monthKeyOf(new Date());
  const month = await getOrCreateMonth(key);
  await updateSettings({ lastMonthKey: key, onboardingDone: true });

  await addIncome({ monthId: month.id, amount: toMoney(40000), note: 'Зарплата' });
  await addIncome({ monthId: month.id, amount: toMoney(20000), note: 'Друга частина' });

  const cats = await db.categories.toArray();
  for (const [name, amount] of Object.entries(DEMO_PLAN)) {
    const cat = cats.find((c) => c.name === name);
    if (cat) await upsertPlan(month.id, cat.id, { planned: toMoney(amount) });
  }

  await setMonthStatus(month.id, 'active');

  // Кілька демонстраційних витрат.
  const food = cats.find((c) => c.name === 'Продукти');
  const cafe = cats.find((c) => c.name === 'Кафе та доставка');
  if (food) {
    await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(2340) });
    await addExpense({ monthId: month.id, categoryId: food.id, amount: toMoney(1870) });
  }
  if (cafe) await addExpense({ monthId: month.id, categoryId: cafe.id, amount: toMoney(650) });
}

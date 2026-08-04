import type { Category, Reserve, SavingsGoal } from '../domain/models';
import { toMoney } from '../domain/money';
import { newId, nowIso } from '../utils/id';

type SeedCat = {
  name: string;
  emoji: string;
  section: string;
  priority: Category['priority'];
  min: number;
  desired: number;
  regular?: boolean;
  rollover?: boolean;
};

/**
 * Стартовий шаблон категорій. Суми — лише орієнтири, які користувач
 * підтверджує окремо для кожного місяця. Усе можна змінити або видалити.
 */
const SEED: SeedCat[] = [
  // Критично обов'язкове
  { name: 'Ліки', emoji: '💊', section: 'Критично обов’язкове', priority: 1, min: 2000, desired: 3200, regular: true },
  { name: 'Оренда', emoji: '🏠', section: 'Критично обов’язкове', priority: 1, min: 0, desired: 0, regular: true },
  { name: 'Комунальні послуги', emoji: '💡', section: 'Критично обов’язкове', priority: 1, min: 1000, desired: 2500, regular: true },
  { name: 'Обов’язкові платежі', emoji: '📄', section: 'Критично обов’язкове', priority: 1, min: 0, desired: 1000, regular: true },
  // Базові потреби
  { name: 'Продукти', emoji: '🛒', section: 'Базові потреби', priority: 2, min: 8000, desired: 12000, regular: true },
  { name: 'Корм і наповнювачі', emoji: '🐾', section: 'Базові потреби', priority: 2, min: 3000, desired: 5000, regular: true },
  { name: 'Побутові товари', emoji: '🧴', section: 'Базові потреби', priority: 2, min: 500, desired: 1500, regular: true },
  { name: 'Гігієна', emoji: '🧼', section: 'Базові потреби', priority: 2, min: 500, desired: 1200, regular: true },
  { name: 'Транспорт', emoji: '🚌', section: 'Базові потреби', priority: 2, min: 500, desired: 1500, regular: true },
  { name: 'Мобільний зв’язок та інтернет', emoji: '📱', section: 'Базові потреби', priority: 2, min: 400, desired: 800, regular: true },
  // Здоров'я і стабільність
  { name: 'Ендокринолог та аналізи', emoji: '🩺', section: 'Здоров’я і стабільність', priority: 3, min: 0, desired: 2000 },
  { name: 'Психотерапевт', emoji: '🧠', section: 'Здоров’я і стабільність', priority: 3, min: 0, desired: 7000, regular: true },
  { name: 'Стоматолог', emoji: '🦷', section: 'Здоров’я і стабільність', priority: 3, min: 0, desired: 2000 },
  { name: 'Ветеринар', emoji: '🐈', section: 'Здоров’я і стабільність', priority: 3, min: 0, desired: 2000 },
  { name: 'Танці', emoji: '💃', section: 'Здоров’я і стабільність', priority: 3, min: 0, desired: 3000, regular: true },
  { name: 'Спорт', emoji: '🏋️', section: 'Здоров’я і стабільність', priority: 3, min: 0, desired: 1500, regular: true },
  // Резерви (тип reserve — керуються через сутність Reserve, але лишаємо як категорію-орієнтир)
  { name: 'Резерв поточного місяця', emoji: '🛟', section: 'Резерви', priority: 4, min: 0, desired: 3000 },
  { name: 'Фінансова подушка', emoji: '🪙', section: 'Резерви', priority: 4, min: 0, desired: 5000 },
  { name: 'Ветеринарний резерв', emoji: '🐕‍🦺', section: 'Резерви', priority: 4, min: 0, desired: 1000 },
  { name: 'Медичний резерв', emoji: '➕', section: 'Резерви', priority: 4, min: 0, desired: 1000 },
  // Комфорт
  { name: 'Кафе та доставка', emoji: '☕', section: 'Комфорт', priority: 5, min: 0, desired: 5000 },
  { name: 'Таксі', emoji: '🚕', section: 'Комфорт', priority: 5, min: 0, desired: 1500 },
  { name: 'Одяг', emoji: '👗', section: 'Комфорт', priority: 5, min: 0, desired: 2000 },
  { name: 'Косметика', emoji: '💄', section: 'Комфорт', priority: 5, min: 0, desired: 1000 },
  { name: 'Подарунки', emoji: '🎁', section: 'Комфорт', priority: 5, min: 0, desired: 1450 },
  { name: 'Дрібні покупки', emoji: '🛍️', section: 'Комфорт', priority: 5, min: 0, desired: 1000 },
  // Розваги
  { name: 'Genshin', emoji: '🎮', section: 'Розваги', priority: 6, min: 0, desired: 300 },
  { name: 'Ігри', emoji: '🕹️', section: 'Розваги', priority: 6, min: 0, desired: 500 },
  { name: 'Підписки', emoji: '📺', section: 'Розваги', priority: 6, min: 0, desired: 500, regular: true },
  { name: 'Розваги', emoji: '🎉', section: 'Розваги', priority: 6, min: 0, desired: 1000 },
];

export function buildSeedCategories(): Category[] {
  const ts = nowIso();
  return SEED.map((s, i) => ({
    id: newId(),
    createdAt: ts,
    updatedAt: ts,
    deletedAt: null,
    name: s.name,
    emoji: s.emoji,
    section: s.section,
    priority: s.priority,
    kind: 'spending',
    minAmount: toMoney(s.min),
    desiredAmount: toMoney(s.desired),
    regular: s.regular ?? false,
    rollover: s.rollover ?? s.priority <= 2,
    active: true,
    sortOrder: i,
    notes: '',
  }));
}

export function buildSeedReserves(): Reserve[] {
  const ts = nowIso();
  const base = { createdAt: ts, updatedAt: ts, deletedAt: null, balance: 0, active: true } as const;
  return [
    { id: newId(), ...base, name: 'Резерв поточного місяця', emoji: '🛟', kind: 'monthly', sortOrder: 0 },
    { id: newId(), ...base, name: 'Медичний резерв', emoji: '➕', kind: 'medical', sortOrder: 1 },
    { id: newId(), ...base, name: 'Ветеринарний резерв', emoji: '🐕‍🦺', kind: 'vet', sortOrder: 2 },
  ];
}

export function buildSeedSavings(): SavingsGoal[] {
  const ts = nowIso();
  return [
    {
      id: newId(),
      createdAt: ts,
      updatedAt: ts,
      deletedAt: null,
      name: 'Фінансова подушка',
      emoji: '🪙',
      currentAmount: 0,
      targetAmount: toMoney(100000),
      monthlyContribution: toMoney(3000),
      targetDate: null,
      status: 'active',
      sortOrder: 0,
    },
  ];
}

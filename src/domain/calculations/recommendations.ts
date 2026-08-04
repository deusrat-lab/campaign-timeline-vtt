/**
 * Модуль рекомендацій сум. Без ШІ та зовнішніх API — лише пояснювана
 * статистика за минулими закритими місяцями. Користувач завжди приймає
 * фінальне рішення.
 */
import type { Category, Priority } from '../models';
import { addMoney, clampNonNegative, maxMoney, mulMoney, type Money } from '../money';

export interface CategoryHistoryPoint {
  monthKey: string;
  planned: Money;
  actual: Money;
  hadTransferIn: boolean; // цій категорії доводилося переносити кошти
}

export interface SuggestionInput {
  category: Pick<Category, 'minAmount' | 'desiredAmount' | 'priority' | 'regular'>;
  history: CategoryHistoryPoint[]; // від найновішого до найстарішого, лише закриті місяці
}

export interface Suggestion {
  amount: Money;
  explanation: string[];
  reserveTopUp?: Money; // окреме поповнення цільового резерву для рідкісних великих витрат
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? Math.round((sorted[mid - 1] + sorted[mid]) / 2)
    : sorted[mid];
}

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return Math.round(values.reduce((a, b) => a + b, 0) / values.length);
}

/** Виявити рідкісний викид: значення, що суттєво перевищує медіану. */
function isOutlier(value: number, med: number): boolean {
  return med > 0 && value > med * 2.5;
}

export function suggestForCategory(input: SuggestionInput): Suggestion {
  const { category, history } = input;
  const explanation: string[] = [];
  const actuals = history.map((h) => h.actual).filter((a) => a > 0);
  const monthsWithData = actuals.length;

  if (monthsWithData === 0) {
    const base = maxMoney(category.desiredAmount, category.minAmount);
    explanation.push('Немає історії за цією категорією — використано бажану суму.');
    return { amount: base, explanation };
  }

  const last3 = actuals.slice(0, 3);
  const med = median(actuals);
  const avg3 = mean(last3);
  const lastMonth = actuals[0];

  // Відділяємо рідкісні великі витрати (напр. разовий ветеринар).
  const outliers = actuals.filter((a) => isOutlier(a, med));
  const normalActuals = actuals.filter((a) => !isOutlier(a, med));

  let base: Money;
  if (category.regular && normalActuals.length >= 2) {
    // Стабільна регулярна категорія: 60% середнього за 3 міс + 40% факту минулого місяця.
    const avgNormal = mean(normalActuals.slice(0, 3));
    base = addMoney(mulMoney(avgNormal, 0.6), mulMoney(lastMonth, 0.4));
    explanation.push(
      `Регулярна категорія: 60% середнього за останні місяці + 40% факту минулого місяця.`,
    );
    explanation.push(`Середня витрата (без викидів): ${fmtHint(avgNormal)}.`);
  } else {
    // Нестабільна категорія: спираємось на медіану.
    base = median(normalActuals.length ? normalActuals : actuals);
    explanation.push(`Нестабільна категорія: за основу взято медіану — ${fmtHint(base)}.`);
  }

  // Врахувати мінімум та захистити критичні категорії від заниження.
  base = maxMoney(base, category.minAmount);
  if (category.priority === 1) {
    base = maxMoney(base, category.desiredAmount);
    explanation.push('Критична категорія: не пропонуємо суму, нижчу за бажану.');
  }

  // Пояснення про недовикористання / перевитрати.
  const lastPlan = history[0]?.planned ?? 0;
  if (lastPlan > 0 && lastMonth < mulMoney(lastPlan, 0.8)) {
    explanation.push(
      `Минулого місяця використано лише ${fmtHint(lastMonth)} із ${fmtHint(lastPlan)}.`,
    );
  }
  const transferCount = history.filter((h) => h.hadTransferIn).length;
  if (transferCount >= 2) {
    explanation.push(`Категорія ${transferCount} рази потребувала додаткового перенесення коштів.`);
  }
  if (monthsWithData >= 3) {
    explanation.push(`За останні ${Math.min(3, monthsWithData)} місяці середня витрата — ${fmtHint(avg3)}.`);
  }

  const result: Suggestion = { amount: clampNonNegative(base), explanation };

  // Для рідкісних великих витрат пропонуємо окреме поповнення цільового резерву.
  if (outliers.length > 0) {
    const reserveTopUp = Math.round(mean(outliers) / 6); // розмазати великий викид на ~6 міс
    result.reserveTopUp = reserveTopUp;
    explanation.push(
      `Виявлено рідкісну велику витрату (${fmtHint(mean(outliers))}). ` +
        `Радимо звичайний ліміт + окреме поповнення цільового резерву ${fmtHint(reserveTopUp)}.`,
    );
  }

  return result;
}

function fmtHint(money: Money): string {
  return `${(money / 100).toLocaleString('uk-UA', { maximumFractionDigits: 0 })} грн`;
}

export interface NextMonthAdvice {
  kind: 'increase' | 'decrease' | 'reserve' | 'separate' | 'info';
  message: string;
  amount?: Money;
  priority: Priority;
}

/**
 * Рекомендації на наступний місяць на основі підсумку поточного.
 */
export function adviceFromClosure(lines: {
  categoryId: string;
  name: string;
  planned: Money;
  actual: Money;
  priority: Priority;
  hadTransferIn: boolean;
}[]): NextMonthAdvice[] {
  const advice: NextMonthAdvice[] = [];
  for (const l of lines) {
    const over = l.actual - l.planned;
    if (over > mulMoney(l.planned, 0.15) && l.planned > 0) {
      advice.push({
        kind: 'increase',
        priority: l.priority,
        amount: over,
        message: `Збільшити бюджет «${l.name}»: перевитрата ${fmtHint(over)} (факт ${fmtHint(
          l.actual,
        )} проти плану ${fmtHint(l.planned)}).`,
      });
    } else if (l.planned > 0 && l.actual < mulMoney(l.planned, 0.6)) {
      advice.push({
        kind: 'decrease',
        priority: l.priority,
        amount: l.planned - l.actual,
        message: `Зменшити бюджет «${l.name}»: використано лише ${fmtHint(l.actual)} із ${fmtHint(
          l.planned,
        )}.`,
      });
    }
    if (l.hadTransferIn && l.priority >= 3) {
      advice.push({
        kind: 'separate',
        priority: l.priority,
        message: `Розглянути окремий цільовий резерв для «${l.name}» — категорія потребувала перенесення коштів.`,
      });
    }
  }
  return advice;
}

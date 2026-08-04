/**
 * Короткі числові висновки на основі реальних закритих місяців.
 * Кожен висновок ґрунтується на фактичних даних. Порожні/нульові стани
 * обробляються без винятків.
 */
import type { ClosureSummary } from '../models';

export interface ClosedMonthPoint {
  monthKey: string;
  title: string;
  summary: ClosureSummary;
}

export interface Insight {
  icon: string;
  text: string;
}

function uah(kop: number): string {
  return `${Math.round(kop / 100).toLocaleString('uk-UA')} грн`;
}

/** points відсортовані від найновішого до найстарішого. */
export function buildInsights(points: ClosedMonthPoint[]): Insight[] {
  const insights: Insight[] = [];
  if (points.length === 0) return insights;

  const latest = points[0];

  // 1) Відсоток накопичень цього місяця.
  if (latest.summary.actualIncome > 0 && latest.summary.toSavings > 0) {
    const pct = (latest.summary.savingsRateBps / 100).toFixed(0);
    insights.push({ icon: '🪙', text: `Цього місяця вдалося відкласти ${pct}% доходу.` });
  }

  // 2) Зміна витрат порівняно з попереднім місяцем.
  if (points.length >= 2) {
    const prev = points[1];
    const diff = latest.summary.totalExpense - prev.summary.totalExpense;
    if (Math.abs(diff) >= 5000) {
      insights.push({
        icon: diff > 0 ? '📈' : '📉',
        text: `Витрати ${diff > 0 ? 'зросли' : 'зменшились'} на ${uah(Math.abs(diff))} порівняно з ${prev.title}.`,
      });
    }
  }

  // 3) Категорія, що перевищується кілька місяців поспіль.
  const overspendStreak = categoryOverspendStreak(points);
  for (const [name, streak] of overspendStreak) {
    if (streak >= 3) {
      insights.push({ icon: '⚠️', text: `${streak} місяці поспіль бюджет «${name}» був перевищений.` });
    }
  }

  // 4) Використання резервів.
  if (latest.summary.fromReserves > 0) {
    insights.push({ icon: '🛟', text: `Цього місяця з резервів використано ${uah(latest.summary.fromReserves)}.` });
  }

  // 5) Дефіцит/профіцит вільного залишку.
  if (latest.summary.finalFree < 0) {
    insights.push({ icon: '🔴', text: `Місяць закрито з від'ємним залишком ${uah(-latest.summary.finalFree)}.` });
  }

  return insights;
}

/** Для кожної категорії — довжина поточної серії перевитрат (з найновішого місяця). */
function categoryOverspendStreak(points: ClosedMonthPoint[]): Map<string, number> {
  const streaks = new Map<string, number>();
  const broken = new Set<string>();
  for (const p of points) {
    for (const line of p.summary.categories) {
      if (broken.has(line.name)) continue;
      if (line.overspend > 0) {
        streaks.set(line.name, (streaks.get(line.name) ?? 0) + 1);
      } else if (line.planned > 0 || line.actual > 0) {
        broken.add(line.name); // серія перервана
      }
    }
  }
  return streaks;
}

export interface PeriodAggregate {
  months: number;
  income: number;
  expense: number;
  savings: number;
  reservesUsed: number;
  free: number;
  savingsRatePct: number;
}

export function aggregatePeriod(points: ClosedMonthPoint[], n: number): PeriodAggregate {
  const slice = points.slice(0, n);
  const sum = (f: (s: ClosureSummary) => number) => slice.reduce((a, p) => a + f(p.summary), 0);
  const income = sum((s) => s.actualIncome);
  const savings = sum((s) => s.toSavings);
  return {
    months: slice.length,
    income,
    expense: sum((s) => s.totalExpense),
    savings,
    reservesUsed: sum((s) => s.fromReserves),
    free: sum((s) => s.finalFree),
    savingsRatePct: income > 0 ? Math.round((savings / income) * 100) : 0,
  };
}

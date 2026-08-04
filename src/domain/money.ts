/**
 * Грошовий тип. Усі суми зберігаються в цілих копійках (мінімальних одиницях),
 * щоб уникнути помилок арифметики з плаваючою комою.
 *
 * 100 грн = 10 000 копійок.
 */

export type Money = number; // ціле число копійок (integer kopecks)

const KOPECKS_IN_UNIT = 100;

/** Перетворити гривні (число або рядок від користувача) у копійки. */
export function toMoney(uah: number | string): Money {
  const num = typeof uah === 'string' ? parseUahInput(uah) : uah;
  if (!Number.isFinite(num)) return 0;
  // Округлення до копійки без накопичення похибки float.
  return Math.round(num * KOPECKS_IN_UNIT);
}

/** Розбір користувацького вводу гривень: підтримує кому, пробіли-роздільники. */
export function parseUahInput(raw: string): number {
  if (!raw) return 0;
  const cleaned = raw
    .replace(/[\s\u00A0]/g, "")
    .replace(',', '.')
    .replace(/[^0-9.-]/g, '');
  const num = Number.parseFloat(cleaned);
  return Number.isFinite(num) ? num : 0;
}

/** Копійки → гривні (число з двома знаками). */
export function toUah(money: Money): number {
  return Math.round(money) / KOPECKS_IN_UNIT;
}

/** Безпечне додавання сум у копійках. */
export function addMoney(...values: Money[]): Money {
  return values.reduce((acc, v) => acc + Math.round(v), 0);
}

/** Віднімання: a - b (у копійках). */
export function subMoney(a: Money, b: Money): Money {
  return Math.round(a) - Math.round(b);
}

/** Множення суми на коефіцієнт з коректним округленням до копійки. */
export function mulMoney(money: Money, factor: number): Money {
  return Math.round(money * factor);
}

export function isNegative(money: Money): boolean {
  return money < 0;
}

export function maxMoney(a: Money, b: Money): Money {
  return a >= b ? a : b;
}

export function clampNonNegative(money: Money): Money {
  return money < 0 ? 0 : money;
}

const uahFormatter = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const uahFormatterNoCents = new Intl.NumberFormat('uk-UA', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

/** Форматувати копійки у рядок «12 000,00 ₴». */
export function formatMoney(money: Money, opts?: { cents?: boolean; sign?: boolean }): string {
  const cents = opts?.cents ?? true;
  const uah = toUah(money);
  const fmt = cents ? uahFormatter : uahFormatterNoCents;
  const body = fmt.format(cents ? uah : Math.round(uah));
  const signPrefix = opts?.sign && money > 0 ? '+' : '';
  return `${signPrefix}${body} ₴`;
}

import { describe, it, expect } from 'vitest';
import {
  toMoney,
  toUah,
  addMoney,
  subMoney,
  mulMoney,
  parseUahInput,
  formatMoney,
} from '../domain/money';

describe('money (цілі копійки)', () => {
  it('переводить гривні у копійки', () => {
    expect(toMoney(100)).toBe(10000);
    expect(toMoney(5760)).toBe(576000);
    expect(toMoney(0.01)).toBe(1);
  });

  it('не накопичує похибку float (0.1 + 0.2)', () => {
    const sum = addMoney(toMoney(0.1), toMoney(0.2));
    expect(sum).toBe(30);
    expect(toUah(sum)).toBe(0.3);
  });

  it('коректно округлює множення', () => {
    expect(mulMoney(10000, 0.6)).toBe(6000);
    expect(mulMoney(333, 0.5)).toBe(167); // 166.5 -> 167
  });

  it('підтримує від’ємні значення', () => {
    expect(subMoney(toMoney(50), toMoney(80))).toBe(-3000);
  });

  it('розбирає користувацький ввід з комою та пробілами', () => {
    expect(parseUahInput('12 000,50')).toBe(12000.5);
    expect(parseUahInput('1 234')).toBe(1234);
    expect(parseUahInput('abc')).toBe(0);
  });

  it('форматує суму', () => {
    // Intl використовує нерозривні пробіли — нормалізуємо перед перевіркою.
    const normalized = formatMoney(toMoney(12000), { cents: false }).replace(/\s/g, ' ');
    expect(normalized).toContain('12 000');
    expect(formatMoney(toMoney(12000))).toContain('₴');
  });
});

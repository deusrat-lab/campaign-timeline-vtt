import { describe, it, expect } from 'vitest';
import { suggestForCategory, median, mean } from '../domain/calculations/recommendations';
import { toMoney } from '../domain/money';

const cat = (p: Partial<Parameters<typeof suggestForCategory>[0]['category']> = {}) => ({
  minAmount: toMoney(0),
  desiredAmount: toMoney(5000),
  priority: 2 as const,
  regular: true,
  ...p,
});

describe('median / mean', () => {
  it('median непарна/парна', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(3); // round((2+3)/2)=3
    expect(median([])).toBe(0);
  });
  it('mean', () => {
    expect(mean([2, 4, 6])).toBe(4);
  });
});

describe('suggestForCategory', () => {
  it('без історії використовує бажану суму', () => {
    const s = suggestForCategory({ category: cat(), history: [] });
    expect(s.amount).toBe(toMoney(5000));
    expect(s.explanation.length).toBeGreaterThan(0);
  });

  it('регулярна стабільна категорія: зважене 60/40', () => {
    const history = [
      { monthKey: '2026-07', planned: toMoney(6000), actual: toMoney(6000), hadTransferIn: false },
      { monthKey: '2026-06', planned: toMoney(6000), actual: toMoney(5000), hadTransferIn: false },
      { monthKey: '2026-05', planned: toMoney(6000), actual: toMoney(4000), hadTransferIn: false },
    ];
    const s = suggestForCategory({ category: cat({ regular: true }), history });
    // avg3 = 5000, last=6000 => 0.6*5000 + 0.4*6000 = 5400
    expect(s.amount).toBe(toMoney(5400));
  });

  it('критична категорія не опускається нижче бажаної', () => {
    const history = [
      { monthKey: '2026-07', planned: toMoney(3200), actual: toMoney(1000), hadTransferIn: false },
      { monthKey: '2026-06', planned: toMoney(3200), actual: toMoney(1000), hadTransferIn: false },
    ];
    const s = suggestForCategory({
      category: cat({ priority: 1, desiredAmount: toMoney(3200), regular: true }),
      history,
    });
    expect(s.amount).toBeGreaterThanOrEqual(toMoney(3200));
  });

  it('рідкісний великий викид → окреме поповнення резерву, а не норма', () => {
    const history = [
      { monthKey: '2026-07', planned: toMoney(2000), actual: toMoney(2000), hadTransferIn: false },
      { monthKey: '2026-06', planned: toMoney(2000), actual: toMoney(20000), hadTransferIn: true },
      { monthKey: '2026-05', planned: toMoney(2000), actual: toMoney(1800), hadTransferIn: false },
      { monthKey: '2026-04', planned: toMoney(2000), actual: toMoney(2100), hadTransferIn: false },
    ];
    const s = suggestForCategory({
      category: cat({ regular: false, desiredAmount: toMoney(2000) }),
      history,
    });
    // звичайний ліміт має бути близьким до медіани ~2000, не до 20000
    expect(s.amount).toBeLessThan(toMoney(5000));
    expect(s.reserveTopUp).toBeDefined();
    expect(s.reserveTopUp!).toBeGreaterThan(0);
  });
});

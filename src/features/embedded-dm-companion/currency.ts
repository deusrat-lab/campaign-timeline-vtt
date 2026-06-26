/**
 * Ported from dm-companion/src/utils/currency.ts (verbatim logic) so the
 * embedded PurchaseCart port (see PurchaseCart.tsx in this directory) has
 * the same price parsing/formatting behavior as the source app. Extended
 * with `parseAnyPrice` to bridge campaign-timeline-vtt's looser price
 * fields (`DmShopItem.price: string | number`, `DmTavernMenuItem.price:
 * string | undefined`) into the same { amount, currency } shape dm-companion
 * uses internally.
 */
export type Currency = 'gp' | 'sp' | 'cp';

/** Conversion rate to GP. 1 GP = 10 SP = 100 CP. */
export const GP_RATE: Record<Currency, number> = { gp: 1, sp: 0.1, cp: 0.01 };

export function toGp(amount: number, currency: Currency): number {
  return amount * (GP_RATE[currency] ?? 1);
}

export function formatPrice(amount: number, currency: Currency): string {
  const rounded = Math.round(amount * 100) / 100;
  return `${rounded} ${currency.toUpperCase()}`;
}

export function formatGpTotal(totalGp: number): string {
  if (!totalGp || totalGp <= 0) return '0 GP';
  const gp = Math.floor(totalGp + 1e-9);
  const remainder = totalGp - gp;
  const sp = Math.round(remainder * 10);
  if (sp > 0 && sp < 10) return `${gp} GP ${sp} SP`;
  if (sp >= 10) return `${gp + 1} GP`;
  return `${gp} GP`;
}

export function parsePriceString(price: string, defaultCurrency: Currency = 'gp'): { amount: number; currency: Currency } | null {
  const trimmed = price.trim();
  const single = trimmed.match(/^(\d+(?:[.,]\d+)?)\s*(gp|sp|cp)?\b/i);
  if (single) {
    const currency = (single[2]?.toLowerCase() as Currency) ?? defaultCurrency;
    return { amount: parseFloat(single[1].replace(',', '.')), currency };
  }
  return null;
}

/** Bridges a campaign-timeline-vtt `DmShopItem`/`DmTavernMenuItem` price
 * field (string | number | undefined, with an optional separate `currency`
 * string field on shop items) into a parsed { amount, currency } or null
 * if the item isn't actually purchasable (e.g. price is a descriptive
 * note with no leading number). */
export function parseAnyPrice(price: string | number | undefined, currencyHint?: string): { amount: number; currency: Currency } | null {
  if (price === undefined || price === '') return null;
  if (typeof price === 'number') {
    const currency = (currencyHint?.toLowerCase() as Currency) ?? 'gp';
    return { amount: price, currency: ['gp', 'sp', 'cp'].includes(currency) ? currency : 'gp' };
  }
  const parsed = parsePriceString(price, (currencyHint?.toLowerCase() as Currency) ?? 'gp');
  return parsed;
}

import { formatMoney } from '../domain/money';
import type { Money } from '../domain/money';
import { useSettings } from './useDb';

/** Форматування сум з урахуванням режиму приховування (settings.hideAmounts). */
export function useMoneyFormat() {
  const settings = useSettings();
  const hide = settings?.hideAmounts ?? false;
  return (money: Money, opts?: { cents?: boolean; sign?: boolean }) =>
    hide ? '••• ₴' : formatMoney(money, opts);
}

import { useMemo, useState } from 'react';
import type { Currency } from './currency';
import { toGp, formatPrice, formatGpTotal } from './currency';
import './PurchaseCart.css';

/**
 * Ported from dm-companion/src/components/PurchaseCart.tsx. Logic is kept
 * verbatim (add/remove/quantity/running total/copy-receipt/clear); the only
 * deliberate change is that quantities here are ALWAYS internal component
 * state (the `quantities`/`onQuantitiesChange` external-control props from
 * the source were dropped) — see the module doc below for why.
 *
 * SIMPLIFICATION (documented per task spec): this cart is local,
 * non-persistent session state. It lives entirely in this component's
 * `useState` and is never written to the campaign store/overlay/localStorage.
 * Closing the embedded host (EmbeddedCompanionWindow) unmounts this
 * component, so the cart silently resets — there is no "saved order" concept
 * in campaign-timeline-vtt, unlike persistent purchase flows some apps have.
 * This is intentional: shop/tavern purchases are a DM bookkeeping aid during
 * a session, not a tracked economy ledger.
 */
export interface BuyableItem {
  id: string;
  name: string;
  meta?: string;
  amount: number;
  currency: Currency;
}

interface BuyableItemRowProps {
  item: BuyableItem;
  qty: number;
  onChange: (value: number) => void;
}

export function BuyableItemRow({ item, qty, onChange }: BuyableItemRowProps) {
  return (
    <div className="purchase-item">
      <div className="purchase-item__main">
        <div className="purchase-item__name">{item.name}</div>
        <div className="purchase-item__meta">
          {formatPrice(item.amount, item.currency)}
          {item.meta ? ` · ${item.meta}` : ''}
        </div>
        {qty > 0 && (
          <div className="purchase-item__line-total">
            {qty} × {formatPrice(item.amount, item.currency)} = {formatPrice(item.amount * qty, item.currency)}
          </div>
        )}
      </div>
      <div className="purchase-item__qty">
        <button type="button" className="btn btn--small" onClick={() => onChange(qty - 1)} aria-label="Меньше">
          −
        </button>
        <input type="number" min={0} value={qty} onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))} />
        <button type="button" className="btn btn--small" onClick={() => onChange(qty + 1)} aria-label="Больше">
          +
        </button>
      </div>
    </div>
  );
}

interface PurchaseCartProps {
  items: BuyableItem[];
  /** Optional title shown above the running total, e.g. "Покупка". */
  title?: string;
}

export function PurchaseCart({ items, title }: PurchaseCartProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [copied, setCopied] = useState(false);

  const total = useMemo(
    () => items.reduce((sum, item) => sum + (quantities[item.id] ?? 0) * toGp(item.amount, item.currency), 0),
    [items, quantities],
  );

  const cartItems = items.filter((item) => (quantities[item.id] ?? 0) > 0);

  function setQty(id: string, value: number) {
    setQuantities((q) => ({ ...q, [id]: Math.max(0, value) }));
  }

  function clear() {
    setQuantities({});
    setCopied(false);
  }

  async function copyReceipt() {
    const lines = cartItems.map((item) => {
      const qty = quantities[item.id] ?? 0;
      return `${item.name} x${qty} — ${formatPrice(item.amount * qty, item.currency)}`;
    });
    lines.push(`Итого: ${formatGpTotal(total)}`);
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.alert(text);
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="purchase-cart">
      {items.map((item) => (
        <BuyableItemRow key={item.id} item={item} qty={quantities[item.id] ?? 0} onChange={(v) => setQty(item.id, v)} />
      ))}

      <div className="purchase-cart__total">
        <span>
          {title ? `${title}: ` : 'Итого: '}
          <strong>{formatGpTotal(total)}</strong>
        </span>
        <div className="btn-row">
          {copied && <span className="purchase-cart__copied">Скопировано!</span>}
          <button type="button" className="btn btn--small" onClick={copyReceipt} disabled={cartItems.length === 0}>
            Скопировать чек
          </button>
          <button type="button" className="btn btn--small" onClick={clear} disabled={cartItems.length === 0}>
            Очистить
          </button>
        </div>
      </div>
    </div>
  );
}

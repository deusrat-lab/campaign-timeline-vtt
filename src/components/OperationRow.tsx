import type { Category, Transaction, TransactionType } from '../domain/models';
import { useMoneyFormat } from '../hooks/useFormat';

const TYPE_META: Record<TransactionType, { emoji: string; label: string; sign: 1 | -1 | 0 }> = {
  income: { emoji: '💵', label: 'Дохід', sign: 1 },
  expense: { emoji: '🧾', label: 'Витрата', sign: -1 },
  refund: { emoji: '↩️', label: 'Повернення', sign: 1 },
  correction: { emoji: '✏️', label: 'Коригування', sign: -1 },
  category_transfer: { emoji: '🔄', label: 'Перенос', sign: 0 },
  reserve_deposit: { emoji: '🛟', label: 'У резерв', sign: -1 },
  reserve_withdrawal: { emoji: '🛟', label: 'З резерву', sign: 1 },
  savings_deposit: { emoji: '🪙', label: 'У накопичення', sign: -1 },
  savings_withdrawal: { emoji: '🪙', label: 'З накопичень', sign: 1 },
};

export function OperationRow({
  tx,
  categories,
  onClick,
}: {
  tx: Transaction;
  categories: Category[];
  onClick?: (tx: Transaction) => void;
}) {
  const fmt = useMoneyFormat();
  const meta = TYPE_META[tx.type];
  const cat = tx.categoryId ? categories.find((c) => c.id === tx.categoryId) : undefined;
  const signClass = meta.sign === -1 ? 'neg' : meta.sign === 1 ? 'pos' : '';
  const prefix = meta.sign === -1 ? '−' : meta.sign === 1 ? '+' : '';
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      className="list-op"
      style={onClick ? { width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' } : undefined}
      onClick={onClick ? () => onClick(tx) : undefined}
    >
      <span className="op-emoji" aria-hidden>{cat?.emoji ?? meta.emoji}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{cat?.name ?? meta.label}</div>
        <div className="muted small">
          {tx.date}
          {tx.note ? ` · ${tx.note}` : ''}
        </div>
      </div>
      <span className={`op-amount ${signClass}`}>
        {prefix}
        {fmt(tx.amount)}
      </span>
    </Tag>
  );
}

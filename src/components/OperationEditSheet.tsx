import { useEffect, useState } from 'react';
import { Sheet, useToast } from './ui';
import { db } from '../db/db';
import { deleteTransfer, softDeleteTransaction, updateTransaction } from '../db/repositories';
import { parseUahInput, toMoney, toUah } from '../domain/money';
import type { Category, PaymentMethod, Transaction } from '../domain/models';
import { useMoneyFormat } from '../hooks/useFormat';

const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  card: 'Картка',
  cash: 'Готівка',
  transfer: 'Переказ',
  other: 'Інше',
};

const EDITABLE_TYPES: Transaction['type'][] = ['expense', 'income', 'refund'];

/** Аркуш перегляду/редагування операції. Перекази редагувати не можна — лише скасувати. */
export function OperationEditSheet({
  tx,
  categories,
  open,
  onClose,
}: {
  tx: Transaction | null;
  categories: Category[];
  open: boolean;
  onClose: () => void;
}) {
  const fmt = useMoneyFormat();
  const toast = useToast();
  const editable = tx ? EDITABLE_TYPES.includes(tx.type) : false;

  const [amountRaw, setAmountRaw] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState('');
  const [note, setNote] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!open || !tx) return;
    setAmountRaw(String(toUah(tx.amount)));
    setCategoryId(tx.categoryId ?? '');
    setDate(tx.date);
    setNote(tx.note ?? '');
    setPaymentMethod(tx.paymentMethod ?? '');
    setConfirmDelete(false);
  }, [open, tx]);

  if (!tx) return <Sheet open={open} onClose={onClose} title="Операція" children={null} />;

  const expenseCats = categories.filter((c) => c.kind === 'spending' && c.active);

  async function save() {
    if (!tx) return;
    await updateTransaction(tx.id, {
      amount: toMoney(parseUahInput(amountRaw)),
      categoryId: categoryId || null,
      date,
      note: note || undefined,
      paymentMethod: paymentMethod || null,
    });
    toast({ message: 'Операцію оновлено' });
    onClose();
  }

  async function remove() {
    if (!tx) return;
    if (editable) {
      await softDeleteTransaction(tx.id);
      toast({ message: 'Операцію видалено', undo: async () => { await db.transactions.update(tx.id, { deletedAt: null }); } });
    } else {
      const transfer = await db.transfers.where('transactionId').equals(tx.id).first();
      if (transfer) {
        await deleteTransfer(transfer.id);
        toast({ message: 'Перенос скасовано' });
      }
    }
    onClose();
  }

  return (
    <Sheet open={open} onClose={onClose} title="Операція">
      {editable ? (
        <>
          <div className="field">
            <label>Сума, ₴</label>
            <input className="input amount lg" inputMode="decimal" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} />
          </div>
          {tx.type !== 'income' && (
            <div className="field">
              <label>Категорія</label>
              <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
                <option value="">—</option>
                {expenseCats.map((c) => (
                  <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="field">
            <label>Дата</label>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="field">
            <label>Нотатка</label>
            <input className="input" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          {tx.type === 'expense' && (
            <div className="field">
              <label>Спосіб оплати</label>
              <select className="input" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}>
                <option value="">—</option>
                {(Object.keys(PAYMENT_LABELS) as PaymentMethod[]).map((p) => (
                  <option key={p} value={p}>{PAYMENT_LABELS[p]}</option>
                ))}
              </select>
            </div>
          )}
          <button className="btn primary block mt" onClick={save}>Зберегти</button>
        </>
      ) : (
        <p className="muted small">
          Це перенос коштів між категорією/резервом/накопиченням: {fmt(tx.amount)} · {tx.date}
          {tx.note ? ` · ${tx.note}` : ''}. Редагувати перенос напряму не можна — лише скасувати і створити новий.
        </p>
      )}

      {!confirmDelete ? (
        <button className="btn danger ghost block mt" onClick={() => setConfirmDelete(true)}>
          Видалити
        </button>
      ) : (
        <div className="card mt" style={{ background: 'var(--danger-bg, transparent)' }}>
          <p className="small">Точно видалити цю операцію?</p>
          <div className="row">
            <button className="btn ghost" onClick={() => setConfirmDelete(false)}>Скасувати</button>
            <button className="btn danger" onClick={remove}>Так, видалити</button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import type { CategoryStatus } from '../domain/calculations/balances';
import { uk } from '../i18n';

// ---- Нижній аркуш (bottom sheet) ----
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="sheet-head">
          {title ? <h2>{title}</h2> : <span />}
          <button className="sheet-close btn sm ghost" aria-label={uk.common.close} onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

// ---- Прогрес-бар використання ----
export function Progress({ ratioBps, status }: { ratioBps: number; status: CategoryStatus }) {
  const pct = Math.min(100, Math.max(0, ratioBps / 100));
  const color =
    status === 'over' || status === 'reached'
      ? 'var(--danger)'
      : status === 'near'
        ? 'var(--warn)'
        : status === 'fast'
          ? 'var(--warn)'
          : 'var(--ok)';
  return (
    <div className="progress" aria-label={`Використано ${Math.round(pct)}%`}>
      <span style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

const STATUS_TONE: Record<CategoryStatus, string> = {
  idle: 'neutral',
  ok: 'ok',
  fast: 'warn',
  near: 'warn',
  reached: 'danger',
  over: 'danger',
};
const STATUS_ICON: Record<CategoryStatus, string> = {
  idle: '⚪',
  ok: '✅',
  fast: '⏩',
  near: '⚠️',
  reached: '🛑',
  over: '❗',
};

/** Статус категорії передається кольором + іконкою + текстом (не лише колір). */
export function StatusBadge({ status }: { status: CategoryStatus }) {
  return (
    <span className={`badge ${STATUS_TONE[status]}`}>
      <span aria-hidden>{STATUS_ICON[status]}</span>
      {uk.categoryStatus[status]}
    </span>
  );
}

// ---- Toast з можливістю скасувати останню дію ----
interface ToastState {
  message: string;
  undo?: () => void | Promise<void>;
}
const ToastCtx = createContext<(t: ToastState) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const show = useCallback((t: ToastState) => {
    setToast(t);
  }, []);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(id);
  }, [toast]);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && (
        <div className="toast" role="status">
          <span>{toast.message}</span>
          {toast.undo && (
            <button
              onClick={async () => {
                await toast.undo!();
                setToast(null);
              }}
            >
              {uk.common.undo}
            </button>
          )}
        </div>
      )}
    </ToastCtx.Provider>
  );
}

export function useToast() {
  return useContext(ToastCtx);
}

// ---- Підтвердження небезпечної дії ----
export function ConfirmButton({
  label,
  confirmText,
  onConfirm,
  className = 'btn danger',
}: {
  label: string;
  confirmText: string;
  onConfirm: () => void | Promise<void>;
  className?: string;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      className={className}
      onClick={() => {
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
          setTimeout(() => setArmed(false), 4000);
        }
      }}
    >
      {armed ? confirmText : label}
    </button>
  );
}

import { useState } from 'react';
import type { BattleEntry, BattleMapVariantKind, BattleMapVariantRef } from '../../types';

/**
 * Stage 5C, Step 5 — minimal variant add/edit/remove editor, extracted out of
 * BattleEntryPanel.tsx to avoid bloating it. Mutates `entry.variants` only
 * via the `onSave` callback (caller wires this to `store.updateBattleEntry`)
 * — never on its own, never partially. Validation here is intentionally
 * light: variant id required+unique, kind required, name required; a
 * missing battleMapId/battleMapUrl is a soft warning only (a variant can be
 * a placeholder the DM fills in later).
 */
const VARIANT_KIND_OPTIONS: BattleMapVariantKind[] = ['day', 'evening', 'night', 'rain', 'destroyed', 'custom'];
const VARIANT_KIND_LABELS: Record<BattleMapVariantKind, string> = {
  day: 'День',
  evening: 'Вечер',
  night: 'Ночь',
  rain: 'Дождь',
  destroyed: 'Разрушено',
  custom: 'Своё',
};

export interface BattleVariantEditorProps {
  entry: BattleEntry;
  onSave: (variants: BattleMapVariantRef[]) => void;
}

interface VariantFormState {
  id: string;
  kind: BattleMapVariantKind;
  name: string;
  battleMapId: string;
  battleMapUrl: string;
  imageId: string;
  notes: string;
}

const EMPTY_FORM: VariantFormState = {
  id: '',
  kind: 'day',
  name: '',
  battleMapId: '',
  battleMapUrl: '',
  imageId: '',
  notes: '',
};

function toFormState(v: BattleMapVariantRef): VariantFormState {
  return {
    id: v.id,
    kind: v.kind,
    name: v.name,
    battleMapId: v.battleMapId ?? '',
    battleMapUrl: v.battleMapUrl ?? '',
    imageId: v.imageId ?? '',
    notes: v.notes ?? '',
  };
}

export function BattleVariantEditor({ entry, onSave }: BattleVariantEditorProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<VariantFormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const variants = entry.variants ?? [];

  function startAdd() {
    setEditingId('__new__');
    setForm(EMPTY_FORM);
    setError(null);
    setWarning(null);
  }

  function startEdit(v: BattleMapVariantRef) {
    setEditingId(v.id);
    setForm(toFormState(v));
    setError(null);
    setWarning(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setError(null);
    setWarning(null);
  }

  function removeVariant(id: string) {
    onSave(variants.filter((v) => v.id !== id));
  }

  function submit() {
    const id = form.id.trim();
    const name = form.name.trim();
    if (!id) {
      setError('Нужен id варианта.');
      return;
    }
    if (!name) {
      setError('Нужно название варианта.');
      return;
    }
    const isDuplicate = variants.some((v) => v.id === id && v.id !== editingId);
    if (isDuplicate) {
      setError(`Вариант с id «${id}» уже существует — id должен быть уникален в пределах сцены.`);
      return;
    }
    setError(null);
    if (!form.battleMapId.trim() && !form.battleMapUrl.trim()) {
      setWarning('Ни battleMapId, ни battleMapUrl не заданы — этот вариант не откроет карту при запуске.');
    } else {
      setWarning(null);
    }

    const next: BattleMapVariantRef = {
      id,
      kind: form.kind,
      name,
      battleMapId: form.battleMapId.trim() || undefined,
      battleMapUrl: form.battleMapUrl.trim() || undefined,
      imageId: form.imageId.trim() || undefined,
      notes: form.notes.trim() || undefined,
    };

    const isNew = editingId === '__new__';
    const updated = isNew
      ? [...variants, next]
      : variants.map((v) => (v.id === editingId ? next : v));
    onSave(updated);
    setEditingId(null);
  }

  return (
    <div className="session-panel-section">
      <p className="side-panel-subheading">Варианты карты боя</p>
      {variants.length === 0 ? (
        <p className="muted">Вариантов пока нет.</p>
      ) : (
        <ul className="route-list">
          {variants.map((v) => (
            <li key={v.id}>
              <strong>{v.name}</strong> — {VARIANT_KIND_LABELS[v.kind]}
              {!v.battleMapId && !v.battleMapUrl && (
                <span className="status-badge" title="Нет battleMapId/battleMapUrl">
                  без карты
                </span>
              )}
              <div className="actions">
                <button onClick={() => startEdit(v)}>Редактировать</button>
                <button onClick={() => removeVariant(v.id)}>Удалить</button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editingId ? (
        <div className="session-panel-section">
          <label>
            id варианта
            <input
              value={form.id}
              disabled={editingId !== '__new__'}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
          </label>
          <label>
            Вид
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as BattleMapVariantKind })}>
              {VARIANT_KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>
                  {VARIANT_KIND_LABELS[k]}
                </option>
              ))}
            </select>
          </label>
          <label>
            Название
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </label>
          <label>
            battleMapId (необязательно)
            <input value={form.battleMapId} onChange={(e) => setForm({ ...form, battleMapId: e.target.value })} />
          </label>
          <label>
            battleMapUrl (необязательно)
            <input value={form.battleMapUrl} onChange={(e) => setForm({ ...form, battleMapUrl: e.target.value })} />
          </label>
          <label>
            imageId (необязательно, для безопасного превью игрокам)
            <input value={form.imageId} onChange={(e) => setForm({ ...form, imageId: e.target.value })} />
          </label>
          <label>
            Заметки
            <textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </label>
          {error && <p className="form-error">{error}</p>}
          {warning && !error && <p className="muted">{warning}</p>}
          <div className="actions">
            <button onClick={submit}>Сохранить вариант</button>
            <button onClick={cancelEdit}>Отмена</button>
          </div>
        </div>
      ) : (
        <div className="actions">
          <button onClick={startAdd}>Добавить вариант</button>
        </div>
      )}
    </div>
  );
}

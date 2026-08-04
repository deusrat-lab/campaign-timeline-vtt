import { useState } from 'react';
import { Sheet, useToast } from '../../components/ui';
import { saveCategory } from '../../db/repositories';
import { parseUahInput, toMoney, toUah } from '../../domain/money';
import { PRIORITY_LABELS, type Category, type Priority } from '../../domain/models';

const EMOJI_CHOICES = ['📦', '💊', '🏠', '💡', '🛒', '🐾', '🧴', '🚌', '📱', '🩺', '🧠', '🦷', '🐈', '💃', '🏋️', '🛟', '🪙', '☕', '🚕', '👗', '💄', '🎁', '🎮', '📺', '🎉', '❤️', '📚', '✈️'];

export function CategoryForm({
  category,
  sections,
  onClose,
  onSaved,
}: {
  category: Category | null;
  sections: string[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const toast = useToast();
  const isNew = !category;
  const [name, setName] = useState(category?.name ?? '');
  const [emoji, setEmoji] = useState(category?.emoji ?? '📦');
  const [section, setSection] = useState(category?.section ?? sections[0] ?? 'Інше');
  const [newSection, setNewSection] = useState('');
  const [priority, setPriority] = useState<Priority>(category?.priority ?? 5);
  const [active, setActive] = useState(category?.active ?? true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  // Суми за замовчуванням — 0 (нульовий старт). Поля порожні, з placeholder.
  const [minRaw, setMinRaw] = useState(category && category.minAmount > 0 ? String(toUah(category.minAmount)) : '');
  const [desiredRaw, setDesiredRaw] = useState(category && category.desiredAmount > 0 ? String(toUah(category.desiredAmount)) : '');
  const [regular, setRegular] = useState(category?.regular ?? false);
  const [rollover, setRollover] = useState(category?.rollover ?? false);
  const [usableAsSource, setUsableAsSource] = useState(category?.usableAsSource ?? priority !== 1);
  const [favorite, setFavorite] = useState(category?.favorite ?? false);
  const [notes, setNotes] = useState(category?.notes ?? '');
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const touch = () => setDirty(true);

  function requestClose() {
    if (dirty && !window.confirm('Є незбережені зміни. Закрити без збереження?')) return;
    onClose();
  }

  async function save() {
    if (saving) return; // захист від подвійного натискання
    if (!name.trim()) {
      toast({ message: 'Вкажіть назву категорії.' });
      return;
    }
    setSaving(true);
    try {
      const finalSection = newSection.trim() || section;
      await saveCategory({
        id: category?.id,
        name: name.trim(),
        emoji,
        section: finalSection,
        priority,
        active,
        minAmount: toMoney(parseUahInput(minRaw)),
        desiredAmount: toMoney(parseUahInput(desiredRaw)),
        regular,
        rollover,
        usableAsSource,
        favorite,
        notes: notes.trim(),
      });
      // «Збережено» показуємо ЛИШЕ після успішного завершення транзакції.
      toast({ message: 'Збережено' });
      setDirty(false);
      onSaved();
    } catch {
      toast({ message: 'Не вдалося зберегти. Спробуйте ще раз.' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Sheet open onClose={requestClose} title={isNew ? 'Нова категорія' : 'Редагувати категорію'}>
      <div className="field">
        <label>Назва</label>
        <input className="input" value={name} autoFocus onChange={(e) => { setName(e.target.value); touch(); }} placeholder="Напр., Продукти" />
      </div>

      <div className="field">
        <label>Emoji</label>
        <div className="chip-row">
          {EMOJI_CHOICES.map((e) => (
            <button key={e} className={`chip ${emoji === e ? 'selected' : ''}`} style={{ fontSize: 20 }} onClick={() => { setEmoji(e); touch(); }}>
              {e}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <label>Пріоритет</label>
        <select className="input" value={priority} onChange={(e) => { setPriority(Number(e.target.value) as Priority); touch(); }}>
          {([1, 2, 3, 4, 5, 6] as Priority[]).map((p) => (
            <option key={p} value={p}>{p}. {PRIORITY_LABELS[p]}</option>
          ))}
        </select>
      </div>

      <div className="field">
        <label>Розділ</label>
        <select className="input mb" value={section} onChange={(e) => { setSection(e.target.value); touch(); }}>
          {sections.map((s) => <option key={s} value={s}>{s}</option>)}
          {!sections.includes(section) && <option value={section}>{section}</option>}
        </select>
        <input className="input" placeholder="або новий розділ…" value={newSection} onChange={(e) => { setNewSection(e.target.value); touch(); }} />
      </div>

      <label className="row mb" style={{ cursor: 'pointer' }}>
        <span>Активна</span>
        <input type="checkbox" checked={active} onChange={(e) => { setActive(e.target.checked); touch(); }} />
      </label>

      <button className="btn block mb" onClick={() => setShowAdvanced((v) => !v)}>
        {showAdvanced ? 'Сховати додаткові параметри' : 'Додатково ▾'}
      </button>

      {showAdvanced && (
        <div className="card" style={{ background: 'var(--surface-2)' }}>
          <div className="grid-2">
            <div className="field">
              <label>Мінімальна сума, ₴</label>
              <input className="input" inputMode="decimal" value={minRaw} placeholder="0" onChange={(e) => { setMinRaw(e.target.value); touch(); }} />
            </div>
            <div className="field">
              <label>Бажана сума, ₴</label>
              <input className="input" inputMode="decimal" value={desiredRaw} placeholder="0" onChange={(e) => { setDesiredRaw(e.target.value); touch(); }} />
            </div>
          </div>
          <label className="row" style={{ padding: '6px 0', cursor: 'pointer' }}>
            <span className="small">Регулярна витрата</span>
            <input type="checkbox" checked={regular} onChange={(e) => { setRegular(e.target.checked); touch(); }} />
          </label>
          <label className="row" style={{ padding: '6px 0', cursor: 'pointer' }}>
            <span className="small">Переносити залишок на наступний місяць</span>
            <input type="checkbox" checked={rollover} onChange={(e) => { setRollover(e.target.checked); touch(); }} />
          </label>
          <label className="row" style={{ padding: '6px 0', cursor: 'pointer' }}>
            <span className="small">Можна брати як джерело переносу</span>
            <input type="checkbox" checked={usableAsSource} onChange={(e) => { setUsableAsSource(e.target.checked); touch(); }} />
          </label>
          <label className="row" style={{ padding: '6px 0', cursor: 'pointer' }}>
            <span className="small">Обрана (швидкий доступ)</span>
            <input type="checkbox" checked={favorite} onChange={(e) => { setFavorite(e.target.checked); touch(); }} />
          </label>
          <div className="field mt">
            <label>Замітка</label>
            <input className="input" value={notes} onChange={(e) => { setNotes(e.target.value); touch(); }} />
          </div>
        </div>
      )}

      <div className="row mt">
        <button className="btn" onClick={requestClose}>Скасувати</button>
        <button className="btn primary" style={{ flex: 1, marginLeft: 8 }} disabled={saving} onClick={save}>
          {saving ? 'Збереження…' : 'Зберегти категорію'}
        </button>
      </div>
    </Sheet>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/db';
import {
  archiveCategory,
  deleteCategorySafe,
  duplicateCategory,
  isCategoryInUse,
  moveCategory,
  restoreCategory,
  setCategoryActive,
} from '../../db/repositories';
import { useToast } from '../../components/ui';
import { CategoryForm } from './CategoryForm';
import { PRIORITY_LABELS, type Category, type Priority } from '../../domain/models';

const PRIORITY_HINT: Record<Priority, string> = {
  1: 'Не пропонується скорочувати автоматично',
  2: 'Щоденні базові витрати',
  3: 'Здоров’я, відновлення, стабільність',
  4: 'Резерви й довгострокові накопичення',
  5: 'Приємні, але необов’язкові витрати',
  6: 'Ігри, підписки, спонтанне',
};

export function CategoriesPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const cats = useLiveQuery(() => db.categories.orderBy('sortOrder').toArray(), []);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);

  const sections = useMemo(
    () => Array.from(new Set((cats ?? []).map((c) => c.section))).sort(),
    [cats],
  );

  const filtered = useMemo(() => {
    if (!cats) return [];
    return cats.filter((c) => {
      if (!showArchived && c.archived) return false;
      if (priorityFilter !== 'all' && c.priority !== priorityFilter) return false;
      if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [cats, showArchived, priorityFilter, search]);

  const byPriority = useMemo(() => {
    const map = new Map<Priority, Category[]>();
    for (const c of filtered) {
      if (!map.has(c.priority)) map.set(c.priority, []);
      map.get(c.priority)!.push(c);
    }
    for (const list of map.values()) list.sort((a, b) => a.sortOrder - b.sortOrder);
    return [...map.entries()].sort((a, b) => a[0] - b[0]);
  }, [filtered]);

  async function handleDelete(cat: Category) {
    const inUse = await isCategoryInUse(cat.id);
    if (inUse) {
      const result = await deleteCategorySafe(cat.id);
      toast({ message: 'Категорію заархівовано (вона вже в історії).' });
      void result;
    } else {
      await deleteCategorySafe(cat.id);
      toast({ message: 'Категорію видалено.' });
    }
    setMenuFor(null);
  }

  return (
    <>
      <div className="row">
        <button className="btn" onClick={() => navigate('/settings')} aria-label="Назад">←</button>
        <h1 style={{ flex: 1, margin: '0 0 0 10px' }}>Категорії та пріоритети</h1>
      </div>

      <div className="card">
        <input
          className="input mb"
          placeholder="Пошук категорії…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="chip-row mb">
          <button className={`chip ${priorityFilter === 'all' ? 'selected' : ''}`} onClick={() => setPriorityFilter('all')}>
            Усі
          </button>
          {([1, 2, 3, 4, 5, 6] as Priority[]).map((p) => (
            <button key={p} className={`chip ${priorityFilter === p ? 'selected' : ''}`} onClick={() => setPriorityFilter(p)}>
              {p}
            </button>
          ))}
        </div>
        <label className="row" style={{ cursor: 'pointer' }}>
          <span className="small">Показати архівні</span>
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
        </label>
      </div>

      <button className="btn primary block mb" onClick={() => setEditing('new')}>
        ＋ Додати категорію
      </button>

      {byPriority.map(([p, list]) => (
        <section key={p}>
          <div className="section-title">
            {p}. {PRIORITY_LABELS[p]} <span className="muted" style={{ textTransform: 'none' }}>· {PRIORITY_HINT[p]}</span>
          </div>
          {list.map((cat, i) => (
            <div key={cat.id} className="card" style={{ opacity: cat.archived ? 0.6 : cat.active ? 1 : 0.75 }}>
              <div className="row">
                <button
                  onClick={() => setEditing(cat)}
                  style={{ background: 'none', border: 'none', textAlign: 'left', flex: 1, color: 'inherit', padding: 0 }}
                >
                  <span style={{ fontWeight: 600 }}>{cat.emoji} {cat.name}</span>
                  <div className="small muted">
                    {cat.section}
                    {cat.archived ? ' · 🗄️ архів' : cat.active ? '' : ' · вимкнена'}
                    {cat.rollover ? ' · ↪ перенос' : ''}
                    {cat.favorite ? ' · ⭐' : ''}
                  </div>
                </button>
                <button className="btn sm ghost" aria-label="Дії" style={{ minWidth: 40 }} onClick={() => setMenuFor(menuFor === cat.id ? null : cat.id)}>
                  ⋯
                </button>
              </div>

              {menuFor === cat.id && (
                <div className="chip-row mt">
                  <button className="chip" onClick={() => { setEditing(cat); setMenuFor(null); }}>✏️ Редагувати</button>
                  <button className="chip" onClick={async () => { await duplicateCategory(cat.id); toast({ message: 'Дубльовано' }); setMenuFor(null); }}>⧉ Дублювати</button>
                  {i > 0 && <button className="chip" onClick={() => moveCategory(cat.id, 'up')}>↑ Вище</button>}
                  {i < list.length - 1 && <button className="chip" onClick={() => moveCategory(cat.id, 'down')}>↓ Нижче</button>}
                  {cat.archived ? (
                    <button className="chip" onClick={async () => { await restoreCategory(cat.id); toast({ message: 'Відновлено' }); setMenuFor(null); }}>♻️ Відновити</button>
                  ) : (
                    <>
                      <button className="chip" onClick={async () => { await setCategoryActive(cat.id, !cat.active); setMenuFor(null); }}>
                        {cat.active ? '⏸️ Вимкнути' : '▶️ Увімкнути'}
                      </button>
                      <button className="chip" onClick={async () => { await archiveCategory(cat.id); toast({ message: 'Заархівовано' }); setMenuFor(null); }}>🗄️ Архівувати</button>
                    </>
                  )}
                  <button className="chip" style={{ color: 'var(--danger)' }} onClick={() => handleDelete(cat)}>🗑️ Видалити</button>
                </div>
              )}
            </div>
          ))}
        </section>
      ))}

      {filtered.length === 0 && (
        <div className="empty"><div className="emoji">🗂️</div><p>Категорій не знайдено.</p></div>
      )}

      {editing && (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          sections={sections}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
    </>
  );
}

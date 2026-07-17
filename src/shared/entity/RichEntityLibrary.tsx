import { useState } from 'react';
import { EntityImage } from './EntityImage';
import { RichEntityDetail } from './RichEntityDetail';
import type { EntityListItemVM, EntityDetailVM, EntityActionsVM, FilterConfig } from './types';

/**
 * Rich entity library — reuses the main campaign's neutral `entity-library-*`
 * visual language (search, filters, thumbnailed rows, detail panel) but is
 * fully campaign-agnostic: it renders view-models and calls callbacks. The
 * main campaign is NOT wired to this yet; new campaigns are.
 */
export function RichEntityLibrary({
  title, items, selectedId, onSelect, search, onSearch, filters, onCreate, createLabel,
  detail, actions, isPlayer = false, emptyLabel = 'Пусто.',
}: {
  title: string;
  items: EntityListItemVM[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (v: string) => void;
  filters?: FilterConfig[];
  onCreate?: () => void;
  createLabel?: string;
  detail: EntityDetailVM | null;
  actions?: EntityActionsVM;
  isPlayer?: boolean;
  emptyLabel?: string;
}) {
  // On phones the list and detail can't sit side-by-side; the detail would
  // render below the entire (often long) list and be effectively invisible.
  // Tapping a row opens the detail as a full-screen sheet over the list; a
  // back button returns to the list. On desktop both panels show and this
  // flag is ignored by the CSS. See sharedEntity.css `.shared-lib-detail`.
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  return (
    <div className="entity-library-layout shared-lib">
      <aside className="entity-library-list">
        <div className="shared-lib-listhead">
          <input type="search" placeholder="Поиск…" value={search} onChange={(e) => onSearch(e.target.value)} />
          {!isPlayer && onCreate && <button className="atlas-btn small" onClick={onCreate}>+ {createLabel ?? 'Создать'}</button>}
        </div>
        {filters?.map((f) => (
          <select key={f.key} className="entity-library-filter" value={f.value} onChange={(e) => f.onChange(e.target.value)}>
            {f.options.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        ))}
        <div className="shared-lib-count">{items.length} · {title}</div>
        {items.length === 0 ? (
          <p className="atlas-empty">{emptyLabel}</p>
        ) : items.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`entity-library-row shared-lib-row${selectedId === it.id ? ' active' : ''}`}
            onClick={() => { onSelect(it.id); setMobileDetailOpen(true); }}
          >
            <EntityImage src={it.imageUrl} name={it.title} size={40} />
            <div className="entity-library-row-main">
              <strong>{it.title}</strong>
              {it.subtitle && <span className="shared-lib-sub">{it.subtitle}</span>}
              <span className="shared-lib-badges">
                {it.placed && <span className="shared-badge ok">● на карте</span>}
                {it.revealed && <span className="shared-badge">👁 игрокам</span>}
              </span>
            </div>
          </button>
        ))}
      </aside>

      <section className={`entity-library-detail shared-lib-detail${mobileDetailOpen ? ' mobile-open' : ''}`}>
        <button type="button" className="shared-lib-back" onClick={() => setMobileDetailOpen(false)}>← Список</button>
        {detail ? <RichEntityDetail vm={detail} actions={actions} isPlayer={isPlayer} />
          : <p className="shared-muted" style={{ padding: 16 }}>Выберите карточку слева, чтобы увидеть детали.</p>}
      </section>
    </div>
  );
}

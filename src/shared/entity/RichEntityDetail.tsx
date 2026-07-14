import { useState } from 'react';
import { ImageLightbox } from '../../features/embedded-dm-companion/ImageLightbox';
import { EntityImage } from './EntityImage';
import type { EntityDetailVM, EntityActionsVM } from './types';

/**
 * Rich entity detail panel — image, title, subtitle, tags, key fields,
 * relation counters + linked sections, and actions. Fully neutral: it renders
 * whatever the caller maps into an EntityDetailVM and calls the provided
 * callbacks. Player mode hides DM-only content (dmNotes) and edit/place/delete.
 */
export function RichEntityDetail({ vm, actions, isPlayer = false }: { vm: EntityDetailVM; actions?: EntityActionsVM; isPlayer?: boolean }) {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  return (
    <div className="shared-detail">
      {vm.imageUrl && (
        <>
          <button type="button" className="shared-detail-hero-button" onClick={() => setLightboxOpen(true)} aria-label={`Открыть изображение: ${vm.title}`}>
            <img className="shared-detail-hero" src={vm.imageUrl} alt={vm.title} />
          </button>
          {lightboxOpen && (
            <ImageLightbox
              image={{ src: vm.imageUrl, title: vm.title }}
              onClose={() => setLightboxOpen(false)}
            />
          )}
        </>
      )}
      <div className="shared-detail-head">
        {!vm.imageUrl && <EntityImage name={vm.title} size={52} />}
        <div style={{ minWidth: 0 }}>
          <div className="shared-detail-kind">{vm.kindLabel}</div>
          <h2 className="shared-detail-title">{vm.title}</h2>
          {vm.subtitle && <div className="shared-detail-sub">{vm.subtitle}</div>}
        </div>
      </div>

      {vm.tags && vm.tags.length > 0 && (
        <div className="shared-tags">{vm.tags.map((t) => <span key={t} className="shared-tag">{t}</span>)}</div>
      )}

      {actions && (actions.onOpenWindow || actions.onEdit || (!isPlayer && (actions.onPlace || actions.onToggleReveal || actions.onPresent || actions.onDelete))) && (
        <div className="shared-detail-actions">
          {actions.onOpenWindow && <button className="atlas-btn ghost small" onClick={actions.onOpenWindow}>Открыть в окне</button>}
          {actions.onEdit && <button className="atlas-btn small" onClick={actions.onEdit}>Редактировать</button>}
          {!isPlayer && (
            <>
              {actions.onPlace && !actions.placed && <button className="atlas-btn ghost small" onClick={actions.onPlace}>Разместить на карте</button>}
              {actions.onPresent && (
                <button className="atlas-btn ghost small" onClick={actions.onPresent}>
                  {actions.presenting ? '🔴 Скрыть у игроков' : '📺 Показать игрокам'}
                </button>
              )}
              {actions.onToggleReveal && (
                <button className="atlas-btn ghost small" onClick={actions.onToggleReveal}>
                  {actions.revealed ? '👁 Показано игрокам' : '🚫 Показать игрокам'}
                </button>
              )}
              {actions.onDelete && <button className="atlas-btn danger small" onClick={actions.onDelete}>Удалить</button>}
            </>
          )}
        </div>
      )}

      {vm.fields && vm.fields.length > 0 && (
        <div className="shared-fields">
          {vm.fields.map((f) => <div key={f.label} className="shared-field"><span className="k">{f.label}</span><span className="v">{f.value || '—'}</span></div>)}
        </div>
      )}

      {vm.counters && vm.counters.length > 0 && (
        <div className="shared-counters">
          {vm.counters.map((c) => <span key={c.key} className="shared-counter">{c.label}: <strong>{c.value}</strong></span>)}
        </div>
      )}

      {vm.description && (
        <div className="shared-detail-block">
          <h4>Описание</h4>
          <p style={{ whiteSpace: 'pre-wrap' }}>{vm.description}</p>
        </div>
      )}

      {!isPlayer && vm.dmNotes && (
        <div className="shared-detail-block">
          <h4>DM-заметки (скрыто от игроков)</h4>
          <p style={{ whiteSpace: 'pre-wrap', color: 'var(--gold-soft)' }}>{vm.dmNotes}</p>
        </div>
      )}

      {vm.relations?.map((sec) => (
        (sec.items.length > 0 || (!isPlayer && sec.onAdd)) && (
          <div key={sec.key} className="shared-detail-block">
            <div className="shared-rel-head">
              <h4>{sec.label} <span className="shared-rel-count">{sec.items.length}</span></h4>
              {!isPlayer && sec.onAdd && <button className="atlas-btn ghost small" onClick={sec.onAdd}>{sec.addLabel ?? '+ Добавить'}</button>}
            </div>
            {sec.items.length === 0 ? <p className="shared-muted">—</p> : (
              <div className="shared-rel-list">
                {sec.items.map((it) => (
                  <button key={it.id} type="button" className="shared-rel-chip" onClick={it.onOpen} disabled={!it.onOpen}>
                    {it.imageUrl ? (
                      <img className="shared-rel-thumb" src={it.imageUrl} alt="" />
                    ) : (
                      <EntityImage name={it.label} size={42} />
                    )}
                    <span className="shared-rel-main">
                      <strong>{it.label}</strong>
                      {it.subtitle && <span>{it.subtitle}</span>}
                      {it.meta && <span>{it.meta}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )
      ))}
    </div>
  );
}

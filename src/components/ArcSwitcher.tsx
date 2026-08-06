import { useState } from 'react';
import type { Timeline } from '../types';

/**
 * Universal arc switcher — ONE component driving both Greyholm's Timeline
 * list and every user campaign's `arcs` array (same `Timeline` type, see
 * src/state/userCampaignStore.tsx's `resolveArcs()`). No campaign-specific
 * copy: the parent supplies data + callbacks bound to whichever store owns
 * the campaign, this component only renders and dispatches user intent.
 */
export interface ArcSwitcherProps {
  arcs: Timeline[];
  currentArcId: string | undefined;
  isEditMode: boolean;
  /** Disables switching TO this arc (e.g. Greyholm's Arc 2 in Player View
   * before the DM has revealed it). Never disables the currently active arc. */
  lockedArcId?: string;
  onSwitch: (id: string) => void;
  onCreate: (title: string) => void;
  onRename: (id: string, title: string) => void;
  onReorder: (id: string, neighborId: string) => void;
  onArchive: (id: string) => void;
  onRestore: (id: string) => void;
  /** Returns true if this arc may currently be safely deleted (caller owns
   * the actual safety rule — e.g. "never the seed arc, never referenced"). */
  canDelete: (id: string) => boolean;
  onDelete: (id: string) => void;
}

export function ArcSwitcher({
  arcs, currentArcId, isEditMode, lockedArcId,
  onSwitch, onCreate, onRename, onReorder, onArchive, onRestore, canDelete, onDelete,
}: ArcSwitcherProps) {
  const [showArchived, setShowArchived] = useState(false);
  const visible = [...arcs].filter((a) => !a.archived).sort((a, b) => a.order - b.order);
  const archived = arcs.filter((a) => a.archived);

  return (
    <>
      <div className="segmented" role="group" aria-label="Текущая арка" data-testid="arc-switcher">
        {visible.map((t, index) => {
          const isCurrent = t.id === currentArcId;
          const disabled = t.id === lockedArcId;
          const deletable = isEditMode && !isCurrent && canDelete(t.id);
          return (
            <span key={t.id} className="segmented-option-wrap">
              <button
                type="button"
                className={`segmented-option${isCurrent ? ' active' : ''}`}
                disabled={disabled}
                data-testid={`arc-switch-${t.id}`}
                onClick={() => onSwitch(t.id)}
                onDoubleClick={() => {
                  if (!isEditMode) return;
                  const title = window.prompt('Новое название арки:', t.title);
                  if (!title || !title.trim() || title.trim() === t.title) return;
                  onRename(t.id, title.trim());
                }}
                title={isEditMode ? 'Двойной клик — переименовать' : t.title}
              >
                {t.title}
              </button>
              {isEditMode && index > 0 && (
                <button type="button" className="segmented-option-reorder" title="Сдвинуть влево"
                  aria-label={`Сдвинуть арку ${t.title} влево`} onClick={() => onReorder(t.id, visible[index - 1].id)}>
                  ‹
                </button>
              )}
              {isEditMode && index < visible.length - 1 && (
                <button type="button" className="segmented-option-reorder" title="Сдвинуть вправо"
                  aria-label={`Сдвинуть арку ${t.title} вправо`} onClick={() => onReorder(t.id, visible[index + 1].id)}>
                  ›
                </button>
              )}
              {isEditMode && !isCurrent && (
                <button type="button" className="segmented-option-delete"
                  title={`Архивировать арку «${t.title}» (обратимо — скрывает, не удаляет)`}
                  aria-label={`Архивировать арку ${t.title}`} onClick={() => onArchive(t.id)}>
                  ⤓
                </button>
              )}
              {deletable && (
                <button type="button" className="segmented-option-delete"
                  title={`Удалить арку «${t.title}»`} aria-label={`Удалить арку ${t.title}`}
                  onClick={() => onDelete(t.id)}>
                  ×
                </button>
              )}
            </span>
          );
        })}
        {isEditMode && (
          <button type="button" className="segmented-option segmented-option-add" title="Создать новую арку"
            data-testid="arc-create"
            onClick={() => {
              const title = window.prompt('Название новой арки:');
              if (!title || !title.trim()) return;
              onCreate(title.trim());
            }}>
            + Арка
          </button>
        )}
        {isEditMode && archived.length > 0 && (
          <button type="button" className="segmented-option segmented-option-archived-toggle"
            title="Показать/скрыть архивные арки" onClick={() => setShowArchived((v) => !v)}>
            Архив ({archived.length})
          </button>
        )}
      </div>
      {isEditMode && showArchived && (
        <div className="segmented segmented-archived" role="group" aria-label="Архивные арки">
          {archived.map((t) => (
            <span key={t.id} className="segmented-option-wrap">
              <span className="segmented-option segmented-option-archived-label">{t.title}</span>
              <button type="button" className="segmented-option-reorder" title={`Восстановить арку «${t.title}»`}
                aria-label={`Восстановить арку ${t.title}`} onClick={() => onRestore(t.id)}>
                ↺
              </button>
            </span>
          ))}
        </div>
      )}
    </>
  );
}

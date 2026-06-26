/**
 * Pure-props extraction of the Quick Pin draft form from MapWorkspacePage's
 * edit-mode toolbar area. The draft itself, the "armed, waiting for a map
 * click" hint, and the save/cancel logic all stay in MapWorkspacePage — this
 * component only renders the controlled form once a draft exists.
 */
export interface QuickPinDraft {
  x: number;
  y: number;
  title: string;
  visibleInPlayerView: boolean;
}

export interface QuickPinPanelProps {
  isEditMode: boolean;
  isArming: boolean;
  draft: QuickPinDraft | null;
  onDraftChange: (next: QuickPinDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}

export function QuickPinPanel({ isEditMode, isArming, draft, onDraftChange, onSave, onCancel }: QuickPinPanelProps) {
  if (!isEditMode) return null;
  return (
    <>
      {isArming && <p className="placement-hint">Кликните по карте, чтобы поставить Quick Pin.</p>}
      {draft && (
        <div className="route-draft-form">
          <strong>Quick Pin</strong>
          <label>
            Название
            <input
              type="text"
              autoFocus
              value={draft.title}
              placeholder="Например: Спросить про кузнеца"
              onChange={(e) => onDraftChange({ ...draft, title: e.target.value })}
            />
          </label>
          <label className="reveal-toggle">
            <input
              type="checkbox"
              checked={draft.visibleInPlayerView}
              onChange={(e) => onDraftChange({ ...draft, visibleInPlayerView: e.target.checked })}
            />
            Видимо игрокам
          </label>
          <div className="actions">
            <button onClick={onSave}>Сохранить</button>
            <button onClick={onCancel}>Отмена</button>
          </div>
        </div>
      )}
    </>
  );
}

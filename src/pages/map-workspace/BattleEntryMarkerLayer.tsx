import type { BattleEntry } from '../../types';

/**
 * Pure presentational extraction of BattleEntry markers (Stage 5A, Step 14)
 * from MapWorkspacePage's map canvas — same "props in, markup out" style as
 * PartyMarker.tsx. The caller (MapWorkspacePage) is responsible for computing
 * which entries to pass in: DM modes pass the raw per-map BattleEntry list,
 * Player Safe/Observer-equivalent presets MUST pass the output of
 * getPlayerSafeBattleEntries() — this component never reads
 * store.battleEntriesById itself and never decides visibility on its own.
 *
 * Visually distinct from .placement-marker / .map-event-marker /
 * .movable-entity-marker by using a sword/crossed-swords glyph and its own
 * `.battle-entry-marker` class family with one modifier per BattleEntryStatus
 * plus `--selected`. Entries with no `position` are not rendered (mirrors how
 * MovableEntity markers skip entities with no currentPosition).
 */
export interface BattleEntryMarkerLayerProps {
  entries: BattleEntry[];
  selectedEntryId: string | null;
  /** True only in DM modes — gates rendering the faint/dashed --hidden variant
   * for status==='hidden' entries; player-facing callers should never pass
   * entries with status==='hidden' in the first place (getPlayerSafeBattleEntries
   * already excludes them), but this is a second guard against ever rendering
   * a hidden marker in a non-DM context. */
  isDmContext: boolean;
  onSelect: (entryId: string) => void;
}

const STATUS_BADGE: Record<BattleEntry['status'], string> = {
  prepared: '⚔',
  available: '⚔',
  active: '⚔',
  completed: '✓',
  disabled: '⊘',
  hidden: '⚔',
};

export function BattleEntryMarkerLayer({ entries, selectedEntryId, isDmContext, onSelect }: BattleEntryMarkerLayerProps) {
  return (
    <>
      {entries
        .filter((entry) => !!entry.position && (isDmContext || entry.status !== 'hidden'))
        .map((entry) => {
          const isSelected = entry.id === selectedEntryId;
          const className = [
            'battle-entry-marker',
            `battle-entry-marker--${entry.status}`,
            isSelected && 'battle-entry-marker--selected',
          ]
            .filter(Boolean)
            .join(' ');
          return (
            <div
              key={entry.id}
              className={className}
              style={{ left: `${(entry.position?.x ?? 0) * 100}%`, top: `${(entry.position?.y ?? 0) * 100}%` }}
              title={entry.name}
              onClick={(e) => {
                e.stopPropagation();
                onSelect(entry.id);
              }}
            >
              {STATUS_BADGE[entry.status]}
            </div>
          );
        })}
    </>
  );
}

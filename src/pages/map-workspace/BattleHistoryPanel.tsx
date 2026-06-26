import type { BattleEntry, CampaignEvent } from '../../types';
import { useCampaignStore } from '../../state/campaignStore';

/**
 * Battle Event History (Stage 5B, Step 4) — a compact, filtered list of
 * CampaignEvents linked to one BattleEntry, extracted out of
 * BattleEntryPanel.tsx to keep that file from growing unwieldy. Not a full
 * Event Manager: only shows events already linked via
 * `linkedBattleEntryIds` (new in Stage 5B) plus, defensively, any older
 * battle events that predate that field and only carry the entry's
 * `sourceLocationStateId`/linked quest/npc/enemy ids — same "don't lose
 * pre-existing data" posture as the rest of this codebase's additive
 * changes. Actions here reuse existing store actions
 * (updateCampaignEvent/archiveCampaignEvent) — no new mutation path.
 */
export interface BattleHistoryPanelProps {
  entry: BattleEntry;
}

const STATUS_LABELS: Record<CampaignEvent['status'], string> = {
  planned: 'Запланировано',
  active: 'Идёт',
  resolved: 'Завершено',
  cancelled: 'Отменено',
  hidden: 'Скрыто',
};

function isLinkedToEntry(ev: CampaignEvent, entry: BattleEntry): boolean {
  if (ev.type !== 'battle') return false;
  if (ev.linkedBattleEntryIds?.includes(entry.id)) return true;
  // Defensive fallback for events created before linkedBattleEntryIds
  // existed (Stage 5A's createBattleEvent flow): match on the same
  // location/timeline as a best-effort heuristic only, never as a strong
  // guarantee — this can over/under-match if multiple entries share a
  // location, which is an acknowledged limitation, not a bug to silently fix
  // here.
  if (!ev.linkedBattleEntryIds && ev.timelineId === entry.timelineId && entry.sourceLocationStateId) {
    return !!ev.linkedLocationStateIds?.includes(entry.sourceLocationStateId);
  }
  return false;
}

export function BattleHistoryPanel({ entry }: BattleHistoryPanelProps) {
  const store = useCampaignStore();
  const events = Object.values(store.eventsById)
    .filter((ev) => isLinkedToEntry(ev, entry))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const active = events.filter((ev) => ev.status === 'active' || ev.status === 'planned');
  const resolved = events.filter((ev) => ev.status === 'resolved' || ev.status === 'cancelled');

  function renderEvent(ev: CampaignEvent) {
    return (
      <li key={ev.id}>
        <strong>{ev.name}</strong>
        <span className="status-badge"> {STATUS_LABELS[ev.status]}</span>
        {ev.visibleInPlayerView && <span className="status-badge">видно игрокам</span>}
        {ev.date && (
          <span className="entity-card-sub">
            {' '}
            · {ev.date.day} {ev.date.month} {ev.date.year}
          </span>
        )}
        {ev.description && <p className="muted">{ev.description}</p>}
        <div className="actions">
          {ev.status !== 'resolved' && (
            <button onClick={() => store.updateCampaignEvent(ev.id, { status: 'resolved' })}>Отметить завершённым</button>
          )}
          {ev.status !== 'cancelled' && (
            <button onClick={() => store.updateCampaignEvent(ev.id, { status: 'cancelled' })}>Отменить</button>
          )}
        </div>
      </li>
    );
  }

  return (
    <div className="session-panel-section">
      <p className="side-panel-subheading">История боя ({events.length})</p>
      {active.length > 0 && (
        <>
          <p className="muted">Текущие/запланированные:</p>
          <ul className="route-list">{active.map(renderEvent)}</ul>
        </>
      )}
      {resolved.length > 0 && (
        <>
          <p className="muted">Завершённые/отменённые:</p>
          <ul className="route-list">{resolved.map(renderEvent)}</ul>
        </>
      )}
      {events.length === 0 && <p className="muted">Для этой сцены пока нет связанных событий боя.</p>}
    </div>
  );
}

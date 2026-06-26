import { useState } from 'react';
import type { BattleEntry, CampaignEvent, LocationStatus } from '../../types';
import { useCampaignStore } from '../../state/campaignStore';
import type { BattleReturnParams } from './battleReturn';
import { BATTLE_RETURN_LOCATION_STATUS_MAP, type BattleReturnLocationStatus } from './battleMapContract';

/**
 * Battle Consequences Panel (Stage 5A Step 10, hardened in Stage 5B Step 3) —
 * a manual, DM-driven panel for recording what happened after a battle.
 * Every consequence here is an explicit DM click; nothing auto-imports enemy
 * HP/results and nothing auto-resolves a quest. Mirrors the `faction_shift`
 * CampaignEvent precedent from Stage 4B: a `battle` event is only ever
 * created from an explicit button here, never implicitly. Stage 5B adds: a
 * single "Применить последствия боя" action bundling event creation +
 * location status + completion + time advance behind one explicit click,
 * and the ability to be pre-filled (never auto-applied) from a battle-return
 * URL (see battleReturn.ts / MapWorkspacePage.tsx's return-flow wiring).
 */
export interface BattleConsequencesDraft {
  summary: string;
  result: 'completed' | 'retreated' | 'failed' | 'cancelled' | 'unknown';
  locationStatusPatch?: LocationStatus;
  createBattleEvent: boolean;
  markBattleCompleted: boolean;
  visibleInPlayerView: boolean;
  advanceTime: { mode: 'none' | 'phase' | 'day' };
  aftermathNotes: string;
}

export interface BattleConsequencesPanelProps {
  entry: BattleEntry;
  /** Current calendar snapshot for the entry's timeline — used to stamp the
   * created event's date/time, exactly like createFactionShiftEvent's sibling
   * flows already do elsewhere in MapWorkspacePage. */
  calendarNow: { day: number; month: string; year: number; timeOfDay: CampaignEvent['timeOfDay'] };
  onClose: () => void;
  onEventCreated?: (event: CampaignEvent) => void;
  /** When the panel was opened in response to a parsed battle-return URL
   * (Stage 5B Step 2), the caller passes the parsed params here so the draft
   * starts pre-filled for DM review — nothing is applied until the DM clicks
   * "Применить последствия боя". Cleared by the caller once applied. */
  initialReturnParams?: BattleReturnParams | null;
  /** Called after a successful "Применить последствия боя" so the caller can
   * clear battle-return URL params. Not called for the legacy granular
   * buttons below, which keep their Stage 5A behavior. */
  onConsequencesApplied?: () => void;
}

const LOCATION_STATUS_OPTIONS: LocationStatus[] = ['unknown', 'known', 'visited', 'hidden', 'destroyed', 'contested'];
const LOCATION_STATUS_LABELS: Record<LocationStatus, string> = {
  unknown: 'Неизвестна',
  known: 'Известна',
  visited: 'Посещена',
  hidden: 'Скрыта',
  destroyed: 'Разрушена',
  contested: 'Спорная',
};

const RESULT_LABELS: Record<BattleConsequencesDraft['result'], string> = {
  completed: 'Завершён победой/успешно',
  retreated: 'Партия отступила',
  failed: 'Партия проиграла',
  cancelled: 'Бой отменён',
  unknown: 'Неизвестно',
};

/**
 * Maps the battle-map-vtt app's free-text `locationStatus` return value onto
 * this app's real LocationStatus union. The two apps may use different
 * vocabularies (see BattleReturnParams.locationStatus's doc comment in
 * battleReturn.ts), so this is a best-effort mapping rather than a type
 * coercion — anything unrecognized is dropped (returns undefined) rather
 * than guessed at, since a silently-wrong location status is worse than no
 * pre-fill at all.
 *
 * Stage 5C, Step 9: the actual mapping table now lives in
 * battleMapContract.ts's `BATTLE_RETURN_LOCATION_STATUS_MAP` (single source
 * of truth) — this is a local Campaign Map compatibility mapping until
 * battle-map-vtt publishes a shared contract.
 */
function mapReturnLocationStatus(raw: string | undefined): LocationStatus | undefined {
  if (!raw) return undefined;
  if (raw in BATTLE_RETURN_LOCATION_STATUS_MAP) {
    return BATTLE_RETURN_LOCATION_STATUS_MAP[raw as BattleReturnLocationStatus];
  }
  return LOCATION_STATUS_OPTIONS.includes(raw as LocationStatus) ? (raw as LocationStatus) : undefined;
}

function draftFromReturnParams(params: BattleReturnParams | null | undefined): Partial<BattleConsequencesDraft> {
  if (!params) return {};
  return {
    ...(params.battleSummary ? { summary: params.battleSummary } : {}),
    ...(params.battleResult ? { result: params.battleResult } : {}),
    ...(mapReturnLocationStatus(params.locationStatus) ? { locationStatusPatch: mapReturnLocationStatus(params.locationStatus) } : {}),
    ...(params.completed !== undefined ? { markBattleCompleted: params.completed } : {}),
    ...(params.visibleInPlayerView !== undefined ? { visibleInPlayerView: params.visibleInPlayerView } : {}),
  };
}

const DEFAULT_DRAFT: BattleConsequencesDraft = {
  summary: '',
  result: 'unknown',
  locationStatusPatch: undefined,
  createBattleEvent: true,
  markBattleCompleted: true,
  visibleInPlayerView: false,
  advanceTime: { mode: 'none' },
  aftermathNotes: '',
};

export function BattleConsequencesPanel({
  entry,
  calendarNow,
  onClose,
  onEventCreated,
  initialReturnParams,
  onConsequencesApplied,
}: BattleConsequencesPanelProps) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState<BattleConsequencesDraft>({
    ...DEFAULT_DRAFT,
    ...draftFromReturnParams(initialReturnParams),
  });
  const [created, setCreated] = useState(false);
  const [applied, setApplied] = useState(false);
  const [skippedNotes, setSkippedNotes] = useState<string[]>([]);

  // Legacy Stage 5A granular controls — kept working as-is alongside the new
  // bundled action below, since they're already wired into existing DM
  // muscle memory and nothing here requires removing them.
  const [legacySummary, setLegacySummary] = useState('');
  const [legacyPlayerVisible, setLegacyPlayerVisible] = useState(false);
  const [legacyLocationStatusDraft, setLegacyLocationStatusDraft] = useState<LocationStatus | ''>('');

  function createBattleEvent(summaryText: string, makePlayerVisible: boolean, status: CampaignEvent['status']) {
    const now = new Date().toISOString();
    const event: CampaignEvent = {
      id: `event-${Date.now()}`,
      timelineId: entry.timelineId,
      mapId: entry.sourceMapId,
      mapLevel: entry.mapLevel,
      position: entry.position,
      name: `Бой завершён: ${entry.name}`,
      type: 'battle',
      description: summaryText || undefined,
      date: { day: calendarNow.day, month: calendarNow.month, year: calendarNow.year },
      timeOfDay: calendarNow.timeOfDay,
      linkedLocationStateIds: entry.sourceLocationStateId ? [entry.sourceLocationStateId] : undefined,
      linkedNpcIds: entry.linkedNpcIds,
      linkedQuestIds: entry.linkedQuestIds,
      linkedEnemyIds: entry.linkedEnemyIds,
      linkedBattleEntryIds: [entry.id],
      // Default off — same "explicit DM action required" posture as every
      // other event-creation flow in this codebase (faction_shift, session
      // quick events, etc); the DM toggle flips this on deliberately.
      visibleInPlayerView: makePlayerVisible,
      status,
      createdAt: now,
      updatedAt: now,
    };
    store.addCampaignEvent(event);
    onEventCreated?.(event);
    return event;
  }

  // --- Legacy Stage 5A actions (unchanged behavior) ---
  function legacyMarkCompletedAndCreateEvent() {
    store.markBattleEntryCompleted(entry.id);
    createBattleEvent(legacySummary, legacyPlayerVisible, 'resolved');
    setCreated(true);
  }
  function legacyCreateEventOnly() {
    createBattleEvent(legacySummary, legacyPlayerVisible, 'resolved');
    setCreated(true);
  }
  function legacyApplyLocationStatus() {
    if (!entry.sourceLocationStateId || !legacyLocationStatusDraft) return;
    store.setLocationStatus(entry.sourceLocationStateId, legacyLocationStatusDraft);
  }

  // --- Stage 5B bundled apply action ---
  function applyConsequences() {
    const skipped: string[] = [];

    if (draft.markBattleCompleted) {
      store.markBattleEntryCompleted(entry.id);
    }

    let createdEvent: CampaignEvent | null = null;
    if (draft.createBattleEvent) {
      const fullDescription = [draft.summary, draft.aftermathNotes].filter(Boolean).join('\n\n');
      const status: CampaignEvent['status'] = draft.result === 'cancelled' ? 'cancelled' : 'resolved';
      createdEvent = createBattleEvent(fullDescription, draft.visibleInPlayerView, status);
    }

    if (draft.locationStatusPatch) {
      if (entry.sourceLocationStateId) {
        store.setLocationStatus(entry.sourceLocationStateId, draft.locationStatusPatch);
      } else {
        skipped.push('Статус локации не применён: у сцены нет связанной локации.');
      }
    }

    // Player-safe summary: only ever a deliberate DM opt-in via the toggle,
    // and only ever fed from the draft summary text itself when the DM has
    // explicitly turned the toggle on for THIS apply — never reused silently
    // on a later edit. Mirrors FactionZone's description/playerSafeDescription
    // split: visibleInPlayerView true does not imply description becomes
    // player-safe automatically anywhere else in this codebase either.
    if (draft.visibleInPlayerView && draft.summary.trim()) {
      store.updateBattleEntry(entry.id, { playerSafeSummary: draft.summary.trim(), visibleInPlayerView: true });
    } else if (draft.visibleInPlayerView) {
      store.updateBattleEntry(entry.id, { visibleInPlayerView: true });
    }

    if (draft.advanceTime.mode === 'phase') {
      store.advanceTimePhase(entry.timelineId);
    } else if (draft.advanceTime.mode === 'day') {
      store.advanceDay(entry.timelineId);
    }

    setSkippedNotes(skipped);
    setApplied(true);
    if (createdEvent) setCreated(true);
    onConsequencesApplied?.();
  }

  return (
    <div className="battle-entry-panel card">
      <div className="session-panel-header">
        <h3>Последствия боя: {entry.name}</h3>
        <button onClick={onClose}>Закрыть</button>
      </div>

      {initialReturnParams && (
        <p className="form-error battle-return-detected">
          Обнаружен возврат с поля боя — проверьте последствия перед сохранением.
        </p>
      )}

      <div className="session-panel-section">
        <label>
          Итог боя (заметка ДМ)
          <textarea
            rows={4}
            value={draft.summary}
            placeholder="Что произошло, кто выжил, что нашли…"
            onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
          />
        </label>
        <label>
          Результат боя
          <select value={draft.result} onChange={(e) => setDraft({ ...draft, result: e.target.value as BattleConsequencesDraft['result'] })}>
            {(Object.keys(RESULT_LABELS) as BattleConsequencesDraft['result'][]).map((r) => (
              <option key={r} value={r}>
                {RESULT_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <label className="reveal-toggle">
          <input
            type="checkbox"
            checked={draft.markBattleCompleted}
            onChange={(e) => setDraft({ ...draft, markBattleCompleted: e.target.checked })}
          />
          Отметить сцену завершённой
        </label>
        <label className="reveal-toggle">
          <input
            type="checkbox"
            checked={draft.createBattleEvent}
            onChange={(e) => setDraft({ ...draft, createBattleEvent: e.target.checked })}
          />
          Создать событие боя
        </label>
        <label className="reveal-toggle">
          <input
            type="checkbox"
            checked={draft.visibleInPlayerView}
            onChange={(e) => setDraft({ ...draft, visibleInPlayerView: e.target.checked })}
          />
          Сделать итог видимым игрокам (всё ещё отдельное явное действие ДМ)
        </label>
      </div>

      <div className="session-panel-section">
        <p className="side-panel-subheading">Статус локации</p>
        {entry.sourceLocationStateId ? (
          <label>
            Новый статус локации (необязательно)
            <select
              value={draft.locationStatusPatch ?? ''}
              onChange={(e) => setDraft({ ...draft, locationStatusPatch: (e.target.value || undefined) as LocationStatus | undefined })}
            >
              <option value="">— не менять —</option>
              {LOCATION_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {LOCATION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="muted">
            У этой боевой сцены нет связанной локации. Последствие статуса локации применить нельзя. TODO(stage-5c):
            привязать локацию постфактум прямо из этой панели — требует доступа к "текущей выбранной локации"
            MapWorkspacePage без большого рефакторинга, не сделано в этом проходе.
          </p>
        )}
      </div>

      <div className="session-panel-section">
        <p className="side-panel-subheading">
          Связи (только запись в событие в этом MVP): квестов {entry.linkedQuestIds?.length ?? 0} · NPC{' '}
          {entry.linkedNpcIds?.length ?? 0} · врагов {entry.linkedEnemyIds?.length ?? 0} · заготовок энкаунтера{' '}
          {entry.encounterPresetIds?.length ?? 0}
        </p>
        {entry.linkedQuestIds && entry.linkedQuestIds.length > 0 && (
          <p className="session-panel-row">
            {entry.linkedQuestIds.map((id) => (
              <span key={id} className="status-badge">
                {id}
              </span>
            ))}
          </p>
        )}
        <label>
          Заметки о последствиях (попадут в описание события)
          <textarea
            rows={3}
            value={draft.aftermathNotes}
            placeholder="Квест/NPC обновления записываются только в текст события в этом MVP — без автоматического изменения статусов."
            onChange={(e) => setDraft({ ...draft, aftermathNotes: e.target.value })}
          />
        </label>
        <p className="muted">Обновления квестов/NPC фиксируются только в событии боя в этом MVP.</p>
      </div>

      <div className="session-panel-section">
        <p className="side-panel-subheading">Время</p>
        <label>
          Продвинуть время после боя
          <select
            value={draft.advanceTime.mode}
            onChange={(e) => setDraft({ ...draft, advanceTime: { mode: e.target.value as 'none' | 'phase' | 'day' } })}
          >
            <option value="none">Не продвигать</option>
            <option value="phase">На один период суток</option>
            <option value="day">На один день</option>
          </select>
        </label>
      </div>

      <div className="session-panel-section actions">
        <button onClick={applyConsequences}>Применить последствия боя</button>
        {applied && <p className="muted">Последствия применены.</p>}
        {skippedNotes.map((note) => (
          <p key={note} className="form-error">
            {note}
          </p>
        ))}
      </div>

      <details className="session-panel-section">
        <summary className="side-panel-subheading">Старые отдельные действия (Stage 5A)</summary>
        <label>
          Итог боя (заметка ДМ)
          <textarea
            rows={3}
            value={legacySummary}
            placeholder="Что произошло, кто выжил, что нашли…"
            onChange={(e) => setLegacySummary(e.target.value)}
          />
        </label>
        <label className="reveal-toggle">
          <input type="checkbox" checked={legacyPlayerVisible} onChange={(e) => setLegacyPlayerVisible(e.target.checked)} />
          Сделать итог видимым игрокам
        </label>
        <div className="actions">
          <button onClick={legacyMarkCompletedAndCreateEvent} disabled={created}>
            Завершить бой и создать событие
          </button>
          <button onClick={legacyCreateEventOnly} disabled={created}>
            Только создать событие (без смены статуса сцены)
          </button>
          {created && <p className="muted">Событие создано.</p>}
        </div>
        {entry.sourceLocationStateId && (
          <div className="actions">
            <select value={legacyLocationStatusDraft} onChange={(e) => setLegacyLocationStatusDraft(e.target.value as LocationStatus)}>
              <option value="">— выбрать новый статус —</option>
              {LOCATION_STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {LOCATION_STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button onClick={legacyApplyLocationStatus} disabled={!legacyLocationStatusDraft}>
              Применить статус к локации
            </button>
          </div>
        )}
      </details>
    </div>
  );
}

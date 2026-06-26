import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { BattleEntry, BattleEntryStatus, BattleMapVariantKind, TimeOfDay } from '../../types';
import type { CampaignData } from '../../data/loadCampaignData';
import { TIMELINES } from '../../data/loadCampaignData';
import { buildBattleMapLaunchUrl } from './battleMapLaunch';
import { buildBattleReturnUrl } from './battleReturnUrl';
import { BATTLE_RETURN_PARAM_KEYS } from './battleMapContract';
import { useCampaignStore } from '../../state/campaignStore';
import { BattleHistoryPanel } from './BattleHistoryPanel';
import { BattleVariantEditor } from './BattleVariantEditor';
import { BattleMapLaunchPanel } from './BattleMapLaunchPanel';
import { getBattleMapById, getBattleMapDisplayName, getBattleMapPreviewUrl } from './battleMapManifestHelpers';
import { resolveEncounterPreset } from './encounterPresetResolver';
import {
  resolveBattleEntryLinkedEnemies,
  resolveBattleEntryLinkedNpcs,
  resolveBattleEntryLinkedQuests,
  resolveBattleEntrySourceLocation,
} from './battleEntryLinks';

/**
 * Battle Entry side panel (Stage 5A, Step 6/9; hardened in Stage 5C) —
 * extracted from MapWorkspacePage since it's a large, mostly self-contained
 * DM-only card. Reads useCampaignStore() directly for mutation actions (same
 * pattern as BattleMapVttLinkField.tsx), but receives the entry + cross-
 * cutting display data (resolved location title, calendar time-of-day, the
 * full loaded CampaignData for link resolution) as props since those require
 * data/selectors the page already has loaded.
 *
 * No enemy editor, no automatic consequence application — every action here
 * is an explicit DM click, matching the rest of this codebase's MVP stages.
 */
export interface BattleEntryPanelProps {
  entry: BattleEntry;
  data: CampaignData;
  sourceLocationTitle?: string;
  /** Current calendar time-of-day for the entry's timeline, used only to
   * SUGGEST (never force) a matching variant — see VARIANT_SUGGESTION below. */
  currentTimeOfDay?: TimeOfDay;
  onClose: () => void;
  onEdit: () => void;
  onOpenConsequences: () => void;
  onCreateEvent: () => void;
}

const STATUS_LABELS: Record<BattleEntryStatus, string> = {
  prepared: 'Подготовлена',
  available: 'Доступна',
  active: 'Идёт сейчас',
  completed: 'Завершена',
  disabled: 'Отключена',
  hidden: 'Скрыта (только ДМ)',
};

const SCENE_SIZE_LABELS: Record<BattleEntry['sceneSize'], string> = {
  standard_30x30: 'Стандартная 30×30',
  medium_60x60: 'Средняя 60×60',
  large_120x120: 'Большая 120×120',
  custom: 'Своя',
};

const VARIANT_KIND_LABELS: Record<BattleMapVariantKind, string> = {
  day: 'День',
  evening: 'Вечер',
  night: 'Ночь',
  rain: 'Дождь',
  destroyed: 'Разрушено',
  custom: 'Своё',
};

/** Suggests (never forces) a matching variant kind for the current calendar
 * time-of-day — purely a visual preselection hint in the variant picker. */
function suggestedVariantKind(timeOfDay?: TimeOfDay): BattleMapVariantKind {
  if (timeOfDay === 'night') return 'night';
  if (timeOfDay === 'evening') return 'evening';
  return 'day';
}

export function BattleEntryPanel({
  entry,
  data,
  sourceLocationTitle,
  currentTimeOfDay,
  onClose,
  onEdit,
  onOpenConsequences,
  onCreateEvent,
}: BattleEntryPanelProps) {
  const store = useCampaignStore();
  // Stage 5D, Step 5 — reuses the SAME useSearchParams mechanism
  // MapWorkspacePage.tsx already uses to read/write the URL's query string
  // (its battle-return-parsing effect and its ?selected= sync effect both go
  // through this hook), rather than inventing a second URL-mutation path.
  const [, setSearchParams] = useSearchParams();
  const suggested = suggestedVariantKind(currentTimeOfDay);
  const defaultVariantId = entry.variants?.find((v) => v.kind === suggested)?.id ?? entry.variants?.[0]?.id;
  const [selectedVariantId, setSelectedVariantId] = useState<string | undefined>(defaultVariantId);
  const [launchWarning, setLaunchWarning] = useState<string | null>(null);
  const [showVariantEditor, setShowVariantEditor] = useState(false);

  // Encounter preset draft selection for THIS launch only — local UI state,
  // never mutates entry.encounterPresetIds. Defaults to the single id when
  // exactly one exists, otherwise nothing is preselected (Step 6).
  const [selectedEncounterPresetId, setSelectedEncounterPresetId] = useState<string | undefined>(
    entry.encounterPresetIds && entry.encounterPresetIds.length === 1 ? entry.encounterPresetIds[0] : undefined,
  );

  const selectedVariant = entry.variants?.find((v) => v.id === selectedVariantId);

  // Stage 5D, Step 3: whether buildBattleReturnUrl would actually produce a
  // usable returnUrl in the current environment (always true in a real
  // browser; only false in a non-window environment, which doesn't occur in
  // normal Campaign Map usage). Recomputed on every render rather than
  // memoized — it's a cheap window.location read, not worth the complexity.
  const hasReturnUrl = !!buildBattleReturnUrl({ timelineId: entry.timelineId, sourceMapId: entry.sourceMapId, battleEntryId: entry.id });

  // Step 2/3: battle map manifest resolution for the preview section.
  const previewBattleMapId = selectedVariant?.battleMapId ?? entry.battleMapId;
  const manifestEntry = getBattleMapById(data.battleMaps, previewBattleMapId);
  const previewUrl = getBattleMapPreviewUrl(manifestEntry);

  // Step 7: linked entity label resolution, replacing raw-counts-only display.
  const linkedEnemies = resolveBattleEntryLinkedEnemies(entry, data);
  const linkedQuests = resolveBattleEntryLinkedQuests(entry, data);
  const linkedNpcs = resolveBattleEntryLinkedNpcs(entry, data);
  const resolvedSourceLocation = resolveBattleEntrySourceLocation(entry, data);

  function handleOpenBattleMap() {
    setLaunchWarning(null);
    // Variant overrides the entry's own battleMapId/battleMapUrl when present;
    // otherwise falls back to the entry's own fields (Step 9 behavior).
    const effectiveEntry: BattleEntry = selectedVariant
      ? { ...entry, battleMapId: selectedVariant.battleMapId ?? entry.battleMapId, battleMapUrl: selectedVariant.battleMapUrl ?? entry.battleMapUrl }
      : entry;
    // Stage 5D, Step 2/3: a real returnUrl, generated fresh at launch time
    // from the current browser location — never persisted onto the entry,
    // never written to the overlay/localStorage.
    const returnUrl = buildBattleReturnUrl({
      timelineId: entry.timelineId,
      sourceMapId: entry.sourceMapId,
      battleEntryId: entry.id,
    });
    // Stage 6C.4: the Battle Map VTT app filters by its own `arc` id
    // (`arc-1`/`arc-2`), resolved from this entry's timelineId via the
    // Timeline table — not the same string as `timelineId` itself.
    const arc = TIMELINES.find((t) => t.id === entry.timelineId)?.arcId;
    const url = buildBattleMapLaunchUrl(
      effectiveEntry,
      {
        arc,
        timelineId: entry.timelineId,
        battleEntryId: entry.id,
        sourceMapId: entry.sourceMapId,
        sourceLocationStateId: entry.sourceLocationStateId,
        linkedQuestIds: entry.linkedQuestIds,
        linkedEnemyIds: entry.linkedEnemyIds,
        linkedNpcIds: entry.linkedNpcIds,
        recommendedPartyLevel: entry.recommendedPartyLevel,
        sceneSize: entry.sceneSize,
        variant: selectedVariant?.id,
        encounterPresetId: selectedEncounterPresetId,
        ...(returnUrl ? { returnUrl } : {}),
      },
      { battleMapVttUrlOverrides: store.battleMapVttUrlOverrides },
    );
    if (!url) {
      setLaunchWarning('Боевая карта не настроена');
      return;
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  // Stage 5D, Step 5 — DM-only dev/test helper that simulates what a real
  // battle-map-vtt redirect back to this app's returnUrl would do, WITHOUT
  // writing to the store directly. It only updates this tab's own URL query
  // string via the same useSearchParams mechanism MapWorkspacePage.tsx
  // already uses for the return-flow; the EXISTING Stage 5B
  // parseBattleReturnParams effect there picks the change up exactly as if
  // a real Battle Map had redirected back — opening the panel and prefilling
  // the consequences draft, never auto-applying anything.
  function handleSimulateBattleReturn() {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.set(BATTLE_RETURN_PARAM_KEYS.battleEntryId, entry.id);
        next.set(BATTLE_RETURN_PARAM_KEYS.battleResult, 'completed');
        next.set(BATTLE_RETURN_PARAM_KEYS.battleSummary, 'Test battle summary');
        next.set(BATTLE_RETURN_PARAM_KEYS.completed, 'true');
        return next;
      },
      { replace: true },
    );
  }

  return (
    <div className="battle-entry-panel card">
      <div className="session-panel-header">
        <h3>{entry.name}</h3>
        <button onClick={onClose}>Закрыть</button>
      </div>

      <p className="session-panel-row">
        <span className="status-badge">{STATUS_LABELS[entry.status]}</span>{' '}
        <span className="status-badge">{SCENE_SIZE_LABELS[entry.sceneSize]}</span>
        {entry.recommendedPartyLevel !== undefined && (
          <span className="status-badge"> Рекоменд. уровень: {entry.recommendedPartyLevel}</span>
        )}
      </p>

      {sourceLocationTitle && (
        <p className="session-panel-row">
          <strong>Локация:</strong> {sourceLocationTitle}
        </p>
      )}

      {entry.playerSafeDescription || entry.description ? (
        <p className="session-panel-row">{entry.playerSafeDescription ?? entry.description}</p>
      ) : null}

      <div className="session-panel-section">
        <p className="side-panel-subheading">Превью карты боя</p>
        {previewUrl ? (
          <div className="battle-map-preview">
            <img src={previewUrl} alt={getBattleMapDisplayName(manifestEntry, previewBattleMapId ?? '')} loading="lazy" />
          </div>
        ) : (
          <p className="muted">Превью недоступно.</p>
        )}
        <p className="session-panel-row">
          <strong>Название:</strong> {previewBattleMapId ? getBattleMapDisplayName(manifestEntry, previewBattleMapId) : '—'}
          {' · '}
          <strong>battleMapId:</strong> {previewBattleMapId ?? '—'}
        </p>
        {previewBattleMapId && !manifestEntry && (
          <p className="battle-launch-warning">battleMapId «{previewBattleMapId}» не найден в манифесте battle-map-vtt.</p>
        )}
        {!previewBattleMapId && !entry.battleMapUrl && !selectedVariant?.battleMapUrl && (
          <p className="battle-launch-warning">У сцены нет ни battleMapId, ни battleMapUrl.</p>
        )}
      </div>

      <div className="session-panel-section">
        <p className="side-panel-subheading">
          Связи (ДМ): квестов {linkedQuests.length} · NPC {linkedNpcs.length} · врагов {linkedEnemies.length}
        </p>
        {linkedQuests.length > 0 && (
          <p className="session-panel-row">
            {linkedQuests.map((q) => (
              <span key={q.id} className={`linked-entity-chip${q.missing ? ' linked-entity-chip--missing' : ''}`}>
                {q.label}
              </span>
            ))}
          </p>
        )}
        {linkedNpcs.length > 0 && (
          <p className="session-panel-row">
            {linkedNpcs.map((n) => (
              <span key={n.id} className={`linked-entity-chip${n.missing ? ' linked-entity-chip--missing' : ''}`}>
                {n.label}
              </span>
            ))}
          </p>
        )}
        {linkedEnemies.length > 0 && (
          <p className="session-panel-row">
            {linkedEnemies.map((e) => (
              <span key={e.id} className={`linked-entity-chip${e.missing ? ' linked-entity-chip--missing' : ''}`}>
                {e.label}
              </span>
            ))}
          </p>
        )}
        {resolvedSourceLocation && (
          <p className="session-panel-row">
            <strong>Локация-источник:</strong>{' '}
            <span className={`linked-entity-chip${resolvedSourceLocation.missing ? ' linked-entity-chip--missing' : ''}`}>
              {resolvedSourceLocation.label}
            </span>
          </p>
        )}
        {entry.encounterPresetIds && entry.encounterPresetIds.length > 0 && (
          <div className="session-panel-row">
            <p className="muted">Заготовки энкаунтера (выберите одну для этого запуска):</p>
            {entry.encounterPresetIds.map((id) => {
              const resolved = resolveEncounterPreset(id);
              const isSelected = selectedEncounterPresetId === id;
              return (
                <button
                  key={id}
                  type="button"
                  className={`encounter-preset-chip${isSelected ? ' battle-variant-chip--selected' : ''}`}
                  onClick={() => setSelectedEncounterPresetId(isSelected ? undefined : id)}
                  title="Заготовки энкаунтера не подкреплены реальными данными в этой версии — отображается только id"
                >
                  {resolved.name} (не найдена)
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="session-panel-section">
        <p className="side-panel-subheading">Карта боя</p>
        {entry.variants && entry.variants.length > 0 ? (
          <div className="session-panel-row">
            {entry.variants.map((v) => {
              const isSelected = selectedVariantId === v.id;
              const isSuggested = v.kind === suggested;
              return (
                <button
                  key={v.id}
                  type="button"
                  className={`battle-variant-chip${isSelected ? ' battle-variant-chip--selected' : ''}${isSuggested ? ' battle-variant-chip--suggested' : ''}`}
                  onClick={() => setSelectedVariantId(isSelected ? undefined : v.id)}
                  title={[
                    v.battleMapId ? `battleMapId: ${v.battleMapId}` : undefined,
                    v.battleMapUrl ? `battleMapUrl: ${v.battleMapUrl}` : undefined,
                    v.notes,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                >
                  {v.name} ({VARIANT_KIND_LABELS[v.kind]})
                  {isSuggested && <span className="status-badge">предложено по времени суток</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="muted">Вариантов карты нет — будет открыта основная карта сцены.</p>
        )}
        <div className="actions">
          <button onClick={() => setShowVariantEditor((s) => !s)}>
            {showVariantEditor ? 'Скрыть редактор вариантов' : 'Редактировать варианты'}
          </button>
        </div>
        {showVariantEditor && (
          <BattleVariantEditor entry={entry} onSave={(variants) => store.updateBattleEntry(entry.id, { variants })} />
        )}
      </div>

      <BattleMapLaunchPanel
        entry={entry}
        data={data}
        selectedVariant={selectedVariant}
        selectedEncounterPresetId={selectedEncounterPresetId}
        hasReturnUrl={hasReturnUrl}
        onLaunch={handleOpenBattleMap}
        launchWarning={launchWarning}
      />

      {!!entry.dmNotes && (
        <div className="session-panel-section">
          <p className="side-panel-subheading">Заметки ДМ (никогда не видно игрокам)</p>
          <p className="session-panel-row">{entry.dmNotes}</p>
        </div>
      )}

      {entry.status === 'completed' && (
        <div className="session-panel-section">
          <p className="muted">Последствия этого боя уже могли быть применены — см. историю боя ниже.</p>
        </div>
      )}

      <BattleHistoryPanel entry={entry} />

      <div className="session-panel-section actions">
        <button onClick={onEdit}>Редактировать</button>
        <button onClick={() => store.updateBattleEntry(entry.id, { visibleInPlayerView: !entry.visibleInPlayerView })}>
          {entry.visibleInPlayerView ? 'Скрыть от игроков' : 'Показать игрокам (безопасный превью)'}
        </button>
        {entry.status === 'completed' ? (
          <button onClick={() => store.updateBattleEntry(entry.id, { status: 'available' })}>
            Открыть заново / сделать доступной снова
          </button>
        ) : (
          entry.status !== 'available' && entry.status !== 'active' && (
            <button onClick={() => store.updateBattleEntry(entry.id, { status: 'available' })}>Сделать доступной</button>
          )
        )}
        {entry.status !== 'active' && <button onClick={() => store.markBattleEntryActive(entry.id)}>Начать бой</button>}
        {entry.status !== 'completed' && (
          <button onClick={() => store.markBattleEntryCompleted(entry.id)}>Отметить завершённой</button>
        )}
        <button onClick={onCreateEvent}>Создать событие</button>
        <button onClick={onOpenConsequences}>Последствия боя…</button>
        <button onClick={() => store.archiveBattleEntry(entry.id)}>Архивировать / скрыть</button>
      </div>

      {/* Stage 5D, Step 5 — DM-only dev/test helper, see handleSimulateBattleReturn.
          Only ever rendered here, which is itself only ever rendered for
          !isPlayerView (see the call site in MapWorkspacePage.tsx) — never
          reachable from Observer or any player-facing view. */}
      <div className="session-panel-section actions">
        <button className="battle-smoke-action" onClick={handleSimulateBattleReturn} title="Только для ДМ: имитирует возврат из Battle Map VTT, обновляя URL этой вкладки">
          Симулировать возврат боя
        </button>
      </div>

      <p className="muted entity-card-sub">
        Создано: {new Date(entry.createdAt).toLocaleString()} · Обновлено: {new Date(entry.updatedAt).toLocaleString()}
      </p>
    </div>
  );
}

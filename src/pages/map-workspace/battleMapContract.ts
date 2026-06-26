import type { LocationStatus } from '../../types';

/**
 * Stage 5C, Step 9 — typed Battle Map contract. Centralizes the exact query
 * param keys `battleMapLaunch.ts` appends and `battleReturn.ts` reads, plus
 * the `locationStatus` guess-mapping table that previously lived inline in
 * `BattleConsequencesPanel.tsx`. Pure constants/types only — no behavior
 * change versus what those two modules already did.
 *
 * IMPORTANT: `BATTLE_RETURN_LOCATION_STATUS_MAP` is a local Campaign Map
 * compatibility mapping until battle-map-vtt publishes a shared contract —
 * the separate battle-map-vtt app may use a different return-status
 * vocabulary than this app's `LocationStatus` union, and this table is a
 * best-effort guess at that vocabulary, not a verified cross-app contract.
 *
 * Campaign Map never auto-applies return params — they only pre-fill a
 * DM-reviewed draft (see BattleConsequencesPanel.tsx's `initialReturnParams`
 * handling); nothing here changes that posture.
 */

/** Exact keys `buildBattleMapLaunchUrl` (battleMapLaunch.ts) already appends. */
export const BATTLE_LAUNCH_PARAM_KEYS = {
  /** Stage 6C.4: the Battle Map VTT app's own arc filter, e.g. `arc-1`/`arc-2` —
   * distinct from `timelineId` (this app's own per-arc timeline id, e.g.
   * `arc-1-peace`), which the VTT app does not understand. */
  arc: 'arc',
  timelineId: 'timelineId',
  battleEntryId: 'battleEntryId',
  battleMapId: 'battleMapId',
  sourceMapId: 'sourceMapId',
  sourceLocationStateId: 'sourceLocationStateId',
  linkedQuestIds: 'linkedQuestIds',
  linkedEnemyIds: 'linkedEnemyIds',
  linkedNpcIds: 'linkedNpcIds',
  recommendedPartyLevel: 'recommendedPartyLevel',
  sceneSize: 'sceneSize',
  variant: 'variant',
  encounterPresetId: 'encounterPresetId',
  returnUrl: 'returnUrl',
} as const;

/** Exact keys `parseBattleReturnParams`/`clearBattleReturnParams`
 * (battleReturn.ts) already read/strip. */
export const BATTLE_RETURN_PARAM_KEYS = {
  battleEntryId: 'battleEntryId',
  battleResult: 'battleResult',
  battleSummary: 'battleSummary',
  completed: 'completed',
  locationStatus: 'locationStatus',
  visibleInPlayerView: 'visibleInPlayerView',
  timeAdvancePhase: 'timeAdvancePhase',
} as const;

export type BattleReturnResult = 'completed' | 'retreated' | 'failed' | 'cancelled' | 'unknown';

export type BattleReturnLocationStatus = 'danger' | 'cleared' | 'destroyed' | 'active' | 'visited';

/** Moved unchanged from BattleConsequencesPanel.tsx's `mapReturnLocationStatus`
 * switch table — same guesses, same behavior, single location now. */
export const BATTLE_RETURN_LOCATION_STATUS_MAP: Record<BattleReturnLocationStatus, LocationStatus> = {
  danger: 'contested',
  cleared: 'known',
  destroyed: 'destroyed',
  active: 'contested',
  visited: 'visited',
};

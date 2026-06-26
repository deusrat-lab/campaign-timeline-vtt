import { BATTLE_MAP_VTT_BASE_URL } from '../../config';
import type { BattleEntry } from '../../types';
import { BATTLE_LAUNCH_PARAM_KEYS } from './battleMapContract';

/**
 * Battle Map launch context helper (Stage 5A, Step 8). Builds the URL the DM
 * opens to launch a prepared BattleEntry's scene in the separate
 * battle-map-vtt app. This module never embeds or simulates the battle itself
 * — it only decides WHICH url to open and WHAT context query params to carry
 * across, exactly like the pre-existing legacy mechanism in
 * MapWorkspacePage.tsx (~line 4746-4747:
 * `window.open(store.battleMapVttUrlOverrides[battleMapId] || BATTLE_MAP_VTT_BASE_URL, '_blank')`),
 * which this helper reproduces for the legacy battleMapId-only case so both
 * paths share one source of truth going forward.
 *
 * The caller is always responsible for actually calling
 * `window.open(url, '_blank', 'noopener,noreferrer')` — this module is pure
 * (no side effects, no window access) so it can be unit-tested/reused freely.
 */

export interface BattleMapLaunchContext {
  /** Stage 6C.4: the Battle Map VTT app's own arc filter (e.g. `arc-1`),
   * resolved by the caller from `Timeline.arcId` — NOT the same value as
   * `timelineId` below. */
  arc?: string;
  timelineId?: string;
  battleEntryId?: string;
  battleMapId?: string;
  sourceMapId?: string;
  sourceLocationStateId?: string;
  linkedQuestIds?: string[];
  linkedEnemyIds?: string[];
  linkedNpcIds?: string[];
  recommendedPartyLevel?: number;
  sceneSize?: string;
  /** Id of the BattleMapVariantRef the DM picked for this launch, if any. */
  variant?: string;
  encounterPresetId?: string;
  returnUrl?: string;
}

/** Per-battleMapId manual VTT deep-link overrides, as stored in
 * `CampaignOverlay.battleMapVttUrlOverrides` — passed in explicitly rather
 * than importing the store, so this module stays a pure function with no
 * dependency on React/context. */
export interface BattleMapLaunchOverrides {
  battleMapVttUrlOverrides?: Record<string, string>;
}

function contextParamList(context: BattleMapLaunchContext): Array<[string, string | undefined]> {
  return [
    [BATTLE_LAUNCH_PARAM_KEYS.arc, context.arc],
    [BATTLE_LAUNCH_PARAM_KEYS.timelineId, context.timelineId],
    [BATTLE_LAUNCH_PARAM_KEYS.battleEntryId, context.battleEntryId],
    [BATTLE_LAUNCH_PARAM_KEYS.battleMapId, context.battleMapId],
    [BATTLE_LAUNCH_PARAM_KEYS.sourceMapId, context.sourceMapId],
    [BATTLE_LAUNCH_PARAM_KEYS.sourceLocationStateId, context.sourceLocationStateId],
    [BATTLE_LAUNCH_PARAM_KEYS.recommendedPartyLevel, context.recommendedPartyLevel?.toString()],
    [BATTLE_LAUNCH_PARAM_KEYS.sceneSize, context.sceneSize],
    [BATTLE_LAUNCH_PARAM_KEYS.variant, context.variant],
    [BATTLE_LAUNCH_PARAM_KEYS.encounterPresetId, context.encounterPresetId],
    [BATTLE_LAUNCH_PARAM_KEYS.returnUrl, context.returnUrl],
    [BATTLE_LAUNCH_PARAM_KEYS.linkedQuestIds, context.linkedQuestIds?.length ? context.linkedQuestIds.join(',') : undefined],
    [BATTLE_LAUNCH_PARAM_KEYS.linkedEnemyIds, context.linkedEnemyIds?.length ? context.linkedEnemyIds.join(',') : undefined],
    [BATTLE_LAUNCH_PARAM_KEYS.linkedNpcIds, context.linkedNpcIds?.length ? context.linkedNpcIds.join(',') : undefined],
  ];
}

function appendContextParams(base: string, context: BattleMapLaunchContext): string {
  const params = contextParamList(context);
  // Stage 6C.4: the real Battle Map VTT app uses hash-based routing
  // (`http://localhost:4174/#/maps?arc=arc-1`) — its query string lives
  // INSIDE the hash fragment, not in the URL's real search string. Plain
  // `new URL(base).searchParams.set(...)` would silently write params
  // before the `#`, where the hash router never sees them. Handle any
  // base containing a `#` by rebuilding the hash's own query string.
  const hashIndex = base.indexOf('#');
  if (hashIndex !== -1) {
    const prefix = base.slice(0, hashIndex);
    const hashPart = base.slice(hashIndex + 1);
    const qIndex = hashPart.indexOf('?');
    const hashPath = qIndex === -1 ? hashPart : hashPart.slice(0, qIndex);
    const existingQuery = qIndex === -1 ? '' : hashPart.slice(qIndex + 1);
    const search = new URLSearchParams(existingQuery);
    for (const [key, value] of params) {
      if (value) search.set(key, value);
    }
    const queryString = search.toString();
    return `${prefix}#${hashPath}${queryString ? `?${queryString}` : ''}`;
  }
  let url: URL;
  try {
    url = new URL(base);
  } catch {
    // base may be a relative path that isn't a parsable absolute URL —
    // bail out to plain string concat (shouldn't happen in practice since
    // BATTLE_MAP_VTT_BASE_URL and battleMapVttUrlOverrides are always
    // absolute http(s) urls by convention).
    return base;
  }
  for (const [key, value] of params) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

/**
 * Returns the URL to open for this BattleEntry, or null if no battle map is
 * configured at all (caller should show "Боевая карта не настроена" and not
 * attempt to open anything).
 *
 * Priority:
 * 1. `entry.battleMapUrl` — build that URL with safely-encoded query params appended.
 * 2. `entry.battleMapId` — reproduce the existing legacy behavior:
 *    `overrides.battleMapVttUrlOverrides[battleMapId] || BATTLE_MAP_VTT_BASE_URL`,
 *    with the same context params appended.
 * 3. Neither present — return null.
 */
export function buildBattleMapLaunchUrl(
  entry: BattleEntry,
  context: BattleMapLaunchContext,
  overrides: BattleMapLaunchOverrides = {},
): string | null {
  if (entry.battleMapUrl) {
    return appendContextParams(entry.battleMapUrl, context);
  }
  if (entry.battleMapId) {
    const base = overrides.battleMapVttUrlOverrides?.[entry.battleMapId] || BATTLE_MAP_VTT_BASE_URL;
    return appendContextParams(base, { ...context, battleMapId: entry.battleMapId });
  }
  return null;
}

import type { CampaignProgress, LocationState, MapObjectPlacement, PartyState } from '../types';
import { effectiveLocationStatus, isLocationVisibleToPlayers } from './selectors';

/**
 * Minimal DM-facing visibility tier for anything placed on a map.
 * 'hidden' — DM-only, never leaks to Player View/Observer.
 * 'visible' — marker + player-safe fields shown, but party hasn't "opened" it yet.
 * 'discovered' — party has opened it; same player-safe projection as 'visible' today
 *   (discovered is a DM-facing progress marker, not a separate content gate — it does
 *   not unlock any additional fields, so existing player-safe filters never change).
 */
export type MarkerVisibilityState = 'hidden' | 'visible' | 'discovered';

export const VISIBILITY_LABELS: Record<MarkerVisibilityState, string> = {
  hidden: 'Скрыто от игроков',
  visible: 'Видно игрокам',
  discovered: 'Открыто партией',
};

export function getLocationVisibilityState(
  ls: LocationState,
  progress: CampaignProgress,
  party: PartyState,
): MarkerVisibilityState {
  if (!isLocationVisibleToPlayers(ls, progress)) return 'hidden';
  if (party.revealedLocationStateIds.includes(ls.id) || party.visitedLocationStateIds.includes(ls.id)) {
    return 'discovered';
  }
  return 'visible';
}

export function getPlacementVisibilityState(p: MapObjectPlacement): MarkerVisibilityState {
  if (p.status === 'hidden' || p.status === 'archived' || p.visibleInPlayerView !== true) return 'hidden';
  return 'visible';
}

export function getVisibilityLabel(state: MarkerVisibilityState): string {
  return VISIBILITY_LABELS[state];
}

/** Convenience re-export so callers don't need to know the underlying status enum. */
export function isLocationHiddenFromPlayers(ls: LocationState, progress: CampaignProgress): boolean {
  return effectiveLocationStatus(ls, progress) === 'hidden' || ls.visibleToPlayers === false;
}

/**
 * Linked-content safety gate: revealing a Location must NOT auto-reveal its
 * linked NPC/Quest/Enemy/Image. If a DM explicitly placed (and hid) a marker
 * for this entity, that marker's hidden state must also hide it from a
 * parent location's linked-entity rows in Player View/Observer — otherwise a
 * player could see a "hidden from players" NPC simply by opening a visible
 * location's card. If the entity has no placement at all (never dropped as
 * its own marker), there is no marker-level gate to apply — the entity's own
 * visibility field (e.g. Npc.visibleToPlayers) is the only signal and is
 * checked separately by the caller (e.g. getPlayerSafeNpcs).
 */
export function isLinkedEntityPlacementVisible(
  placements: MapObjectPlacement[],
  entityKind: MapObjectPlacement['entityKind'],
  entityId: string,
): boolean {
  const placement = placements.find((p) => p.entityKind === entityKind && p.entityId === entityId && p.status !== 'archived');
  if (!placement) return true;
  return getPlacementVisibilityState(placement) !== 'hidden';
}

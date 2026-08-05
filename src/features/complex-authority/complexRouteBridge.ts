import {
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  entityIdFromLegacy,
  mapIdFromLegacy,
  type ComplexAuthorityRouter,
  type ComplexAuthorityScope,
  type ComplexCommand,
} from '../../domain';
import type { MainCampaignDataInput, MainCampaignOverlayInput } from '../../domain';
import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import type { ComplexActionDescriptor, MainComplexRequest, UserComplexRequest } from '../../state/complexAuthoritySink';

/**
 * Stage 16.1 — the PURE translation + routing bridge shared by the React
 * provider and the Node integration harness (so the harness exercises the exact
 * production wiring, not a copy). Maps a legacy `ComplexActionDescriptor` into the
 * typed universal `ComplexCommand` (resolving universal ids) and drives the
 * Stage 16 router with adapter closures built from the store's pre / predicted /
 * committed legacy transitions. No React, no storage, no network of its own.
 */

/** Translate a legacy descriptor into the typed universal command (or null when
 * the descriptor cannot form a valid command — the caller then falls back). */
export function descriptorToCommand(descriptor: ComplexActionDescriptor): ComplexCommand | null {
  switch (descriptor.aggregate) {
    case 'reveal': {
      const targetUniversalId = entityIdFromLegacy(descriptor.entityKind, descriptor.legacyEntityId);
      return descriptor.reveal
        ? { kind: 'reveal.entity', targetUniversalId }
        : { kind: 'reveal.hide', targetUniversalId };
    }
    case 'presentedCard': {
      if (descriptor.present) {
        if (!descriptor.cardType || !descriptor.cardId) return null;
        return {
          kind: 'presentedCard.present',
          targetUniversalId: entityIdFromLegacy(descriptor.cardType, descriptor.cardId),
          entityKind: descriptor.cardType,
          clearPresentedBattle: descriptor.clearPresentedBattle,
        };
      }
      return { kind: 'presentedCard.dismiss', clearPresentedBattle: descriptor.clearPresentedBattle };
    }
    case 'partyLocation': {
      return {
        kind: 'partyLocation.move',
        currentLocationRef: descriptor.locationStateId ? entityIdFromLegacy('locationState', descriptor.locationStateId) : undefined,
        currentMapId: descriptor.mapRawId ? mapIdFromLegacy(descriptor.mapRawId) : undefined,
        currentMapPosition: typeof descriptor.x === 'number' && typeof descriptor.y === 'number' ? { x: descriptor.x, y: descriptor.y } : undefined,
        clearMapPosition: descriptor.clearMapPosition,
        clearLocation: descriptor.clearLocation,
        clearRouteProgress: descriptor.clearRouteProgress,
      };
    }
    case 'routeProgress':
      return descriptor.progress
        ? { kind: 'routeProgress.advance', routeProgress: descriptor.progress, clearMapPosition: descriptor.clearMapPosition }
        : { kind: 'routeProgress.clear' };
    case 'placement': {
      if (descriptor.op === 'remove') return { kind: 'placement.remove', placementId: descriptor.placementId };
      if (descriptor.op === 'move') {
        if (typeof descriptor.x !== 'number' || typeof descriptor.y !== 'number') return null;
        return { kind: 'placement.move', placementId: descriptor.placementId, position: { x: descriptor.x, y: descriptor.y } };
      }
      // place
      if (!descriptor.mapRawId || !descriptor.entityKind || !descriptor.entityId || typeof descriptor.x !== 'number' || typeof descriptor.y !== 'number') return null;
      return {
        kind: 'placement.place',
        placementId: descriptor.placementId,
        mapId: mapIdFromLegacy(descriptor.mapRawId),
        entityRef: entityIdFromLegacy(descriptor.entityKind, descriptor.entityId),
        entityKind: descriptor.entityKind,
        position: { x: descriptor.x, y: descriptor.y },
        title: descriptor.title,
        visibleToPlayers: descriptor.visibleToPlayers ?? false,
      };
    }
  }
}

/** Route one Greyholm (main) complex request. `getMergedData` returns the merged
 * Greyholm base data (npcs/placements/…); only the overlay changes per action. */
export function routeMainComplexThrough(
  router: ComplexAuthorityRouter,
  getMergedData: () => unknown,
  scope: ComplexAuthorityScope,
  request: MainComplexRequest,
): boolean {
  if (!router.isAllowlisted(scope)) return false;
  const command = descriptorToCommand(request.descriptor);
  if (!command) return false;
  const adapt = (overlay: unknown) =>
    adaptMainCampaignToUniversal({ data: getMergedData() as MainCampaignDataInput, overlay: overlay as MainCampaignOverlayInput });
  const outcome = router.route({
    campaignId: campaignIdFromLegacy('greyholm', 'main'),
    campaignKind: 'greyholm',
    sourceKind: 'legacy-main',
    scope,
    command,
    sourceIdentity: 'greyholm:dm',
    buildPre: () => adapt(request.preOverlay),
    predictPost: () => adapt(request.predict()),
    commit: () => adapt(request.commit()),
    fallback: request.fallback,
  });
  return outcome.handled;
}

/** Route one Caldran / user-campaign complex request against its EXACT campaign
 * id (never the active campaign, never a Greyholm fallback). */
export function routeUserComplexThrough(
  router: ComplexAuthorityRouter,
  scope: ComplexAuthorityScope,
  request: UserComplexRequest,
): boolean {
  if (!router.isAllowlisted(scope)) return false;
  if (!request.legacyCampaignId || !request.preData) return false;
  const command = descriptorToCommand(request.descriptor);
  if (!command) return false;
  const adaptDR = (dr: { data: unknown; runtime: unknown }) =>
    adaptUserCampaignToUniversal({ data: dr.data as UserCampaignData, runtime: (dr.runtime ?? undefined) as UserCampaignRuntime | undefined });
  const outcome = router.route({
    campaignId: campaignIdFromLegacy('user', request.legacyCampaignId),
    campaignKind: 'userCampaign',
    sourceKind: 'legacy-user-campaign',
    scope,
    command,
    sourceIdentity: `userCampaign:${request.legacyCampaignId}`,
    buildPre: () => adaptDR({ data: request.preData, runtime: request.preRuntime }),
    predictPost: () => adaptDR(request.predict()),
    commit: () => adaptDR(request.commit()),
    fallback: request.fallback,
  });
  return outcome.handled;
}

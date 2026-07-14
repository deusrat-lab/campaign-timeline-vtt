import type {
  CampaignEntityType,
  CampaignMapPlacement,
  UserCampaignData,
  UserCampaignRuntime,
} from '../../types/userCampaign';

export function revealedSet(runtime?: Pick<UserCampaignRuntime, 'revealedToPlayers'> | null): Set<string> {
  return new Set(runtime?.revealedToPlayers ?? []);
}

export function isEntityRevealed(runtime: Pick<UserCampaignRuntime, 'revealedToPlayers'> | null | undefined, entityId?: string): boolean {
  return !!entityId && revealedSet(runtime).has(entityId);
}

export function isPlacementPlayerVisible(
  placement: Pick<CampaignMapPlacement, 'entityId' | 'entityType' | 'visibleToPlayers'>,
  runtime: Pick<UserCampaignRuntime, 'revealedToPlayers'> | null | undefined,
): boolean {
  if (placement.entityType === 'party') return true;
  return placement.visibleToPlayers === true || isEntityRevealed(runtime, placement.entityId);
}

export function isEntityPlayerVisible(
  data: UserCampaignData,
  runtime: Pick<UserCampaignRuntime, 'revealedToPlayers' | 'presentedCard'> | null | undefined,
  entityType: CampaignEntityType,
  entityId: string,
): boolean {
  if (entityType === 'party') return true;
  if (runtime?.presentedCard?.entityType === entityType && runtime.presentedCard.entityId === entityId) return true;
  if (isEntityRevealed(runtime, entityId)) return true;
  return data.mapPlacements.some((mp) => mp.entityType === entityType && mp.entityId === entityId && isPlacementPlayerVisible(mp, runtime));
}

export function playerSafeImageSrc(data: UserCampaignData, imageId?: string, isPlayer = false): string | undefined {
  if (!imageId) return undefined;
  const image = data.images.find((im) => im.id === imageId);
  if (!image) return undefined;
  if (isPlayer && image.playerSafe === false) return undefined;
  return image.src;
}

export function canPlayerOpenCampaignPath(kind: string | undefined): boolean {
  return kind === 'players';
}

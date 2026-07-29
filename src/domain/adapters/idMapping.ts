import { makeCampaignId, makeEntityId, makeMapId, makeRuntimeId, sourceScopedId } from '../campaign/ids';
import type { CampaignId, UniversalEntityId, UniversalMapId, UniversalRuntimeId } from '../campaign/ids';

export function campaignIdFromLegacy(source: 'greyholm' | 'user', id: string): CampaignId {
  return makeCampaignId(sourceScopedId(`camp:${source}`, id));
}

export function entityIdFromLegacy(kind: string, id: string): UniversalEntityId {
  return makeEntityId(sourceScopedId(`entity:${kind}`, id));
}

export function mapIdFromLegacy(id: string): UniversalMapId {
  return makeMapId(sourceScopedId('map:legacy', id));
}

export function runtimeIdFromLegacy(kind: string, id: string): UniversalRuntimeId {
  return makeRuntimeId(sourceScopedId(`runtime:${kind}`, id));
}

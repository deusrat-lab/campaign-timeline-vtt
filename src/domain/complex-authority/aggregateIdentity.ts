import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalMapId } from '../campaign/ids';
import type { ComplexAggregateKind } from './complexAuthorityTypes';

/**
 * Explicit Stage 16 identity resolution. Never first-match, never prefix
 * guessing, never cross-campaign, never active-campaign fallback. An ambiguous
 * match (duplicate id across entity kinds) is rejected; a missing / deleted /
 * stale target is reported safely so the caller falls back before any commit.
 */
export interface IdentityQuery {
  aggregateKind: ComplexAggregateKind;
  /** A universal entity id (reveal target, party location ref, placement entityRef). */
  entityId?: string;
  /** Required exact kind when resolving an entity that could collide across kinds. */
  entityKind?: string;
  /** A universal map id (placement target map, party map). */
  mapId?: UniversalMapId;
}

export type IdentityStatus = 'ok' | 'ambiguous' | 'missing' | 'wrong_kind';

export interface IdentityResolution {
  status: IdentityStatus;
  universalId: string;
}

export function resolveIdentity(snapshot: CampaignSnapshot, query: IdentityQuery): IdentityResolution {
  if (query.mapId !== undefined) {
    const maps = snapshot.durable.maps.filter((m) => m.id === query.mapId);
    if (maps.length === 0) return { status: 'missing', universalId: query.mapId };
    if (maps.length > 1) return { status: 'ambiguous', universalId: query.mapId };
    // map + entity may both be queried; fall through to entity if present.
    if (query.entityId === undefined) return { status: 'ok', universalId: query.mapId };
  }

  if (query.entityId !== undefined) {
    const matches = snapshot.durable.entities.filter((e) => e.id === query.entityId);
    if (matches.length === 0) return { status: 'missing', universalId: query.entityId };
    if (matches.length > 1) {
      // Duplicate id across entity kinds — only resolvable with an exact kind.
      if (query.entityKind === undefined) return { status: 'ambiguous', universalId: query.entityId };
      const exact = matches.filter((e) => e.kind === query.entityKind);
      if (exact.length !== 1) return { status: exact.length === 0 ? 'wrong_kind' : 'ambiguous', universalId: query.entityId };
      return { status: 'ok', universalId: query.entityId };
    }
    // Exactly one match by id. If a kind was demanded, it must agree.
    if (query.entityKind !== undefined && matches[0].kind !== query.entityKind) {
      return { status: 'wrong_kind', universalId: query.entityId };
    }
    return { status: 'ok', universalId: query.entityId };
  }

  // No entity requested; map-only resolution already returned ok above.
  return { status: 'ok', universalId: query.mapId ?? '' };
}

/**
 * Block I — durable map-placement authority (Caldran `mapPlacements`).
 *
 * Promotes Caldran's map placement collection (`addPlacement` /
 * `updatePlacement` move / `removePlacement`, previously routed through the
 * OPTIONAL, default-off, flag-gated `routeUserComplex({ complexScope:
 * 'userCampaign.placement', ... })` sink) to the SOLE, unconditional active
 * authority for this concern, following the exact discipline Decision 2
 * established for battles and this Block I's `partyPositionAuthorityStore.ts`
 * established for Greyholm's party position: a candidate WHOLE collection
 * (the campaign's complete `mapPlacements` array) is committed to an
 * isolated, campaign-scoped, expected-revision-guarded universal namespace,
 * verified read-after-write, and only THEN is the committed collection
 * projected into the existing legacy `patchData` dispatch as a deterministic
 * compatibility write. There is never an independent legacy business
 * decision and never a second universal write.
 *
 * This is a WHOLE-COLLECTION commit (mirrors `commitUserBoard`'s whole-board
 * commit in `battleAuthorityStore.ts`), not a scalar field commit
 * (`fieldAuthorityStore.ts`) or a single coupled-object commit
 * (`partyPositionAuthorityStore.ts`), because a placement mutation
 * (add/move/remove) always yields a new *complete* placements array for the
 * campaign, and the legacy `mapPlacements` field is always replaced whole,
 * never diffed.
 *
 * Caldran-only (`userCampaignStore.tsx`): Greyholm has no equivalent
 * `mapPlacements` collection — its movable-entity concept is the party
 * marker, already converged by `partyPositionAuthorityStore.ts`. Same
 * asymmetry as that module, mirrored the other direction.
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `userCampaignStore.tsx`, exactly like
 * `fieldAuthorityStore.ts` / `presentedCardAuthorityStore.ts` /
 * `battleAuthorityStore.ts` / `revealAuthorityStore.ts` /
 * `partyPositionAuthorityStore.ts`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

const UNIVERSAL_MAP_PLACEMENTS_NAMESPACE = 'campaign-timeline-vtt:universal-map-placements:v1';

type MapPlacementAuthorityKind = 'userCampaign.placements';

/** Plain mirror of `CampaignMapPlacement` (this module must not depend on
 * app-level types). */
export interface MapPlacementSnapshotEntry {
  id: string;
  mapId: string;
  entityType: string;
  entityId: string;
  x: number;
  y: number;
  visibleToPlayers: boolean;
}

interface StoredMapPlacements {
  placements: MapPlacementSnapshotEntry[];
  revision: number;
}

function placementsKey(campaignId: CampaignId, kind: MapPlacementAuthorityKind): string {
  return `${UNIVERSAL_MAP_PLACEMENTS_NAMESPACE}:${campaignId}:${kind}`;
}

function isValidEntry(value: unknown): value is MapPlacementSnapshotEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' && v.id.length > 0 &&
    typeof v.mapId === 'string' && v.mapId.length > 0 &&
    typeof v.entityType === 'string' && v.entityType.length > 0 &&
    typeof v.entityId === 'string' && v.entityId.length > 0 &&
    typeof v.x === 'number' && Number.isFinite(v.x) &&
    typeof v.y === 'number' && Number.isFinite(v.y) &&
    typeof v.visibleToPlayers === 'boolean'
  );
}

/** Invariant: every entry must be well-shaped and ids must be unique within
 * the collection. Reject before persisting, never after — mirrors
 * `checkInvariants` / `checkPartyPositionInvariant`. */
function checkPlacementsInvariant(placements: MapPlacementSnapshotEntry[]): string | null {
  if (!Array.isArray(placements)) return 'placements must be an array';
  const seen = new Set<string>();
  for (const entry of placements) {
    if (!isValidEntry(entry)) return 'each placement must be a well-formed {id, mapId, entityType, entityId, x, y, visibleToPlayers}';
    if (seen.has(entry.id)) return `duplicate placement id: ${entry.id}`;
    seen.add(entry.id);
  }
  return null;
}

function readStoredMapPlacements(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: MapPlacementAuthorityKind,
): StoredMapPlacements | null {
  const raw = storage.getItem(placementsKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredMapPlacements;
    if (typeof parsed?.revision !== 'number') return null;
    if (!Array.isArray(parsed.placements)) return null;
    if (checkPlacementsInvariant(parsed.placements)) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface MapPlacementsCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed collection, read back — always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  placements?: MapPlacementSnapshotEntry[];
  error?: string;
}

/**
 * Atomically commit a whole placements collection under an
 * expected-revision guard (current stored revision, or 0 when never
 * committed), verify it read-after-write, and return the committed
 * collection for the caller's legacy compatibility projection.
 */
export function commitMapPlacements(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: MapPlacementAuthorityKind,
  placements: MapPlacementSnapshotEntry[],
): MapPlacementsCommitOutcome {
  const invariant = checkPlacementsInvariant(placements);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredMapPlacements(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredMapPlacements = { placements, revision: newRevision };
  storage.setItem(placementsKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredMapPlacements(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, placements: readBack.placements };
}


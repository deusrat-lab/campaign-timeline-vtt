/**
 * Block I — durable zone authority (Caldran `CampaignZone[]`).
 *
 * Promotes Caldran's map-zone collection (create/toggle-visibility/add-point/
 * remove-point/delete, all previously written DIRECTLY to `store.updateData`
 * from `IsolatedCampaignMapWorkspace.tsx` with NO dedicated action creators in
 * `userCampaignStore.tsx` at all -- not even a raw pass-through method existed
 * for this concern) to the SOLE, unconditional active authority for this
 * concern, following the exact discipline Decision 2 established for battles
 * and this Block I's `routeAuthorityStore.ts` established for Caldran's map
 * routes: a candidate WHOLE collection (the campaign's complete `zones`
 * array) is committed to an isolated, campaign-scoped, expected-revision-
 * guarded universal namespace, verified read-after-write, and only THEN is
 * the committed collection projected into the existing legacy `patchData`
 * dispatch as a deterministic compatibility write. There is never an
 * independent legacy business decision and never a second universal write.
 *
 * This is a WHOLE-COLLECTION commit (mirrors `commitRoutes`/
 * `commitMapPlacements`), not a scalar field commit (`fieldAuthorityStore.ts`),
 * because a zone mutation (create/add-point/remove-point/toggle/delete)
 * always yields a new *complete* zones array for the campaign, and the
 * legacy `zones` field is always replaced whole, never diffed.
 *
 * Caldran-only (`userCampaignStore.tsx` / `IsolatedCampaignMapWorkspace.tsx`):
 * Greyholm has a differently-shaped `FactionZone` concept (a record keyed by
 * id, `campaignStore.tsx` `ADD_FACTION_ZONE`/`UPDATE_FACTION_ZONE`/
 * `ARCHIVE_FACTION_ZONE`) that is NOT the same entity as Caldran's free-form
 * polyline `CampaignZone` and is out of scope for this pass -- same asymmetry
 * precedent as `routeAuthorityStore.ts` (Greyholm's `MapRoute` vs Caldran's
 * `routes` collection).
 *
 * Plain, always-on module -- no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider -- imported and called directly and
 * unconditionally from `userCampaignStore.tsx`, exactly like
 * `routeAuthorityStore.ts` / `mapPlacementAuthorityStore.ts` /
 * `fieldAuthorityStore.ts` / `presentedCardAuthorityStore.ts` /
 * `battleAuthorityStore.ts` / `revealAuthorityStore.ts` /
 * `partyPositionAuthorityStore.ts`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

const UNIVERSAL_ZONES_NAMESPACE = 'campaign-timeline-vtt:universal-zones:v1';

type ZoneAuthorityKind = 'userCampaign.zones';

/** Plain mirror of `CampaignZone` (this module must not depend on app-level
 * types). */
export interface ZoneSnapshotEntry {
  id: string;
  title: string;
  mapId: string;
  points: Array<{ x: number; y: number }>;
  color?: string;
  visibleToPlayers: boolean;
  notes?: string;
}

interface StoredZones {
  zones: ZoneSnapshotEntry[];
  revision: number;
}

function zonesKey(campaignId: CampaignId, kind: ZoneAuthorityKind): string {
  return `${UNIVERSAL_ZONES_NAMESPACE}:${campaignId}:${kind}`;
}

function isValidPoint(value: unknown): value is { x: number; y: number } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.x === 'number' && Number.isFinite(v.x) && typeof v.y === 'number' && Number.isFinite(v.y);
}

function isValidEntry(value: unknown): value is ZoneSnapshotEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' || v.id.length === 0 ||
    typeof v.title !== 'string' ||
    typeof v.mapId !== 'string' || v.mapId.length === 0 ||
    typeof v.visibleToPlayers !== 'boolean' ||
    !Array.isArray(v.points)
  ) {
    return false;
  }
  if (v.color !== undefined && typeof v.color !== 'string') return false;
  if (v.notes !== undefined && typeof v.notes !== 'string') return false;
  return v.points.every(isValidPoint);
}

/** Invariant: every entry must be well-shaped and ids must be unique within
 * the collection. Reject before persisting, never after -- mirrors
 * `checkRoutesInvariant`. */
function checkZonesInvariant(zones: ZoneSnapshotEntry[]): string | null {
  if (!Array.isArray(zones)) return 'zones must be an array';
  const seen = new Set<string>();
  for (const entry of zones) {
    if (!isValidEntry(entry)) return 'each zone must be a well-formed {id, title, mapId, points, visibleToPlayers}';
    if (seen.has(entry.id)) return `duplicate zone id: ${entry.id}`;
    seen.add(entry.id);
  }
  return null;
}

function readStoredZones(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: ZoneAuthorityKind,
): StoredZones | null {
  const raw = storage.getItem(zonesKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredZones;
    if (typeof parsed?.revision !== 'number') return null;
    if (!Array.isArray(parsed.zones)) return null;
    if (checkZonesInvariant(parsed.zones)) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface ZonesCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed collection, read back -- always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  zones?: ZoneSnapshotEntry[];
  error?: string;
}

/**
 * Atomically commit a whole zones collection under an expected-revision
 * guard (current stored revision, or 0 when never committed), verify it
 * read-after-write, and return the committed collection for the caller's
 * legacy compatibility projection.
 */
export function commitZones(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: ZoneAuthorityKind,
  zones: ZoneSnapshotEntry[],
): ZonesCommitOutcome {
  const invariant = checkZonesInvariant(zones);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredZones(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredZones = { zones, revision: newRevision };
  storage.setItem(zonesKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredZones(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, zones: readBack.zones };
}


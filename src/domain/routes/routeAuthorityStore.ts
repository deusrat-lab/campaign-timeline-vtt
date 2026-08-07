/**
 * Block I — durable route authority (Caldran `CampaignRoute[]`).
 *
 * Promotes Caldran's map-route collection (`addRoute` / `updateRoute` /
 * `removeRoute` in `userCampaignStore.tsx`, previously written DIRECTLY to
 * `patchData` with no complex-authority routing at all — not even the
 * optional/flag-gated sink mapPlacements had before its own cutover) to the
 * SOLE, unconditional active authority for this concern, following the exact
 * discipline Decision 2 established for battles and this Block I's
 * `mapPlacementAuthorityStore.ts` established for Caldran's map placements: a
 * candidate WHOLE collection (the campaign's complete `routes` array) is
 * committed to an isolated, campaign-scoped, expected-revision-guarded
 * universal namespace, verified read-after-write, and only THEN is the
 * committed collection projected into the existing legacy `patchData`
 * dispatch as a deterministic compatibility write. There is never an
 * independent legacy business decision and never a second universal write.
 *
 * This is a WHOLE-COLLECTION commit (mirrors `commitMapPlacements`), not a
 * scalar field commit (`fieldAuthorityStore.ts`), because a route mutation
 * (add/update points or flags/remove) always yields a new *complete* routes
 * array for the campaign, and the legacy `routes` field is always replaced
 * whole, never diffed.
 *
 * Caldran-only (`userCampaignStore.tsx`): Greyholm has a differently-shaped
 * `MapRoute` concept (hotspot-to-hotspot travel routes, `campaignStore.tsx`
 * `ADD_ROUTE`/`patchRoute`/`deleteRoute`) that is NOT the same entity as
 * Caldran's free-form polyline `CampaignRoute` and is out of scope for this
 * pass — same asymmetry precedent as `mapPlacementAuthorityStore.ts`
 * (Greyholm's party marker vs Caldran's mapPlacements collection).
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `userCampaignStore.tsx`, exactly like
 * `mapPlacementAuthorityStore.ts` / `fieldAuthorityStore.ts` /
 * `presentedCardAuthorityStore.ts` / `battleAuthorityStore.ts` /
 * `revealAuthorityStore.ts` / `partyPositionAuthorityStore.ts`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

const UNIVERSAL_ROUTES_NAMESPACE = 'campaign-timeline-vtt:universal-routes:v1';

type RouteAuthorityKind = 'userCampaign.routes';

/** Plain mirror of `CampaignRoute` (this module must not depend on app-level
 * types). */
export interface RouteSnapshotEntry {
  id: string;
  title: string;
  mapId: string;
  points: Array<{ x: number; y: number }>;
  type: string;
  visibleToPlayers: boolean;
  notes?: string;
}

interface StoredRoutes {
  routes: RouteSnapshotEntry[];
  revision: number;
}

function routesKey(campaignId: CampaignId, kind: RouteAuthorityKind): string {
  return `${UNIVERSAL_ROUTES_NAMESPACE}:${campaignId}:${kind}`;
}

function isValidPoint(value: unknown): value is { x: number; y: number } {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.x === 'number' && Number.isFinite(v.x) && typeof v.y === 'number' && Number.isFinite(v.y);
}

function isValidEntry(value: unknown): value is RouteSnapshotEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' || v.id.length === 0 ||
    typeof v.title !== 'string' ||
    typeof v.mapId !== 'string' || v.mapId.length === 0 ||
    typeof v.type !== 'string' ||
    typeof v.visibleToPlayers !== 'boolean' ||
    !Array.isArray(v.points)
  ) {
    return false;
  }
  if (v.notes !== undefined && typeof v.notes !== 'string') return false;
  return v.points.every(isValidPoint);
}

/** Invariant: every entry must be well-shaped and ids must be unique within
 * the collection. Reject before persisting, never after — mirrors
 * `checkPlacementsInvariant`. */
function checkRoutesInvariant(routes: RouteSnapshotEntry[]): string | null {
  if (!Array.isArray(routes)) return 'routes must be an array';
  const seen = new Set<string>();
  for (const entry of routes) {
    if (!isValidEntry(entry)) return 'each route must be a well-formed {id, title, mapId, points, type, visibleToPlayers}';
    if (seen.has(entry.id)) return `duplicate route id: ${entry.id}`;
    seen.add(entry.id);
  }
  return null;
}

function readStoredRoutes(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: RouteAuthorityKind,
): StoredRoutes | null {
  const raw = storage.getItem(routesKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredRoutes;
    if (typeof parsed?.revision !== 'number') return null;
    if (!Array.isArray(parsed.routes)) return null;
    if (checkRoutesInvariant(parsed.routes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface RoutesCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed collection, read back — always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  routes?: RouteSnapshotEntry[];
  error?: string;
}

/**
 * Atomically commit a whole routes collection under an expected-revision
 * guard (current stored revision, or 0 when never committed), verify it
 * read-after-write, and return the committed collection for the caller's
 * legacy compatibility projection.
 */
export function commitRoutes(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: RouteAuthorityKind,
  routes: RouteSnapshotEntry[],
): RoutesCommitOutcome {
  const invariant = checkRoutesInvariant(routes);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredRoutes(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredRoutes = { routes, revision: newRevision };
  storage.setItem(routesKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredRoutes(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, routes: readBack.routes };
}


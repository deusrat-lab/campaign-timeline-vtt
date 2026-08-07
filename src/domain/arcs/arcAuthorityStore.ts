/**
 * Block I — durable arc authority (Caldran `Timeline[]`, the `arcs` field of
 * `UserCampaignData`).
 *
 * Promotes Caldran's arc collection (create/patch/archive/delete, all
 * previously written DIRECTLY through `patchData` from `addArc`/`patchArc`/
 * `deleteArc` in `userCampaignStore.tsx` with no universal commit at all) to
 * the SOLE, unconditional active authority for this concern, following the
 * exact discipline Decision 2 established for battles and this Block I's
 * `routeAuthorityStore.ts` / `zoneAuthorityStore.ts` established for
 * Caldran's map routes and zones: a candidate WHOLE collection (the
 * campaign's complete `arcs` array) is committed to an isolated,
 * campaign-scoped, expected-revision-guarded universal namespace, verified
 * read-after-write, and only THEN is the committed collection projected into
 * the existing legacy `patchData` dispatch as a deterministic compatibility
 * write. There is never an independent legacy business decision and never a
 * second universal write.
 *
 * This is a WHOLE-COLLECTION commit (mirrors `commitRoutes`/`commitZones`/
 * `commitMapPlacements`), not a scalar field commit (`fieldAuthorityStore.ts`),
 * because every arc mutation (add/patch/delete) always yields a new
 * *complete* arcs array for the campaign, and the legacy `arcs` field is
 * always replaced whole, never diffed.
 *
 * Scope note: `currentArcId` (which arc is "current" right now) is a
 * `UserCampaignRuntime` pointer field, not part of this collection — it is
 * intentionally OUT OF SCOPE for this module, the same precedent already
 * established for `activeMapId`/camera view-state (see
 * `CONTINUATION_STATE.json`'s Block I notes): a "current selection" pointer
 * is a view-state concern, not campaign content, and folding it into a
 * durable authority store would be a product decision, not a mechanical
 * cutover. Only the `arcs` array itself (the actual timeline/arc records)
 * is converted here.
 *
 * Originally scoped Caldran-only: an earlier pass believed Greyholm's
 * `TIMELINES` was a fixed, hardcoded constant with only a single boolean
 * toggle (`SET_ARC2_REVEALED`) and no CRUD collection at all, the same
 * asymmetry precedent as `routeAuthorityStore.ts` / `zoneAuthorityStore.ts`.
 * That was wrong: Greyholm's `campaignStore.tsx` has always had a real
 * `addTimeline`/`patchTimeline`/`deleteTimeline` CRUD collection (seed
 * `TIMELINES` + `newTimelines`/`timelinePatches` overlay, NavBar-driven
 * create/rename/reorder/archive/restore/delete), so it is now converted
 * too, under the distinct `'greyholm.arcs'` kind (namespaced apart from
 * `'userCampaign.arcs'` — same storage, same invariant, different campaign
 * scope, same as every other Decision-2-style shared-module cutover).
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `userCampaignStore.tsx`, exactly like
 * `routeAuthorityStore.ts` / `zoneAuthorityStore.ts` /
 * `mapPlacementAuthorityStore.ts` / `fieldAuthorityStore.ts` /
 * `presentedCardAuthorityStore.ts` / `battleAuthorityStore.ts` /
 * `revealAuthorityStore.ts` / `partyPositionAuthorityStore.ts`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

const UNIVERSAL_ARCS_NAMESPACE = 'campaign-timeline-vtt:universal-arcs:v1';

type ArcAuthorityKind = 'userCampaign.arcs' | 'greyholm.arcs';

/** Plain mirror of `Timeline` (this module must not depend on app-level
 * types). */
export interface ArcSnapshotEntry {
  id: string;
  arcId: string;
  title: string;
  description?: string;
  order: number;
  isDefault?: boolean;
  visibleToPlayers?: boolean;
  isCurrent?: boolean;
  archived?: boolean;
}

interface StoredArcs {
  arcs: ArcSnapshotEntry[];
  revision: number;
}

function arcsKey(campaignId: CampaignId, kind: ArcAuthorityKind): string {
  return `${UNIVERSAL_ARCS_NAMESPACE}:${campaignId}:${kind}`;
}

function isValidEntry(value: unknown): value is ArcSnapshotEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (
    typeof v.id !== 'string' || v.id.length === 0 ||
    typeof v.arcId !== 'string' || v.arcId.length === 0 ||
    typeof v.title !== 'string' ||
    typeof v.order !== 'number' || !Number.isFinite(v.order)
  ) {
    return false;
  }
  if (v.description !== undefined && typeof v.description !== 'string') return false;
  if (v.isDefault !== undefined && typeof v.isDefault !== 'boolean') return false;
  if (v.visibleToPlayers !== undefined && typeof v.visibleToPlayers !== 'boolean') return false;
  if (v.isCurrent !== undefined && typeof v.isCurrent !== 'boolean') return false;
  if (v.archived !== undefined && typeof v.archived !== 'boolean') return false;
  return true;
}

/** Invariant: every entry must be well-shaped, ids must be unique within the
 * collection, and the collection may never become empty -- mirrors
 * `checkZonesInvariant` plus the "never zero arcs" rule `deleteArc` already
 * enforced at the call site. */
function checkArcsInvariant(arcs: ArcSnapshotEntry[]): string | null {
  if (!Array.isArray(arcs)) return 'arcs must be an array';
  if (arcs.length === 0) return 'arcs must never be empty';
  const seen = new Set<string>();
  for (const entry of arcs) {
    if (!isValidEntry(entry)) return 'each arc must be a well-formed {id, arcId, title, order}';
    if (seen.has(entry.id)) return `duplicate arc id: ${entry.id}`;
    seen.add(entry.id);
  }
  return null;
}

function readStoredArcs(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: ArcAuthorityKind,
): StoredArcs | null {
  const raw = storage.getItem(arcsKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredArcs;
    if (typeof parsed?.revision !== 'number') return null;
    if (!Array.isArray(parsed.arcs)) return null;
    if (checkArcsInvariant(parsed.arcs)) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface ArcsCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed collection, read back -- always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  arcs?: ArcSnapshotEntry[];
  error?: string;
}

/**
 * Atomically commit a whole arcs collection under an expected-revision guard
 * (current stored revision, or 0 when never committed), verify it
 * read-after-write, and return the committed collection for the caller's
 * legacy compatibility projection.
 */
export function commitArcs(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: ArcAuthorityKind,
  arcs: ArcSnapshotEntry[],
): ArcsCommitOutcome {
  const invariant = checkArcsInvariant(arcs);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredArcs(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredArcs = { arcs, revision: newRevision };
  storage.setItem(arcsKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredArcs(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, arcs: readBack.arcs };
}


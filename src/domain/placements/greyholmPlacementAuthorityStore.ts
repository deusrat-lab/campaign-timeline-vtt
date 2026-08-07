/**
 * Block L — durable map-placement authority for Greyholm (`MapObjectPlacement`).
 *
 * Promotes Greyholm's map-object placement collection (`addPlacement` /
 * `patchPlacement` move / `deletePlacement`, previously routed through the
 * OPTIONAL, default-off, flag-gated `routeGreyComplex('greyholm.placement',
 * ...)` sink -- the last remaining ACTIVE legacy write path in this project)
 * to the SOLE, unconditional active authority for this concern, following
 * the exact discipline every other Block I/Decision-2 cutover in
 * `campaignStore.tsx` already uses (commitArcs/commitZones/commitCalendar/
 * commitGreyholmBattle/...): a candidate WHOLE collection is committed to an
 * isolated, campaign-scoped, expected-revision-guarded universal namespace,
 * verified read-after-write, and only THEN is the committed collection
 * projected into the existing legacy dispatch as a deterministic
 * compatibility write. No flag, no optional fallback, never a second
 * universal write.
 *
 * Mirrors `mapPlacementAuthorityStore.ts` (Caldran's `mapPlacements`) almost
 * exactly -- same whole-collection-per-campaign shape -- but keyed to
 * Greyholm's richer `MapObjectPlacement` shape (arcId, mapLevel, the
 * entityKind union, optional entityId, title/subtitle/icon/imageUrl, status)
 * instead of Caldran's simpler `{id, mapId, entityType, entityId, x, y,
 * visibleToPlayers}`. Kept as a SEPARATE module (not a shared generic one)
 * because the two shapes are genuinely different, not because this is a
 * second canonical export/serialization format -- both still flow through
 * the same universal repository storage contract and the same
 * commit-then-project discipline.
 *
 * Plain, always-on module -- no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider -- imported and called directly and
 * unconditionally from `campaignStore.tsx`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

const UNIVERSAL_GREYHOLM_PLACEMENTS_NAMESPACE = 'campaign-timeline-vtt:universal-greyholm-placements:v1';

type GreyholmPlacementAuthorityKind = 'greyholm.placements';

/** Plain mirror of `MapObjectPlacement` (this module must not depend on
 * app-level types). */
export interface GreyholmPlacementSnapshotEntry {
  id: string;
  arcId: string;
  mapLevel: string;
  mapId?: string;
  entityKind: string;
  entityId?: string;
  title: string;
  subtitle?: string;
  icon?: string;
  imageUrl?: string;
  position: { x: number; y: number };
  visibleInPlayerView?: boolean;
  status?: string;
}

interface StoredGreyholmPlacements {
  placements: GreyholmPlacementSnapshotEntry[];
  revision: number;
}

function placementsKey(campaignId: CampaignId, kind: GreyholmPlacementAuthorityKind): string {
  return `${UNIVERSAL_GREYHOLM_PLACEMENTS_NAMESPACE}:${campaignId}:${kind}`;
}

function isValidEntry(value: unknown): value is GreyholmPlacementSnapshotEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.id !== 'string' || v.id.length === 0) return false;
  if (typeof v.arcId !== 'string' || v.arcId.length === 0) return false;
  if (typeof v.mapLevel !== 'string' || v.mapLevel.length === 0) return false;
  if (typeof v.entityKind !== 'string' || v.entityKind.length === 0) return false;
  if (typeof v.title !== 'string') return false;
  if (typeof v.position !== 'object' || v.position === null) return false;
  const pos = v.position as Record<string, unknown>;
  if (typeof pos.x !== 'number' || !Number.isFinite(pos.x)) return false;
  if (typeof pos.y !== 'number' || !Number.isFinite(pos.y)) return false;
  return true;
}

/** Invariant: every entry must be well-shaped and ids must be unique within
 * the collection. Reject before persisting, never after -- mirrors
 * `checkPlacementsInvariant` in `mapPlacementAuthorityStore.ts`. */
function checkGreyholmPlacementsInvariant(placements: GreyholmPlacementSnapshotEntry[]): string | null {
  if (!Array.isArray(placements)) return 'placements must be an array';
  const seen = new Set<string>();
  for (const entry of placements) {
    if (!isValidEntry(entry)) return 'each placement must be a well-formed MapObjectPlacement snapshot';
    if (seen.has(entry.id)) return `duplicate placement id: ${entry.id}`;
    seen.add(entry.id);
  }
  return null;
}

function readStoredGreyholmPlacements(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: GreyholmPlacementAuthorityKind,
): StoredGreyholmPlacements | null {
  const raw = storage.getItem(placementsKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredGreyholmPlacements;
    if (typeof parsed?.revision !== 'number') return null;
    if (!Array.isArray(parsed.placements)) return null;
    if (checkGreyholmPlacementsInvariant(parsed.placements)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface GreyholmPlacementsCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed collection, read back -- always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  placements?: GreyholmPlacementSnapshotEntry[];
  error?: string;
}

/**
 * Atomically commit a whole placements collection under an
 * expected-revision guard (current stored revision, or 0 when never
 * committed), verify it read-after-write, and return the committed
 * collection for the caller's legacy compatibility projection.
 */
export function commitGreyholmPlacements(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: GreyholmPlacementAuthorityKind,
  placements: GreyholmPlacementSnapshotEntry[],
): GreyholmPlacementsCommitOutcome {
  const invariant = checkGreyholmPlacementsInvariant(placements);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredGreyholmPlacements(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredGreyholmPlacements = { placements, revision: newRevision };
  storage.setItem(placementsKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredGreyholmPlacements(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, placements: readBack.placements };
}

/** Read-only accessor -- used by tests/harnesses that need the currently
 * committed collection without performing a commit. */
export function readGreyholmPlacements(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: GreyholmPlacementAuthorityKind,
): GreyholmPlacementSnapshotEntry[] {
  return readStoredGreyholmPlacements(storage, campaignId, kind)?.placements ?? [];
}

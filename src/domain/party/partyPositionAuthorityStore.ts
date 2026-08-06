/**
 * Block I — durable party-position authority.
 *
 * Promotes Greyholm's party position/travel tracking (SET_CURRENT_LOCATION /
 * SET_PARTY_MAP_POSITION / SET_PARTY_ROUTE_PROGRESS, previously routed
 * through the OPTIONAL, default-off, flag-gated
 * `routeGreyComplex('greyholm.partyLocation'|'greyholm.routeProgress', ...)`
 * complex-authority sink) to the SOLE, unconditional active authority for
 * this concern, following the exact discipline Decision 2 established for
 * battles and this session's `revealAuthorityStore.ts` established for
 * coupled aggregates: a candidate WHOLE snapshot is committed to an
 * isolated, campaign-scoped, expected-revision-guarded universal namespace,
 * verified read-after-write, and only THEN is the committed snapshot
 * projected into the existing legacy dispatch as a deterministic
 * compatibility write. There is never an independent legacy business
 * decision and never a second universal write.
 *
 * This is a WHOLE-OBJECT commit, not a scalar field commit
 * (`fieldAuthorityStore.ts`), because the party's position is a single
 * coupled aggregate — `currentLocationStateId`, `currentPartyRouteId`,
 * `currentMapPosition`, and `partyRouteProgress` are mutually exclusive/
 * clearing (arriving at a location clears the free-map position and any
 * in-progress route walk; a direct map move clears the location; advancing
 * a route walk clears the free-map position but not the location metadata)
 * and must always move together atomically, exactly matching the legacy
 * reducer's `SET_CURRENT_LOCATION` / `SET_PARTY_MAP_POSITION` /
 * `SET_PARTY_ROUTE_PROGRESS` cases in `campaignStore.tsx`.
 *
 * Greyholm-only: Caldran (`userCampaignStore.tsx`) has no equivalent
 * "current party marker position" concept — party there is a roster
 * (`CampaignPlayer[]`), and marker/placement position lives in the already-
 * converged reveal/placement-visibility cascade (`mapPlacements`). This
 * module is therefore only ever called with `campaignId` = the Greyholm
 * universal campaign id, same asymmetry as `battleAuthorityStore.ts`'s
 * Greyholm-only board.
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `campaignStore.tsx`, exactly like
 * `fieldAuthorityStore.ts` / `presentedCardAuthorityStore.ts` /
 * `battleAuthorityStore.ts` / `revealAuthorityStore.ts`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

export const UNIVERSAL_PARTY_POSITION_NAMESPACE = 'campaign-timeline-vtt:universal-party-position:v1';

export type PartyPositionAuthorityKind = 'greyholm.partyPosition';

export interface PartyMapPosition {
  timelineId: string;
  mapId: string;
  mapLevel: string;
  x: number;
  y: number;
}

/** Whole coupled party-position snapshot. All four fields are always the
 * candidate's complete next state (NOT a diff), exactly like
 * `RevealSnapshot` / `commitUserBoard`'s whole next board, so nothing can
 * partially apply. `partyRouteProgress` is stored as a plain object (the
 * legacy `PartyRouteProgress` shape) since this module must not depend on
 * app-level types. */
export interface PartyPositionSnapshot {
  currentLocationStateId: string | null;
  currentPartyRouteId: string | null;
  currentMapPosition: PartyMapPosition | null;
  partyRouteProgress: Record<string, unknown> | null;
}

export interface StoredPartyPosition {
  snapshot: PartyPositionSnapshot;
  revision: number;
}

function partyPositionKey(campaignId: CampaignId, kind: PartyPositionAuthorityKind): string {
  return `${UNIVERSAL_PARTY_POSITION_NAMESPACE}:${campaignId}:${kind}`;
}

function isNonEmptyStringOrNull(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && value.length > 0);
}

function isMapPosition(value: unknown): value is PartyMapPosition {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.timelineId === 'string' &&
    typeof v.mapId === 'string' &&
    typeof v.mapLevel === 'string' &&
    typeof v.x === 'number' && Number.isFinite(v.x) &&
    typeof v.y === 'number' && Number.isFinite(v.y)
  );
}

function isPlainObjectOrNull(value: unknown): value is Record<string, unknown> | null {
  return value === null || (typeof value === 'object' && !Array.isArray(value));
}

export function readStoredPartyPosition(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: PartyPositionAuthorityKind,
): StoredPartyPosition | null {
  const raw = storage.getItem(partyPositionKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPartyPosition;
    if (typeof parsed?.revision !== 'number') return null;
    const snap = parsed.snapshot;
    if (!snap) return null;
    if (!isNonEmptyStringOrNull(snap.currentLocationStateId)) return null;
    if (!isNonEmptyStringOrNull(snap.currentPartyRouteId)) return null;
    if (snap.currentMapPosition !== null && !isMapPosition(snap.currentMapPosition)) return null;
    if (!isPlainObjectOrNull(snap.partyRouteProgress)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Invariant: field shapes must be exactly as declared above. Reject before
 * persisting, never after — mirrors `checkRevealInvariant`. */
function checkPartyPositionInvariant(snapshot: PartyPositionSnapshot): string | null {
  if (!isNonEmptyStringOrNull(snapshot.currentLocationStateId)) {
    return 'currentLocationStateId must be a non-empty string or null';
  }
  if (!isNonEmptyStringOrNull(snapshot.currentPartyRouteId)) {
    return 'currentPartyRouteId must be a non-empty string or null';
  }
  if (snapshot.currentMapPosition !== null && !isMapPosition(snapshot.currentMapPosition)) {
    return 'currentMapPosition must be null or a finite {timelineId, mapId, mapLevel, x, y}';
  }
  if (!isPlainObjectOrNull(snapshot.partyRouteProgress)) {
    return 'partyRouteProgress must be null or a plain object';
  }
  return null;
}

export interface PartyPositionCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed snapshot, read back — always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  snapshot?: PartyPositionSnapshot;
  error?: string;
}

/**
 * Atomically commit a whole party-position snapshot under an
 * expected-revision guard (current stored revision, or 0 when never
 * committed), verify it read-after-write, and return the committed
 * snapshot for the caller's legacy compatibility projection.
 */
export function commitPartyPosition(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: PartyPositionAuthorityKind,
  snapshot: PartyPositionSnapshot,
): PartyPositionCommitOutcome {
  const invariant = checkPartyPositionInvariant(snapshot);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredPartyPosition(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredPartyPosition = { snapshot, revision: newRevision };
  storage.setItem(partyPositionKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredPartyPosition(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, snapshot: readBack.snapshot };
}

/** Current durable revision for a campaign's party-position snapshot (0
 * when never committed). */
export function partyPositionRevision(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: PartyPositionAuthorityKind,
): number {
  return readStoredPartyPosition(storage, campaignId, kind)?.revision ?? 0;
}

/** Reload/bootstrap: the durably-committed snapshot if one exists, else null
 * (caller falls back to its own legacy seed -- the one allowed migration
 * boundary, for a campaign that predates this cutover / was never
 * committed). */
export function readPartyPosition(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: PartyPositionAuthorityKind,
): PartyPositionSnapshot | null {
  return readStoredPartyPosition(storage, campaignId, kind)?.snapshot ?? null;
}

/**
 * Block I — durable reveal/visibility authority.
 *
 * Promotes the reveal/hide toggle (npc/quest/enemy/faction/location/player)
 * from the OPTIONAL, default-off, flag-gated `routeGreyComplex('greyholm.reveal', ...)`
 * / `routeUserComplex({ complexScope: 'userCampaign.reveal', ... })` routers to
 * the SOLE, unconditional active authority for this concern, following the
 * exact discipline Decision 2 established for battles
 * (`battleAuthorityStore.ts`): a candidate WHOLE snapshot is committed to an
 * isolated, campaign-scoped, expected-revision-guarded universal namespace,
 * verified read-after-write, and only THEN is the committed snapshot
 * projected into the existing legacy dispatch/patchData/patchRuntime as a
 * deterministic compatibility write. There is never an independent legacy
 * business decision and never a second universal write.
 *
 * This is a WHOLE-OBJECT commit, not a scalar field commit
 * (`fieldAuthorityStore.ts`) or a single-value commit
 * (`presentedCardAuthorityStore.ts`), because reveal is a coupled multi-field
 * aggregate: which entities are revealed, which map placements are visible to
 * players, and which linked images have been made player-safe by the reveal
 * cascade (reveal direction only — matching the exact legacy asymmetry) must
 * all move together atomically, exactly like `commitUserBoard`'s whole-board
 * battle commit. Greyholm only has the `revealedIds` half of this snapshot
 * (no map-placement/image cascade exists there); Caldran uses all three
 * fields. Both are the SAME store/shape — a campaign with no placement/image
 * cascade simply commits empty maps for those two fields.
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `campaignStore.tsx` and `userCampaignStore.tsx`,
 * exactly like `fieldAuthorityStore.ts` / `presentedCardAuthorityStore.ts` /
 * `battleAuthorityStore.ts`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

export const UNIVERSAL_REVEAL_NAMESPACE = 'campaign-timeline-vtt:universal-reveal:v1';

export type RevealAuthorityKind = 'greyholm.reveal' | 'userCampaign.reveal';

/**
 * Whole coupled reveal snapshot. `placementVisibility` and `imagePlayerSafe`
 * are sparse maps covering every id the caller currently knows about (NOT
 * just the id being toggled this call) — the entire next state is always the
 * candidate, exactly like `commitUserBoard`'s whole next board, so nothing
 * can partially apply.
 */
export interface RevealSnapshot {
  revealedIds: string[];
  placementVisibility: Record<string, boolean>;
  imagePlayerSafe: Record<string, boolean>;
}

export interface StoredReveal {
  snapshot: RevealSnapshot;
  revision: number;
}

function revealKey(campaignId: CampaignId, kind: RevealAuthorityKind): string {
  return `${UNIVERSAL_REVEAL_NAMESPACE}:${campaignId}:${kind}`;
}

function isBooleanMap(value: unknown): value is Record<string, boolean> {
  if (typeof value !== 'object' || value === null) return false;
  return Object.values(value as Record<string, unknown>).every((v) => typeof v === 'boolean');
}

export function readStoredReveal(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: RevealAuthorityKind,
): StoredReveal | null {
  const raw = storage.getItem(revealKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredReveal;
    if (typeof parsed?.revision !== 'number') return null;
    const snap = parsed.snapshot;
    if (!snap || !Array.isArray(snap.revealedIds) || !snap.revealedIds.every((id) => typeof id === 'string')) return null;
    if (!isBooleanMap(snap.placementVisibility) || !isBooleanMap(snap.imagePlayerSafe)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Invariant: revealedIds must be unique non-empty strings; the two maps must
 * be plain string->boolean records. Reject before persisting, never after —
 * mirrors `checkFieldInvariant` / `checkInvariants`. */
function checkRevealInvariant(snapshot: RevealSnapshot): string | null {
  if (!Array.isArray(snapshot.revealedIds) || snapshot.revealedIds.some((id) => typeof id !== 'string' || id.length === 0)) {
    return 'revealedIds must be an array of non-empty strings';
  }
  if (new Set(snapshot.revealedIds).size !== snapshot.revealedIds.length) {
    return 'revealedIds must not contain duplicates';
  }
  if (!isBooleanMap(snapshot.placementVisibility)) return 'placementVisibility must be a string->boolean map';
  if (!isBooleanMap(snapshot.imagePlayerSafe)) return 'imagePlayerSafe must be a string->boolean map';
  return null;
}

export interface RevealCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed snapshot, read back — always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  snapshot?: RevealSnapshot;
  error?: string;
}

/**
 * Atomically commit a whole reveal snapshot under an expected-revision guard
 * (current stored revision, or 0 when never committed), verify it
 * read-after-write, and return the committed snapshot for the caller's
 * legacy compatibility projection.
 */
export function commitReveal(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: RevealAuthorityKind,
  snapshot: RevealSnapshot,
): RevealCommitOutcome {
  const invariant = checkRevealInvariant(snapshot);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredReveal(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredReveal = { snapshot, revision: newRevision };
  storage.setItem(revealKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredReveal(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, snapshot: readBack.snapshot };
}

/** Current durable revision for a campaign's reveal snapshot (0 when never
 * committed). */
export function revealRevision(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: RevealAuthorityKind,
): number {
  return readStoredReveal(storage, campaignId, kind)?.revision ?? 0;
}

/** Reload/bootstrap: the durably-committed snapshot if one exists, else null
 * (caller falls back to its own legacy seed -- the one allowed migration
 * boundary, for a campaign that predates this cutover / was never
 * committed). */
export function readReveal(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: RevealAuthorityKind,
): RevealSnapshot | null {
  return readStoredReveal(storage, campaignId, kind)?.snapshot ?? null;
}

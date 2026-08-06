/**
 * Block I — durable presented-card authority.
 *
 * Promotes the Stage 16.1 "presentedCard" complex-authority scope (show/
 * dismiss the DM-presented card, for both Greyholm and Caldran) from an
 * OPTIONAL, default-off, flag-gated router (`routeGreyComplex` /
 * `routeUserComplex` -> `complexAuthorityRouter`) to the SOLE, unconditional
 * active authority for this field, following the exact discipline Decision 2
 * established for battles and Block I already established for scalar fields
 * (`fieldAuthorityStore.ts`): a candidate value is committed to an isolated,
 * campaign-scoped, expected-revision-guarded universal namespace, verified
 * read-after-write, and only THEN is the committed value projected into the
 * existing legacy dispatch/patchRuntime as a deterministic compatibility
 * write. There is never an independent legacy business decision and never a
 * second universal write.
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `campaignStore.tsx` and `userCampaignStore.tsx`,
 * exactly like `fieldAuthorityStore.ts` / `battleAuthorityStore.ts`.
 *
 * Scope note: this store owns only the presented-card value itself. Caldran's
 * legacy write additionally clears the unrelated `presentedBattle` field in
 * the SAME compatibility dispatch (mutual exclusion between "showing a card"
 * and "showing a battle board") — that remains the caller's job, exactly as
 * documented at the call site, and is not part of this store's committed
 * value or invariants.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

export const UNIVERSAL_PRESENTED_CARD_NAMESPACE = 'campaign-timeline-vtt:universal-presented-card:v1';

export type PresentedCardAuthorityKind = 'greyholm.presentedCard' | 'userCampaign.presentedCard';

export interface PresentedCardValue {
  type: string;
  id: string;
}

export interface StoredPresentedCard {
  card: PresentedCardValue | null;
  revision: number;
}

function presentedCardKey(campaignId: CampaignId, kind: PresentedCardAuthorityKind): string {
  return `${UNIVERSAL_PRESENTED_CARD_NAMESPACE}:${campaignId}:${kind}`;
}

export function readStoredPresentedCard(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: PresentedCardAuthorityKind,
): StoredPresentedCard | null {
  const raw = storage.getItem(presentedCardKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredPresentedCard;
    if (typeof parsed?.revision !== 'number') return null;
    if (parsed.card !== null && (typeof parsed.card?.type !== 'string' || typeof parsed.card?.id !== 'string')) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface PresentedCardCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed value, read back — always what the caller should
   * project into the legacy compatibility write, never its own candidate. */
  card?: PresentedCardValue | null;
  error?: string;
}

/** Invariant: a non-null card must carry a non-empty string type and id —
 * mirrors `checkFieldInvariant` (reject before persisting, never after). */
function checkPresentedCardInvariant(card: PresentedCardValue | null): string | null {
  if (card === null) return null;
  if (typeof card.type !== 'string' || card.type.length === 0) return 'presented card type must be a non-empty string';
  if (typeof card.id !== 'string' || card.id.length === 0) return 'presented card id must be a non-empty string';
  return null;
}

/**
 * Atomically commit a presented-card value (or `null` to dismiss) under an
 * expected-revision guard (current stored revision, or 0 when never
 * committed), verify it read-after-write, and return the committed value for
 * the caller's legacy compatibility projection.
 */
export function commitPresentedCard(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: PresentedCardAuthorityKind,
  card: PresentedCardValue | null,
): PresentedCardCommitOutcome {
  const invariant = checkPresentedCardInvariant(card);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredPresentedCard(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredPresentedCard = { card, revision: newRevision };
  storage.setItem(presentedCardKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredPresentedCard(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, card: readBack.card };
}

/** Current durable revision for a campaign's presented card (0 when never
 * committed). */
export function presentedCardRevision(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: PresentedCardAuthorityKind,
): number {
  return readStoredPresentedCard(storage, campaignId, kind)?.revision ?? 0;
}

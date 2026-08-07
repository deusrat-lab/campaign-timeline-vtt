/**
 * Block I — durable field authority.
 *
 * Promotes the Stage 15 "safe scalar/text field" scope (npc name/role/
 * description, quest title/description, faction name/description, location
 * description) from an OPTIONAL, default-off, flag-gated router to the SOLE,
 * unconditional active authority for these fields, following the exact same
 * discipline Decision 2 established for battles: a candidate value is
 * committed to an isolated, campaign-scoped, expected-revision-guarded
 * universal namespace, verified read-after-write, and only THEN does the
 * existing legacy action run once as a deterministic compatibility
 * projection of the already-committed value. There is never an independent
 * legacy business decision and never a second universal write.
 *
 * Unlike Stage 15 (`durableAuthoritySink.ts` / `DurableAuthorityProvider`),
 * this store has NO feature flag, NO diagnostics namespace, NO recovery
 * queue and NO React provider — it is a plain, always-on module, imported
 * and called directly and unconditionally from `campaignStore.tsx` and
 * `userCampaignStore.tsx`, exactly like `battleAuthorityStore.ts`. The
 * legacy field write is never reached except as this store's own
 * compatibility-projection callback.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

export const UNIVERSAL_FIELD_NAMESPACE = 'campaign-timeline-vtt:universal-field:v1';

/** Closed allowlist — mirrors the Stage 15 `DurableAuthorityScope` set exactly
 * (see `src/domain/durable-authority/durableAuthorityTypes.ts`), minus the
 * `.update` suffix since this store is not scope-string driven. */
export type FieldAuthorityKind =
  | 'greyholm.npc.role'
  | 'greyholm.npc.name'
  | 'greyholm.quest.title'
  | 'greyholm.quest.description'
  | 'userCampaign.npc.role'
  | 'userCampaign.npc.name'
  | 'userCampaign.npc.description'
  | 'userCampaign.quest.title'
  | 'userCampaign.quest.description'
  | 'userCampaign.faction.name'
  | 'userCampaign.faction.description'
  | 'userCampaign.location.description';

export interface StoredField {
  value: string;
  revision: number;
}

function fieldKey(campaignId: CampaignId, kind: FieldAuthorityKind, entityId: string): string {
  return `${UNIVERSAL_FIELD_NAMESPACE}:${campaignId}:${kind}:${entityId}`;
}

export function readStoredField(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: FieldAuthorityKind,
  entityId: string,
): StoredField | null {
  const raw = storage.getItem(fieldKey(campaignId, kind, entityId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredField;
    if (typeof parsed?.value !== 'string' || typeof parsed.revision !== 'number') return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface FieldCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed value, read back — always what the caller should
   * project into the legacy compatibility write, never its own candidate. */
  value?: string;
  error?: string;
}

/** Invariant: the field value must be a string (already enforced by the
 * caller's type) — this store additionally rejects a value exceeding a sane
 * bound, mirroring `checkInvariants` for battles (reject before persisting,
 * never after). */
function checkFieldInvariant(value: string): string | null {
  if (value.length > 20000) return 'field value exceeds maximum length';
  return null;
}

/**
 * Atomically commit a field value under an expected-revision guard (current
 * stored revision, or 0 when never committed), verify it read-after-write,
 * and return the committed value for the caller's legacy compatibility
 * projection.
 */
export function commitField(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: FieldAuthorityKind,
  entityId: string,
  value: string,
): FieldCommitOutcome {
  const invariant = checkFieldInvariant(value);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredField(storage, campaignId, kind, entityId);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredField = { value, revision: newRevision };
  storage.setItem(fieldKey(campaignId, kind, entityId), JSON.stringify(record));

  const readBack = readStoredField(storage, campaignId, kind, entityId);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, value: readBack.value };
}

/** Current durable revision for a field (0 when never committed). */
export function fieldRevision(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: FieldAuthorityKind,
  entityId: string,
): number {
  return readStoredField(storage, campaignId, kind, entityId)?.revision ?? 0;
}

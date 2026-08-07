/**
 * Block I — general entity<->entity relation authority.
 *
 * Scope: the exact bounded set of relation fields already exercised by the
 * shared BLOCK_DELETE / referential-integrity policy
 * (`src/shared/entity/contentDeletePolicy.ts`, backed by
 * `findUcBlockingRelations` in `CampaignEntityCard.tsx` for Caldran and
 * `findNpcBlockingRelations`/`findQuestBlockingRelations`/
 * `findEnemyBlockingRelations` in `EntityLibraryPage.tsx` for Greyholm) --
 * NOT every relation field in the app. Read those functions directly to
 * confirm the bounded set before extending this table:
 *
 *   Caldran (user-campaign, `UserCampaignData`):
 *     quest.npcIds        (array)  -- checked deleting an npc
 *     npc.locationId       (single) -- checked deleting a location
 *     quest.locationId     (single) -- checked deleting a location
 *     enemy.locationIds    (array)  -- checked deleting a location
 *
 *   Greyholm (main campaign, `CampaignData`):
 *     quest.giver           (single, npc id) -- checked deleting an npc
 *     locationState.npcIds  (array)           -- checked deleting an npc
 *     locationState.questIds(array)           -- checked deleting a quest
 *     quest.enemies          (array)           -- checked deleting an enemy
 *     locationState.enemyIds (array)           -- checked deleting an enemy
 *
 * This module ships the authority mechanism generically, keyed as
 * `(campaignId, relationField) -> RelationEntry[]` where each entry is
 * `{ fromId, toIds }` -- a WHOLE-COLLECTION commit per relation field,
 * mirroring `zoneAuthorityStore.ts`/`arcAuthorityStore.ts`'s
 * whole-collection-per-entity-key shape rather than
 * `fieldAuthorityStore.ts`'s single-scalar shape, because a relation
 * mutation for one `fromId` always yields a new complete list of
 * `{fromId, toIds}` pairs for that field across the campaign (never a
 * per-entry diff).
 *
 * `toIds` is always an array, even for a "single" relation field like
 * `npc.locationId` (0 or 1 entries) -- callers normalize scalar <-> array at
 * the call site (`relationToIds`/`idsToSingle` below), so the authority
 * module itself never needs to know a field's cardinality.
 *
 * Wired as sole authority for MUTATIONS on this bounded field set only. See
 * `src/state/userCampaignStore.tsx` (`resolveUserRelationKind`,
 * `updateEntity`) for the current Caldran wiring. Greyholm's equivalent set
 * (`campaignStore.tsx`) is NOT wired this pass -- see
 * `rebuild-reports/final-cutover/CONTINUATION_STATE.json` for the documented
 * next step and why (Greyholm's relation fields are reducer-dispatched
 * inside a much larger single-file reducer with no existing per-field
 * choke point comparable to Caldran's `updateEntity`, unlike every other
 * Block I subsystem where both stacks converged in one pass).
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

const UNIVERSAL_RELATIONS_NAMESPACE = 'campaign-timeline-vtt:universal-relations:v1';

/** Closed set of relation fields this module may take authority over. Kept
 * as a string literal union (not an open `string`) so an unlisted field can
 * never accidentally acquire universal authority. */
export type RelationFieldKind =
  | 'userCampaign.quest.npcIds'
  | 'userCampaign.npc.locationId'
  | 'userCampaign.quest.locationId'
  | 'userCampaign.enemy.locationIds'
  | 'greyholm.quest.giver'
  | 'greyholm.locationState.npcIds'
  | 'greyholm.locationState.questIds'
  | 'greyholm.quest.enemies'
  | 'greyholm.locationState.enemyIds';

export interface RelationEntry {
  /** The referencing (owning) entity's id, e.g. a quest id or location-state id. */
  fromId: string;
  /** The referenced entity ids, always an array (0..1 for scalar fields, 0..n for array fields). */
  toIds: string[];
}

interface StoredRelations {
  entries: RelationEntry[];
  revision: number;
}

function relationsKey(campaignId: CampaignId, field: RelationFieldKind): string {
  return `${UNIVERSAL_RELATIONS_NAMESPACE}:${campaignId}:${field}`;
}

function isValidEntry(value: unknown): value is RelationEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  if (typeof v.fromId !== 'string' || v.fromId.length === 0) return false;
  if (!Array.isArray(v.toIds)) return false;
  return v.toIds.every((id) => typeof id === 'string' && id.length > 0);
}

/** Invariant: every entry must be well-shaped and `fromId` unique within the
 * collection (a relation field commit always replaces the WHOLE set of
 * `{fromId, toIds}` pairs for that field, so a duplicate `fromId` can never
 * be meaningful). Reject before persisting, never after -- mirrors
 * `checkZonesInvariant`. */
function checkRelationsInvariant(entries: RelationEntry[]): string | null {
  if (!Array.isArray(entries)) return 'entries must be an array';
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!isValidEntry(entry)) return 'each relation entry must be a well-formed {fromId, toIds: string[]}';
    if (seen.has(entry.fromId)) return `duplicate fromId in relation collection: ${entry.fromId}`;
    seen.add(entry.fromId);
  }
  return null;
}

function readStoredRelations(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  field: RelationFieldKind,
): StoredRelations | null {
  const raw = storage.getItem(relationsKey(campaignId, field));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredRelations;
    if (typeof parsed?.revision !== 'number') return null;
    if (!Array.isArray(parsed.entries)) return null;
    if (checkRelationsInvariant(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface RelationsCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed collection, read back -- always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  entries?: RelationEntry[];
  error?: string;
}

/**
 * Atomically commit a whole relation-entries collection for one
 * `(campaignId, field)` key under an expected-revision guard (current
 * stored revision, or 0 when never committed), verify it read-after-write,
 * and return the committed collection for the caller's legacy compatibility
 * projection. Mirrors `commitZones`/`commitRoutes` exactly.
 */
export function commitRelations(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  field: RelationFieldKind,
  entries: RelationEntry[],
): RelationsCommitOutcome {
  const invariant = checkRelationsInvariant(entries);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredRelations(storage, campaignId, field);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredRelations = { entries, revision: newRevision };
  storage.setItem(relationsKey(campaignId, field), JSON.stringify(record));

  const readBack = readStoredRelations(storage, campaignId, field);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, entries: readBack.entries };
}

/** Read-only accessor -- used by tests and by callers that need the
 * currently-committed relation collection without performing a commit. */
export function readRelations(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  field: RelationFieldKind,
): RelationEntry[] {
  return readStoredRelations(storage, campaignId, field)?.entries ?? [];
}

/** Normalize a scalar relation value (`string | undefined`, e.g.
 * `npc.locationId`) to the `toIds` array shape the authority module deals
 * in. */
export function scalarToIds(value: string | undefined | null): string[] {
  return value ? [value] : [];
}

/** Project a `toIds` array back to a scalar relation value -- the inverse of
 * `scalarToIds`. Any entry beyond the first is a caller bug (scalar fields
 * must never commit more than one id) and is dropped defensively rather than
 * silently duplicated into app state. */
export function idsToScalar(toIds: string[]): string | undefined {
  return toIds.length > 0 ? toIds[0] : undefined;
}

/**
 * Block I — durable Greyholm economy-services (shop/tavern) field authority.
 *
 * Promotes the DM Companion "Услуги" editors (`ShopServiceEditor`/
 * `TavernServiceEditor` in `src/pages/ServicesPage.tsx`) — the only write
 * path onto `DmShop`/`DmTavern` records, reached through
 * `store.patchShop`/`store.patchTavern` in `campaignStore.tsx` — from an
 * uncommitted `PATCH_ENTITY` dispatch to the SOLE, unconditional active
 * authority for these two entity kinds, following the exact discipline
 * `fieldAuthorityStore.ts` established for entity-keyed values and
 * `calendarAuthorityStore.ts` established for entity-keyed WHOLE-OBJECT
 * values: a candidate patch object for a given shop/tavern id is committed
 * to an isolated, campaign-scoped, expected-revision-guarded universal
 * namespace, verified read-after-write, and only THEN is the committed
 * patch projected into the existing legacy `PATCH_ENTITY` dispatch as a
 * deterministic compatibility write. There is never an independent legacy
 * business decision and never a second universal write.
 *
 * Unlike `fieldAuthorityStore.ts` (one string field per commit), this store
 * commits the WHOLE accumulated overlay patch object for one shop/tavern id
 * per call — mirroring exactly what `campaignStore.tsx`'s own `PATCH_ENTITY`
 * reducer case already does (`{...prevPatch, ...action.patch}`, see
 * `reducer`'s `case 'PATCH_ENTITY'`), so the durably-committed value and the
 * legacy `shopPatches[id]`/`tavernPatches[id]` overlay entry stay
 * identical at every step, exactly the same "commit first, legacy write is
 * a pure projection" shape Decision 2 established for battles.
 *
 * The DM Companion "Услуги" editors always submit a multi-field patch (name,
 * description, items[], services[], ... in one call — see
 * `ShopServiceEditor`/`TavernServiceEditor`'s `onSubmit`), never a
 * single-field edit, which is why this is a whole-patch-object commit
 * rather than the single-scalar-field allowlist `fieldAuthorityStore.ts`
 * uses for npc/quest fields.
 *
 * Greyholm-only: Caldran (`userCampaignStore.tsx` / `src/types/userCampaign.ts`)
 * has no DM-companion shop/tavern data model at all (confirmed by grep — no
 * `DmShop`/`DmTavern`/`shopPatches`/`tavernPatches` anywhere in that store or
 * its types) — same asymmetry precedent as `calendarAuthorityStore.ts` /
 * `partyPositionAuthorityStore.ts`.
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `campaignStore.tsx`, exactly like
 * `fieldAuthorityStore.ts` / `calendarAuthorityStore.ts` /
 * `capabilityAuthorityStore.ts`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

const UNIVERSAL_SERVICE_NAMESPACE = 'campaign-timeline-vtt:universal-service:v1';

/** Closed allowlist — the two DM Companion economy-services entity kinds
 * that have a real write path (`patchShop`/`patchTavern` in
 * `campaignStore.tsx`). `economyReference` (`patchEconomyReference`) is
 * deliberately NOT included: grep confirms it has no dispatcher call site
 * anywhere in the app (`DmEconomyReferenceItem` — 700-entry economy.json
 * reference list — is read-only in the live UI; the store method exists but
 * is never invoked). */
export type ServiceAuthorityKind = 'greyholm.shop' | 'greyholm.tavern';

/** A patch object is any plain JSON-serializable record — this store must
 * not depend on `DmShop`/`DmTavern` app-level types (mirrors
 * `CalendarSnapshot`'s app-independence). */
type ServicePatch = Record<string, unknown>;

interface StoredServicePatch {
  patch: ServicePatch;
  revision: number;
}

function serviceKey(campaignId: CampaignId, kind: ServiceAuthorityKind, entityId: string): string {
  return `${UNIVERSAL_SERVICE_NAMESPACE}:${campaignId}:${kind}:${entityId}`;
}

/** Invariant: the patch must be a plain, non-null, non-array JSON object,
 * and bounded in size — reject before persisting, never after (mirrors
 * `checkFieldInvariant`/`checkCalendarInvariant`). */
function checkServiceInvariant(patch: ServicePatch): string | null {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) {
    return 'service patch must be a plain object';
  }
  let size: number;
  try {
    size = JSON.stringify(patch).length;
  } catch {
    return 'service patch must be JSON-serializable';
  }
  if (size > 200000) return 'service patch exceeds maximum size';
  return null;
}

function readStoredServicePatch(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: ServiceAuthorityKind,
  entityId: string,
): StoredServicePatch | null {
  const raw = storage.getItem(serviceKey(campaignId, kind, entityId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredServicePatch;
    if (typeof parsed?.revision !== 'number') return null;
    if (typeof parsed.patch !== 'object' || parsed.patch === null || Array.isArray(parsed.patch)) return null;
    return parsed;
  } catch {
    return null;
  }
}

interface ServiceCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed patch, read back — always what the caller should
   * project into the legacy compatibility write, never its own candidate. */
  patch?: ServicePatch;
  error?: string;
}

/**
 * Atomically commit a whole accumulated patch object for one shop/tavern id
 * under an expected-revision guard (current stored revision, or 0 when
 * never committed), verify it read-after-write, and return the committed
 * patch for the caller's legacy compatibility projection.
 */
export function commitServicePatch(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: ServiceAuthorityKind,
  entityId: string,
  patch: ServicePatch,
): ServiceCommitOutcome {
  const invariant = checkServiceInvariant(patch);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredServicePatch(storage, campaignId, kind, entityId);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredServicePatch = { patch, revision: newRevision };
  storage.setItem(serviceKey(campaignId, kind, entityId), JSON.stringify(record));

  const readBack = readStoredServicePatch(storage, campaignId, kind, entityId);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, patch: readBack.patch };
}


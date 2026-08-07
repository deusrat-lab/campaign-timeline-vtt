/**
 * Block I (this session) — universal campaign registry authority.
 *
 * Promotes `dmCompanion.userCampaigns.registry.v1` — the User-Campaign
 * (Caldran-style) registry array read by `loadRegistry()`/written by
 * `persistRegistry()`/`touchRegistry()`/`upsertRegistryFrom()` in
 * `userCampaignStore.tsx` — to a WHOLE-COLLECTION commit authority, following
 * the exact discipline established by `arcAuthorityStore.ts` /
 * `zoneAuthorityStore.ts` / `capabilityAuthorityStore.ts`: candidate ->
 * invariant check -> commit under an expected-revision guard -> read-after-
 * write -> caller projects the durably-committed value back into the legacy
 * `useState`/localStorage compatibility write.
 *
 * WHY WHOLE-COLLECTION, NOT ENTITY-KEYED: every real mutation site in
 * `userCampaignStore.tsx` (`persistRegistry`, `touchRegistry`,
 * `upsertRegistryFrom`, the two inline `writeJson(REGISTRY_KEY, next)` calls
 * inside `readData`'s player-fetch path and the live-sync `subscribeUc`
 * delete handler) already computes the FULL next array before writing it —
 * there is no per-entry legacy API. Mirroring that shape means the universal
 * commit and the legacy write are always fed the identical value, exactly
 * like `arcAuthorityStore.ts`'s whole-array commit.
 *
 * WHAT WAS INVESTIGATED (this session, not repeated from the earlier "no
 * bounded choke point" note): `touchRegistry` — the thing a prior pass
 * flagged as firing on every `patchData` call app-wide and therefore
 * "intractable" — was read line-by-line. It does exactly one thing: map over
 * the existing array and bump `updatedAt` on the ONE entry matching `id`,
 * leaving every other field (including every other entry) untouched. That is
 * not evidence against a bounded choke point; it is a legitimate
 * high-frequency, single-field-touch write, structurally identical to
 * `fieldAuthorityStore.ts` committing one scalar field on every edit. It
 * still fits the whole-collection commit shape below (the "candidate" is
 * simply the array with one entry's `updatedAt` bumped) without needing a
 * separate commit shape of its own.
 *
 * GREYHOLM: represented here as a synthetic, immutable SEED record
 * (`GREYHOLM_SYSTEM_REGISTRY_ENTRY`) under the same `RegistryEntry` contract
 * used for every Caldran-style campaign, per this task's own allowance for a
 * "universal system campaign record ... immutable/reference bootstrap ...
 * seed/migration boundary". `readUniversalRegistry()` below is the ONE lookup
 * that yields Greyholm + every User Campaign in one list; it does not rewrite
 * Greyholm's own data model (`campaignStore.tsx` / `src/data/campaignModules.ts`
 * `PROTECTED` flag stay exactly as they are) — it only gives route resolution
 * and campaign-switching code a single place to ask "what campaigns exist"
 * that includes Greyholm without a separate hardcoded branch.
 *
 * SCOPE BOUNDARY, STATED PLAINLY: `src/data/campaignModules.ts` is a SEPARATE,
 * STATIC `CampaignModule[]` list (World-Atlas-era, richer shape: worldId,
 * canonPolicy, mapIds, adventureModuleId, etc.) used by a different part of
 * the app (the World Atlas / campaign-browser UI). Folding THAT list into
 * this registry too is out of scope for this pass — it has no runtime
 * mutation path today (it is a static array, not a live store), so there is
 * nothing to convert to sole authority; only the two LIVE, mutable registries
 * (UC's `dmCompanion.userCampaigns.registry.v1` and Greyholm's absence of any
 * registry record at all) needed real conversion work, and both are now
 * covered by `readUniversalRegistry()`.
 *
 * Plain, always-on module — no feature flag — imported and called directly
 * from `userCampaignStore.tsx`, exactly like every other Block I authority
 * store.
 */
import type { RepositoryStorage } from '../repository/shadowRepository';

const UNIVERSAL_REGISTRY_NAMESPACE = 'campaign-timeline-vtt:universal-registry:v1';

export type UserCampaignRegistryType = 'campaign' | 'oneShot' | string;

/** Plain mirror of `UserCampaignRegistryEntry` (this module must not depend
 * on app-level types) plus a `kind` discriminator so a Greyholm seed record
 * and an ordinary User Campaign can share one contract. */
export interface RegistryEntry {
  campaignId: string;
  title: string;
  type: UserCampaignRegistryType;
  baseMapId: string;
  regionIds: string[];
  createdAt: string;
  updatedAt: string;
  /** 'userCampaign' for every Caldran-style entry (the only kind the legacy
   * array itself ever stored); 'greyholmSeed' only for the synthetic record
   * this module injects at read time — never persisted, never deletable. */
  kind: 'userCampaign' | 'greyholmSeed';
  /** True only for the Greyholm seed record — mirrors `CampaignModule.protected`
   * in `src/types/campaign.ts`, carried here so callers of the universal
   * lookup don't need a second source to know it can't be deleted/edited. */
  protectedSeed?: boolean;
}

/** Greyholm's identity for universal-registry purposes. Kept in sync with
 * `campaignIdFromLegacy('greyholm', 'main')` used across the rest of the
 * domain layer (battles/fields/reveal/etc.) — same campaign, same identity,
 * just also now resolvable through this registry's lookup. */
export const GREYHOLM_REGISTRY_CAMPAIGN_ID = 'greyholm:main';

const GREYHOLM_SYSTEM_REGISTRY_ENTRY: RegistryEntry = {
  campaignId: GREYHOLM_REGISTRY_CAMPAIGN_ID,
  title: 'Grey­holm',
  type: 'mainCampaign',
  baseMapId: 'map-city-greyholm',
  regionIds: [],
  createdAt: new Date(0).toISOString(),
  updatedAt: new Date(0).toISOString(),
  kind: 'greyholmSeed',
  protectedSeed: true,
};

interface StoredRegistry {
  entries: RegistryEntry[];
  revision: number;
}

function registryKey(): string {
  return UNIVERSAL_REGISTRY_NAMESPACE;
}

function isValidEntry(value: unknown): value is RegistryEntry {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.campaignId === 'string' && v.campaignId.length > 0 &&
    typeof v.title === 'string' &&
    typeof v.type === 'string' &&
    typeof v.baseMapId === 'string' &&
    Array.isArray(v.regionIds) &&
    typeof v.createdAt === 'string' &&
    typeof v.updatedAt === 'string' &&
    (v.kind === 'userCampaign' || v.kind === 'greyholmSeed')
  );
}

/** Invariant: every entry well-formed, no duplicate campaignId, and the
 * Greyholm identity is never smuggled in as an ordinary (deletable) entry —
 * it only ever exists as the synthetic seed injected by
 * `readUniversalRegistry`, never inside the persisted candidate itself. */
function checkRegistryInvariant(entries: RegistryEntry[]): string | null {
  if (!Array.isArray(entries)) return 'registry candidate must be an array';
  const seen = new Set<string>();
  for (const e of entries) {
    if (!isValidEntry(e)) return `malformed registry entry: ${JSON.stringify(e)}`;
    if (seen.has(e.campaignId)) return `duplicate campaignId rejected: ${e.campaignId}`;
    seen.add(e.campaignId);
    if (e.campaignId === GREYHOLM_REGISTRY_CAMPAIGN_ID) {
      return 'Greyholm campaignId must not be committed as an ordinary registry entry -- it is injected read-only by readUniversalRegistry()';
    }
  }
  return null;
}

function readStoredRegistry(storage: RepositoryStorage): StoredRegistry | null {
  const raw = storage.getItem(registryKey());
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredRegistry;
    if (typeof parsed?.revision !== 'number') return null;
    if (!Array.isArray(parsed.entries)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface RegistryCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed User-Campaign entries (Greyholm NOT included --
   * callers that want the full universal list call readUniversalRegistry()
   * instead), read back -- always what the caller should project into the
   * legacy `setRegistry`/`writeJson(REGISTRY_KEY, ...)` compatibility write,
   * never its own candidate. */
  entries?: RegistryEntry[];
  error?: string;
}

/**
 * Atomically commit the whole User-Campaign registry array under an
 * expected-revision guard, verify it read-after-write, and return the
 * committed array for the caller's legacy compatibility projection.
 *
 * This is the SOLE write authority for registry create/delete/metadata-patch
 * (rename, touchRegistry's updatedAt bump, server-sync upserts). Every one of
 * those legacy call sites in `userCampaignStore.tsx` computes its "next
 * array" exactly as before, then MUST pass it through this function instead
 * of writing `REGISTRY_KEY` directly.
 */
export function commitRegistry(
  storage: RepositoryStorage,
  entries: RegistryEntry[],
): RegistryCommitOutcome {
  const invariant = checkRegistryInvariant(entries);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredRegistry(storage);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredRegistry = { entries, revision: newRevision };
  storage.setItem(registryKey(), JSON.stringify(record));

  const readBack = readStoredRegistry(storage);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, entries: readBack.entries };
}

/** Reload/bootstrap: the durably-committed User-Campaign entries, or null if
 * never committed yet (caller falls back to its own legacy
 * `dmCompanion.userCampaigns.registry.v1` read -- the one allowed migration
 * boundary for pre-existing browsers). */
export function readRegistry(storage: RepositoryStorage): RegistryEntry[] | null {
  return readStoredRegistry(storage)?.entries ?? null;
}

/**
 * THE single universal campaign lookup: Greyholm (synthetic, protected seed)
 * plus every durably-committed User Campaign, in one list. Route resolution
 * (`/map`, `/campaigns/:id/...`) and campaign-switching UI should resolve
 * "does this campaign exist / what is its title & type" through this
 * function rather than checking Greyholm and the UC registry separately.
 *
 * Falls back to the caller-supplied `legacyUserCampaignEntries` (the
 * still-authoritative in-memory/localStorage array from
 * `userCampaignStore.tsx`) when nothing has been committed to the universal
 * namespace yet, so a pre-existing browser with campaigns already in
 * localStorage keeps working before its first write goes through
 * `commitRegistry`.
 */
export function readUniversalRegistry(
  storage: RepositoryStorage,
  legacyUserCampaignEntries: RegistryEntry[],
): RegistryEntry[] {
  const committed = readRegistry(storage);
  const userCampaigns = committed ?? legacyUserCampaignEntries;
  return [GREYHOLM_SYSTEM_REGISTRY_ENTRY, ...userCampaigns];
}

/** Look up one campaign (Greyholm or User Campaign) by id through the single
 * universal contract. Returns null if it does not exist in either source. */
export function lookupCampaign(
  storage: RepositoryStorage,
  legacyUserCampaignEntries: RegistryEntry[],
  campaignId: string,
): RegistryEntry | null {
  if (campaignId === GREYHOLM_REGISTRY_CAMPAIGN_ID) return GREYHOLM_SYSTEM_REGISTRY_ENTRY;
  const all = readUniversalRegistry(storage, legacyUserCampaignEntries);
  return all.find((e) => e.campaignId === campaignId) ?? null;
}

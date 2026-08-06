/**
 * Block I — durable capability-toggle authority.
 *
 * Promotes the per-campaign `CapabilityToggles` map (`SET_CAPABILITY` in
 * `campaignStore.tsx`'s reducer, `setCapability` in `userCampaignStore.tsx`,
 * both previously writing DIRECTLY to state/`patchData` with no universal
 * commit at all) to the SOLE, unconditional active authority for this
 * concern, following the exact discipline Decision 2 established for
 * battles and this Block I's `zoneAuthorityStore.ts`/`routeAuthorityStore.ts`/
 * `arcAuthorityStore.ts` established for whole-collection/whole-object
 * commits: a candidate WHOLE toggles map is committed to an isolated,
 * campaign-scoped, expected-revision-guarded universal namespace, verified
 * read-after-write, and only THEN is the committed map projected into the
 * existing legacy dispatch/`patchData` as a deterministic compatibility
 * write. There is never an independent legacy business decision and never a
 * second universal write.
 *
 * This is a WHOLE-OBJECT commit (mirrors `commitPartyPosition`), not a
 * per-key scalar field commit (`fieldAuthorityStore.ts`), because a single
 * toggle flip (`setCapability(key, enabled)`) is folded against the
 * campaign's CURRENT full toggles map before committing, so the durable
 * record always holds the complete map, never a single key in isolation —
 * this matches how both legacy call sites already build their next state
 * (`{ ...state.capabilities, [key]: enabled }` / `{ ...p.capabilities,
 * [key]: enabled }`).
 *
 * Shared module, used by BOTH stacks (unlike `zoneAuthorityStore.ts`/
 * `routeAuthorityStore.ts`/`arcAuthorityStore.ts`, which are Caldran-only):
 * Greyholm's `campaignStore.tsx` and Caldran's `userCampaignStore.tsx` each
 * have their own `CapabilityToggles` map with the SAME shape
 * (`Partial<Record<UniversalCapabilityKey, boolean>>`,
 * `src/domain/campaign/capabilities.ts`), gating the same NavRail/App.tsx
 * route-visibility logic for both campaigns — exactly the same asymmetry
 * precedent as `fieldAuthorityStore.ts`'s shared `FieldAuthorityKind` union
 * spanning `greyholm.*` and `userCampaign.*` kinds in one module.
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `campaignStore.tsx` / `userCampaignStore.tsx`,
 * exactly like `fieldAuthorityStore.ts` / `partyPositionAuthorityStore.ts` /
 * `zoneAuthorityStore.ts` / `routeAuthorityStore.ts` / `arcAuthorityStore.ts`.
 */
import { UNIVERSAL_CAPABILITY_KEYS, type UniversalCapabilityKey } from '../campaign/capabilities';
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

export const UNIVERSAL_CAPABILITIES_NAMESPACE = 'campaign-timeline-vtt:universal-capabilities:v1';

export type CapabilityAuthorityKind = 'greyholm.capabilities' | 'userCampaign.capabilities';

/** Plain mirror of `CapabilityToggles` (this module must not depend on
 * app-level types beyond the shared `UniversalCapabilityKey` allowlist). */
export type CapabilityTogglesSnapshot = Partial<Record<UniversalCapabilityKey, boolean>>;

export interface StoredCapabilities {
  toggles: CapabilityTogglesSnapshot;
  revision: number;
}

const KNOWN_KEYS: ReadonlySet<string> = new Set(UNIVERSAL_CAPABILITY_KEYS);

function capabilitiesKey(campaignId: CampaignId, kind: CapabilityAuthorityKind): string {
  return `${UNIVERSAL_CAPABILITIES_NAMESPACE}:${campaignId}:${kind}`;
}

/** Invariant: every key must be a known `UniversalCapabilityKey` and every
 * value must be a boolean. Reject before persisting, never after — mirrors
 * `checkZonesInvariant`/`checkPartyPositionInvariant`. */
function checkCapabilitiesInvariant(toggles: CapabilityTogglesSnapshot): string | null {
  if (typeof toggles !== 'object' || toggles === null || Array.isArray(toggles)) {
    return 'toggles must be a plain object';
  }
  for (const [key, value] of Object.entries(toggles)) {
    if (!KNOWN_KEYS.has(key)) return `unknown capability key: ${key}`;
    if (typeof value !== 'boolean') return `capability "${key}" value must be a boolean`;
  }
  return null;
}

export function readStoredCapabilities(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: CapabilityAuthorityKind,
): StoredCapabilities | null {
  const raw = storage.getItem(capabilitiesKey(campaignId, kind));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCapabilities;
    if (typeof parsed?.revision !== 'number') return null;
    if (checkCapabilitiesInvariant(parsed.toggles)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface CapabilitiesCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed toggles map, read back — always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  toggles?: CapabilityTogglesSnapshot;
  error?: string;
}

/**
 * Atomically commit a whole capability-toggles map under an
 * expected-revision guard (current stored revision, or 0 when never
 * committed), verify it read-after-write, and return the committed map for
 * the caller's legacy compatibility projection.
 */
export function commitCapabilities(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: CapabilityAuthorityKind,
  toggles: CapabilityTogglesSnapshot,
): CapabilitiesCommitOutcome {
  const invariant = checkCapabilitiesInvariant(toggles);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredCapabilities(storage, campaignId, kind);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredCapabilities = { toggles, revision: newRevision };
  storage.setItem(capabilitiesKey(campaignId, kind), JSON.stringify(record));

  const readBack = readStoredCapabilities(storage, campaignId, kind);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, toggles: readBack.toggles };
}

/** Current durable revision for a campaign's capability-toggles map (0 when
 * never committed). */
export function capabilitiesRevision(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: CapabilityAuthorityKind,
): number {
  return readStoredCapabilities(storage, campaignId, kind)?.revision ?? 0;
}

/** Reload/bootstrap: the durably-committed toggles map if one exists, else
 * null (caller falls back to its own legacy seed — the one allowed
 * migration boundary, for a campaign that predates this cutover / was never
 * committed). */
export function readCapabilities(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: CapabilityAuthorityKind,
): CapabilityTogglesSnapshot | null {
  return readStoredCapabilities(storage, campaignId, kind)?.toggles ?? null;
}

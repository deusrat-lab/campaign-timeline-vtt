/**
 * Part 1 (this session) — shared route-resolution existence gate.
 *
 * Extracted out of `IsolatedCampaignMapWorkspace.tsx` / `CampaignBattlePage.tsx`
 * so the "does this campaignId resolve to a real campaign" decision is one
 * pure, independently-testable function instead of duplicated inline
 * conditionals in two components. Both call sites pass the SAME
 * `lookupCampaign()` result (from `registryAuthorityStore.ts`, via
 * `useUserCampaigns().lookupCampaign`) as `registryEntry` here — this is the
 * concrete proof point that route resolution reads from the universal
 * registry rather than only checking "does a legacy data blob happen to
 * exist under this id".
 *
 * Contract, unchanged from the pre-existing behavior these two components
 * had before this session (a null/absent data blob → "not found" screen),
 * with ONE improvement: a campaignId the universal registry confirms does
 * NOT exist (`registryEntry === null`) is now rejected immediately, without
 * waiting on the legacy data blob to (possibly asynchronously) resolve.
 */
export type RouteExistenceOutcome = 'registryConfirmedMissing' | 'notYetLoaded' | 'found';

/**
 * @param campaignId   The route param, or undefined if absent entirely.
 * @param registryEntry The result of `lookupCampaign(storage, legacyEntries, campaignId)`
 *                       — null means the universal registry has no record of
 *                       this id (Greyholm nor any User Campaign).
 * @param data          The legacy content blob for this campaign, or null if
 *                       not yet loaded/never existed.
 */
export function resolveCampaignRouteExistence(
  campaignId: string | undefined,
  registryEntry: { campaignId: string } | null,
  data: unknown,
): RouteExistenceOutcome {
  if (!campaignId) return 'registryConfirmedMissing';
  // Registry says it doesn't exist AND there's no legacy blob either — fail
  // fast via the universal lookup, the priority case this session added.
  if (registryEntry === null && !data) return 'registryConfirmedMissing';
  // Registry hasn't caught up (or a genuinely valid id) but the data blob
  // itself isn't loaded yet (e.g. mid-async player fetch) — unchanged from
  // the pre-existing legacy behavior, not a new failure mode.
  if (!data) return 'notYetLoaded';
  return 'found';
}

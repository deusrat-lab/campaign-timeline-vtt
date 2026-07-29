import { useEffect, useRef } from 'react';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { adaptUserCampaignToUniversal, campaignIdFromLegacy } from '../../domain';
import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import { useShadowIntegration } from './ShadowIntegrationProvider';

/**
 * Stage 9 — bridges every user campaign's isolated legacy state into the shadow
 * coordinator, each under its OWN campaign-scoped shadow namespace key. Renders
 * nothing. Mounted only when the flag is on.
 *
 * The boundary is the store's side-effect-free in-memory snapshot
 * (`listShadowSources`). Per-campaign `data`/`runtime` object identity changes
 * only when that campaign is actually mutated, so we dedupe on reference and
 * submit only the campaigns that changed — no polling, no cross-campaign
 * interference. A campaign with no campaignId is skipped (never falls back to
 * Greyholm / a default).
 */
export function UserCampaignShadowBridge() {
  const { enabled, coordinator } = useShadowIntegration();
  const { listShadowSources } = useUserCampaigns();
  const seen = useRef(new Map<string, { data: UserCampaignData | null; runtime: UserCampaignRuntime | null }>());

  useEffect(() => {
    if (!enabled || !coordinator) return;
    for (const source of listShadowSources()) {
      const legacyId = source.data?.campaignId;
      if (!source.data || !legacyId) continue; // never fall back to a default campaign
      const previous = seen.current.get(source.campaignId);
      if (previous && previous.data === source.data && previous.runtime === source.runtime) continue;
      seen.current.set(source.campaignId, { data: source.data, runtime: source.runtime });
      const data = source.data;
      const runtime = source.runtime ?? undefined;
      coordinator.submit({
        campaignId: campaignIdFromLegacy('user', legacyId),
        sourceKind: 'legacy-user-campaign',
        build: () => adaptUserCampaignToUniversal({ data, runtime }),
      });
    }
  }, [enabled, coordinator, listShadowSources]);

  return null;
}

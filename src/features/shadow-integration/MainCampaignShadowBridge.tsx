import { useEffect } from 'react';
import { useCampaignData } from '../../state/campaignDataContext';
import { useCampaignStore } from '../../state/campaignStore';
import { adaptMainCampaignToUniversal, campaignIdFromLegacy } from '../../domain';
import type { MainCampaignDataInput, MainCampaignOverlayInput } from '../../domain';
import { useShadowIntegration } from './ShadowIntegrationProvider';

/**
 * Stage 9 — bridges the Greyholm main-campaign legacy state into the shadow
 * coordinator. Renders nothing. Mounted only when the flag is on.
 *
 * The integration boundary is the effective, already-merged CampaignData
 * (loadCampaignData seed + overlay via applyOverlayToList — the real production
 * merge, reused, not re-implemented) plus the live overlay. The effect fires on
 * any change to that merged data OR to the overlay store (whose identity
 * changes on every overlay mutation, covering runtime-only overlay changes such
 * as party position / active battle that do not alter the durable lists). The
 * coordinator debounces and always projects the latest consistent state.
 *
 * `build` is lazy: it runs at drain time and only READS legacy state; it never
 * mutates it, and a shadow failure never blocks the legacy save path.
 */
export function MainCampaignShadowBridge() {
  const { enabled, coordinator } = useShadowIntegration();
  const { data } = useCampaignData();
  const store = useCampaignStore();

  useEffect(() => {
    if (!enabled || !coordinator || !data) return;
    coordinator.submit({
      campaignId: campaignIdFromLegacy('greyholm', 'main'),
      sourceKind: 'legacy-main',
      build: () =>
        adaptMainCampaignToUniversal({
          data: data as unknown as MainCampaignDataInput,
          overlay: store.exportOverlay() as unknown as MainCampaignOverlayInput,
        }),
    });
  }, [enabled, coordinator, data, store]);

  return null;
}

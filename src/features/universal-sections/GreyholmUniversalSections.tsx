import { useMemo } from 'react';
import {
  adaptMainCampaignToUniversal,
  campaignIdFromLegacy,
} from '../../domain';
import type {
  CampaignId,
  CampaignSnapshot,
  MainCampaignDataInput,
  MainCampaignOverlayInput,
} from '../../domain';
import { UNIVERSAL_READ_PATH_ENABLED } from '../../config';
import { useCampaignData } from '../../state/campaignDataContext';
import { useCampaignStore } from '../../state/campaignStore';
import { UniversalSection } from './UniversalSection';

/**
 * Stage 11 — the Greyholm (main-campaign) universal read-only sections, mounted
 * inside the real DM Entity Library page (/npc, /enemies, /quests, …). Additive:
 * renders NOTHING when the Stage 10 read flag is off, so the library page is
 * byte-identical to its baseline.
 *
 * It builds the legacy universal snapshot ONCE from the live legacy stores (the
 * same adapter Stage 9/10 use) and hands it to each section as the fallback
 * source. The universal shadow snapshot is used only when the gateway decides
 * `universal`. No writes, no commands, no network — the DM Entity Library keeps
 * its own legacy write path entirely.
 *
 * DM sections (summary, NPC list) render the DM projection. The Player-Safe /
 * Observer / runtime sections render their audience projections only — proving
 * that even on a DM page a player-audience view model never carries DM secrets.
 */
export function GreyholmUniversalSections() {
  const { data } = useCampaignData();
  const overlay = useCampaignStore();

  const greyholmId = campaignIdFromLegacy('greyholm', 'main') as CampaignId;

  const legacySnapshot: CampaignSnapshot | null = useMemo(() => {
    if (!UNIVERSAL_READ_PATH_ENABLED || !data) return null;
    const adapted = adaptMainCampaignToUniversal({
      data: data as unknown as MainCampaignDataInput,
      overlay: overlay.exportOverlay() as unknown as MainCampaignOverlayInput,
    });
    return adapted.snapshot ?? null;
  }, [data, overlay]);

  if (!UNIVERSAL_READ_PATH_ENABLED) return null;

  return (
    <div className="usec-group" data-stack="greyholm">
      <UniversalSection
        scope="greyholm.dm.summary"
        campaignId={greyholmId}
        legacySnapshot={legacySnapshot}
        heading="Universal read — сводка кампании"
      />
      <UniversalSection
        scope="greyholm.dm.npcList"
        campaignId={greyholmId}
        legacySnapshot={legacySnapshot}
        heading="Universal read — NPC (DM)"
      />
      <UniversalSection
        scope="greyholm.playerSafe.entities"
        campaignId={greyholmId}
        legacySnapshot={legacySnapshot}
        heading="Universal read — объекты (вид игрока)"
        compact
      />
      <UniversalSection
        scope="greyholm.observer.status"
        campaignId={greyholmId}
        legacySnapshot={legacySnapshot}
        heading="Universal read — статус наблюдателя"
        compact
      />
      <UniversalSection
        scope="greyholm.runtime.presentation"
        campaignId={greyholmId}
        legacySnapshot={legacySnapshot}
        heading="Universal read — рантайм (показ/бои)"
        compact
      />
    </div>
  );
}

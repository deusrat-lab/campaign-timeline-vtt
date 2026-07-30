import { useMemo } from 'react';
import {
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
} from '../../domain';
import type { CampaignId, CampaignSnapshot } from '../../domain';
import { UNIVERSAL_READ_PATH_ENABLED } from '../../config';
import { useUserCampaigns } from '../../state/userCampaignStore';
import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import { UniversalSection } from './UniversalSection';

/**
 * Stage 11 — the user-campaign universal read-only sections, mounted inside the
 * real campaign library page (/campaigns/:id/library/:kind). Additive: renders
 * NOTHING when the Stage 10 read flag is off.
 *
 * It builds the legacy universal snapshot for THIS campaign only (strict
 * campaignId isolation) from the in-memory legacy store, and passes it as the
 * fallback source. In player / observer mode it renders the Player-Safe section
 * so a player component provably receives only player-safe entities; in DM mode
 * it also shows the DM summary. No writes, no commands, no cross-campaign reads.
 */
export function UserCampaignUniversalSections({
  legacyCampaignId,
  isPlayer,
}: {
  /** The legacy user-campaign id from the route (NOT the universal id). */
  legacyCampaignId: string | undefined;
  isPlayer: boolean;
}) {
  const store = useUserCampaigns();

  const universalId = useMemo<CampaignId | null>(
    () => (legacyCampaignId ? (campaignIdFromLegacy('user', legacyCampaignId) as CampaignId) : null),
    [legacyCampaignId],
  );

  const legacySnapshot: CampaignSnapshot | null = useMemo(() => {
    if (!UNIVERSAL_READ_PATH_ENABLED || !legacyCampaignId) return null;
    const data = store.getData(legacyCampaignId) as UserCampaignData | null;
    if (!data) return null;
    const runtime = store.getRuntime(legacyCampaignId) as UserCampaignRuntime | undefined;
    const adapted = adaptUserCampaignToUniversal({ data, runtime });
    return adapted.snapshot ?? null;
    // getData/getRuntime read the in-memory store; re-run when the campaign id or
    // the store identity changes (the store updates its own reference on mutate).
  }, [legacyCampaignId, store]);

  if (!UNIVERSAL_READ_PATH_ENABLED || !legacyCampaignId) return null;

  return (
    <div className="usec-group" data-stack="userCampaign">
      {!isPlayer && (
        <UniversalSection
          scope="userCampaign.dm.summary"
          campaignId={universalId}
          legacySnapshot={legacySnapshot}
          heading="Universal read — сводка кампании"
        />
      )}
      <UniversalSection
        scope="userCampaign.playerSafe.entities"
        campaignId={universalId}
        legacySnapshot={legacySnapshot}
        heading="Universal read — объекты (вид игрока)"
        compact
      />
      {!isPlayer && (
        <UniversalSection
          scope="userCampaign.observer.status"
          campaignId={universalId}
          legacySnapshot={legacySnapshot}
          heading="Universal read — статус наблюдателя"
          compact
        />
      )}
    </div>
  );
}

import { useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { UNIVERSAL_READ_PATH_ENABLED, UNIVERSAL_READ_PATH_SCOPES } from '../config';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import { useUserCampaigns } from '../state/userCampaignStore';
import {
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  PILOT_SCOPES,
  resolvePilotAllowlist,
} from '../domain';
import type {
  CampaignId,
  CampaignSnapshot,
  MainCampaignDataInput,
  MainCampaignOverlayInput,
} from '../domain';
import type { UserCampaignData, UserCampaignRuntime } from '../types/userCampaign';
import { useReadPath } from '../features/read-path/ReadPathProvider';
import { PilotCard } from '../features/read-path/PilotCard';

/**
 * Stage 10 — DM-only, read-flag-gated diagnostics surface that hosts the real
 * pilot read-path consumers. It is the ONLY place any pilot is mounted, so every
 * other UI consumer in the app keeps reading legacy data unchanged. Read-only:
 * it builds legacy snapshots from live legacy state for fallback and never
 * writes anything or invokes any command.
 */
export function ReadPathDiagnosticsPage() {
  const { data, loading, error } = useCampaignData();
  const overlay = useCampaignStore();
  const { listShadowSources } = useUserCampaigns();
  const { enabled: readEnabled, namespace } = useReadPath();

  const greyholmId = campaignIdFromLegacy('greyholm', 'main');
  const greyholmLegacySnapshot: CampaignSnapshot | null = useMemo(() => {
    if (!data) return null;
    const adapted = adaptMainCampaignToUniversal({
      data: data as unknown as MainCampaignDataInput,
      overlay: overlay.exportOverlay() as unknown as MainCampaignOverlayInput,
    });
    return adapted.snapshot ?? null;
  }, [data, overlay]);

  const userCampaigns = useMemo(() => {
    return listShadowSources()
      .map((source) => {
        const legacyId = source.data?.campaignId;
        if (!source.data || !legacyId) return null;
        const adapted = adaptUserCampaignToUniversal({
          data: source.data as UserCampaignData,
          runtime: (source.runtime ?? undefined) as UserCampaignRuntime | undefined,
        });
        return {
          legacyId,
          title: source.data.title,
          campaignId: campaignIdFromLegacy('user', legacyId) as CampaignId,
          legacySnapshot: adapted.snapshot ?? null,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null);
  }, [listShadowSources]);

  const allowedScopes = resolvePilotAllowlist(UNIVERSAL_READ_PATH_ENABLED, UNIVERSAL_READ_PATH_SCOPES);

  if (!UNIVERSAL_READ_PATH_ENABLED) return <Navigate to="/map" replace />;

  const greyholmScopes = PILOT_SCOPES.filter((definition) => definition.stack === 'greyholm');
  const userScopes = PILOT_SCOPES.filter((definition) => definition.stack === 'userCampaign');

  return (
    <section className="page-panel readpath-diagnostics">
      <h1>Stage 10 — universal read-path pilots</h1>
      <p>
        Read flag: <strong>{readEnabled ? 'on' : 'off'}</strong> · namespace <code>{namespace}</code> · enabled pilot
        scopes: <strong>{allowedScopes.size}</strong>/{PILOT_SCOPES.length}
      </p>
      <p>
        Legacy stores remain authoritative for all writes. A card reads the universal shadow snapshot only when it is
        fresh, valid and campaign-matched; otherwise it falls back to legacy. No writes, no commands, no network.
      </p>

      <h2>Greyholm (main campaign)</h2>
      {loading ? (
        <p>Loading campaign data…</p>
      ) : error || !data ? (
        <p>{error ?? 'No campaign data.'}</p>
      ) : (
        <div className="readpath-grid">
          {greyholmScopes.map((definition) => (
            <PilotCard
              key={definition.scope}
              scope={definition.scope}
              campaignId={greyholmId}
              legacySnapshot={greyholmLegacySnapshot}
            />
          ))}
        </div>
      )}

      <h2>User campaigns</h2>
      {userCampaigns.length === 0 ? (
        <p>No user campaigns are loaded in this tab.</p>
      ) : (
        userCampaigns.map((campaign) => (
          <div key={campaign.legacyId} className="readpath-usercampaign">
            <h3>{campaign.title} <code>{campaign.campaignId}</code></h3>
            <div className="readpath-grid">
              {userScopes.map((definition) => (
                <PilotCard
                  key={`${campaign.legacyId}:${definition.scope}`}
                  scope={definition.scope}
                  campaignId={campaign.campaignId}
                  legacySnapshot={campaign.legacySnapshot}
                />
              ))}
            </div>
          </div>
        ))
      )}
    </section>
  );
}

import { useMemo, type ReactNode } from 'react';
import {
  adaptUserCampaignToUniversal,
  buildCampaignWorkspaceDescriptor,
  buildUserCampaignNavigation,
  campaignIdFromLegacy,
} from '../../domain';
import type {
  CampaignId,
  CampaignSnapshot,
  CampaignWorkspaceAudience,
  CampaignWorkspaceModuleSlot,
  WorkspaceModuleId,
} from '../../domain';
import { UNIVERSAL_READ_PATH_ENABLED } from '../../config';
import { useUserCampaigns } from '../../state/userCampaignStore';
import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import { UniversalSection } from '../universal-sections/UniversalSection';
import { CampaignWorkspaceShell } from './CampaignWorkspaceShell';

/**
 * Stage 12 — a user campaign composed into the SAME shared workspace shell as
 * Greyholm, using the SAME descriptor + module registry. Strict campaignId
 * isolation: an absent campaignId is rejected (NO Greyholm fallback). Audience
 * comes from the route (DM vs player/observer); the descriptor builder filters
 * DM-only slots out of a player/observer descriptor entirely.
 *
 * Universal reads require the campaign to be in the shared in-memory session
 * cache (Stage 11 limitation); until then the legacy snapshot is null and every
 * shared-read-only section falls back to legacy. All writes stay legacy.
 */
export function UserCampaignWorkspace({
  legacyCampaignId,
  title,
  kind,
  activeRoute,
  audience,
  legacyHeader,
  legacyBody,
  bodyModuleId = 'library.body',
}: {
  legacyCampaignId: string | undefined;
  title: string;
  kind: string;
  activeRoute: string;
  audience: CampaignWorkspaceAudience;
  legacyHeader: ReactNode;
  legacyBody: ReactNode;
  /** Block G — 'library.body' for Content pages, 'map.workspace' / 'battle.board'
   * for Maps/Battle callers, so registry classification/labels stay accurate. */
  bodyModuleId?: WorkspaceModuleId;
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
  }, [legacyCampaignId, store]);

  // Strict isolation: no campaignId → no shared workspace descriptor. The host
  // still renders its own legacy body separately; here we only refuse to compose.
  const descriptor = useMemo(() => {
    if (!legacyCampaignId || !universalId) return null;
    return buildCampaignWorkspaceDescriptor({
      campaignId: universalId,
      campaignKind: 'userCampaign',
      title,
      subtitle: null,
      audience,
      activeRoute,
      navigationItems: buildUserCampaignNavigation(legacyCampaignId, kind, activeRoute, audience),
      requestedModules: ['campaign.summary', 'library.playerSafe', 'observer.status', bodyModuleId],
      status: {
        hydrated: !!store.getData(legacyCampaignId ?? ''),
        usingLegacyFallback: !UNIVERSAL_READ_PATH_ENABLED || !legacySnapshot,
        note: null,
      },
    });
  }, [legacyCampaignId, universalId, title, audience, activeRoute, kind, store, legacySnapshot, bodyModuleId]);

  if (!descriptor) {
    // No campaignId: reject the composition, render the legacy body alone.
    return <>{legacyBody}</>;
  }

  const readSlots: Partial<Record<WorkspaceModuleId, ReactNode>> = UNIVERSAL_READ_PATH_ENABLED
    ? {
        'campaign.summary': (
          <UniversalSection
            scope="userCampaign.dm.summary"
            campaignId={universalId}
            legacySnapshot={legacySnapshot}
            heading="Universal read — сводка кампании"
          />
        ),
        'library.playerSafe': (
          <UniversalSection
            scope="userCampaign.playerSafe.entities"
            campaignId={universalId}
            legacySnapshot={legacySnapshot}
            heading="Universal read — объекты (вид игрока)"
            compact
          />
        ),
        'observer.status': (
          <UniversalSection
            scope="userCampaign.observer.status"
            campaignId={universalId}
            legacySnapshot={legacySnapshot}
            heading="Universal read — статус наблюдателя"
            compact
          />
        ),
      }
    : {};

  const slotContent: Partial<Record<CampaignWorkspaceModuleSlot['moduleId'], ReactNode>> = {
    ...readSlots,
    [bodyModuleId]: legacyBody,
  };

  return (
    <CampaignWorkspaceShell descriptor={descriptor} legacyHeader={legacyHeader} slotContent={slotContent} />
  );
}

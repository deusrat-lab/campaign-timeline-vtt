import { useMemo, type ReactNode } from 'react';
import {
  adaptMainCampaignToUniversal,
  buildCampaignWorkspaceDescriptor,
  buildGreyholmNavigation,
  campaignIdFromLegacy,
} from '../../domain';
import type {
  CampaignId,
  CampaignSnapshot,
  CampaignWorkspaceModuleSlot,
  MainCampaignDataInput,
  MainCampaignOverlayInput,
  WorkspaceModuleId,
} from '../../domain';
import { UNIVERSAL_READ_PATH_ENABLED } from '../../config';
import { useCampaignData } from '../../state/campaignDataContext';
import { useCampaignStore } from '../../state/campaignStore';
import { UniversalSection } from '../universal-sections/UniversalSection';
import { CampaignWorkspaceShell } from './CampaignWorkspaceShell';

/**
 * Stage 12 — Greyholm composed into the ONE shared workspace shell.
 *
 * Used ONLY when the default-off shared-workspace flag is on (the host page
 * chooses the branch). It builds the SAME immutable descriptor + module registry
 * both stacks use, and mounts:
 *   - shared-read-only slots: the exact Stage 11 UniversalSection bands (still
 *     served by the guarded universal read path, legacy fallback), only when the
 *     independent Stage 10 read flag is on — otherwise those slots are empty;
 *   - one legacy-owned slot: the real entity-library body, passed in verbatim.
 *
 * No store/snapshot/handlers are moved into the shell — the legacy body keeps its
 * entire legacy write path. The universal shadow snapshot is read only through
 * the existing gateway; this file never calls a universal command.
 */
export function GreyholmWorkspace({
  activeRoute,
  legacyHeader,
  legacyBody,
}: {
  activeRoute: string;
  legacyHeader: ReactNode;
  legacyBody: ReactNode;
}) {
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

  // The Greyholm entity library is a DM-only route → DM audience descriptor.
  const descriptor = useMemo(
    () =>
      buildCampaignWorkspaceDescriptor({
        campaignId: greyholmId,
        campaignKind: 'greyholm',
        title: 'Greyholm',
        subtitle: null,
        audience: 'dm',
        activeRoute,
        navigationItems: buildGreyholmNavigation(activeRoute, 'dm'),
        requestedModules: [
          'campaign.summary',
          'library.dmList',
          'library.playerSafe',
          'observer.status',
          'runtime.presentation',
          'library.body',
        ],
        status: {
          hydrated: !!data,
          usingLegacyFallback: !UNIVERSAL_READ_PATH_ENABLED,
          note: null,
        },
      }),
    [greyholmId, activeRoute, data],
  );

  // Shared-read-only slots render the existing Stage 11 sections (universal read
  // path + legacy fallback). Only populated when the read flag is on, so
  // "workspace on + read off" shows the shell + legacy body with no empty bands.
  const readSlots: Partial<Record<WorkspaceModuleId, ReactNode>> = UNIVERSAL_READ_PATH_ENABLED
    ? {
        'campaign.summary': (
          <UniversalSection
            scope="greyholm.dm.summary"
            campaignId={greyholmId}
            legacySnapshot={legacySnapshot}
            heading="Universal read — сводка кампании"
          />
        ),
        'library.dmList': (
          <UniversalSection
            scope="greyholm.dm.npcList"
            campaignId={greyholmId}
            legacySnapshot={legacySnapshot}
            heading="Universal read — NPC (DM)"
          />
        ),
        'library.playerSafe': (
          <UniversalSection
            scope="greyholm.playerSafe.entities"
            campaignId={greyholmId}
            legacySnapshot={legacySnapshot}
            heading="Universal read — объекты (вид игрока)"
            compact
          />
        ),
        'observer.status': (
          <UniversalSection
            scope="greyholm.observer.status"
            campaignId={greyholmId}
            legacySnapshot={legacySnapshot}
            heading="Universal read — статус наблюдателя"
            compact
          />
        ),
        'runtime.presentation': (
          <UniversalSection
            scope="greyholm.runtime.presentation"
            campaignId={greyholmId}
            legacySnapshot={legacySnapshot}
            heading="Universal read — рантайм (показ/бои)"
            compact
          />
        ),
      }
    : {};

  const slotContent: Partial<Record<CampaignWorkspaceModuleSlot['moduleId'], ReactNode>> = {
    ...readSlots,
    'library.body': legacyBody,
  };

  return (
    <CampaignWorkspaceShell descriptor={descriptor} legacyHeader={legacyHeader} slotContent={slotContent} />
  );
}

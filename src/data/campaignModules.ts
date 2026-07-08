import type { CampaignContext, CampaignModule } from '../types/campaign';
import { getModuleById } from './adventureModules';

export const WORLD_ID = 'known-world';

/** localStorage key of the PROTECTED main campaign runtime (old flow). The new
 * isolated-runtime store never reads or writes this key. */
export const MAIN_CAMPAIGN_RUNTIME_KEY = 'campaign-timeline-vtt:overlay:v2';
export const MAIN_CAMPAIGN_ID = 'main-greyholm-campaign';

/**
 * Campaign registry — one shared world, many campaigns.
 *
 * The first entry wraps the existing Arc 1 / Arc 2 campaign WITHOUT migrating
 * it: opening it just routes to the legacy `/map` flow. All other entries are
 * isolated campaigns/one-shots with their own runtime keys. Map/region ids
 * point at the SHARED world atlas registry (WORLD_ATLAS_MAPS / WORLD_REGIONS)
 * — sharing a map does not share state.
 */
export const CAMPAIGN_MODULES: CampaignModule[] = [
  {
    id: MAIN_CAMPAIGN_ID,
    title: 'Main Campaign: Greyholm',
    titleRu: 'Основная кампания: Грейхольм',
    type: 'mainCampaign',
    status: 'active',
    worldId: WORLD_ID,
    canonPolicy: 'mainCanon',
    protected: true,
    arcIds: ['arc-1', 'arc-2'],
    mapIds: ['atlas-map-aurelon', 'atlas-map-greyholm-region', 'atlas-map-greyholm-city'],
    regionIds: ['region-aurelon', 'region-greyholm-region', 'region-greyholm-city'],
    locationIds: [],
    description: 'Текущая основная кампания с Аркой 1 и Аркой 2. Открывается через старый flow без изменений.',
    startRoute: '/map',
    runtimeKey: MAIN_CAMPAIGN_RUNTIME_KEY,
  },
  // NOTE: no pre-seeded one-shots here. New campaigns/one-shots are created by
  // the user via the wizard (/campaigns/new) and live in the user-campaign
  // store (dmCompanion.userCampaign*). The rich seed modules in
  // adventureModules.ts are reference templates only, not registered campaigns.
];

export function getCampaignById(id: string): CampaignModule | undefined {
  return CAMPAIGN_MODULES.find((c) => c.id === id);
}

export function getCampaignByAdventureModuleId(moduleId: string): CampaignModule | undefined {
  return CAMPAIGN_MODULES.find((c) => c.adventureModuleId === moduleId);
}

export function isProtectedCampaign(id: string): boolean {
  return getCampaignById(id)?.protected === true;
}

/** Build the read-only context for a campaign. Available data is pulled from
 * the registry + its linked AdventureModule. */
export function buildCampaignContext(id: string): CampaignContext | undefined {
  const campaign = getCampaignById(id);
  if (!campaign) return undefined;
  const adv = campaign.adventureModuleId ? getModuleById(campaign.adventureModuleId) : undefined;
  const mode = campaign.protected
    ? 'mainCampaign'
    : campaign.type === 'oneShot' || campaign.type === 'historicalOneShot'
      ? 'oneShot'
      : 'campaign';
  return {
    campaignId: campaign.id,
    worldId: campaign.worldId,
    mode,
    protectedMainCampaign: campaign.protected === true,
    availableMapIds: campaign.mapIds,
    availableRegionIds: campaign.regionIds,
    availableLocationIds: campaign.locationIds,
    campaignNpcIds: adv?.npcIds ?? [],
    campaignQuestIds: adv?.questIds ?? [],
    campaignEnemyIds: adv?.enemyIds ?? [],
    campaignImageIds: adv?.imageIds ?? [],
    runtimeNamespace: campaign.runtimeKey,
  };
}

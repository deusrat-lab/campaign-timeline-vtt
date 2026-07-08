import type { CampaignContext, CampaignModule } from '../types/campaign';
import { getModuleById } from './adventureModules';

export const WORLD_ID = 'known-world';

/** localStorage key of the PROTECTED main campaign runtime (old flow). The new
 * isolated-runtime store never reads or writes this key. */
export const MAIN_CAMPAIGN_RUNTIME_KEY = 'campaign-timeline-vtt:overlay:v2';
export const MAIN_CAMPAIGN_ID = 'main-greyholm-campaign';

function runtimeKeyFor(id: string): string {
  return `dmCompanion.campaignRuntime.${id}.v1`;
}

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
  {
    id: 'salt-ledge-prisoners',
    title: 'Captives of the Salt Ledge',
    titleRu: 'Пленные Солёного Уступа',
    type: 'historicalOneShot',
    status: 'ready',
    worldId: WORLD_ID,
    canonPolicy: 'historicalCanon',
    mapIds: ['atlas-map-known-world', 'atlas-map-caldran', 'atlas-map-talassian-union'],
    regionIds: ['region-caldran', 'region-caldran-salt-ledge', 'region-talassian-union'],
    locationIds: [],
    description: 'Исторический ваншот: талассийские моряки в кальдранской системе плена после проигранной войны.',
    startRoute: '/campaigns/salt-ledge-prisoners',
    runtimeKey: runtimeKeyFor('salt-ledge-prisoners'),
    adventureModuleId: 'module-salt-ledge-captives',
  },
  {
    id: 'dragon-ridges-road',
    title: 'The Road Through Dragon Ridges',
    titleRu: 'Дорога через Драконьи Кряжи',
    type: 'oneShot',
    status: 'ready',
    worldId: WORLD_ID,
    canonPolicy: 'possibleCanon',
    mapIds: ['atlas-map-known-world', 'atlas-map-caldran'],
    regionIds: ['region-caldran', 'region-caldran-dragon-ridges'],
    locationIds: [],
    description: 'Survival-ваншот: переход через земли виверн и старых договоров Дома Крылатой Кости.',
    startRoute: '/campaigns/dragon-ridges-road',
    runtimeKey: runtimeKeyFor('dragon-ridges-road'),
    adventureModuleId: 'module-dragon-ridges-road',
  },
  {
    id: 'greyholm-night-one-shot',
    title: 'A Night in Greyholm',
    titleRu: 'Ночь в Грейхольме',
    type: 'oneShot',
    status: 'ready',
    worldId: WORLD_ID,
    canonPolicy: 'possibleCanon',
    mapIds: ['atlas-map-greyholm-city'],
    regionIds: ['region-greyholm-city'],
    locationIds: [],
    description: 'Городской ваншот на карте Грейхольма. Отдельная история — НЕ основная кампания, свой runtime.',
    startRoute: '/campaigns/greyholm-night-one-shot',
    runtimeKey: runtimeKeyFor('greyholm-night-one-shot'),
    adventureModuleId: 'module-greyholm-night',
  },
  {
    id: 'varnel-deal',
    title: 'The Varnel Deal',
    titleRu: 'Сделка в Варнеле',
    type: 'oneShot',
    status: 'ready',
    worldId: WORLD_ID,
    canonPolicy: 'possibleCanon',
    mapIds: ['atlas-map-known-world', 'atlas-map-aurelon', 'atlas-map-wildlands'],
    regionIds: ['region-free-cities', 'region-varnel'],
    locationIds: [],
    description: 'Политический ваншот: тайные переговоры четырёх держав в нейтральном Варнеле.',
    startRoute: '/campaigns/varnel-deal',
    runtimeKey: runtimeKeyFor('varnel-deal'),
    adventureModuleId: 'module-varnel-deal',
  },
  {
    id: 'thalorias-towers',
    title: 'The Towers of Thalorias',
    titleRu: 'Башни Талориаса',
    type: 'oneShot',
    status: 'ready',
    worldId: WORLD_ID,
    canonPolicy: 'possibleCanon',
    mapIds: ['atlas-map-known-world', 'atlas-map-wildlands'],
    regionIds: ['region-thalorias', 'region-wildlands-dead-towers'],
    locationIds: [],
    description: 'Ваншот-экспедиция к древней башне в Полях Мёртвых Башен.',
    startRoute: '/campaigns/thalorias-towers',
    runtimeKey: runtimeKeyFor('thalorias-towers'),
    adventureModuleId: 'module-thalorias-towers',
  },
  {
    id: 'skaar-shadows',
    title: 'Shadows of House Skaar',
    titleRu: 'Тени Дома Скаар',
    type: 'oneShot',
    status: 'ready',
    worldId: WORLD_ID,
    canonPolicy: 'possibleCanon',
    mapIds: ['atlas-map-caldran'],
    regionIds: ['region-caldran', 'region-caldran-stone-terraces'],
    locationIds: [],
    description: 'Политический ваншот внутри кальдранского Дома Скаар на Каменных Террасах.',
    startRoute: '/campaigns/skaar-shadows',
    runtimeKey: runtimeKeyFor('skaar-shadows'),
    adventureModuleId: 'module-skaar-shadows',
  },
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

/**
 * Multi-campaign layer.
 *
 * Architecture: ONE shared world (maps + regions in the atlas layer) and MANY
 * isolated campaigns / one-shots inside it. The existing Arc 1 / Arc 2
 * campaign is a PROTECTED legacy campaign — it is only *registered* here as a
 * wrapper entry (`protected: true`) and is always opened through the old
 * `/map` flow with its original runtime. Nothing in this module migrates,
 * reads or writes the main campaign's data or runtime.
 *
 * Every non-protected campaign gets its own isolated runtime, persisted under
 * its own localStorage key (`dmCompanion.campaignRuntime.${id}.v1`), so states
 * never mix even when two campaigns share the same world map.
 */

export type CampaignModuleType =
  | 'mainCampaign'
  | 'campaign'
  | 'miniCampaign'
  | 'oneShot'
  | 'historicalOneShot'
  | 'sandbox';

export type CampaignStatus = 'draft' | 'ready' | 'active' | 'completed' | 'archived';

export type CampaignCanonPolicy =
  | 'mainCanon'
  | 'historicalCanon'
  | 'possibleCanon'
  | 'alternateCanon'
  | 'nonCanonSandbox';

export interface CampaignModule {
  id: string;
  title: string;
  titleRu?: string;
  type: CampaignModuleType;
  status: CampaignStatus;
  worldId: string;
  canonPolicy: CampaignCanonPolicy;

  /** True only for the protected legacy main campaign. */
  protected?: boolean;

  mapIds: string[];
  regionIds: string[];
  locationIds: string[];
  arcIds?: string[];

  description: string;
  dmBrief?: string;
  playerBrief?: string;

  /** Where "Open" navigates. Protected campaign → old `/map` flow. */
  startRoute: string;
  /** localStorage namespace for this campaign's isolated runtime. */
  runtimeKey: string;

  /** Optional link to a rich AdventureModule (scenes / hooks / secrets). */
  adventureModuleId?: string;

  createdAt?: string;
  updatedAt?: string;
}

export type CampaignContextMode = 'mainCampaign' | 'campaign' | 'oneShot' | 'worldAtlasOnly';

export interface CampaignContext {
  campaignId: string;
  worldId: string;
  mode: CampaignContextMode;
  protectedMainCampaign: boolean;

  availableMapIds: string[];
  availableRegionIds: string[];
  availableLocationIds: string[];

  campaignNpcIds: string[];
  campaignQuestIds: string[];
  campaignEnemyIds: string[];
  campaignImageIds: string[];

  runtimeNamespace: string;
}

export interface CampaignCombatant {
  id: string;
  name: string;
  initiative?: number;
  ac?: number;
  currentHp?: number;
  maxHp?: number;
  statuses?: string[];
  notes?: string;
}

export type CampaignCanonOutcomePolicy =
  | 'separateFact'
  | 'worldRumor'
  | 'historicalFact'
  | 'alternateTimeline'
  | 'noCanon';

export interface CampaignCanonOutcome {
  selectedPolicy: CampaignCanonOutcomePolicy;
  summary: string;
}

export interface IsolatedCampaignRuntime {
  campaignId: string;
  status: 'notStarted' | 'active' | 'completed' | 'archived';

  activeMapId?: string;
  activeSceneId?: string;

  notes: string[];
  questStatuses: Record<string, string>;
  npcStates: Record<string, unknown>;
  enemyStates: Record<string, unknown>;

  battleTracker: {
    combatants: CampaignCombatant[];
    round?: number;
    activeCombatantId?: string;
  };

  revealedToPlayers: string[];
  completedSceneIds: string[];
  completedAt?: string;

  canonOutcome?: CampaignCanonOutcome;
}

export const CAMPAIGN_CANON_OUTCOME_LABELS: Record<CampaignCanonOutcomePolicy, string> = {
  noCanon: 'Не влияет на основную кампанию',
  separateFact: 'Отдельный факт этого ваншота',
  worldRumor: 'Слух / легенда мира',
  historicalFact: 'Исторический факт мира',
  alternateTimeline: 'Alternate timeline',
};

/** Default: a finished campaign never touches the main campaign (Arc 1/2). */
export const DEFAULT_CAMPAIGN_CANON_OUTCOME: CampaignCanonOutcomePolicy = 'noCanon';

export const CAMPAIGN_TYPE_LABELS: Record<CampaignModuleType, string> = {
  mainCampaign: 'Основная кампания',
  campaign: 'Кампания',
  miniCampaign: 'Мини-кампания',
  oneShot: 'Ваншот',
  historicalOneShot: 'Исторический ваншот',
  sandbox: 'Sandbox',
};

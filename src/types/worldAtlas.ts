/**
 * World Atlas + One-Shot layer types.
 *
 * This module is a NEW, additive layer. It deliberately does NOT import from
 * or extend the main-campaign types (dmCompanion.ts / types.ts). The main
 * campaign (Arc 1 / Arc 2) is a protected legacy layer — nothing here changes
 * its data, ids, runtime state, Session Mode or Player Safe Mode.
 *
 * Cross-links to existing campaign entities are expressed only as opaque id
 * strings (linkedNpcIds, locationIds, mapIds, …). Following such a link is a
 * read-only lookup; the atlas/one-shot layer never mutates campaign records.
 */

export type WorldRegionType =
  | 'world'
  | 'state'
  | 'region'
  | 'city'
  | 'wilderness'
  | 'sea'
  | 'unknown'
  | 'district';

export type CanonStatus = 'fixedCanon' | 'workingCanon' | 'unknown' | 'sandbox';

export interface WorldRegion {
  id: string;
  title: string;
  titleRu?: string;
  parentId?: string;
  mapId?: string;

  type: WorldRegionType;
  canonStatus: CanonStatus;

  shortDescription: string;
  dmDescription: string;
  playerDescription?: string;

  visualTone?: string;
  rulingPower?: string;
  culture?: string;
  dangers?: string[];
  factions?: string[];
  resources?: string[];
  themes?: string[];

  linkedMapIds?: string[];
  linkedLocationIds?: string[];
  linkedNpcIds?: string[];
  linkedQuestIds?: string[];
  linkedEnemyIds?: string[];
  linkedImageIds?: string[];
  linkedAdventureModuleIds?: string[];

  adventureHooks?: string[];
  dmSecrets?: string[];

  playerSafe?: boolean;
}

/** A canonical world map surfaced in the atlas. New records only — never
 * reuses or overrides main-campaign `mapId`s. */
export interface WorldAtlasMap {
  id: string;
  title: string;
  titleRu?: string;
  imageSrc: string;
  /** WorldRegion ids that this map depicts. */
  regionIds: string[];
  description?: string;
}

export type AdventureModuleType =
  | 'mainCampaign'
  | 'oneShot'
  | 'miniArc'
  | 'historical'
  | 'political'
  | 'survival'
  | 'city'
  | 'sea'
  | 'sandbox';

export type CanonPolicy =
  | 'canonical'
  | 'historical'
  | 'possible'
  | 'alternate'
  | 'nonCanonSandbox';

export type AdventureModuleStatus = 'draft' | 'ready' | 'active' | 'completed' | 'archived';

export type AdventureSceneType =
  | 'intro'
  | 'social'
  | 'exploration'
  | 'combat'
  | 'travel'
  | 'investigation'
  | 'choice'
  | 'finale';

export interface AdventureScene {
  id: string;
  title: string;
  order: number;
  type: AdventureSceneType;

  locationId?: string;
  regionId?: string;
  mapId?: string;

  dmText: string;
  playerText?: string;

  npcIds?: string[];
  enemyIds?: string[];
  questIds?: string[];
  imageIds?: string[];

  objectives?: string[];
  secrets?: string[];
  possibleOutcomes?: string[];
}

export interface AdventureModule {
  id: string;
  title: string;
  titleRu?: string;

  type: AdventureModuleType;
  canonPolicy: CanonPolicy;
  status: AdventureModuleStatus;

  era?: string;
  timelinePlacement?: string;

  mapIds: string[];
  regionIds: string[];
  locationIds: string[];
  npcIds: string[];
  questIds: string[];
  enemyIds: string[];
  imageIds: string[];

  levelRange?: string;
  playerCount?: string;
  estimatedDuration?: string;

  premise: string;
  dmBrief: string;
  playerBrief?: string;

  hooks: string[];
  scenes: AdventureScene[];
  secrets: string[];
  handouts?: string[];
  outcomes: string[];

  playerSafeImageIds?: string[];
  playerSafeText?: string[];

  notes?: string[];
}

export type OneShotRuntimeStatus = 'notStarted' | 'active' | 'completed' | 'archived';

export type OneShotCanonOutcomePolicy =
  | 'affectsCanon'
  | 'rumorOnly'
  | 'historicalFact'
  | 'doesNotAffectMainCampaign';

export interface OneShotEncounterState {
  enemyId: string;
  currentHp?: number;
  maxHp?: number;
  status?: string[];
  notes?: string;
}

export interface OneShotCombatant {
  id: string;
  name: string;
  initiative?: number;
  ac?: number;
  currentHp?: number;
  maxHp?: number;
  statuses?: string[];
  notes?: string;
}

export interface OneShotBattleTrackerState {
  combatants: OneShotCombatant[];
  round?: number;
  activeCombatantId?: string;
}

export interface OneShotCanonOutcome {
  selectedPolicy: OneShotCanonOutcomePolicy;
  summary: string;
  linkedMainCampaignArcIds?: string[];
}

export interface OneShotRuntimeState {
  moduleId: string;
  status: OneShotRuntimeStatus;

  startedAt?: string;
  completedAt?: string;

  activeSceneId?: string;
  completedSceneIds: string[];

  sessionNotes: string[];
  revealedToPlayers: string[];

  questStatuses: Record<string, string>;

  encounterStates: Record<string, OneShotEncounterState>;

  battleTrackerState?: OneShotBattleTrackerState;

  canonOutcome?: OneShotCanonOutcome;
}

export const CANON_OUTCOME_LABELS: Record<OneShotCanonOutcomePolicy, string> = {
  affectsCanon: 'Влияет на канон мира',
  historicalFact: 'Остаётся историческим фактом',
  rumorOnly: 'Остаётся слухом / легендой',
  doesNotAffectMainCampaign: 'Не влияет на основную кампанию',
};

/** Default policy for every newly-completed one-shot: the main campaign
 * (Arc 1 / Arc 2) is never touched unless the DM explicitly changes this. */
export const DEFAULT_CANON_OUTCOME_POLICY: OneShotCanonOutcomePolicy = 'doesNotAffectMainCampaign';

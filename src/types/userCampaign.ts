/**
 * User-created campaigns — fully isolated from the protected main campaign.
 *
 * Each user campaign has its own data + runtime under its own localStorage
 * keys (dmCompanion.userCampaignData/Runtime.${id}.v1). The main campaign
 * (Arc 1/2) keeps its legacy keys and flow and is never touched by this layer.
 *
 * Map coordinates (x, y) for placements and route points are PERCENTAGES
 * (0–100) of the base map image, so they stay correct under any zoom/pan.
 */

export type UserCampaignType = 'campaign' | 'oneShot' | 'miniArc' | 'sandbox';

export type CampaignEntityType = 'location' | 'npc' | 'quest' | 'enemy' | 'image' | 'party' | 'custom';

export interface CampaignLocation {
  id: string;
  title: string;
  description?: string;
  dmNotes?: string;
  playerSafeDescription?: string;
  imageId?: string;
  tags?: string[];
}

export interface CampaignNpc {
  id: string;
  name: string;
  role?: string;
  locationId?: string;
  description?: string;
  dmNotes?: string;
  playerSafeDescription?: string;
  imageId?: string;
  tags?: string[];
}

export type CampaignQuestStatus = 'notStarted' | 'active' | 'completed' | 'failed' | 'hidden';

export interface CampaignQuest {
  id: string;
  title: string;
  status: CampaignQuestStatus;
  locationId?: string;
  npcIds?: string[];
  description?: string;
  dmNotes?: string;
  playerSafeDescription?: string;
  tags?: string[];
}

export interface CampaignEnemy {
  id: string;
  title: string;
  baseMonster?: string;
  ac?: number;
  hp?: number;
  description?: string;
  tactics?: string;
  imageId?: string;
  tags?: string[];
}

export interface CampaignImage {
  id: string;
  title: string;
  src: string;
  playerSafe?: boolean;
}

export type CampaignRouteType = 'road' | 'trail' | 'sea' | 'hidden' | 'custom';

export interface CampaignRoutePoint {
  x: number;
  y: number;
}

export interface CampaignRoute {
  id: string;
  title: string;
  mapId: string;
  points: CampaignRoutePoint[];
  type: CampaignRouteType;
  visibleToPlayers: boolean;
  notes?: string;
}

export interface CampaignZone {
  id: string;
  title: string;
  mapId: string;
  points: CampaignRoutePoint[];
  color?: string;
  visibleToPlayers: boolean;
  notes?: string;
}

export interface CampaignNote {
  id: string;
  text: string;
  createdAt: string;
}

export interface CampaignMapPlacement {
  id: string;
  mapId: string;
  entityType: CampaignEntityType;
  entityId: string;
  x: number;
  y: number;
  visibleToPlayers: boolean;
}

export interface UserCampaignData {
  campaignId: string;
  title: string;
  type: UserCampaignType;
  baseMapId: string;
  mapIds: string[];
  regionIds: string[];

  locations: CampaignLocation[];
  npcs: CampaignNpc[];
  quests: CampaignQuest[];
  enemies: CampaignEnemy[];
  images: CampaignImage[];
  routes: CampaignRoute[];
  zones: CampaignZone[];
  notes: CampaignNote[];

  mapPlacements: CampaignMapPlacement[];
}

export type UserCampaignMode = 'dmView' | 'dmEdit' | 'playerView';

export interface UserCampaignRuntime {
  campaignId: string;
  activeMapId: string;
  mode: UserCampaignMode;
  selectedEntityId?: string;
  selectedEntityType?: CampaignEntityType;
  notes: string[];
  revealedToPlayers: string[];
  questStatuses: Record<string, string>;
  battleTracker: unknown;
  mapViewState: { zoom: number; panX: number; panY: number };
}

/** Lightweight registry entry (list view without loading full data). */
export interface UserCampaignRegistryEntry {
  campaignId: string;
  title: string;
  type: UserCampaignType;
  baseMapId: string;
  regionIds: string[];
  createdAt: string;
  updatedAt: string;
}

export const USER_CAMPAIGN_TYPE_LABELS: Record<UserCampaignType, string> = {
  campaign: 'Кампания',
  oneShot: 'Ваншот',
  miniArc: 'Мини-арка',
  sandbox: 'Sandbox',
};

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

export type CampaignEntityType = 'location' | 'npc' | 'quest' | 'enemy' | 'image' | 'party' | 'faction' | 'custom';

export interface CampaignPlayer {
  id: string;
  name: string;          // character name
  playerName?: string;   // the real player behind the character
  class?: string;
  level?: number;
  ac?: number;
  hp?: number;
  maxHp?: number;
  description?: string;
  dmNotes?: string;
}

export type FactionAttitude = 'ally' | 'neutral' | 'enemy' | 'unknown';

export interface CampaignFaction {
  id: string;
  name: string;
  role?: string;
  attitude?: FactionAttitude;
  description?: string;
  dmNotes?: string;
  imageId?: string;
}

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
  imageId?: string;
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
  /** Locations where this enemy appears — powers location↔enemy relations. */
  locationIds?: string[];
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
  customBattleMaps?: CampaignCustomBattleMap[];
  // Optional (added after initial schema) — always read with `?? []`.
  party?: CampaignPlayer[];
  factions?: CampaignFaction[];

  mapPlacements: CampaignMapPlacement[];
}

export type UserCampaignMode = 'dmView' | 'dmEdit' | 'playerView';

export type BattleTokenSide = 'enemy' | 'player' | 'ally' | 'neutral';

export interface CampaignBattleToken {
  id: string;
  name: string;
  side: BattleTokenSide;
  x: number; // % of battle-map image
  y: number;
  currentHp?: number;
  maxHp?: number;
  ac?: number;
  initiative?: number; // initiative order — higher acts first (undefined sorts last)
  statuses?: string[];
}

/** A DM-created battle field: any image (upload / generated / URL) turned into
 * a playable field with a grid + terrain. Lives in the campaign's data. */
export interface CampaignCustomBattleMap {
  id: string;
  title: string;
  dayImage: string;    // data URL or https URL (required)
  nightImage?: string; // optional night variant
  columns: number;     // grid columns
  rows?: number;       // grid rows (for square NxN presets; else derived from aspect)
}

export type TerrainType = 'blocked' | 'difficult';

/** Which battle map is loaded (catalog id OR `custom-<id>`), the day/night
 * variant, the grid + terrain, and the tokens. Persisted per-campaign,
 * isolated from the main campaign. */
export interface CampaignBattleBoard {
  mapId?: string;
  variant?: string; // 'day' | 'evening' | 'night' | 'default'
  tokens: CampaignBattleToken[];
  round?: number;
  view?: { zoom: number; panX: number; panY: number };
  showGrid?: boolean;
  columns?: number;
  snap?: boolean;
  /** cell key "row,col" → terrain type */
  terrain?: Record<string, TerrainType>;
}

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
  /** @deprecated Legacy single shared board. Superseded by `battleBoards`
   * (one board per battle-map id). Kept only for backward-compatible reads /
   * lazy migration — never written to anymore. */
  battleBoard?: CampaignBattleBoard;
  /** Per-battle-map boards, keyed by the route map id (`custom-<id>` or a
   * shared-catalog id). Each battle map gets its OWN tokens + terrain + grid +
   * view, so opening a different map never inherits another map's setup. */
  battleBoards?: Record<string, CampaignBattleBoard>;
  /** The battle the DM has "opened to players": when set, the player/observer
   * view surfaces it (banner on the map + read-only board). Synced to the
   * server so players see it live. Cleared when the DM hides the battle. */
  presentedBattle?: { mapId: string } | null;
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

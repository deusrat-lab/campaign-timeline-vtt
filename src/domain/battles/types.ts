import type { CampaignId, UniversalEntityId, UniversalMapId, UniversalRuntimeId } from '../campaign/ids';
import type { UniversalPoint } from '../maps/types';
import type { VisibilityState } from '../visibility/types';

export type BattleSide = 'enemy' | 'player' | 'ally' | 'neutral';
export type TerrainType = 'blocked' | 'difficult' | 'custom';

export interface BattleVariant {
  id: string;
  kind: 'day' | 'evening' | 'night' | 'rain' | 'destroyed' | 'default' | 'custom';
  assetRef: string;
  width?: number;
  height?: number;
  labels?: string[];
}

export interface GridDefinition {
  columns: number;
  rows?: number;
  snap: boolean;
  unit?: string;
}

export interface TerrainDefinition {
  cellKey: string;
  type: TerrainType;
  blocksMovement?: boolean;
  costMultiplier?: number;
}

export interface BattleMapDefinition {
  id: string;
  campaignId: CampaignId;
  title: string;
  variants: BattleVariant[];
  grid?: GridDefinition;
  sourceMapId?: UniversalMapId;
  visibility: VisibilityState;
  extensions?: Record<string, unknown>;
}

export interface BattleEntryDefinition {
  id: string;
  campaignId: CampaignId;
  title: string;
  status: 'prepared' | 'available' | 'active' | 'completed' | 'disabled' | 'hidden';
  battleMapRef?: string;
  locationRefs?: UniversalEntityId[];
  participantRefs?: UniversalEntityId[];
  position?: UniversalPoint;
  visibility: VisibilityState;
  extensions?: Record<string, unknown>;
}

export interface BattleToken {
  id: string;
  name: string;
  side: BattleSide;
  sourceEntityRef?: UniversalEntityId;
  position: UniversalPoint;
  currentHp?: number;
  maxHp?: number;
  ac?: number;
  initiative?: number;
  statuses?: string[];
  extensions?: Record<string, unknown>;
}

export interface InitiativeState {
  round: number;
  currentTurnTokenId?: string;
}

export interface BattleBoard {
  battleMapRef: string;
  variant?: string;
  tokens: BattleToken[];
  terrain?: TerrainDefinition[];
  grid?: GridDefinition;
  view?: { zoom: number; panX: number; panY: number };
  showGrid?: boolean;
  showTerrain?: boolean;
}

export interface BattleRuntime {
  id: UniversalRuntimeId;
  campaignId: CampaignId;
  battleEntryRef?: string;
  battleMapRef: string;
  active: boolean;
  board: BattleBoard;
  initiative?: InitiativeState;
  presentedToPlayers?: boolean;
  revision?: number;
  extensions?: Record<string, unknown>;
}

import type { CampaignId, UniversalEntityId } from '../campaign/ids';
import type { VisibilityState } from '../visibility/types';

export type UniversalEntityKind =
  | 'location'
  | 'npc'
  | 'player'
  | 'enemy'
  | 'quest'
  | 'faction'
  | 'image'
  | 'shop'
  | 'tavern'
  | 'service'
  | 'item'
  | 'note'
  | 'annotation'
  | 'custom';

export interface UniversalEntityBase {
  id: UniversalEntityId;
  campaignId: CampaignId;
  kind: UniversalEntityKind;
  title: string;
  sourceIds?: string[];
  visibility: VisibilityState;
  tags?: string[];
  extensions?: Record<string, unknown>;
}

export interface UniversalEntityRef {
  campaignId: CampaignId;
  entityId: UniversalEntityId;
  kind?: UniversalEntityKind;
}

export interface TextFields {
  publicDescription?: string;
  playerSafeDescription?: string;
  dmNotes?: string;
}

export interface UniversalLocationEntity extends UniversalEntityBase, TextFields {
  kind: 'location';
  parentLocationRef?: UniversalEntityRef;
  imageRefs?: UniversalEntityRef[];
  npcRefs?: UniversalEntityRef[];
  questRefs?: UniversalEntityRef[];
}

export interface UniversalNpcEntity extends UniversalEntityBase, TextFields {
  kind: 'npc';
  role?: string;
  locationRef?: UniversalEntityRef;
  imageRef?: UniversalEntityRef;
  factionRefs?: UniversalEntityRef[];
}

export interface UniversalPlayerEntity extends UniversalEntityBase, TextFields {
  kind: 'player';
  playerName?: string;
  sheet?: Record<string, unknown>;
  imageRef?: UniversalEntityRef;
}

export interface UniversalEnemyEntity extends UniversalEntityBase, TextFields {
  kind: 'enemy';
  ac?: number;
  hp?: number;
  cr?: string;
  locationRefs?: UniversalEntityRef[];
  imageRef?: UniversalEntityRef;
}

export interface UniversalQuestEntity extends UniversalEntityBase, TextFields {
  kind: 'quest';
  status?: string;
  locationRefs?: UniversalEntityRef[];
  npcRefs?: UniversalEntityRef[];
  enemyRefs?: UniversalEntityRef[];
  imageRef?: UniversalEntityRef;
}

export interface UniversalFactionEntity extends UniversalEntityBase, TextFields {
  kind: 'faction';
  attitude?: string;
  imageRef?: UniversalEntityRef;
}

export interface UniversalAssetEntity extends UniversalEntityBase {
  kind: 'image';
  src: string;
  safeForPlayers?: boolean;
  relatedRefs?: UniversalEntityRef[];
}

export interface UniversalServiceEntity extends UniversalEntityBase, TextFields {
  kind: 'shop' | 'tavern' | 'service' | 'item' | 'note' | 'annotation' | 'custom';
  relatedRefs?: UniversalEntityRef[];
}

export type UniversalEntity =
  | UniversalLocationEntity
  | UniversalNpcEntity
  | UniversalPlayerEntity
  | UniversalEnemyEntity
  | UniversalQuestEntity
  | UniversalFactionEntity
  | UniversalAssetEntity
  | UniversalServiceEntity;

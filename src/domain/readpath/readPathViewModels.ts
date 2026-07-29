import type { CampaignSnapshot } from '../campaign/snapshot';
import {
  projectDMWorkspace,
  projectObserver,
  projectPlayerSafe,
} from '../projection/projectCampaign';
import type {
  DMWorkspaceProjection,
  ObserverProjection,
  PlayerSafeProjection,
} from '../projection/types';
import type { ReadPathProjectionKind } from './readPathTypes';

/**
 * Stage 10 — normalized, read-only VIEW MODELS derived from the audience
 * projections. Pilot UI components render these; the Stage 10 parity harness
 * builds the exact same view models from the same snapshot to prove semantic
 * parity deterministically (Step 12). Every field here is safe for its audience
 * — a Player-Safe view model is built from the Player-Safe projection only, so a
 * DM secret can never reach a player component (Step 9 privacy enforcement).
 *
 * These builders are PURE and framework-agnostic. They never read storage,
 * never touch the network, and never mutate their input.
 */

export interface CampaignSummaryViewModel {
  campaignId: string;
  title: string;
  entityCount: number;
  npcCount: number;
  enemyCount: number;
  mapCount: number;
  hotspotCount: number;
  routeCount: number;
  battleMapCount: number;
}

export interface EntityListItemViewModel {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  imageSrc: string | null;
  visible: boolean;
}

export interface EntityListViewModel {
  campaignId: string;
  title: string;
  items: EntityListItemViewModel[];
}

export interface ObserverStatusViewModel {
  campaignId: string;
  title: string;
  visibleEntityCount: number;
  focusSet: boolean;
}

export interface RuntimePresentationViewModel {
  campaignId: string;
  title: string;
  presentedCardId: string | null;
  presentedCardTitle: string | null;
  activeBattleCount: number;
}

function normalizeItem(entity: {
  id: string;
  kind: string;
  title: string;
  description?: string;
  imageSrc?: string;
  visible: boolean;
}): EntityListItemViewModel {
  return {
    id: entity.id,
    kind: entity.kind,
    title: entity.title,
    description: entity.description ?? null,
    imageSrc: entity.imageSrc ?? null,
    visible: entity.visible,
  };
}

export function dmSummaryViewModel(dm: DMWorkspaceProjection): CampaignSummaryViewModel {
  return {
    campaignId: dm.campaignId,
    title: dm.title,
    entityCount: dm.entities.length,
    npcCount: dm.entities.filter((entity) => entity.kind === 'npc').length,
    enemyCount: dm.entities.filter((entity) => entity.kind === 'enemy').length,
    mapCount: dm.map.maps.length,
    hotspotCount: dm.map.hotspots.length,
    routeCount: dm.map.routes.length,
    battleMapCount: dm.battles.battleMaps,
  };
}

/** DM NPC list, ordered exactly as the projection orders entities. */
export function dmNpcListViewModel(dm: DMWorkspaceProjection): EntityListViewModel {
  return {
    campaignId: dm.campaignId,
    title: dm.title,
    items: dm.entities.filter((entity) => entity.kind === 'npc').map(normalizeItem),
  };
}

export function playerSafeEntityListViewModel(player: PlayerSafeProjection): EntityListViewModel {
  return {
    campaignId: player.campaignId,
    title: player.title,
    items: player.entities.map(normalizeItem),
  };
}

export function observerStatusViewModel(observer: ObserverProjection): ObserverStatusViewModel {
  return {
    campaignId: observer.campaignId,
    title: observer.title,
    visibleEntityCount: observer.entities.length,
    focusSet: observer.observerFocus != null,
  };
}

export function runtimePresentationViewModel(player: PlayerSafeProjection): RuntimePresentationViewModel {
  return {
    campaignId: player.campaignId,
    title: player.title,
    presentedCardId: player.presentedCard?.id ?? null,
    presentedCardTitle: player.presentedCard?.title ?? null,
    activeBattleCount: player.activeBattles.length,
  };
}

/**
 * Build the correct view model for a pilot scope from a snapshot, enforcing the
 * scope's projection audience. Never call this with a projection kind the scope
 * is not entitled to — the switch below always routes through the audience
 * projection, so a Player-Safe/Observer scope can never receive DM fields.
 */
export function buildScopeViewModel(
  projection: ReadPathProjectionKind,
  variant: 'summary' | 'npcList' | 'entities' | 'observer' | 'runtime',
  snapshot: CampaignSnapshot,
): CampaignSummaryViewModel | EntityListViewModel | ObserverStatusViewModel | RuntimePresentationViewModel {
  switch (variant) {
    case 'summary':
      if (projection !== 'dm') throw new Error('summary view model requires the DM projection');
      return dmSummaryViewModel(projectDMWorkspace(snapshot));
    case 'npcList':
      if (projection !== 'dm') throw new Error('npcList view model requires the DM projection');
      return dmNpcListViewModel(projectDMWorkspace(snapshot));
    case 'entities':
      if (projection !== 'playerSafe') throw new Error('entities view model requires the Player-Safe projection');
      return playerSafeEntityListViewModel(projectPlayerSafe(snapshot));
    case 'observer':
      if (projection !== 'observer') throw new Error('observer view model requires the Observer projection');
      return observerStatusViewModel(projectObserver(snapshot));
    case 'runtime':
      if (projection !== 'playerSafe') throw new Error('runtime view model requires the Player-Safe projection');
      return runtimePresentationViewModel(projectPlayerSafe(snapshot));
    default: {
      const exhaustive: never = variant;
      throw new Error(`unknown view-model variant: ${String(exhaustive)}`);
    }
  }
}

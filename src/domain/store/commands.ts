import type { UniversalRuntimeId, CampaignId, UniversalEntityId } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import type { BattleRuntime } from '../battles/types';
import type { UniversalEntity } from '../entities/types';
import type { UniversalPoint, UniversalRoute } from '../maps/types';
import type { UniversalCampaignRepository } from '../repository/types';
import { PUBLIC_VISIBILITY } from '../visibility/types';

export interface CampaignCommandContext {
  campaignId: CampaignId;
  snapshot: CampaignSnapshot;
}

export function createEntity(context: CampaignCommandContext, entity: UniversalEntity): CampaignSnapshot {
  assertCampaignScope(context, entity.campaignId);
  return updateSnapshot(context, {
    durable: { ...context.snapshot.durable, entities: [...context.snapshot.durable.entities, structuredClone(entity)] },
  });
}

export function updateEntity(context: CampaignCommandContext, entityId: UniversalEntityId, patch: Partial<UniversalEntity>): CampaignSnapshot {
  assertCampaignScope(context, context.campaignId);
  return updateSnapshot(context, {
    durable: {
      ...context.snapshot.durable,
      entities: context.snapshot.durable.entities.map((entity) =>
        entity.id === entityId ? ({ ...entity, ...structuredClone(patch), id: entity.id, campaignId: entity.campaignId } as UniversalEntity) : entity,
      ),
    },
  });
}

export function deleteEntity(context: CampaignCommandContext, entityId: UniversalEntityId): CampaignSnapshot {
  assertCampaignScope(context, context.campaignId);
  return updateSnapshot(context, {
    durable: {
      ...context.snapshot.durable,
      entities: context.snapshot.durable.entities.filter((entity) => entity.id !== entityId),
    },
  });
}

export function moveMarker(context: CampaignCommandContext, placementId: string, position: UniversalPoint): CampaignSnapshot {
  assertCampaignScope(context, context.campaignId);
  return updateSnapshot(context, {
    durable: {
      ...context.snapshot.durable,
      placements: context.snapshot.durable.placements.map((placement) =>
        placement.id === placementId ? { ...placement, position } : placement,
      ),
    },
  });
}

export function updateRoute(context: CampaignCommandContext, routeId: string, patch: Partial<UniversalRoute>): CampaignSnapshot {
  assertCampaignScope(context, context.campaignId);
  return updateSnapshot(context, {
    durable: {
      ...context.snapshot.durable,
      routes: context.snapshot.durable.routes.map((route) =>
        route.id === routeId ? { ...route, ...structuredClone(patch), id: route.id, campaignId: route.campaignId } : route,
      ),
    },
  });
}

export function changeTime(context: CampaignCommandContext, calendarPatch: Record<string, unknown>): CampaignSnapshot {
  assertCampaignScope(context, context.campaignId);
  return updateSnapshot(context, {
    durable: {
      ...context.snapshot.durable,
      calendar: { ...context.snapshot.durable.calendar, ...structuredClone(calendarPatch) },
    },
  });
}

export function revealEntity(context: CampaignCommandContext, entityId: UniversalEntityId): CampaignSnapshot {
  assertCampaignScope(context, context.campaignId);
  return updateSnapshot(context, {
    durable: {
      ...context.snapshot.durable,
      entities: context.snapshot.durable.entities.map((entity) =>
        entity.id === entityId ? ({ ...entity, visibility: PUBLIC_VISIBILITY } as UniversalEntity) : entity,
      ),
    },
    visibility: {
      ...context.snapshot.visibility,
      entities: { ...context.snapshot.visibility.entities, [entityId]: PUBLIC_VISIBILITY },
    },
  });
}

export function presentCard(context: CampaignCommandContext, entityId: UniversalEntityId, kind: string): CampaignSnapshot {
  assertCampaignScope(context, context.campaignId);
  return updateSnapshot(context, {
    runtime: {
      ...context.snapshot.runtime,
      presentation: { ...context.snapshot.runtime.presentation, presentedCard: { entityRef: entityId, kind } },
    },
  });
}

export function startBattle(context: CampaignCommandContext, battle: BattleRuntime): CampaignSnapshot {
  assertCampaignScope(context, battle.campaignId);
  return updateSnapshot(context, {
    runtime: {
      ...context.snapshot.runtime,
      battles: { ...context.snapshot.runtime.battles, [battle.id]: structuredClone(battle) },
    },
  });
}

export function updateInitiative(
  context: CampaignCommandContext,
  battleId: UniversalRuntimeId,
  initiative: BattleRuntime['initiative'],
): CampaignSnapshot {
  assertCampaignScope(context, context.campaignId);
  const battle = context.snapshot.runtime.battles[battleId];
  if (!battle) return structuredClone(context.snapshot);
  return updateSnapshot(context, {
    runtime: {
      ...context.snapshot.runtime,
      battles: {
        ...context.snapshot.runtime.battles,
        [battleId]: { ...battle, initiative },
      },
    },
  });
}

export function advanceTurn(context: CampaignCommandContext, battleId: UniversalRuntimeId): CampaignSnapshot {
  const battle = context.snapshot.runtime.battles[battleId];
  const tokens = battle?.board.tokens ?? [];
  const currentId = battle?.initiative?.currentTurnTokenId;
  const index = Math.max(0, tokens.findIndex((token) => token.id === currentId));
  const next = tokens.length ? tokens[(index + 1) % tokens.length] : undefined;
  const round = battle?.initiative?.round ?? 1;
  return updateInitiative(context, battleId, {
    round: tokens.length && index === tokens.length - 1 ? round + 1 : round,
    currentTurnTokenId: next?.id,
  });
}

export async function saveCampaign(
  repository: UniversalCampaignRepository,
  context: CampaignCommandContext,
): Promise<CampaignSnapshot> {
  assertCampaignScope(context, context.campaignId);
  await repository.replaceCampaign(context.snapshot, context.snapshot.revision);
  const saved = await repository.readCampaign(context.campaignId);
  if (!saved) throw new Error(`Campaign disappeared after save: ${context.campaignId}`);
  return saved;
}

export async function importCampaign(
  repository: UniversalCampaignRepository,
  campaignId: CampaignId,
  serializedSnapshot: string,
): Promise<void> {
  const result = await repository.importCampaign(serializedSnapshot);
  if (result.campaignId !== campaignId) throw new Error(`Imported campaign scope mismatch: ${campaignId}`);
}

export async function exportCampaign(repository: UniversalCampaignRepository, campaignId: CampaignId): Promise<string> {
  return repository.exportCampaign(campaignId);
}

function assertCampaignScope(context: CampaignCommandContext, campaignId: CampaignId): void {
  if (context.snapshot.metadata.campaignId !== context.campaignId || campaignId !== context.campaignId) {
    throw new Error(`Campaign command scope mismatch: ${context.campaignId}`);
  }
}

function updateSnapshot(context: CampaignCommandContext, patch: Partial<CampaignSnapshot>): CampaignSnapshot {
  return structuredClone({ ...context.snapshot, ...patch });
}

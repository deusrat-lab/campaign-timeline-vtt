import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import type { CampaignSnapshot, CampaignDurableData } from '../campaign/snapshot';
import type { SourceMetadata } from '../campaign/source';
import type { UniversalEntity } from '../entities/types';
import type { UniversalPlacement, UniversalRoute } from '../maps/types';
import type { CampaignRuntime } from '../runtime/types';
import { defaultCapabilities } from '../campaign/capabilities';
import { makeRevision, makeSchemaVersion } from '../campaign/ids';
import { createCampaignSnapshot } from '../campaign/snapshot';
import { HIDDEN_VISIBILITY, PUBLIC_VISIBILITY } from '../visibility/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import { adapterError, adapterWarning, classification } from './types';
import type { AdapterResult } from './types';
import { campaignIdFromLegacy, entityIdFromLegacy, mapIdFromLegacy, runtimeIdFromLegacy } from './idMapping';

export interface UserCampaignAdapterInput {
  data: UserCampaignData;
  runtime?: UserCampaignRuntime;
  source?: Partial<SourceMetadata>;
}

export function adaptUserCampaignToUniversal(input: UserCampaignAdapterInput): AdapterResult {
  const source: SourceMetadata = { kind: 'legacy-user-campaign', sourceId: input.data.campaignId, ...input.source };
  const campaignId = campaignIdFromLegacy('user', input.data.campaignId);
  const now = new Date().toISOString();
  const classifications = [
    classification('data.campaignId', 'mapped'),
    classification('data.locations', 'mapped'),
    classification('data.npcs', 'mapped'),
    classification('data.quests', 'mapped'),
    classification('data.enemies', 'mapped'),
    classification('data.images', 'mapped'),
    classification('data.party', 'mapped'),
    classification('data.factions', 'mapped'),
    classification('data.mapPlacements', 'mapped'),
    classification('data.routes', 'mapped'),
    classification('data.customBattleMaps', 'mapped'),
    classification('runtime.battleBoards', 'mapped'),
    classification('runtime.battleBoard', 'normalized', 'Legacy single board is normalized into runtime battles when present.'),
  ];

  const entities = mapEntities(input.data, campaignId);
  const durable: CampaignDurableData = {
    maps: input.data.mapIds.map((id) => ({
      id: mapIdFromLegacy(id),
      campaignId,
      title: id === input.data.baseMapId ? input.data.title : id,
      coordinateSpace: { kind: 'percent' },
      layers: [],
      visibility: PUBLIC_VISIBILITY,
      source: id,
    })),
    hotspots: [],
    placements: mapPlacements(input.data, campaignId),
    routes: mapRoutes(input.data, campaignId),
    entities,
    battleMaps: (input.data.customBattleMaps ?? []).map((map) => ({
      id: `custom-${map.id}`,
      campaignId,
      title: map.title,
      variants: [
        { id: 'day', kind: 'day' as const, assetRef: map.dayImage },
        ...(map.nightImage ? [{ id: 'night', kind: 'night' as const, assetRef: map.nightImage }] : []),
      ],
      grid: { columns: map.columns, rows: map.rows, snap: true },
      visibility: HIDDEN_VISIBILITY,
      sourceMapId: mapIdFromLegacy(input.data.baseMapId),
    })),
    battleEntries: [],
    timeline: {},
    calendar: {},
    travel: {},
    economy: {},
    extensions: {
      notes: input.data.notes,
      zones: input.data.zones,
    },
  };

  const runtime = mapRuntime(input, campaignId);
  const snapshot: CampaignSnapshot = createCampaignSnapshot({
    schemaVersion: makeSchemaVersion('1.0.0'),
    revision: makeRevision(0),
    metadata: {
      campaignId,
      title: input.data.title,
      kind: input.data.type === 'oneShot' ? 'oneShot' : 'campaign',
      createdAt: now,
      updatedAt: now,
      sources: [source],
    },
    capabilities: defaultCapabilities(true),
    durable,
    runtime,
    visibility: {
      entities: Object.fromEntries((input.runtime?.revealedToPlayers ?? []).map((id) => [entityIdFromLegacy('legacy', id), PUBLIC_VISIBILITY])),
      fields: {},
      maps: {},
      presentations: {},
    },
    extensions: {},
    migrationMetadata: [{
      source,
      migratedAt: now,
      adapterVersion: 'user-campaign-adapter.v1',
      dryRun: true,
      aliases: {},
      fieldClassifications: classifications,
    }],
  });

  const validation = validateCampaignSnapshot(snapshot);
  const diagnostics = validation.issues.map((issue) =>
    issue.severity === 'error'
      ? adapterError(issue.path, issue.code, issue.message)
      : adapterWarning(issue.path, issue.code, issue.message),
  );

  return { snapshot, source, classifications, diagnostics };
}

function mapEntities(data: UserCampaignData, campaignId: CampaignSnapshot['metadata']['campaignId']): UniversalEntity[] {
  return [
    ...data.locations.map((location): UniversalEntity => ({
      id: entityIdFromLegacy('location', location.id),
      campaignId,
      kind: 'location',
      title: location.title,
      publicDescription: location.description,
      playerSafeDescription: location.playerSafeDescription,
      dmNotes: location.dmNotes,
      imageRefs: location.imageId ? [{ campaignId, entityId: entityIdFromLegacy('image', location.imageId), kind: 'image' }] : undefined,
      visibility: HIDDEN_VISIBILITY,
      tags: location.tags,
      sourceIds: [location.id],
    })),
    ...data.npcs.map((npc): UniversalEntity => ({
      id: entityIdFromLegacy('npc', npc.id),
      campaignId,
      kind: 'npc',
      title: npc.name,
      role: npc.role,
      publicDescription: npc.description,
      playerSafeDescription: npc.playerSafeDescription,
      dmNotes: npc.dmNotes,
      locationRef: npc.locationId ? { campaignId, entityId: entityIdFromLegacy('location', npc.locationId), kind: 'location' } : undefined,
      imageRef: npc.imageId ? { campaignId, entityId: entityIdFromLegacy('image', npc.imageId), kind: 'image' } : undefined,
      visibility: HIDDEN_VISIBILITY,
      tags: npc.tags,
      sourceIds: [npc.id],
    })),
    ...data.quests.map((quest): UniversalEntity => ({
      id: entityIdFromLegacy('quest', quest.id),
      campaignId,
      kind: 'quest',
      title: quest.title,
      status: quest.status,
      publicDescription: quest.description,
      playerSafeDescription: quest.playerSafeDescription,
      dmNotes: quest.dmNotes,
      locationRefs: quest.locationId ? [{ campaignId, entityId: entityIdFromLegacy('location', quest.locationId), kind: 'location' }] : undefined,
      npcRefs: quest.npcIds?.map((id) => ({ campaignId, entityId: entityIdFromLegacy('npc', id), kind: 'npc' })),
      imageRef: quest.imageId ? { campaignId, entityId: entityIdFromLegacy('image', quest.imageId), kind: 'image' } : undefined,
      visibility: HIDDEN_VISIBILITY,
      tags: quest.tags,
      sourceIds: [quest.id],
    })),
    ...data.enemies.map((enemy): UniversalEntity => ({
      id: entityIdFromLegacy('enemy', enemy.id),
      campaignId,
      kind: 'enemy',
      title: enemy.title,
      ac: enemy.ac,
      hp: enemy.hp,
      publicDescription: enemy.description,
      dmNotes: enemy.tactics,
      locationRefs: enemy.locationIds?.map((id) => ({ campaignId, entityId: entityIdFromLegacy('location', id), kind: 'location' })),
      imageRef: enemy.imageId ? { campaignId, entityId: entityIdFromLegacy('image', enemy.imageId), kind: 'image' } : undefined,
      visibility: HIDDEN_VISIBILITY,
      tags: enemy.tags,
      sourceIds: [enemy.id],
    })),
    ...(data.party ?? []).map((player): UniversalEntity => ({
      id: entityIdFromLegacy('player', player.id),
      campaignId,
      kind: 'player',
      title: player.name,
      playerName: player.playerName,
      publicDescription: player.description,
      dmNotes: player.dmNotes,
      sheet: { ...player },
      imageRef: player.imageId ? { campaignId, entityId: entityIdFromLegacy('image', player.imageId), kind: 'image' } : undefined,
      visibility: PUBLIC_VISIBILITY,
      sourceIds: [player.id],
    })),
    ...(data.factions ?? []).map((faction): UniversalEntity => ({
      id: entityIdFromLegacy('faction', faction.id),
      campaignId,
      kind: 'faction',
      title: faction.name,
      attitude: faction.attitude,
      publicDescription: faction.description,
      dmNotes: faction.dmNotes,
      imageRef: faction.imageId ? { campaignId, entityId: entityIdFromLegacy('image', faction.imageId), kind: 'image' } : undefined,
      visibility: HIDDEN_VISIBILITY,
      sourceIds: [faction.id],
    })),
    ...data.images.map((image): UniversalEntity => ({
      id: entityIdFromLegacy('image', image.id),
      campaignId,
      kind: 'image',
      title: image.title,
      src: image.src,
      safeForPlayers: image.playerSafe,
      visibility: image.playerSafe ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
      sourceIds: [image.id],
    })),
  ];
}

function mapPlacements(data: UserCampaignData, campaignId: CampaignSnapshot['metadata']['campaignId']): UniversalPlacement[] {
  return data.mapPlacements.map((placement) => ({
    id: placement.id,
    campaignId,
    mapId: mapIdFromLegacy(placement.mapId),
    entityRef: entityIdFromLegacy(placement.entityType, placement.entityId),
    entityKind: placement.entityType,
    position: { x: placement.x, y: placement.y },
    visibility: placement.visibleToPlayers ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
  }));
}

function mapRoutes(data: UserCampaignData, campaignId: CampaignSnapshot['metadata']['campaignId']): UniversalRoute[] {
  return data.routes.map((route) => ({
    id: route.id,
    campaignId,
    mapId: mapIdFromLegacy(route.mapId),
    points: route.points,
    routeType: route.type,
    visibility: route.visibleToPlayers ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
    extensions: { notes: route.notes },
  }));
}

function mapRuntime(input: UserCampaignAdapterInput, campaignId: CampaignSnapshot['metadata']['campaignId']): CampaignRuntime {
  const runtime: CampaignRuntime = {
    campaignId,
    activeMapId: mapIdFromLegacy(input.runtime?.activeMapId ?? input.data.baseMapId),
    party: {},
    presentation: {
      presentedCard: input.runtime?.presentedCard
        ? {
            entityRef: entityIdFromLegacy(input.runtime.presentedCard.entityType, input.runtime.presentedCard.entityId),
            kind: input.runtime.presentedCard.entityType,
          }
        : null,
    },
    battles: {},
    questStatuses: input.runtime?.questStatuses ?? {},
    locationStatuses: {},
    extensions: {
      notes: input.runtime?.notes ?? [],
      revealedToPlayers: input.runtime?.revealedToPlayers ?? [],
      selectedEntityId: input.runtime?.selectedEntityId,
      selectedEntityType: input.runtime?.selectedEntityType,
    },
  };

  for (const [mapId, board] of Object.entries(input.runtime?.battleBoards ?? {})) {
    const runtimeId = runtimeIdFromLegacy('battle', mapId);
    runtime.battles[runtimeId] = {
      id: runtimeId,
      campaignId,
      battleMapRef: mapId,
      active: input.runtime?.presentedBattle?.mapId === mapId,
      board: {
        battleMapRef: mapId,
        variant: board.variant,
        tokens: board.tokens.map((token) => ({
          id: token.id,
          name: token.name,
          side: token.side,
          sourceEntityRef: token.sourceEnemyId
            ? entityIdFromLegacy('enemy', token.sourceEnemyId)
            : token.sourcePlayerId
              ? entityIdFromLegacy('player', token.sourcePlayerId)
              : undefined,
          position: { x: token.x, y: token.y },
          currentHp: token.currentHp,
          maxHp: token.maxHp,
          ac: token.ac,
          initiative: token.initiative,
          statuses: token.statuses,
        })),
        terrain: Object.entries(board.terrain ?? {}).map(([cellKey, type]) => ({ cellKey, type })),
        grid: board.columns ? { columns: board.columns, snap: board.snap ?? true } : undefined,
        view: board.view,
        showGrid: board.showGrid,
        showTerrain: board.showTerrain,
      },
      initiative: { round: board.round ?? 1, currentTurnTokenId: board.currentTurnTokenId },
      presentedToPlayers: input.runtime?.presentedBattle?.mapId === mapId,
    };
  }

  return runtime;
}

import type {
  ActiveBattleState,
  BattleEntry,
  CampaignCalendar,
  CampaignEvent,
  DelayedTrigger,
  DynamicMapOverlay,
  FactionZone,
  LocationState,
  MapHotspot,
  MapObjectPlacement,
  MapRoute,
  MovableEntity,
  PartyRouteProgress,
  PartyState,
  Timeline,
  TravelEvent,
  WorldMap,
  WorldMapState,
} from '../../types';
import type {
  DmCustomEnemy,
  DmEconomyEntry,
  DmEconomyReferenceItem,
  DmFaction,
  DmImageItem,
  DmLocation,
  DmNpc,
  DmPlayer,
  DmQuest,
  DmShop,
  DmTavern,
} from '../../types/dmCompanion';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import { defaultCapabilities } from '../campaign/capabilities';
import { makeRevision, makeSchemaVersion } from '../campaign/ids';
import { createCampaignSnapshot } from '../campaign/snapshot';
import type { CampaignDurableData, CampaignSnapshot } from '../campaign/snapshot';
import type { SourceMetadata } from '../campaign/source';
import type { BattleEntryDefinition, BattleMapDefinition, BattleRuntime } from '../battles/types';
import type { UniversalEntity } from '../entities/types';
import type { UniversalHotspot, UniversalMapDefinition, UniversalPlacement, UniversalRoute } from '../maps/types';
import type { CampaignRuntime } from '../runtime/types';
import { HIDDEN_VISIBILITY, PUBLIC_VISIBILITY } from '../visibility/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import { adapterError, adapterWarning, classification } from './types';
import type { AdapterResult } from './types';
import { campaignIdFromLegacy, entityIdFromLegacy, mapIdFromLegacy, runtimeIdFromLegacy } from './idMapping';

export interface MainCampaignDataInput {
  timelines: Timeline[];
  locationStates: LocationState[];
  worldMaps: WorldMap[];
  worldMapStates: WorldMapState[];
  hotspots: MapHotspot[];
  routes: MapRoute[];
  travelEvents: TravelEvent[];
  placements: MapObjectPlacement[];
  battleMaps: BattleMapManifestEntry[];
  npcs: DmNpc[];
  quests: DmQuest[];
  enemies: DmCustomEnemy[];
  images: DmImageItem[];
  factions: DmFaction[];
  locations: DmLocation[];
  taverns: DmTavern[];
  economy: DmEconomyEntry[];
  economyReference: DmEconomyReferenceItem[];
  shops: DmShop[];
  players: DmPlayer[];
}

export interface MainCampaignOverlayInput {
  party?: PartyState;
  calendarsByTimelineId?: Record<string, CampaignCalendar>;
  eventsById?: Record<string, CampaignEvent>;
  triggersById?: Record<string, DelayedTrigger>;
  factionZonesById?: Record<string, FactionZone>;
  dynamicMapOverlaysById?: Record<string, DynamicMapOverlay>;
  movableEntitiesById?: Record<string, MovableEntity>;
  battleEntriesById?: Record<string, BattleEntry>;
  partyRouteProgress?: PartyRouteProgress | null;
  activeBattle?: ActiveBattleState | null;
  presentedCard?: { type: string; id: string } | null;
  currentTimelineId?: string;
  progress?: {
    questStatusOverrides?: Record<string, string>;
    locationStatusOverrides?: Record<string, string>;
    notesByLocationStateId?: Record<string, string>;
  };
  battleMapVttUrlOverrides?: Record<string, string>;
  [key: string]: unknown;
}

export interface MainCampaignAdapterInput {
  data: MainCampaignDataInput;
  overlay?: MainCampaignOverlayInput;
  source?: Partial<SourceMetadata>;
}

export function adaptMainCampaignToUniversal(input: MainCampaignAdapterInput): AdapterResult {
  const source: SourceMetadata = { kind: 'legacy-main', sourceId: 'greyholm', ...input.source };
  const campaignId = campaignIdFromLegacy('greyholm', 'main');
  const now = '1970-01-01T00:00:00.000Z';
  const classifications = [
    classification('data.worldMaps', 'mapped'),
    classification('data.worldMapStates', 'preservedAsExtension'),
    classification('data.hotspots', 'mapped'),
    classification('data.routes', 'mapped'),
    classification('data.travelEvents', 'preservedAsExtension'),
    classification('data.locationStates', 'mapped'),
    classification('data.locations', 'preservedAsExtension', 'DmLocation source records are retained because universal location cards are projected from timeline-scoped LocationState records.'),
    classification('data.npcs', 'mapped'),
    classification('data.players', 'mapped'),
    classification('data.quests', 'mapped'),
    classification('data.enemies', 'mapped'),
    classification('data.factions', 'mapped'),
    classification('data.images', 'mapped'),
    classification('data.shops', 'mapped'),
    classification('data.taverns', 'mapped'),
    classification('data.economy', 'preservedAsExtension'),
    classification('data.economyReference', 'preservedAsExtension'),
    classification('data.battleMaps', 'mapped'),
    classification('overlay.eventsById', 'preservedAsExtension'),
    classification('overlay.triggersById', 'preservedAsExtension'),
    classification('overlay.factionZonesById', 'preservedAsExtension'),
    classification('overlay.dynamicMapOverlaysById', 'preservedAsExtension'),
    classification('overlay.movableEntitiesById', 'mapped'),
    classification('overlay.battleEntriesById', 'mapped'),
    classification('overlay.activeBattle', 'mapped'),
    classification('overlay.presentedCard', 'mapped'),
  ];

  const durable: CampaignDurableData = {
    maps: input.data.worldMaps.map((map): UniversalMapDefinition => ({
      id: mapIdFromLegacy(map.id),
      campaignId,
      title: map.title,
      scope: map.level ?? map.scope,
      parentMapId: map.parentMapId ? mapIdFromLegacy(map.parentMapId) : undefined,
      timelineId: map.timelineId,
      backgroundImageSrc: map.backgroundImageSrc,
      coordinateSpace: { kind: 'normalized', width: map.originalImageWidth, height: map.originalImageHeight },
      layers: [],
      visibility: map.isPlayerVisible ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
      source: map.id,
      extensions: { original: map },
    })),
    hotspots: input.data.hotspots.map((hotspot): UniversalHotspot => ({
      id: hotspot.id,
      campaignId,
      mapId: mapIdFromLegacy(hotspot.mapId),
      position: { x: hotspot.x, y: hotspot.y },
      label: hotspot.label,
      entityRef: entityIdFromLegacy('locationState', hotspot.locationStateId),
      timelineId: hotspot.timelineId,
      visibility: hotspot.visibleInPlayerView ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
      extensions: { original: hotspot },
    })),
    placements: input.data.placements.map((placement): UniversalPlacement => ({
      id: placement.id,
      campaignId,
      mapId: mapIdFromLegacy(placement.mapId ?? `${placement.mapLevel}:${placement.arcId}`),
      entityRef: placement.entityId ? entityIdFromLegacy(placement.entityKind, placement.entityId) : entityIdFromLegacy('placement', placement.id),
      entityKind: placement.entityKind,
      position: placement.position,
      title: placement.title,
      visibility: placement.visibleInPlayerView ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
      extensions: { original: placement },
    })),
    routes: input.data.routes.map((route): UniversalRoute => ({
      id: route.id,
      campaignId,
      mapId: mapIdFromLegacy(route.mapStateId.split('__')[0] ?? route.mapStateId),
      points: route.points ?? [],
      fromHotspotId: route.fromHotspotId,
      toHotspotId: route.toHotspotId,
      routeType: route.routeType,
      travelTime: route.travelTime,
      visibility: route.visibleInPlayerView ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
      extensions: { original: route },
    })),
    entities: mapMainEntities(input.data, campaignId),
    battleMaps: mapBattleMaps(input.data.battleMaps, campaignId),
    battleEntries: mapBattleEntries(Object.values(input.overlay?.battleEntriesById ?? {}), campaignId),
    timeline: {
      timelines: input.data.timelines,
      calendarsByTimelineId: input.overlay?.calendarsByTimelineId ?? {},
      eventsById: input.overlay?.eventsById ?? {},
      triggersById: input.overlay?.triggersById ?? {},
    },
    calendar: input.overlay?.calendarsByTimelineId ?? {},
    travel: {
      travelEvents: input.data.travelEvents,
      partyRouteProgress: input.overlay?.partyRouteProgress ?? null,
    },
    economy: {
      economy: input.data.economy,
      economyReference: input.data.economyReference,
    },
    extensions: {
      worldMapStates: input.data.worldMapStates,
      factionZonesById: input.overlay?.factionZonesById ?? {},
      dynamicMapOverlaysById: input.overlay?.dynamicMapOverlaysById ?? {},
      movableEntitiesById: input.overlay?.movableEntitiesById ?? {},
      battleMapVttUrlOverrides: input.overlay?.battleMapVttUrlOverrides ?? {},
      originalLocations: input.data.locations,
      overlayRemainder: input.overlay ?? {},
    },
  };

  const runtime: CampaignRuntime = {
    campaignId,
    activeMapId: undefined,
    party: {
      currentLocationRef: input.overlay?.party?.currentLocationStateId ? entityIdFromLegacy('locationState', input.overlay.party.currentLocationStateId) : undefined,
      currentMapId: input.overlay?.party?.currentMapPosition?.mapId ? mapIdFromLegacy(input.overlay.party.currentMapPosition.mapId) : undefined,
      currentMapPosition: input.overlay?.party?.currentMapPosition
        ? { x: input.overlay.party.currentMapPosition.x, y: input.overlay.party.currentMapPosition.y }
        : undefined,
      routeProgress: input.overlay?.partyRouteProgress ? { ...input.overlay.partyRouteProgress } : null,
    },
    presentation: {
      presentedCard: input.overlay?.presentedCard
        ? { entityRef: entityIdFromLegacy(input.overlay.presentedCard.type, input.overlay.presentedCard.id), kind: input.overlay.presentedCard.type }
        : null,
    },
    battles: mapActiveBattle(input.overlay?.activeBattle, campaignId),
    questStatuses: input.overlay?.progress?.questStatusOverrides ?? {},
    locationStatuses: input.overlay?.progress?.locationStatusOverrides ?? {},
    extensions: {
      party: input.overlay?.party,
      notesByLocationStateId: input.overlay?.progress?.notesByLocationStateId ?? {},
      currentTimelineId: input.overlay?.currentTimelineId,
    },
  };

  const snapshot = createCampaignSnapshot({
    schemaVersion: makeSchemaVersion('1.0.0'),
    revision: makeRevision(0),
    metadata: {
      campaignId,
      title: 'Greyholm',
      kind: 'greyholm',
      createdAt: now,
      updatedAt: now,
      sources: [source],
    },
    capabilities: defaultCapabilities(true),
    durable,
    runtime,
    visibility: {
      entities: Object.fromEntries((input.overlay?.party?.revealedLocationStateIds ?? []).map((id) => [entityIdFromLegacy('locationState', id), PUBLIC_VISIBILITY])),
      fields: {},
      maps: {},
      presentations: {},
    },
    extensions: {},
    migrationMetadata: [{
      source,
      migratedAt: now,
      adapterVersion: 'main-campaign-adapter.v1',
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

function mapMainEntities(data: MainCampaignDataInput, campaignId: CampaignSnapshot['metadata']['campaignId']): UniversalEntity[] {
  return [
    ...data.locationStates.map((location): UniversalEntity => ({
      id: entityIdFromLegacy('locationState', location.id),
      campaignId,
      kind: 'location',
      title: location.title,
      publicDescription: location.publicDescription,
      playerSafeDescription: location.playerSafeDescription,
      dmNotes: location.dmNotes,
      imageRefs: location.imageIds.map((id) => ({ campaignId, entityId: entityIdFromLegacy('image', id), kind: 'image' })),
      npcRefs: location.npcIds.map((id) => ({ campaignId, entityId: entityIdFromLegacy('npc', id), kind: 'npc' })),
      questRefs: location.questIds.map((id) => ({ campaignId, entityId: entityIdFromLegacy('quest', id), kind: 'quest' })),
      visibility: location.status === 'hidden' ? HIDDEN_VISIBILITY : PUBLIC_VISIBILITY,
      tags: location.tags,
      sourceIds: [location.id, location.locationId],
      extensions: { original: location },
    })),
    ...data.npcs.map((npc): UniversalEntity => ({
      id: entityIdFromLegacy('npc', npc.id),
      campaignId,
      kind: 'npc',
      title: npc.name,
      role: npc.role,
      publicDescription: npc.publicDescription ?? npc.personality,
      dmNotes: [npc.dmNotes, npc.secrets, npc.notes].filter(Boolean).join('\n\n') || undefined,
      locationRef: npc.location ? { campaignId, entityId: entityIdFromLegacy('location', npc.location), kind: 'location' } : undefined,
      imageRef: npc.image ? { campaignId, entityId: entityIdFromLegacy('image', npc.image), kind: 'image' } : undefined,
      factionRefs: [...(npc.primaryFactionId ? [npc.primaryFactionId] : []), ...(npc.factionIds ?? [])].map((id) => ({ campaignId, entityId: entityIdFromLegacy('faction', id), kind: 'faction' })),
      visibility: npc.visibleToPlayers === false ? HIDDEN_VISIBILITY : PUBLIC_VISIBILITY,
      tags: npc.tags,
      sourceIds: [npc.id],
      extensions: { original: npc },
    })),
    ...data.players.map((player): UniversalEntity => ({
      id: entityIdFromLegacy('player', player.id),
      campaignId,
      kind: 'player',
      title: player.characterName,
      playerName: player.playerName,
      publicDescription: player.description,
      dmNotes: [player.dmNotes, player.dmSecrets].filter(Boolean).join('\n\n') || undefined,
      imageRef: player.image ? { campaignId, entityId: entityIdFromLegacy('image', player.image), kind: 'image' } : undefined,
      sheet: { ...player },
      visibility: PUBLIC_VISIBILITY,
      tags: player.tags,
      sourceIds: [player.id],
    })),
    ...data.quests.map((quest): UniversalEntity => ({
      id: entityIdFromLegacy('quest', quest.id),
      campaignId,
      kind: 'quest',
      title: quest.title,
      status: quest.status,
      publicDescription: quest.description,
      dmNotes: quest.notes,
      locationRefs: quest.location ? [{ campaignId, entityId: entityIdFromLegacy('location', quest.location), kind: 'location' }] : undefined,
      npcRefs: quest.giver ? [{ campaignId, entityId: entityIdFromLegacy('npc', quest.giver), kind: 'npc' }] : undefined,
      enemyRefs: quest.enemies?.map((id) => ({ campaignId, entityId: entityIdFromLegacy('enemy', id), kind: 'enemy' })),
      imageRef: quest.image ? { campaignId, entityId: entityIdFromLegacy('image', quest.image), kind: 'image' } : undefined,
      visibility: quest.status === 'hidden' ? HIDDEN_VISIBILITY : PUBLIC_VISIBILITY,
      tags: quest.tags,
      sourceIds: [quest.id],
      extensions: { original: quest },
    })),
    ...data.enemies.map((enemy): UniversalEntity => ({
      id: entityIdFromLegacy('enemy', enemy.id),
      campaignId,
      kind: 'enemy',
      title: enemy.name,
      ac: enemy.ac,
      hp: enemy.hp,
      cr: enemy.cr,
      publicDescription: enemy.lore,
      dmNotes: [enemy.tactics, enemy.dmNotes].filter(Boolean).join('\n\n') || undefined,
      locationRefs: enemy.locationIds?.map((id) => ({ campaignId, entityId: entityIdFromLegacy('location', id), kind: 'location' })),
      imageRef: enemy.image ? { campaignId, entityId: entityIdFromLegacy('image', enemy.image), kind: 'image' } : undefined,
      visibility: HIDDEN_VISIBILITY,
      tags: enemy.tags,
      sourceIds: [enemy.id],
      extensions: { original: enemy },
    })),
    ...data.factions.map((faction): UniversalEntity => ({
      id: entityIdFromLegacy('faction', faction.id),
      campaignId,
      kind: 'faction',
      title: faction.name,
      publicDescription: faction.description,
      dmNotes: [faction.goals, faction.resources].filter(Boolean).join('\n\n') || undefined,
      visibility: PUBLIC_VISIBILITY,
      tags: faction.tags,
      sourceIds: [faction.id],
      extensions: { original: faction },
    })),
    ...data.images.map((image): UniversalEntity => ({
      id: entityIdFromLegacy('image', image.id),
      campaignId,
      kind: 'image',
      title: image.title,
      src: image.src,
      safeForPlayers: image.safeForPlayers,
      relatedRefs: [
        ...(image.linkedLocationIds ?? []).map((id) => ({ campaignId, entityId: entityIdFromLegacy('location', id), kind: 'location' as const })),
        ...(image.linkedQuestIds ?? []).map((id) => ({ campaignId, entityId: entityIdFromLegacy('quest', id), kind: 'quest' as const })),
        ...(image.linkedEnemyIds ?? []).map((id) => ({ campaignId, entityId: entityIdFromLegacy('enemy', id), kind: 'enemy' as const })),
      ],
      visibility: image.safeForPlayers ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
      sourceIds: [image.id],
      extensions: { original: image },
    })),
    ...data.shops.map((shop): UniversalEntity => ({
      id: entityIdFromLegacy('shop', shop.id),
      campaignId,
      kind: 'shop',
      title: shop.name,
      publicDescription: shop.description,
      dmNotes: shop.notes,
      relatedRefs: [
        { campaignId, entityId: entityIdFromLegacy('location', shop.location), kind: 'location' },
        ...(shop.ownerNpcId ? [{ campaignId, entityId: entityIdFromLegacy('npc', shop.ownerNpcId), kind: 'npc' as const }] : []),
      ],
      visibility: PUBLIC_VISIBILITY,
      tags: shop.tags,
      sourceIds: [shop.id],
      extensions: { original: shop },
    })),
    ...data.taverns.map((tavern): UniversalEntity => ({
      id: entityIdFromLegacy('tavern', tavern.id),
      campaignId,
      kind: 'tavern',
      title: tavern.name,
      publicDescription: tavern.description,
      dmNotes: [tavern.notes, tavern.rumors?.join('\n')].filter(Boolean).join('\n\n') || undefined,
      relatedRefs: [
        { campaignId, entityId: entityIdFromLegacy('location', tavern.location), kind: 'location' },
        ...(tavern.ownerNpcId ? [{ campaignId, entityId: entityIdFromLegacy('npc', tavern.ownerNpcId), kind: 'npc' as const }] : []),
        ...(tavern.staff ?? []).map((id) => ({ campaignId, entityId: entityIdFromLegacy('npc', id), kind: 'npc' as const })),
      ],
      visibility: PUBLIC_VISIBILITY,
      tags: tavern.tags,
      sourceIds: [tavern.id],
      extensions: { original: tavern },
    })),
  ];
}

function mapBattleMaps(battleMaps: BattleMapManifestEntry[], campaignId: CampaignSnapshot['metadata']['campaignId']): BattleMapDefinition[] {
  return battleMaps.map((map) => ({
    id: map.id,
    campaignId,
    title: map.title,
    variants: map.variants.map((variant, index) => ({
      id: variant.type ?? `variant-${index}`,
      kind: variant.type === 'night' ? 'night' : variant.type === 'evening' ? 'evening' : variant.type === 'rain' ? 'rain' : 'default',
      assetRef: variant.url ?? variant.fileName ?? map.id,
      labels: [variant.fileName, variant.type].filter((item): item is string => Boolean(item)),
    })),
    grid: map.gridProfile?.columns ? { columns: map.gridProfile.columns, rows: map.gridProfile.rows, snap: true } : undefined,
    visibility: PUBLIC_VISIBILITY,
    extensions: { original: map },
  }));
}

function mapBattleEntries(entries: BattleEntry[], campaignId: CampaignSnapshot['metadata']['campaignId']): BattleEntryDefinition[] {
  return entries.map((entry) => ({
    id: entry.id,
    campaignId,
    title: entry.name,
    status: entry.status,
    battleMapRef: entry.battleMapId,
    locationRefs: entry.sourceLocationStateId ? [entityIdFromLegacy('locationState', entry.sourceLocationStateId)] : undefined,
    participantRefs: [
      ...(entry.linkedEnemyIds ?? []).map((id) => entityIdFromLegacy('enemy', id)),
      ...(entry.linkedNpcIds ?? []).map((id) => entityIdFromLegacy('npc', id)),
    ],
    position: entry.position,
    visibility: entry.visibleInPlayerView ? PUBLIC_VISIBILITY : HIDDEN_VISIBILITY,
    extensions: { original: entry },
  }));
}

function mapActiveBattle(activeBattle: ActiveBattleState | null | undefined, campaignId: CampaignSnapshot['metadata']['campaignId']): Record<string, BattleRuntime> {
  if (!activeBattle) return {};
  const id = runtimeIdFromLegacy('activeBattle', activeBattle.id);
  return {
    [id]: {
      id,
      campaignId,
      battleEntryRef: activeBattle.sceneId,
      battleMapRef: activeBattle.battleMapId,
      active: true,
      board: {
        battleMapRef: activeBattle.battleMapId,
        variant: activeBattle.variantType,
        tokens: activeBattle.combatants.map((combatant) => ({
          id: combatant.id,
          name: combatant.name,
          side: combatant.side,
          sourceEntityRef: entityIdFromLegacy(combatant.side === 'player' ? 'player' : 'enemy', combatant.sourceId),
          position: { x: combatant.x, y: combatant.y },
          currentHp: combatant.currentHp,
          maxHp: combatant.maxHp,
          ac: combatant.armorClass,
          initiative: combatant.initiative,
        })),
        terrain: activeBattle.terrainCells?.map((cell) => ({ cellKey: `${cell.row},${cell.column}`, type: cell.type })),
      },
      initiative: { round: activeBattle.round, currentTurnTokenId: activeBattle.currentTurnCombatantId },
      presentedToPlayers: true,
      extensions: { original: activeBattle },
    },
  };
}

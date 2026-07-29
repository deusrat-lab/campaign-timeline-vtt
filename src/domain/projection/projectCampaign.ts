import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalEntity } from '../entities/types';
import type {
  BattleProjection,
  DMWorkspaceProjection,
  EntityCardProjection,
  MapProjection,
  ObserverProjection,
  PlayerSafeProjection,
  ProjectionParityResult,
  TimelineProjection,
  TravelProjection,
} from './types';

export function projectDMWorkspace(snapshot: CampaignSnapshot): DMWorkspaceProjection {
  const entities = snapshot.durable.entities.map((entity) => entityCard(entity, true));
  return freezeProjection({
    campaignId: snapshot.metadata.campaignId,
    title: snapshot.metadata.title,
    entities,
    map: projectMap(snapshot, 'dm'),
    timeline: projectTimeline(snapshot),
    travel: projectTravel(snapshot, 'dm'),
    battles: projectBattles(snapshot, 'dm'),
    diagnostics: {
      entityCount: snapshot.durable.entities.length,
      mapCount: snapshot.durable.maps.length,
      warningCount: 0,
    },
  });
}

export function projectPlayerSafe(snapshot: CampaignSnapshot): PlayerSafeProjection {
  const entities = snapshot.durable.entities
    .filter((entity) => isPlayerVisible(entity.visibility.level))
    .map((entity) => entityCard(entity, false));
  const presentedRef = snapshot.runtime.presentation.presentedCard?.entityRef;
  const presentedEntity = presentedRef
    ? snapshot.durable.entities.find((entity) => entity.id === presentedRef)
    : undefined;
  return freezeProjection({
    campaignId: snapshot.metadata.campaignId,
    title: snapshot.metadata.title,
    entities,
    map: projectMap(snapshot, 'player'),
    presentedCard: presentedEntity && isPlayerVisible(presentedEntity.visibility.level) ? entityCard(presentedEntity, false) : undefined,
    activeBattles: Object.values(snapshot.runtime.battles).filter((battle) => battle.presentedToPlayers === true),
  });
}

export function projectObserver(snapshot: CampaignSnapshot): ObserverProjection {
  const player = projectPlayerSafe(snapshot);
  return freezeProjection({
    ...player,
    observerFocus: snapshot.runtime.presentation.observerFocus ?? null,
  });
}

export function projectMap(snapshot: CampaignSnapshot, audience: 'dm' | 'player' | 'observer'): MapProjection {
  const canSee = audience === 'dm' ? () => true : (level: string) => isPlayerVisible(level);
  return freezeProjection({
    maps: snapshot.durable.maps.filter((map) => canSee(map.visibility.level)),
    hotspots: snapshot.durable.hotspots.filter((hotspot) => canSee(hotspot.visibility.level)),
    placements: snapshot.durable.placements.filter((placement) => canSee(placement.visibility.level)),
    routes: snapshot.durable.routes.filter((route) => canSee(route.visibility.level)),
  });
}

export function projectBattles(snapshot: CampaignSnapshot, audience: 'dm' | 'player' | 'observer'): BattleProjection {
  const runtimes = Object.values(snapshot.runtime.battles);
  const visibleRuntime = audience === 'dm' ? runtimes : runtimes.filter((battle) => battle.presentedToPlayers === true);
  return freezeProjection({
    battleMaps: audience === 'dm'
      ? snapshot.durable.battleMaps.length
      : snapshot.durable.battleMaps.filter((map) => isPlayerVisible(map.visibility.level)).length,
    battleEntries: audience === 'dm'
      ? snapshot.durable.battleEntries.length
      : snapshot.durable.battleEntries.filter((entry) => isPlayerVisible(entry.visibility.level)).length,
    activeBattles: visibleRuntime,
    tokens: visibleRuntime.reduce((sum, battle) => sum + battle.board.tokens.length, 0),
  });
}

export function projectTimeline(snapshot: CampaignSnapshot): TimelineProjection {
  return freezeProjection({
    timeline: snapshot.durable.timeline,
    calendar: snapshot.durable.calendar,
  });
}

export function projectTravel(snapshot: CampaignSnapshot, audience: 'dm' | 'player' | 'observer'): TravelProjection {
  return freezeProjection({
    routes: projectMap(snapshot, audience).routes,
    travel: snapshot.durable.travel,
  });
}

export function compareProjectionCounts(snapshot: CampaignSnapshot): ProjectionParityResult {
  const dm = projectDMWorkspace(snapshot);
  const player = projectPlayerSafe(snapshot);
  const differences: ProjectionParityResult['differences'] = [];
  if (dm.entities.length !== snapshot.durable.entities.length) {
    differences.push({ path: 'dm.entities', expected: snapshot.durable.entities.length, actual: dm.entities.length, message: 'DM projection must include all entities.' });
  }
  if (player.entities.some((entity) => entity.description?.includes('dmNotes'))) {
    differences.push({ path: 'player.entities.description', expected: 'no dmNotes', actual: 'dmNotes marker', message: 'Player projection leaked DM notes marker.' });
  }
  return { ok: differences.length === 0, differences };
}

function entityCard(entity: UniversalEntity, includeDm: boolean): EntityCardProjection {
  const maybeText = entity as UniversalEntity & {
    publicDescription?: string;
    playerSafeDescription?: string;
    dmNotes?: string;
    imageRef?: { entityId: string };
    src?: string;
    status?: string;
  };
  return {
    id: entity.id,
    kind: entity.kind,
    title: entity.title,
    description: includeDm
      ? maybeText.publicDescription ?? maybeText.playerSafeDescription ?? maybeText.dmNotes
      : maybeText.playerSafeDescription ?? maybeText.publicDescription,
    imageSrc: maybeText.src ?? maybeText.imageRef?.entityId,
    status: maybeText.status,
    visible: includeDm || isPlayerVisible(entity.visibility.level),
  };
}

function isPlayerVisible(level: string): boolean {
  return level === 'public' || level === 'revealed' || level === 'playerSafe' || level === 'observerVisible' || level === 'presented';
}

function freezeProjection<T>(value: T): T {
  return deepFreeze(structuredClone(value));
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object') return value;
  Object.freeze(value);
  for (const item of Object.values(value as Record<string, unknown>)) {
    deepFreeze(item);
  }
  return value;
}

import type {
  DmLocation,
  DmNpc,
  DmQuest,
  DmCustomEnemy,
  DmImageItem,
  DmFaction,
  DmTavern,
  DmEconomyEntry,
  DmEconomyReferenceItem,
  DmLaw,
  DmShop,
  DmPlayer,
} from '../types/dmCompanion';
import { ARC_1_ID, ARC_2_ID } from '../types/dmCompanion';
import type { Timeline, LocationState, WorldMap, WorldMapState, MapHotspot, MapRoute, TravelEvent, MapObjectPlacement, BattleMapLink, BattleMapLocationLink } from '../types';
import hotspotsSeed from './hotspots.json';
import { ARC2_HOTSPOTS } from './arc2Hotspots';
import routesSeed from './routes.json';
import travelEventsSeed from './travelEvents.json';
import battleMapsIndexSeed from './battle-maps-index.json';
import { getInferredParentId, KINGDOM_LOCATION_ID, REGION_LOCATION_ID } from './locationHierarchy';
import { buildBattleMapLocationLinks } from './battleMapLocationLinks';
import { loadBattleMapManifest } from './battleMapManifest';
import type { BattleMapManifestEntry } from './battleMapManifest';

const DATA_BASE = '/data/dm-companion';

async function fetchJson<T>(file: string): Promise<T> {
  const res = await fetch(`${DATA_BASE}/${file}`);
  if (!res.ok) throw new Error(`Failed to load ${file}: ${res.status}`);
  return res.json() as Promise<T>;
}

export interface CampaignData {
  timelines: Timeline[];
  locationStates: LocationState[];
  worldMaps: WorldMap[];
  worldMapStates: WorldMapState[];
  hotspots: MapHotspot[];
  routes: MapRoute[];
  travelEvents: TravelEvent[];
  /** No seed data at all — placements are 100% DM-created, living entirely in the local overlay. */
  placements: MapObjectPlacement[];
  battleMapLinks: BattleMapLink[];
  battleMapLocationLinks: BattleMapLocationLink[];
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
  laws: DmLaw[];
  shops: DmShop[];
  players: DmPlayer[];
}

export const TIMELINES: Timeline[] = [
  {
    id: 'arc-1-peace',
    arcId: ARC_1_ID,
    title: 'Арка 1',
    description: 'Текущее состояние мира.',
    order: 1,
    isDefault: true,
    visibleToPlayers: true,
    isCurrent: true,
  },
  {
    id: 'arc-2-war',
    arcId: ARC_2_ID,
    title: 'Арка 2',
    description: 'Война за Грейхольм после падения города: фронт Кальдрана и Ауролеона, серая зона и независимые силы.',
    order: 2,
    visibleToPlayers: false,
    isCurrent: false,
  },
];

/**
 * Stage 6A — Canon Map Rebuild. These three ids are unchanged (so existing
 * code that references 'map-kingdom' / 'map-region' / 'map-city-greyholm'
 * keeps working), but the background art and metadata now point at the new
 * canonical map set: Kingdom of Aurelon (world) -> Greyholm Region (region)
 * -> Greyholm City (city). See
 * docs/CAMPAIGN_MAP_WORKSPACE_CANON_MAP_REBUILD_SPEC.md.
 *
 * originalImageWidth/Height/aspectRatio below MUST be updated to match the
 * real pixel dimensions of whatever file actually ends up at
 * backgroundImageSrc — see that doc's "Map image metadata" section. The
 * placeholder values here intentionally use the dimensions communicated for
 * the new canon art; if the real exported file differs, update these three
 * fields before trusting any coordinate placed against it.
 */
const WORLD_MAPS: WorldMap[] = [
  {
    id: 'map-kingdom',
    title: 'Королевство Аурелон',
    scope: 'kingdom',
    backgroundImageSrc: '/maps/kingdom/kingdom_of_aurelon_canon.jpg',
    level: 'world',
    originalImageWidth: 1448,
    originalImageHeight: 1086,
    aspectRatio: 1448 / 1086,
    defaultZoom: 1,
    defaultCenter: { x: 0.5, y: 0.5 },
    isPlayerVisible: true,
  },
  {
    id: 'map-region',
    title: 'Регион Грейхольма (Калдран)',
    scope: 'region',
    backgroundImageSrc: '/maps/regions/greyholm_region_canon.jpg',
    level: 'region',
    parentMapId: 'map-kingdom',
    originalImageWidth: 1448,
    originalImageHeight: 1086,
    aspectRatio: 1448 / 1086,
    defaultZoom: 1,
    defaultCenter: { x: 0.5, y: 0.5 },
    isPlayerVisible: true,
  },
  {
    id: 'map-region-arc2-war',
    title: 'Грейхольмский театр войны',
    timelineId: 'arc-2-war',
    scope: 'region',
    backgroundImageSrc: '/maps/regions/greyholm_region_arc2_war.png',
    level: 'region',
    parentMapId: 'map-kingdom',
    originalImageWidth: 1448,
    originalImageHeight: 1086,
    aspectRatio: 1448 / 1086,
    defaultZoom: 1,
    defaultCenter: { x: 0.5, y: 0.5 },
    isPlayerVisible: true,
  },
  {
    id: 'map-city-greyholm',
    title: 'Грейхольм',
    scope: 'city',
    backgroundImageSrc: '/maps/cities/greyholm_city_canon.jpg',
    level: 'city',
    parentMapId: 'map-region',
    originalImageWidth: 1448,
    originalImageHeight: 1086,
    aspectRatio: 1448 / 1086,
    defaultZoom: 1,
    defaultCenter: { x: 0.5, y: 0.5 },
    isPlayerVisible: true,
  },
];

function locationStateId(locationId: string, timelineId: string): string {
  return `${locationId}__${timelineId}`;
}

function normalizeLinkText(value?: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/№/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function splitLocationNameParts(location: DmLocation): string[] {
  return [location.name, ...(location.aliases ?? [])]
    .flatMap((name) => name.split(/[\/|]/g))
    .map(normalizeLinkText)
    .filter((part) => part.length >= 5);
}

function locationsLookLikeSamePlace(a: DmLocation, b: DmLocation): boolean {
  const aParts = splitLocationNameParts(a);
  const bParts = splitLocationNameParts(b);
  return aParts.some((aPart) =>
    bParts.some((bPart) => aPart === bPart || (aPart.length >= 10 && bPart.includes(aPart)) || (bPart.length >= 10 && aPart.includes(bPart))),
  );
}

function findArc2BaseLocation(location: DmLocation, locations: DmLocation[]): DmLocation | undefined {
  if (location.arcId !== ARC_2_ID) return undefined;
  return locations.find((candidate) => (candidate.arcId ?? ARC_1_ID) === ARC_1_ID && locationsLookLikeSamePlace(candidate, location));
}

function getArc2SupplementLocations(location: DmLocation, timeline: Timeline, locations: DmLocation[]): DmLocation[] {
  if (timeline.arcId !== ARC_2_ID || (location.arcId ?? ARC_1_ID) !== ARC_1_ID) return [];
  return locations.filter((candidate) => candidate.arcId === ARC_2_ID && locationsLookLikeSamePlace(location, candidate));
}

function locationTextHaystack(location: DmLocation): string {
  return normalizeLinkText(
    [
      location.name,
      location.description,
      location.atmosphere,
      location.lore,
      location.playerView,
      location.dmSecrets,
      location.notes,
      ...(location.tags ?? []),
      ...(location.aliases ?? []),
    ]
      .filter(Boolean)
      .join(' '),
  );
}

function locationMentionsEntity(location: DmLocation, entityName?: string): boolean {
  const needle = normalizeLinkText(entityName);
  return needle.length >= 5 && locationTextHaystack(location).includes(needle);
}

function mergeUnique<T>(...groups: T[][]): T[] {
  return Array.from(new Set(groups.flat()));
}

/**
 * Derive LocationStates from dm-companion locations for every timeline whose
 * arcId matches the location's own arcId.
 *
 * Arc 2 is a wartime continuation of the same region, so Arc 1/untagged
 * locations are projected forward as cards too. Arc 2-specific locations
 * still come from dm-companion as authored; only map placement is left to
 * the DM unless a real Arc 1 region hotspot can be safely mirrored.
 */
function buildLocationStates(
  locations: DmLocation[],
  npcs: DmNpc[],
  quests: DmQuest[],
  enemies: DmCustomEnemy[],
  images: DmImageItem[],
  timelines: Timeline[],
  taverns: DmTavern[] = [],
): LocationState[] {
  const states: LocationState[] = [];

  // Two structural/technical hierarchy container nodes (Kingdom + Region),
  // synthesized here because no such entities exist in dm-companion's
  // locations.json. They exist only on the Arc-1 timeline, matching the only
  // timeline with real kingdom/region map art. Named directly off the map art
  // (see locationHierarchy.ts for sourcing notes); no other lore is invented.
  const arc1Timeline = timelines.find((t) => t.arcId === ARC_1_ID);
  if (arc1Timeline) {
    states.push({
      id: locationStateId(KINGDOM_LOCATION_ID, arc1Timeline.id),
      locationId: KINGDOM_LOCATION_ID,
      timelineId: arc1Timeline.id,
      title: 'Королевство Аурелон',
      type: 'kingdom',
      publicDescription: 'Структурный узел иерархии карты — детальный лор не заведён.',
      status: 'known',
      childLocationStateIds: [],
      npcIds: [],
      questIds: [],
      enemyIds: [],
      imageIds: [],
      isCustom: true,
    });
    states.push({
      id: locationStateId(REGION_LOCATION_ID, arc1Timeline.id),
      locationId: REGION_LOCATION_ID,
      timelineId: arc1Timeline.id,
      title: 'Калдран',
      type: 'region',
      publicDescription: 'Структурный узел иерархии карты — детальный лор не заведён.',
      status: 'known',
      parentLocationStateId: locationStateId(KINGDOM_LOCATION_ID, arc1Timeline.id),
      childLocationStateIds: [],
      npcIds: [],
      questIds: [],
      enemyIds: [],
      imageIds: [],
      isCustom: true,
    });
  }

  for (const timeline of timelines) {
    for (const loc of locations) {
      const locationArcId = loc.arcId ?? ARC_1_ID;
      const matchesTimeline =
        locationArcId === timeline.arcId || (timeline.arcId === ARC_2_ID && locationArcId === ARC_1_ID);
      if (!matchesTimeline) continue;
      if (timeline.arcId === ARC_2_ID && loc.arcId === ARC_2_ID && findArc2BaseLocation(loc, locations)) {
        continue;
      }

      const locationSources = [loc, ...getArc2SupplementLocations(loc, timeline, locations)];
      const locationSourceIds = new Set(locationSources.map((source) => source.id));

      const npcIds = npcs
        .filter(
          (n) =>
            locationSourceIds.has(n.location) ||
            locationSources.some((source) => source.npcs?.includes(n.id)) ||
            locationSources.some((source) => !n.location && (n.arcId ?? timeline.arcId) === timeline.arcId && locationMentionsEntity(source, n.name)),
        )
        .map((n) => n.id);
      const questIds = quests
        .filter(
          (q) =>
            locationSourceIds.has(q.location) ||
            locationSources.some((source) => source.quests?.includes(q.id)) ||
            locationSources.some((source) => !q.location && (q.arcId ?? timeline.arcId) === timeline.arcId && locationMentionsEntity(source, q.title)),
        )
        .map((q) => q.id);
      const enemyIds = enemies.filter((e) => e.locationIds?.some((id) => locationSourceIds.has(id))).map((e) => e.id);
      const imageIds = images
        .filter(
          (i) =>
            i.linkedLocationIds?.some((id) => locationSourceIds.has(id)) ||
            locationSources.some((source) => source.images?.includes(i.id)) ||
            (i.relatedEntity ? locationSourceIds.has(i.relatedEntity) : false),
        )
        .map((i) => i.id);

      const status = loc.controlStatus ? 'contested' : 'known';

      // Prefer the JSON's own parentLocationId when present (sourced); otherwise
      // fall back to the inferred overlay in locationHierarchy.ts.
      const effectiveParentId = loc.parentLocationId || getInferredParentId(loc.id);

      states.push({
        id: locationStateId(loc.id, timeline.id),
        locationId: loc.id,
        timelineId: timeline.id,
        title: loc.name,
        type: loc.type,
        publicDescription: loc.playerView || loc.description || '',
        dmNotes: [loc.dmSecrets, loc.notes].filter(Boolean).join('\n\n') || undefined,
        status,
        tags: loc.tags,
        region: loc.region,
        parentLocationStateId: effectiveParentId
          ? locationStateId(effectiveParentId, timeline.id)
          : undefined,
        childLocationStateIds: (loc.childLocationIds || []).map((childId) =>
          locationStateId(childId, timeline.id),
        ),
        npcIds: mergeUnique(locationSources.flatMap((source) => source.npcs || []), npcIds),
        questIds: mergeUnique(locationSources.flatMap((source) => source.quests || []), questIds),
        enemyIds,
        imageIds,
      });
    }
  }

  // Taverns (taverns.json) have no arcId in the source — same rule as other
  // arcId-less seed entities: treated as Arc-1-only, never synthesized onto
  // Arc 2. Each becomes its own LocationState nested under its real parent
  // location (loc-greyholm / loc-greyholm-river-docks / loc-greyholm-market),
  // exactly the 3 real taverns from taverns.json — nothing invented.
  if (arc1Timeline) {
    for (const tavern of taverns) {
      const tavernImageIds = images
        .filter((i) => i.relatedEntity === tavern.id || tavern.relatedImages?.includes(i.id))
        .map((i) => i.id);
      states.push({
        id: locationStateId(tavern.id, arc1Timeline.id),
        locationId: tavern.id,
        timelineId: arc1Timeline.id,
        title: tavern.name,
        type: 'tavern',
        publicDescription: tavern.description || '',
        dmNotes: [tavern.notes, tavern.rumors?.join('\n')].filter(Boolean).join('\n\n') || undefined,
        status: 'known',
        tags: tavern.tags,
        parentLocationStateId: locationStateId(tavern.location, arc1Timeline.id),
        childLocationStateIds: [],
        npcIds: Array.from(new Set([...(tavern.ownerNpcId ? [tavern.ownerNpcId] : []), ...(tavern.staff || []), ...(tavern.relatedNpcs || [])])),
        questIds: tavern.relatedQuests || [],
        enemyIds: [],
        imageIds: tavernImageIds,
        isCustom: true,
      });
    }
  }

  // Second pass: fill childLocationStateIds from the inferred/sourced parent
  // links collected above, since locations.json itself never populates
  // childLocationIds for these (see locationHierarchy.ts).
  const byId = new Map(states.map((s) => [s.id, s]));
  for (const s of states) {
    if (s.parentLocationStateId) {
      const parent = byId.get(s.parentLocationStateId);
      if (parent && !parent.childLocationStateIds.includes(s.id)) {
        parent.childLocationStateIds.push(s.id);
      }
    }
  }

  return states;
}

function mirrorArc1RegionHotspotsForArc2(hotspots: MapHotspot[]): MapHotspot[] {
  return hotspots
    .filter((h) => h.mapId === 'map-region' && h.timelineId === 'arc-1-peace' && h.locationStateId.endsWith('__arc-1-peace'))
    .map((h) => ({
      ...h,
      id: `arc2-region-copy:${h.id}`,
      mapId: 'map-region-arc2-war',
      timelineId: 'arc-2-war',
      locationStateId: h.locationStateId.replace('__arc-1-peace', '__arc-2-war'),
      needsCoordinateReview: false,
    }));
}

/**
 * Arc-1 levels have a real background image (the Stage 6A canon art). Arc-2
 * has NO seeded map content at all (per spec, we never invent Arc-2 map
 * data) — so every Arc-2 WorldMapState is flagged needsArtReview and starts
 * with zero hotspots; MapWorkspacePage must show an explicit "no map for this
 * arc/level yet" placeholder rather than silently falling back to Arc-1 art.
 *
 * needsArtReview is keyed off whether the WorldMap itself has real art
 * (`backgroundImageSrc`), NOT off hotspot count — Stage 6A's clean slate
 * means Arc-1 maps now legitimately start with zero hotspots (the DM
 * re-places them manually), and that must not be confused with "no map art
 * exists yet." A prior version of this heuristic used `idsForThis.length
 * === 0`, which broke exactly this way the moment Stage 6A emptied
 * hotspots.json — every Arc-1 map silently fell back to the "PLACEHOLDER —
 * нужна карта" UI even though real canon art was registered. Fixed here.
 */
function buildWorldMapStatesAndHotspots(
  timelines: Timeline[],
): { worldMapStates: WorldMapState[]; hotspots: MapHotspot[] } {
  const baseHotspots = hotspotsSeed as MapHotspot[];
  const hotspots = [...baseHotspots, ...mirrorArc1RegionHotspotsForArc2(baseHotspots), ...ARC2_HOTSPOTS];
  const worldMapStates: WorldMapState[] = [];
  for (const map of WORLD_MAPS) {
    for (const timeline of timelines) {
      if (map.timelineId && map.timelineId !== timeline.id) continue;
      if (!map.timelineId && timeline.id === 'arc-2-war') {
        const timelineSpecificMapExists = WORLD_MAPS.some((m) => m.timelineId === timeline.id && m.scope === map.scope);
        if (timelineSpecificMapExists) continue;
        if (map.scope === 'city') continue;
      }
      const idsForThis = hotspots
        .filter((h) => h.mapId === map.id && h.timelineId === timeline.id)
        .map((h) => h.id);
      worldMapStates.push({
        id: `${map.id}__${timeline.id}`,
        mapId: map.id,
        timelineId: timeline.id,
        hotspotIds: idsForThis,
        needsArtReview: !map.backgroundImageSrc,
      });
    }
  }
  return { worldMapStates, hotspots };
}

function buildRoutes(): MapRoute[] {
  return routesSeed as MapRoute[];
}

function buildTravelEvents(): TravelEvent[] {
  return travelEventsSeed as TravelEvent[];
}

export async function loadCampaignData(): Promise<CampaignData> {
  const [locations, npcs, quests, enemies, images, factions, taverns, battleMaps, economy, economyReference, laws, shops, players] =
    await Promise.all([
      fetchJson<DmLocation[]>('locations.json'),
      fetchJson<DmNpc[]>('npcs.json'),
      fetchJson<DmQuest[]>('quests.json'),
      fetchJson<DmCustomEnemy[]>('custom-enemies.json'),
      fetchJson<DmImageItem[]>('images.json'),
      fetchJson<DmFaction[]>('factions.json'),
      fetchJson<DmTavern[]>('taverns.json'),
      loadBattleMapManifest(),
      fetchJson<DmEconomyEntry[]>('economy.json'),
      fetchJson<DmEconomyReferenceItem[]>('economy-reference.json'),
      fetchJson<DmLaw[]>('laws.json'),
      fetchJson<DmShop[]>('shops.json'),
      fetchJson<DmPlayer[]>('players.json'),
    ]);

  // TODO(DM): no quest in the seed data is marked completed yet, but the party
  // has already finished exactly 2 mini-quests in Arc 1. Mark them as
  // completed via the Quests panel in the UI — do not guess which ones here.

  const timelines = TIMELINES;
  const locationStates = buildLocationStates(locations, npcs, quests, enemies, images, timelines, taverns);
  const { worldMapStates, hotspots } = buildWorldMapStatesAndHotspots(timelines);
  const routes = buildRoutes();
  const travelEvents = buildTravelEvents();
  const battleMapLocationLinks = buildBattleMapLocationLinks(battleMaps, locationStates, locations);
  const ensureBattleMapLocationLink = (locationStateId: string, battleMapId: string, reason: string) => {
    const existing = battleMapLocationLinks.find((link) => link.locationStateId === locationStateId && link.battleMapId === battleMapId);
    if (existing) {
      existing.confidence = 'exact';
      existing.manual = true;
      existing.rejected = false;
      existing.reason = reason;
      return;
    }
    battleMapLocationLinks.push({
      locationStateId,
      battleMapId,
      confidence: 'exact',
      reason,
      manual: true,
      rejected: false,
    });
  };
  ensureBattleMapLocationLink(
    'loc-greyholm-river-docks__arc-1-peace',
    'arc2-8fff85e73378a7b8',
    'Каноническая ручная связь: Склад №8 находится у речных доков Грейхольма',
  );

  return {
    timelines,
    locationStates,
    worldMaps: WORLD_MAPS,
    worldMapStates,
    hotspots,
    routes,
    travelEvents,
    placements: [],
    battleMapLinks: battleMapsIndexSeed as BattleMapLink[],
    battleMapLocationLinks,
    battleMaps,
    npcs,
    quests,
    enemies,
    images,
    factions,
    locations,
    taverns,
    economy,
    economyReference,
    laws,
    shops,
    players,
  };
}

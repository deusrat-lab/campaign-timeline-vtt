/**
 * The "overlay" is the single source of truth for every DM edit made inside
 * this app. The seed data produced by loadCampaignData() (dm-companion JSON +
 * our own seeds in src/data/) is treated as a read-only BASE LAYER. The
 * overlay is a diff/patch layer on top of it, persisted to localStorage, so
 * that re-importing/upgrading the seed data never destroys DM edits.
 *
 * Shape: per-entity-type maps of id -> partial patch (or a deletion marker),
 * plus arrays of brand-new entities created entirely in DM Edit Mode.
 */
import type {
  Timeline,
  WorldMap,
  WorldMapState,
  LocationState,
  MapHotspot,
  MapRoute,
  TravelEvent,
  MapObjectPlacement,
  PartyState,
  CampaignProgress,
  BattleMapLocationLink,
  CampaignCalendar,
  CampaignEvent,
  DelayedTrigger,
  FactionZone,
  DynamicMapOverlay,
  MovableEntity,
  BattleEntry,
  Npc,
  PartyRouteProgress,
  ActiveBattleState,
} from '../types';
import type { DmTavern, DmShop, DmImageItem, DmLocation, DmQuest, DmCustomEnemy, DmPlayer } from '../types/dmCompanion';

export const DELETED = '__deleted__' as const;

/** Default starting point for any timeline's calendar the first time it's touched. */
export const DEFAULT_CALENDAR: CampaignCalendar = {
  currentDay: 1,
  currentMonth: 'Незериум',
  currentYear: 1492,
  currentTimeOfDay: 'morning',
};

export type Patch<T> = Partial<T> | typeof DELETED;

export interface CampaignOverlay {
  /** Patches applied on top of seed entities, keyed by id. */
  timelinePatches: Record<string, Patch<Timeline>>;
  worldMapPatches: Record<string, Patch<WorldMap>>;
  worldMapStatePatches: Record<string, Patch<WorldMapState>>;
  locationStatePatches: Record<string, Patch<LocationState>>;
  hotspotPatches: Record<string, Patch<MapHotspot>>;
  routePatches: Record<string, Patch<MapRoute>>;
  travelEventPatches: Record<string, Patch<TravelEvent>>;
  placementPatches: Record<string, Patch<MapObjectPlacement>>;
  /** Stage 6B.1 — NPC edits (including edits to dm-companion-seeded NPCs,
   * e.g. setting visibleToPlayers/dmNotes/publicDescription on one). */
  npcPatches: Record<string, Patch<Npc>>;
  /** Stage 6C.4D — same non-destructive patch pattern as npcPatches, for the
   * remaining major card types that previously had no override slot at all. */
  tavernPatches: Record<string, Patch<DmTavern>>;
  shopPatches: Record<string, Patch<DmShop>>;
  imagePatches: Record<string, Patch<DmImageItem>>;
  questPatches: Record<string, Patch<DmQuest>>;
  enemyPatches: Record<string, Patch<DmCustomEnemy>>;
  playerPatches: Record<string, Patch<DmPlayer>>;
  /** Hotfix — DM edits to a dm-companion-seeded *source* Location (the
   * embedded-companion content card, e.g. "Cardlarein Road"). Distinct from
   * locationStatePatches, which patches the per-timeline map projection
   * (LocationState), not the underlying DmLocation content. */
  locationPatches: Record<string, Patch<DmLocation>>;

  /** Brand-new entities created in DM Edit Mode (not present in the seed). */
  newTimelines: Timeline[];
  newWorldMaps: WorldMap[];
  newWorldMapStates: WorldMapState[];
  newLocationStates: LocationState[];
  newHotspots: MapHotspot[];
  newRoutes: MapRoute[];
  newTravelEvents: TravelEvent[];
  /** Placements have no seed/source data at all — they are 100% DM-created. */
  newPlacements: MapObjectPlacement[];
  /** Stage 6B.1 — NPCs created via "Create NPC here", same "no seed data,
   * 100% DM-created" pattern as newPlacements. */
  newNpcs: Npc[];
  /** Hotfix — images uploaded from the DM's computer via the image picker's
   * "Загрузить изображение с компьютера" button. Same "no seed data, 100%
   * DM-created" pattern as newNpcs; `src` is a data: URL. */
  newImages: DmImageItem[];
  /** DM-created enemies copied/customized from the bestiary. */
  newEnemies: DmCustomEnemy[];

  /** These have no separate "seed" — the overlay IS the full value. */
  party: PartyState;
  progress: CampaignProgress;
  battleMapLocationLinkOverrides: Record<string, BattleMapLocationLink>;
  /**
   * Per-battleMapId manual deep link into the battle-map-vtt app (e.g.
   * "http://localhost:5174/#/maps/map-32c8501fd2fdbee8/play"), since there is
   * no reliable automatic id mapping between dm-companion battle map ids and
   * battle-map-vtt's own map ids. The "Открыть Battle Map VTT" button uses
   * this when set, falling back to the bare app base URL otherwise.
   */
  battleMapVttUrlOverrides: Record<string, string>;
  /** Simple persisted on/off toggle for the object-placement map layer. */
  placementLayerVisible: boolean;

  /** Time Engine skeleton (Etap F) — one independent calendar per timeline,
   * lazily defaulted (see DEFAULT_CALENDAR below) the first time it's read so
   * old persisted overlays never need a migration step. No triggers/automation. */
  calendarsByTimelineId: Record<string, CampaignCalendar>;

  /** Event System MVP — flat map of DM-authored CampaignEvents keyed by id.
   * No automation: nothing reads this to auto-trigger anything, it's purely
   * data the UI lists/links. Always defaulted to {} for old overlay JSON. */
  eventsById: Record<string, CampaignEvent>;

  /** Delayed Trigger MVP — flat map of DM-authored DelayedTriggers keyed by
   * id. Same philosophy as eventsById: nothing auto-fires from this alone,
   * see src/data/triggerUtils.ts for the (manual-review-only) evaluation
   * helpers. Always defaulted to {} for old overlay JSON. */
  triggersById: Record<string, DelayedTrigger>;

  /** Faction Zones (Stage 4A) — flat map of DM-authored FactionZones keyed by
   * id, same shape/philosophy as eventsById/triggersById: no automation,
   * status is always a manual DM choice. Always defaulted to {} for old
   * overlay JSON. */
  factionZonesById: Record<string, FactionZone>;

  /** Dynamic Map Overlay skeleton (Stage 4A) — types + data only, no real
   * renderer yet. Always defaulted to {} for old overlay JSON. */
  dynamicMapOverlaysById: Record<string, DynamicMapOverlay>;

  /** Movable Entity skeleton (Stage 4A) — types + data only, no map
   * rendering/simulation yet. Always defaulted to {} for old overlay JSON. */
  movableEntitiesById: Record<string, MovableEntity>;

  /** Battle Entry foundation (Stage 5A) — flat map of DM-authored
   * BattleEntries keyed by id, same shape/philosophy as eventsById/
   * factionZonesById: no automation, status is always a manual DM choice,
   * never hard-deleted. Always defaulted to {} for old overlay JSON. */
  battleEntriesById: Record<string, BattleEntry>;

  /** Time + Travel Engine MVP — at most one in-progress staged route walk
   * (the app has exactly one party). null when the party isn't mid-route
   * (e.g. resting at a location, or finished a route via the existing
   * instant-walk flow). Always defaulted to null for old overlay JSON. */
  partyRouteProgress: PartyRouteProgress | null;

  /** Active embedded battle window. Persisted so DM and player/observer
   * tabs in the same browser can open/close the same battle without a server. */
  activeBattle: ActiveBattleState | null;

  currentTimelineId: string;
  mode: 'dm-view' | 'dm-edit' | 'player-view';

  /**
   * Bumped whenever the route data model/seed changes in a way that makes old
   * locally-stored route edits meaningless (e.g. the old auto-generated
   * default routes/polylines were deleted entirely in favor of a fully manual
   * route builder). loadPersisted() in campaignStore.tsx compares this against
   * ROUTE_EDITOR_VERSION and wipes only route-related overlay state when it's
   * stale — never touches placements/hotspots/party/progress/battle-map state.
   */
  routeEditorVersion: number;

  /**
   * Bumped whenever the canonical map set itself is replaced (new background
   * art with a different layout, e.g. Stage 6A's Kingdom of
   * Aurelon/Greyholm Region/Greyholm City rebuild). Any locally-stored
   * hotspot/route/placement/zone/overlay/movable-entity position or party
   * route-progress made against the OLD map art is meaningless against the
   * new one, so it's wiped on load — see clearCanonMapOverlayState() in
   * campaignStore.tsx. Library data (npcs/quests/enemies/images/lore — none
   * of which has overlay state at all) and non-position DM content
   * (battleEntriesById, eventsById, triggersById, factionZonesById entity
   * data other than position, calendars) are never touched by this.
   */
  canonMapVersion: number;
}

export const EMPTY_OVERLAY: CampaignOverlay = {
  timelinePatches: {},
  worldMapPatches: {},
  worldMapStatePatches: {},
  locationStatePatches: {},
  hotspotPatches: {},
  routePatches: {},
  travelEventPatches: {},
  placementPatches: {},
  npcPatches: {},
  tavernPatches: {},
  shopPatches: {},
  imagePatches: {},
  questPatches: {},
  enemyPatches: {},
  playerPatches: {},
  locationPatches: {},
  newTimelines: [],
  newWorldMaps: [],
  newWorldMapStates: [],
  newLocationStates: [],
  newHotspots: [],
  newRoutes: [],
  newTravelEvents: [],
  newPlacements: [],
  newNpcs: [],
  newImages: [],
  newEnemies: [],
  party: { currentMapPosition: undefined, visitedLocationStateIds: [], knownLocationStateIds: [], revealedLocationStateIds: [] },
  progress: { questStatusOverrides: {}, locationStatusOverrides: {}, notesByLocationStateId: {} },
  battleMapLocationLinkOverrides: {},
  battleMapVttUrlOverrides: {},
  placementLayerVisible: true,
  calendarsByTimelineId: {},
  eventsById: {},
  triggersById: {},
  factionZonesById: {},
  dynamicMapOverlaysById: {},
  movableEntitiesById: {},
  battleEntriesById: {},
  partyRouteProgress: null,
  activeBattle: null,
  currentTimelineId: '',
  mode: 'dm-view',
  routeEditorVersion: 0,
  canonMapVersion: 0,
};

/** Merge a base array of entities with id-keyed patches + brand-new entities. */
export function applyOverlayToList<T extends { id: string }>(
  base: T[],
  patches: Record<string, Patch<T>>,
  added: T[],
): T[] {
  const merged = base
    .map((item) => {
      const patch = patches[item.id];
      if (patch === DELETED) return null;
      if (patch) return { ...item, ...patch };
      return item;
    })
    .filter((x): x is T => x !== null);

  const addedFiltered = added.filter((a) => {
    const patch = patches[a.id];
    return patch !== DELETED;
  });
  const addedPatched = addedFiltered.map((a) => {
    const patch = patches[a.id];
    return patch && patch !== DELETED ? { ...a, ...patch } : a;
  });

  // Avoid duplicate ids if a "new" entity id collides with a base id (shouldn't happen, but be safe).
  const mergedIds = new Set(merged.map((m) => m.id));
  return [...merged, ...addedPatched.filter((a) => !mergedIds.has(a.id))];
}

import type {
  DmNpc,
  DmQuest,
  DmCustomEnemy,
  DmImageItem,
  QuestStatus,
} from './types/dmCompanion';

// Thin aliases for the imported dm-companion entities.
export type Npc = DmNpc;
export type Quest = DmQuest;
export type CustomEnemy = DmCustomEnemy;
export type ImageItem = DmImageItem;
export type { QuestStatus };

/** One of the two campaign arcs/eras the DM can switch between. */
export interface Timeline {
  id: string;
  arcId: string;
  title: string;
  description?: string;
  order: number;
  isDefault?: boolean;
  /** Per-timeline player visibility flag (replaces the old single global arc-2 boolean). */
  visibleToPlayers?: boolean;
  /** Marks the timeline the DM currently considers "live" in the fiction. */
  isCurrent?: boolean;
}

/** A renderable world/region/city map (background image + hotspots). */
export interface WorldMap {
  id: string;
  title: string;
  /** 'kingdom' | 'region' | 'city' — free text scope label. */
  scope: 'kingdom' | 'region' | 'city';
  /** Path under /public to a background image, if one exists. */
  backgroundImageSrc?: string;
  /** Used when no real map image exists yet — render a plain placeholder instead. */
  placeholder?: boolean;
  /**
   * Stage 6A canon-map metadata. All optional so existing/older WorldMap
   * records (and any locally-patched copies in the overlay) stay valid
   * without migration — only the three canon maps populate these today.
   */
  /** Hierarchy depth: 'world' (Kingdom of Aurelon) -> 'region' (Greyholm Region) -> 'city' (Greyholm City). */
  level?: 'world' | 'region' | 'city';
  /** Id of the parent-level WorldMap this one zooms in from (e.g. the region map's parentMapId is the world map's id). */
  parentMapId?: string;
  /** Real pixel width of backgroundImageSrc, captured once when the canon image is registered — used to keep hotspot/route coordinate math anchored to the actual image instead of the viewport container. */
  originalImageWidth?: number;
  /** Real pixel height of backgroundImageSrc. */
  originalImageHeight?: number;
  /** originalImageWidth / originalImageHeight, precomputed so renderers never have to re-derive it (and risk drift) from a possibly-not-yet-loaded <img>. */
  aspectRatio?: number;
  /** Initial zoom level to open this map at. */
  defaultZoom?: number;
  /** Initial camera center, normalized 0..1 within the image. */
  defaultCenter?: { x: number; y: number };
  /** Whether this map itself (as opposed to individual hotspots/routes on it) may ever be shown to players/Observer. Defaults to true when unset. */
  isPlayerVisible?: boolean;
}

/** Per-timeline state of a WorldMap (its hotspots may differ by timeline). */
export interface WorldMapState {
  id: string;
  mapId: string;
  timelineId: string;
  hotspotIds: string[];
  /** True when this level/timeline combination has no real map art reviewed by a human yet. */
  needsArtReview?: boolean;
}

/** Simple status the DM can assign to a location-in-a-timeline from the UI. */
export type LocationStatus = 'unknown' | 'known' | 'visited' | 'hidden' | 'destroyed' | 'contested';

/** A dm-companion Location projected into a specific Timeline. */
export interface LocationState {
  id: string;
  locationId: string;
  timelineId: string;
  title: string;
  /**
   * Stage 6C — set when this LocationState was materialized by "Place on
   * current map" from a read-only DM Companion library record (DmTavern/
   * DmShop, src/types/dmCompanion.ts) rather than authored from scratch.
   * Purely a non-duplication marker for the Library panel (so a tavern
   * already placed shows "Placed" instead of letting the DM place it a
   * second time as a separate LocationState) — the source DmTavern/DmShop
   * record itself is never edited or deleted by this.
   */
  sourceLibraryId?: string;
  sourceLibraryType?: 'tavern' | 'shop';
  type?: string;
  publicDescription: string;
  /**
   * Stage 6B.1 — explicit player-safe description, distinct from
   * publicDescription. When set, this is what players/Observer see instead
   * of publicDescription; when unset, every player-safe render path falls
   * back to publicDescription (so existing LocationStates need no
   * migration and keep behaving exactly as before). publicDescription
   * itself is now treated as the DM-facing "internal" summary once a
   * playerSafeDescription exists — see playerSafeProjection.ts and
   * docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md §2.
   */
  playerSafeDescription?: string;
  dmNotes?: string;
  status: LocationStatus;
  parentLocationStateId?: string;
  childLocationStateIds: string[];
  npcIds: string[];
  questIds: string[];
  enemyIds: string[];
  imageIds: string[];
  tags?: string[];
  /** Order among siblings under the same parent — used by the simple up/down reordering UI. */
  order?: number;
  /** Set manually once a real battle-map link is established. */
  battleMapId?: string;
  /** True for locations created entirely in this app via DM Edit Mode (not derived from dm-companion seed). */
  isCustom?: boolean;
  /** Player-visibility override; when unset, derived from status via isLocationVisibleToPlayers(). */
  visibleToPlayers?: boolean;
  /**
   * Stage 6B.1 quick-template detail fields. Optional, additive, only
   * populated when the DM picked the matching template at creation/edit
   * time. `secrets`/`illegalGoods` are DM-only — stripped by
   * getPlayerSafeLocationStates() the same way dmNotes is.
   */
  tavernDetails?: {
    ownerNpcId?: string;
    staffNpcIds?: string[];
    roomsServices?: string;
    rumors?: string;
    pricesNotes?: string;
    troubleHooks?: string;
    /** DM-only. */
    secrets?: string;
  };
  shopDetails?: {
    shopType?: string;
    ownerNpcId?: string;
    goodsServices?: string;
    inventoryNotes?: string;
    pricePolicy?: string;
    reputationRequirement?: string;
    /** DM-only. */
    illegalGoods?: string;
  };
}

/** A clickable point on a WorldMap, linked to one LocationState. */
export interface MapHotspot {
  id: string;
  mapId: string;
  timelineId: string;
  locationStateId: string;
  /** 0..1 normalized coordinates within the map image (NOT 0-100 percentages). */
  x: number;
  y: number;
  label: string;
  icon?: string;
  /** Hide the text label while still showing the dot (DM can declutter a busy map). */
  labelHidden?: boolean;
  /** Whether players can see this hotspot at all (independent of location visibility rules). */
  visibleInPlayerView?: boolean;
  /** Seed coordinates were eyeballed/approximate and should be checked against real map art later. */
  needsCoordinateReview?: boolean;
}

/** A lightweight travel-graph edge between two hotspots on the same map. */
export interface MapRoute {
  id: string;
  mapStateId: string;
  fromHotspotId: string;
  toHotspotId: string;
  points?: Array<{ x: number; y: number }>;
  label?: string;
  routeType?: 'road' | 'street' | 'trail' | 'river' | 'tunnel' | 'secret' | 'dangerous' | 'custom';
  /** Optional danger tag, independent of routeType — never set to dangerous/deadly without an existing data basis. */
  dangerLevel?: 'safe' | 'watchful' | 'dangerous' | 'deadly';
  visibleInPlayerView: boolean;
  discovered?: boolean;
  travelTime?: string;
  notes?: string;
  /** Route-model hardening (optional, never required — old routes stay valid without these). */
  status?: 'planned' | 'active' | 'completed' | 'blocked' | 'dangerous' | 'hidden';
  distanceKm?: number;
  travelDifficulty?: 'easy' | 'normal' | 'hard' | 'deadly';
  linkedQuestIds?: string[];
  linkedLocationIds?: string[];
  linkedFactionIds?: string[];
  linkedEventIds?: string[];
  tags?: string[];
  /**
   * Route-network pathfinding hints (src/data/routeNetwork.ts), all optional
   * and non-breaking. Defaults are applied in code, never by mutating
   * existing data: a route is treated as a usable network edge unless its
   * status is 'hidden'/'blocked'; a route with <2 points or missing either
   * endpoint never participates in the graph (see routeNetwork.ts).
   */
  isNetworkRoute?: boolean;
  movementAllowed?: boolean;
  requiresGate?: boolean;
  districtGate?: boolean;
  blockedByDefault?: boolean;
  pathTags?: string[];
}

/**
 * A DM-only, manually-activated "what might happen here/on this leg" stub.
 * Never auto-triggered by the app — purely a prepared option the DM can open.
 * Generated only as a MECHANICAL inference from already-existing links (a
 * route/location already has linked enemies or battle maps) — never as
 * invented narrative content. See travelEvents.json for the seeded set.
 */
export interface TravelEvent {
  id: string;
  arcId: string;
  routeId?: string;
  locationStateId?: string;
  title: string;
  type:
    | 'ambush'
    | 'encounter'
    | 'social'
    | 'clue'
    | 'obstacle'
    | 'rumor'
    | 'patrol'
    | 'merchant'
    | 'monster_sign'
    | 'battle_scene';
  dangerLevel?: 'safe' | 'watchful' | 'dangerous' | 'deadly';
  description?: string;
  dmNotes?: string;
  linkedEnemyIds?: string[];
  linkedNpcIds?: string[];
  linkedQuestIds?: string[];
  linkedBattleMapIds?: string[];
  visibleInPlayerView: boolean;
  status?: 'available' | 'used' | 'hidden';
}

/**
 * A DM-placed marker pinning an already-existing card (NPC/quest/enemy/image/
 * battle map/location) — or a free-form DM note — to a specific spot on a
 * specific map. Entirely a local-overlay construct: it never creates new lore,
 * it only records WHERE an existing entity (or a DM's own note) sits on the
 * map. See MapWorkspacePage's "Разместить на карте" placement-mode flow.
 */
export interface MapObjectPlacement {
  id: string;
  arcId: string;
  mapLevel: WorldMap['scope'];
  mapId?: string;
  entityKind: 'location' | 'npc' | 'quest' | 'enemy' | 'image' | 'battleMap' | 'note' | 'custom';
  /** Omitted for plain 'note'/'custom' placements that aren't linked to anything. */
  entityId?: string;
  title: string;
  subtitle?: string;
  icon?: string;
  imageUrl?: string;
  /** Normalized 0..1 relative to the map image — never raw screen pixels. */
  position: { x: number; y: number };
  visibleInPlayerView?: boolean;
  status?: 'active' | 'hidden' | 'archived';
  dmNotes?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** Where the party currently is and where they've been. */
export interface PartyState {
  currentLocationStateId?: string;
  visitedLocationStateIds: string[];
  /** LocationState ids explicitly revealed to players (beyond normal "known" status). */
  knownLocationStateIds: string[];
  revealedLocationStateIds: string[];
  /**
   * The MapRoute the party most recently travelled via "Переместить партию по
   * маршруту" — pure metadata recording WHICH route was used, never itself a
   * source of geometry. The party marker's on-map position is still just
   * currentLocationStateId's hotspot; this id is only used to (a) re-highlight
   * the route on reload and (b) snap the marker to that route's matching
   * endpoint instead of the hotspot when the two might not be pixel-identical.
   * Cleared whenever the party moves directly (no route) or to a location
   * this route doesn't touch.
   */
  currentPartyRouteId?: string;
}

/** DM-controlled progress tracking, persisted to localStorage. */
export interface CampaignProgress {
  /** Quest status overrides keyed by quest id — defaults to the seed quest.status when absent. */
  questStatusOverrides: Record<string, QuestStatus>;
  /** Location status overrides keyed by LocationState id. */
  locationStatusOverrides: Record<string, LocationStatus>;
  /** Free-form DM notes keyed by LocationState id. */
  notesByLocationStateId: Record<string, string>;
}

/** Minimal placeholder entry describing a possible link to a battle-map-vtt map.
 * NOTE: there is no reliable existing mapping from battle-map-vtt filenames to
 * dm-companion location ids — see battle-maps-index.json. */
export interface BattleMapLink {
  id: string;
  locationId: string;
  /** Filename under battle-map-vtt/public/battle-maps/, for human reference only. */
  battleMapFileNameHint?: string;
  /** True until a human confirms this guess. */
  unconfirmed: boolean;
}

/** Confidence-tagged link between a LocationState and a dm-companion `images.json`
 * entry of type 'battle_map'. Derived from images.json's own linkedLocationIds
 * (exact) or from name/tag overlap heuristics (likely); otherwise manual_required. */
export interface BattleMapLocationLink {
  locationStateId: string;
  battleMapId: string;
  confidence: 'exact' | 'likely' | 'manual_required';
  reason: string;
  /** True once the DM has confirmed/added this link via the override layer
   * (manual or promoted-to-exact); rendered the same as 'exact' confidence. */
  manual?: boolean;
  /** True when the DM has rejected this pair — hides it permanently even if
   * buildBattleMapLocationLinks() re-derives it from images.json on reload. */
  rejected?: boolean;
}

/** The three explicit UI modes. Player View never shows edit controls. */
export type AppMode = 'dm-view' | 'dm-edit' | 'player-view';

/** Time Engine skeleton (Etap F) — no automation/triggers yet, just a manually
 * advanced clock per timeline so the DM has a shared reference for travel. */
export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night';

export interface CampaignCalendar {
  currentDay: number;
  currentMonth: string;
  currentYear: number;
  currentTimeOfDay: TimeOfDay;
}

/**
 * Event System MVP (types + minimal plumbing only — see
 * docs/CAMPAIGN_MAP_WORKSPACE_SPEC.md). Deliberately NO automation/trigger
 * engine here: a CampaignEvent is just a DM-authored record the UI can list
 * and link to other entities. Nothing ever auto-creates or auto-fires one.
 */
export type CampaignEventType =
  | 'battle'
  | 'quest_update'
  | 'npc_update'
  | 'discovery'
  | 'danger'
  | 'world_change'
  | 'note'
  | 'travel'
  | 'faction_shift'
  | 'custom';

export type CampaignEventStatus = 'planned' | 'active' | 'resolved' | 'cancelled' | 'hidden';

export interface CampaignEvent {
  id: string;
  timelineId: string;
  mapId?: string;
  mapLevel?: WorldMap['scope'];
  position?: { x: number; y: number };
  name: string;
  type: CampaignEventType;
  description?: string;
  date?: { day: number; month: string; year: number };
  timeOfDay?: TimeOfDay;
  linkedLocationStateIds?: string[];
  linkedNpcIds?: string[];
  linkedQuestIds?: string[];
  linkedEnemyIds?: string[];
  linkedRouteIds?: string[];
  /** Optional back-link to the BattleEntry that created/relates to this event
   * (Stage 5B). Added non-breaking, like every other addition in this
   * codebase: old persisted events without this field remain valid, and
   * nothing requires it to be set. Used by the Battle History section on
   * BattleEntryPanel to filter eventsById without inventing a new linking
   * mechanism (the Stage 5A consequences flow only ever linked back via
   * linkedLocationStateIds/linkedQuestIds/linkedNpcIds/linkedEnemyIds, none
   * of which reliably identify "this event is ABOUT this specific battle
   * entry" when an entry has no location/quest/npc/enemy links at all). */
  linkedBattleEntryIds?: string[];
  // TODO(stage-4c): a formal `linkedFactionZoneIds?: string[]` field could be
  // added here so faction_shift events reference their originating zone
  // directly instead of only reusing linkedLocationStateIds/linkedRouteIds —
  // deliberately not added in Stage 4B to avoid growing the shape under time
  // pressure; see the faction_shift event creation flow in MapWorkspacePage.tsx.
  visibleInPlayerView?: boolean;
  status: CampaignEventStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Delayed Trigger MVP (Stage 3) — a DM-authored "fire this later" stub layered
 * on top of CampaignEvent/CampaignCalendar. Like CampaignEvent, this is
 * deliberately NOT a rules/automation engine: evaluation (src/data/
 * triggerUtils.ts) only ever computes which triggers are PENDING for the DM
 * to review; nothing in the app auto-applies an effect without an explicit DM
 * click. `condition` is free-text DM-reference only — never parsed.
 */
export type TriggerType =
  | 'date'
  | 'time_after'
  | 'party_reaches_route_point'
  | 'party_completes_route'
  | 'quest_status'
  | 'manual';

export type TriggerStatus = 'armed' | 'triggered' | 'resolved' | 'cancelled';

export type TriggerEffectType =
  | 'create_event'
  | 'change_route_status'
  | 'change_location_status'
  | 'reveal_marker'
  | 'activate_battle_entry'
  | 'custom';

export interface DelayedTrigger {
  id: string;
  timelineId: string;
  mapId?: string;
  mapLevel?: WorldMap['scope'];
  name: string;
  description?: string;
  triggerType: TriggerType;
  date?: { day: number; month: string; year: number };
  timeOfDay?: TimeOfDay;
  delayDays?: number;
  routeId?: string;
  routePointIndex?: number;
  linkedLocationStateId?: string;
  linkedQuestId?: string;
  /** Free-form DM-reference text only — never parsed/evaluated by code. */
  condition?: string;
  effect: { type: TriggerEffectType; payload: Record<string, unknown> };
  /** Leans toward exclusion: triggers are DM planning tools, never shown to
   * players/Observer even when true (see playerSafeProjection.ts) unless a
   * future pass explicitly decides a specific surfaced effect is safe. */
  visibleInPlayerView?: boolean;
  status: TriggerStatus;
  createdAt: string;
  updatedAt: string;
}

/**
 * Faction Zone foundation (Stage 4A) — a DM-authored polygon region on a map
 * (territory control, contested ground, danger areas, patrol routes,
 * warfronts, etc). Deliberately NOT a simulation: `status` is set manually by
 * the DM via the side panel; nothing in the app ever advances/contests/
 * shrinks a zone automatically. See src/data/playerSafeProjection.ts for the
 * player-safe filtering rules and src/pages/MapWorkspacePage.tsx's Area Edit
 * Mode for the create/edit flow.
 *
 * TODO(stage-4b/war-sim): this is the natural plug-in point for automatic
 * faction AI / war simulation / battle-consequence automation that drives
 * `status` changes over time — explicitly out of scope for Stage 4A, where
 * `status` is always a manual DM choice.
 */
export type FactionZoneType =
  | 'control'
  | 'contested'
  | 'danger'
  | 'patrol'
  | 'warfront'
  | 'restricted'
  | 'magical'
  | 'custom';

export type FactionZoneStatus = 'stable' | 'contested' | 'expanding' | 'collapsing' | 'hidden';

export interface FactionZone {
  id: string;
  timelineId: string;
  mapId?: string;
  mapLevel?: WorldMap['scope'];
  name: string;
  /** Raw faction id reference — there is no `Faction` entity type in this
   * codebase yet, so this is never resolved against anything; the side panel
   * just displays the raw id (or lets the DM type a free label). */
  factionId?: string;
  type: FactionZoneType;
  /** Normalized 0..1 polygon vertices. A zone needs >=3 points to be
   * considered valid/saveable — enforced in the Area Edit Mode UI, not here. */
  polygon: Array<{ x: number; y: number }>;
  status: FactionZoneStatus;
  /** Leans toward exclusion like every other visibility flag in this
   * codebase: absent/false means "not visible to players", never "visible by
   * default". `status === 'hidden'` zones are excluded from player-safe
   * output regardless of this flag (see playerSafeProjection.ts). */
  visibleInPlayerView?: boolean;
  opacity?: number;
  color?: string;
  /** Public/DM-facing description — mirrors LocationState.publicDescription
   * semantics (this is the description a DM might still want hidden unless
   * explicitly marked player-safe via playerSafeDescription below). */
  description?: string;
  /** Optional player-facing rewrite of `description`; when present, the
   * player-safe projection prefers this over `description`. */
  playerSafeDescription?: string;
  /** Never included in player-safe/Observer output under any circumstance. */
  dmNotes?: string;
  linkedLocationStateIds?: string[];
  linkedRouteIds?: string[];
  linkedEventIds?: string[];
  createdAt: string;
  updatedAt: string;
}

/**
 * Dynamic Map Overlay skeleton (Stage 4A) — types + minimal store plumbing
 * only, no real renderer. A future stage can render these as full-canvas
 * tinted/animated layers (fog, night, fire, destruction, etc); this pass only
 * stores the data and exposes a placeholder DM-only list.
 *
 * TODO(stage-4b): real renderer + a runtime condition engine that can flip
 * `active` automatically (e.g. fog at night, fire after a battle event) —
 * explicitly out of scope for Stage 4A, where `active` is a manual DM toggle.
 */
export type MapOverlayType = 'fog' | 'night' | 'fire' | 'destruction' | 'magical' | 'faction_occupation' | 'custom';

export interface DynamicMapOverlay {
  id: string;
  timelineId: string;
  mapId?: string;
  mapLevel?: WorldMap['scope'];
  name: string;
  type: MapOverlayType;
  opacity: number;
  visibleInPlayerView?: boolean;
  active: boolean;
  description?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Movable Entity skeleton (Stage 4A) — types + store plumbing only, no map
 * rendering. Pure foundation for a future stage that would render/animate
 * NPCs, enemy groups, caravans, or armies moving on the map; this pass only
 * tracks the data so later work doesn't have to invent the shape under time
 * pressure.
 *
 * TODO(stage-4b): map rendering + movement animation + any
 * caravan/army/NPC-schedule simulation — explicitly out of scope for Stage
 * 4A. No automatic movement of any kind happens from this data alone.
 */
export type MovableEntityType =
  | 'npc'
  | 'enemy_group'
  | 'party'
  | 'caravan'
  | 'army'
  | 'custom'
  /** Stage 6C.4E — standalone map markers for existing Quest/Enemy/Image
   * library entries, reusing the same MovableEntity model/storage/rendering
   * pipeline as the NPC marker (Stage 6C.4B) rather than inventing a
   * parallel marker type. `entityId` points at the DmQuest/DmCustomEnemy/
   * DmImageItem id; the source record is never read-write here. Same
   * Player-Safe rule as every other MovableEntity: getPlayerSafeMovableEntities()
   * unconditionally returns [] (Stage 4C decision) — these markers are
   * DM-only by design. */
  | 'quest'
  | 'enemy'
  | 'image';
export type MovementState = 'stationary' | 'travelling' | 'hidden' | 'unknown';

export interface MovableEntity {
  id: string;
  entityType: MovableEntityType;
  entityId: string;
  timelineId: string;
  currentMapId?: string;
  mapLevel?: WorldMap['scope'];
  currentPosition?: { x: number; y: number };
  currentLocationStateId?: string;
  currentRouteId?: string;
  movementState: MovementState;
  visibleInPlayerView?: boolean;
  updatedAt: string;
}

/**
 * Battle Entry foundation (Stage 5A) — a DM-prepared encounter instance: WHERE
 * a battle scene is, WHY it's available, WHICH enemies/quests/NPCs are linked,
 * WHICH map variant to open, and (via the separate Battle Consequences Panel)
 * HOW to manually record what happened. This is deliberately NOT the VTT
 * battle itself (no grid/tokens/initiative/HP) — that lives entirely in the
 * separate battle-map-vtt project; this type only carries launch context and
 * DM planning metadata. Not to be confused with `BattleMapLink`/
 * `BattleMapLocationLink` above, which are about linking a LocationState to a
 * dm-companion `images.json` battle-map image entry — those are unrelated to
 * BattleEntry and are not duplicated here.
 *
 * Status semantics: 'hidden' NEVER appears in Player Safe/Observer output
 * regardless of `visibleInPlayerView` (belt-and-suspenders, same rule as
 * FactionZone.status==='hidden'). An entry can be 'prepared' without being
 * player-visible at all — `visibleInPlayerView` is the separate gate for
 * whether a safe preview is ever shown. Never hard-deleted; archiving an
 * entry sets status to 'hidden' (see campaignStore.tsx's archiveBattleEntry).
 */
export type BattleEntryStatus = 'prepared' | 'available' | 'active' | 'completed' | 'disabled' | 'hidden';
export type BattleSceneSize = 'standard_30x30' | 'medium_60x60' | 'large_120x120' | 'custom';
export type BattleMapVariantKind = 'day' | 'evening' | 'night' | 'rain' | 'destroyed' | 'custom';

export interface BattleMapVariantRef {
  id: string;
  kind: BattleMapVariantKind;
  name: string;
  battleMapId?: string;
  battleMapUrl?: string;
  imageId?: string;
  notes?: string;
}

export interface BattleEntry {
  id: string;
  timelineId: string;
  sourceMapId?: string;
  mapLevel?: WorldMap['scope'];
  sourceLocationStateId?: string;
  name: string;
  description?: string;
  /** Player-safe rewrite of `description`; preferred over the raw field in
   * getPlayerSafeBattleEntries(), mirroring the FactionZone
   * description/playerSafeDescription split. */
  playerSafeDescription?: string;
  /** Player-safe summary of HOW the battle concluded (Stage 5B) — the ONLY
   * summary text getPlayerSafeBattleEntries() ever returns for a completed
   * entry. Never the raw DM-authored consequences draft `summary` text;
   * mirrors the description/playerSafeDescription split above (and
   * FactionZone's identical pattern): the DM must explicitly opt a distinct,
   * deliberately-written safe text in, never have a DM-only field reused
   * verbatim for players by default. */
  playerSafeSummary?: string;
  position?: { x: number; y: number };
  battleMapId?: string;
  battleMapUrl?: string;
  sceneSize: BattleSceneSize;
  recommendedPartyLevel?: number;
  variants?: BattleMapVariantRef[];
  /** DM planning info — never partially or fully exposed to players/Observer. */
  linkedEnemyIds?: string[];
  linkedQuestIds?: string[];
  linkedNpcIds?: string[];
  /** DM planning info — never exposed to players/Observer. */
  encounterPresetIds?: string[];
  /** Stage 6C.4D — DM-chosen images.json id shown instead of the battle-map
   * thumbnail in cards/picker. Card-view-only override; never required. */
  previewImageId?: string;
  status: BattleEntryStatus;
  /** Leans toward exclusion like every other visibility flag in this codebase:
   * absent/false means "not visible to players", never "visible by default". */
  visibleInPlayerView?: boolean;
  /** Never included in player-safe/Observer output under any circumstance. */
  dmNotes?: string;
  createdAt: string;
  updatedAt: string;
}

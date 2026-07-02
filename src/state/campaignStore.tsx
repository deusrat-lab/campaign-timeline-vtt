import { createContext, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type {
  CampaignProgress,
  PartyState,
  QuestStatus,
  LocationStatus,
  Timeline,
  WorldMap,
  WorldMapState,
  LocationState,
  MapHotspot,
  MapRoute,
  TravelEvent,
  MapObjectPlacement,
  AppMode,
  BattleMapLocationLink,
  CampaignCalendar,
  TimeOfDay,
  CampaignEvent,
  DelayedTrigger,
  FactionZone,
  DynamicMapOverlay,
  MovableEntity,
  BattleEntry,
  Npc,
  PartyRouteProgress,
  ActiveBattleState,
  ActiveBattleCombatant,
} from '../types';
import { TIMELINES } from '../data/loadCampaignData';
import { ARC2_FACTION_ZONES_BY_ID, LEGACY_ARC2_SEEDED_FACTION_ZONE_IDS } from '../data/arc2FactionZones';
import projectOverlaySnapshot from '../data/campaignOverlaySnapshot.json';
import type { DmTavern, DmShop, DmImageItem, DmLocation, DmQuest, DmCustomEnemy, DmPlayer, DmEconomyReferenceItem } from '../types/dmCompanion';
import { DELETED, EMPTY_OVERLAY, DEFAULT_CALENDAR } from './overlay';
import type { CampaignOverlay, Patch } from './overlay';
import { createHttpOverlayAdapter, createLocalStorageOverlayAdapter, readLegacyOverlayRaw } from './persistence/overlayStorage';
import { captureTokenFromUrl, getStoredToken } from './persistence/authToken';
import { API_BASE_URL } from '../config';

const STORAGE_KEY = 'campaign-timeline-vtt:overlay:v2';
const OLD_STORAGE_KEY = 'campaign-timeline-vtt:state:v1';
// Every localStorage read/write for the overlay goes through this adapter —
// see src/state/persistence/overlayStorage.ts for why (swapping in a
// server-backed adapter later is then a one-line change here). Picks the
// HTTP adapter only when this deployment is actually configured for a
// backend (VITE_API_BASE_URL set, see .env.example) AND this browser
// already has a token (captured from a `?token=` link, see authToken.ts) —
// with neither set, behavior is byte-for-byte identical to before this
// adapter existed: plain localStorage, no network calls at all.
//
// captureTokenFromUrl() is called AGAIN here (main.tsx also calls it) — not
// redundant, it's the actual fix for a real bug this exact end-to-end test
// caught: ES module top-level code runs in import order, and an imported
// module's top-level statements ALWAYS run before the importing module's
// own top-level code, regardless of where the import appears textually. So
// main.tsx's call landed AFTER this file's own top-level adapter selection
// had already run (main.tsx imports App.tsx imports ... imports this file),
// meaning a token freshly captured from `?token=...` was never seen on that
// same page load — first visit silently fell back to localStorage-only, and
// only a manual reload (now finding the token main.tsx had stored a moment
// too late) would pick up the HTTP adapter. captureTokenFromUrl() is
// idempotent (a no-op once the URL's `?token=` is already stripped), so
// calling it here too costs nothing and removes the ordering dependency
// entirely.
captureTokenFromUrl();
const overlayStorage = (() => {
  const token = API_BASE_URL ? getStoredToken() : null;
  if (API_BASE_URL && token) {
    return createHttpOverlayAdapter({ baseUrl: API_BASE_URL, token, cacheKey: STORAGE_KEY });
  }
  return createLocalStorageOverlayAdapter(STORAGE_KEY);
})();

// Bumped because the old auto-generated default route polylines were deleted
// entirely in favor of a fully manual route builder. Any locally-stored route
// edit/patch/creation made against the old route seed is now meaningless (it
// may reference route ids that no longer exist, or carry over old "Путь не
// размечен" straight-line points), so it's wiped on load — see the migration
// in loadPersisted() below. Nothing else in the overlay is touched.
const ROUTE_EDITOR_VERSION = 2;

// Bumped for Stage 6A — Canon Map Rebuild & Clean Slate. The three active
// maps were replaced with new background art (Kingdom of Aurelon / Greyholm
// Region / Greyholm City) that has a completely different layout from the
// old seed art, so every locally-stored map-position record made against the
// old art is meaningless: hotspots, routes, object placements (including
// Quick Pins, which are just placements with entityKind 'note'), faction
// zones, dynamic map overlays, movable entities, and the party's
// current-location/route-progress metadata. See
// docs/CAMPAIGN_MAP_WORKSPACE_CANON_MAP_REBUILD_SPEC.md. Library data with no
// map-position concept at all (npcs/quests/enemies/images/lore, events,
// triggers, battle entries, calendars) is untouched — see
// clearCanonMapOverlayState() below for the exact field list.
const CANON_MAP_VERSION = 1;

function defaultOverlay(): CampaignOverlay {
  return {
    ...EMPTY_OVERLAY,
    party: { currentMapPosition: undefined, visitedLocationStateIds: [], knownLocationStateIds: [], revealedLocationStateIds: [] },
    progress: { questStatusOverrides: {}, locationStatusOverrides: {}, notesByLocationStateId: {} },
    currentTimelineId: TIMELINES.find((t) => t.isDefault)?.id ?? TIMELINES[0].id,
    mode: 'dm-view',
    routeEditorVersion: ROUTE_EDITOR_VERSION,
    canonMapVersion: CANON_MAP_VERSION,
    factionZonesById: { ...ARC2_FACTION_ZONES_BY_ID },
  };
}

/** Wipes only route-related overlay state; never touches placements, hotspots,
 * party, progress, notes, revealed/hidden state, or battle-map confirmations. */
function clearRouteOverlayState(overlay: CampaignOverlay): CampaignOverlay {
  return {
    ...overlay,
    routePatches: {},
    newRoutes: [],
    routeEditorVersion: ROUTE_EDITOR_VERSION,
  };
}

/**
 * Stage 6A clean-slate migration. Wipes every overlay field that records a
 * position/placement against the now-replaced map art, and resets the
 * party's current map position (not its location-knowledge metadata).
 * Deliberately does NOT touch: locationStatePatches/newLocationStates
 * (locations themselves are lore, not map geometry — the DM may still want
 * a LocationState to exist even before re-placing its hotspot),
 * progress/revealed/known/visited ids, calendars, events, triggers, battle
 * entries, or any seed/library entity (npcs/quests/enemies/images have no
 * overlay state at all to begin with).
 */
function clearCanonMapOverlayState(overlay: CampaignOverlay): CampaignOverlay {
  return {
    ...overlay,
    hotspotPatches: {},
    newHotspots: [],
    routePatches: {},
    newRoutes: [],
    placementPatches: {},
    newPlacements: [],
    factionZonesById: { ...ARC2_FACTION_ZONES_BY_ID },
    dynamicMapOverlaysById: {},
    movableEntitiesById: {},
    party: {
      ...overlay.party,
      currentLocationStateId: undefined,
      currentPartyRouteId: undefined,
      currentMapPosition: undefined,
    },
    partyRouteProgress: null,
    canonMapVersion: CANON_MAP_VERSION,
  };
}

/**
 * A hotspot that already has a local x/y position patch was, by definition,
 * moved by the DM (drag) or already had its position locally overridden.
 * Auto-confirm those on load, so a position the DM already set by hand never
 * keeps showing the "позиция не подтверждена" warning just because the patch
 * predates the auto-confirm-on-drag fix. Never touches hotspots with no
 * position patch at all (those genuinely still need a first manual placement).
 */
function autoConfirmManuallyPositionedHotspots(overlay: CampaignOverlay): CampaignOverlay {
  let changed = false;
  const nextPatches: typeof overlay.hotspotPatches = {};
  for (const [id, patch] of Object.entries(overlay.hotspotPatches)) {
    if (patch === DELETED || (patch.x === undefined && patch.y === undefined) || patch.needsCoordinateReview === false) {
      nextPatches[id] = patch;
      continue;
    }
    nextPatches[id] = { ...patch, needsCoordinateReview: false };
    changed = true;
  }
  return changed ? { ...overlay, hotspotPatches: nextPatches } : overlay;
}

function removeLegacyArc2SeededFactionZones(zones: Record<string, FactionZone> | undefined): Record<string, FactionZone> {
  const next = { ...(zones ?? {}) };
  for (const id of LEGACY_ARC2_SEEDED_FACTION_ZONE_IDS) {
    delete next[id];
  }
  return next;
}

function normalizeOverlay(input?: Partial<CampaignOverlay> | null): CampaignOverlay {
  const raw = input ?? {};
  let merged: CampaignOverlay = {
    ...defaultOverlay(),
    ...raw,
    calendarsByTimelineId: raw.calendarsByTimelineId ?? {},
    eventsById: raw.eventsById ?? {},
    triggersById: raw.triggersById ?? {},
    factionZonesById: {
      ...defaultOverlay().factionZonesById,
      ...removeLegacyArc2SeededFactionZones(raw.factionZonesById),
    },
    dynamicMapOverlaysById: raw.dynamicMapOverlaysById ?? {},
    movableEntitiesById: raw.movableEntitiesById ?? {},
    battleEntriesById: raw.battleEntriesById ?? {},
    partyRouteProgress: raw.partyRouteProgress ?? null,
    activeBattle: raw.activeBattle ?? null,
    newEnemies: raw.newEnemies ?? [],
    party: { ...defaultOverlay().party, ...raw.party },
    progress: { ...defaultOverlay().progress, ...raw.progress },
    battleMapLocationLinkOverrides: raw.battleMapLocationLinkOverrides ?? {},
    battleMapVttUrlOverrides: raw.battleMapVttUrlOverrides ?? {},
  };
  if (!raw.routeEditorVersion || raw.routeEditorVersion < ROUTE_EDITOR_VERSION) {
    merged = clearRouteOverlayState(merged);
  }
  if (!raw.canonMapVersion || raw.canonMapVersion < CANON_MAP_VERSION) {
    merged = clearCanonMapOverlayState(merged);
  }
  merged = {
    ...merged,
    factionZonesById: removeLegacyArc2SeededFactionZones(merged.factionZonesById),
  };
  return autoConfirmManuallyPositionedHotspots(merged);
}

function loadProjectSnapshot(): CampaignOverlay {
  return normalizeOverlay(projectOverlaySnapshot as Partial<CampaignOverlay>);
}

function loadPersisted(): CampaignOverlay {
  try {
    const raw = overlayStorage.load();
    if (raw) {
      return normalizeOverlay(JSON.parse(raw) as Partial<CampaignOverlay>);
    }
    // Migrate the old v1 single-state shape if present, then drop it.
    const oldRaw = readLegacyOverlayRaw(OLD_STORAGE_KEY);
    if (oldRaw) {
      const old = JSON.parse(oldRaw);
      const migrated: CampaignOverlay = {
        ...defaultOverlay(),
        party: {
          ...defaultOverlay().party,
          ...old.party,
        },
        progress: old.progress ?? defaultOverlay().progress,
        currentTimelineId: old.currentTimelineId ?? defaultOverlay().currentTimelineId,
        mode: old.isDmView === false ? 'player-view' : 'dm-view',
      };
      return normalizeOverlay(migrated);
    }
    return loadProjectSnapshot();
  } catch {
    return loadProjectSnapshot();
  }
}

type EntityKind =
  | 'timeline'
  | 'worldMap'
  | 'worldMapState'
  | 'locationState'
  | 'hotspot'
  | 'route'
  | 'travelEvent'
  | 'placement'
  | 'npc'
  | 'tavern'
  | 'shop'
  | 'image'
  | 'quest'
  | 'enemy'
  | 'player'
  | 'economyReference'
  | 'location';

type Action =
  | { type: 'SET_CURRENT_LOCATION'; locationStateId: string; routeId?: string }
  | { type: 'MARK_VISITED'; locationStateId: string }
  | { type: 'SET_KNOWN'; locationStateId: string }
  | { type: 'SET_REVEALED'; locationStateId: string }
  | { type: 'UNSET_REVEALED'; locationStateId: string }
  | { type: 'SET_LOCATION_STATUS'; locationStateId: string; status: LocationStatus }
  | { type: 'SET_QUEST_STATUS'; questId: string; status: QuestStatus }
  | { type: 'SET_LOCATION_NOTE'; locationStateId: string; note: string }
  | { type: 'SET_TIMELINE'; timelineId: string }
  | { type: 'SET_MODE'; mode: AppMode }
  | { type: 'SET_ARC2_REVEALED'; revealed: boolean }
  | { type: 'PATCH_ENTITY'; kind: EntityKind; id: string; patch: Patch<unknown> }
  | { type: 'RESET_PATCH'; kind: EntityKind; id: string }
  | { type: 'ADD_TIMELINE'; timeline: Timeline }
  | { type: 'ADD_WORLD_MAP'; map: WorldMap }
  | { type: 'ADD_WORLD_MAP_STATE'; state: WorldMapState }
  | { type: 'ADD_LOCATION_STATE'; state: LocationState }
  | { type: 'ADD_HOTSPOT'; hotspot: MapHotspot }
  | { type: 'ADD_ROUTE'; route: MapRoute }
  | { type: 'ADD_TRAVEL_EVENT'; event: TravelEvent }
  | { type: 'ADD_PLACEMENT'; placement: MapObjectPlacement }
  | { type: 'ADD_NPC'; npc: Npc }
  | { type: 'ADD_IMAGE'; image: DmImageItem }
  | { type: 'ADD_ENEMY'; enemy: DmCustomEnemy }
  | { type: 'SET_BATTLE_MAP_LINK'; link: BattleMapLocationLink }
  | { type: 'SET_BATTLE_MAP_VTT_URL'; battleMapId: string; url: string }
  | { type: 'START_ACTIVE_BATTLE'; battle: ActiveBattleState }
  | { type: 'UPDATE_ACTIVE_BATTLE'; patch: Partial<ActiveBattleState> }
  | { type: 'UPDATE_ACTIVE_BATTLE_COMBATANT'; combatantId: string; patch: Partial<ActiveBattleCombatant> }
  | { type: 'ADD_ACTIVE_BATTLE_COMBATANT'; combatant: ActiveBattleCombatant }
  | { type: 'END_ACTIVE_BATTLE' }
  | { type: 'SET_PLACEMENT_LAYER_VISIBLE'; visible: boolean }
  | { type: 'SET_CALENDAR'; timelineId: string; calendar: CampaignCalendar }
  | { type: 'ADVANCE_TIME_PHASE'; timelineId: string }
  | { type: 'ADVANCE_DAY'; timelineId: string }
  | { type: 'ADD_CAMPAIGN_EVENT'; event: CampaignEvent }
  | { type: 'UPDATE_CAMPAIGN_EVENT'; eventId: string; patch: Partial<CampaignEvent> }
  | { type: 'ARCHIVE_CAMPAIGN_EVENT'; eventId: string }
  | { type: 'ADD_DELAYED_TRIGGER'; trigger: DelayedTrigger }
  | { type: 'UPDATE_DELAYED_TRIGGER'; triggerId: string; patch: Partial<DelayedTrigger> }
  | { type: 'ARCHIVE_DELAYED_TRIGGER'; triggerId: string }
  | { type: 'RESOLVE_DELAYED_TRIGGER'; triggerId: string }
  | { type: 'MARK_DELAYED_TRIGGER_TRIGGERED'; triggerId: string }
  | { type: 'ADD_FACTION_ZONE'; zone: FactionZone }
  | { type: 'UPDATE_FACTION_ZONE'; zoneId: string; patch: Partial<FactionZone> }
  | { type: 'ARCHIVE_FACTION_ZONE'; zoneId: string }
  | { type: 'UPSERT_MOVABLE_ENTITY'; entity: MovableEntity }
  | { type: 'UPDATE_MOVABLE_ENTITY'; entityId: string; patch: Partial<MovableEntity> }
  | { type: 'ARCHIVE_MOVABLE_ENTITY'; entityId: string }
  | { type: 'REMOVE_MOVABLE_ENTITY'; entityId: string }
  | { type: 'ADD_DYNAMIC_MAP_OVERLAY'; overlay: DynamicMapOverlay }
  | { type: 'UPDATE_DYNAMIC_MAP_OVERLAY'; overlayId: string; patch: Partial<DynamicMapOverlay> }
  | { type: 'ARCHIVE_DYNAMIC_MAP_OVERLAY'; overlayId: string }
  | { type: 'ADD_BATTLE_ENTRY'; entry: BattleEntry }
  | { type: 'UPDATE_BATTLE_ENTRY'; entryId: string; patch: Partial<BattleEntry> }
  | { type: 'ARCHIVE_BATTLE_ENTRY'; entryId: string }
  | { type: 'MARK_BATTLE_ENTRY_ACTIVE'; entryId: string }
  | { type: 'MARK_BATTLE_ENTRY_COMPLETED'; entryId: string }
  | { type: 'SET_PARTY_MAP_POSITION'; position: NonNullable<PartyState['currentMapPosition']> }
  | { type: 'SET_PARTY_ROUTE_PROGRESS'; progress: PartyRouteProgress | null }
  | { type: 'IMPORT_OVERLAY'; overlay: CampaignOverlay }
  | { type: 'RESET' };

const TIME_OF_DAY_ORDER: TimeOfDay[] = ['morning', 'noon', 'evening', 'night'];

function getCalendarOrDefault(state: CampaignOverlay, timelineId: string): CampaignCalendar {
  return state.calendarsByTimelineId[timelineId] ?? DEFAULT_CALENDAR;
}

function patchesKey(kind: EntityKind): keyof CampaignOverlay {
  switch (kind) {
    case 'timeline':
      return 'timelinePatches';
    case 'worldMap':
      return 'worldMapPatches';
    case 'worldMapState':
      return 'worldMapStatePatches';
    case 'locationState':
      return 'locationStatePatches';
    case 'hotspot':
      return 'hotspotPatches';
    case 'route':
      return 'routePatches';
    case 'travelEvent':
      return 'travelEventPatches';
    case 'placement':
      return 'placementPatches';
    case 'npc':
      return 'npcPatches';
    case 'tavern':
      return 'tavernPatches';
    case 'shop':
      return 'shopPatches';
    case 'image':
      return 'imagePatches';
    case 'quest':
      return 'questPatches';
    case 'enemy':
      return 'enemyPatches';
    case 'player':
      return 'playerPatches';
    case 'economyReference':
      return 'economyReferencePatches';
    case 'location':
      return 'locationPatches';
  }
}

function reducer(state: CampaignOverlay, action: Action): CampaignOverlay {
  switch (action.type) {
    case 'SET_CURRENT_LOCATION':
      // routeId metadata only — never geometry. Always explicitly set (even to
      // undefined) so a direct move always clears any stale route-followed flag
      // rather than leaving a previous trip's route looking "current" forever.
      return {
        ...state,
        party: {
          ...state.party,
          currentLocationStateId: action.locationStateId,
          currentPartyRouteId: action.routeId,
          currentMapPosition: undefined,
        },
        partyRouteProgress: null,
      };
    case 'MARK_VISITED': {
      const already = state.party.visitedLocationStateIds.includes(action.locationStateId);
      return {
        ...state,
        party: {
          ...state.party,
          visitedLocationStateIds: already
            ? state.party.visitedLocationStateIds
            : [...state.party.visitedLocationStateIds, action.locationStateId],
        },
      };
    }
    case 'SET_KNOWN': {
      const already = state.party.knownLocationStateIds.includes(action.locationStateId);
      return {
        ...state,
        party: {
          ...state.party,
          knownLocationStateIds: already
            ? state.party.knownLocationStateIds
            : [...state.party.knownLocationStateIds, action.locationStateId],
        },
      };
    }
    case 'SET_REVEALED': {
      const already = state.party.revealedLocationStateIds.includes(action.locationStateId);
      return {
        ...state,
        party: {
          ...state.party,
          revealedLocationStateIds: already
            ? state.party.revealedLocationStateIds
            : [...state.party.revealedLocationStateIds, action.locationStateId],
        },
      };
    }
    case 'UNSET_REVEALED': {
      return {
        ...state,
        party: {
          ...state.party,
          revealedLocationStateIds: state.party.revealedLocationStateIds.filter(
            (id) => id !== action.locationStateId,
          ),
        },
      };
    }
    case 'SET_LOCATION_STATUS':
      return {
        ...state,
        progress: {
          ...state.progress,
          locationStatusOverrides: {
            ...state.progress.locationStatusOverrides,
            [action.locationStateId]: action.status,
          },
        },
      };
    case 'SET_QUEST_STATUS':
      return {
        ...state,
        progress: {
          ...state.progress,
          questStatusOverrides: {
            ...state.progress.questStatusOverrides,
            [action.questId]: action.status,
          },
        },
      };
    case 'SET_LOCATION_NOTE':
      return {
        ...state,
        progress: {
          ...state.progress,
          notesByLocationStateId: {
            ...state.progress.notesByLocationStateId,
            [action.locationStateId]: action.note,
          },
        },
      };
    case 'SET_TIMELINE': {
      const allTimelines = [...TIMELINES, ...state.newTimelines];
      const timeline = allTimelines.find((t) => t.id === action.timelineId);
      const patch = state.timelinePatches[action.timelineId];
      const effectiveVisible =
        patch && patch !== DELETED ? (patch.visibleToPlayers ?? timeline?.visibleToPlayers) : timeline?.visibleToPlayers;
      if (timeline?.arcId === 'arc-2' && state.mode === 'player-view' && !effectiveVisible) {
        // Player View may not switch into Arc 2 unless explicitly made visible.
        return state;
      }
      return { ...state, currentTimelineId: action.timelineId };
    }
    case 'SET_MODE':
      return { ...state, mode: action.mode };
    case 'SET_ARC2_REVEALED': {
      const arc2 = TIMELINES.find((t) => t.arcId === 'arc-2');
      if (!arc2) return state;
      return {
        ...state,
        timelinePatches: { ...state.timelinePatches, [arc2.id]: { visibleToPlayers: action.revealed } },
      };
    }
    case 'PATCH_ENTITY': {
      // Stage 6B.2 fix: a real, reload-visible bug — patches used to be
      // stored as "last write wins" per id (the new partial patch silently
      // REPLACED the entire previously-stored patch object, discarding any
      // earlier-patched field not mentioned in the new call). Any call site
      // that patches a subset of fields (e.g. "Создать NPC здесь" patching
      // only npcIds) would erase unrelated fields a DM had set moments
      // earlier in a separate save (e.g. playerSafeDescription/
      // tavernDetails/shopDetails) — found live while smoke-testing the
      // tavern/shop edit flow. Patches must accumulate (shallow-merge) per
      // id instead, exactly like applyOverlayToList already merges the
      // accumulated patch onto the base entity. DELETED always wins in
      // either direction — deleting a patched entity must stay deleted, and
      // patching a deleted entity id (not expected in normal UI flow, but
      // kept safe) just starts a fresh patch rather than spreading the
      // DELETED sentinel string.
      const key = patchesKey(action.kind);
      const existing = state[key] as Record<string, Patch<unknown>>;
      const prevPatch = existing[action.id];
      const mergedPatch: Patch<unknown> =
        action.patch === DELETED || prevPatch === undefined || prevPatch === DELETED
          ? action.patch
          : { ...(prevPatch as object), ...(action.patch as object) };
      return { ...state, [key]: { ...existing, [action.id]: mergedPatch } };
    }
    case 'RESET_PATCH': {
      // Stage 6C.4D — removes the patch entry entirely (unlike PATCH_ENTITY's
      // DELETED sentinel, which marks the entity itself as gone). The source
      // entity, any placement marker, and any relationship links are never
      // touched — only the override layer's own record for this id.
      const key = patchesKey(action.kind);
      const existing = state[key] as Record<string, Patch<unknown>>;
      if (!(action.id in existing)) return state;
      const next = { ...existing };
      delete next[action.id];
      return { ...state, [key]: next };
    }
    case 'ADD_TIMELINE':
      return { ...state, newTimelines: [...state.newTimelines, action.timeline] };
    case 'ADD_WORLD_MAP':
      return { ...state, newWorldMaps: [...state.newWorldMaps, action.map] };
    case 'ADD_WORLD_MAP_STATE':
      return { ...state, newWorldMapStates: [...state.newWorldMapStates, action.state] };
    case 'ADD_LOCATION_STATE':
      return { ...state, newLocationStates: [...state.newLocationStates, action.state] };
    case 'ADD_HOTSPOT':
      return { ...state, newHotspots: [...state.newHotspots, action.hotspot] };
    case 'ADD_ROUTE':
      return { ...state, newRoutes: [...state.newRoutes, action.route] };
    case 'ADD_TRAVEL_EVENT':
      return { ...state, newTravelEvents: [...state.newTravelEvents, action.event] };
    case 'ADD_PLACEMENT':
      return { ...state, newPlacements: [...state.newPlacements, action.placement] };
    case 'ADD_NPC':
      return { ...state, newNpcs: [...state.newNpcs, action.npc] };
    case 'ADD_IMAGE':
      return { ...state, newImages: [...state.newImages, action.image] };
    case 'ADD_ENEMY':
      return { ...state, newEnemies: [...state.newEnemies, action.enemy] };
    case 'SET_PLACEMENT_LAYER_VISIBLE':
      return { ...state, placementLayerVisible: action.visible };
    case 'SET_CALENDAR':
      return {
        ...state,
        calendarsByTimelineId: { ...state.calendarsByTimelineId, [action.timelineId]: action.calendar },
      };
    case 'ADVANCE_TIME_PHASE': {
      const current = getCalendarOrDefault(state, action.timelineId);
      const idx = TIME_OF_DAY_ORDER.indexOf(current.currentTimeOfDay);
      const isNewDay = idx === TIME_OF_DAY_ORDER.length - 1;
      const next: CampaignCalendar = isNewDay
        ? { ...current, currentDay: current.currentDay + 1, currentTimeOfDay: TIME_OF_DAY_ORDER[0] }
        : { ...current, currentTimeOfDay: TIME_OF_DAY_ORDER[idx + 1] };
      return {
        ...state,
        calendarsByTimelineId: { ...state.calendarsByTimelineId, [action.timelineId]: next },
      };
    }
    case 'ADVANCE_DAY': {
      const current = getCalendarOrDefault(state, action.timelineId);
      const next: CampaignCalendar = { ...current, currentDay: current.currentDay + 1 };
      return {
        ...state,
        calendarsByTimelineId: { ...state.calendarsByTimelineId, [action.timelineId]: next },
      };
    }
    case 'ADD_CAMPAIGN_EVENT':
      return { ...state, eventsById: { ...state.eventsById, [action.event.id]: action.event } };
    case 'UPDATE_CAMPAIGN_EVENT': {
      const existing = state.eventsById[action.eventId];
      if (!existing) return state;
      return {
        ...state,
        eventsById: {
          ...state.eventsById,
          [action.eventId]: { ...existing, ...action.patch, updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ARCHIVE_CAMPAIGN_EVENT': {
      const existing = state.eventsById[action.eventId];
      if (!existing) return state;
      // Archive = mark cancelled, never hard-delete — same philosophy as
      // placement "archived" status elsewhere in the overlay.
      return {
        ...state,
        eventsById: {
          ...state.eventsById,
          [action.eventId]: { ...existing, status: 'cancelled', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ADD_DELAYED_TRIGGER':
      return { ...state, triggersById: { ...state.triggersById, [action.trigger.id]: action.trigger } };
    case 'UPDATE_DELAYED_TRIGGER': {
      const existing = state.triggersById[action.triggerId];
      if (!existing) return state;
      return {
        ...state,
        triggersById: {
          ...state.triggersById,
          [action.triggerId]: { ...existing, ...action.patch, updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ARCHIVE_DELAYED_TRIGGER': {
      const existing = state.triggersById[action.triggerId];
      if (!existing) return state;
      // Archive = mark cancelled, never hard-delete — same philosophy as
      // CampaignEvent archiving above.
      return {
        ...state,
        triggersById: {
          ...state.triggersById,
          [action.triggerId]: { ...existing, status: 'cancelled', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'RESOLVE_DELAYED_TRIGGER': {
      const existing = state.triggersById[action.triggerId];
      if (!existing) return state;
      return {
        ...state,
        triggersById: {
          ...state.triggersById,
          [action.triggerId]: { ...existing, status: 'resolved', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'MARK_DELAYED_TRIGGER_TRIGGERED': {
      const existing = state.triggersById[action.triggerId];
      if (!existing) return state;
      return {
        ...state,
        triggersById: {
          ...state.triggersById,
          [action.triggerId]: { ...existing, status: 'triggered', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ADD_FACTION_ZONE':
      return { ...state, factionZonesById: { ...state.factionZonesById, [action.zone.id]: action.zone } };
    case 'UPDATE_FACTION_ZONE': {
      const existing = state.factionZonesById[action.zoneId];
      if (!existing) return state;
      return {
        ...state,
        factionZonesById: {
          ...state.factionZonesById,
          [action.zoneId]: { ...existing, ...action.patch, updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ARCHIVE_FACTION_ZONE': {
      const existing = state.factionZonesById[action.zoneId];
      if (!existing) return state;
      // Archive = mark hidden, never hard-delete — same philosophy as
      // CampaignEvent/DelayedTrigger archiving above. 'hidden' status is
      // DM-only and excluded from player-safe output regardless of
      // visibleInPlayerView (see playerSafeProjection.ts).
      return {
        ...state,
        factionZonesById: {
          ...state.factionZonesById,
          [action.zoneId]: { ...existing, status: 'hidden', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'UPSERT_MOVABLE_ENTITY':
      return { ...state, movableEntitiesById: { ...state.movableEntitiesById, [action.entity.id]: action.entity } };
    case 'UPDATE_MOVABLE_ENTITY': {
      const existing = state.movableEntitiesById[action.entityId];
      if (!existing) return state;
      return {
        ...state,
        movableEntitiesById: {
          ...state.movableEntitiesById,
          [action.entityId]: { ...existing, ...action.patch, updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ARCHIVE_MOVABLE_ENTITY': {
      const existing = state.movableEntitiesById[action.entityId];
      if (!existing) return state;
      // No hard-delete convention for this entity either — archive flips
      // movementState to 'hidden', same soft-delete philosophy as the rest of
      // the flat-map (eventsById-style) entities in this overlay.
      return {
        ...state,
        movableEntitiesById: {
          ...state.movableEntitiesById,
          [action.entityId]: { ...existing, movementState: 'hidden', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'REMOVE_MOVABLE_ENTITY': {
      // Stage 6C.4E — unlike ARCHIVE_MOVABLE_ENTITY above (soft-hide, used
      // for NPC markers where "one person, never delete the marker" holds),
      // Quest/Enemy/Image markers are disposable per-map annotations over a
      // library entity — "remove marker from current map" means actually
      // removing the marker record. The source DmQuest/DmCustomEnemy/
      // DmImageItem entity is never touched; only this overlay-only marker
      // record is deleted.
      if (!(action.entityId in state.movableEntitiesById)) return state;
      const next = { ...state.movableEntitiesById };
      delete next[action.entityId];
      return { ...state, movableEntitiesById: next };
    }
    case 'ADD_DYNAMIC_MAP_OVERLAY':
      return { ...state, dynamicMapOverlaysById: { ...state.dynamicMapOverlaysById, [action.overlay.id]: action.overlay } };
    case 'UPDATE_DYNAMIC_MAP_OVERLAY': {
      const existing = state.dynamicMapOverlaysById[action.overlayId];
      if (!existing) return state;
      return {
        ...state,
        dynamicMapOverlaysById: {
          ...state.dynamicMapOverlaysById,
          [action.overlayId]: { ...existing, ...action.patch, updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ARCHIVE_DYNAMIC_MAP_OVERLAY': {
      const existing = state.dynamicMapOverlaysById[action.overlayId];
      if (!existing) return state;
      // Archive = mark inactive, never hard-delete.
      return {
        ...state,
        dynamicMapOverlaysById: {
          ...state.dynamicMapOverlaysById,
          [action.overlayId]: { ...existing, active: false, updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ADD_BATTLE_ENTRY':
      return { ...state, battleEntriesById: { ...state.battleEntriesById, [action.entry.id]: action.entry } };
    case 'UPDATE_BATTLE_ENTRY': {
      const existing = state.battleEntriesById[action.entryId];
      if (!existing) return state;
      return {
        ...state,
        battleEntriesById: {
          ...state.battleEntriesById,
          [action.entryId]: { ...existing, ...action.patch, updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'ARCHIVE_BATTLE_ENTRY': {
      const existing = state.battleEntriesById[action.entryId];
      if (!existing) return state;
      // Archive = mark hidden, never hard-delete — same philosophy as
      // FactionZone/CampaignEvent archiving above. 'hidden' status is DM-only
      // and excluded from player-safe output regardless of visibleInPlayerView
      // (see playerSafeProjection.ts).
      return {
        ...state,
        battleEntriesById: {
          ...state.battleEntriesById,
          [action.entryId]: { ...existing, status: 'hidden', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'MARK_BATTLE_ENTRY_ACTIVE': {
      const existing = state.battleEntriesById[action.entryId];
      if (!existing) return state;
      return {
        ...state,
        battleEntriesById: {
          ...state.battleEntriesById,
          [action.entryId]: { ...existing, status: 'active', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'MARK_BATTLE_ENTRY_COMPLETED': {
      const existing = state.battleEntriesById[action.entryId];
      if (!existing) return state;
      return {
        ...state,
        battleEntriesById: {
          ...state.battleEntriesById,
          [action.entryId]: { ...existing, status: 'completed', updatedAt: new Date().toISOString() },
        },
      };
    }
    case 'SET_BATTLE_MAP_LINK':
      return {
        ...state,
        battleMapLocationLinkOverrides: {
          ...state.battleMapLocationLinkOverrides,
          [`${action.link.locationStateId}__${action.link.battleMapId}`]: action.link,
        },
      };
    case 'SET_BATTLE_MAP_VTT_URL':
      return {
        ...state,
        battleMapVttUrlOverrides: {
          ...state.battleMapVttUrlOverrides,
          [action.battleMapId]: action.url,
        },
      };
    case 'START_ACTIVE_BATTLE':
      return { ...state, activeBattle: action.battle };
    case 'UPDATE_ACTIVE_BATTLE':
      return state.activeBattle
        ? { ...state, activeBattle: { ...state.activeBattle, ...action.patch } }
        : state;
    case 'UPDATE_ACTIVE_BATTLE_COMBATANT':
      return state.activeBattle
        ? {
            ...state,
            activeBattle: {
              ...state.activeBattle,
              combatants: state.activeBattle.combatants.map((combatant) =>
                combatant.id === action.combatantId ? { ...combatant, ...action.patch } : combatant,
              ),
            },
          }
        : state;
    case 'ADD_ACTIVE_BATTLE_COMBATANT':
      return state.activeBattle
        ? {
            ...state,
            activeBattle: {
              ...state.activeBattle,
              combatants: [...state.activeBattle.combatants, action.combatant],
            },
          }
        : state;
    case 'END_ACTIVE_BATTLE':
      return { ...state, activeBattle: null };
    case 'SET_PARTY_ROUTE_PROGRESS':
      return {
        ...state,
        party: action.progress ? { ...state.party, currentMapPosition: undefined } : state.party,
        partyRouteProgress: action.progress,
      };
    case 'SET_PARTY_MAP_POSITION':
      return {
        ...state,
        party: {
          ...state.party,
          currentLocationStateId: undefined,
          currentPartyRouteId: undefined,
          currentMapPosition: action.position,
        },
        partyRouteProgress: null,
      };
    case 'IMPORT_OVERLAY':
      // Defensive merge: an imported overlay JSON file may predate any field
      // added since it was exported (calendars, events, route hardening
      // fields, etc.). Spreading defaultOverlay() first guarantees every
      // newer top-level key exists, then the imported overlay overrides
      // whatever it actually has — so old exports never crash a reader that
      // assumes a field is always present (e.g. calendarsByTimelineId[id]).
      return { ...normalizeOverlay(action.overlay), mode: state.mode };
    case 'RESET':
      return loadProjectSnapshot();
    default:
      return state;
  }
}

interface CampaignStoreValue extends CampaignOverlay {
  isDmView: boolean;
  arc2RevealedToPlayers: boolean;
  /** 'idle' between saves, briefly 'saved' after every overlay mutation, 'error' if localStorage write threw. */
  saveStatus: 'idle' | 'saved' | 'error';
  /** routeId: pass the MapRoute id the party travelled via, or omit/undefined for a direct move. */
  setCurrentLocation: (locationStateId: string, routeId?: string) => void;
  markVisited: (locationStateId: string) => void;
  setKnown: (locationStateId: string) => void;
  setRevealed: (locationStateId: string) => void;
  unsetRevealed: (locationStateId: string) => void;
  setLocationStatus: (locationStateId: string, status: LocationStatus) => void;
  setQuestStatus: (questId: string, status: QuestStatus) => void;
  setLocationNote: (locationStateId: string, note: string) => void;
  setTimeline: (timelineId: string) => void;
  setMode: (mode: AppMode) => void;
  toggleDmView: () => void;
  setArc2Revealed: (revealed: boolean) => void;
  patchTimeline: (id: string, patch: Patch<Timeline>) => void;
  patchWorldMap: (id: string, patch: Patch<WorldMap>) => void;
  patchWorldMapState: (id: string, patch: Patch<WorldMapState>) => void;
  patchLocationState: (id: string, patch: Patch<LocationState>) => void;
  patchHotspot: (id: string, patch: Patch<MapHotspot>) => void;
  patchRoute: (id: string, patch: Patch<MapRoute>) => void;
  patchTravelEvent: (id: string, patch: Patch<TravelEvent>) => void;
  patchPlacement: (id: string, patch: Patch<MapObjectPlacement>) => void;
  patchNpc: (id: string, patch: Patch<Npc>) => void;
  patchTavern: (id: string, patch: Patch<DmTavern>) => void;
  patchShop: (id: string, patch: Patch<DmShop>) => void;
  patchImage: (id: string, patch: Patch<DmImageItem>) => void;
  patchQuest: (id: string, patch: Patch<DmQuest>) => void;
  patchEnemy: (id: string, patch: Patch<DmCustomEnemy>) => void;
  patchPlayer: (id: string, patch: Patch<DmPlayer>) => void;
  patchEconomyReference: (id: string, patch: Patch<DmEconomyReferenceItem>) => void;
  /** Hotfix — edits a dm-companion-seeded source Location's own content
   * fields (description/playerView/dmSecrets/notes/image), distinct from
   * patchLocationState above. */
  patchLocation: (id: string, patch: Patch<DmLocation>) => void;
  /** Hotfix — adds a brand-new image uploaded from the DM's computer
   * (data: URL `src`), same "no seed data" pattern as addNpc. */
  addImage: (image: DmImageItem) => void;
  /** Stage 6C.4D — removes the local override for one entity, restoring seed
   * defaults. Never deletes the source entity, a placement marker, or a
   * relationship link. */
  resetOverride: (kind: 'npc' | 'tavern' | 'shop' | 'image' | 'quest' | 'enemy' | 'player' | 'economyReference' | 'locationState' | 'location', id: string) => void;
  deleteLocationState: (id: string) => void;
  deleteHotspot: (id: string) => void;
  deleteRoute: (id: string) => void;
  deletePlacement: (id: string) => void;
  addTimeline: (timeline: Timeline) => void;
  addWorldMap: (map: WorldMap) => void;
  addWorldMapState: (state: WorldMapState) => void;
  addLocationState: (state: LocationState) => void;
  addHotspot: (hotspot: MapHotspot) => void;
  addRoute: (route: MapRoute) => void;
  addTravelEvent: (event: TravelEvent) => void;
  addPlacement: (placement: MapObjectPlacement) => void;
  addNpc: (npc: Npc) => void;
  addEnemy: (enemy: DmCustomEnemy) => void;
  setPlacementLayerVisible: (visible: boolean) => void;
  /** Returns the timeline's calendar, defaulting lazily if it's never been set. */
  getCalendar: (timelineId: string) => CampaignCalendar;
  setCalendar: (timelineId: string, calendar: CampaignCalendar) => void;
  advanceTimePhase: (timelineId: string) => void;
  advanceDay: (timelineId: string) => void;
  addCampaignEvent: (event: CampaignEvent) => void;
  updateCampaignEvent: (eventId: string, patch: Partial<CampaignEvent>) => void;
  archiveCampaignEvent: (eventId: string) => void;
  addDelayedTrigger: (trigger: DelayedTrigger) => void;
  updateDelayedTrigger: (triggerId: string, patch: Partial<DelayedTrigger>) => void;
  archiveDelayedTrigger: (triggerId: string) => void;
  resolveDelayedTrigger: (triggerId: string) => void;
  markDelayedTriggerTriggered: (triggerId: string) => void;
  addFactionZone: (zone: FactionZone) => void;
  updateFactionZone: (zoneId: string, patch: Partial<FactionZone>) => void;
  archiveFactionZone: (zoneId: string) => void;
  upsertMovableEntity: (entity: MovableEntity) => void;
  updateMovableEntity: (entityId: string, patch: Partial<MovableEntity>) => void;
  archiveMovableEntity: (entityId: string) => void;
  /** Stage 6C.4E — hard-deletes the marker record only (never the source
   * entity). See REMOVE_MOVABLE_ENTITY reducer case for the soft-vs-hard
   * delete rationale. */
  removeMovableEntity: (entityId: string) => void;
  addDynamicMapOverlay: (overlay: DynamicMapOverlay) => void;
  updateDynamicMapOverlay: (overlayId: string, patch: Partial<DynamicMapOverlay>) => void;
  archiveDynamicMapOverlay: (overlayId: string) => void;
  addBattleEntry: (entry: BattleEntry) => void;
  updateBattleEntry: (entryId: string, patch: Partial<BattleEntry>) => void;
  archiveBattleEntry: (entryId: string) => void;
  markBattleEntryActive: (entryId: string) => void;
  markBattleEntryCompleted: (entryId: string) => void;
  setBattleMapLink: (link: BattleMapLocationLink) => void;
  confirmBattleMapLink: (locationStateId: string, battleMapId: string) => void;
  removeBattleMapLink: (locationStateId: string, battleMapId: string) => void;
  addManualBattleMapLink: (locationStateId: string, battleMapId: string, reason?: string) => void;
  setBattleMapVttUrl: (battleMapId: string, url: string) => void;
  startActiveBattle: (battle: ActiveBattleState) => void;
  updateActiveBattle: (patch: Partial<ActiveBattleState>) => void;
  updateActiveBattleCombatant: (combatantId: string, patch: Partial<ActiveBattleCombatant>) => void;
  addActiveBattleCombatant: (combatant: ActiveBattleCombatant) => void;
  endActiveBattle: () => void;
  setPartyMapPosition: (position: NonNullable<PartyState['currentMapPosition']>) => void;
  setPartyRouteProgress: (progress: PartyRouteProgress | null) => void;
  exportOverlay: () => CampaignOverlay;
  importOverlay: (overlay: CampaignOverlay) => void;
  resetOverlay: () => void;
}

const CampaignStoreContext = createContext<CampaignStoreValue | null>(null);

export function CampaignStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadPersisted);
  // Save feedback for Edit Mode (section 5 of the workspace spec): every
  // overlay mutation autosaves synchronously to localStorage, so there is no
  // real "Saving..." window — but the DM still needs visible confirmation
  // that it happened, and an honest "Save failed" if localStorage throws
  // (quota exceeded, private-mode restrictions, etc). The first mount only
  // restores already-persisted data, so it's skipped to avoid a misleading
  // "Saved" flash before the DM has touched anything.
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const isFirstSave = useRef(true);
  // The last overlay JSON this tab either wrote to localStorage or imported
  // FROM localStorage via a cross-tab storage event. Used to break the
  // cross-tab feedback cycle: previously the dedupe compared the incoming
  // value against JSON.stringify(state) — but state includes `mode` while
  // the persisted value doesn't, so the comparison NEVER matched, every
  // storage event triggered a redundant IMPORT_OVERLAY, and that import's
  // own save effect wrote the (multi-megabyte) overlay right back. With two
  // tabs open every save in one tab caused a full parse+import+re-write in
  // the other; a tab holding stale state could even resurrect an already
  // ended battle (activeBattle) by writing its old overlay back over the
  // new one. Tracking the exact last-synced string kills both problems.
  const lastSyncedJsonRef = useRef<string | null>(null);
  // Set when the current state came from a cross-tab import — the very next
  // save effect run must NOT write back, the value is already in storage.
  const skipNextSaveRef = useRef(false);

  useEffect(() => {
    if (isFirstSave.current) {
      isFirstSave.current = false;
      return;
    }
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    try {
      const { mode: _mode, ...persistedState } = state;
      const json = JSON.stringify(persistedState);
      if (json === lastSyncedJsonRef.current) return;
      overlayStorage.save(json);
      lastSyncedJsonRef.current = json;
      setSaveStatus('saved');
    } catch {
      setSaveStatus('error');
    }
  }, [state]);

  useEffect(() => {
    return overlayStorage.subscribe((newJson) => {
      if (newJson === lastSyncedJsonRef.current) return;
      try {
        const overlay = JSON.parse(newJson) as CampaignOverlay;
        lastSyncedJsonRef.current = newJson;
        skipNextSaveRef.current = true;
        dispatch({ type: 'IMPORT_OVERLAY', overlay });
      } catch {
        // Ignore malformed external writes; the current tab keeps its last
        // valid in-memory overlay and the next valid save can resync it.
      }
    });
  }, []);

  useEffect(() => {
    if (saveStatus === 'idle') return;
    const t = setTimeout(() => setSaveStatus('idle'), 2000);
    return () => clearTimeout(t);
  }, [saveStatus]);

  const value = useMemo<CampaignStoreValue>(() => {
    const arc2 = TIMELINES.find((t) => t.arcId === 'arc-2');
    const arc2Patch = arc2 ? state.timelinePatches[arc2.id] : undefined;
    const arc2RevealedToPlayers = !!(
      arc2Patch && arc2Patch !== DELETED ? arc2Patch.visibleToPlayers : arc2?.visibleToPlayers
    );

    return {
      ...state,
      isDmView: state.mode !== 'player-view',
      arc2RevealedToPlayers,
      saveStatus,
      setCurrentLocation: (locationStateId, routeId) =>
        dispatch({ type: 'SET_CURRENT_LOCATION', locationStateId, routeId }),
      markVisited: (locationStateId) => dispatch({ type: 'MARK_VISITED', locationStateId }),
      setKnown: (locationStateId) => dispatch({ type: 'SET_KNOWN', locationStateId }),
      setRevealed: (locationStateId) => dispatch({ type: 'SET_REVEALED', locationStateId }),
      unsetRevealed: (locationStateId) => dispatch({ type: 'UNSET_REVEALED', locationStateId }),
      setLocationStatus: (locationStateId, status) =>
        dispatch({ type: 'SET_LOCATION_STATUS', locationStateId, status }),
      setQuestStatus: (questId, status) => dispatch({ type: 'SET_QUEST_STATUS', questId, status }),
      setLocationNote: (locationStateId, note) =>
        dispatch({ type: 'SET_LOCATION_NOTE', locationStateId, note }),
      setTimeline: (timelineId) => dispatch({ type: 'SET_TIMELINE', timelineId }),
      setMode: (mode) => dispatch({ type: 'SET_MODE', mode }),
      toggleDmView: () => dispatch({ type: 'SET_MODE', mode: state.mode === 'player-view' ? 'dm-view' : 'player-view' }),
      setArc2Revealed: (revealed) => dispatch({ type: 'SET_ARC2_REVEALED', revealed }),
      patchTimeline: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'timeline', id, patch: patch as Patch<unknown> }),
      patchWorldMap: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'worldMap', id, patch: patch as Patch<unknown> }),
      patchWorldMapState: (id, patch) =>
        dispatch({ type: 'PATCH_ENTITY', kind: 'worldMapState', id, patch: patch as Patch<unknown> }),
      patchLocationState: (id, patch) =>
        dispatch({ type: 'PATCH_ENTITY', kind: 'locationState', id, patch: patch as Patch<unknown> }),
      patchHotspot: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'hotspot', id, patch: patch as Patch<unknown> }),
      patchRoute: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'route', id, patch: patch as Patch<unknown> }),
      patchTravelEvent: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'travelEvent', id, patch: patch as Patch<unknown> }),
      patchPlacement: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'placement', id, patch: patch as Patch<unknown> }),
      patchNpc: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'npc', id, patch: patch as Patch<unknown> }),
      patchTavern: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'tavern', id, patch: patch as Patch<unknown> }),
      patchShop: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'shop', id, patch: patch as Patch<unknown> }),
      patchImage: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'image', id, patch: patch as Patch<unknown> }),
      patchQuest: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'quest', id, patch: patch as Patch<unknown> }),
      patchEnemy: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'enemy', id, patch: patch as Patch<unknown> }),
      patchPlayer: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'player', id, patch: patch as Patch<unknown> }),
      patchEconomyReference: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'economyReference', id, patch: patch as Patch<unknown> }),
      patchLocation: (id, patch) => dispatch({ type: 'PATCH_ENTITY', kind: 'location', id, patch: patch as Patch<unknown> }),
      addImage: (image) => dispatch({ type: 'ADD_IMAGE', image }),
      resetOverride: (kind, id) => dispatch({ type: 'RESET_PATCH', kind, id }),
      deleteLocationState: (id) => dispatch({ type: 'PATCH_ENTITY', kind: 'locationState', id, patch: DELETED }),
      deleteHotspot: (id) => dispatch({ type: 'PATCH_ENTITY', kind: 'hotspot', id, patch: DELETED }),
      deleteRoute: (id) => dispatch({ type: 'PATCH_ENTITY', kind: 'route', id, patch: DELETED }),
      deletePlacement: (id) => dispatch({ type: 'PATCH_ENTITY', kind: 'placement', id, patch: DELETED }),
      addTimeline: (timeline) => dispatch({ type: 'ADD_TIMELINE', timeline }),
      addWorldMap: (map) => dispatch({ type: 'ADD_WORLD_MAP', map }),
      addWorldMapState: (mapState) => dispatch({ type: 'ADD_WORLD_MAP_STATE', state: mapState }),
      addLocationState: (locState) => dispatch({ type: 'ADD_LOCATION_STATE', state: locState }),
      addHotspot: (hotspot) => dispatch({ type: 'ADD_HOTSPOT', hotspot }),
      addRoute: (route) => dispatch({ type: 'ADD_ROUTE', route }),
      addTravelEvent: (event) => dispatch({ type: 'ADD_TRAVEL_EVENT', event }),
      addPlacement: (placement) => dispatch({ type: 'ADD_PLACEMENT', placement }),
      addNpc: (npc) => dispatch({ type: 'ADD_NPC', npc }),
      addEnemy: (enemy) => dispatch({ type: 'ADD_ENEMY', enemy }),
      setPlacementLayerVisible: (visible) => dispatch({ type: 'SET_PLACEMENT_LAYER_VISIBLE', visible }),
      getCalendar: (timelineId) => state.calendarsByTimelineId[timelineId] ?? DEFAULT_CALENDAR,
      setCalendar: (timelineId, calendar) => dispatch({ type: 'SET_CALENDAR', timelineId, calendar }),
      advanceTimePhase: (timelineId) => dispatch({ type: 'ADVANCE_TIME_PHASE', timelineId }),
      advanceDay: (timelineId) => dispatch({ type: 'ADVANCE_DAY', timelineId }),
      addCampaignEvent: (event) => dispatch({ type: 'ADD_CAMPAIGN_EVENT', event }),
      updateCampaignEvent: (eventId, patch) => dispatch({ type: 'UPDATE_CAMPAIGN_EVENT', eventId, patch }),
      archiveCampaignEvent: (eventId) => dispatch({ type: 'ARCHIVE_CAMPAIGN_EVENT', eventId }),
      addDelayedTrigger: (trigger) => dispatch({ type: 'ADD_DELAYED_TRIGGER', trigger }),
      updateDelayedTrigger: (triggerId, patch) => dispatch({ type: 'UPDATE_DELAYED_TRIGGER', triggerId, patch }),
      archiveDelayedTrigger: (triggerId) => dispatch({ type: 'ARCHIVE_DELAYED_TRIGGER', triggerId }),
      resolveDelayedTrigger: (triggerId) => dispatch({ type: 'RESOLVE_DELAYED_TRIGGER', triggerId }),
      markDelayedTriggerTriggered: (triggerId) => dispatch({ type: 'MARK_DELAYED_TRIGGER_TRIGGERED', triggerId }),
      addFactionZone: (zone) => dispatch({ type: 'ADD_FACTION_ZONE', zone }),
      updateFactionZone: (zoneId, patch) => dispatch({ type: 'UPDATE_FACTION_ZONE', zoneId, patch }),
      archiveFactionZone: (zoneId) => dispatch({ type: 'ARCHIVE_FACTION_ZONE', zoneId }),
      upsertMovableEntity: (entity) => dispatch({ type: 'UPSERT_MOVABLE_ENTITY', entity }),
      updateMovableEntity: (entityId, patch) => dispatch({ type: 'UPDATE_MOVABLE_ENTITY', entityId, patch }),
      archiveMovableEntity: (entityId) => dispatch({ type: 'ARCHIVE_MOVABLE_ENTITY', entityId }),
      removeMovableEntity: (entityId) => dispatch({ type: 'REMOVE_MOVABLE_ENTITY', entityId }),
      addDynamicMapOverlay: (overlay) => dispatch({ type: 'ADD_DYNAMIC_MAP_OVERLAY', overlay }),
      updateDynamicMapOverlay: (overlayId, patch) => dispatch({ type: 'UPDATE_DYNAMIC_MAP_OVERLAY', overlayId, patch }),
      archiveDynamicMapOverlay: (overlayId) => dispatch({ type: 'ARCHIVE_DYNAMIC_MAP_OVERLAY', overlayId }),
      addBattleEntry: (entry) => dispatch({ type: 'ADD_BATTLE_ENTRY', entry }),
      updateBattleEntry: (entryId, patch) => dispatch({ type: 'UPDATE_BATTLE_ENTRY', entryId, patch }),
      archiveBattleEntry: (entryId) => dispatch({ type: 'ARCHIVE_BATTLE_ENTRY', entryId }),
      markBattleEntryActive: (entryId) => dispatch({ type: 'MARK_BATTLE_ENTRY_ACTIVE', entryId }),
      markBattleEntryCompleted: (entryId) => dispatch({ type: 'MARK_BATTLE_ENTRY_COMPLETED', entryId }),
      setBattleMapLink: (link) => dispatch({ type: 'SET_BATTLE_MAP_LINK', link }),
      setBattleMapVttUrl: (battleMapId, url) => dispatch({ type: 'SET_BATTLE_MAP_VTT_URL', battleMapId, url }),
      startActiveBattle: (battle) => dispatch({ type: 'START_ACTIVE_BATTLE', battle }),
      updateActiveBattle: (patch) => dispatch({ type: 'UPDATE_ACTIVE_BATTLE', patch }),
      updateActiveBattleCombatant: (combatantId, patch) =>
        dispatch({ type: 'UPDATE_ACTIVE_BATTLE_COMBATANT', combatantId, patch }),
      addActiveBattleCombatant: (combatant) => dispatch({ type: 'ADD_ACTIVE_BATTLE_COMBATANT', combatant }),
      endActiveBattle: () => dispatch({ type: 'END_ACTIVE_BATTLE' }),
      setPartyMapPosition: (position) => dispatch({ type: 'SET_PARTY_MAP_POSITION', position }),
      setPartyRouteProgress: (progress) => dispatch({ type: 'SET_PARTY_ROUTE_PROGRESS', progress }),
      confirmBattleMapLink: (locationStateId, battleMapId) => {
        const key = `${locationStateId}__${battleMapId}`;
        const existing = state.battleMapLocationLinkOverrides[key];
        dispatch({
          type: 'SET_BATTLE_MAP_LINK',
          link: {
            locationStateId,
            battleMapId,
            confidence: 'exact',
            reason: existing?.reason ?? 'Подтверждено ДМ вручную',
            manual: true,
            rejected: false,
          },
        });
      },
      removeBattleMapLink: (locationStateId, battleMapId) => {
        dispatch({
          type: 'SET_BATTLE_MAP_LINK',
          link: {
            locationStateId,
            battleMapId,
            confidence: 'manual_required',
            reason: 'Отклонено ДМ — связь скрыта вручную',
            rejected: true,
          },
        });
      },
      addManualBattleMapLink: (locationStateId, battleMapId, reason) => {
        dispatch({
          type: 'SET_BATTLE_MAP_LINK',
          link: {
            locationStateId,
            battleMapId,
            confidence: 'exact',
            reason: reason ?? 'manual',
            manual: true,
            rejected: false,
          },
        });
      },
      exportOverlay: () => state,
      importOverlay: (overlay) => dispatch({ type: 'IMPORT_OVERLAY', overlay }),
      resetOverlay: () => dispatch({ type: 'RESET' }),
    };
  }, [state, saveStatus]);

  return <CampaignStoreContext.Provider value={value}>{children}</CampaignStoreContext.Provider>;
}

export function useCampaignStore(): CampaignStoreValue {
  const ctx = useContext(CampaignStoreContext);
  if (!ctx) throw new Error('useCampaignStore must be used within CampaignStoreProvider');
  return ctx;
}

// Re-export for callers that only need the patch helper type.
export type { CampaignProgress, PartyState };

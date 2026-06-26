import { useEffect, useRef, useState } from 'react';
import type { MouseEvent, WheelEvent, ReactElement, DragEvent as ReactDragEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import {
  effectiveLocationStatus,
  effectiveQuestStatus,
  getLocationState,
  isLocationVisibleToPlayers,
} from '../data/selectors';
import { BATTLE_MAP_VTT_BASE_URL } from '../config';
import { getPlayerSafeHotspots, getPlayerSafeRoutes, getPlayerSafePlacements, getPlayerSafeImages } from '../data/playerSafeProjection';
import { useMapWorkspaceMode } from './map-workspace/useMapWorkspaceMode';
import { postObserverFocus } from './map-workspace/observerBroadcast';
import { BattleMapThumbnail } from './map-workspace/BattleMapThumbnail';
import { BattleMapVttLinkField } from './map-workspace/BattleMapVttLinkField';
import { CalendarChip } from './map-workspace/CalendarChip';
import { PartyMarker } from './map-workspace/PartyMarker';
import { QuickPinPanel } from './map-workspace/QuickPinPanel';
import {
  getRouteValidationWarnings,
  calculateRouteNormalizedDistance,
  estimateTravelDays,
  isRouteValid,
  TRAVEL_SPEED_PRESETS,
} from '../data/routeUtils';
import type { TravelSpeedPresetKey } from '../data/routeUtils';
import { buildRouteGraph, findPathBetweenLocations } from '../data/routeNetwork';
import type { RoutePathResult } from '../data/routeNetwork';
import { CheckboxList } from '../components/CheckboxList';
import type {
  LocationState,
  LocationStatus,
  MapHotspot,
  MapRoute,
  MapObjectPlacement,
  WorldMap,
  QuestStatus,
  CampaignEvent,
  CampaignCalendar,
  DelayedTrigger,
  Npc,
} from '../types';
import { LAYER_PRESETS, LAYER_PRESET_LABELS } from '../data/layerPresets';
import type { LayerPresetId } from '../data/layerPresets';
import {
  getArmedTriggersForTimeline,
  getPendingDateTriggers,
  getPendingRouteTriggers,
} from '../data/triggerUtils';
import { isMonthOrderUnknownForDate } from '../data/calendarUtils';
import {
  getPlayerSafeEvents,
  getPlayerSafeFactionZones,
  getPlayerSafeDynamicMapOverlays,
  getPlayerSafeMovableEntities,
  getPlayerSafeBattleEntries,
  getPlayerSafeNpcs,
} from '../data/playerSafeProjection';
import type {
  FactionZone,
  FactionZoneType,
  FactionZoneStatus,
  DynamicMapOverlay,
  MapOverlayType,
  MovableEntity,
  MovableEntityType,
  MovementState,
  BattleEntry,
  BattleEntryStatus,
  BattleSceneSize,
} from '../types';
import { BattleEntryMarkerLayer } from './map-workspace/BattleEntryMarkerLayer';
import type { DmTavern, DmShop, DmQuest, DmCustomEnemy, DmImageItem, DmLocation, DmNpc } from '../types/dmCompanion';
import type { CampaignData } from '../data/loadCampaignData';

/** Stage 6C.5 Phase 2G — the shared embedded-companion navigation entity.
 * `quest`/`enemy`/`image` are intentionally included now (so callers don't
 * need a follow-up type change) even though `EmbeddedCompanionWindow`
 * only renders a real card for `location`/`tavern`/`shop`/`npc` today —
 * the other three render an explicit "not built yet" placeholder rather
 * than silently doing nothing. */
type EmbeddedCompanionEntity =
  | { type: 'location'; id: string }
  | { type: 'tavern'; id: string }
  | { type: 'shop'; id: string }
  | { type: 'npc'; id: string }
  | { type: 'quest'; id: string }
  | { type: 'enemy'; id: string }
  | { type: 'image'; id: string };
import type { BattleMapManifestEntry } from '../data/battleMapManifest';
import {
  resolveEntityPreviewImage,
  resolveEntityShortDescription,
  LIBRARY_FALLBACK_ICON,
  hotspotPlacementState,
  type LibrarySourceType,
} from './map-workspace/libraryCards';
import { BattleEntryPanel } from './map-workspace/BattleEntryPanel';
import { BattleConsequencesPanel } from './map-workspace/BattleConsequencesPanel';
import { parseBattleReturnParams, clearBattleReturnParams } from './map-workspace/battleReturn';
import type { BattleReturnParams } from './map-workspace/battleReturn';

const ROUTE_TYPE_COLORS: Record<string, string> = {
  road: 'rgba(212,175,55,0.55)',
  street: 'rgba(212,175,55,0.5)',
  trail: 'rgba(160,140,100,0.55)',
  river: 'rgba(91,154,212,0.55)',
  tunnel: 'rgba(120,120,120,0.55)',
  secret: 'rgba(168,140,255,0.5)',
  dangerous: 'rgba(220,90,70,0.6)',
  custom: 'rgba(212,175,55,0.5)',
};

const ZONE_TYPE_OPTIONS: FactionZoneType[] = [
  'control',
  'contested',
  'danger',
  'patrol',
  'warfront',
  'restricted',
  'magical',
  'custom',
];
const ZONE_TYPE_LABELS: Record<FactionZoneType, string> = {
  control: 'Контроль',
  contested: 'Спорная территория',
  danger: 'Опасная зона',
  patrol: 'Патрулируемая зона',
  warfront: 'Линия фронта',
  restricted: 'Запретная зона',
  magical: 'Магическая аномалия',
  custom: 'Прочее',
};
const ZONE_STATUS_OPTIONS: FactionZoneStatus[] = ['stable', 'contested', 'expanding', 'collapsing', 'hidden'];
const ZONE_STATUS_LABELS: Record<FactionZoneStatus, string> = {
  stable: 'Стабильна',
  contested: 'Спорная',
  expanding: 'Расширяется',
  collapsing: 'Сжимается',
  hidden: 'Скрыта (только ДМ)',
};

const OVERLAY_TYPE_OPTIONS: MapOverlayType[] = ['fog', 'night', 'fire', 'destruction', 'magical', 'faction_occupation', 'custom'];
const OVERLAY_TYPE_LABELS: Record<MapOverlayType, string> = {
  fog: 'Туман',
  night: 'Ночь',
  fire: 'Пожар',
  destruction: 'Разрушения',
  magical: 'Магическая аномалия',
  faction_occupation: 'Оккупация фракцией',
  custom: 'Прочее',
};

// Stage 6C.4E: 'quest'/'enemy'/'image' markers are only ever created via the
// Library/picker placement flow (which always supplies a real source entity
// id) — deliberately NOT added to MOVABLE_ENTITY_TYPE_OPTIONS, which feeds
// the generic "create a custom movable entity by hand" form where no source
// entity selection exists.
const MOVABLE_ENTITY_TYPE_OPTIONS: MovableEntityType[] = ['npc', 'enemy_group', 'party', 'caravan', 'army', 'custom'];
const MOVABLE_ENTITY_TYPE_LABELS: Record<MovableEntityType, string> = {
  npc: 'NPC',
  enemy_group: 'Группа врагов',
  party: 'Партия',
  caravan: 'Караван',
  army: 'Армия',
  custom: 'Прочее',
  quest: 'Квестовая точка',
  enemy: 'Враг',
  image: 'Изображение',
};

const MOVEMENT_STATE_OPTIONS: MovementState[] = ['stationary', 'travelling', 'hidden', 'unknown'];
const MOVEMENT_STATE_LABELS: Record<MovementState, string> = {
  stationary: 'На месте',
  travelling: 'В пути',
  hidden: 'Скрыта',
  unknown: 'Неизвестно',
};

// Movable Entity map marker (Stage 4C) — compact letter badge per
// MOVABLE_ENTITY_TYPE_OPTIONS; 'party' entities are excluded from map
// rendering entirely (the existing PartyMarker/partyMarkerPoint flow already
// owns the party token — see visibleMovableEntities filtering below), so
// 'party' has no badge text here in practice.
// Stage 6C.4F — ghost-marker badge letters while dragging from the Library
// panel, matching the spec's LOC/TAV/SHP/NPC/QST/ENM/BAT/IMG convention.
const DRAG_TYPE_BADGE: Record<'location' | 'tavern' | 'shop' | 'npc' | 'quest' | 'enemy' | 'battleEntry' | 'image', string> = {
  location: 'LOC',
  tavern: 'TAV',
  shop: 'SHP',
  npc: 'NPC',
  quest: 'QST',
  enemy: 'ENM',
  battleEntry: 'BAT',
  image: 'IMG',
};

const MOVABLE_ENTITY_MARKER_BADGE: Record<MovableEntityType, string> = {
  npc: 'NPC',
  enemy_group: 'GRP',
  party: 'PTY',
  caravan: 'CAR',
  army: 'ARM',
  custom: '?',
  quest: 'QST',
  enemy: 'ENM',
  image: 'IMG',
};

// CSS-class-safe suffix for entityType (CSS classes can't contain '_').
const MOVABLE_ENTITY_TYPE_CSS: Record<MovableEntityType, string> = {
  npc: 'npc',
  enemy_group: 'enemy-group',
  party: 'party',
  caravan: 'caravan',
  army: 'army',
  custom: 'custom',
  quest: 'quest',
  enemy: 'enemy',
  image: 'image',
};

const STATUS_COLORS: Record<string, string> = {
  unknown: '#777',
  known: '#3b82f6',
  visited: '#22c55e',
  hidden: '#888',
  destroyed: '#ef4444',
  contested: '#f59e0b',
};

const STATUS_LABELS_CALM: Record<LocationStatus, string> = {
  unknown: 'Неизвестно',
  known: 'Известно',
  visited: 'Посещено',
  hidden: 'Скрыто',
  destroyed: 'Разрушено',
  contested: 'Спорная территория',
};

const PLACEMENT_ICONS: Record<MapObjectPlacement['entityKind'], string> = {
  location: '\u{1F3F0}',
  npc: '\u{1F9D1}',
  quest: '\u{1F4DC}',
  enemy: '\u{1F480}',
  image: '\u{1F5BC}',
  battleMap: '\u{2694}',
  note: '\u{1F4CC}',
  custom: '\u{2B50}',
};

const SCOPE_LABELS: Record<WorldMap['scope'], string> = {
  kingdom: 'Королевство',
  region: 'Регион',
  city: 'Город',
};

const SCOPE_ORDER: WorldMap['scope'][] = ['kingdom', 'region', 'city'];

// Per-map camera (pan/zoom) persistence. Deliberately a *separate* localStorage
// key from the DM-edit overlay: camera position is pure viewport state, not a
// content edit, so it must never be touched by Export/Import/Reset Local Edits.
const CAMERA_STORAGE_KEY = 'campaign-timeline-vtt:camera:v1';
const SCOPE_STORAGE_KEY = 'campaign-timeline-vtt:scope:v1';

interface PersistedCamera {
  scale: number;
  x: number;
  y: number;
}

function isValidCamera(c: unknown): c is PersistedCamera {
  if (!c || typeof c !== 'object') return false;
  const cam = c as PersistedCamera;
  return (
    Number.isFinite(cam.scale) &&
    cam.scale > 0 &&
    Number.isFinite(cam.x) &&
    Number.isFinite(cam.y)
  );
}

function loadCameraMap(): Record<string, PersistedCamera> {
  try {
    const raw = localStorage.getItem(CAMERA_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function loadPersistedScope(): WorldMap['scope'] {
  try {
    const raw = localStorage.getItem(SCOPE_STORAGE_KEY);
    if (raw === 'kingdom' || raw === 'region' || raw === 'city') return raw;
  } catch {
    // ignore
  }
  return 'city';
}

// Scoped by arc + map level + the specific map's id, so panning the city map
// never bleeds into the region/kingdom camera or into the other arc's camera.
function cameraKey(timelineId: string, scope: string, mapId: string): string {
  return `${timelineId}::${scope}::${mapId}`;
}

const STATUS_OPTIONS: LocationStatus[] = ['unknown', 'known', 'visited', 'hidden', 'destroyed', 'contested'];

// Stage 6B — quick location templates. Purely a starting label written onto
// LocationState.type; there is no dedicated tavern/shop data schema yet (see
// docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md, "Deferred").
type LocationTemplateType = 'tavern' | 'shop' | 'district' | 'warehouse' | 'gate' | 'guild' | 'temple' | 'custom';
const LOCATION_TEMPLATE_OPTIONS: { value: LocationTemplateType; label: string }[] = [
  { value: 'tavern', label: 'Таверна' },
  { value: 'shop', label: 'Лавка' },
  { value: 'district', label: 'Район' },
  { value: 'warehouse', label: 'Склад' },
  { value: 'gate', label: 'Ворота' },
  { value: 'guild', label: 'Гильдия' },
  { value: 'temple', label: 'Храм' },
  { value: 'custom', label: 'Другое' },
];
const QUEST_STATUSES: QuestStatus[] = ['active', 'completed', 'failed', 'hidden'];
const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: 'Активен',
  completed: 'Завершён',
  failed: 'Провален',
  hidden: 'Скрыт',
};

const MIN_SCALE = 0.5;
const MAX_SCALE = 4;

// Stage 6B.2 — DO NOT reintroduce a single global map width/height here.
// Coordinate/zoom/pan math must read the ACTIVE map's own
// originalImageWidth/originalImageHeight (WorldMap, src/types.ts), via
// useActiveMapImageSize() below — different maps can legitimately have
// different art dimensions. This fallback is ONLY used when a WorldMap is
// missing that metadata (e.g. a DM-added custom map that hasn't had its
// real pixel size recorded yet) — in that case we warn in dev rather than
// silently mis-scaling every coordinate calculation.
const FALLBACK_MAP_IMAGE_WIDTH = 1448;
const FALLBACK_MAP_IMAGE_HEIGHT = 1086;

/**
 * Resolves the real rendered-canvas size for `map`, preferring its own
 * `originalImageWidth/originalImageHeight` (Stage 6A metadata) and falling
 * back to FALLBACK_MAP_IMAGE_WIDTH/HEIGHT with a dev-mode console warning
 * when that metadata is absent. This is the single chokepoint every
 * coordinate/zoom/pan calculation in this file must go through instead of
 * a hardcoded constant.
 */
function useActiveMapImageSize(map: WorldMap | undefined): { width: number; height: number } {
  const hasRealMetadata = !!map?.originalImageWidth && !!map?.originalImageHeight;
  // Side-effecting dev warning lives in its own effect, not inside the
  // useMemo below — useMemo must stay a pure computation (mixing a
  // console.warn into it breaks the React Compiler's memoization
  // assumptions, see react-hooks/preserve-manual-memoization).
  useEffect(() => {
    if (!hasRealMetadata && import.meta.env.DEV) {
      console.warn(
        `[MapWorkspacePage] WorldMap "${map?.id ?? '(none)'}" has no originalImageWidth/originalImageHeight — ` +
          `falling back to ${FALLBACK_MAP_IMAGE_WIDTH}x${FALLBACK_MAP_IMAGE_HEIGHT}. Coordinates placed now may be ` +
          `wrong once real metadata is added. Set these fields in WORLD_MAPS (src/data/loadCampaignData.ts).`,
      );
    }
  }, [hasRealMetadata, map?.id]);
  // Plain computation, not useMemo — a couple of property reads is too cheap
  // to be worth memoizing, and avoids fighting the React Compiler's
  // preserve-manual-memoization diagnostic for no real benefit.
  if (map?.originalImageWidth && map?.originalImageHeight) {
    return { width: map.originalImageWidth, height: map.originalImageHeight };
  }
  return { width: FALLBACK_MAP_IMAGE_WIDTH, height: FALLBACK_MAP_IMAGE_HEIGHT };
}

type DrawerState =
  | { kind: 'npc'; id: string }
  | { kind: 'quest'; id: string }
  | { kind: 'enemy'; id: string }
  | { kind: 'image'; id: string }
  | { kind: 'battleMap'; id: string }
  | { kind: 'economy'; id: string }
  | { kind: 'law'; id: string }
  | { kind: 'placement'; id: string }
  | null;

// Keyword groups used for the lightweight, no-confidence-tracking "Законы"
// section match: a location is considered law-relevant if its type/tags
// contain any of these substrings, and a law is shown if its category/tags
// loosely overlap with the location's own tags/type/name (substring match).
const LAW_RELEVANT_LOCATION_KEYWORDS = ['дворец', 'стража', 'суд', 'гильд', 'рынок', 'казарм', 'крепост'];

function isLawRelevantLocation(ls: LocationState): boolean {
  const haystack = `${ls.type ?? ''} ${(ls.tags ?? []).join(' ')} ${ls.title}`.toLowerCase();
  return LAW_RELEVANT_LOCATION_KEYWORDS.some((kw) => haystack.includes(kw));
}

function lawMatchesLocation(law: { category: string; tags?: string[] }, ls: LocationState): boolean {
  const lawHaystack = `${law.category} ${(law.tags ?? []).join(' ')}`.toLowerCase();
  const locHaystack = `${ls.type ?? ''} ${(ls.tags ?? []).join(' ')} ${ls.title}`.toLowerCase();
  // Substring/tag overlap is sufficient — no confidence tracking needed here.
  return (
    LAW_RELEVANT_LOCATION_KEYWORDS.some((kw) => lawHaystack.includes(kw) && locHaystack.includes(kw)) ||
    (ls.tags ?? []).some((t) => lawHaystack.includes(t.toLowerCase()))
  );
}

// Locations whose type/tags suggest they sell goods (market/tavern/dock/forge
// etc.) — used in addition to an explicit shop link to decide whether to show
// the "Товары и услуги" section.
const MARKET_TYPE_KEYWORDS = ['рынок', 'кузниц', 'таверн', 'причал', 'док', 'торг', 'лавка', 'склад'];

function isMarketLikeLocation(ls: LocationState): boolean {
  const haystack = `${ls.type ?? ''} ${(ls.tags ?? []).join(' ')} ${ls.title}`.toLowerCase();
  return MARKET_TYPE_KEYWORDS.some((kw) => haystack.includes(kw));
}

export function MapWorkspacePage() {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();
  const [searchParams, setSearchParams] = useSearchParams();

  const [scope, setScope] = useState<WorldMap['scope']>(() => loadPersistedScope());
  const [selectedLocationStateId, setSelectedLocationStateId] = useState<string | null>(
    searchParams.get('selected'),
  );
  const [selectedHotspotId, setSelectedHotspotId] = useState<string | null>(null);
  const [locationSearch, setLocationSearch] = useState('');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<DrawerState>(null);
  const [globalSearch, setGlobalSearch] = useState('');
  const [placingHotspot, setPlacingHotspot] = useState(false);
  // Quick Pin (Etap H): a lightweight "drop a note on the map" tool. Reuses
  // MapObjectPlacement (entityKind: 'note', status: 'active') rather than a
  // new entity type — this is an MVP-compatible Quick Pin layered on top of
  // the existing placement system, not a parallel data model.
  const [quickPinArming, setQuickPinArming] = useState(false);
  interface QuickPinDraft {
    x: number;
    y: number;
    title: string;
    visibleInPlayerView: boolean;
  }
  const [quickPinDraft, setQuickPinDraft] = useState<QuickPinDraft | null>(null);
  // Travel Panel foundation (Etap G) — purely a UI preset selection, never
  // persisted; distance/duration are estimated, never fabricated when the
  // map has no known scale (see routeUtils.ts's estimateRouteDistanceKm).
  const [travelSpeedPreset, setTravelSpeedPreset] = useState<TravelSpeedPresetKey>('walk_normal');
  // Undo-last-calendar-advance (Etap I) — a single-slot snapshot of the
  // calendar taken right before each advance (+фаза/+день/Долгий отдых/Custom
  // Advance) so the DM can correct an accidental click. Intentionally only
  // one level deep (no full history stack) — this is a manual clock, not an
  // event-sourced log; keeping it last-action-only avoids inventing a bigger
  // undo system than the task calls for. Keyed by timelineId so switching
  // arcs never lets a stale snapshot undo the wrong arc's calendar.
  const [lastCalendarSnapshot, setLastCalendarSnapshot] = useState<{ timelineId: string; calendar: CampaignCalendar } | null>(null);
  const [sidePanelTab, setSidePanelTab] = useState<'card' | 'point' | 'data' | 'links' | 'routes' | 'entities' | 'unplaced' | 'library'>('card');
  // Stage 6C.5 — Library moved out of the right panel into its own
  // left-side drawer; this just controls whether that drawer is open.
  const [libraryDrawerOpen, setLibraryDrawerOpen] = useState(false);
  // Stage 6C.5 Phase 2G — shared embedded-companion navigation stack. One
  // active window; clicking a linked entity (from Library, the right
  // panel, or a linked row inside any companion card) pushes the
  // previously-open entity here instead of opening a second modal, so
  // `companionBack()` can return to it. This is deliberately separate
  // from `objectWindowOpen`/`selectedLs` (the existing Location/Tavern/
  // Shop flow keyed off a selected map hotspot) — that flow is untouched;
  // this is the new entry point for opening a card without first
  // selecting/placing a hotspot (Library "Открыть карточку", and any
  // linked-entity click from inside a card).
  const [companionStack, setCompanionStack] = useState<EmbeddedCompanionEntity[]>([]);
  const companionOpen = companionStack[companionStack.length - 1] ?? null;
  function openCompanion(entity: EmbeddedCompanionEntity) {
    setCompanionStack((stack) => [...stack, entity]);
  }
  function companionBack() {
    setCompanionStack((stack) => stack.slice(0, -1));
  }
  function closeCompanion() {
    setCompanionStack([]);
  }
  // Stage 6C.5 Phase 2 — the right panel for a selected location is now a
  // compact summary; deep editing/links/map/danger actions live in this
  // large object window instead. `objectWindowOpen` toggles the window;
  // `objectWindowSection` picks which of its 5 sections is active. This is
  // intentionally separate from `sidePanelTab` (which still drives the
  // general, non-object-specific tools: Маршруты/Объекты/Не размещено).
  const [objectWindowOpen, setObjectWindowOpen] = useState(false);
  const [objectWindowSection, setObjectWindowSection] = useState<'overview' | 'edit' | 'links' | 'map' | 'danger'>(
    'overview',
  );
  // Stage 6C.5 Phase 2 — "Ещё" reveal toggle for secondary actions in the
  // compact location summary (route/event/visited quick actions + access
  // to the general Маршруты/Объекты/Не размещено tools).
  const [sidePanelMoreOpen, setSidePanelMoreOpen] = useState(false);
  // Place location draft: holds the clicked (x,y) plus the minimal required
  // fields (title is mandatory) until "Сохранить" — nothing is created in the
  // overlay until Save, so Cancel leaves zero garbage objects behind.
  interface LocationPlacementDraft {
    x: number;
    y: number;
    title: string;
    /** Quick template — a starting label dropped onto LocationState.type; no template-specific
     * field sets exist yet (taverns/shops stay generic LocationStates until a dedicated schema is added). */
    type: LocationTemplateType;
    publicDescription: string;
    /** DM-only — never shown to players/Observer, see playerSafeProjection.ts. */
    dmNotes: string;
    status: LocationStatus;
    visibleToPlayers: boolean;
  }
  const [locationPlacementDraft, setLocationPlacementDraft] = useState<LocationPlacementDraft | null>(null);
  const [locationPlacementError, setLocationPlacementError] = useState<string | null>(null);
  // Party travel animation: when "Переместить партию по маршруту" is used,
  // the party marker visibly steps through this ordered list of points
  // (oriented from the party's OLD position to the new one) instead of
  // jumping straight there. Purely a visual walk — store.setCurrentLocation
  // is already called immediately, so data state never depends on whether
  // the animation finishes (e.g. if the DM navigates away mid-walk).
  const [partyTravelAnim, setPartyTravelAnim] = useState<{ points: { x: number; y: number }[]; index: number } | null>(
    null,
  );
  // Multi-segment party travel (route-network pathfinding result): a queue of
  // remaining point-chains to walk in order, one MapRoute's worth at a time,
  // plus the full chain of routeIds involved so all of them can get the
  // route--active highlight while the party is travelling the whole path.
  // partyTravelAnim above still drives the actual per-point walking step —
  // this just re-feeds it with the next segment's points when one finishes.
  const [, setPendingPathSegments] = useState<{ routeId: string; points: { x: number; y: number }[] }[]>([]);
  const [activePathRouteIds, setActivePathRouteIds] = useState<string[]>([]);
  // Multi-hop pathfinding UI state (route-network "Найти путь" action): the
  // candidate path(s) found for the currently-targeted journey, or an
  // explicit no-path state. Cleared whenever the journey target changes.
  const [pathfindingResult, setPathfindingResult] = useState<{
    targetLocationStateId: string;
    options: RoutePathResult[];
  } | null>(null);
  // Route Builder: the "Новый маршрут" form shown before drawing starts.
  interface RouteDraftForm {
    title: string;
    fromHotspotId: string;
    toHotspotId: string;
  }
  const [routeDraft, setRouteDraft] = useState<RouteDraftForm | null>(null);
  // True while editingRouteId refers to a route just created by the draft
  // form (not yet "finished") — so Cancel can delete it outright instead of
  // restoring a snapshot (a brand-new route has nothing to restore to).
  const [isCreatingNewRoute, setIsCreatingNewRoute] = useState(false);
  const [routeEditorError, setRouteEditorError] = useState<string | null>(null);
  // Highlights a route in the SVG layer (`.route-selected`) when the DM clicks
  // "Показать маршрут" in the journey panel. Purely visual — no auto-navigation.
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  // DM Edit-only route path (waypoint) editor. Click-to-add-waypoint instead of
  // drag-and-drop, per the same stability reasoning already used for hotspot
  // placement: a click-mode toggle is far less likely to misfire than drag/drop.
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [draggingWaypoint, setDraggingWaypoint] = useState<{ routeId: string; index: number } | null>(null);
  // Object placement mode (DM Edit only): armed via "Разместить на карте" in an
  // entity drawer, then the next map click drops a MapObjectPlacement there.
  const [placementMode, setPlacementMode] = useState<{
    entityKind: MapObjectPlacement['entityKind'];
    entityId?: string;
    title: string;
  } | null>(null);
  const [draggingPlacementId, setDraggingPlacementId] = useState<string | null>(null);
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  // Snapshot of a route's points taken the moment "Редактировать путь" is
  // pressed, so "Отменить" can restore the pre-edit shape even though every
  // individual drag/add/delete already live-patches the overlay.
  const [editingRouteSnapshot, setEditingRouteSnapshot] = useState<Array<{ x: number; y: number }> | null>(null);
  // DM-only "what's happening right now" summary overlay — purely a read-only
  // roll-up of already-computed state (party position, active quests, and
  // available travel events), never a new data source of its own.
  const [showSessionPanel, setShowSessionPanel] = useState(false);
  // Layer Presets MVP (Stage 3) — purely a DM-side display convenience: which
  // existing layers (routes/placements/quick pins/events/etc) render. Never
  // itself a source of player-safety — 'player_safe'/'observer' still route
  // through getPlayerSafe*() exactly like isPlayerView already does; this
  // selector only decides which of the ALREADY-filtered layers get shown.
  // Limitation: switching presets does not preserve the independent
  // placementLayerVisible toggle — it's simply overridden while a non-dm_full
  // preset is active (see layerPresets.ts module comment).
  const [layerPreset, setLayerPreset] = useState<LayerPresetId>('dm_full');
  const [showPendingTriggers, setShowPendingTriggers] = useState(false);
  // Stage 4A debug panel — DM-only, read-only listing of FactionZones (full,
  // including hidden), DynamicMapOverlays, and MovableEntities. Movable
  // entities/dynamic overlays have no real renderer this pass (see types.ts
  // TODOs); this is the "even a read-only listing is fine" allowance from
  // the brief rather than full map integration.
  const [showStage4ADebugPanel, setShowStage4ADebugPanel] = useState(false);
  // Travel + Trigger integration MVP (Stage 3, step 8) — set right after a
  // route completes via "Завершить в конечной точке", so the DM gets an
  // inline nudge in the Travel Panel instead of triggers silently sitting
  // unreviewed. Never auto-applies anything; just a visibility cue pointing
  // at the Pending Triggers panel.
  const [routeTriggerWarning, setRouteTriggerWarning] = useState<{ routeId: string; triggerNames: string[] } | null>(null);

  // Area Edit Mode (Stage 4A) — faction zone polygon create/edit. Mirrors the
  // route-builder's click-to-add-point pattern rather than drag/drop, for the
  // same stability reasoning. `zoneDraft` holds the in-progress NEW zone form
  // (not yet saved); `editingZoneId` + `zoneVertexDraftPoints` hold an
  // EXISTING zone's polygon being edited live (similar split to
  // routeDraft/editingRouteId above). Edge-click vertex insertion is
  // explicitly skipped as a Stage 4A MVP simplification — see report.
  interface ZoneDraftForm {
    name: string;
    type: FactionZoneType;
    status: FactionZoneStatus;
    visibleInPlayerView: boolean;
    points: Array<{ x: number; y: number }>;
  }
  const [zoneDraft, setZoneDraft] = useState<ZoneDraftForm | null>(null);
  const [editingZoneId, setEditingZoneId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedZoneVertexIndex, setSelectedZoneVertexIndex] = useState<number | null>(null);
  const [draggingZoneVertex, setDraggingZoneVertex] = useState<{ zoneId: string; index: number } | null>(null);
  // Hoisted above the loading/error early-returns below — a hook declared
  // after those guards only runs once `data` is loaded, changing the hook
  // count between renders and crashing the whole page (Rules of Hooks).
  const [zoneFormError, setZoneFormError] = useState<string | null>(null);

  // Dynamic Map Overlay create-form draft (Stage 4B). Mirrors the
  // zoneDraft/saveZoneDraft split above, minus polygon points — an overlay
  // has no map-drawing flow, just a plain form.
  interface OverlayDraftForm {
    name: string;
    type: MapOverlayType;
    opacity: number;
    active: boolean;
    visibleInPlayerView: boolean;
    description: string;
  }
  const [overlayDraft, setOverlayDraft] = useState<OverlayDraftForm | null>(null);
  const [overlayFormError, setOverlayFormError] = useState<string | null>(null);

  // Movable Entity create-form draft (Stage 4B). No map-drawing flow either —
  // currentPosition is set later via a per-row button/inputs, not at create
  // time, to keep the create form minimal per the brief.
  interface MovableEntityDraftForm {
    entityType: MovableEntityType;
    entityId: string;
    movementState: MovementState;
    visibleInPlayerView: boolean;
  }
  const [movableEntityDraft, setMovableEntityDraft] = useState<MovableEntityDraftForm | null>(null);
  const [movableEntityFormError, setMovableEntityFormError] = useState<string | null>(null);
  // Manual x/y fallback inputs for setting currentPosition per row — used
  // instead of "Использовать позицию партии" when that button isn't
  // applicable (e.g. no party position yet), see the panel below.
  const [movableEntityPositionDrafts, setMovableEntityPositionDrafts] = useState<Record<string, { x: string; y: string }>>({});

  // Movable Entity map rendering/selection (Stage 4C). Clicking a marker opens
  // the side-panel below (mirrors selectedZoneId for FactionZone). Mutually
  // independent of the zone/route/hotspot selections — a DM can have a zone
  // selected in the panel while still clicking a different marker type, same
  // as hotspots/routes/zones already coexist via their own selectedXId state.
  const [selectedMovableEntityId, setSelectedMovableEntityId] = useState<string | null>(null);
  // "Переместить вручную" (Step 5, flow 1): while armed, the next plain map
  // click sets that entity's currentPosition instead of any other map-click
  // behavior. Cleared after one placement — never a persistent "drag mode".
  const [manualMoveArmedForEntityId, setManualMoveArmedForEntityId] = useState<string | null>(null);
  // Stage 6B.3: arming a placement click for an EXISTING LocationState that
  // has no hotspot yet ("Разместить на текущей карте" in the Unplaced
  // panel) — the next map click creates only a MapHotspot, never a second
  // LocationState. Distinct from locationPlacementDraft, which always
  // creates a brand-new LocationState.
  const [placingExistingLocationId, setPlacingExistingLocationId] = useState<string | null>(null);
  // Stage 6B.3: arming a re-place click for an EXISTING MapHotspot
  // ("Переместить локацию") — the next map click updates that hotspot's
  // {x,y} in place, never creates a new one.
  const [movingHotspotId, setMovingHotspotId] = useState<string | null>(null);
  // Stage 6C: arming a placement click for a read-only DM Companion
  // library record (DmTavern/DmShop) — "Разместить на карте" in the new
  // Библиотека tab. The next map click materializes ONE new LocationState
  // (+ hotspot) prefilled from the library record and tags it with
  // sourceLibraryId so the card immediately shows "Placed" and a second
  // placement is blocked — but the source DmTavern/DmShop record itself
  // is never touched, so this is a one-time materialization, not a live
  // link (see docs §16 for why a live link isn't attempted this stage).
  const [placingLibraryEntity, setPlacingLibraryEntity] = useState<
    { type: 'tavern' | 'shop'; sourceId: string; title: string } | null
  >(null);
  // Stage 6C.2: clicking the map while the basic "Разместить локацию" tool
  // is armed no longer jumps straight to the "Новая локация" form. Instead
  // it captures the clicked point here and opens the Existing Object
  // Picker by default — selecting a card places that existing record at
  // this point immediately (no second click needed); "Создать новый
  // объект" falls back to the old locationPlacementDraft form using this
  // same point. Cleared on Escape, Cancel, or after a successful pick.
  const [pendingPlacementPoint, setPendingPlacementPoint] = useState<{ x: number; y: number } | null>(null);
  const [objectPickerSearch, setObjectPickerSearch] = useState('');
  const [objectPickerTab, setObjectPickerTab] = useState<
    'locations' | 'taverns' | 'shops' | 'npcs' | 'quests' | 'enemies' | 'battleEntries' | 'images'
  >('locations');
  // Stage 6C.4B: arming a standalone NPC-marker placement click from the
  // Library panel's "Разместить на карте" button — same one-shot
  // arm-then-click pattern as placingLibraryEntity above. The picker's own
  // NPC tab places immediately (the point is already known there), so this
  // is only needed for the Library panel's "browse before clicking the
  // map" flow.
  const [placingNpcEntityId, setPlacingNpcEntityId] = useState<string | null>(null);
  // Stage 6C.4E: same arm-then-click pattern as placingNpcEntityId, generic
  // across the three remaining source types placeable as a standalone
  // MovableEntity marker (Quest/Enemy/Image) — only used by the Library
  // panel's "Разместить на карте" button; the picker's own tabs place
  // immediately since the click point is already known there.
  const [placingContentEntity, setPlacingContentEntity] = useState<
    { type: 'quest' | 'enemy' | 'image'; sourceId: string } | null
  >(null);
  // Stage 6C.4E: same arm-then-click pattern, for the Library panel's
  // BattleEntry "Разместить на карте" button (the picker's own BattleEntry
  // tab places immediately since the click point is already known there).
  const [placingBattleEntryId, setPlacingBattleEntryId] = useState<string | null>(null);
  // Stage 6C.4F — drag-and-drop from the Library panel. `dragPayload` is set
  // by a card's onDragStart and cleared on dragend/drop; while it's non-null
  // every existing one-shot "next click does X" tool's own click handling on
  // the map is irrelevant since native HTML5 drag/drop fires onDrop, not
  // onClick — no extra suppression flag was needed for that. `dragGhostPoint`
  // is purely visual (never written to the store) and `dragInvalid` flips the
  // ghost's valid/invalid styling while hovering. `dragWarning` is a short
  // transient message for blocked/invalid drops (mode guard, drop outside
  // the map, drop on an already-elsewhere-placed location).
  const [dragPayload, setDragPayload] = useState<
    { sourceType: 'location' | 'tavern' | 'shop' | 'npc' | 'quest' | 'enemy' | 'battleEntry' | 'image'; sourceId: string; title: string } | null
  >(null);
  const [dragGhostPoint, setDragGhostPoint] = useState<{ x: number; y: number } | null>(null);
  const [dragInvalid, setDragInvalid] = useState(false);
  const [dragWarning, setDragWarning] = useState<string | null>(null);
  // Stage 6C.4G — set when a placement (from the picker, Library
  // arm-then-click, or drag-and-drop) landed near an existing location and
  // needs the DM to choose place/link/both/cancel. null = menu closed, no
  // pending side effect (nothing is written to the store until a real
  // action button is clicked).
  const [linkMenuState, setLinkMenuState] = useState<
    | {
        type: 'npc' | 'quest' | 'enemy' | 'battleEntry' | 'image';
        sourceId: string;
        title: string;
        point: { x: number; y: number };
        nearestLs: { id: string; title: string };
      }
    | null
  >(null);
  // Stage 6C.4C: which "Сменить изображение" target the ImagePickerModal is
  // currently open for, if any — one shared modal instance at the page
  // level rather than a separate one per editor, same "one modal, many
  // callers" pattern as everything else in this file.
  const [imagePickerTarget, setImagePickerTarget] = useState<
    | { kind: 'location'; locationStateId: string }
    | { kind: 'npc'; npcId: string }
    | { kind: 'tavern'; tavernId: string }
    | { kind: 'shop'; shopId: string }
    | { kind: 'battleEntry'; battleEntryId: string }
    | null
  >(null);
  // Stage 6C.4D: same non-destructive override pattern as npcEditDraft, for
  // the remaining major card types — tavernPatches/shopPatches/imagePatches
  // (new overlay slots) and BattleEntry's own pre-existing updateBattleEntry.
  const [tavernEditDraft, setTavernEditDraft] = useState<{
    tavernId: string;
    name: string;
    description: string;
    notes: string;
    image: string;
  } | null>(null);
  const [shopEditDraft, setShopEditDraft] = useState<{
    shopId: string;
    name: string;
    description: string;
    notes: string;
    image: string;
  } | null>(null);
  const [imageEditDraft, setImageEditDraft] = useState<{ imageId: string; title: string } | null>(null);
  const [battleEntryEditDraft, setBattleEntryEditDraft] = useState<{
    battleEntryId: string;
    name: string;
    description: string;
    playerSafeDescription: string;
    previewImageId: string;
  } | null>(null);
  // Stage 6C.4C: NPC editor draft — editing an EXISTING seeded/overlay NPC's
  // own fields via the pre-existing npcPatches overlay slot (Stage 6B.1),
  // not a new model. null = editor closed.
  const [npcEditDraft, setNpcEditDraft] = useState<{
    npcId: string;
    name: string;
    role: string;
    faction: string;
    publicDescription: string;
    dmNotes: string;
    visibleToPlayers: boolean;
    image: string;
  } | null>(null);

  // Battle Entry foundation (Stage 5A). Selection mirrors selectedMovableEntityId
  // above. "Новая боевая сцена" arms the next plain map click to create a draft
  // at that point (or the currently selected location's hotspot, if any) —
  // same click-first pattern as hotspot creation and Quick Pin.
  const [selectedBattleEntryId, setSelectedBattleEntryId] = useState<string | null>(null);
  const [battleEntryCreationArmed, setBattleEntryCreationArmed] = useState(false);
  interface BattleEntryDraftForm {
    x: number;
    y: number;
    name: string;
    status: BattleEntryStatus;
    sceneSize: BattleSceneSize;
    recommendedPartyLevel: string;
    battleMapId: string;
    battleMapUrl: string;
    visibleInPlayerView: boolean;
    description: string;
    playerSafeDescription: string;
  }
  const [battleEntryDraft, setBattleEntryDraft] = useState<BattleEntryDraftForm | null>(null);
  const [editingBattleEntryId, setEditingBattleEntryId] = useState<string | null>(null);
  const [battleEntryFormError, setBattleEntryFormError] = useState<string | null>(null);
  const [battleConsequencesEntryId, setBattleConsequencesEntryId] = useState<string | null>(null);
  // Battle Return Flow (Stage 5B, Step 2) — parsed from ?battleEntryId=...
  // returnUrl query params (see battleReturn.ts). Only ever used to pre-fill
  // the Battle Consequences draft for DM review; nothing here writes to the
  // store. Cleared once the DM explicitly applies consequences.
  const [battleReturnParams, setBattleReturnParams] = useState<BattleReturnParams | null>(null);

  // Warfront Status flow (Stage 4B): tracks the most recent manual status
  // change per zone (old -> new) so the panel can offer an EXPLICIT, never-
  // silent "Создать событие изменения фронта" checkbox/button right after the
  // status select changes, instead of the old window.confirm popup. Cleared
  // once the DM either creates the event or dismisses the prompt.
  const [pendingZoneStatusChange, setPendingZoneStatusChange] = useState<{
    zoneId: string;
    oldStatus: FactionZoneStatus;
    newStatus: FactionZoneStatus;
  } | null>(null);

  // Edit drafts for the "Данные локации" / "Связи" side-panel tabs (DM Edit mode
  // only). Declared above the early returns below, per the hook-safety rule
  // documented at the useEffect just below this block.
  const [locationDataDraft, setLocationDataDraft] = useState<Record<string, unknown> | null>(null);
  const [locationLinksDraft, setLocationLinksDraft] = useState<Record<string, string[]> | null>(null);
  // Stage 6B.1 — "Создать NPC здесь" draft, scoped to whichever location is
  // selected when the DM opens it. Nothing is created until Save.
  interface NpcCreateDraft {
    name: string;
    role: string;
    faction: string;
    publicDescription: string;
    dmNotes: string;
    visibleToPlayers: boolean;
  }
  const [npcCreateDraft, setNpcCreateDraft] = useState<NpcCreateDraft | null>(null);

  // Zoom/pan view transform. `scale` here is the USER zoom multiplier on top
  // of the auto-computed "fit to screen" base scale (see baseFit below).
  // {scale:1,x:0,y:0} always means "fit to screen" for whichever map is active.
  const [view, setView] = useState({ scale: 1, x: 0, y: 0 });
  const panState = useRef<{ panning: boolean; startX: number; startY: number; origX: number; origY: number }>({
    panning: false,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0,
  });
  // The browser fires a native "click" on mouseup even when that mouseup ends
  // a drag (waypoint/hotspot/placement) that started and moved elsewhere —
  // stopPropagation() on the drag's mousedown does NOT suppress this later,
  // separate click event. Without this guard, releasing a dragged route
  // waypoint over the map appends a SECOND, brand-new point at the release
  // position (handleMapClick's "add point to route" branch), which is
  // exactly what produced the reported diagonal "closing" segment — it was
  // never the route renderer closing a loop, it was an extra erroneous point.
  const suppressNextClickRef = useRef(false);

  // All known per-map cameras, loaded once from their own localStorage key
  // (kept separate from the DM-edit overlay — see CAMERA_STORAGE_KEY comment).
  const [cameraMap, setCameraMap] = useState<Record<string, PersistedCamera>>(() => loadCameraMap());
  // Tracks which camera key `view` currently represents, so we only swap the
  // camera when the user actually switches arc/level/map — never on every render.
  const activeCameraKeyRef = useRef<string | null>(null);

  // Measured size of the outer (overflow:hidden) map viewport, used to compute
  // the "fit to screen" base scale for the inner transformed image layer.
  // A STATE-based callback ref (not a plain useRef) is required here: useCampaignData()
  // is async, so the very first render (while loading) returns the "Загрузка…"
  // placeholder below and the real <div ref={...}> doesn't exist yet. A plain
  // useRef + useEffect(..., []) would attach its ResizeObserver to a still-null
  // ref on that first effect flush and never retry — permanently leaving
  // viewportSize at {0,0} and producing the "map flies to the top-left corner
  // with a huge empty field" bug after every load/reload. Using the DOM node
  // itself as the effect dependency makes the observer (re)attach exactly when
  // the node actually mounts.
  const [mapViewportEl, setMapViewportEl] = useState<HTMLDivElement | null>(null);
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });

  const mapRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isEditMode = store.mode === 'dm-edit';
  const isPlayerView = store.mode === 'player-view';
  // Stage 6C.5 Phase 2D-Fix — read/open/navigation actions (selecting an
  // object, opening its card, browsing linked content, viewing images)
  // should work in any DM-side mode (dm-edit or dm-view), not just
  // dm-edit. Only write/placement/edit actions stay gated to `isEditMode`
  // specifically. Player View and the separate `/observer` route are
  // unaffected either way (isDmMode is false in Player View).
  const isDmMode = !isPlayerView;
  // Stage 6C.5 Phase 2D-Fix — defense in depth: if the mode drops out of
  // DM Edit while a write-capable object-window section was active (e.g.
  // the DM switches DM Edit → DM View without closing the window first),
  // render as if "Обзор" were selected rather than leaving a
  // disabled-but-still-mounted edit/links/map/danger panel showing.
  // Derived at render time (not via a setState-in-effect) so switching
  // back to DM Edit restores the previously selected section.
  const effectiveObjectWindowSection = isEditMode ? objectWindowSection : 'overview';

  // Workspace Modes (Etap A) — derives a single MapWorkspaceMode from the
  // existing per-tool local state above, purely for guard checks (see
  // handleHotspotMouseDown's hotspot_drag guard below) and future panel
  // wiring. Does not replace cancelAllEditTools as the actual mutual-
  // exclusion mechanism — see useMapWorkspaceMode.ts's module comment.
  const workspaceMode = useMapWorkspaceMode(
    {
      placingHotspot,
      placementMode,
      routeDraft,
      editingRouteId,
      showSessionPanel,
      selectedRouteId,
      locationPlacementDraft,
      partyTravelAnimActive: !!partyTravelAnim,
      isPlayerView,
      areaEditActive: !!zoneDraft || !!editingZoneId,
    },
    cancelAllEditTools,
  );

  // Lightweight map/map-state lookup duplicated here (cheap) purely so hook
  // dependency arrays can react to "which map is active" without referencing
  // the full `map`/`mapState` consts declared below the early returns — those
  // must stay below the returns, but hooks must stay above them.
  const earlyMap = data ? data.worldMaps.find((m) => m.scope === scope) : undefined;
  const earlyCameraKey = earlyMap ? cameraKey(store.currentTimelineId, scope, earlyMap.id) : null;

  // Observe the map viewport's size so the fit-to-screen scale stays correct
  // across window resizes, side-panel toggles, and the initial loading->loaded
  // transition. Must stay above the early returns below (hook-safety: every
  // hook call must run unconditionally).
  useEffect(() => {
    if (!mapViewportEl) return;
    const update = () => setViewportSize({ width: mapViewportEl.clientWidth, height: mapViewportEl.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(mapViewportEl);
    return () => observer.disconnect();
  }, [mapViewportEl]);

  // Keep the URL's ?selected= param in sync without triggering navigation away from the map.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (selectedLocationStateId) next.set('selected', selectedLocationStateId);
    else next.delete('selected');
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLocationStateId]);

  // Battle Return Flow (Stage 5B, Step 2) — on mount or whenever the URL's
  // search string changes (e.g. the DM returns from the battle-map-vtt tab
  // and this tab's URL gets updated by that app, or simply on a fresh load
  // with return params already present), check for a battleEntryId in the
  // query string. If found, open that entry's Consequences panel with a
  // pre-filled (never auto-applied) draft — see BattleConsequencesPanel's
  // initialReturnParams prop. Nothing here mutates the store.
  useEffect(() => {
    const parsed = parseBattleReturnParams(searchParams.toString());
    if (!parsed) return;
    if (!store.battleEntriesById[parsed.battleEntryId]) return;
    setBattleReturnParams(parsed);
    setSelectedBattleEntryId(parsed.battleEntryId);
    setBattleConsequencesEntryId(parsed.battleEntryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Persist the active map level (Королевство/Регион/Город) so a reload reopens
  // the same level instead of always defaulting back to "city".
  useEffect(() => {
    try {
      localStorage.setItem(SCOPE_STORAGE_KEY, scope);
    } catch {
      // ignore storage failures (private mode / quota)
    }
  }, [scope]);

  // Whenever the active arc/level/map actually changes (including the very
  // first mount, once data has loaded), load that map's own persisted camera
  // if one exists and is valid; otherwise fall back to fit-to-screen. This
  // intentionally does NOT depend on `view` itself, so it never fights the
  // user's live panning/zooming of the current map.
  useEffect(() => {
    if (!earlyCameraKey) return;
    if (activeCameraKeyRef.current === earlyCameraKey) return;
    activeCameraKeyRef.current = earlyCameraKey;
    const persisted = cameraMap[earlyCameraKey];
    if (isValidCamera(persisted)) {
      setView({ scale: persisted.scale, x: persisted.x, y: persisted.y });
    } else {
      setView({ scale: 1, x: 0, y: 0 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earlyCameraKey]);

  // Placement mode (and route-waypoint editing) is tied to a specific
  // arc+level+map and to being in a non-Player-View mode. If either changes
  // mid-flow (DM switches arc, level, or drops into Player View), clear both
  // rather than risk creating a placement/waypoint on the wrong map, or
  // leaving a stale armed mode active where the DM can no longer see it.
  useEffect(() => {
    setPlacementMode(null);
    setEditingRouteId(null);
    setEditingRouteSnapshot(null);
    setIsCreatingNewRoute(false);
    setRouteEditorError(null);
    setRouteDraft(null);
    setQuickPinArming(false);
    setQuickPinDraft(null);
    // Also clear route/point selection — without this, switching arc/level/
    // mode could leave selectedRouteId pointing at a route id from the
    // PREVIOUS map (ids aren't guaranteed unique-safe across maps in every
    // code path), which then mis-highlights an unrelated route or crashes a
    // lookup that assumed the selected route still belongs to the current map.
    setSelectedRouteId(null);
    setSelectedPlacementId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earlyCameraKey, store.mode]);

  // Keyboard shortcuts while actively drawing/editing a route's path. Guarded
  // against any focused text input/select (e.g. the draft form's own title
  // field) so typing a route title never triggers Готово/Отменить/Undo.
  useEffect(() => {
    const routeId = editingRouteId;
    if (!routeId) return;
    function onKeyDown(e: KeyboardEvent) {
      const tag = (document.activeElement?.tagName ?? '').toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      if (e.key === 'Enter') {
        e.preventDefault();
        finishRouteEditing();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        cancelRouteEditing();
      } else if (e.key === 'Backspace' || (e.key === 'z' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        const route = routes.find((r) => r.id === routeId);
        const count = route?.points?.length ?? 0;
        if (count > 0) removeWaypoint(routeId!, count - 1);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editingRouteId]);

  // Stage 6B.3: Escape cancels the "place existing location" / "move
  // location" one-shot arming tools, same as every other one-shot tool's
  // explicit cancel button.
  useEffect(() => {
    if (
      !placingExistingLocationId &&
      !movingHotspotId &&
      !placingLibraryEntity &&
      !pendingPlacementPoint &&
      !placingNpcEntityId &&
      !placingContentEntity &&
      !placingBattleEntryId &&
      !linkMenuState &&
      !libraryDrawerOpen &&
      !objectWindowOpen &&
      companionStack.length === 0
    )
      return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setPlacingExistingLocationId(null);
        setMovingHotspotId(null);
        setPlacingLibraryEntity(null);
        // Stage 6C.2: Escape also closes the Existing Object Picker and
        // discards the pending placement point.
        setPendingPlacementPoint(null);
        // Stage 6C.4B: same one-shot cancel for the armed NPC placement.
        setPlacingNpcEntityId(null);
        // Stage 6C.4E: same one-shot cancel for armed Quest/Enemy/Image placement.
        setPlacingContentEntity(null);
        setPlacingBattleEntryId(null);
        // Stage 6C.4G: closes the link/place menu with zero side effects —
        // nothing was ever written to the store while it was open.
        setLinkMenuState(null);
        // Stage 6C.5: closes the Library drawer — purely a UI visibility
        // flag, never written to the store.
        setLibraryDrawerOpen(false);
        // Stage 6C.5 Phase 2: closes the large object window — nothing is
        // written by opening/viewing it, so this is a safe no-op cancel
        // (LocationDataTab/LocationLinksTab keep their own unsaved drafts
        // in `locationDataDraft`/`locationLinksDraft`, untouched here).
        setObjectWindowOpen(false);
        // Stage 6C.5 Phase 2G: closes the embedded companion window (and
        // its whole back stack) — purely a UI navigation stack, nothing
        // written by opening/browsing it.
        setCompanionStack([]);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    placingExistingLocationId,
    movingHotspotId,
    placingLibraryEntity,
    companionStack.length,
    pendingPlacementPoint,
    placingNpcEntityId,
    placingContentEntity,
    placingBattleEntryId,
    objectWindowOpen,
    linkMenuState,
    libraryDrawerOpen,
  ]);

  // Persist the live camera for the active map. Guarded so we never write back
  // a bogus camera computed before the viewport was actually measured (which
  // is exactly what caused cameras to "stick" in a broken position before).
  useEffect(() => {
    if (!earlyCameraKey) return;
    if (viewportSize.width <= 0 || viewportSize.height <= 0) return;
    if (!Number.isFinite(view.scale) || view.scale <= 0 || !Number.isFinite(view.x) || !Number.isFinite(view.y)) return;
    setCameraMap((prev) => {
      const next = { ...prev, [earlyCameraKey]: { scale: view.scale, x: view.x, y: view.y } };
      try {
        localStorage.setItem(CAMERA_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // ignore storage failures (private mode / quota)
      }
      return next;
    });
  }, [view, earlyCameraKey, viewportSize.width, viewportSize.height]);

  // Observer sync (Etap C): whenever the DM's timeline/scope/selection/camera
  // changes, push a focus update over BroadcastChannel so an open Observer
  // tab can follow along. Purely a side-channel broadcast — never reads
  // anything back, never blocks if no Observer tab is open (postMessage on a
  // channel with no listeners is a no-op).
  useEffect(() => {
    postObserverFocus({
      timelineId: store.currentTimelineId,
      scope,
      selectedLocationStateId: selectedLocationStateId ?? undefined,
      cameraView: view,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store.currentTimelineId, scope, selectedLocationStateId, view]);

  // Steps the party marker through partyTravelAnim.points one at a time.
  // store.setCurrentLocation already ran synchronously when the walk was
  // started, so this is purely the visual walk — clearing it at the end just
  // hands rendering back to the normal partyMarkerPoint (already correct).
  useEffect(() => {
    if (!partyTravelAnim) return;
    if (partyTravelAnim.index >= partyTravelAnim.points.length - 1) {
      // If a multi-segment route-network path is in progress, hand off to the
      // next queued segment instead of stopping — this is what makes the
      // party visibly walk through EVERY leg of a multi-hop path (e.g.
      // Docks → Walls/Gate → Market → Temple Quarter) rather than jumping
      // between legs.
      const t = setTimeout(() => {
        setPendingPathSegments((queue) => {
          if (queue.length === 0) {
            setPartyTravelAnim(null);
            setActivePathRouteIds([]);
            return queue;
          }
          const [next, ...rest] = queue;
          setPartyTravelAnim({ points: next.points, index: 0 });
          return rest;
        });
      }, 250);
      return () => clearTimeout(t);
    }
    const t = setTimeout(() => {
      setPartyTravelAnim((prev) => (prev ? { ...prev, index: prev.index + 1 } : prev));
    }, 450);
    return () => clearTimeout(t);
  }, [partyTravelAnim]);

  // Stage 6B.2: useActiveMapImageSize must be called unconditionally too —
  // computed here (using optional chaining since `data` may still be null on
  // the loading render) rather than after the guards below, for the exact
  // same hook-order reason explained in the comment immediately below.
  const mapForImageSize = data?.worldMaps.find((m) => m.scope === scope);
  const activeMapImageSize = useActiveMapImageSize(mapForImageSize);

  // Keep ALL hooks (useState/useEffect/useMemo/useCallback/custom hooks) above
  // this point. A hook declared after these guards only runs once `data` has
  // loaded, so the hook count differs between the loading and loaded renders
  // — React then unmounts the whole tree with a blank page and no visible
  // error (see docs/CAMPAIGN_MAP_WORKSPACE_SMOKE_CHECKLIST.md, "Hooks/runtime
  // smoke" — this exact bug shipped silently for several stages because
  // typecheck/build cannot catch it).
  if (loading) return <p className="page">Загрузка…</p>;
  if (error || !data) return <p className="page">Ошибка загрузки: {error}</p>;

  const calendar = store.getCalendar(store.currentTimelineId);

  const map = data.worldMaps.find((m) => m.scope === scope);
  const mapState = map
    ? data.worldMapStates.find((ms) => ms.mapId === map.id && ms.timelineId === store.currentTimelineId)
    : undefined;
  const hotspots = mapState ? data.hotspots.filter((h) => mapState.hotspotIds.includes(h.id)) : [];
  const routes = mapState ? data.routes.filter((r) => r.mapStateId === mapState.id) : [];
  const activeLayerVisibility = LAYER_PRESETS[layerPreset];
  const visibleRoutes = !activeLayerVisibility.routes
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? getPlayerSafeRoutes(routes)
      : routes;

  // Object placements scoped to the active arc + map level + specific map.
  // Hidden/archived placements are never shown in Player View regardless of
  // the layer toggle; the layer toggle only controls DM-side visibility.
  const activeTimelineForPlacements = data.timelines.find((t) => t.id === store.currentTimelineId);
  const activeArcId = activeTimelineForPlacements?.arcId;
  // Entities with no arcId at all are treated as shared/global (old seed data
  // that predates per-entity arc tagging); entities tagged with a DIFFERENT
  // arc's id are excluded — this is the arc-isolation boundary for every
  // "browse and place an existing card" list (entity-cards tab, link editor).
  const npcsForArc = data.npcs.filter((n) => !n.arcId || n.arcId === activeArcId);
  const questsForArc = data.quests.filter((q) => !q.arcId || q.arcId === activeArcId);
  const enemiesForArc = data.enemies.filter((en) => !en.arcId || en.arcId === activeArcId);
  const imagesForArc = data.images.filter((im) => !im.arcId || im.arcId === activeArcId);
  const battleMapsForArc = data.battleMaps;
  const placementsForMap = map
    ? data.placements.filter(
        (p) => p.arcId === activeTimelineForPlacements?.arcId && p.mapLevel === scope && (!p.mapId || p.mapId === map.id),
      )
    : [];
  // Player-view filtering delegates to the Player Safe Projection module
  // (src/data/playerSafeProjection.ts) so the DM-only exclusion rules live in
  // one place instead of being re-derived inline at every call site.
  const visiblePlacements = !store.placementLayerVisible || !activeLayerVisibility.placements
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? getPlayerSafePlacements(placementsForMap)
      : placementsForMap.filter((p) => p.status !== 'archived' && (p.status !== 'hidden' || isEditMode));

  const visibleHotspots = !activeLayerVisibility.locations
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? getPlayerSafeHotspots(data, store.progress, hotspots)
      : hotspots;

  // Faction Zones (Stage 4A) — scoped to current timeline + map level/id,
  // exactly like the placement-scoping pattern above. DM-side branches read
  // store.factionZonesById directly (mirrors eventsById); any player-facing
  // branch (isPlayerView or a usesPlayerSafeProjection preset) ALWAYS routes
  // through getPlayerSafeFactionZones() — never the raw map.
  const factionZonesForMap = Object.values(store.factionZonesById).filter(
    (z) => z.timelineId === store.currentTimelineId && (!z.mapLevel || z.mapLevel === scope) && (!z.mapId || !map || z.mapId === map.id),
  );
  const visibleFactionZones = !activeLayerVisibility.factionZones
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? getPlayerSafeFactionZones(factionZonesForMap)
      : factionZonesForMap;

  // Dynamic Map Overlays (Stage 4B) — scoped to current timeline + map
  // level/id exactly like Faction Zones above. DM-side branches read
  // store.dynamicMapOverlaysById directly; any player-facing branch ALWAYS
  // routes through getPlayerSafeDynamicMapOverlays() — never the raw map.
  const dynamicOverlaysForMap = Object.values(store.dynamicMapOverlaysById).filter(
    (o) => o.timelineId === store.currentTimelineId && (!o.mapLevel || o.mapLevel === scope) && (!o.mapId || !map || o.mapId === map.id),
  );
  const visibleDynamicOverlays = !activeLayerVisibility.dynamicOverlays
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? getPlayerSafeDynamicMapOverlays(dynamicOverlaysForMap)
      : dynamicOverlaysForMap;
  // Only active overlays are ever painted on the map canvas — an inactive
  // overlay still exists in the list/panel (so the DM can re-activate it
  // later) but renders nothing.
  const renderedDynamicOverlays = visibleDynamicOverlays.filter((o) => o.active === true);

  // Movable Entities (Stage 4B) — scoped to current timeline + map exactly
  // like the above. There is no map renderer yet (see report/TODO), so the
  // DM-only data management panel below reads `movableEntitiesForMap`
  // directly rather than `visibleMovableEntities`; the projected/layer-gated
  // version is still computed here so a future Stage 4C renderer can wire it
  // in without re-deriving this scoping/projection logic from scratch.
  const movableEntitiesForMap = Object.values(store.movableEntitiesById).filter(
    (m) => m.timelineId === store.currentTimelineId && (!m.currentMapId || !map || m.currentMapId === map.id),
  );
  // Player-facing projection — always [] today (see getPlayerSafeMovableEntities's
  // doc comment), but computed here so the `movableEntities` layer-preset flag
  // actually gates something real and a future Stage 4C renderer has this
  // ready to consume instead of re-deriving it.
  const visibleMovableEntities: MovableEntity[] = !activeLayerVisibility.movableEntities
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? getPlayerSafeMovableEntities(movableEntitiesForMap)
      : movableEntitiesForMap;

  // Battle Entries (Stage 5A) — scoped to current timeline + map level/id
  // exactly like Faction Zones/Dynamic Overlays above. DM-side branches read
  // store.battleEntriesById directly; any player-facing branch ALWAYS routes
  // through getPlayerSafeBattleEntries() — never the raw map.
  const battleEntriesForMap = Object.values(store.battleEntriesById).filter(
    (be) => be.timelineId === store.currentTimelineId && (!be.mapLevel || be.mapLevel === scope) && (!be.sourceMapId || !map || be.sourceMapId === map.id),
  );
  const visibleBattleEntries: BattleEntry[] = !activeLayerVisibility.battleEntries
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? getPlayerSafeBattleEntries(battleEntriesForMap)
      : battleEntriesForMap;

  // Player-visible CampaignEvents for the current map+timeline, ALWAYS
  // sourced from getPlayerSafeEvents() — never read store.eventsById
  // directly in a player-facing render path. Only used when the active
  // layer preset/mode is player-facing (player_safe/observer presets, or
  // Player View itself); DM-side panels keep using sessionCampaignEvents
  // (defined further below) which intentionally shows DM-only events too.
  const eventsForTimeline = Object.values(store.eventsById).filter((ev) => ev.timelineId === store.currentTimelineId);
  const playerSafeEventsForTimeline = getPlayerSafeEvents(eventsForTimeline);
  const eventsForCurrentMap = playerSafeEventsForTimeline.filter(
    (ev) => (!ev.mapLevel || ev.mapLevel === scope) && (!ev.mapId || !map || ev.mapId === map.id),
  );
  const visibleCampaignEventMarkers = !activeLayerVisibility.events
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? eventsForCurrentMap.filter((ev) => !!ev.position)
      : [];
  // Events with no `position` can't be placed on the map shell at all — list
  // them in a small fallback panel instead (rendered below the map area).
  const playerSafeEventsWithoutPosition = !activeLayerVisibility.events
    ? []
    : isPlayerView || activeLayerVisibility.usesPlayerSafeProjection
      ? eventsForCurrentMap.filter((ev) => !ev.position)
      : [];

  const locationsForTimeline = data.locationStates.filter((ls) => ls.timelineId === store.currentTimelineId);
  const filteredLocations = locationsForTimeline.filter((ls) =>
    ls.title.toLowerCase().includes(locationSearch.toLowerCase()),
  );

  const partyLocationState = store.party.currentLocationStateId
    ? getLocationState(data, store.party.currentLocationStateId)
    : undefined;
  const partyHotspot = partyLocationState ? hotspots.find((h) => h.locationStateId === partyLocationState.id) : undefined;
  // The party marker's screen position. When the party arrived via a known
  // route AND that route actually touches the current hotspot, snap to the
  // route's matching endpoint (route.points[0] or [last]) instead of the
  // hotspot — they're usually pixel-identical, but this guarantees the
  // marker visibly sits ON the polyline, never floating off it. Pure
  // metadata lookup; never draws or computes a direct location→location line.
  const activePartyRoute = store.party.currentPartyRouteId
    ? data.routes.find((r) => r.id === store.party.currentPartyRouteId)
    : undefined;
  const partyMarkerPoint = (() => {
    if (!partyHotspot) return undefined;
    const pts = activePartyRoute?.points;
    if (activePartyRoute && pts && pts.length >= 2) {
      if (activePartyRoute.toHotspotId === partyHotspot.id) return pts[pts.length - 1];
      if (activePartyRoute.fromHotspotId === partyHotspot.id) return pts[0];
    }
    return { x: partyHotspot.x, y: partyHotspot.y };
  })();

  // "Fit to screen" base scale: largest scale at which the whole 1280x853
  // image still fits inside the measured viewport (classic letterbox/contain
  // fit). The user's zoom (view.scale) multiplies on top of this base.
  const baseFitScale =
    viewportSize.width > 0 && viewportSize.height > 0
      ? Math.min(viewportSize.width / activeMapImageSize.width, viewportSize.height / activeMapImageSize.height)
      : 1;
  const renderedImageWidth = activeMapImageSize.width * baseFitScale;
  const renderedImageHeight = activeMapImageSize.height * baseFitScale;
  // Center the fitted image inside the viewport before any user pan offset.
  const fitOffsetX = (viewportSize.width - renderedImageWidth) / 2;
  const fitOffsetY = (viewportSize.height - renderedImageHeight) / 2;

  const hasRealArt = !!map?.backgroundImageSrc && !mapState?.needsArtReview;
  const showNoMapPlaceholder = !map || !mapState;

  // If a selected/URL location id no longer resolves (e.g. it was deleted, or
  // belongs to a different arc than the one now active), fall back to the
  // party's current location rather than showing a dead selection.
  const selectedLs =
    (selectedLocationStateId ? getLocationState(data, selectedLocationStateId) : undefined) ??
    (selectedLocationStateId ? partyLocationState : undefined);
  const selectedVisible = selectedLs ? !isPlayerView || isLocationVisibleToPlayers(selectedLs, store.progress) : false;

  function selectLocation(id: string) {
    setSelectedLocationStateId(id);
  }

  // ---------- zoom / pan ----------
  function clampScale(s: number) {
    return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
  }

  function zoomBy(factor: number) {
    setView((v) => ({ ...v, scale: clampScale(v.scale * factor) }));
  }

  function resetView() {
    setView({ scale: 1, x: 0, y: 0 });
  }

  function handleWheel(e: WheelEvent<HTMLDivElement>) {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.1 : 0.9;
    setView((v) => ({ ...v, scale: clampScale(v.scale * factor) }));
  }

  function handleMapMouseDownForPan(e: MouseEvent<HTMLDivElement>) {
    // In edit mode with hotspot placement armed, clicks place a new hotspot, not pan.
    if (isEditMode && placingHotspot) return;
    // While actively marking a route's path or placing an object, every click
    // must add a point/placement exactly where clicked — even a tiny pan drift
    // mid-click would throw the new point off. Same guard for an active drag.
    if (editingRouteId || placementMode || zoneDraft || editingZoneId) return;
    if (draggingId || draggingWaypoint || draggingPlacementId || draggingZoneVertex) return;
    panState.current = { panning: true, startX: e.clientX, startY: e.clientY, origX: view.x, origY: view.y };
  }

  function handleMapMouseMovePan(e: MouseEvent<HTMLDivElement>) {
    if (panState.current.panning) {
      const dx = e.clientX - panState.current.startX;
      const dy = e.clientY - panState.current.startY;
      setView((v) => ({ ...v, x: panState.current.origX + dx, y: panState.current.origY + dy }));
    }
    handleMapMouseMoveHotspotDrag(e);
    handleMapMouseMoveWaypointDrag(e);
    handleMapMouseMovePlacementDrag(e);
    handleMapMouseMoveZoneVertexDrag(e);
  }

  function handleMapMouseUpPan() {
    panState.current.panning = false;
    // Capture BEFORE clearing — only suppress the next click if an actual
    // drag (waypoint/hotspot/placement/zone-vertex) was in progress when the
    // mouse went up.
    if (draggingId || draggingWaypoint || draggingPlacementId || draggingZoneVertex) {
      suppressNextClickRef.current = true;
    }
    handleMapMouseUpHotspotDrag();
    handleMapMouseUpWaypointDrag();
    handleMapMouseUpPlacementDrag();
    handleMapMouseUpZoneVertexDrag();
  }

  // ---------- object placement editing (DM Edit Mode) ----------
  function handlePlacementMouseDown(id: string, e: MouseEvent) {
    if (!isEditMode) return;
    e.stopPropagation();
    setDraggingPlacementId(id);
  }

  function handleMapMouseMovePlacementDrag(e: MouseEvent<HTMLDivElement>) {
    if (!draggingPlacementId || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    store.patchPlacement(draggingPlacementId, { position: { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } });
  }

  function handleMapMouseUpPlacementDrag() {
    setDraggingPlacementId(null);
  }

  // Single chokepoint enforcing tool mutual exclusivity: every "start tool X"
  // action calls this first, so switching tools always cleanly cancels
  // whatever was active before — never two tools armed at once.
  function cancelAllEditTools() {
    setPlacingHotspot(false);
    setPlacementMode(null);
    setRouteDraft(null);
    setRouteEditorError(null);
    setLocationPlacementDraft(null);
    setLocationPlacementError(null);
    setQuickPinArming(false);
    setQuickPinDraft(null);
    if (editingRouteId) cancelRouteEditing();
    setZoneDraft(null);
    setEditingZoneId(null);
    setSelectedZoneVertexIndex(null);
    // Movable Entity manual-move arming (Stage 4C) is also a one-shot
    // "next click does X" tool exactly like quickPinArming/placementMode
    // above — clear it here too so starting any OTHER tool (route edit,
    // area edit, placement, quick pin) can never leave a stale armed move
    // waiting to hijack that tool's first map click.
    setManualMoveArmedForEntityId(null);
    // Battle Entry creation arming (Stage 5A) is the same one-shot "next click
    // does X" tool as the others above.
    setBattleEntryCreationArmed(false);
    // Stage 6B.3 one-shot arming tools — same pattern.
    setPlacingExistingLocationId(null);
    setMovingHotspotId(null);
    // Stage 6C one-shot arming tool — same pattern.
    setPlacingLibraryEntity(null);
    // Stage 6C.2 — closes the Existing Object Picker and discards the
    // captured point, exactly like every other one-shot tool above.
    setPendingPlacementPoint(null);
    // Stage 6C.4B one-shot arming tool — same pattern.
    setPlacingNpcEntityId(null);
    // Stage 6C.4E one-shot arming tool — same pattern.
    setPlacingContentEntity(null);
    setPlacingBattleEntryId(null);
    // Stage 6C.4G — closing any other tool also closes the link/place menu;
    // nothing was written while it was open, so this is a pure no-op cancel.
    setLinkMenuState(null);
    // Stage 6C.5 — starting any other tool also closes the Library drawer.
    setLibraryDrawerOpen(false);
    // Stage 6C.5 Phase 2 — starting any other tool also closes the large
    // object window.
    setObjectWindowOpen(false);
    // Stage 6C.5 Phase 2G — starting any other tool also closes the
    // embedded companion window/back stack.
    setCompanionStack([]);
  }

  // Pending Trigger Review MVP — "Apply" for effect.type === 'create_event'
  // actually creates a CampaignEvent from the payload and marks the trigger
  // 'triggered' (consistent with archiveCampaignEvent/ARCHIVE_* elsewhere:
  // status flips, the trigger record itself is never deleted). Any other
  // effect type is NOT automated — the panel below shows a manual fallback
  // button instead of calling this.
  function applyCreateEventTrigger(trigger: DelayedTrigger) {
    const payload = trigger.effect.payload as Partial<CampaignEvent>;
    const now = new Date().toISOString();
    const calendarNow = store.getCalendar(trigger.timelineId);
    const newEvent: CampaignEvent = {
      id: `event-${Date.now()}`,
      timelineId: trigger.timelineId,
      mapId: trigger.mapId,
      mapLevel: trigger.mapLevel,
      name: (payload.name as string | undefined) ?? trigger.name,
      type: (payload.type as CampaignEvent['type'] | undefined) ?? 'note',
      description: (payload.description as string | undefined) ?? trigger.description,
      linkedLocationStateIds: trigger.linkedLocationStateId ? [trigger.linkedLocationStateId] : undefined,
      linkedQuestIds: trigger.linkedQuestId ? [trigger.linkedQuestId] : undefined,
      linkedRouteIds: trigger.routeId ? [trigger.routeId] : undefined,
      date: { day: calendarNow.currentDay, month: calendarNow.currentMonth, year: calendarNow.currentYear },
      timeOfDay: calendarNow.currentTimeOfDay,
      visibleInPlayerView: false,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    };
    store.addCampaignEvent(newEvent);
    store.markDelayedTriggerTriggered(trigger.id);
  }

  // Manual fallback for any trigger effect type not automated yet — always
  // creates a fresh DM-authored CampaignEvent (same shape as the existing
  // "+ Событие текущей сессии" button) referencing the trigger by name, then
  // marks the trigger triggered so it drops out of the pending list.
  function createEventManuallyForTrigger(trigger: DelayedTrigger) {
    const now = new Date().toISOString();
    const calendarNow = store.getCalendar(trigger.timelineId);
    const newEvent: CampaignEvent = {
      id: `event-${Date.now()}`,
      timelineId: trigger.timelineId,
      mapId: trigger.mapId,
      mapLevel: trigger.mapLevel,
      name: trigger.name,
      type: 'note',
      description: trigger.description,
      linkedLocationStateIds: trigger.linkedLocationStateId ? [trigger.linkedLocationStateId] : undefined,
      linkedQuestIds: trigger.linkedQuestId ? [trigger.linkedQuestId] : undefined,
      linkedRouteIds: trigger.routeId ? [trigger.routeId] : undefined,
      date: { day: calendarNow.currentDay, month: calendarNow.currentMonth, year: calendarNow.currentYear },
      timeOfDay: calendarNow.currentTimeOfDay,
      visibleInPlayerView: false,
      status: 'planned',
      createdAt: now,
      updatedAt: now,
    };
    store.addCampaignEvent(newEvent);
    store.markDelayedTriggerTriggered(trigger.id);
  }

  function startPlacement(entityKind: MapObjectPlacement['entityKind'], entityId: string | undefined, title: string) {
    cancelAllEditTools();
    setPlacementMode({ entityKind, entityId, title });
    setDrawer(null);
  }

  // Clicking a marker ALWAYS opens the placement's own drawer first — never
  // jumps straight to the linked entity. The placement (a local-overlay
  // object) and the entity (source/reference data) are deliberately two
  // separate "open" actions, so the marker itself stays controllable (move/
  // hide/delete) even when it points at something real. The placement drawer
  // has its own "Открыть связанную карточку" button for the second step.
  function openPlacementDrawer(p: MapObjectPlacement) {
    setSelectedPlacementId(p.id);
    setDrawer({ kind: 'placement', id: p.id });
  }

  function placementEntityExists(p: MapObjectPlacement): boolean {
    if (!p.entityId) return false;
    switch (p.entityKind) {
      case 'npc':
        return data!.npcs.some((x) => x.id === p.entityId);
      case 'quest':
        return data!.quests.some((x) => x.id === p.entityId);
      case 'enemy':
        return data!.enemies.some((x) => x.id === p.entityId);
      case 'image':
        return data!.images.some((x) => x.id === p.entityId);
      case 'battleMap':
        return data!.battleMaps.some((x) => x.id === p.entityId);
      case 'location':
        return !!getLocationState(data!, p.entityId);
      default:
        return false;
    }
  }

  function openLinkedEntity(p: MapObjectPlacement) {
    if (!p.entityId || !placementEntityExists(p)) return;
    if (p.entityKind === 'location') {
      selectLocation(p.entityId);
      setDrawer(null);
      return;
    }
    if (p.entityKind === 'note' || p.entityKind === 'custom') return;
    setDrawer({ kind: p.entityKind, id: p.entityId } as DrawerState);
  }

  // ---------- hotspot editing (DM Edit Mode) ----------
  // Click-first creation flow: the DM arms placement mode ("Создать hotspot"),
  // then clicks anywhere on the map to drop a new unassigned hotspot, which is
  // immediately selected so the inspector panel can be used to assign its
  // location, label, icon, etc. This avoids forcing the DM to pick a location
  // from a dropdown before knowing where it'll land on the map.
  function handleMapClick(e: MouseEvent<HTMLDivElement>) {
    if (panState.current.panning) return;
    // See suppressNextClickRef declaration: the click that the browser fires
    // right after releasing a drag must never be treated as a fresh "add
    // point" / "place object" click — consume the flag and bail out once.
    if (suppressNextClickRef.current) {
      suppressNextClickRef.current = false;
      return;
    }
    // Movable Entity manual move (Stage 4C, Step 5 flow 1): armed via
    // "Переместить вручную" in the entity panel — the next plain map click
    // sets currentPosition directly (no event created automatically; the DM
    // creates one afterward via a separate explicit button if they want one).
    if (manualMoveArmedForEntityId && mapRef.current && map) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      store.updateMovableEntity(manualMoveArmedForEntityId, { currentPosition: { x, y } });
      setManualMoveArmedForEntityId(null);
      return;
    }
    // Stage 6B.3: place an existing unplaced LocationState on the map —
    // armed via "Разместить на текущей карте" in the Unplaced panel. Only
    // ever creates a MapHotspot; the LocationState already exists and is
    // untouched. Out-of-bounds clicks (outside the rendered map element)
    // are not possible here since rect is the map element itself, matching
    // every other placement tool's bounds check.
    if (placingExistingLocationId && mapRef.current && map && mapState) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      const targetLs = data?.locationStates.find((ls) => ls.id === placingExistingLocationId);
      const newHotspot: MapHotspot = {
        id: `hotspot-${Date.now()}`,
        mapId: map.id,
        timelineId: store.currentTimelineId,
        locationStateId: placingExistingLocationId,
        x,
        y,
        label: targetLs?.title ?? '',
        visibleInPlayerView: targetLs?.visibleToPlayers ?? false,
      };
      store.addHotspot(newHotspot);
      store.patchWorldMapState(mapState.id, { hotspotIds: [...mapState.hotspotIds, newHotspot.id] });
      setPlacingExistingLocationId(null);
      setSelectedHotspotId(newHotspot.id);
      return;
    }
    // Stage 6B.3: re-place ("move") an existing MapHotspot — armed via
    // "Переместить локацию". Updates the existing hotspot's position only;
    // never creates a duplicate. Observer/Player Safe views only ever read
    // the persisted hotspot position, so there is no intermediate/ghost
    // position visible to them mid-drag — the position only changes once
    // this click fires and the store update lands.
    if (movingHotspotId && mapRef.current && map) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      store.patchHotspot(movingHotspotId, { x, y });
      setMovingHotspotId(null);
      setSelectedHotspotId(movingHotspotId);
      return;
    }
    // Stage 6C: place a read-only DM Companion library record (DmTavern/
    // DmShop) on the map — armed via "Разместить на карте" in the
    // Библиотека tab. Materializes exactly one new LocationState + hotspot
    // from the library record (never edits/duplicates the source record
    // itself), tagged with sourceLibraryId/-Type so the card immediately
    // shows "Размещено" and a second placement is blocked from the panel.
    if (placingLibraryEntity && data && mapRef.current && map && mapState) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      const { type, sourceId, title } = placingLibraryEntity;
      const locId = `lib-${type}-${sourceId}`;
      const locationStateId = `${locId}__${store.currentTimelineId}`;
      if (type === 'tavern') {
        const src = data.taverns.find((t) => t.id === sourceId);
        const newLocationState: LocationState = {
          id: locationStateId,
          locationId: locId,
          timelineId: store.currentTimelineId,
          title: src?.name ?? title,
          type: 'tavern',
          publicDescription: src?.description ?? '',
          status: 'known',
          childLocationStateIds: [],
          npcIds: [],
          questIds: [],
          enemyIds: [],
          imageIds: [],
          isCustom: true,
          visibleToPlayers: true,
          sourceLibraryId: sourceId,
          sourceLibraryType: 'tavern',
          tavernDetails: {
            ownerNpcId: src?.ownerNpcId,
            roomsServices: src?.rooms?.map((r) => r.name).join(', '),
            rumors: src?.rumors?.join(' / '),
          },
        };
        store.addLocationState(newLocationState);
      } else {
        const src = data.shops.find((s) => s.id === sourceId);
        const newLocationState: LocationState = {
          id: locationStateId,
          locationId: locId,
          timelineId: store.currentTimelineId,
          title: src?.name ?? title,
          type: 'shop',
          publicDescription: src?.description ?? '',
          status: 'known',
          childLocationStateIds: [],
          npcIds: [],
          questIds: [],
          enemyIds: [],
          imageIds: [],
          isCustom: true,
          visibleToPlayers: true,
          sourceLibraryId: sourceId,
          sourceLibraryType: 'shop',
          shopDetails: {
            shopType: src?.type,
            ownerNpcId: src?.ownerNpcId,
            goodsServices: src?.services?.join(', '),
          },
        };
        store.addLocationState(newLocationState);
      }
      const newHotspot: MapHotspot = {
        id: `hotspot-${Date.now()}`,
        mapId: map.id,
        timelineId: store.currentTimelineId,
        locationStateId,
        x,
        y,
        label: title,
        visibleInPlayerView: true,
      };
      store.addHotspot(newHotspot);
      store.patchWorldMapState(mapState.id, { hotspotIds: [...mapState.hotspotIds, newHotspot.id] });
      setPlacingLibraryEntity(null);
      setSelectedHotspotId(newHotspot.id);
      return;
    }
    // Stage 6C.4B: standalone NPC marker placement armed via "Разместить на
    // карте" in the Library panel's NPC section — same one-shot
    // arm-then-click pattern as placingLibraryEntity above.
    if (placingNpcEntityId && mapRef.current && map) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      const npcTitle = data?.npcs.find((n) => n.id === placingNpcEntityId)?.name ?? placingNpcEntityId;
      maybeOpenLinkMenuOrPlace('npc', placingNpcEntityId, npcTitle, { x, y });
      setPlacingNpcEntityId(null);
      return;
    }
    // Stage 6C.4E: standalone Quest/Enemy/Image marker placement armed via
    // "Разместить на карте" in the Library panel — same one-shot
    // arm-then-click pattern as placingNpcEntityId above.
    if (placingContentEntity && mapRef.current && map) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      const { type: contentType, sourceId: contentSourceId } = placingContentEntity;
      const contentTitle =
        contentType === 'quest'
          ? data?.quests.find((q) => q.id === contentSourceId)?.title
          : contentType === 'enemy'
            ? data?.enemies.find((en) => en.id === contentSourceId)?.name
            : data?.images.find((im) => im.id === contentSourceId)?.title;
      maybeOpenLinkMenuOrPlace(contentType, contentSourceId, contentTitle ?? contentSourceId, { x, y });
      setPlacingContentEntity(null);
      return;
    }
    // Stage 6C.4E: standalone BattleEntry "Разместить на карте" armed from
    // the Library panel — same one-shot arm-then-click pattern.
    if (placingBattleEntryId && mapRef.current && map) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      const beTitle = store.battleEntriesById[placingBattleEntryId]?.name ?? placingBattleEntryId;
      maybeOpenLinkMenuOrPlace('battleEntry', placingBattleEntryId, beTitle, { x, y });
      setPlacingBattleEntryId(null);
      return;
    }
    // Battle Entry creation (Stage 5A, Step 7): armed via "Новая боевая сцена"
    // — next click drops a draft at that point (form shown below; nothing
    // saved until "Сохранить"). No enemy-placement automation.
    if (battleEntryCreationArmed && mapRef.current && map) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      setBattleEntryCreationArmed(false);
      setEditingBattleEntryId(null);
      setBattleEntryDraft({
        x,
        y,
        name: '',
        status: 'prepared',
        sceneSize: 'standard_30x30',
        recommendedPartyLevel: '',
        battleMapId: '',
        battleMapUrl: '',
        visibleInPlayerView: false,
        description: '',
        playerSafeDescription: '',
      });
      return;
    }
    // Quick Pin (Etap H): armed via the "Quick Pin" button — next click drops
    // a draft pin (form shown below; nothing saved until "Сохранить").
    if (quickPinArming && mapRef.current && map) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      setQuickPinArming(false);
      setQuickPinDraft({ x, y, title: '', visibleInPlayerView: false });
      return;
    }
    // Placement mode works in both DM View and DM Edit (only the trigger
    // button is hidden in Player View) — armed via "Разместить на карте".
    if (placementMode && mapRef.current && map) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      const newPlacement: MapObjectPlacement = {
        id: `placement-${Date.now()}`,
        arcId: activeTimelineForPlacements?.arcId ?? store.currentTimelineId,
        mapLevel: scope,
        mapId: map.id,
        entityKind: placementMode.entityKind,
        entityId: placementMode.entityId,
        title: placementMode.title,
        position: { x, y },
        visibleInPlayerView: false,
        status: 'active',
        createdAt: new Date().toISOString(),
      };
      store.addPlacement(newPlacement);
      setPlacementMode(null);
      return;
    }
    if (!isEditMode) {
      // Plain click on empty map area in non-edit mode deselects.
      setSelectedHotspotId(null);
      return;
    }
    // Area Edit Mode (Stage 4A) — creating a new zone: each click adds a
    // vertex to the in-progress polygon (same click-to-add pattern as the
    // route builder, never drag-to-draw).
    if (zoneDraft && mapRef.current) {
      const rect = mapRef.current.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
      const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
      setZoneDraft({ ...zoneDraft, points: [...zoneDraft.points, { x, y }] });
      return;
    }
    // Area Edit Mode — editing an existing zone: clicking the map while a
    // zone is being edited appends a new vertex to its polygon (acceptable
    // Stage 4A MVP per the brief; precise edge-click insertion is skipped —
    // see report/TODO below).
    // TODO(stage-4b): edge-click vertex insertion (insert a vertex at the
    // nearest point on the polygon's nearest edge instead of always
    // appending to the end) — skipped for Stage 4A as a nontrivial addition.
    if (editingZoneId && mapRef.current) {
      const zone = store.factionZonesById[editingZoneId];
      if (zone) {
        const rect = mapRef.current.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
        const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
        store.updateFactionZone(zone.id, { polygon: [...zone.polygon, { x, y }] });
        return;
      }
    }
    if (editingRouteId && mapRef.current) {
      const route = routes.find((r) => r.id === editingRouteId);
      if (route) {
        const rect = mapRef.current.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000));
        const y = Math.min(1, Math.max(0, Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000));
        store.patchRoute(route.id, { points: [...(route.points ?? []), { x, y }] });
        return;
      }
    }
    if (!placingHotspot) {
      // Plain click on empty map area while not placing: deselect.
      setSelectedHotspotId(null);
      return;
    }
    if (!data || !mapRef.current || !map || !mapState) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 1000;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 1000;
    // Stage 6C.2: nothing is created yet. The clicked point becomes a
    // pending placement point and opens the Existing Object Picker by
    // default (see ObjectPickerModal below) — "Создать новый объект"
    // inside that picker is what now opens the old locationPlacementDraft
    // form via openNewLocationFormAtPendingPoint().
    setPlacingHotspot(false);
    setObjectPickerSearch('');
    setObjectPickerTab('locations');
    setPendingPlacementPoint({ x, y });
  }

  function openNewLocationFormAtPendingPoint() {
    if (!pendingPlacementPoint) return;
    setLocationPlacementError(null);
    setLocationPlacementDraft({
      x: pendingPlacementPoint.x,
      y: pendingPlacementPoint.y,
      title: '',
      type: 'custom',
      publicDescription: '',
      dmNotes: '',
      status: 'known',
      visibleToPlayers: true,
    });
    setPendingPlacementPoint(null);
  }

  /**
   * Stage 6C.4B — places an existing NPC as a standalone map marker, reusing
   * the existing `MovableEntity` model (entityType:'npc') rather than
   * inventing a parallel marker type. Duplicate-prevention: if a
   * MovableEntity already exists ANYWHERE for this NPC (any arc/map — an
   * NPC is one person, never two markers), it is MOVED here (re-targeted to
   * the current map/arc/position) instead of creating a second one — the
   * "move existing marker here" MVP default the spec calls for. The NPC
   * source record itself (`DmNpc`) is never read-write here, only
   * referenced by id via `entityId`, exactly like every other
   * MovableEntity.entityId usage in this file.
   */
  /** Stage 6C.4C — opens the NPC editor draft for an existing NPC, prefilled
   * from its current (possibly already-overlay-patched) field values. Shared
   * by every entry point (Library card, NPC marker panel). */
  function openNpcEditor(npc: { id: string; name: string; role?: string; faction?: string; publicDescription?: string; dmNotes?: string; visibleToPlayers?: boolean; image?: string }) {
    setNpcEditDraft({
      npcId: npc.id,
      name: npc.name,
      role: npc.role ?? '',
      faction: npc.faction ?? '',
      publicDescription: npc.publicDescription ?? '',
      dmNotes: npc.dmNotes ?? '',
      visibleToPlayers: npc.visibleToPlayers !== false,
      image: npc.image ?? '',
    });
  }

  /** Stage 6C.4D — same prefill pattern as openNpcEditor, for the remaining
   * supported card types. */
  function openTavernEditor(t: DmTavern) {
    setTavernEditDraft({
      tavernId: t.id,
      name: t.name,
      description: t.description ?? '',
      notes: t.notes ?? '',
      image: t.imageOverrideId ?? '',
    });
  }
  function openShopEditor(s: DmShop) {
    setShopEditDraft({
      shopId: s.id,
      name: s.name,
      description: s.description ?? '',
      notes: s.notes ?? '',
      image: s.image ?? '',
    });
  }
  function openImageEditor(img: DmImageItem) {
    setImageEditDraft({ imageId: img.id, title: img.title });
  }
  function openBattleEntryEditor(be: BattleEntry) {
    setBattleEntryEditDraft({
      battleEntryId: be.id,
      name: be.name,
      description: be.description ?? '',
      playerSafeDescription: be.playerSafeDescription ?? '',
      previewImageId: be.previewImageId ?? '',
    });
  }

  function placeOrMoveNpcMovableEntity(npcId: string, point: { x: number; y: number }) {
    if (!map) return;
    const existing = Object.values(store.movableEntitiesById).find(
      (m) => m.entityType === 'npc' && m.entityId === npcId,
    );
    if (existing) {
      store.updateMovableEntity(existing.id, {
        currentMapId: map.id,
        mapLevel: scope,
        timelineId: store.currentTimelineId,
        currentPosition: point,
        movementState: existing.movementState === 'hidden' ? existing.movementState : 'stationary',
        updatedAt: new Date().toISOString(),
      });
      setSelectedMovableEntityId(existing.id);
      return;
    }
    const id = `movable-npc-${npcId}`;
    store.upsertMovableEntity({
      id,
      entityType: 'npc',
      entityId: npcId,
      timelineId: store.currentTimelineId,
      currentMapId: map.id,
      mapLevel: scope,
      currentPosition: point,
      movementState: 'stationary',
      visibleInPlayerView: false,
      updatedAt: new Date().toISOString(),
    });
    setSelectedMovableEntityId(id);
  }

  /** Stage 6C.4E — same "one marker per source entity, move it if it
   * already exists anywhere" dedup rule as placeOrMoveNpcMovableEntity
   * above, generalized to Quest/Enemy/Image. The source DmQuest/
   * DmCustomEnemy/DmImageItem record itself is never read-write here, only
   * referenced by id via `entityId`. */
  function placeOrMoveContentMarker(type: 'quest' | 'enemy' | 'image', sourceId: string, point: { x: number; y: number }) {
    if (!map) return;
    const existing = Object.values(store.movableEntitiesById).find(
      (m) => m.entityType === type && m.entityId === sourceId,
    );
    if (existing) {
      store.updateMovableEntity(existing.id, {
        currentMapId: map.id,
        mapLevel: scope,
        timelineId: store.currentTimelineId,
        currentPosition: point,
        movementState: existing.movementState === 'hidden' ? existing.movementState : 'stationary',
        updatedAt: new Date().toISOString(),
      });
      setSelectedMovableEntityId(existing.id);
      return;
    }
    const id = `movable-${type}-${sourceId}`;
    store.upsertMovableEntity({
      id,
      entityType: type,
      entityId: sourceId,
      timelineId: store.currentTimelineId,
      currentMapId: map.id,
      mapLevel: scope,
      currentPosition: point,
      movementState: 'stationary',
      visibleInPlayerView: false,
      updatedAt: new Date().toISOString(),
    });
    setSelectedMovableEntityId(id);
  }

  /** Stage 6C.4E — moves an existing BattleEntry's own map position fields
   * (it already has sourceMapId/mapLevel/position; no MovableEntity marker
   * is created for it, unlike Quest/Enemy/Image, since BattleEntry already
   * carries its own position). Never creates a new BattleEntry — placement
   * via the picker only repositions one that already exists in
   * battleEntriesById. */
  function placeOrMoveBattleEntryAtPendingPoint(battleEntryId: string, point: { x: number; y: number }) {
    if (!map) return;
    store.updateBattleEntry(battleEntryId, {
      sourceMapId: map.id,
      mapLevel: scope,
      position: point,
    });
    setSelectedBattleEntryId(battleEntryId);
  }

  // Stage 6C.4F: accepts an optional explicit point so drag-and-drop (which
  // computes its own drop coordinate synchronously, in the same call, and
  // cannot rely on setPendingPlacementPoint()+immediate-read — React state
  // updates aren't synchronous, so reading pendingPlacementPoint right after
  // setting it would still see the OLD value) can call this directly without
  // going through the click-picker's pendingPlacementPoint state at all.
  // Every pre-existing call site (the picker) keeps working unchanged since
  // explicitPoint defaults to undefined and falls back to pendingPlacementPoint.
  function placeExistingLocationAtPendingPoint(locationStateId: string, explicitPoint?: { x: number; y: number }) {
    const point = explicitPoint ?? pendingPlacementPoint;
    if (!point || !map || !mapState || !data) return;
    const targetLs = data.locationStates.find((ls) => ls.id === locationStateId);
    const newHotspot: MapHotspot = {
      id: `hotspot-${Date.now()}`,
      mapId: map.id,
      timelineId: store.currentTimelineId,
      locationStateId,
      x: point.x,
      y: point.y,
      label: targetLs?.title ?? '',
      visibleInPlayerView: targetLs?.visibleToPlayers ?? false,
    };
    store.addHotspot(newHotspot);
    store.patchWorldMapState(mapState.id, { hotspotIds: [...mapState.hotspotIds, newHotspot.id] });
    setSelectedHotspotId(newHotspot.id);
    setPendingPlacementPoint(null);
  }

  // Stage 6C.4F: same explicitPoint escape hatch as placeExistingLocationAtPendingPoint above.
  function placeLibraryEntityAtPendingPoint(
    type: 'tavern' | 'shop',
    sourceId: string,
    title: string,
    explicitPoint?: { x: number; y: number },
  ) {
    const point = explicitPoint ?? pendingPlacementPoint;
    if (!point || !data || !map || !mapState) return;
    const { x, y } = point;
    const locId = `lib-${type}-${sourceId}`;
    const locationStateId = `${locId}__${store.currentTimelineId}`;
    if (type === 'tavern') {
      const src = data.taverns.find((t) => t.id === sourceId);
      const newLocationState: LocationState = {
        id: locationStateId,
        locationId: locId,
        timelineId: store.currentTimelineId,
        title: src?.name ?? title,
        type: 'tavern',
        publicDescription: src?.description ?? '',
        status: 'known',
        childLocationStateIds: [],
        npcIds: [],
        questIds: [],
        enemyIds: [],
        imageIds: [],
        isCustom: true,
        visibleToPlayers: true,
        sourceLibraryId: sourceId,
        sourceLibraryType: 'tavern',
        tavernDetails: {
          ownerNpcId: src?.ownerNpcId,
          roomsServices: src?.rooms?.map((r) => r.name).join(', '),
          rumors: src?.rumors?.join(' / '),
        },
      };
      store.addLocationState(newLocationState);
    } else {
      const src = data.shops.find((s) => s.id === sourceId);
      const newLocationState: LocationState = {
        id: locationStateId,
        locationId: locId,
        timelineId: store.currentTimelineId,
        title: src?.name ?? title,
        type: 'shop',
        publicDescription: src?.description ?? '',
        status: 'known',
        childLocationStateIds: [],
        npcIds: [],
        questIds: [],
        enemyIds: [],
        imageIds: [],
        isCustom: true,
        visibleToPlayers: true,
        sourceLibraryId: sourceId,
        sourceLibraryType: 'shop',
      };
      store.addLocationState(newLocationState);
    }
    const newHotspot: MapHotspot = {
      id: `hotspot-${Date.now()}`,
      mapId: map.id,
      timelineId: store.currentTimelineId,
      locationStateId,
      x,
      y,
      label: title,
      visibleInPlayerView: true,
    };
    store.addHotspot(newHotspot);
    store.patchWorldMapState(mapState.id, { hotspotIds: [...mapState.hotspotIds, newHotspot.id] });
    setSelectedHotspotId(newHotspot.id);
    setPendingPlacementPoint(null);
  }

  /** Stage 6C.4F — shared "move if already placed on THIS map, otherwise
   * place fresh" chokepoint for an existing LocationState's hotspot, reused
   * by both drag-and-drop and (going forward) any other Location placement
   * entry point. Deliberately does NOT move a hotspot that's on a DIFFERENT
   * map — that ambiguity is unchanged from the pre-existing Library/picker
   * "Уже размещено" disabled-button behavior; only same-map repositioning is
   * new here, exactly as the spec asked for. Returns a short status string
   * for caller feedback (drag/drop warning banner). */
  function placeOrMoveLocationAtPoint(locationStateId: string, point: { x: number; y: number }): 'moved' | 'placed' | 'elsewhere' {
    if (!map || !mapState) return 'elsewhere';
    const existingHere = hotspots.find((h) => h.locationStateId === locationStateId);
    if (existingHere) {
      store.patchHotspot(existingHere.id, point);
      setSelectedHotspotId(existingHere.id);
      return 'moved';
    }
    const existingElsewhere = data!.hotspots.find((h) => h.locationStateId === locationStateId);
    if (existingElsewhere) return 'elsewhere';
    placeExistingLocationAtPendingPoint(locationStateId, point);
    return 'placed';
  }

  /** Stage 6C.4F — same chokepoint as above, for Tavern/Shop library
   * records: if a LocationState already exists for this source (materialized
   * by an earlier "Разместить на карте"), delegate to
   * placeOrMoveLocationAtPoint; otherwise materialize it fresh via the
   * pre-existing placeLibraryEntityAtPendingPoint (Stage 6C). No new
   * materialization logic — only the "does it already exist" + "is it on
   * this map" lookups are new. */
  function placeOrMoveLibrarySourcedLocationAtPoint(
    type: 'tavern' | 'shop',
    sourceId: string,
    title: string,
    point: { x: number; y: number },
  ): 'moved' | 'placed' | 'elsewhere' {
    if (!data) return 'elsewhere';
    const ls = data.locationStates.find((x) => x.sourceLibraryType === type && x.sourceLibraryId === sourceId);
    if (!ls) {
      placeLibraryEntityAtPendingPoint(type, sourceId, title, point);
      return 'placed';
    }
    return placeOrMoveLocationAtPoint(ls.id, point);
  }

  /** Stage 6C.4G — the four content types this stage adds an explicit
   * link/place menu for. Location/Tavern/Shop are themselves location-like
   * objects and are deliberately excluded — they're never "linked as child
   * content" to another location, per spec. */
  type LinkableContentType = 'npc' | 'quest' | 'enemy' | 'battleEntry' | 'image';

  /** Stage 6C.4G — finds the single nearest visible (non-hidden) location on
   * the CURRENT map within a small normalized-coordinate threshold. Uses the
   * hotspot x/y already stored for every placed location — no DOM overlap
   * hacks, since the map coordinate data already exists. Returns null (no
   * link menu needed) when nothing is close enough, or when several
   * candidates exist — the closest one wins and is named explicitly in the
   * menu title so the DM always knows exactly which location is meant. */
  function findNearestLocationOnCurrentMap(
    point: { x: number; y: number },
    threshold = 0.06,
  ): { id: string; title: string } | null {
    if (!data) return null;
    let best: { id: string; title: string } | null = null;
    let bestDist = Infinity;
    for (const h of hotspots) {
      const ls = data.locationStates.find((l) => l.id === h.locationStateId);
      if (!ls) continue;
      // Same "hidden locations stay hidden" rule the rest of the UI already
      // applies (effectiveLocationStatus) — never offer to link/place against
      // a location the DM has explicitly marked hidden.
      if (effectiveLocationStatus(ls, store.progress) === 'hidden') continue;
      const dx = h.x - point.x;
      const dy = h.y - point.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= threshold && dist < bestDist) {
        bestDist = dist;
        best = { id: ls.id, title: ls.title };
      }
    }
    return best;
  }

  /** Stage 6C.4G — the relationship field per type, mirroring exactly what
   * `onLinkNpcToSelected`/`LocationLinksTab` already read/write
   * (`LocationState.npcIds/questIds/enemyIds/imageIds`). BattleEntry is the
   * one exception: it has its own one-way `sourceLocationStateId` field on
   * the BattleEntry record itself (no LocationState array involved) — the
   * direction of truth for BattleEntry is BattleEntry → location, not
   * location → BattleEntry list. */
  function isContentLinkedToLocation(type: LinkableContentType, sourceId: string, locationStateId: string): boolean {
    if (!data) return false;
    if (type === 'battleEntry') {
      return store.battleEntriesById[sourceId]?.sourceLocationStateId === locationStateId;
    }
    const ls = data.locationStates.find((l) => l.id === locationStateId);
    if (!ls) return false;
    const field = type === 'npc' ? 'npcIds' : type === 'quest' ? 'questIds' : type === 'enemy' ? 'enemyIds' : 'imageIds';
    return ls[field].includes(sourceId);
  }

  function linkContentToLocation(type: LinkableContentType, sourceId: string, locationStateId: string) {
    if (type === 'battleEntry') {
      store.updateBattleEntry(sourceId, { sourceLocationStateId: locationStateId });
      return;
    }
    if (!data) return;
    const ls = data.locationStates.find((l) => l.id === locationStateId);
    if (!ls) return;
    const field = type === 'npc' ? 'npcIds' : type === 'quest' ? 'questIds' : type === 'enemy' ? 'enemyIds' : 'imageIds';
    if (ls[field].includes(sourceId)) return; // already linked — avoid duplicate ids
    store.patchLocationState(locationStateId, { [field]: [...ls[field], sourceId] });
  }

  /** Stage 6C.4G — single placement chokepoint for the 4 (now 5 with
   * BattleEntry) linkable types, shared by handleMapDrop, the link menu's
   * own "place" actions, and (going forward) any future entry point — calls
   * the exact same Stage 6C.4B/6C.4E functions, never duplicates placement
   * logic. */
  function placeContentByType(type: LinkableContentType, sourceId: string, point: { x: number; y: number }) {
    switch (type) {
      case 'npc':
        placeOrMoveNpcMovableEntity(sourceId, point);
        break;
      case 'quest':
      case 'enemy':
      case 'image':
        placeOrMoveContentMarker(type, sourceId, point);
        break;
      case 'battleEntry':
        placeOrMoveBattleEntryAtPendingPoint(sourceId, point);
        break;
    }
  }

  /** Stage 6C.4G — the actual decision point every placement entry point
   * (picker, Library arm-then-click, drag-and-drop) now goes through for
   * the 5 linkable types: if the point lands near an existing visible
   * location, open the small link/place menu instead of placing
   * immediately (no partial state written before the DM picks an action);
   * otherwise place right away exactly like before — free-map placement
   * stays just as fast as it always was. */
  function maybeOpenLinkMenuOrPlace(type: LinkableContentType, sourceId: string, title: string, point: { x: number; y: number }) {
    const nearest = findNearestLocationOnCurrentMap(point);
    if (nearest) {
      setLinkMenuState({ type, sourceId, title, point, nearestLs: nearest });
    } else {
      placeContentByType(type, sourceId, point);
    }
  }

  /** Stage 6C.4G — runs exactly one of the 4 menu actions, then always
   * closes the menu. Nothing is written before this is called, so "Отмена"
   * (and Escape, which calls cancelAllEditTools) is a true no-op. */
  function runLinkMenuAction(action: 'place' | 'link' | 'both' | 'cancel') {
    const pending = linkMenuState;
    if (!pending) return;
    setLinkMenuState(null);
    if (action === 'cancel') return;
    const { type, sourceId, point, nearestLs } = pending;
    if (action === 'place') {
      placeContentByType(type, sourceId, point);
    } else if (action === 'link') {
      linkContentToLocation(type, sourceId, nearestLs.id);
    } else {
      placeContentByType(type, sourceId, point);
      linkContentToLocation(type, sourceId, nearestLs.id);
    }
  }

  /** Stage 6C.4F — true if dropping right now would be unsafe given the
   * currently active tool. Mirrors the spec's "Route Edit Mode / Area Edit
   * Mode / any transaction-dirty mode" guard; reuses the exact same state
   * flags cancelAllEditTools() already resets for every other one-shot tool,
   * rather than inventing a new "mode" concept. */
  function isDragDropBlocked(): string | null {
    if (!isEditMode) return 'Перетаскивание доступно только в режиме редактирования (DM Edit).';
    if (editingRouteId) return 'Сначала завершите/отмените редактирование маршрута (Route Edit Mode).';
    if (editingZoneId) return 'Сначала завершите/отмените редактирование зоны (Area Edit Mode).';
    return null;
  }

  /** Computes a normalized {x,y} in [0,1] from a raw drag event against the
   * map's actual rendered bounds — the exact same math handleMapClick already
   * uses (mapRef.getBoundingClientRect() already reflects pan/zoom since it's
   * the post-transform on-screen box). Returns null when the point falls
   * outside the real image bounds (never clamps blindly — clamping only
   * happens AFTER this check confirms the drop is inside). */
  function computeDropPoint(e: { clientX: number; clientY: number }): { x: number; y: number } | null {
    if (!mapRef.current) return null;
    const rect = mapRef.current.getBoundingClientRect();
    const fracX = (e.clientX - rect.left) / rect.width;
    const fracY = (e.clientY - rect.top) / rect.height;
    if (fracX < 0 || fracX > 1 || fracY < 0 || fracY > 1) return null;
    return { x: Math.min(1, Math.max(0, Math.round(fracX * 1000) / 1000)), y: Math.min(1, Math.max(0, Math.round(fracY * 1000) / 1000)) };
  }

  function handleMapDragOver(e: ReactDragEvent<HTMLDivElement>) {
    if (!dragPayload) return;
    e.preventDefault();
    const point = computeDropPoint(e);
    if (!point) {
      setDragGhostPoint(null);
      setDragInvalid(true);
      return;
    }
    setDragGhostPoint(point);
    setDragInvalid(!!isDragDropBlocked());
  }

  function handleMapDragLeave() {
    setDragGhostPoint(null);
  }

  function showDragWarning(message: string) {
    setDragWarning(message);
    window.setTimeout(() => setDragWarning((cur) => (cur === message ? null : cur)), 3000);
  }

  function handleMapDrop(e: ReactDragEvent<HTMLDivElement>) {
    e.preventDefault();
    const payload = dragPayload;
    setDragPayload(null);
    setDragGhostPoint(null);
    setDragInvalid(false);
    if (!payload) return;
    const blocked = isDragDropBlocked();
    if (blocked) {
      showDragWarning(blocked);
      return;
    }
    const point = computeDropPoint(e);
    if (!point) {
      showDragWarning('Точка вне карты — объект не размещён.');
      return;
    }
    // Same mutual-exclusion chokepoint every other one-shot tool uses before
    // it acts, so a drop can never race with an armed click tool.
    cancelAllEditTools();
    switch (payload.sourceType) {
      case 'location': {
        const result = placeOrMoveLocationAtPoint(payload.sourceId, point);
        if (result === 'elsewhere') showDragWarning('Эта локация уже размещена на другой карте — перетаскивание между картами пока не поддерживается.');
        break;
      }
      case 'tavern':
      case 'shop': {
        const result = placeOrMoveLibrarySourcedLocationAtPoint(payload.sourceType, payload.sourceId, payload.title, point);
        if (result === 'elsewhere') showDragWarning('Уже размещено на другой карте — перетаскивание между картами пока не поддерживается.');
        break;
      }
      case 'npc':
      case 'quest':
      case 'enemy':
      case 'image':
      case 'battleEntry':
        // Stage 6C.4G: dropping near an existing location opens the link/
        // place menu instead of placing immediately; dropping on free map
        // space places right away exactly like before.
        maybeOpenLinkMenuOrPlace(payload.sourceType, payload.sourceId, payload.title, point);
        break;
    }
  }

  function saveQuickPinDraft() {
    if (!quickPinDraft || !map) return;
    const title = quickPinDraft.title.trim() || 'Заметка';
    const newPin: MapObjectPlacement = {
      id: `placement-${Date.now()}`,
      arcId: activeTimelineForPlacements?.arcId ?? store.currentTimelineId,
      mapLevel: scope,
      mapId: map.id,
      entityKind: 'note',
      title,
      position: { x: quickPinDraft.x, y: quickPinDraft.y },
      visibleInPlayerView: quickPinDraft.visibleInPlayerView,
      status: 'active',
      createdAt: new Date().toISOString(),
    };
    store.addPlacement(newPin);
    setQuickPinDraft(null);
    // Immediately surface the new pin so the DM can see/edit it without
    // having to hunt for it on the map or in the Current Session panel.
    openPlacementDrawer(newPin);
    setShowSessionPanel(true);
  }

  function saveLocationPlacementDraft() {
    if (!locationPlacementDraft || !map || !mapState) return;
    if (!locationPlacementDraft.title.trim()) {
      setLocationPlacementError('Нужно указать название локации');
      return;
    }
    const locId = `custom-${Date.now()}`;
    const locationStateId = `${locId}__${store.currentTimelineId}`;
    const newLocationState: LocationState = {
      id: locationStateId,
      locationId: locId,
      timelineId: store.currentTimelineId,
      title: locationPlacementDraft.title.trim(),
      type: locationPlacementDraft.type,
      publicDescription: locationPlacementDraft.publicDescription.trim(),
      dmNotes: locationPlacementDraft.dmNotes.trim() || undefined,
      status: locationPlacementDraft.status,
      childLocationStateIds: [],
      npcIds: [],
      questIds: [],
      enemyIds: [],
      imageIds: [],
      isCustom: true,
      visibleToPlayers: locationPlacementDraft.visibleToPlayers,
    };
    store.addLocationState(newLocationState);
    store.setLocationStatus(locationStateId, locationPlacementDraft.status);
    const newHotspot: MapHotspot = {
      id: `hotspot-${Date.now()}`,
      mapId: map.id,
      timelineId: store.currentTimelineId,
      locationStateId,
      x: locationPlacementDraft.x,
      y: locationPlacementDraft.y,
      label: locationPlacementDraft.title.trim(),
      visibleInPlayerView: locationPlacementDraft.visibleToPlayers,
    };
    store.addHotspot(newHotspot);
    store.patchWorldMapState(mapState.id, { hotspotIds: [...mapState.hotspotIds, newHotspot.id] });
    setSelectedHotspotId(newHotspot.id);
    setLocationPlacementDraft(null);
    setLocationPlacementError(null);
  }

  // ---------- Stage 6B.1: "Создать NPC здесь" ----------
  function saveNpcCreateDraft() {
    if (!npcCreateDraft || !selectedLs || !data) return;
    if (!npcCreateDraft.name.trim()) {
      setLocationPlacementError('Нужно указать имя NPC');
      return;
    }
    const arc = data.timelines.find((t) => t.id === selectedLs.timelineId);
    const newNpc: Npc = {
      id: `npc-custom-${Date.now()}`,
      arcId: arc?.arcId,
      name: npcCreateDraft.name.trim(),
      race: '',
      role: npcCreateDraft.role.trim(),
      location: selectedLs.locationId,
      faction: npcCreateDraft.faction.trim() || undefined,
      publicDescription: npcCreateDraft.publicDescription.trim() || undefined,
      dmNotes: npcCreateDraft.dmNotes.trim() || undefined,
      visibleToPlayers: npcCreateDraft.visibleToPlayers,
      isCustom: true,
    };
    store.addNpc(newNpc);
    store.patchLocationState(selectedLs.id, { npcIds: [...selectedLs.npcIds, newNpc.id] });
    setNpcCreateDraft(null);
  }

  // ---------- faction zone editing (Area Edit Mode, Stage 4A) ----------

  function startNewZoneDraft() {
    cancelAllEditTools();
    setZoneDraft({ name: '', type: 'control', status: 'stable', visibleInPlayerView: false, points: [] });
    setZoneFormError(null);
  }

  function saveZoneDraft() {
    if (!zoneDraft || !map) return;
    if (!zoneDraft.name.trim()) {
      setZoneFormError('Нужно указать название зоны');
      return;
    }
    if (zoneDraft.points.length < 3) {
      setZoneFormError('Нужно минимум 3 точки на карте, чтобы сохранить зону');
      return;
    }
    const now = new Date().toISOString();
    const newZone: FactionZone = {
      id: `zone-${Date.now()}`,
      timelineId: store.currentTimelineId,
      mapId: map.id,
      mapLevel: scope,
      name: zoneDraft.name.trim(),
      type: zoneDraft.type,
      polygon: zoneDraft.points,
      status: zoneDraft.status,
      visibleInPlayerView: zoneDraft.visibleInPlayerView,
      createdAt: now,
      updatedAt: now,
    };
    store.addFactionZone(newZone);
    setZoneDraft(null);
    setZoneFormError(null);
    setSelectedZoneId(newZone.id);
  }

  function handleZoneVertexMouseDown(zoneId: string, index: number, e: MouseEvent) {
    if (!isEditMode || editingZoneId !== zoneId) return;
    e.stopPropagation();
    setSelectedZoneVertexIndex(index);
    setDraggingZoneVertex({ zoneId, index });
  }

  function handleMapMouseMoveZoneVertexDrag(e: MouseEvent<HTMLDivElement>) {
    if (!draggingZoneVertex || !mapRef.current) return;
    const zone = store.factionZonesById[draggingZoneVertex.zoneId];
    if (!zone) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const nextPoints = zone.polygon.map((p, i) =>
      i === draggingZoneVertex.index ? { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } : p,
    );
    store.updateFactionZone(zone.id, { polygon: nextPoints });
  }

  function handleMapMouseUpZoneVertexDrag() {
    setDraggingZoneVertex(null);
  }

  function deleteSelectedZoneVertex() {
    if (!editingZoneId || selectedZoneVertexIndex === null) return;
    const zone = store.factionZonesById[editingZoneId];
    if (!zone) return;
    if (zone.polygon.length <= 3) {
      setZoneFormError('Нельзя удалить точку — у зоны должно остаться минимум 3 точки');
      return;
    }
    const nextPoints = zone.polygon.filter((_, i) => i !== selectedZoneVertexIndex);
    store.updateFactionZone(zone.id, { polygon: nextPoints });
    setSelectedZoneVertexIndex(null);
  }

  /** Shared "Использовать позицию партии" helper (Stage 4C, Step 5 flow 3) —
   * used by both the Movable Entity CRUD list (Stage 4B) and the new
   * selection panel (Stage 4C) so the "set currentPosition to the party's
   * current map point" logic lives in exactly one place instead of being
   * duplicated inline at both call sites. */
  function applyPartyPositionToMovableEntity(entityId: string) {
    if (!partyMarkerPoint) return;
    store.updateMovableEntity(entityId, { currentPosition: { x: partyMarkerPoint.x, y: partyMarkerPoint.y } });
  }

  /** Computes the simple average (centroid) of a zone's polygon points — used
   * to position the optional faction_shift CampaignEvent created from the
   * Warfront Status flow below. */
  function zoneCentroid(zone: FactionZone): { x: number; y: number } {
    const n = zone.polygon.length || 1;
    const sum = zone.polygon.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
    return { x: sum.x / n, y: sum.y / n };
  }

  /** Warfront Status flow (Stage 4B) — creates an explicit, DM-triggered
   * `faction_shift` CampaignEvent recording a zone's status change. Never
   * fires automatically; only ever called from the panel's explicit
   * "Создать событие изменения фронта" button/checkbox below. */
  function createFactionShiftEvent(zone: FactionZone, oldStatus: FactionZoneStatus, newStatus: FactionZoneStatus) {
    const now = new Date().toISOString();
    store.addCampaignEvent({
      id: `event-${Date.now()}`,
      timelineId: zone.timelineId,
      mapId: zone.mapId,
      mapLevel: zone.mapLevel,
      position: zoneCentroid(zone),
      name: `Изменение зоны: ${zone.name}`,
      type: 'faction_shift',
      description: `Статус зоны «${zone.name}» изменён: ${ZONE_STATUS_LABELS[oldStatus]} → ${ZONE_STATUS_LABELS[newStatus]}`,
      visibleInPlayerView: false,
      status: 'planned',
      linkedLocationStateIds: zone.linkedLocationStateIds ?? [],
      createdAt: now,
      updatedAt: now,
    });
  }

  function handleHotspotMouseDown(h: MapHotspot, e: MouseEvent) {
    if (!isEditMode) return;
    // While a route is being drawn/edited, a hotspot must never be draggable
    // — only its own route.points waypoint handles may move. Without this
    // guard, a mousedown landing fractionally off-center of a waypoint (e.g.
    // one that sits near a location's hotspot) would drag the LOCATION
    // marker instead of the route point.
    if (editingRouteId || placementMode) return;
    // Also block while the party marker is mid-walk along a route animation —
    // see useMapWorkspaceMode's 'travel' mode / hotspot_drag guard: travel
    // must never race with manually dragging a hotspot's position.
    if (!workspaceMode.isAllowed('hotspot_drag')) return;
    e.stopPropagation();
    setDraggingId(h.id);
    setSelectedHotspotId(h.id);
  }

  function handleMapMouseMoveHotspotDrag(e: MouseEvent<HTMLDivElement>) {
    if (!draggingId || !mapRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    // A manual drag IS the DM confirming the position by hand — never leave
    // the old "нужна проверка координат" warning sitting on a spot the DM
    // just placed it at themselves.
    store.patchHotspot(draggingId, {
      x: Math.round(x * 1000) / 1000,
      y: Math.round(y * 1000) / 1000,
      needsCoordinateReview: false,
    });
  }

  function handleMapMouseUpHotspotDrag() {
    setDraggingId(null);
  }

  // ---------- route waypoint editing (DM Edit Mode) ----------
  function handleWaypointMouseDown(routeId: string, index: number, e: MouseEvent) {
    if (!isEditMode) return;
    e.stopPropagation();
    setDraggingWaypoint({ routeId, index });
  }

  function handleMapMouseMoveWaypointDrag(e: MouseEvent<HTMLDivElement>) {
    if (!draggingWaypoint || !mapRef.current) return;
    const route = routes.find((r) => r.id === draggingWaypoint.routeId);
    if (!route || !route.points) return;
    const rect = mapRef.current.getBoundingClientRect();
    const x = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    const y = Math.min(1, Math.max(0, (e.clientY - rect.top) / rect.height));
    const nextPoints = route.points.map((p, i) =>
      i === draggingWaypoint.index ? { x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 } : p,
    );
    store.patchRoute(route.id, { points: nextPoints });
  }

  function handleMapMouseUpWaypointDrag() {
    setDraggingWaypoint(null);
  }

  function removeWaypoint(routeId: string, index: number) {
    const route = routes.find((r) => r.id === routeId);
    if (!route || !route.points) return;
    store.patchRoute(routeId, { points: route.points.filter((_, i) => i !== index) });
  }

  function reverseRoute(routeId: string) {
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;
    store.patchRoute(routeId, {
      fromHotspotId: route.toHotspotId,
      toHotspotId: route.fromHotspotId,
      points: route.points ? [...route.points].reverse() : route.points,
    });
  }

  function duplicateRoute(routeId: string) {
    const route = routes.find((r) => r.id === routeId);
    if (!route) return;
    const copy: MapRoute = { ...route, id: `route-${Date.now()}`, points: route.points ? [...route.points] : undefined };
    store.addRoute(copy);
  }

  function markRoutePath(routeId: string) {
    const route = routes.find((r) => r.id === routeId);
    setSelectedRouteId(routeId);
    setEditingRouteSnapshot(route?.points ? [...route.points] : []);
    setIsCreatingNewRoute(false);
    setRouteEditorError(null);
    setEditingRouteId(routeId);
  }

  function startDrawingNewRoute() {
    if (!mapState || !routeDraft) return;
    // ROOT CAUSE OF THE "PARTY TELEPORTS INSTEAD OF WALKING" BUG: this manual
    // draft form labelled Откуда/Куда as "(необязательно)" and previously let
    // a route be created with fromHotspotId/toHotspotId left as ''. The
    // party-movement matching logic everywhere else (handleHotspotDoubleClick,
    // the Journey panel button, the generic "move here" button) requires an
    // EXACT (fromHotspotId,toHotspotId) pair match against the party's actual
    // current/target hotspot ids — a route saved with empty-string endpoints
    // can never match anything, so the party always fell back to a direct
    // teleport for every route created via this form. Routes created via
    // openRouteBuilderBetween() (double-clicking two hotspots, e.g. the
    // existing market→docks route) always had real ids and worked fine. Fix:
    // require both endpoints before a route can be drawn at all.
    if (!routeDraft.fromHotspotId || !routeDraft.toHotspotId) {
      setRouteEditorError('Выберите начальную и конечную точку маршрута — без них партия не сможет идти по этому пути и будет перемещаться напрямую.');
      return;
    }
    setRouteEditorError(null);
    const from = hotspots.find((h) => h.id === routeDraft.fromHotspotId);
    const to = hotspots.find((h) => h.id === routeDraft.toHotspotId);
    const title = routeDraft.title.trim() || (from && to ? `${from.label} → ${to.label}` : 'Новый маршрут');
    const newRoute: MapRoute = {
      id: `route-${Date.now()}`,
      mapStateId: mapState.id,
      fromHotspotId: routeDraft.fromHotspotId,
      toHotspotId: routeDraft.toHotspotId,
      label: title,
      visibleInPlayerView: true,
      discovered: true,
      points: [],
    };
    store.addRoute(newRoute);
    setRouteDraft(null);
    setSelectedRouteId(newRoute.id);
    setEditingRouteSnapshot([]);
    setIsCreatingNewRoute(true);
    setRouteEditorError(null);
    setEditingRouteId(newRoute.id);
  }

  function openRouteBuilderBetween(fromHotspotId: string, toHotspotId: string) {
    const from = hotspots.find((h) => h.id === fromHotspotId);
    const to = hotspots.find((h) => h.id === toHotspotId);
    cancelAllEditTools();
    setRouteDraft({
      title: from && to ? `${from.label} → ${to.label}` : '',
      fromHotspotId,
      toHotspotId,
    });
  }

  function finishRouteEditing() {
    if (!editingRouteId) return;
    const route = routes.find((r) => r.id === editingRouteId);
    const pointCount = route?.points?.length ?? 0;
    if (pointCount < 2) {
      setRouteEditorError('Нужно добавить минимум две точки маршрута');
      return;
    }
    setRouteEditorError(null);
    setEditingRouteId(null);
    setEditingRouteSnapshot(null);
    setIsCreatingNewRoute(false);
  }

  function cancelRouteEditing() {
    if (!editingRouteId) return;
    if (isCreatingNewRoute) {
      // A brand-new route has nothing to "restore" to — cancelling means it
      // never existed, exactly like the draft form's own Отмена button.
      store.deleteRoute(editingRouteId);
      setSelectedRouteId(null);
    } else if (editingRouteSnapshot) {
      store.patchRoute(editingRouteId, { points: editingRouteSnapshot });
    }
    setEditingRouteId(null);
    setEditingRouteSnapshot(null);
    setIsCreatingNewRoute(false);
    setRouteEditorError(null);
  }

  // Route-network pathfinding (Etap H): used by every party-movement call
  // site below as the fallback when no SINGLE route directly connects the
  // party's current hotspot to the target hotspot. Builds the graph fresh
  // from the current map's routes/hotspots (cheap — a handful to a few dozen
  // nodes) and returns 0, 1, or 2 RoutePathResult options. An empty array
  // means "no real path through the network" and MUST be treated as a hard
  // stop by every caller — never a direct/teleport fallback.
  function findJourneyPaths(fromHotspotId: string, toHotspotId: string): RoutePathResult[] {
    const graph = buildRouteGraph(routes, hotspots, { allowHiddenRoutes: !isPlayerView });
    return findPathBetweenLocations(fromHotspotId, toHotspotId, graph, {
      avoidBlockedRoutes: true,
      avoidDangerousRoutes: false,
      allowHiddenRoutes: !isPlayerView,
    });
  }

  // Commits a chosen multi-hop RoutePathResult: moves the party to the final
  // destination immediately (consistent with the existing single-route flow,
  // which also calls store.setCurrentLocation synchronously and treats the
  // walk as a purely visual follow-up), then queues every segment's points so
  // partyTravelAnim walks through them IN ORDER — no jump between segments.
  function commitMultiSegmentJourney(path: RoutePathResult, destinationLocationStateId: string) {
    if (path.segments.length === 0) return;
    const lastSegment = path.segments[path.segments.length - 1];
    store.setCurrentLocation(destinationLocationStateId, lastSegment.routeId);
    store.markVisited(destinationLocationStateId);
    setActivePathRouteIds(path.segments.map((s) => s.routeId));
    const [first, ...rest] = path.segments;
    setPartyTravelAnim({ points: first.points, index: 0 });
    setPendingPathSegments(rest.map((s) => ({ routeId: s.routeId, points: s.points })));
    setPathfindingResult(null);
  }

  // Double-click on a hotspot in DM View / Player View moves the party there
  // directly (no routeId — see .party-map-marker in index.css for the marker
  // itself, snapped instantly with no straight-line transition).
  // In DM Edit this is intentionally a no-op so it never fights with drag/select.
  function handleHotspotDoubleClick(h: MapHotspot, e: MouseEvent) {
    e.stopPropagation();
    if (isEditMode) return;
    if (!h.locationStateId) return;
    // This was the actual source of "party still teleports directly" even
    // after the Journey panel's route-aware button was fixed: double-clicking
    // a hotspot is a second, independent way to move the party, and it was
    // never taught about routes — it always called setCurrentLocation with no
    // routeId. Mirror the Journey-panel logic here too: if a real route
    // (>=2 points) connects the party's CURRENT hotspot to this one, use it
    // and animate through route.points; otherwise fall back to a direct move.
    const matchingRoute = partyHotspot
      ? routes.find(
          (r) =>
            (r.points?.length ?? 0) >= 2 &&
            ((r.fromHotspotId === partyHotspot.id && r.toHotspotId === h.id) ||
              (r.toHotspotId === partyHotspot.id && r.fromHotspotId === h.id)),
        )
      : undefined;
    if (matchingRoute) {
      store.setCurrentLocation(h.locationStateId, matchingRoute.id);
      store.markVisited(h.locationStateId);
      selectLocation(h.locationStateId);
      setSidePanelTab('card');
      setSelectedRouteId(matchingRoute.id);
      const path =
        partyHotspot && matchingRoute.fromHotspotId === partyHotspot.id
          ? matchingRoute.points!
          : [...matchingRoute.points!].reverse();
      setPartyTravelAnim({ points: path, index: 0 });
      return;
    }
    // No single direct route — try the route network before falling back to
    // ANYTHING. If partyHotspot is unset (party has no current location yet),
    // a direct placement is still fine (nothing to path FROM). Otherwise, no
    // path through the real network means no move at all — never a
    // straight-line teleport through walls/gates/districts.
    if (!partyHotspot) {
      store.setCurrentLocation(h.locationStateId);
      store.markVisited(h.locationStateId);
      selectLocation(h.locationStateId);
      setSidePanelTab('card');
      return;
    }
    const candidatePaths = findJourneyPaths(partyHotspot.id, h.id);
    if (candidatePaths.length > 0) {
      commitMultiSegmentJourney(candidatePaths[0], h.locationStateId);
      selectLocation(h.locationStateId);
      setSidePanelTab('card');
      return;
    }
    // Genuinely no path through the route network — surface it in the side
    // panel instead of silently moving the party in a straight line.
    selectLocation(h.locationStateId);
    setSidePanelTab('card');
    setPathfindingResult({ targetLocationStateId: h.locationStateId, options: [] });
  }


  function handleDeleteHotspot(id: string) {
    if (!window.confirm('Удалить эту точку с карты?')) return;
    store.deleteHotspot(id);
    if (mapState) {
      store.patchWorldMapState(mapState.id, { hotspotIds: mapState.hotspotIds.filter((hid) => hid !== id) });
    }
    if (selectedHotspotId === id) setSelectedHotspotId(null);
  }

  function exportHotspotsJson() {
    const json = JSON.stringify(hotspots, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hotspots-${map?.id}-${store.currentTimelineId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function importHotspotsJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !map || !mapState) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const imported = JSON.parse(String(reader.result)) as MapHotspot[];
        const newIds: string[] = [];
        for (const h of imported) {
          store.patchHotspot(h.id, h);
          if (!mapState.hotspotIds.includes(h.id)) newIds.push(h.id);
        }
        store.patchWorldMapState(mapState.id, { hotspotIds: [...mapState.hotspotIds, ...newIds] });
        alert(`Импортировано ${imported.length} точек.`);
      } catch (err) {
        alert(`Не удалось прочитать файл: ${String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  const selectedHotspot = hotspots.find((h) => h.id === selectedHotspotId) ?? null;

  // ---------- global search ----------
  // Plain computation (not useMemo): this function only runs after the
  // `loading`/`error` early returns above, so it can never be reached on a
  // render where `data` is null — wrapping it in useMemo previously caused a
  // "rendered more hooks than during the previous render" crash, because the
  // hook call was conditional on those same early returns. The filtering
  // itself is cheap (small arrays, substring match), so memoization isn't
  // needed for performance.
  function linkedEntityTitleForPlacement(p: MapObjectPlacement): string {
    if (!p.entityId) return '';
    switch (p.entityKind) {
      case 'npc':
        return data!.npcs.find((x) => x.id === p.entityId)?.name ?? '';
      case 'quest':
        return data!.quests.find((x) => x.id === p.entityId)?.title ?? '';
      case 'enemy':
        return data!.enemies.find((x) => x.id === p.entityId)?.name ?? '';
      case 'image':
        return data!.images.find((x) => x.id === p.entityId)?.title ?? '';
      case 'battleMap':
        return data!.battleMaps.find((x) => x.id === p.entityId)?.title ?? '';
      case 'location':
        return getLocationState(data!, p.entityId)?.title ?? '';
      default:
        return '';
    }
  }

  function placementMatchesQuery(p: MapObjectPlacement, query: string, includeDmFields: boolean): boolean {
    const haystack = [
      p.title,
      p.subtitle ?? '',
      PLACEMENT_KIND_LABELS[p.entityKind],
      linkedEntityTitleForPlacement(p),
      includeDmFields ? p.dmNotes ?? '' : '',
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(query);
  }

  const searchResultsQuery = globalSearch.trim().toLowerCase();
  const searchResults =
    searchResultsQuery.length < 2
      ? null
      : {
          // Player View must never surface a hidden/DM-only location (or an
          // NPC/quest only reachable through one) via global search — this
          // mirrors getPlayerSafeSearchResults' rule, applied inline here
          // since this block's own per-category isPlayerView branches (below)
          // are already the established pattern in this file.
          locs: locationsForTimeline
            .filter((ls) => !isPlayerView || isLocationVisibleToPlayers(ls, store.progress))
            .filter((ls) => ls.title.toLowerCase().includes(searchResultsQuery))
            .slice(0, 8),
          npcs: data.npcs
            .filter((n) => {
              if (!isPlayerView) return true;
              if (n.visibleToPlayers === false) return false;
              if (!n.location) return true;
              const ls = locationsForTimeline.find((l) => l.locationId === n.location || l.id === n.location);
              return !ls || isLocationVisibleToPlayers(ls, store.progress);
            })
            .filter((n) => n.name.toLowerCase().includes(searchResultsQuery))
            .slice(0, 8),
          quests: data.quests
            .filter((qq) => {
              if (!isPlayerView) return true;
              if (effectiveQuestStatus(qq.id, qq.status, store.progress) === 'hidden') return false;
              if (!qq.location) return true;
              const ls = locationsForTimeline.find((l) => l.locationId === qq.location || l.id === qq.location);
              return !ls || isLocationVisibleToPlayers(ls, store.progress);
            })
            .filter((qq) => qq.title.toLowerCase().includes(searchResultsQuery))
            .slice(0, 8),
          enemies: isPlayerView
            ? []
            : data.enemies.filter((en) => en.name.toLowerCase().includes(searchResultsQuery)).slice(0, 8),
          battleMaps: isPlayerView
            ? []
            : data.battleMaps.filter((b) => b.title.toLowerCase().includes(searchResultsQuery)).slice(0, 8),
          // economyReference and laws are public info — searchable in Player View too.
          economyItems: data.economyReference
            .filter((e) => e.name.toLowerCase().includes(searchResultsQuery))
            .slice(0, 8),
          laws: data.laws.filter((l) => l.title.toLowerCase().includes(searchResultsQuery)).slice(0, 8),
          placements: isPlayerView
            ? data.placements
                .filter((p) => p.status === 'active' && p.visibleInPlayerView === true)
                .filter((p) => placementMatchesQuery(p, searchResultsQuery, false))
                .slice(0, 8)
            : data.placements
                .filter((p) => p.status !== 'archived')
                .filter((p) => placementMatchesQuery(p, searchResultsQuery, true))
                .slice(0, 8),
        };

  function jumpToLocationOfEntity(locationId: string | undefined) {
    if (!locationId) return;
    const ls = locationsForTimeline.find((l) => l.locationId === locationId || l.id === locationId);
    if (ls) selectLocation(ls.id);
  }

  // Current Session roll-up (DM-only): active quests for the current timeline
  // plus travel events that are still available near the party's current
  // location/route. Pure derivation of already-loaded state — nothing here
  // is fetched or invented separately.
  const sessionActiveQuests = isPlayerView
    ? []
    : data.quests.filter((q) => {
        const ls = locationsForTimeline.find((l) => l.questIds.includes(q.id));
        if (!ls) return false;
        return effectiveQuestStatus(q.id, q.status, store.progress) === 'active';
      });
  const currentTimeline = data.timelines.find((t) => t.id === store.currentTimelineId);
  const sessionAvailableTravelEvents = isPlayerView || !currentTimeline
    ? []
    : data.travelEvents.filter(
        (ev) => ev.arcId === currentTimeline.arcId && ev.status !== 'hidden' && ev.status !== 'used',
      );
  // Placements near the party's current location: same entity-link rule as
  // the location side panel's "Размещённые объекты" block — no invented
  // proximity geometry.
  const sessionNearbyPlacements =
    isPlayerView || !partyLocationState
      ? []
      : (() => {
          const linkedIds = new Set<string>([
            partyLocationState.locationId,
            partyLocationState.id,
            ...partyLocationState.npcIds,
            ...partyLocationState.questIds,
            ...partyLocationState.enemyIds,
            ...partyLocationState.imageIds,
          ]);
          return data.placements.filter(
            (p) => p.status !== 'archived' && p.status !== 'hidden' && !!p.entityId && linkedIds.has(p.entityId),
          );
        })();

  // Quick Pins (Etap H) for the Current Session panel — every active 'note'
  // placement on the currently active arc, regardless of which map/level it's
  // on (a quick pin is meant to be a fast DM-facing reminder, so it shouldn't
  // require navigating to the exact map to be seen during a session).
  const sessionQuickPins = isPlayerView || !activeLayerVisibility.quickPins
    ? []
    : data.placements.filter(
        (p) => p.entityKind === 'note' && p.status === 'active' && p.arcId === activeTimelineForPlacements?.arcId,
      );

  // Pending Trigger Review (Stage 3) — armed triggers for the current
  // timeline whose date/route condition has already been reached. Purely a
  // DM-facing review list; nothing here auto-applies anything.
  const armedTriggersForTimeline = isPlayerView ? [] : getArmedTriggersForTimeline(store.triggersById, store.currentTimelineId);
  const pendingDateTriggers = isPlayerView ? [] : getPendingDateTriggers(armedTriggersForTimeline, calendar);
  // NOTE: party_completes_route/party_reaches_route_point triggers only
  // become "pending" reactively at the moment travel completes (see the
  // "Завершить в конечной точке" button below, which calls
  // getPendingRouteTriggers directly and surfaces results via
  // routeTriggerWarning) — there is no ambient polling loop here, by design
  // (MVP scope: no partial-travel simulation, no background evaluation).
  const pendingTriggersForReview = [...pendingDateTriggers];
  const manualTriggersForReview = isPlayerView
    ? []
    : armedTriggersForTimeline.filter((t) => t.triggerType === 'manual');

  // Event System MVP — active/planned CampaignEvents for the current
  // timeline, surfaced in the Current Session panel. DM-only list; no
  // automation reads this, it's purely a manual reminder feed for the DM.
  const sessionCampaignEvents = isPlayerView
    ? []
    : Object.values(store.eventsById).filter(
        (ev) => ev.timelineId === store.currentTimelineId && (ev.status === 'active' || ev.status === 'planned'),
      );

  // Battle Entries (Stage 5A, Step 12) — Current Session compact sections.
  // DM-only lists, mirroring sessionCampaignEvents above. Not map-scoped (a
  // DM running a session may want to see all available/active scenes for the
  // current timeline regardless of which map is currently open), same
  // "arc-wide reminder feed" philosophy as sessionQuickPins.
  const allBattleEntriesForTimeline = isPlayerView
    ? []
    : Object.values(store.battleEntriesById).filter((be) => be.timelineId === store.currentTimelineId);
  const sessionAvailableBattleEntries = allBattleEntriesForTimeline.filter((be) => be.status === 'available');
  const sessionActiveBattleEntries = allBattleEntriesForTimeline.filter((be) => be.status === 'active');
  const sessionRecentlyCompletedBattleEvents = isPlayerView
    ? []
    : Object.values(store.eventsById).filter(
        (ev) => ev.timelineId === store.currentTimelineId && ev.type === 'battle' && ev.status === 'resolved',
      );
  // Battle entries linked to the party's currently selected location, if any
  // — cheap to compute since it's just an equality check on sourceLocationStateId.
  const sessionBattleEntriesAtSelectedLocation = selectedLocationStateId
    ? allBattleEntriesForTimeline.filter((be) => be.sourceLocationStateId === selectedLocationStateId)
    : [];

  return (
    <div className="workspace">
      <div className="workspace-topbar">
        <div className="map-level-tabs">
          {SCOPE_ORDER.map((s) => (
            <button key={s} className={s === scope ? 'active' : ''} onClick={() => setScope(s)}>
              {SCOPE_LABELS[s]}
            </button>
          ))}
        </div>

        <input
          type="search"
          className="workspace-search"
          placeholder="Поиск: локации, NPC, квесты…"
          value={globalSearch}
          onChange={(e) => setGlobalSearch(e.target.value)}
        />

        <span className="party-marker">
          {partyLocationState
            ? `Партия сейчас: ${partyLocationState.title}`
            : isPlayerView
              ? ''
              : 'Стартовая позиция партии не задана'}
        </span>

        <CalendarChip
          calendar={calendar}
          isPlayerView={isPlayerView}
          onAdvancePhase={() => {
            setLastCalendarSnapshot({ timelineId: store.currentTimelineId, calendar });
            store.advanceTimePhase(store.currentTimelineId);
          }}
          onAdvanceDay={() => {
            setLastCalendarSnapshot({ timelineId: store.currentTimelineId, calendar });
            store.advanceDay(store.currentTimelineId);
          }}
          onLongRest={() => {
            setLastCalendarSnapshot({ timelineId: store.currentTimelineId, calendar });
            store.setCalendar(store.currentTimelineId, {
              ...calendar,
              currentDay: calendar.currentDay + 1,
              currentTimeOfDay: 'morning',
            });
          }}
          onCustomAdvance={(days) => {
            setLastCalendarSnapshot({ timelineId: store.currentTimelineId, calendar });
            store.setCalendar(store.currentTimelineId, { ...calendar, currentDay: calendar.currentDay + days });
          }}
          onUndo={() => {
            if (!lastCalendarSnapshot || lastCalendarSnapshot.timelineId !== store.currentTimelineId) return;
            store.setCalendar(store.currentTimelineId, lastCalendarSnapshot.calendar);
            setLastCalendarSnapshot(null);
          }}
          canUndo={!!lastCalendarSnapshot && lastCalendarSnapshot.timelineId === store.currentTimelineId}
          pendingTriggerCount={pendingTriggersForReview.length}
          onPendingTriggerClick={() => setShowPendingTriggers(true)}
        />

        {!isPlayerView && (
          <button
            className={`session-toggle ${showSessionPanel ? 'active' : ''}`}
            onClick={() => setShowSessionPanel((v) => !v)}
          >
            Текущая сессия
          </button>
        )}

        {!isPlayerView && (
          <button
            className={`session-toggle ${showPendingTriggers ? 'active' : ''}`}
            onClick={() => setShowPendingTriggers((v) => !v)}
          >
            Ожидающие триггеры {pendingTriggersForReview.length > 0 ? `(${pendingTriggersForReview.length})` : ''}
          </button>
        )}

        {!isPlayerView && (
          <button
            className={`session-toggle ${showStage4ADebugPanel ? 'active' : ''}`}
            onClick={() => setShowStage4ADebugPanel((v) => !v)}
            title="Зоны фракций, динамические наложения карты и подвижные сущности — управление данными"
          >
            Зоны и наложения
          </button>
        )}

        {!isPlayerView && (
          <label className="layer-preset-select">
            Слои:
            <select value={layerPreset} onChange={(e) => setLayerPreset(e.target.value as LayerPresetId)}>
              {(Object.keys(LAYER_PRESET_LABELS) as LayerPresetId[]).map((id) => (
                <option key={id} value={id}>
                  {LAYER_PRESET_LABELS[id]}
                </option>
              ))}
            </select>
          </label>
        )}

        {isEditMode && map && mapState && (
          <div className="actions">
            <button onClick={exportHotspotsJson}>Export hotspots</button>
            <button onClick={() => fileInputRef.current?.click()}>Import hotspots</button>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json"
              style={{ display: 'none' }}
              onChange={importHotspotsJson}
            />
          </div>
        )}
      </div>

      {searchResults && (
        <div className="search-overlay card">
          {searchResults.locs.length === 0 &&
          searchResults.npcs.length === 0 &&
          searchResults.quests.length === 0 &&
          searchResults.enemies.length === 0 &&
          searchResults.battleMaps.length === 0 &&
          searchResults.economyItems.length === 0 &&
          searchResults.laws.length === 0 &&
          searchResults.placements.length === 0 ? (
            <p>Ничего не найдено.</p>
          ) : (
            <>
              {searchResults.locs.map((ls) => (
                <button
                  key={ls.id}
                  className="search-result-row"
                  onClick={() => {
                    selectLocation(ls.id);
                    setGlobalSearch('');
                  }}
                >
                  Локация: {ls.title}
                </button>
              ))}
              {searchResults.npcs.map((n) => (
                <button
                  key={n.id}
                  className="search-result-row"
                  onClick={() => {
                    jumpToLocationOfEntity(n.location);
                    setDrawer({ kind: 'npc', id: n.id });
                    setGlobalSearch('');
                  }}
                >
                  NPC: {n.name}
                </button>
              ))}
              {searchResults.quests.map((q) => (
                <button
                  key={q.id}
                  className="search-result-row"
                  onClick={() => {
                    jumpToLocationOfEntity(q.location);
                    setDrawer({ kind: 'quest', id: q.id });
                    setGlobalSearch('');
                  }}
                >
                  Квест: {q.title}
                </button>
              ))}
              {searchResults.enemies.map((en) => (
                <button
                  key={en.id}
                  className="search-result-row"
                  onClick={() => {
                    jumpToLocationOfEntity(en.locationIds?.[0]);
                    setDrawer({ kind: 'enemy', id: en.id });
                    setGlobalSearch('');
                  }}
                >
                  Враг: {en.name}
                </button>
              ))}
              {searchResults.battleMaps.map((bm) => (
                <button
                  key={bm.id}
                  className="search-result-row"
                  onClick={() => {
                    const link = data.battleMapLocationLinks.find(
                      (l) => l.battleMapId === bm.id && l.locationStateId && l.confidence !== 'manual_required',
                    );
                    if (link?.locationStateId) selectLocation(link.locationStateId);
                    else setDrawer({ kind: 'battleMap', id: bm.id });
                    setGlobalSearch('');
                  }}
                >
                  Карта боя: {bm.title}
                </button>
              ))}
              {searchResults.economyItems.map((e) => (
                <button
                  key={e.id}
                  className="search-result-row"
                  onClick={() => {
                    setDrawer({ kind: 'economy', id: e.id });
                    setGlobalSearch('');
                  }}
                >
                  Товар: {e.name}
                </button>
              ))}
              {searchResults.laws.map((l) => (
                <button
                  key={l.id}
                  className="search-result-row"
                  onClick={() => {
                    setDrawer({ kind: 'law', id: l.id });
                    setGlobalSearch('');
                  }}
                >
                  Закон: {l.title}
                </button>
              ))}
              {searchResults.placements.map((p) => (
                <button
                  key={p.id}
                  className="search-result-row"
                  onClick={() => {
                    openPlacementDrawer(p);
                    setGlobalSearch('');
                  }}
                >
                  Размещённый объект: {p.title} ({p.entityKind}, {SCOPE_LABELS[p.mapLevel]})
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {showSessionPanel && !isPlayerView && (
        <div className="session-panel card">
          <div className="session-panel-header">
            <h3>Текущая сессия — {currentTimeline?.title ?? 'арка не выбрана'}</h3>
            <button onClick={() => setShowSessionPanel(false)}>Закрыть</button>
          </div>

          <p className="session-panel-row">
            <strong>Партия сейчас:</strong>{' '}
            {partyLocationState ? partyLocationState.title : 'позиция не задана'}
          </p>

          <div className="session-panel-section">
            <p className="side-panel-subheading">Активные квесты ({sessionActiveQuests.length})</p>
            {sessionActiveQuests.length === 0 ? (
              <p className="muted">Нет активных квестов на этой арке.</p>
            ) : (
              <ul className="route-list">
                {sessionActiveQuests.map((q) => (
                  <li key={q.id}>
                    <button
                      className="link-like"
                      onClick={() => {
                        jumpToLocationOfEntity(q.location);
                        setDrawer({ kind: 'quest', id: q.id });
                        setShowSessionPanel(false);
                      }}
                    >
                      {q.title}
                    </button>
                    {q.goal && <span className="entity-card-sub"> · {q.goal}</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">
              Доступные дорожные события ({sessionAvailableTravelEvents.length})
            </p>
            {sessionAvailableTravelEvents.length === 0 ? (
              <p className="muted">Нет подготовленных событий, ожидающих использования.</p>
            ) : (
              <ul className="route-list">
                {sessionAvailableTravelEvents.map((ev) => (
                  <li key={ev.id}>
                    <strong>{ev.title}</strong>
                    {ev.dangerLevel && <span className="status-badge"> {ev.dangerLevel}</span>}
                    <div className="actions">
                      <button onClick={() => store.patchTravelEvent(ev.id, { status: 'used' })}>
                        Отметить использованным
                      </button>
                      <button onClick={() => jumpToLocationOfEntity(ev.locationStateId)}>На карту</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">
              Объекты рядом с партией ({sessionNearbyPlacements.length})
            </p>
            {sessionNearbyPlacements.length === 0 ? (
              <p className="muted">Нет размещённых объектов у текущей локации партии.</p>
            ) : (
              <ul className="route-list">
                {sessionNearbyPlacements.map((p) => (
                  <li key={p.id}>
                    <button className="link-like" onClick={() => openPlacementDrawer(p)}>
                      {PLACEMENT_ICONS[p.entityKind]} {p.title}
                    </button>
                    <span className="entity-card-sub"> · {p.entityKind}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">Боевые сцены — доступные ({sessionAvailableBattleEntries.length})</p>
            {sessionAvailableBattleEntries.length === 0 ? (
              <p className="muted">Нет доступных боевых сцен на этой арке.</p>
            ) : (
              <ul className="route-list">
                {sessionAvailableBattleEntries.map((be) => (
                  <li key={be.id}>
                    <strong>{be.name}</strong>{' '}
                    {(be.battleMapId || be.battleMapUrl) && <span className="status-badge">готова к запуску</span>}
                    <div className="actions">
                      <button
                        onClick={() => {
                          jumpToLocationOfEntity(be.sourceLocationStateId);
                          setSelectedBattleEntryId(be.id);
                          setShowSessionPanel(false);
                        }}
                      >
                        Открыть карточку
                      </button>
                      <button onClick={() => store.markBattleEntryActive(be.id)}>Начать бой</button>
                      <button
                        onClick={() => {
                          setSelectedBattleEntryId(be.id);
                          setBattleConsequencesEntryId(be.id);
                          setShowSessionPanel(false);
                        }}
                      >
                        Последствия боя…
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">Боевые сцены — идут сейчас ({sessionActiveBattleEntries.length})</p>
            {sessionActiveBattleEntries.length === 0 ? (
              <p className="muted">Нет идущих боёв на этой арке.</p>
            ) : (
              <ul className="route-list">
                {sessionActiveBattleEntries.map((be) => (
                  <li key={be.id}>
                    <strong>{be.name}</strong>{' '}
                    {(be.battleMapId || be.battleMapUrl) && <span className="status-badge">готова к запуску</span>}
                    <div className="actions">
                      <button
                        onClick={() => {
                          jumpToLocationOfEntity(be.sourceLocationStateId);
                          setSelectedBattleEntryId(be.id);
                          setShowSessionPanel(false);
                        }}
                      >
                        Открыть карточку
                      </button>
                      <button onClick={() => store.markBattleEntryCompleted(be.id)}>Завершить</button>
                      <button
                        onClick={() => {
                          setSelectedBattleEntryId(be.id);
                          setBattleConsequencesEntryId(be.id);
                          setShowSessionPanel(false);
                        }}
                      >
                        Последствия боя…
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {sessionBattleEntriesAtSelectedLocation.length > 0 && (
            <div className="session-panel-section">
              <p className="side-panel-subheading">
                Боевые сцены у выбранной локации ({sessionBattleEntriesAtSelectedLocation.length})
              </p>
              <ul className="route-list">
                {sessionBattleEntriesAtSelectedLocation.map((be) => (
                  <li key={be.id}>
                    <button
                      className="link-like"
                      onClick={() => {
                        setSelectedBattleEntryId(be.id);
                        setShowSessionPanel(false);
                      }}
                    >
                      {be.name}
                    </button>
                    <span className="status-badge"> {be.status}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="session-panel-section">
            <p className="side-panel-subheading">
              Недавно завершённые бои ({sessionRecentlyCompletedBattleEvents.length})
            </p>
            {sessionRecentlyCompletedBattleEvents.length === 0 ? (
              <p className="muted">Нет завершённых боевых событий на этой арке.</p>
            ) : (
              <ul className="route-list">
                {sessionRecentlyCompletedBattleEvents.map((ev) => (
                  <li key={ev.id}>
                    <strong>{ev.name}</strong>
                    <span className="entity-card-sub"> · {ev.date ? `${ev.date.day} ${ev.date.month} ${ev.date.year}` : ''}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">События ({sessionCampaignEvents.length})</p>
            <div className="actions">
              <button
                onClick={() => {
                  const name = window.prompt('Название события:');
                  if (!name) return;
                  const now = new Date().toISOString();
                  const calendarNow = store.getCalendar(store.currentTimelineId);
                  const newEvent: CampaignEvent = {
                    id: `event-${Date.now()}`,
                    timelineId: store.currentTimelineId,
                    name,
                    type: 'note',
                    linkedLocationStateIds: partyLocationState ? [partyLocationState.id] : undefined,
                    date: { day: calendarNow.currentDay, month: calendarNow.currentMonth, year: calendarNow.currentYear },
                    timeOfDay: calendarNow.currentTimeOfDay,
                    visibleInPlayerView: false,
                    status: 'planned',
                    createdAt: now,
                    updatedAt: now,
                  };
                  store.addCampaignEvent(newEvent);
                }}
              >
                + Событие текущей сессии
              </button>
            </div>
            {sessionCampaignEvents.length === 0 ? (
              <p className="muted">Нет активных/запланированных событий на этой арке.</p>
            ) : (
              <ul className="route-list">
                {sessionCampaignEvents.map((ev) => (
                  <li key={ev.id}>
                    <strong>{ev.name}</strong>
                    <span className="status-badge"> {ev.type}</span>
                    <span className="status-badge"> {ev.status}</span>
                    <div className="actions">
                      <button onClick={() => store.updateCampaignEvent(ev.id, { status: 'resolved' })}>
                        Отметить завершённым
                      </button>
                      <button onClick={() => store.archiveCampaignEvent(ev.id)}>Архивировать</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">Quick Pins ({sessionQuickPins.length})</p>
            {sessionQuickPins.length === 0 ? (
              <p className="muted">Нет активных Quick Pin на этой арке.</p>
            ) : (
              <ul className="route-list">
                {sessionQuickPins.map((p) => (
                  <li key={p.id}>
                    <button className="link-like" onClick={() => openPlacementDrawer(p)}>
                      {PLACEMENT_ICONS[p.entityKind]} {p.title}
                    </button>
                    {' '}
                    <span className="entity-card-sub">
                      {SCOPE_LABELS[p.mapLevel]} · {p.visibleInPlayerView ? 'видим игрокам' : 'только ДМ'}
                    </span>
                    <div className="actions">
                      <button onClick={() => store.patchPlacement(p.id, { status: 'archived' })}>Архивировать</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Stage 4C — compact "active map effects" chip line, summarizing
              every currently-active DynamicMapOverlay on this map in one
              glance (full per-overlay list/controls remain in the Stage 4A
              debug panel below — this is purely a quick read, not a new
              management UI). */}
          {dynamicOverlaysForMap.filter((o) => o.active).length > 0 && (
            <div className="session-panel-section">
              <p className="side-panel-subheading">Активные эффекты карты</p>
              <p>
                {dynamicOverlaysForMap
                  .filter((o) => o.active)
                  .map((o) => (
                    <span key={o.id} className="overlay-chip" style={{ marginRight: '0.3rem' }}>
                      {OVERLAY_TYPE_LABELS[o.type]}
                    </span>
                  ))}
              </p>
            </div>
          )}

          {/* Stage 4B additions — compact, read-mostly summaries reusing the
              already-computed *ForMap lists above (no new filtering logic). */}
          <div className="session-panel-section">
            <p className="side-panel-subheading">
              Зоны фракций — активные/спорные ({factionZonesForMap.filter((z) => z.status === 'contested' || z.status === 'expanding' || z.status === 'collapsing').length})
            </p>
            {factionZonesForMap.filter((z) => z.status === 'contested' || z.status === 'expanding' || z.status === 'collapsing').length === 0 ? (
              <p className="muted">Нет спорных/нестабильных зон на этой карте.</p>
            ) : (
              <ul className="route-list">
                {factionZonesForMap
                  .filter((z) => z.status === 'contested' || z.status === 'expanding' || z.status === 'collapsing')
                  .map((z) => (
                    <li key={z.id}>
                      {z.name} <span className="overlay-chip">{ZONE_STATUS_LABELS[z.status]}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">
              Активные наложения карты ({dynamicOverlaysForMap.filter((o) => o.active).length})
            </p>
            {dynamicOverlaysForMap.filter((o) => o.active).length === 0 ? (
              <p className="muted">Нет активных наложений на этой карте.</p>
            ) : (
              <ul className="route-list">
                {dynamicOverlaysForMap
                  .filter((o) => o.active)
                  .map((o) => (
                    <li key={o.id}>
                      {o.name} <span className="overlay-chip">{OVERLAY_TYPE_LABELS[o.type]}</span>
                    </li>
                  ))}
              </ul>
            )}
          </div>

          {/* DM-only — gated the same way the rest of this panel already is
              (showSessionPanel && !isPlayerView), so this section never
              renders in a player-facing context. */}
          {!isPlayerView && (
            <div className="session-panel-section">
              <p className="side-panel-subheading">
                Сущности в движении ({movableEntitiesForMap.filter((m) => m.movementState === 'travelling').length})
              </p>
              {movableEntitiesForMap.filter((m) => m.movementState === 'travelling').length === 0 ? (
                <p className="muted">Сейчас никто не в пути на этой карте.</p>
              ) : (
                <ul className="route-list">
                  {movableEntitiesForMap
                    .filter((m) => m.movementState === 'travelling')
                    .map((m) => (
                      <li key={m.id}>
                        {MOVABLE_ENTITY_TYPE_LABELS[m.entityType]} ({m.entityId})
                        {m.currentRouteId && <> · {routes.find((r) => r.id === m.currentRouteId)?.label ?? m.currentRouteId}</>}
                        <div className="actions">
                          <button
                            onClick={() => {
                              setSelectedMovableEntityId(m.id);
                              setShowSessionPanel(false);
                            }}
                          >
                            Открыть карточку
                          </button>
                        </div>
                      </li>
                    ))}
                </ul>
              )}
            </div>
          )}

          {!isPlayerView && (
            <div className="session-panel-section">
              <p className="side-panel-subheading">
                Недавние события изменения фронта (
                {Object.values(store.eventsById).filter((ev) => ev.timelineId === store.currentTimelineId && ev.type === 'faction_shift' && ev.status === 'resolved').length}
                )
              </p>
              {Object.values(store.eventsById).filter((ev) => ev.timelineId === store.currentTimelineId && ev.type === 'faction_shift' && ev.status === 'resolved').length === 0 ? (
                <p className="muted">Завершённых событий изменения фронта пока нет.</p>
              ) : (
                <ul className="route-list">
                  {Object.values(store.eventsById)
                    .filter((ev) => ev.timelineId === store.currentTimelineId && ev.type === 'faction_shift' && ev.status === 'resolved')
                    .map((ev) => (
                      <li key={ev.id}>{ev.name}</li>
                    ))}
                </ul>
              )}
            </div>
          )}

          <div className="session-panel-section">
            <p className="side-panel-subheading">
              Ожидающие события изменения фронта (
              {Object.values(store.eventsById).filter((ev) => ev.timelineId === store.currentTimelineId && ev.type === 'faction_shift' && ev.status === 'planned').length}
              )
            </p>
            {Object.values(store.eventsById).filter((ev) => ev.timelineId === store.currentTimelineId && ev.type === 'faction_shift' && ev.status === 'planned').length === 0 ? (
              <p className="muted">Нет запланированных событий изменения фронта.</p>
            ) : (
              <ul className="route-list">
                {Object.values(store.eventsById)
                  .filter((ev) => ev.timelineId === store.currentTimelineId && ev.type === 'faction_shift' && ev.status === 'planned')
                  .map((ev) => (
                    <li key={ev.id}>
                      <strong>{ev.name}</strong>
                      <div className="actions">
                        <button onClick={() => store.updateCampaignEvent(ev.id, { status: 'resolved' })}>
                          Отметить завершённым
                        </button>
                      </div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {showStage4ADebugPanel && !isPlayerView && (
        <div className="session-panel card">
          <div className="session-panel-header">
            <h3>Зоны, наложения и сущности — {currentTimeline?.title ?? 'арка не выбрана'}</h3>
            <button onClick={() => setShowStage4ADebugPanel(false)}>Закрыть</button>
          </div>
          <div className="session-panel-section">
            <h4>Зоны фракций ({factionZonesForMap.length})</h4>
            <ul>
              {factionZonesForMap.map((z) => (
                <li key={z.id}>
                  {z.name} — {ZONE_TYPE_LABELS[z.type]}, {ZONE_STATUS_LABELS[z.status]}
                  {z.visibleInPlayerView ? ' · видна игрокам' : ' · только ДМ'}
                </li>
              ))}
              {factionZonesForMap.length === 0 && <li className="muted">Зон пока нет на этой карте.</li>}
            </ul>
          </div>

          {/* Dynamic Map Overlay MVP UI (Stage 4B) — create form + per-overlay
              controls, scoped to the current timeline+map exactly like the
              Faction Zones list above. */}
          <div className="session-panel-section">
            <h4>Динамические наложения карты ({dynamicOverlaysForMap.length})</h4>
            <div className="actions">
              {overlayDraft ? (
                <button onClick={() => { setOverlayDraft(null); setOverlayFormError(null); }}>Отменить</button>
              ) : (
                <button
                  onClick={() =>
                    setOverlayDraft({ name: '', type: 'fog', opacity: 0.35, active: true, visibleInPlayerView: false, description: '' })
                  }
                  disabled={!map}
                >
                  + Новое наложение
                </button>
              )}
            </div>
            {overlayDraft && (
              <div className="route-draft-form">
                <strong>Новое наложение карты</strong>
                <label>
                  Название
                  <input
                    type="text"
                    value={overlayDraft.name}
                    placeholder="Например: Туман над болотами"
                    onChange={(e) => setOverlayDraft({ ...overlayDraft, name: e.target.value })}
                  />
                </label>
                <label>
                  Тип
                  <select
                    value={overlayDraft.type}
                    onChange={(e) => setOverlayDraft({ ...overlayDraft, type: e.target.value as MapOverlayType })}
                  >
                    {OVERLAY_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{OVERLAY_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Прозрачность ({Math.round(overlayDraft.opacity * 100)}%)
                  <input
                    type="range"
                    min={5}
                    max={90}
                    value={Math.round(overlayDraft.opacity * 100)}
                    onChange={(e) => setOverlayDraft({ ...overlayDraft, opacity: Number(e.target.value) / 100 })}
                  />
                </label>
                <label className="reveal-toggle">
                  <input
                    type="checkbox"
                    checked={overlayDraft.active}
                    onChange={(e) => setOverlayDraft({ ...overlayDraft, active: e.target.checked })}
                  />
                  Активно
                </label>
                <label className="reveal-toggle">
                  <input
                    type="checkbox"
                    checked={overlayDraft.visibleInPlayerView}
                    onChange={(e) => setOverlayDraft({ ...overlayDraft, visibleInPlayerView: e.target.checked })}
                  />
                  Видно игрокам
                </label>
                <label>
                  Описание (только для ДМ)
                  <textarea
                    value={overlayDraft.description}
                    onChange={(e) => setOverlayDraft({ ...overlayDraft, description: e.target.value })}
                  />
                </label>
                {overlayFormError && <p className="route-editor-error">{overlayFormError}</p>}
                <div className="actions">
                  <button
                    onClick={() => {
                      if (!map) return;
                      if (!overlayDraft.name.trim()) {
                        setOverlayFormError('Нужно указать название наложения');
                        return;
                      }
                      const now = new Date().toISOString();
                      const newOverlay: DynamicMapOverlay = {
                        id: `overlay-${Date.now()}`,
                        timelineId: store.currentTimelineId,
                        mapId: map.id,
                        mapLevel: scope,
                        name: overlayDraft.name.trim(),
                        type: overlayDraft.type,
                        opacity: overlayDraft.opacity,
                        active: overlayDraft.active,
                        visibleInPlayerView: overlayDraft.visibleInPlayerView,
                        description: overlayDraft.description.trim() || undefined,
                        createdAt: now,
                        updatedAt: now,
                      };
                      store.addDynamicMapOverlay(newOverlay);
                      setOverlayDraft(null);
                      setOverlayFormError(null);
                    }}
                  >
                    Сохранить наложение
                  </button>
                </div>
              </div>
            )}
            <ul className="route-list">
              {dynamicOverlaysForMap.map((o) => (
                <li key={o.id}>
                  <strong>{o.name}</strong> — {OVERLAY_TYPE_LABELS[o.type]}
                  <span className="overlay-chip">{o.active ? 'активно' : 'неактивно'}</span>
                  <span className="overlay-chip">{o.visibleInPlayerView ? 'видно игрокам' : 'только ДМ'}</span>
                  <div className="actions">
                    <button onClick={() => store.updateDynamicMapOverlay(o.id, { active: !o.active })}>
                      {o.active ? 'Деактивировать' : 'Активировать'}
                    </button>
                    <button onClick={() => store.updateDynamicMapOverlay(o.id, { visibleInPlayerView: !o.visibleInPlayerView })}>
                      {o.visibleInPlayerView ? 'Скрыть от игроков' : 'Показать игрокам'}
                    </button>
                    <label>
                      Прозрачность
                      <input
                        type="range"
                        min={5}
                        max={90}
                        value={Math.round(o.opacity * 100)}
                        onChange={(e) => store.updateDynamicMapOverlay(o.id, { opacity: Number(e.target.value) / 100 })}
                      />
                    </label>
                    <button onClick={() => store.archiveDynamicMapOverlay(o.id)}>Архивировать / скрыть</button>
                  </div>
                </li>
              ))}
              {dynamicOverlaysForMap.length === 0 && <li className="muted">Наложений пока нет на этой карте.</li>}
            </ul>
          </div>

          {/* Movable Entity management UI (Stage 4B create form + per-entity
              controls; Stage 4C added the actual map markers — see
              .movable-entity-marker rendering above and the selection panel
              that opens on marker click). This list remains the
              data-management view; click a marker on the map (or "Открыть
              карточку" in Current Session) to open the richer panel. */}
          <div className="session-panel-section">
            <h4>Подвижные сущности ({movableEntitiesForMap.length})</h4>
            <p className="muted">На карте отображаются маркеры всех нескрытых сущностей (кроме типа «Партия» — у неё свой токен).</p>
            <p className="muted">Видно игрокам сейчас: {visibleMovableEntities.length} (всегда 0 — см. getPlayerSafeMovableEntities)</p>
            <div className="actions">
              {movableEntityDraft ? (
                <button onClick={() => { setMovableEntityDraft(null); setMovableEntityFormError(null); }}>Отменить</button>
              ) : (
                <button
                  onClick={() => setMovableEntityDraft({ entityType: 'npc', entityId: '', movementState: 'stationary', visibleInPlayerView: false })}
                >
                  + Новая сущность
                </button>
              )}
            </div>
            {movableEntityDraft && (
              <div className="route-draft-form">
                <strong>Новая подвижная сущность</strong>
                <label>
                  Тип сущности
                  <select
                    value={movableEntityDraft.entityType}
                    onChange={(e) => setMovableEntityDraft({ ...movableEntityDraft, entityType: e.target.value as MovableEntityType })}
                  >
                    {MOVABLE_ENTITY_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{MOVABLE_ENTITY_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  ID сущности (ссылка на NPC/врага/прочее, свободный текст)
                  <input
                    type="text"
                    value={movableEntityDraft.entityId}
                    onChange={(e) => setMovableEntityDraft({ ...movableEntityDraft, entityId: e.target.value })}
                  />
                </label>
                <label>
                  Состояние движения
                  <select
                    value={movableEntityDraft.movementState}
                    onChange={(e) => setMovableEntityDraft({ ...movableEntityDraft, movementState: e.target.value as MovementState })}
                  >
                    {MOVEMENT_STATE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{MOVEMENT_STATE_LABELS[s]}</option>
                    ))}
                  </select>
                </label>
                <label className="reveal-toggle">
                  <input
                    type="checkbox"
                    checked={movableEntityDraft.visibleInPlayerView}
                    onChange={(e) => setMovableEntityDraft({ ...movableEntityDraft, visibleInPlayerView: e.target.checked })}
                  />
                  Видна игрокам
                </label>
                {movableEntityFormError && <p className="route-editor-error">{movableEntityFormError}</p>}
                <div className="actions">
                  <button
                    onClick={() => {
                      if (!movableEntityDraft.entityId.trim()) {
                        setMovableEntityFormError('Нужно указать ID сущности');
                        return;
                      }
                      store.upsertMovableEntity({
                        id: `movable-${Date.now()}`,
                        entityType: movableEntityDraft.entityType,
                        entityId: movableEntityDraft.entityId.trim(),
                        timelineId: store.currentTimelineId,
                        currentMapId: map?.id,
                        mapLevel: scope,
                        movementState: movableEntityDraft.movementState,
                        visibleInPlayerView: movableEntityDraft.visibleInPlayerView,
                        updatedAt: new Date().toISOString(),
                      });
                      setMovableEntityDraft(null);
                      setMovableEntityFormError(null);
                    }}
                  >
                    Сохранить сущность
                  </button>
                </div>
              </div>
            )}
            <ul className="route-list">
              {movableEntitiesForMap.map((m) => {
                const posDraft = movableEntityPositionDrafts[m.id] ?? { x: '', y: '' };
                return (
                  <li key={m.id}>
                    <strong>{MOVABLE_ENTITY_TYPE_LABELS[m.entityType]}</strong> ({m.entityId})
                    <span className="overlay-chip">{MOVEMENT_STATE_LABELS[m.movementState]}</span>
                    <span className="overlay-chip">{m.visibleInPlayerView ? 'видна игрокам' : 'только ДМ'}</span>
                    <div className="entity-card-sub">
                      {m.currentLocationStateId && <>Локация: {data.locationStates.find((ls) => ls.id === m.currentLocationStateId)?.title ?? m.currentLocationStateId} · </>}
                      {m.currentRouteId && <>Маршрут: {routes.find((r) => r.id === m.currentRouteId)?.label ?? m.currentRouteId} · </>}
                      {m.currentPosition && <>Позиция: {m.currentPosition.x.toFixed(2)}, {m.currentPosition.y.toFixed(2)} · </>}
                      Обновлено: {new Date(m.updatedAt).toLocaleString('ru-RU')}
                    </div>
                    <div className="actions">
                      <select
                        value={m.movementState}
                        onChange={(e) => store.updateMovableEntity(m.id, { movementState: e.target.value as MovementState })}
                      >
                        {MOVEMENT_STATE_OPTIONS.map((s) => (
                          <option key={s} value={s}>{MOVEMENT_STATE_LABELS[s]}</option>
                        ))}
                      </select>
                      <select
                        value={m.currentRouteId ?? ''}
                        onChange={(e) => store.updateMovableEntity(m.id, { currentRouteId: e.target.value || undefined })}
                      >
                        <option value="">— маршрут не выбран —</option>
                        {routes.map((r) => (
                          <option key={r.id} value={r.id}>{r.label ?? r.id}</option>
                        ))}
                      </select>
                      <select
                        value={m.currentLocationStateId ?? ''}
                        onChange={(e) => store.updateMovableEntity(m.id, { currentLocationStateId: e.target.value || undefined })}
                      >
                        <option value="">— локация не выбрана —</option>
                        {locationsForTimeline.map((ls) => (
                          <option key={ls.id} value={ls.id}>{ls.title}</option>
                        ))}
                      </select>
                      {partyMarkerPoint ? (
                        <button onClick={() => applyPartyPositionToMovableEntity(m.id)}>
                          Использовать позицию партии
                        </button>
                      ) : (
                        <>
                          <input
                            type="number"
                            step="0.01"
                            placeholder="x (0..1)"
                            value={posDraft.x}
                            onChange={(e) => setMovableEntityPositionDrafts({ ...movableEntityPositionDrafts, [m.id]: { ...posDraft, x: e.target.value } })}
                          />
                          <input
                            type="number"
                            step="0.01"
                            placeholder="y (0..1)"
                            value={posDraft.y}
                            onChange={(e) => setMovableEntityPositionDrafts({ ...movableEntityPositionDrafts, [m.id]: { ...posDraft, y: e.target.value } })}
                          />
                          <button
                            onClick={() => {
                              const x = Number(posDraft.x);
                              const y = Number(posDraft.y);
                              if (!Number.isFinite(x) || !Number.isFinite(y)) return;
                              store.updateMovableEntity(m.id, { currentPosition: { x, y } });
                            }}
                          >
                            Задать позицию
                          </button>
                        </>
                      )}
                      <button onClick={() => setSelectedMovableEntityId(m.id)}>Открыть карточку</button>
                      <button onClick={() => store.archiveMovableEntity(m.id)}>Архивировать / скрыть</button>
                    </div>
                  </li>
                );
              })}
              {movableEntitiesForMap.length === 0 && <li className="muted">Подвижных сущностей пока нет на этой карте.</li>}
            </ul>
          </div>
        </div>
      )}

      {showPendingTriggers && !isPlayerView && (
        <div className="session-panel card pending-triggers-panel">
          <div className="session-panel-header">
            <h3>Ожидающие триггеры — {currentTimeline?.title ?? 'арка не выбрана'}</h3>
            <button onClick={() => setShowPendingTriggers(false)}>Закрыть</button>
          </div>

          <div className="session-panel-section actions">
            <button
              onClick={() => {
                const name = window.prompt('Название триггера:');
                if (!name) return;
                const dayStr = window.prompt('День срабатывания (число):', String(calendar.currentDay));
                if (dayStr === null) return;
                const day = Math.max(1, Math.floor(Number(dayStr) || calendar.currentDay));
                const now = new Date().toISOString();
                const newTrigger: DelayedTrigger = {
                  id: `trigger-${Date.now()}`,
                  timelineId: store.currentTimelineId,
                  name,
                  triggerType: 'date',
                  date: { day, month: calendar.currentMonth, year: calendar.currentYear },
                  effect: { type: 'create_event', payload: { name, type: 'note' } },
                  status: 'armed',
                  visibleInPlayerView: false,
                  createdAt: now,
                  updatedAt: now,
                };
                store.addDelayedTrigger(newTrigger);
              }}
            >
              + Триггер по дате
            </button>
            <button
              onClick={() => {
                const name = window.prompt('Название ручного триггера:');
                if (!name) return;
                const now = new Date().toISOString();
                const newTrigger: DelayedTrigger = {
                  id: `trigger-${Date.now()}`,
                  timelineId: store.currentTimelineId,
                  name,
                  triggerType: 'manual',
                  effect: { type: 'create_event', payload: { name, type: 'note' } },
                  status: 'armed',
                  visibleInPlayerView: false,
                  createdAt: now,
                  updatedAt: now,
                };
                store.addDelayedTrigger(newTrigger);
              }}
            >
              + Ручной триггер
            </button>
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">
              Сработавшие по дате/времени ({pendingTriggersForReview.length})
            </p>
            {pendingTriggersForReview.length === 0 ? (
              <p className="muted">Нет триггеров, чья дата уже наступила.</p>
            ) : (
              <ul className="route-list">
                {pendingTriggersForReview.map((t) => (
                  <li key={t.id}>
                    <strong>{t.name}</strong>
                    <span className="status-badge"> {t.triggerType}</span>
                    <span className="status-badge trigger-warning-badge"> {t.status}</span>
                    {t.date && (
                      <span className="entity-card-sub">
                        {' '}
                        · {t.date.day} {t.date.month} {t.date.year}
                        {t.timeOfDay ? ` · ${t.timeOfDay}` : ''}
                      </span>
                    )}
                    {t.date && isMonthOrderUnknownForDate(t.date, calendar) && (
                      <p className="muted trigger-month-order-note">
                        Порядок месяцев не задан — межмесячные триггеры проверяются осторожно.
                      </p>
                    )}
                    {t.routeId && <span className="entity-card-sub"> · маршрут: {t.routeId}</span>}
                    {t.linkedLocationStateId && (
                      <span className="entity-card-sub"> · локация: {t.linkedLocationStateId}</span>
                    )}
                    {t.description && <p className="muted">{t.description}</p>}
                    <p className="entity-card-sub">
                      Эффект: {t.effect.type}
                      {t.effect.type !== 'create_event' && ' — эффект пока не автоматизирован'}
                    </p>
                    <div className="actions">
                      {t.effect.type === 'create_event' ? (
                        <button onClick={() => applyCreateEventTrigger(t)}>Применить</button>
                      ) : (
                        <>
                          <span className="muted">Эффект пока не автоматизирован</span>
                          <button onClick={() => createEventManuallyForTrigger(t)}>Создать событие вручную</button>
                        </>
                      )}
                      <button onClick={() => store.resolveDelayedTrigger(t.id)}>Завершить</button>
                      <button onClick={() => store.archiveDelayedTrigger(t.id)}>Отменить</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">
              Ручные триггеры ({manualTriggersForReview.length})
            </p>
            {manualTriggersForReview.length === 0 ? (
              <p className="muted">Нет ручных триггеров на этой арке.</p>
            ) : (
              <ul className="route-list">
                {manualTriggersForReview.map((t) => (
                  <li key={t.id}>
                    <strong>{t.name}</strong>
                    <span className="status-badge"> manual</span>
                    {t.description && <p className="muted">{t.description}</p>}
                    <div className="actions">
                      {t.effect.type === 'create_event' ? (
                        <button onClick={() => applyCreateEventTrigger(t)}>Применить</button>
                      ) : (
                        <button onClick={() => createEventManuallyForTrigger(t)}>Создать событие вручную</button>
                      )}
                      <button onClick={() => store.resolveDelayedTrigger(t.id)}>Завершить</button>
                      <button onClick={() => store.archiveDelayedTrigger(t.id)}>Отменить</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="session-panel-section">
            <p className="side-panel-subheading">Все вооружённые триггеры арки ({armedTriggersForTimeline.length})</p>
            {armedTriggersForTimeline.length === 0 ? (
              <p className="muted">На этой арке пока нет триггеров. Создайте их через панель локации/маршрута.</p>
            ) : (
              <ul className="route-list">
                {armedTriggersForTimeline.map((t) => (
                  <li key={t.id}>
                    {t.name} <span className="status-badge"> {t.triggerType}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <div className="workspace-body">
        <div className="workspace-map-area">
          <div className="map-zoom-controls">
            <button onClick={() => zoomBy(1.2)}>+</button>
            <button onClick={() => zoomBy(1 / 1.2)}>−</button>
            <button onClick={resetView}>Сброс</button>
            <button onClick={resetView}>По размеру экрана</button>
            {!isPlayerView && (
              <button
                className={store.placementLayerVisible ? 'active' : ''}
                onClick={() => store.setPlacementLayerVisible(!store.placementLayerVisible)}
                title="Показать/скрыть слой размещённых объектов"
              >
                Объекты {store.placementLayerVisible ? '(вкл)' : '(выкл)'}
              </button>
            )}
          </div>

          {isEditMode && (() => {
            const activeTool: 'hotspot' | 'route' | 'entity' | 'zone' | 'select' = placingHotspot || locationPlacementDraft
              ? 'hotspot'
              : routeDraft || editingRouteId
                ? 'route'
                : placementMode
                  ? 'entity'
                  : zoneDraft || editingZoneId
                    ? 'zone'
                    : 'select';
            const TOOL_LABELS: Record<typeof activeTool, string> = {
              select: 'Выбор / просмотр объектов',
              hotspot: locationPlacementDraft
                ? 'Заполните форму новой локации ниже и сохраните'
                : 'Кликните по карте, чтобы поставить новую локацию',
              route: 'Построение маршрута',
              entity: `Размещение объекта${placementMode ? `: «${placementMode.title}»` : ''}`,
              zone: zoneDraft
                ? `Кликами по карте добавляйте точки зоны (сейчас: ${zoneDraft.points.length}, нужно минимум 3)`
                : 'Редактирование зоны: клик по карте — добавить точку, клик по точке — выбрать',
            };
            return (
              <div className="edit-mode-toolbar">
                <span className="edit-mode-toolbar-label">Инструмент:</span>
                <button
                  className={activeTool === 'select' ? 'active' : ''}
                  onClick={cancelAllEditTools}
                  title="Выбрать и редактировать существующие объекты — клик по карте просто выбирает их"
                >
                  Выбрать / редактировать
                </button>
                <button
                  className={activeTool === 'hotspot' ? 'active' : ''}
                  onClick={() => {
                    if (placingHotspot) {
                      setPlacingHotspot(false);
                      return;
                    }
                    cancelAllEditTools();
                    setPlacingHotspot(true);
                  }}
                  title="Кликните по карте, чтобы поставить новую локацию (hotspot)"
                >
                  Разместить локацию
                </button>
                <button
                  className={activeTool === 'route' ? 'active' : ''}
                  disabled={!!routeDraft || !!editingRouteId}
                  onClick={() => {
                    cancelAllEditTools();
                    setRouteDraft({ title: '', fromHotspotId: '', toHotspotId: '' });
                  }}
                  title="Постройте новый маршрут кликами по карте"
                >
                  Построить маршрут
                </button>
                {placementMode && (
                  <button className="active" onClick={() => setPlacementMode(null)}>
                    Завершить размещение объекта
                  </button>
                )}
                <button
                  className={zoneDraft ? 'active' : ''}
                  disabled={!!editingZoneId}
                  onClick={() => {
                    if (zoneDraft) {
                      setZoneDraft(null);
                      return;
                    }
                    startNewZoneDraft();
                  }}
                  title="Постройте новую зону фракции кликами по карте (минимум 3 точки)"
                >
                  Новая зона
                </button>
                {editingZoneId && (
                  <button className="active" onClick={() => setEditingZoneId(null)}>
                    Завершить редактирование зоны
                  </button>
                )}
                <button
                  className={quickPinArming ? 'active' : ''}
                  disabled={!!quickPinDraft}
                  onClick={() => {
                    if (quickPinArming) {
                      setQuickPinArming(false);
                      return;
                    }
                    cancelAllEditTools();
                    setQuickPinArming(true);
                  }}
                  title="Поставить быструю заметку на карте"
                >
                  Quick Pin
                </button>
                <button
                  className={battleEntryCreationArmed ? 'active' : ''}
                  disabled={!!battleEntryDraft}
                  onClick={() => {
                    if (battleEntryCreationArmed) {
                      setBattleEntryCreationArmed(false);
                      return;
                    }
                    cancelAllEditTools();
                    setBattleEntryCreationArmed(true);
                  }}
                  title="Кликните по карте, чтобы создать новую боевую сцену в этой точке"
                >
                  Новая боевая сцена
                </button>
                <button
                  title="Создаёт тестовую боевую сцену без клика по карте — для проверки launch/return-flow. Не видна игрокам. Архивируйте после проверки."
                  onClick={() => {
                    cancelAllEditTools();
                    const now = new Date().toISOString();
                    const id = `battle-entry-smoke-${Date.now()}`;
                    const position = partyMarkerPoint ?? { x: 0.5, y: 0.5 };
                    const newEntry: BattleEntry = {
                      id,
                      timelineId: store.currentTimelineId,
                      sourceMapId: map?.id,
                      mapLevel: scope,
                      sourceLocationStateId: selectedLocationStateId ?? undefined,
                      name: 'Smoke Test Battle Entry',
                      position,
                      status: 'available',
                      sceneSize: 'standard_30x30',
                      visibleInPlayerView: false,
                      description: 'Создано кнопкой "Тестовая боевая сцена" для проверки launch/return-flow без клика по карте. Архивируйте после проверки.',
                      createdAt: now,
                      updatedAt: now,
                    };
                    store.addBattleEntry(newEntry);
                    setSelectedBattleEntryId(id);
                  }}
                >
                  Тестовая боевая сцена
                </button>
                {hotspots.some((h) => h.needsCoordinateReview) && (
                  <button
                    onClick={() => {
                      if (
                        !window.confirm(
                          'Подтвердить текущие позиции объектов на этой карте? Координаты не будут изменены, только статус проверки будет снят.',
                        )
                      ) {
                        return;
                      }
                      hotspots
                        .filter((h) => h.needsCoordinateReview)
                        .forEach((h) => store.patchHotspot(h.id, { needsCoordinateReview: false }));
                    }}
                  >
                    Подтвердить позиции на карте
                  </button>
                )}
                {routes.length > 0 && (
                  <button
                    className="btn-danger"
                    onClick={() => {
                      if (!window.confirm(`Удалить все маршруты этой карты (${routes.length})?`)) return;
                      routes.forEach((r) => store.deleteRoute(r.id));
                      setSelectedRouteId(null);
                      setEditingRouteId(null);
                      setEditingRouteSnapshot(null);
                    }}
                  >
                    Удалить все маршруты
                  </button>
                )}
                <span className="edit-mode-toolbar-active-hint">{TOOL_LABELS[activeTool]}</span>
                {workspaceMode.mode === 'area_edit' && (
                  <span className="area-edit-mode-badge" title="Кликайте по карте, чтобы добавить вершины зоны. Минимум 3 точки. Перетащите вершину, чтобы изменить форму.">
                    Режим редактирования зон
                  </span>
                )}
              </div>
            );
          })()}

          {isEditMode && placingHotspot && (
            <p className="placement-hint">Кликните по карте, чтобы поставить точку.</p>
          )}
          <QuickPinPanel
            isEditMode={isEditMode}
            isArming={quickPinArming}
            draft={quickPinDraft}
            onDraftChange={setQuickPinDraft}
            onSave={saveQuickPinDraft}
            onCancel={() => setQuickPinDraft(null)}
          />
          {isEditMode && battleEntryCreationArmed && (
            <p className="placement-hint">Кликните по карте, чтобы создать боевую сцену в этой точке.</p>
          )}
          {isEditMode && battleEntryDraft && (
            <div className="route-draft-form">
              <strong>{editingBattleEntryId ? 'Редактировать боевую сцену' : 'Новая боевая сцена'}</strong>
              <label>
                Название
                <input
                  type="text"
                  autoFocus
                  value={battleEntryDraft.name}
                  placeholder="Например: Засада у моста"
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, name: e.target.value })}
                />
              </label>
              <label>
                Статус
                <select
                  value={battleEntryDraft.status}
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, status: e.target.value as BattleEntryStatus })}
                >
                  {(['prepared', 'available', 'active', 'completed', 'disabled', 'hidden'] as BattleEntryStatus[]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Размер сцены
                <select
                  value={battleEntryDraft.sceneSize}
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, sceneSize: e.target.value as BattleSceneSize })}
                >
                  {(['standard_30x30', 'medium_60x60', 'large_120x120', 'custom'] as BattleSceneSize[]).map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Рекомендуемый уровень партии
                <input
                  type="number"
                  min={1}
                  value={battleEntryDraft.recommendedPartyLevel}
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, recommendedPartyLevel: e.target.value })}
                />
              </label>
              <label>
                ID карты боя (battleMapId, необязательно)
                <input
                  type="text"
                  value={battleEntryDraft.battleMapId}
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, battleMapId: e.target.value })}
                />
              </label>
              <label>
                Прямая ссылка на карту боя (battleMapUrl, необязательно)
                <input
                  type="text"
                  value={battleEntryDraft.battleMapUrl}
                  placeholder="http://localhost:5174/#/maps/map-xxxxxxxx/play"
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, battleMapUrl: e.target.value })}
                />
              </label>
              <label>
                Описание (ДМ)
                <textarea
                  rows={2}
                  value={battleEntryDraft.description}
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, description: e.target.value })}
                />
              </label>
              <label>
                Безопасное описание для игроков
                <textarea
                  rows={2}
                  value={battleEntryDraft.playerSafeDescription}
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, playerSafeDescription: e.target.value })}
                />
              </label>
              <label className="reveal-toggle">
                <input
                  type="checkbox"
                  checked={battleEntryDraft.visibleInPlayerView}
                  onChange={(e) => setBattleEntryDraft({ ...battleEntryDraft, visibleInPlayerView: e.target.checked })}
                />
                Видимо игрокам (безопасный превью)
              </label>
              {battleEntryFormError && <p className="form-error">{battleEntryFormError}</p>}
              <div className="actions">
                <button
                  onClick={() => {
                    if (!battleEntryDraft.name.trim()) {
                      setBattleEntryFormError('Нужно указать название сцены');
                      return;
                    }
                    const now = new Date().toISOString();
                    const recommendedPartyLevel = battleEntryDraft.recommendedPartyLevel
                      ? Number(battleEntryDraft.recommendedPartyLevel)
                      : undefined;
                    if (editingBattleEntryId) {
                      store.updateBattleEntry(editingBattleEntryId, {
                        name: battleEntryDraft.name.trim(),
                        status: battleEntryDraft.status,
                        sceneSize: battleEntryDraft.sceneSize,
                        recommendedPartyLevel,
                        battleMapId: battleEntryDraft.battleMapId.trim() || undefined,
                        battleMapUrl: battleEntryDraft.battleMapUrl.trim() || undefined,
                        visibleInPlayerView: battleEntryDraft.visibleInPlayerView,
                        description: battleEntryDraft.description.trim() || undefined,
                        playerSafeDescription: battleEntryDraft.playerSafeDescription.trim() || undefined,
                      });
                      setSelectedBattleEntryId(editingBattleEntryId);
                    } else {
                      const id = `battle-entry-${Date.now()}`;
                      const newEntry: BattleEntry = {
                        id,
                        timelineId: store.currentTimelineId,
                        sourceMapId: map?.id,
                        mapLevel: scope,
                        sourceLocationStateId: selectedLocationStateId ?? undefined,
                        name: battleEntryDraft.name.trim(),
                        position: { x: battleEntryDraft.x, y: battleEntryDraft.y },
                        status: battleEntryDraft.status,
                        sceneSize: battleEntryDraft.sceneSize,
                        recommendedPartyLevel,
                        battleMapId: battleEntryDraft.battleMapId.trim() || undefined,
                        battleMapUrl: battleEntryDraft.battleMapUrl.trim() || undefined,
                        visibleInPlayerView: battleEntryDraft.visibleInPlayerView,
                        description: battleEntryDraft.description.trim() || undefined,
                        playerSafeDescription: battleEntryDraft.playerSafeDescription.trim() || undefined,
                        createdAt: now,
                        updatedAt: now,
                      };
                      store.addBattleEntry(newEntry);
                      setSelectedBattleEntryId(id);
                    }
                    setBattleEntryDraft(null);
                    setEditingBattleEntryId(null);
                    setBattleEntryFormError(null);
                  }}
                >
                  Сохранить
                </button>
                <button
                  onClick={() => {
                    setBattleEntryDraft(null);
                    setEditingBattleEntryId(null);
                    setBattleEntryFormError(null);
                  }}
                >
                  Отмена
                </button>
              </div>
            </div>
          )}
          {isEditMode && routeDraft && (
            <div className="route-draft-form">
              <strong>Новый маршрут</strong>
              <p className="muted">
                1. Выберите начальную и конечную точку — оба поля обязательны, иначе партия не сможет идти по этому
                маршруту и будет перемещаться напрямую. 2. Нажмите «Начать рисовать». 3. Кликами по карте нарисуйте путь.
              </p>
              <label>
                Название маршрута
                <input
                  type="text"
                  value={routeDraft.title}
                  placeholder="Например: Рынок — Доки"
                  onChange={(e) => setRouteDraft({ ...routeDraft, title: e.target.value })}
                />
              </label>
              <label>
                Откуда
                <select
                  value={routeDraft.fromHotspotId}
                  onChange={(e) => setRouteDraft({ ...routeDraft, fromHotspotId: e.target.value })}
                >
                  <option value="">— не выбрано —</option>
                  {hotspots.map((h) => (
                    <option key={h.id} value={h.id}>{h.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Куда
                <select
                  value={routeDraft.toHotspotId}
                  onChange={(e) => setRouteDraft({ ...routeDraft, toHotspotId: e.target.value })}
                >
                  <option value="">— не выбрано —</option>
                  {hotspots.map((h) => (
                    <option key={h.id} value={h.id}>{h.label}</option>
                  ))}
                </select>
              </label>
              {routeEditorError && <p className="route-editor-error">{routeEditorError}</p>}
              <div className="actions">
                <button onClick={startDrawingNewRoute}>Начать рисовать</button>
                <button onClick={() => { setRouteDraft(null); setRouteEditorError(null); }}>Отмена</button>
              </div>
            </div>
          )}
          {isEditMode && pendingPlacementPoint && data && (
            <div className="object-picker-overlay" onClick={() => setPendingPlacementPoint(null)}>
              <div className="object-picker-modal" onClick={(e) => e.stopPropagation()}>
                <div className="object-picker-header">
                  <div>
                    <h2>Что разместить здесь?</h2>
                    <p className="muted">
                      Карта: {map?.title ?? ''} · x={pendingPlacementPoint.x.toFixed(3)}, y={pendingPlacementPoint.y.toFixed(3)}
                    </p>
                  </div>
                  <button className="btn-ghost" onClick={() => setPendingPlacementPoint(null)}>Отмена ✕</button>
                </div>
                <input
                  className="object-picker-search"
                  placeholder="Поиск по названию…"
                  value={objectPickerSearch}
                  onChange={(e) => setObjectPickerSearch(e.target.value)}
                />
                <div className="object-picker-tabs">
                  {([
                    ['locations', `Локации (${data.locationStates.filter((ls) => ls.timelineId === store.currentTimelineId).length})`],
                    ['taverns', `Таверны (${data.taverns.length})`],
                    ['shops', `Магазины (${data.shops.length})`],
                    ['npcs', `NPC (${npcsForArc.length})`],
                    ['quests', `Квесты (${data.quests.length})`],
                    ['enemies', `Враги (${data.enemies.length})`],
                    ['battleEntries', `Боевые сцены (${Object.values(store.battleEntriesById).filter((be) => be.timelineId === store.currentTimelineId).length})`],
                    ['images', `Изображения (${data.images.length})`],
                  ] as const).map(([key, label]) => (
                    <button
                      key={key}
                      className={objectPickerTab === key ? 'active' : ''}
                      onClick={() => setObjectPickerTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div className="object-picker-grid">
                  {objectPickerTab === 'locations' &&
                    data.locationStates
                      .filter((ls) => !data.hotspots.some((h) => h.timelineId === ls.timelineId && h.locationStateId === ls.id))
                      .filter((ls) => ls.timelineId === store.currentTimelineId)
                      .filter((ls) => ls.title.toLowerCase().includes(objectPickerSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((ls) => (
                        <div className="object-picker-card" key={ls.id}>
                          <LibraryThumb type="location" entity={ls} images={data.images} />
                          <strong>{ls.title}</strong>
                          <span className="muted">{ls.type}</span>
                          <p>{resolveEntityShortDescription('location', ls, 90)}</p>
                          <button className="btn-primary btn-compact" onClick={() => placeExistingLocationAtPendingPoint(ls.id)}>
                            Разместить здесь
                          </button>
                        </div>
                      ))}
                  {objectPickerTab === 'taverns' &&
                    data.taverns
                      .filter((t) => t.name.toLowerCase().includes(objectPickerSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((t) => {
                        const placedElsewhere = data.locationStates.some(
                          (ls) => ls.sourceLibraryType === 'tavern' && ls.sourceLibraryId === t.id,
                        );
                        return (
                          <div className="object-picker-card" key={t.id}>
                            <LibraryThumb type="tavern" entity={t} images={data.images} />
                            <strong>{t.name}</strong>
                            <span className="muted">Таверна</span>
                            <p>{resolveEntityShortDescription('tavern', t, 90)}</p>
                            <button
                              className="btn-primary btn-compact"
                              disabled={placedElsewhere}
                              onClick={() => placeLibraryEntityAtPendingPoint('tavern', t.id, t.name)}
                            >
                              {placedElsewhere ? 'Уже размещено' : 'Разместить здесь'}
                            </button>
                          </div>
                        );
                      })}
                  {objectPickerTab === 'shops' &&
                    data.shops
                      .filter((s) => s.name.toLowerCase().includes(objectPickerSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((s) => {
                        const placedElsewhere = data.locationStates.some(
                          (ls) => ls.sourceLibraryType === 'shop' && ls.sourceLibraryId === s.id,
                        );
                        return (
                          <div className="object-picker-card" key={s.id}>
                            <LibraryThumb type="shop" entity={s} images={data.images} />
                            <strong>{s.name}</strong>
                            <span className="muted">Магазин</span>
                            <p>{resolveEntityShortDescription('shop', s, 90)}</p>
                            <button
                              className="btn-primary btn-compact"
                              disabled={placedElsewhere}
                              onClick={() => placeLibraryEntityAtPendingPoint('shop', s.id, s.name)}
                            >
                              {placedElsewhere ? 'Уже размещено' : 'Разместить здесь'}
                            </button>
                          </div>
                        );
                      })}
                  {objectPickerTab === 'npcs' && (
                    <>
                      <p className="muted" style={{ padding: '0 4px', flexBasis: '100%' }}>
                        «Поставить NPC на карту» создаёт отдельный маркер NPC в этой точке (или переносит сюда уже существующий маркер этого NPC — см. Stage 6C.4B). Привязка NPC к локации без маркера остаётся через карточку локации.
                      </p>
                      {npcsForArc
                        .filter((n) => n.name.toLowerCase().includes(objectPickerSearch.toLowerCase()))
                        .slice(0, 30)
                        .map((n) => {
                          const existingMarker = Object.values(store.movableEntitiesById).find(
                            (m) => m.entityType === 'npc' && m.entityId === n.id,
                          );
                          return (
                            <div className="object-picker-card" key={n.id}>
                              <LibraryThumb type="npc" entity={n} images={data.images} />
                              <strong>{n.name}</strong>
                              <span className="muted">{n.role}</span>
                              <p>{resolveEntityShortDescription('npc', n, 90)}</p>
                              <button
                                className="btn-primary btn-compact"
                                onClick={() => {
                                  maybeOpenLinkMenuOrPlace('npc', n.id, n.name, pendingPlacementPoint!);
                                  setPendingPlacementPoint(null);
                                }}
                              >
                                {existingMarker ? 'Переместить маркер сюда' : 'Поставить NPC на карту'}
                              </button>
                            </div>
                          );
                        })}
                    </>
                  )}
                  {objectPickerTab === 'quests' &&
                    data.quests
                      .filter((q) => q.title.toLowerCase().includes(objectPickerSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((q) => {
                        const existingMarker = Object.values(store.movableEntitiesById).find(
                          (m) => m.entityType === 'quest' && m.entityId === q.id,
                        );
                        return (
                          <div className="object-picker-card" key={q.id}>
                            <LibraryThumb type="quest" entity={q} images={data.images} />
                            <strong>{q.title}</strong>
                            <span className="muted">{q.status}</span>
                            <p>{resolveEntityShortDescription('quest', q, 90)}</p>
                            <button
                              className="btn-primary btn-compact"
                              onClick={() => {
                                maybeOpenLinkMenuOrPlace('quest', q.id, q.title, pendingPlacementPoint!);
                                setPendingPlacementPoint(null);
                              }}
                            >
                              {existingMarker ? 'Переместить сюда' : 'Поставить квестовую точку'}
                            </button>
                          </div>
                        );
                      })}
                  {objectPickerTab === 'enemies' &&
                    data.enemies
                      .filter((e) => e.name.toLowerCase().includes(objectPickerSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((e) => {
                        const existingMarker = Object.values(store.movableEntitiesById).find(
                          (m) => m.entityType === 'enemy' && m.entityId === e.id,
                        );
                        return (
                          <div className="object-picker-card" key={e.id}>
                            <LibraryThumb type="enemy" entity={e} images={data.images} />
                            <strong>{e.name}</strong>
                            <span className="muted">{e.role}</span>
                            <p>{resolveEntityShortDescription('enemy', e, 90)}</p>
                            <button
                              className="btn-primary btn-compact"
                              onClick={() => {
                                maybeOpenLinkMenuOrPlace('enemy', e.id, e.name, pendingPlacementPoint!);
                                setPendingPlacementPoint(null);
                              }}
                            >
                              {existingMarker ? 'Переместить сюда' : 'Поставить врага/угрозу'}
                            </button>
                          </div>
                        );
                      })}
                  {objectPickerTab === 'battleEntries' &&
                    Object.values(store.battleEntriesById)
                      .filter((be) => be.timelineId === store.currentTimelineId)
                      .filter((be) => be.name.toLowerCase().includes(objectPickerSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((be) => {
                        const placedHere = !!map && be.sourceMapId === map.id && (!be.mapLevel || be.mapLevel === scope);
                        return (
                          <div className="object-picker-card" key={be.id}>
                            <LibraryThumb type="battleEntry" entity={be} images={data.images} battleMaps={data.battleMaps} />
                            <strong>{be.name}</strong>
                            <span className="muted">{be.status}</span>
                            <p>{resolveEntityShortDescription('battleEntry', be, 90)}</p>
                            <button
                              className="btn-primary btn-compact"
                              onClick={() => {
                                maybeOpenLinkMenuOrPlace('battleEntry', be.id, be.name, pendingPlacementPoint!);
                                setPendingPlacementPoint(null);
                              }}
                            >
                              {placedHere ? 'Переместить сюда' : 'Поставить боевую сцену'}
                            </button>
                          </div>
                        );
                      })}
                  {objectPickerTab === 'images' &&
                    data.images
                      .filter((img) => img.title.toLowerCase().includes(objectPickerSearch.toLowerCase()))
                      .slice(0, 30)
                      .map((img) => {
                        const existingMarker = Object.values(store.movableEntitiesById).find(
                          (m) => m.entityType === 'image' && m.entityId === img.id,
                        );
                        return (
                          <div className="object-picker-card" key={img.id}>
                            <LibraryThumb type="image" entity={img} images={data.images} />
                            <strong>{img.title}</strong>
                            <span className="muted">{img.type}</span>
                            <button
                              className="btn-primary btn-compact"
                              onClick={() => {
                                maybeOpenLinkMenuOrPlace('image', img.id, img.title, pendingPlacementPoint!);
                                setPendingPlacementPoint(null);
                              }}
                            >
                              {existingMarker ? 'Переместить сюда' : 'Поставить изображение'}
                            </button>
                          </div>
                        );
                      })}
                </div>
                <div className="object-picker-footer">
                  <button className="btn-secondary" onClick={openNewLocationFormAtPendingPoint}>
                    Создать новый объект вместо выбора готового
                  </button>
                </div>
              </div>
            </div>
          )}
          {isEditMode && linkMenuState && (
            <div className="object-picker-overlay" onClick={() => runLinkMenuAction('cancel')}>
              <div className="link-target-menu" onClick={(e) => e.stopPropagation()}>
                <h3>
                  Что сделать с объектом рядом с локацией «{linkMenuState.nearestLs.title}»?
                </h3>
                <p className="muted">{linkMenuState.title}</p>
                {isContentLinkedToLocation(linkMenuState.type, linkMenuState.sourceId, linkMenuState.nearestLs.id) && (
                  <p className="muted">Уже привязан к этой локации.</p>
                )}
                <div className="link-target-menu-actions">
                  <button className="btn-secondary" onClick={() => runLinkMenuAction('place')}>
                    Поставить маркер здесь
                  </button>
                  <button className="btn-secondary" onClick={() => runLinkMenuAction('link')}>
                    Привязать к локации
                  </button>
                  <button className="btn-primary" onClick={() => runLinkMenuAction('both')}>
                    Поставить маркер и привязать
                  </button>
                  <button className="btn-ghost" onClick={() => runLinkMenuAction('cancel')}>
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* Stage 6C.5 Phase 2B — Library is now a centered workspace modal
              instead of a side drawer. Trade-off accepted explicitly per
              spec: a full-screen backdrop means drag-and-drop onto the map
              cannot work while this modal is open (it covers the map) —
              arm-then-click remains the primary, fully-supported workflow,
              and every "Разместить…"/"Связать…" action below also closes
              this modal immediately so the very next map click lands
              correctly, exactly like the old inline-aside Library used to
              behave (the map was always reachable there too). */}
          {isDmMode && libraryDrawerOpen && data && (
            <div
              className="library-drawer-panel"
              onClick={() => {
                if (!placingLibraryEntity && !placingExistingLocationId && !placingNpcEntityId && !placingContentEntity && !placingBattleEntryId) {
                  setLibraryDrawerOpen(false);
                }
              }}
            >
              <div className="library-drawer-panel-inner" onClick={(e) => e.stopPropagation()}>
                <div className="library-drawer-header">
                  <div>
                    <h2>Библиотека</h2>
                    <span className="muted">
                      Арка: {store.currentTimelineId} · Карта: {map?.title ?? '—'}
                    </span>
                  </div>
                  <button className="btn-ghost" onClick={() => setLibraryDrawerOpen(false)}>
                    Закрыть ✕
                  </button>
                </div>
                <div className="library-drawer-body">
                  <LibraryPanel
                    locations={locationsForTimeline}
                    npcs={npcsForArc}
                    taverns={data.taverns}
                    shops={data.shops}
                    hotspotsOnCurrentMap={hotspots}
                    allHotspots={data.hotspots}
                    placedSourceIds={new Set(
                      locationsForTimeline
                        .filter((ls) => ls.sourceLibraryId)
                        .map((ls) => `${ls.sourceLibraryType}:${ls.sourceLibraryId}`),
                    )}
                    placingLibraryEntity={placingLibraryEntity}
                    onPlaceOnMap={(type, sourceId, title) => {
                      setPlacingLibraryEntity({ type, sourceId, title });
                      setLibraryDrawerOpen(false);
                    }}
                    selectedLs={selectedLs ?? null}
                    placingExistingLocationId={placingExistingLocationId}
                    onPlaceExistingLocation={(locationId) => {
                      setPlacingExistingLocationId(locationId);
                      setLibraryDrawerOpen(false);
                    }}
                    onSelectLocationCard={(locationId) => {
                      selectLocation(locationId);
                      setObjectWindowSection('overview');
                      setObjectWindowOpen(true);
                      setLibraryDrawerOpen(false);
                    }}
                    onLinkNpcToSelected={(npcId) => {
                      if (!selectedLs) return;
                      if (selectedLs.npcIds.includes(npcId)) return;
                      store.patchLocationState(selectedLs.id, { npcIds: [...selectedLs.npcIds, npcId] });
                    }}
                    images={data.images}
                    quests={data.quests}
                    enemies={data.enemies}
                    battleMaps={data.battleMaps}
                    battleEntries={Object.values(store.battleEntriesById).filter(
                      (be) => be.timelineId === store.currentTimelineId,
                    )}
                    npcMovableEntities={Object.values(store.movableEntitiesById).filter((m) => m.entityType === 'npc')}
                    currentMapId={map?.id}
                    placingNpcEntityId={placingNpcEntityId}
                    onPlaceNpcOnMap={(npcId) => {
                      setPlacingNpcEntityId(npcId);
                      setLibraryDrawerOpen(false);
                    }}
                    onEditNpc={(npc) => {
                      const full = data.npcs.find((n) => n.id === npc.id);
                      openNpcEditor(full ?? npc);
                    }}
                    onEditTavern={(t) => {
                      const full = data.taverns.find((x) => x.id === t.id);
                      openTavernEditor(full ?? t);
                    }}
                    onEditShop={(s) => {
                      const full = data.shops.find((x) => x.id === s.id);
                      openShopEditor(full ?? s);
                    }}
                    onEditImage={(img) => {
                      const full = data.images.find((x) => x.id === img.id);
                      openImageEditor(full ?? img);
                    }}
                    onEditBattleEntry={(be) => openBattleEntryEditor(be)}
                    contentMovableEntities={Object.values(store.movableEntitiesById).filter(
                      (m) => m.entityType === 'quest' || m.entityType === 'enemy' || m.entityType === 'image',
                    )}
                    placingContentEntity={placingContentEntity}
                    onPlaceContentEntity={(type, sourceId) => {
                      setPlacingContentEntity({ type, sourceId });
                      setLibraryDrawerOpen(false);
                    }}
                    placingBattleEntryId={placingBattleEntryId}
                    onPlaceBattleEntry={(beId) => {
                      setPlacingBattleEntryId(beId);
                      setLibraryDrawerOpen(false);
                    }}
                    onDragStartCard={(sourceType, sourceId, title) => setDragPayload({ sourceType, sourceId, title })}
                    onDragEndCard={() => {
                      setDragPayload(null);
                      setDragGhostPoint(null);
                      setDragInvalid(false);
                    }}
                    onOpenCompanion={(entity) => {
                      openCompanion(entity);
                      setLibraryDrawerOpen(false);
                    }}
                    canWrite={isEditMode}
                  />
                </div>
              </div>
            </div>
          )}
          {isEditMode && imagePickerTarget && data && (
            <ImagePickerModal
              images={data.images}
              currentImageId={
                imagePickerTarget.kind === 'npc'
                  ? npcEditDraft?.image || undefined
                  : imagePickerTarget.kind === 'tavern'
                    ? tavernEditDraft?.image || undefined
                    : imagePickerTarget.kind === 'shop'
                      ? shopEditDraft?.image || undefined
                      : imagePickerTarget.kind === 'battleEntry'
                        ? battleEntryEditDraft?.previewImageId || undefined
                        : (locationDataDraft?.headerImageId as string | undefined)
              }
              onSelect={(imageId) => {
                if (imagePickerTarget.kind === 'npc') {
                  setNpcEditDraft((d) => (d ? { ...d, image: imageId } : d));
                } else if (imagePickerTarget.kind === 'tavern') {
                  setTavernEditDraft((d) => (d ? { ...d, image: imageId } : d));
                } else if (imagePickerTarget.kind === 'shop') {
                  setShopEditDraft((d) => (d ? { ...d, image: imageId } : d));
                } else if (imagePickerTarget.kind === 'battleEntry') {
                  setBattleEntryEditDraft((d) => (d ? { ...d, previewImageId: imageId } : d));
                } else {
                  setLocationDataDraft((d) => (d ? { ...d, headerImageId: imageId } : d));
                }
                setImagePickerTarget(null);
              }}
              onClear={() => {
                if (imagePickerTarget.kind === 'npc') {
                  setNpcEditDraft((d) => (d ? { ...d, image: '' } : d));
                } else if (imagePickerTarget.kind === 'tavern') {
                  setTavernEditDraft((d) => (d ? { ...d, image: '' } : d));
                } else if (imagePickerTarget.kind === 'shop') {
                  setShopEditDraft((d) => (d ? { ...d, image: '' } : d));
                } else if (imagePickerTarget.kind === 'battleEntry') {
                  setBattleEntryEditDraft((d) => (d ? { ...d, previewImageId: '' } : d));
                } else {
                  setLocationDataDraft((d) => (d ? { ...d, headerImageId: '' } : d));
                }
              }}
              onClose={() => setImagePickerTarget(null)}
            />
          )}
          {isEditMode && npcEditDraft && data && (
            <div className="route-draft-form">
              <strong>Редактировать NPC</strong>
              <p className="muted">
                Правки сохраняются как локальный оверлей (npcPatches) — исходный JSON dm-companion не меняется.
              </p>
              <div className="library-card-row">
                {npcEditDraft.image ? (
                  <img
                    className="library-thumb"
                    src={
                      data.images.find((i) => i.id === npcEditDraft.image)?.thumbnailSrc ??
                      data.images.find((i) => i.id === npcEditDraft.image)?.src
                    }
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="library-thumb library-thumb-fallback" aria-hidden="true">{LIBRARY_FALLBACK_ICON.npc}</span>
                )}
                <div className="library-card-body actions">
                  <button type="button" onClick={() => setImagePickerTarget({ kind: 'npc', npcId: npcEditDraft.npcId })}>
                    Сменить изображение
                  </button>
                  {!!npcEditDraft.image && (
                    <button type="button" onClick={() => setNpcEditDraft({ ...npcEditDraft, image: '' })}>
                      Убрать
                    </button>
                  )}
                </div>
              </div>
              <label>
                Имя
                <input
                  type="text"
                  value={npcEditDraft.name}
                  onChange={(e) => setNpcEditDraft({ ...npcEditDraft, name: e.target.value })}
                />
              </label>
              <label>
                Роль
                <input
                  type="text"
                  value={npcEditDraft.role}
                  onChange={(e) => setNpcEditDraft({ ...npcEditDraft, role: e.target.value })}
                />
              </label>
              <label>
                Фракция
                <input
                  type="text"
                  value={npcEditDraft.faction}
                  onChange={(e) => setNpcEditDraft({ ...npcEditDraft, faction: e.target.value })}
                />
              </label>
              <label>
                Описание (видно игрокам — Player Safe)
                <textarea
                  value={npcEditDraft.publicDescription}
                  onChange={(e) => setNpcEditDraft({ ...npcEditDraft, publicDescription: e.target.value })}
                />
              </label>
              <label>
                Заметки ДМ (никогда не видны игрокам/Observer)
                <textarea
                  value={npcEditDraft.dmNotes}
                  onChange={(e) => setNpcEditDraft({ ...npcEditDraft, dmNotes: e.target.value })}
                />
              </label>
              <label className="reveal-toggle">
                <input
                  type="checkbox"
                  checked={npcEditDraft.visibleToPlayers}
                  onChange={(e) => setNpcEditDraft({ ...npcEditDraft, visibleToPlayers: e.target.checked })}
                />
                Видна игрокам
              </label>
              {!npcEditDraft.name.trim() && <p className="route-editor-error">Имя не может быть пустым</p>}
              <div className="actions">
                <button
                  className="btn-primary"
                  disabled={!npcEditDraft.name.trim()}
                  onClick={() => {
                    store.patchNpc(npcEditDraft.npcId, {
                      name: npcEditDraft.name.trim(),
                      role: npcEditDraft.role.trim() || undefined,
                      faction: npcEditDraft.faction.trim() || undefined,
                      publicDescription: npcEditDraft.publicDescription.trim() || undefined,
                      dmNotes: npcEditDraft.dmNotes.trim() || undefined,
                      visibleToPlayers: npcEditDraft.visibleToPlayers,
                      image: npcEditDraft.image || undefined,
                    });
                    setNpcEditDraft(null);
                  }}
                >
                  Сохранить
                </button>
                <button onClick={() => setNpcEditDraft(null)}>Отмена</button>
                {npcEditDraft.npcId in store.npcPatches && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      if (window.confirm('Сбросить локальные правки этого NPC? Действие необратимо.')) {
                        store.resetOverride('npc', npcEditDraft.npcId);
                        setNpcEditDraft(null);
                      }
                    }}
                  >
                    Сбросить локальные правки
                  </button>
                )}
              </div>
            </div>
          )}
          {isEditMode && tavernEditDraft && data && (
            <div className="route-draft-form">
              <strong>Редактировать таверну</strong>
              <p className="muted">
                Правки сохраняются как локальный оверлей (tavernPatches) — исходный JSON dm-companion не меняется.
                Изображение для таверны — оверлей карточки: в исходных данных у таверны нет своего поля изображения.
              </p>
              <div className="library-card-row">
                {tavernEditDraft.image ? (
                  <img
                    className="library-thumb"
                    src={
                      data.images.find((i) => i.id === tavernEditDraft.image)?.thumbnailSrc ??
                      data.images.find((i) => i.id === tavernEditDraft.image)?.src
                    }
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="library-thumb library-thumb-fallback" aria-hidden="true">{LIBRARY_FALLBACK_ICON.tavern}</span>
                )}
                <div className="library-card-body actions">
                  <button type="button" onClick={() => setImagePickerTarget({ kind: 'tavern', tavernId: tavernEditDraft.tavernId })}>
                    Сменить изображение
                  </button>
                  {!!tavernEditDraft.image && (
                    <button type="button" onClick={() => setTavernEditDraft({ ...tavernEditDraft, image: '' })}>
                      Убрать
                    </button>
                  )}
                </div>
              </div>
              <label>
                Название
                <input
                  type="text"
                  value={tavernEditDraft.name}
                  onChange={(e) => setTavernEditDraft({ ...tavernEditDraft, name: e.target.value })}
                />
              </label>
              <label>
                Описание
                <textarea
                  value={tavernEditDraft.description}
                  onChange={(e) => setTavernEditDraft({ ...tavernEditDraft, description: e.target.value })}
                />
              </label>
              <label>
                Заметки ДМ (никогда не видны игрокам/Observer)
                <textarea
                  value={tavernEditDraft.notes}
                  onChange={(e) => setTavernEditDraft({ ...tavernEditDraft, notes: e.target.value })}
                />
              </label>
              {!tavernEditDraft.name.trim() && <p className="route-editor-error">Название не может быть пустым</p>}
              <div className="actions">
                <button
                  className="btn-primary"
                  disabled={!tavernEditDraft.name.trim()}
                  onClick={() => {
                    store.patchTavern(tavernEditDraft.tavernId, {
                      name: tavernEditDraft.name.trim(),
                      description: tavernEditDraft.description.trim() || undefined,
                      notes: tavernEditDraft.notes.trim() || undefined,
                      imageOverrideId: tavernEditDraft.image || undefined,
                    });
                    setTavernEditDraft(null);
                  }}
                >
                  Сохранить
                </button>
                <button onClick={() => setTavernEditDraft(null)}>Отмена</button>
                {tavernEditDraft.tavernId in store.tavernPatches && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      if (window.confirm('Сбросить локальные правки этой таверны? Действие необратимо.')) {
                        store.resetOverride('tavern', tavernEditDraft.tavernId);
                        setTavernEditDraft(null);
                      }
                    }}
                  >
                    Сбросить локальные правки
                  </button>
                )}
              </div>
            </div>
          )}
          {isEditMode && shopEditDraft && data && (
            <div className="route-draft-form">
              <strong>Редактировать лавку</strong>
              <p className="muted">
                Правки сохраняются как локальный оверлей (shopPatches) — исходный JSON dm-companion не меняется.
              </p>
              <div className="library-card-row">
                {shopEditDraft.image ? (
                  <img
                    className="library-thumb"
                    src={
                      data.images.find((i) => i.id === shopEditDraft.image)?.thumbnailSrc ??
                      data.images.find((i) => i.id === shopEditDraft.image)?.src
                    }
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="library-thumb library-thumb-fallback" aria-hidden="true">{LIBRARY_FALLBACK_ICON.shop}</span>
                )}
                <div className="library-card-body actions">
                  <button type="button" onClick={() => setImagePickerTarget({ kind: 'shop', shopId: shopEditDraft.shopId })}>
                    Сменить изображение
                  </button>
                  {!!shopEditDraft.image && (
                    <button type="button" onClick={() => setShopEditDraft({ ...shopEditDraft, image: '' })}>
                      Убрать
                    </button>
                  )}
                </div>
              </div>
              <label>
                Название
                <input
                  type="text"
                  value={shopEditDraft.name}
                  onChange={(e) => setShopEditDraft({ ...shopEditDraft, name: e.target.value })}
                />
              </label>
              <label>
                Описание
                <textarea
                  value={shopEditDraft.description}
                  onChange={(e) => setShopEditDraft({ ...shopEditDraft, description: e.target.value })}
                />
              </label>
              <label>
                Заметки ДМ (никогда не видны игрокам/Observer)
                <textarea
                  value={shopEditDraft.notes}
                  onChange={(e) => setShopEditDraft({ ...shopEditDraft, notes: e.target.value })}
                />
              </label>
              {!shopEditDraft.name.trim() && <p className="route-editor-error">Название не может быть пустым</p>}
              <div className="actions">
                <button
                  className="btn-primary"
                  disabled={!shopEditDraft.name.trim()}
                  onClick={() => {
                    store.patchShop(shopEditDraft.shopId, {
                      name: shopEditDraft.name.trim(),
                      description: shopEditDraft.description.trim() || undefined,
                      notes: shopEditDraft.notes.trim() || undefined,
                      image: shopEditDraft.image || undefined,
                    });
                    setShopEditDraft(null);
                  }}
                >
                  Сохранить
                </button>
                <button onClick={() => setShopEditDraft(null)}>Отмена</button>
                {shopEditDraft.shopId in store.shopPatches && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      if (window.confirm('Сбросить локальные правки этой лавки? Действие необратимо.')) {
                        store.resetOverride('shop', shopEditDraft.shopId);
                        setShopEditDraft(null);
                      }
                    }}
                  >
                    Сбросить локальные правки
                  </button>
                )}
              </div>
            </div>
          )}
          {isEditMode && imageEditDraft && (
            <div className="route-draft-form">
              <strong>Редактировать изображение</strong>
              <p className="muted">
                Правки сохраняются как локальный оверлей (imagePatches) — исходный файл изображения и его путь не меняются, редактируется только название карточки.
              </p>
              <label>
                Название
                <input
                  type="text"
                  value={imageEditDraft.title}
                  onChange={(e) => setImageEditDraft({ ...imageEditDraft, title: e.target.value })}
                />
              </label>
              {!imageEditDraft.title.trim() && <p className="route-editor-error">Название не может быть пустым</p>}
              <div className="actions">
                <button
                  className="btn-primary"
                  disabled={!imageEditDraft.title.trim()}
                  onClick={() => {
                    store.patchImage(imageEditDraft.imageId, { title: imageEditDraft.title.trim() });
                    setImageEditDraft(null);
                  }}
                >
                  Сохранить
                </button>
                <button onClick={() => setImageEditDraft(null)}>Отмена</button>
                {imageEditDraft.imageId in store.imagePatches && (
                  <button
                    className="btn-secondary"
                    onClick={() => {
                      if (window.confirm('Сбросить локальные правки этого изображения? Действие необратимо.')) {
                        store.resetOverride('image', imageEditDraft.imageId);
                        setImageEditDraft(null);
                      }
                    }}
                  >
                    Сбросить локальные правки
                  </button>
                )}
              </div>
            </div>
          )}
          {isEditMode && battleEntryEditDraft && data && (
            <div className="route-draft-form">
              <strong>Редактировать боевую сцену</strong>
              <p className="muted">
                Правки сохраняются напрямую в BattleEntry (updateBattleEntry) — у боевых сцен нет отдельного seed-файла,
                это и есть основное хранилище.
              </p>
              <div className="library-card-row">
                {battleEntryEditDraft.previewImageId ? (
                  <img
                    className="library-thumb"
                    src={
                      data.images.find((i) => i.id === battleEntryEditDraft.previewImageId)?.thumbnailSrc ??
                      data.images.find((i) => i.id === battleEntryEditDraft.previewImageId)?.src
                    }
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span className="library-thumb library-thumb-fallback" aria-hidden="true">{LIBRARY_FALLBACK_ICON.battleEntry}</span>
                )}
                <div className="library-card-body actions">
                  <button
                    type="button"
                    onClick={() => setImagePickerTarget({ kind: 'battleEntry', battleEntryId: battleEntryEditDraft.battleEntryId })}
                  >
                    Сменить изображение
                  </button>
                  {!!battleEntryEditDraft.previewImageId && (
                    <button type="button" onClick={() => setBattleEntryEditDraft({ ...battleEntryEditDraft, previewImageId: '' })}>
                      Убрать
                    </button>
                  )}
                </div>
              </div>
              <label>
                Название
                <input
                  type="text"
                  value={battleEntryEditDraft.name}
                  onChange={(e) => setBattleEntryEditDraft({ ...battleEntryEditDraft, name: e.target.value })}
                />
              </label>
              <label>
                Описание (DM)
                <textarea
                  value={battleEntryEditDraft.description}
                  onChange={(e) => setBattleEntryEditDraft({ ...battleEntryEditDraft, description: e.target.value })}
                />
              </label>
              <label>
                Описание (видно игрокам — Player Safe)
                <textarea
                  value={battleEntryEditDraft.playerSafeDescription}
                  onChange={(e) =>
                    setBattleEntryEditDraft({ ...battleEntryEditDraft, playerSafeDescription: e.target.value })
                  }
                />
              </label>
              {!battleEntryEditDraft.name.trim() && <p className="route-editor-error">Название не может быть пустым</p>}
              <div className="actions">
                <button
                  className="btn-primary"
                  disabled={!battleEntryEditDraft.name.trim()}
                  onClick={() => {
                    store.updateBattleEntry(battleEntryEditDraft.battleEntryId, {
                      name: battleEntryEditDraft.name.trim(),
                      description: battleEntryEditDraft.description.trim() || undefined,
                      playerSafeDescription: battleEntryEditDraft.playerSafeDescription.trim() || undefined,
                      previewImageId: battleEntryEditDraft.previewImageId || undefined,
                    });
                    setBattleEntryEditDraft(null);
                  }}
                >
                  Сохранить
                </button>
                <button onClick={() => setBattleEntryEditDraft(null)}>Отмена</button>
              </div>
            </div>
          )}
          {isEditMode && locationPlacementDraft && (
            <div className="route-draft-form">
              <strong>Новая локация</strong>
              <p className="muted">Точка на карте уже выбрана. Заполните минимум название и сохраните — иначе локация не будет создана.</p>
              <label>
                Название (обязательно)
                <input
                  type="text"
                  value={locationPlacementDraft.title}
                  placeholder="Например: Заброшенный склад"
                  onChange={(e) =>
                    setLocationPlacementDraft({ ...locationPlacementDraft, title: e.target.value })
                  }
                />
              </label>
              <label>
                Тип (шаблон)
                <select
                  value={locationPlacementDraft.type}
                  onChange={(e) =>
                    setLocationPlacementDraft({
                      ...locationPlacementDraft,
                      type: e.target.value as LocationTemplateType,
                    })
                  }
                >
                  {LOCATION_TEMPLATE_OPTIONS.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Описание (видно игрокам — Player Safe)
                <textarea
                  value={locationPlacementDraft.publicDescription}
                  onChange={(e) =>
                    setLocationPlacementDraft({ ...locationPlacementDraft, publicDescription: e.target.value })
                  }
                />
              </label>
              <label>
                Заметки DM (никогда не видно игрокам/Observer)
                <textarea
                  value={locationPlacementDraft.dmNotes}
                  onChange={(e) =>
                    setLocationPlacementDraft({ ...locationPlacementDraft, dmNotes: e.target.value })
                  }
                />
              </label>
              <label>
                Статус
                <select
                  value={locationPlacementDraft.status}
                  onChange={(e) =>
                    setLocationPlacementDraft({
                      ...locationPlacementDraft,
                      status: e.target.value as LocationStatus,
                    })
                  }
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="reveal-toggle">
                <input
                  type="checkbox"
                  checked={locationPlacementDraft.visibleToPlayers}
                  onChange={(e) =>
                    setLocationPlacementDraft({ ...locationPlacementDraft, visibleToPlayers: e.target.checked })
                  }
                />
                Видна игрокам
              </label>
              {locationPlacementError && <p className="route-editor-error">{locationPlacementError}</p>}
              <div className="actions">
                <button className="btn-primary" onClick={saveLocationPlacementDraft}>Сохранить локацию</button>
                <button className="btn-ghost" onClick={() => { setLocationPlacementDraft(null); setLocationPlacementError(null); }}>Отмена</button>
              </div>
            </div>
          )}
          {placementMode && (
            <p className="placement-hint">
              Выберите место на карте для размещения: «{placementMode.title}»
            </p>
          )}
          {placingExistingLocationId && (
            <p className="placement-hint">
              Кликните по карте, чтобы разместить выбранную локацию.{' '}
              <button onClick={() => setPlacingExistingLocationId(null)}>Отмена</button>
            </p>
          )}
          {movingHotspotId && (
            <p className="placement-hint">
              Кликните по карте, чтобы переместить локацию сюда.{' '}
              <button onClick={() => setMovingHotspotId(null)}>Отмена</button>
            </p>
          )}
          {placingLibraryEntity && (
            <p className="placement-hint">
              Кликните по карте, чтобы разместить: «{placingLibraryEntity.title}».{' '}
              <button onClick={() => setPlacingLibraryEntity(null)}>Отмена</button>
            </p>
          )}
          {placingNpcEntityId && (
            <p className="placement-hint">
              Кликните по карте, чтобы поставить маркер NPC «{npcsForArc.find((n) => n.id === placingNpcEntityId)?.name ?? placingNpcEntityId}».{' '}
              <button onClick={() => setPlacingNpcEntityId(null)}>Отмена</button>
            </p>
          )}

          {isEditMode && zoneDraft && (
            <div className="route-draft-form">
              <strong>Новая зона фракции</strong>
              <p className="muted">
                Кликайте по карте, чтобы добавить точки полигона (минимум 3). Затем укажите название и сохраните.
              </p>
              <label>
                Название
                <input
                  type="text"
                  value={zoneDraft.name}
                  placeholder="Например: Территория Чёрного Клинка"
                  onChange={(e) => setZoneDraft({ ...zoneDraft, name: e.target.value })}
                />
              </label>
              <label>
                Тип зоны
                <select
                  value={zoneDraft.type}
                  onChange={(e) => setZoneDraft({ ...zoneDraft, type: e.target.value as FactionZoneType })}
                >
                  {ZONE_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{ZONE_TYPE_LABELS[t]}</option>
                  ))}
                </select>
              </label>
              <label>
                Статус
                <select
                  value={zoneDraft.status}
                  onChange={(e) => setZoneDraft({ ...zoneDraft, status: e.target.value as FactionZoneStatus })}
                >
                  {ZONE_STATUS_OPTIONS.map((s) => (
                    <option key={s} value={s}>{ZONE_STATUS_LABELS[s]}</option>
                  ))}
                </select>
              </label>
              <label className="reveal-toggle">
                <input
                  type="checkbox"
                  checked={zoneDraft.visibleInPlayerView}
                  onChange={(e) => setZoneDraft({ ...zoneDraft, visibleInPlayerView: e.target.checked })}
                />
                Видна игрокам
              </label>
              <p className="muted">Точек добавлено: {zoneDraft.points.length} (нужно минимум 3)</p>
              {zoneFormError && <p className="route-editor-error">{zoneFormError}</p>}
              <div className="actions">
                <button onClick={saveZoneDraft} disabled={zoneDraft.points.length < 3}>Сохранить зону</button>
                {zoneDraft.points.length > 0 && (
                  <button onClick={() => setZoneDraft({ ...zoneDraft, points: zoneDraft.points.slice(0, -1) })}>
                    Удалить последнюю точку
                  </button>
                )}
                <button onClick={() => { setZoneDraft(null); setZoneFormError(null); }}>Отмена</button>
              </div>
            </div>
          )}

          {isEditMode && selectedRouteId && !editingRouteId && (() => {
            const r = routes.find((rt) => rt.id === selectedRouteId);
            if (!r) return null;
            const from = hotspots.find((h) => h.id === r.fromHotspotId);
            const to = hotspots.find((h) => h.id === r.toHotspotId);
            const hasRealPath = (r.points?.length ?? 0) >= 2;
            return (
              <div className="route-edit-toolbar route-edit-form">
                <span className="route-edit-toolbar-title">
                  Маршрут: {from?.label ?? '?'} → {to?.label ?? '?'}
                  {' '}
                  <span className="status-badge">{hasRealPath ? `размечен · ${r.points!.length} точек` : 'путь не размечен'}</span>
                </span>
                <div className="form-row">
                  <label>Название</label>
                  <input
                    key={`${r.id}-label`}
                    type="text"
                    defaultValue={r.label ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (r.label ?? '')) store.patchRoute(r.id, { label: e.target.value });
                    }}
                  />
                </div>
                <div className="form-row">
                  <label>Заметки ДМ</label>
                  <textarea
                    key={`${r.id}-notes`}
                    defaultValue={r.notes ?? ''}
                    onBlur={(e) => {
                      if (e.target.value !== (r.notes ?? '')) store.patchRoute(r.id, { notes: e.target.value || undefined });
                    }}
                  />
                </div>
                <label className="reveal-toggle">
                  <input
                    type="checkbox"
                    checked={r.visibleInPlayerView}
                    onChange={(e) => store.patchRoute(r.id, { visibleInPlayerView: e.target.checked })}
                  />
                  Видим игрокам
                </label>
                <div className="form-row">
                  <label>Статус</label>
                  <select
                    value={r.status ?? ''}
                    onChange={(e) =>
                      store.patchRoute(r.id, { status: (e.target.value || undefined) as MapRoute['status'] })
                    }
                  >
                    <option value="">— не задан —</option>
                    <option value="planned">planned</option>
                    <option value="active">active</option>
                    <option value="completed">completed</option>
                    <option value="blocked">blocked</option>
                    <option value="dangerous">dangerous</option>
                    <option value="hidden">hidden</option>
                  </select>
                </div>
                <div className="form-row">
                  <label>Расстояние, км</label>
                  <input
                    key={`${r.id}-distance`}
                    type="number"
                    min={0}
                    defaultValue={r.distanceKm ?? ''}
                    placeholder="масштаб не задан"
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      store.patchRoute(r.id, { distanceKm: v ? Number(v) : undefined });
                    }}
                  />
                </div>
                {!isRouteValid(r) && (
                  <p className="route-editor-error">
                    {getRouteValidationWarnings(r).join(' ')} Без обеих точек и пути перемещение партии по этому маршруту
                    будет прямым переходом (телепортом), а не прогулкой по карте.
                  </p>
                )}
                <div className="actions">
                  <button
                    onClick={() => {
                      setEditingRouteSnapshot(r.points ? [...r.points] : []);
                      setEditingRouteId(r.id);
                    }}
                  >
                    {hasRealPath ? 'Редактировать путь' : 'Разметить путь'}
                  </button>
                  <button onClick={() => reverseRoute(r.id)}>Reverse</button>
                  <button onClick={() => duplicateRoute(r.id)}>Duplicate</button>
                  <button
                    onClick={() => {
                      if (!window.confirm('Удалить этот маршрут?')) return;
                      store.deleteRoute(r.id);
                      setSelectedRouteId(null);
                      setEditingRouteId(null);
                    }}
                  >
                    Удалить
                  </button>
                </div>
              </div>
            );
          })()}

          {isEditMode && editingRouteId && (() => {
            const r = routes.find((rt) => rt.id === editingRouteId);
            if (!r) return null;
            const from = hotspots.find((h) => h.id === r.fromHotspotId);
            const to = hotspots.find((h) => h.id === r.toHotspotId);
            const pointCount = r.points?.length ?? 0;
            return (
              <div className="route-edit-mode-panel">
                <div className="route-edit-mode-header">
                  <strong>{isCreatingNewRoute ? 'Рисование маршрута' : 'Режим разметки маршрута'}</strong>
                  <span>Маршрут: {from?.label ?? '?'} → {to?.label ?? '?'}</span>
                  <span>Точек: {pointCount}</span>
                </div>
                <p className="placement-hint">
                  Кликайте по дороге, чтобы добавить точки маршрута. Перетаскивайте точки для правки, × удаляет точку.
                </p>
                {routeEditorError && <p className="route-editor-error">{routeEditorError}</p>}
                <div className="actions">
                  <button className="btn-primary" onClick={finishRouteEditing}>Готово</button>
                  <button
                    className="btn-secondary"
                    disabled={pointCount === 0}
                    onClick={() => removeWaypoint(r.id, pointCount - 1)}
                  >
                    Undo
                  </button>
                  <button className="btn-danger" disabled={pointCount === 0} onClick={() => store.patchRoute(r.id, { points: [] })}>
                    Очистить
                  </button>
                  <button className="btn-ghost" onClick={cancelRouteEditing}>Отменить</button>
                </div>
              </div>
            );
          })()}

          {!isPlayerView && selectedRouteId && !editingRouteId && (() => {
            const r = routes.find((rt) => rt.id === selectedRouteId);
            if (!r) return null;
            const from = hotspots.find((h) => h.id === r.fromHotspotId);
            const to = hotspots.find((h) => h.id === r.toHotspotId);
            const pointCount = r.points?.length ?? 0;
            const warnings = getRouteValidationWarnings(r);
            const normalizedDistance = calculateRouteNormalizedDistance(r);
            const distanceKm = r.distanceKm ?? null;
            const days = distanceKm !== null ? estimateTravelDays(distanceKm, travelSpeedPreset) : null;
            const routeUsableForTravel = isRouteValid(r);
            // A route can have a real drawn path (>=2 points) but still be
            // missing one/both hotspot endpoints — that's a valid "visual-only"
            // route (e.g. a decorative trail) that must never be silently
            // treated as travel-capable.
            const hasVisualPathOnly = pointCount >= 2 && !routeUsableForTravel;
            const finishHasNoPartyLocation = !partyHotspot;
            const finishHasNoResolvableEndpoint =
              !!partyHotspot &&
              !(r.fromHotspotId === partyHotspot.id
                ? hotspots.find((h) => h.id === r.toHotspotId)?.locationStateId
                : hotspots.find((h) => h.id === r.fromHotspotId)?.locationStateId);
            return (
              <div className="route-edit-toolbar route-edit-form travel-panel">
                <span className="route-edit-toolbar-title">
                  Путешествие: {from?.label ?? '?'} → {to?.label ?? '?'}
                </span>
                <p className="session-panel-row">
                  <strong>Точек:</strong> {pointCount} · <strong>Статус:</strong> {r.status ?? 'не задан'} ·{' '}
                  <strong>Видимость:</strong> {r.visibleInPlayerView ? 'игрокам видно' : 'только ДМ'}
                </p>
                <p className="session-panel-row">
                  <strong>Готовность к движению:</strong>{' '}
                  {routeUsableForTravel
                    ? 'Маршрут готов для движения партии'
                    : hasVisualPathOnly
                      ? 'Можно использовать как визуальный маршрут, но не как travel route'
                      : 'Нужны начальная и конечная локации'}
                </p>
                <p className="session-panel-row">
                  <strong>Расстояние:</strong>{' '}
                  {distanceKm !== null
                    ? `${distanceKm} км`
                    : normalizedDistance > 0
                      ? 'Масштаб карты не задан'
                      : 'путь не размечен'}
                </p>
                <label>
                  Скорость движения
                  <select value={travelSpeedPreset} onChange={(e) => setTravelSpeedPreset(e.target.value as TravelSpeedPresetKey)}>
                    {Object.entries(TRAVEL_SPEED_PRESETS).map(([key, preset]) => (
                      <option key={key} value={key}>{preset.label} ({preset.kmPerDay} км/день)</option>
                    ))}
                  </select>
                </label>
                <p className="session-panel-row">
                  <strong>Длительность:</strong>{' '}
                  {days !== null ? `≈ ${days.toFixed(1)} дн.` : 'Масштаб карты не задан'}
                </p>
                {warnings.length > 0 && (
                  <ul className="route-list">
                    {warnings.map((w) => (
                      <li key={w} className="route-editor-error">{w}</li>
                    ))}
                  </ul>
                )}
                <div className="actions">
                  <button
                    disabled={!routeUsableForTravel || !partyHotspot}
                    onClick={() => {
                      if (!partyHotspot) return;
                      const path = r.fromHotspotId === partyHotspot.id ? r.points! : [...r.points!].reverse();
                      setPartyTravelAnim({ points: path, index: 0 });
                      // Travel Flow MVP: advance the calendar by the estimated
                      // duration (whole days, rounded up) ONLY when a real
                      // distance is computable — never fabricate a calendar
                      // jump from an unknown/normalized-only distance. Also
                      // records a CampaignEvent of type 'travel' as a DM-only
                      // log entry — purely a record, never a trigger.
                      const calendarNow = store.getCalendar(store.currentTimelineId);
                      if (days !== null && days > 0) {
                        store.setCalendar(store.currentTimelineId, {
                          ...calendarNow,
                          currentDay: calendarNow.currentDay + Math.ceil(days),
                        });
                      }
                      const now = new Date().toISOString();
                      store.addCampaignEvent({
                        id: `event-${Date.now()}`,
                        timelineId: store.currentTimelineId,
                        mapId: map?.id,
                        mapLevel: scope,
                        name: `Путешествие: ${r.label ?? `${from?.label ?? '?'} → ${to?.label ?? '?'}`}`,
                        type: 'travel',
                        linkedRouteIds: [r.id],
                        date: { day: calendarNow.currentDay, month: calendarNow.currentMonth, year: calendarNow.currentYear },
                        timeOfDay: calendarNow.currentTimeOfDay,
                        visibleInPlayerView: false,
                        status: 'active',
                        createdAt: now,
                        updatedAt: now,
                      });
                    }}
                  >
                    Начать путешествие
                  </button>
                  <button
                    disabled={!routeUsableForTravel}
                    onClick={() => {
                      // Never silently fail: every blocking condition gets its
                      // own explicit message instead of a no-op click.
                      if (finishHasNoPartyLocation) {
                        setRouteEditorError('У партии не задано текущее местоположение — невозможно завершить путешествие.');
                        return;
                      }
                      if (finishHasNoResolvableEndpoint) {
                        setRouteEditorError('Не удалось определить конечную точку маршрута относительно партии — проверьте начальную/конечную локации маршрута.');
                        return;
                      }
                      const destHotspot = r.fromHotspotId === partyHotspot?.id ? hotspots.find((h) => h.id === r.toHotspotId) : hotspots.find((h) => h.id === r.fromHotspotId);
                      if (!destHotspot?.locationStateId) {
                        setRouteEditorError('Конечная точка маршрута не связана с локацией — невозможно переместить партию.');
                        return;
                      }
                      setRouteEditorError(null);
                      store.setCurrentLocation(destHotspot.locationStateId, r.id);
                      store.markVisited(destHotspot.locationStateId);
                      // Travel + Trigger integration MVP: surface any armed
                      // party_completes_route triggers for this route — never
                      // auto-applied, just flagged for DM review.
                      const armedForTimeline = getArmedTriggersForTimeline(store.triggersById, store.currentTimelineId);
                      const pendingForRoute = getPendingRouteTriggers(armedForTimeline, r.id);
                      setRouteTriggerWarning(
                        pendingForRoute.length > 0
                          ? { routeId: r.id, triggerNames: pendingForRoute.map((t) => t.name) }
                          : null,
                      );
                      if (pendingForRoute.length > 0) setShowPendingTriggers(true);
                    }}
                  >
                    Завершить в конечной точке
                  </button>
                  <button
                    onClick={() => {
                      const now = new Date().toISOString();
                      const calendarNow = store.getCalendar(store.currentTimelineId);
                      const newEvent: CampaignEvent = {
                        id: `event-${Date.now()}`,
                        timelineId: store.currentTimelineId,
                        mapId: map?.id,
                        mapLevel: scope,
                        name: `Событие на маршруте: ${r.label ?? `${from?.label ?? '?'} → ${to?.label ?? '?'}`}`,
                        type: 'travel',
                        linkedRouteIds: [r.id],
                        date: { day: calendarNow.currentDay, month: calendarNow.currentMonth, year: calendarNow.currentYear },
                        timeOfDay: calendarNow.currentTimeOfDay,
                        visibleInPlayerView: false,
                        status: 'planned',
                        createdAt: now,
                        updatedAt: now,
                      };
                      store.addCampaignEvent(newEvent);
                      setShowSessionPanel(true);
                    }}
                  >
                    Отметить событие на маршруте
                  </button>
                  <button
                    onClick={() => {
                      const name = window.prompt('Название триггера «маршрут завершён»:');
                      if (!name) return;
                      const now = new Date().toISOString();
                      const newTrigger: DelayedTrigger = {
                        id: `trigger-${Date.now()}`,
                        timelineId: store.currentTimelineId,
                        name,
                        triggerType: 'party_completes_route',
                        routeId: r.id,
                        effect: { type: 'create_event', payload: { name, type: 'note' } },
                        status: 'armed',
                        visibleInPlayerView: false,
                        createdAt: now,
                        updatedAt: now,
                      };
                      store.addDelayedTrigger(newTrigger);
                    }}
                  >
                    + Триггер «маршрут завершён»
                  </button>
                </div>
                {routeTriggerWarning && routeTriggerWarning.routeId === r.id && (
                  <p className="route-editor-error trigger-warning">
                    Ожидают проверки триггеры маршрута: {routeTriggerWarning.triggerNames.join(', ')} — см. «Ожидающие триггеры».
                  </p>
                )}
              </div>
            );
          })()}

          {/* Faction Zone side panel (Stage 4A) — Header/Summary/Linked
              Content/Actions/DM-Notes structure, mirroring the existing
              selected-route panel above. dmNotes is shown here ONLY because
              this whole block is gated on isEditMode (DM-only); it is never
              rendered in Player View/Observer (see playerSafeProjection.ts —
              dmNotes is stripped before any player-facing output exists). */}
          {isEditMode && selectedZoneId && (() => {
            const z = store.factionZonesById[selectedZoneId];
            if (!z) return null;
            return (
              <div className="route-panel">
                <div className="route-panel-header">
                  <strong>Зона: {z.name}</strong>
                  <button onClick={() => { setSelectedZoneId(null); setSelectedZoneVertexIndex(null); }}>Закрыть</button>
                </div>
                <label>
                  Название
                  <input type="text" value={z.name} onChange={(e) => store.updateFactionZone(z.id, { name: e.target.value })} />
                </label>
                {/* TODO: factionId is raw text until a real Faction entity type exists */}
                <label>
                  ID фракции (свободный текст — карточек фракций в проекте пока нет)
                  <input
                    type="text"
                    value={z.factionId ?? ''}
                    onChange={(e) => store.updateFactionZone(z.id, { factionId: e.target.value || undefined })}
                  />
                </label>
                <label>
                  Тип
                  <select value={z.type} onChange={(e) => store.updateFactionZone(z.id, { type: e.target.value as FactionZoneType })}>
                    {ZONE_TYPE_OPTIONS.map((t) => (
                      <option key={t} value={t}>{ZONE_TYPE_LABELS[t]}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Статус
                  <select
                    value={z.status}
                    onChange={(e) => {
                      const oldStatus = z.status;
                      const nextStatus = e.target.value as FactionZoneStatus;
                      // Status changes IMMEDIATELY — never blocked on a dialog.
                      store.updateFactionZone(z.id, { status: nextStatus });
                      // Warfront Status flow (Stage 4B, no simulation): offer an
                      // EXPLICIT, separate "создать событие" action below instead
                      // of a silent window.confirm popup — the DM decides on their
                      // own time whether this status change deserves a narrative
                      // breadcrumb event.
                      if (oldStatus !== nextStatus) {
                        setPendingZoneStatusChange({ zoneId: z.id, oldStatus, newStatus: nextStatus });
                      }
                    }}
                  >
                    {ZONE_STATUS_OPTIONS.map((s) => (
                      <option key={s} value={s}>{ZONE_STATUS_LABELS[s]}</option>
                    ))}
                  </select>
                </label>
                {pendingZoneStatusChange && pendingZoneStatusChange.zoneId === z.id && (
                  <div className="route-editor-error" style={{ color: 'inherit' }}>
                    <p className="muted">
                      Статус изменён: {ZONE_STATUS_LABELS[pendingZoneStatusChange.oldStatus]} → {ZONE_STATUS_LABELS[pendingZoneStatusChange.newStatus]}
                    </p>
                    <div className="actions">
                      <button
                        onClick={() => {
                          createFactionShiftEvent(z, pendingZoneStatusChange.oldStatus, pendingZoneStatusChange.newStatus);
                          setPendingZoneStatusChange(null);
                        }}
                      >
                        Создать событие изменения фронта
                      </button>
                      <button onClick={() => setPendingZoneStatusChange(null)}>Не нужно</button>
                    </div>
                  </div>
                )}
                <label className="reveal-toggle">
                  <input
                    type="checkbox"
                    checked={z.visibleInPlayerView === true}
                    onChange={(e) => store.updateFactionZone(z.id, { visibleInPlayerView: e.target.checked })}
                  />
                  Видна игрокам
                </label>
                <label>
                  Прозрачность ({Math.round((z.opacity ?? 0.35) * 100)}%)
                  <input
                    type="range"
                    min={5}
                    max={90}
                    value={Math.round((z.opacity ?? 0.35) * 100)}
                    onChange={(e) => store.updateFactionZone(z.id, { opacity: Number(e.target.value) / 100 })}
                  />
                </label>
                <label>
                  Цвет
                  <input
                    type="color"
                    value={z.color ?? '#d4af37'}
                    onChange={(e) => store.updateFactionZone(z.id, { color: e.target.value })}
                  />
                </label>
                <label>
                  Описание (для ДМ)
                  <textarea
                    value={z.description ?? ''}
                    onChange={(e) => store.updateFactionZone(z.id, { description: e.target.value || undefined })}
                  />
                </label>
                <label>
                  Описание для игроков (необязательно)
                  <textarea
                    value={z.playerSafeDescription ?? ''}
                    onChange={(e) => store.updateFactionZone(z.id, { playerSafeDescription: e.target.value || undefined })}
                  />
                </label>
                <label>
                  Заметки ДМ (никогда не видны игрокам)
                  <textarea
                    value={z.dmNotes ?? ''}
                    onChange={(e) => store.updateFactionZone(z.id, { dmNotes: e.target.value || undefined })}
                  />
                </label>
                <p className="muted">Точек в полигоне: {z.polygon.length} (минимум 3)</p>
                <p className="muted">Связанных событий: {z.linkedEventIds?.length ?? 0}</p>
                <p className="muted">Связанных локаций: {z.linkedLocationStateIds?.length ?? 0}</p>
                <p className="muted">Связанных маршрутов: {z.linkedRouteIds?.length ?? 0}</p>
                {editingZoneId === z.id && (
                  <p className="muted">
                    Кликайте по карте, чтобы добавить вершины зоны. Перетащите вершину, чтобы изменить форму. Кликните по точке, чтобы выбрать её для удаления.
                  </p>
                )}
                <div className="actions">
                  {editingZoneId === z.id ? (
                    <>
                      <button onClick={deleteSelectedZoneVertex} disabled={selectedZoneVertexIndex === null}>
                        Удалить выбранную точку
                      </button>
                      <button onClick={() => { setEditingZoneId(null); setSelectedZoneVertexIndex(null); }}>
                        Завершить редактирование полигона
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        cancelAllEditTools();
                        setEditingZoneId(z.id);
                        setSelectedZoneId(z.id);
                      }}
                    >
                      Редактировать полигон
                    </button>
                  )}
                  <button
                    onClick={() => {
                      const now = new Date().toISOString();
                      store.addCampaignEvent({
                        id: `event-${Date.now()}`,
                        timelineId: z.timelineId,
                        mapId: z.mapId,
                        mapLevel: z.mapLevel,
                        name: `Событие в зоне «${z.name}»`,
                        type: 'note',
                        linkedLocationStateIds: z.linkedLocationStateIds,
                        linkedRouteIds: z.linkedRouteIds,
                        date: { day: store.getCalendar(z.timelineId).currentDay, month: store.getCalendar(z.timelineId).currentMonth, year: store.getCalendar(z.timelineId).currentYear },
                        timeOfDay: store.getCalendar(z.timelineId).currentTimeOfDay,
                        visibleInPlayerView: false,
                        status: 'planned',
                        createdAt: now,
                        updatedAt: now,
                      });
                    }}
                  >
                    + Связанное событие
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Скрыть зону «${z.name}» (архивировать)?`)) return;
                      store.archiveFactionZone(z.id);
                      setSelectedZoneId(null);
                      setEditingZoneId(null);
                      setPendingZoneStatusChange(null);
                    }}
                  >
                    Архивировать зону (скрыть)
                  </button>
                </div>
                {zoneFormError && <p className="route-editor-error">{zoneFormError}</p>}
              </div>
            );
          })()}

          {/* Movable Entity selection panel (Stage 4C, Step 4) — reuses the
              same .route-panel structure as the Faction Zone panel above
              rather than inventing a new panel paradigm. Shown in any DM
              mode (not gated to isEditMode like the zone panel, since
              setting movement state/route/position is a normal DM-view
              action, not a polygon-editing one) — but never in Player View. */}
          {/* Battle Entry side panel (Stage 5A, Step 6). DM-only — there is no
              player-facing equivalent panel (Observer/player views never get a
              launch button or DM-only fields, see playerSafeProjection.ts). */}
          {!isPlayerView && selectedBattleEntryId && !battleConsequencesEntryId && (() => {
            const entry = store.battleEntriesById[selectedBattleEntryId];
            if (!entry) return null;
            return (
              <BattleEntryPanel
                entry={entry}
                data={data}
                sourceLocationTitle={
                  entry.sourceLocationStateId
                    ? data.locationStates.find((ls) => ls.id === entry.sourceLocationStateId)?.title
                    : undefined
                }
                currentTimeOfDay={store.getCalendar(entry.timelineId).currentTimeOfDay}
                onClose={() => setSelectedBattleEntryId(null)}
                onEdit={() => {
                  setEditingBattleEntryId(entry.id);
                  setBattleEntryDraft({
                    x: entry.position?.x ?? 0.5,
                    y: entry.position?.y ?? 0.5,
                    name: entry.name,
                    status: entry.status,
                    sceneSize: entry.sceneSize,
                    recommendedPartyLevel: entry.recommendedPartyLevel?.toString() ?? '',
                    battleMapId: entry.battleMapId ?? '',
                    battleMapUrl: entry.battleMapUrl ?? '',
                    visibleInPlayerView: !!entry.visibleInPlayerView,
                    description: entry.description ?? '',
                    playerSafeDescription: entry.playerSafeDescription ?? '',
                  });
                }}
                onOpenConsequences={() => setBattleConsequencesEntryId(entry.id)}
                onCreateEvent={() => {
                  const now = new Date().toISOString();
                  const calendarNow = store.getCalendar(entry.timelineId);
                  store.addCampaignEvent({
                    id: `event-${Date.now()}`,
                    timelineId: entry.timelineId,
                    mapId: entry.sourceMapId,
                    mapLevel: entry.mapLevel,
                    position: entry.position,
                    name: `Бой начат: ${entry.name}`,
                    type: 'battle',
                    linkedLocationStateIds: entry.sourceLocationStateId ? [entry.sourceLocationStateId] : undefined,
                    linkedNpcIds: entry.linkedNpcIds,
                    linkedQuestIds: entry.linkedQuestIds,
                    linkedEnemyIds: entry.linkedEnemyIds,
                    linkedBattleEntryIds: [entry.id],
                    date: { day: calendarNow.currentDay, month: calendarNow.currentMonth, year: calendarNow.currentYear },
                    timeOfDay: calendarNow.currentTimeOfDay,
                    visibleInPlayerView: false,
                    status: 'active',
                    createdAt: now,
                    updatedAt: now,
                  });
                }}
              />
            );
          })()}

          {!isPlayerView && battleConsequencesEntryId && (() => {
            const entry = store.battleEntriesById[battleConsequencesEntryId];
            if (!entry) return null;
            const calendarNow = store.getCalendar(entry.timelineId);
            return (
              <BattleConsequencesPanel
                entry={entry}
                calendarNow={{
                  day: calendarNow.currentDay,
                  month: calendarNow.currentMonth,
                  year: calendarNow.currentYear,
                  timeOfDay: calendarNow.currentTimeOfDay,
                }}
                initialReturnParams={battleReturnParams?.battleEntryId === entry.id ? battleReturnParams : null}
                onClose={() => {
                  setBattleConsequencesEntryId(null);
                  setBattleReturnParams(null);
                }}
                onConsequencesApplied={() => {
                  setBattleReturnParams(null);
                  const cleaned = clearBattleReturnParams(window.location.href);
                  const cleanedUrl = new URL(cleaned);
                  setSearchParams(cleanedUrl.searchParams, { replace: true });
                }}
              />
            );
          })()}

          {!isPlayerView && selectedMovableEntityId && (() => {
            const m = store.movableEntitiesById[selectedMovableEntityId];
            if (!m) return null;
            const locLabel = m.currentLocationStateId
              ? data.locationStates.find((ls) => ls.id === m.currentLocationStateId)?.title ?? m.currentLocationStateId
              : null;
            const routeLabel = m.currentRouteId
              ? routes.find((r) => r.id === m.currentRouteId)?.label ?? m.currentRouteId
              : null;
            // Stage 6C.4B: when entityType is 'npc', resolve the real DmNpc
            // record by id — this is the resolver the old TODO comment above
            // asked for. Every OTHER entityType (enemy_group/caravan/army/
            // custom) still has no resolver and keeps showing the raw id,
            // unchanged — only the npc case is wired up this pass.
            const resolvedNpc = m.entityType === 'npc' ? data.npcs.find((n) => n.id === m.entityId) : undefined;
            // Stage 6C.4E: same resolver pattern as resolvedNpc, for the three
            // new standalone marker types.
            const resolvedQuest = m.entityType === 'quest' ? data.quests.find((q) => q.id === m.entityId) : undefined;
            const resolvedEnemy = m.entityType === 'enemy' ? data.enemies.find((en) => en.id === m.entityId) : undefined;
            const resolvedImage = m.entityType === 'image' ? data.images.find((im) => im.id === m.entityId) : undefined;
            const linkField: 'questIds' | 'enemyIds' | 'imageIds' | null =
              m.entityType === 'quest' ? 'questIds' : m.entityType === 'enemy' ? 'enemyIds' : m.entityType === 'image' ? 'imageIds' : null;
            const isLinkedToSelectedLs = !!(linkField && selectedLs && selectedLs[linkField].includes(m.entityId));
            return (
              <div className="route-panel">
                <div className="route-panel-header">
                  {resolvedNpc ? (
                    <div className="library-card-row">
                      <LibraryThumb type="npc" entity={resolvedNpc} images={data.images} />
                      <strong>NPC: {resolvedNpc.name}</strong>
                    </div>
                  ) : resolvedQuest ? (
                    <div className="library-card-row">
                      <LibraryThumb type="quest" entity={resolvedQuest} images={data.images} />
                      <strong>Квест: {resolvedQuest.title}</strong>
                    </div>
                  ) : resolvedEnemy ? (
                    <div className="library-card-row">
                      <LibraryThumb type="enemy" entity={resolvedEnemy} images={data.images} />
                      <strong>Враг: {resolvedEnemy.name}</strong>
                    </div>
                  ) : resolvedImage ? (
                    <div className="library-card-row">
                      <LibraryThumb type="image" entity={resolvedImage} images={data.images} />
                      <strong>Изображение: {resolvedImage.title}</strong>
                    </div>
                  ) : (
                    <strong>{MOVABLE_ENTITY_TYPE_LABELS[m.entityType]}: {m.entityId}</strong>
                  )}
                  <button onClick={() => { setSelectedMovableEntityId(null); setManualMoveArmedForEntityId(null); }}>Закрыть</button>
                </div>
                {resolvedNpc ? (
                  <>
                    {resolvedNpc.role && <p className="muted">Роль: {resolvedNpc.role}</p>}
                    <p className="muted">{resolveEntityShortDescription('npc', resolvedNpc, 300)}</p>
                    <div className="actions">
                      <button onClick={() => openCompanion({ type: 'npc', id: resolvedNpc.id })}>Открыть карточку</button>
                      <button onClick={() => openNpcEditor(resolvedNpc)}>Редактировать карточку</button>
                    </div>
                  </>
                ) : resolvedQuest ? (
                  <>
                    <p className="muted">Статус: {resolvedQuest.status}</p>
                    <p className="muted">{resolveEntityShortDescription('quest', resolvedQuest, 300)}</p>
                    <div className="actions">
                      <button onClick={() => openCompanion({ type: 'quest', id: resolvedQuest.id })}>Открыть карточку</button>
                    </div>
                  </>
                ) : resolvedEnemy ? (
                  <>
                    {(resolvedEnemy.role || resolvedEnemy.cr) && (
                      <p className="muted">{[resolvedEnemy.role, resolvedEnemy.cr ? `CR ${resolvedEnemy.cr}` : null].filter(Boolean).join(' · ')}</p>
                    )}
                    <p className="muted">{resolveEntityShortDescription('enemy', resolvedEnemy, 300)}</p>
                    <div className="actions">
                      <button onClick={() => openCompanion({ type: 'enemy', id: resolvedEnemy.id })}>Открыть карточку</button>
                    </div>
                  </>
                ) : resolvedImage ? (
                  <>
                    <p className="muted">Тип изображения: {resolvedImage.type}</p>
                    <div className="actions">
                      <button onClick={() => openCompanion({ type: 'image', id: resolvedImage.id })}>Открыть карточку</button>
                    </div>
                  </>
                ) : (
                  <p className="muted">
                    Карточек {MOVABLE_ENTITY_TYPE_LABELS[m.entityType].toLowerCase()} с привязкой по ID пока нет в проекте — показан исходный ID без резолва имени.
                  </p>
                )}
                {linkField && (
                  <div className="actions">
                    <button
                      onClick={() => {
                        if (!selectedLs) return;
                        if (selectedLs[linkField].includes(m.entityId)) return;
                        store.patchLocationState(selectedLs.id, { [linkField]: [...selectedLs[linkField], m.entityId] });
                      }}
                      disabled={!selectedLs || isLinkedToSelectedLs}
                      title={selectedLs ? undefined : 'Сначала выберите локацию на карте'}
                    >
                      {isLinkedToSelectedLs ? 'Уже связано с выбранной локацией' : 'Связать с выбранной локацией'}
                    </button>
                    {selectedLs && isLinkedToSelectedLs && (
                      <button
                        onClick={() =>
                          store.patchLocationState(selectedLs.id, {
                            [linkField]: selectedLs[linkField].filter((id) => id !== m.entityId),
                          })
                        }
                      >
                        Снять связь с выбранной локацией
                      </button>
                    )}
                    <button
                      className="btn-danger"
                      onClick={() => {
                        if (window.confirm('Убрать маркер с этой карты? Сам объект библиотеки (квест/враг/изображение) не удаляется, только маркер.')) {
                          store.removeMovableEntity(m.id);
                          setSelectedMovableEntityId(null);
                        }
                      }}
                    >
                      Удалить маркер с карты
                    </button>
                  </div>
                )}
                <p className="muted">Тип: {MOVABLE_ENTITY_TYPE_LABELS[m.entityType]}</p>
                <p className="muted">ID сущности: {m.entityId}</p>
                <p className="muted">Состояние: {MOVEMENT_STATE_LABELS[m.movementState]}</p>
                <p className="muted">
                  Позиция: {m.currentPosition ? `${m.currentPosition.x.toFixed(2)}, ${m.currentPosition.y.toFixed(2)}` : '— не задана —'}
                </p>
                <p className="muted">Локация: {locLabel ?? '— не задана —'}</p>
                <p className="muted">Маршрут: {routeLabel ?? '— не задан —'}</p>
                <p className="muted">
                  Видна игрокам: {m.visibleInPlayerView ? 'да' : 'нет'} (сейчас игрокам всё равно не показывается ни одна
                  подвижная сущность — см. getPlayerSafeMovableEntities)
                </p>
                <p className="muted">Обновлено: {new Date(m.updatedAt).toLocaleString('ru-RU')}</p>

                <label>
                  Состояние движения
                  <select
                    value={m.movementState}
                    onChange={(e) => store.updateMovableEntity(m.id, { movementState: e.target.value as MovementState })}
                  >
                    {MOVEMENT_STATE_OPTIONS.map((s) => (
                      <option key={s} value={s}>{MOVEMENT_STATE_LABELS[s]}</option>
                    ))}
                  </select>
                </label>

                <div className="actions">
                  <button
                    onClick={() => {
                      // Arming manual move is itself a "next click does X"
                      // tool, same family as quick pin/placement/route/area
                      // edit — cancel any other armed tool first so two
                      // single-click actions never race for the same click.
                      // cancelAllEditTools() does not touch
                      // selectedMovableEntityId, so this panel stays open.
                      cancelAllEditTools();
                      setManualMoveArmedForEntityId(m.id);
                    }}
                    disabled={manualMoveArmedForEntityId === m.id}
                  >
                    {manualMoveArmedForEntityId === m.id ? 'Кликните по карте…' : 'Переместить вручную'}
                  </button>
                  {manualMoveArmedForEntityId === m.id && (
                    <button onClick={() => setManualMoveArmedForEntityId(null)}>Отменить перемещение</button>
                  )}
                  {partyMarkerPoint && (
                    <button onClick={() => applyPartyPositionToMovableEntity(m.id)}>
                      Использовать позицию партии
                    </button>
                  )}
                </div>

                <label>
                  Привязать к маршруту
                  <select
                    value={m.currentRouteId ?? ''}
                    onChange={(e) => {
                      const routeId = e.target.value || undefined;
                      store.updateMovableEntity(m.id, {
                        currentRouteId: routeId,
                        movementState: routeId ? 'travelling' : m.movementState,
                      });
                    }}
                  >
                    <option value="">— маршрут не выбран —</option>
                    {routes.map((r) => (
                      <option key={r.id} value={r.id}>{r.label ?? r.id}</option>
                    ))}
                  </select>
                </label>
                <div className="actions">
                  <button
                    onClick={() => {
                      if (!selectedRouteId) return;
                      store.updateMovableEntity(m.id, { currentRouteId: selectedRouteId, movementState: 'travelling' });
                    }}
                    disabled={!selectedRouteId}
                    title={selectedRouteId ? undefined : 'Сначала выберите маршрут на карте'}
                  >
                    Привязать к выбранному маршруту
                  </button>
                  <button onClick={() => store.updateMovableEntity(m.id, { currentRouteId: undefined })} disabled={!m.currentRouteId}>
                    Снять маршрут
                  </button>
                </div>

                <div className="actions">
                  <button
                    onClick={() => {
                      if (!selectedLocationStateId) return;
                      store.updateMovableEntity(m.id, { currentLocationStateId: selectedLocationStateId });
                    }}
                    disabled={!selectedLocationStateId}
                    title={selectedLocationStateId ? undefined : 'Сначала выберите локацию на карте'}
                  >
                    {/* Stage 6C.4B: pre-existing button, label widened — this
                        sets the LINK ONLY (currentLocationStateId); it never
                        moves currentPosition, so a marker stays exactly where
                        it is on the map while gaining a location link. */}
                    Связать с выбранной локацией
                  </button>
                  <button
                    onClick={() => store.updateMovableEntity(m.id, { currentLocationStateId: undefined })}
                    disabled={!m.currentLocationStateId}
                  >
                    Снять привязку к локации
                  </button>
                </div>

                <div className="actions">
                  <button
                    onClick={() => {
                      const now = new Date().toISOString();
                      // npc_update for NPCs; world_change for everything else
                      // (caravan/army/enemy_group/custom) — both already exist
                      // in CampaignEventType (see src/types.ts), nothing new
                      // invented here.
                      const eventType = m.entityType === 'npc' ? 'npc_update' : 'world_change';
                      store.addCampaignEvent({
                        id: `event-${Date.now()}`,
                        timelineId: m.timelineId,
                        mapId: m.currentMapId,
                        mapLevel: m.mapLevel,
                        position: m.currentPosition,
                        name: `${MOVABLE_ENTITY_TYPE_LABELS[m.entityType]} (${m.entityId}): обновление`,
                        type: eventType,
                        description: `Состояние: ${MOVEMENT_STATE_LABELS[m.movementState]}${locLabel ? `, локация: ${locLabel}` : ''}${routeLabel ? `, маршрут: ${routeLabel}` : ''}`,
                        visibleInPlayerView: false,
                        status: 'planned',
                        createdAt: now,
                        updatedAt: now,
                      });
                    }}
                  >
                    + Создать событие
                  </button>
                  <button
                    onClick={() => {
                      if (!window.confirm(`Скрыть/архивировать сущность «${m.entityId}»?`)) return;
                      store.archiveMovableEntity(m.id);
                      setSelectedMovableEntityId(null);
                      setManualMoveArmedForEntityId(null);
                    }}
                  >
                    Архивировать / скрыть
                  </button>
                </div>
              </div>
            );
          })()}

          {showNoMapPlaceholder && (
            <div className="map-canvas">
              <div className="map-no-art">
                <strong>Нет карты для этой арки/уровня</strong>
                <span>Для уровня «{SCOPE_LABELS[scope]}» карта ещё не существует.</span>
              </div>
            </div>
          )}

          {dragWarning && <div className="drag-drop-warning-banner">{dragWarning}</div>}

          {!showNoMapPlaceholder && map && mapState && (
            <div
              ref={setMapViewportEl}
              className="map-canvas map-canvas-zoomable"
              onWheel={handleWheel}
              onMouseDown={handleMapMouseDownForPan}
              onMouseMove={handleMapMouseMovePan}
              onMouseUp={handleMapMouseUpPan}
              onMouseLeave={handleMapMouseUpPan}
            >
              <div
                ref={mapRef}
                className="map-canvas-inner"
                onClick={handleMapClick}
                onDragOver={handleMapDragOver}
                onDragLeave={handleMapDragLeave}
                onDrop={handleMapDrop}
                style={{
                  width: `${activeMapImageSize.width}px`,
                  height: `${activeMapImageSize.height}px`,
                  transform: `translate(${fitOffsetX + view.x}px, ${fitOffsetY + view.y}px) scale(${baseFitScale * view.scale})`,
                  transformOrigin: '0 0',
                  cursor: isEditMode ? (placingHotspot ? 'crosshair' : 'grab') : 'grab',
                  backgroundImage: hasRealArt ? `url(${map.backgroundImageSrc})` : undefined,
                  backgroundSize: '100% 100%',
                }}
              >
                {!hasRealArt && (
                  <div className="map-placeholder">
                    {map.title}
                    <span className="placeholder-badge">PLACEHOLDER — нужна карта</span>
                  </div>
                )}
                {/* Dynamic Map Overlays (Stage 4B) — plain absolutely-positioned
                    tint divs, painted BEFORE the Faction Zones SVG so they sit
                    visually below every route/hotspot/placement/party-token
                    layer (z-index 1 vs the SVG's implicit stacking + party
                    marker's z-index 30). Purely cosmetic, pointer-events:none
                    via .map-dynamic-overlay. */}
                {renderedDynamicOverlays.map((o) => (
                  <div
                    key={o.id}
                    className={`map-dynamic-overlay map-dynamic-overlay--${o.type}`}
                    style={{ opacity: o.opacity }}
                  />
                ))}
                <svg
                  className="route-layer"
                  viewBox={`0 0 ${activeMapImageSize.width} ${activeMapImageSize.height}`}
                  style={{
                    position: 'absolute',
                    inset: 0,
                    width: '100%',
                    height: '100%',
                    pointerEvents: isEditMode ? 'visiblePainted' : 'none',
                  }}
                >
                  {/* Faction Zones (Stage 4A) — rendered FIRST inside this SVG so they
                      paint below every route/hotspot/placement/party-marker layer that
                      follows. Hidden ('status'==='hidden') zones only render (faintly,
                      dashed) in DM modes — never in Player View/observer/player_safe
                      presets, which already excludes them via getPlayerSafeFactionZones
                      upstream (visibleFactionZones), so this `isPlayerView` check here is
                      belt-and-suspenders, not the only guard. */}
                  {visibleFactionZones.map((z) => {
                    if (z.polygon.length < 3) return null;
                    if (z.status === 'hidden' && isPlayerView) return null;
                    const isZoneSelected = z.id === selectedZoneId;
                    const isZoneBeingEdited = z.id === editingZoneId;
                    const pixelPoints = z.polygon.map((p) => `${p.x * activeMapImageSize.width},${p.y * activeMapImageSize.height}`).join(' ');
                    const zoneStateClass = [
                      'faction-zone',
                      `faction-zone--${z.status}`,
                      isZoneSelected && 'faction-zone--selected',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <g key={z.id}>
                        <polygon
                          className={zoneStateClass}
                          points={pixelPoints}
                          style={{
                            opacity: z.opacity ?? (z.status === 'hidden' ? 0.25 : 0.35),
                            fill: z.color ?? undefined,
                            cursor: isEditMode ? 'pointer' : 'default',
                            pointerEvents: isEditMode ? 'visiblePainted' : 'none',
                          }}
                          onClick={(e) => {
                            if (!isEditMode) return;
                            e.stopPropagation();
                            setSelectedZoneId(z.id);
                          }}
                        />
                        {isZoneBeingEdited &&
                          z.polygon.map((p, i) => (
                            <circle
                              key={i}
                              className={`faction-zone-vertex${selectedZoneVertexIndex === i ? ' faction-zone-vertex--selected' : ''}`}
                              cx={p.x * activeMapImageSize.width}
                              cy={p.y * activeMapImageSize.height}
                              r={8}
                              style={{ cursor: 'grab', pointerEvents: 'visiblePainted' }}
                              onMouseDown={(e) => handleZoneVertexMouseDown(z.id, i, e)}
                            />
                          ))}
                      </g>
                    );
                  })}
                  {visibleRoutes.map((r) => {
                    const isBeingEdited = r.id === editingRouteId;
                    const hasRealPath = (r.points?.length ?? 0) >= 2;
                    // Routes are fully manual now — there is no auto-generated
                    // straight-line fallback to fall back to, and no map-wide
                    // "Путь не размечен" spam. A route with fewer than 2 points
                    // simply isn't drawn at all, UNLESS it's the one actively
                    // being drawn right now (so the live in-progress line shows).
                    if (!hasRealPath && !isBeingEdited) return null;
                    if (isPlayerView && !hasRealPath) return null;
                    const pointList = r.points ?? [];
                    if (pointList.length < 1) return null;
                    const color = ROUTE_TYPE_COLORS[r.routeType ?? 'street'] ?? ROUTE_TYPE_COLORS.street;
                    const dashed = r.discovered === false || r.routeType === 'secret';
                    const isRouteSelected = r.id === selectedRouteId;
                    const isRouteInvalid = !isRouteValid(r);
                    // Highlight every route in a committed multi-segment
                    // journey for the duration of travel, in addition to the
                    // single-route case (activePartyRoute, the route most
                    // recently arrived via — see PartyState.currentPartyRouteId).
                    const isRouteActive =
                      (!!activePartyRoute && activePartyRoute.id === r.id) || activePathRouteIds.includes(r.id);
                    const isRouteHiddenFromPlayers = r.visibleInPlayerView === false;
                    const isRouteDangerous = r.dangerLevel === 'dangerous' || r.dangerLevel === 'deadly' || r.status === 'dangerous';
                    const isRouteBlocked = r.status === 'blocked';
                    // While one route is actively being drawn/edited, dim every
                    // other route so the DM can see exactly which path their
                    // clicks affect.
                    const dimmed = !!editingRouteId && !isBeingEdited;
                    const pixelPoints = pointList
                      .map((p) => `${p.x * activeMapImageSize.width},${p.y * activeMapImageSize.height}`)
                      .join(' ');
                    const routeStateClassNames = [
                      isRouteActive && 'route--active',
                      isRouteSelected && 'route--selected',
                      // Hidden-from-players routes only render faintly in DM
                      // modes at all (Player View already bails out above via
                      // `if (isPlayerView && !hasRealPath) return null` plus
                      // visibleRoutes itself excludes them for players — this
                      // class is purely the DM-mode "faint" visual cue).
                      isRouteHiddenFromPlayers && !isPlayerView && 'route--hidden',
                      isRouteInvalid && 'route--invalid',
                      isRouteDangerous && 'route--dangerous',
                      isRouteBlocked && 'route--blocked',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    return (
                      <g key={r.id} className={routeStateClassNames || undefined} opacity={dimmed ? 0.25 : isRouteHiddenFromPlayers && !isPlayerView ? 0.4 : 1}>
                        {/* Wide invisible hit-stroke so a thin route is easy to click in DM Edit. */}
                        {isEditMode && pointList.length >= 2 && (
                          <polyline
                            points={pixelPoints}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={16}
                            style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedRouteId(r.id);
                            }}
                          />
                        )}
                        {pointList.length >= 2 ? (
                          <polyline
                            className={[
                              isRouteSelected || isBeingEdited ? 'route-selected' : undefined,
                              isRouteInvalid ? 'route-invalid' : undefined,
                            ]
                              .filter(Boolean)
                              .join(' ') || undefined}
                            points={pixelPoints}
                            fill="none"
                            stroke={isRouteSelected || isBeingEdited ? 'var(--gold-soft)' : color}
                            strokeWidth={isBeingEdited ? 5 : isRouteSelected ? 4 : 2}
                            strokeDasharray={dashed ? '6 5' : undefined}
                            style={{ pointerEvents: 'none' }}
                          />
                        ) : (
                          // Exactly one point placed so far while drawing — show it as a dot, not a line.
                          <circle
                            cx={pointList[0].x * activeMapImageSize.width}
                            cy={pointList[0].y * activeMapImageSize.height}
                            r={5}
                            fill="var(--gold-soft)"
                            style={{ pointerEvents: 'none' }}
                          />
                        )}
                      </g>
                    );
                  })}
                </svg>
                {visibleHotspots.map((h) => {
                  const ls = h.locationStateId ? getLocationState(data, h.locationStateId) : undefined;
                  if (ls && isPlayerView && !isLocationVisibleToPlayers(ls, store.progress)) return null;
                  const status = ls ? effectiveLocationStatus(ls, store.progress) : 'unknown';
                  const isSelected = h.id === selectedHotspotId || (!isEditMode && ls?.id === selectedLocationStateId);
                  return (
                    <div
                      key={h.id}
                      className={`hotspot${isSelected ? ' hotspot-selected' : ''}`}
                      style={{
                        left: `${h.x * 100}%`,
                        top: `${h.y * 100}%`,
                        background: STATUS_COLORS[status] || '#999',
                        cursor: isEditMode ? 'grab' : 'pointer',
                      }}
                      title={h.label}
                      onMouseDown={(e) => handleHotspotMouseDown(h, e)}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedHotspotId(h.id);
                        setSidePanelTab('card');
                        if (ls) {
                          selectLocation(ls.id);
                        }
                      }}
                      onDoubleClick={(e) => handleHotspotDoubleClick(h, e)}
                    >
                      {!h.labelHidden && <span className="hotspot-label">{ls?.title ?? h.label}</span>}
                      {h.needsCoordinateReview && isEditMode && (
                        <span className="review-badge" style={{ position: 'absolute', top: -18 }}>
                          позиция не подтверждена
                        </span>
                      )}
                    </div>
                  );
                })}
                {partyHotspot && partyMarkerPoint && (() => {
                  // While partyTravelAnim is active, render the WALKED point
                  // (with a per-segment CSS transition) instead of the final
                  // resting position — this is what actually makes the party
                  // visibly follow route.points instead of jumping there.
                  const animPoint = partyTravelAnim?.points[partyTravelAnim.index];
                  const renderPoint = animPoint ?? partyMarkerPoint;
                  return (
                    <PartyMarker
                      point={renderPoint}
                      isWalking={!!animPoint}
                      activeRouteLabel={activePartyRoute?.label ?? (activePartyRoute ? 'без названия' : undefined)}
                    />
                  );
                })()}
                {isEditMode &&
                  editingRouteId &&
                  (() => {
                    const editedPoints = routes.find((r) => r.id === editingRouteId)?.points ?? [];
                    return editedPoints.map((p, i) => {
                      const isFirst = i === 0;
                      const isLast = i === editedPoints.length - 1 && editedPoints.length > 1;
                      const waypointLabel = isFirst ? 'Start' : isLast ? 'End' : String(i + 1);
                      return (
                        <div
                          key={i}
                          className={`waypoint-dot${isFirst ? ' waypoint-dot-start route-point--start' : ''}${isLast ? ' waypoint-dot-end route-point--end' : ''}`}
                          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
                          title={`${waypointLabel} — перетащите для перемещения`}
                          onMouseDown={(e) => handleWaypointMouseDown(editingRouteId, i, e)}
                        >
                          <span className="waypoint-dot-label">{waypointLabel}</span>
                          <button
                            className="waypoint-remove"
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => {
                              e.stopPropagation();
                              removeWaypoint(editingRouteId, i);
                            }}
                            title="Удалить точку"
                          >
                            ×
                          </button>
                        </div>
                      );
                    });
                  })()}
                {visiblePlacements.map((p) => {
                  const hidden = p.status === 'hidden';
                  const isSelected = p.id === selectedPlacementId;
                  return (
                    <div
                      key={p.id}
                      className={`placement-marker${hidden ? ' placement-marker-hidden' : ''}${isSelected ? ' placement-marker-selected' : ''}`}
                      style={{ left: `${p.position.x * 100}%`, top: `${p.position.y * 100}%` }}
                      title={p.title}
                      onMouseDown={(e) => {
                        // While a waypoint/placement-mode action is armed, let the
                        // click fall through to the map's own handler instead of
                        // starting a marker drag — otherwise an overlapping marker
                        // would silently swallow waypoint placement clicks.
                        if (editingRouteId || placementMode) return;
                        handlePlacementMouseDown(p.id, e);
                      }}
                      onClick={(e) => {
                        if (editingRouteId || placementMode) return;
                        e.stopPropagation();
                        openPlacementDrawer(p);
                      }}
                    >
                      {p.imageUrl ? (
                        <img src={p.imageUrl} alt={p.title} className="placement-marker-thumb" />
                      ) : (
                        <span className="placement-marker-icon">{p.icon ?? PLACEMENT_ICONS[p.entityKind]}</span>
                      )}
                    </div>
                  );
                })}
                {visibleCampaignEventMarkers.map((ev) => {
                  const stateClass =
                    ev.status === 'active'
                      ? 'map-event-marker--active'
                      : ev.status === 'planned'
                        ? 'map-event-marker--planned'
                        : '';
                  return (
                    <div
                      key={ev.id}
                      className={`map-event-marker map-event-marker--visible ${stateClass}`}
                      style={{ left: `${(ev.position?.x ?? 0) * 100}%`, top: `${(ev.position?.y ?? 0) * 100}%` }}
                      title={ev.name}
                    />
                  );
                })}
                {/* Movable Entity markers (Stage 4C). 'party' entityType is
                    excluded — the party token is already rendered above via
                    PartyMarker/partyMarkerPoint, so a MovableEntity record
                    with entityType:'party' (if one is ever created) would
                    otherwise duplicate that marker. Only entities with a
                    currentPosition render (no fallback to a location's
                    hotspot position — currentLocationStateId is shown in the
                    panel/tooltip, not used to derive map coordinates here). */}
                {visibleMovableEntities
                  .filter((m) => m.entityType !== 'party' && m.currentPosition)
                  .map((m) => {
                    const isSelected = m.id === selectedMovableEntityId;
                    const isHiddenState = m.movementState === 'hidden';
                    const isTravelling = m.movementState === 'travelling';
                    const className = [
                      'movable-entity-marker',
                      `movable-entity-marker--${MOVABLE_ENTITY_TYPE_CSS[m.entityType]}`,
                      isTravelling && 'movable-entity-marker--travelling',
                      isHiddenState && isEditMode && 'movable-entity-marker--hidden',
                      isSelected && 'movable-entity-marker--selected',
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const locLabel = m.currentLocationStateId
                      ? data.locationStates.find((ls) => ls.id === m.currentLocationStateId)?.title ?? m.currentLocationStateId
                      : null;
                    const routeLabel = m.currentRouteId
                      ? routes.find((r) => r.id === m.currentRouteId)?.label ?? m.currentRouteId
                      : null;
                    // Stage 6C.4B: resolve a real DmNpc name/role for
                    // entityType:'npc' markers instead of showing the raw
                    // entityId, exactly the TODO left in the selection panel
                    // below — same lookup, used here for the tooltip too.
                    const resolvedNpc = m.entityType === 'npc' ? data.npcs.find((n) => n.id === m.entityId) : undefined;
                    // Stage 6C.4E: same real-title resolution as resolvedNpc
                    // above, for the three new standalone marker types.
                    const resolvedQuest = m.entityType === 'quest' ? data.quests.find((q) => q.id === m.entityId) : undefined;
                    const resolvedEnemy = m.entityType === 'enemy' ? data.enemies.find((en) => en.id === m.entityId) : undefined;
                    const resolvedImage = m.entityType === 'image' ? data.images.find((im) => im.id === m.entityId) : undefined;
                    const resolvedTitle =
                      resolvedNpc?.name ?? resolvedQuest?.title ?? resolvedEnemy?.name ?? resolvedImage?.title;
                    const tooltip = [
                      resolvedTitle ?? MOVABLE_ENTITY_TYPE_LABELS[m.entityType],
                      resolvedNpc?.role ?? resolvedEnemy?.role ?? resolvedQuest?.status,
                      !resolvedTitle ? `ID: ${m.entityId}` : null,
                      MOVEMENT_STATE_LABELS[m.movementState],
                      locLabel ? `Локация: ${locLabel}` : null,
                      routeLabel ? `Маршрут: ${routeLabel}` : null,
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <div
                        key={m.id}
                        className={className}
                        style={{ left: `${(m.currentPosition?.x ?? 0) * 100}%`, top: `${(m.currentPosition?.y ?? 0) * 100}%` }}
                        title={tooltip}
                        onClick={(e) => {
                          e.stopPropagation();
                          setSelectedMovableEntityId(m.id);
                        }}
                      >
                        {MOVABLE_ENTITY_MARKER_BADGE[m.entityType]}
                      </div>
                    );
                  })}
                {/* Battle Entry markers (Stage 5A). DM modes pass the raw
                    per-map list; Player Safe/Observer-equivalent presets pass
                    only getPlayerSafeBattleEntries() output (computed above
                    in visibleBattleEntries) — the layer component itself never
                    decides visibility. */}
                <BattleEntryMarkerLayer
                  entries={visibleBattleEntries}
                  selectedEntryId={selectedBattleEntryId}
                  isDmContext={!isPlayerView}
                  onSelect={(entryId) => {
                    setSelectedBattleEntryId(entryId);
                    setBattleConsequencesEntryId(null);
                  }}
                />
                {/* Stage 6C.4F — drag-and-drop ghost marker. Purely visual:
                    never written to the store, never sent to Observer (this
                    whole block is only reachable from the DM-only edit-mode
                    map render path, same as every other DM-only layer here). */}
                {dragPayload && dragGhostPoint && (
                  <div
                    className={`drag-ghost-marker${dragInvalid ? ' drag-ghost-marker--invalid' : ' drag-ghost-marker--valid'}`}
                    style={{ left: `${dragGhostPoint.x * 100}%`, top: `${dragGhostPoint.y * 100}%` }}
                  >
                    {DRAG_TYPE_BADGE[dragPayload.sourceType]}
                  </div>
                )}
              </div>
              <div className="map-legend">
                <div className="map-legend-row">
                  <span className="map-legend-dot" style={{ background: '#3b82f6' }} />
                  Партия
                </div>
                <div className="map-legend-row">
                  <span className="map-legend-dot" style={{ background: 'var(--gold-soft)' }} />
                  Выбранная точка
                </div>
                <div className="map-legend-row">
                  <span className="map-legend-dot" style={{ background: STATUS_COLORS.known }} />
                  Локация
                </div>
                {visibleCampaignEventMarkers.length > 0 && (
                  <div className="map-legend-row">
                    <span className="map-legend-dot map-event-marker--visible" />
                    Событие
                  </div>
                )}
                {visibleMovableEntities.some((m) => m.entityType !== 'party' && m.currentPosition) && (
                  <div className="map-legend-row">
                    <span className="map-legend-dot" style={{ background: 'var(--accent, #5b9ad4)' }} />
                    Подвижная сущность
                  </div>
                )}
                {visibleBattleEntries.length > 0 && (
                  <div className="map-legend-row">
                    <span className="map-legend-dot battle-entry-marker--available" />
                    Боевая сцена
                  </div>
                )}
              </div>
            </div>
          )}

          {isEditMode && map && mapState && (
            <details className="card dm-only hotspot-secondary-list">
              <summary>Все точки на карте ({hotspots.length}) — служебный список</summary>
              <ul className="hotspot-edit-list">
                {hotspots.map((h) => (
                  <li key={h.id}>
                    {h.label || '(без названия)'}{' '}
                    {h.needsCoordinateReview && <span className="review-badge">позиция не подтверждена</span>}{' '}
                    <button onClick={() => setSelectedHotspotId(h.id)}>Выбрать</button>{' '}
                    {h.needsCoordinateReview && (
                      <button onClick={() => store.patchHotspot(h.id, { needsCoordinateReview: false })}>
                        Подтвердить позицию
                      </button>
                    )}{' '}
                    <button className="btn-danger" onClick={() => handleDeleteHotspot(h.id)}>Удалить</button>
                  </li>
                ))}
              </ul>
            </details>
          )}

          {/* Player-visible events with no map position can't be placed on
              the map shell — list them here instead. Sourced exclusively
              from getPlayerSafeEvents(); shown only in player-facing
              contexts (Player View, or the player_safe/observer layer
              presets used for DM preview). */}
          {playerSafeEventsWithoutPosition.length > 0 && (
            <div className="card map-event-list-fallback">
              <p className="side-panel-subheading">События</p>
              <ul className="route-list">
                {playerSafeEventsWithoutPosition.map((ev) => (
                  <li key={ev.id}>
                    <span className={`map-event-marker map-event-marker--visible ${
                      ev.status === 'active' ? 'map-event-marker--active' : ev.status === 'planned' ? 'map-event-marker--planned' : ''
                    }`} />{' '}
                    <strong>{ev.name}</strong>
                    {ev.description && <p className="muted">{ev.description}</p>}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <aside className="workspace-side-panel">
          {isDmMode && (
            <button
              className={libraryDrawerOpen ? 'side-panel-library-button active' : 'side-panel-library-button'}
              onClick={() => setLibraryDrawerOpen(true)}
            >
              Библиотека
            </button>
          )}
          {/* Stage 6C.5 Phase 2 — the right panel is now a compact overview:
              header + summary + up to 4 primary buttons for the selected
              location, with deep editing/links/map/danger actions moved
              into the large object window below. General, non-object tools
              (Маршруты/Объекты/Не размещено) are still here but collapsed
              under "Ещё инструменты" instead of competing as top-level tabs. */}
          {isDmMode && selectedLs && (
            <div className="object-overview">
              <div className="object-overview-header">
                <div>
                  <h3>{selectedLs.title}</h3>
                  <span className="muted">
                    {selectedLs.type || 'локация'} · {effectiveLocationStatus(selectedLs, store.progress)}
                  </span>
                </div>
                <span className={selectedLs.visibleToPlayers === false ? 'status-badge status-badge--hidden' : 'status-badge status-badge--visible'}>
                  {selectedLs.visibleToPlayers === false ? 'Скрыто от игроков' : 'Видно игрокам'}
                </span>
              </div>
              <div className="object-overview-primary-actions">
                {/* Stage 6C.5 Phase 2D-Fix — "Открыть карточку" is a pure
                    read/navigation action, so it's available in DM View too,
                    not just DM Edit. Edit/visibility-toggle/"Ещё" (which
                    holds map-write and danger-zone actions) stay DM-Edit-only. */}
                <button
                  className="btn-primary btn-compact"
                  onClick={() => {
                    setObjectWindowSection('overview');
                    setObjectWindowOpen(true);
                  }}
                >
                  Открыть карточку
                </button>
                {isEditMode && (
                  <button
                    className="btn-secondary btn-compact"
                    onClick={() => {
                      setObjectWindowSection('edit');
                      setObjectWindowOpen(true);
                    }}
                  >
                    Редактировать
                  </button>
                )}
                {isEditMode && (
                  <button
                    className="btn-secondary btn-compact"
                    onClick={() =>
                      store.patchLocationState(selectedLs.id, { visibleToPlayers: selectedLs.visibleToPlayers === false })
                    }
                  >
                    {selectedLs.visibleToPlayers === false ? 'Показать игрокам' : 'Скрыть от игроков'}
                  </button>
                )}
                {isEditMode && (
                  <button className="btn-ghost btn-compact" onClick={() => setSidePanelMoreOpen((v) => !v)}>
                    {sidePanelMoreOpen ? 'Скрыть «Ещё»' : 'Ещё'}
                  </button>
                )}
              </div>
              {(selectedLs.publicDescription || selectedLs.playerSafeDescription) && (
                <p className="object-overview-summary">
                  {selectedLs.publicDescription || selectedLs.playerSafeDescription}
                </p>
              )}
              <div className="object-overview-linked-counts">
                <button className="link-count-chip" onClick={() => { setObjectWindowSection('links'); setObjectWindowOpen(true); }}>
                  NPC: {selectedLs.npcIds.length}
                </button>
                <button className="link-count-chip" onClick={() => { setObjectWindowSection('links'); setObjectWindowOpen(true); }}>
                  Квесты: {selectedLs.questIds.length}
                </button>
                <button className="link-count-chip" onClick={() => { setObjectWindowSection('links'); setObjectWindowOpen(true); }}>
                  Враги: {selectedLs.enemyIds.length}
                </button>
                <button className="link-count-chip" onClick={() => { setObjectWindowSection('links'); setObjectWindowOpen(true); }}>
                  Изображения: {selectedLs.imageIds.length}
                </button>
              </div>
              {sidePanelMoreOpen && (
                <div className="object-overview-more">
                  <div className="object-overview-map-actions">
                    <button onClick={() => store.setCurrentLocation(selectedLs.id)}>Поставить партию здесь</button>
                    <button onClick={() => store.markVisited(selectedLs.id)}>Отметить посещённой</button>
                    <button
                      onClick={() => {
                        const name = window.prompt('Название события для этой локации:');
                        if (!name) return;
                        const now = new Date().toISOString();
                        store.addCampaignEvent({
                          id: `event-${Date.now()}`,
                          timelineId: store.currentTimelineId,
                          name,
                          type: 'note',
                          linkedLocationStateIds: [selectedLs.id],
                          date: { day: calendar.currentDay, month: calendar.currentMonth, year: calendar.currentYear },
                          timeOfDay: calendar.currentTimeOfDay,
                          visibleInPlayerView: false,
                          status: 'planned',
                          createdAt: now,
                          updatedAt: now,
                        });
                      }}
                    >
                      Создать событие здесь
                    </button>
                    <button onClick={() => { setObjectWindowSection('map'); setObjectWindowOpen(true); }}>
                      Карта / маркер
                    </button>
                  </div>
                  <div className="object-overview-tools-toggle">
                    <button
                      className={sidePanelTab === 'routes' ? 'active' : ''}
                      onClick={() => setSidePanelTab('routes')}
                    >
                      Маршруты
                    </button>
                    <button
                      className={sidePanelTab === 'entities' ? 'active' : ''}
                      onClick={() => setSidePanelTab('entities')}
                    >
                      Объекты
                    </button>
                    <button
                      className={sidePanelTab === 'unplaced' ? 'active' : ''}
                      onClick={() => setSidePanelTab('unplaced')}
                    >
                      Не размещено
                    </button>
                  </div>
                  <details className="object-overview-danger">
                    <summary>Опасная зона</summary>
                    <button
                      className="btn-danger btn-compact"
                      disabled={!selectedHotspot}
                      onClick={() => {
                        if (!selectedHotspot) return;
                        if (!window.confirm('Убрать маркер этой локации с текущей карты? Сама локация и её данные не удаляются.')) return;
                        handleDeleteHotspot(selectedHotspot.id);
                      }}
                    >
                      Убрать маркер с карты
                    </button>
                    <button
                      className="btn-danger btn-compact"
                      onClick={() => {
                        if (!window.confirm('Сбросить локальные правки этой локации? Это вернёт исходные данные локации (если она из источника).')) return;
                        store.resetOverride('locationState', selectedLs.id);
                      }}
                    >
                      Сбросить локальные правки
                    </button>
                  </details>
                </div>
              )}
            </div>
          )}
          {isEditMode && !selectedLs && (
            <>
              <p className="side-panel-empty">Выберите точку на карте или откройте библиотеку.</p>
              <div className="object-overview-tools-toggle object-overview-tools-toggle--standalone">
                <button
                  className={sidePanelTab === 'routes' ? 'active' : ''}
                  onClick={() => setSidePanelTab('routes')}
                >
                  Маршруты
                </button>
                <button
                  className={sidePanelTab === 'entities' ? 'active' : ''}
                  onClick={() => setSidePanelTab('entities')}
                >
                  Объекты
                </button>
                <button
                  className={sidePanelTab === 'unplaced' ? 'active' : ''}
                  onClick={() => setSidePanelTab('unplaced')}
                >
                  Не размещено
                </button>
              </div>
            </>
          )}

          {isEditMode && sidePanelTab === 'routes' && (
            <div className="route-list-panel">
              <h3>Маршруты ({routes.length})</h3>
              {routes.length === 0 ? (
                <p className="muted">
                  Маршруты ещё не созданы. Нажмите «Создать маршрут», чтобы нарисовать путь по карте.
                </p>
              ) : (
                <ul className="route-list">
                  {routes.map((r) => {
                    const from = hotspots.find((h) => h.id === r.fromHotspotId);
                    const to = hotspots.find((h) => h.id === r.toHotspotId);
                    const pointCount = r.points?.length ?? 0;
                    const hasRealPath = pointCount >= 2;
                    const warnings = getRouteValidationWarnings(r);
                    return (
                      <li key={r.id} className={r.id === selectedRouteId ? 'route-list-row-selected' : undefined}>
                        <strong>{r.label || `${from?.label ?? '?'} → ${to?.label ?? '?'}`}</strong>
                        <span className="entity-card-sub">
                          {' '}
                          {r.routeType ?? 'street'} · {r.dangerLevel ?? 'safe'} · {r.status ?? 'статус не задан'} ·{' '}
                          {hasRealPath ? `${pointCount} точек` : 'путь не нарисован'} ·{' '}
                          {r.distanceKm !== undefined ? `${r.distanceKm} км` : 'масштаб не задан'} ·{' '}
                          {r.visibleInPlayerView ? 'видим игрокам' : 'скрыт от игроков'}
                        </span>
                        {warnings.length > 0 && (
                          <p className="route-editor-error">{warnings.join(' ')}</p>
                        )}
                        <div className="actions">
                          <button onClick={() => setSelectedRouteId(r.id)}>Показать</button>
                          <button onClick={() => markRoutePath(r.id)}>Редактировать</button>
                          <button onClick={() => duplicateRoute(r.id)}>Дублировать</button>
                          <button
                            onClick={() => {
                              if (!window.confirm('Удалить этот маршрут?')) return;
                              store.deleteRoute(r.id);
                              if (selectedRouteId === r.id) setSelectedRouteId(null);
                              if (editingRouteId === r.id) setEditingRouteId(null);
                            }}
                          >
                            Удалить
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {isEditMode && sidePanelTab === 'entities' && (
            <EntityCardsPanel
              npcs={npcsForArc}
              quests={questsForArc}
              enemies={enemiesForArc}
              images={imagesForArc}
              battleMaps={battleMapsForArc}
              placementsForMap={placementsForMap}
              selectedLs={selectedLs ?? null}
              onStartPlacement={startPlacement}
              onLinkToLocation={(field, id) => {
                if (!selectedLs) return;
                const current = selectedLs[field];
                if (current.includes(id)) return;
                store.patchLocationState(selectedLs.id, { [field]: [...current, id] } as Partial<LocationState>);
              }}
            />
          )}

          {isEditMode && sidePanelTab === 'unplaced' && (
            <UnplacedContentPanel
              locationsWithoutHotspot={locationsForTimeline.filter(
                (ls) => !data.hotspots.some((h) => h.timelineId === ls.timelineId && h.locationStateId === ls.id),
              )}
              npcsWithoutLocation={npcsForArc.filter(
                (n) => !n.location && !locationsForTimeline.some((ls) => ls.npcIds.includes(n.id)),
              )}
              questsWithoutLocation={questsForArc.filter(
                (q) => !q.location && !locationsForTimeline.some((ls) => ls.questIds.includes(q.id)),
              )}
              battleEntriesWithoutPosition={Object.values(store.battleEntriesById).filter(
                (be) => be.timelineId === store.currentTimelineId && !be.position && !be.sourceLocationStateId,
              )}
              selectedLs={selectedLs ?? null}
              onSelectLocation={selectLocation}
              onLinkNpcToSelected={(npcId) => {
                if (!selectedLs) return;
                if (selectedLs.npcIds.includes(npcId)) return;
                store.patchLocationState(selectedLs.id, { npcIds: [...selectedLs.npcIds, npcId] });
              }}
              onLinkQuestToSelected={(questId) => {
                if (!selectedLs) return;
                if (selectedLs.questIds.includes(questId)) return;
                store.patchLocationState(selectedLs.id, { questIds: [...selectedLs.questIds, questId] });
              }}
              onOpenDrawer={setDrawer}
              onPlaceOnMap={(locationId) => setPlacingExistingLocationId(locationId)}
              placingExistingLocationId={placingExistingLocationId}
            />
          )}

          {/* Stage 6C.5 Phase 2 — point/data/links/overview are now sections
              inside the large object window instead of top-level aside tabs.
              Gating switched from `sidePanelTab` to `objectWindowOpen &&
              objectWindowSection` so they only render inside that window. */}
          {/* Stage 6C.5 Phase 2D-Fix — opening the card (read/navigation) now
              works in any DM mode, not just DM Edit. The 4 write-capable
              sections (Редактирование/Связи/Карта/Опасная зона) are
              disabled in DM View instead of removed, so the tab layout
              stays stable; "Обзор" (the actual readable DM Companion
              content) is always available. */}
          {isDmMode && objectWindowOpen && selectedLs && (
            <div className="object-window-overlay" onClick={() => setObjectWindowOpen(false)}>
              <div className="object-window-panel" onClick={(e) => e.stopPropagation()}>
                <div className="object-window-header">
                  <div>
                    <h2>{selectedLs.title}</h2>
                    <span className="muted">
                      {selectedLs.type || 'локация'} · {effectiveLocationStatus(selectedLs, store.progress)} ·{' '}
                      {selectedLs.visibleToPlayers === false ? 'Скрыто от игроков' : 'Видно игрокам'}
                    </span>
                  </div>
                  <button className="btn-ghost" onClick={() => setObjectWindowOpen(false)}>
                    Закрыть ✕
                  </button>
                </div>
                <div className="object-window-section-nav">
                  <button
                    className={effectiveObjectWindowSection === 'overview' ? 'active' : ''}
                    onClick={() => setObjectWindowSection('overview')}
                  >
                    Обзор
                  </button>
                  <button
                    className={effectiveObjectWindowSection === 'edit' ? 'active' : ''}
                    disabled={!isEditMode}
                    title={isEditMode ? undefined : 'Доступно только в режиме DM Edit'}
                    onClick={() => setObjectWindowSection('edit')}
                  >
                    Редактирование
                  </button>
                  <button
                    className={effectiveObjectWindowSection === 'links' ? 'active' : ''}
                    disabled={!isEditMode}
                    title={isEditMode ? undefined : 'Доступно только в режиме DM Edit'}
                    onClick={() => setObjectWindowSection('links')}
                  >
                    Связи
                  </button>
                  <button
                    className={effectiveObjectWindowSection === 'map' ? 'active' : ''}
                    disabled={!isEditMode}
                    title={isEditMode ? undefined : 'Доступно только в режиме DM Edit'}
                    onClick={() => setObjectWindowSection('map')}
                  >
                    Карта
                  </button>
                  <button
                    className={effectiveObjectWindowSection === 'danger' ? 'active' : ''}
                    disabled={!isEditMode}
                    title={isEditMode ? undefined : 'Доступно только в режиме DM Edit'}
                    onClick={() => setObjectWindowSection('danger')}
                  >
                    Опасная зона
                  </button>
                </div>
                <div className="object-window-body">
          {effectiveObjectWindowSection === 'map' && (
            <HotspotInspector
              hotspot={selectedHotspot}
              locations={filteredLocations}
              locationSearch={locationSearch}
              onLocationSearchChange={setLocationSearch}
              onPatch={(patch) => selectedHotspot && store.patchHotspot(selectedHotspot.id, patch)}
              onDelete={() => selectedHotspot && handleDeleteHotspot(selectedHotspot.id)}
              onDeselect={() => setSelectedHotspotId(null)}
              onCenter={() => {
                if (!selectedHotspot) return;
                setView((v) => ({
                  ...v,
                  // screenX = fitOffsetX + view.x + view.scale * (hotspot.x * renderedImageWidth)
                  // Solve for view.x so screenX lands at the viewport center — fitOffsetX itself
                  // is NOT scaled by view.scale (only the in-image term is), unlike the previous
                  // version of this formula which incorrectly scaled the offset too.
                  x: viewportSize.width / 2 - fitOffsetX - selectedHotspot.x * renderedImageWidth * v.scale,
                  y: viewportSize.height / 2 - fitOffsetY - selectedHotspot.y * renderedImageHeight * v.scale,
                }));
              }}
              onStartPlacing={() => {
                cancelAllEditTools();
                setPlacingHotspot(true);
              }}
              onFit={resetView}
            />
          )}

          {effectiveObjectWindowSection === 'edit' && (
            <LocationDataTab
              ls={selectedLs}
              locations={locationsForTimeline}
              draft={locationDataDraft}
              npcs={npcsForArc}
              onStartEdit={() =>
                setLocationDataDraft({
                  title: selectedLs.title,
                  type: selectedLs.type ?? '',
                  publicDescription: selectedLs.publicDescription,
                  playerSafeDescription: selectedLs.playerSafeDescription ?? '',
                  dmNotes: selectedLs.dmNotes ?? '',
                  status: effectiveLocationStatus(selectedLs, store.progress),
                  tags: (selectedLs.tags ?? []).join(', '),
                  parentLocationStateId: selectedLs.parentLocationStateId ?? '',
                  visibleToPlayers: selectedLs.visibleToPlayers !== false,
                  tavern_ownerNpcId: selectedLs.tavernDetails?.ownerNpcId ?? '',
                  tavern_staffNpcIds: (selectedLs.tavernDetails?.staffNpcIds ?? []).join(', '),
                  tavern_roomsServices: selectedLs.tavernDetails?.roomsServices ?? '',
                  tavern_rumors: selectedLs.tavernDetails?.rumors ?? '',
                  tavern_pricesNotes: selectedLs.tavernDetails?.pricesNotes ?? '',
                  tavern_troubleHooks: selectedLs.tavernDetails?.troubleHooks ?? '',
                  tavern_secrets: selectedLs.tavernDetails?.secrets ?? '',
                  shop_shopType: selectedLs.shopDetails?.shopType ?? '',
                  shop_ownerNpcId: selectedLs.shopDetails?.ownerNpcId ?? '',
                  shop_goodsServices: selectedLs.shopDetails?.goodsServices ?? '',
                  shop_inventoryNotes: selectedLs.shopDetails?.inventoryNotes ?? '',
                  shop_pricePolicy: selectedLs.shopDetails?.pricePolicy ?? '',
                  shop_reputationRequirement: selectedLs.shopDetails?.reputationRequirement ?? '',
                  shop_illegalGoods: selectedLs.shopDetails?.illegalGoods ?? '',
                  headerImageId: selectedLs.imageIds?.[0] ?? '',
                })
              }
              images={data.images}
              onChangeHeaderImage={() => setImagePickerTarget({ kind: 'location', locationStateId: selectedLs.id })}
              onChange={(patch) => setLocationDataDraft((d) => (d ? { ...d, ...patch } : d))}
              onSave={() => {
                if (!locationDataDraft) return;
                const d = locationDataDraft;
                store.patchLocationState(selectedLs.id, {
                  title: d.title as string,
                  type: (d.type as string) || undefined,
                  publicDescription: d.publicDescription as string,
                  playerSafeDescription: (d.playerSafeDescription as string) || undefined,
                  dmNotes: (d.dmNotes as string) || undefined,
                  tags: (d.tags as string)
                    .split(',')
                    .map((t) => t.trim())
                    .filter(Boolean),
                  parentLocationStateId: (d.parentLocationStateId as string) || undefined,
                  visibleToPlayers: d.visibleToPlayers as boolean,
                  tavernDetails:
                    d.type === 'tavern'
                      ? {
                          ownerNpcId: (d.tavern_ownerNpcId as string) || undefined,
                          staffNpcIds: (d.tavern_staffNpcIds as string)
                            .split(',')
                            .map((t) => t.trim())
                            .filter(Boolean),
                          roomsServices: (d.tavern_roomsServices as string) || undefined,
                          rumors: (d.tavern_rumors as string) || undefined,
                          pricesNotes: (d.tavern_pricesNotes as string) || undefined,
                          troubleHooks: (d.tavern_troubleHooks as string) || undefined,
                          secrets: (d.tavern_secrets as string) || undefined,
                        }
                      : undefined,
                  shopDetails:
                    d.type === 'shop'
                      ? {
                          shopType: (d.shop_shopType as string) || undefined,
                          ownerNpcId: (d.shop_ownerNpcId as string) || undefined,
                          goodsServices: (d.shop_goodsServices as string) || undefined,
                          inventoryNotes: (d.shop_inventoryNotes as string) || undefined,
                          pricePolicy: (d.shop_pricePolicy as string) || undefined,
                          reputationRequirement: (d.shop_reputationRequirement as string) || undefined,
                          illegalGoods: (d.shop_illegalGoods as string) || undefined,
                        }
                      : undefined,
                  // Stage 6C.4C: "Сменить изображение" — the chosen image id
                  // becomes the header image by being moved to the FRONT of
                  // imageIds, the exact pre-existing convention this app
                  // already uses to pick a "header" image (see
                  // MapWorkspacePage's `headerImage = images[0]`). No new
                  // field was added to LocationState for this. Clearing
                  // (headerImageId === '') just drops whatever was first
                  // before editing — other linked images are untouched.
                  imageIds: d.headerImageId
                    ? [d.headerImageId as string, ...selectedLs.imageIds.filter((id) => id !== d.headerImageId)]
                    : selectedLs.imageIds.filter((id) => id !== selectedLs.imageIds[0]),
                });
                store.setLocationStatus(selectedLs.id, d.status as LocationStatus);
                setLocationDataDraft(null);
              }}
              onCancel={() => setLocationDataDraft(null)}
            />
          )}

          {effectiveObjectWindowSection === 'links' && (
            <LocationLinksTab
              ls={selectedLs}
              npcs={npcsForArc}
              quests={questsForArc}
              enemies={enemiesForArc}
              images={imagesForArc}
              battleMaps={battleMapsForArc}
              draft={locationLinksDraft}
              onStartEdit={() =>
                setLocationLinksDraft({
                  npcIds: selectedLs.npcIds,
                  questIds: selectedLs.questIds,
                  enemyIds: selectedLs.enemyIds,
                  imageIds: selectedLs.imageIds,
                  battleMapIds: selectedLs.battleMapId ? [selectedLs.battleMapId] : [],
                })
              }
              onToggle={(field, id) =>
                setLocationLinksDraft((d) => {
                  if (!d) return d;
                  const current = d[field];
                  const next = current.includes(id) ? current.filter((i) => i !== id) : [...current, id];
                  return { ...d, [field]: next };
                })
              }
              onSave={() => {
                if (!locationLinksDraft) return;
                store.patchLocationState(selectedLs.id, {
                  npcIds: locationLinksDraft.npcIds,
                  questIds: locationLinksDraft.questIds,
                  enemyIds: locationLinksDraft.enemyIds,
                  imageIds: locationLinksDraft.imageIds,
                  battleMapId: locationLinksDraft.battleMapIds[0] ?? undefined,
                });
                setLocationLinksDraft(null);
              }}
              onCancel={() => setLocationLinksDraft(null)}
              npcCreateDraft={npcCreateDraft}
              onStartNpcCreate={() =>
                setNpcCreateDraft({
                  name: '',
                  role: '',
                  faction: '',
                  publicDescription: '',
                  dmNotes: '',
                  visibleToPlayers: true,
                })
              }
              onNpcCreateChange={(patch) => setNpcCreateDraft((d) => (d ? { ...d, ...patch } : d))}
              onSaveNpcCreate={saveNpcCreateDraft}
              onCancelNpcCreate={() => setNpcCreateDraft(null)}
            />
          )}

          {effectiveObjectWindowSection === 'overview' && selectedLs && !selectedVisible && (
            <p className="side-panel-empty">Эта локация скрыта от игроков.</p>
          )}

          {effectiveObjectWindowSection === 'overview' && selectedLs && selectedVisible && (() => {
            // Stage 6C.5 Phase 2F — a placed Tavern/Shop materializes as a
            // LocationState too (tagged `sourceLibraryType`/`sourceLibraryId`
            // at placement time, see handleMapClick), not a DmLocation, so
            // the DmLocation lookup below always misses for them. Branch on
            // the source type first so taverns/shops get their own real
            // DM-Companion-style card instead of silently rendering nothing
            // and falling through to the generic technical panel.
            if (selectedLs.sourceLibraryType === 'tavern') {
              const sourceTavern = data?.taverns.find((t) => t.id === selectedLs.sourceLibraryId);
              return sourceTavern ? (
                <CompanionTavernCard
                  tavern={sourceTavern}
                  npcs={npcsForArc}
                  quests={questsForArc}
                  images={data?.images ?? []}
                  onOpenNpc={(id) => openCompanion({ type: 'npc', id })}
                  onOpenQuest={(id) => openCompanion({ type: 'quest', id })}
                />
              ) : null;
            }
            if (selectedLs.sourceLibraryType === 'shop') {
              const sourceShop = data?.shops.find((s) => s.id === selectedLs.sourceLibraryId);
              return sourceShop ? (
                <CompanionShopCard
                  shop={sourceShop}
                  npcs={npcsForArc}
                  images={data?.images ?? []}
                  onOpenNpc={(id) => openCompanion({ type: 'npc', id })}
                />
              ) : null;
            }
            const sourceLoc = data?.locations.find((l) => l.id === selectedLs.locationId);
            return sourceLoc ? (
              <CompanionLocationCard
                loc={sourceLoc}
                npcs={npcsForArc}
                quests={questsForArc}
                onOpenNpc={(id) => openCompanion({ type: 'npc', id })}
                onOpenQuest={(id) => openCompanion({ type: 'quest', id })}
              />
            ) : null;
          })()}

          {effectiveObjectWindowSection === 'overview' && selectedLs && selectedVisible && (
            <LocationSidePanel
              ls={selectedLs}
              routes={routes}
              hotspots={hotspots}
              partyLocationState={partyLocationState}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              onSelectLocation={selectLocation}
              onOpenDrawer={setDrawer}
              onOpenPlacement={openPlacementDrawer}
              onStartPlacement={startPlacement}
              onMarkRoutePath={markRoutePath}
              onCreateRouteBetween={openRouteBuilderBetween}
              onStartMoveHotspot={(hotspotId) => setMovingHotspotId(hotspotId)}
              movingHotspotId={movingHotspotId}
              onStartPartyAnimation={(points) => setPartyTravelAnim({ points, index: 0 })}
              onFindAndCommitPath={(fromHotspotId, toHotspotId, destinationLocationStateId) => {
                const paths = findJourneyPaths(fromHotspotId, toHotspotId);
                if (paths.length === 1) {
                  commitMultiSegmentJourney(paths[0], destinationLocationStateId);
                } else {
                  setPathfindingResult({ targetLocationStateId: destinationLocationStateId, options: paths });
                }
              }}
              pathfindingResult={pathfindingResult}
              onCommitPathOption={(path, destinationLocationStateId) => commitMultiSegmentJourney(path, destinationLocationStateId)}
              onClose={() => {
                setSelectedLocationStateId(null);
                setPathfindingResult(null);
              }}
            />
          )}
                  {effectiveObjectWindowSection === 'danger' && (
                    <div className="object-window-danger-zone">
                      <p className="muted">
                        Действия ниже не удаляют исходные данные локации без явного отдельного подтверждения.
                      </p>
                      <button
                        className="btn-danger"
                        disabled={!selectedHotspot}
                        onClick={() => {
                          if (!selectedHotspot) return;
                          if (!window.confirm('Убрать маркер этой локации с текущей карты? Сама локация и её данные не удаляются.')) return;
                          handleDeleteHotspot(selectedHotspot.id);
                          setObjectWindowOpen(false);
                        }}
                      >
                        Убрать маркер с карты
                      </button>
                      <p className="object-window-danger-explain">
                        Удаляет только точку (маркер) этой локации на текущей карте. Сама локация, её описание,
                        связи и данные остаются без изменений и могут быть размещены на карте снова.
                      </p>
                      <button
                        className="btn-danger"
                        onClick={() => {
                          if (!window.confirm('Сбросить локальные правки этой локации? Это вернёт исходные данные локации (если она из источника).')) return;
                          store.resetOverride('locationState', selectedLs.id);
                        }}
                      >
                        Сбросить локальные правки
                      </button>
                      <p className="object-window-danger-explain">
                        Отменяет только локальные изменения (overlay-патч), сделанные в этой сессии. Не удаляет
                        исходный объект и не затрагивает маркеры/связи.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {!isEditMode && !selectedLs && (
            <p className="side-panel-empty">Выберите точку на карте, чтобы увидеть детали локации.</p>
          )}

          {!isEditMode && selectedLs && !selectedVisible && (
            <p className="side-panel-empty">Эта локация скрыта от игроков.</p>
          )}

          {!isEditMode && selectedLs && selectedVisible && (
            <LocationSidePanel
              ls={selectedLs}
              routes={routes}
              hotspots={hotspots}
              partyLocationState={partyLocationState}
              selectedRouteId={selectedRouteId}
              onSelectRoute={setSelectedRouteId}
              onSelectLocation={selectLocation}
              onOpenDrawer={setDrawer}
              onOpenPlacement={openPlacementDrawer}
              onStartPlacement={startPlacement}
              onMarkRoutePath={markRoutePath}
              onCreateRouteBetween={openRouteBuilderBetween}
              onStartMoveHotspot={(hotspotId) => setMovingHotspotId(hotspotId)}
              movingHotspotId={movingHotspotId}
              onStartPartyAnimation={(points) => setPartyTravelAnim({ points, index: 0 })}
              onFindAndCommitPath={(fromHotspotId, toHotspotId, destinationLocationStateId) => {
                const paths = findJourneyPaths(fromHotspotId, toHotspotId);
                if (paths.length === 1) {
                  commitMultiSegmentJourney(paths[0], destinationLocationStateId);
                } else {
                  setPathfindingResult({ targetLocationStateId: destinationLocationStateId, options: paths });
                }
              }}
              pathfindingResult={pathfindingResult}
              onCommitPathOption={(path, destinationLocationStateId) => commitMultiSegmentJourney(path, destinationLocationStateId)}
              onClose={() => {
                setSelectedLocationStateId(null);
                setPathfindingResult(null);
              }}
            />
          )}
        </aside>
        {isDmMode && companionOpen && data && (
          <EmbeddedCompanionWindow
            entity={companionOpen}
            hasBack={companionStack.length > 1}
            onBack={companionBack}
            onClose={closeCompanion}
            onOpen={openCompanion}
            data={data}
            npcs={npcsForArc}
            quests={questsForArc}
          />
        )}
      </div>

      {drawer && (
        <EntityDrawer
          drawer={drawer}
          onClose={() => {
            setDrawer(null);
            setSelectedPlacementId(null);
          }}
          onOpenBattleMapVtt={(battleMapId) =>
            window.open(store.battleMapVttUrlOverrides[battleMapId] || BATTLE_MAP_VTT_BASE_URL, '_blank')
          }
          onStartPlacement={startPlacement}
          onOpenLinkedEntity={openLinkedEntity}
        />
      )}
    </div>
  );
}

/**
 * Battle-map thumbnail with a graceful fallback. The source image is served
 * cross-origin by battle-map-vtt's OWN dev server (BATTLE_MAP_VTT_BASE_URL +
 * variant.url) — there is no local copy (the real PNGs total 541MB, far too
 * much to duplicate for a thumbnail). This means the preview only renders
 * when battle-map-vtt happens to be running at that URL; otherwise it falls
 * back to a plain placeholder rather than a broken-image icon.
 */
/**
 * Right-panel hotspot inspector (DM Edit only). Replaces the old below-map
 * per-row edit UI as the primary way to edit a hotspot: select it on the map
 * (or create one), then edit label/location/visibility/etc. here, with
 * dragging on the map as the primary way to move it.
 */
function HotspotInspector({
  hotspot,
  locations,
  locationSearch,
  onLocationSearchChange,
  onPatch,
  onDelete,
  onDeselect,
  onCenter,
  onStartPlacing,
  onFit,
}: {
  hotspot: MapHotspot | null;
  locations: LocationState[];
  locationSearch: string;
  onLocationSearchChange: (v: string) => void;
  onPatch: (patch: Partial<MapHotspot>) => void;
  onDelete: () => void;
  onDeselect: () => void;
  onCenter: () => void;
  onStartPlacing: () => void;
  onFit: () => void;
}) {
  const { data } = useCampaignData();

  if (!hotspot) {
    return (
      <div className="side-panel-content hotspot-inspector-empty">
        <p className="side-panel-empty">Выберите точку на карте или создайте новую.</p>
        <div className="actions">
          <button onClick={onStartPlacing}>Создать hotspot</button>
          <button onClick={onFit}>По размеру экрана</button>
        </div>
      </div>
    );
  }

  const linkedLs = hotspot.locationStateId && data ? getLocationState(data, hotspot.locationStateId) : undefined;

  return (
    <div className="side-panel-content">
      <div className="side-panel-breadcrumb">
        <h2 className="side-panel-title">Точка на карте</h2>
        <button className="side-panel-close" onClick={onDeselect} aria-label="Закрыть инспектор">
          ×
        </button>
      </div>

      <div className="form-row">
        <label>Название (подпись)</label>
        <input
          type="text"
          value={hotspot.label}
          onChange={(e) => onPatch({ label: e.target.value })}
        />
      </div>

      <div className="form-row">
        <label>Привязанная локация{linkedLs ? `: ${linkedLs.title}` : ' (не выбрана)'}</label>
        <input
          type="search"
          placeholder="Поиск локации…"
          value={locationSearch}
          onChange={(e) => onLocationSearchChange(e.target.value)}
        />
        <select
          value={hotspot.locationStateId || ''}
          onChange={(e) => onPatch({ locationStateId: e.target.value })}
        >
          <option value="">— не выбрана —</option>
          {locations.map((ls) => (
            <option key={ls.id} value={ls.id}>
              {ls.title}
            </option>
          ))}
        </select>
      </div>

      <div className="actions">
        <label className="reveal-toggle">
          <input
            type="checkbox"
            checked={!hotspot.labelHidden}
            onChange={(e) => onPatch({ labelHidden: !e.target.checked })}
          />
          Показывать подпись
        </label>
        <label className="reveal-toggle">
          <input
            type="checkbox"
            checked={hotspot.visibleInPlayerView !== false}
            onChange={(e) => onPatch({ visibleInPlayerView: e.target.checked })}
          />
          Видна игрокам
        </label>
      </div>

      <p className="side-panel-subheading">
        Координаты: x={hotspot.x.toFixed(3)}, y={hotspot.y.toFixed(3)} (перетащите точку на карте, чтобы изменить)
      </p>

      {hotspot.needsCoordinateReview ? (
        <p className="review-badge">позиция не подтверждена</p>
      ) : (
        <p className="muted">Позиция подтверждена</p>
      )}

      <div className="actions">
        {hotspot.needsCoordinateReview ? (
          <button onClick={() => onPatch({ needsCoordinateReview: false })}>Подтвердить позицию</button>
        ) : (
          <button disabled>Позиция подтверждена</button>
        )}
        <button onClick={onCenter}>Центрировать на карте</button>
        <button onClick={onDelete}>Удалить точку</button>
        <button onClick={onDeselect}>Отмена / закрыть</button>
      </div>
    </div>
  );
}

/**
 * "Данные локации" tab (DM Edit only). Reuses the same field set/logic as the
 * standalone edit form in LocationPage.tsx (title/type/parent/status/public
 * description/dmNotes/tags/visibleToPlayers), wired to this location instead.
 * The arc/timeline (timelineId) is intentionally read-only here.
 */
function LocationDataTab({
  ls,
  locations,
  npcs,
  draft,
  onStartEdit,
  onChange,
  onSave,
  onCancel,
  images,
  onChangeHeaderImage,
}: {
  ls: LocationState;
  locations: LocationState[];
  npcs: { id: string; name: string; role?: string; faction?: string; location?: string }[];
  draft: Record<string, unknown> | null;
  onStartEdit: () => void;
  onChange: (patch: Record<string, unknown>) => void;
  onSave: () => void;
  onCancel: () => void;
  images: DmImageItem[];
  onChangeHeaderImage: () => void;
}) {
  const otherLocations = locations.filter((s) => s.id !== ls.id);
  // Stage 6B.3: prioritize NPCs already linked to this location at the top
  // of the staff picker — same "linked first" convenience as the NPC link
  // CheckboxList elsewhere, since staff are very likely to already be
  // linked NPCs.
  const npcLabel = (n: { id: string; name: string; role?: string; faction?: string }) =>
    `${n.name}${n.role ? ` · ${n.role}` : ''}${n.faction ? ` (${n.faction})` : ''}`;
  const npcsForStaffPicker = [...npcs].sort((a, b) => {
    const aLinked = ls.npcIds.includes(a.id) ? 0 : 1;
    const bLinked = ls.npcIds.includes(b.id) ? 0 : 1;
    return aLinked - bLinked;
  });

  if (!draft) {
    return (
      <div className="side-panel-content">
        <h2 className="side-panel-title">Данные локации</h2>
        <div className="actions">
          <button onClick={onStartEdit}>Редактировать</button>
        </div>
      </div>
    );
  }

  return (
    <div className="side-panel-content">
      <h2 className="side-panel-title">Данные локации</h2>
      <div className="form-grid">
        <div className="form-row">
          <label>Название</label>
          <input
            type="text"
            value={draft.title as string}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        </div>
        <div className="form-row">
          <label>Тип (шаблон)</label>
          <input
            type="text"
            list="location-type-options"
            value={draft.type as string}
            onChange={(e) => onChange({ type: e.target.value })}
          />
          <datalist id="location-type-options">
            {LOCATION_TEMPLATE_OPTIONS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </datalist>
        </div>
        <div className="form-row">
          <label>Изображение (заголовок)</label>
          <div className="library-card-row">
            {draft.headerImageId ? (
              <img
                className="library-thumb"
                src={images.find((i) => i.id === draft.headerImageId)?.thumbnailSrc ?? images.find((i) => i.id === draft.headerImageId)?.src}
                alt=""
                loading="lazy"
              />
            ) : (
              <span className="library-thumb library-thumb-fallback" aria-hidden="true">{LIBRARY_FALLBACK_ICON.location}</span>
            )}
            <div className="library-card-body actions">
              <button type="button" onClick={onChangeHeaderImage}>Сменить изображение</button>
              {!!draft.headerImageId && (
                <button type="button" onClick={() => onChange({ headerImageId: '' })}>Убрать</button>
              )}
            </div>
          </div>
        </div>
        <div className="form-row">
          <label>Родительская локация</label>
          <select
            value={draft.parentLocationStateId as string}
            onChange={(e) => onChange({ parentLocationStateId: e.target.value })}
          >
            <option value="">— нет —</option>
            {otherLocations.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Статус</label>
          <select value={draft.status as string} onChange={(e) => onChange({ status: e.target.value })}>
            {(['unknown', 'known', 'visited', 'hidden', 'destroyed', 'contested'] as LocationStatus[]).map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="form-row">
          <label>Арка / таймлайн</label>
          <input type="text" value={ls.timelineId} disabled readOnly />
          <p className="side-panel-subheading">изменение арки временно недоступно</p>
        </div>
        <div className="form-row">
          <label>Внутреннее описание</label>
          <textarea
            value={draft.publicDescription as string}
            onChange={(e) => onChange({ publicDescription: e.target.value })}
          />
        </div>
        <div className="form-row">
          <label>Описание для игроков (Player Safe)</label>
          <textarea
            value={draft.playerSafeDescription as string}
            onChange={(e) => onChange({ playerSafeDescription: e.target.value })}
            placeholder="Если оставить пустым — игроки увидят внутреннее описание выше"
          />
        </div>
        <div className="form-row">
          <label>Заметки ДМ (никогда не видно игрокам/Observer)</label>
          <textarea value={draft.dmNotes as string} onChange={(e) => onChange({ dmNotes: e.target.value })} />
        </div>
        <div className="form-row">
          <label>Теги (через запятую)</label>
          <input type="text" value={draft.tags as string} onChange={(e) => onChange({ tags: e.target.value })} />
        </div>
        <div className="form-row">
          <label className="reveal-toggle">
            <input
              type="checkbox"
              checked={draft.visibleToPlayers as boolean}
              onChange={(e) => onChange({ visibleToPlayers: e.target.checked })}
            />
            Видна игрокам (если статус позволяет)
          </label>
        </div>

        {draft.type === 'tavern' && (
          <>
            <h3 className="side-panel-subheading">Детали таверны</h3>
            <div className="form-row">
              <label>Владелец (NPC)</label>
              <select
                value={draft.tavern_ownerNpcId as string}
                onChange={(e) => onChange({ tavern_ownerNpcId: e.target.value })}
              >
                <option value="">— не выбран —</option>
                {npcs.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Персонал (NPC)</label>
              <CheckboxList
                items={npcsForStaffPicker}
                selectedIds={(draft.tavern_staffNpcIds as string)
                  .split(',')
                  .map((s) => s.trim())
                  .filter(Boolean)}
                onToggle={(id) => {
                  const current = (draft.tavern_staffNpcIds as string)
                    .split(',')
                    .map((s) => s.trim())
                    .filter(Boolean);
                  const next = current.includes(id) ? current.filter((x) => x !== id) : [...current, id];
                  onChange({ tavern_staffNpcIds: next.join(', ') });
                }}
                labelOf={(item) => npcLabel(item as { id: string; name: string; role?: string; faction?: string })}
              />
            </div>
            <div className="form-row">
              <label>Комнаты / услуги</label>
              <textarea
                value={draft.tavern_roomsServices as string}
                onChange={(e) => onChange({ tavern_roomsServices: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Слухи (Player Safe)</label>
              <textarea
                value={draft.tavern_rumors as string}
                onChange={(e) => onChange({ tavern_rumors: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Цены / заметки о ценах</label>
              <textarea
                value={draft.tavern_pricesNotes as string}
                onChange={(e) => onChange({ tavern_pricesNotes: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Зацепки для приключения</label>
              <textarea
                value={draft.tavern_troubleHooks as string}
                onChange={(e) => onChange({ tavern_troubleHooks: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Секреты (ДМ-only)</label>
              <textarea
                value={draft.tavern_secrets as string}
                onChange={(e) => onChange({ tavern_secrets: e.target.value })}
              />
            </div>
          </>
        )}

        {draft.type === 'shop' && (
          <>
            <h3 className="side-panel-subheading">Детали лавки</h3>
            <div className="form-row">
              <label>Тип лавки</label>
              <input
                type="text"
                value={draft.shop_shopType as string}
                onChange={(e) => onChange({ shop_shopType: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Владелец (NPC)</label>
              <select
                value={draft.shop_ownerNpcId as string}
                onChange={(e) => onChange({ shop_ownerNpcId: e.target.value })}
              >
                <option value="">— не выбран —</option>
                {npcs.map((n) => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label>Товары / услуги</label>
              <textarea
                value={draft.shop_goodsServices as string}
                onChange={(e) => onChange({ shop_goodsServices: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Заметки об ассортименте</label>
              <textarea
                value={draft.shop_inventoryNotes as string}
                onChange={(e) => onChange({ shop_inventoryNotes: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Политика цен</label>
              <textarea
                value={draft.shop_pricePolicy as string}
                onChange={(e) => onChange({ shop_pricePolicy: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Требование репутации</label>
              <input
                type="text"
                value={draft.shop_reputationRequirement as string}
                onChange={(e) => onChange({ shop_reputationRequirement: e.target.value })}
              />
            </div>
            <div className="form-row">
              <label>Запрещённые/скрытые товары (ДМ-only)</label>
              <textarea
                value={draft.shop_illegalGoods as string}
                onChange={(e) => onChange({ shop_illegalGoods: e.target.value })}
              />
            </div>
          </>
        )}

        <div className="actions">
          <button onClick={onSave}>Сохранить</button>
          <button onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

/**
 * "Связи" tab (DM Edit only). Reuses the CheckboxList multi-select component
 * from LocationPage.tsx for NPC/quest/enemy/image/battle-map links.
 */
const ENTITY_TAB_KINDS = ['npc', 'quest', 'enemy', 'image', 'battleMap'] as const;
type EntityTabKind = (typeof ENTITY_TAB_KINDS)[number];
const ENTITY_TAB_LABELS: Record<EntityTabKind, string> = {
  npc: 'NPC',
  quest: 'Квесты',
  enemy: 'Враги',
  image: 'Изображения',
  battleMap: 'Боевые карты',
};

/**
 * "Place existing entity" browser (DM Edit only): tabbed list of NPC/quest/
 * enemy/image/battleMap cards already scoped to the active arc by the
 * caller. Never creates a new entity — only either (a) arms placementMode so
 * the next map click drops a linked MapObjectPlacement, or (b) when a
 * location is selected, also offers "Связать с локацией" to add the id to
 * that LocationState's own linkedXIds array (the Fill Location workflow).
 */
function EntityCardsPanel({
  npcs,
  quests,
  enemies,
  images,
  battleMaps,
  placementsForMap,
  selectedLs,
  onStartPlacement,
  onLinkToLocation,
}: {
  npcs: { id: string; name: string; role?: string; tags?: string[] }[];
  quests: { id: string; title: string; goal?: string; status: string }[];
  enemies: { id: string; name: string; role?: string }[];
  images: { id: string; title: string; type?: string }[];
  battleMaps: { id: string; title: string }[];
  placementsForMap: MapObjectPlacement[];
  selectedLs: LocationState | null;
  onStartPlacement: (entityKind: MapObjectPlacement['entityKind'], entityId: string | undefined, title: string) => void;
  onLinkToLocation: (field: 'npcIds' | 'questIds' | 'enemyIds' | 'imageIds', id: string) => void;
}) {
  const [tab, setTab] = useState<EntityTabKind>('npc');
  const isPlaced = (id: string) => placementsForMap.some((p) => p.entityId === id);

  function renderRows() {
    if (tab === 'npc') {
      if (npcs.length === 0) return <p className="muted">Нет NPC в текущей арке.</p>;
      return npcs.map((n) => (
        <li key={n.id}>
          <strong>{n.name}</strong>
          {n.role && <span className="entity-card-sub"> · {n.role}</span>}
          {isPlaced(n.id) && <span className="status-badge"> размещён на карте</span>}
          <div className="actions">
            {selectedLs && !selectedLs.npcIds.includes(n.id) && (
              <button onClick={() => onLinkToLocation('npcIds', n.id)}>Связать с локацией</button>
            )}
            <button onClick={() => onStartPlacement('npc', n.id, n.name)}>Разместить на карте</button>
          </div>
        </li>
      ));
    }
    if (tab === 'quest') {
      if (quests.length === 0) return <p className="muted">Нет квестов в текущей арке.</p>;
      return quests.map((q) => (
        <li key={q.id}>
          <strong>{q.title}</strong>
          {q.goal && <span className="entity-card-sub"> · {q.goal}</span>}
          <span className="status-badge"> {q.status}</span>
          {isPlaced(q.id) && <span className="status-badge"> размещён на карте</span>}
          <div className="actions">
            {selectedLs && !selectedLs.questIds.includes(q.id) && (
              <button onClick={() => onLinkToLocation('questIds', q.id)}>Связать с локацией</button>
            )}
            <button onClick={() => onStartPlacement('quest', q.id, q.title)}>Разместить на карте</button>
          </div>
        </li>
      ));
    }
    if (tab === 'enemy') {
      if (enemies.length === 0) return <p className="muted">Нет врагов в текущей арке.</p>;
      return enemies.map((en) => (
        <li key={en.id}>
          <strong>{en.name}</strong>
          {en.role && <span className="entity-card-sub"> · {en.role}</span>}
          {isPlaced(en.id) && <span className="status-badge"> размещён на карте</span>}
          <div className="actions">
            {selectedLs && !selectedLs.enemyIds.includes(en.id) && (
              <button onClick={() => onLinkToLocation('enemyIds', en.id)}>Связать с локацией</button>
            )}
            <button onClick={() => onStartPlacement('enemy', en.id, en.name)}>Разместить на карте</button>
          </div>
        </li>
      ));
    }
    if (tab === 'image') {
      if (images.length === 0) return <p className="muted">Нет изображений в текущей арке.</p>;
      return images.map((im) => (
        <li key={im.id}>
          <strong>{im.title}</strong>
          {im.type && <span className="entity-card-sub"> · {im.type}</span>}
          {isPlaced(im.id) && <span className="status-badge"> размещён на карте</span>}
          <div className="actions">
            {selectedLs && !selectedLs.imageIds.includes(im.id) && (
              <button onClick={() => onLinkToLocation('imageIds', im.id)}>Связать с локацией</button>
            )}
            <button onClick={() => onStartPlacement('image', im.id, im.title)}>Разместить на карте</button>
          </div>
        </li>
      ));
    }
    if (battleMaps.length === 0) return <p className="muted">Нет боевых карт.</p>;
    return battleMaps.map((bm) => (
      <li key={bm.id}>
        <strong>{bm.title}</strong>
        {isPlaced(bm.id) && <span className="status-badge"> размещён на карте</span>}
        <div className="actions">
          <button onClick={() => onStartPlacement('battleMap', bm.id, bm.title)}>Разместить на карте</button>
        </div>
      </li>
    ));
  }

  return (
    <div className="entity-cards-panel">
      <h3>Существующие объекты{selectedLs ? ` — заполнение «${selectedLs.title}»` : ''}</h3>
      {selectedLs && (
        <p className="muted">
          Выбрана локация «{selectedLs.title}». «Связать с локацией» добавляет сущность в её карточку без размещения
          на карте; «Разместить на карте» создаёт здесь маркер (карточка не дублируется).
        </p>
      )}
      <div className="side-panel-tabs">
        {ENTITY_TAB_KINDS.map((k) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>
            {ENTITY_TAB_LABELS[k]}
          </button>
        ))}
      </div>
      <ul className="route-list">{renderRows()}</ul>
    </div>
  );
}

/**
 * Stage 6B.1 — "Не размещено" tab (DM Edit only). MVP unplaced-content view:
 * locations with no hotspot on any map for the current timeline, NPCs/quests
 * (already arc-scoped by the caller, see npcsForArc/questsForArc) with no
 * `location` set at all, and BattleEntrys with neither a `position` nor a
 * `sourceLocationStateId`. Deliberately does not attempt "place on map"
 * directly from here (that would duplicate the existing hotspot-creation
 * click-the-map flow) — only focus/select and link-to-selected-location.
 */
function UnplacedContentPanel({
  locationsWithoutHotspot,
  npcsWithoutLocation,
  questsWithoutLocation,
  battleEntriesWithoutPosition,
  selectedLs,
  onSelectLocation,
  onLinkNpcToSelected,
  onLinkQuestToSelected,
  onOpenDrawer,
  onPlaceOnMap,
  placingExistingLocationId,
}: {
  locationsWithoutHotspot: LocationState[];
  npcsWithoutLocation: { id: string; name: string }[];
  questsWithoutLocation: { id: string; title: string }[];
  battleEntriesWithoutPosition: BattleEntry[];
  selectedLs: LocationState | null;
  onSelectLocation: (id: string) => void;
  onLinkNpcToSelected: (npcId: string) => void;
  onLinkQuestToSelected: (questId: string) => void;
  onOpenDrawer: (d: DrawerState) => void;
  onPlaceOnMap: (locationId: string) => void;
  placingExistingLocationId: string | null;
}) {
  const LIST_CAP = 30;
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [showAllNpcs, setShowAllNpcs] = useState(false);
  const [showAllQuests, setShowAllQuests] = useState(false);
  const shownLocations = showAllLocations ? locationsWithoutHotspot : locationsWithoutHotspot.slice(0, LIST_CAP);
  const shownNpcs = showAllNpcs ? npcsWithoutLocation : npcsWithoutLocation.slice(0, LIST_CAP);
  const shownQuests = showAllQuests ? questsWithoutLocation : questsWithoutLocation.slice(0, LIST_CAP);
  return (
    <div className="side-panel-content">
      <h2 className="side-panel-title">Не размещено</h2>
      <p className="muted">
        Контент текущей арки, у которого нет точки на карте или привязки к локации.
        {selectedLs ? ` Выбрана локация «${selectedLs.title}» — можно привязать NPC/квест к ней.` : ' Выберите локацию на карте, чтобы привязывать сюда.'}
      </p>

      <section className="card">
        <h3>Локации без точки на карте ({locationsWithoutHotspot.length})</h3>
        {locationsWithoutHotspot.length === 0 ? (
          <p className="muted">Все локации этой арки размещены.</p>
        ) : (
          <>
            <ul className="route-list">
              {shownLocations.map((ls) => (
                <li key={ls.id}>
                  <strong>{ls.title}</strong>
                  {ls.type && <span className="entity-card-sub"> · {ls.type}</span>}
                  <div className="actions">
                    <button onClick={() => onSelectLocation(ls.id)}>Открыть</button>
                    <button
                      disabled={placingExistingLocationId === ls.id}
                      onClick={() => onPlaceOnMap(ls.id)}
                    >
                      {placingExistingLocationId === ls.id ? 'Кликните по карте…' : 'Разместить на текущей карте'}
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {!showAllLocations && locationsWithoutHotspot.length > LIST_CAP && (
              <button onClick={() => setShowAllLocations(true)}>
                Показать ещё ({locationsWithoutHotspot.length - LIST_CAP})
              </button>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h3>NPC без локации ({npcsWithoutLocation.length})</h3>
        {npcsWithoutLocation.length === 0 ? (
          <p className="muted">У всех NPC этой арки есть локация.</p>
        ) : (
          <>
            <ul className="route-list">
              {shownNpcs.map((n) => (
                <li key={n.id}>
                  <strong>{n.name}</strong>
                  <div className="actions">
                    <button onClick={() => onOpenDrawer({ kind: 'npc', id: n.id })}>Открыть</button>
                    {selectedLs && (
                      <button onClick={() => onLinkNpcToSelected(n.id)}>
                        Привязать к «{selectedLs.title}»
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!showAllNpcs && npcsWithoutLocation.length > LIST_CAP && (
              <button onClick={() => setShowAllNpcs(true)}>
                Показать ещё ({npcsWithoutLocation.length - LIST_CAP})
              </button>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h3>Квесты без локации ({questsWithoutLocation.length})</h3>
        {questsWithoutLocation.length === 0 ? (
          <p className="muted">У всех квестов этой арки есть локация.</p>
        ) : (
          <>
            <ul className="route-list">
              {shownQuests.map((q) => (
                <li key={q.id}>
                  <strong>{q.title}</strong>
                  <div className="actions">
                    <button onClick={() => onOpenDrawer({ kind: 'quest', id: q.id })}>Открыть</button>
                    {selectedLs && (
                      <button onClick={() => onLinkQuestToSelected(q.id)}>
                        Привязать к «{selectedLs.title}»
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
            {!showAllQuests && questsWithoutLocation.length > LIST_CAP && (
              <button onClick={() => setShowAllQuests(true)}>
                Показать ещё ({questsWithoutLocation.length - LIST_CAP})
              </button>
            )}
          </>
        )}
      </section>

      <section className="card">
        <h3>Боевые сцены без позиции ({battleEntriesWithoutPosition.length})</h3>
        {battleEntriesWithoutPosition.length === 0 ? (
          <p className="muted">У всех боевых сцен этой арки есть позиция или исходная локация.</p>
        ) : (
          <ul className="route-list">
            {battleEntriesWithoutPosition.map((be) => (
              <li key={be.id}>
                <strong>{be.name}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** Stage 6C — read-only browser for DM Companion library records
 * (DmTavern/DmShop) that don't yet have a map placement, with a "Разместить
 * на текущей карте" action per card. This is a projection over existing
 * `data.taverns`/`data.shops` (loaded read-only via loadCampaignData.ts) —
 * it never stores a second copy of that data; the only thing this stage
 * persists is the placement (a new LocationState + hotspot tagged with
 * sourceLibraryId once placed — see handleMapClick). DM-only: the caller
 * only renders this tab when isEditMode, which is already false for both
 * Player View and Observer. */
/** Stage 6C.1: a location's placement state relative to the current map,
 * computed from existing hotspot data — never stored separately. */
type LibraryPlacementFilter = 'all' | 'unplaced' | 'placed_here' | 'placed_elsewhere' | 'linked_only';

/** Stage 6C.3A — shared 48px thumbnail for every Library/picker card. Never
 * renders a broken-image icon: falls back to a type-specific glyph the
 * instant `resolveEntityPreviewImage` returns nothing. `loading="lazy"` and
 * `max-width:100%` keep it from ever forcing the panel into horizontal
 * scroll, even with a wide source image. */
function LibraryThumb({
  type,
  entity,
  images,
  battleMaps,
}: {
  type: LibrarySourceType;
  entity: unknown;
  images: DmImageItem[];
  battleMaps?: BattleMapManifestEntry[];
}) {
  const img = resolveEntityPreviewImage(type, entity, images, battleMaps);
  if (img) {
    return (
      <img
        className="library-thumb"
        src={img.thumbnailSrc ?? img.src}
        alt={img.title ?? ''}
        loading="lazy"
      />
    );
  }
  return (
    <span className="library-thumb library-thumb-fallback" aria-hidden="true">
      {LIBRARY_FALLBACK_ICON[type]}
    </span>
  );
}

/**
 * Stage 6C.4C — shared image picker modal, used by both the NPC editor and
 * the Location editor's "Сменить изображение" action. Reads only the
 * already-loaded `images.json` (`DmImageItem[]`) — never invents a path,
 * never uploads anything. Selecting an image just returns its id to the
 * caller, which is responsible for actually applying it (via `patchNpc` for
 * NPCs, or by reordering `LocationState.imageIds` for locations) — this
 * component has no opinion about where the id gets stored.
 */
function ImagePickerModal({
  images,
  currentImageId,
  onSelect,
  onClear,
  onClose,
}: {
  images: DmImageItem[];
  currentImageId?: string;
  onSelect: (imageId: string) => void;
  onClear?: () => void;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showAll, setShowAll] = useState(false);
  const q = search.trim().toLowerCase();
  const filtered = images.filter(
    (img) =>
      !q ||
      img.title.toLowerCase().includes(q) ||
      img.id.toLowerCase().includes(q) ||
      img.type.toLowerCase().includes(q),
  );
  const shown = showAll ? filtered : filtered.slice(0, 30);
  return (
    <div className="object-picker-overlay" onClick={onClose}>
      <div className="object-picker-modal" onClick={(e) => e.stopPropagation()}>
        <div className="object-picker-header">
          <h2>Сменить изображение</h2>
          <button className="btn-ghost" onClick={onClose}>Отмена ✕</button>
        </div>
        <input
          className="object-picker-search"
          placeholder="Поиск по названию, id или тегу…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {onClear && currentImageId && (
          <div className="actions">
            <button
              className="btn-secondary"
              onClick={() => {
                onClear();
                onClose();
              }}
            >
              Убрать текущее изображение
            </button>
          </div>
        )}
        <div className="object-picker-grid">
          {shown.map((img) => (
            <div className="object-picker-card" key={img.id}>
              <img className="library-thumb" src={img.thumbnailSrc ?? img.src} alt={img.title} loading="lazy" />
              <strong>{img.title}</strong>
              <span className="muted">{img.type}</span>
              <button
                className={img.id === currentImageId ? 'btn-secondary btn-compact' : 'btn-primary btn-compact'}
                disabled={img.id === currentImageId}
                onClick={() => {
                  onSelect(img.id);
                  onClose();
                }}
              >
                {img.id === currentImageId ? 'Текущее' : 'Выбрать'}
              </button>
            </div>
          ))}
        </div>
        {!showAll && filtered.length > 30 && (
          <div className="object-picker-footer">
            <button className="btn-secondary" onClick={() => setShowAll(true)}>
              Показать ещё ({filtered.length - 30})
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function LibraryPanel({
  locations,
  npcs,
  taverns,
  shops,
  hotspotsOnCurrentMap,
  allHotspots,
  placedSourceIds,
  placingLibraryEntity,
  onPlaceOnMap,
  selectedLs,
  placingExistingLocationId,
  onPlaceExistingLocation,
  onSelectLocationCard,
  onLinkNpcToSelected,
  images,
  quests,
  enemies,
  battleMaps,
  battleEntries,
  npcMovableEntities,
  currentMapId,
  placingNpcEntityId,
  onPlaceNpcOnMap,
  onEditNpc,
  onEditTavern,
  onEditShop,
  onEditImage,
  onEditBattleEntry,
  contentMovableEntities,
  placingContentEntity,
  onPlaceContentEntity,
  placingBattleEntryId,
  onPlaceBattleEntry,
  onDragStartCard,
  onDragEndCard,
  onOpenCompanion,
  canWrite,
}: {
  onOpenCompanion: (entity: EmbeddedCompanionEntity) => void;
  /** Stage 6C.5 Phase 2G — true only in DM Edit. Gates every write-capable
   * Library action (place/move/link/edit/drag) while leaving "Открыть
   * карточку" (a pure read/navigation action) always enabled, per the
   * mode-guard split already established for the right panel/object
   * window in Phase 2D-Fix. */
  canWrite: boolean;
  locations: LocationState[];
  npcs: { id: string; name: string; role?: string; faction?: string; location?: string; image?: string }[];
  taverns: DmTavern[];
  shops: DmShop[];
  images: DmImageItem[];
  quests: DmQuest[];
  enemies: DmCustomEnemy[];
  battleMaps: BattleMapManifestEntry[];
  battleEntries: BattleEntry[];
  npcMovableEntities: MovableEntity[];
  currentMapId: string | undefined;
  placingNpcEntityId: string | null;
  onPlaceNpcOnMap: (npcId: string) => void;
  onEditNpc: (npc: { id: string; name: string; role?: string; faction?: string; location?: string; image?: string }) => void;
  onEditTavern: (t: DmTavern) => void;
  onEditShop: (s: DmShop) => void;
  onEditImage: (img: DmImageItem) => void;
  onEditBattleEntry: (be: BattleEntry) => void;
  /** Stage 6C.4E — all standalone Quest/Enemy/Image MovableEntity markers
   * (any map), used to compute the placement-state badge per Library row. */
  contentMovableEntities: MovableEntity[];
  placingContentEntity: { type: 'quest' | 'enemy' | 'image'; sourceId: string } | null;
  onPlaceContentEntity: (type: 'quest' | 'enemy' | 'image', sourceId: string) => void;
  placingBattleEntryId: string | null;
  onPlaceBattleEntry: (battleEntryId: string) => void;
  /** Stage 6C.4F — drag-and-drop. Fired by a card's native onDragStart with
   * the same (type, id, title) shape every "Разместить на карте" button
   * already passes to its own arm-then-click handler — drag/drop is just a
   * different way to arrive at the exact same drop point, not a parallel
   * placement path. */
  onDragStartCard: (
    sourceType: 'location' | 'tavern' | 'shop' | 'npc' | 'quest' | 'enemy' | 'battleEntry' | 'image',
    sourceId: string,
    title: string,
  ) => void;
  onDragEndCard: () => void;
  hotspotsOnCurrentMap: MapHotspot[];
  allHotspots: MapHotspot[];
  placedSourceIds: Set<string>;
  placingLibraryEntity: { type: 'tavern' | 'shop'; sourceId: string; title: string } | null;
  onPlaceOnMap: (type: 'tavern' | 'shop', sourceId: string, title: string) => void;
  selectedLs: LocationState | null;
  placingExistingLocationId: string | null;
  onPlaceExistingLocation: (locationId: string) => void;
  onSelectLocationCard?: (locationId: string) => void;
  onLinkNpcToSelected: (npcId: string) => void;
}) {
  const LIST_CAP = 30;
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<LibraryPlacementFilter>('all');
  const [showAllLocations, setShowAllLocations] = useState(false);
  const [showAllNpcs, setShowAllNpcs] = useState(false);
  const [showAllTaverns, setShowAllTaverns] = useState(false);
  const [showAllShops, setShowAllShops] = useState(false);
  // Stage 6C.5 Phase 2B — hierarchy/structural locations (kingdom/region/
  // city-root nodes like "Королевство Аурелон"/"Калдран"/"Грейхольм") are
  // hidden from the default Локации list so they stop cluttering city-map
  // placement browsing. Off by default; the DM can reveal them explicitly.
  const [showHierarchyLocations, setShowHierarchyLocations] = useState(false);

  // Stage 6C.5 Phase 2E-Reset — the Library was one long mixed vertical
  // list (Локации/NPC/Таверны/Лавки/Квесты/Враги/Боевые сцены/Изображения
  // stacked top to bottom), forcing the DM to scroll past dozens of
  // locations just to reach the NPC section. Category tabs make only one
  // section visible at a time; search/placement-filter still apply within
  // whichever category is active.
  type LibraryCategory = 'locations' | 'npc' | 'taverns' | 'shops' | 'quests' | 'enemies' | 'battleEntries' | 'images';
  const [activeCategory, setActiveCategory] = useState<LibraryCategory>('locations');

  const q = search.trim().toLowerCase();
  const matchesSearch = (...parts: (string | undefined)[]) =>
    !q || parts.some((p) => (p ?? '').toLowerCase().includes(q));

  function locationPlacement(ls: LocationState): LibraryPlacementFilter {
    if (hotspotsOnCurrentMap.some((h) => h.locationStateId === ls.id)) return 'placed_here';
    if (allHotspots.some((h) => h.locationStateId === ls.id)) return 'placed_elsewhere';
    return 'unplaced';
  }

  // Stage 6C.5 Phase 2B — `LocationState` has no first-class hierarchy-tier
  // field; `type` is free text, but the seed data consistently uses
  // 'kingdom'/'region' for world/region-level nodes, and city-root nodes
  // use a city-type label (e.g. "город-крепость"). This is a real,
  // data-grounded heuristic (confirmed live against the actual seed data),
  // not a guess — it does not require a schema change, and it only ever
  // hides cards from the default view, never blocks placement outright.
  const HIERARCHY_LOCATION_TYPES = new Set(['kingdom', 'region', 'world', 'город', 'город-крепость']);
  function isHierarchyLocation(ls: LocationState): boolean {
    const t = (ls.type ?? '').trim().toLowerCase();
    return HIERARCHY_LOCATION_TYPES.has(t);
  }

  const searchedLocations = locations.filter((ls) => matchesSearch(ls.title, ls.publicDescription, ls.type));
  // Hierarchy/structural locations never mix into the normal placement
  // list, regardless of the toggle below — they're always rendered in
  // their own separate, clearly-labeled block instead.
  const hierarchyLocations = searchedLocations.filter(isHierarchyLocation);
  const filteredLocations = searchedLocations.filter((ls) => {
    if (isHierarchyLocation(ls)) return false;
    const placement = locationPlacement(ls);
    if (filter === 'all') return true;
    if (filter === 'linked_only') return false;
    return filter === placement;
  });
  const filteredNpcs = npcs.filter((n) => {
    if (!matchesSearch(n.name, n.role, n.faction)) return false;
    const isLinked = !!n.location;
    if (filter === 'all') return true;
    if (filter === 'linked_only') return isLinked;
    if (filter === 'unplaced') return !isLinked;
    return false;
  });
  const filteredTaverns =
    filter === 'all' || filter === 'unplaced' || filter === 'placed_here'
      ? taverns.filter((t) => {
          if (!matchesSearch(t.name, t.description)) return false;
          const placed = placedSourceIds.has(`tavern:${t.id}`);
          if (filter === 'unplaced') return !placed;
          if (filter === 'placed_here') return placed;
          return true;
        })
      : [];
  const filteredShops =
    filter === 'all' || filter === 'unplaced' || filter === 'placed_here'
      ? shops.filter((s) => {
          if (!matchesSearch(s.name, s.description)) return false;
          const placed = placedSourceIds.has(`shop:${s.id}`);
          if (filter === 'unplaced') return !placed;
          if (filter === 'placed_here') return placed;
          return true;
        })
      : [];

  const shownLocations = showAllLocations ? filteredLocations : filteredLocations.slice(0, LIST_CAP);
  const shownNpcs = showAllNpcs ? filteredNpcs : filteredNpcs.slice(0, LIST_CAP);
  const shownTaverns = showAllTaverns ? filteredTaverns : filteredTaverns.slice(0, LIST_CAP);
  const shownShops = showAllShops ? filteredShops : filteredShops.slice(0, LIST_CAP);

  const PLACEMENT_BADGE: Record<LibraryPlacementFilter, { label: string; cls: string }> = {
    all: { label: '', cls: '' },
    unplaced: { label: 'Не размещено', cls: '' },
    placed_here: { label: 'На этой карте', cls: 'status-badge--active' },
    placed_elsewhere: { label: 'На другой карте', cls: 'status-badge--time-gated' },
    linked_only: { label: 'Только связано', cls: 'status-badge--player-visible' },
  };

  return (
    <div className="side-panel-content">
      <h2 className="side-panel-title">Библиотека</h2>
      <p className="muted">
        Объекты DM Companion — выбирайте, размещайте на текущей карте или связывайте с выбранной локацией.
        Исходные объекты библиотеки не меняются и не дублируются.
        {selectedLs ? ` Выбрана локация «${selectedLs.title}» — можно связать NPC с ней.` : ' Выберите локацию на карте, чтобы связывать NPC.'}
      </p>
      <div className="actions">
        <input
          type="search"
          placeholder="Поиск по библиотеке…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select value={filter} onChange={(e) => setFilter(e.target.value as LibraryPlacementFilter)}>
          <option value="all">Все</option>
          <option value="unplaced">Не размещено</option>
          <option value="placed_here">На этой карте</option>
          <option value="placed_elsewhere">На другой карте</option>
          <option value="linked_only">Только связано (NPC)</option>
        </select>
      </div>

      <div className="library-category-tabs" role="tablist">
        {(
          [
            ['locations', `Локации (${filteredLocations.length})`],
            ['npc', `NPC (${filteredNpcs.length})`],
            ['taverns', `Таверны (${filteredTaverns.length})`],
            ['shops', `Лавки (${filteredShops.length})`],
            ['quests', `Квесты (${quests.length})`],
            ['enemies', `Враги (${enemies.length})`],
            ['battleEntries', `Боевые сцены (${battleEntries.length})`],
            ['images', `Изображения (${images.length})`],
          ] as [LibraryCategory, string][]
        ).map(([cat, label]) => (
          <button
            key={cat}
            role="tab"
            aria-selected={activeCategory === cat}
            className={activeCategory === cat ? 'library-category-tab active' : 'library-category-tab'}
            onClick={() => setActiveCategory(cat)}
          >
            {label}
          </button>
        ))}
      </div>

      {activeCategory === 'locations' && (
      <section className="card">
        <h3>Локации ({filteredLocations.length})</h3>
        {filteredLocations.length === 0 ? (
          <p className="muted">
            {hierarchyLocations.length > 0
              ? 'Это объекты уровня выше. Их нельзя просто разместить внутри текущей карты без переноса или локальной ссылки.'
              : 'Ничего не найдено.'}
          </p>
        ) : (
          <>
            <ul className="route-list">
              {shownLocations.map((ls) => {
                const placement = locationPlacement(ls);
                const badge = PLACEMENT_BADGE[placement];
                const armed = placingExistingLocationId === ls.id;
                return (
                  <li
                    key={ls.id}
                    className="library-card-row"
                    draggable={canWrite}
                    onDragStart={() => canWrite && onDragStartCard('location', ls.id, ls.title)}
                    onDragEnd={onDragEndCard}
                  >
                    <LibraryThumb type="location" entity={ls} images={images} />
                    <div className="library-card-body">
                      <strong>{ls.title}</strong>
                      {ls.type && <span className="entity-card-sub"> · {ls.type}</span>}
                      <span className={`status-badge ${badge.cls}`}> {badge.label}</span>
                      <p className="muted">{resolveEntityShortDescription('location', ls)}</p>
                      <div className="actions">
                        <button className="btn-secondary" onClick={() => onOpenCompanion({ type: 'location', id: ls.locationId })}>
                          Открыть карточку
                        </button>
                        <button
                          className="btn-primary"
                          disabled={!canWrite || placement !== 'unplaced' || armed}
                          title={canWrite ? undefined : 'Размещение доступно в DM Edit'}
                          onClick={() => onPlaceExistingLocation(ls.id)}
                        >
                          {armed ? 'Кликните по карте…' : placement === 'unplaced' ? 'Разместить на текущей карте' : 'Уже размещено'}
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!showAllLocations && filteredLocations.length > LIST_CAP && (
              <button onClick={() => setShowAllLocations(true)}>
                Показать ещё ({filteredLocations.length - LIST_CAP})
              </button>
            )}
          </>
        )}
        {hierarchyLocations.length > 0 && (
          <div className="library-hierarchy-locations">
            <button className="btn-ghost btn-compact" onClick={() => setShowHierarchyLocations((v) => !v)}>
              {showHierarchyLocations
                ? 'Скрыть уровень выше'
                : `Показать уровень выше (${hierarchyLocations.length})`}
            </button>
            {showHierarchyLocations && (
              <ul className="route-list">
                {hierarchyLocations.map((ls) => (
                  <li key={ls.id} className="library-card-row">
                    <LibraryThumb type="location" entity={ls} images={images} />
                    <div className="library-card-body">
                      <strong>{ls.title}</strong>
                      {ls.type && <span className="entity-card-sub"> · {ls.type}</span>}
                      <span className="status-badge status-badge--time-gated"> Уровень карты</span>
                      <p className="muted">{resolveEntityShortDescription('location', ls)}</p>
                      <p className="muted library-hierarchy-note">
                        Это объект уровня карты (мир/регион/город), а не точка на текущей карте. Его нельзя
                        разместить как обычную локацию без явного переноса/локальной ссылки — это не реализовано
                        в этой версии. Доступен только просмотр карточки.
                      </p>
                      <div className="actions">
                        <button
                          className="btn-secondary"
                          onClick={() => {
                            if (onSelectLocationCard) onSelectLocationCard(ls.id);
                          }}
                        >
                          Открыть карточку
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
      )}

      {activeCategory === 'npc' && (
      <section className="card">
        <h3>NPC ({filteredNpcs.length})</h3>
        {filteredNpcs.length === 0 ? (
          <p className="muted">Ничего не найдено.</p>
        ) : (
          <>
            <ul className="route-list">
              {shownNpcs.map((n) => {
                const isLinked = !!n.location;
                const marker = npcMovableEntities.find((m) => m.entityId === n.id);
                const markerPlacement: 'not_placed' | 'placed_current_map' | 'placed_other_map' = !marker
                  ? 'not_placed'
                  : marker.currentMapId === currentMapId
                    ? 'placed_current_map'
                    : 'placed_other_map';
                const markerBadge =
                  markerPlacement === 'placed_current_map'
                    ? { label: 'Маркер на этой карте', cls: 'status-badge--active' }
                    : markerPlacement === 'placed_other_map'
                      ? { label: 'Маркер на другой карте', cls: 'status-badge--time-gated' }
                      : { label: 'Без маркера', cls: '' };
                const armed = placingNpcEntityId === n.id;
                return (
                  <li
                    key={n.id}
                    className="library-card-row"
                    draggable={canWrite}
                    onDragStart={() => canWrite && onDragStartCard('npc', n.id, n.name)}
                    onDragEnd={onDragEndCard}
                  >
                    <LibraryThumb type="npc" entity={n} images={images} />
                    <div className="library-card-body">
                      <strong>{n.name}</strong>
                      {n.role && <span className="entity-card-sub"> · {n.role}</span>}
                      <span className={`status-badge ${isLinked ? 'status-badge--player-visible' : ''}`}>
                        {' '}{isLinked ? 'Связано' : 'Не связано'}
                      </span>
                      <span className={`status-badge ${markerBadge.cls}`}> {markerBadge.label}</span>
                      <p className="muted">{resolveEntityShortDescription('npc', n)}</p>
                      <div className="actions">
                        <button className="btn-secondary" onClick={() => onOpenCompanion({ type: 'npc', id: n.id })}>
                          Открыть карточку
                        </button>
                        {canWrite && selectedLs && (
                          <button className="btn-primary" onClick={() => onLinkNpcToSelected(n.id)}>
                            Связать с «{selectedLs.title}»
                          </button>
                        )}
                        <button
                          className="btn-secondary"
                          disabled={!canWrite || armed}
                          title={canWrite ? undefined : 'Размещение доступно в DM Edit'}
                          onClick={() => onPlaceNpcOnMap(n.id)}
                        >
                          {armed ? 'Кликните по карте…' : markerPlacement === 'not_placed' ? 'Разместить на карте' : 'Переместить маркер сюда'}
                        </button>
                        {canWrite && (
                          <button className="btn-secondary" onClick={() => onEditNpc(n)}>
                            Редактировать карточку
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!showAllNpcs && filteredNpcs.length > LIST_CAP && (
              <button onClick={() => setShowAllNpcs(true)}>
                Показать ещё ({filteredNpcs.length - LIST_CAP})
              </button>
            )}
          </>
        )}
      </section>
      )}

      {activeCategory === 'taverns' && (
      <section className="card">
        <h3>Таверны ({filteredTaverns.length})</h3>
        {filteredTaverns.length === 0 ? (
          <p className="muted">Ничего не найдено.</p>
        ) : (
          <>
            <ul className="route-list">
              {shownTaverns.map((t) => {
                const sourceLs = locations.find((ls) => ls.sourceLibraryType === 'tavern' && ls.sourceLibraryId === t.id);
                const placed = !!sourceLs && hotspotPlacementState(sourceLs.id, hotspotsOnCurrentMap, allHotspots) === 'placed_current_map';
                const armed = placingLibraryEntity?.type === 'tavern' && placingLibraryEntity.sourceId === t.id;
                return (
                  <li
                    key={t.id}
                    className="library-card-row"
                    draggable={canWrite}
                    onDragStart={() => canWrite && onDragStartCard('tavern', t.id, t.name)}
                    onDragEnd={onDragEndCard}
                  >
                    <LibraryThumb type="tavern" entity={t} images={images} />
                    <div className="library-card-body">
                      <strong>{t.name}</strong>
                      {placed ? (
                        <span className="status-badge status-badge--active"> Размещено на карте</span>
                      ) : (
                        <span className="status-badge"> не размещено</span>
                      )}
                      <p className="muted">{resolveEntityShortDescription('tavern', t)}</p>
                      <div className="actions">
                        <button className="btn-secondary" onClick={() => onOpenCompanion({ type: 'tavern', id: t.id })}>
                          Открыть карточку
                        </button>
                        <button
                          className="btn-primary"
                          disabled={!canWrite || placed || armed}
                          title={canWrite ? undefined : 'Размещение доступно в DM Edit'}
                          onClick={() => onPlaceOnMap('tavern', t.id, t.name)}
                        >
                          {armed ? 'Кликните по карте…' : placed ? 'Уже размещено' : 'Разместить на карте'}
                        </button>
                        {canWrite && (
                          <button className="btn-secondary" onClick={() => onEditTavern(t)}>
                            Редактировать карточку
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!showAllTaverns && filteredTaverns.length > LIST_CAP && (
              <button onClick={() => setShowAllTaverns(true)}>
                Показать ещё ({filteredTaverns.length - LIST_CAP})
              </button>
            )}
          </>
        )}
      </section>
      )}

      {activeCategory === 'shops' && (
      <section className="card">
        <h3>Лавки ({filteredShops.length})</h3>
        {filteredShops.length === 0 ? (
          <p className="muted">Ничего не найдено.</p>
        ) : (
          <>
            <ul className="route-list">
              {shownShops.map((s) => {
                const sourceLs = locations.find((ls) => ls.sourceLibraryType === 'shop' && ls.sourceLibraryId === s.id);
                const placed = !!sourceLs && hotspotPlacementState(sourceLs.id, hotspotsOnCurrentMap, allHotspots) === 'placed_current_map';
                const armed = placingLibraryEntity?.type === 'shop' && placingLibraryEntity.sourceId === s.id;
                return (
                  <li
                    key={s.id}
                    className="library-card-row"
                    draggable={canWrite}
                    onDragStart={() => canWrite && onDragStartCard('shop', s.id, s.name)}
                    onDragEnd={onDragEndCard}
                  >
                    <LibraryThumb type="shop" entity={s} images={images} />
                    <div className="library-card-body">
                      <strong>{s.name}</strong>
                      {s.type && <span className="entity-card-sub"> · {s.type}</span>}
                      {placed ? (
                        <span className="status-badge status-badge--active"> Размещено на карте</span>
                      ) : (
                        <span className="status-badge"> не размещено</span>
                      )}
                      <p className="muted">{resolveEntityShortDescription('shop', s)}</p>
                      <div className="actions">
                        <button className="btn-secondary" onClick={() => onOpenCompanion({ type: 'shop', id: s.id })}>
                          Открыть карточку
                        </button>
                        <button
                          className="btn-primary"
                          disabled={!canWrite || placed || armed}
                          title={canWrite ? undefined : 'Размещение доступно в DM Edit'}
                          onClick={() => onPlaceOnMap('shop', s.id, s.name)}
                        >
                          {armed ? 'Кликните по карте…' : placed ? 'Уже размещено' : 'Разместить на карте'}
                        </button>
                        {canWrite && (
                          <button className="btn-secondary" onClick={() => onEditShop(s)}>
                            Редактировать карточку
                          </button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            {!showAllShops && filteredShops.length > LIST_CAP && (
              <button onClick={() => setShowAllShops(true)}>
                Показать ещё ({filteredShops.length - LIST_CAP})
              </button>
            )}
          </>
        )}
      </section>
      )}

      {activeCategory === 'quests' && (
      <LibraryReadOnlySection
        title="Квесты"
        items={quests}
        type="quest"
        images={images}
        search={search}
        matchesSearch={(q) => matchesSearch(q.title, q.description, q.goal)}
        getKey={(q) => q.id}
        getTitle={(q) => q.title}
        getSubtitle={(q) => q.status}
        onPlace={(q) => onPlaceContentEntity('quest', q.id)}
        isArmed={(q) => placingContentEntity?.type === 'quest' && placingContentEntity.sourceId === q.id}
        placementBadge={(q) => contentMarkerBadge('quest', q.id, contentMovableEntities, currentMapId)}
        onDragStart={(q) => onDragStartCard('quest', q.id, q.title)}
        onDragEnd={onDragEndCard}
        onOpen={(q) => onOpenCompanion({ type: 'quest', id: q.id })}
        canWrite={canWrite}
      />
      )}

      {activeCategory === 'enemies' && (
      <LibraryReadOnlySection
        title="Враги"
        items={enemies}
        type="enemy"
        images={images}
        search={search}
        matchesSearch={(e) => matchesSearch(e.name, e.role, e.faction)}
        getKey={(e) => e.id}
        getTitle={(e) => e.name}
        getSubtitle={(e) => e.role}
        onPlace={(e) => onPlaceContentEntity('enemy', e.id)}
        isArmed={(e) => placingContentEntity?.type === 'enemy' && placingContentEntity.sourceId === e.id}
        placementBadge={(e) => contentMarkerBadge('enemy', e.id, contentMovableEntities, currentMapId)}
        onDragStart={(e) => onDragStartCard('enemy', e.id, e.name)}
        onDragEnd={onDragEndCard}
        onOpen={(e) => onOpenCompanion({ type: 'enemy', id: e.id })}
        canWrite={canWrite}
      />
      )}

      {activeCategory === 'battleEntries' && (
      <LibraryReadOnlySection
        title="Боевые сцены"
        items={battleEntries}
        type="battleEntry"
        images={images}
        battleMaps={battleMaps}
        search={search}
        matchesSearch={(be) => matchesSearch(be.name, be.description)}
        getKey={(be) => be.id}
        getTitle={(be) => be.name}
        getSubtitle={(be) => be.status}
        onEdit={onEditBattleEntry}
        onPlace={(be) => onPlaceBattleEntry(be.id)}
        isArmed={(be) => placingBattleEntryId === be.id}
        placementBadge={(be) =>
          currentMapId && be.sourceMapId === currentMapId
            ? { label: 'На этой карте', cls: 'status-badge--active' }
            : be.sourceMapId
              ? { label: 'На другой карте', cls: 'status-badge--time-gated' }
              : { label: 'Не размещено', cls: '' }
        }
        onDragStart={(be) => onDragStartCard('battleEntry', be.id, be.name)}
        onDragEnd={onDragEndCard}
        canWrite={canWrite}
      />
      )}

      {activeCategory === 'images' && (
      <LibraryReadOnlySection
        title="Изображения"
        items={images}
        type="image"
        images={images}
        search={search}
        matchesSearch={(img) => matchesSearch(img.title, img.type)}
        getKey={(img) => img.id}
        getTitle={(img) => img.title}
        getSubtitle={(img) => img.type}
        onEdit={onEditImage}
        onPlace={(img) => onPlaceContentEntity('image', img.id)}
        isArmed={(img) => placingContentEntity?.type === 'image' && placingContentEntity.sourceId === img.id}
        placementBadge={(img) => contentMarkerBadge('image', img.id, contentMovableEntities, currentMapId)}
        onDragStart={(img) => onDragStartCard('image', img.id, img.title)}
        onDragEnd={onDragEndCard}
        onOpen={(img) => onOpenCompanion({ type: 'image', id: img.id })}
        canWrite={canWrite}
      />
      )}
    </div>
  );
}

/** Stage 6C.3A — generic read-only section for entity types that don't have
 * a placement/linking action implemented yet (Квесты/Враги/Боевые сцены/
 * Изображения). Shares search + the 30-card cap + LibraryThumb/description
 * resolvers with the placeable sections above, but the action button is
 * always disabled with an explicit reason rather than silently doing
 * nothing — per Stage 6C.3A scope, placement for these types is next-stage
 * work (Stage 6C.4B), not implemented here. */
/** Stage 6C.4E — placement-state badge for a Quest/Enemy/Image Library row,
 * mirroring the NPC section's existing markerBadge computation above. */
function contentMarkerBadge(
  type: 'quest' | 'enemy' | 'image',
  sourceId: string,
  contentMovableEntities: MovableEntity[],
  currentMapId: string | undefined,
): { label: string; cls: string } {
  const marker = contentMovableEntities.find((m) => m.entityType === type && m.entityId === sourceId);
  if (!marker) return { label: 'Не размещено', cls: '' };
  if (currentMapId && marker.currentMapId === currentMapId) {
    return { label: 'Маркер на этой карте', cls: 'status-badge--active' };
  }
  return { label: 'Маркер на другой карте', cls: 'status-badge--time-gated' };
}

function LibraryReadOnlySection<T>({
  title,
  items,
  type,
  images,
  battleMaps,
  search,
  matchesSearch,
  getKey,
  getTitle,
  getSubtitle,
  onEdit,
  onPlace,
  isArmed,
  placementBadge,
  onDragStart,
  onDragEnd,
  onOpen,
  canWrite,
}: {
  title: string;
  items: T[];
  type: LibrarySourceType;
  images: DmImageItem[];
  battleMaps?: BattleMapManifestEntry[];
  search: string;
  matchesSearch: (item: T) => boolean;
  getKey: (item: T) => string;
  getTitle: (item: T) => string;
  getSubtitle: (item: T) => string | undefined;
  /** Stage 6C.4D — when provided, an additional "Редактировать карточку"
   * button is shown next to the (still-disabled) placement button; types
   * with no override slot (Квесты/Враги) simply don't pass this. */
  onEdit?: (item: T) => void;
  /** Stage 6C.4E — when provided (Квесты/Враги/Изображения now support
   * placement, Боевые сцены use the separate "Новая боевая сцена"/picker
   * flow instead), shows a "Разместить на карте" button using the same
   * arm-then-click pattern as the NPC section, plus a placement-state
   * badge. Types with truly no placement model (none left after Stage
   * 6C.4E) would simply not pass this and keep the disabled button. */
  onPlace?: (item: T) => void;
  isArmed?: (item: T) => boolean;
  placementBadge?: (item: T) => { label: string; cls: string };
  /** Stage 6C.4F — when provided, makes each row draggable (Квесты/Враги/
   * Боевые сцены/Изображения all support drag-and-drop, same as the four
   * hand-rolled Library sections above). */
  onDragStart?: (item: T) => void;
  onDragEnd?: () => void;
  /** Stage 6C.5 Phase 2G — when provided, shows "Открыть карточку" (opens
   * the embedded companion window — a placeholder for quest/enemy/image
   * today, since those types have no real card yet, but still a real
   * read action, never a no-op). */
  onOpen?: (item: T) => void;
  canWrite?: boolean;
}) {
  const LIST_CAP = 30;
  const [showAll, setShowAll] = useState(false);
  const filtered = search.trim() ? items.filter(matchesSearch) : items;
  const shown = showAll ? filtered : filtered.slice(0, LIST_CAP);
  return (
    <section className="card">
      <h3>{title} ({filtered.length})</h3>
      {filtered.length === 0 ? (
        <p className="muted">Ничего не найдено.</p>
      ) : (
        <>
          <ul className="route-list">
            {shown.map((item) => {
              const armed = isArmed?.(item) ?? false;
              const badge = placementBadge?.(item);
              return (
                <li
                  key={getKey(item)}
                  className="library-card-row"
                  draggable={canWrite !== false && !!onDragStart}
                  onDragStart={onDragStart && canWrite !== false ? () => onDragStart(item) : undefined}
                  onDragEnd={onDragEnd}
                >
                  <LibraryThumb type={type} entity={item} images={images} battleMaps={battleMaps} />
                  <div className="library-card-body">
                    <strong>{getTitle(item)}</strong>
                    {getSubtitle(item) && <span className="entity-card-sub"> · {getSubtitle(item)}</span>}
                    {badge && <span className={`status-badge ${badge.cls}`}> {badge.label}</span>}
                    <p className="muted">{resolveEntityShortDescription(type, item)}</p>
                    <div className="actions">
                      {onOpen && (
                        <button className="btn-secondary" onClick={() => onOpen(item)}>
                          Открыть карточку
                        </button>
                      )}
                      {onPlace ? (
                        <button
                          className="btn-secondary"
                          disabled={canWrite === false || armed}
                          title={canWrite === false ? 'Размещение доступно в DM Edit' : undefined}
                          onClick={() => onPlace(item)}
                        >
                          {armed ? 'Кликните по карте…' : 'Разместить на карте'}
                        </button>
                      ) : (
                        <button className="btn-secondary" disabled title="Размещение этого типа пока не реализовано">
                          Размещение пока не реализовано
                        </button>
                      )}
                      {onEdit && canWrite !== false && (
                        <button className="btn-secondary" onClick={() => onEdit(item)}>
                          Редактировать карточку
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          {!showAll && filtered.length > LIST_CAP && (
            <button onClick={() => setShowAll(true)}>Показать ещё ({filtered.length - LIST_CAP})</button>
          )}
        </>
      )}
    </section>
  );
}

function LocationLinksTab({
  ls,
  npcs,
  quests,
  enemies,
  images,
  battleMaps,
  draft,
  onStartEdit,
  onToggle,
  onSave,
  onCancel,
  npcCreateDraft,
  onStartNpcCreate,
  onNpcCreateChange,
  onSaveNpcCreate,
  onCancelNpcCreate,
}: {
  ls: LocationState;
  npcs: { id: string; name: string; role?: string; faction?: string; location?: string }[];
  quests: { id: string; title: string }[];
  enemies: { id: string; name: string }[];
  images: { id: string; title: string }[];
  battleMaps: { id: string; title: string }[];
  draft: Record<string, string[]> | null;
  onStartEdit: () => void;
  onToggle: (field: 'npcIds' | 'questIds' | 'enemyIds' | 'imageIds' | 'battleMapIds', id: string) => void;
  onSave: () => void;
  onCancel: () => void;
  npcCreateDraft: {
    name: string;
    role: string;
    faction: string;
    publicDescription: string;
    dmNotes: string;
    visibleToPlayers: boolean;
  } | null;
  onStartNpcCreate: () => void;
  onNpcCreateChange: (patch: Partial<{ name: string; role: string; faction: string; publicDescription: string; dmNotes: string; visibleToPlayers: boolean }>) => void;
  onSaveNpcCreate: () => void;
  onCancelNpcCreate: () => void;
}) {
  const npcCreateForm = npcCreateDraft && (
    <div className="route-draft-form">
      <strong>Создать NPC здесь — «{ls.title}»</strong>
      <label>
        Имя (обязательно)
        <input
          type="text"
          value={npcCreateDraft.name}
          onChange={(e) => onNpcCreateChange({ name: e.target.value })}
        />
      </label>
      <label>
        Роль
        <input
          type="text"
          value={npcCreateDraft.role}
          onChange={(e) => onNpcCreateChange({ role: e.target.value })}
        />
      </label>
      <label>
        Фракция
        <input
          type="text"
          value={npcCreateDraft.faction}
          onChange={(e) => onNpcCreateChange({ faction: e.target.value })}
        />
      </label>
      <label>
        Публичное описание (Player Safe)
        <textarea
          value={npcCreateDraft.publicDescription}
          onChange={(e) => onNpcCreateChange({ publicDescription: e.target.value })}
        />
      </label>
      <label>
        Заметки ДМ (что знает / чего хочет / отношение к партии / доступность — никогда не видно игрокам)
        <textarea
          value={npcCreateDraft.dmNotes}
          onChange={(e) => onNpcCreateChange({ dmNotes: e.target.value })}
        />
      </label>
      <label className="reveal-toggle">
        <input
          type="checkbox"
          checked={npcCreateDraft.visibleToPlayers}
          onChange={(e) => onNpcCreateChange({ visibleToPlayers: e.target.checked })}
        />
        Видим игрокам
      </label>
      <div className="actions">
        <button className="btn-primary" onClick={onSaveNpcCreate}>Сохранить NPC</button>
        <button className="btn-ghost" onClick={onCancelNpcCreate}>Отмена</button>
      </div>
    </div>
  );

  if (!draft) {
    return (
      <div className="side-panel-content">
        <h2 className="side-panel-title">Связи</h2>
        <div className="actions">
          <button onClick={onStartEdit}>Редактировать связи</button>
          {!npcCreateDraft && <button onClick={onStartNpcCreate}>Создать NPC здесь</button>}
        </div>
        {npcCreateForm}
      </div>
    );
  }

  return (
    <div className="side-panel-content">
      <h2 className="side-panel-title">Связи: {ls.title}</h2>
      <div className="form-grid">
        <div className="form-row">
          <label>NPC</label>
          <CheckboxList
            items={npcs}
            selectedIds={draft.npcIds}
            onToggle={(id) => onToggle('npcIds', id)}
            labelOf={(i) => {
              const n = npcs.find((x) => x.id === i.id);
              if (!n) return i.id;
              // Role/faction folded into the label so CheckboxList's built-in
              // filter input (Stage 6B.2) can search by them too, not just name.
              return [n.name, n.role, n.faction].filter(Boolean).join(' · ');
            }}
          />
        </div>
        <div className="form-row">
          <label>Квесты</label>
          <CheckboxList
            items={quests}
            selectedIds={draft.questIds}
            onToggle={(id) => onToggle('questIds', id)}
            labelOf={(i) => quests.find((q) => q.id === i.id)?.title ?? i.id}
          />
        </div>
        <div className="form-row">
          <label>Враги</label>
          <CheckboxList
            items={enemies}
            selectedIds={draft.enemyIds}
            onToggle={(id) => onToggle('enemyIds', id)}
            labelOf={(i) => enemies.find((e) => e.id === i.id)?.name ?? i.id}
          />
        </div>
        <div className="form-row">
          <label>Изображения</label>
          <CheckboxList
            items={images}
            selectedIds={draft.imageIds}
            onToggle={(id) => onToggle('imageIds', id)}
            labelOf={(i) => images.find((im) => im.id === i.id)?.title ?? i.id}
          />
        </div>
        <div className="form-row">
          <label>Боевая карта</label>
          <CheckboxList
            items={battleMaps}
            selectedIds={draft.battleMapIds}
            onToggle={(id) => onToggle('battleMapIds', id)}
            labelOf={(i) => battleMaps.find((b) => b.id === i.id)?.title ?? i.id}
          />
        </div>
        <div className="actions">
          <button onClick={onSave}>Сохранить</button>
          <button onClick={onCancel}>Отмена</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Stage 6C.5 Phase 2D — renders the rich DM Companion source fields for a
 * location (atmosphere/lore/playerView/rumors/quickScenes/region/aliases)
 * that `LocationState`/`LocationSidePanel` never carried — `buildLocationStates`
 * (src/data/loadCampaignData.ts) only copies `title`/`publicDescription`/
 * `dmNotes`/`tags` into `LocationState`, dropping the rest. `DmLocation`
 * (the raw `data.locations` record) already HAS all these fields typed —
 * this component is purely a missing READ surface, not a new data source.
 * Renders inside the object window's "Обзор" section, ABOVE the existing
 * `LocationSidePanel` content (kept fully intact below it).
 */
/** Stage 6C.5 Phase 2G — every companion card's "linked X" row used to
 * render as plain joined text (`names.join(', ')`), a dead end with no
 * way to actually open the linked entity. This renders the same list as
 * individually clickable chips that call `onOpen`, shared across every
 * companion card so the click behavior/styling stays consistent. */
function CompanionLinkRow({
  items,
  onOpen,
}: {
  items: { id: string; label: string }[];
  onOpen: (id: string) => void;
}) {
  return (
    <div className="companion-link-row">
      {items.map((item) => (
        <button key={item.id} type="button" className="companion-link-chip" onClick={() => onOpen(item.id)}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

function CompanionLocationCard({
  loc,
  npcs,
  quests,
  onOpenNpc,
  onOpenQuest,
}: {
  loc: DmLocation;
  npcs: { id: string; name: string }[];
  quests: { id: string; title: string }[];
  onOpenNpc?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
}) {
  const npcItems = loc.npcs.map((id) => ({ id, label: npcs.find((n) => n.id === id)?.name ?? id }));
  const questItems = loc.quests.map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));
  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{loc.name}</h3>
        <span className="muted">
          {loc.type}
          {loc.region ? ` · ${loc.region}` : ''}
        </span>
      </div>
      <p>{loc.description}</p>
      {loc.atmosphere && (
        <>
          <h4>Атмосфера</h4>
          <p>{loc.atmosphere}</p>
        </>
      )}
      {loc.lore && (
        <>
          <h4>Лор</h4>
          <p>{loc.lore}</p>
        </>
      )}
      {loc.playerView && (
        <>
          <h4>Что видят игроки</h4>
          <p>{loc.playerView}</p>
        </>
      )}
      {!!loc.rumors?.length && (
        <>
          <h4>Слухи</h4>
          <ul>
            {loc.rumors.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {!!loc.quickScenes?.length && (
        <>
          <h4>Быстрые сцены</h4>
          <ul>
            {loc.quickScenes.map((s, i) => (
              <li key={i}>
                <strong>{s.title}</strong> — {s.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!npcItems.length && (
        <>
          <h4>NPC здесь</h4>
          {onOpenNpc ? <CompanionLinkRow items={npcItems} onOpen={onOpenNpc} /> : <p>{npcItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!questItems.length && (
        <>
          <h4>Квесты здесь</h4>
          {onOpenQuest ? <CompanionLinkRow items={questItems} onOpen={onOpenQuest} /> : <p>{questItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {(loc.dmSecrets || loc.notes) && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          {loc.dmSecrets && <p>{loc.dmSecrets}</p>}
          {loc.notes && <p className="muted">{loc.notes}</p>}
        </>
      )}
    </div>
  );
}

/** Stage 6C.5 Phase 2F — ported field list/order from DM Companion's own
 * `pages/taverns/TavernDetailPage.tsx` (tags → description → atmosphere →
 * location → owner → staff → menu → rooms → services → linked NPC/quests →
 * images → rumors → DM notes), recreated here rather than copy-pasted
 * because the original component is coupled to DM Companion's own
 * `useAppData()`/router context. Deliberately skips DM Companion's
 * `PurchaseCart` (a buy/cart UI) per this stage's explicit scope — menu/
 * room items render as plain readable rows (name/price/description)
 * instead, which is sufficient for "readable during session" without
 * building a new transaction system. */
function CompanionTavernCard({
  tavern,
  npcs,
  quests,
  images,
  onOpenNpc,
  onOpenQuest,
}: {
  tavern: DmTavern;
  npcs: { id: string; name: string }[];
  quests: { id: string; title: string }[];
  images: DmImageItem[];
  onOpenNpc?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
}) {
  const owner = tavern.ownerNpcId ? npcs.find((n) => n.id === tavern.ownerNpcId) : undefined;
  const staffItems = (tavern.staff ?? []).map((id) => ({ id, label: npcs.find((n) => n.id === id)?.name ?? id }));
  const relatedNpcItems = (tavern.relatedNpcs ?? []).map((id) => ({ id, label: npcs.find((n) => n.id === id)?.name ?? id }));
  const relatedQuestItems = (tavern.relatedQuests ?? []).map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));
  const hero = resolveEntityPreviewImage('tavern', tavern, images);
  const galleryImages = (tavern.relatedImages ?? [])
    .map((id) => images.find((i) => i.id === id))
    .filter((i): i is DmImageItem => !!i);

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{tavern.name}</h3>
        <span className="muted">Таверна{tavern.tags?.length ? ` · ${tavern.tags.join(', ')}` : ''}</span>
      </div>
      {hero && (
        <img className="companion-source-hero" src={hero.src} alt={tavern.name} />
      )}
      <p>{tavern.description}</p>
      {tavern.atmosphere && (
        <>
          <h4>Атмосфера</h4>
          <p>{tavern.atmosphere}</p>
        </>
      )}
      {(owner || tavern.ownerName) && (
        <>
          <h4>Владелец</h4>
          {owner && onOpenNpc ? (
            <CompanionLinkRow items={[{ id: owner.id, label: owner.name }]} onOpen={onOpenNpc} />
          ) : (
            <p>{owner?.name ?? tavern.ownerName}</p>
          )}
        </>
      )}
      {!!staffItems.length && (
        <>
          <h4>Персонал</h4>
          {onOpenNpc ? <CompanionLinkRow items={staffItems} onOpen={onOpenNpc} /> : <p>{staffItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!tavern.menu?.length && (
        <>
          <h4>Меню</h4>
          <ul className="companion-item-list">
            {tavern.menu.map((item, i) => (
              <li key={i}>
                <strong>{item.name}</strong>
                {item.price ? ` — ${item.price}` : ''}
                {item.description ? <span className="muted"> · {item.description}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!tavern.rooms?.length && (
        <>
          <h4>Комнаты</h4>
          <ul className="companion-item-list">
            {tavern.rooms.map((room, i) => (
              <li key={i}>
                <strong>{room.name}</strong>
                {room.price ? ` — ${room.price}` : ''}
                {room.description ? <span className="muted"> · {room.description}</span> : null}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!tavern.services?.length && (
        <>
          <h4>Услуги</h4>
          <ul>
            {tavern.services.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {!!relatedNpcItems.length && (
        <>
          <h4>Связанные NPC</h4>
          {onOpenNpc ? <CompanionLinkRow items={relatedNpcItems} onOpen={onOpenNpc} /> : <p>{relatedNpcItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!relatedQuestItems.length && (
        <>
          <h4>Связанные квесты</h4>
          {onOpenQuest ? <CompanionLinkRow items={relatedQuestItems} onOpen={onOpenQuest} /> : <p>{relatedQuestItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!galleryImages.length && (
        <>
          <h4>Изображения</h4>
          <div className="companion-image-gallery">
            {galleryImages.map((img) => (
              <img key={img.id} src={img.thumbnailSrc ?? img.src} alt={img.title} />
            ))}
          </div>
        </>
      )}
      {!!tavern.rumors?.length && (
        <>
          <h4>Слухи</h4>
          <ul>
            {tavern.rumors.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {tavern.notes && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          <p className="muted">{tavern.notes}</p>
        </>
      )}
    </div>
  );
}

/** Stage 6C.5 Phase 2F — same porting approach as `CompanionTavernCard`,
 * mirroring DM Companion's `pages/shops/ShopDetailPage.tsx` order (tags →
 * image → description → relation to players → discounts → rumors →
 * location → owner → services → goods → DM notes). Goods are grouped by
 * `item.category` (DM Companion only puts the category in the item's meta
 * string; grouping headers here is an explicit, in-scope readability
 * improvement requested for this stage, not a deviation from the source
 * data). No buy/cart UI, same reasoning as the tavern card. */
function CompanionShopCard({
  shop,
  npcs,
  images,
  onOpenNpc,
}: {
  shop: DmShop;
  npcs: { id: string; name: string }[];
  images: DmImageItem[];
  onOpenNpc?: (id: string) => void;
}) {
  const owner = shop.ownerNpcId ? npcs.find((n) => n.id === shop.ownerNpcId) : undefined;
  const hero = resolveEntityPreviewImage('shop', shop, images);
  const itemsByCategory = new Map<string, typeof shop.items>();
  for (const item of shop.items ?? []) {
    const cat = item.category ?? 'Прочее';
    const list = itemsByCategory.get(cat) ?? [];
    list.push(item);
    itemsByCategory.set(cat, list);
  }

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{shop.name}</h3>
        <span className="muted">
          {shop.type ?? 'Лавка'}
          {shop.tags?.length ? ` · ${shop.tags.join(', ')}` : ''}
        </span>
      </div>
      {hero && <img className="companion-source-hero" src={hero.src} alt={shop.name} />}
      <p>{shop.description}</p>
      {shop.relationToPlayers && (
        <>
          <h4>Отношение к игрокам</h4>
          <p>{shop.relationToPlayers}</p>
        </>
      )}
      {shop.discounts && (
        <>
          <h4>Скидки</h4>
          <p>{shop.discounts}</p>
        </>
      )}
      {!!shop.rumors?.length && (
        <>
          <h4>Слухи</h4>
          <ul>
            {shop.rumors.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </>
      )}
      {owner && (
        <>
          <h4>Владелец</h4>
          {onOpenNpc ? (
            <CompanionLinkRow items={[{ id: owner.id, label: owner.name }]} onOpen={onOpenNpc} />
          ) : (
            <p>{owner.name}</p>
          )}
        </>
      )}
      {!!shop.services?.length && (
        <>
          <h4>Услуги</h4>
          <ul>
            {shop.services.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {itemsByCategory.size > 0 && (
        <>
          <h4>Товары</h4>
          {Array.from(itemsByCategory.entries()).map(([cat, items]) => (
            <div key={cat} className="companion-goods-category">
              <strong className="muted">{cat}</strong>
              <ul className="companion-item-list">
                {(items ?? []).map((item) => (
                  <li key={item.id}>
                    <strong>{item.name}</strong>
                    {item.price !== undefined && item.price !== '' ? ` — ${item.price}${item.currency ? ` ${item.currency}` : ''}` : ''}
                    {item.description ? <span className="muted"> · {item.description}</span> : null}
                    {item.availability ? <span className="muted"> ({item.availability})</span> : null}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </>
      )}
      {shop.notes && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          <p className="muted">{shop.notes}</p>
        </>
      )}
    </div>
  );
}

/** Stage 6C.5 Phase 2G — ported field order from DM Companion's real
 * `pages/npcs/NpcDetailPage.tsx`: tags/shop badge → race → role → hero
 * image → gallery → location link → shop link → personality →
 * speechStyle → goals → knowledge → secrets (DM-only) → related quests
 * → notes (DM-only). Faction badges are intentionally skipped — Campaign
 * Map has no faction-context equivalent to DM Companion's
 * `useFactions()`/`useArcContext()`, and adding one is out of scope here. */
function CompanionNpcCard({
  npc,
  locationName,
  shop,
  quests,
  images,
  onOpenQuest,
  onOpenShop,
}: {
  npc: DmNpc;
  locationName?: string;
  shop?: { id: string; name: string };
  quests: { id: string; title: string }[];
  images: DmImageItem[];
  onOpenQuest?: (id: string) => void;
  onOpenShop?: (id: string) => void;
}) {
  const heroImg = images.find((i) => i.id === npc.image);
  const hero = heroImg ?? resolveEntityPreviewImage('npc', npc, images);
  const galleryImages = images.filter((i) => i.relatedEntity === npc.id && i.id !== heroImg?.id);
  const questItems = (npc.relatedQuests ?? []).map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{npc.name}</h3>
        <span className="muted">
          {shop ? 'Торговец' : ''}
          {npc.tags?.length ? `${shop ? ' · ' : ''}${npc.tags.join(', ')}` : ''}
        </span>
      </div>
      {hero && <img className="companion-source-hero" src={hero.src} alt={npc.name} />}
      {npc.race && (
        <>
          <h4>Раса</h4>
          <p>{npc.race}</p>
        </>
      )}
      {npc.role && (
        <>
          <h4>Роль</h4>
          <p>{npc.role}</p>
        </>
      )}
      {locationName && (
        <>
          <h4>Локация</h4>
          <p>{locationName}</p>
        </>
      )}
      {shop && (
        <>
          <h4>Магазин</h4>
          {onOpenShop ? <CompanionLinkRow items={[{ id: shop.id, label: shop.name }]} onOpen={onOpenShop} /> : <p>{shop.name}</p>}
        </>
      )}
      {npc.personality && (
        <>
          <h4>Характер</h4>
          <p>{npc.personality}</p>
        </>
      )}
      {npc.speechStyle && (
        <>
          <h4>Манера речи</h4>
          <p>{npc.speechStyle}</p>
        </>
      )}
      {npc.goals && (
        <>
          <h4>Цели</h4>
          <p>{npc.goals}</p>
        </>
      )}
      {npc.knowledge && (
        <>
          <h4>Знания</h4>
          <p>{npc.knowledge}</p>
        </>
      )}
      {npc.secrets && (
        <>
          <h4>Секреты (DM-ONLY)</h4>
          <p>{npc.secrets}</p>
        </>
      )}
      {!!questItems.length && (
        <>
          <h4>Связанные квесты</h4>
          {onOpenQuest ? <CompanionLinkRow items={questItems} onOpen={onOpenQuest} /> : <p>{questItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {!!galleryImages.length && (
        <>
          <h4>Изображения</h4>
          <div className="companion-image-gallery">
            {galleryImages.map((img) => (
              <img key={img.id} src={img.thumbnailSrc ?? img.src} alt={img.title} />
            ))}
          </div>
        </>
      )}
      {(npc.notes || npc.dmNotes) && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          {npc.notes && <p className="muted">{npc.notes}</p>}
          {npc.dmNotes && <p className="muted">{npc.dmNotes}</p>}
        </>
      )}
    </div>
  );
}

/** Stage 6C.5 Phase 2H — ported field order from DM Companion's real
 * `pages/quests/QuestDetailPage.tsx`: status/tags → hero image → location
 * → giver → goal → description → linked enemies → reward → proof →
 * solutions → consequences → notes. Quest editing intentionally stays
 * out of scope (no `QuestDataTab`/override-patch mechanism exists for
 * quests yet, unlike Location/Tavern/Shop/NPC/Image) — the explicit
 * deferred-editing message is shown instead of a non-functional button. */
function CompanionQuestCard({
  quest,
  npcs,
  enemies,
  images,
  locationName,
  onOpenNpc,
  onOpenLocation,
  onOpenEnemy,
}: {
  quest: DmQuest;
  npcs: { id: string; name: string }[];
  enemies: { id: string; name: string }[];
  images: DmImageItem[];
  locationName?: string;
  onOpenNpc?: (id: string) => void;
  onOpenLocation?: (id: string) => void;
  onOpenEnemy?: (id: string) => void;
}) {
  const hero = resolveEntityPreviewImage('quest', quest, images);
  const giver = quest.giver ? npcs.find((n) => n.id === quest.giver) : undefined;
  const enemyItems = (quest.enemies ?? []).map((id) => ({ id, label: enemies.find((e) => e.id === id)?.name ?? id }));

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{quest.title}</h3>
        <span className="muted">
          {QUEST_STATUS_LABELS[quest.status]}
          {quest.tags?.length ? ` · ${quest.tags.join(', ')}` : ''}
        </span>
      </div>
      {hero && <img className="companion-source-hero" src={hero.src} alt={quest.title} />}
      {locationName && (
        <>
          <h4>Локация</h4>
          {onOpenLocation ? (
            <CompanionLinkRow items={[{ id: quest.location, label: locationName }]} onOpen={onOpenLocation} />
          ) : (
            <p>{locationName}</p>
          )}
        </>
      )}
      {giver && (
        <>
          <h4>Квестодатель</h4>
          {onOpenNpc ? <CompanionLinkRow items={[{ id: giver.id, label: giver.name }]} onOpen={onOpenNpc} /> : <p>{giver.name}</p>}
        </>
      )}
      {quest.goal && (
        <>
          <h4>Цель</h4>
          <p>{quest.goal}</p>
        </>
      )}
      {quest.description && (
        <>
          <h4>Описание</h4>
          <p>{quest.description}</p>
        </>
      )}
      {!!enemyItems.length && (
        <>
          <h4>Враги</h4>
          {onOpenEnemy ? <CompanionLinkRow items={enemyItems} onOpen={onOpenEnemy} /> : <p>{enemyItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {quest.reward && (
        <>
          <h4>Награда</h4>
          <p>{quest.reward}</p>
        </>
      )}
      {quest.proof && (
        <>
          <h4>Подтверждение выполнения</h4>
          <p>{quest.proof}</p>
        </>
      )}
      {!!quest.solutions?.length && (
        <>
          <h4>Варианты решения</h4>
          <ul>
            {quest.solutions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </>
      )}
      {quest.consequences && (
        <>
          <h4>Последствия</h4>
          <p>{quest.consequences}</p>
        </>
      )}
      {quest.notes && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          <p className="muted">{quest.notes}</p>
        </>
      )}
      <p className="muted companion-readonly-note">
        Редактирование квестов будет добавлено отдельным этапом. Сейчас используется исходная карточка DM Companion.
      </p>
    </div>
  );
}

/** Stage 6C.5 Phase 2H — ported field order from DM Companion's real
 * `pages/enemies/EnemyDetailPage.tsx`: base monster/CR/XP tags → hero
 * image → AC/HP/speed → ability scores → attacks → features → reactions
 * → legendary actions → source → senses/languages → role/faction → lore
 * → tactics → linked locations/quests → DM notes. Stats/tactics/DM notes
 * are rendered unconditionally here because this component is only ever
 * reached through `isDmMode`-gated entry points (the embedded companion
 * window itself, and every Library/right-panel/linked-row opener) —
 * same convention already established for `CompanionLocationCard`'s
 * DM-only block. Enemy editing stays read-only for the same reason as
 * quests: no override-patch mechanism exists for enemies yet. */
function CompanionEnemyCard({
  enemy,
  locations,
  quests,
  images,
  onOpenLocation,
  onOpenQuest,
}: {
  enemy: DmCustomEnemy;
  locations: { id: string; name: string }[];
  quests: { id: string; title: string }[];
  images: DmImageItem[];
  onOpenLocation?: (id: string) => void;
  onOpenQuest?: (id: string) => void;
}) {
  const hero = resolveEntityPreviewImage('enemy', enemy, images);
  const locationItems = (enemy.locationIds ?? []).map((id) => ({ id, label: locations.find((l) => l.id === id)?.name ?? id }));
  const questItems = (enemy.questIds ?? []).map((id) => ({ id, label: quests.find((q) => q.id === id)?.title ?? id }));
  const abilityLabels: Record<string, string> = { str: 'СИЛ', dex: 'ЛОВ', con: 'ТЕЛ', int: 'ИНТ', wis: 'МДР', cha: 'ХАР' };

  return (
    <div className="companion-source-card">
      <div className="companion-source-header">
        <h3>{enemy.name}</h3>
        <span className="muted">
          {enemy.baseMonsterName ? `Base: ${enemy.baseMonsterName} · ` : ''}
          {enemy.cr ? `CR ${enemy.cr}` : ''}
          {enemy.xp !== undefined ? ` · ${enemy.xp} XP` : ''}
          {enemy.tags?.length ? ` · ${enemy.tags.join(', ')}` : ''}
        </span>
      </div>
      {hero && <img className="companion-source-hero" src={hero.src} alt={enemy.name} />}
      <div className="companion-enemy-stats">
        {enemy.ac !== undefined && (
          <div className="companion-enemy-stat">
            <span className="muted">AC</span>
            <strong>{enemy.ac}</strong>
          </div>
        )}
        {enemy.hp !== undefined && (
          <div className="companion-enemy-stat">
            <span className="muted">HP</span>
            <strong>{enemy.hp}</strong>
          </div>
        )}
        {enemy.speed && (
          <div className="companion-enemy-stat">
            <span className="muted">Скорость</span>
            <strong>{enemy.speed}</strong>
          </div>
        )}
      </div>
      {enemy.abilityScores && (
        <div className="companion-enemy-stats">
          {Object.entries(enemy.abilityScores).map(([key, value]) => (
            <div key={key} className="companion-enemy-stat">
              <span className="muted">{abilityLabels[key] ?? key.toUpperCase()}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      {!!enemy.attacks?.length && (
        <>
          <h4>Атаки</h4>
          <ul className="companion-item-list">
            {enemy.attacks.map((a, i) => (
              <li key={i}>
                <strong>{a.name}.</strong>
                {a.toHit ? ` Атака ${a.toHit},` : ''}
                {a.range ? ` ${a.range},` : ''}
                {a.damage ? ` урон ${a.damage}.` : ''}
                {a.description ? ` ${a.description}` : ''}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!enemy.features?.length && (
        <>
          <h4>Способности</h4>
          <ul className="companion-item-list">
            {enemy.features.map((f, i) => (
              <li key={i}>
                <strong>{f.name}.</strong> {f.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!enemy.reactions?.length && (
        <>
          <h4>Реакции</h4>
          <ul className="companion-item-list">
            {enemy.reactions.map((r, i) => (
              <li key={i}>
                <strong>{r.name}.</strong> {r.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {!!enemy.legendaryActions?.length && (
        <>
          <h4>Легендарные действия</h4>
          <ul className="companion-item-list">
            {enemy.legendaryActions.map((a, i) => (
              <li key={i}>
                <strong>{a.name}.</strong> {a.description}
              </li>
            ))}
          </ul>
        </>
      )}
      {(enemy.senses || enemy.languages) && (
        <>
          {enemy.senses && (
            <>
              <h4>Чувства</h4>
              <p>{enemy.senses}</p>
            </>
          )}
          {enemy.languages && (
            <>
              <h4>Языки</h4>
              <p>{enemy.languages}</p>
            </>
          )}
        </>
      )}
      {enemy.role && (
        <>
          <h4>Роль</h4>
          <p>{enemy.role}</p>
        </>
      )}
      {enemy.faction && (
        <>
          <h4>Фракция</h4>
          <p>{enemy.faction}</p>
        </>
      )}
      {enemy.lore && (
        <>
          <h4>Лор</h4>
          <p>{enemy.lore}</p>
        </>
      )}
      {enemy.tactics && (
        <>
          <h4>Тактика (DM-ONLY)</h4>
          <p>{enemy.tactics}</p>
        </>
      )}
      {!!locationItems.length && (
        <>
          <h4>Локации</h4>
          {onOpenLocation ? (
            <CompanionLinkRow items={locationItems} onOpen={onOpenLocation} />
          ) : (
            <p>{locationItems.map((i) => i.label).join(', ')}</p>
          )}
        </>
      )}
      {!!questItems.length && (
        <>
          <h4>Связанные квесты</h4>
          {onOpenQuest ? <CompanionLinkRow items={questItems} onOpen={onOpenQuest} /> : <p>{questItems.map((i) => i.label).join(', ')}</p>}
        </>
      )}
      {enemy.dmNotes && (
        <>
          <h4>Заметки мастера (DM-ONLY)</h4>
          <p className="muted">{enemy.dmNotes}</p>
        </>
      )}
      <p className="muted companion-readonly-note">
        Редактирование врагов будет добавлено отдельным этапом. Сейчас используется исходная карточка DM Companion.
      </p>
    </div>
  );
}

/** Stage 6C.5 Phase 2G — the new navigable entry point for opening a
 * companion card WITHOUT first selecting/placing a map hotspot (Library
 * "Открыть карточку", and any linked-entity click from inside a card).
 * Deliberately a separate overlay from `.object-window-overlay` (the
 * existing selected-hotspot flow, untouched) rather than a merge of the
 * two — merging would have meant reworking the proven Location/Tavern/
 * Shop selection flow's gating/Escape/cancel wiring for no benefit; this
 * way both can coexist, and a future pass can consolidate them once all
 * entity types have real cards. Quest and Enemy got real cards in
 * Phase 2H; `image` still renders a clear "not built yet" message
 * rather than a silent no-op or a tiny popup. */
function EmbeddedCompanionWindow({
  entity,
  hasBack,
  onBack,
  onClose,
  onOpen,
  data,
  npcs,
  quests,
}: {
  entity: EmbeddedCompanionEntity;
  hasBack: boolean;
  onBack: () => void;
  onClose: () => void;
  onOpen: (entity: EmbeddedCompanionEntity) => void;
  data: CampaignData;
  npcs: { id: string; name: string }[];
  quests: { id: string; title: string }[];
}) {
  const openNpc = (id: string) => onOpen({ type: 'npc', id });
  const openQuest = (id: string) => onOpen({ type: 'quest', id });
  const openShop = (id: string) => onOpen({ type: 'shop', id });
  const openLocation = (id: string) => onOpen({ type: 'location', id });
  const openEnemy = (id: string) => onOpen({ type: 'enemy', id });

  let title: string;
  let body: React.ReactNode;

  if (entity.type === 'location') {
    const loc = data.locations.find((l) => l.id === entity.id);
    title = loc?.name ?? 'Локация';
    body = loc ? (
      <CompanionLocationCard loc={loc} npcs={npcs} quests={quests} onOpenNpc={openNpc} onOpenQuest={openQuest} />
    ) : (
      <p className="muted">Локация не найдена.</p>
    );
  } else if (entity.type === 'tavern') {
    const tavern = data.taverns.find((t) => t.id === entity.id);
    title = tavern?.name ?? 'Таверна';
    body = tavern ? (
      <CompanionTavernCard
        tavern={tavern}
        npcs={npcs}
        quests={quests}
        images={data.images}
        onOpenNpc={openNpc}
        onOpenQuest={openQuest}
      />
    ) : (
      <p className="muted">Таверна не найдена.</p>
    );
  } else if (entity.type === 'shop') {
    const shop = data.shops.find((s) => s.id === entity.id);
    title = shop?.name ?? 'Лавка';
    body = shop ? (
      <CompanionShopCard shop={shop} npcs={npcs} images={data.images} onOpenNpc={openNpc} />
    ) : (
      <p className="muted">Лавка не найдена.</p>
    );
  } else if (entity.type === 'npc') {
    const npc = data.npcs.find((n) => n.id === entity.id);
    title = npc?.name ?? 'NPC';
    const loc = npc ? data.locations.find((l) => l.id === npc.location) : undefined;
    const shop = npc ? data.shops.find((s) => s.ownerNpcId === npc.id) : undefined;
    body = npc ? (
      <CompanionNpcCard
        npc={npc}
        locationName={loc?.name}
        shop={shop}
        quests={quests}
        images={data.images}
        onOpenQuest={openQuest}
        onOpenShop={openShop}
      />
    ) : (
      <p className="muted">NPC не найден.</p>
    );
  } else if (entity.type === 'quest') {
    const quest = data.quests.find((q) => q.id === entity.id);
    title = quest?.title ?? 'Квест';
    const loc = quest ? data.locations.find((l) => l.id === quest.location) : undefined;
    body = quest ? (
      <CompanionQuestCard
        quest={quest}
        npcs={npcs}
        enemies={data.enemies}
        images={data.images}
        locationName={loc?.name}
        onOpenNpc={openNpc}
        onOpenLocation={openLocation}
        onOpenEnemy={openEnemy}
      />
    ) : (
      <p className="muted">Квест не найден.</p>
    );
  } else if (entity.type === 'enemy') {
    const enemy = data.enemies.find((e) => e.id === entity.id);
    title = enemy?.name ?? 'Враг';
    body = enemy ? (
      <CompanionEnemyCard
        enemy={enemy}
        locations={data.locations}
        quests={quests}
        images={data.images}
        onOpenLocation={openLocation}
        onOpenQuest={openQuest}
      />
    ) : (
      <p className="muted">Враг не найден.</p>
    );
  } else {
    title = 'Изображение';
    body = <p className="muted">Полная карточка этого типа будет добавлена отдельным этапом.</p>;
  }

  return (
    <div className="companion-window-overlay" onClick={onClose}>
      <div className="companion-window-panel" onClick={(e) => e.stopPropagation()}>
        <div className="companion-window-header">
          <div>
            {hasBack && (
              <button className="btn-ghost btn-compact" onClick={onBack}>
                ← Назад
              </button>
            )}
            <h2>{title}</h2>
          </div>
          <button className="btn-ghost" onClick={onClose}>
            Закрыть ✕
          </button>
        </div>
        <div className="companion-window-body">{body}</div>
      </div>
    </div>
  );
}

function LocationSidePanel({
  ls,
  routes,
  hotspots,
  partyLocationState,
  selectedRouteId,
  onSelectRoute,
  onSelectLocation,
  onOpenDrawer,
  onOpenPlacement,
  onStartPlacement,
  onMarkRoutePath,
  onCreateRouteBetween,
  onStartPartyAnimation,
  onFindAndCommitPath,
  pathfindingResult,
  onCommitPathOption,
  onClose,
  onStartMoveHotspot,
  movingHotspotId,
}: {
  ls: LocationState;
  routes: MapRoute[];
  hotspots: MapHotspot[];
  partyLocationState: LocationState | undefined;
  selectedRouteId: string | null;
  onSelectRoute: (id: string | null) => void;
  onSelectLocation: (id: string) => void;
  onOpenDrawer: (d: DrawerState) => void;
  onOpenPlacement: (p: MapObjectPlacement) => void;
  onStartPlacement: (entityKind: MapObjectPlacement['entityKind'], entityId: string | undefined, title: string) => void;
  onMarkRoutePath: (routeId: string) => void;
  onCreateRouteBetween: (fromHotspotId: string, toHotspotId: string) => void;
  onStartMoveHotspot: (hotspotId: string) => void;
  movingHotspotId: string | null;
  onStartPartyAnimation: (points: { x: number; y: number }[]) => void;
  /** Route-network pathfinding (Etap H): called when no single direct route
   * connects the party to ls — looks up multi-hop options and either commits
   * the only one found or hands them to pathfindingResult for the DM to pick. */
  onFindAndCommitPath: (fromHotspotId: string, toHotspotId: string, destinationLocationStateId: string) => void;
  pathfindingResult: { targetLocationStateId: string; options: RoutePathResult[] } | null;
  onCommitPathOption: (path: RoutePathResult, destinationLocationStateId: string) => void;
  onClose: () => void;
}) {
  const { data } = useCampaignData();
  const store = useCampaignStore();
  if (!data) return null;

  const isPlayerView = store.mode === 'player-view';
  const isEditMode = store.mode === 'dm-edit';
  const status = effectiveLocationStatus(ls, store.progress);

  const npcsRaw = data.npcs.filter((n) => ls.npcIds.includes(n.id));
  const npcs = isPlayerView ? getPlayerSafeNpcs(npcsRaw) : npcsRaw;
  const quests = data.quests.filter((q) => ls.questIds.includes(q.id));
  const enemies = data.enemies.filter((e) => ls.enemyIds.includes(e.id));
  const imagesForLocation = data.images.filter((i) => ls.imageIds.includes(i.id));
  const images = isPlayerView ? getPlayerSafeImages(imagesForLocation) : imagesForLocation;
  const headerImage = images[0];
  const children = data.locationStates.filter((s) => ls.childLocationStateIds.includes(s.id));
  const ownHotspot = hotspots.find((h) => h.locationStateId === ls.id);
  const locationRoutes = ownHotspot
    ? routes.filter((r) => r.fromHotspotId === ownHotspot.id || r.toHotspotId === ownHotspot.id)
    : [];
  const visibleLocationRoutes = isPlayerView ? getPlayerSafeRoutes(locationRoutes) : locationRoutes;
  const isPartySet = !!store.party.currentLocationStateId;

  const visibleQuests = quests.filter((q) => {
    const qStatus = effectiveQuestStatus(q.id, q.status, store.progress);
    return !isPlayerView || qStatus !== 'hidden';
  });

  // Breadcrumb chain from root to this location.
  const breadcrumb: LocationState[] = [];
  let cur: LocationState | undefined = ls;
  while (cur) {
    breadcrumb.unshift(cur);
    cur = cur.parentLocationStateId ? data.locationStates.find((s) => s.id === cur!.parentLocationStateId) : undefined;
  }

  const battleMapLinks = data.battleMapLocationLinks.filter((b) => b.locationStateId === ls.id);
  const exactLinks = battleMapLinks.filter((b) => b.confidence === 'exact');
  const likelyLinks = battleMapLinks.filter((b) => b.confidence === 'likely');

  // Placements "belonging to" this location: only entity-linked matches
  // (no invented proximity geometry) — the placement's linked NPC/quest/
  // enemy/image/battle-map/location must already be one of this location's
  // own linked entities.
  const linkedEntityIdsForPlacements = new Set<string>([
    ls.locationId,
    ls.id,
    ...npcs.map((n) => n.id),
    ...quests.map((q) => q.id),
    ...enemies.map((e) => e.id),
    ...images.map((i) => i.id),
    ...exactLinks.map((b) => b.battleMapId),
    ...likelyLinks.map((b) => b.battleMapId),
  ]);
  const locationPlacements = data.placements.filter((p) => {
    if (p.status === 'archived') return false;
    if (isPlayerView) {
      if (p.status === 'hidden' || p.visibleInPlayerView !== true) return false;
    } else if (!isEditMode && p.status === 'hidden') {
      return false;
    }
    return !!p.entityId && linkedEntityIdsForPlacements.has(p.entityId);
  });

  // ---------- Journey panel ("Путешествие") ----------
  // Shown only when a location other than the party's current one is
  // selected — purely informational/suggestion UI, never auto-triggered.
  const isJourneyTarget = !!partyLocationState && partyLocationState.id !== ls.id;
  const journeyQuest = isJourneyTarget
    ? quests.find((q) => {
        const qStatus = effectiveQuestStatus(q.id, q.status, store.progress);
        return qStatus === 'active';
      }) ??
      data.quests.find((q) => {
        if (q.location !== ls.locationId && q.location !== ls.id) return false;
        const qStatus = effectiveQuestStatus(q.id, q.status, store.progress);
        return qStatus === 'active';
      })
    : undefined;
  const partyHotspotForJourney = partyLocationState
    ? hotspots.find((h) => h.locationStateId === partyLocationState.id)
    : undefined;
  const journeyRoute =
    isJourneyTarget && partyHotspotForJourney && ownHotspot
      ? routes.find(
          (r) =>
            (r.fromHotspotId === partyHotspotForJourney.id && r.toHotspotId === ownHotspot.id) ||
            (r.toHotspotId === partyHotspotForJourney.id && r.fromHotspotId === ownHotspot.id),
        )
      : undefined;
  const journeyDangerEnemies = enemies; // same enemy-fetching logic already used for the card's "Враги" section.

  // ---------- Travel events ("Что может случиться по пути") ----------
  // DM-only, never auto-triggered — purely prepared options the DM can open.
  // Only seeded as a mechanical inference from existing enemy/battle-map
  // links (see src/data/travelEvents.json); never invented narrative.
  const travelEvents = data.travelEvents.filter(
    (ev) =>
      ev.status !== 'hidden' &&
      ((journeyRoute && ev.routeId === journeyRoute.id) || ev.locationStateId === ls.id),
  );

  // ---------- Shops / economy ("Товары и услуги") ----------
  const linkedShops = data.shops.filter((s) => s.location === ls.locationId || s.location === ls.id);
  const showShopsSection = linkedShops.length > 0 || isMarketLikeLocation(ls);

  // ---------- Laws ("Законы") ----------
  const relevantLaws = isLawRelevantLocation(ls) ? data.laws.filter((law) => lawMatchesLocation(law, ls)) : [];

  return (
    <div className="side-panel-content">
      <div className="side-panel-breadcrumb">
        {breadcrumb.map((b, i) => (
          <span key={b.id}>
            {i > 0 && ' / '}
            <button className="breadcrumb-link" onClick={() => onSelectLocation(b.id)}>
              {b.title}
            </button>
          </span>
        ))}
        <button className="side-panel-close" onClick={onClose} aria-label="Закрыть панель">
          ×
        </button>
      </div>

      {headerImage && (
        <button
          className="side-panel-header-image-btn"
          onClick={() => onOpenDrawer({ kind: 'image', id: headerImage.id })}
          aria-label="Открыть изображение"
        >
          <img
            src={headerImage.thumbnailSrc ?? headerImage.src}
            alt={headerImage.title}
            className="side-panel-header-image"
          />
        </button>
      )}

      <h2 className="side-panel-title">{ls.title}</h2>
      {ls.type && <p className="status-badge">{ls.type}</p>}
      <p className="status-badge">
        {isPlayerView ? STATUS_LABELS_CALM[status] : `Статус: ${status}`}
      </p>
      {!isPlayerView && ownHotspot && (
        <div className="actions">
          <button
            disabled={movingHotspotId === ownHotspot.id}
            onClick={() => onStartMoveHotspot(ownHotspot.id)}
          >
            {movingHotspotId === ownHotspot.id ? 'Кликните по карте…' : 'Переместить локацию'}
          </button>
        </div>
      )}
      {isPlayerView ? (
        (ls.playerSafeDescription || ls.publicDescription) && (
          <p>{ls.playerSafeDescription || ls.publicDescription}</p>
        )
      ) : (
        <>
          {ls.publicDescription && (
            <p>
              <span className="status-badge status-badge--dm-only">Внутреннее описание</span> {ls.publicDescription}
            </p>
          )}
          {ls.playerSafeDescription && (
            <p>
              <span className="status-badge status-badge--player-visible">Player Safe</span> {ls.playerSafeDescription}
            </p>
          )}
        </>
      )}

      {isJourneyTarget && (
        <section className="card journey-panel">
          <h3>Путешествие</h3>
          <p><strong>Откуда:</strong> {partyLocationState?.title ?? 'не задано'}</p>
          <p><strong>Куда:</strong> {ls.title}</p>
          <p>
            <strong>Зачем:</strong>{' '}
            {journeyQuest ? journeyQuest.title : 'Свободное путешествие / исследование'}
          </p>
          {(() => {
            const journeyHasRealPath = (journeyRoute?.points?.length ?? 0) >= 2;
            if (journeyHasRealPath && journeyRoute) {
              return (
                <p>
                  <strong>Путь:</strong> партия идёт по маршруту «{journeyRoute.label ?? 'без названия'}»
                  {' '}({journeyRoute.points!.length} точек по карте).
                </p>
              );
            }
            // No single direct route — describe what the route-network
            // pathfinding (or its absence) found, never silently imply a
            // direct/teleport move is the plan.
            const activePathResult =
              pathfindingResult?.targetLocationStateId === ls.id ? pathfindingResult : null;
            if (!activePathResult) {
              return (
                <p>
                  <strong>Путь:</strong> прямого маршрута нет — нажмите «Найти путь», чтобы поискать путь
                  по дорожной сети.
                </p>
              );
            }
            if (activePathResult.options.length === 0) {
              return (
                <p className="route-editor-error">
                  <strong>Путь:</strong> нет доступного маршрута по дорожной сети между этими точками.
                  Нельзя строить прямой путь через закрытую область. Создайте маршрут/переход между этими
                  районами — партия не будет перемещена.
                </p>
              );
            }
            return (
              <div>
                <p><strong>Путь найден по дорожной сети:</strong></p>
                {activePathResult.options.map((path, optionIdx) => (
                  <div key={optionIdx} className="route-list-option">
                    {activePathResult.options.length > 1 && (
                      <p><strong>Вариант {optionIdx === 0 ? 'A' : 'B'}</strong></p>
                    )}
                    <ol className="route-list">
                      {path.segments.map((seg, segIdx) => {
                        const segRoute = routes.find((r) => r.id === seg.routeId);
                        const fromLabel =
                          segIdx === 0
                            ? hotspots.find((h) => h.id === partyHotspotForJourney?.id)?.label ?? 'Партия'
                            : (segRoute?.label ?? 'маршрут');
                        const toHotspotForSeg = hotspots.find(
                          (h) => h.x === seg.points[seg.points.length - 1].x && h.y === seg.points[seg.points.length - 1].y,
                        );
                        const segLabel = segRoute?.label ?? `маршрут ${segIdx + 1}`;
                        const dangerNote =
                          seg.dangerLevel === 'dangerous' || seg.dangerLevel === 'deadly' || seg.status === 'dangerous'
                            ? ' (опасный участок)'
                            : '';
                        return (
                          <li key={seg.routeId + segIdx}>
                            {segIdx === 0 ? fromLabel : segLabel} → {toHotspotForSeg?.label ?? segLabel}
                            {dangerNote}
                          </li>
                        );
                      })}
                    </ol>
                    {path.warnings.length > 0 && (
                      <ul className="route-list">
                        {path.warnings.map((w) => (
                          <li key={w} className="route-editor-error">{w}</li>
                        ))}
                      </ul>
                    )}
                    {!isPlayerView && (
                      <button onClick={() => onCommitPathOption(path, ls.id)}>
                        Построить путь партии{activePathResult.options.length > 1 ? ` (Вариант ${optionIdx === 0 ? 'A' : 'B'})` : ''}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            );
          })()}
          {!isPlayerView && (
            <div className="actions">
              {(() => {
                const journeyHasRealPath = (journeyRoute?.points?.length ?? 0) >= 2;
                if (journeyHasRealPath && journeyRoute) {
                  return (
                    <button
                      onClick={() => {
                        // routeId is passed as pure metadata (which path the
                        // party used) — it is never turned into rendered
                        // geometry; the marker's actual screen position is
                        // computed separately from route.points, and no
                        // direct currentLocation→targetLocation line is ever
                        // drawn.
                        store.setCurrentLocation(ls.id, journeyRoute.id);
                        onSelectRoute(journeyRoute.id);
                        const path =
                          partyHotspotForJourney && journeyRoute.fromHotspotId === partyHotspotForJourney.id
                            ? journeyRoute.points!
                            : [...journeyRoute.points!].reverse();
                        onStartPartyAnimation(path);
                      }}
                    >
                      Переместить партию по маршруту
                    </button>
                  );
                }
                return (
                  <button
                    disabled={!partyHotspotForJourney || !ownHotspot}
                    onClick={() => {
                      if (!partyHotspotForJourney || !ownHotspot) return;
                      onFindAndCommitPath(partyHotspotForJourney.id, ownHotspot.id, ls.id);
                    }}
                  >
                    Найти путь к локации
                  </button>
                );
              })()}
              {journeyRoute && (journeyRoute.points?.length ?? 0) >= 2 && (
                <button onClick={() => onSelectRoute(selectedRouteId === journeyRoute.id ? null : journeyRoute.id)}>
                  {selectedRouteId === journeyRoute.id ? 'Скрыть маршрут' : 'Показать маршрут'}
                </button>
              )}
              {journeyRoute && isEditMode && (journeyRoute.points?.length ?? 0) < 2 && (
                <button onClick={() => onMarkRoutePath(journeyRoute.id)}>Разметить путь</button>
              )}
              {!journeyRoute && isEditMode && partyHotspotForJourney && ownHotspot && (
                <button onClick={() => onCreateRouteBetween(partyHotspotForJourney.id, ownHotspot.id)}>
                  Создать маршрут между этими точками
                </button>
              )}
            </div>
          )}
          {!isPlayerView && journeyDangerEnemies.length > 0 && (
            <div className="dm-only">
              <p className="side-panel-subheading">Возможные опасности по пути</p>
              <ul className="route-list">
                {journeyDangerEnemies.map((en) => (
                  <li key={en.id}>{en.name}</li>
                ))}
              </ul>
            </div>
          )}
          {!isPlayerView && travelEvents.length > 0 && (
            <div className="dm-only">
              <p className="side-panel-subheading">Что может случиться по пути</p>
              <ul className="route-list">
                {travelEvents.map((ev) => (
                  <li key={ev.id}>
                    <strong>{ev.title}</strong>
                    {ev.dangerLevel && <span className="status-badge"> {ev.dangerLevel}</span>}
                    {ev.status === 'used' && <span className="status-badge"> использовано</span>}
                    <div className="actions">
                      <button onClick={() => store.patchTravelEvent(ev.id, { status: 'used' })}>
                        Отметить использованным
                      </button>
                      <button onClick={() => store.patchTravelEvent(ev.id, { status: 'hidden' })}>Скрыть</button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      )}

      {!isPlayerView && (
        <div className="actions">
          <button
            onClick={() => {
              // Same route-matching as the Journey panel's dedicated button —
              // this generic "move here" must not silently bypass a route
              // that already connects the party's current spot to ls.
              const matchingRoute =
                partyHotspotForJourney && ownHotspot
                  ? routes.find(
                      (r) =>
                        (r.points?.length ?? 0) >= 2 &&
                        ((r.fromHotspotId === partyHotspotForJourney.id && r.toHotspotId === ownHotspot.id) ||
                          (r.toHotspotId === partyHotspotForJourney.id && r.fromHotspotId === ownHotspot.id)),
                    )
                  : undefined;
              if (matchingRoute) {
                store.setCurrentLocation(ls.id, matchingRoute.id);
                onSelectRoute(matchingRoute.id);
                const path =
                  partyHotspotForJourney && matchingRoute.fromHotspotId === partyHotspotForJourney.id
                    ? matchingRoute.points!
                    : [...matchingRoute.points!].reverse();
                onStartPartyAnimation(path);
                return;
              }
              // No direct route. If the party has no current position yet (or
              // this location has no own hotspot to path to), placing it here
              // directly is fine — there is nothing to path FROM. Otherwise,
              // route through the network instead of teleporting.
              if (!partyHotspotForJourney || !ownHotspot) {
                store.setCurrentLocation(ls.id);
                return;
              }
              onFindAndCommitPath(partyHotspotForJourney.id, ownHotspot.id, ls.id);
            }}
          >
            {isPartySet ? 'Переместить партию сюда' : 'Поставить партию здесь'}
          </button>
          <button onClick={() => store.markVisited(ls.id)}>Отметить посещённой</button>
          <button onClick={() => store.setRevealed(ls.id)}>Показать игрокам</button>
          <button
            onClick={() => {
              const name = window.prompt('Название события для этой локации:');
              if (!name) return;
              const now = new Date().toISOString();
              const calendarNow = store.getCalendar(store.currentTimelineId);
              const newEvent: CampaignEvent = {
                id: `event-${Date.now()}`,
                timelineId: store.currentTimelineId,
                name,
                type: 'note',
                linkedLocationStateIds: [ls.id],
                date: { day: calendarNow.currentDay, month: calendarNow.currentMonth, year: calendarNow.currentYear },
                timeOfDay: calendarNow.currentTimeOfDay,
                visibleInPlayerView: false,
                status: 'planned',
                createdAt: now,
                updatedAt: now,
              };
              store.addCampaignEvent(newEvent);
            }}
          >
            Создать событие здесь
          </button>
          {!isPlayerView && (
            <button
              onClick={() => {
                const name = window.prompt('Название триггера для этой локации:');
                if (!name) return;
                const calendarNow = store.getCalendar(store.currentTimelineId);
                const dayStr = window.prompt('День срабатывания (число):', String(calendarNow.currentDay));
                if (dayStr === null) return;
                const day = Math.max(1, Math.floor(Number(dayStr) || calendarNow.currentDay));
                const now = new Date().toISOString();
                const newTrigger: DelayedTrigger = {
                  id: `trigger-${Date.now()}`,
                  timelineId: store.currentTimelineId,
                  name,
                  triggerType: 'date',
                  date: { day, month: calendarNow.currentMonth, year: calendarNow.currentYear },
                  linkedLocationStateId: ls.id,
                  effect: { type: 'create_event', payload: { name, type: 'note' } },
                  status: 'armed',
                  visibleInPlayerView: false,
                  createdAt: now,
                  updatedAt: now,
                };
                store.addDelayedTrigger(newTrigger);
              }}
            >
              + Триггер для этой локации
            </button>
          )}
          {!isPlayerView && (
            <select value={status} onChange={(e) => store.setLocationStatus(ls.id, e.target.value as LocationStatus)}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {isEditMode ? s : STATUS_LABELS_CALM[s]}
                </option>
              ))}
            </select>
          )}
        </div>
      )}
      {isPlayerView && (
        <div className="actions">
          <button onClick={() => store.setCurrentLocation(ls.id)}>Партия здесь</button>
        </div>
      )}

      {!isPlayerView && ls.dmNotes && (
        <section className="card dm-only">
          <h3>Заметки ДМ</h3>
          <p>{ls.dmNotes}</p>
        </section>
      )}

      {ls.tavernDetails && (
        <section className="card">
          <h3>Таверна — детали</h3>
          {ls.tavernDetails.ownerNpcId && (() => {
            const ownerNpc = data.npcs.find((n) => n.id === ls.tavernDetails!.ownerNpcId);
            if (!ownerNpc) {
              return isPlayerView ? null : (
                <p className="dm-only">
                  <strong>Владелец:</strong> не найден NPC с id «{ls.tavernDetails!.ownerNpcId}» — проверьте ссылку
                </p>
              );
            }
            return (
              <p>
                <strong>Владелец:</strong> {ownerNpc.name}
              </p>
            );
          })()}
          {!isPlayerView && (ls.tavernDetails.staffNpcIds?.length ?? 0) > 0 && (
            <p className="dm-only">
              <strong>Персонал:</strong>{' '}
              {ls.tavernDetails.staffNpcIds!
                .map((id) => data.npcs.find((n) => n.id === id)?.name ?? id)
                .join(', ')}
            </p>
          )}
          {ls.tavernDetails.roomsServices && (
            <p><strong>Комнаты / услуги:</strong> {ls.tavernDetails.roomsServices}</p>
          )}
          {ls.tavernDetails.rumors && <p><strong>Слухи:</strong> {ls.tavernDetails.rumors}</p>}
          {!isPlayerView && ls.tavernDetails.pricesNotes && (
            <p className="dm-only"><strong>Цены:</strong> {ls.tavernDetails.pricesNotes}</p>
          )}
          {!isPlayerView && ls.tavernDetails.troubleHooks && (
            <p className="dm-only"><strong>Зацепки:</strong> {ls.tavernDetails.troubleHooks}</p>
          )}
          {!isPlayerView && ls.tavernDetails.secrets && (
            <p className="dm-only"><strong>Секреты (ДМ):</strong> {ls.tavernDetails.secrets}</p>
          )}
        </section>
      )}

      {ls.shopDetails && (
        <section className="card">
          <h3>Лавка — детали{ls.shopDetails.shopType ? ` (${ls.shopDetails.shopType})` : ''}</h3>
          {ls.shopDetails.ownerNpcId && (() => {
            const ownerNpc = data.npcs.find((n) => n.id === ls.shopDetails!.ownerNpcId);
            if (!ownerNpc) {
              return isPlayerView ? null : (
                <p className="dm-only">
                  <strong>Владелец:</strong> не найден NPC с id «{ls.shopDetails!.ownerNpcId}» — проверьте ссылку
                </p>
              );
            }
            return (
              <p>
                <strong>Владелец:</strong> {ownerNpc.name}
              </p>
            );
          })()}
          {ls.shopDetails.goodsServices && (
            <p><strong>Товары / услуги:</strong> {ls.shopDetails.goodsServices}</p>
          )}
          {!isPlayerView && ls.shopDetails.inventoryNotes && (
            <p className="dm-only"><strong>Ассортимент (заметки):</strong> {ls.shopDetails.inventoryNotes}</p>
          )}
          {!isPlayerView && ls.shopDetails.pricePolicy && (
            <p className="dm-only"><strong>Политика цен:</strong> {ls.shopDetails.pricePolicy}</p>
          )}
          {!isPlayerView && ls.shopDetails.reputationRequirement && (
            <p className="dm-only"><strong>Требование репутации:</strong> {ls.shopDetails.reputationRequirement}</p>
          )}
          {!isPlayerView && ls.shopDetails.illegalGoods && (
            <p className="dm-only"><strong>Запрещённые товары (ДМ):</strong> {ls.shopDetails.illegalGoods}</p>
          )}
        </section>
      )}

      {children.length > 0 && (
        <section className="card">
          <h3>Под-локации ({children.length})</h3>
          <div className="entity-card-grid">
            {children.map((c) => (
              <button key={c.id} className="entity-card" onClick={() => onSelectLocation(c.id)}>
                {c.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {npcs.length > 0 && (
        <section className="card">
          <h3>NPC ({npcs.length})</h3>
          <div className="entity-card-grid">
            {npcs.map((n) => (
              <div key={n.id} className="entity-card-wrap">
                <button className="entity-card" onClick={() => onOpenDrawer({ kind: 'npc', id: n.id })}>
                  <span className="entity-card-title">{n.name}</span>
                  {(n.role || n.race) && (
                    <span className="entity-card-sub">{[n.role, n.race].filter(Boolean).join(' · ')}</span>
                  )}
                </button>
                {!isPlayerView && (
                  <button
                    className="entity-card-place"
                    title="Разместить на карте"
                    onClick={() => onStartPlacement('npc', n.id, n.name)}
                  >
                    📍
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {visibleQuests.length > 0 && (
        <section className="card">
          <h3>Квесты ({visibleQuests.length})</h3>
          <div className="entity-card-grid">
            {visibleQuests.map((q) => {
              const qStatus = effectiveQuestStatus(q.id, q.status, store.progress);
              return (
                <div key={q.id} className="entity-card-wrap">
                  <button className="entity-card" onClick={() => onOpenDrawer({ kind: 'quest', id: q.id })}>
                    <span className="entity-card-title">{q.title}</span>
                    <span className="entity-card-sub">
                      {isPlayerView ? '' : `${QUEST_STATUS_LABELS[qStatus]}${q.goal ? ' · ' : ''}`}
                      {q.goal ?? ''}
                    </span>
                  </button>
                  {!isPlayerView && (
                    <button
                      className="entity-card-place"
                      title="Разместить на карте"
                      onClick={() => onStartPlacement('quest', q.id, q.title)}
                    >
                      📍
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {!isPlayerView && enemies.length > 0 && (
        <section className="card dm-only">
          <h3>Враги ({enemies.length})</h3>
          <div className="entity-card-grid">
            {enemies.map((en) => (
              <div key={en.id} className="entity-card-wrap">
                <button className="entity-card" onClick={() => onOpenDrawer({ kind: 'enemy', id: en.id })}>
                  <span className="entity-card-title">{en.name}</span>
                  <span className="entity-card-stats">
                    {en.cr && <span>CR {en.cr}</span>}
                    {en.ac !== undefined && <span>AC {en.ac}</span>}
                    {en.hp !== undefined && <span>HP {en.hp}</span>}
                  </span>
                </button>
                <button
                  className="entity-card-place"
                  title="Разместить на карте"
                  onClick={() => onStartPlacement('enemy', en.id, en.name)}
                >
                  📍
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {images.length > 0 && (
        <section className="card">
          <h3>Изображения ({images.length})</h3>
          <div className="entity-card-grid">
            {images
              .filter((img) => !isPlayerView || img.safeForPlayers)
              .map((img) => (
                <div key={img.id} className="entity-card-wrap">
                  <button className="entity-card" onClick={() => onOpenDrawer({ kind: 'image', id: img.id })}>
                    {img.title}
                  </button>
                  {!isPlayerView && (
                    <button
                      className="entity-card-place"
                      title="Разместить на карте"
                      onClick={() => onStartPlacement('image', img.id, img.title)}
                    >
                      📍
                    </button>
                  )}
                </div>
              ))}
          </div>
        </section>
      )}

      {!isPlayerView && battleMapLinks.length > 0 && (
        <section className="card dm-only">
          <h3>Боевые карты</h3>
          <div className="entity-card-grid">
            {exactLinks.map((b) => {
              const bm = data.battleMaps.find((m) => m.id === b.battleMapId);
              return (
                <div key={b.battleMapId} className="entity-card-wrap">
                  <button className="entity-card" onClick={() => onOpenDrawer({ kind: 'battleMap', id: b.battleMapId })}>
                    <BattleMapThumbnail variant={bm?.variants[0]} title={bm?.title ?? b.battleMapId} size="small" />
                    <span className="entity-card-title">{bm?.title ?? b.battleMapId}</span>
                    {isEditMode && <span className="confidence-badge confidence-exact">Точно</span>}
                  </button>
                  <button
                    className="entity-card-place"
                    title="Разместить на карте"
                    onClick={() => onStartPlacement('battleMap', b.battleMapId, bm?.title ?? b.battleMapId)}
                  >
                    📍
                  </button>
                </div>
              );
            })}
          </div>
          {likelyLinks.length > 0 && (
            <>
              <p className="side-panel-subheading">Возможно подходящие карты</p>
              <div className="entity-card-grid">
                {likelyLinks.map((b) => {
                  const bm = data.battleMaps.find((m) => m.id === b.battleMapId);
                  return (
                    <button
                      key={b.battleMapId}
                      className="entity-card"
                      onClick={() => onOpenDrawer({ kind: 'battleMap', id: b.battleMapId })}
                    >
                      <BattleMapThumbnail variant={bm?.variants[0]} title={bm?.title ?? b.battleMapId} size="small" />
                      <span className="entity-card-title">{bm?.title ?? b.battleMapId}</span>
                      {isEditMode && <span className="confidence-badge confidence-likely">Возможно</span>}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {locationPlacements.length > 0 && (
        <section className="card">
          <h3>Размещённые объекты ({locationPlacements.length})</h3>
          <div className="entity-card-grid">
            {locationPlacements.map((p) => (
              <button
                key={p.id}
                className="entity-card"
                onClick={() => onOpenPlacement(p)}
              >
                <span className="entity-card-title">
                  {PLACEMENT_ICONS[p.entityKind]} {p.title}
                </span>
                <span className="entity-card-sub">
                  {p.entityKind}
                  {isEditMode && p.status === 'hidden' && ' · скрыто'}
                </span>
              </button>
            ))}
          </div>
        </section>
      )}

      {visibleLocationRoutes.length > 0 && (
        <section className="card">
          <h3>Маршруты ({visibleLocationRoutes.length})</h3>
          <ul className="route-list">
            {visibleLocationRoutes.map((r) => {
              const otherId = r.fromHotspotId === ownHotspot?.id ? r.toHotspotId : r.fromHotspotId;
              const otherHotspot = hotspots.find((h) => h.id === otherId);
              return (
                <li key={r.id}>
                  {r.label ?? `${ownHotspot?.label ?? ls.title} — ${otherHotspot?.label ?? '?'}`}
                  {r.routeType && <span className="status-badge"> {r.routeType}</span>}
                  {r.travelTime && <span> · {r.travelTime}</span>}
                  {isEditMode && (
                    <button
                      onClick={() => {
                        if (!window.confirm('Удалить этот маршрут?')) return;
                        store.deleteRoute(r.id);
                      }}
                      style={{ marginLeft: '0.5rem' }}
                    >
                      Удалить
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {showShopsSection && linkedShops.length > 0 && (
        <section className="card">
          <h3>Товары и услуги</h3>
          {linkedShops.map((shop) => (
            <div key={shop.id} className="shop-block">
              <p className="side-panel-subheading">
                {shop.name}
                {shop.type ? ` (${shop.type})` : ''}
              </p>
              {shop.services && shop.services.length > 0 && (
                <p><strong>Услуги:</strong> {shop.services.join(', ')}</p>
              )}
              {shop.items && shop.items.length > 0 && (
                <div className="entity-card-grid">
                  {shop.items.map((item) => {
                    const refMatch = !item.price
                      ? data.economyReference.find((e) => e.name === item.name)
                      : undefined;
                    return (
                      <div key={item.id} className="entity-card shop-item-card">
                        <span>{item.name}</span>
                        {item.price ? (
                          <span className="status-badge">
                            {item.price} {item.currency}
                          </span>
                        ) : refMatch ? (
                          <span className="status-badge">
                            {refMatch.price} {refMatch.currency}
                          </span>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </section>
      )}

      {relevantLaws.length > 0 && (
        <details className="card laws-accordion">
          <summary>Законы ({relevantLaws.length})</summary>
          <ul className="route-list">
            {relevantLaws.map((law) => (
              <li key={law.id}>
                <strong>{law.title}</strong> — {law.category}
                <button
                  onClick={() => onOpenDrawer({ kind: 'law', id: law.id })}
                  style={{ marginLeft: '0.5rem' }}
                >
                  Подробнее
                </button>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

const PLACEMENT_ENTITY_OPEN_LABELS: Record<MapObjectPlacement['entityKind'], string> = {
  location: 'Открыть локацию',
  npc: 'Открыть NPC',
  quest: 'Открыть квест',
  enemy: 'Открыть врага',
  image: 'Открыть изображение',
  battleMap: 'Открыть боевую карту',
  note: '',
  custom: '',
};

const PLACEMENT_KIND_LABELS: Record<MapObjectPlacement['entityKind'], string> = {
  location: 'Локация',
  npc: 'NPC',
  quest: 'Квест',
  enemy: 'Враг',
  image: 'Изображение',
  battleMap: 'Боевая карта',
  note: 'Заметка',
  custom: 'Произвольный объект',
};

/**
 * There is no reliable automatic id mapping between dm-companion battle map
 * ids and battle-map-vtt's own map ids (see BattleMapLink in types.ts), so
 * "Открыть Battle Map VTT" can only deep-link once the DM has pasted the
 * real battle-map-vtt URL here once. Without it, the button just opens the
 * app's base URL — never a fake/guessed deep link.
 */
function EntityDrawer({
  drawer,
  onClose,
  onOpenBattleMapVtt,
  onStartPlacement,
  onOpenLinkedEntity,
}: {
  drawer: Exclude<DrawerState, null>;
  onClose: () => void;
  onOpenBattleMapVtt: (battleMapId: string) => void;
  onStartPlacement: (entityKind: MapObjectPlacement['entityKind'], entityId: string | undefined, title: string) => void;
  onOpenLinkedEntity: (p: MapObjectPlacement) => void;
}) {
  const { data } = useCampaignData();
  const store = useCampaignStore();
  if (!data) return null;
  const isPlayerView = store.mode === 'player-view';
  const isEditMode = store.mode === 'dm-edit';

  let title = '';
  let body: ReactElement | null = null;
  // "Разместить на карте" is offered for every entity kind that has a real
  // map-placeable card. Never shown in Player View (placement is a DM tool).
  let placementButton: ReactElement | null = null;

  if (drawer.kind === 'placement') {
    const p = data.placements.find((x) => x.id === drawer.id);
    if (!p) return null;
    // Double-guard: visiblePlacements/search already filter what reaches a
    // click in Player View, but never trust that alone for an unsafe-data leak.
    if (isPlayerView && (p.status === 'hidden' || p.status === 'archived' || p.visibleInPlayerView !== true)) {
      return null;
    }
    title = p.title;
    const entityExists =
      !!p.entityId &&
      ((p.entityKind === 'npc' && data.npcs.some((x) => x.id === p.entityId)) ||
        (p.entityKind === 'quest' && data.quests.some((x) => x.id === p.entityId)) ||
        (p.entityKind === 'enemy' && data.enemies.some((x) => x.id === p.entityId)) ||
        (p.entityKind === 'image' && data.images.some((x) => x.id === p.entityId)) ||
        (p.entityKind === 'battleMap' && data.battleMaps.some((x) => x.id === p.entityId)) ||
        (p.entityKind === 'location' && !!getLocationState(data, p.entityId)));
    const canOpenLinked = entityExists && p.entityKind !== 'note' && p.entityKind !== 'custom';
    body = (
      <>
        <p className="status-badge">{PLACEMENT_KIND_LABELS[p.entityKind]}</p>
        {p.subtitle && <p>{p.subtitle}</p>}
        {!isPlayerView && isEditMode ? (
          <div className="form-row">
            <label>Название маркера</label>
            <input
              key={`${p.id}-title`}
              type="text"
              defaultValue={p.title}
              onBlur={(e) => {
                if (e.target.value.trim() && e.target.value !== p.title) {
                  store.patchPlacement(p.id, { title: e.target.value.trim() });
                }
              }}
            />
          </div>
        ) : null}
        {!isPlayerView && <p><strong>Статус:</strong> {p.status ?? 'active'}</p>}
        {!isPlayerView && (
          <p><strong>Видно игрокам:</strong> {p.visibleInPlayerView ? 'да' : 'нет'}</p>
        )}
        {!isPlayerView && p.entityId && !entityExists && (
          <p className="dm-only" style={{ color: 'var(--danger)' }}>
            Связанная карточка не найдена (entityId: {p.entityId}) — marker остаётся, но ссылка разорвана.
          </p>
        )}
        {!isPlayerView && isEditMode ? (
          <div className="form-row">
            <label>Заметки ДМ</label>
            <textarea
              key={`${p.id}-dmNotes`}
              defaultValue={p.dmNotes ?? ''}
              onBlur={(e) => {
                if (e.target.value !== (p.dmNotes ?? '')) {
                  store.patchPlacement(p.id, { dmNotes: e.target.value || undefined });
                }
              }}
            />
          </div>
        ) : (
          !isPlayerView && p.dmNotes && <p className="dm-only"><strong>Заметки ДМ:</strong> {p.dmNotes}</p>
        )}
        {isEditMode && (
          <p className="dm-only">
            <strong>Позиция:</strong> x={p.position.x.toFixed(3)}, y={p.position.y.toFixed(3)} (перетащите маркер на карте, чтобы изменить)
          </p>
        )}
        <div className="actions">
          {canOpenLinked && (
            <button onClick={() => onOpenLinkedEntity(p)}>{PLACEMENT_ENTITY_OPEN_LABELS[p.entityKind]}</button>
          )}
          {!isPlayerView && isEditMode && (
            <>
              {p.status !== 'hidden' ? (
                <button onClick={() => store.patchPlacement(p.id, { status: 'hidden' })}>Скрыть</button>
              ) : (
                <button onClick={() => store.patchPlacement(p.id, { status: 'active' })}>Показать (ДМ)</button>
              )}
              {p.visibleInPlayerView ? (
                <button onClick={() => store.patchPlacement(p.id, { visibleInPlayerView: false })}>Скрыть от игроков</button>
              ) : (
                <button onClick={() => store.patchPlacement(p.id, { visibleInPlayerView: true })}>Показать игрокам</button>
              )}
              {p.entityId && (
                <button onClick={() => store.patchPlacement(p.id, { entityId: undefined })}>Отвязать</button>
              )}
              <button
                onClick={() => {
                  if (!window.confirm('Удалить это размещение?')) return;
                  store.deletePlacement(p.id);
                  onClose();
                }}
              >
                Удалить
              </button>
            </>
          )}
        </div>
      </>
    );
  } else if (drawer.kind === 'npc') {
    const n = data.npcs.find((x) => x.id === drawer.id);
    if (!n) return null;
    title = n.name;
    body = (
      <>
        {n.race && <p><strong>Расса:</strong> {n.race}</p>}
        {n.role && <p><strong>Роль:</strong> {n.role}</p>}
        {!isPlayerView && n.faction && <p><strong>Фракция:</strong> {n.faction}</p>}
        {(n.publicDescription || n.personality) && (
          <p>{n.publicDescription || n.personality}</p>
        )}
        {n.goals && <p><strong>Цели:</strong> {n.goals}</p>}
        {!isPlayerView && n.dmNotes && (
          <p className="dm-only"><strong>Заметки ДМ:</strong> {n.dmNotes}</p>
        )}
        {!isPlayerView && n.secrets && <p className="dm-only"><strong>Секреты (ДМ):</strong> {n.secrets}</p>}
      </>
    );
    if (!isPlayerView) {
      placementButton = (
        <button onClick={() => onStartPlacement('npc', n.id, n.name)}>Разместить на карте</button>
      );
    }
  } else if (drawer.kind === 'quest') {
    const q = data.quests.find((x) => x.id === drawer.id);
    if (!q) return null;
    title = q.title;
    const status = effectiveQuestStatus(q.id, q.status, store.progress);
    body = (
      <>
        {q.giver && <p><strong>Заказчик:</strong> {q.giver}</p>}
        {q.goal && <p><strong>Цель:</strong> {q.goal}</p>}
        {q.description && <p>{q.description}</p>}
        {q.reward && <p><strong>Награда:</strong> {q.reward}</p>}
        <p className="status-badge">{isPlayerView ? '' : 'Статус: '}{QUEST_STATUS_LABELS[status]}</p>
        {!isPlayerView && (
          <div className="actions">
            {QUEST_STATUSES.filter((s) => s !== status).map((s) => (
              <button key={s} onClick={() => store.setQuestStatus(q.id, s)}>
                {s === 'active' && 'Активировать'}
                {s === 'completed' && 'Завершить'}
                {s === 'failed' && 'Провалить'}
                {s === 'hidden' && 'Скрыть'}
              </button>
            ))}
          </div>
        )}
      </>
    );
    if (!isPlayerView) {
      placementButton = (
        <button onClick={() => onStartPlacement('quest', q.id, q.title)}>Разместить на карте</button>
      );
    }
  } else if (drawer.kind === 'enemy') {
    if (isPlayerView) return null;
    const en = data.enemies.find((x) => x.id === drawer.id);
    if (!en) return null;
    title = en.name;
    body = (
      <>
        {en.role && <p><strong>Роль:</strong> {en.role}</p>}
        {en.faction && <p><strong>Фракция:</strong> {en.faction}</p>}
        {en.cr && <p><strong>CR:</strong> {en.cr}</p>}
      </>
    );
    placementButton = <button onClick={() => onStartPlacement('enemy', en.id, en.name)}>Разместить на карте</button>;
  } else if (drawer.kind === 'image') {
    const img = data.images.find((x) => x.id === drawer.id);
    if (!img) return null;
    if (isPlayerView && !img.safeForPlayers) return null;
    title = img.title;
    body = (
      <div className="lightbox-image-wrap">
        <img src={img.thumbnailSrc ?? img.src} alt={img.title} className="lightbox-image" />
      </div>
    );
    if (!isPlayerView) {
      placementButton = (
        <button onClick={() => onStartPlacement('image', img.id, img.title)}>Разместить на карте</button>
      );
    }
  } else if (drawer.kind === 'battleMap') {
    if (isPlayerView) return null;
    const bm = data.battleMaps.find((x) => x.id === drawer.id);
    if (!bm) return null;
    title = bm.title;
    const previewVariant = bm.variants.find((v) => v.url) ?? bm.variants[0];
    body = (
      <>
        <BattleMapThumbnail variant={previewVariant} title={bm.title} size="large" />
        <p><strong>Вариантов карты:</strong> {bm.variants.length}</p>
        <ul>
          {bm.variants.map((v, i) => (
            <li key={i}>{v.type ?? 'default'}: {v.fileName}</li>
          ))}
        </ul>
        <BattleMapVttLinkField battleMapId={bm.id} />
        <div className="actions">
          <button onClick={() => onOpenBattleMapVtt(bm.id)}>Открыть Battle Map VTT</button>
        </div>
      </>
    );
    placementButton = (
      <button onClick={() => onStartPlacement('battleMap', bm.id, bm.title)}>Разместить на карте</button>
    );
  } else if (drawer.kind === 'economy') {
    const item = data.economyReference.find((x) => x.id === drawer.id);
    if (!item) return null;
    title = item.name;
    body = (
      <>
        <p><strong>Категория:</strong> {item.category}</p>
        <p><strong>Цена:</strong> {item.price} {item.currency}</p>
        {item.availability && <p><strong>Доступность:</strong> {item.availability}</p>}
        {item.quality && <p><strong>Качество:</strong> {item.quality}</p>}
        {item.notes && <p>{item.notes}</p>}
      </>
    );
  } else if (drawer.kind === 'law') {
    const law = data.laws.find((x) => x.id === drawer.id);
    if (!law) return null;
    title = law.title;
    body = (
      <>
        <p><strong>Категория:</strong> {law.category}</p>
        <p>{law.text}</p>
        {law.punishments && law.punishments.length > 0 && (
          <p><strong>Наказания:</strong> {law.punishments.join('; ')}</p>
        )}
        {law.notes && <p>{law.notes}</p>}
      </>
    );
  }

  if (!body) return null;

  return (
    <div className="drawer-overlay" onClick={onClose}>
      <div className="drawer-panel" onClick={(e) => e.stopPropagation()}>
        <div className="side-panel-breadcrumb">
          <h2 className="side-panel-title">{title}</h2>
          <button className="side-panel-close" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        {body}
        {placementButton && <div className="actions placement-action">{placementButton}</div>}
      </div>
    </div>
  );
}

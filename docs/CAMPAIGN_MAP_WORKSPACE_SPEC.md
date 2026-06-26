# Campaign Map Workspace — Spec

This document describes the Campaign Map Workspace as it is actually
implemented in this codebase (post architecture-hardening pass). It replaces
the previous, outdated version of this file. It is intentionally scoped to
what exists in code today — not an aspirational roadmap. Deferred items are
called out explicitly in "Deferred / not yet built" at the end of each
section.

## 1. Overview

The Map Workspace (`src/pages/MapWorkspacePage.tsx`) is the main screen of
the app: a zoomable/pannable world/region/city map with hotspots (locations),
routes (travel graph edges), object placements (notes/pins linking to
existing entities), a battle-map drawer, a Current Session roll-up panel, and
DM-only editing tools (DM Edit mode).

Three layers of data compose the screen:

1. **Seed/base layer** — read-only data produced by `loadCampaignData()`
   (`src/data/loadCampaignData.ts`): dm-companion JSON (NPCs, quests,
   enemies, images, locations, factions, etc.) plus our own seeds in
   `src/data/` (`hotspots.json`, `routes.json`, `travelEvents.json`,
   `battle-maps-index.json`).
2. **Overlay layer** — every DM edit, persisted to `localStorage`
   (`src/state/overlay.ts`, `src/state/campaignStore.tsx`). A diff/patch
   layer on top of the seed, so re-importing/upgrading seed data never
   destroys DM edits.
3. **Merged view** — `useCampaignData()`
   (`src/state/campaignDataContext.tsx`) applies the overlay on top of the
   base layer via `applyOverlayToList()`, producing the `CampaignData` object
   every page actually reads.

Arc 1 and Arc 2 are two independent `Timeline`s. **Arc 2 has no seeded route
data** (`src/data/routes.json` is an empty array for it) — this is
intentional; the app must never invent Arc 2 map content. Routes only exist
once a DM draws them.

## 2. Workspace Modes

There are two independent mode concepts:

### 2.1 Global AppMode (`src/types.ts`)

```ts
export type AppMode = 'dm-view' | 'dm-edit' | 'player-view';
```

Controlled by `useCampaignStore().mode` / `setMode()`. `player-view` never
shows edit controls or DM-only data (see §4, Player Safe Projection).
`dm-edit` is the only mode where hotspots/routes/placements/locations can be
created, moved, or deleted.

### 2.2 MapWorkspaceMode (`src/pages/map-workspace/useMapWorkspaceMode.ts`)

```ts
export type MapWorkspaceMode =
  | 'view' | 'placement' | 'route_edit' | 'session' | 'travel' | 'battle_launch' | 'player_safe_preview';
```

This is a **derived, read-only** value computed from MapWorkspacePage's
existing per-tool local state (`placingHotspot`, `placementMode`,
`routeDraft`, `editingRouteId`, `showSessionPanel`, `selectedRouteId`,
`locationPlacementDraft`, party-travel-animation activity, and the global
`AppMode`). It is **not** a second source of truth — the actual mutual-
exclusion mechanism remains `cancelAllEditTools()`, a single chokepoint every
"start tool X" action in MapWorkspacePage calls first. `useMapWorkspaceMode`
exists so call sites can ask "is tool X allowed right now" via
`isAllowed('route_edit' | 'placement' | 'hotspot_drag' | 'session')` without
re-deriving the mutual-exclusion rules inline. Enforced rules:

- `route_edit` doesn't conflict with `placement` (both inert tools — only one
  is armed at a time via `cancelAllEditTools()`), but never while the party is
  mid-travel-animation.
- `placement` doesn't conflict with `session`, but never while editing a
  route or while the party is travelling.
- `hotspot_drag` is blocked while the party marker is animating along a
  route (`handleHotspotMouseDown` in MapWorkspacePage.tsx checks
  `workspaceMode.isAllowed('hotspot_drag')`), in addition to its pre-existing
  guard against `editingRouteId`/`placementMode`.
- `player_safe_preview` (i.e. global AppMode === `'player-view'`) always
  wins and disables every edit-tool guard.

Tool state is reset whenever the active arc/level/map or AppMode changes (see
the `useEffect` keyed on `[earlyCameraKey, store.mode]` in
MapWorkspacePage.tsx) — this already existed and was extended to also reset
the Quick Pin draft (§7).

`battle_launch` is reserved in the type for a future "launch into Battle Map
VTT" workspace-mode state; today the battle-map drawer/link flow (§8) doesn't
route through `MapWorkspaceMode` at all — it's a plain drawer.

## 3. Data model

### 3.1 Core entities (`src/types.ts`)

- `Timeline` — one of the campaign arcs/eras.
- `WorldMap` / `WorldMapState` — a renderable map and its per-timeline
  hotspot membership.
- `LocationState` — a dm-companion Location projected into a Timeline, with
  DM-only fields (`dmNotes`, `enemyIds`) and a `status`
  (`unknown|known|visited|hidden|destroyed|contested`).
- `MapHotspot` — a clickable point on a map, linked to a `LocationState`.
- `MapRoute` — a travel-graph edge between two hotspots (see §3.2 below for
  the hardened fields).
- `TravelEvent` — a DM-only, manually-activated "what might happen here"
  stub. Never auto-triggered.
- `MapObjectPlacement` — a DM-placed marker pinning an existing entity (or a
  free note) to a map position. 100% DM-created, no seed data.
- `PartyState` — `currentLocationStateId`, visited/known/revealed location
  ids, and `currentPartyRouteId` (pure metadata, never geometry).
- `CampaignCalendar` / `TimeOfDay` — the Time Engine skeleton (§6).

### 3.2 MapRoute — hardened fields

```ts
export interface MapRoute {
  id: string;
  mapStateId: string;
  fromHotspotId: string;
  toHotspotId: string;
  points?: Array<{ x: number; y: number }>;
  label?: string;
  routeType?: 'road' | 'street' | 'trail' | 'river' | 'tunnel' | 'secret' | 'dangerous' | 'custom';
  dangerLevel?: 'safe' | 'watchful' | 'dangerous' | 'deadly';
  visibleInPlayerView: boolean;
  discovered?: boolean;
  travelTime?: string;
  notes?: string;
  // Hardening additions — all optional, never required, so existing routes
  // stay valid without migration:
  status?: 'planned' | 'active' | 'completed' | 'blocked' | 'dangerous' | 'hidden';
  distanceKm?: number;
  travelDifficulty?: 'easy' | 'normal' | 'hard' | 'deadly';
  linkedQuestIds?: string[];
  linkedLocationIds?: string[];
  linkedFactionIds?: string[];
  linkedEventIds?: string[];
  tags?: string[];
}
```

`fromHotspotId`/`toHotspotId` are typed as `string` (required) on the
interface, and the UI now refuses to let a DM draw a route without picking
both (see §5 — this is also the bug fix). They are not made TypeScript-
optional because every party-movement code path treats their presence as the
contract for "this route is walkable."

`src/data/routeUtils.ts` provides pure helpers:
`getRoutePointCount`, `isRouteDrawable` (≥2 points), `isRouteValid` (both
endpoints set AND ≥2 points), `getRouteValidationWarnings`,
`calculateRouteNormalizedDistance` (unitless polyline length, only
comparable within the same map), `estimateRouteDistanceKm` (returns `null`
without a supplied scale — never fabricates a number), and
`TRAVEL_SPEED_PRESETS` / `estimateTravelDays` for the Travel Panel (§9).

### 3.3 Overlay shape (`src/state/overlay.ts`)

```ts
export interface CampaignOverlay {
  timelinePatches, worldMapPatches, worldMapStatePatches, locationStatePatches,
  hotspotPatches, routePatches, travelEventPatches, placementPatches: Record<string, Patch<T>>;
  newTimelines, newWorldMaps, newWorldMapStates, newLocationStates,
  newHotspots, newRoutes, newTravelEvents, newPlacements: T[];
  party: PartyState;
  progress: CampaignProgress;
  battleMapLocationLinkOverrides: Record<string, BattleMapLocationLink>;
  battleMapVttUrlOverrides: Record<string, string>;
  placementLayerVisible: boolean;
  calendarsByTimelineId: Record<string, CampaignCalendar>; // Time Engine skeleton, see §6
  currentTimelineId: string;
  mode: 'dm-view' | 'dm-edit' | 'player-view';
  routeEditorVersion: number;
}
```

`calendarsByTimelineId` is lazily defaulted — old persisted overlays need no
migration; `DEFAULT_CALENDAR` is used whenever a timeline's entry is absent.

## 4. Player Safe Projection (`src/data/playerSafeProjection.ts`)

A single module that decides what a non-DM viewer (Player View inside
MapWorkspacePage, or the standalone Observer page) is allowed to see. It
replaces what used to be scattered inline filters at each call site —
MapWorkspacePage's `visibleHotspots`, `visibleRoutes`, `visiblePlacements`,
the `LocationSidePanel`'s `images`/`visibleLocationRoutes`, and the global
search-results block now delegate to it.

Exported functions:

- `getPlayerSafeLocationStates(data, progress, timelineId)` — excludes
  `status === 'hidden'` (after override) and `visibleToPlayers === false`.
- `getPlayerSafeHotspots(data, progress, hotspots)` — excludes
  `visibleInPlayerView === false` and hotspots linked to a non-player-visible
  location.
- `getPlayerSafeRoutes(routes)` — `visibleInPlayerView` only.
- `getPlayerSafePlacements(placements)` — excludes `archived`/`hidden`
  status, and requires `visibleInPlayerView === true` explicitly (stricter
  than DM modes, where `status !== 'hidden'` alone is enough).
- `getPlayerSafeImages(images)` — requires `safeForPlayers === true` (the
  existing dm-companion field).
- `getPlayerSafeSearchResults(data, progress, input)` — drops enemies and
  battle maps entirely (never partially redacted — DM-only categories),
  filters locations/NPCs/quests/placements by location/quest visibility.
- `getPlayerSafeCampaignProjection(data, progress, opts)` — one-call bundle
  used by `ObserverViewPage`.
- `stripDmOnlyLocationFields(ls)` — belt-and-suspenders field strip
  (`dmNotes`, `enemyIds`) for any caller that might render a raw
  `LocationState` object.

DM modes (`dm-view`/`dm-edit`) must see everything. Every function here is a
pure projection; DM-mode call sites simply pass the unfiltered list through
(the existing `isPlayerView` ternaries at each call site decide which branch
to take — this was not changed).

### What is explicitly excluded from players (verified by code, not just convention)

- `LocationState.dmNotes`, `LocationState.enemyIds`
- Any location with effective `status === 'hidden'` or `visibleToPlayers === false`
- Any hotspot with `visibleInPlayerView === false`
- Any route with `visibleInPlayerView === false`
- Any placement that is `archived`/`hidden` status, or lacks an explicit
  `visibleInPlayerView === true`
- Any image without `safeForPlayers === true`
- Enemies and battle maps in global search results (dropped entirely)
- Quests with effective status `'hidden'`
- `TravelEvent`s with `visibleInPlayerView: false` (pre-existing — Player
  View's Current Session panel is gated behind `isPlayerView` entirely, so
  the panel itself never renders for players)

## 5. The route teleport bug — root cause and fix

**Symptom (as reported):** drawing a new route on the map and double-
clicking/using "move party" still teleports the party directly instead of
walking the drawn polyline — except for one specific route (market → docks),
which worked.

**Investigation:** every party-movement code path in
`MapWorkspacePage.tsx` (the hotspot double-click handler
`handleHotspotDoubleClick`, the Journey panel's "Переместить партию по
маршруту" button, and the generic "Переместить партию сюда" button) already
required an exact `(fromHotspotId, toHotspotId)` pair match with `points`
length ≥ 2 before treating a move as route-based — this part was already
correct and is the mechanism that makes route-based walking possible at all.

**Root cause:** the manual "Построить маршрут" draft form (`routeDraft`
state, the `startDrawingNewRoute()` function) labelled its "Откуда"/"Куда"
hotspot selectors as "(необязательно)" — i.e. optional — and previously
saved whatever was in the form directly onto the new `MapRoute`, including
empty strings, when `startDrawingNewRoute()` ran. A route created this way
got `fromHotspotId: ''` and/or `toHotspotId: ''`. The matching logic
everywhere (`r.fromHotspotId === partyHotspot.id && ...`) can never match an
empty string against a real hotspot id, so every route drawn via this form
silently fell back to a direct teleport, regardless of how many points it
had. The one route that worked (market → docks) had been created via
`openRouteBuilderBetween(fromHotspotId, toHotspotId)` — the
double-click-two-hotspots flow — which always supplies real, non-empty ids
and therefore always produced a matchable route.

**Fix** (`src/pages/MapWorkspacePage.tsx`, `startDrawingNewRoute()`):

```ts
if (!routeDraft.fromHotspotId || !routeDraft.toHotspotId) {
  setRouteEditorError('Выберите начальную и конечную точку маршрута — без них партия не сможет идти по этому пути и будет перемещаться напрямую.');
  return;
}
```

Both endpoints are now required before a route can even start being drawn.
The draft form's hint text was updated to say the fields are required (no
longer "необязательно"), and `routeEditorError` now surfaces inline in the
draft form (previously only shown in the waypoint-editing panel) and is
cleared by `cancelAllEditTools()` like every other tool-armed error state.

Secondary hardening (not new bugs, but closing the gap so this class of issue
can't recur silently): the route list panel and the new "selected route"
inspector panel now show `isRouteValid(route)`-derived warnings
(`getRouteValidationWarnings`) inline whenever a route is missing an
endpoint or a drawn path, and the new Travel Panel (§9) disables its
"Начать путешествие"/"Завершить в конечной точке" buttons entirely when
`isRouteValid(route)` is false.

## 6. Time Engine skeleton

`CampaignCalendar` (`src/types.ts`):

```ts
export type TimeOfDay = 'morning' | 'noon' | 'evening' | 'night';
export interface CampaignCalendar {
  currentDay: number;
  currentMonth: string;
  currentYear: number;
  currentTimeOfDay: TimeOfDay;
}
```

One independent calendar per `Timeline`, stored in
`overlay.calendarsByTimelineId`, defaulted lazily via `DEFAULT_CALENDAR`
(`src/state/overlay.ts`) the first time it's read. Store actions
(`src/state/campaignStore.tsx`): `getCalendar(timelineId)`,
`setCalendar(timelineId, calendar)`, `advanceTimePhase(timelineId)` (steps
morning→noon→evening→night→[next day]→morning), `advanceDay(timelineId)`
(increments the day only). No triggers or automation — nothing reacts to the
calendar advancing; it is purely a DM-visible/DM-advanced reference.

UI: a `.calendar-chip` in the workspace topbar
(`День {day} · {month} · {year} · {Утро|День|Вечер|Ночь}`) with `+ фаза` /
`+ день` buttons, hidden in Player View (the display-only chip remains
visible to players, the advance buttons do not).

## 7. Quick Pin

Reuses `MapObjectPlacement` (`entityKind: 'note'`, `status: 'active'`) rather
than introducing a new entity type — explicitly commented in code as an
MVP-compatible Quick Pin layered on the existing placement system. Flow:
"Quick Pin" toolbar button arms `quickPinArming` → next map click opens a
small draft form (`quickPinDraft`: title + "Видимо игрокам" checkbox) →
"Сохранить" creates the placement via `store.addPlacement()`. Shown in the
Current Session panel under its own "Quick Pins" section
(`sessionQuickPins`, filtered by active arc, not by map, since a quick pin
is meant to be a fast reminder regardless of which map is open) with a
"Снять" button that archives it.

## 8. Battle Map drawer (unchanged)

`BattleMapThumbnail` and `BattleMapVttLinkField` were extracted from
MapWorkspacePage.tsx into `src/pages/map-workspace/` (Etap D, §10) but their
behavior is unchanged: there is no reliable automatic id mapping between
dm-companion battle-map ids and battle-map-vtt's own map ids, so "Открыть
Battle Map VTT" only deep-links once the DM has pasted a real
battle-map-vtt URL via `BattleMapVttLinkField`; otherwise it opens the app's
bare base URL.

## 9. Travel Panel foundation

A minimal, non-modal panel (`!isPlayerView && selectedRouteId &&
!editingRouteId` block in MapWorkspacePage.tsx, styled via `.travel-panel`)
shown whenever a route is selected outside the waypoint-editing flow. Shows:
endpoints, point count, status, visibility, distance (`distanceKm` if set,
else the unitless normalized length with an explicit "масштаб карты не
задан" instead of a fabricated number), a travel-speed preset selector
(`TRAVEL_SPEED_PRESETS` from `routeUtils.ts`: `walk_slow` 20, `walk_normal`
30, `walk_fast` 40, `horse` 50, `caravan` 20, `army` 15 km/day), an estimated
duration (`estimateTravelDays`, `null` without a known distance), and
`getRouteValidationWarnings` output. Three action buttons:
"Начать путешествие" (animates the party marker along the route, same
mechanism as the existing Journey-panel button), "Завершить в конечной
точке" (jumps `setCurrentLocation` straight to whichever endpoint isn't the
party's current hotspot, recording the route id as metadata), "Отметить
событие на маршруте" (opens the Current Session panel, where travel events
already live). The first two buttons are disabled whenever
`!isRouteValid(route)`.

## 10. Component decomposition

Extracted into `src/pages/map-workspace/` so far:

- `useMapWorkspaceMode.ts` — see §2.2.
- `observerBroadcast.ts` — see §11.
- `BattleMapThumbnail.tsx` — pure, no page-state closures; lift was
  behavior-identical.
- `BattleMapVttLinkField.tsx` — only depended on `useCampaignStore()`
  directly (never received props from the page), so the lift is behavior-
  identical.

Deferred (per the task's "safe subset" allowance — these are larger, more
entangled with MapWorkspacePage's closures over `hotspots`/`routes`/`view`/
zoom math/drag state, and extracting them risked behavior changes under the
time budget): `EntityDrawer`, `RouteEditorOverlay`, `PartyMarker`,
`MapRouteLayer`. `MapWorkspacePage.tsx` remains the primary implementation
file; only clearly-isolated, closure-free chunks were lifted.

## 11. Observer MVP

`src/pages/ObserverViewPage.tsx`, routed at `/observer`
(`src/App.tsx`). Rendered with zero app-shell chrome — no `NavRail`, no
`NavBar`, full-bleed `.observer-shell`. Reads the same
`CampaignStoreProvider`/`CampaignDataProvider` tree as the rest of the app
(both wrap the whole router in `App.tsx`), so it sees the same
localStorage-backed overlay on its own load. It renders only
`getPlayerSafeHotspots`/`getPlayerSafeRoutes`/`getPlayerSafePlacements`
output for whichever map/timeline is focused, plus the party marker if its
location is player-visible (`isLocationVisibleToPlayers`). It never calls any
store mutation — no `setCurrentLocation`, no `patch*`/`add*` — by
construction (those functions are simply never imported into the file).

**Sync skeleton** (`src/pages/map-workspace/observerBroadcast.ts`): a
`BroadcastChannel('campaign-timeline-vtt:observer')`. `postObserverFocus()`
is called from MapWorkspacePage in a `useEffect` keyed on
`[currentTimelineId, scope, selectedLocationStateId, view]`, posting
`{ timelineId, scope, selectedLocationStateId, cameraView }`. Observer
listens via `channel.onmessage` and re-renders using the focused
timeline/scope. If no DM tab is broadcasting (or `BroadcastChannel` is
unsupported), Observer still renders using the live store's own
`currentTimelineId`/`scope` defaults — it degrades to "shows whatever the
local overlay says" rather than failing.

"Открыть Observer" button added to `NavBar.tsx`, calling
`window.open('/observer', '_blank')` (no router basename configured in
`main.tsx`, so the bare path is correct).

## 12. Stage 6 — Canon Map Rebuild & Manual Content Authoring

- **Stage 6A / 6A.1 — Canon Map Rebuild & Clean Slate**: the three active
  maps (`map-kingdom`/`map-region`/`map-city-greyholm`) were repointed at
  the real Kingdom of Aurelon / Greyholm Region / Greyholm City art
  (1448×1086, located and copied in during 6A.1 after starting from
  placeholders in 6A) with a different layout from the old art, and every
  old map-position record (hotspots, routes, placements/Quick Pins, zones,
  dynamic overlays, movable entities, party route progress) was
  archived/cleared via a versioned migration (`canonMapVersion`). See
  `docs/CAMPAIGN_MAP_WORKSPACE_CANON_MAP_REBUILD_SPEC.md`.
- **Stage 6B / 6B.1 / 6B.2 — Manual Content Authoring UX**: map-click
  location creation gained a template picker
  (tavern/shop/district/warehouse/gate/guild/temple/custom),
  `playerSafeDescription`, `dmNotes`, and `tavernDetails`/`shopDetails`
  template fields, all editable after creation (not just at creation
  time). NPCs gained a real overlay (`npcPatches`/`newNpcs`,
  `store.addNpc`/`patchNpc`) so "Создать NPC здесь" and NPC
  visibility (`visibleToPlayers`) actually persist. A real overlay-patch
  data-loss bug (partial patches replacing rather than merging with prior
  patches — pre-existing since Stage 1, only exposed once a partial-patch
  call site existed) was found and fixed in Stage 6B.2. The single global
  `MAP_IMAGE_WIDTH`/`HEIGHT` constant was removed in favor of per-map
  `originalImageWidth`/`Height` metadata. Tavern/shop creation, NPC
  create/link/unlink, hidden-NPC safety, and Player Safe/Observer
  redaction were all live-verified in a real browser session, not just
  code-reviewed. See
  `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §11 for
  the Stage 6B.2 Definition-of-Done.
- **Stage 6B.3 — Manual Authoring Closure & Visual Handoff Prep**: closed
  the two remaining authoring gaps — placing an existing unplaced
  location on the map ("Разместить на текущей карте") and re-placing an
  already-placed location's hotspot ("Переместить локацию"), both without
  creating duplicate records, both live-tested with reload persistence.
  Tavern staff picker upgraded from a raw comma-separated id input to a
  searchable `CheckboxList`. `DmTavern`/`DmShop` vs.
  `LocationState.tavernDetails`/`shopDetails` reconciliation documented
  (deliberately not bridged — separate id spaces, no instruction to build
  a bridge). Unplaced panel lists capped at 30 with "show more". Mode
  guards live-click-tested for Placement/View/Route-Edit/Area-Edit modes;
  Session Mode verified by code reading only. Gates pass at the unchanged
  7-error/3-warning lint baseline. See
  `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §12 for
  the full report and the explicit (partial — two narrow live-click/
  Observer-route gaps remain) Visual Plan Stage 0 readiness verdict.
- **Stage 6B.4 — Final Manual Authoring Readiness Gate**: closed the two
  Stage 6B.3 gaps with fresh live tests — Session Mode panel open + map
  click mutates nothing (hotspot count unchanged, no draft opens), and a
  fresh direct navigation to `/observer` (not the DM-side Player View
  toggle) confirmed zero buttons/edit affordances and no DM-only data
  leak (Unplaced panel, DM notes, inventory, route-edit markup,
  `battleMapUrl`/`returnUrl`, smoke-test entries, hidden NPCs all
  absent). Gates re-ran clean at the unchanged 7/3 lint baseline. Manual
  Content Authoring is now fully closed; Visual Plan Stage 0 is allowed
  to start. See
  `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §13.
- **Visual Plan Stage 0 — Urgent Visual-Functional Fixes**: audited party
  token, route-movement, active-route, and route-point visuals against
  the Stage 0 brief. Found all four already implemented in earlier work
  (`PartyMarker.tsx` — flag icon + "Партия" label + z-index 30 above every
  other marker; `.route--active` — green drop-shadow + 4px stroke;
  `.waypoint-dot-start`/`-end` — green/red 22px handles with numbered
  labels and a per-point × delete button; routes are fully manual with
  *no* auto-generated diagonal fallback by construction). No code changes
  were made; live-verified instead.
- **Visual Handoff Cleanup**: the smoke-test route (Tavern → Shop) and
  its dangling `party.currentPartyRouteId` pointer were removed via a
  precise `localStorage` data edit (the in-app delete button's native
  `confirm()` dialog couldn't be clicked through by the automation
  tooling); party position itself (resting at the shop) was left as
  ordinary runtime state, not test garbage. See
  `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §14.
- **Visual Plan Stage 1 — Design Tokens & Dark Fantasy Foundation**:
  added the missing token categories (spacing, radius, shadow, z-index
  scale, motion, semantic color aliases) to the existing `:root` block in
  `src/index.css`, purely additively. Added opt-in button-hierarchy
  classes (`.btn-primary/-secondary/-ghost/-danger/-compact`) and
  `.status-badge--*` semantic modifiers, wired into the highest-traffic
  Save/Cancel/Delete buttons and the location-panel description badges
  only — not a mass conversion. Live-verified: classes render correctly,
  Player Safe and a fresh `/observer` stay clean, gates pass at the
  unchanged 7/3 baseline. See
  `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §15 for
  the full breakdown and what's deferred to a future visual stage.
- **Stage 6C — DM Companion Content Library Sync & Placement Tray
  (MVP)**: added a new DM-only "Библиотека" side-panel tab exposing the
  previously-unbridged `DmTavern`/`DmShop` read-only library
  (`public/data/dm-companion/{taverns,shops}.json`) as placement-ready
  cards, with click-to-place ("Разместить на карте"), a placed/unplaced
  badge, search, and a 30-item cap per section. Placing a card creates
  exactly one new `LocationState` (tagged `sourceLibraryId`/
  `sourceLibraryType` for non-duplication) + hotspot — the source library
  record is never edited or duplicated. Live-verified: real data (3
  taverns, 6 shops), placement + reload persistence, Player
  View/`/observer` both clean, and mode-guard mutual exclusion with Route
  Edit Mode and Escape-cancel. NPCs/Quests/Enemies/BattleEntries already
  had a placement/linking path via the existing Unplaced panel and were
  left untouched. See
  `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §16 for
  the full scope and what's deferred to a future Stage 6C.1.
- **Stage 6C.1 — Library/Card Tray expansion**: added Локации and NPC
  sections to the Библиотека tab (now 4 sections total — Локации/NPC/
  Таверны/Лавки), a shared placement-state filter, and a "На другой
  карте" badge. Reuses the existing unplaced-location-placement and
  NPC-link mechanisms verbatim — no new placement/linking logic was
  introduced. Verified the latest DM Companion export (`campaign-2026-06-
  25.zip`) needed no import — all entity files campaign-timeline-vtt
  reads were already byte-identical to the merged result. Live-verified:
  real counts, location placement + reload persistence, NPC linking +
  reload persistence (confirmed via the overlay's `locationStatePatches`,
  not just the UI), Player View and `/observer` both clean. See
  `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §16.6
  for the full breakdown.

## 13. Verification performed

- `npm run typecheck` — passing after every etap.
- `npm run build` — passing, `dist/` emitted successfully.
- No automated UI/E2E test suite exists in this repo; changes were verified
  by code-level reasoning (matching the documented bug's root cause against
  every party-movement call site) plus the type system, not by a live
  browser session.

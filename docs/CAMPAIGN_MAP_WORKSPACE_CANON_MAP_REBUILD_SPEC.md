# Campaign Map Workspace — Canon Map Rebuild & Clean Slate (Stage 6A)

This document describes Stage 6A: replacing the active map set with three new
canonical maps and invalidating every old map-linked DM record so the DM can
manually repopulate the world from a clean slate. It assumes the Stage 1–5H
technical baseline (`docs/CAMPAIGN_MAP_WORKSPACE_TECHNICAL_BASELINE_STAGE_5.md`)
and is scoped narrowly to map data — it does not reopen any of the
"do not touch without a separate stage" items listed there.

See `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` for Stage
6B, which builds on top of this clean slate.

## 1. The three new canonical maps

| id                 | title                     | level  | parentMapId  | backgroundImageSrc                              |
|--------------------|---------------------------|--------|--------------|--------------------------------------------------|
| `map-kingdom`      | Королевство Аурелон       | world  | —            | `/maps/kingdom/kingdom_of_aurelon_canon.jpg`     |
| `map-region`       | Регион Грейхольма (Калдран)| region | `map-kingdom`| `/maps/regions/greyholm_region_canon.jpg`        |
| `map-city-greyholm`| Грейхольм                 | city   | `map-region` | `/maps/cities/greyholm_city_canon.jpg`           |

The three `WorldMap` ids are **unchanged** from the pre-Stage-6 seed
(`src/data/loadCampaignData.ts`, `WORLD_MAPS`) — only the background art and
metadata changed. This is deliberate: every other part of the codebase that
already references `'map-kingdom'` / `'map-region'` / `'map-city-greyholm'`
by id (route/hotspot seeds, `locationHierarchy.ts`, `MapWorkspacePage.tsx`'s
level-switcher) keeps working without an id-rename pass.

### Hierarchy

```
Kingdom of Aurelon (world)
  └── Greyholm Region (region)   — parentMapId: 'map-kingdom'
        └── Greyholm City (city) — parentMapId: 'map-region'
```

`parentMapId` is new, optional `WorldMap` metadata (see §3) — it formalizes a
relationship that previously only existed implicitly (the level switcher UI
assumed kingdom → region → city, but nothing in the data model said so).
Nothing currently *reads* `parentMapId` at runtime; it is authored now so
future "zoom into child map" / breadcrumb UI has a real field to read instead
of re-deriving the hierarchy from `scope` order assumptions.

## 2. Old map data invalidation rules

The new map art has a **different layout** from the old seed art (different
city shape, different region geography). Any coordinate, polygon, or
position recorded against the old art is meaningless against the new art.
Therefore:

- Every map-position record tied to the active maps is invalidated, with no
  attempt to auto-translate old coordinates onto the new art (that would
  silently produce wrong placements that look plausible — worse than an
  empty map).
- This invalidation is **all-or-nothing per record type**, not selective: we
  do not try to guess which individual hotspot "probably still makes sense."
- Locations themselves (`LocationState` — title, description, dmNotes,
  npc/quest/enemy/image links) are **not** invalidated. A location is lore;
  losing its hotspot doesn't make the lore wrong, just unplaced. The DM
  re-places it with one click (Stage 6B's "Add Location" → pick existing →
  drop pin — see the authoring spec; today only "create new location"
  exists, re-placing an *existing* unplaced LocationState's hotspot still
  goes through the normal "create hotspot" flow, just choosing where to
  point it is the remaining manual step).

## 3. What was cleared from active maps (Stage 6A, implemented)

Two layers were touched:

**Seed layer** (`src/data/hotspots.json`): the 16 Arc-1 hotspots that
referenced the old kingdom/region/city art were moved verbatim to
`src/data/archive/hotspots.pre-stage6.json` (soft-archived, not deleted —
they're inert there, read by nothing) and `hotspots.json` was replaced with
`[]`. `src/data/routes.json` was already `[]` before Stage 6A (a prior stage
had already deleted the old auto-generated route seed — see
`ROUTE_EDITOR_VERSION` in `campaignStore.tsx`), so there was no seed-layer
route data to archive.

**Runtime/overlay layer** (`src/state/overlay.ts`,
`src/state/campaignStore.tsx`): a new versioned migration,
`canonMapVersion` / `CANON_MAP_VERSION` / `clearCanonMapOverlayState()`,
mirrors the existing `routeEditorVersion` pattern (§5 of the main spec) and
runs once in `loadPersisted()`. On any locally-stored overlay whose
`canonMapVersion` is missing or stale, it wipes:

- `hotspotPatches`, `newHotspots` — old markers/placements, including any
  DM-moved positions.
- `routePatches`, `newRoutes` — old routes and route points.
- `placementPatches`, `newPlacements` — old object placements, **including
  Quick Pins** (Quick Pin is `MapObjectPlacement` with `entityKind: 'note'`,
  not a separate entity type — see main spec §7).
- `factionZonesById` — old faction/restricted/impassable zones (polygon
  data, meaningless against new art).
- `dynamicMapOverlaysById` — old fog/tint overlays.
- `movableEntitiesById` — old NPC/group/caravan/army map positions.
- `party.currentLocationStateId` and `party.currentPartyRouteId` — the
  party's on-map position and route-progress metadata. `visitedLocationStateIds`
  / `knownLocationStateIds` / `revealedLocationStateIds` are **not** cleared
  (those are location-knowledge facts, not map geometry).

It does **not** touch (preserved as-is):

- `locationStatePatches` / `newLocationStates` — lore.
- `progress` (quest/location status overrides, location notes).
- `calendarsByTimelineId`, `eventsById`, `triggersById`, `battleEntriesById`
  — none of these carry map-position data.
- `battleMapLocationLinkOverrides`, `battleMapVttUrlOverrides`.
- Anything seed/library-only with **no overlay state at all**: NPCs, quests,
  enemies, images, factions, taverns, shops, laws, economy data, battle map
  manifest entries. These come from `loadCampaignData()` / dm-companion JSON
  and are simply re-read unchanged; Stage 6A cannot "clear" them because the
  overlay never had a slot for them to begin with.

A real, in-browser reload after this migration:

- shows the three canon maps with their new art;
- shows zero old hotspots/routes/zones/quick pins/placements;
- shows the party with no current map position (the DM sets one manually);
- still shows every NPC/quest/enemy/image/tavern/shop/law in their respective
  library views, and still shows the two pre-existing Stage 5H smoke-test
  `BattleEntry`/`CampaignEvent` records (§9 of the technical baseline — those
  predate Stage 6A and are unrelated to map position, so this migration
  correctly leaves them alone; if the DM wants them gone that's still a
  separate, manual "Архивировать" action, unchanged by this stage).

## 4. Map image metadata (`WorldMap`, `src/types.ts`)

```ts
export interface WorldMap {
  id: string;
  title: string;
  scope: 'kingdom' | 'region' | 'city';
  backgroundImageSrc?: string;
  placeholder?: boolean;
  level?: 'world' | 'region' | 'city';
  parentMapId?: string;
  originalImageWidth?: number;
  originalImageHeight?: number;
  aspectRatio?: number;
  defaultZoom?: number;
  defaultCenter?: { x: number; y: number };
  isPlayerVisible?: boolean;
}
```

All eight new fields are **optional** — no migration is needed for any
locally-patched `WorldMap` copy already sitting in someone's overlay
(`worldMapPatches`/`newWorldMaps`), since a patch that doesn't mention a field
simply doesn't override it.

`originalImageWidth` / `originalImageHeight` / `aspectRatio` exist so
coordinate math (hotspot/route/zone placement, see Stage 6B §9 of the
authoring spec) can always anchor itself to the real image dimensions
instead of re-deriving them from a possibly-not-yet-loaded `<img>` element or,
worse, from the surrounding container's size (which changes with letterboxing,
sidebar width, zoom, etc. and is **not** the image). `aspectRatio` is stored
precomputed (`width / height`) rather than derived at render time so every
consumer agrees on the exact same number.

**Current state of the actual files (updated, Stage 6A.1)**: the real canon
art was located (it existed on the DM's machine outside the repo, under
`~/Downloads`) and copied into `public/maps/{kingdom,regions,cities}/
*_canon.jpg`. All three are genuinely the Kingdom of Aurelon / Greyholm
Region / Greyholm City art, **1448×1086** pixels each — verified by
decoding the files (not just trusting file size) and confirmed visually in
a live browser session. `originalImageWidth`/`originalImageHeight`/
`aspectRatio` in `WORLD_MAPS` (`src/data/loadCampaignData.ts`) were updated
to 1448/1086/1.333 to match. The placeholder-copy state described in the
original version of this section no longer applies.

## 5. Avoiding coordinate drift

- Never compute a placement's normalized `{x, y}` against the rendering
  container's bounding box — always against the actual rendered image
  bounds (accounting for letterboxing/pillarboxing under `object-fit:
  contain`-style rendering, current zoom, and current pan). This was already
  the contract before Stage 6A (`MapWorkspacePage.tsx`'s existing
  pan/zoom/click-to-normalized-coordinate code path) and is unchanged here —
  Stage 6A's only addition is giving that code a trustworthy
  `originalImageWidth/Height` to validate against instead of inferring it.
- A click outside the actual image bounds must not create a hotspot/
  placement/zone point. This was already enforced before Stage 6A; not
  modified.
- Because old hotspot/route/zone data is now empty, there is no legacy
  coordinate data left that could silently "drift" relative to the new art —
  this is the main practical benefit of clearing rather than attempting an
  automatic coordinate translation.

## 6. Manual-only repopulation

All hotspots, routes, zones, NPC placements, taverns, shops, battle entries,
and other map content on the three canon maps from this point forward are
**created manually by the DM** via Stage 6B's authoring UX
(`docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md`). Nothing in
Stage 6A auto-generates replacement placements, and nothing should — an
auto-placed hotspot on a map the DM hasn't actually looked at yet is
indistinguishable from a wrong one.

## 7. Old routes/placements are not trusted after a map replacement — going forward

This invalidation pattern (a versioned overlay-clearing migration keyed off a
bumped constant, mirroring `ROUTE_EDITOR_VERSION`/`canonMapVersion`) is the
established mechanism for "the map art changed enough that old positions are
meaningless." Any future map-art replacement should bump `CANON_MAP_VERSION`
again (or introduce an analogous versioned constant) rather than leaving
stale coordinates silently rendering against new art.

## 8. Verification performed

```bash
npm run lint:hooks   # PASS — react-hooks/rules-of-hooks clean
npm run typecheck    # PASS
npm run build        # PASS, dist/ emitted
```

**Live browser verification (Stage 6A.1 + 6B.2)**: all three canon maps
open clean (zero hotspots/routes/zones/quick pins) after the Stage 6A
migration, confirmed visually via screenshot and `Все точки на карте (0)`.
A real regression was found and fixed during this verification — see §9.

## 9. Stage 6A.1/6B.2 fixes found during live verification

Two hardcoded-dimension bugs were found only by actually opening the app in
a browser (neither `typecheck` nor `build` could have caught either):

1. **`needsArtReview` heuristic** (`buildWorldMapStatesAndHotspots` in
   `src/data/loadCampaignData.ts`) used to be `idsForThis.length === 0`
   (no seeded hotspots ⇒ assume no real art yet). Stage 6A's clean slate
   means every Arc-1 map *legitimately* starts with zero hotspots now, so
   this heuristic misfired and hid all three canon maps behind a
   "PLACEHOLDER — нужна карта" screen despite real art being registered.
   Fixed to key off `!map.backgroundImageSrc` instead.
2. **`MAP_IMAGE_WIDTH`/`MAP_IMAGE_HEIGHT`** in `MapWorkspacePage.tsx` were a
   single hardcoded global constant (1280×853, the *old* placeholder art's
   dimensions) driving all zoom/pan/coordinate math — silently wrong once
   real 1448×1086 art was registered. Removed in Stage 6B.2; see
   `docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §11.2 for
   the replacement (`useActiveMapImageSize`, reading each `WorldMap`'s own
   `originalImageWidth/Height`).

Both are now part of why this app's "gates pass" is not the same claim as
"verified working" — see the technical baseline doc's mandatory gates
section, which already says a live browser smoke is required for anything
map/UI-facing, for exactly this reason.

## 10. Stage 6B.3 — manual repopulation tooling now closes the loop

§6 above says re-placing an *existing* unplaced `LocationState` "still
goes through the normal 'create hotspot' flow, just choosing where to
point it is the remaining manual step" — that gap is now closed. See
`docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §12.1 for
the new "Разместить на текущей карте" action (places an existing
unplaced location without creating a duplicate `LocationState`) and §12.2
for "Переместить локацию" (re-places an already-placed location's
hotspot in-place). Both were live-tested with reload persistence this
pass.

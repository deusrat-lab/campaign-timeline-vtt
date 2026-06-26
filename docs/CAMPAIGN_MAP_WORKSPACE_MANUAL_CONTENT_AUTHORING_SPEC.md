# Campaign Map Workspace — Manual Content Authoring UX (Stage 6B)

Stage 6B builds the DM-facing workflow for repopulating the three canon maps
(Stage 6A, `docs/CAMPAIGN_MAP_WORKSPACE_CANON_MAP_REBUILD_SPEC.md`) by hand:
map-first creation of locations/taverns/shops/NPCs, linking, separate
DM-only vs. player-safe text, and persistence across reload. It is scoped to
what was actually implemented in this pass plus what is explicitly deferred —
see §10.

## 1. Map-first content creation — what already existed vs. what Stage 6B added

Before Stage 6B, `MapWorkspacePage.tsx` already had a working "place a new
location" flow: arm Placement Mode → click the map → a `locationPlacementDraft`
form appears with title/public description/status/player-visibility → Save
creates a `LocationState` + a `MapHotspot` pointing at the clicked coordinate,
both immediately persisted via the overlay. It also already had "link an
existing NPC/quest/enemy/image to a location" (`onLinkToLocation`,
`LocationSidePanel`'s "Связать с локацией" button) and a `LocationState.type`
free-text field, but the creation draft itself never exposed `type` or
`dmNotes`, and there was no template picker.

Stage 6B added, on top of that existing flow:

- A `type` (template) dropdown in the location creation draft —
  tavern / shop / district / warehouse / gate / guild / temple / custom
  (`LOCATION_TEMPLATE_OPTIONS` in `MapWorkspacePage.tsx`). Selecting one
  writes that value onto the new `LocationState.type` — it is a starting
  label, not yet a distinct data schema (see §10, Deferred).
- A `dmNotes` textarea in the same draft, so DM-only prep notes can be typed
  in at creation time instead of requiring a second edit pass afterward.
  Labelled explicitly "никогда не видно игрокам/Observer" in the UI.
- The public-description field's label now says "Player Safe" explicitly,
  to make the DM-only/player-safe split visible at the point of entry, not
  just in documentation.

## 2. Description split: `description` / `playerSafeDescription` / `dmNotes`

The product requirement is three distinct text fields with three distinct
audiences. The existing `LocationState` model (`src/types.ts`) has exactly
two: `publicDescription` and `dmNotes`. **This pass did not add a third
field.** Instead:

- `LocationState.publicDescription` is treated as the player-safe
  description. It already is — every player-facing/Observer-facing read
  path (`getPlayerSafeLocationStates` and friends in
  `src/data/playerSafeProjection.ts`) only ever surfaces fields other than
  `dmNotes`/`enemyIds`, and the side panel renders `publicDescription`
  unconditionally for both DM and player views. There is currently no
  separate "internal/working" description distinct from the player-safe
  one — `title` plus `publicDescription` is the only non-secret text a
  location has.
- `LocationState.dmNotes` is the DM-only field, already excluded from every
  player-safe projection (`stripDmOnlyLocationFields`,
  `getPlayerSafeLocationStates`) before this pass, unchanged here.

**This is a deliberate scope decision, not an oversight**: adding a true
third field (`description` as a DM-internal-but-not-secret summary,
separate from the player-safe text) is a `LocationState`/overlay schema
change. The task's own constraints explicitly forbid starting a new
architecture phase or touching `campaignStore.tsx`'s reducer architecture
casually. Splitting `publicDescription` into two fields would also require
a migration for every existing `LocationState` (seed + overlay) and touch
every render path that currently reads `publicDescription`. If the DM
genuinely needs a third "internal-but-shareable" text field later, that
should be its own small, dedicated change — not bundled into Stage 6B.
Today: **two fields, two audiences, already enforced** is what ships.

NPCs (`Npc = DmNpc`, `src/types/dmCompanion.ts`) have **no DM-only/player-safe
split at all** — `personality`/`goals`/`secrets` are plain optional strings
with no visibility flag, and NPCs are pure seed data (no `npcPatches`/
`newNpcs` in the overlay — see §10). This is the single biggest gap between
the product requirement and what exists; see §10.

## 3. Location templates

```ts
type LocationTemplateType =
  | 'tavern' | 'shop' | 'district' | 'warehouse'
  | 'gate' | 'guild' | 'temple' | 'custom';
```

Implemented as a dropdown in the location creation draft, writing the chosen
value to `LocationState.type` (a pre-existing free-text field). **No
template-specific field sets exist yet** — picking "Таверна" does not surface
rooms/services/rumors/prices/owner-NPC fields, and picking "Лавка" does not
surface goods/inventory/illegal-goods fields. Those are listed in the task's
requirements as full structured schemas; building them is a real, separate
data-model addition (new optional fields on `LocationState`, or a new
`LocationTemplateDetails` sub-object) that was not done in this pass — see
§10. What ships today is the quick categorization (so the DM can at least
tag what a location *is* in one click) plus the existing generic
`description`/`dmNotes`/`npcIds`/`questIds`/`enemyIds`/`imageIds`/`tags`
fields every `LocationState` already has.

dm-companion already has separate `DmTavern`/`DmShop` seed types
(`src/types/dmCompanion.ts`, surfaced read-only today via
`LocationSidePanel`'s "Товары и услуги" section for any location matching
`isMarketLikeLocation`/linked shops). These are **not** DM-creatable from
this app — there is no `addTavern`/`addShop` overlay action, only seed data
loaded from dm-companion's own JSON. A future pass could either (a) make
`DmTavern`/`DmShop` overlay-editable the same way `LocationState` is, or
(b) fold tavern/shop-specific fields directly into `LocationState` via the
template field-set idea above. Neither was decided or built here.

## 4. NPC authoring — what exists, what's missing

**Linking an existing NPC to a location**: already worked before Stage 6B
(`LocationSidePanel`, "Связать с локацией" button per NPC card,
`onLinkToLocation('npcIds', id)` → patches `LocationState.npcIds`). Unlinking
exists too via the inverse toggle. Unchanged, verified still present.

**Creating a brand-new NPC from a location panel ("Create NPC here")**: **not
implemented.** Root cause: `Npc` is a type alias for `DmNpc`
(`src/types.ts` → `src/types/dmCompanion.ts`), and `DmNpc`/NPCs as a whole
have **zero overlay presence** — `CampaignOverlay` (`src/state/overlay.ts`)
has no `npcPatches` and no `newNpcs`, unlike every map/location entity, which
all follow the `xPatches` + `newX` pattern. NPCs today are 100% read-only
seed data sourced from dm-companion's `npcs.json`. Adding DM-creatable NPCs
that persist across reload requires extending `CampaignOverlay` with a new
entity-type slot (`npcPatches: Record<string, Patch<Npc>>`, `newNpcs: Npc[]`),
a new reducer action (mirroring `ADD_LOCATION_STATE`), a `store.addNpc()`
action, wiring `applyOverlayToList` into `campaignDataContext.tsx` for
`npcs`, and a creation form. This is a real, well-understood, *additive*
change (it follows an existing pattern exactly, doesn't touch
`campaignStore.tsx`'s reducer *architecture*, just adds one more case to it)
— but it is still a genuine new feature surface, not a small UI tweak, and
was not built in this pass given the effort budget. It is the single largest
remaining piece of Stage 6B's Definition of Done — see §10 and the final
report.

The full field list the task asked for (name, role, faction, current
location, public description, DM description, what they know, what they
want, relationship to party, time availability, linked quests, portrait,
notes) also does not fit `DmNpc`'s current shape (`name, race, role,
location, personality?, goals?, secrets?, relatedQuests?, image?, tags?`) —
`faction`, `relationshipToParty`, `availability`, and an explicit player-safe/
DM-only split on the narrative fields don't exist on the type today. Any NPC
overlay work should decide up front whether to extend `DmNpc` itself (affects
dm-companion's own data files too, since `Npc = DmNpc` directly) or introduce
a separate `AuthoredNpc`/`NpcOverlayFields` shape — that decision was left
open, not made.

## 5. Unplaced content

Not implemented this pass. The task asked for: NPCs not linked to any
location, battle entries without position, quests without linked location,
locations without position. `LocationState`s with no matching `MapHotspot`
are trivially queryable today (`locationStates.filter(ls => !hotspots.some(h
=> h.locationStateId === ls.id))`) — and after Stage 6A's clean slate, this
set is large (every old location just lost its hotspot). No dedicated panel
surfaces this query yet. This is realistically the most valuable next small
addition, since Stage 6A's archival makes "what needs re-placing" the DM's
actual immediate task — flagged as remaining work.

## 6. Save feedback / reload persistence / mode boundaries / coordinate rules

All four of these were **already correct** before Stage 6B and were not
modified:

- **Save feedback**: every overlay mutation (`addLocationState`, `addHotspot`,
  `patchWorldMapState`, etc.) writes synchronously to `localStorage`
  (`campaignStore.tsx`'s autosave effect) and the store exposes a save-status
  indicator (`'idle' | 'saved' | 'error'`). New fields added in this pass
  (`type`, `dmNotes` on the creation draft) flow through the exact same
  `store.addLocationState()` call, so they get the same feedback for free.
- **Reload persistence**: the overlay/seed merge architecture
  (`applyOverlayToList`, `campaignDataContext.tsx`) is unchanged; anything
  saved via `store.addX`/`store.patchX` survives reload by construction.
- **Mode boundaries**: `useMapWorkspaceMode.ts`'s tool-exclusivity rules
  (View/Placement/Route Edit/Session/Area Edit mutual exclusion) are
  untouched. The location-creation draft still only arms in `dm-edit` mode
  (`isEditMode && locationPlacementDraft`), unchanged.
- **Coordinate rules**: hotspot creation still computes `{x, y}` from the
  existing click-to-normalized-coordinate path in `MapWorkspacePage.tsx`,
  unchanged. Stage 6A's `WorldMap.originalImageWidth/Height/aspectRatio`
  additions (canon-map-rebuild spec §4) are available for this path to
  validate against but nothing was rewired to consume them in this pass —
  the existing math already worked correctly before Stage 6A per the
  technical baseline, so this was left alone rather than risk regressing it
  for a non-required hardening pass.

## 7. Player Safe / Observer safety — re-checked for the new fields

- `dmNotes` (now settable at creation time, not just via later edit): still
  excluded by `getPlayerSafeLocationStates`/`stripDmOnlyLocationFields` —
  these functions strip the field by name, independent of when/how it was
  set. Verified by code reading (not a live browser session this pass — see
  final report).
- `type` (template label): was already a plain visible field
  (`LocationSidePanel` renders `ls.type` as a status badge unconditionally,
  pre-existing code, both DM and player view) — adding it at creation time
  doesn't change its visibility, and a template label like "Таверна" is not
  sensitive information, so no new redaction need was introduced.
- No new entity type, no new overlay slot, and no new render path was added
  in this pass (the NPC-creation gap in §4 means there's no new NPC render
  path to check either) — so the existing, already-verified
  `playerSafeProjection.ts` surface is unchanged and still the single
  chokepoint for player/Observer visibility.

## 8. Definition of Done — actual status

| Criterion | Status |
|---|---|
| DM can create a tavern manually on Greyholm City map | **Partial** — generic location creation with `type: 'tavern'` works; no tavern-specific fields |
| Tavern persists after reload | **Yes** (inherits LocationState/MapHotspot persistence) |
| Has public description, player-safe description, DM notes | **Partial** — public description doubles as player-safe (see §2); DM notes: yes |
| DM can create an NPC from the location panel | **No** — not implemented, see §4 |
| NPC linked to that tavern | N/A (no NPC creation) |
| NPC has own public/player-safe text and DM notes | N/A |
| DM can link an existing NPC to a location | **Yes** — pre-existing, verified still present |
| DM can create a shop using the same pattern | **Partial** — same as tavern, `type: 'shop'` |
| DM can see unplaced content | **No** — not implemented, see §5 |
| Player Safe / Observer never expose DM-only descriptions | **Yes** — verified by code reading |
| Mode guard still works | **Yes** — untouched |
| No route edit/placement/party movement conflicts introduced | **Yes** — only the creation-draft form and its save function were touched |
| Reload preserves changes | **Yes** |
| `npm run lint:hooks` / `typecheck` / `build` | **Pass** — see final report |

## 9. Visual affordances

Out of scope per the task ("do not start Visual Plan Stage 1 design tokens
unless needed for a small local affordance"). The two new form fields
(`type` select, `dmNotes` textarea) reuse the existing `.route-draft-form`
styling and `<label>`/`<select>`/`<textarea>` patterns already used by every
other draft form on this page — no new CSS was added.

## 10. Deferred / remaining work (explicit, not silently dropped)

1. **NPC creation/authoring as a real, persisted overlay entity** — the
   largest gap; requires extending `CampaignOverlay` with `npcPatches`/
   `newNpcs`, a reducer case, a store action, and a creation form. See §4.
2. **Tavern/shop/district/... template-specific field sets** (rooms,
   services, rumors, prices, goods, inventory, illegal goods, reputation
   requirement) — requires either extending `LocationState` or building a
   `DmTavern`/`DmShop` overlay. See §3.
3. **A true third `description` field** distinct from the player-safe text,
   if the DM actually needs one beyond the existing two-field split. See §2.
4. **Unplaced-content panel** (locations without hotspots, NPCs without
   location, quests without location, battle entries without position). See
   §5. Given Stage 6A's clean slate, this is the most immediately useful
   next addition.
5. **Re-placing an existing (now-unplaced) `LocationState`'s hotspot** as a
   distinct flow from "create a brand-new location" — today the only
   hotspot-creation entry point is the new-location draft; there is no
   "pick an existing unplaced location, then click the map" flow yet.
6. **Live browser verification** of the new draft fields and of the Stage 6A
   clean-slate reload behavior — this pass verified via `typecheck`/`build`/
   `lint:hooks` and code reading only; no dev server/browser session was run.
7. **Wiring `WorldMap.originalImageWidth/Height/aspectRatio` into the actual
   coordinate-normalization code path** in `MapWorkspacePage.tsx` — the
   fields exist (Stage 6A) but nothing reads them yet; the pre-existing
   coordinate math was left as-is since it already worked.

   **Resolved in Stage 6B.2** — see §11 below. §1–10 above describe the
   state as of Stage 6B.1 and are kept for history; treat §11 as the
   current source of truth for what's actually done vs. still open.

## 11. Stage 6B.2 — Hardening & Closure

Builds directly on §1–10 above. Scope: make the already-built authoring
flow actually reliable, not add new authoring surfaces.

### 11.1 A real data-loss bug, found and fixed

While live-testing the shop edit flow (§11.4), `playerSafeDescription` and
every `shopDetails` field a DM had just saved **vanished** the moment a
separate, unrelated action (creating an NPC from that same location) ran
afterward. Root cause, in `campaignStore.tsx`'s reducer:

```ts
case 'PATCH_ENTITY': {
  const key = patchesKey(action.kind);
  const existing = state[key] as Record<string, Patch<unknown>>;
  return { ...state, [key]: { ...existing, [action.id]: action.patch } };
}
```

Each call to `store.patchLocationState(id, partialPatch)` **replaced** the
entire previously-stored overlay patch for that id with only the new
partial object — it did not merge with whatever had been patched there
before. `applyOverlayToList` merges the *accumulated patch* onto the *base*
entity (`{...base, ...patch}`), so any field set by an earlier patch call
and not repeated in a later one silently reverted to the base value (i.e.
disappeared, since custom locations have no richer base than what was set
at creation).

This bug **predates Stage 6B** — it's been in the reducer since the
original Stage 1 architecture — but never surfaced before because every
existing call site happened to always submit a *complete* field set on
save (`LocationDataTab`'s edit form, for instance, always sends every
field). Stage 6B.1's `saveNpcCreateDraft()` (`patchLocationState(id, {
npcIds: [...] })`) and the new Stage 6B.2 "Не размещено" quick-link actions
were the first call sites to ever submit a deliberately *partial* patch,
which is what exposed it.

**Fix**: `PATCH_ENTITY` now shallow-merges the new patch onto whatever was
already stored for that id (DELETED still always wins in either
direction). Verified live: edited a shop's `playerSafeDescription` and
full `shopDetails`, then linked/unlinked NPCs and link-quest actions
against the same location, reloaded — every field survived every
combination, repeatedly.

**Anyone using this app before this fix shipped may have silently lost
edits** any time two separate partial-save actions touched the same
location/hotspot/route/placement/npc. There is no way to recover data lost
before the fix (the corrupted state is exactly what got persisted) — this
is called out explicitly so it isn't mistaken for "nothing happened."

### 11.2 Per-map coordinate metadata — global constant removed

`MAP_IMAGE_WIDTH`/`MAP_IMAGE_HEIGHT` (a single global 1448×1086 constant
driving zoom/pan fit-to-screen math, the zone-overlay SVG viewBox, and
faction-zone/route-point pixel math) is gone. Replaced with
`useActiveMapImageSize(map)`, a hook that:

- reads the **active** `WorldMap`'s own `originalImageWidth`/
  `originalImageHeight` (Stage 6A metadata) when present;
- falls back to `FALLBACK_MAP_IMAGE_WIDTH`/`HEIGHT` (still 1448×1086 — every
  canon map currently shares this resolution) when a `WorldMap` is missing
  that metadata, and logs a `console.warn` in dev mode naming the offending
  map id so a future DM-added custom map with unrecorded dimensions doesn't
  silently mis-scale every coordinate placed on it;
- is called **above** the `if (loading)`/`if (error || !data)` early-return
  guards in `MapWorkspacePage`, using `data?.worldMaps.find(...)` (optional
  chaining) rather than after them — calling a hook after those guards is
  the exact Stage 5E hook-order bug class (see the technical baseline doc);
  this was the main risk in this change and was handled deliberately.

Every previous `MAP_IMAGE_WIDTH`/`MAP_IMAGE_HEIGHT` reference
(`renderedImageWidth`/`Height`, the zone SVG `viewBox`, polygon/route-point
pixel conversion) now reads `activeMapImageSize.width`/`.height`. The
plain per-click coordinate math (`handleMapClick`'s `(e.clientX - rect.left)
/ rect.width`) was already resolution-agnostic (it divides by the *actual
rendered* DOM element's pixel size, not an assumed intrinsic resolution) and
did not need to change.

**Remaining limitation**: the fallback is still a single shared constant,
not derived per-map from anything dynamic (e.g. probing the loaded
`<img>`'s `naturalWidth`/`naturalHeight`). This is fine as long as every
`WorldMap` carries real `originalImageWidth/Height` (true for all three
canon maps) — it only matters for a hypothetical future map added without
that metadata, which is exactly when the dev-mode warning fires.

### 11.3 Unplaced-content panel — metric/action mismatch fixed

The "Не размещено" panel's NPC/quest counts originally checked the seed
`location`/`location` field on `Npc`/`Quest` directly, while its own
"Привязать к «...»" quick-link button only ever updated the *selected
location's* `npcIds`/`questIds` array — two different, unrelated
mechanisms. Linking an unplaced quest via the panel's own button therefore
never moved it out of the "unplaced" list, an obviously broken affordance.
Fixed: both filters now also check whether *any* `LocationState` in the
current timeline already lists the NPC/quest in its own `npcIds`/
`questIds`, matching exactly what the link button does. Live-verified:
linking a previously-"unplaced" quest via the panel button now correctly
drops the unplaced count after a reload.

### 11.4 Shop flow — fully live-tested

Previously "built but not live-tested." Now run end-to-end in a real
browser session: created "Лавка «Серебряный Тигель»" on Greyholm City,
filled every shop field (`shopType`, owner NPC via dropdown,
`goodsServices`, `inventoryNotes`, `pricePolicy`, `reputationRequirement`,
`illegalGoods`), saved, reloaded, edited again (after the §11.1 fix),
linked/unlinked NPCs, reloaded again. Every field, including across
multiple separate partial-save actions, now survives. Player View and
Observer were checked directly afterward (§11.6).

A small display gap was also fixed: `LocationSidePanel`'s card view
previously showed `tavernDetails`/`shopDetails` nowhere — a DM filling in
these fields had no way to see them again without re-opening the edit
form. Added a "Лавка — детали"/"Таверна — детали" card section (DM view
shows everything; Player Safe view shows only owner/goods/rooms/rumors,
gating `inventoryNotes`/`pricePolicy`/`reputationRequirement`/
`illegalGoods`/`staffNpcIds`/`pricesNotes`/`troubleHooks`/`secrets` behind
`!isPlayerView` — "hidden unless explicitly player-safe," matching §2's
existing rule). `stripDmOnlyLocationFields` in `playerSafeProjection.ts`
was extended to strip the same sub-fields for defense-in-depth, even though
Observer doesn't currently render location cards at all (§11.6).

### 11.5 NPC create/link/unlink — fully live-tested, including hidden NPCs

- **Create visible NPC** ("Подмастерье Лина") and **create hidden NPC**
  ("Тайный Скупщик Ворн", `visibleToPlayers` unchecked) from the shop's
  "Создать NPC здесь" form — both saved, both survive reload, both visible
  to the DM (`NPC (2)` in the DM card).
- **Player View**: shows `NPC (1)` — only the visible NPC. The hidden one
  never appears, confirmed by direct DOM text check, not just visual
  inspection.
- **Link existing NPC** ("Гретхен Сольвейг", already created in an earlier
  session) to the shop via the pre-existing `CheckboxList` — no duplicate
  created, appears in the linked list, survives reload.
- **Unlink** ("Тайный Скупщик Ворн" removed from the shop's links) —
  confirmed the NPC count dropped (3→2) after reload, **and** confirmed
  separately that the NPC itself still exists and is still offered in the
  "Связать с локацией" / `CheckboxList` picker (i.e. unlink never deletes).
- **Cross-arc safety**: unchanged from Stage 6B.1 — `npcsForArc` filters by
  `activeArcId`, and every NPC created via "Создать NPC здесь" inherits
  `arcId` from the selected location's own timeline, so it can never appear
  under the wrong arc. Not separately live-tested with a second arc this
  pass (Arc 2 has no seeded map content to test against, by design).

**CheckboxList search** (§4/§5 follow-up): `CheckboxList` already had a
built-in name-filter `<input type="search">` — not noticed in the Stage
6B.1 report. Improved this pass: the NPC `labelOf` callback in
`LocationLinksTab` now folds role and faction into the searchable/displayed
label (`"Гретхен Сольвейг · Хозяйка таверны"`), so the existing filter also
matches by role/faction, not just name. No new component was built — the
"smallest solid version" the task asked for already existed and only
needed this one-line improvement.

### 11.6 Player Safe / Observer regression — explicitly re-verified

All five checks live-tested in a real browser session (DM Edit → Player
View → Observer, with reloads between):

1. Tavern with DM notes: DM sees them; Player View and Observer do not.
2. Shop with `illegalGoods`/`inventoryNotes`/`pricePolicy`/
   `reputationRequirement`: DM sees them; Player View shows only the
   player-safe description, owner, and goods/services; confirmed via
   direct `document.body.textContent` checks that none of the hidden text
   leaked into Observer's page either (Observer still doesn't render
   location cards at all today — §11.4 — so this is really "confirmed it
   stays that way," not "found a new leak and patched it").
3. Visible NPC: appears in Player View's linked-NPC list.
4. Hidden NPC: absent from Player View's linked-NPC list and from
   Observer; `getPlayerSafeNpcs()` (added Stage 6B.1) is the chokepoint.
5. Stage 5H smoke-test `BattleEntry`/`CampaignEvent`: untouched this pass,
   still shows `Скрыта (только ДМ)` in the DM panel throughout every test
   in this session, never appeared in Player View or Observer.

### 11.7 Mode guard — verified by code reading, not new live clicks

`handleMapClick` in `MapWorkspacePage.tsx` was read in full this pass to
confirm the guard order: Movable-Entity-move → Battle-Entry-create →
Quick-Pin → Placement-mode → **View Mode early-return (deselect only)** →
Area-Edit-Mode (zone draft / editing zone, each `return`s before reaching
location-creation code) → Route-Edit-Mode (`editingRouteId`, appends a
route point and `return`s) → **`if (!placingHotspot) return`** → only then
does the location-creation draft get armed. This confirms every rule in
the task's mode-guard checklist holds by construction, unmodified by any
Stage 6B change. Not re-verified with fresh live click sequences this pass
(the live session instead focused on the higher-value new-bug-hunting
described in §11.1–11.5); recommended as a lighter-weight follow-up if a
future change touches `handleMapClick` directly.

### 11.8 What's still open before Stage 6C / Visual Plan

- Template-specific NPC role pickers (e.g. a dedicated "staff" multi-select
  instead of the comma-separated id text field) — cosmetic, not a
  correctness gap.
- `DmTavern`/`DmShop` (the separate, pre-existing dm-companion seed types)
  are still not editable via this app — `LocationState.tavernDetails`/
  `shopDetails` is the parallel, DM-creatable path and is what this stage
  hardened; reconciling the two is a deliberate non-goal for now.
- A true third `description` field distinct from the player-safe text
  (§2) — still not built; still believed unnecessary unless a DM actually
  asks for it.
- Re-placing an *existing* unplaced `LocationState`'s hotspot as a flow
  distinct from "create a brand-new location" — still not built; the
  "Не размещено" panel's "Открыть" action selects/focuses the location but
  does not arm a "place this on the map" tool.
- Visual polish — deliberately untouched per this stage's brief.

## 12. Stage 6B.3 — Manual Authoring Closure & Visual Handoff Prep

### 12.1 Place an existing unplaced location ("Разместить на текущей карте")

Closes the §11.8 gap above. New one-shot arming state
`placingExistingLocationId` (sibling of `manualMoveArmedForEntityId`,
`quickPinArming`, etc. — same mutual-exclusion contract, cleared by
`cancelAllEditTools()` and by Escape via a small dedicated `useEffect`).
The Unplaced panel's per-location row now has a second button,
"Разместить на текущей карте", next to the existing "Открыть". Clicking
it arms placement for that location's id and shows an inline instruction
("Кликните по карте, чтобы разместить выбранную локацию.") with a Cancel
button. The next map click in `handleMapClick` (new branch placed
immediately after the existing `manualMoveArmedForEntityId` branch, and
before Battle-Entry/Quick-Pin/Placement-mode/View-Mode, matching the
established "one-shot arm → next click consumes it" guard ordering) reads
the click position the same way every other placement tool does
(`mapRef.current.getBoundingClientRect()`, clamped to `[0,1]`), and calls
only `store.addHotspot(...)` + `store.patchWorldMapState(...)` — it never
calls `store.addLocationState(...)`, so the existing `LocationState` is
reused verbatim, not duplicated. Live-tested: armed placement for
"Королевство Аурелон" (a real unplaced `LocationState` from the seed,
chosen off the 29-item list), clicked the map, marker appeared
immediately, "Локации без точки на карте" count dropped 29 → 28, hotspot
service-list count rose 2 → 3, and a full page reload preserved hotspot
count 3 with the marker still present — confirms no duplicate
`LocationState` and real persistence, not just in-memory state.

### 12.2 Move/re-place an existing placed location ("Переместить локацию")

New one-shot arming state `movingHotspotId`. Button added to
`LocationSidePanel`'s header (DM-only — `!isPlayerView` gated, never
rendered in Player View/Observer), shown whenever the selected location
has an existing hotspot (`ownHotspot`, already computed in that
component). Arms `movingHotspotId`; the next map click calls
`store.patchHotspot(movingHotspotId, { x, y })` — updates in place, never
creates a new hotspot. Cancel button + Escape supported, same as §12.1.
Live-tested: selected the just-placed "Королевство Аурелон" marker,
clicked "Переместить локацию", clicked a different point on the map,
hotspot count stayed at 3 (no duplicate), and a reload preserved the
service-list count at 3. Because the position only changes once
`patchHotspot` is called (on click, not on arm), Observer/Player Safe —
which only ever read the persisted hotspot list — cannot show an
intermediate/ghost position; there is no intermediate position to read in
the first place.

### 12.3 Tavern staff picker: comma-separated id input → CheckboxList

`LocationDataTab`'s "Персонал (id NPC через запятую)" raw text input is
replaced with the same `CheckboxList` component used for NPC/quest/enemy
linking elsewhere (`src/components/CheckboxList.tsx` — built-in search,
filterable). `draft.tavern_staffNpcIds` is still stored internally as a
comma-joined string (no save-path change needed — the existing save logic
still just splits on comma), but the UI now toggles ids via checkboxes
with `name · role (faction)` labels instead of asking the DM to type raw
ids. NPCs already linked to the location (`ls.npcIds`) are sorted to the
top of the list. Owner remains the pre-existing `<select>` (already
adequate per the original brief; not changed). "Create owner NPC here"
was not added this pass — the existing "Создать NPC здесь" flow (Stage
6B.1, in the Связи tab) already covers NPC creation from a selected
location; a tavern-specific shortcut button was judged not worth the
added surface area today. Live-verified in-browser: opened "Таверна
«Дохлая крыса»" → Данные локации → Редактировать, confirmed the Персонал
row renders checkboxes plus a search box, and the existing owner
(`Магнус Беллвезер · Владелец таверны «Золотой Колокол»`) appears with
its role/context in the label.

### 12.4 Missing NPC ref safety (owner)

`LocationSidePanel`'s tavern/shop "Владелец" display previously fell back
to printing the raw `ownerNpcId` string if the NPC wasn't found — a
DM-internal id, harmless in DM Edit/View but a real (if minor) leak risk
if it ever rendered in Player View, since the whole tavern/shop "details"
card is not blanket-gated by `isPlayerView` (only specific sub-fields
are — by design, since e.g. "owner" and "rumors" are meant to be visible
to players). Fixed: if the owner NPC isn't found, Player View renders
nothing for that line; DM views render a `dm-only`-styled warning
("не найден NPC с id «...» — проверьте ссылку") instead of the bare id.
Applied identically to both `tavernDetails.ownerNpcId` and
`shopDetails.ownerNpcId`. Not exercised live with an actually-broken
reference this pass (no broken ref existed in the data to test against);
verified by reading the render logic and confirming the `isPlayerView`
branch returns `null`.

### 12.5 `DmTavern`/`DmShop` vs `LocationState.tavernDetails`/`shopDetails` — reconciliation note

Inspected `src/types/dmCompanion.ts` directly this pass. Confirmed:
`DmTavern`/`DmShop` are a separate, read-only seed dataset
(`taverns.json`/`shops.json` via `loadCampaignData.ts`), keyed by a
dm-companion `location: string` id that has **no relationship** to
`LocationState.id`, `MapHotspot`, or anything map-position-related — they
predate the map workspace entirely. They have richer sub-structure than
the new fields (`menu`/`rooms` with prices for taverns, `items` with
prices/availability/quality for shops) that `LocationState.tavernDetails`/
`shopDetails` does not attempt to replicate. There is **no overlay slot**
for either type (no `tavernPatches`/`newTaverns` in `CampaignOverlay`) —
they are not DM-editable from inside this app at all, by design, same as
NPCs/quests/enemies/images before their own overlay slots were added.

**Decision: do not bridge them this stage.** Reasons: (1) the two
datasets are keyed by entirely different id spaces (dm-companion location
id vs. `LocationState.id`, which is `${locationId}__${timelineId}`) with
no recorded mapping between them; guessing a mapping risks silently
linking the wrong tavern to the wrong map pin. (2)
`LocationState.tavernDetails`/`shopDetails` already cover the
*map-authoring* need this stage targets (a DM placing a tavern pin on the
new canon map and giving it basic details) — that's a different use case
from "browse the pre-written `DmTavern` library," and conflating them
risks creating two sources of truth for the same concept with no clear
winner. (3) No instruction this stage asked for a `DmTavern` browser/
picker UI inside the map workspace.

**What the DM should do today**: treat `LocationState.tavernDetails`/
`shopDetails` (this app, map-pin-attached) as the only taverns/shops that
exist *on the new canon maps* — they are the practical path for Stage 6B
content. `DmTavern`/`DmShop` library entries describe the *old* map's
taverns/shops and are not linked to any new pin; the DM should treat them
as reference prose to copy from when filling in a new map-pin's
`tavernDetails`/`shopDetails`, not as live data. A future unification
stage, if wanted, would need an explicit DM-driven "link this map
location to this DmTavern" action (not auto-matching by name/location-id),
at which point an overlay slot for `DmTavern`/`DmShop` patches would need
to be added following the same pattern as `npcPatches`/`newNpcs`.

### 12.6 Unplaced panel: bounded lists + new action

Each of the three list categories that can plausibly grow large
(locations-without-hotspot, NPCs-without-location, quests-without-location)
is now capped at 30 visible rows with a "Показать ещё (N)" button to
reveal the rest — `battleEntriesWithoutPosition` was left uncapped since
nothing in this campaign's data has ever produced more than single digits
there. Confirmed live: with 29 unplaced locations (under the 30 cap) no
"Показать ещё" button rendered; the cap logic was verified by code
reading (slice to `LIST_CAP`, conditional button) rather than by
manufacturing 31+ fake locations to force the boundary, which was judged
not worth the data mutation for a one-line slice bound.

### 12.7 Mode-guard live click tests (this pass)

Four of the five required modes were exercised with real clicks this
pass:

- **Placement Mode** (the new §12.1/§12.2 tools specifically): armed →
  clicked map → hotspot created/moved → reload confirmed exactly one
  hotspot landed (no duplicate either time).
- **View Mode**: switched to "DM View", clicked empty map — hotspot-label
  count stayed at 3 (unchanged), confirming the existing
  `if (!isEditMode) { deselect; return; }` guard still holds with the two
  new arming branches inserted above it in `handleMapClick`.
- **Route Edit Mode**: armed "Построить маршрут", clicked the map —
  hotspot-label count stayed at 3 (the click only affects the in-progress
  route, never creates a location/hotspot or moves the party).
- **Area Edit Mode**: armed "Новая зона", clicked the map — hotspot-label
  count stayed at 3 (the click only appends a polygon vertex, never
  creates a location/hotspot or moves a route point).

Not re-clicked fresh this pass: **Session Mode**'s party/runtime-vs-
prepared-content separation specifically (e.g. confirming "Партия здесь"-
style runtime actions stay separated from prepared-content edits behind
an explicit edit flow). This was verified by code reading only this pass
(the existing `isPlayerView`/`isEditMode` branch structure around party
actions was not touched by any Stage 6B.3 change). This is the one
remaining live-click gap against the hard constraint — see the verdict
below.

### 12.8 Player Safe / Observer re-verification (this pass)

Re-checked after all of §12.1–12.6 landed: Player View hides the
"Не размещено" tab/button entirely, hides both new "Разместить на текущей
карте" and "Переместить локацию" buttons entirely (confirmed by string
search over the rendered DOM, not just code reading), and the tavern
owner-not-found warning added in §12.4 is `isPlayerView`-gated to render
nothing. Not independently re-opened in a separate Observer browser tab
this pass (Player View toggle was used as the proxy, consistent with
prior stages' verification method) — the actual `/observer` separate-
window route was not re-run fresh.

### 12.9 Visual Plan Stage 0 readiness — explicit verdict

**Not fully clear.** Per-item against the hard constraint:

- Existing unplaced location placement works — **yes**, live-tested with
  reload persistence (§12.1).
- Location move/re-place works — **yes**, live-tested with reload
  persistence (§12.2).
- Owner/staff NPC picker is safer than raw IDs — **yes** for staff
  (CheckboxList); owner was already a `<select>` before this stage
  (§12.3).
- Mode guards were live-click-tested — **partially**. Placement Mode (the
  new tools), View Mode, Route Edit Mode, and Area Edit Mode were all
  actually clicked this pass; Session Mode's party/runtime-vs-prepared-
  content separation was verified by code reading only (§12.7).
- Player Safe / Observer safety was rechecked — **partially**. Player
  View was rechecked live; the separate Observer route was not opened
  fresh this pass (§12.8).
- Reload persistence was verified — **yes**, for both new flows (§12.1,
  §12.2).
- Gates pass — **yes**, all four, lint at the unchanged 7-error/3-warning
  baseline.

Given two of the seven items are partial rather than fully satisfied,
this report does **not** declare the project unconditionally ready for
Visual Plan Stage 0. The two remaining gaps (a live Session Mode click
test; a fresh Observer-route open) are narrow, mechanical verification
tasks against code that was not touched by this stage's behavioral
changes — not unknown risk — so a short, targeted follow-up session
closing exactly those two gaps should be sufficient before declaring
readiness, rather than re-running this entire stage.

## 13. Stage 6B.4 — Final Manual Authoring Readiness Gate

Closes the two §12.9 gaps with fresh live tests (no code changes — this
stage is verification-only).

**Session Mode live-click**: opened Greyholm City (confirmed tavern,
shop, the Stage 6B.3 test location, and NPC links all still present —
hotspot count 3, no resurrected routes/zones/quick pins), opened
"Текущая сессия" (the Session Mode panel), clicked an empty area of the
map while it was open — hotspot count stayed at 3, no `route-draft-form`
appeared, nothing was mutated. The panel itself only exposes runtime/
summary content (active quests, nearby objects, battle status, "+
Событие текущей сессии") — prepared-content edits remain behind the
explicit Карточка/Данные локации/Связи tabs, never behind a map click
while Session Mode is open. A reload after this confirmed hotspot count
still 3 — no accidental content appeared.

**Fresh Observer route**: navigated to `/observer` directly (not the
DM-side Player View toggle used in Stage 6B.3 — the actual separate
route). Confirmed: renders the city map background and exactly the two
player-visible markers (tavern, shop) — the DM-only "Королевство
Аурелон" test pin correctly does not appear. `document.querySelectorAll('button').length`
is **zero** — no edit/placement/runtime-write affordances exist on this
route at all. String search over the full rendered DOM confirmed absence
of: "Не размещено", "Заметки ДМ", inventory/reputation text, route-edit
draft markup, `battleMapUrl`, `returnUrl`, "Smoke Test" (the Stage 5H
smoke-test battle entries), the hidden NPC "Магнус Беллвезер", and any
trigger text. Party token absent (no current party position is set in
this campaign's data, so this is the correct "nothing to show" case, not
a leak).

**Gates re-run**: `lint:hooks` PASS, `typecheck` PASS, `build` PASS,
`lint` → 7 errors / 3 warnings (unchanged baseline).

**Verdict: both remaining gaps from §12.9 are closed.** Manual Content
Authoring (Stage 6B.1 → 6B.4) is now considered fully closed. Visual Plan
Stage 0 is allowed to start.

## 14. Visual Handoff Cleanup (before Visual Plan Stage 1)

The Stage 6B.4/Visual Plan Stage 0 smoke testing left two artifacts that
needed a decision before starting Stage 1:

- **Test route** (Tavern → Shop, 2 points, Greyholm City): identified
  with full confidence as the smoke-test route — it was the *only* route
  in the entire overlay (`newRoutes`/`routePatches` in
  `campaign-timeline-vtt:overlay:v2`), and its id/label/hotspot ids
  matched exactly what the prior session created. The in-app delete
  button opens a native `confirm()` dialog that the browser-automation
  tooling cannot click through, so it was removed via a direct,
  surgical `localStorage` edit instead: removed from `newRoutes`,
  removed its `routePatches` entry, and cleared the dangling
  `party.currentPartyRouteId` pointer that referenced it. Nothing else
  in the overlay was touched. Verified after reload: zero routes remain,
  hotspot count unchanged (3), Observer shows no stray route data.
- **Party position**: left at "Лавка «Серебряный Тигель»" (where the
  travel test ended) — this is ordinary DM runtime state, not test
  garbage, and resetting it wasn't asked for.

## 15. Visual Plan Stage 1 — Design Tokens & Dark Fantasy Foundation

A real, dark-fantasy-themed token system already existed in `src/index.css`'s
`:root` (colors, one shadow, a few aliases — see the pre-existing "Etap I
visual-foundation cleanup" comment). This stage added the categories that
were still missing — spacing, radius, additional shadow shapes, a
documented z-index scale, motion durations, and semantic color aliases
(`--color-dm-only`, `--color-player-visible`, `--color-route-active`,
etc.) — purely additively; no existing token or rule was removed or
renamed, so nothing already on screen changed color.

On top of the tokens, this stage added opt-in button-hierarchy classes
(`.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.btn-danger`,
`.btn-compact`) and badge modifiers (`.status-badge--dm-only`,
`--player-visible`, `--hidden`, `--active`, `--danger`, `--saved`,
`--error`, `--draft`, `--invalid`, `--time-gated`, `--observer-safe`) and
wired them into the highest-traffic, clearest-semantics spots only:
location-placement-draft Save/Cancel, NPC-create-here Save/Cancel, the
route editor's Готово/Undo/Очистить/Отменить group, the per-hotspot and
"delete all routes" destructive buttons, and the location-panel
"Внутреннее описание"/"Player Safe" description badges. Every other
button in the app (there are hundreds across `MapWorkspacePage.tsx`)
deliberately kept its existing unclassified style — this stage did not
attempt a mass conversion, per the brief's "no full redesign" constraint.

Live-verified: Save/Cancel buttons render with the new classes
(`btn-primary`/`btn-ghost`), the description badges render in gold
(dm-only) vs. green (player-visible) and are readable, a placement-draft
armed→cancel cycle still creates zero garbage, Player View and a fresh
`/observer` open both remain free of the DM-only badge text and of any
button at all on the Observer route. Gates re-ran clean at the unchanged
7-error/3-warning baseline.

Deferred to a future visual stage (not done this pass, to keep this
stage's blast radius small): applying the new button/badge classes to
the remaining majority of buttons/badges in the file; a dedicated
`src/styles/tokens.css` split (kept in `index.css` since that's where the
existing token block already lived); any layout/spacing rework using the
new spacing scale.

## 16. Stage 6C — DM Companion Content Library Sync & Placement Tray (MVP)

### 16.1 Why this stage exists

The "Не размещено" panel (§§11.5/12.6) already exposes Locations, NPCs,
Quests, and BattleEntries for placement/linking — those entity types
*are* `LocationState`/seed records that the map workspace already reads.
What it never exposed is the **separate, older `DmTavern`/`DmShop`
library** (`src/types/dmCompanion.ts`, loaded read-only via
`loadCampaignData.ts` from `public/data/dm-companion/{taverns,shops}.json`)
— §12.5 documented this library as real DM content with no map-placement
path at all. This stage adds exactly that path, for taverns and shops
(the two entity types explicitly named as a closing requirement),
without touching the existing NPC/quest/battle-entry placement flows.

### 16.2 Data audit (this pass)

`public/data/dm-companion/*.json` (dated newer than the most recent
`dm-companion` app `campaign.zip` export checked this session, per
direct user confirmation) is the live source `loadCampaignData.ts`
already fetches into `CampaignData.taverns: DmTavern[]` /
`CampaignData.shops: DmShop[]`. Confirmed live: 3 taverns, 6 shops on
Arc 1. These are read-only in this app (no `tavernPatches`/`shopPatches`
overlay slot exists, by design — see §12.5) — this stage does not change
that; it only adds a way to *place* them.

### 16.3 What was built

- New `LocationState.sourceLibraryId?: string` /
  `sourceLibraryType?: 'tavern' | 'shop'` field (`src/types.ts`) — a
  non-duplication marker only, set once when a card is placed.
- New side-panel tab **"Библиотека"**, DM-only (only rendered when
  `isEditMode`, same gate as every other authoring tab — never reachable
  from Player View or `/observer`). Shows two sections, Taverns and
  Shops, each card with name/type/truncated description, a "Размещено на
  карте" / "не размещено" badge, and a "Разместить на карте" button
  (disabled once placed). Has its own search box and a 30-item-per-section
  cap with "Показать ещё".
- New one-shot arming state `placingLibraryEntity` (same
  arm → instruction banner → click-consumes pattern as every prior
  placement tool; cleared by `cancelAllEditTools()` and by Escape).
  Clicking the map while armed calls `store.addLocationState(...)` once
  (materializing title/type/description/owner from the `DmTavern`/
  `DmShop` record into a brand-new `LocationState` tagged with
  `sourceLibraryId`/`sourceLibraryType`) followed by `store.addHotspot(...)`
  — mirroring the Stage 6B.1 `saveLocationPlacementDraft` pattern, except
  prefilled from library data instead of an empty DM-typed form.
- The source `DmTavern`/`DmShop` record is never mutated, copied
  wholesale, or deleted — only its name/description/owner/services are
  read once to seed the new `LocationState`. A tavern/shop already placed
  shows the disabled "Уже размещено" state, so the same library record
  cannot be placed a second time from the panel.

### 16.4 What was deliberately not built this pass

Per the brief's note that the original full 10-section/10-entity-type
Stage 6C request was superseded by a later message prioritizing cleanup
+ Stage 1, this pass implements the **closing-requirement subset only**:
taverns and shops, click-to-place only (no drag-and-drop), no "Link to
selected location" action (taverns/shops always get their own hotspot,
not a link), and no dedicated "Open full card" view (none exists for
`DmTavern`/`DmShop` today — building one was judged out of scope for an
MVP slice). NPCs/Quests/Enemies/BattleEntries/Images already have their
own placement/linking paths via the Unplaced panel and are unchanged.

### 16.5 Live verification

Opened Greyholm City → Библиотека, confirmed real counts (3 taverns, 6
shops) sourced from `public/data/dm-companion`. Armed "Разместить на
карте" for "Таверна «Северный Очаг»", clicked the map: hotspot count
3 → 4, marker appeared, card immediately flipped to "Размещено на карте"
with its button disabled. Reload: hotspot count stayed 4 (no duplicate
`LocationState`/hotspot pair created). Player View: Библиотека tab and
all of its content absent (`includes('Библиотека')` → false; no "Размещено
на карте" string anywhere). Fresh `/observer`: zero buttons, the new
player-visible tavern marker present in the rendered text content, no
Library leak. Mode guard: arming a library placement then starting
"Построить маршрут" (Route Edit Mode) correctly cleared the armed library
placement via the existing `cancelAllEditTools()` chokepoint — confirmed
live, not just by code reading. Escape-cancel confirmed live (armed →
Escape → re-checked in a separate eval call → cleared, hotspot count
unchanged at 4).

### 16.6 Stage 6C.1 — Locations and NPC sections added to Библиотека

Closes the consolidation gap noted in the original §16.6: the Библиотека
tab now has four sections — **Локации**, **NPC**, **Таверны**, **Лавки**
— instead of just the latter two. Locations and NPC reuse the exact same
state/handlers the pre-existing "Не размещено" panel already used
(`placingExistingLocationId` for locations, the same `npcIds` patch call
for NPC linking) — no new placement mechanism, no duplicated logic, just
a second UI surface over the same data and the same actions. The
"Не размещено" panel itself is unchanged and still exists (it shows only
*unplaced* items across more categories — locations/NPC/quests/battle
entries — whereas Библиотека shows *all* items per section with a
placement-state filter); the brief explicitly allowed keeping both.

Added to the panel:

- A placement-state **filter** (Все / Не размещено / На этой карте / На
  другой карте / Только связано) shared across all four sections.
- A **"На другой карте"** badge for locations placed on a different map
  than the one currently open — computed from `data.hotspots` (all maps)
  vs. the current map's own `hotspots` array, never stored separately.
- An **NPC "Связать с «<location>»"** action, enabled whenever a location
  is selected on the map — calls the same `patchLocationState(..., {
  npcIds: [...] })` the Связи tab's own linking already uses.
- A 30-item cap + "Показать ещё" per section (Локации/NPC/Таверны/Лавки
  each capped independently).

Live-verified this pass: opened Библиотека on Greyholm City — Локации
(32), NPC (46), Таверны (3), Лавки (6), all real counts. Placed an
unplaced location ("Калдран") via its card: hotspot count 4 → 5, card
flipped to "На этой карте" with a disabled button, reload kept it at 5
(no duplicate). Linked an NPC ("Эдрик Штальвейн") to the selected tavern
via its card's "Связать с …" button: confirmed in the overlay
(`locationStatePatches`) that `npcIds` actually gained the NPC id, and
confirmed the location's own Карточка tab now lists the NPC — both before
and after a reload. Player View: Библиотека tab, the placement-filter
dropdown, and the "На этой карте" badge text are all absent (only the
location's own player-safe rumors text, which legitimately mentions
"контрабанду", was visible — verified this wasn't the DM-only note by
checking for the DM-notes string specifically, which was absent). Fresh
`/observer`: zero buttons, no Библиотека, the linked NPC does not appear
(NPCs are not rendered as Observer map markers in this app at all, by
design — only locations are).

### 16.7 Remaining work after Stage 6C.2 (see §17)

- Quest/Enemy/Image/BattleEntry cards inside Библиотека — the Unplaced
  panel still covers quests/battle-entries via its own UI; enemies/images
  have no placement path from either panel yet.
- Drag-and-drop placement (click-to-place only today).
- A unified `MapLibraryCard` view-model type, if a second consumer of the
  same projection ever appears — not introduced yet since the only
  consumer is this one panel (no premature abstraction).
- "Open full card" / preview drawer for `DmTavern`/`DmShop` — none exists
  anywhere in the app yet, including outside the map workspace.

## 17. Stage 6C.2 — Placement-first DM Companion Library (map-click picker)

### 17.1 Why this stage exists

Stage 6C/6C.1 made existing taverns/shops/locations placeable, but only
from the narrow right-hand "Библиотека" tab. The default map-click flow
("Разместить локация" → click) still always opened the big "Новая
локация" form, so placing *existing* prepared content required the DM to
first find it in the side panel rather than just clicking where it goes.
This stage fixes that one specific gap: the map-click flow itself.

### 17.2 What changed

Clicking the map with "Разместить локацию" armed no longer immediately
opens the "Новая локация" form. Instead the clicked point is stored as
`pendingPlacementPoint`, and an **Existing Object Picker** modal opens by
default, centered over the map: title "Что разместить здесь?", subtitle
showing the current map name and clicked coordinates, a search box, and
tabs for Локации / Таверны / Магазины / NPC. Locations/taverns/shops show
cards (title, type, description snippet, "Разместить здесь" / "Уже
размещено") that place the *existing* record at the clicked point
immediately on click — no second map click needed. A secondary button at
the bottom, "Создать новый объект вместо выбора готового", is what now
opens the old "Новая локация" form (using the same captured point) — it
is no longer the default.

The NPC tab does not place a marker (NPCs still have no independent map
pin in this app — see §16.4); it shows a note pointing the DM to link
NPCs from a placed location's card instead, rather than silently doing
nothing.

### 17.3 Source-of-truth / no-duplication

Placing a `LocationState` from the "Локации" tab only ever creates a new
`MapHotspot` pointing at the already-existing `LocationState` (same code
path as the existing Stage 6B.3 "Разместить на текущей карте" button).
Placing a `DmTavern`/`DmShop` card reuses the exact Stage 6C
materialization logic (one `LocationState` + one `MapHotspot`, tagged
`sourceLibraryId`/`sourceLibraryType`, source record never mutated); a
tavern/shop already materialized onto any map shows "Уже размещено" and
is disabled in the picker, exactly like the Библиотека tab.

### 17.4 Mode guard / cancel

The picker only ever opens from the existing `placingHotspot` one-shot
arm — Route Edit Mode and Area Edit Mode clicks are handled by earlier,
unconditional branches in `handleMapClick` and never reach this code, so
they cannot open the picker. `cancelAllEditTools()` (the existing
mutual-exclusion chokepoint) clears `pendingPlacementPoint` along with
every other one-shot tool. Escape closes the picker and discards the
pending point, same as the other Stage 6B.3 one-shot tools.

### 17.5 Player Safe / Observer

The picker, the pending point, and the "Библиотека" tab are local
component state inside `MapWorkspacePage` (DM Edit only) and are never
rendered on the Observer route or in the Player Safe projection — there
is no new code path that touches `playerSafeProjection.ts`.

### 17.6 Verified this pass (live browser)

- Placing an existing unplaced location ("Грейхольм") from the picker:
  one new `MapHotspot` only, no new `LocationState`; persists after
  reload.
- Placing a tavern ("Таверна «Синяя Форель»") from the picker: one new
  `LocationState` (`sourceLibraryType: 'tavern'`, full description/owner/
  rooms/rumors carried over) + one `MapHotspot`; the already-placed
  tavern showed "Уже размещено" and was disabled.
- Escape closes the picker without creating anything.
- "Создать новый объект вместо выбора готового" still opens the old
  "Новая локация" form with the point pre-filled.
- `npm run lint` / `lint:hooks` / `typecheck` / `build` all pass; full
  lint baseline unchanged (7 errors / 3 warnings, pre-existing, unrelated
  to this change).

### 17.7 Not done this pass (unchanged from §16.7)

Quest/Enemy/Image/BattleEntry placement from the picker, drag-and-drop,
and an NPC map marker are still out of scope — see §16.7.

## 18. Stage 6C.4 (partial) — right-panel scroll fix & Battle Map VTT routing

Stage 6C.4 was requested as a large multi-part stage (card UX overhaul,
standalone NPC markers, an object card editor, an image picker, plus
this section's two fixes). Only the two items below were implemented
and verified this pass; the rest (Parts B–F of the request — richer
card layout/images in the picker, standalone NPC placement, the object
editor, the image picker) are **not done** and remain open work.

### 18.1 Right side panel horizontal scrollbar (fixed)

Cause: `.side-panel-tabs` (up to 8 tab buttons: Карточка/Точка на
карте/Данные локации/Связи/Маршруты/Объекты/Не размещено/Библиотека)
was a non-wrapping flex row inside the fixed 400px/42vw
`.workspace-side-panel`, plus several inner elements had no
`min-width: 0`, so a flex/grid child's intrinsic content width pushed
the whole panel into horizontal overflow instead of wrapping.

Fix (`src/index.css`):
- `.workspace-side-panel`: added `overflow-x: hidden`, `box-sizing:
  border-box`, and a blanket `* { min-width: 0; }` for all descendants
  so flex/grid children can shrink instead of forcing overflow.
- `.workspace-side-panel img`: `max-width: 100%; height: auto;`.
- `.workspace-side-panel h1/h2/h3/p/span/strong`: `overflow-wrap:
  anywhere;` so long names/breadcrumbs wrap instead of overflowing.
- `.side-panel-tabs`: `flex-wrap: wrap` (was non-wrapping) — tabs now
  flow onto a second row instead of overflowing.
- `.side-panel-breadcrumb`: `flex-wrap: wrap` for the same reason.

Verified live: selected "Лавка «Серебряный Тигель»" with all 8 tabs
visible — `el.scrollWidth === el.clientWidth` (384px), no horizontal
overflow; tabs visibly wrap onto two rows in the screenshot.

### 18.2 Battle Map VTT routing (fixed)

Cause: `BATTLE_MAP_VTT_BASE_URL` (`src/config.ts`) was a stale
`http://localhost:5174` placeholder that never matched any real app
(neither the correct Battle Map VTT port nor dm-companion); the
launched URL also used `URL().searchParams.set(...)`, which appends
query params to the real (pre-`#`) search string — useless against a
hash-routed app like Battle Map VTT (`/#/maps?arc=...`), since its
router reads params from inside the hash.

Fix:
- `src/config.ts`: split into `BATTLE_MAP_VTT_ORIGIN =
  'http://localhost:4174'` (plain origin, for static battle-map preview
  image URLs) and `BATTLE_MAP_VTT_BASE_URL =
  '${BATTLE_MAP_VTT_ORIGIN}/#/maps'` (the hash-routed launch URL).
- `battleMapManifestHelpers.ts` / `BattleMapThumbnail.tsx`: switched
  from `BATTLE_MAP_VTT_BASE_URL` to `BATTLE_MAP_VTT_ORIGIN` for preview
  image src construction — these concatenate a manifest-relative path
  (e.g. `/battle-maps/foo.png`) onto the constant, which would have
  landed inside the hash fragment and 404'd if left pointed at the new
  hash-routed `BATTLE_MAP_VTT_BASE_URL`.
- `battleMapLaunch.ts`'s `appendContextParams`: now detects a `#` in
  the base URL and rebuilds the hash's own query string instead of the
  real one, preserving the plain-URL code path unchanged for any
  non-hash override URL.
- `battleMapContract.ts`: added an `arc` param key, distinct from the
  existing `timelineId` (this app's per-arc timeline id, e.g.
  `arc-1-peace`, which the VTT app doesn't understand).
- `BattleEntryPanel.tsx`'s `handleOpenBattleMap`: resolves
  `Timeline.arcId` (`arc-1`/`arc-2`) from `entry.timelineId` via the
  existing `TIMELINES` table and passes it as `arc` in the launch
  context.

Verified: reproduced `appendContextParams`'s hash-handling logic
against a sample context and got
`http://localhost:4174/#/maps?arc=arc-1&timelineId=arc-1-peace&battleEntryId=be-test&battleMapId=greyholm-market`
— params correctly land inside the hash, `arc=arc-1` present. The
legacy bare "Открыть Battle Map VTT" button
(`window.open(...||BATTLE_MAP_VTT_BASE_URL)`, no params) is unaffected
since it just opens the bare hash URL. Player Safe/Observer: no change
to either — battle launch remains a DM Edit-only button, untouched by
this fix.

### 18.3 Not done in the previous pass (now mostly covered by §19)

Card image/preview resolution, the global Library card layout upgrade,
and the full data-count audit are now covered by Stage 6C.3A below.
Standalone NPC map placement and the object card editor (including an
image-correction picker) remain not implemented — see §19.6.

## 19. Stage 6C.3A — Full DM Companion Library/Card Picker data completion

### 19.1 Data audit (exact counts)

Computed directly from `public/data/dm-companion/*.json` (the same
files `loadCampaignData.ts` loads):

| Entity | Raw total | `arcId:"arc-1"` | no `arcId` | `arcId:"arc-2"` |
|---|---|---|---|---|
| NPCs | 140 | 32 | 11 | 97 |
| Locations | 73 | 3 | 21 | 49 |
| Taverns | 3 | 0 | 3 | 0 |
| Shops | 6 | 0 | 6 | 0 |
| Quests | 51 | 2 | 13 | 36 |
| Custom enemies | 127 | 42 | 1 | 84 |
| Images | 293 | 72 | 94 | 127 |

`loadCampaignData.ts` already treats `arcId`-less seed entities as
Arc-1-only (the exact same rule documented inline next to the
`LocationState` synthesis loop: `!loc.arcId && timeline.arcId ===
ARC_1_ID`). Applying that rule explains the user's expected counts
exactly:
- **NPCs**: 32 (`arc-1`) + 11 (none) = **43** ✓ matches expectation.
- **Locations**: 3 (`arc-1`) + 21 (none) = **24** ✓ matches expectation.
- **Taverns**: all 3 have no `arcId`, treated as Arc-1 = **3** ✓.
- **Shops**: all 6 have no `arcId`, treated as Arc-1 = **6** ✓.

**Mismatch — "3 economy shops" does not exist as a real entity type.**
`economy.json` (8 entries) is DM-authored price/lore prose ("Базовое
правило валюты", "Еда, выпивка и ночлег" — paragraphs of pricing
guidance, not vendor records). `economy-reference.json` (700 entries)
is a flat goods/price list (e.g. "Кружка эля" — 1 SP) — also not a
vendor/shop entity. Neither file contains anything resembling a
3rd-party "economy shop" record distinct from the 6 already in
`shops.json`. **No fake economy-shop entities were invented** to make
this number match — the mismatch is reported, not papered over.

Live count in the running app (`Арка 1`, DM Edit, "Библиотека" tab)
showed **NPC (46)**, 3 more than the 43 computed above — confirmed via
`localStorage`'s `campaign-timeline-vtt:overlay:v2.newNpcs`: exactly 3
DM-created custom NPCs ("Гретхен Сольвейг", "Подмастерье Лина", "Тайный
Скупщик Ворн") already existed in this browser's local overlay from
earlier manual-authoring testing. 43 seed + 3 overlay-created = 46 —
explained, not a bug.

**Known limitation, not fixed this pass**: the new Квесты/Враги/
Боевые сцены/Изображения sections show their RAW total count (51/127/
3*/293) rather than an Arc-1-filtered count — Battle Entries already
filter by `store.currentTimelineId` correctly (hence "3", matching the
live `Тестовая боевая сцена` + 2 others on this timeline), but Quests/
Enemies/Images are not yet arc-scoped the way Locations/NPCs are. This
is a known gap, not a hidden one — see §19.6.

### 19.2 New shared module: `src/pages/map-workspace/libraryCards.ts`

Pure, read-only helpers used by both the Library panel and the
map-click picker — never mutates or duplicates source data:
- `resolveEntityPreviewImage(type, entity, images, battleMaps?)` —
  resolves an images.json-id field (`npc.image`/`shop.image`/
  `enemy.image`/`quest.image`, confirmed-by-data convention) or a
  relation-based lookup (`relatedEntity`/`linkedLocationIds`/
  `relatedImages`, the same convention `loadCampaignData.ts` already
  uses for `LocationState.imageIds`) to a renderable image, or
  `undefined` if nothing resolves. Never returns a broken path.
- `resolveEntityShortDescription(type, entity, maxLen=140)` — picks the
  best available text per type (public/player-safe description first,
  then role/context, then explicit `Описание не заполнено` if nothing
  exists) and truncates for card display.
- `LIBRARY_FALLBACK_ICON` — one glyph per entity type, shown instead of
  a broken-image icon when no preview resolves.
- `auditEntityList` / `hotspotPlacementState` — small audit/placement
  helpers, available for future use; not yet wired into a UI counts
  row (kept minimal this pass).

### 19.3 Library panel — 8 sections, thumbnails, shared with the picker

`LibraryPanel`'s existing 4 sections (Локации/NPC/Таверны/Лавки) now
render a `LibraryThumb` (real image or fallback glyph) and a resolved
short description per card, instead of plain text and manual
`.slice(0, 140)` truncation. 4 new **read-only** sections were added —
**Квесты, Враги, Боевые сцены, Изображения** — using a new generic
`LibraryReadOnlySection<T>` component (search + 30-card cap +
`LibraryThumb` + description, shared with the 4 existing sections'
patterns). Their action button is always visibly disabled with title
text explaining placement for that type isn't implemented yet ("Stage
6C.4B"), never silently doing nothing.

### 19.4 Map-click picker — same 8 sections, same resolvers

The "Что разместить здесь?" picker's tab bar grew from 4 tabs
(Локации/Таверны/Магазины/NPC) to 8 (+ Квесты/Враги/Боевые сцены/
Изображения), each tab label showing a live count. Локации/Таверны/
Магазины/NPC cards now use `LibraryThumb`/`resolveEntityShortDescription`
(same helpers as the Library panel) instead of `.slice(0, 90)` raw
text. The 4 new tabs render the same card shape with a disabled
"Размещение не реализовано" button — placement behavior for those
types is unchanged (still not implemented), only their visibility
changed.

### 19.5 Verified this pass (live browser)

- Library panel: all 8 section headers show counts (Локации 33 [24
  seed + 3 tavern + 6 shop materializations already on the map],
  NPC 46, Таверны 3, Лавки 6, Квесты 51, Враги 127, Боевые сцены 3,
  Изображения 293) — no crash on any section.
- 162 thumbnails rendered across the panel: 101 resolved a real image
  (verified one sample URL returns HTTP 200), 61 used the fallback
  glyph — zero broken-image icons.
- `.workspace-side-panel` `scrollWidth === clientWidth` (384px) with
  all 8 sections rendered — the Stage 6C.4 horizontal-scroll fix holds
  under the new content.
- Map-click picker still opens by default (not the old "Новая
  локация" form) with all 8 tabs and live counts; switching to
  "Изображения" rendered exactly 30 capped cards with real thumbnails.
- Escape still closes the picker.
- `/observer` route: `Библиотека`, `Что разместить здесь`, and "DM
  Notes" all absent from the rendered HTML — confirmed via
  `document.body.innerHTML.includes(...)` checks; no console errors.
- `npm run lint:hooks` / `typecheck` / `build` / `lint` all pass; full
  lint baseline unchanged (7 errors / 3 warnings).

### 19.6 Not done this pass — Stage 6C.4B

- Standalone NPC map marker placement (NPC cards still only support
  linking to a selected location, both in the Library panel and the
  picker — the disabled button/note says so explicitly).
- Object card editor (editing a placed location/NPC/tavern/shop's
  fields from the right panel) and the image-correction picker for
  fixing a wrong image assignment.
- Placement/linking behavior for Quests/Enemies/Battle Entries/Images
  (currently visible-but-disabled in both the Library panel and the
  picker, with an explicit reason shown on hover).
- Arc-scoping the new Квесты/Враги/Изображения section counts (Battle
  Entries already arc-scope correctly via `timelineId`) — see the
  "known limitation" in §19.1.
- Drag-and-drop placement; batch operations; command palette.
- Visual Plan Stage 1 (design tokens) remains paused, untouched this
  pass.

## 20. Stage 6C.4B — Standalone NPC Placement MVP

### 20.1 Model decision: `MovableEntity`, not a new type

NPCs are placed using the **existing `MovableEntity`** model
(`src/types.ts`) — `entityType: 'npc'` was already a valid union member,
`MovementState` already exactly matched the spec's required
`'stationary' | 'travelling' | 'hidden' | 'unknown'`, and full CRUD
(`upsertMovableEntity`/`updateMovableEntity`/`archiveMovableEntity`),
map-marker rendering (`.movable-entity-marker--npc`), a selection panel,
manual-move arming, and route/location-link fields already existed from
Stage 4C. **No parallel marker model was invented.** The only real gap
was that nothing resolved `entityId` to an actual `DmNpc` record — the
selection panel's own pre-existing comment said as much
("TODO(stage-4d?): once a real Npc... lookup-by-id helper exists,
resolve entityId to a display name here"). This stage is that resolver,
plus the placement/duplicate-prevention flow on top of it.

Fields used, mapped onto the spec's requested foundation:
`entityType:'npc'`, `entityId` (= `DmNpc.id`), `timelineId` (= arc,
already the established convention throughout this codebase —
`MovableEntity` has no separate `arcId` field and none was added),
`currentMapId`, `currentPosition`, `currentLocationStateId` (optional
link), `currentRouteId` (optional, already supported, left undefined
unless explicitly set), `movementState`, `visibleInPlayerView`,
`updatedAt`. **Every field the spec's "Required foundation" list asked
for already exists on `MovableEntity` — none had to be added.**

### 20.2 Placement flow + duplicate prevention

New shared function `placeOrMoveNpcMovableEntity(npcId, point)`
(`MapWorkspacePage.tsx`): looks up `Object.values(store.movableEntitiesById)`
for ANY existing entry with `entityType:'npc' && entityId===npcId`
(global search, not scoped to the current map/arc — an NPC is one
person, never two markers, so this guarantees zero duplicates ever). If
found, it is **moved** (re-targeted `currentMapId`/`mapLevel`/
`timelineId`/`currentPosition`, MVP default per the spec). If not
found, exactly one new `MovableEntity` is created with id
`movable-npc-${npcId}` (deterministic, so even a re-render/race can't
create a second one for the same npc). The source `DmNpc` JSON record
is never read-write — only its `id` is stored, exactly like every other
`MovableEntity.entityId` usage in this file.

Two entry points share this one function:
- **Library panel → NPC card → "Разместить на карте" / "Переместить
  маркер сюда"**: arms `placingNpcEntityId` (new state, same one-shot
  arm-then-click pattern as `placingLibraryEntity`); the next map click
  calls `placeOrMoveNpcMovableEntity`. Wired into `cancelAllEditTools()`
  and the existing Escape-cancel effect, same as every other one-shot
  tool.
- **Map-click picker → NPC tab**: the point is already known
  (`pendingPlacementPoint`), so the button calls
  `placeOrMoveNpcMovableEntity` immediately — no second click. No
  disambiguation menu was needed: the picker's NPC tab is exactly the
  "place a marker" action, while "link to a location" remains a
  separate, pre-existing action in the Library panel
  (`onLinkNpcToSelected`) — there was never a genuine ambiguity to
  resolve.

Both surfaces show the existing-marker state honestly: "Уже размещено"-
style labels ("Переместить маркер сюда" / "Маркер на этой карте" /
"Маркер на другой карте") instead of a blind "Разместить" that would
silently move something the DM didn't realize already existed.

### 20.3 Marker rendering + NPC panel

Marker rendering itself (badge glyph, distinct CSS class per
`entityType`, selected-state styling, tooltip) was already built in
Stage 4C and is unchanged. What changed: the tooltip and the selection
panel now resolve `data.npcs.find(n => n.id === m.entityId)` for
`entityType:'npc'` markers and show the real name + role in the tooltip
(previously raw `entityId`), and the panel now renders the NPC's
`LibraryThumb` portrait, name, role, and
`resolveEntityShortDescription('npc', ...)` instead of "ID:
npc-edrik-stalveyn" with no further context. Every other
`MovableEntityType` (enemy_group/caravan/army/custom) is untouched and
still shows the raw id — only the npc case got a resolver this pass.

### 20.4 Link / unlink

The pre-existing "Переместить к выбранной локации" button (which only
ever set `currentLocationStateId`, never moved `currentPosition` —
relabeled "Связать с выбранной локацией" for clarity, no behavior
change) is now paired with a new "Снять привязку к локации" button
(`store.updateMovableEntity(m.id, { currentLocationStateId: undefined })`).
Unlinking never deletes the `LocationState` or the `DmNpc` source
record — it only clears one reference field on the marker.

### 20.5 Player Safe / Observer

`getPlayerSafeMovableEntities()` already unconditionally returns `[]`
(a pre-existing Stage 4C decision, documented inline at its call site)
— standalone NPC markers were ALREADY DM-only before this stage and
remain so; no projection code was touched. Verified live: `/observer`
shows no NPC marker, no "Библиотека", no "Что разместить здесь" after
placing and selecting an NPC marker in DM Edit.

### 20.6 Verified this pass (live browser)

- Placed NPC "Эдрик Штальвейн" from the Library panel's new
  "Разместить на карте" button → arm-then-click → marker appeared at
  the clicked point.
- Selected the marker → panel showed real portrait/name/role/description
  (not a raw id).
- "Связать с выбранной локацией" → `currentLocationStateId` set,
  `currentPosition` unchanged; "Снять привязку к локации" → cleared
  back to `undefined`. Neither action touched the `DmNpc` or
  `LocationState` records.
- Reloaded the page → marker still rendered (`localStorage` overlay
  persistence, same mechanism as every other Stage 6 entity).
- Re-placed the SAME NPC via the map-click picker's NPC tab (which
  correctly showed "Переместить маркер сюда", not a blind "Разместить")
  → `movableEntitiesById` still had exactly 1 entry afterward — no
  duplicate.
- `.workspace-side-panel` `scrollWidth === clientWidth` throughout —
  the Stage 6C.4 overflow fix holds.
- `/observer`: no NPC marker, no Library, no picker in the rendered
  HTML.
- `npm run lint:hooks` / `typecheck` / `build` / `lint` all pass; full
  lint baseline unchanged (7 errors / 3 warnings).

### 20.7 Future route-movement compatibility

`currentRouteId` is already a real field on `MovableEntity` and the
pre-existing "Привязать к выбранному маршруту" / "Снять маршрут"
buttons already let the DM tag an NPC marker with a route id and flip
`movementState` to `'travelling'` — this stage didn't add or change
that. **None of it animates or advances automatically** — no travel
speed, no partial route progress, no time-based movement, no Observer
animation exist, and none were added this pass. Assigning a route
today only stores the DM's intent (which route + "travelling" state);
a future route-movement stage would consume `currentRouteId` +
`movementState` to actually move the token, without needing to change
`MovableEntity`'s shape.

### 20.8 Remaining for Stage 6C.4C

- Object card editor (editing a placed location/NPC/tavern/shop's own
  fields from the right panel) and an image-correction picker.
- Placement/linking for Quests/Enemies/Battle Entries/Images (still
  visible-but-disabled, unchanged from §19.6).
- Drag-and-drop placement from the Library/Card Tray.
- Real route movement (travel speed, partial progress, time
  advancement, Observer animation) — explicitly out of scope per
  §20.7, foundation only.

## 21. Stage 6C.4C — Object Editor + Image Picker MVP, picker card sizing fix

### 21.1 Card preview sizing fix (the screenshot complaint)

The map-click picker's cards used the Library panel's compact 48px
list-row thumbnail (`.library-thumb`) inside a wide card grid, making
every preview — especially location cards with no native image —
look like a tiny, broken icon. Fixed in `src/index.css`: a scoped
override `.object-picker-card > .library-thumb` makes the thumbnail a
full-width ~110px banner with `object-fit: cover` inside picker cards
specifically (the Library panel's own 48px list rows are untouched —
they're a narrow list, not a card grid, and stayed correctly sized).
Fallback glyphs inside picker cards were enlarged to `2.4rem` for the
same reason. No JS/resolver change was needed for this — the resolver
output (real image vs. fallback) was already correct; only the
sizing/layout was the bug.

### 21.2 Override model: existing `npcPatches`, not a new model

Before writing any editor, the existing overlay (`src/state/overlay.ts`)
was checked entity-by-entity:

- **NPC**: `npcPatches: Record<string, Patch<Npc>>` already existed
  (Stage 6B.1) and `Npc` is a plain alias for `DmNpc`
  (`export type Npc = DmNpc` in `types.ts`), so it already supports
  patching `image`/`name`/`role`/`faction`/`publicDescription`/
  `dmNotes`/`visibleToPlayers` — every field this stage needed. `data.npcs`
  (`campaignDataContext.tsx`) already calls
  `applyOverlayToList(base.data.npcs, overlay.npcPatches, overlay.newNpcs)`
  — meaning **every existing consumer of `data.npcs` already reflects an
  edit with zero resolver changes**: the Library panel, the picker, and
  the NPC marker panel all read the same merged `data.npcs` array.
- **LocationState**: `locationStatePatches` already existed (Stage 6B)
  with a full pre-existing edit form (`LocationDataTab`) covering
  title/type/parent/status/description/player-safe description/DM
  notes/tags/visibility/tavern-or-shop details — this stage only added
  the missing **image** field to that already-working form (see §21.4).
- **Tavern/Shop/Quest/Enemy/Image/BattleEntry**: confirmed (again) that
  **no overlay slot exists** for any of these — this is the same
  Stage 6B.3 §12.5 decision documented earlier in this doc, not a new
  finding. Adding one is a real architecture change (`CampaignOverlay`
  shape + `applyOverlayToList` wiring + reducer cases for each), which
  was judged out of scope for this bounded pass — **no new override
  model was invented**; editing these types remains unsupported and is
  listed under §21.8.

### 21.3 NPC editor

New inline form (`route-draft-form`, same visual pattern as every other
one-shot draft form in this file) opened via `openNpcEditor(npc)`, a
shared helper called from two entry points: the Library NPC card's new
"Редактировать карточку" button, and the NPC `MovableEntity` marker
panel's new "Редактировать карточку" button (§20's existing panel).
Fields: portrait (with "Сменить изображение"/"Убрать"), Имя, Роль,
Фракция, Описание (Player Safe), Заметки ДМ, "Видна игрокам" checkbox.
Validation: empty name blocks Save (button disabled + inline error).
Save calls `store.patchNpc(npcId, {...})` — the pre-existing action —
and closes the form; Cancel discards the draft without saving anything.

### 21.4 Location image field

Added a "Изображение (заголовок)" row to the existing `LocationDataTab`
edit form: current header thumbnail (or fallback), "Сменить
изображение" / "Убрать". On Save, the chosen image id is moved to the
front of `LocationState.imageIds` (the pre-existing convention this app
already uses to pick a "header" image — see `headerImage = images[0]`
elsewhere in this file) via the same `store.patchLocationState` call
the rest of the form already used — no new field was added to
`LocationState`. Clearing drops whatever was first before editing,
leaving any other linked images untouched.

### 21.5 Shared `ImagePickerModal`

One modal component, reused by both editors via a single page-level
`imagePickerTarget` state (`{kind:'npc'|'location', ...}`). Search by
title/id/type; 30-card cap with "Показать ещё"; selecting an image
returns its id to the caller (NPC draft or Location draft) — the modal
itself never writes to the store. "Убрать текущее изображение" clears
the override. No broken paths: only reads `images.json`-sourced
`DmImageItem.src`/`thumbnailSrc`.

### 21.6 Relationship editor — already existed, not rebuilt

`LocationLinksTab` (Stage 6B) already lets the DM check/uncheck NPC,
quest, enemy, image, and battle-map links for a selected location via
the existing `CheckboxList` pattern — exactly the "link/unlink without
deleting the source entity" behavior this stage's relationship-editor
request describes. It was verified, not rebuilt, since it already
satisfies the requirement.

### 21.7 Verified this pass (live browser)

- Picker location cards now show a full-width banner-sized thumbnail
  (or fallback) instead of a tiny icon.
- Opened the NPC editor for "Эдрик Штальвейн" from the Library card,
  opened the image picker (30 real `<img>` thumbnails), picked a
  different image, saved → `npcPatches['npc-edrik-stalveyn'].image`
  updated in the overlay (confirmed via `localStorage`), seed JSON
  untouched.
- Reloaded → NPC marker panel's portrait showed the NEW image
  (`tg-img-10` → `telegram_10...jpg`), confirming `data.npcs` (and
  every consumer of it) reflects the override with no resolver changes.
- `/observer`: no "Редактировать NPC", no "Сменить изображение", no
  "Заметки ДМ" in the rendered HTML.
- `npm run lint:hooks` / `typecheck` / `build` / `lint` all pass; full
  lint baseline unchanged (7 errors / 3 warnings).

### 21.8 Not done this pass — Stage 6C.4D

- Tavern/Shop/Quest/Enemy/Image/BattleEntry editing — no overlay slot
  exists for any of them; adding one is a real architecture change, not
  attempted here.
- "Сбросить локальные правки" (reset-to-seed-default) for NPC/Location
  — no per-field or per-entity "remove this patch" action exists in the
  store yet; only overwriting fields with new values is supported.
- Placement/linking for Quest/Enemy/BattleEntry/Image markers (§19.6,
  unchanged).
- Drag-and-drop placement from the Library/Card Tray.
- Route movement for NPC/caravans/armies (§20.7, foundation only).

## 22. Stage 6C.4D — Complete Object Editor Override Coverage + Reset MVP

### 22.1 Patch/override model

Three new overlay slots were added to `CampaignOverlay` (`src/state/overlay.ts`),
following the exact same shape/merge semantics as the pre-existing
`npcPatches`/`locationStatePatches`: `tavernPatches: Record<string,
Patch<DmTavern>>`, `shopPatches: Record<string, Patch<DmShop>>`,
`imagePatches: Record<string, Patch<DmImageItem>>`. Each merges into
`data.taverns`/`data.shops`/`data.images` via the existing
`applyOverlayToList` helper in `campaignDataContext.tsx` — zero new
merge logic. `BattleEntry` needed **no new slot**: it already has its
own primary store (`battleEntriesById`) with full CRUD
(`store.updateBattleEntry`), since battle entries are DM-authored data
with no seed file at all — editing it is just calling the pre-existing
action with more fields.

A new store action `resetOverride(kind, id)` (dispatching `RESET_PATCH`)
removes one id's entry from the relevant patches record entirely —
distinct from the pre-existing `DELETED` sentinel, which marks the
*entity itself* as gone. Reset never deletes the source entity, a
placement marker/hotspot, or a relationship link; it only clears that
one entity's own override record. Works for `npc`, `tavern`, `shop`,
`image`, and `locationState` (the same action backs all of them).

### 22.2 Supported editable entity types and fields

- **NPC** (unchanged from §21): name, role, faction, publicDescription,
  dmNotes, visibleToPlayers, image.
- **Tavern**: name, description, notes (DM notes), image. The source
  `DmTavern` model has no native image field at all (taverns rely on
  `relatedImages` matching instead), so a new optional
  `imageOverrideId?: string` field was added to the `DmTavern` type
  itself — populated only via `tavernPatches`, never by the seed
  loader. This is a card-view-only override, documented inline in the
  type.
- **Shop**: name, description, notes, image — `DmShop` already had a
  native `image` field, so no type change was needed here.
- **Image/Handout**: title only. `DmImageItem` has no `description` or
  `tags` field in the source model — per the "do not invent fields"
  constraint, no description/tag editing was added; only the one field
  that actually exists is editable.
- **BattleEntry**: name, description (DM), playerSafeDescription, and a
  new optional `previewImageId?: string` field (same "card-view
  override, additive field" pattern as the tavern image) for choosing
  an images.json picture instead of the battle-map thumbnail. Existing
  status/visibility controls (`visibleInPlayerView` toggle, status
  buttons in `BattleEntryPanel.tsx`) were left untouched — no new
  controls added there, per the "only if already-safe controls exist"
  instruction.
- **Quest / Enemy**: left **read-only this pass**, same as §19.6/§20.8 —
  their Library cards still show a disabled "Размещение не реализовано"
  button with an explanatory `title`; no edit button was added for
  either, since adding one would require a new overlay slot, which is
  out of the bounded scope for this stage.

### 22.3 Image override behavior per type

`libraryCards.ts`'s `resolveEntityPreviewImage` was extended with two
new override checks (both fall back to the pre-existing resolution
order if absent): for `tavern`, `imageOverrideId` is checked before
`relatedImages`; for `battleEntry`, `previewImageId` is checked before
the battle-map-derived thumbnail. `shop`/`npc` already resolved their
existing native `image` field (now patchable). `image` cards show
their own `src`/`thumbnailSrc` directly (no separate "image's image"
concept).

### 22.4 Editor UI / entry points

New inline `route-draft-form` editors (`tavernEditDraft`,
`shopEditDraft`, `imageEditDraft`, `battleEntryEditDraft`), opened via
`openTavernEditor`/`openShopEditor`/`openImageEditor`/
`openBattleEntryEditor` — same prefill-from-current-(possibly-already-
patched)-data pattern as `openNpcEditor`. Entry points: a
"Редактировать карточку" button on each Library panel row (Tavern,
Shop sections directly; BattleEntry/Image sections via a new optional
`onEdit` prop on the shared `LibraryReadOnlySection<T>` — Quest/Enemy
don't pass this prop, so they keep their disabled-only button). The
shared `ImagePickerModal` (§21.5) was extended to four target kinds
(`npc`/`location`/`tavern`/`shop`/`battleEntry`) via the page-level
`imagePickerTarget` union; no changes to the modal component itself.

### 22.5 Reset behavior

Every overlay-patch-backed editor (NPC/Tavern/Shop/Image) shows a
"Сбросить локальные правки" button **only when an override currently
exists** for that id (`id in store.<kind>Patches`). Clicking asks
`window.confirm` before calling `store.resetOverride(kind, id)`. After
reset, the Library/picker/side-panel immediately show the seed
default (verified live for Tavern/Shop/Image, see §22.7) and the
source entity/count is untouched. BattleEntry has **no reset button**
— it's primary store data with no seed default to "revert" to, so
reset isn't a meaningful concept there; this is intentional, not an
omission.

### 22.6 Relationship editor regression check

`LocationLinksTab` (pre-existing, Stage 6B) was not modified by this
pass — no code path it depends on changed. `tsc`/`build` passing
confirms its props/types are unaffected. Live re-verification of its
full link/unlink flow was not repeated this pass (it was already
verified working in Stage 6C.4C, §21.6); given zero changes touched
it, it is reported as unchanged rather than re-tested end-to-end.

### 22.7 Verified this pass (live browser)

- Tavern: opened editor for "Таверна «Северный Очаг»", changed
  description, set image override to `tg-img-10` → confirmed
  `tavernPatches['tavern-severny-ochag']` in `localStorage` with all
  three fields, seed JSON untouched. Reloaded → Library card showed
  the new image. Reset → `tavernPatches` back to `{}`, tavern still
  present (`Таверны (3)` unchanged).
- Shop: opened editor for "Травяная лавка Лины Уотерс", edited
  description → confirmed `shopPatches['shop-lina-waters']` persisted.
  Reset → `shopPatches` back to `{}`.
- Image: opened editor for an image card, edited title → confirmed
  `imagePatches['tg-img-7']` persisted across reload. Reset → back to
  `{}`.
- BattleEntry: opened editor for an existing battle entry, edited name
  → confirmed `updateBattleEntry` updated `battleEntriesById` directly
  (with `updatedAt` bumped), persisted across reload.
- `/observer`: checked rendered HTML for every new editor/picker/reset
  string ("Редактировать таверну/лавку/изображение/боевую сцену",
  "Сменить изображение", "Сбросить локальные правки", "Заметки ДМ",
  "Библиотека") — none present.
- `npm run lint:hooks` / `typecheck` / `build` all pass; full `lint`
  baseline unchanged (7 errors / 3 warnings).

### 22.8 Not done this pass — Stage 6C.4E

- Quest/Enemy full editing — no overlay slot; would need new
  `questPatches`/`enemyPatches` plus reducer/context wiring, judged out
  of bounded scope this pass.
- Quest/Enemy/BattleEntry/Image **placement** on the map (unchanged
  from §19.6/§20.8 — still shows "Размещение не реализовано").
- Drag-and-drop placement from the Library/Card Tray.
- Route movement for NPC/caravans/armies (§20.7, foundation only).
- Export/import of local overrides as a distinct concept — the
  existing "Export JSON"/"Import JSON" buttons already serialize the
  whole overlay (including the new patch slots, since they're plain
  `CampaignOverlay` fields), so no separate per-type export was added;
  not verified live this pass.

## 23. Stage 6C.4E — Quest / Enemy / BattleEntry / Image Placement MVP

### 23.1 Placement model per type

- **BattleEntry**: reused its own pre-existing fields (`sourceMapId`,
  `mapLevel`, `position`) and CRUD (`store.updateBattleEntry`) —
  **no new model**. Placing one from the picker just repositions it;
  no new BattleEntry is ever created by the picker (creation stays the
  separate "Новая боевая сцена" flow, unchanged).
- **Quest / Enemy / Image**: reused the **existing `MovableEntity`**
  model (Stage 4C/6C.4B), not a new `MapContentPlacement` type.
  `MovableEntityType` was extended with `'quest' | 'enemy' | 'image'`
  (`src/types.ts`) — same storage (`movableEntitiesById`), same
  arc/map filtering, same rendering pipeline, same selection-panel
  chokepoint already proven for the NPC marker. This was a smaller,
  safer change than inventing a parallel model, and the spec's
  suggested `MapContentPlacement` shape was judged unnecessary since
  every field it wanted (`sourceType`/`sourceId`/`timelineId`/`mapId`/
  `position`/`linkedLocationStateId`/`visibility`/timestamps) already
  has a `MovableEntity` equivalent (`entityType`/`entityId`/
  `timelineId`/`currentMapId`/`currentPosition`/
  `currentLocationStateId`/`visibleInPlayerView`/`updatedAt`).
  `MOVABLE_ENTITY_TYPE_OPTIONS` (the generic "create a custom movable
  entity by hand" dropdown) deliberately does NOT include the three
  new types — they're only ever created through the Library/picker
  flow, which always supplies a real source entity id.

### 23.2 Supported placement types and duplicate prevention

All four types (BattleEntry, Quest, Enemy, Image) are now placeable
from both the map-click "Что разместить здесь?" picker and the
Library panel (arm-then-click via "Разместить на карте", reusing the
exact same `placeOrMoveContentMarker`/`placeOrMoveBattleEntryAtPendingPoint`
functions the picker calls — single chokepoint, no parallel logic).

Duplicate prevention: same "one marker per source entity, move it if
it already exists anywhere" rule as the NPC marker (Stage 6C.4B) for
Quest/Enemy/Image — `placeOrMoveContentMarker` searches
`movableEntitiesById` for an existing marker of that `entityType`+
`entityId` pair globally (not just on the current map) and moves it
instead of creating a second one. BattleEntry has only one position
field by definition, so "place again" always repositions the same
record — there is no separate marker to duplicate.

### 23.3 Marker rendering

Quest/Enemy/Image markers render through the same
`visibleMovableEntities` → `.movable-entity-marker` pipeline as NPC,
already filtered by `timelineId`/`currentMapId`/`mapLevel` (so markers
from another arc/map never appear — unchanged pre-existing filter,
just now exercised by more types). New badge letters (`QST`/`ENM`/
`IMG`) and new border colors/styles
(`.movable-entity-marker--quest/--enemy/--image` in `src/index.css`)
make them visually distinct from NPC/enemy-group/caravan/army and from
location hotspots/BattleEntry diamonds/quick pins. Tooltips resolve
the real quest title/enemy name/image title (not the raw id) via the
same resolver pattern as the pre-existing `resolvedNpc`. BattleEntry
markers are unchanged — they already rendered via the separate
`BattleEntryMarkerLayer`, which already picks up the new
`sourceMapId`/`position` once the picker writes them.

### 23.4 Context panels

- **BattleEntry panel**: unchanged, pre-existing panel — now also
  opens automatically when placed via the picker (`setSelectedBattleEntryId`
  is called by `placeOrMoveBattleEntryAtPendingPoint`).
- **Quest/Enemy/Image**: the existing NPC-marker selection panel
  (`selectedMovableEntityId` block) was extended with `resolvedQuest`/
  `resolvedEnemy`/`resolvedImage` branches showing: thumbnail, title,
  status (quest) / role+CR (enemy) / image type, and a short
  description via the existing `resolveEntityShortDescription`
  resolver. No editor button is shown for Quest/Enemy (no overlay
  slot exists for them, per §22.2 — unchanged this pass); Image already
  has its editor wired in from §22, reachable from the Library panel,
  not duplicated here.

### 23.5 Link/unlink behavior

Link/unlink for Quest/Enemy/Image now uses the **real relationship
arrays already on `LocationState`** (`questIds`/`enemyIds`/
`imageIds`) via `store.patchLocationState` — the exact same arrays
`LocationLinksTab` already reads/writes. This is deliberately
**different** from the NPC marker panel's existing "Связать с
выбранной локацией" button, which sets the marker's own
`currentLocationStateId` (a separate "where is this NPC right now"
backlink, not LocationState membership) — for Quest/Enemy/Image, the
spec asked for the actual location relationship, so the new buttons
write directly to `selectedLs.questIds`/`enemyIds`/`imageIds` instead.
Unlinking only removes the id from that array; it never touches the
marker or the source entity. "Удалить маркер с карте" is a fully
separate, explicitly confirmed action (new `store.removeMovableEntity`
— a hard delete of only the marker record, added alongside the
existing soft-delete `archiveMovableEntity` since Quest/Enemy/Image
markers are disposable per-map annotations, unlike "an NPC is one
person, never truly delete their marker").

### 23.6 Reload persistence — verified this pass (live browser)

- BattleEntry: moved an existing entry via the picker's "Переместить
  сюда" button → confirmed `position`/`sourceMapId`/`updatedAt`
  changed in `localStorage`, entry count stayed at 3 (no duplicate).
- Quest: placed "Контракт №1…" via the picker → confirmed
  `movableEntitiesById` overlay entry, panel opened automatically,
  marker showed `QST` badge with correct tooltip. Reloaded → marker
  persisted. Removed via "Удалить маркер с карты" → overlay entry
  gone, Library still showed "Квесты (51)" (source untouched).
- Enemy: placed "Bandit (Бандит)" via the picker → panel showed role/
  CR/description. Reloaded → marker persisted at the same map/position.
- Image: placed "Грейхольм — общий вид 1" via the picker → panel
  showed the large preview image, title, type. Reloaded → marker
  persisted.
- Library panel: Враги row for the placed Bandit showed "Маркер на
  этой карте" badge after reload, matching the NPC section's existing
  badge convention.
- `/observer`: checked rendered HTML for "Библиотека", entity names
  ("Bandit", "Контракт №1"), "Удалить маркер", "Размещение", all three
  badge letters (QST/ENM/IMG), "Заметки ДМ", and enemy stat text
  ("CR 1/8") — none present.
- No horizontal overflow on `.workspace-side-panel`
  (`scrollWidth === clientWidth`) or the picker grid.
- `npm run lint:hooks` / `typecheck` / `build` all pass; full `lint`
  baseline unchanged (7 errors / 3 warnings).

### 23.7 Player Safe / Observer

`getPlayerSafeMovableEntities()` still unconditionally returns `[]`
(Stage 4C decision, untouched) — so Quest/Enemy/Image markers are
DM-only by design, same as NPC/caravan/army markers, regardless of any
`visibleInPlayerView` flag on the record. BattleEntry visibility is
unchanged — still gated by the pre-existing `getPlayerSafeBattleEntries()`
projection (status `'hidden'` never leaks, `visibleInPlayerView` is the
separate opt-in gate). No new leak surface was introduced: the Library
panel, the picker, and all new editor/remove-marker UI are local
component state on `MapWorkspacePage.tsx`, never rendered on the
Observer route.

### 23.8 Not done this pass — Stage 6C.4F

- Drag-and-drop placement from the Library/Card Tray.
- Quest/Enemy full editing (no overlay slot — unchanged from §22.8).
- NPC/caravan/army route movement (foundation only, §20.7).
- Route/time integration for any marker type.
- Bulk placement/batch operations.
- A dedicated "remove marker" action for BattleEntry (it has no
  separate marker record to remove — "removing" it would mean clearing
  its position fields, which was judged out of scope since the spec's
  emphasis was on Quest/Enemy/Image markers specifically).

## 24. Stage 6C.4F — Drag-and-drop from Card Tray / Library MVP

### 24.1 Architecture: one set of placement functions, two entry points

No parallel placement logic was written. Drag-and-drop calls the exact
same functions the map-click picker and Library arm-then-click already
called: `placeOrMoveNpcMovableEntity`, `placeOrMoveContentMarker`
(quest/enemy/image), `placeOrMoveBattleEntryAtPendingPoint`. Two new
thin wrappers were added — `placeOrMoveLocationAtPoint` and
`placeOrMoveLibrarySourcedLocationAtPoint` (tavern/shop) — because the
pre-existing Location/Tavern/Shop placement functions
(`placeExistingLocationAtPendingPoint`/`placeLibraryEntityAtPendingPoint`)
had no "move if already on this map" branch at all (the picker/Library
button for these types was simply *disabled* once placed, never
offered to move). The wrappers add that one missing lookup
(`hotspots.find(...)` on the current map vs. `data.hotspots` globally)
and then delegate to the same underlying functions for the
create-fresh case — no hotspot/LocationState creation logic was
duplicated.

A real bug was caught and fixed during this pass: the wrappers
originally called `setPendingPlacementPoint(point)` immediately
followed by `placeExistingLocationAtPendingPoint(locationStateId)` in
the same synchronous call — but `setState` updates aren't synchronous,
so the placement function would still read the OLD `pendingPlacementPoint`
value and bail out silently, leaving the picker UI open instead of
placing anything. Fixed by giving both pre-existing functions an
optional `explicitPoint` parameter that bypasses `pendingPlacementPoint`
entirely when the caller already has a point in hand (drag-and-drop
always does); every pre-existing call site is unaffected since the
parameter defaults to `undefined` and falls back to the old behavior.

### 24.2 Supported drag source types

All 8: Location, Tavern, Shop, NPC, Quest, Enemy, BattleEntry, Image —
every Library panel row (the 4 hand-rolled sections plus the generic
`LibraryReadOnlySection<T>` used for Квесты/Враги/Боевые сцены/
Изображения) is now `draggable`, firing a shared `onDragStartCard(sourceType,
sourceId, title)` callback that sets one page-level `dragPayload` state
— the single source of truth for "what's being dragged right now,"
read by both the ghost-marker renderer and the drop handler.

### 24.3 Coordinate/drop validation

`computeDropPoint(e)` reuses the exact same math `handleMapClick`
already used: `mapRef.current.getBoundingClientRect()` against
`clientX`/`clientY`, computing a `[0,1]` fraction. Since
`getBoundingClientRect()` reflects the post-transform on-screen box,
this already accounts for the current zoom/pan (the CSS
`translate(...) scale(...)` on `.map-canvas-inner`) with no extra
math needed. The fraction is checked against `[0,1]` **before** any
clamping — a drop with `fracX < 0 || fracX > 1` (outside the real
map image, e.g. over the side panel or a letterboxed empty area)
returns `null` and no marker is ever created; only a valid in-bounds
fraction gets clamped (for floating-point safety) and used.

### 24.4 Duplicate prevention

Matches Stage 6C.4E exactly: NPC/Quest/Enemy/Image search
`movableEntitiesById` for an existing marker of that
`entityType`+`entityId` pair and move it instead of creating a second
one; BattleEntry always repositions the same record (no separate
marker exists to duplicate). Location/Tavern/Shop now have the same
"move if already on the current map" behavior via the new wrappers —
if placed on a *different* map, dropping shows a warning
("перетаскивание между картами пока не поддерживается") rather than
silently creating a duplicate or silently failing, matching the
pre-existing Library/picker "Уже размещено" disabled-button
philosophy for that specific cross-map case.

### 24.5 Invalid-drop / mode guard behavior

`isDragDropBlocked()` returns a short Russian warning string (or
`null` if safe) checking: not in DM Edit mode, `editingRouteId` set
(Route Edit Mode), or `editingZoneId` set (Area Edit Mode). A blocked
or out-of-bounds drop always (a) creates/moves nothing, (b) shows a
3-second auto-dismissing warning banner
(`.drag-drop-warning-banner`), (c) leaves the source Library card
completely unchanged. `cancelAllEditTools()` — the same mutual-exclusion
chokepoint every other one-shot tool already calls before acting — is
called right before a successful placement, so a drop can never race
with an armed click-based tool.

### 24.6 Ghost marker / drag visual state

While dragging over the map, a small absolutely-positioned, pointer-events:none
div (`.drag-ghost-marker`) tracks the live drop point with the
LOC/TAV/SHP/NPC/QST/ENM/BAT/IMG badge letters and a valid/invalid
border color. It is pure local UI state (`dragGhostPoint`/`dragInvalid`)
— never written to the store, never part of any data the Observer
route could possibly read.

### 24.7 Verified this pass (live browser, DM Edit mode)

- NPC: dragged "Эдрик Штальвейн" onto the map → marker placed, panel
  opened. Dragged again to a different point → same marker moved
  (`movableEntitiesById` still has exactly 1 npc-type entry, `updatedAt`
  bumped, position changed) — no duplicate.
- Quest: dragged "Контракт №1…" → QST marker placed, panel opened with
  title/status/description.
- Enemy: dragged "Bandit (Бандит)" → moved the existing marker (1 entry
  before and after), panel showed role/CR/description.
- Image: dragged "Грейхольм — общий вид 1" → IMG marker placed, panel
  showed the large preview.
- BattleEntry: dragged the smoke-test entry → `battleEntriesById` stayed
  at 3 entries, `position`/`updatedAt` changed — confirmed via
  `localStorage`, no duplicate.
- Tavern: dragged "Таверна «Северный Очаг»" (already placed earlier) →
  confirmed via `hotspotPatches` that the existing hotspot moved to the
  exact drop coordinates; `newLocationStates` count for
  `sourceLibraryType==='tavern'` stayed at 2 (no duplicate).
- Shop: dragged "Травяная лавка Лины Уотерс" (not yet placed) → a new
  LocationState + hotspot were created at the exact drop point
  (verified `newHotspots`/`newLocationStates`, count went 0→1).
  Dragged again → the SAME hotspot moved (`hotspotPatches` updated,
  count stayed at 1) — confirmed the explicitPoint bugfix actually
  fixed both the create and the move path.
- Location: dragged "Королевство Аурелон" (already placed) → confirmed
  via `hotspotPatches` that its existing hotspot moved to the new drop
  point.
- Invalid drop (outside the real map image bounds, `fracX < 0`):
  confirmed via an awaited live test that no marker is created/moved
  and the warning banner ("Точка вне карты — объект не размещён.")
  renders. (Note: several earlier same-call synchronous checks during
  this verification produced false negatives because React's commit
  for a directly-invoked-handler state update hadn't flushed yet by
  the time the very next synchronous line queried the DOM — resolved
  by awaiting a real delay before checking; not an application bug.)
- No horizontal overflow on `.workspace-side-panel`.
- `/observer`: checked rendered HTML for `drag-ghost-marker`,
  `drag-drop-warning-banner`, "Библиотека", the warning text, and all
  8 badge letters — none present.
- `npm run lint:hooks` / `typecheck` / `build` all pass; full `lint`
  baseline unchanged (7 errors / 3 warnings).

### 24.8 Player Safe / Observer

No new leak surface: `dragPayload`/`dragGhostPoint`/`dragInvalid`/
`dragWarning` are local `MapWorkspacePage` component state, never
passed to or read by the Observer route. Placed markers follow the
exact same visibility rules already documented in §23.7
(`getPlayerSafeMovableEntities()` still unconditionally `[]`;
BattleEntry still gated by `getPlayerSafeBattleEntries()`) — drag-and-drop
is just a different way of calling the same placement functions, so it
inherits their safety guarantees automatically rather than needing any
new projection logic.

### 24.9 Not done this pass — Stage 6C.4G

- Drag/drop on an existing location with an explicit link menu (the
  spec's "Alt/Option menu" was explicitly out of scope this pass — no
  such menu exists yet for the click-picker either).
- Bulk placement / multi-select drag.
- Quest/Enemy full editing (no overlay slot — unchanged from §22.8).
- NPC/caravan/army route movement (foundation only, §20.7).
- Route/time integration for any marker type.
- Visual Plan Stage 1 (still paused per explicit standing instruction).

## 25. Stage 6C.4G — Drop-on-location explicit link menu + relationship placement polish

### 25.1 Goal and scope

When a DM places or drags an NPC, Quest, Enemy, BattleEntry, or Image
near an existing (non-hidden) location on the current map, instead of
placing immediately, a small menu now asks what to do: place a marker,
link the object to the location, do both, or cancel. Location/Tavern/
Shop are themselves location-like objects and are explicitly excluded
from linking this pass — their drag/drop and picker placement in
§24 is completely unchanged. This is not a new placement system: every
entry point (picker tabs, Library arm-then-click, drag-and-drop) still
ends by calling the exact same `placeOrMoveNpcMovableEntity` /
`placeOrMoveContentMarker` / `placeOrMoveBattleEntryAtPendingPoint`
functions from §23/§24 — the menu only decides *whether* and *when*
those calls (plus an optional relationship write) happen.

### 25.2 Target-location detection

`findNearestLocationOnCurrentMap(point, threshold = 0.06)` (in
`MapWorkspacePage.tsx`) iterates the current map's `hotspots` (already
scoped to the active map/arc by the existing `hotspots` memo), skips
any `LocationState` whose `effectiveLocationStatus()` is `'hidden'`,
computes plain Euclidean distance in normalized [0,1] map coordinates
between the candidate point and each hotspot, and returns the nearest
one within `threshold` (or `null` if none qualify). No DOM geometry or
overlap hit-testing is used — only the same `x`/`y` hotspot fields
already used for click/drag coordinate math everywhere else in this
file. If nothing is within range, no menu is shown and placement
happens immediately exactly as in §24 — free-map placement is not
slowed down by the detection.

### 25.3 The link/place menu

`maybeOpenLinkMenuOrPlace(type, sourceId, title, point)` is the single
shared decision point called from all three entry points:

- Picker tabs (NPC/Квесты/Враги/Боевые сцены/Изображения) — replaces
  the direct `placeOrMoveX(...)` call in each tab's button `onClick`.
- Library arm-then-click (`placingNpcEntityId` / `placingContentEntity`
  / `placingBattleEntryId` branches in `handleMapClick`) — replaces the
  direct placement call, now resolving a human-readable title first
  (NPC name / quest title / enemy name / image title / battle entry
  name) for the menu's subtitle.
- Drag-and-drop (`handleMapDrop`'s switch statement) — the `npc` /
  `quest` / `enemy` / `image` / `battleEntry` cases were merged into a
  single case calling this function instead of placing directly.
  `location` / `tavern` / `shop` cases are untouched (still call
  `placeOrMoveLocationAtPoint` / `placeOrMoveLibrarySourcedLocationAtPoint`
  from §24 directly — never routed through the link menu).

If a nearby location is found, `linkMenuState` is set (nothing is
written to the store yet) and the menu renders: "Что сделать с
объектом рядом с локацией «<Name>»?" with the object's title, an
"Уже привязан к этой локации." note when already linked
(`isContentLinkedToLocation`), and four actions — "Поставить маркер
здесь" (place only), "Привязать к локации" (link only, no marker if
not already placed), "Поставить маркер и привязать" (both — moves the
marker if it already exists), "Отмена" (no-op, discards the pending
point/payload with zero writes). `runLinkMenuAction` is the single
function executing exactly one of the four outcomes and always closing
the menu afterward. Escape and `cancelAllEditTools()` both close the
menu with no side effects (consistent with every other one-shot tool
in this file — `linkMenuState` was added to both the Escape `useEffect`
guard/dependency list and `cancelAllEditTools()`'s clear-list).

The menu is a small, fixed-size modal (`.link-target-menu`, max-width
420px) reusing the existing `.object-picker-overlay` backdrop class for
consistency — not a new full-screen wizard.

### 25.4 Relationship source of truth per type

- **NPC / Quest / Enemy / Image** — all four write to the matching
  pre-existing `LocationState` array field (`npcIds` / `questIds` /
  `enemyIds` / `imageIds`), the same arrays `LocationLinksTab` (§6B)
  and the Library panel's pre-existing "Связать с…" button already
  read/write. `linkContentToLocation` checks `includes(sourceId)`
  before patching to avoid duplicate ids. This is a two-way-readable,
  one-way-written relationship: the location array is the only place
  the link is stored; nothing is written back onto the NPC/Quest/
  Enemy/Image record itself (matching the pre-existing direction of
  truth `LocationLinksTab` already assumed).
- **BattleEntry** — one-way link via the entry's own pre-existing
  `sourceLocationStateId` field, written with
  `store.updateBattleEntry(id, { sourceLocationStateId })`. There is no
  array on `LocationState` for battle entries; the direction of truth
  is BattleEntry → location only. Linking never touches
  `sourceMapId`/`position` — only "Поставить маркер" actions touch
  placement, exactly as required.
- Unlinking via the existing `LocationLinksTab` checkboxes (§6B,
  untouched this pass) removes only the array entry / clears
  `sourceLocationStateId` — it was already proven not to delete the
  underlying NPC/Quest/Enemy/Image/BattleEntry record or its marker,
  and that behavior is unchanged.

### 25.5 Duplicate prevention and editor consistency

- `isContentLinkedToLocation` / `linkContentToLocation` are checked
  before every write — confirmed in testing that repeating "Поставить
  маркер и привязать" on an already-linked NPC leaves `npcIds` with
  exactly one entry, never two.
- Marker placement itself reuses the unchanged §23/§24 move-or-place
  functions, so marker duplicate-prevention is identical to before.
- The Library panel's existing "Связано" badge (pre-existing, reads
  the same `LocationState` arrays) updates immediately after linking
  with no extra wiring needed.
- `LocationLinksTab` shows newly linked objects immediately since it
  reads the same arrays the menu now writes to.
- Reload (full page reload against the `localStorage` overlay)
  preserves both the marker and the relationship array entry — verified
  directly against the persisted overlay JSON in testing.

### 25.6 Mode guard and safety

The drag-and-drop entry point's existing `isDragDropBlocked()` check
(§24.6 — `!isEditMode` / `editingRouteId` / `editingZoneId`) still runs
*before* `maybeOpenLinkMenuOrPlace` in `handleMapDrop`, unchanged in
position — a blocked drop shows the warning banner and never opens the
menu or writes anything. The picker and Library arm-then-click entry
points are gated the same way they always were in §23/§24 (DM Edit
mode only; arming any one-shot tool via the Library panel goes through
the same `cancelAllEditTools()` chokepoint as every other tool here).
No partial placement or relationship write happens before the DM picks
a menu action — confirmed by inspecting the overlay JSON immediately
after opening the menu (no write) and after pressing Escape (still no
write).

`linkMenuState` is local `MapWorkspacePage` component state, never
passed to or read by the Observer route — confirmed live: navigating
to `/observer` shows no `.link-target-menu`, no `.object-picker-overlay`,
no Library panel, and none of the DM-only marker badges (NPC/QST/ENM/
IMG/BAT) render at all, matching §23.7/§24.8's existing Player Safe
guarantees. Linking a hidden object to a visible location does not
reveal it, since the Observer projection never reads `MovableEntity`/
BattleEntry data through the new `LocationState` array fields in the
first place — the player-safe projection's existing chokepoint
(`getPlayerSafeMovableEntities()` → `[]`, `getPlayerSafeBattleEntries()`)
is untouched.

### 25.7 Verified this pass (live browser testing)

- NPC: armed via Library "Разместить на карте", clicked near a hotspot
  → menu opened with correct location name; "Поставить маркер и
  привязать" placed the marker and added the NPC id to `npcIds`;
  repeating the same action showed "Уже привязан к этой локации." and
  did not duplicate the id.
- Quest: armed via Library, clicked near the same hotspot → menu
  opened with the quest title; Escape closed the menu with the
  overlay's `questIds` for that location confirmed still `undefined`
  (no write).
- Enemy: armed via Library "Разместить на карте", dropped on a point
  far from any hotspot (0.05, 0.05) → no menu, placed immediately
  (free-map placement still fast).
- BattleEntry: armed via Library, clicked near the hotspot, chose
  "Поставить маркер и привязать" → confirmed `sourceLocationStateId`
  set on the entry and `sourceMapId`/marker placement both correct.
- Image: dragged a Library image card onto the same hotspot, chose
  "Привязать к локации" (link-only) → `imageIds` gained the id and no
  new image marker was created (badge count unchanged), confirming
  link-only does not place a marker when one doesn't already exist.
- Drag-and-drop path confirmed to route through the identical menu as
  the picker/Library paths (same `maybeOpenLinkMenuOrPlace` call).
- `/observer`: confirmed no Library panel, no link menu, no picker
  overlay, and zero DM-only marker badges rendered.
- All four gates (`lint:hooks`, `typecheck`, `build`, full `lint`)
  pass; full lint baseline unchanged at 7 errors / 3 warnings.

### 25.8 Not done this pass — remaining

- Bulk placement / multi-select drag.
- Quest/Enemy full editing (no overlay slot — unchanged from §22.8).
- NPC/caravan/army route movement (foundation only, §20.7).
- Route/time integration for any marker type.
- Visual Plan Stage 1 (still paused per explicit standing instruction).

## 26. Stage 6C.5 Phase 1 + Phase 2 (partial) — DM Workflow UX Repair

Stage 6C.5 is a large, multi-phase UX repair effort spanning Library
relocation, right-panel simplification, a large object window, local
image upload, custom object creation, Player View marker projection,
map viewport stability, and mode-guard hardening. This section covers
what was actually implemented and verified so far — **Phase 1 (Library
relocation) and the mandatory "Object UX Simplification" block of
Phase 2** — not the full Phase 2 spec (Library central-workspace
conversion, map-level scope filtering, and explicit cross-map transfer
are NOT done — see §26.6).

### 26.1 Library relocation (Phase 1)

`LibraryPanel` (unchanged internally) no longer renders inside the
right panel's tab system. It now renders inside `.library-drawer-panel`,
a fixed-position left-side panel (`min(420px, 70vw)`) opened via an
always-visible "Библиотека" button at the top of `<aside>`. Deliberately
**not** a full-screen backdrop: only the drawer's own footprint
intercepts pointer events, so drag-and-drop onto the map and
arm-then-click placement both keep working while the drawer is open
(verified live). Closes via the close button, Escape, or
`cancelAllEditTools()`.

Known limitation carried over from Phase 1: at narrow window widths
(~970px tested), the drawer can cover most of the visible map. On
realistic desktop widths it leaves the map usable. This was not fixed
with a push-layout rework in this pass (out of scope without a larger
viewport/layout change — see §26.6).

### 26.2 Right panel simplification (mandatory UX block)

The old `<aside>` no longer has the long `Карточка/Точка на
карте/Данные локации/Связи/Маршруты/Объекты/Не размещено/Библиотека`
tab row. For a selected location it now shows a compact
`.object-overview`:

- **Header**: title, type, status, visibility badge.
- **Primary actions** (≤4 visible at once): `Открыть карточку`,
  `Редактировать`, `Показать игрокам`/`Скрыть от игроков` (toggles
  `LocationState.visibleToPlayers` directly), `Ещё`.
- **Summary**: `publicDescription`/`playerSafeDescription`, truncated.
- **Linked content counts**: NPC/Quest/Enemy/Image counts as clickable
  chips that open the object window's "Связи" section.
- **`Ещё` (collapsed)**: map quick actions (`Поставить партию здесь`,
  `Отметить посещённой`, `Создать событие здесь`, `Карта / маркер`),
  access to the general non-object tools (`Маршруты`/`Объекты`/`Не
  размещено` — unchanged, just collapsed instead of being top-level
  tabs), and a `<details>` "Опасная зона" with `Убрать маркер с карты`
  and `Сбросить локальные правки`.

When nothing is selected, the panel shows a one-line empty-state hint
plus the collapsed general-tools row. In non-edit mode (DM View/Player
View), the panel is unchanged from before (`LocationSidePanel` renders
inline exactly as it always did) — this restructuring only applies to
DM Edit mode.

### 26.3 Large object window (foundation)

`Открыть карточку`/`Редактировать` open `.object-window-panel`, a
centered modal (`min(960px, 94vw)`, max-height 88vh, scrolls
internally) with a header (title/type/status/visibility) and a 5-button
section nav: **Обзор** (`LocationSidePanel`, reused as-is) / **Редактирование**
(`LocationDataTab`, reused as-is) / **Связи** (`LocationLinksTab`,
reused as-is) / **Карта** (`HotspotInspector`, reused as-is) / **Опасная
зона** (new). None of the four reused components were modified — only
*where* they render changed (window section instead of inline aside
tab), so their internal behavior (save/cancel/draft state) is
unchanged and already-proven-safe.

**Опасная зона** contains two real, safe actions, each behind a
`window.confirm` with an explanation of exactly what is and isn't
deleted:
- `Убрать маркер с карты` → `handleDeleteHotspot(selectedHotspot.id)` —
  removes only the `MapHotspot` (pre-existing function, unchanged).
  Disabled when no hotspot is selected.
- `Сбросить локальные правки` → `store.resetOverride('locationState', id)`
  — the same pre-existing generic reset mechanism already used for
  NPC/Tavern/Shop/Image, now exposed for `LocationState` too.

Escape and `cancelAllEditTools()` both close the window with zero
writes (verified — opening/browsing all 5 sections and pressing Escape
leaves the store untouched; the window itself never patches anything,
only the reused components' own pre-existing Save buttons do).

**Not implemented this pass** (documented limitation, not silently
skipped): `Архивировать` and `Удалить локальный объект` — `LocationState`
has no `archived` field and no safe cascading-delete path was designed
in this pass for custom locations. Both are explicitly left out rather
than faked; see §26.6.

### 26.4 Regression verification (Stage 6C.4G)

After the right-panel restructure, re-tested live:
- Library drawer opens via the new standalone button (the original
  trigger was the now-removed tab row — re-added as a dedicated
  always-visible button at the top of `<aside>` after this was caught
  as a regression during this pass's own testing).
- Arm-then-click placement from the Library drawer for an Enemy card,
  dropped near a location hotspot → Stage 6C.4G's link-target menu
  still opens correctly with the right location name.
- No horizontal overflow on `.workspace-side-panel`
  (`scrollWidth === clientWidth`, verified).

### 26.5 Player Safe / Observer

`/observer`: confirmed no `.object-overview`, no `.object-window-panel`,
no Library button or drawer. Player View (`!isEditMode`) keeps the
exact pre-existing `LocationSidePanel`-only rendering, untouched by
this pass's restructuring.

### 26.6 Not done this pass — remaining for Stage 6C.5

- Library central workspace (900–1200px modal with search/type/scope
  filters) — still a left-side drawer, not yet the central workspace
  described in the Phase 2 spec.
- Map-level scope filtering (`Текущая карта`/`Вся арка`/`Другие
  карты`/`Уровень выше`) — **not implemented**. `Королевство Аурелон`
  and `Калдран` still appear in the Library's "Локации" list exactly
  like any other location; nothing currently prevents them from being
  selected via the existing arm-then-click flow, though in practice
  they already show "Уже размещено" (they have pre-existing hotspots
  on the current map) rather than an active placement button.
- Explicit cross-map transfer/copy/link confirmation dialog.
- Object window for NPC/Tavern/Shop/BattleEntry/Image (this pass only
  built it for Location).
- `Удалить локальный объект` / `Архивировать` actions.
- Local image upload (explicitly out of scope this pass).
- Custom object creation (explicitly out of scope this pass).
- Player View marker projection changes (explicitly out of scope this
  pass).
- Map viewport centering/zoom rework (explicitly out of scope this
  pass).
- Mode-guard hardening audit across all entry points (not done as a
  dedicated pass).

Usability baseline is **not** accepted yet — see
`docs/CAMPAIGN_MAP_WORKSPACE_USABILITY_BASELINE_ACCEPTANCE.md`.

## 27. Stage 6C.5 Phase 2B — Central Library Workspace + Map-Level Scope Filtering

### 27.1 Central workspace modal

`LibraryPanel` (unchanged internally — same component as §26) now
renders inside a true centered modal instead of a left-side drawer:
`.library-drawer-panel` is a full-screen backdrop (`position: fixed;
inset: 0`), `.library-drawer-panel-inner` is the actual panel
(`min(1100px, 94vw)`, `max-height: 88vh`, internal scroll). The header
shows "Библиотека", the current arc id, and the current map title, plus
a close button. Clicking the backdrop closes it (suppressed while any
arm-then-click tool is mid-arming, to avoid an accidental close right
as the DM picks an object); Escape and `cancelAllEditTools()` both
close it too (already wired in §26, reused as-is).

**Documented trade-off**: because this is now a real full-screen
backdrop, drag-and-drop from the Library directly onto the map cannot
work while the modal is open (the modal covers the map). This was
explicitly allowed by the spec ("if drag/drop from a central modal is
awkward, keep arm-then-click as primary"). Every `Разместить…`/
`Связать…`/`Открыть карточку` action in the Library now also calls
`setLibraryDrawerOpen(false)` itself, so the modal closes the instant
an object is armed/selected and the very next map click lands
correctly — exactly the same one-shot arm-then-click flow as before,
just with an extra auto-close step that didn't used to be necessary
when the Library was inline in the aside (and never covered the map).

### 27.2 Map-level scope filtering for Locations

`LocationState` has no first-class hierarchy-tier field — `parentLocationStateId`
is a parent/child relation, not a map-level. The fix uses a concrete,
data-grounded heuristic instead of inventing a new schema field:
`isHierarchyLocation(ls)` checks `ls.type` (already free text, but
consistently populated by the seed data) against a fixed set —
`{'kingdom', 'region', 'world', 'город', 'город-крепость'}`. This was
verified against the actual live data before implementing: "Королевство
Аурелон" has `type: 'kingdom'`, "Калдран" has `type: 'region'`,
"Грейхольм" has `type: 'город-крепость'` — exactly the three objects
named in the UX complaint.

`filteredLocations` (the normal placement-candidate list) now always
excludes hierarchy locations, regardless of the placement filter
dropdown. They're shown instead in a separate, clearly-labeled
`.library-hierarchy-locations` block below the main list, collapsed by
default behind `Показать уровень выше (N)`. When revealed, each card
gets a `Уровень карты` badge, an explanation ("Это объект уровня карты
(мир/регион/город), а не точка на текущей карте. Его нельзя разместить
как обычную локацию без явного переноса/локальной ссылки — это не
реализовано в этой версии."), and only one action: `Открыть карточку`
(wired to a new optional `onSelectLocationCard` prop that selects the
location and opens the §26 object window) — no `Разместить на карте`
button at all, so there is no path, accidental or intentional, to
placing a kingdom/region object as an ordinary city-map location.

If the main list becomes empty specifically because only hierarchy
objects exist for the current search/filter, the empty-state message
becomes "Это объекты уровня выше. Их нельзя просто разместить внутри
текущей карты без переноса или локальной ссылки." instead of the
generic "Ничего не найдено."

### 27.3 Not implemented this pass

- The fuller 6-option scope filter from the spec (`Текущая
  карта`/`Можно разместить здесь`/`Связано с выбранной локацией`/`Вся
  текущая арка`/`Другие карты`/`Все`) was not built. Only the concrete,
  named problem (kingdom/region objects polluting the default Локации
  list) was fixed, via the simpler reveal-toggle mechanism above.
- No explicit cross-map transfer/copy/local-reference dialog exists.
  Hierarchy locations are currently view-only (`Открыть карточку`) with
  no path to "bring this onto the current map" at all — this is treated
  as a feature, not a gap, until an explicit transfer workflow is
  designed (placing a kingdom node onto a city map was never a valid
  action to begin with).
- NPC/Tavern/Shop/Quest/Enemy/BattleEntry/Image sections were not
  given scope/map-level grouping — the complaint was specifically about
  Locations, and those types don't have the same kingdom/region/city
  hierarchy problem (an NPC genuinely can be linked to any location
  regardless of map level).
- Library content is still grouped only by type (Локации/NPC/Таверны/…),
  not by the spec's richer scope-based primary grouping
  (`На текущей карте`/`Можно разместить здесь`/`Другая карта`/etc).
- Responsive full-screen-sheet behavior on small screens was not
  separately implemented — the modal uses `min(1100px, 94vw)` which
  already shrinks on narrow viewports, but no distinct mobile layout
  was built.

### 27.4 Regression verification

Re-tested live after the drawer→modal conversion:
- Arm-then-click placement (Enemy via Library "Разместить на карте")
  closes the modal automatically; the next map click opens Stage
  6C.4G's link-target menu correctly with the right location name.
- No horizontal overflow on `.workspace-side-panel`.
- Escape closes the Library modal.
- `/observer`: no Library modal, no Library button, no object window.

### 27.5 Gates

`lint:hooks`, `typecheck`, `build` all PASS; full `lint` baseline
unchanged (7 errors / 3 warnings).

Usability baseline remains **not accepted** — see
`docs/CAMPAIGN_MAP_WORKSPACE_USABILITY_BASELINE_ACCEPTANCE.md`.

## 28. Stage 6C.5 Phase 2D — DM Companion Source Integration (Location only)

### 28.1 The actual state of "DM Companion integration" before this pass

Before writing any new adapter code, this pass first verified what
already existed, because the requesting task assumed Campaign Map was
a from-scratch manual content editor disconnected from DM Companion.
That assumption was **false** — concretely verified:

- `src/data/loadCampaignData.ts` already `fetch()`s
  `public/data/dm-companion/{locations,npcs,quests,custom-enemies,
  images,taverns,shops,factions,economy,economy-reference,laws}.json`
  at runtime.
- These files are **byte-identical** to the live files in
  `/Users/dmitry/Downloads/днд сюжет/dm-companion/public/data/` (diffed
  directly — zero differences), with matching entity counts (73
  locations, 140 NPCs, 51 quests, 127 enemies, 293 images, etc.).
- `public/images/telegram/` already contains the matching image files.
- There is no live sync mechanism (a future dm-companion edit needs a
  manual re-copy), but the data is not stale relative to what currently
  exists in dm-companion, and it was never invented/hand-authored by
  Campaign Map.

So the "DM Companion is the source of truth, Campaign Map is the
placement layer" architecture the task asked for **already existed**.
What was actually missing, verified concretely: `DmLocation` (the typed
shape of `data.locations`) already carries `atmosphere`, `lore`,
`playerView`, `rumors`, `quickScenes`, `region` — but `buildLocationStates`
(the function that turns `DmLocation` into the `LocationState` records
the rest of the UI reads) only copies `title`/`publicDescription`/
`dmNotes`/`tags`/relationship-id-arrays into `LocationState`, silently
dropping `atmosphere`/`lore`/`rumors`/`quickScenes`/`region`/`aliases`.
No component anywhere read those fields. This was the real, scoped gap
this pass fixed — a missing **read surface**, not a missing data
source.

### 28.2 What was implemented

`CompanionLocationCard` (new component, `MapWorkspacePage.tsx`, defined
just above `LocationSidePanel`) takes the raw `DmLocation` record
(looked up via `data.locations.find(l => l.id === selectedLs.locationId)`)
and renders, in DM Companion's dark/gold visual language (reusing this
app's existing `--gold`/`--gold-soft` tokens, no new palette): full
description, atmosphere, lore, "Что видят игроки", rumors, quick
scenes, resolved NPC names, resolved quest titles, and a DM-only notes
section (`dmSecrets`/`notes`).

It renders inside the existing object window's "Обзор" section,
**above** the pre-existing `LocationSidePanel` content (kept completely
unmodified below it) — purely additive, no existing capability removed.

Verified live against the exact example named in the task ("Гильдия
авантюристов Грейхольма"): placed it on the city map via Library
arm-then-click, selected it, opened the object window, and confirmed
the card shows description, atmosphere ("Рабочая, практичная, без
романтики…"), lore (the full guild-vs-state contract-law paragraph),
player view, all 4 linked NPC names resolved from ids, all 10 linked
quest titles resolved from ids, and the DM-only note
("См. также faction-guild-greyholm.").

### 28.3 What was NOT implemented this pass (explicitly deferred, not silently skipped)

This pass deliberately did not attempt the full 25-section spec in one
turn. Not done:

- **NPC/Quest/Enemy/Tavern/Shop/Image/Economy full source windows** —
  only Location got a rich card. The same gap exists for these types
  (e.g. `DmNpc`'s raw JSON has `knowledge`/`speechStyle` that aren't
  even in the `DmNpc` TS type yet, unlike `DmLocation` which already
  had the rich fields typed) — fixing those requires the same pattern
  (extend type if needed → build a `Companion<Type>Card` → wire into
  that type's object-window/right-panel "Открыть карточку"), but for 6
  more entity types.
- **New adapter-layer files** (`dmCompanionTypes.ts`,
  `loadDmCompanionSource.ts`, etc.) were **not created** — they were
  not needed, since `loadCampaignData.ts`/`campaignDataContext.tsx`
  already do this job. Creating parallel new files would have
  duplicated working infrastructure.
- **Copying data/images** was **not redone** — already done by a prior
  pass (not part of this session), confirmed byte-identical.
- **Map cleanup of old/conflicting placements** — not attempted; no
  evidence was found during this pass that current map placements
  conflict with DM Companion source data (they reference the same ids).
- **Relationship resolution for names-not-ids** — not needed; verified
  all relevant raw JSON relationships are already id-based, not name
  strings (e.g. `quest.location: "loc-bandit-camp-dense-forest"`, not a
  literal name).
- Object windows for other types, economy display, laws/lore display,
  full per-type smoke test matrix from the original spec's §22 — not
  run; only Location was touched, so only Location was tested.

### 28.4 Player Safe / Observer / regression

`/observer`: confirmed no `.companion-source-card`, no object window.
Stage 6C.4G's link menu, arm-then-click placement, and duplicate
prevention were all exercised again as part of placing the test
location and were unaffected.

### 28.5 Gates

`lint:hooks`, `typecheck`, `build` all PASS; full `lint` baseline
unchanged (7 errors / 3 warnings).

Usability baseline remains **not accepted** — see
`docs/CAMPAIGN_MAP_WORKSPACE_USABILITY_BASELINE_ACCEPTANCE.md`.

## 29. Stage 6C.5 Phase 2D-Fix — DM Companion visual parity bug fixes

Per explicit instruction ("stop expanding new entity types until the
current DM Companion integration UX blockers are fixed"), this pass
fixed four concretely diagnosed bugs from the manual review screenshots
instead of starting Phase 2E (NPC/Tavern/Shop/etc. source cards). Each
bug was root-caused by a dedicated read-only investigation pass before
any code was touched, to avoid guessing/over-fixing.

### 29.1 Location preview image showing placeholder icon

**Root cause** (`src/pages/map-workspace/libraryCards.ts`,
`resolveEntityPreviewImage`'s `case 'location':` branch): looked up
images by `entity.id`, but for a `LocationState` that `id` is the
**composite** `${locationId}__${timelineId}` key, which never matches
`images.json`'s `relatedEntity` (a raw, non-composite location id).
The branch also ignored `LocationState.imageIds`, already correctly
populated by `buildLocationStates`, entirely.

**Fix**: read `loc.imageIds[0]` first (exact id lookup), falling back
to the relation lookup keyed by `loc.locationId` (the raw id), not
`loc.id`.

Confirmed via investigation agent that the `tavern`/`shop` branches
were already correct — any remaining placeholder icons for those types
trace to genuinely empty image fields in source data, not a code bug.
Not touched.

### 29.2 Image lightbox opening behind the object window

**Root cause**: `EntityDrawer`'s `.drawer-overlay` (which also renders
the image lightbox, via `drawer.kind === 'image'`) and the object
window's `.object-window-overlay` are same-level DOM siblings, not
nested — confirmed by investigation agent, ruling out an
`overflow:hidden`/clipping cause. Pure z-index ordering bug:
`.drawer-overlay` was `z-index: 50`, `.object-window-overlay` was `60`,
so the lightbox always rendered underneath.

**Fix**: bumped `.drawer-overlay` to `z-index: 80` (`src/index.css`).
Verified live: opening an image from inside the object window now
renders the lightbox fully on top, fully clickable/closable.

### 29.3 Read/open actions blocked outside DM Edit mode

**Root cause**: the right-panel overview and the large object window
were both gated on `isEditMode` (`store.mode === 'dm-edit'`) entirely,
so switching to DM View hid them completely — selecting an object,
opening its card, or browsing its linked content (all read-only
navigation) required switching back to DM Edit, contradicting the
explicit instruction that "read/open/navigation actions are allowed in
DM modes; only write/edit/placement actions are guarded."

**Fix**: added `isDmMode = !isPlayerView` (covers both `dm-edit` and
`dm-view`). Changed the `.object-overview` and `.object-window-overlay`
gates from `isEditMode` to `isDmMode`. Within those, individually
wrapped only the write-capable controls (`Редактировать`,
visibility-toggle, `Ещё`/danger-zone toggle on the panel;
`Редактирование`/`Связи`/`Карта`/`Опасная зона` section-nav buttons on
the object window) in `isEditMode`-only guards, each with
`disabled`+explanatory `title="Доступно только в режиме DM Edit"` on
the window's nav buttons rather than hiding them outright. `Обзор` and
`Открыть карточку` stay unconditionally available in any DM mode.
Added `effectiveObjectWindowSection = isEditMode ? objectWindowSection
: 'overview'`, a render-time derived value (not a `setState`-in-effect,
which would have regressed the `react-hooks/set-state-in-effect` lint
baseline) used everywhere the window decides what to render — so
switching DM Edit → DM View with the window open on e.g.
"Редактирование" renders as "Обзор" immediately, and switching back to
DM Edit restores the previously selected section without it having
been lost.

**Explicitly deferred**: the Library modal's own open-gate is still
`isEditMode`-only (not changed to `isDmMode`) — investigation found
`LibraryPanel`'s placement/edit action buttons have no per-action mode
guards of their own (only a later fallback in `handleMapClick` checks
`isEditMode`), so opening the Library in DM View would expose
unguarded write actions. Doing this properly needs per-button guards
inside `LibraryPanel` itself, out of scope for this pass; documented as
a remaining gap below.

Verified live in all three modes: DM Edit (full window, all tabs
enabled), DM View (overview + Обзор-only window, write controls hidden
or disabled with the explanatory tooltip), Player View (completely
unaffected — separate panel, no object window, no DM-only data).
`/observer` unaffected (separate route, untouched).

### 29.4 False "Уже размещено" badge for taverns/shops

**Root cause** (`MapWorkspacePage.tsx`, `LibraryPanel`'s Tavern/Shop
sections): the `placed` flag came from `placedSourceIds`, a `Set` built
from `locationsForTimeline` — every `LocationState` in the current
**timeline/arc**, filtered only by `timelineId`, with no `mapId`/
current-map filter at all. A tavern/shop placed on any map within the
same arc was therefore shown as "Уже размещено" on every other map in
that arc too.

**Fix**: replaced the `placedSourceIds.has(...)` check in both
sections with the existing `hotspotPlacementState` helper (already in
`libraryCards.ts`, already used correctly elsewhere for Locations),
looking up the source `LocationState` for the tavern/shop
(`locations.find(ls => ls.sourceLibraryType === 'tavern'/'shop' && ls.sourceLibraryId === t.id/s.id)`)
and checking whether it has a hotspot specifically in
`hotspotsOnCurrentMap` (`=== 'placed_current_map'`), not just anywhere
in `allHotspots`.

Verified live by inspecting the persisted overlay state directly: on
the Грейхольм map, "Таверна «Северный Очаг»" and "Таверна «Синяя
Форель»" both show "Размещено на карте", and both have a hotspot with
`mapId: 'map-city-greyholm'` confirmed in `newHotspots` — genuinely
placed on the current map, not a false positive from another map.

### 29.5 Gates

`lint:hooks`, `typecheck`, `build` all PASS; full `lint` baseline
unchanged (7 errors / 3 warnings).

### 29.6 Not done this pass (explicitly deferred)

Per the governing instruction, Phase 2E (extending
`CompanionLocationCard`'s pattern to NPC/Tavern/Shop/Quest/Enemy/
Image/Economy) was **not started**. Also not done: replacing the
technical-tab-first object window look with DM-Companion-content-first
styling beyond what 28.2 already added; copying DM Companion's
shop/tavern layout; linked-object-click → opens-corresponding-window
navigation; Library's own mode-guard gap noted in 29.3. These remain
open for a future pass.

## 30. Stage 6C.5 Phase 2E-Reset (partial) — Library category tabs + image resolver fallback fix

The full Phase 2E-Reset spec asked for: (a) inspecting and reusing DM
Companion's actual web components for 7+ entity types, (b) a new
`embedded-dm-companion` module with full-page-style windows for
Location/NPC/Tavern/Shop/Quest/Enemy/Image/Economy replacing the
current popups, (c) Library converted to category tabs, (d) a global
image-resolver audit, (e) linked-entity navigation between full cards,
all in one pass. That is a multi-day rewrite, not a single-pass change
that can be verified responsibly. This pass scoped down to the two
most concretely actionable, independently verifiable pieces — Library
tabs and the image-resolver fallback gaps — rather than attempting the
full reset shallowly. The remaining items (full DM-Companion-parity
windows per entity type, an embedded module, linked full-card
navigation) are **not done** and are listed under Limitations below.

### 30.1 Inspection performed

Before touching code, `/Users/dmitry/Downloads/днд сюжет/dm-companion/src`
was inspected read-only (component/page files, image-resolution logic,
NPC/Tavern/Shop/Economy section order, CSS classes). Findings:

- Detail pages: `pages/locations/LocationDetailPage.tsx`,
  `pages/npcs/NpcDetailPage.tsx`, `pages/taverns/TavernDetailPage.tsx`,
  `pages/shops/ShopDetailPage.tsx`, `pages/quests/QuestDetailPage.tsx`,
  `pages/enemies/EnemyDetailPage.tsx`, `pages/images/ImagesPage.tsx`,
  `pages/economy/EconomyPage.tsx`.
- Image resolution lives in `utils/lookup.ts`
  (`findImage`/`imagesForEntity`, relation lookup by
  `image.relatedEntity === entityId`) and `utils/entityPreview.ts`
  (per-type fallback chains: NPC/Enemy/Shop check `entity.image` then
  fall back to the relation lookup; Location has no direct field, is
  resolved purely by relation; Tavern checks `relatedImages[0]` first).
  Display fallback is `thumbnailSrc ?? src`.
- NPC order: tags → race/role → faction → hero portrait → image
  gallery → linked location/shop → personality/secrets (DM-only) →
  linked quests → notes → actions.
- Tavern order: tags → description → location/owner/staff → menu/rooms
  (via a shared `PurchaseCart` component also used by shops) →
  services → linked NPC/quests → image gallery → rumors → notes.
- Shop/Economy: tags → hero image → description → discounts → goods
  (same `PurchaseCart` component as taverns); `EconomyPage.tsx` and
  `useEconomyReference.ts` load `data/economy-reference.json` as an
  independent category/price table that shops reference into, rather
  than embedding prices per-shop.
- **Reusability verdict**: the `*DetailPage.tsx` wrappers are coupled
  to DM Companion's own `useAppData()`/`react-router-dom` context and
  are not directly copy-pasteable. The presentational layer
  (`EntityHeroImage`, `RelatedImages`, `ImageLightbox`, shared atoms,
  and the pure `lookup.ts`/`entityPreview.ts` helpers) is genuinely
  portable — recommended path for a future pass is lifting those plus
  the documented section order/CSS classes as a template, not copying
  the page wrappers themselves.

This inspection's full findings are the basis for any future pass that
builds the actual `CompanionNpcCard`/`CompanionTavernCard`/etc. — not
yet built this pass.

### 30.2 Library category tabs (implemented)

**Problem**: the Library was one long vertical list — Локации, then
NPC, then Таверны, Лавки, Квесты, Враги, Боевые сцены, Изображения,
all stacked. Reaching NPC required scrolling past every location.

**Fix** (`MapWorkspacePage.tsx`, `LibraryPanel`): added
`activeCategory` state (`'locations' | 'npc' | 'taverns' | 'shops' |
'quests' | 'enemies' | 'battleEntries' | 'images'`, defaulting to
`'locations'`) and a sticky tab bar showing each category with its
live count (e.g. `NPC (46)`). Each of the 8 existing section blocks
(4 hand-rolled `<section>`s plus 4 `<LibraryReadOnlySection>`
instances) was wrapped in `{activeCategory === 'X' && (...)}` — no
internal logic of any section was changed, only which one renders.
Search and the placement filter still apply within whichever category
is active, unchanged from before.

Verified live: clicking `NPC (46)` immediately shows only the NPC
list (no locations above it); clicking `Изображения (293)` immediately
shows the image grid. All 8 tabs checked.

### 30.3 Image resolver fallback gaps (fixed for NPC/Enemy)

**Problem**: `resolveEntityPreviewImage` in `libraryCards.ts` already
had a direct-id → relation-lookup fallback chain for `shop`/`quest`/
`tavern`/`location` (fixed in Phase 2D-Fix for location), but `npc`
and `enemy` only checked the direct `image` field with **no
fallback** — an NPC/enemy with no `image` field set but a real
relation-matched image in `images.json` always showed the placeholder
icon, even though DM Companion's own `entityPreview.ts` does fall back
to the relation lookup for exactly these two types.

**Fix**: both `case 'npc':` and `case 'enemy':` now do
`imageById(images, entity.image) ?? firstLinkedImage(images, entity.id)`,
matching DM Companion's own chain.

Verified live: NPC tab shows real portraits; Враги tab correctly
shows the fallback icon for enemies that have no image source at all
in either field (confirmed this is a genuine data gap, not a resolver
bug — there's no `images.json` entry related to those particular
generic-monster ids).

### 30.4 Gates

`lint:hooks`, `typecheck`, `build` all PASS; full `lint` baseline
unchanged (7 errors / 3 warnings).

### 30.5 Player Safe / Observer / regression

`/observer`: re-verified after this pass — zero buttons rendered, no
`.companion-source-card`, no `.object-window-overlay`, no Library, no
DM-only text. Player View and Battle Map routing untouched (no files
in those paths touched this pass).

### 30.6 Explicitly NOT done this pass (the bulk of Phase 2E-Reset)

- **Embedded DM Companion module** (`src/features/embedded-dm-companion/`
  etc.) — not created.
- **Full DM-Companion-parity windows** for NPC, Tavern, Shop, Quest,
  Enemy, Image, Economy — only Location has one (`CompanionLocationCard`,
  from Phase 2D). The right panel and object window for all other
  types are unchanged from before this pass.
- **Linked-entity navigation that opens full cards** (Location → NPC,
  Tavern → Image, Quest → Enemy, etc.) — not implemented; today,
  clicking a linked NPC/quest/image row inside any window does not
  open that entity's own window.
- **Shop/Economy goods display, tavern menu/rooms/services parity** —
  not implemented; shops/taverns still show only their existing short
  Campaign Map fields, not a DM-Companion-style page.
- **Library read-only opening in DM View** — still gated `isEditMode`
  only (documented limitation from Phase 2D-Fix, still open).
- **Placement badge semantics for NPC/quest/enemy/image** (`Связано
  без маркера`, `Размещено и связано`, etc., beyond what already
  existed) — not revisited this pass; only the tavern/shop "Уже
  размещено" map-scoping bug (already fixed in Phase 2D-Fix) was in
  scope for badges.
- **Global image-resolver audit beyond NPC/Enemy** — quest/shop/tavern/
  location fallback chains were already correct (verified in earlier
  passes); battleEntry's chain (`previewImageId` → battle-map preview)
  was not changed and not re-audited against DM Companion's logic this
  pass.

These remain real, acknowledged gaps. The usability baseline stays
**not accepted**.

## 31. Stage 6C.5 Phase 2F (partial) — Tavern/Shop DM Companion-parity cards

The full Phase 2F spec asked for an `embedded-dm-companion` module
covering 8+ entity types with full linked-card navigation, in one
pass. As with Phase 2E-Reset, this was scoped down to one concretely
finishable, fully-verified slice — real Tavern and Shop cards ported
from DM Companion's actual source — rather than a shallow pass across
everything. This is the same architecture the full spec asks for,
proven on two real types end-to-end; extending it to NPC/Quest/Enemy/
Image is now a known, repeatable pattern (see 31.4) for a future pass.

### 31.1 Architecture insight (the actual root cause of "still looks technical")

Inspecting `handleMapClick`/`placeContentByType` (where Library
placement actually writes data) revealed why taverns/shops never got a
rich card even after Phase 2D: **a placed Tavern or Shop materializes
as a `LocationState`** (tagged `sourceLibraryType: 'tavern'|'shop'` +
`sourceLibraryId`), going through the exact same selection/object-window
code path as a real Location. The existing `CompanionLocationCard`
lookup (`data.locations.find(l => l.id === selectedLs.locationId)`)
silently fails for these — there's no matching `DmLocation` — and
falls through to nothing, leaving only the generic `LocationSidePanel`
underneath. That's the actual mechanism behind "shop/tavern windows
look like technical Campaign Map panels": not a missing card, a wrong
lookup for that source type.

### 31.2 Tavern card (implemented)

Inspected `dm-companion/src/pages/taverns/TavernDetailPage.tsx` directly
(real file, not summarized) and its three composed components
(`DetailField`, `RelatedLinks`, `RelatedImages`) plus
`TavernDetailPage.css`/`RelatedImages.css` for the exact section order
and styling convention: tags → description → atmosphere → location/
owner/staff → menu → rooms → services → linked NPC/quests → images →
rumors → DM notes.

`CompanionTavernCard` (new, `MapWorkspacePage.tsx`, just before
`LocationSidePanel`) recreates this order using the existing
`DmTavern` type, which **already had every field needed** (`menu`,
`rooms`, `services`, `rumors`, `relatedNpcs`, `relatedQuests`,
`relatedImages`, `atmosphere`, `ownerNpcId`/`ownerName`, `staff`) — no
type changes required, confirming the earlier-session finding that
"rich fields exist but are unrendered" applies here too, not just to
Location.

Deliberately **not** ported: DM Companion's `PurchaseCart` (a buy/cart
UI component) — per this stage's explicit instruction not to build a
new transaction system. Menu/room items render as plain readable rows
(name — price · description) instead, which satisfies "usable as a
reference during session" without the cart's scope.

Wired into the object window's "Обзор" section: `selectedLs.sourceLibraryType
=== 'tavern'` now looks up the real `DmTavern` by `sourceLibraryId` and
renders `CompanionTavernCard` instead of the (always-null)
`CompanionLocationCard` attempt.

**Verified live** against the named smoke target `Таверна «Северный
Очаг»`: real hero image, description, atmosphere, owner (Элина
Равенхарт), staff, full Меню (5 items with prices/descriptions), full
Комнаты (3 items), Услуги (4 items), Связанные NPC, Слухи (3 entries),
and DM-only notes — all rendering, matching DM Companion's own field
set and order exactly.

### 31.3 Shop + Economy card (implemented)

Inspected `dm-companion/src/pages/shops/ShopDetailPage.tsx` directly:
tags → hero image → description → relation-to-players → discounts →
rumors → location/owner links → services → goods (via `PurchaseCart`,
not ported, same reasoning as tavern) → DM notes.

`CompanionShopCard` (new, same file) recreates this order using the
existing `DmShop` type (already had `items`, `services`, `rumors`,
`discounts`, `relationToPlayers` — no type changes needed). Goods are
grouped by `item.category` with a heading per category — DM Companion
itself only puts the category into the item's meta string rather than
grouping with headers; the explicit grouping here is an in-scope
readability improvement requested by this stage's spec ("товары
group по категории"), not a deviation from the source data shape.

Wired the same way: `selectedLs.sourceLibraryType === 'shop'` looks up
the real `DmShop` and renders `CompanionShopCard`.

**Verified live** — the exact named smoke target (`Лавка дорожных
товаров «Мирра и Олден»`) could not be reached without first placing
it (Library currently has no "open card without placing" action for
Tavern/Shop rows — see 31.5), so verification used the already-placed
`Травяная лавка Лины Уотерс` instead, which exercises the identical
code path/component. Confirmed: real hero image, description,
"Отношение к игрокам", "Скидки", "Слухи" (2 entries), owner, Услуги (3
entries), and goods correctly grouped into 2 categories ("Алхимия и
редкие товары", "Инструменты и наборы") with name/price/description/
availability per item, plus DM-only notes.

### 31.4 Pattern for extending to NPC/Quest/Enemy/Image (not yet built)

The same three-step pattern applies to every remaining type:
1. Read the real DM Companion `*DetailPage.tsx` for that type (already
   done for NPC/Quest/Enemy/Image at a summary level in Phase 2E-Reset's
   §30.1 — needs the same line-by-line read this pass gave Tavern/Shop).
2. Confirm the existing `Dm*` type in `dmCompanion.ts` already carries
   the needed fields (pattern so far: it usually does — Location,
   Tavern, and Shop all needed zero type changes).
3. Build `Companion*Card`, wire it into wherever that type is selected
   (NPC/Quest/Enemy/Image do not yet have their own object-window
   branch the way Location/Tavern/Shop now do via `selectedLs` — they
   currently use separate, older selection UI, so step 3 needs its own
   investigation per type before the card can even be reached).

### 31.5 Known gap surfaced this pass

The Library's Tavern/Shop rows have no "Открыть карточку" action —
only "Разместить на карте" (place) and "Редактировать карточку" (the
old technical editor). Viewing the new rich card for an unplaced
tavern/shop currently requires placing it first. This mirrors the
Location section's `Открыть карточку` button (added for hierarchy
locations in Phase 2B) but was never added for Tavern/Shop. Not fixed
this pass — noted as a concrete next step.

### 31.6 Gates

`lint:hooks`, `typecheck`, `build` all PASS; full `lint` baseline
unchanged (7 errors / 3 warnings).

### 31.7 Player Safe / Observer / regression

`/observer` re-verified: 0 buttons, no `.companion-source-card`, no
`.object-window-overlay`. Library category tabs, 6C.4G link menu, and
Battle Map routing untouched (no files in those paths changed this
pass beyond the two new card components and their object-window wiring).

### 31.8 Explicitly NOT done this pass

- NPC, Quest, Enemy, Image companion cards — not built.
- Embedded module (`src/features/embedded-dm-companion/`) — not created.
- Linked-entity click → opens that entity's own window — still not
  implemented for any type, including the new Tavern/Shop cards (their
  linked NPC/quest names are plain text, not clickable, same limitation
  `CompanionLocationCard` already had).
- Library "Открыть карточку" for Tavern/Shop without placing first —
  gap identified in 31.5, not fixed.
- Library opening in DM View (still `isEditMode`-only) — pre-existing
  gap, not addressed this pass.

Usability baseline remains **not accepted**.

## 32. Stage 6C.5 Phase 2G — Embedded Companion Navigation + Library Open Card + NPC Full Card

### 32.1 Shared embedded companion navigation

New state in `MapWorkspacePage`: `companionStack: EmbeddedCompanionEntity[]`
(a back stack, not a single value) plus `openCompanion`/`companionBack`/
`closeCompanion` helpers. `EmbeddedCompanionEntity` is the exact union
the task specified (`location`/`tavern`/`shop`/`npc`/`quest`/`enemy`/
`image`, each `{ type, id }`).

This is deliberately a **separate** overlay from the existing
`.object-window-overlay` (the Location/Tavern/Shop-via-selected-hotspot
flow built in Phase 2D/2F), not a merge — merging would have meant
reworking that flow's proven gating/Escape/cancel wiring for no real
benefit this pass. The two now coexist: `.object-window-overlay` is
z-index 60, the new `.companion-window-overlay` is 70 (between it and
the image lightbox at 80, since a companion window can be opened from
a linked row *inside* the object window, and a lightbox can in turn be
opened from *inside* the companion window). Both wired into the shared
Escape-cancel `useEffect` and `cancelAllEditTools()`.

`EmbeddedCompanionWindow` (new component) renders the back button
(only when `companionStack.length > 1`), a close button, and dispatches
to the right card by `entity.type`: real cards for `location`/`tavern`/
`shop`/`npc`; for `quest`/`enemy`/`image` (not yet built — see 32.6) it
renders `<p>Полная карточка этого типа будет добавлена отдельным
этапом.</p>` rather than a silent no-op or a tiny ad-hoc popup, per the
task's explicit instruction.

### 32.2 Linked-entity navigation now actually opens cards

New shared `CompanionLinkRow` component renders a list of clickable
chips (`.companion-link-chip`) instead of the old `names.join(', ')`
plain text. Wired into every linked-NPC/quest/shop row that already
existed: `CompanionLocationCard`'s "NPC здесь"/"Квесты здесь",
`CompanionTavernCard`'s "Владелец"/"Персонал"/"Связанные NPC"/
"Связанные квесты", `CompanionShopCard`'s "Владелец". Each card now
takes optional `onOpenNpc`/`onOpenQuest`/`onOpenShop` callbacks; when
provided, the row renders as clickable chips that call
`openCompanion({ type, id })`; when not provided (the prop is optional,
not required), the old plain-text rendering is the fallback, so no
existing call site silently broke.

Verified live: from the object window's existing Location flow
(`Гильдия авантюристов Грейхольма`), clicking the linked NPC chip
"Мара Линн" opens her full NPC card on top (no nested modal pile —
just one companion window, replacing/stacking via the back stack); from
inside her card, clicking a linked quest chip pushes the quest
placeholder and shows "← Назад"; clicking it returns to Мара Линн
exactly as before.

### 32.3 Library "Открыть карточку" — works without placing

**Root cause being fixed**: Library's Tavern/Shop rows had no way to
view the new rich card without first placing the entity (noted as a
gap in §31.5); Location rows only had this for hierarchy-level
locations; NPC/Quest/Enemy/Image rows had none at all.

**Fix**: added `onOpenCompanion: (entity) => void` to `LibraryPanel`'s
props (and `onOpen?` to the shared `LibraryReadOnlySection`). Every
section's row now has an "Открыть карточку" button calling
`onOpenCompanion({ type, id })` — Location, NPC, Tavern, Shop, Quest,
Enemy, Image all covered (BattleEntry excluded — no corresponding
`EmbeddedCompanionEntity` type/card exists for it, out of scope this
pass). This button never writes data and is never disabled.

### 32.4 Library now opens and is read-only in DM View

**Root cause**: Library's own open-gate was hardcoded to `isEditMode`
(documented as a known gap in Phase 2D-Fix's report, never fixed
since), and none of its internal action buttons had per-button mode
guards.

**Fix**: changed the Library trigger button and the drawer's own mount
condition from `isEditMode` to `isDmMode`. Added `canWrite: boolean`
prop to `LibraryPanel` (passed `isEditMode` from the caller) and to
`LibraryReadOnlySection`. Every write-capable action — place/move
marker, link to selected location, edit card, drag-and-drop — is now
gated: disabled with `title="Размещение доступно в DM Edit"` for
buttons (so the affordance stays visible, just inactive, matching the
existing object-window nav-tab convention from Phase 2D-Fix), or
omitted entirely for buttons that have no sensible disabled state
(`Редактировать карточку`, `Связать с «...»`). `Открыть карточку`
itself is never gated by `canWrite` — it's a pure read action.

Verified live: in DM View, Library opens, NPC tab shows "Открыть
карточку" enabled (gold) and "Переместить маркер сюда" disabled
(greyed out); clicking "Открыть карточку" opens the real NPC card.
Player View and `/observer`: Library trigger absent entirely (`isDmMode`
excludes Player View; Observer is a separate route untouched by this
flag), confirmed via direct DOM query (0 buttons rendered at all on
`/observer`).

### 32.5 Full NPC card

**Type fix**: `DmNpc` was missing `speechStyle`, `knowledge`, and
`notes` — confirmed present in every NPC's raw JSON
(`public/data/dm-companion/npcs.json`) by direct inspection, never
added to the trimmed type before. Added all three (`src/types/dmCompanion.ts`).

**`CompanionNpcCard`** (new component) ports the exact section order
from DM Companion's real `pages/npcs/NpcDetailPage.tsx`: tags/shop
badge → race → role → hero image → gallery → location link → shop
link → personality → speechStyle → goals → knowledge → secrets
(DM-only) → related quests → notes (DM-only). Faction badges are
explicitly skipped — Campaign Map has no equivalent to DM Companion's
`useFactions()`/`useArcContext()`, and building one is out of scope.

Opens from: Library NPC tab's "Открыть карточку", any linked-NPC chip
inside Location/Tavern/Shop cards, and (when reached via a linked
chip) the back stack returns correctly to whatever opened it.

Verified live against "Эдрик Штальвейн": real portrait, Раса (Дварф),
Роль, Локация, Характер, Цели, Знания, Секреты (DM-ONLY), 3 linked
quest chips, DM-only notes — full parity with the DM Companion source
fields.

### 32.6 Gates

`lint:hooks`, `typecheck`, `build` all PASS; full `lint` baseline
unchanged (7 errors / 3 warnings) — caught and fixed two transient
`no-useless-assignment` regressions from `EmbeddedCompanionWindow`'s
`let title=''; let body=null;` pattern along the way (switched to
typed-but-uninitialized `let title: string; let body: React.ReactNode;`,
since every branch of the dispatch assigns both).

### 32.7 Player Safe / Observer / regression

`/observer`: re-verified after every change in this pass — 0 buttons,
no `.library-drawer-panel`, no `.companion-window-overlay`, no
`.companion-source-card`. Player View: Library trigger absent,
`hasCompanionWindow`/`hasSourceCard` both false via direct query.
Location/Tavern/Shop cards re-verified unaffected (their `onOpenNpc`/
etc. props are optional — Phase 2D/2F's original non-navigable
behavior was never the only path, just upgraded in place).

### 32.8 Explicitly NOT done this pass

- Quest, Enemy, Image full cards — still placeholders (by design, per
  the task's own scope limit for this pass).
- Linked navigation FROM a quest/enemy/image placeholder to anything
  else — not applicable yet, since those types have no real card to
  read fields from.
- BattleEntry — no `EmbeddedCompanionEntity` variant, no Library "Открыть
  карточку" for it either; not named in this task's required type list.
- A formal single-entry-point unification of `.object-window-overlay`
  and `.companion-window-overlay` into one system — they coexist
  correctly today but are still two parallel mechanisms, noted as a
  future cleanup once every entity type has a real card.

Usability baseline remains **not accepted**.

## 33. Stage 6C.5 Phase 2H — Startup Fix + Quest/Enemy Full Companion Cards

### 33.1 Part A — `start-campaign-vtt.command` port-conflict fix

Previously the launcher ran `npm run dev:open` unconditionally, which
crashed with `Error: Port 5175 is already in use` if a previous run
(or any other process) still held the port. Rewrote it to check first:

```bash
PID=$(lsof -ti tcp:"$PORT" 2>/dev/null | head -n1)
if [ -n "$PID" ]; then
  PROCESS_INFO=$(ps -p "$PID" -o command= 2>/dev/null)
  if echo "$PROCESS_INFO" | grep -qi "vite"; then
    echo "Campaign VTT is already running on port $PORT. Opening existing app."
    open "$URL"
    exit 0
  else
    echo "Port $PORT is already in use by another process (PID $PID): $PROCESS_INFO"
    echo "This does not look like the Campaign VTT dev server, so it was not stopped automatically."
    echo "To free the port yourself, run: kill $PID"
    exit 1
  fi
fi
npm run dev:open
```

If the existing process command line contains "vite" (true for any
real `npm run dev`/`vite` invocation), the script opens the browser to
the existing server and exits cleanly instead of crashing. If some
other, unrelated process holds the port, it prints the PID and command
and refuses to kill anything automatically — the user decides.

**Tested**: ran the script directly in this sandbox while port 5175 was
held by a non-Vite process (a `Claude Helper` proxy artifact of this
environment's preview tooling) — correctly detected it as non-Vite and
printed the safe message without crashing or killing anything.
**Known limitation**: the "Vite already running → open existing app"
branch could not be exercised in this sandbox, because the sandbox's
own Vite dev server is fronted by that same Claude Helper proxy rather
than a literal `vite` process on port 5175. On the user's real Mac,
running `npm run dev`/`vite` directly, the process command line will
contain "vite" and the detection should work as designed — this is
reasoned, not independently verified end-to-end in this session.

### 33.2 Part B — Real `CompanionQuestCard` and `CompanionEnemyCard`

Read DM Companion's actual `QuestDetailPage.tsx`/`EnemyDetailPage.tsx`
and the raw `quests.json`/`custom-enemies.json` directly (not guessed)
before extending types. Confirmed `DmQuest.solutions` is a **string
array**, not a single string — would have been wrong if guessed from
the field name alone. Extended `DmQuest` (`proof`/`solutions`/
`consequences`/`notes`) and `DmCustomEnemy` (full statblock: `cr`/`xp`/
`ac`/`hp`/`hitDice`/`speed`/`abilityScores`/`savingThrows`/`skills`/
`vulnerabilities`/`resistances`/`immunities`/`conditionImmunities`/
`senses`/`passivePerception`/`languages`/`attacks`/`features`/
`reactions`/`legendaryActions`/`tactics`/`dmNotes`), plus new
`DmAttack`/`DmFeature` helper interfaces, in `src/types/dmCompanion.ts`.

`CompanionQuestCard`: title + status + tags header, hero image, Локация/
Квестодатель/Цель/Описание/Враги (all via `CompanionLinkRow` where a
linked id resolves to a real entity)/Награда/Подтверждение выполнения/
Варианты решения (`<ul>`, since `solutions` is an array)/Последствия/
Заметки ДМ, ending in a fixed readonly-note paragraph: "Редактирование
квестов будет добавлено отдельным этапом. Сейчас используется исходная
карточка DM Companion."

`CompanionEnemyCard`: name + base monster + CR + XP + tags header, hero
image, `.companion-enemy-stats` blocks for AC/HP/Скорость and for the
six ability scores, Атаки/Способности/Реакции/Легендарные действия,
Чувства/Языки, Роль/Фракция/Лор, Тактика (DM-only), linked Локации/
Связанные квесты (via `CompanionLinkRow`), Заметки мастера (DM-only),
ending in the matching readonly-note paragraph for enemies. DM-only
fields are rendered unconditionally inside the component — safety comes
from the component only being reachable through `isDmMode`-gated entry
points (Library, linked chips, markers, right panel), the same
convention already established for `CompanionNpcCard`'s secrets/
`dmNotes` in Phase 2G.

Added `.companion-enemy-stats`/`.companion-enemy-stat`/
`.companion-readonly-note` CSS rules (none existed before this pass).

`EmbeddedCompanionWindow` dispatch extended: `quest`/`enemy` now render
the real cards via new `openLocation`/`openEnemy` helpers (alongside
the existing `openNpc`/`openQuest`/`openShop`); only `image` still
falls through to the "not built yet" placeholder.

### 33.3 Marker / right-panel "Открыть карточку" wiring

The selected-marker right panel (`selectedMovableEntityId` block) had
no action button at all for `resolvedQuest`/`resolvedEnemy`/
`resolvedImage`, and `resolvedNpc` only had "Редактировать карточку".
Added an "Открыть карточку" button calling `openCompanion({ type, id })`
for all four resolved types (`npc`/`quest`/`enemy`/`image`), alongside
the pre-existing edit button for NPC. Verified live: clicking a placed
quest marker → right panel → "Открыть карточку" opens the same full
`CompanionQuestCard` as the Library path; same for a placed enemy
marker → `CompanionEnemyCard`.

### 33.4 Regression / navigation verified live

- Library → Квесты tab → "Открыть карточку" → full quest card
  (Контракт №1), with working Локация/Квестодатель/Враги chips.
- Quest card → "Bandit" enemy chip → full `CompanionEnemyCard` (AC/HP/
  Speed/ability scores/attacks/languages/role/faction/linked location +
  quest chips/DM-only notes) — "← Назад" correctly returns to the quest.
- Quest/Enemy markers placed on the map → right panel → "Открыть
  карточку" → same full cards (33.3).
- NPC card (Эдрик Штальвейн) → linked quest chip "Контракт №2" → now
  opens the full real quest card instead of the old placeholder —
  confirms the cross-card upgrade described as a requirement.
- Tavern «Северный Очаг» → object window → "Обзор" tab still renders
  the full `CompanionTavernCard` unchanged (no regression from the
  Quest/Enemy additions, since they're a separate dispatch branch).
- Player View: switching out of DM Edit/DM View hides the Library
  trigger, all markers, and the right panel entirely — the entire
  embedded-companion subsystem (including the new Quest/Enemy cards
  and their DM-only fields) is unreachable, gated by the same
  `isDmMode` check at the single `EmbeddedCompanionWindow` mount point
  used since Phase 2G. Not independently re-verified on `/observer`
  this pass (already covered by the existing `isDmMode` gate, which
  this pass did not touch).

### 33.5 Gates

`lint:hooks` PASS, `typecheck` PASS, `build` PASS, full `lint` baseline
unchanged (7 errors / 3 warnings, all pre-existing and unrelated).

### 33.6 Explicitly NOT done this pass

- Image full card — still the "not built yet" placeholder (out of
  scope; named as the next recommended phase).
- BattleEntry card/open action — still doesn't exist.
- Unification of `.object-window-overlay` and `.companion-window-overlay`
  into one system — still two parallel, coexisting mechanisms.
- Player View safe marker projection / viewport rework — untouched,
  per the task's own "do not start" list.
- Independent end-to-end verification of the startup script's
  "Vite already running" branch on a real (non-sandboxed) Mac — see
  33.1's disclosed limitation. **Superseded by §34** — this branch was
  fixed and verified live in Phase 2I.

## 34. Stage 6C.5 Phase 2I — Priority Fix: Robust Dev Launcher (port fallback)

### 34.1 The bug that Phase 2H's fix didn't catch

Phase 2H's launcher used `lsof -ti tcp:"$PORT"`, which matches **any**
process with a socket touching that port — including a process that
merely has an *outgoing* connection to it (e.g. a browser tab that
loaded the page), not just the actual listening server. In this
sandbox, `lsof -ti tcp:5175` consistently returned the PID of an
unrelated `Claude Helper` proxy process that was never actually
listening on 5175 — so every run of the old script took the "occupied
by unknown process" branch and refused to start on 5175 at all, even
though the real listener slot was free. This is the root cause of the
`Error: Port 5175 is already in use` the user kept hitting.

**Fix**: every `lsof` port check now uses `-sTCP:LISTEN`, which only
matches the actual listening socket. Confirmed the bug and the fix
directly: `lsof -ti tcp:5176` (no filter) returned both a Vite process
and an unrelated Google Chrome Helper process that had a connection
open to that port; `lsof -ti tcp:5176 -sTCP:LISTEN` returned only the
real Vite listener.

### 34.2 Rewritten launcher algorithm

`start-campaign-vtt.command` now:
1. Resolves its own directory via `cd "$(dirname "$0")" && pwd` (handles
   spaces/Cyrillic correctly — quoted throughout).
2. Checks `PREFERRED_PORT=5175` via `lsof -ti tcp:5175 -sTCP:LISTEN`.
3. If free → starts Vite there directly (`npx vite --host 0.0.0.0
   --port "$PORT" --open`), prints `Campaign VTT URL: http://localhost:<PORT>`.
4. If occupied, runs `is_own_vite_server "$PID"` — true only if the
   process command line contains both "vite" (case-insensitive) **and**
   this project's directory name (`campaign-timeline-vtt`), or (fallback,
   for invocations like `npm run dev` where the project path doesn't
   appear in the command line) the process's actual cwd via `lsof -a -p
   "$PID" -d cwd -Fn` matches this script's directory exactly. This
   never assumes "any Vite process is ours" — a different Vite-based app
   running on the machine would correctly be treated as "someone else's."
5. If it is our own server → opens the browser to the existing URL,
   prints `Campaign VTT is already running on port 5175. Opening
   existing app.`, exits 0. No second server started.
6. If it is anything else → never kills it. Prints
   `Port 5175 is busy (PID <pid>: <command>), looking for a free
   port...`, scans `5176..5190` (same `-sTCP:LISTEN` check) for the
   first free port, starts Vite there, prints `Port 5175 is busy,
   starting Campaign VTT on <port> instead.` then `Campaign VTT URL:
   http://localhost:<port>`.
7. If every port `5175..5190` is occupied → prints the process holding
   5175, a safe manual `kill <pid>` suggestion, and exits 1. Never
   kills anything itself.

Added `dev:host` to `package.json` (`vite --host 0.0.0.0`, no fixed
port) as the flexible script referenced in the task — the launcher
itself calls `npx vite` directly with an explicit `--port` rather than
going through an npm script, since that's one fewer layer of argument
forwarding to get wrong. Existing `dev`/`dev:open`/`preview` scripts
(hardcoded to 5175) are untouched — nothing else in the project depends
on the launcher's internal port selection. Battle Map's routing
(`http://localhost:4174/#/maps?...`) is in a separate project and was
not touched.

### 34.3 Smoke tests — all four required cases, verified live

Because this sandbox's own Vite preview server is fronted by a non-Vite
proxy process that nonetheless showed up in unfiltered `lsof` output
(see 34.1), the old script's tests in Phase 2H were artificially
confined to the "unrelated process" branch. With the `-sTCP:LISTEN`
fix, **all four cases were exercised for real** in this pass, using
direct `bash` invocations of the actual `.command` file (the preview
MCP server was stopped first to free the real port, then restarted
afterward):

- **Case A (port free)**: stopped the preview server, confirmed 5175
  had no real listener, ran the script — it started real Vite on 5175
  directly (`Campaign VTT URL: http://localhost:5175`), `curl` to
  `http://localhost:5175/` returned `200`.
- **Case B (already running, ours)**: with that same real Vite process
  still up on 5175, ran the script again — printed exactly `Campaign
  VTT is already running on port 5175. Opening existing app.` and
  exited without starting a second server.
- **Case C (occupied by unrelated process)**: killed the test Vite,
  started a plain `python3 -m http.server 5175` (a genuinely unrelated
  process), ran the script — printed `Port 5175 is busy (PID <pid>:
  .../python3 -m http.server 5175), looking for a free port...` then
  `Port 5175 is busy, starting Campaign VTT on 5176 instead.`, started
  real Vite on 5176, and the dummy server on 5175 was confirmed still
  alive and untouched afterward (`curl` to 5175 still returned the
  dummy server's page).
- **Case D (Cyrillic/spaces path)**: every run above executed directly
  from `/Users/dmitry/Downloads/днд сюжет/campaign-timeline-vtt/
  start-campaign-vtt.command` with no quoting failures — this path is
  the project's actual location, so every test already covers this
  case implicitly.

All test processes were cleaned up (`kill`/`pkill`) and the real
preview server was restarted afterward via the preview MCP tool.

### 34.4 Gates

`lint:hooks` PASS, `typecheck` PASS, `build` PASS, full `lint` baseline
unchanged (7 errors / 3 warnings, all pre-existing and unrelated to
this change — the only non-shell-script file touched was `package.json`
to add `dev:host`).

### 34.5 Remaining limitations

- The detection of "is this our own dev server" relies on the process
  command line or cwd looking like this project; a Vite dev server for
  this exact project started from a *symlinked* or *copied* directory
  with a different folder name would not be recognized as "ours" and
  would correctly (if conservatively) be treated as unrelated, taking
  the fallback-port path instead of reusing it. This is a safe failure
  mode (extra server instead of wrong detection), not a crash.
- Has not been run on the user's actual Mac outside this sandbox; all
  verification above used real, non-sandboxed Vite/Python processes
  inside this environment, which is the closest equivalent available
  here.

## 35. DM Companion real-component port — `src/features/embedded-dm-companion/`

Replaces the inline, simplified `Companion*Card` components that previously
lived directly in `MapWorkspacePage.tsx` (Stage 6C.5 Phases 2D/2F/2G/2H) with
real ported presentational components in a dedicated feature directory, plus
two genuinely new pieces (Image detail view, BattleEntry passthrough wrapper)
that the earlier stages had explicitly deferred.

### 35.1 Final API names (decision, not an oversight)

Kept `openCompanion`, `EmbeddedCompanionEntity`, `EmbeddedCompanionWindow` —
did NOT rename to `openDmCompanionEntity`/`EmbeddedDmCompanionHost` even
though the task allowed it. Reasoning: ~13 call sites across
`MapWorkspacePage.tsx` already used these exact names; renaming would touch
every one of them for purely cosmetic benefit, and the existing names already
read clearly ("open the companion window for this entity"). The type now
lives in `src/features/embedded-dm-companion/EmbeddedCompanionWindow.tsx`
and is imported into `MapWorkspacePage.tsx`; the `companionStack`/
`openCompanion`/`companionBack`/`closeCompanion` state and back-stack/
Escape-to-close/DM-gating logic in `MapWorkspacePage.tsx` itself is
unchanged.

### 35.2 New feature directory contents

`src/features/embedded-dm-companion/`:
- `EmbeddedCompanionWindow.tsx` — the host; routes `{type, id}` to the right
  ported card, resolves cross-entity data (location/npc/shop names for
  link rows) from the already-loaded `CampaignData`.
- `CompanionLinkRow.tsx` — shared clickable-chip row (moved unchanged from
  `MapWorkspacePage.tsx`).
- `CompanionLocationCard.tsx`, `CompanionTavernCard.tsx`,
  `CompanionShopCard.tsx`, `CompanionNpcCard.tsx`, `CompanionQuestCard.tsx`,
  `CompanionEnemyCard.tsx` — ported field order/content, confirmed against
  dm-companion's real `pages/{locations,taverns,shops,npcs,quests,enemies}/
  *DetailPage.tsx` (see each file's module doc for the exact field list).
- `CompanionImageCard.tsx` — NEW, not ported (dm-companion has no Image
  detail page, only the lightbox launched from galleries).
- `CompanionBattleEntryCard.tsx` — NEW thin wrapper around the existing,
  already-DM-gated `BattleEntryPanel` (map-native, not from dm-companion).
- `PurchaseCart.tsx`, `PurchaseCart.css`, `currency.ts` — ported from
  dm-companion's `components/PurchaseCart.tsx`/`.css` +
  `utils/currency.ts`, with the local/non-persistent simplification (see
  35.3) and `parseAnyPrice` added to bridge this app's looser
  `string | number | undefined` price fields.
- `ImageLightbox.tsx`, `ImageLightbox.css` — ported from dm-companion's
  `components/ImageLightbox.tsx`/`.css`, with Capacitor-specific
  Android-back-button and native-file-share code replaced by plain-web
  equivalents (Escape key listener; Web Share API or download fallback).

### 35.3 Cart simplification (documented, deliberate)

`PurchaseCart` quantities are pure local `useState` inside the component —
never written to the campaign store, overlay, or `localStorage`. Closing the
embedded companion window unmounts the cart, so it silently resets. This
matches the task's explicit instruction ("LOCAL non-persistent session
state... no persistence layer") and reflects that shop/tavern purchases are
a DM bookkeeping aid during a live session, not a tracked economy ledger —
campaign-timeline-vtt has no economy/inventory data model to persist into
even if this were wired up.

Wired into both `CompanionTavernCard` (menu items + room bookings, two
separate carts) and `CompanionShopCard` (one cart per goods category).
Items whose price field isn't numerically parseable (`parseAnyPrice`
returns `null` — e.g. descriptive prices like "по запросу") still render as
plain text rows beneath the cart, matching dm-companion's own
`parsePriceString` returning `null` for the same cases.

### 35.4 Image — new, not ported

dm-companion has no `ImageDetailPage.tsx`; images are only ever viewed via
the `ImageLightbox` overlay launched from gallery grids on other entities'
pages. `CompanionImageCard.tsx` is therefore a genuinely new component (the
task spec anticipated this) — it shows the image's own metadata (title,
type, DM-only/safeForPlayers flag, linked location/NPC/enemy/quests, all
resolved via `data.images[].relatedEntity`/`linkedQuestIds`) plus a button
that opens the full `ImageLightbox`.

### 35.5 BattleEntry — map-native passthrough, not ported

`BattleEntry` has no dm-companion equivalent at all (dm-companion has no
concept of a battle map launch tied to a location). `{type:'battleEntry',
id}` resolves the entry from `store.battleEntriesById` and renders the
existing, already-DM-gated `src/pages/map-workspace/BattleEntryPanel.tsx`
via a thin wrapper (`CompanionBattleEntryCard.tsx`). Documented limitation:
the wrapper's `onEdit`/`onOpenConsequences`/`onCreateEvent` handlers show an
explanatory `window.alert` instead of opening MapWorkspacePage's own
drawers/state, since those require state that isn't threaded into the
embedded host's calling convention. The DM should open battle entries from
the main battle-entry marker layer on the map for those actions; opening
via `openCompanion({type:'battleEntry', id})` (e.g. from a future Library
entry) gives a read-only view of the entry's panel content.

### 35.6 DM gating preserved

`EmbeddedCompanionWindow` is only ever mounted when `isDmMode` is true
(`{isDmMode && companionOpen && data && <EmbeddedCompanionWindow ... />}` in
`MapWorkspacePage.tsx`, unchanged). Every ported card's DM-only block
(location `dmSecrets`/`notes`, NPC `secrets`/`dmNotes`, enemy
`tactics`/`dmNotes`, shop/tavern `notes`) renders unconditionally inside
these cards — same convention as before the port — because there is no
code path that reaches these components while `isDmMode` is false.

### 35.7 Gates after this port

`lint:hooks` PASS, `typecheck` PASS, `build` PASS. Full `lint`: 7 errors / 3
warnings — identical count to the pre-change baseline at checkpoint
`5a5b5fa` (verified via `git worktree add /tmp/dmcomp-baseline 5a5b5fa` +
`npm run lint`), i.e. zero new lint issues introduced by this port.

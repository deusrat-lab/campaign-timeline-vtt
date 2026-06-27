# Campaign Map Workspace — Usability Baseline Acceptance

## Status: NOT ACCEPTED

As of Stage 6C.5 Phase 1, Phase 2A (Object UX Simplification), Phase 2B
(Central Library Workspace + Location Scope Filtering), Phase 2D
(DM Companion rich Location card), Phase 2D-Fix (visual parity bug
fixes), Phase 2E-Reset partial (Library category tabs +
NPC/Enemy image resolver fallback), Phase 2F partial (real
Tavern/Shop DM-Companion-parity cards), Phase 2G (embedded
companion navigation + Library "Открыть карточку" + full NPC card),
Phase 2H (startup script port-conflict fix + full Quest/Enemy
companion cards), and Phase 2I (priority fix: the launcher's port
detection had a real bug — `lsof` without `-sTCP:LISTEN` matched
client sockets, not just listeners, causing false "port busy"
positives — now fixed and verified with real, non-sandboxed Vite
processes), the usability baseline is **not yet accepted**.

**Important correction from the Phase 2E-Reset request**: the
requesting task asked for Campaign Map to embed the *full* DM
Companion reading experience (a `CompanionXCard` per entity type,
reusing DM Companion's actual visual layout, plus full linked-entity
navigation between those cards) for all 8 entity types in one pass.
That is real, multi-day scope — this pass implemented the two most
concretely actionable, independently-verifiable pieces (Library
category tabs; NPC/Enemy image-resolver fallback gaps) rather than
attempting a shallow pass at everything. Only Location has a true
DM-Companion-style rich card today (`CompanionLocationCard`, from
Phase 2D). See §30 of the authoring spec for the full inspection
findings (DM Companion's actual component/file structure, section
order, and image-resolution chain per type) that a future pass should
build from.

**Important correction confirmed during Phase 2D**: Campaign Map's
content was never actually disconnected from DM Companion — the app
already loads byte-identical DM Companion JSON data (locations, NPCs,
quests, enemies, images, taverns, shops, factions, economy) at runtime
from `public/data/dm-companion/`. The real gap was that the richer
DM Companion fields (atmosphere, lore, rumors, quick scenes) were
typed and loaded but never rendered anywhere. Phase 2D added a rich
read-only `CompanionLocationCard` for Location only; the same fix is
still needed for NPC, Quest, Enemy, Tavern, Shop, and Image.

## What has been verified as working

- Library opens as a true centered workspace modal (`min(1100px, 94vw)`,
  internal scroll, header shows current arc + map name) instead of
  being embedded in the right panel or a narrow side drawer.
- **`Королевство Аурелон`, `Калдран`, and `Грейхольм` no longer appear
  as ordinary placement candidates in the city map's Локации list.**
  They're excluded from the default list (verified live: count dropped
  from 34 to 31) and shown only in a separate, collapsed "Уровень выше"
  block with a distinct badge, an explanation, and only an `Открыть
  карточку` action — no placement button exists for them at all.
- The right panel for a selected location is a compact, readable
  overview (header, ≤4 primary buttons, summary, linked-content counts,
  collapsed secondary/danger actions) instead of a row of 8 small tabs.
- A large object window (Обзор/Редактирование/Связи/Карта/Опасная зона)
  exists for Location, reusing the same proven components that used to
  live inline in the aside. Hierarchy locations open the same window in
  read-only-ish "Обзор" mode via `Открыть карточку`.
- Safe destructive actions (`Убрать маркер с карты`,
  `Сбросить локальные правки`) exist with confirmation dialogs that
  explain exactly what is and isn't deleted; nothing hard-deletes
  source/imported data.
- Arm-then-click placement from the Library auto-closes the modal so
  the next map click lands correctly; Stage 6C.4G's drop-on-location
  link menu, duplicate prevention, and free-map placement all still
  work after both restructurings (regression re-tested live each time).
- `/observer` and DM View/Player View show none of the new DM-only UI.
- No horizontal overflow on the right panel.
- Gates pass: `lint:hooks`, `typecheck`, `build` all PASS; full `lint`
  baseline unchanged (7 errors / 3 warnings).
- **Phase 2D-Fix**: Location preview images resolve correctly (fixed a
  composite-vs-raw id bug); the image lightbox now renders above the
  object window (z-index fix); read/open/navigation actions (select an
  object, open its card, browse linked content) now work in DM View as
  well as DM Edit — only write/edit/placement actions stay
  DM-Edit-gated, with disabled+tooltip nav buttons rather than hidden
  ones; the "Уже размещено" tavern/shop badge now correctly reflects
  placement on the *current* map only, not anywhere in the arc.
- **Phase 2E-Reset (partial)**: the Library is now category-tabbed
  (Локации/NPC/Таверны/Лавки/Квесты/Враги/Боевые сцены/Изображения as
  separate tabs with live counts) instead of one long mixed list —
  selecting NPC no longer requires scrolling past every location.
  NPC and Enemy cards now fall back to a relation-based image lookup
  when no direct `image` field is set, matching DM Companion's own
  resolver chain (mirrors the location/shop/tavern/quest fallback
  fixed earlier).
- **Phase 2F (partial)**: a placed Tavern or Shop now opens a real
  DM-Companion-style card (`CompanionTavernCard`/`CompanionShopCard`,
  ported field-for-field from DM Companion's actual
  `TavernDetailPage.tsx`/`ShopDetailPage.tsx`) instead of falling
  through to the generic technical panel. Verified live: `Таверна
  «Северный Очаг»` shows real image, menu, rooms, services, rumors,
  staff, linked NPC/quests; a placed shop (`Травяная лавка Лины
  Уотерс`, same code path as the named target `Лавка дорожных товаров
  «Мирра и Олден»`) shows real image, relation-to-players, discounts,
  rumors, and goods correctly grouped by category with prices.
- **Phase 2G**: a shared embedded-companion navigation system now
  exists (`companionStack`, a real back stack, separate from the
  selected-hotspot object window). Linked NPC/quest/shop rows inside
  every companion card are now clickable chips that actually open that
  entity's card, with "← Назад" returning to the previous one — verified
  live (Гильдия → Мара Линн → linked quest → Назад → Мара Линн again).
  Every Library row (Location/NPC/Tavern/Shop/Quest/Enemy/Image) now
  has "Открыть карточку", working without placing the entity first.
  Library now opens in DM View too (previously DM-Edit-only) and is
  correctly read-only there — "Открыть карточку" enabled, every
  write-capable button (place/move/link/edit/drag) disabled with a
  "Размещение доступно в DM Edit" tooltip, verified live. NPC now has a
  full DM-Companion-style card (`CompanionNpcCard`, ported from the
  real `NpcDetailPage.tsx`) — verified live against "Эдрик Штальвейн":
  portrait, race, role, location, personality, goals, knowledge,
  secrets (DM-only), linked quests, notes.
- **Phase 2H**: `start-campaign-vtt.command` no longer crashes if port
  5175 is already in use — it now detects whether the holder is
  Campaign VTT's own Vite server (opens the existing app) or something
  else (prints the PID/command and refuses to kill it automatically).
  Quest and Enemy now have real DM-Companion-style cards
  (`CompanionQuestCard`/`CompanionEnemyCard`, ported from the actual
  `QuestDetailPage.tsx`/`EnemyDetailPage.tsx`) reachable from Library,
  linked chips inside other cards, placed Quest/Enemy markers, and the
  right panel — verified live: `Контракт №1: Набеги у дороги к Dense
  Forest` shows full fields including linked enemy chips; clicking
  "Bandit" opens a full statblock (AC/HP/Speed/ability scores/attacks/
  languages/role/faction/linked location+quest/DM-only tactics+notes);
  an NPC's linked quest chip now opens this same full card instead of
  the old placeholder; Tavern/Shop cards remain unaffected; Player View
  still hides the entire embedded-companion subsystem including the
  new DM-only enemy fields.
- **Phase 2I**: fixed a real bug in Phase 2H's port check — `lsof -ti
  tcp:<port>` without `-sTCP:LISTEN` matches any process with a socket
  touching the port (including a browser tab's outgoing connection),
  not just the actual listener, which is exactly what kept producing
  false "port busy" failures for the user. With the fix, all four
  required cases were verified live with real processes in this
  sandbox: port free → starts on 5175 directly; already running (ours)
  → opens existing app, no second server; occupied by an unrelated
  process (tested with a real `python3 -m http.server 5175`) → falls
  back to 5176 without touching the unrelated process; runs correctly
  from the actual Cyrillic/spaces project path throughout.

## Why the baseline is not accepted yet

The following blockers from the manual UX review remain open:

1. **Library still groups content only by entity type**, not by the
   spec's richer scope-based grouping (`На текущей карте`/`Можно
   разместить здесь`/`Связано с выбранной локацией`/`Другая карта`/
   `Уровень ниже`/`Архив`). Only the Locations section has scope
   awareness; NPC/Quest/Enemy/Tavern/Shop/BattleEntry/Image sections do
   not distinguish current-map vs. other-map content at all.
2. **No explicit cross-map transfer/copy/local-reference workflow**
   exists. Hierarchy locations are view-only — there is currently no
   way to bring a kingdom/region object onto the current map even if a
   DM legitimately wanted to (e.g. via an explicit transfer dialog).
   This was a deliberate simplification, not an oversight: the spec's
   confirmation-dialog workflow was not built.
3. **Drag-and-drop from the Library no longer works while the Library
   modal is open** (only arm-then-click does) — an accepted, documented
   trade-off of the full-screen-backdrop modal, but a real capability
   reduction from the Phase 1/2A side-drawer behavior.
4. **The object window covers Location/Tavern/Shop; NPC/Quest/Enemy
   have real cards reachable via the embedded companion window.**
   Image and BattleEntry still have no real card — Image shows an
   explicit "not built yet" placeholder when opened (via Library or a
   linked chip); BattleEntry has neither a card nor a Library "Открыть
   карточку" at all. Linked-entity navigation now works for NPC/quest/
   shop/enemy/location chips inside Location/Tavern/Shop/NPC/Quest/
   Enemy cards (Phase 2G + 2H); Image links still render as plain text
   since Image has no card to navigate to yet.
5. **No archive or local-object delete.** Only marker removal and patch
   reset are implemented; `LocationState` has no `archived` field.
6. **Local image upload, custom object creation, and Player View safe
   marker projection** remain entirely unimplemented (explicitly out of
   scope for every pass so far, per each task's own instructions).
7. **Map viewport centering/zoom stability** was not addressed.
8. **No dedicated mode-guard hardening audit** was performed across all
   entry points. Pre-existing guards from §24/§25 were not regressed.
   Phase 2D-Fix split the right-panel/object-window guard correctly
   (read actions in any DM mode, write actions DM-Edit-only); Phase 2G
   did the same for the Library (now opens in DM View, with every
   write-capable button individually gated) and the new embedded
   companion window (gated by `isDmMode` at its single mount point).
   No audit has been run on the picker/drag-drop/link-menu entry points
   from Stage 6C.4 to confirm they follow the same split.

## What would need to happen before acceptance

- Extend scope-based grouping/badges to the other 7 Library sections,
  or explicitly decide it's only needed for Locations.
- Decide whether explicit cross-map transfer is actually needed, or
  whether "view only, no transfer" is the permanent intended behavior
  for hierarchy-level locations.
- ~~Build the large object window for the remaining object types
  (Image, BattleEntry).~~ DONE — see "DM Companion real-component
  port" entry below.
- Implement local image upload and custom object creation, or
  explicitly re-scope the baseline definition to exclude them.
- Implement Player View safe marker projection.
- Address map viewport stability if it is blocking real DM use.
- Run a dedicated mode-guard hardening pass across every entry point
  added across Stage 6C.4–6C.5.

## Recommended next phase

Location, NPC, Tavern, Shop, Quest, and Enemy all now have real
DM-Companion-parity cards with working linked-entity navigation. The
next most valuable step is the Image/Handout full card (closing the
last placeholder reachable from existing linked rows), followed by a
BattleEntry card/open action, then deciding whether to unify
`.object-window-overlay` and `.companion-window-overlay` into one
system before moving on to Player View safe marker projection and the
map viewport/zoom rework.

## DM Companion real-component port (post Phase 2I)

All seven embedded companion entity types (Location, Tavern, Shop, NPC,
Quest, Enemy, Image) plus BattleEntry now open through
`openCompanion`/`EmbeddedCompanionWindow`, backed by real ported
presentational components in `src/features/embedded-dm-companion/` (full
details: `CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` §35).
Image and BattleEntry — the two placeholders this document previously
listed as outstanding — are now real: Image via a new
lightbox-based detail card (no dm-companion source page existed to port),
BattleEntry via a thin wrapper around the existing native
`BattleEntryPanel`. Shop/Tavern also gained a real, working
add/remove/quantity purchase cart (local, non-persistent session state —
resets when the embedded window closes).

Still NOT ACCEPTED overall — this closes one specific outstanding item from
the list above, not the whole baseline. Remaining gaps (Player View safe
marker projection, mode-guard hardening pass, local image upload/custom
object creation, cross-map transfer, viewport stability) are unchanged by
this work.

## Bug-fix pass (post-2I, manual browser review)

A live manual review in the browser found concrete regressions/bugs that
the prior passes' own gates didn't catch (none of them are TS/lint errors —
they're UX/content-duplication bugs). This pass fixed all of them:

1. **Old duplicated content alongside the new embedded card** — opening a
   Location/Tavern/Shop via `objectWindowOpen` (the large object window with
   the Обзор/Редактирование/Связи/Карта/Опасная зона tab strip) used to
   render the real `Companion*Card` AND then immediately render
   `<LocationSidePanel>` again right below it in the same "Обзор" section —
   the exact same NPC/quest/enemy/image/route/shop content twice in one
   scroll. Fixed: `LocationSidePanel` is no longer rendered inside the
   object window at all; the `Companion*Card` is the sole content. The
   standalone (non-edit-mode) aside also used to render
   `<LocationSidePanel>` directly for DM View, not just Player View — DM
   View now shows an "Открыть карточку" button into the same embedded card
   instead; only Player View (the one path that's genuinely
   player-safe-gated) still uses `LocationSidePanel`.
2. **"Путешествие" (Travel) block removed from entity cards** — `Откуда`/
   `Куда`/`Зачем`, "прямого маршрута нет — нажмите «Найти путь»", and the
   full route-network pathfinding-options UI used to render unconditionally
   inside `LocationSidePanel` whenever a non-party location was selected
   (`isJourneyTarget`), i.e. mixed into the same scroll as the entity
   content. The whole block (`MapWorkspacePage.tsx`, the section right
   after the location header, formerly ~175 lines) is now deleted from
   every card. The underlying feature is NOT deleted: multi-hop
   route-network pathfinding (`onFindAndCommitPath`/`pathfindingResult`/
   `commitMultiSegmentJourney`) now surfaces in the dedicated "Маршруты"
   tool tab as a collapsed-by-default `<details>` ("Результат поиска
   пути"), and the generic "Переместить партию сюда"/"Поставить партию
   здесь" button in `LocationSidePanel` (Player View) still avoids
   teleporting through closed routes.
3. **Image cropping fixed** — `.companion-source-hero` and
   `.side-panel-header-image` used `object-fit: cover` with an aggressive
   `max-height` (160–220px), cropping a narrow strip out of tall source
   images. Now `object-fit: contain`, centered, `max-height: 60vh`,
   matching dm-companion's real `EntityHeroImage`/`RelatedImages.css`
   sizing approach. Every `Companion*Card`'s hero image is now also
   click-to-lightbox (`ImageLightbox`) — previously only `CompanionImageCard`
   had this wired; Location/Tavern/Shop/NPC/Enemy/Quest hero images were
   plain unclickable `<img>` tags.
4. **Technical tabs no longer the primary UI** — the object window's
   "Обзор" tab (competing on equal footing with Редактирование/Связи/Карта/
   Опасная зона) is gone; the `Companion*Card` content now always renders
   first, unconditionally, with no tab gating. The 4 remaining map/edit-only
   sections are inside a collapsed-by-default `<details>` titled "Действия
   на карте" below the card. `EmbeddedCompanionWindow.tsx` (the
   `openCompanion()` path) gained its own matching "Действия на карте"
   section — real placement/visibility data looked up from
   `data.placements`, not a fake/empty panel.
5. **Old NPC popup eliminated from every DM-facing path** — `EntityDrawer`
   (an old, much smaller component rendering NPC `race`/`role`/`goals` as
   plain inline JSX, no portrait, no link-row navigation, no edit) used to
   be the actual destination for: map marker clicks on NPC/quest/enemy/image
   placements (`openLinkedEntity`), global search results for NPC/quest/
   enemy, the session panel's active-quest list, and "Unplaced content"'s
   NPC/quest "Открыть" buttons. All of these now call `openCompanion()`
   instead. `EntityDrawer`'s npc/quest/enemy/image branches are kept
   (not deleted) only because `LocationSidePanel` — now rendered exclusively
   in Player View — still needs a working, player-safe popup; `placement`/
   `battleMap`/`economy`/`law` (no `Companion*Card` equivalent) keep using
   it in every mode. See the code-change report for the exact NPC
   previously affected by this bug (every NPC reachable via a map marker,
   search, or the session panel — not one specific NPC).
6. **Route/travel panel de-intensified** — there was no separate
   purple-styled "RoutePanel" component; the closest match was the
   "Путешествие" journey panel itself (already gold-themed, not purple),
   removed per item 2 above. The multi-hop pathfinding-result UI that used
   to live inside it now renders compact and collapsed (`<details>`) in the
   "Маршруты" tool tab, themed with the existing dark/gold palette
   (`.route-pathfinding-result`), not full-width/always-expanded.
7. **Bottom "Редактировать" action bar** added to `EmbeddedCompanionWindow`,
   matching dm-companion's real `ShopDetailPage.tsx`/`NpcDetailPage.tsx`
   btn-row. Wired to the existing `open*Editor` overlays for npc/tavern/
   shop/image/battleEntry (the types with a real override-patch mechanism);
   location/quest/enemy show "Редактирование исходной карточки будет
   добавлено отдельным этапом" instead of a non-functional button — no
   archive/delete buttons were added (no archive/delete flow exists for
   library source records, only for placed map markers, already covered by
   "Действия на карте").
8. **Player/Observer safety re-confirmed, no gaps found.** `isDmMode =
   !isPlayerView` already gates `EmbeddedCompanionWindow`, the Library
   drawer, the object-overview "Открыть карточку"/"Редактировать" buttons,
   and the object window — verified by grep, not just assumption. No new
   gap was introduced or found in this pass.

### Audit against real dm-companion source (data-level cross-check)

Comparing each `Companion*Card` against the actual dm-companion
`*DetailPage.tsx` field order found two real content gaps (not just the
bugs above), fixed in this pass:

- `CompanionLocationCard` never rendered a hero/gallery image at all (real
  `LocationDetailPage.tsx` always shows one via `imagesForEntity`), and
  never rendered "Магазины здесь" (shops at this location) or "Связанные
  враги" (enemies linked to this location) — both real sections in
  `LocationDetailPage.tsx`, both reverse lookups (`shop.location ===
  loc.id`, `enemy.locationIds.includes(loc.id)`), not stored on
  `DmLocation` directly. All three added.
- `CompanionTavernCard`/`CompanionShopCard` had a doc comment claiming a
  "Локация" section but never actually rendered `tavern.location`/
  `shop.location` — added, with click-through navigation when an
  `onOpenLocation` callback is supplied.

`CompanionNpcCard`, `CompanionQuestCard`, `CompanionEnemyCard` were checked
field-by-field against `NpcDetailPage.tsx`/`QuestDetailPage.tsx`/
`EnemyDetailPage.tsx` and already matched (faction badges intentionally
skipped, as already documented). One remaining gap found and NOT fixed in
this pass: `QuestDetailPage.tsx`'s confirmed/possible `BattleMapsSection`
(battle-map confidence linking for a quest) has no equivalent in
`CompanionQuestCard` — this is a deeper feature (the same confidence-link
machinery already used for Location's "Боевые карты" section) and is
flagged as a documented limitation, not silently skipped.

## Hotfix pass — duplicated player-facing text + local image upload

**What was broken:** several Greyholm Region `DmLocation` seed entries
(added in the prior data-population pass, e.g. `loc-cardlarein-road`, and
3 enriched pre-existing ones: `loc-lashdale`/`loc-dunwood`/`loc-lake-rundel`)
had `playerView` set equal to `description` verbatim — a copy-paste default
in the seed-generation script, not an authored player-facing text.
`CompanionLocationCard` renders `{loc.playerView && <p>{loc.playerView}</p>}`
faithfully (no renderer-level fallback bug was found anywhere — checked
every `Companion*Card` for `||`/`??` description fallbacks; none exist
outside Location), so the seed data alone produced the visible "Что видят
игроки" duplicate. There was also no editor at all for the raw source
Location card (`patchLocationState` exists for the per-timeline map
projection, but no override slot existed for `DmLocation` itself), so the
DM had no way to fix it from the UI.

**Fixed:**
- Removed the erroneous duplicate `playerView` from all 23 affected seed
  locations (`public/data/dm-companion/locations.json`) — `playerView` is
  now `undefined` on all of them, matching "no separate player-facing text
  was ever authored."
- Added a real Location source-card editor: `locationPatches` overlay slot
  (`overlay.ts`, `campaignStore.tsx` — `patchLocation`/`resetOverride`
  kind `'location'`), merged into `data.locations` in
  `campaignDataContext.tsx`, with a full edit form (name/type/description/
  "Что видят игроки"/DM notes/hero image) reachable from both the Library
  Locations row and the embedded companion window's bottom edit bar.
  Clearing "Что видят игроки" and saving now persists `playerView:
  undefined` — verified live: cleared → saved → hard reload → block stays
  hidden, description and DM notes unaffected.
- Added local image upload ("Загрузить изображение с компьютера") inside
  the shared `ImagePickerModal`, used by every editor that already routes
  through it (NPC, Tavern, Shop, BattleEntry, Location source, and the
  LocationState header-image picker). Files are read as a `data:` URL via
  `FileReader`, validated (png/jpeg/webp/gif only, ≤10 MB, clear Russian
  error message otherwise — svg deliberately excluded, no safe-SVG
  rendering path exists), stored as a new `DmImageItem` via a new
  `overlay.newImages`/`store.addImage()` (same "no seed data" pattern as
  `newNpcs`), and immediately assigned to the editing card. New uploads
  default `safeForPlayers: false` (DM-only) — never auto-published to
  players/Observer. Verified live end-to-end on `loc-cardlarein-road`:
  upload → save → hard reload → image persists as the card's hero image →
  opens correctly in `ImageLightbox`, and confirmed absent from Player View
  (no Library button, no uploaded image bytes anywhere in the DOM).

**Not done in this pass (scope discipline, not an oversight):**
- Quest/Enemy still have no editor of any kind (image or otherwise) — the
  existing `editUnsupportedNote` ("будет добавлено отдельным этапом")
  still applies to them; adding image-only editing without the rest of a
  real editor would be a half-feature, not a fix.
- Image/Handout cards still only let the DM rename the title
  (`imageEditDraft`), not replace their own asset — flagged as optional in
  the request, deferred.
- The full Section 1–13 parity/cleanup audit (route/travel pollution,
  right-panel layout, old-popup-path removal, Player/Observer deep sweep)
  from the same request was **not** re-run in this pass; this hotfix was
  scoped strictly to the reported duplicate-text bug + image upload. That
  broader audit remains the next step.

**Gates:** `lint:hooks` clean, `typecheck` clean, `build` succeeds. Full
`npm run lint` baseline unchanged (10 pre-existing problems, none in files
touched by this hotfix).

## Parity audit + cleanup pass (continuation)

Scoped continuation of the Section 1–13 audit deferred above. Re-verified
the prior hotfix is intact (`locationPatches`, real Location editor,
separated `playerView`, image upload, no duplicate "Что видят игроки") —
unchanged, not redone.

**Real bug found and fixed — last surviving old-popup paths:**

1. `EntityDrawer`'s `npc`/`quest`/`enemy`/`image` branches (the literal
   "old small popup" referenced in the task) had already been made
   *unreachable* by an earlier pass (`openLinkedEntity` redirects every
   marker click to `openCompanion`), but the dead branches were still
   sitting in the file — risk of silent reintroduction, not an active bug.
   Removed them entirely, shrank `DrawerState` to `battleMap | economy |
   law | placement` (the genuinely map-only kinds with no DM Companion
   equivalent), and replaced the now-impossible `as DrawerState` cast in
   `openLinkedEntity` with a direct `{ kind: 'battleMap', ... }` literal —
   `tsc -b` (full build) confirmed via type errors that this narrowing is
   now enforced, not just convention.
2. **Real, live bug**: `LocationSidePanel` (the linked-entities browser
   shown when a location is selected on the map) still opened its
   NPC/Quest/Enemy/Image cards via `onOpenDrawer({ kind: 'npc' | ... })`
   — i.e. the *actual* old EntityDrawer popup, reachable today, not dead
   code. Every linked NPC/Quest/Enemy/Image card click here bypassed
   `openCompanion` entirely. Added an `onOpenCompanion` prop wired to the
   page's `openCompanion`, and repointed all 4 call sites (including the
   location's own header-image click). Verified live: clicking a linked
   NPC from "Гильдия авантюристов Грейхольма" now opens the full
   `CompanionNpcCard` for Эдрик Штальвейн (with back-stack), not the old
   inline popup.
3. **Real functional regression found while removing #1**: deleting the
   dead `EntityDrawer` quest branch would have also deleted the *only*
   remaining call site of `store.setQuestStatus` — the quest
   active/completed/failed/hidden lifecycle toggle had silently become
   100% unreachable once marker clicks were redirected to `openCompanion`
   (which has no status control of its own). Restored it properly inside
   `EmbeddedCompanionWindow` as a small "Статус квеста" block (same
   placement/visual weight as the existing "Действия на карте" block, DM-
   only, not part of `CompanionQuestCard`'s read-only content). Verified
   live: open a quest → "Статус квеста: Активен" → click "Завершить" →
   re-renders "Статус квеста: Завершён" with the remaining 3 actions →
   reverted back to active.

**Verified, no changes needed:**
- Route/travel pollution: grepped every `Companion*Card` for
  "Путешествие"/"Откуда"/"Куда"/"Найти путь" — none present; that UI only
  lives in the dedicated route/travel panels, as required.
- Right panel: the placement marker-info drawer (`EntityDrawer`'s
  `placement` branch) is already a compact command panel (title, status
  badges, visibility toggle, "Открыть связанную карточку", DM map
  actions) — no full content leaks into it.
- Player View / Observer: `ObserverViewPage.tsx` is a fully separate page
  that never imports `LibraryPanel`/`EmbeddedCompanionWindow`/
  `EntityDrawer`/`ImageLightbox` at all — structurally safe by
  construction, not by a runtime flag. Player View (`isDmMode =
  !isPlayerView`) re-checked live after this pass's edits: no Библиотека
  button, no Редактировать buttons, no upload UI, no DM-only text anywhere
  in the DOM.
- Library scope (Greyholm Region vs city): re-confirmed region map shows
  42 locations/91 NPC, city map shows 26/43, no cross-contamination.
- Location/NPC/Tavern/Shop/Quest/Enemy/Image cards spot-checked live
  (Гильдия авантюристов Грейхольма, Эдрик Штальвейн, Саргон Мельт, Таверна
  «Северный Очаг», Лавка «Мирра и Олден» incl. PurchaseCart +/− quantity
  controls, a quest contract, a Bandit enemy statblock, a location handout
  image) — hero images render `contain` (no banner crop), linked rows
  work, no duplicate description/player-view text found anywhere outside
  the already-fixed Greyholm Region locations.

**Editing honesty — unchanged from before, confirmed still accurate:**
Location/NPC/Tavern/Shop/Image/BattleEntry have real overlay-patch
editors; Quest/Enemy remain genuinely readonly (`editUnsupportedNote`,
no fake save) — now with a real (non-editing) status action for quests
specifically (see #3 above), which is a lifecycle toggle, not content
editing.

**Not done in this pass (explicitly out of scope per the request):** Time
Engine, Travel Engine, Route Editor rewrite, Zones polish, bulk placement,
visual redesign, Battle Map routing changes, Quest/Enemy real editors,
Image-card self-asset replacement.

**Gates:** `lint:hooks` clean, `typecheck` clean, `build` succeeds (the
`DrawerState` narrowing fix was specifically caught by `tsc -b` in
`build`, not by `tsc --noEmit` alone — worth remembering for future
refactors in this file). Full `npm run lint` baseline unchanged at 10
pre-existing problems (7 errors, 3 warnings), none in files touched here.

## Player-safe marker visibility / reveal-hide workflow

Investigated the existing visibility model before adding anything: hotspots
already had a working `visibleInPlayerView` checkbox ("Видна игрокам") and
`MapObjectPlacement` markers already had working hide/show toggles in
`EmbeddedCompanionWindow`'s "Действия на карте" block, both already enforced
correctly by `playerSafeProjection.ts`/`isLocationVisibleToPlayers`. The real
gap was that `PartyState.revealedLocationStateIds`/`visitedLocationStateIds`
were written by existing DM buttons but never read anywhere — a "discovered"
tier that looked wired up but did nothing.

Added `src/data/visibility.ts`, a small normalized helper layer:
`MarkerVisibilityState = 'hidden' | 'visible' | 'discovered'`,
`getLocationVisibilityState`, `getPlacementVisibilityState`, `getVisibilityLabel`,
with the Russian labels "Скрыто от игроков" / "Видно игрокам" / "Открыто
партией". `discovered` is treated as a DM-facing progress badge layered on
top of the existing visible/hidden gate — it does **not** unlock any extra
fields, so none of the existing player-safe filters needed to change and no
new leak surface was introduced.

DM-facing additions, all reusing existing store/overlay plumbing:
- Map markers: hidden hotspots now render at reduced opacity for the DM with
  a 🔒/👁 badge; this is DM-view only (`!isPlayerView`), Player View/Observer
  rendering is untouched.
- Location side panel + object-overview header: status badge now uses
  `getLocationVisibilityState`/`getVisibilityLabel` (3-state, was previously
  a 2-state `visibleToPlayers` check). Added "Отметить открытым" / "Сбросить
  открытие" buttons next to the existing "Отметить посещённой", backed by a
  new `UNSET_REVEALED` reducer action + `store.unsetRevealed()` (the existing
  `MARK_VISITED`/`SET_KNOWN`/`SET_REVEALED` actions were additive-only with no
  removal counterpart).
- `EmbeddedCompanionWindow`'s placement actions block now labels placement
  visibility via the same `getVisibilityLabel`/`getPlacementVisibilityState`
  helpers instead of ad hoc inline strings, for wording parity with the
  location side.

**Explicitly not done** (per scope): no fog of war, no per-player visibility,
no bulk reveal, no area/route-based reveal, no automation, no new tier for
NPC/Quest/Enemy/Image/BattleEntry placements beyond the existing
hidden/visible 2-state (no backing "discovered" field exists for those yet).
Linked-content safety was not changed — revealing a Location still does not
auto-reveal its linked NPC/Quest/Enemy/Image, since those are gated
independently by their own `visibleInPlayerView`/status fields and the
location card never auto-renders unrevealed linked rows.

**Tested live** (DM Edit, Greyholm city map): selected a placed location
hotspot ("Лавка «Серебряный Тигель»"), confirmed the DM badge read "Открыто
партией" after clicking "Отметить открытым" (and the button correctly
flipped to "Сбросить открытие"), confirmed `localStorage` overlay persisted
`revealedLocationStateIds`, reloaded the page and confirmed the badge/button
state survived. Clicked "Скрыть от игроков", switched to Player View — the
marker count dropped (5→4) and the hidden shop hotspot was absent; switched
back to DM Edit and re-revealed it. No console errors at any point. Gates:
`lint:hooks` clean, `typecheck` clean, `build` succeeds, `npm run lint`
baseline unchanged at 10 pre-existing problems (7 errors, 3 warnings), none
in files touched here.

**Remaining TODOs** (future improvements, intentionally out of scope here):
extend the discovered tier to placements (NPC/Quest/Enemy/Image/BattleEntry)
if a real workflow need arises; fog of war; per-player visibility; bulk/area
reveal; route/faction-based reveal automation.

## Player-safe marker visibility — continuation pass (all placed content types)

Audited every placed-content path against the visibility helper added in the
previous pass. Two real gaps found and fixed; everything else was already
correctly gated (confirmed by reading, not assumed).

**Real gaps fixed:**
- **BattleEntry had no DM reveal/hide UI at all.** Unlike NPC/Quest/Enemy/
  Image (all backed by a `MapObjectPlacement` and already covered by
  `EmbeddedCompanionWindow`'s generic "Действия на карте" block), BattleEntry
  has no placement record — it carries its own `status`/`visibleInPlayerView`
  fields directly (already correctly enforced by `getPlayerSafeBattleEntries`
  in the projection layer), but nothing in the DM UI could flip them once
  placed. Added a dedicated visibility block in `EmbeddedCompanionWindow`
  (`battleEntryForVisibility`) using the existing `store.updateBattleEntry`.
- **Linked NPC/Quest/Image rows in a Location's player-safe card
  (`LocationSidePanel`) ignored the linked entity's own placement-marker
  visibility.** A DM could hide an NPC's map marker via "Скрыть от игроков"
  and it would still appear in the linked-NPC list of any visible location
  card, because that list was filtered only by `Npc.visibleToPlayers`
  (entity-level), never by the marker's own hidden state. Same gap existed
  for linked quests (filtered only by quest status) and for the global
  search results' npc/quest branches. Fixed by adding
  `isLinkedEntityPlacementVisible(placements, entityKind, entityId)` to
  `src/data/visibility.ts` — if the entity has a placement, that placement's
  hidden state wins; if it has no placement at all, the entity-level field is
  the only signal (unchanged). Wired into `LocationSidePanel`'s npc/quest/
  image lists and the global search box's npc/quest branches. Enemies were
  already never shown to players in `LocationSidePanel` at all (`!isPlayerView
  && enemies.length > 0`), so no fix was needed there.

**Confirmed already correct (no change needed):**
- Enemy statblocks/AC/HP/CR/actions: never rendered to players — the
  `Companion*Card` components (including `CompanionEnemyCard`) are DM-only by
  design and Player View never opens them; the player-safe path is
  `LocationSidePanel`, which never lists enemies at all.
- Uploaded DM-only images: `getPlayerSafeImages` requires
  `safeForPlayers === true`; now additionally gated by the same
  placement-visibility check above, so a hidden Image marker can't leak its
  preview through a parent location's linked-images row either.
- Observer (`ObserverViewPage.tsx`): never renders `LocationSidePanel`, never
  lists linked NPC/Quest/Image rows, never opens `EmbeddedCompanionWindow` —
  unaffected by (and not exposed to) either gap above.
- Quest status (active/completed/hidden) vs. marker player-visibility remain
  two independent concerns, as required — `EmbeddedCompanionWindow`'s quest
  status block and its placement visibility block are separate UI sections
  using separate store actions (`setQuestStatus` vs. `patchPlacement`).

**Gates:** `lint:hooks` clean, `typecheck` clean, `build` succeeds, `npm run
lint` baseline unchanged at 10 pre-existing problems (7 errors, 3 warnings),
none in files touched here. No console errors observed during interactive
testing.

**Remaining TODO** (acknowledged, intentionally deferred): live
click-through testing of the new BattleEntry visibility toggle and the
linked-NPC/quest fix could not be completed against a live placed BattleEntry
in this pass (the dev session's local overlay had no placed markers at the
time of testing) — the logic was verified by code review and reuses
primitives (`store.updateBattleEntry`, `getPlacementVisibilityState`) already
covered by this and the previous pass's live tests. Re-verify with a seeded
BattleEntry/NPC marker before relying on this in a real session.

## Route / Travel polish — road-network movement baseline

**Preflight visibility smoke (section 0):** the dev session's local overlay
had no seeded placed NPC/BattleEntry markers at the time of this pass (same
caveat as the previous report) — could not run the live click-through.
Logic for both is unchanged since the previous pass's code review and reuses
already-tested primitives, so this is recorded as a pending manual check
rather than re-blocking this task on it.

**Audit finding: most of this task was already implemented.** `src/data/
routeNetwork.ts` ("Etap H") already provides a complete Dijkstra-based
route-network graph (`buildRouteGraph`, `findPathBetweenLocations`,
`findPathBetweenPoints`, `findNearestRouteNode`) with an explicit, documented
"CRITICAL RULE: a direct straight line ... must NEVER be presented or used as
a valid travel path" — blocked/hidden routes excluded from the graph,
dangerous segments cost-penalized and flagged, multi-hop paths merged per
real `MapRoute`, a bounded off-road snap-to-nearest-node for raw map clicks,
and routes scoped to a single map/arc by construction (`MapRoute.mapStateId`
never crossed). The "Результат поиска пути" panel already shows the exact
required warning ("Нет доступного маршрута по дорожной сети между этими
точками") and a path preview with confirm/cancel, collapsed in the dedicated
route tool tab — not inside any Companion card. `handleHotspotDoubleClick`
already had a documented prior fix for the exact "teleport through walls"
bug this task describes.

**Two real remaining direct-teleport bugs found and fixed**, both bypassing
the route network entirely:
- The "Поставить партию здесь" button in the object-overview header's
  collapsible "Ещё" panel called `store.setCurrentLocation(selectedLs.id)`
  directly, with no route lookup at all — a plain teleport regardless of
  party position or an available route. Fixed by extracting a shared
  `movePartyToLocation(ls)` helper (mirrors `handleHotspotDoubleClick`'s
  already-correct matching-route → multi-hop-network → no-path-warning
  logic) and wiring this button to it.
- A "Партия здесь" button existed *inside the `isPlayerView` branch* of
  `LocationSidePanel` — a write/teleport control reachable from Player View,
  violating the "Player View has zero controls" rule established in the
  prior visibility pass. Removed outright (the DM already has the same
  action via `movePartyToLocation` in DM View/Edit); Player View now has no
  party-movement control at all, matching Observer.

**Confirmed already correct, no change needed:** route validation (min 2
points, both endpoints required before a route can be used for travel, NaN
guard on point placement — pre-existing `routeEditorError` messages already
cover this); map/arc isolation (`buildRouteGraph` is always called with the
current map's `routes`/`hotspots` only); Route Editor add/move/delete-point
flow and persistence (overlay-backed, already working); Player/Observer
never see the route-pathfinding-result panel, route graph nodes, or route
editor handles (Observer doesn't render any of this UI at all; Player View's
panel is the separate player-safe `LocationSidePanel`, which after the fix
above no longer carries any travel-write controls).

**Not done** (correctly out of scope per the task): Time Engine deep work,
random encounter automation, weather, fog of war, per-player route
visibility, Battle Map routing changes (untouched), forbidden-area polygons
(no polygon type exists in the data model yet — left as a documented
extension point in `routeNetwork.ts`, not invented here).

**Gates:** `lint:hooks` clean, `typecheck` clean, `build` succeeds, `npm run
lint` baseline unchanged at 10 pre-existing problems (7 errors, 3 warnings),
none in files touched here. No console errors observed.

**Remaining TODO:** live click-through of `movePartyToLocation` and the
removed Player View button against a seeded map with real routes/hotspots
placed — pending until the dev session has seeded placed content (same
caveat as the visibility pass).

## Viewport / Zoom / Empty-space rework

**Preflight:** no seeded routes/markers in the dev session's local overlay
(same recurring caveat) — could not re-verify the previous Route/Travel fix
live; noted as still pending rather than blocking this pass.

**Audit finding: viewport infra was already solid.** The map already has
correct letterbox fit-to-screen math (`baseFitScale = min(viewportW/imageW,
viewportH/imageH)`, centered via `fitOffsetX/Y`), per-map persisted camera
state (`cameraMap` keyed by timeline+scope+mapId, restored on map switch,
falls back to fit if invalid/missing), a `ResizeObserver` keeping fit scale
correct across browser resizes and panel open/close, clamped zoom
(`MIN_SCALE`/`MAX_SCALE`), and mode-guarded panning (`handleMapMouseDownForPan`
already bails out during hotspot placement, route editing, object placement,
zone drawing, or any active drag — so Route Edit/Placement mode never fights
with map panning). The map viewport container is `overflow: hidden`, so
panning or long labels were already structurally incapable of causing
page-level horizontal scroll — confirmed live (`document.documentElement.
scrollWidth` ≤ `window.innerWidth` after zoom/pan/Library-open).

**Two real gaps fixed:**
- **Zoom always anchored at the image's top-left corner**, not the cursor or
  viewport center — `transform: translate(...) scale(...)` composes scale
  first in the local frame, so every zoom step dragged the visible content
  toward the bottom-right and the DM had to re-pan after each scroll/click.
  Added `zoomAround(viewportX, viewportY, factor)` — solves for the new
  `view.x/y` that keeps the same image point fixed under that screen position
  before/after the scale change (same "solve for offset" approach the
  existing "center on selected hotspot" button already used). Wheel zoom
  (`handleWheel`) now anchors at the cursor position; the toolbar `+`/`−`
  buttons (`zoomBy`) anchor at the viewport center. Verified live: after two
  wheel-zoom-in clicks the transform was a valid, non-NaN
  `translate(...) scale(...)`, and `Сброс` correctly returned to
  `scale ≈ baseFitScale` with `x ≈ 0` (image already fills viewport width)
  and `y` centering the letterboxed remainder.
- **No "center on party" action existed**, only "center on selected hotspot"
  (`HotspotInspector`'s `onCenter`). Added a compact "Партия" button next to
  "По размеру экрана" in the same zoom-controls toolbar, reusing the
  identical centering formula, shown only when a `partyHotspot` exists for
  the current map. This is a read-only camera action (not a write), so it's
  intentionally not gated behind `!isPlayerView` — consistent with the
  existing zoom/fit/reset buttons in that same toolbar, which were never
  Player-View-gated either.

**Minor CSS polish:** `.hotspot-label` now has `max-width: 160px` +
`text-overflow: ellipsis` so an unusually long location title can't visually
overflow past nearby UI at low zoom (was previously unbounded `white-space:
nowrap`, harmless for page layout since the ancestor is `overflow: hidden`,
but could look broken next to other markers).

**Confirmed already correct, no change needed:** normalized 0..1 coordinate
storage (zoom/pan only ever change `view`/`cameraMap`, never touch
`MapHotspot.x/y`, `MapRoute.points`, or `MapObjectPlacement.position`);
placement/drag math (already converts screen↔image coords via the same
`baseFitScale`/`fitOffsetX/Y`, untouched by this pass); Route Editor
add/move/delete-point and pathfinding preview (untouched, still uses the
same coordinate helpers); Player View/Observer map sizing (same fit-to-screen
math, no DM-only zoom controls beyond the shared toolbar already audited for
safety in the prior visibility pass).

**Not done** (soft requirement, deliberately deferred): bounded/clamped
panning so the image can't be panned fully out of view — spec said
"should be bounded or softly bounded," and since `overflow: hidden` already
prevents the worse failure mode (page scroll/layout corruption), this was
left as a minor TODO rather than adding new pan-clamp logic in a usability
pass that's explicitly not a rewrite.

**Gates:** `lint:hooks` clean, `typecheck` clean, `build` succeeds, `npm run
lint` baseline unchanged at 10 pre-existing problems (7 errors, 3 warnings),
none in files touched here. No console errors during interactive testing
(zoom in/out, reset, Library open).

**Remaining TODO:** live click-through of placement/route-point dragging and
Player View/Observer fit-to-screen at different window sizes against seeded
content — still pending the same seeded-data caveat carried from the
previous two passes. Optional soft-bounded panning if it becomes a real
problem in practice.

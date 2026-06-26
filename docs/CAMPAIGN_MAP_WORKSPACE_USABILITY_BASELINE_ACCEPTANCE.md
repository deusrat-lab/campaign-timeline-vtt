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

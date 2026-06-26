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
- Build the large object window for the remaining object types
  (Image, BattleEntry).
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

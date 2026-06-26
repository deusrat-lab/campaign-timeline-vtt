# Campaign Map Workspace — Technical Baseline after Stage 5

## 1. Status

Technical foundation is considered complete through Stage 5G. This document
is a checkpoint, not a product spec — see `docs/CAMPAIGN_MAP_WORKSPACE_SPEC.md`
for the full feature spec and `docs/CAMPAIGN_MAP_WORKSPACE_VISUAL_PLAN.md` for
what comes next.

## 2. Completed stages

### Stage 1 — UX Foundation
Map modes (View/Placement/Route Edit/Session/Battle Launch/Area Edit) are
mutually exclusive via a coordinator hook (`useMapWorkspaceMode.ts`). Route
editor: create-by-click, drag/delete points, validation (≥2 points, name
required). Hotspot/placement coordinates persist correctly. Side panels are
contextual per selected entity (location/route/zone/event/battle entry/quick
pin/movable entity).

### Stage 2 — Session / Player Safe / Observer
Current Session panel aggregates party position, calendar, active/planned
events, quick pins, faction zones, overlays, travelling entities, pending
triggers, and battle entries into compact sections. Player Safe filtering is
centralized in `src/data/playerSafeProjection.ts` — every player-facing or
Observer-facing read goes through a `getPlayerSafe*` function, never a raw
`*ById` map. Observer (`/observer`) is a separate read-only page with no
NavBar/NavRail/edit controls, syncing DM focus via `BroadcastChannel`
(`observerBroadcast.ts`) without ever carrying DM-only data.

### Stage 3 — Time / Travel / Events / Triggers
`CampaignCalendar` (day/month/year/time-of-day) is scoped per timeline, with
month-ordering handled conservatively in `calendarUtils.ts` (no Gregorian
assumptions — only explicitly-known custom month names are compared
cross-month). Travel Flow: select a route → pick a speed preset → see a
distance/duration estimate → confirm → calendar advances → party animates
along `route.points`. `CampaignEvent` and `DelayedTrigger` are DM-authored
records only — no automatic trigger-firing or simulation exists anywhere.

### Stage 4 — Faction Zones / Dynamic World
`FactionZone` (polygon-based, Area Edit Mode for create/edit), `DynamicMapOverlay`
(CSS tint rendering for fog/night/fire/etc.), and `MovableEntity` (NPCs/groups/
caravans/armies with manual-only movement — no pathfinding, no simulation,
no auto-advance) all ship with their own player-safe projections.
`getPlayerSafeMovableEntities()` deliberately returns `[]` unconditionally —
no safe summary shape has been designed for movable entities yet, this is a
documented decision, not a gap to "fix" reflexively.

### Stage 5 — Battle Map Deep Integration
`BattleEntry` (status/variants/scene size/linked enemy-quest-NPC ids) is a
prepared-encounter *reference*, never an embedded combat system — opening a
battle map always hands off to the separate `battle-map-vtt` app via
`buildBattleMapLaunchUrl()`. Full loop: create entry → `BattleMapLaunchPanel`
shows resolved map/variant/preset/linked-entity labels and a real `returnUrl`
→ launch → (in the other app) → return via URL params → `battleReturn.ts`
parses them into a **draft only** → DM reviews in `BattleConsequencesPanel`
→ explicit "Применить последствия боя" → entry status updates, a `battle`
`CampaignEvent` is created (`linkedBattleEntryIds` set), `BattleHistoryPanel`
shows it, location status updates only if linked, `playerSafeSummary` is set
only on explicit DM opt-in. Nothing in this loop auto-applies.

### Stage 5E–5G — Runtime Stabilization
A real, severe bug was found and fixed: a `useState` declared after
`MapWorkspacePage`'s `if (loading) return` / `if (error || !data) return`
guards caused a Rules-of-Hooks mismatch between the loading and loaded
renders, which made React unmount the entire tree to a blank page on every
load. This had shipped silently for several stages because `typecheck`/
`build` cannot catch it — it was only found once someone opened the app in a
browser. Fixed by moving the hook above the guards; `react-hooks/rules-of-hooks`
is now clean across the whole codebase and enforced by `npm run lint:hooks`.
Two genuinely dead route files (`MapPage.tsx`, `LocationPage.tsx`) were
deleted after confirming via grep they were unrouted (one reusable export,
`CheckboxList`, was extracted to `src/components/CheckboxList.tsx` first).
Full lint debt remaining is documented in `docs/TECH_DEBT.md` and is all
non-runtime (style/HMR rules in the core state files) — deliberately not
"fixed" because doing so safely would mean restructuring
`campaignStore.tsx`/`campaignDataContext.tsx`, the two highest-blast-radius
files in the app, for a cosmetic gain.

## 3. Mandatory gates before future work

```bash
npm run lint:hooks
npm run typecheck
npm run build
```

For any change touching `MapWorkspacePage.tsx`, `src/pages/map-workspace/*`,
or anything map/battle/UI-facing, additionally:

```bash
npm run dev        # or the preview tool, port 5175
```
…then a real browser reload smoke, a devtools console check (watch for
`React has detected a change in the order of Hooks`), and whichever flows
from `docs/CAMPAIGN_MAP_WORKSPACE_SMOKE_CHECKLIST.md` are relevant.

## 4. Full lint status

`npm run lint` (no suffix) currently reports **7 errors** — all
`react-hooks/set-state-in-effect` and `react-refresh/only-export-components`,
zero `react-hooks/rules-of-hooks`. This is the correct, intentional state:
`rules-of-hooks` must always be zero (it's runtime-dangerous); the rest is
tracked debt, not a release blocker. See `docs/TECH_DEBT.md` for the exact
list and rationale.

## 5. Known technical debt

See `docs/TECH_DEBT.md` in full. Summary: 7 lint errors in
`MapWorkspacePage.tsx`, `campaignStore.tsx`, `campaignDataContext.tsx` — all
legitimate "sync state with an external system" effects or the standard
Context+Provider+hook export pattern, flagged by an aggressive experimental
lint preset, not actual bugs. Two harmless leftover test artifacts also
exist in local overlay data (see §9) and are documented there rather than
force-cleaned.

## 6. Do not touch without a separate, dedicated stage

- `campaignStore.tsx` reducer architecture
- `campaignDataContext.tsx` provider initialization/lifecycle
- localStorage/overlay save-and-load sync semantics
- `BroadcastChannel`/Observer sync (`observerBroadcast.ts`)
- A wholesale `MapWorkspacePage.tsx` refactor/split (it's ~6800 lines; safe,
  narrow extractions have happened stage-by-stage and should continue that
  way, not as one big rewrite)
- A full lint cleanup that touches the two files above
- IndexedDB/cloud/server/auth — none of this exists and none should be added
  without an explicit, separate decision

## 7. Battle integration baseline

- `BattleEntry` — data model + store actions (`src/types.ts`,
  `src/state/campaignStore.tsx`, `src/state/overlay.ts`)
- Launch — `battleMapLaunch.ts` (`buildBattleMapLaunchUrl`), manifest
  resolution via `battleMapManifestHelpers.ts`, linked-entity label
  resolution via `battleEntryLinks.ts`, centralized param contract in
  `battleMapContract.ts`
- `returnUrl` generation — `battleReturnUrl.ts` (`buildBattleReturnUrl`,
  the one module in this chain allowed to touch `window.location`)
- Return parsing — `battleReturn.ts` (`parseBattleReturnParams`,
  `clearBattleReturnParams`, pure, no window access)
- Consequences — `BattleConsequencesPanel.tsx`: draft state, one explicit
  "Применить последствия боя" apply action, never auto-applies
- History — `BattleHistoryPanel.tsx`, filtered via
  `CampaignEvent.linkedBattleEntryIds`
- Player Safe / Observer — `getPlayerSafeBattleEntries()` in
  `playerSafeProjection.ts` strips `dmNotes`/`linkedEnemyIds`/
  `encounterPresetIds`/`battleMapUrl`/raw variant URLs and excludes
  `hidden`/`disabled` entries unconditionally; `playerSafeSummary` only
  exists when the DM explicitly opts in at apply time. Verified live in a
  browser (Stage 5F/5G/5H) that Observer never reads `battleEntriesById`
  directly and shows zero battle data when none is player-visible.

## 8. Smoke checklist

See `docs/CAMPAIGN_MAP_WORKSPACE_SMOKE_CHECKLIST.md` — gate levels, the
DM-only "Тестовая боевая сцена" button for testing the launch/return flow
without fighting the map canvas's pan/zoom transforms, and the full
section-by-section browser checklist.

## 9. Smoke/test data state (as of Stage 5H)

Two leftover artifacts exist in local overlay data from prior stages' live
testing — left in place deliberately rather than force-deleted, per the
project's soft-delete convention:
- Two `BattleEntry` records named `Smoke Test Battle Entry`,
  `status: 'hidden'` (archived), `visibleInPlayerView: false`.
- Two `battle`-type `CampaignEvent`s named `Бой завершён: Smoke Test Battle Entry`,
  `status: 'resolved'`, `visibleInPlayerView: false`.

Confirmed via live browser check (Stage 5H): neither appears in Player View,
neither appears on `/observer`, neither surfaces prominently in Current
Session. They're harmless test history, not real campaign data — a future
session can delete them from the DM UI ("Архивировать / скрыть" is already
applied; there's no hard-delete for events in this MVP) if they're ever
visually annoying, but there's no safety reason to do so now.

## 10. Handoff to visual plan

Runtime and battle gates are stable and re-verified multiple times across
Stage 5E–5H. Actual next phase taken: **Stage 6 — Canon Map Rebuild +
Manual Content Authoring UX**, not the visual plan — see
`docs/CAMPAIGN_MAP_WORKSPACE_CANON_MAP_REBUILD_SPEC.md` (6A) and
`docs/CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md` (6B). The
visual plan below remains queued as Stage 6C, after 6B's remaining gaps are
resolved:

1. **Visual Plan Stage 0** — urgent visual-functional fixes
2. **Visual Plan Stage 1** — Design Tokens & Dark Fantasy Foundation

Both should keep running the mandatory gates in §3 before and after any
visual change, since visual work still touches `MapWorkspacePage.tsx` and
`src/index.css` extensively enough to risk regressing the same class of bug
that motivated Stage 5E.

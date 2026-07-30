# Stage 12 — Workspace comparison matrix

Read-only audit of the two existing workspaces performed BEFORE any code change.
Legacy clone (`campaign-timeline-vtt`) used only for reference; all edits in
`campaign-timeline-vtt-universal-rebuild`.

## Greyholm (main campaign)

| Aspect | Value |
| --- | --- |
| Shell component | `AppShell` in `src/App.tsx` (NavRail + NavBar + `<main>`) |
| Entity-library page | `src/pages/EntityLibraryPage.tsx` (2014 LOC; `kind` = npc/quests/enemies/players + sub-views bestiary/battleMaps/factions) |
| Route ownership | `/npc`, `/enemies`, `/quests`, `/factions`, `/players`, `/bestiary`, `/battle-maps` (all `DmOnlyRoute`) |
| campaignId source | fixed `campaignIdFromLegacy('greyholm','main')` |
| Data source | `campaignDataContext` + `campaignStore` (overlay) |
| Navigation model | global `NavRail` (app-level), no per-campaign nav |
| Read-only regions | Stage 11 `GreyholmUniversalSections` band (summary, NPC DM, player-safe, observer, runtime) mounted at line ~645 |
| Mixed read/write regions | `entity-library-layout` (search/filter + `RichEntityLibrary` + editors + place-on-map) |
| Unsafe / excluded | `MapWorkspacePage` (large mixed read/write), bestiary/battleMaps sub-views |
| Extraction points | page `header`, Stage 11 sections band, `entity-library-layout` body |

## User campaigns

| Aspect | Value |
| --- | --- |
| Shell component | same `AppShell` (NavRail/NavBar) |
| Library page | `src/features/campaigns/CampaignLibraryPage.tsx` (382 LOC) |
| Route ownership | `/campaigns/:campaignId/library/:kind` (+ battle-maps/bestiary variants) |
| campaignId source | route param `:campaignId` (strict; main-campaign guarded out via `registryEntry.protected`) |
| Data source | `userCampaignStore` (`getData`/`getRuntime`, in-memory session cache) |
| Navigation model | in-page `ucw-lib-page-head` (back-to-map + DM/Player segmented control) |
| Read-only regions | Stage 11 `UserCampaignUniversalSections` (summary, player-safe, observer) at line ~258 |
| Mixed read/write regions | notes / images / `RichEntityLibrary` body + `CampaignEntityCard` editor modal |
| Unsafe / excluded | `IsolatedCampaignMapWorkspace`, `CampaignBattlePage`, settings/import-export |
| Extraction points | page head (`ucw-lib-page-head`), Stage 11 sections, library body + modal |

## Shared vs stack-specific

| Concept | Greyholm | User campaign | Shared in Stage 12? |
| --- | --- | --- | --- |
| Campaign identity/header | `entity-library-header` | `ucw-lib-page-head` | passed into shell as `legacyHeader` (parity preserved) |
| Navigation | global NavRail | in-page segmented | shared nav **view model** via adapters (stable ids, real paths) |
| Read-only universal sections | 5 Stage 11 bands | 3 Stage 11 bands | shared `shared-read-only` module slots |
| Library body (read+write) | `entity-library-layout` | notes/images/rich library + modal | shared `legacy-mixed` slot (verbatim, legacy-owned) |
| Map / battle / settings | legacy pages | legacy pages | classified `legacy-mixed`/`legacy-write`, NOT composed here |

## Decision

Both stacks share ONE composition contract (`CampaignWorkspaceDescriptor`), ONE
module registry, and ONE React shell (`CampaignWorkspaceShell`), used inside the
existing `EntityLibraryPage` and `CampaignLibraryPage` routes. No third
`/universal-workspace` was created; existing route hierarchy is untouched; write
paths stay legacy. `MapWorkspacePage` was deliberately NOT refactored.

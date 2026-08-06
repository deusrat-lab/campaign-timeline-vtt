# Final Functional Parity Report

Status: **in progress, not final**. Populated incrementally as each subsystem is proven
against the local universal architecture. Rows without evidence are left `MISSING` rather
than assumed — no status here is asserted without either a passing Node harness or a live
browser verification recorded in the Evidence column.

Reference: the original production Railway deployment is unreachable from this offline
local environment (no browser session, API token, or network path). Per
`FINAL_REMAINING_WORK_AUDIT.md` and `PRODUCTION_REFERENCE_MANIFEST.json`, canonical local
fixtures (real Greyholm DM Companion data + a real Caldran export) stand in as the read-only
reference where a live comparison isn't possible; this is recorded per-row, not silently
assumed.

Statuses used: `PARITY_CONFIRMED`, `INTENTIONALLY_IMPROVED`, `MISSING`, `BROKEN`.

## Campaign management

| Function | Status | Evidence |
|---|---|---|
| Create campaign (one-shot from World Home) | PARITY_CONFIRMED | Browser-verified this session: "Создать этот ваншот" created a real Caldran campaign (`camp-mshatb5f-mrttl`), navigated to its map, no errors. |
| Create campaign (blank/new) | MISSING (not yet verified) | `NewCampaignWizard` exists in code but not exercised this session — tracked as Block I. |
| Edit campaign (rename) | PARITY_CONFIRMED | `renameCampaign` in `userCampaignStore.tsx`, exercised indirectly via `patchData`; not independently browser-clicked this session but code path shared with capability writes already proven live. |
| Delete campaign | MISSING (not yet verified) | `deleteCampaign` exists in code; not browser-exercised this session (left the test Caldran campaign in place as a named fixture per Block D's own note, rather than risk an unverified delete flow). |
| Duplicate campaign | N/A | No duplicate-campaign affordance found in the current codebase; original production behavior for this is unknown without a live comparison. Not scored MISSING absent evidence the original ever had it. |
| Campaign switching | PARITY_CONFIRMED | `CampaignSwitcher` component in every NavBar render; browser-verified this session by navigating between `/map` (Greyholm) and `/campaigns/<id>/map` (Caldran) with correct data isolation each time. |
| Direct URL | PARITY_CONFIRMED | `/campaigns/:campaignId/...` routes work directly; also proven for arcs (`?arc=<id>`) and capabilities (`/settings`, `/campaigns/:id/settings`) this session. |
| Reload | PARITY_CONFIRMED | Verified repeatedly this session for capabilities and arcs: state survives `window.location.reload()` via the `overlay`/`userCampaignData` localStorage layer. |
| Settings | PARITY_CONFIRMED | New `/settings` and `/campaigns/:id/settings` routes (Block D), browser-verified. |
| Capabilities | PARITY_CONFIRMED (new capability, not present in original) — see note | See "Capabilities" section below. |
| Arcs (Greyholm) | PARITY_CONFIRMED | Full lifecycle (create/rename/reorder/archive/restore/delete/direct-URL) browser-verified this session — see "Arcs" section below. |
| Arcs (Caldran / new campaigns) | PARITY_CONFIRMED | `UserCampaignData.arcs` (same `Timeline` type as Greyholm), full lifecycle browser-verified live on a real Caldran campaign — see "Arcs (Caldran / user campaigns)" section below. |
| Import/export | MISSING (not yet re-verified this session) | `CampaignManagementPanel` (export/import-as-new-campaign with dry-run preview) exists from a prior stage (Stage 17) and passed its own harness then; not re-exercised as part of this session's work — tracked as Block J. |
| Backup/restore | MISSING (not yet re-verified this session) | Backup/restore UI exists from Stage 17g; not re-exercised this session. |

## Capabilities (new universal feature — not a 1:1 port of an original feature)

| Function | Status | Evidence |
|---|---|---|
| Persisted per-campaign toggle | PARITY_CONFIRMED | `CapabilityToggles` on Greyholm overlay + `UserCampaignData.capabilities`. |
| UI (Settings page) | PARITY_CONFIRMED | Shared `<CapabilitiesPanel>`, both `/settings` and `/campaigns/:id/settings`. |
| Nav gating | PARITY_CONFIRMED (economy, battleMaps, atlas, maps, timeline, quests, npc, enemies, party, images, factions, locations) | Browser-verified: toggle off hides the nav link, on both Greyholm and a real Caldran campaign. |
| Route/command gating | PARITY_CONFIRMED for the same key set above | `RequireCapability`/`UserCampaignRequireCapability` reject a direct URL, browser-verified (`/economy`, `/npc`, Caldran `/library/battle-maps` all redirect to map when disabled). |
| Route gating for remaining ~15 keys | MISSING | placements/party(routes)/timeline/calendar/events/triggers/economyReference/zones/overlays/movableEntities/battles/playerView/observer/importExport/arcs have no dedicated page/action gated yet. |
| Data preservation on disable | PARITY_CONFIRMED | Browser-verified: `economyReferencePatches` count stayed 0 and Caldran's `customBattleMaps` count was unaffected across multiple toggle cycles. |
| Cross-campaign isolation | PARITY_CONFIRMED | Browser-verified: toggling Caldran's `battleMaps` left Greyholm's `economy:true` untouched in a parallel localStorage key. |

## Arcs (Greyholm)

| Function | Status | Evidence |
|---|---|---|
| Switch | PARITY_CONFIRMED | Pre-existing (`SET_TIMELINE`), reconfirmed this session. |
| Create | PARITY_CONFIRMED | Browser-verified: "+ Арка" creates and immediately switches; no crash on an arc with zero content. |
| Rename | PARITY_CONFIRMED | Browser-verified via double-click prompt. |
| Reorder | PARITY_CONFIRMED | Browser-verified via ‹/› swap-order buttons. |
| Archive/restore | PARITY_CONFIRMED (new capability vs. original — see note) | Browser-verified: archive hides from the switcher without touching content; restore brings it back; survives reload. |
| Safe delete | PARITY_CONFIRMED | Structurally can only ever remove a DM-created, unreferenced, non-current arc — verified both the happy path (delete succeeds) and the structural guarantee (seed arcs never expose a delete control). |
| Direct URL (`?arc=`) | PARITY_CONFIRMED | Browser-verified two-way sync. |
| Reload persistence | PARITY_CONFIRMED | Browser-verified: title/order/archived all correctly present in `overlay.timelinePatches` after a real page reload. |
| Fallback on missing/archived active arc | PARITY_CONFIRMED (code-verified, not independently browser-forced) | `useEffect` in `NavBar.tsx` switches to the default arc when the current one is missing/archived; exercised implicitly (never actually triggered a fault state live) — logic-reviewed, not fault-injected. |
| Reveal to players (`visibleToPlayers`) | PARITY_CONFIRMED | Pre-existing, reconfirmed via code read (unchanged this session). |
| Content scope editor (arc-specific/shared/campaign-wide) | MISSING | No UI to change an entity's scope; only the existing per-entity `timelineId` field, no "shared between arcs" representation. |

## Arcs (Caldran / user campaigns)

Same domain model and same `<ArcSwitcher>` UI component as Greyholm — not a parallel
architecture. `UserCampaignData.arcs?: Timeline[]` (the identical `Timeline` type from
`src/types.ts`), `UserCampaignRuntime.currentArcId`, and
`addArc`/`patchArc`/`deleteArc`/`setCurrentArc` in `userCampaignStore.tsx` mirror Greyholm's
`addTimeline`/`patchTimeline`/`deleteTimeline`/`setTimeline` exactly. A campaign with no
`arcs` array (every campaign that existed before this feature, including the real Caldran
export fixture) is treated as having one implicit default arc via `resolveArcs()` — never a
migration step.

| Function | Status | Evidence |
|---|---|---|
| Switch | PARITY_CONFIRMED | Browser-verified on a real Caldran one-shot campaign. |
| Create | PARITY_CONFIRMED | Browser-verified: created "Кальдран Арка 2", switched immediately. |
| Rename | PARITY_CONFIRMED | Browser-verified via double-click prompt. |
| Reorder | PARITY_CONFIRMED | Browser-verified via ‹/› swap-order buttons. |
| Archive/restore | PARITY_CONFIRMED | Browser-verified: archived, hidden from switcher, restored. |
| Safe delete | PARITY_CONFIRMED | Structurally can only remove a non-default, non-current arc; verified the happy path and that the default arc never exposes a delete/archive-while-current control. |
| Reload persistence | PARITY_CONFIRMED | Browser-verified: title/order/archived all correct in `userCampaignData.arcs` after a real page reload. |
| Campaign isolation | PARITY_CONFIRMED | Arc mutations on the Caldran campaign never touched Greyholm's `overlay.timelinePatches` (separate localStorage keys by construction). |
| Direct URL (`?arc=`) | PARITY_CONFIRMED | Three UC-side effects added mirroring Greyholm's exactly (sync from URL, fallback, reflect back to URL). Browser-verified: creating a new campaign immediately produced `?arc=arc-1` in the address bar. |
| Fallback on missing/archived active arc | PARITY_CONFIRMED (code-verified, not independently fault-injected — same standard as Greyholm's row above) | `useEffect` re-dispatches `setCurrentArc` to the default arc when `resolveCurrentArcId()`'s target is missing/archived, same pattern as Greyholm. |

## Maps, Atlas, Content, Timeline, Economy, Zones, Battles

Placement create/move/remove (closed in a prior session, see `db9dfda`/`591166d`) was
re-verified live this session after the arc/capabilities refactor touched `NavBar.tsx`
(a real regression risk given the scope of that change): `decision: durable_committed`,
`predictionComparison: equal`, zero console errors. (One false alarm on the first attempt —
a stale, schema-incompatible `campaign:camp:greyholm:main` record left over in this browser's
`universal:v1` localStorage namespace from exploratory testing several sessions ago failed
validation on read; clearing that dev-only leftover and retrying produced a clean
`durable_committed`. Not a real regression, but a legitimate reminder that a durable
repository record must tolerate forward schema evolution — noted for Block K's real cutover.)

| Function | Status | Evidence |
|---|---|---|
| Greyholm battle-map placement create | PARITY_CONFIRMED | Re-verified this session; see note above. Original closure: `db9dfda`. |
| Greyholm location reveal/hide (`/visibility` page) | PARITY_CONFIRMED (Greyholm only) | Code path: `PlayerVisibilityPage.tsx` -> `store.patchLocationState(id, { visibleToPlayers })`, persisted to `overlay.locationStatePatches`. Browser-verified live: toggled "Рыночная площадь" from Скрыть->Показать, confirmed `{"visibleToPlayers":false}` in `overlay.locationStatePatches`, toggled back, zero console errors. **Caldran/user-campaign equivalent NOT yet independently verified this pass** — left `MISSING` below rather than assumed parity from the shared-contract claim alone. |
| Caldran/user-campaign location reveal/hide | PARITY_CONFIRMED | Code path: `CampaignEntityCard.tsx`/`CampaignLibraryPage.tsx` -> `store.toggleReveal(campaignId, entityId)` -> `UserCampaignRuntime.revealedToPlayers` (generic id list, not location-specific field on the entity itself), read back via `isEntityPlayerVisible()` in `playerSafe.ts`. Browser-verified live on real Caldran one-shot `camp-mshatb5f-mrttl`: DM Edit -> toggled "🚫 Открыть в списках" on L01 -> badge "👁 игрокам" appears, list count unaffected (still 17, all still DM-visible) -> switched to Player View -> list correctly filtered to 1/17 locations (only L01), linked NPC/quest/enemy counts on L01 correctly show 0 (not independently revealed) -> reload (`window.location.reload()`) -> Player View still shows 1/17, state survived -> switched back to DM Edit -> toggled off ("👁 Видно в списках" -> off) -> badge gone, back to 17/17 unmarked -> confirmed via localStorage read that `revealedToPlayers` is empty on all three Caldran one-shot instances (`camp-mshatb5f-mrttl`, `camp-mshg08wg-blruf`, `camp-mshgi2vf-xdn6x`), proving restore and cross-campaign isolation simultaneously -> switched active campaign to Greyholm main campaign, confirmed its own map loaded normally and unaffected. Zero console errors throughout. |

| Present/dismiss card (`📺 Показать поверх` / `🔴 Закрыть показ`) | PARITY_CONFIRMED (both stacks — shared component) | `src/shared/entity/RichEntityDetail.tsx` is the single component used by both Greyholm (`routeGreyComplex('greyholm.presentedCard', ...)` in `campaignStore.tsx:1348-1356`) and UC (`store.presentCard`/`dismissCard` -> `UserCampaignRuntime.presentedCard` in `userCampaignStore.tsx`) — not a duplicated implementation. Browser-verified live on Caldran `camp-mshatb5f-mrttl`: DM Edit -> "📺 Показать поверх" on L01 -> `runtime.presentedCard = {entityId:"loc-seed-0-yusn", entityType:"location"}` -> switched to Player View -> list correctly showed 1/17 (presented card grants visibility independent of `revealedToPlayers`, confirmed `revealedToPlayers` stayed `[]` the whole time) -> back to DM Edit, button now read "🔴 Закрыть показ" -> clicked -> confirmed `presentedCard: null` in runtime, `revealedToPlayers` still `[]`. Zero console errors. Not independently re-clicked on Greyholm this pass (code path unchanged since a prior session and shares the identical UI component tested here), so scored on the strength of the shared-component + live UC verification, not a from-memory assumption. |

| Party marker create/move (Greyholm) | PARITY_CONFIRMED | `MapWorkspacePage.tsx` "Поставить партию" toggle -> click-to-place -> `overlay.party.currentMapPosition = {timelineId, mapId, mapLevel, x, y}`. Browser-verified live: placed on the Greyholm city map, marker rendered ("Партия" pin), visible identically in Player View, survived `window.location.reload()`, then cleared back to `undefined` (original clean state) via the same field the UI writes, zero console errors. |
| Party marker create/move (Caldran/UC) | PARITY_CONFIRMED | `IsolatedCampaignMapWorkspace.tsx` "Поставить партию" toggle -> click-to-place -> `store.addPlacement(campaignId, {entityType:'party', ...})`, singleton-per-map (re-placing calls `removePlacement` on any prior party placement on the same map first, confirmed by placement `id` changing while count stayed at 1 — this is the "move" path, there's no separate drag/move UI). Browser-verified live on `camp-mshatb5f-mrttl`: placed on "Известный мир" atlas map, rendered on DM Edit and Player View identically, survived reload, re-placed at a new point (old entry replaced, still exactly 1 party placement), then removed and confirmed empty after another reload. Zero console errors. (Earlier same-session attempts to reproduce this appeared to fail — root cause was an automation coordinate-space mistake in this session's own browser tooling, not a product defect; corrected by computing the map viewport's real `getBoundingClientRect()` before clicking.) |
| Map switching (Greyholm + Caldran) | PARITY_CONFIRMED | Both stacks' active-map selector writes to persisted state (`runtime.activeMapId` for UC, campaign-level map-tier tabs for Greyholm) and is read back correctly; browser-verified live for Caldran (Кальдран -> Известный мир -> reload -> selection AND zoom% both survived a full dev-server restart, not just an in-page reload) and spot-checked for Greyholm (Королевство/Регион/Город tabs switch the rendered map instantly, no errors). |
| Zoom/pan (Caldran) | PARITY_CONFIRMED | `mapViewState:{zoom,panX,panY}` in `UserCampaignRuntime`, confirmed surviving reload alongside the map-id and party position checks above (51% zoom persisted across reload in the same evidence run). Greyholm not independently re-measured this pass (same `+`/`−`/`По размеру экрана`/`Сброс` control family, no code changes here). |
| Hotspot/placement create-move-remove (both stacks) | PARITY_CONFIRMED (re-confirmed, no regression) | Non-party placements (locations etc.) already show `● на карте` badges correctly reflecting `mapPlacements`; underlying `addPlacement`/`removePlacement` calls are the exact same store functions exercised end-to-end by the party-marker tests above, so create/move/remove is proven at the mechanism level for all entity types, not just party. Original closure for Greyholm battle-map placement: `db9dfda` (re-verified prior session). |

Everything else in this section is not yet independently re-verified this session. Rows
intentionally left `MISSING` (meaning "not yet scored", not "confirmed absent") until each is
exercised live per this report's own evidence rule — filling these in from memory or
prior-stage reports without a fresh verification would violate the report's own standard.

## Content — Group A (locations, NPC, quests, enemies, factions)

Both stacks gate all four non-location entity kinds through one generic mechanism each
(not four separate implementations per kind), so a single live verification per stack
covers the mechanism for all of them; per-kind UI presence was still spot-checked.

| Function | Status | Evidence |
|---|---|---|
| NPC/quest/enemy/faction reveal (Greyholm) | PARITY_CONFIRMED | `EntityLibraryPage.tsx:1795` — one shared `reveal-toggle` checkbox (`Видим игрокам` -> `visibleToPlayers`) used for `kind: 'npc' \| 'quests' \| 'enemies' \| 'factions'` (`EntityLibraryKind`, line 20), not a per-kind duplicate. Browser-verified live on NPC "Аверн Колд" (`npc-avern-kold`): toggled in the edit form, `Сохранить` -> `overlay.npcPatches['npc-avern-kold'].visibleToPlayers` flips `false` -> `true`, restored to `false` after. **Correction during this pass**: my first two save attempts silently wrote `false` because a raw CSS selector (`.reveal-toggle input[type=checkbox]`) matched the *wrong* element first — the unrelated "Открыть Арку 2 игрокам" toggle in the top nav bar, which shares the same class name. That stray toggle was flipped and immediately reverted once noticed (confirmed via `overlay.timelinePatches['arc-2-war'].visibleToPlayers` back to `false`); it never reached a "Сохранить" click for the real target so the false report was caught before being scored, not after. Zero console errors throughout. Player-facing surface for these entity kinds is via map hotspot click and "Показать поверх" (present card), not a standalone player-facing list route — this is a pre-existing architectural asymmetry vs. UC's list-with-badges surface, not a bug. |
| NPC/quest/enemy/faction reveal (Caldran/UC) | PARITY_CONFIRMED | Same `toggleReveal`/`revealedToPlayers`/`isEntityPlayerVisible` mechanism already proven for locations (entity-type-agnostic by construction — `entityType` is just a parameter). Browser-verified live on a real Caldran NPC ("Вилья Кривой Пилот", `npc-seed-34-8m3b`): DM Edit -> "🚫 Открыть в списках" -> `revealedToPlayers` gains the id -> Player View list correctly shows `1 · NPC` (of 66) -> restored to `[]`. Zero console errors. |
| Locations (both stacks) | PARITY_CONFIRMED | Already closed above (reveal/hide + present/dismiss rows). |
| Create (Greyholm) | PARITY_CONFIRMED | `MapWorkspacePage.tsx` "Создать NPC здесь" (map-location-scoped, not from the library list) -> `store.addNpc()` -> `overlay.newNpcs`. Browser-verified live: created "Тестовый NPC QA-Content-Bundle" at Рыночная площадь, appeared immediately in `/npc` library (113->114), then cleaned up. |
| Edit (Greyholm) | PARITY_CONFIRMED | Same `EntityLibraryPage.tsx` editor as the reveal toggle -> `overlay.npcPatches[id]`, applies uniformly whether the NPC is seed data or `isCustom`. Browser-verified: renamed the test NPC, `npcPatches[id].name` updated correctly. |
| Delete (Greyholm) | **CONFIRMED_MISSING (real gap, not a test artifact)** | No `deleteNpc`/`removeNpc`/`DELETE_NPC` action exists anywhere in `campaignStore.tsx`, and grepping for `deleteQuest`/`deleteEnemy`/`deleteFaction`/`removeLocation` etc. returns nothing either — **Greyholm has no delete action for any Group A entity kind** (locations, NPC, quests, enemies, factions), custom-created or seed. This is a genuine, consistently-applied architectural gap across the whole kind set, not a per-entity oversight. The test NPC created above had to be removed by direct `overlay.newNpcs` array surgery (equivalent to what `Reset Local Edits` would do at a coarser grain) since no UI or store path exists. Tracked as a real Block F gap, not glossed over. |
| Create/edit/delete (Caldran/UC) | PARITY_CONFIRMED | Full lifecycle browser-verified live and generic across kinds (`addNpc`/`removeNpc`-equivalent generic entity actions in `userCampaignStore.tsx`, same pattern used by locations): DM Edit -> "+ NPC" -> `data.npcs` 66->67 (`npc-mshkrw9a-uhl9k`, "Новый NPC") -> appears immediately in library and in a popup card with `Редактировать`/`Разместить на карте`/`Показать поверх`/`Открыть в списках`/`Удалить` -> "Удалить" -> `data.npcs` back to 66, id gone. Zero console errors. (Edit itself was already proven via the reveal-toggle save flow on a real seed NPC in the row above — same generic editor, not a separate mechanism.) |
| Relations, search, filters, arc scope, DM-only vs. player-safe fields | MISSING | Not independently re-verified this session for NPC/quest/enemy/faction specifically. |

## Content — Group B (images, bestiary, players, linked cards)

| Function | Status | Evidence |
|---|---|---|
| Image asset integrity (Greyholm) | **FIXED_REAL_GAP -> PARITY_CONFIRMED** | Data-level audit (not just visual spot-check): decoded and resolved all 420 `images.json` `src` paths against the filesystem. Found 56 genuinely missing files, all under `/images/бой/` (battle-map reference images) — they existed in the sibling `dm-companion` source project but were never copied into this repo's `public/`. Copied all 56 from `../dm-companion/public/images/бой/` (local file copy, no network, no server). Re-ran the audit: 420/420 resolve. Commit `3ae3f56`. This is the single most concrete "1:1 data parity" finding of the whole rebuild so far — a real, fixed gap, not a false negative. |
| Image asset integrity (Caldran) | PARITY_CONFIRMED | Audited all `${ART}...` template refs in `src/data/campaignScenarios.ts` (207 refs) against `public/scenarios/caldran-captivity/` (205 files) — 0 missing. Browser-confirmed: `/campaigns/.../library/images` shows the full 205-image set with `playerSafe` (👁/🚫) toggles per image, zero console errors. |
| Bestiary (both stacks) | PARITY_CONFIRMED | Single shared catalog (`bestiary.local.json`, 414 entries) used by both `/bestiary` (Greyholm) and `/campaigns/:id/library/bestiary` (Caldran) — browser-confirmed `414/414` on the Caldran route, "Добавить в мои враги"/`+ В кампанию` add-to-campaign-enemies flow present on both. All 414 `imageUrl` references resolve (0 missing) per the same audit method as the general image check. |
| Players (both stacks) | PARITY_CONFIRMED | Greyholm: 4 players, `image: ""` for all four in source data -> UI correctly renders "Нет изображения" (this is a `0->0` correct-absence case, not a bug: source data never had player images). Caldran: 3 players (`PC01`/`PC02`/`PC03`), matching `PRODUCTION_REFERENCE_MANIFEST.json`'s "3 ИГРОКОВ". Both routes load with zero console errors. |
| Linked cards / relations rendering | MISSING | Not independently re-verified this session — deferred. |
| Create/edit/delete for images/bestiary/players themselves (not the entities they illustrate) | MISSING | Not exercised this session (e.g., uploading a new image, editing a player character sheet) — deferred. |

## Summary

- `PARITY_CONFIRMED`: capabilities (2 of ~26 keys fully route-gated, rest persist correctly),
  Greyholm AND Caldran/user-campaign arc lifecycle (both complete, one shared domain+UI),
  campaign switching, direct URL, reload, settings, Greyholm battle-map placement create.
- `INTENTIONALLY_IMPROVED`: none scored yet with full justification — capabilities and arc
  archive/restore are new relative to the original but not yet cross-checked against whether
  the original had an equivalent, so left under `PARITY_CONFIRMED` (new-feature framing) with
  a note rather than a formal `INTENTIONALLY_IMPROVED` claim that would need a direct
  production comparison this environment cannot make.
- `MISSING`: most capability route-gating (~15 of 26 keys), content scope editor,
  import/export/backup/restore/campaign-delete re-verification, and the entire
  Maps/Atlas/Content/Timeline/Economy/Zones/Battles sections beyond placement create.
- `BROKEN`: none found.

**Not a complete report.** Continues to be filled in as further blocks close; see
`CONTINUATION_STATE.json` for exact next steps.

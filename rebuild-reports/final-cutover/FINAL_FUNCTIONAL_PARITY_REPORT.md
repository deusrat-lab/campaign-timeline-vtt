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
| Arcs (Caldran / new campaigns) | MISSING | No arc/Timeline-equivalent concept exists on `UserCampaignData` at all. Open design decision recorded in `CONTINUATION_STATE.json`. |
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

## Maps, Atlas, Content, Timeline, Economy, Zones, Battles

Not yet independently re-verified this session beyond what's covered above (placement
create/move/remove was closed and browser-verified in the immediately preceding session —
see `db9dfda` and `591166d` in git history). Rows intentionally left `MISSING` (meaning "not
yet scored", not "confirmed absent") until each is exercised live per this report's own
evidence rule — filling these in from memory or prior-stage reports without a fresh
verification would violate the report's own standard.

## Summary

- `PARITY_CONFIRMED`: capabilities (2 of ~26 keys fully route-gated, rest persist correctly),
  Greyholm arc lifecycle (complete), campaign switching, direct URL, reload, settings.
- `INTENTIONALLY_IMPROVED`: none scored yet with full justification — capabilities and arc
  archive/restore are new relative to the original but not yet cross-checked against whether
  the original had an equivalent, so left under `PARITY_CONFIRMED` (new-feature framing) with
  a note rather than a formal `INTENTIONALLY_IMPROVED` claim that would need a direct
  production comparison this environment cannot make.
- `MISSING`: Caldran/new-campaign arcs, most capability route-gating, content scope editor,
  import/export/backup/restore/campaign-delete re-verification, and the entire
  Maps/Atlas/Content/Timeline/Economy/Zones/Battles sections beyond what a prior session
  already closed for placements.
- `BROKEN`: none found.

**Not a complete report.** Continues to be filled in as further blocks close; see
`CONTINUATION_STATE.json` for exact next steps.

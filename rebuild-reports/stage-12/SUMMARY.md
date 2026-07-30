# Stage 12 — Controlled shared Campaign Workspace composition

## Verdict: STAGE_12_PASS

One typed workspace composition contract + module registry + React shell is
really used by BOTH legacy stacks on their normal application routes, with legacy
write behaviour, navigation, privacy and fallback all confirmed. Default-off flag;
baseline preserved when off. No diagnostics-only shell.

## Principle held

`Share workspace composition. Keep mutations legacy.`

## What was added (all in `campaign-timeline-vtt-universal-rebuild`)

Pure domain (React-free, testable in Node):
- `src/domain/workspace/workspaceTypes.ts` — `CampaignWorkspaceDescriptor`,
  audience/kind/classification types, module slot + status contracts (immutable,
  NO store/repository/snapshot).
- `src/domain/workspace/moduleRegistry.ts` — honest classification of 10 modules
  (shared-read-only / legacy-mixed / legacy-write); helpers; the
  `findWriteModulesMarkedUniversal()` integrity invariant.
- `src/domain/workspace/workspaceDescriptor.ts` — `buildCampaignWorkspaceDescriptor`
  (campaignId required, audience/kind filtering applied here) + Greyholm /
  user-campaign navigation adapters (stable ids, strict scoping, no Greyholm
  fallback).

React composition:
- `src/features/campaign-workspace/CampaignWorkspaceShell.tsx` (+ css) — the ONE
  shared shell (identity, shared nav, status region, ordered module slots).
- `src/features/campaign-workspace/GreyholmWorkspace.tsx` — Greyholm composition.
- `src/features/campaign-workspace/UserCampaignWorkspace.tsx` — UC composition.

Integration (existing routes, additive branch):
- `src/pages/EntityLibraryPage.tsx` — extracted `legacyHeader` + `legacyBody`;
  branch: flag on → `GreyholmWorkspace`, flag off → exact baseline.
- `src/features/campaigns/CampaignLibraryPage.tsx` — same pattern →
  `UserCampaignWorkspace`.

Flag + harness + reports:
- `src/config.ts` — `SHARED_CAMPAIGN_WORKSPACE_ENABLED` (default off) +
  `_SCOPES` + `isSharedWorkspaceEnabledForKind()`.
- `scripts/stage12/` (`build-domain.mjs`, `tsconfig.harness.json`,
  `runWorkspace.mjs`), `npm run verify:stage12` — **97/97 PASS**.
- `rebuild-reports/stage-12/` (this file + comparison + coverage + results).

## Safety confirmed

- Legacy remains the sole write source; universal commands never invoked from UI.
- Stage 12 flag is independent of Stage 9/10 and does not auto-enable them.
- Flag OFF ⇒ fragment-only wrapper ⇒ DOM-identical baseline (verified in browser:
  no `.cws-shell`, Stage 11 band intact).
- No production universal namespace read/write; Stage 9 shadow namespace read-only.
- Local only: no push, no deploy, no server/Railway change; network all local.
- Privacy applied in the descriptor builder (before render): DM-only slots + DM
  nav absent from a player descriptor's DOM (verified), player-safe/observer see
  only their projections; full DM snapshot never in a player view model.

## Known remaining gaps (unchanged by Stage 12)

- Universal is still NOT a write source; all mutations legacy.
- Map editor / battle editor / drag-drop remain legacy, not composed.
- Production persistence not migrated; server sync not universalised.
- Not all modules shared (map/battle/settings/import-export are legacy-only slots).
- UC universal reads still require the campaign in the in-memory session cache
  (Stage 11 limitation); until then safe legacy fallback.

## Recommendation

Stage 12 is a clean local checkpoint. The next stage (NOT started here) is
**Stage 13 — controlled universal command/write-path shadow execution**: legacy
command stays authoritative; universal command runs in isolated dry-run/shadow
mode and results are compared. Do not switch authoritative writes yet.

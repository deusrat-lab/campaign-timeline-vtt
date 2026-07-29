# Stage 01 - Legacy Baseline, Data Inventory, Functional Baseline

## Goal

Capture the restored legacy baseline without modifying the original repository, create a separate working copy, inventory the two existing campaign systems, identify real data sources, and run baseline checks before architecture changes.

## Repository Baseline

- Original path: `/Users/dmitry/Downloads/днд сюжет/campaign-timeline-vtt`
- Working copy path: `/Users/dmitry/Downloads/днд сюжет/campaign-timeline-vtt-universal-rebuild`
- Original branch: `master`
- Original HEAD: `a7b420845dfafc8e368f2ec0a2a89cb3173fd005`
- Original status before: `## master...origin/master`
- Working copy created with local `git clone ./campaign-timeline-vtt campaign-timeline-vtt-universal-rebuild`
- Original tracked-file checksum manifest: `rebuild-evidence/original-tracked-files-before.sha256` with 1186 tracked files

## Actual Findings

- The app has two independent campaign systems:
  - Main/Greyholm: `CampaignStoreProvider`, `CampaignDataProvider`, `MapWorkspacePage`, seed data from `src/data/*` and `/data/dm-companion/*`, persisted as a single overlay.
  - User campaigns: `UserCampaignProvider`, `/campaigns/*` routes, `IsolatedCampaignMapWorkspace`, campaign-scoped localStorage keys, separate server rows under `uc:<campaignId>`.
- Main persistence is not campaign-scoped: local key `campaign-timeline-vtt:overlay:v2`, old key `campaign-timeline-vtt:state:v1`, server row `default`.
- User campaign persistence is campaign-scoped locally but structurally separate from main campaign: `dmCompanion.userCampaigns.registry.v1`, `dmCompanion.userCampaignData.${id}.v1`, `dmCompanion.userCampaignRuntime.${id}.v1`.
- Server sync has no revision/etag/optimistic concurrency; writes are last-write-wins upserts.
- `src/data/campaignOverlaySnapshot.json` is currently an empty object (`{}`); real Greyholm content comes from repository seed sources and external DM Companion JSON.
- External real-data sources exist next to this project: `../dm-companion/public/data/*.json` and `../battle-map-vtt/public/db-export.json`.

## Commands

- `npm ci` - passed with EBADENGINE warnings because current Node is `v23.11.0`.
- `npm run typecheck` - passed, but this script only runs `tsc --noEmit` against the solution `tsconfig.json` and appears too weak to validate `tsconfig.app.json`.
- `npm run build` - blocked/hung in the `tsc -b` phase and was interrupted.
- `npx tsc -b --verbose` - hung while building `tsconfig.app.json`.
- `npx tsc -p tsconfig.app.json --noEmit --extendedDiagnostics` - hung before diagnostics and was interrupted.
- `npx vite build` - passed in about 15 seconds.
- `node scripts/audit-campaign-data.mjs` - passed.

## Test Results

- Package install: PASS_WITH_WARNINGS
- Script typecheck: PASS_WITH_WARNING_FALSE_CONFIDENCE
- Real app TypeScript project check: FAIL_HANG
- Full package build: FAIL_HANG
- Vite build only: PASS
- Campaign data audit: PASS

## Parity Results

Stage 1 did not implement migration parity yet. Baseline data counts and source hashes are captured in `DATASET_INVENTORY.json`; adapter and migration parity begin in later stages.

## Warnings

- Stage 1 cannot be marked PASS under the supplied criteria because `npm run build` does not complete in the restored baseline.
- The likely root is TypeScript analysis of the current app project, with `src/pages/MapWorkspacePage.tsx` at 13,443 lines as the largest risk area.
- No browser screenshots were captured in Stage 1 because the strict baseline build/typecheck blocker was prioritized first. Visual regression must be performed after the project-level TypeScript blocker is resolved or explicitly isolated.
- Current server API publicly reads raw overlays and campaign blobs; the UI performs player-safe filtering client-side.

## Commit

Pending at artifact creation time.

## Next Stage

Resolve or isolate the TypeScript project-check blocker, then proceed to Stage 2 coverage matrix and target universal architecture.

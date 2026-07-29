# Stage 03 - Universal Domain Layer

## Goal

Implement a React-independent universal campaign domain foundation with first-class campaign ids, durable/runtime separation, capabilities, explicit entity discriminants, visibility, battle contracts, validation, and deterministic serialization.

## Implementation

Added `src/domain/*`:

- `campaign/ids.ts` - branded ids, schema version, revision helpers, source-scoped id helper.
- `campaign/capabilities.ts` - complete universal capability key set and defaults.
- `campaign/source.ts` - source metadata and migration field classification.
- `campaign/snapshot.ts` - canonical `CampaignSnapshot`, durable/runtime/visibility sections, snapshot constructor with cloning.
- `maps/types.ts` - map definitions, coordinate spaces, layers, hotspots, placements, routes.
- `entities/types.ts` - universal entity discriminated union for locations, NPCs, players, enemies, quests, factions, images, services, shops, taverns, and custom content.
- `visibility/types.ts` - DM/player/observer/presentation visibility state.
- `battles/types.ts` - durable battle map/entry definitions and runtime battle boards/tokens/initiative.
- `runtime/types.ts` - campaign runtime state.
- `persistence/serialization.ts` - deterministic stable JSON serialization.
- `validation/validateCampaignSnapshot.ts` - initial snapshot validation for campaign scope, duplicate ids, coordinate sanity, map refs, entity refs, battle refs, and runtime campaign isolation.
- `index.ts` - public domain barrel.

Added `scripts/verify-universal-domain.mjs` and `npm run verify:domain` to assert:

- required domain files exist;
- required core terms are present;
- no `any` token exists in universal domain files;
- no React imports exist in universal domain files.

## Files Changed

- `package.json`
- `scripts/verify-universal-domain.mjs`
- `src/domain/**`
- `rebuild-reports/stage-03/**`

## Commands

- `npm run verify:domain`
- `npm run build`
- `node scripts/audit-campaign-data.mjs`

## Test Results

- Domain verifier: PASS
- Build: PASS
- Data audit: PASS

## Parity Results

No source adapters are implemented in Stage 3, so real-data parity is not yet asserted. Stage 4 will map MC/UC/DM Companion/Battle Map VTT sources into this domain and classify every mapped/preserved/unsupported/invalid/ambiguous/dropped field.

## Warnings

- Validation is intentionally structural and foundational. Stage 4-6 must add source-specific adapter validation, automatic field coverage, repository round-trip, and corruption/revision tests.
- `MapWorkspacePage.tsx` still has the temporary Stage 1 `// @ts-nocheck` shield.

## Commit

Pending at artifact creation time.

## Next Stage

Implement lossless legacy adapters and parity verification harnesses for main campaign, user campaigns, DM Companion, and battle-board/battle-map sources.

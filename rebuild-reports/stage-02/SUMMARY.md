# Stage 02 - Universal Coverage Matrix and Target Architecture

## Goal

Define the universal campaign contract before implementation so Greyholm, Kaldran, user campaigns, one-shots, and future campaigns can use one domain, repository, store, workspace, projection, persistence, import/export, and sync model without data loss.

## Actual Findings

- Main/Greyholm has the richest map/workspace/time/travel/event functionality but lacks first-class campaign scope.
- User campaigns have first-class `campaignId`, isolated localStorage/runtime, custom battle boards, and import/export, but a smaller workspace and smaller data model.
- Server persistence supports main and user blobs separately but lacks revision, conflict handling, schema validation, and canonical snapshots.
- The universal target must take MC richness plus UC isolation, not choose one side.

## Implementation

No production code was changed in this stage. The stage defines the target contracts and coverage required for Stage 3-10 implementation:

- `CAPABILITY_MATRIX.json`
- `ENTITY_MATRIX.json`
- `REFERENCE_POLICY.md`
- `VISIBILITY_POLICY.md`
- `BATTLE_CONTRACT.md`
- `TARGET_ARCHITECTURE.md`
- `RESULTS.json`

## Commands

- `npm run typecheck`
- `npm run build`
- `git status --short`
- `git diff --stat`

## Test Results

Pending final checkpoint at commit time. Stage 2 does not add runtime code; project checks still matter because report artifacts and the Stage 1 legacy shield remain in the tree.

## Parity Results

No adapter parity is implemented in Stage 2. Required real-data and synthetic parity tests are specified in the matrices for Stage 4 onward.

## Warnings

- `src/pages/MapWorkspacePage.tsx` still has a temporary `// @ts-nocheck` shield from Stage 1. Stage 8/10 must remove it by replacing the giant legacy workspace with typed universal modules.
- Browser screenshots are still pending and must be captured before visual cutover.

## Commit

Pending at artifact creation time.

## Next Stage

Implement the React-independent universal domain, validation, serialization, capabilities, IDs, and snapshot types.

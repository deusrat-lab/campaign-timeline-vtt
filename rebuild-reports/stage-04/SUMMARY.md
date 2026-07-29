# Stage 04 - Lossless Legacy Adapters and Parity Verification

## Goal

Complete pure legacy adapters and a Node-only parity harness for Main/Greyholm, user campaigns, DM Companion, Battle Map VTT, battle boards, runtime, visibility/reveals, field coverage, source immutability, determinism, and negative fixtures.

## Inputs

- 90 total inputs/candidates inventoried.
- 82 real data inputs/candidates.
- 7 repository fixtures.
- 1 synthetic rich fixture for missing live browser localStorage/user-campaign runtime exports.

Primary real/repository sources:

- `src/data/*.json`
- `public/battle-maps/*.json`
- `public/data/battle-map-vtt/manifest.json`
- `../dm-companion/public/data/*.json`
- `../battle-map-vtt/public/db-export.json`

## Adapters Implemented

- `MainCampaignAdapter`
- `UserCampaignAdapter`
- `DMCompanionAdapter`
- `BattleMapVttAdapter`
- Battle-board/runtime mapping through user campaign and Battle Map VTT adapters
- Visibility/reveal handling in adapter contracts and parity fixtures

Adapters are pure TypeScript domain code:

- no React imports;
- no production store imports;
- no `localStorage`;
- no server API calls;
- no `any` usage in universal domain verification scope.

## Real-Data Results

Collection reconciliation summary:

- campaigns: 2 mapped / 0 dropped
- maps: 5 mapped / 0 dropped
- locations: 74 mapped / 0 dropped
- npcs: 141 mapped / 0 dropped
- players: 5 mapped / 0 dropped
- quests: 52 mapped / 0 dropped
- enemies: 128 mapped / 0 dropped
- images: 294 mapped / 0 dropped
- battleMaps: 202 mapped / 0 dropped
- battleBoards: 1 mapped / 0 dropped
- battleTokens: 38 mapped / 0 dropped
- reveals: 3 mapped / 0 dropped
- movableEntities: 0 real repository overlay records; covered by adapter support and synthetic/negative policy

Full details are in `COLLECTION_RECONCILIATION.json`.

## Synthetic Coverage

Synthetic rich fixture covers:

- user campaign durable data;
- party/player entity discriminant;
- reveals;
- presented cards;
- custom battle map;
- per-map battle board;
- tokens;
- round/current turn;
- grid and terrain;
- route and placement coordinates;
- unknown optional content preservation.

Negative fixtures cover ambiguous/missing/malformed reveal, cross-campaign reveal, duplicate map/entity ids, missing mapRef, invalid coordinates, unsupported target type, broken battle participant reference, unknown optional content, disabled module retained content, and corrupted nested object.

## Known Normalized Differences

- Greyholm `DmLocation` source records are retained in extensions while universal location cards are projected from timeline-scoped `LocationState`.
- Repository `campaignOverlaySnapshot.json` is currently `{}`, so Greyholm overlay collections such as events/triggers/movable entities/battle entries are zero-count real repository fixtures.
- Battle map duplicate ids are reported because manifest and Battle Map VTT export overlap by design; they are not auto-resolved by semantic first-match.

## Resolved Gaps

- Player is first-class in universal entity mapping.
- UC battle boards preserve mapRef, tokens, terrain, grid, round, current turn, and initiative.
- Battle Map VTT maps/scenes/tokens are represented in one battle contract.
- Unknown valid content is preserved in `extensions`.
- Source immutability and deterministic canonical hashes are checked.
- Ambiguity policy rejects 2+ semantic matches rather than using first match.

## Remaining Blockers

- No live browser localStorage exports were present for current runtime overlays; synthetic fixtures cover those mechanics for Stage 4.
- Full visual/browser parity remains later-stage work.
- Temporary Stage 1 `// @ts-nocheck` shield remains on legacy `MapWorkspacePage.tsx` until the universal workspace replacement.

## Commands

- `npm run verify:domain`
- `npm run typecheck`
- `npm run build`
- `node scripts/audit-campaign-data.mjs`
- `npm run verify:stage04`

## Verdict

PASS_WITH_WARNINGS

## Commit

Pending at artifact creation time.

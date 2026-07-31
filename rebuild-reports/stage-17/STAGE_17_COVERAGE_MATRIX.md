# Stage 17 Coverage Matrix — Battles, Import/Export, Backup/Restore, Sync, Cutover

Starting HEAD: `d497809` · Repository: `campaign-timeline-vtt-universal-rebuild` · branch master · local-only.

This matrix is grounded in the **actual source** read during the Stage 17 audit, not assumptions.
Three campaign scopes are tracked separately: **Greyholm** (main), **Caldran** (a real User
Campaign one-shot), and **other User Campaigns**.

---

## A. Existing universal foundations (reusable, already committed ≤ d497809)

| Foundation | File | Status | Stage 17 use |
|---|---|---|---|
| Universal battle contract | `src/domain/battles/types.ts` | **Defined but DORMANT** — imported by nobody | Complete + wire adapters/commands |
| Migration engine | `src/domain/migration/migrationEngine.ts` | Working: dry-run / commit / rollback / read-back / expected-revision | Migration rehearsal (§23) |
| Stable serialization | `src/domain/persistence/serialization.ts` | Working: `stableStringify`, snapshot serialize/parse | Export/backup canonical bytes + hash |
| Versioned repository + `CampaignBackup` | `src/domain/repository/*` | Working (Stage 6, 15 gates green) | Import/restore atomic commit, rollback checkpoint |
| Complex authority router | `src/domain/complex-authority/*` | Working (Stage 16, 397/397) | Pattern for battle command authority + recovery + reconciliation |
| Durable authority router | `src/domain/durable-authority/*` | Working (Stage 15, 268/268) | Pattern for expected-revision + pending recovery |
| Projections (playerSafe/observer/DM) | `src/domain/projection/*`, `src/data/playerSafeProjection.ts` | Working | Battle + export privacy |
| User campaign sync | `src/state/userCampaignSync.ts` | Working; **no-ops when `API_BASE_URL` empty** | Audit + universal sync adapter (§20) |

**No-production guarantee (audited):** `userCampaignSync.ts` and the overlay sync both gate every
`fetch` on `API_BASE_URL` (from `src/config.ts`). With an empty base (local/dev/test) **zero network
requests are issued.** Stage 17 sync verification runs against a local/mock transport only.

---

## B. Battle models (the three real shapes)

| Aspect | Greyholm (main) | Caldran / User Campaign | Universal contract (`battles/types.ts`) |
|---|---|---|---|
| Planning/definition | `BattleEntry` (`src/types.ts:723`), stored `overlay.battleEntriesById` | route battle maps + `CampaignCustomBattleMap` | `BattleEntryDefinition`, `BattleMapDefinition` |
| Active runtime | `ActiveBattleState` + `ActiveBattleCombatant[]` (`src/types.ts:823`), `overlay.activeBattle` (single) | `CampaignBattleBoard` per map in `runtime.battleBoards[mapId]` (`userCampaign.ts:219`) | `BattleRuntime` + `BattleBoard` + `BattleToken[]` |
| Token identity | combatant `id`, `sourceId`, `side` (enemy/player/…) | token `id`, `sourceEnemyId`/`sourcePlayerId`, `side` | `BattleToken.id`, `sourceEntityRef`, `side` |
| Position | `x,y` + optional `row,column` grid | `x,y` as **% of image** | `UniversalPoint` (+ grid def) |
| Initiative/turn | `round`, `currentTurnCombatantId` | `round`, `currentTurnTokenId` | `InitiativeState{round,currentTurnTokenId}` |
| Terrain | `terrainCells[]` `{row,column,type}` | `terrain: Record<"row,col", type>` | `TerrainDefinition[]` |
| Presented-to-players | embedded window persisted for DM/player tabs | `runtime.presentedBattle:{mapId}` | `presentedToPlayers` |
| Multiplicity | **one** active battle at a time | **many** boards, one per map | `BattleRuntime` per battle |

Key comment (`src/types.ts:723-732`): Greyholm's `BattleEntry` is **launch/planning context only**
(no grid/tokens); the interactive grid historically lived in the separate battle-map-vtt project,
but `ActiveBattleState` is the in-app embedded runtime with real tokens. Universal model must
round-trip **both** Greyholm `ActiveBattleState` and Caldran `CampaignBattleBoard` losslessly.

---

## C. System-by-system ownership matrix

Legend — Owner: L=legacy, U=universal, C=compatibility-only, D=deferred.

| System | Campaign | Legacy model | Universal model | Current owner | Target S17 owner | Notes / risk |
|---|---|---|---|---|---|---|
| Battle definition | Greyholm | `BattleEntry` | `BattleEntryDefinition` | L | U (adapter proven) | round-trip via adapter |
| Battle runtime | Greyholm | `ActiveBattleState` | `BattleRuntime` | L | U | single active battle; recovery needed |
| Battle board | Caldran/UC | `CampaignBattleBoard` | `BattleBoard` | L | U | 4 boards / 16 tokens anchor |
| Battle token move/remove | both | combatant / token arrays | `BattleToken` cmds | L (S16 does UC placement move/remove only) | U | typed commands + expected rev |
| Initiative / turn / round | both | inline runtime fields | `InitiativeState` cmds | L | U | deterministic ordering invariant |
| Import (Greyholm) | Greyholm | DM Companion import | universal import pipeline | L | U | **must forbid hidden Greyholm fallback** |
| Import (UC) | UC | UC import | universal import pipeline | L | U | target campaignId required |
| Export | both | ad-hoc | canonical universal export | L/none | U | deterministic + hash |
| Backup/restore | both | `CampaignBackup` (repo) | extend | partial | U | rollback checkpoint |
| Sync | UC | `userCampaignSync` | universal sync contract | L | C (local adapter) | no production activation |
| Sync | Greyholm | overlay sync | universal sync contract | L | C/D | structurally special today |
| Migration | both | `migrationEngine` | rehearsal harness | tooling | U (rehearsal only) | source untouched |
| Reveal / presented cards | Greyholm | overlay | S16 complex authority | **U (Stage 16)** | U | preserve |
| Placement move/remove | UC | runtime | S16 complex authority | **U (Stage 16)** | U | preserve |
| Placement create | UC | store-gen id | — | **L (honest, S16 deferred)** | D | store-generated id; deterministic id coordination not done |
| Party location / route progress | Greyholm | overlay | — | **L (honest, S16 deferred)** | D | multi-region runtime |
| Scalar/text fields (10 scopes) | both | overlay/runtime | S15 durable authority | **U (Stage 15)** | U | preserve |

---

## D. Stage 17 scope decision (each family gets exactly one owner)

- **Battle definitions + runtime** → target **universal-owned**, proven via adapters + commands +
  Node harness (round-trip, identity, invariants, isolation, privacy). Real-browser UI wiring is
  the higher-risk part and is tracked as a remaining gap where not completed.
- **Import / export / backup / restore** → target **universal-owned**, proven via round-trip +
  validation + rollback harness against real Greyholm/Caldran fixtures.
- **Sync** → **universal contract + local reference transport**, compatibility-only. Production
  activation is **explicitly out of Stage 17** (not a warning — a scope boundary).
- **Migration** → **rehearsal only**, source untouched, no production apply.
- **Cutover** → default-off flags; when ON, universal repo/store is primary local source of truth
  for cutover-owned families; legacy becomes compatibility view. Honestly-deferred families
  (placement create, party/route) remain legacy-owned and are NOT claimed as cutover-owned.

---

## E. Real anchors to preserve (from prior evidence + this audit)

**Greyholm:** 210 NPC · 128 enemies · 4 world maps · 140 location states · 69 hotspots · 88 routes ·
139 battle maps · 420 images · 38 visited · 2 movable · 1 event · 2 faction zones. Battle runtime is
**single** `activeBattle`. (Battle-map *count* 139 is the map catalog, not active battles.)

**Caldran canonical fixture:** 66 NPC · 78 enemies · 205 images · 17 locations · 26 quests ·
3 players · 12 factions · 17 placements · 1 route · **4 battle boards · 16 battle tokens** · 8 reveals.

**Caldran current instantiated template** (differs — do not conflate): 66 NPC · 76 enemies · 22 quests ·
0 routes · 17 placements · 4 battle boards · 16 battle tokens.

---

## F. Forbidden operations checklist (must remain true at final checkpoint)

`git push` · Railway/prod deploy · production migration · production API/DB/localStorage mutation ·
remote campaign overwrite · hidden Greyholm import fallback · active-campaign fallback · guessed IDs ·
first-match identity · ambiguous dual ownership · duplicate sync · legacy source deletion after migration.

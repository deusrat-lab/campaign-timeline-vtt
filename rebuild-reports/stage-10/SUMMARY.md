# Stage 10 — controlled local universal read-path integration

Verdict: **STAGE_10_PASS**

Legacy stores remain authoritative for **all** writes. Stage 10 adds a guarded,
default-off, read-only gateway that lets a small allowlist of pilot UI consumers
read the validated Stage 9 shadow snapshot — only when it is fresh, valid and
campaign-matched — otherwise every consumer deterministically falls back to the
legacy read path. No write path, universal command, production namespace, server
sync, or migration is touched.

## Flags (independent, default OFF)

- `VITE_UNIVERSAL_READ_PATH` — enables the read path.
- `VITE_UNIVERSAL_READ_PATH_SCOPES` — optional narrowing to KNOWN pilot scopes
  (empty/`*`/`all` = all pilots; unknown tokens ignored, never widening).
- Independent from `VITE_UNIVERSAL_SHADOW_INTEGRATION` (Stage 9). All four
  combinations are defined and browser-verified (see table).

## Architecture

- **Universal Read Gateway** (`src/domain/readpath/`): pure `decideReadSource`
  (freshness policy), pilot scope registry (`pilotScopes.ts`), normalized
  read-only view models (`readPathViewModels.ts`). No I/O, exhaustively tested.
- **React binding** (`src/features/read-path/`): `ReadPathProvider` exposes a
  READ-ONLY shadow-repository handle (only `readCampaign`) and the resolved
  allowlist; it never constructs a coordinator. `useUniversalRead` folds the
  live Stage 9 status + the read-back snapshot through the gateway and returns
  the snapshot only on a `universal` decision. `PilotCard` renders the same view
  model from either the universal snapshot or the live legacy snapshot.
- **Pilots** mount ONLY on the DM-only, flag-gated `/diagnostics/read-path`.

## Freshness policy (deterministic, never a bare timeout)

Universal is served only when: flag on + scope allowlisted + concrete campaign +
snapshot campaign matches + supported schema + Stage 9 `success` + no
pending/running newer state + reload comparison equal (or revision-only). Every
other state maps to a specific fallback: `disabled`, `waiting_for_shadow`,
`stale_fallback`, `validation_fallback`, `repository_failed`, `mismatch_fallback`,
`wrong_campaign`, `unavailable`, `projection_failed`.

## Browser verification (local dev, no deploy)

- **Live transition observed**: Greyholm `waiting_for_shadow`/`stale_fallback`
  (legacy, pending:yes during the hydration burst) → shadow `success` →
  `selectedSource=universal` (shadow rev shown). Root cause of the transient
  "rebuilding": initial hydration changes the merged CampaignData identity a few
  times (async base load → overlay hydrate → save-status), each re-submitting;
  the real snapshot is ~3.3 MB (420 base64 images) so each run takes a couple of
  seconds. It converges (revision stabilises) and flips to universal. Safe legacy
  fallback throughout — never a stuck loop.
- **Mutation cycle**: a real legacy mutation ("refresh from template" on a user
  campaign; overlay changes on Greyholm) drops the pilot to `stale_fallback`
  (legacy) while the shadow rebuilds, then returns to `universal` with updated
  data. `universal → pending legacy fallback → updated universal` confirmed.
- **User campaign (Caldran ×2 injected)**: a campaign only gets a universal read
  once its data is loaded into the shared in-memory cache in the current session
  (a Stage 9 property — pure direct-URL view leaves it uncached → legacy). After
  loading campaign A, its pilot read `universal` with real Caldran data (407
  entities, 66 NPC, 78 enemies), campaignId `camp:user:camp-caldran-a`; campaign
  B stayed uncached and never appeared — two-campaign isolation confirmed.
- **Player-Safe / Observer**: pilots show the filtered projections (603 vs DM
  979); no DM secret leaks (harness priv-45/46/49). The real `/observer` route
  renders the legacy player workspace with **0** pilot cards — universal read
  never reaches player routes; no full DM snapshot in player props.

### Flag-combination table

| Flow                    | Shadow flag | Read flag | Shadow state       | Selected source        | Projection | Legacy write path | Result |
| ----------------------- | ----------- | --------- | ------------------ | ---------------------- | ---------- | ----------------- | ------ |
| Greyholm initial load   | on          | on        | building           | legacy (waiting/stale) | dm         | unchanged         | PASS   |
| Greyholm fresh shadow    | on          | on        | success (rev N)    | universal              | dm         | unchanged         | PASS   |
| Greyholm pending mutation| on          | on        | pending            | legacy (stale)         | dm         | unchanged         | PASS   |
| Caldran A loaded         | on          | on        | success            | universal              | dm         | unchanged         | PASS   |
| Caldran B uncached       | on          | on        | none               | (not enumerated)       | —          | unchanged         | PASS   |
| Player-Safe pilot        | on          | on        | success            | universal (603)        | playerSafe | unchanged         | PASS   |
| Observer pilot           | on          | on        | success            | universal (603)        | observer   | unchanged         | PASS   |
| `/observer` real route   | on          | on        | n/a                | legacy (0 pilots)      | playerSafe | unchanged         | PASS   |
| shadow off + read on     | off         | on        | none (0 keys)      | legacy (waiting)       | all        | unchanged         | PASS   |
| shadow on + read off     | on          | off       | writes (rev N)     | legacy (route redirect)| —          | unchanged         | PASS   |
| both off                 | off         | off       | none (0 keys)      | legacy (route redirect)| —          | unchanged         | PASS   |

## Greyholm 984 vs 979 — resolved (data-version delta, not a loss)

The Stage 8d **984** count comes from a frozen June-2026 real-server-export
fixture; the current live baked+overlay dataset yields **979**. The difference is
exactly 5 entities, all present in the fixture but absent from the current live
data (live ⊂ fixture; zero only-in-live). All 8 non-location entity kinds are
byte-identical between sources. The adapter drops nothing (droppedCollections
empty, reload comparison equal → gateway `universal`).

The exact 5:

1. `entity:locationState:lib-shop-shop-mirra-olden__arc-1-peace` (location)
2. `entity:locationState:lib-tavern-tavern-severny-ochag__arc-1-peace` (location)
3. `entity:locationState:lib-tavern-tavern-sinyaya-forel__arc-1-peace` (location)
4. `entity:locationState:lib-tavern-tavern-zolotoy-kolokol__arc-1-peace` (location)
5. `entity:enemy:enemy-custom-1782714489605` (enemy)

## Harness & regression

- Stage 10 harness: **74/74 PASS** (`npm run verify:stage10`).
- typecheck PASS, build PASS.
- Stage 9 44/44, Stage 8 66/66 + 18/18, Stage 8d 46/46, Stage 4–7 PASS.
- Greyholm anchors 210 NPC / 139 battle maps, Caldran 66 NPC / reveals 8/8 — unchanged.

## Remaining gaps

- Universal is still NOT a write source; universal commands do not drive the UI.
- Not the full Campaign Workspace — pilots are on a dedicated DM-only page.
- Production persistence not migrated; server sync not universalised; battle
  editors remain legacy.
- User-campaign universal read requires the campaign loaded into the in-memory
  cache in the current session (Stage 9 hydration property); pure direct-URL view
  falls back to legacy (safe).

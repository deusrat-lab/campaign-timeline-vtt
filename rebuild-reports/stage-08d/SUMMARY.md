# Stage 8d — Greyholm live overlay and runtime parity completion

**Overall Stage 8 verdict: `STAGE_8_PASS`** (real Greyholm overlay obtained and
proven — see caveat below on session-runtime collections).
**Stage 8d result: real-data pipeline PASS — 46/46 checks, all seven invariants
clean.**

The real Greyholm live overlay was fetched **read-only** from the production
backend (`GET /api/overlay`, public, no token) at
`https://campaign-timeline-vtt-production.up.railway.app`, saved immutably as
`scripts/stage08/fixtures/greyholm-real-server-export.json`
(283,813 bytes, sha256 `642d54a2…c6b8`), and run through the full pipeline using
the app's **own** loader + merge:

```
loadCampaignData() (real seed)  +  useCampaignData() overlay merge (verbatim)
  -> merged effective CampaignData
  -> adaptMainCampaignToUniversal({ data: merged, overlay: raw })
  -> validate -> shadow save -> reload -> DM/Player/Observer projections -> parity
```

**Invariants on real data:** `sourceMutation:0`, `droppedCollections:[]`,
`lossSensitiveUnresolvedReferences:0`, `ambiguousReferences:0`,
`roundTripMismatches:0`, `privacyLeaks:0`, `campaignIsolationFailures:0`.

**Real merged counts (source == adapted, 1:1, nothing dropped):** 984 entities,
4 worldMaps, **140 locationStates**, **69 hotspots**, **88 routes**, 139 battle
maps, 420 images, 210 npcs, 128 enemies, 22 factions.

**Real non-zero runtime proven:** party location (`currentLocationRef`, +38
visited), **movableEntities 2**, **campaignEvents 1**, **factionZones 2**.

**Caveat (honest — not counted as proven):** in this live snapshot the DM is not
mid-session, so `reveal`, `partyRouteProgress`, `activeBattle`, `tokens`,
`initiative`, `round`, `currentTurn`, `presentedCard`, `delayedTriggers`,
`dynamicOverlays`, `battleEntries` are **empty in the real source**. These are NOT
claimed as real-data-proven (no `0→0` support claim); they remain proven only at
the **contract** level (the 40/40 synthetic fixture below, which exercises active
battle with tokens/initiative/round/turn, reveal, and presented card). Re-running
this harness against a future overlay captured mid-combat would upgrade them to
real-data-proven with no code change.

Reproduce:

```bash
node scripts/stage08/build-domain.mjs
node scripts/stage08/runGreyholmOverlay.mjs   # writes rebuild-reports/stage-08d/RESULTS.json
```

The real overlay is ingested automatically because the fixture is present; the
merged effective `CampaignData` is rebuilt in Node by `greyholmRealData.mjs`
(app's `loadCampaignData` with a local-file `fetch` polyfill + the verbatim
`useCampaignData` merge).

## 1. Why the Stage 8 verdict was overstated

Stage 8 proved parity for the real Caldran export (full durable + runtime) and
for the real Greyholm **durable** dataset (`public/data/dm-companion/*` + battle
catalog). It fed the Greyholm adapter an **empty** overlay, so no MC runtime
collection (party/reveal/events/triggers/movable/battle runtime) was exercised on
real data. The overall verdict is therefore corrected to
`STAGE_8_PASS_WITH_WARNINGS` (see `rebuild-reports/stage-08/SUMMARY.md`).

## 1a. Deep Git audit (this session)

Both clones were shallow blobless partial clones. The legacy clone
(`campaign-timeline-vtt`) was unshallowed read-only from
`github.com/deusrat-lab/campaign-timeline-vtt.git` (token used inline for a
one-off fetch, never written to git config; `FETCH_HEAD` scrubbed; working tree,
`HEAD`=`a7b4208` and `master` unchanged).

- **93 commits** fetched; refs: `master` / `origin/master` only; **no tags**;
  one dangling commit `62cd4ca`.
- `src/data/campaignOverlaySnapshot.json` is blob `0967ef4` = **`{}` (3 bytes) in
  every one of the 93 commits** (and in the dangling commit) — verified at the
  blob level, not just by filename.
- Content search across all history for runtime markers
  (`revealedLocationStateIds`, `movableEntitiesById`, `activeBattle`,
  `battleEntriesById`, `partyRouteProgress`, `currentTurnCombatantId`) finds them
  **only in source/type files** (`overlay.ts`, `visibility.ts`,
  `playerSafeProjection.ts`, `layerPresets.ts`) — never in a committed data export.

**Conclusion:** the real MC live overlay/runtime was never committed to Git in any
commit, branch, ref, or dangling object. The durable Greyholm dataset *is* in Git
(dm-companion JSON + baked TS) and was already used by Stage 8.

## 1b. Server audit (read-only, no writes)

- **Persistence:** SQLite (`better-sqlite3`), table `campaigns`, main Greyholm row
  id **`default`**, column **`overlay_json`** (TEXT). `DB_PATH=./data/campaign.db`
  on a Railway persistent volume (no local copy exists).
- **Read endpoint:** `GET /api/overlay` is **PUBLIC** (no token — reads are
  unauthenticated by design, `server/src/index.js:47`) → `{ overlay: <object|null> }`.
  Writes (`PUT /api/overlay`) require the DM token and are **not** used here.
- **Client base URL:** `VITE_API_BASE_URL` (build-time). Blank in `.env.example`;
  the locally-built `dist` has no baked URL; no CI/workflow, docs, or git history
  records the deployed Railway host.
- **Resolved:** the backend origin was supplied
  (`campaign-timeline-vtt-production.up.railway.app`) and the overlay fetched
  read-only via `curl "https://…/api/overlay"` — a public GET that performs no
  write. Railway CLI was not needed and no Railway write command was run. (The
  earlier blocked state held only until the host URL was known.)

## 1c. Ready-to-run real ingestion

`runGreyholmOverlay.mjs` now ingests a real overlay when
`scripts/stage08/fixtures/greyholm-real-server-export.json` is present, using the
exact diagnostics contract
(`adaptMainCampaignToUniversal({ data: merged CampaignData, overlay: raw overlay })`,
`src/pages/UniversalDiagnosticsPage.tsx:22-25`). It runs the full
adapt→validate→shadow→reload→project→parity pipeline, reports real non-zero
counts for every runtime collection, checks the seven invariants
(`sourceMutation/droppedCollections/lossSensitiveUnresolvedReferences/`
`ambiguousReferences/roundTripMismatches/privacyLeaks/campaignIsolationFailures`),
and upgrades the verdict to `STAGE_8_PASS` only when all are clean. Smoke-tested
(the path correctly surfaces which refs still need the merged-seed export).

## 2. Real-data source search (read-only, nothing modified)

| Source | SHA-256 (16) | Classification |
| --- | --- | --- |
| `src/data/campaignOverlaySnapshot.json` | `ca3d163bab055381` | **`{}` empty** — and empty in every git revision of both clones |
| `~/Downloads/greyholm_region_routes_graph.json` | `0d7ea6c4dd6def29` | `{canvas,nodes,routes,adjacency}` design graph — NOT `MainCampaignOverlayInput`; no party/reveal/battle runtime |
| `dm-companion/seed-import/campaign-2026-06-25.zip` | `aa1ead05202b1f0c` | DM Companion export; contains `combat-state.json` (real battle runtime) but `adaptDmCompanionToUniversal` is **durable-only** — no adapter consumes it |
| `server/src/db.js` | `be0abeb195c73bd2` | Overlay store code: key = SQLite `./data/campaign.db` |
| `./data/campaign.db` | — | **absent** locally |

Also confirmed: the browser store key is `campaign-timeline-vtt:overlay:v2`
(`src/state/campaignStore.tsx:41`); the app "Export" is `JSON.stringify(store.exportOverlay())`
(a pure read). No `campaign-timeline-vtt-export*.json` exists anywhere under
`~/Downloads`. **Conclusion: the real MC live overlay exists only in the DM's
browser localStorage / the production server DB, neither read-only-accessible here.**

## 3. Contract coverage (synthetic fixture — NOT real-data parity)

`scripts/stage08/greyholmOverlayFixture.mjs` is a clearly-labeled synthetic MC
data+overlay input that populates **every** runtime collection with non-zero
values. Running it through
`adapt → validate → shadow save → reload → projections → parity` proves the
adapter maps all runtime fields losslessly. Non-zero coverage achieved:

| party.position | routeProgress | reveal | movable | events | triggers | factionZones | dynamicOverlays | battleEntries | activeBattle | tokens | initiative | round | currentTurn | terrain | presentedCard |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| ✅ | ✅ | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 3 | ✅ | 2 | ✅ | 2 | 1 |

Verified on the fixture: 0 validation errors, reveal + presentedCard +
battleEntry.battleMapRef + active-battle token refs all resolve to exactly one
target, round-trip lossless (byte-stable modulo revision bump), deterministic
serialization, source object not mutated, namespace isolation (production repo
cannot read the stage-08d shadow), and privacy — PlayerSafe/Observer leak no
hidden DM notes, no hidden battle-entry `dmNotes`, no hidden image src, no hidden
location secret, and carry no `dmNotes` field. No MC runtime-mapping bug found.

## 4. Adapter/validation changes

None required. The MC runtime/overlay mapping was already lossless for the
contract fixture; no real data was available that the adapter failed on, so no
fix was made (per Stage 8d rule 4, fixes are only for reproduced real failures).

## 5. Undoved real-runtime capabilities (16)

worldMaps/worldMapStates, locationStates, hotspots, placements, party position +
current route state, timeline/calendar/current campaign time, reveal, movable
entities, campaign events, delayed triggers, faction zones, dynamic overlays,
observer focus, presented card, active battle runtime, tokens/initiative/round/
current turn — none proven on **real** non-zero MC data. `0 → 0` is not counted
as support anywhere in this stage.

## 6. Read-only acquisition runbook (no data modification)

Pick one (full detail + exact commands in `RESULTS.json → serverAccessRunbook`):

- **A — HTTP (needs the backend Railway origin):** find the server service's public
  domain in the Railway dashboard, then
  `curl -s "https://<backend-origin>/api/overlay" > greyholm-real-server-export.json`.
  `GET /api/overlay` is public and performs no write.
- **B — SQLite (needs volume/CLI access):**
  `sqlite3 -readonly ./data/campaign.db "SELECT overlay_json FROM campaigns WHERE id='default';"`
  (or copy the DB first and query the copy — never write the original).
- **C — DM browser (pure read):**
  `copy(localStorage.getItem('campaign-timeline-vtt:overlay:v2'))` in DevTools, or
  the in-app NavBar Export (serializes `store.exportOverlay()`, writes nothing).

Then place the file (immutable) at
`scripts/stage08/fixtures/greyholm-real-server-export.json` (`{ overlay: {...} }`
or a raw overlay `{}` both accepted). For full seed-geometry / locationState
reference resolution, also export the app's merged effective `CampaignData`
(`loadCampaignData` + `applyOverlay`) to
`scripts/stage08/fixtures/greyholm-real-merged-data.json`. Do **not** run
`snapshot:promote` against tracked `src/data`. Then:

```bash
node scripts/stage08/build-domain.mjs && node scripts/stage08/runGreyholmOverlay.mjs
```

The verdict becomes `STAGE_8_PASS` only when the real invariants are all clean.

## 7. Recommendation

Stage 8 real-data parity is now proven on **both** real campaigns: Caldran (full
real export incl. runtime) and Greyholm (real server overlay merged with the real
seed, all seven invariants clean, nothing dropped). Overall verdict:
**`STAGE_8_PASS`**, with the one documented, honest caveat that the battle/reveal/
presented-card session-runtime collections were empty in the live snapshot and
are contract-proven (not real-data-proven) until an overlay captured mid-session
is run through this same harness.

Stage 9 (local shadow integration of the universal repository/store) may now be
recommended — but it was **not** started in this session, per instruction. Before
Stage 9, optionally capture one overlay while a battle is active to close the
contract-only caveat on battle runtime.

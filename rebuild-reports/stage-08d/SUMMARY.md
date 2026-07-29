# Stage 8d — Greyholm live overlay and runtime parity completion

**Overall Stage 8 verdict: `STAGE_8_PASS_WITH_WARNINGS`.**
**Stage 8d sub-verdict: `STAGE_8D_BLOCKED_BY_SERVER_ACCESS`.**

The prior "no real data" reading was the result of an incomplete search: both
local clones are **shallow, grafted, blobless partial clones** (`blob:none`,
grafted at `a7b4208`), so the full history was never present locally. This
session unshallowed the legacy clone from GitHub (read-only) and searched all 93
commits, every ref, and dangling objects. Result: the real overlay is **not in
Git at all** — it lives only in the server SQLite / DM browser localStorage — and
the production server host URL is not discoverable from this environment, so the
real overlay cannot be fetched here. The MC runtime/overlay adapter path is proven
lossless at the **contract** level (40/40), and a real-overlay ingestion path is
wired and smoke-tested, ready to run the moment the export file is provided.

Reproduce:

```bash
node scripts/stage08/build-domain.mjs
node scripts/stage08/runGreyholmOverlay.mjs   # writes rebuild-reports/stage-08d/RESULTS.json
```

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
- **Blocker:** `GET /api/overlay` is reachable read-only *if the backend origin is
  known*, but the production Railway host URL is not present anywhere in this
  environment, and the Railway volume DB is not locally accessible →
  `STAGE_8D_BLOCKED_BY_SERVER_ACCESS`. Exact acquisition runbook is in
  `RESULTS.json → serverAccessRunbook`.

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

Do **not** promote Stage 8 to full `STAGE_8_PASS` and do **not** start Stage 9
until a real Greyholm overlay export is captured (step 6) and passes this
harness. Caldran real runtime parity + Greyholm durable parity + MC runtime
contract coverage are solid; the only remaining gap is real MC live runtime data,
which requires the manual browser export above.

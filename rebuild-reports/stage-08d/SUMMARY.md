# Stage 8d — Greyholm live overlay and runtime parity completion

**Verdict: `STAGE_8_PASS_WITH_WARNINGS`** — the real Greyholm live overlay/runtime
source is not available for read-only access, so full real-data runtime parity
is *not* proven. The MC runtime/overlay adapter path is proven lossless at the
**contract** level (40/40 checks), which de-risks the mapping but is explicitly
not a substitute for real data.

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

## 6. Safe manual path to a real overlay (no data modification)

1. Open campaign-timeline-vtt in the DM browser holding the live campaign.
2. Use in-app Export (NavBar) — it serializes `store.exportOverlay()`, a pure
   read that writes nothing. Or, read-only in DevTools:
   `copy(localStorage.getItem('campaign-timeline-vtt:overlay:v2'))`.
3. Save as `campaign-timeline-vtt-export.json`. Do **not** run `snapshot:promote`
   against tracked `src/data` — instead drop the file, immutable, under
   `scripts/stage08/fixtures/`.
4. Re-run `runGreyholmOverlay.mjs` against that fixture to upgrade
   `PASS_WITH_WARNINGS` to full real-data `PASS`.

## 7. Recommendation

Do **not** promote Stage 8 to full `STAGE_8_PASS` and do **not** start Stage 9
until a real Greyholm overlay export is captured (step 6) and passes this
harness. Caldran real runtime parity + Greyholm durable parity + MC runtime
contract coverage are solid; the only remaining gap is real MC live runtime data,
which requires the manual browser export above.

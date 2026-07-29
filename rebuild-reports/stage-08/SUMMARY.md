# Stage 8 — Real-data parity gate and validation hardening

**Verdict: `STAGE_8_PASS`** — 66/66 harness checks pass, 18/18 negative fixtures
behave as specified. No production integration was performed; no push/deploy.

Reproduce locally:

```bash
node scripts/stage08/build-domain.mjs   # compile src/domain -> scripts/stage08/.dist (gitignored)
node scripts/stage08/runParity.mjs      # writes RESULTS.json / PARITY.json / NEGATIVE_FIXTURES.json
```

## 1. Git checkpoint

- Repository: `campaign-timeline-vtt-universal-rebuild`, branch `master`.
- Starting HEAD: `017c1ac` (Stage 7 checkpoint), working tree clean, remote =
  local `../campaign-timeline-vtt` (not the production GitHub remote).
- Scope of changes: `src/domain/validation/validateCampaignSnapshot.ts`,
  `src/domain/adapters/userCampaignAdapter.ts`,
  `src/domain/adapters/mainCampaignAdapter.ts`, plus new `scripts/stage08/**`
  and `rebuild-reports/stage-08/**`. Legacy stores, production persistence,
  server sync, Railway/deploy config and all UI are untouched.

## 2. Real input evidence

| Campaign | Source | Real collections | Absent (out of read-only scope) |
| --- | --- | --- | --- |
| Caldran | `scripts/stage08/fixtures/caldran-real-export.json` (immutable copy of `~/Downloads/campaign-Кальдран_-Цена-имени-(плен).json`, sha256 `501d101b…f04a0`) | locations 17, npcs 66, quests 26, enemies 78, images 205, party 3, factions 12, mapPlacements 17, routes 1, mapIds 1, battleBoards 4 (16 tokens), revealedToPlayers 8 | — (full real export incl. runtime) |
| Greyholm | `public/data/dm-companion/*.json` + `public/data/battle-map-vtt/catalog.json` | npcs 210, quests 51, enemies 127, images 420, factions 22, players 4, shops 6, taverns 3, battleMaps 139 | worldMaps, worldMapStates, locationStates, hotspots, placements, routes, travelEvents, timelines, live overlay |

The Greyholm timeline-scoped collections and live overlay are **not** exercised:
their real source is the baked-TS runtime assembled by `loadCampaignData` at app
runtime plus the browser-localStorage overlay, both out of Stage 8's read-only
scope. They are fed empty so the harness never manufactures unresolved
references. This gap is reported here honestly rather than papered over with
synthetic data. Source files are hashed before **and** after every run and
verified byte-identical; parsed inputs are deep-frozen.

## 3. Validation changes (`validateCampaignSnapshot.ts`)

Severity policy: **error** = loss-sensitive or ambiguity-inducing (0 targets or
≥2 targets); **warning** = genuinely optional / non-destructive. A snapshot with
any error cannot be persisted. Ambiguity is never resolved by `find()` /
first-match / array order.

New / hardened **blocking** rules:

- `duplicate battleMaps.id` — campaign-scoped uniqueness (same id in different
  campaigns is allowed). A duplicate makes every `battleMapRef` ambiguous.
- `battleEntries.battleMapRef` — 0 matches → unresolved error; ≥2 matches →
  ambiguous error (previously a warning that accepted first-match existence).
- `placements.entityRef` unresolved → error (was warning). A placement with an
  unresolvable entity is meaningless.
- `hotspots.entityRef` present-but-unresolved → error (was warning). Absent
  entityRef (label-only hotspot) stays allowed.
- reveal targets (`visibility.entities` keys) that resolve to no entity → error.
- `battleMaps[].campaignId` cross-campaign check.

Retained: capability presence, map/entity id uniqueness, coordinate finiteness,
runtime campaignId match, runtime battle `battleMapRef` presence (runtime battle
refs point at the external battle-map-vtt catalog, so durable resolution is not
required — real Caldran boards `caldran-l01-a` … prove this).

New reusable gate: `assertSnapshotPersistable(snapshot)` throws
`SnapshotValidationError` when invalid. It is used by the Stage 8 pipeline before
any shadow write, in addition to the repository's own write-time validation.

## 4. Adapter fixes (confirmed real-data gaps)

1. **UC reveal targets never resolved** — `userCampaignAdapter` mapped every
   `revealedToPlayers` id through `entityIdFromLegacy('legacy', id)` →
   `entity:legacy:<id>`, but real entities are `entity:<kind>:<id>`. All 8 real
   Caldran reveals were silently lost. Fix: resolve each raw id to its owning
   collection (kind) and emit `entity:<kind>:<id>`; a 0-match or ≥2-match id is
   recorded with an unresolvable sentinel key (so validation rejects it) plus an
   `unresolved_reveal_target` / `ambiguous_reveal_target` diagnostic. Result:
   reveal 8/8 now resolve. Covered by the ambiguous-reveal negative fixture.

2. **MC quest.enemies crash on real data** — real DM Companion quests carry
   `enemies` as either `string[]` or a bare string (e.g. `""`).
   `mainCampaignAdapter` called `.map` unconditionally and crashed on the real
   Greyholm quests. Fix: `Array.isArray(quest.enemies) ? … : undefined` —
   identical output for the array case, no crash / no data loss for the string
   case (an empty string carried no enemy links).

## 5. Parity results

| Campaign | Source collections | Adapted | Validated | Shadow saved | Reloaded | Projected | Dropped | Result |
| --- | ---: | ---: | :---: | :---: | :---: | :---: | ---: | --- |
| Caldran | 14 non-empty | 407 entities / 17 placements / 4 battles / 8 reveals | ✅ 0 err | ✅ | ✅ rev 1 | DM 407 · Player 10 | `[]` | PASS |
| Greyholm | 9 non-empty | 843 entities / 139 battle maps | ✅ 0 err | ✅ | ✅ rev 1 | DM 843 · Player 382 | `[]` | PASS |

- **Identity parity**: every source npc/enemy/location/quest/faction/player/image
  resolves to its stable `entity:<kind>:<id>`; placements preserve id + exact
  coordinates + resolvable entityRef; all 139 catalog battle-map ids preserved
  and unique on real data; reveal 8/8; battle boards preserve tokens/round.
- **Round-trip**: reloaded snapshot is byte-stable-equal to the original except
  the repository revision bump (0 → 1); deterministic serialization confirmed;
  re-validates after reload.
- **Runtime parity**: 4 Caldran battle boards, 16 tokens, initiative round,
  variant, and `presentedToPlayers` preserved.
- **Privacy** (concrete field-path + string scans, not counts): Player Safe and
  Observer expose **0** hidden-entity DM notes (Caldran 397 / Greyholm 461
  hidden entities), carry no `dmNotes` field, leak no hidden image sources, and
  include no foreign campaign id. DM projection retains the full resolved set.

## 6. Negative fixtures (18/18, explicit expected behavior)

reject: duplicate_battle_map_id, duplicate_entity_id, ambiguous_reveal_target,
unresolved_placement_entityRef, unresolved_hotspot_entityRef,
unresolved_battleMapRef, ambiguous_battleMapRef, cross_campaign_reference,
missing_campaignId, persist_after_failed_validation, wrong_shadow_namespace,
restore_wrong_campaign, malformed_runtime_battleMapRef, source_mutation_detection.
preserve: missing_optional_collection, empty_optional_collection,
unsupported_entity_kind (unknown kinds are retained, not dropped),
duplicate_migration_identity (migration metadata is additive).

`persist_after_failed_validation` asserts the gate throws, the repository refuses
with `INVALID_SCHEMA`, and **nothing** was written to storage.

## 7. Safety & regression

- Storage: in-memory only, under the Stage-8-only shadow namespace
  `campaign-timeline-vtt:universal-shadow:stage-08`. Production namespace and
  real browser localStorage keys are never touched; isolation proven (production
  repo cannot read shadow-saved campaign; no production keys written).
- `npm run typecheck` ✅ · `npm run build` ✅ · Stage 8 harness ✅ ·
  verify:stage04 `PASS_WITH_WARNINGS` (unchanged) · verify:stage05/06/07 `PASS`.
- No push, no deploy, no server or Railway change; legacy source of truth and UI
  unchanged.

## 8. Remaining gaps (not hidden)

- Greyholm timeline/worldMap/locationState/hotspot/placement/route collections
  and the live campaign overlay are not exercised on real data (baked-TS +
  localStorage, out of read-only scope). Hotspot/placement/route/battleEntry
  resolution is proven via dedicated positive + negative fixtures instead.
- The universal repository/store/migration remain harness-only; production UI
  still uses the legacy MC/UC stores. No dual-write, no source-of-truth switch.
- Universal server sync is intentionally out of scope and not modeled.

## 9. Recommendation

Real-data lossless parity is proven for Caldran (full real export incl. runtime)
and for the real Greyholm durable dataset. Stage 9 (local shadow integration of
the universal repository/store) may be recommended, gated on first exercising the
real Greyholm timeline/overlay data that Stage 8 left out of read-only scope.
Stage 9 was **not** started in this session.

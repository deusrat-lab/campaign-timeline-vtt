# Stage 15 — Universal durable authority & generic safe entity updates

**Verdict: `STAGE_15_PASS`**

Universal production repository is, for the first time, the local durable source
of truth for a proven-safe, field-level allowlist across BOTH campaign stacks —
proven end-to-end in the real browser with real data, and by a 268-check
deterministic harness over the real adapters/repository.

## 1. Git checkpoint
- Repository: `campaign-timeline-vtt-universal-rebuild`, branch `master`
- Starting HEAD: `36c3fc8` (Stage 14c), working tree clean at start
- Remote `origin` → local legacy clone; **no push, no deploy** performed
- Final commits: see `Stage 15a/15b/15c` (local only)

## 2. Baseline reproduction (all green before changes)
Stage 8 66/66 + 18/18 · Stage 8d 46/46 · Stage 9 44/44 · Stage 10 74/74 ·
Stage 11 72/72 · Stage 12 97/97 · Stage 13 93/93 · Stage 14 120/120 ·
Stage 6 repository · Stage 7 migration · Stage 5 projections/privacy ·
typecheck PASS · build PASS.

## 3. Architecture
- **Flags** (default OFF): `VITE_UNIVERSAL_DURABLE_AUTHORITY` +
  `VITE_UNIVERSAL_DURABLE_AUTHORITY_SCOPES` (narrowing-only). Independent of
  Stage 9–14 flags. When a Stage 15 scope is enabled it OWNS that scope; the
  durable sink is consulted **before** the Stage 14 sink, so no dual authority.
- **Generic safe-field command** (`safeFieldCommand.ts`): typed
  `{scope, legacyEntityId, value}` — no arbitrary JSON patch, no nested/wildcard
  paths, no prototype keys, no id/array/reference mutation; deterministic single
  changed path `durable.entities:<id>.<field>`.
- **Ownership registry** (`safeFieldRegistry.ts`): field-level
  `(entityKind, universalField) → universal-owned | legacy-owned`. Never
  entity-level.
- **Safe composition** (`composeDurableBase.ts`): legacy-owned data always fresh
  from exact current legacy state; universal-owned fields taken from legacy
  except where the durable snapshot is ahead under a pending projection. Prevents
  stale map/runtime/reveal/battle overwrite.
- **Durable transaction coordinator** (`durableAuthorityRouter.ts`): capture →
  read production repo → reconcile/compose → execute universal command →
  validate → scope-check → predict legacy → parity → stale + revision re-check →
  **atomic expected-revision commit** → **read-after-write verify** → **one**
  legacy compatibility projection → verify → reconcile. Synchronous, byte-
  compatible with the async production repository via `syncDurableRepository.ts`.
- **Recovery** (`recoveryStore.ts`): a durable-committed-but-unprojected event
  becomes an idempotent pending record (no raw value stored); reload recovery
  resolves already-consistent records and re-projects once (bounded retries),
  never crossing campaigns, never rolling back universal state.
- **Reconciliation**: equal / initialized / legacy_ahead_imported /
  universal_ahead / conflict / missing/invalid_universal — external legacy edits
  imported as new intent; no silent overwrite, no automatic destructive repair.
- **Diagnostics** (`durableDiagnosticsStore.ts`): isolated namespace
  `…:universal-durable-authority:stage-15:<campaignId>`; bounded, redacted
  (hashes/paths/counts only, never full snapshots or raw values).

## 4. Coverage
10 scopes across 4 entity kinds and both stacks (see
`SAFE_ENTITY_UPDATE_MATRIX.md`): Greyholm npc role/name; user-campaign npc
role/name/description, quest title/description, faction name/description,
location description. Excluded: composed fields (Greyholm dmNotes), references,
visibility/reveal, geometry/maps/placements/routes, images, party, quest status,
create/delete, campaign metadata identity.

## 5. Automated verification
- **Stage 15 harness: 268/268 PASS** (`STAGE_15_HARNESS_PASS`) — real Caldran
  export + real Greyholm contract overlay through the real adapters + real
  repository. Groups: registry/contracts, generic command, flags, durable happy
  path (all 10 scopes), sequential + revision monotonicity + composition safety,
  composition/reconciliation units, pre-commit fallbacks, partial-failure &
  recovery, live reconciliation, concurrency/dedup/revision-conflict/isolation,
  repository robustness (write-fail/corruption/diag-fail), safety invariants.
- **Consolidated regression runner** `verify:universal-regression`:
  **12/12 gates PASS** (`UNIVERSAL_REGRESSION_PASS`).
- Stage 14 120/120, Stage 13 93/93, Stage 12 97/97, Stage 11 72/72, Stage 10
  74/74, Stage 9 44/44, Stage 8 66/66+18/18, Stage 8d 46/46 — all still PASS.
- `typecheck` PASS · `build` PASS.

## 6. Real browser verification (local dev, no deploy)
| Flow | Campaign | Entity/field | Universal commit | Repo revision | Legacy commits | Reload | Reconciliation | Result |
|---|---|---|---|---|---|---|---|---|
| Greyholm role edit | greyholm | npc.role | yes | 0→1 | 1 | persists | missing→init | success |
| Greyholm role edit #2 | greyholm | npc.role | yes | 1→2 | 1 | — | equal | success |
| Flag OFF role edit | greyholm | npc.role | **none** | stays 2 | legacy only | — | — | baseline |
| UC role edit | userCampaign | npc.role | yes | 0→1 | 1 | — | missing→init | success |

- Greyholm anchors preserved in the composed durable snapshot: **210 NPC, 4 maps**.
- Caldran anchor preserved: **66 NPC**.
- Read-after-write hash equal on every durable commit; exactly one legacy
  compatibility projection each; single role changed-path each.
- Two separate production keys + two separate Stage 15 diagnostics keys →
  per-campaign isolation confirmed.
- Flag OFF: production repo + Stage 15 diagnostics untouched; legacy overlay
  committed normally (exact baseline).
- No new network requests from the durable executor; `userCampaignSync`
  unchanged; no server mutation beyond existing legacy behaviour.

## 7. Remaining gaps (honest)
- Stage 15 authority is limited to safe scalar/text fields. Maps, reveal,
  placements, routes, travel, timeline, campaign events, faction zones, movable
  entities, battles, create/delete, import/restore are **not** universalised
  (legacy-owned) — deferred to Stage 16.
- Server sync is **not** universalised; the server, Railway config and
  `userCampaignSync` are unchanged; no migration executed.
- Greyholm `npc.name` durable scope is exercised by the harness; the current
  Greyholm NPC editor only sends a single-field patch for `role`, so `name` is
  not reachable as a single-field edit through that specific UI (multi-field
  saves fall through to the unchanged legacy path).
- Recovery and diagnostics are local-only; reload recovery auto-resolves
  already-consistent pending records (the dominant real case) and re-projects
  once for inconsistent ones via the harness-proven path.
- Legacy representation still exists (compatibility persistence/projection).

## 8. Recommendation
Next major stage: **Stage 16 — Complex campaign systems authority** (reveal,
presented cards, placements, routes/travel, party location, timeline/events,
faction zones, movable entities, maps/hotspots, controlled destructive ops).
Not started in this session.

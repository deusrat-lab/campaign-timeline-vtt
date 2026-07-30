# Stage 14 — Controlled local universal command authority (tiny reversible allowlist)

## Verdict

**STAGE_14_PASS**

Real normal UI actions on **both** legacy stacks now execute the universal
command **first**, validate the candidate, independently predict the equivalent
legacy transition, require semantic parity, then perform exactly **one** real
legacy compatibility commit and verify the committed post-state against the
candidate. No authoritative dual-write, no production universal namespace write,
no new network / server sync, one durable legacy commit maximum. Verified live in
the browser for Greyholm and a user campaign, flag on and off.

## Git checkpoint

- Repository: `campaign-timeline-vtt-universal-rebuild`, branch `master`
- Starting HEAD: `1e4f205` (Stage 13c) — reproduced before any change
- Remote: local file path (`origin` → `../campaign-timeline-vtt`); **no push, no deploy**
- Working tree before: clean. Changes are limited to Stage 14 scope (see Scope).

## Baseline reproduction (before changes)

| Check | Result |
| --- | --- |
| typecheck (`tsc --noEmit`) | PASS |
| build (`tsc -b && vite build`) | PASS |
| Stage 13 | 93/93 PASS |
| Stage 12 | 97/97 PASS |
| Stage 11 | 72/72 PASS |
| Stage 10 | 74/74 PASS |
| Stage 9 | 44/44 PASS |
| Stage 8 / 8d | 66/66 + 18/18 / 46/46 PASS |
| Stage 4–7 | PASS (Stage 4 historical PASS_WITH_WARNINGS) |

Stage 4 runner rewrites two historical reports on run; restored byte-identically.

## Command authority audit

- Candidates investigated: `greyholm.npc.role.update`, `userCampaign.npc.role.update`
  (see `COMMAND_AUTHORITY_COVERAGE_MATRIX.md`).
- Final allowlist: both of the above. Each is one campaign, one entity, one simple
  scalar/text field, deterministic, reversible, exact kind-aware id mapping, no
  cascade / reference / visibility / runtime mutation, no network addition, and
  already proven at exact Stage 13 parity.
- Excluded: `toggleReveal` (multi-effect, can honestly mismatch), presented card,
  placement, reveal, battles, maps, import/restore/delete/bulk/timeline/events —
  all out of Stage 14 scope.

## Architecture

- **Flag** `VITE_UNIVERSAL_COMMAND_AUTHORITY` (default off) + narrowing
  `VITE_UNIVERSAL_COMMAND_AUTHORITY_SCOPES`. Independent of the Stage 9/10/11/12/13
  flags. Off ⇒ no router, no sink, no diagnostics I/O, exact baseline legacy path.
- **Router** `src/domain/command-authority/commandAuthorityRouter.ts` — pure,
  synchronous, injected accessors, guarantees exactly one of `commit`/`fallback`.
  Phases: preparing → universal_executing → universal_validated →
  legacy_prediction_matching → commit_ready → legacy_committing → legacy_committed
  → post_commit_verifying → success (or fallback_* / post_commit_mismatch).
- **Pipeline**: build+validate exact pre-snapshot → execute universal command
  first → blocking validate candidate → restrict changed paths to
  `durable.entities:<id>.role` → independent legacy prediction (pure transition on
  an immutable clone) → parity gate → stale re-check → **one** legacy commit →
  post-commit compare(candidate, committed) → bounded redacted diagnostics.
- **Semantic hashing**: added `semanticSnapshotHash` (normalises repository
  revision, adaptation timestamps and the raw-legacy preservation mirrors,
  including per-entity `extensions.original`) so pre/candidate/committed hashes,
  event-id dedup and the stale check are stable across re-adaptation. This
  additive change did not regress Stage 13 (93/93).
- **Compatibility commit adapter**: thin wrapper over the existing legacy action
  (`dispatch(PATCH_ENTITY)` for Greyholm; `patchData` for UC). Never bypasses
  legacy persistence, never writes a universal snapshot, never adds sync.
- **Diagnostics**: isolated namespace
  `campaign-timeline-vtt:universal-command-authority:stage-14:<campaignId>`,
  bounded per campaign, redacted (ids/paths/counts/hashes only), DM-only read-only
  UI with clear + export-redacted, no apply/replay/rollback controls.

## Greyholm integration

- Real UI action: NPC edit form (`EntityLibraryPage` NpcEditor). When only the
  role changed, it emits a single-field `patchNpc(id, { role })` (identical
  resulting state); otherwise the full multi-field patch dispatches as before.
- `campaignStore.patchNpc` routes the role-only case through `routeMainAuthority`;
  the provider builds pre/predicted/committed snapshots at the **data** level
  (Greyholm's npc field is merged into `data.npcs` upstream; the adapter reads it
  from `data`, so prediction applies the same field to a `data` clone). The real
  `dispatch` is the one commit; when the flag is off the store dispatches itself.
- Verified live: prediction `equal`, post-commit `equal`, candidate hash ==
  committed hash, one commit, no fallback, no network, no console errors.

## User Campaign integration

- Real UI action: `CampaignEntityCard` role input → `updateEntity(campaignId,
  'npc', id, { role })` (a genuine single-field per-keystroke update).
- `userCampaignStore.updateEntity` routes the npc-role case through
  `routeUserAuthority`; `commit` performs the one real `patchData` (existing
  persistence + existing `pushBlob`, unchanged) and reads back the committed
  post-state; `predict` applies the pure updater to the captured immutable
  pre-data. `campaignId` comes from the route/data identity; two campaigns are
  isolated; same source ids across campaigns are isolated (kind + campaign-scoped
  id mapping). `userCampaignSync` unchanged; no additional sync.
- Verified live: prediction `equal`, post-commit `equal`, candidate == committed,
  one commit, isolated per-campaign diagnostics.

## Failure behaviour (all pre-commit failures → unchanged legacy runs once)

mapping_failed, invalid_pre_state, wrong_campaign, command_rejected (blank),
validation_failed, candidate_scope_violation, prediction_unavailable,
prediction_mismatch, stale_precondition, executor_exception → **fallback** (legacy
action once). Legacy commit failure → recorded, not re-run (no duplicate). Post-
commit mismatch → recorded, committed legacy result stays authoritative, no
rollback, no second mutation. Diagnostics-storage failure never blocks the commit
or the fallback.

## Verification table

| Flow | Campaign | UI action | Universal candidate | Prediction | Legacy commits | Post-commit | Fallback | Persistent owner | Result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Greyholm role edit (flag on) | greyholm | NpcEditor save (role only) | valid | equal | 1 | equal | no | legacy overlay | success/committed |
| UC role edit (flag on) | user | CampaignEntityCard role | valid | equal | 1 | equal | no | legacy UC store | success/committed |
| Greyholm role edit (flag off) | greyholm | NpcEditor save | — | — | 1 (legacy) | — | n/a | legacy overlay | baseline, 0 Stage 14 |
| UC role edit (flag off) | user | role input | — | — | 1 (legacy) | — | n/a | legacy UC store | baseline, 0 Stage 14 |
| mapping failure | either | unknown id | rejected | — | 1 (fallback) | — | yes | legacy | fallback_success |
| validation failure | either | invalid candidate | rejected | — | 1 (fallback) | — | yes | legacy | fallback_success |
| prediction mismatch | either | A vs B | valid | mismatch | 1 (fallback) | — | yes | legacy | fallback_success |
| stale precondition | either | base changed | valid | equal | 1 (fallback) | — | yes | legacy | fallback_success |
| post-commit mismatch (fixture) | either | committed≠candidate | valid | equal | 1 | mismatch | no | legacy | post_commit_mismatch |
| rapid saves | either | 2–3 edits | valid | equal | 1 each | equal | no | legacy | serialized, one commit each |
| two UC campaigns | user | edits in each | valid | equal | 1 each | equal | no | legacy | isolated diagnostics |
| Stage 13 + Stage 14 on | either | role edit | valid | equal | 1 | equal | no | legacy | one mutation, ≤2 diagnostics |

## Harness & regression

- Stage 14 harness: **120/120 PASS** (`npm run verify:stage14`) — flags/safety,
  Greyholm, UC, candidate constraints, prediction, stale, commit/post-commit,
  concurrency/dedup, diagnostics. Uses the real router + real adapters + real
  Greyholm contract fixture + real Caldran export.
- Browser/local: Greyholm + UC real-UI authority commits (flag on); zero Stage 14
  activity (flag off); no network requests; no console errors.
- Regression: typecheck PASS, build PASS, Stage 13 93/93, Stage 12 97/97, Stage 11
  72/72, Stage 10 74/74, Stage 9 44/44, Stage 8 66/66+18/18, Stage 8d 46/46,
  Stage 4–7 PASS. `userCampaignSync` untouched; no production universal write.

## Remaining gaps (honest)

- Universal persistence is **not** authoritative; legacy stores remain the
  physical persistence backend — Stage 14 only owns the command *decision* for the
  tiny allowlist, committing through the legacy boundary.
- Allowlist is deliberately tiny (two single-field npc role commands).
- Not transferred: reveal (multi-effect), presented card, placements/map geometry,
  routes/party/battles/tokens/lifecycle, import/restore/reset, deletes, bulk,
  timeline, campaign events, faction zones, movable entities.
- Server sync is not universalised; the production universal namespace is unused;
  diagnostics are local and DM-only.
- Greyholm's role edit reaches authority only when the save changed **only** the
  role (multi-field saves keep the unchanged legacy path — correct, out of scope).

## Recommendation

Stage 14 is a clean local checkpoint. A possible next step is **Stage 15 —
controlled universal repository authority for the same tiny allowlist** (treat the
universal repository as a local durable source for this scope while keeping the
compatibility projection/fallback). Not started in this session.

# Stage 14 — Command Authority Coverage Matrix

Scope: give the universal command layer, for the first time, authority over the
*decision* of a tiny, reversible allowlist of single-field NPC edits, while the
existing legacy mutation/persistence layer remains the compatibility commit
backend. Universal executes first → validated candidate → independent legacy
transition prediction → parity gate → **one** real legacy compatibility commit →
post-commit verification against the candidate.

No authoritative dual-write. No universal production-namespace write. No new
network / server sync. One real legacy commit maximum. Legacy remains the
physical persistence backend.

## Candidate audit

| Field | `greyholm.npc.role.update` | `userCampaign.npc.role.update` |
| --- | --- | --- |
| UI trigger | NPC card / entity-library role edit (`patchNpc(id,{role})`) | NPC card role edit (`updateEntity(id,'npc',eid,{role})`) |
| Legacy action | `campaignStore.patchNpc` → `dispatch({PATCH_ENTITY,kind:'npc',patch:{role}})` | `userCampaignStore.updateEntity` → `patchData(updater)` |
| Payload | `{ role: string }` (single scalar/text field) | `{ role: string }` (single scalar/text field) |
| Sync/async | synchronous reducer dispatch | synchronous `patchData` (writes localStorage + cache) |
| Mutation boundary | pure `reducer(state, action)` (in `campaignStore.tsx:392`) | pure updater `(p)=>({...p, npcs: mapped})` |
| Persistence boundary | `overlayStorage.save` via the store's save effect | `writeJson(dataKey)` + `pushBlob` (existing sync) inside `patchData` |
| Side effects | none beyond the entity field | `pushBlob` (existing debounced sync — unchanged); NOT `patchPlayerRemote` (party-only) |
| Subscriptions | overlay reducer state | `dataCache` / cross-tab storage |
| Server/network | none | existing `pushBlob` only (unchanged, fires once) |
| Pre-state source | `state` overlay (immutable in-memory) | `captureUc(id)` = `{data,runtime}` read from localStorage (synchronous) |
| Stable post-state | `reducer(pre, action)` (pure, deterministic) — returned by commit | updater result (pure) — returned by commit |
| Campaign identity | `campaignIdFromLegacy('greyholm','main')` | `campaignIdFromLegacy('user', legacyCampaignId)` from route/data |
| Entity identity | `entityIdFromLegacy('npc', id)` (deterministic, kind-aware) | `entityIdFromLegacy('npc', entityId)` |
| Reversibility | yes — inverse is `{role: previousValue}` | yes — inverse is `{role: previousValue}` |
| Stage 13 parity | proven (Stage 13 93/93 includes `greyholm.npc.update`) | proven (Stage 13 93/93 includes `userCampaign.npc.update`) |
| Validation failures | empty/blank value rejected as `invalid_payload`; unresolved/ambiguous id → `mapping_failed` | same |
| Fallback feasibility | yes — legacy dispatch is the unchanged fallback, run exactly once | yes — legacy `patchData` is the unchanged fallback |
| Rollback feasibility | test-only inverse; no production auto-rollback | same |
| Universal-first suitability | **yes** | **yes** |

## Final allowlist

- `greyholm.npc.role.update`  → maps to universal command scope `greyholm.npc.update`
- `userCampaign.npc.role.update` → maps to universal command scope `userCampaign.npc.update`

Both are: one campaign, one entity, one simple field, deterministic, reversible,
exact kind-aware id mapping, no cascade / reference / visibility / runtime
mutation, no network addition, no server-side semantic dependency, and already
proven at exact Stage 13 parity (`candidate == adapter(legacyPost)`), which makes
universal-first authority correct by construction for these two scopes.

## Excluded (and why)

- `toggleReveal` — multi-effect (placement + image side effects); can honestly
  produce `semantic_mismatch`; explicitly forbidden by Stage 14 scope.
- `presentedCard`, `mapPlacement.update` — runtime / geometry, deferred.
- reveal (both stacks), route progress, party location, battles/tokens/lifecycle,
  map geometry, hotspot/route create/delete, import/restore/reset, deletes, bulk,
  timeline, campaign events, faction zones, movable entities — out of Stage 14
  scope per the plan.

## Architecture summary

```
UI role edit (unchanged form)
 → store method (patchNpc / updateEntity)
 → routeMainAuthority / routeUserAuthority (returns false when flag off ⇒ store commits itself)
 → CommandAuthorityRouter.route:
     capture immutable pre-state → adapt → preHash
     execute universal command FIRST → candidate
     blocking validate candidate
     candidate.changedPaths ⊆ allowed-paths(scope)   (else candidate_scope_violation → fallback)
     predict legacy = adapt(pure transition(pre))     (no real mutation)
     compare(candidate, predicted) parity             (else prediction mismatch → fallback)
     re-check pre-state unchanged (stale guard)        (else stale_precondition → fallback)
     commit() once  = real legacy dispatch/patchData, returns adapt(committed post)
     verify compare(candidate, committed)              (mismatch → post_commit_mismatch, legacy authoritative, no rollback)
     record bounded redacted diagnostics
 (any pre-commit failure ⇒ commit() runs once as unchanged legacy fallback)
```

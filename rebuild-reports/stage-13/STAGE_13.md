# Stage 13 — controlled universal command / write-path shadow execution

**Verdict: `STAGE_13_PASS`**

Real allowlisted legacy commands in BOTH stacks locally emit an isolated
universal shadow command; the universal result is validated and compared to the
adapter-derived post-state, and is **never** applied to authoritative data.

## 1. Principle

```
legacy command executes for real (authoritative)
→ capture immutable pre/post legacy state
→ adapt both to universal snapshots
→ replay the equivalent universal command against the exact pre-state (isolated clone)
→ validate the universal result (blocking)
→ compare with adapter(legacy post-state)
→ persist ONLY a bounded, redacted local diagnostic
```

Legacy stores remain the sole authoritative writers. No dual-write, no
production-namespace write, no server sync, no apply-to-legacy, no migration.

## 2. Architecture

- **Flag** `VITE_UNIVERSAL_COMMAND_SHADOW` (default off) + narrowing-only
  `VITE_UNIVERSAL_COMMAND_SHADOW_SCOPES`. Independent of Stage 9/10/11/12 flags.
  When off: no coordinator, no sink, no storage access — zero Stage 13 activity.
- **Event contract** `CommandShadowEvent` — immutable/frozen, deterministic
  `eventId` (hash of campaign + scope + occurredAt + pre/post hashes + target
  ids), redacted `commandPayload` (ids/paths/short summaries only; long
  free-text redacted; never a full snapshot).
- **Coordinator** `CommandShadowCoordinator` — per-campaign FIFO queue,
  idempotent dedup, stale-completion guard, isolated in-memory execution,
  structured statuses, bounded/redacted diagnostics; never throws into the
  legacy path.
- **Executor** `executeUniversalCommand` — pure, clones input, no storage /
  network / legacy access / global active campaign; deterministic structured
  result.
- **ID mapping** — campaign-scoped, kind-aware, deterministic; unresolved →
  `mapping_failed`, ambiguous → `mapping_failed`, wrong campaign →
  `wrong_campaign`; never first-match, never id guessing.
- **Comparison** `compareCommandResult` — reuses the Stage 9 semantic snapshot
  diff; classifies `equal` / `revision_only` / `ordering_only` /
  `semantic_mismatch`; normalises out only explicitly-allowed technical
  differences (revision, adaptation timestamps, and the adapter's verbatim raw
  overlay preservation mirrors — `durable.extensions.overlayRemainder`,
  `runtime.extensions`). Every normalised field (entities, refs, coordinates,
  visibility, runtime.party/presentation, images) is still compared.
- **Diagnostics store** — bounded per-campaign records under
  `campaign-timeline-vtt:universal-command-shadow:stage-13:<campaignId>`; hashes
  not content; clear is per-campaign.

## 3. Precondition / freshness

The universal base must equal the exact legacy pre-command state: the coordinator
hashes the built pre-snapshot and rejects with `stale_precondition` unless it
matches the event's captured `legacyPreHash`. The post-state is likewise
hash-checked. The base is adapted directly from the captured pre-state (not read
from any live shadow namespace), so it is exact by construction.

## 4. Integration (real UI-connected)

See `COMMAND_COVERAGE_MATRIX.md`. Greyholm wraps `patchNpc(role)`,
`presentCard`, `setRevealed`; user campaigns wrap `updateEntity(npc,role)`,
`updatePlacement(x,y)`, `toggleReveal`. Emissions are additive, guarded, and
default-off — legacy semantics are unchanged.

## 5. Failure & concurrency behaviour (all proven in harness)

`success`, `semantic_mismatch`, `validation_failed`, `mapping_failed`,
`command_rejected` (invalid payload), `command_failed`, `adapter_failed`,
`stale_precondition`, `wrong_campaign`, `diagnostics_persistence_failed`,
`cancelled`. Per-campaign FIFO; different campaigns independent; duplicate events
deduped; stale (older) completion never regresses live status; dispose cancels
pending shadow only (no legacy effect); one event → exactly one record.

## 6. Verification

| Check | Result |
|---|---|
| Stage 13 harness | 93/93 PASS |
| typecheck (`tsc --noEmit`) | PASS |
| build (`tsc -b && vite build`) | PASS |
| lint:hooks (rules-of-hooks) | clean |
| Stage 12 / 11 / 10 / 09 | 97 / 72 / 74 / 44 PASS |
| Stage 8 / 8d | 66+18 / 46 PASS |
| Stage 4–7 | PASS (forbiddenDeps 0) |
| Browser (flag off) | loads clean, no console errors |
| Browser (flag on) | loads clean, coordinator constructs, no render loop, no console errors |

A real bug — `getAllStatuses()` returning a fresh array each call, tripping
`useSyncExternalStore`'s cached-snapshot invariant (infinite render loop) — was
caught by live browser verification and fixed (referentially-stable
`statusesSnapshot`, rebuilt only on `emit()`).

## 7. Anchors unchanged

Greyholm real overlay parity (Stage 8d 46/46), Caldran 66 NPC / 78 enemies /
reveal 8/8 (Stage 8 66/66) — no regression. `userCampaignSync` untouched, server
sync untouched, production namespace untouched, no migration executed.

## 8. Remaining gaps

- Universal is still NOT the authoritative write source; the universal result is
  never applied — comparison / diagnostics only.
- Not all commands are covered — 3 Greyholm + 3 user-campaign families only.
- Destructive / import / restore / battle-lifecycle / complex map+timeline
  transactions remain legacy-only.
- Persistence and server sync are not universalised; diagnostics are local only.
- User-campaign `toggleReveal` is multi-effect: when the revealed entity also has
  a placement/image, the comparison honestly reports the wider legacy effect as a
  `semantic_mismatch` rather than a false success.
- Live browser verification confirmed boot, coordinator construction and the
  absence of a render loop with the flag on; full DM-UI edit-to-diagnostic
  round-trips are proven by the harness against real data rather than by
  end-to-end UI automation.

## 9. Recommendation

Stage 13 is complete and safe. A future **Stage 14** may consider universal-first
execution for a tiny reversible allowlist with legacy comparison/fallback — NOT a
source-of-truth switch. Not started in this session.

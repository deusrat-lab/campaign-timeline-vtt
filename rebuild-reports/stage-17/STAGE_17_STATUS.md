# Stage 17 — Interim Status

> **Update (2nd pass):** application-integration foundation added and browser-verified.
> The default-off `CampaignEngineProvider`, the Stage 17 flag layer, and the DM-only
> `/diagnostics/stage-17` route are wired into the real app and proven in a live browser
> (see STAGE_17_BROWSER_EVIDENCE.md). Harness expanded 171 → **231**. Regression **15/15**.
> Still NOT a full STAGE_17_PASS: battle-command UI cutover, import/export/backup/restore/sync
> UI flows, and pending-recovery browser injection remain pending (details below).

## Verdict: STAGE_17_ARCHITECTURE_COMPLETE — application integration + browser evidence PENDING

This is **not** `STAGE_17_PASS`. Per the honest-verdict policy, PASS is not claimable while real
UI integration and application-level local cutover are undone. What is committed is the complete,
independently-verified, Node-provable Stage 17 core.

## Git checkpoint
- Repo `campaign-timeline-vtt-universal-rebuild`, branch `master`.
- Starting HEAD `d497809` → final HEAD `0be5c2d` (1 new local commit). Ahead 45, behind 0.
- Working tree clean. **No push. No deploy. No Railway. No production mutation.**

## Baseline (reproduced green)
typecheck PASS · build PASS · Stage 16 397/397 · Stage 16.1 148/148 · universal-regression now **15/15**
(Stage 17 added) · Stages 8–15 all PASS.

## What is DONE and VERIFIED (171/171 on real Greyholm + Caldran data)
| Family | Assertions | Proven |
|---|---|---|
| Battles | 56 | Greyholm + Caldran adapters round-trip lossless; anchors 4 boards/16 tokens; exact campaign-scoped identity, cross-campaign isolation, no first-match; 10 typed commands, expected-revision, invariants |
| Import/Export/Backup/Restore | 29 | deterministic export + hash; DM vs player-safe separation; format detection; strict target-id import (no hidden fallback); dry-run; rollback checkpoint; RAW; corrupt-backup rejection; battle state survives round-trip |
| Sync | 28 | campaign-scoped protocol; push/pull; idempotency; conflict (no silent LWW); retry; offline queue; reconcile; 2-campaign isolation; **zero network** |
| Migration rehearsal | 26 | Greyholm + Caldran dry-run + commit into isolated repo; idempotent; export→restore round-trip; legacy source durable unchanged |
| Cutover + ownership | 32 | default-off flags; no-dual-authority invariant; family flips only under master switch; deferred families not auto-claimed |

## What REMAINS before a true STAGE_17_PASS
1. **Real-browser UI wiring** for battles (Greyholm normal controls + Caldran board controls),
   import/export, backup/restore — with refresh persistence and Player-Safe/Observer checks.
2. **Application-level local cutover**: route the universal layer through the React
   providers/stores behind the default-off flags so ON makes universal the primary local source.
3. **Stage 17 recovery/reconciliation pending-record stores** + diagnostics route/namespaces
   (the sync `reconcile` primitive and import/restore rollback checkpoints exist; the pending-record
   stores + DM diagnostics UI do not).

## Safety attestation
No `git push`, no deploy, no Railway change, no production migration, no remote writes. Legacy clone,
server, and `userCampaignSync` untouched. Sync is in-memory only (no `API_BASE_URL`, no `fetch`).

## Recommendation
Do not start Stage 18. Next: wire the verified core into the React app + real-browser evidence
(the remaining Stage 17 scope), on top of `0be5c2d`.

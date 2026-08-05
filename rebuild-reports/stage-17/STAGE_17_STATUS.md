# Stage 17 — Status

> **Update (3rd pass, audit session):** this file was stale — it was last written at `0be5c2d`
> and still listed three items as "remaining" (real-browser UI wiring, application-level local
> cutover, recovery/reconciliation pending-record stores). An independent code audit confirmed all
> three were completed in the subsequent commits `cd767c6`…`88df2b9` (Stage 17c–17i) and are real,
> non-aspirational, wired code — see `STAGE_17_BROWSER_EVIDENCE.md` Parts B–H and
> `docs/universal-rebuild/FINAL_REMAINING_WORK_AUDIT.md` §2 for the file:line verification.
> Verdict upgraded accordingly.

## Verdict: STAGE_17_PASS (local, browser-verified) — production activation remains external

All three items below that previously blocked `STAGE_17_PASS` are done and re-verified against
current code in this session:
1. Real-browser UI wiring for battles (Greyholm `EmbeddedBattleOverlay` "Следующий ход", Caldran
   `CampaignBattlePage` "Телепорт"), import/export and backup/restore
   (`CampaignManagementPanel`) — all real UI, not test-only.
2. Application-level local cutover: `CampaignEngineProvider` + `BattleAuthorityProvider` mounted in
   the real app tree (`src/App.tsx`), default-off via `VITE_UNIVERSAL_*` flags.
3. Recovery/reconciliation pending-record store: `src/domain/battles/battleAuthorityStore.ts`
   (`recordPendingProjection`/`readPendingProjection`/`clearPendingProjection`), invoked on mount in
   both battle overlays; `/diagnostics/stage-17` reads live pending/sync counters.

Remaining known gaps (party/route/placement parity, presented-card for UC) were never claimed as
Stage 17 scope — see `FINAL_REMAINING_WORK_AUDIT.md` §4/§6 for the honest breakdown. Production
activation of the flags is explicitly out of local scope (external/manual step).

## Git checkpoint
- Repo `campaign-timeline-vtt-universal-rebuild`, branch `master`.
- Starting HEAD `d497809` → HEAD at last Stage 17 commit `88df2b9` (audit session started here).
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

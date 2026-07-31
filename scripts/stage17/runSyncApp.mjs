// Stage 17 — application sync lifecycle (persisted queue + local mock remote).
import {
  createMemoryRepositoryStorage,
  enqueueBattleSync, syncPending, flushBattleSync, remoteRevision, remoteAppliedCount,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';

const A = 'camp-A', B = 'camp-B', BATTLE = 'custom-alpha';
function op(campaignId, battleId, rev, eventSuffix) {
  return { campaignId, battleId, baseRevision: rev - 1, candidateRevision: rev, snapshotHash: 'h' + rev, eventId: `${campaignId}:${battleId}:rev${rev}${eventSuffix ?? ''}`, occurredAt: '1970-01-01T00:00:00.000Z' };
}

export function runSyncApp(c = new Checks()) {
  // --- one mutation → one queued op → one remote application ---
  {
    const s = createMemoryRepositoryStorage();
    enqueueBattleSync(s, op(A, BATTLE, 1));
    c.eq('sync app: one mutation → one queued op', syncPending(s, A), 1);
    const r = flushBattleSync(s, A, true);
    c.eq('sync app: one op applied', r.applied, 1);
    c.eq('sync app: queue drained', syncPending(s, A), 0);
    c.eq('sync app: remote at revision 1', remoteRevision(s, A, BATTLE), 1);
    c.eq('sync app: remote applied count 1', remoteAppliedCount(s, A), 1);
  }

  // --- offline queue persists; online flush applies ---
  {
    const s = createMemoryRepositoryStorage();
    enqueueBattleSync(s, op(A, BATTLE, 1));
    enqueueBattleSync(s, op(A, BATTLE, 2));
    const offline = flushBattleSync(s, A, false);
    c.eq('sync app: offline flush is a no-op', offline.applied, 0);
    c.eq('sync app: offline queue persists', syncPending(s, A), 2);
    const online = flushBattleSync(s, A, true);
    c.eq('sync app: online flush applies both', online.applied, 2);
    c.eq('sync app: remote at revision 2', remoteRevision(s, A, BATTLE), 2);
  }

  // --- idempotency: duplicate eventId applied once ---
  {
    const s = createMemoryRepositoryStorage();
    enqueueBattleSync(s, op(A, BATTLE, 1));
    flushBattleSync(s, A, true);
    enqueueBattleSync(s, op(A, BATTLE, 1)); // same eventId re-enqueued
    const r = flushBattleSync(s, A, true);
    c.eq('sync app: duplicate delivery deduped', r.duplicates, 1);
    c.eq('sync app: remote applied count still 1', remoteAppliedCount(s, A), 1);
    c.eq('sync app: remote revision unchanged', remoteRevision(s, A, BATTLE), 1);
  }

  // --- conflict: stale base revision, no silent overwrite, op retained ---
  {
    const s = createMemoryRepositoryStorage();
    enqueueBattleSync(s, op(A, BATTLE, 1));
    flushBattleSync(s, A, true); // remote → 1
    // a second client's op believes base is 0 → conflict against remote rev 1
    enqueueBattleSync(s, { ...op(A, BATTLE, 2, '-clientB'), baseRevision: 0 });
    const r = flushBattleSync(s, A, true);
    c.eq('sync app: stale base is conflict', r.conflicts, 1);
    c.eq('sync app: no silent overwrite (remote stays 1)', remoteRevision(s, A, BATTLE), 1);
    c.eq('sync app: conflicting op retained for reconciliation', syncPending(s, A), 1);
    // reconcile: re-enqueue at correct base → applies
    const s2 = createMemoryRepositoryStorage();
    enqueueBattleSync(s2, op(A, BATTLE, 1)); flushBattleSync(s2, A, true);
    enqueueBattleSync(s2, op(A, BATTLE, 2)); // correct base 1
    c.eq('sync app: reconciled op applies', flushBattleSync(s2, A, true).applied, 1);
  }

  // --- two campaigns isolated ---
  {
    const s = createMemoryRepositoryStorage();
    enqueueBattleSync(s, op(A, BATTLE, 1));
    enqueueBattleSync(s, op(B, BATTLE, 1));
    flushBattleSync(s, A, true);
    c.eq('sync app: campaign A applied', remoteRevision(s, A, BATTLE), 1);
    c.eq('sync app: campaign B queue untouched by A flush', syncPending(s, B), 1);
    c.eq('sync app: campaign B remote still 0', remoteRevision(s, B, BATTLE), 0);
    flushBattleSync(s, B, true);
    c.eq('sync app: campaign B applied independently', remoteRevision(s, B, BATTLE), 1);
  }

  return c;
}

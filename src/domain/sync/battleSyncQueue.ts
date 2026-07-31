/**
 * Stage 17 — application sync lifecycle for battle mutations.
 *
 * A campaign-scoped, localStorage-backed sync queue + a LOCAL mock "remote"
 * (another localStorage namespace acting as the server). NO production network,
 * no fetch, no API_BASE_URL. Proves the core rule end-to-end: one logical UI
 * mutation → one queued sync operation → one remote application. The queue is
 * persisted so an offline queue survives reload; flush is idempotent by eventId
 * (duplicate delivery applies once); a stale baseRevision is a conflict, never a
 * silent last-write-wins.
 */
import type { RepositoryStorage } from '../repository/shadowRepository';

export const BATTLE_SYNC_QUEUE_NAMESPACE = 'campaign-timeline-vtt:universal-sync-queue:v1';
export const BATTLE_SYNC_REMOTE_NAMESPACE = 'campaign-timeline-vtt:universal-sync-remote:v1';

export interface BattleSyncOp {
  campaignId: string;
  battleId: string;
  baseRevision: number;
  candidateRevision: number;
  snapshotHash: string;
  eventId: string;
  occurredAt: string;
}

function queueKey(campaignId: string): string {
  return `${BATTLE_SYNC_QUEUE_NAMESPACE}:${campaignId}`;
}
function remoteKey(campaignId: string, battleId: string): string {
  return `${BATTLE_SYNC_REMOTE_NAMESPACE}:${campaignId}:${battleId}`;
}

function readQueue(storage: RepositoryStorage, campaignId: string): BattleSyncOp[] {
  try {
    return JSON.parse(storage.getItem(queueKey(campaignId)) || '[]') as BattleSyncOp[];
  } catch {
    return [];
  }
}
function writeQueue(storage: RepositoryStorage, campaignId: string, ops: BattleSyncOp[]): void {
  storage.setItem(queueKey(campaignId), JSON.stringify(ops));
}

/** Enqueue exactly one sync op for a mutation (persisted). */
export function enqueueBattleSync(storage: RepositoryStorage, op: BattleSyncOp): void {
  const ops = readQueue(storage, op.campaignId);
  ops.push(op);
  writeQueue(storage, op.campaignId, ops);
}

export function syncPending(storage: RepositoryStorage, campaignId: string): number {
  return readQueue(storage, campaignId).length;
}

interface RemoteRecord {
  revision: number;
  hash: string;
  appliedEvents: string[];
}

function readRemote(storage: RepositoryStorage, campaignId: string, battleId: string): RemoteRecord | null {
  try {
    return JSON.parse(storage.getItem(remoteKey(campaignId, battleId)) || 'null') as RemoteRecord | null;
  } catch {
    return null;
  }
}

export function remoteRevision(storage: RepositoryStorage, campaignId: string, battleId: string): number {
  return readRemote(storage, campaignId, battleId)?.revision ?? 0;
}

export type SyncApplyStatus = 'applied' | 'duplicate' | 'conflict';
export interface SyncFlushResult {
  attempted: number;
  applied: number;
  duplicates: number;
  conflicts: number;
  remaining: number;
  statuses: SyncApplyStatus[];
}

/**
 * Flush the queue against the local mock remote. Each op:
 *  - duplicate eventId → applied once (idempotent), dropped from queue;
 *  - stale baseRevision → conflict, LEFT in queue (no silent overwrite);
 *  - otherwise applied, remote advanced, dropped from queue.
 * `online=false` is a no-op (queue persists).
 */
export function flushBattleSync(
  storage: RepositoryStorage,
  campaignId: string,
  online = true,
): SyncFlushResult {
  const result: SyncFlushResult = { attempted: 0, applied: 0, duplicates: 0, conflicts: 0, remaining: 0, statuses: [] };
  if (!online) {
    result.remaining = syncPending(storage, campaignId);
    return result;
  }
  const ops = readQueue(storage, campaignId);
  const remaining: BattleSyncOp[] = [];
  for (const op of ops) {
    result.attempted += 1;
    const remote = readRemote(storage, campaignId, op.battleId);
    if (remote?.appliedEvents.includes(op.eventId)) {
      result.duplicates += 1;
      result.statuses.push('duplicate');
      continue; // idempotent: drop, do not re-apply
    }
    const currentRevision = remote?.revision ?? 0;
    // Conflict only when the remote is AHEAD of the base this op was formed on
    // (a genuine divergence). A remote that is behind (e.g. sync enabled after
    // some durable history) is fast-forwarded to the candidate — never a silent
    // last-write-wins, because a remote ahead is always reported as a conflict.
    if (currentRevision > op.baseRevision) {
      result.conflicts += 1;
      result.statuses.push('conflict');
      remaining.push(op); // keep for reconciliation; never silently overwrite
      continue;
    }
    const next: RemoteRecord = {
      revision: op.candidateRevision,
      hash: op.snapshotHash,
      appliedEvents: [...(remote?.appliedEvents ?? []), op.eventId],
    };
    storage.setItem(remoteKey(campaignId, op.battleId), JSON.stringify(next));
    result.applied += 1;
    result.statuses.push('applied');
  }
  writeQueue(storage, campaignId, remaining);
  result.remaining = remaining.length;
  return result;
}

/** Total sync operations ever applied to the remote for a campaign. */
export function remoteAppliedCount(storage: RepositoryStorage, campaignId: string): number {
  const prefix = `${BATTLE_SYNC_REMOTE_NAMESPACE}:${campaignId}:`;
  let count = 0;
  for (const key of storage.keys()) {
    if (!key.startsWith(prefix)) continue;
    try {
      const rec = JSON.parse(storage.getItem(key) || 'null') as RemoteRecord | null;
      count += rec?.appliedEvents.length ?? 0;
    } catch {
      /* skip */
    }
  }
  return count;
}

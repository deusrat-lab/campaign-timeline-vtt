/**
 * Stage 17 — universal, campaign-scoped sync contract + local reference
 * transport.
 *
 * This is a PROTOCOL and an in-memory reference implementation only. It performs
 * NO network I/O — there is no fetch, no `API_BASE_URL`, no server call. It exists
 * so the sync semantics (expected revision, idempotency, conflict, retry, offline
 * queue, reconciliation) can be proven locally without touching production.
 *
 * Last-write-wins is never silent: a push whose `baseRevision` is stale returns
 * an explicit `conflict` the caller must reconcile.
 */
import type { CampaignId } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import { snapshotHash } from '../portability/portability';

export interface SyncEnvelope {
  campaignId: CampaignId;
  schemaVersion: string;
  /** Revision the client believes the server is currently at. */
  baseRevision: number;
  /** Revision this push would move the campaign to. */
  candidateRevision: number;
  snapshotHash: string;
  eventId: string;
  clientId: string;
  occurredAt: string;
  snapshot: CampaignSnapshot;
}

export type PushStatus = 'applied' | 'conflict' | 'duplicate';
export interface PushResult {
  status: PushStatus;
  campaignId: CampaignId;
  serverRevision: number;
  serverHash: string;
}

export type PullStatus = 'up-to-date' | 'behind' | 'unknown-campaign';
export interface PullResult {
  status: PullStatus;
  campaignId: CampaignId;
  serverRevision: number;
  serverHash?: string;
  snapshot?: CampaignSnapshot;
}

export type ReconcileState = 'equal' | 'local_ahead' | 'remote_ahead' | 'diverged';

export function reconcile(local: { revision: number; hash: string }, remote: { revision: number; hash: string }): ReconcileState {
  if (local.revision === remote.revision) return local.hash === remote.hash ? 'equal' : 'diverged';
  return local.revision > remote.revision ? 'local_ahead' : 'remote_ahead';
}

interface CampaignRecord {
  revision: number;
  hash: string;
  snapshot: CampaignSnapshot;
  appliedEvents: Set<string>;
}

/**
 * In-memory reference server. Campaign-scoped, idempotent, revision-guarded.
 * `flaky` optionally fails the first N pushes to exercise retry.
 */
export class MockSyncServer {
  private readonly records = new Map<string, CampaignRecord>();
  private failuresRemaining: number;
  public networkCalls = 0; // always local; asserted to be the only "transport"

  constructor(options?: { flakyFailures?: number }) {
    this.failuresRemaining = options?.flakyFailures ?? 0;
  }

  push(envelope: SyncEnvelope): PushResult {
    this.networkCalls += 1;
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error('transient transport failure');
    }
    const key = String(envelope.campaignId);
    const record = this.records.get(key);

    if (record?.appliedEvents.has(envelope.eventId)) {
      return { status: 'duplicate', campaignId: envelope.campaignId, serverRevision: record.revision, serverHash: record.hash };
    }
    const currentRevision = record?.revision ?? 0;
    if (envelope.baseRevision !== currentRevision) {
      return { status: 'conflict', campaignId: envelope.campaignId, serverRevision: currentRevision, serverHash: record?.hash ?? '' };
    }
    const next: CampaignRecord = {
      revision: envelope.candidateRevision,
      hash: envelope.snapshotHash,
      snapshot: envelope.snapshot,
      appliedEvents: new Set(record?.appliedEvents ?? []),
    };
    next.appliedEvents.add(envelope.eventId);
    this.records.set(key, next);
    return { status: 'applied', campaignId: envelope.campaignId, serverRevision: next.revision, serverHash: next.hash };
  }

  pull(campaignId: CampaignId, baseRevision: number): PullResult {
    this.networkCalls += 1;
    const record = this.records.get(String(campaignId));
    if (!record) return { status: 'unknown-campaign', campaignId, serverRevision: 0 };
    if (record.revision === baseRevision) {
      return { status: 'up-to-date', campaignId, serverRevision: record.revision, serverHash: record.hash };
    }
    return { status: 'behind', campaignId, serverRevision: record.revision, serverHash: record.hash, snapshot: record.snapshot };
  }
}

/** Build a push envelope for a snapshot at a given base revision. */
export function makeSyncEnvelope(
  snapshot: CampaignSnapshot,
  baseRevision: number,
  clientId: string,
  eventId: string,
): SyncEnvelope {
  return {
    campaignId: snapshot.metadata.campaignId,
    schemaVersion: String(snapshot.schemaVersion),
    baseRevision,
    candidateRevision: snapshot.revision,
    snapshotHash: snapshotHash(snapshot),
    eventId,
    clientId,
    occurredAt: new Date(0).toISOString(),
    snapshot,
  };
}

/**
 * Offline-capable sync client. Pushes are queued while offline and flushed in
 * order once online; each carries a stable eventId so a retried/duplicated push
 * is idempotent server-side. One logical mutation → one queued operation.
 */
export class OfflineSyncClient {
  private readonly queue: SyncEnvelope[] = [];
  public online = true;
  private readonly server: MockSyncServer;
  public readonly clientId: string;

  constructor(server: MockSyncServer, clientId: string) {
    this.server = server;
    this.clientId = clientId;
  }

  enqueue(envelope: SyncEnvelope): void {
    this.queue.push(envelope);
  }

  pending(): number {
    return this.queue.length;
  }

  /** Flush the queue with bounded retry. Returns the per-op results. */
  flush(maxRetriesPerOp = 3): PushResult[] {
    if (!this.online) return [];
    const results: PushResult[] = [];
    while (this.queue.length > 0) {
      const envelope = this.queue[0];
      let attempt = 0;
      let result: PushResult | null = null;
      while (attempt <= maxRetriesPerOp) {
        try {
          result = this.server.push(envelope);
          break;
        } catch {
          attempt += 1;
        }
      }
      if (!result) return results; // exhausted retries; leave op queued
      results.push(result);
      this.queue.shift();
    }
    return results;
  }
}

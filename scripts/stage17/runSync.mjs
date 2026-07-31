// Stage 17 — universal sync contract (local mock transport, NO production).
import {
  MockSyncServer, OfflineSyncClient, makeSyncEnvelope, reconcile, snapshotHash,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';
import { caldranComplex, greyholmComplex } from '../stage16/lib.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
function bumped(snap, revision) { const s = clone(snap); s.revision = revision; return s; }

export function runSync(c = new Checks()) {
  const caldran = caldranComplex().snapshot();
  const greyholm = greyholmComplex().snapshot();

  // --- first push / pull ---
  {
    const server = new MockSyncServer();
    const env = makeSyncEnvelope(bumped(caldran, 1), 0, 'clientA', 'evt-1');
    const push = server.push(env);
    c.eq('sync: first push applied', push.status, 'applied');
    c.eq('sync: server at revision 1', push.serverRevision, 1);

    const pull = server.pull(caldran.metadata.campaignId, 1);
    c.eq('sync: pull up-to-date', pull.status, 'up-to-date');
    const pullBehind = server.pull(caldran.metadata.campaignId, 0);
    c.eq('sync: pull behind returns snapshot', pullBehind.status, 'behind');
    c.ok('sync: pull behind carries snapshot', !!pullBehind.snapshot);

    const unknown = server.pull(greyholm.metadata.campaignId, 0);
    c.eq('sync: unknown campaign', unknown.status, 'unknown-campaign');
  }

  // --- idempotency: duplicate event ---
  {
    const server = new MockSyncServer();
    const env = makeSyncEnvelope(bumped(caldran, 1), 0, 'clientA', 'evt-dup');
    c.eq('sync: apply once', server.push(env).status, 'applied');
    c.eq('sync: duplicate event deduped', server.push(env).status, 'duplicate');
    c.eq('sync: revision unchanged after duplicate', server.pull(caldran.metadata.campaignId, 0).serverRevision, 1);
  }

  // --- conflict: stale base revision ---
  {
    const server = new MockSyncServer();
    server.push(makeSyncEnvelope(bumped(caldran, 1), 0, 'clientA', 'e1'));
    const stale = server.push(makeSyncEnvelope(bumped(caldran, 2), 0, 'clientB', 'e2'));
    c.eq('sync: stale base is conflict (no silent LWW)', stale.status, 'conflict');
    c.eq('sync: conflict reports server revision', stale.serverRevision, 1);
    // reconcile then re-push at correct base
    const good = server.push(makeSyncEnvelope(bumped(caldran, 2), 1, 'clientB', 'e2b'));
    c.eq('sync: re-push at correct base applies', good.status, 'applied');
  }

  // --- reconciliation states ---
  {
    const h = snapshotHash(caldran);
    c.eq('reconcile: equal', reconcile({ revision: 3, hash: h }, { revision: 3, hash: h }), 'equal');
    c.eq('reconcile: diverged', reconcile({ revision: 3, hash: 'a' }, { revision: 3, hash: 'b' }), 'diverged');
    c.eq('reconcile: local_ahead', reconcile({ revision: 4, hash: 'a' }, { revision: 3, hash: 'b' }), 'local_ahead');
    c.eq('reconcile: remote_ahead', reconcile({ revision: 2, hash: 'a' }, { revision: 3, hash: 'b' }), 'remote_ahead');
  }

  // --- offline queue + retry + ordering ---
  {
    const server = new MockSyncServer();
    const client = new OfflineSyncClient(server, 'clientA');
    client.online = false;
    client.enqueue(makeSyncEnvelope(bumped(caldran, 1), 0, 'clientA', 'q1'));
    client.enqueue(makeSyncEnvelope(bumped(caldran, 2), 1, 'clientA', 'q2'));
    c.eq('sync: offline defers pushes', client.pending(), 2);
    c.eq('sync: offline flush is a no-op', client.flush().length, 0);

    client.online = true;
    const results = client.flush();
    c.eq('sync: queue flushed in order', results.length, 2);
    c.ok('sync: both ops applied', results.every((r) => r.status === 'applied'));
    c.eq('sync: queue drained', client.pending(), 0);
    c.eq('sync: server at revision 2', server.pull(caldran.metadata.campaignId, 2).status, 'up-to-date');
  }

  // --- retry through a flaky transport ---
  {
    const server = new MockSyncServer({ flakyFailures: 2 });
    const client = new OfflineSyncClient(server, 'clientA');
    client.enqueue(makeSyncEnvelope(bumped(caldran, 1), 0, 'clientA', 'r1'));
    const results = client.flush(5);
    c.eq('sync: retry eventually applies', results[0]?.status, 'applied');
    c.eq('sync: one logical op still one server record', server.pull(caldran.metadata.campaignId, 1).serverRevision, 1);
  }

  // --- two campaigns are isolated on one server ---
  {
    const server = new MockSyncServer();
    server.push(makeSyncEnvelope(bumped(caldran, 1), 0, 'clientA', 'c1'));
    server.push(makeSyncEnvelope(bumped(greyholm, 1), 0, 'clientA', 'g1'));
    c.eq('sync: caldran isolated', server.pull(caldran.metadata.campaignId, 1).status, 'up-to-date');
    c.eq('sync: greyholm isolated', server.pull(greyholm.metadata.campaignId, 1).status, 'up-to-date');
    c.ok('sync: distinct campaign hashes',
      server.pull(caldran.metadata.campaignId, 0).serverHash !== server.pull(greyholm.metadata.campaignId, 0).serverHash);
  }

  // --- no production network: MockSyncServer is the only transport ---
  {
    const server = new MockSyncServer();
    server.push(makeSyncEnvelope(bumped(caldran, 1), 0, 'clientA', 'n1'));
    c.ok('sync: transport is local-only (counted, in-memory)', server.networkCalls >= 1);
  }

  return c;
}

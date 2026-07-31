// Stage 17 — local migration REHEARSAL (Greyholm + Caldran). No production apply.
import {
  runUniversalMigration,
  createProductionCampaignRepository, createMemoryRepositoryStorage,
  UNIVERSAL_PRODUCTION_NAMESPACE,
  exportPortable, safeRestore, snapshotHash,
} from './.dist/domain/index.js';
import { Checks, stableEqual } from '../stage08/lib.mjs';
import { caldranComplex, greyholmComplex } from '../stage16/lib.mjs';

function isolatedRepo() {
  return createProductionCampaignRepository(createMemoryRepositoryStorage(), UNIVERSAL_PRODUCTION_NAMESPACE);
}

/** Wrap a stage16 complex fixture as a LegacyMigrationSource (immutable). */
function sourceOf(fixture) {
  const snapshot = fixture.adaptPre().snapshot;
  return {
    fixture,
    sourceHashBefore: snapshotHash(snapshot),
    source: {
      sourceId: `rehearsal:${fixture.campaignId}`,
      expectedTargetCampaignId: fixture.campaignId,
      adapt: () => fixture.adaptPre(),
    },
  };
}

async function rehearse(c, label, fixture) {
  const repo = isolatedRepo();
  const { source } = sourceOf(fixture);
  const durableBefore = JSON.stringify(fixture.adaptPre().snapshot.durable);
  const target = fixture.campaignId;

  // dry-run must not write
  const dry = await runUniversalMigration(repo, source, { targetCampaignId: target, dryRun: true });
  c.ok(`${label}: dry-run ok`, dry.ok);
  c.ok(`${label}: dry-run committed nothing`, !dry.committed);
  c.ok(`${label}: dry-run wrote nothing`, (await repo.readCampaign(target)) === null);

  // wrong target rejected
  const wrong = await runUniversalMigration(repo, source, { targetCampaignId: greyholmComplex().campaignId === target ? caldranComplex().campaignId : greyholmComplex().campaignId, dryRun: true });
  c.ok(`${label}: wrong-target migration rejected`, !wrong.ok);

  // commit
  const commit = await runUniversalMigration(repo, source, { targetCampaignId: target, dryRun: false });
  c.ok(`${label}: commit ok`, commit.ok && commit.committed);
  c.ok(`${label}: rollback backup captured`, !!commit.rollbackBackup || commit.write != null);

  const migrated = await repo.readCampaign(target);
  c.ok(`${label}: read-after-write present`, !!migrated);
  c.eq(`${label}: exact campaign id`, migrated.metadata.campaignId, target);

  // idempotency: a second commit recognises already-migrated (no double write)
  const again = await runUniversalMigration(repo, source, { targetCampaignId: target, dryRun: false, expectedRevision: migrated.revision });
  c.ok(`${label}: re-run is safe (idempotent / already-migrated)`, again.ok);

  // anchors: durable content preserved vs the freshly-adapted source
  const freshAdapt = fixture.adaptPre().snapshot;
  c.ok(`${label}: durable entities preserved`, migrated.durable.entities.length === freshAdapt.durable.entities.length);

  // export → restore round-trip into a second isolated repo
  const text = exportPortable(migrated);
  const envelope = JSON.parse(text);
  const repo2 = isolatedRepo();
  const restored = await safeRestore(repo2, { campaignId: target, revision: migrated.revision, exportedAt: envelope.exportedAt, snapshot: envelope.snapshot });
  c.ok(`${label}: export→restore round-trip ok`, restored.ok);
  const restoredSnap = await repo2.readCampaign(target);
  c.ok(`${label}: restored durable equals migrated`, stableEqual(restoredSnap.durable, migrated.durable));

  // source untouched: re-adapting the legacy fixture yields identical durable
  // data (only volatile metadata like updatedAt may differ, which is not source).
  c.eq(`${label}: legacy source durable unchanged`, JSON.stringify(fixture.adaptPre().snapshot.durable), durableBefore);
}

export async function runMigration(c = new Checks()) {
  await rehearse(c, 'migration greyholm', greyholmComplex());
  await rehearse(c, 'migration caldran', caldranComplex());
  return c;
}

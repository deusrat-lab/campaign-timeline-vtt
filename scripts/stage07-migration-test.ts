import {
  createCampaignSnapshot,
  createMemoryRepositoryStorage,
  createShadowCampaignRepository,
  defaultCapabilities,
  makeCampaignId,
  makeRevision,
  makeSchemaVersion,
  rollbackUniversalMigration,
  runUniversalMigration,
} from '../src/domain';
import type { AdapterResult, CampaignSnapshot, LegacyMigrationSource } from '../src/domain';

async function main(): Promise<void> {
  const storage = createMemoryRepositoryStorage();
  const repository = createShadowCampaignRepository(storage);
  const greyholmId = makeCampaignId('camp:greyholm:main');
  const kaldranId = makeCampaignId('camp:user:kaldran-captivity');

  const greyholm = source('greyholm', makeSnapshot(greyholmId, 'Greyholm'));
  const kaldran = source('kaldran', makeSnapshot(kaldranId, 'Kaldran'));

  const dryRun = await runUniversalMigration(repository, greyholm, { targetCampaignId: greyholmId, dryRun: true });
  assert(dryRun.ok && dryRun.dryRun && !dryRun.committed, 'dry-run succeeds without commit');
  assertEqual(await repository.readCampaign(greyholmId), null, 'dry-run does not persist');

  const mismatch = await runUniversalMigration(repository, greyholm, { targetCampaignId: kaldranId, dryRun: true });
  assert(!mismatch.ok && mismatch.diagnostics.some((item) => item.includes('target campaign mismatch')), 'explicit target required');

  const committed = await runUniversalMigration(repository, greyholm, { targetCampaignId: greyholmId, dryRun: false });
  assert(committed.ok && committed.committed && committed.write?.newRevision === makeRevision(1), 'commit persists snapshot');
  assertEqual((await repository.readCampaign(greyholmId))?.metadata.title, 'Greyholm', 'read-back after commit');

  const repeated = await runUniversalMigration(repository, greyholm, { targetCampaignId: greyholmId, dryRun: false });
  assert(repeated.ok && repeated.alreadyMigrated && !repeated.committed, 'idempotent rerun reports already migrated');
  assertEqual((await repository.readCampaign(greyholmId))?.revision, makeRevision(1), 'idempotent rerun does not bump revision');

  await runUniversalMigration(repository, kaldran, { targetCampaignId: kaldranId, dryRun: false });
  assertEqual((await repository.listCampaigns()).length, 2, 'Greyholm and Kaldran migrate');

  const changedGreyholm = source('greyholm', makeSnapshot(greyholmId, 'Greyholm changed'));
  const update = await runUniversalMigration(repository, changedGreyholm, { targetCampaignId: greyholmId, dryRun: false, expectedRevision: makeRevision(1) });
  assert(update.ok && update.rollbackBackup?.revision === makeRevision(1) && update.write?.newRevision === makeRevision(2), 'safe update creates backup');

  const rollback = await rollbackUniversalMigration(repository, requireBackup(update.rollbackBackup), makeRevision(2));
  assertEqual(rollback.newRevision, makeRevision(1), 'rollback returns previous revision');
  assertEqual((await repository.readCampaign(greyholmId))?.metadata.title, 'Greyholm', 'rollback restores backup content');
  assertEqual((await repository.readCampaign(kaldranId))?.metadata.title, 'Kaldran', 'rollback does not delete unrelated campaign');

  const keys = storage.keys().join('\n');
  assert(keys.includes(String(greyholmId)) && keys.includes(String(kaldranId)), 'campaign-scoped storage keys');
}

function source(sourceId: string, snapshot: CampaignSnapshot): LegacyMigrationSource {
  return {
    sourceId,
    expectedTargetCampaignId: snapshot.metadata.campaignId,
    adapt: (): AdapterResult => ({
      snapshot,
      source: { kind: 'synthetic', sourceId },
      classifications: [],
      diagnostics: [],
    }),
  };
}

function makeSnapshot(campaignId: ReturnType<typeof makeCampaignId>, title: string): CampaignSnapshot {
  return createCampaignSnapshot({
    schemaVersion: makeSchemaVersion('1.0.0'),
    revision: makeRevision(0),
    metadata: {
      campaignId,
      title,
      kind: title === 'Greyholm' || title === 'Greyholm changed' ? 'greyholm' : 'campaign',
      createdAt: '1970-01-01T00:00:00.000Z',
      updatedAt: '1970-01-01T00:00:00.000Z',
      sources: [{ kind: 'synthetic', sourceId: title }],
    },
    capabilities: defaultCapabilities(),
    durable: {
      maps: [],
      hotspots: [],
      placements: [],
      routes: [],
      entities: [],
      battleMaps: [],
      battleEntries: [],
      timeline: {},
      calendar: {},
      travel: {},
      economy: {},
      extensions: {},
    },
    runtime: {
      campaignId,
      party: {},
      presentation: {},
      battles: {},
      questStatuses: {},
      locationStatuses: {},
      extensions: {},
    },
    extensions: {},
    migrationMetadata: [],
  });
}

function requireBackup<T>(backup: T | undefined): T {
  if (!backup) throw new Error('Expected rollback backup.');
  return backup;
}

function assert(value: boolean, label: string): void {
  if (!value) throw new Error(label);
}

function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

main()
  .then(() => console.log(JSON.stringify({ ok: true, cases: 11 })))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });

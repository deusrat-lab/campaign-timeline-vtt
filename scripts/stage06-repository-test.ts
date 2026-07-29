import {
  createCampaignSnapshot,
  createMemoryRepositoryStorage,
  createProductionCampaignRepository,
  createShadowCampaignRepository,
  defaultCapabilities,
  makeCampaignId,
  makeRevision,
  makeSchemaVersion,
  serializeCampaignSnapshot,
  UNIVERSAL_SHADOW_NAMESPACE,
} from '../src/domain';
import type { CampaignSnapshot, RepositoryError } from '../src/domain';

const campaignId = makeCampaignId('campaign:test-stage06');
const otherCampaignId = makeCampaignId('campaign:test-other');

async function main(): Promise<void> {
  const storage = createMemoryRepositoryStorage();
  const shadow = createShadowCampaignRepository(storage);
  const production = createProductionCampaignRepository(storage);
  const snapshot = makeSnapshot(campaignId, 'Stage 6');

  assertEqual(shadow.namespace, UNIVERSAL_SHADOW_NAMESPACE, 'shadow namespace');
  assertEqual((await shadow.readCampaign(campaignId)), null, 'unknown campaign returns null');

  const created = await shadow.createCampaign(snapshot);
  assertEqual(created.expectedRevision, makeRevision(0), 'create expected revision');
  assertEqual(created.currentRevision, makeRevision(0), 'create current revision');
  assertEqual(created.newRevision, makeRevision(1), 'create new revision');
  assertEqual((await shadow.listCampaigns()).length, 1, 'list after create');

  const read = await shadow.readCampaign(campaignId);
  assert(read !== null, 'created snapshot read');
  const createdSnapshot = requireSnapshot(read);
  assertEqual(createdSnapshot.revision, makeRevision(1), 'read revision');
  assertSameTopLevelKeys(snapshot, createdSnapshot, 'snapshot top-level round-trip');

  createdSnapshot.metadata.title = 'Detached mutation';
  assertEqual((await shadow.readCampaign(campaignId))?.metadata.title, 'Stage 6', 'detached read deep clone');

  await shadow.replaceCampaign({ ...snapshot, metadata: { ...snapshot.metadata, title: 'Overwrite' } }, makeRevision(1));
  assertEqual((await shadow.readCampaign(campaignId))?.metadata.title, 'Overwrite', 'overwrite');
  await expectRepositoryError(
    () => shadow.replaceCampaign(snapshot, makeRevision(1)),
    'CONFLICT',
    'stale write conflict',
  );

  const runtime = await shadow.readRuntime(campaignId);
  assert(runtime !== null, 'runtime read');
  const existingRuntime = requireRuntime(runtime);
  await shadow.saveRuntime(campaignId, { ...existingRuntime, activeMapId: undefined }, makeRevision(2));
  await expectRepositoryError(
    () => shadow.saveRuntime(campaignId, existingRuntime, makeRevision(2)),
    'CONFLICT',
    'stale runtime write conflict',
  );

  const exported = await shadow.exportCampaign(campaignId);
  const exportedSource = await shadow.readCampaign(campaignId);
  assert(exportedSource !== null, 'export source exists');
  assertSameTopLevelKeys(requireSnapshot(exportedSource), JSON.parse(exported) as CampaignSnapshot, 'export top-level keys');

  const backup = await shadow.backupCampaign(campaignId);
  await shadow.deleteCampaign(campaignId, makeRevision(3));
  assertEqual(await shadow.readCampaign(campaignId), null, 'delete campaign');
  await shadow.restoreCampaign(backup);
  assertEqual((await shadow.readCampaign(campaignId))?.metadata.title, 'Overwrite', 'restore backup');

  const isolated = createShadowCampaignRepository(storage, 'campaign-timeline-vtt:universal-shadow:isolated');
  assertEqual(await isolated.readCampaign(campaignId), null, 'campaign isolation by namespace');
  assertEqual(await production.readCampaign(campaignId), null, 'production namespace detached from shadow');

  await shadow.importCampaign(serializeCampaignSnapshot(makeSnapshot(otherCampaignId, 'Imported optional')));
  assertEqual((await shadow.readCampaign(otherCampaignId))?.durable.extensions?.disabledModule, false, 'optional extension round-trip');

  const keys = storage.keys();
  assert(keys.every((key) => key.startsWith(`${UNIVERSAL_SHADOW_NAMESPACE}:`) || key.startsWith('campaign-timeline-vtt:universal:')), 'no legacy storage keys');

  const campaignKey = `${UNIVERSAL_SHADOW_NAMESPACE}:campaign:${campaignId}`;
  storage.setItem(campaignKey, '{broken');
  await expectRepositoryError(() => shadow.readCampaign(campaignId), 'CORRUPT_RECORD', 'corruption');
  storage.setItem(campaignKey, JSON.stringify({ snapshot: { metadata: { campaignId } } }));
  await expectRepositoryError(() => shadow.readCampaign(campaignId), 'INVALID_SCHEMA', 'invalid schema');

  await shadow.clearCampaign(otherCampaignId);
  assertEqual(await shadow.readCampaign(otherCampaignId), null, 'clear campaign');
  await shadow.clearAllShadow();
  assertEqual(storage.keys().filter((key) => key.startsWith(`${UNIVERSAL_SHADOW_NAMESPACE}:`)).length, 0, 'clear all shadow');
}

function makeSnapshot(id: ReturnType<typeof makeCampaignId>, title: string): CampaignSnapshot {
  return createCampaignSnapshot({
    schemaVersion: makeSchemaVersion('1.0.0'),
    revision: makeRevision(0),
    metadata: {
      campaignId: id,
      title,
      kind: 'campaign',
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
      extensions: {
        undefinedField: undefined,
        emptyArray: [],
        missingModule: null,
        disabledModule: false,
        nonEmptyOptionalModule: { enabled: true },
        unknownPreservedFields: { x: 1 },
      },
    },
    runtime: {
      campaignId: id,
      party: {},
      presentation: {},
      battles: {},
      questStatuses: {},
      locationStatuses: {},
      extensions: {},
    },
    extensions: {
      extensionData: { preserved: true },
    },
    migrationMetadata: [],
  });
}

async function expectRepositoryError(
  action: () => Promise<unknown>,
  code: RepositoryError['code'],
  label: string,
): Promise<void> {
  try {
    await action();
  } catch (error) {
    if (isRepositoryError(error) && error.code === code) return;
    throw new Error(`${label}: expected ${code}, got ${JSON.stringify(error)}`);
  }
  throw new Error(`${label}: expected ${code}, got success`);
}

function assertSameTopLevelKeys(expected: CampaignSnapshot, actual: CampaignSnapshot, label: string): void {
  assertEqual(Object.keys(actual).sort().join(','), Object.keys(expected).sort().join(','), label);
}

function isRepositoryError(error: unknown): error is RepositoryError {
  return !!error && typeof error === 'object' && typeof (error as RepositoryError).code === 'string';
}

function requireSnapshot(snapshot: CampaignSnapshot | null): CampaignSnapshot {
  if (!snapshot) throw new Error('Expected snapshot.');
  return snapshot;
}

function requireRuntime(runtime: CampaignSnapshot['runtime'] | null): CampaignSnapshot['runtime'] {
  if (!runtime) throw new Error('Expected runtime.');
  return runtime;
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
  .then(() => console.log(JSON.stringify({ ok: true, cases: 15 })))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });

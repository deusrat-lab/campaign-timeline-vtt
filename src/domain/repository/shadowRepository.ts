import { makeRevision, type CampaignId, type UniversalRevision } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import type { CampaignRuntime } from '../runtime/types';
import { parseCampaignSnapshotJson, serializeCampaignSnapshot } from '../persistence/serialization';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import type {
  CampaignBackup,
  CampaignSummary,
  RepositoryError,
  RepositoryErrorCode,
  RevisionWriteResult,
  UniversalCampaignRepository,
} from './types';

export const UNIVERSAL_SHADOW_NAMESPACE = 'campaign-timeline-vtt:universal-shadow:v1';
export const UNIVERSAL_PRODUCTION_NAMESPACE = 'campaign-timeline-vtt:universal:v1';

export interface RepositoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  keys(): string[];
}

interface PersistedCampaignRecord {
  snapshot: CampaignSnapshot;
}

export function createMemoryRepositoryStorage(seed?: Record<string, string>): RepositoryStorage {
  const records = new Map(Object.entries(seed ?? {}));
  return {
    getItem: (key) => records.get(key) ?? null,
    setItem: (key, value) => records.set(key, value),
    removeItem: (key) => records.delete(key),
    keys: () => Array.from(records.keys()).sort(),
  };
}

export function createBrowserRepositoryStorage(storage: Storage): RepositoryStorage {
  return {
    getItem: (key) => storage.getItem(key),
    setItem: (key, value) => storage.setItem(key, value),
    removeItem: (key) => storage.removeItem(key),
    keys: () => {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key) keys.push(key);
      }
      return keys.sort();
    },
  };
}

export function createShadowCampaignRepository(
  storage: RepositoryStorage,
  namespace = UNIVERSAL_SHADOW_NAMESPACE,
): UniversalCampaignRepository & { clearAllShadow(): Promise<void>; clearCampaign(campaignId: CampaignId): Promise<void> } {
  const repository = createCampaignRepository(storage, namespace, true);
  if (!repository.clearAllShadow || !repository.clearCampaign) {
    throw new Error('Shadow repository utilities were not created.');
  }
  return repository as UniversalCampaignRepository & { clearAllShadow(): Promise<void>; clearCampaign(campaignId: CampaignId): Promise<void> };
}

export function createProductionCampaignRepository(
  storage: RepositoryStorage,
  namespace = UNIVERSAL_PRODUCTION_NAMESPACE,
): UniversalCampaignRepository {
  return createCampaignRepository(storage, namespace, false);
}

function createCampaignRepository(
  storage: RepositoryStorage,
  namespace: string,
  shadowUtilities: boolean,
): UniversalCampaignRepository & { clearAllShadow?: () => Promise<void>; clearCampaign?: (campaignId: CampaignId) => Promise<void> } {
  const indexKey = `${namespace}:index`;
  const campaignKey = (campaignId: CampaignId) => `${namespace}:campaign:${campaignId}`;

  async function listCampaigns(): Promise<CampaignSummary[]> {
    return readIndex(storage, indexKey).map((summary) => clone(summary));
  }

  async function readCampaign(campaignId: CampaignId): Promise<CampaignSnapshot | null> {
    const record = readRecord(storage, campaignKey(campaignId), campaignId);
    return record ? clone(record.snapshot) : null;
  }

  async function createCampaign(snapshot: CampaignSnapshot): Promise<RevisionWriteResult> {
    const campaignId = snapshot.metadata.campaignId;
    if (storage.getItem(campaignKey(campaignId)) !== null) {
      throw repositoryError('ALREADY_EXISTS', `Campaign already exists: ${campaignId}`, campaignId);
    }
    const newRevision = makeRevision(1);
    const stored = withRevision(snapshot, newRevision);
    writeRecord(storage, indexKey, campaignKey(campaignId), stored);
    return { campaignId, expectedRevision: makeRevision(0), currentRevision: makeRevision(0), newRevision };
  }

  async function replaceCampaign(snapshot: CampaignSnapshot, expectedRevision: UniversalRevision): Promise<RevisionWriteResult> {
    const campaignId = snapshot.metadata.campaignId;
    const current = requireRecord(storage, campaignKey(campaignId), campaignId);
    assertRevision(campaignId, expectedRevision, current.snapshot.revision);
    const newRevision = makeRevision(current.snapshot.revision + 1);
    writeRecord(storage, indexKey, campaignKey(campaignId), withRevision(snapshot, newRevision));
    return { campaignId, expectedRevision, currentRevision: current.snapshot.revision, newRevision };
  }

  async function updateCampaign(
    campaignId: CampaignId,
    expectedRevision: UniversalRevision,
    updater: (snapshot: CampaignSnapshot) => CampaignSnapshot,
  ): Promise<RevisionWriteResult> {
    const current = requireRecord(storage, campaignKey(campaignId), campaignId);
    assertRevision(campaignId, expectedRevision, current.snapshot.revision);
    const next = updater(clone(current.snapshot));
    if (next.metadata.campaignId !== campaignId) {
      throw repositoryError('CAMPAIGN_ID_MISMATCH', 'Updated snapshot changed campaign id.', campaignId);
    }
    return replaceCampaign(next, expectedRevision);
  }

  async function deleteCampaign(campaignId: CampaignId, expectedRevision: UniversalRevision): Promise<RevisionWriteResult> {
    const current = requireRecord(storage, campaignKey(campaignId), campaignId);
    assertRevision(campaignId, expectedRevision, current.snapshot.revision);
    storage.removeItem(campaignKey(campaignId));
    writeIndex(storage, indexKey, readIndex(storage, indexKey).filter((summary) => summary.campaignId !== campaignId));
    const newRevision = makeRevision(current.snapshot.revision + 1);
    return { campaignId, expectedRevision, currentRevision: current.snapshot.revision, newRevision };
  }

  async function readRuntime(campaignId: CampaignId): Promise<CampaignRuntime | null> {
    const snapshot = await readCampaign(campaignId);
    return snapshot ? clone(snapshot.runtime) : null;
  }

  async function saveRuntime(campaignId: CampaignId, runtime: CampaignRuntime, expectedRevision: UniversalRevision): Promise<RevisionWriteResult> {
    return updateCampaign(campaignId, expectedRevision, (snapshot) => ({ ...snapshot, runtime: clone(runtime) }));
  }

  async function backupCampaign(campaignId: CampaignId): Promise<CampaignBackup> {
    const current = requireRecord(storage, campaignKey(campaignId), campaignId);
    return {
      campaignId,
      revision: current.snapshot.revision,
      exportedAt: new Date(0).toISOString(),
      snapshot: clone(current.snapshot),
    };
  }

  async function restoreCampaign(backup: CampaignBackup, expectedRevision?: UniversalRevision): Promise<RevisionWriteResult> {
    const current = readRecord(storage, campaignKey(backup.campaignId), backup.campaignId);
    if (current && expectedRevision === undefined) {
      throw repositoryError('CONFLICT', 'Restore requires expectedRevision for existing campaign.', backup.campaignId, undefined, current.snapshot.revision);
    }
    if (!current) {
      return createCampaign(backup.snapshot);
    }
    assertRevision(backup.campaignId, expectedRevision ?? makeRevision(0), current.snapshot.revision);
    writeRecord(storage, indexKey, campaignKey(backup.campaignId), backup.snapshot);
    return {
      campaignId: backup.campaignId,
      expectedRevision: expectedRevision ?? makeRevision(0),
      currentRevision: current.snapshot.revision,
      newRevision: backup.snapshot.revision,
    };
  }

  async function exportCampaign(campaignId: CampaignId): Promise<string> {
    const current = requireRecord(storage, campaignKey(campaignId), campaignId);
    return serializeCampaignSnapshot(current.snapshot);
  }

  async function importCampaign(serializedSnapshot: string, expectedRevision?: UniversalRevision): Promise<RevisionWriteResult> {
    const snapshot = parseSnapshot(serializedSnapshot);
    const current = readRecord(storage, campaignKey(snapshot.metadata.campaignId), snapshot.metadata.campaignId);
    if (current) {
      if (expectedRevision === undefined) {
        throw repositoryError('CONFLICT', 'Import requires expectedRevision for existing campaign.', snapshot.metadata.campaignId, undefined, current.snapshot.revision);
      }
      return replaceCampaign(snapshot, expectedRevision);
    }
    return createCampaign(snapshot);
  }

  const repository = {
    namespace,
    listCampaigns,
    readCampaign,
    createCampaign,
    replaceCampaign,
    updateCampaign,
    deleteCampaign,
    readRuntime,
    saveRuntime,
    backupCampaign,
    restoreCampaign,
    exportCampaign,
    importCampaign,
  };

  if (!shadowUtilities) return repository;
  return {
    ...repository,
    clearCampaign: async (campaignId: CampaignId) => {
      storage.removeItem(campaignKey(campaignId));
      writeIndex(storage, indexKey, readIndex(storage, indexKey).filter((summary) => summary.campaignId !== campaignId));
    },
    clearAllShadow: async () => {
      for (const key of storage.keys().filter((key) => key.startsWith(`${namespace}:`))) {
        storage.removeItem(key);
      }
    },
  };
}

function readIndex(storage: RepositoryStorage, indexKey: string): CampaignSummary[] {
  const raw = storage.getItem(indexKey);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) throw new Error('Index is not an array.');
    return parsed as CampaignSummary[];
  } catch (error) {
    throw repositoryError('CORRUPT_RECORD', `Cannot read repository index: ${String(error)}`);
  }
}

function writeIndex(storage: RepositoryStorage, indexKey: string, summaries: CampaignSummary[]): void {
  storage.setItem(indexKey, JSON.stringify(summaries));
}

function readRecord(storage: RepositoryStorage, key: string, campaignId: CampaignId): PersistedCampaignRecord | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isPersistedRecord(parsed)) {
      throw repositoryError('INVALID_SCHEMA', `Invalid persisted campaign schema: ${campaignId}`, campaignId);
    }
    const validation = validateCampaignSnapshot(parsed.snapshot);
    if (!validation.ok) {
      throw repositoryError('INVALID_SCHEMA', `Invalid campaign snapshot: ${campaignId}`, campaignId);
    }
    return parsed;
  } catch (error) {
    if (isRepositoryError(error)) throw error;
    throw repositoryError('CORRUPT_RECORD', `Cannot read campaign record: ${campaignId}`, campaignId);
  }
}

function requireRecord(storage: RepositoryStorage, key: string, campaignId: CampaignId): PersistedCampaignRecord {
  const record = readRecord(storage, key, campaignId);
  if (!record) throw repositoryError('NOT_FOUND', `Unknown campaign: ${campaignId}`, campaignId);
  return record;
}

function writeRecord(storage: RepositoryStorage, indexKey: string, key: string, snapshot: CampaignSnapshot): void {
  const validation = validateCampaignSnapshot(snapshot);
  if (!validation.ok) throw repositoryError('INVALID_SCHEMA', `Invalid campaign snapshot: ${snapshot.metadata.campaignId}`, snapshot.metadata.campaignId);
  storage.setItem(key, JSON.stringify({ snapshot }));
  const summaries = readIndex(storage, indexKey).filter((summary) => summary.campaignId !== snapshot.metadata.campaignId);
  summaries.push({
    campaignId: snapshot.metadata.campaignId,
    title: snapshot.metadata.title,
    revision: snapshot.revision,
    updatedAt: snapshot.metadata.updatedAt,
  });
  writeIndex(storage, indexKey, summaries.sort((left, right) => left.title.localeCompare(right.title)));
}

function parseSnapshot(serializedSnapshot: string): CampaignSnapshot {
  const parsed = parseCampaignSnapshotJson(serializedSnapshot);
  if (!isCampaignSnapshot(parsed)) {
    throw repositoryError('INVALID_SCHEMA', 'Imported campaign snapshot has invalid schema.');
  }
  const validation = validateCampaignSnapshot(parsed);
  if (!validation.ok) throw repositoryError('INVALID_SCHEMA', `Imported campaign snapshot failed validation: ${parsed.metadata.campaignId}`, parsed.metadata.campaignId);
  return parsed;
}

function withRevision(snapshot: CampaignSnapshot, revision: UniversalRevision): CampaignSnapshot {
  return { ...clone(snapshot), revision };
}

function assertRevision(campaignId: CampaignId, expectedRevision: UniversalRevision, currentRevision: UniversalRevision): void {
  if (expectedRevision !== currentRevision) {
    throw repositoryError('CONFLICT', `Revision conflict for campaign: ${campaignId}`, campaignId, expectedRevision, currentRevision);
  }
}

function isPersistedRecord(value: unknown): value is PersistedCampaignRecord {
  return !!value && typeof value === 'object' && isCampaignSnapshot((value as Record<string, unknown>).snapshot);
}

function isCampaignSnapshot(value: unknown): value is CampaignSnapshot {
  const record = value as Partial<CampaignSnapshot> | null;
  return !!record &&
    typeof record === 'object' &&
    !!record.metadata &&
    !!record.capabilities &&
    !!record.durable &&
    !!record.runtime &&
    !!record.visibility &&
    !!record.extensions &&
    Array.isArray(record.migrationMetadata);
}

function repositoryError(
  code: RepositoryErrorCode,
  message: string,
  campaignId?: CampaignId,
  expectedRevision?: UniversalRevision,
  currentRevision?: UniversalRevision,
): RepositoryError {
  return { code, message, campaignId, expectedRevision, currentRevision };
}

function isRepositoryError(error: unknown): error is RepositoryError {
  return !!error && typeof error === 'object' && typeof (error as RepositoryError).code === 'string';
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import { serializeCampaignSnapshot } from '../persistence/serialization';
import { compareProjectionCounts } from '../projection/projectCampaign';
import type { UniversalCampaignRepository, CampaignBackup, RevisionWriteResult } from '../repository/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import type { AdapterResult } from '../adapters/types';

export interface LegacyMigrationSource {
  sourceId: string;
  expectedTargetCampaignId: CampaignId;
  adapt(): AdapterResult;
}

export interface MigrationRunOptions {
  targetCampaignId: CampaignId;
  dryRun: boolean;
  expectedRevision?: UniversalRevision;
}

export interface MigrationRunResult {
  ok: boolean;
  dryRun: boolean;
  targetCampaignId: CampaignId;
  alreadyMigrated: boolean;
  committed: boolean;
  rollbackBackup?: CampaignBackup;
  write?: RevisionWriteResult;
  diagnostics: string[];
}

export async function runUniversalMigration(
  repository: UniversalCampaignRepository,
  source: LegacyMigrationSource,
  options: MigrationRunOptions,
): Promise<MigrationRunResult> {
  const diagnostics: string[] = [];
  if (options.targetCampaignId !== source.expectedTargetCampaignId) {
    return fail(options, [`target campaign mismatch: ${options.targetCampaignId}`]);
  }

  const adapted = source.adapt();
  if (!adapted.snapshot) return fail(options, adapted.diagnostics.map((diagnostic) => diagnostic.message));
  if (adapted.snapshot.metadata.campaignId !== options.targetCampaignId) {
    return fail(options, [`adapter returned unexpected campaign id: ${adapted.snapshot.metadata.campaignId}`]);
  }

  const validation = validateCampaignSnapshot(adapted.snapshot);
  if (!validation.ok) return fail(options, validation.issues.map((issue) => issue.message));

  const projectionParity = compareProjectionCounts(adapted.snapshot);
  if (!projectionParity.ok) return fail(options, projectionParity.differences.map((difference) => difference.message));

  const existing = await repository.readCampaign(options.targetCampaignId);
  const alreadyMigrated = existing ? sameSnapshotIgnoringRevision(existing, adapted.snapshot) : false;
  if (alreadyMigrated) {
    return { ok: true, dryRun: options.dryRun, targetCampaignId: options.targetCampaignId, alreadyMigrated: true, committed: false, diagnostics };
  }
  if (options.dryRun) {
    return { ok: true, dryRun: true, targetCampaignId: options.targetCampaignId, alreadyMigrated: false, committed: false, diagnostics };
  }

  const rollbackBackup = existing ? await repository.backupCampaign(options.targetCampaignId) : undefined;
  const write = existing
    ? await repository.replaceCampaign(adapted.snapshot, options.expectedRevision ?? existing.revision)
    : await repository.createCampaign(adapted.snapshot);
  const readBack = await repository.readCampaign(options.targetCampaignId);
  if (!readBack) return fail(options, ['read-back failed after migration commit']);
  const readBackValidation = validateCampaignSnapshot(readBack);
  if (!readBackValidation.ok) return fail(options, readBackValidation.issues.map((issue) => issue.message));

  return { ok: true, dryRun: false, targetCampaignId: options.targetCampaignId, alreadyMigrated: false, committed: true, rollbackBackup, write, diagnostics };
}

export async function rollbackUniversalMigration(
  repository: UniversalCampaignRepository,
  backup: CampaignBackup,
  expectedRevision: UniversalRevision,
): Promise<RevisionWriteResult> {
  return repository.restoreCampaign(backup, expectedRevision);
}

function sameSnapshotIgnoringRevision(left: CampaignSnapshot, right: CampaignSnapshot): boolean {
  return serializeCampaignSnapshot({ ...left, revision: right.revision }) === serializeCampaignSnapshot(right);
}

function fail(options: MigrationRunOptions, diagnostics: string[]): MigrationRunResult {
  return {
    ok: false,
    dryRun: options.dryRun,
    targetCampaignId: options.targetCampaignId,
    alreadyMigrated: false,
    committed: false,
    diagnostics,
  };
}

import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import type { CampaignRuntime } from '../runtime/types';

export type RepositoryErrorCode =
  | 'CONFLICT'
  | 'NOT_FOUND'
  | 'ALREADY_EXISTS'
  | 'CORRUPT_RECORD'
  | 'INVALID_SCHEMA'
  | 'CAMPAIGN_ID_MISMATCH';

export interface RepositoryError {
  code: RepositoryErrorCode;
  message: string;
  campaignId?: CampaignId;
  expectedRevision?: UniversalRevision;
  currentRevision?: UniversalRevision;
}

export interface CampaignSummary {
  campaignId: CampaignId;
  title: string;
  revision: UniversalRevision;
  updatedAt: string;
}

export interface RevisionWriteResult {
  campaignId: CampaignId;
  expectedRevision: UniversalRevision;
  currentRevision: UniversalRevision;
  newRevision: UniversalRevision;
}

export interface CampaignBackup {
  campaignId: CampaignId;
  revision: UniversalRevision;
  exportedAt: string;
  snapshot: CampaignSnapshot;
}

export interface UniversalCampaignRepository {
  readonly namespace: string;
  listCampaigns(): Promise<CampaignSummary[]>;
  readCampaign(campaignId: CampaignId): Promise<CampaignSnapshot | null>;
  createCampaign(snapshot: CampaignSnapshot): Promise<RevisionWriteResult>;
  replaceCampaign(snapshot: CampaignSnapshot, expectedRevision: UniversalRevision): Promise<RevisionWriteResult>;
  updateCampaign(
    campaignId: CampaignId,
    expectedRevision: UniversalRevision,
    updater: (snapshot: CampaignSnapshot) => CampaignSnapshot,
  ): Promise<RevisionWriteResult>;
  deleteCampaign(campaignId: CampaignId, expectedRevision: UniversalRevision): Promise<RevisionWriteResult>;
  readRuntime(campaignId: CampaignId): Promise<CampaignRuntime | null>;
  saveRuntime(campaignId: CampaignId, runtime: CampaignRuntime, expectedRevision: UniversalRevision): Promise<RevisionWriteResult>;
  backupCampaign(campaignId: CampaignId): Promise<CampaignBackup>;
  restoreCampaign(backup: CampaignBackup, expectedRevision?: UniversalRevision): Promise<RevisionWriteResult>;
  exportCampaign(campaignId: CampaignId): Promise<string>;
  importCampaign(serializedSnapshot: string, expectedRevision?: UniversalRevision): Promise<RevisionWriteResult>;
}

import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CampaignSourceKind } from '../campaign/source';

/**
 * Stage 9 shadow-integration lifecycle status for a single campaign. Legacy
 * stores remain authoritative — every status below is purely observational and
 * never affects the legacy save path. See rebuild-reports/stage-09.
 */
export type ShadowRunStatus =
  | 'disabled'
  | 'idle'
  | 'scheduled'
  | 'running'
  | 'success'
  | 'validation_failed'
  | 'persistence_failed'
  | 'conflict'
  | 'reload_mismatch'
  | 'adapter_failed';

/**
 * A structured, non-secret summary of one shadow pipeline run. Deliberately
 * carries only IDs / paths / counts — never the durable or DM payload itself —
 * so it is safe to surface in DM-only diagnostics without leaking secrets.
 */
export interface ShadowComparisonSummary {
  equal: boolean;
  mismatchCount: number;
  /** Up to a bounded number of dotted collection paths that differed. */
  changedPaths: string[];
  /** IDs present in the candidate but missing from the reloaded snapshot. */
  missingIds: string[];
  /** IDs present in the reloaded snapshot but not in the candidate. */
  addedIds: string[];
  /** True when the only structural difference is the persisted revision number. */
  revisionOnly: boolean;
}

export interface ShadowCampaignStatus {
  campaignId: CampaignId;
  sourceKind: CampaignSourceKind;
  status: ShadowRunStatus;
  namespace: string;
  /** ISO timestamp of the last attempted run (any outcome), or null. */
  lastAttemptAt: string | null;
  /** ISO timestamp of the last fully successful run, or null. */
  lastSuccessAt: string | null;
  /** Whether a run is currently scheduled (debouncing) or executing. */
  pending: boolean;
  running: boolean;
  candidateRevision: UniversalRevision | null;
  persistedRevision: UniversalRevision | null;
  validationErrorCount: number;
  /** Bounded, non-secret validation issue descriptions (path + message). */
  validationErrors: Array<{ path: string; message: string }>;
  adapterErrorCount: number;
  comparison: ShadowComparisonSummary | null;
  droppedCollections: string[];
  /** Category of the last error, mirrors the failing status, or null. */
  lastErrorCategory: ShadowRunStatus | null;
  lastErrorMessage: string | null;
  /** Monotonic count of runs executed for this campaign. */
  runCount: number;
}

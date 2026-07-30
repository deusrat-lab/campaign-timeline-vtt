import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CommandCampaignKind, CommandComparisonSummary } from '../command-shadow/commandShadowTypes';

/**
 * Stage 15 — controlled local universal DURABLE AUTHORITY.
 *
 * Unlike Stage 14 (which only calculates/validates a universal candidate and
 * lets the sole durable write happen through the legacy persistence boundary),
 * Stage 15 makes the universal PRODUCTION repository the durable source of truth
 * for a proven-safe, field-level allowlist: the universal command executes FIRST
 * to form a validated candidate; the candidate is atomically committed to the
 * campaign-scoped production universal namespace under an expected-revision
 * guard and verified read-after-write; only THEN is the existing legacy action
 * invoked ONCE as a deterministic compatibility projection of the already
 * committed universal intent, and the committed legacy post-state is verified
 * against the universal candidate.
 *
 * Legacy-owned data (maps, runtime, reveal, battle, routes, timeline, …) is
 * always composed fresh from the exact current legacy state, so a stale
 * universal snapshot can never overwrite it. Only the field-level allowlist is
 * universal-owned.
 */

/** Isolated Stage 15 diagnostics namespace prefix. Distinct from every earlier
 * namespace (Stage 6 shadow, Stage 9 shadow, Stage 13 command-shadow, Stage 14
 * authority) AND the production universal namespace. Per-campaign key appended. */
export const STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE =
  'campaign-timeline-vtt:universal-durable-authority:stage-15';

/** Isolated Stage 15 pending-recovery namespace prefix. Per-campaign key
 * appended. A pending record marks a durably-committed universal transaction
 * whose legacy compatibility projection has not (yet) been confirmed. */
export const STAGE_15_RECOVERY_NAMESPACE =
  'campaign-timeline-vtt:universal-durable-authority:stage-15:recovery';

/**
 * Allowlisted Stage 15 durable-authority scopes. Closed union so an unknown
 * scope can never take authority and config allowlists can only ever narrow this
 * set. Each entry is `<stack>.<entityKind>.<field>.update` and maps to exactly
 * one safe scalar/text field (see `safeFieldRegistry`).
 */
export type DurableAuthorityScope =
  // Greyholm (main campaign) — npc only (see coverage matrix).
  | 'greyholm.npc.role.update'
  | 'greyholm.npc.name.update'
  // User campaigns — several entity kinds, all direct 1:1 scalar/text fields.
  | 'userCampaign.npc.role.update'
  | 'userCampaign.npc.name.update'
  | 'userCampaign.npc.description.update'
  | 'userCampaign.quest.title.update'
  | 'userCampaign.quest.description.update'
  | 'userCampaign.faction.name.update'
  | 'userCampaign.faction.description.update'
  | 'userCampaign.location.description.update';

export const ALL_DURABLE_AUTHORITY_SCOPES: readonly DurableAuthorityScope[] = [
  'greyholm.npc.role.update',
  'greyholm.npc.name.update',
  'userCampaign.npc.role.update',
  'userCampaign.npc.name.update',
  'userCampaign.npc.description.update',
  'userCampaign.quest.title.update',
  'userCampaign.quest.description.update',
  'userCampaign.faction.name.update',
  'userCampaign.faction.description.update',
  'userCampaign.location.description.update',
] as const;

/** Deterministic Stage 15 transaction lifecycle. The critical boundary is
 * `repository_committed`: BEFORE it a safe pre-commit fallback is allowed (no
 * repository write); AT/after it the universal repository is durable and
 * authoritative — the legacy action is never re-run as an arbitrary fallback and
 * the universal write is never automatically rolled back. */
export type DurableAuthorityPhase =
  | 'not_started'
  | 'capturing'
  | 'repository_reading'
  | 'reconciling'
  | 'composing'
  | 'universal_executing'
  | 'candidate_validating'
  | 'scope_validating'
  | 'legacy_predicting'
  | 'parity_validating'
  | 'stale_rechecking'
  | 'repository_committing'
  | 'repository_committed'
  | 'repository_read_verifying'
  | 'legacy_projecting'
  | 'legacy_verifying'
  | 'success'
  | 'fallback_legacy'
  | 'fallback_success'
  | 'fallback_failed'
  | 'universal_committed_legacy_pending'
  | 'universal_committed_legacy_failed'
  | 'post_commit_mismatch';

/** Whether the universal repository owned the durable commit, or the unchanged
 * legacy path ran as a pre-commit fallback. */
export type DurableAuthorityDecision = 'durable_committed' | 'fallback';

/** Structured pre-commit fallback reasons (never used after a durable commit). */
export type DurableFallbackReason =
  | 'flag_disabled'
  | 'not_allowlisted'
  | 'wrong_campaign'
  | 'mapping_failed'
  | 'invalid_pre_state'
  | 'command_rejected'
  | 'validation_failed'
  | 'candidate_scope_violation'
  | 'prediction_unavailable'
  | 'prediction_mismatch'
  | 'stale_precondition'
  | 'reconciliation_conflict'
  | 'repository_init_failed'
  | 'repository_conflict'
  | 'repository_write_failed'
  | 'repository_read_verify_failed'
  | 'executor_exception';

export type ReconciliationStatus =
  | 'equal'
  | 'initialized'
  | 'universal_ahead'
  | 'legacy_ahead_imported'
  | 'conflict'
  | 'missing_universal'
  | 'invalid_universal'
  | 'skipped';

export type LegacyProjectionStatus = 'committed' | 'pending' | 'failed' | 'not_attempted';

/** The persisted, bounded, redacted Stage 15 diagnostic record. Never a full
 * snapshot, never raw secret values — only ids, dotted paths, counts and stable
 * hashes. */
export interface DurableAuthorityDiagnosticRecord {
  eventId: string;
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  commandScope: DurableAuthorityScope;
  entityKind: string;
  entityIdHash: string;
  fields: readonly string[];
  occurredAt: string;
  recordedAt: string;
  phase: DurableAuthorityPhase;
  decision: DurableAuthorityDecision;
  fallbackReason: DurableFallbackReason | null;
  authorityOwner: 'universal' | 'legacy';
  initializationStatus: 'existing' | 'initialized' | 'none';
  baseRepositoryRevision: UniversalRevision | null;
  candidateRepositoryRevision: UniversalRevision | null;
  legacyPreHash: string | null;
  composedBaseHash: string | null;
  candidateHash: string | null;
  repositoryCommittedHash: string | null;
  repositoryReadHash: string | null;
  predictedLegacyHash: string | null;
  legacyPostHash: string | null;
  preValidationStatus: 'ok' | 'failed' | 'skipped';
  candidateValidationStatus: 'ok' | 'failed' | 'skipped';
  scopeStatus: 'ok' | 'violation' | 'skipped';
  predictionComparison: CommandComparisonSummary | null;
  repositoryCommitStatus: 'committed' | 'not_committed' | 'failed';
  repositoryReadStatus: 'ok' | 'failed' | 'skipped';
  legacyProjectionStatus: LegacyProjectionStatus;
  legacyVerificationComparison: CommandComparisonSummary | null;
  reconciliationStatus: ReconciliationStatus;
  recoveryStatus: 'none' | 'pending_created' | 'resolved';
  changedSafePaths: readonly string[];
  durationBucketMs: string;
  errorCategory: string | null;
  errorMessage: string | null;
  /** Redacted reversibility hint — hashes only, never raw values. */
  inverse: { field: string; previousValueHash: string; nextValueHash: string } | null;
}

/** An idempotent pending compatibility-projection record. Persisted only when a
 * durable universal commit succeeded but the legacy projection did not confirm.
 * Never stores the raw value — recovery reads it from the committed universal
 * snapshot. */
export interface PendingProjectionRecord {
  eventId: string;
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  commandScope: DurableAuthorityScope;
  entityKind: string;
  entityId: string;
  field: string;
  committedUniversalRevision: UniversalRevision;
  committedValueHash: string;
  legacyProjectionStatus: LegacyProjectionStatus;
  attemptCount: number;
  lastErrorCategory: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Live per-campaign status the DM diagnostics UI subscribes to. */
export interface DurableAuthorityCampaignStatus {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  namespace: string;
  phase: DurableAuthorityPhase;
  lastDecision: DurableAuthorityDecision | null;
  lastFallbackReason: DurableFallbackReason | null;
  running: boolean;
  pending: number;
  currentRevision: UniversalRevision | null;
  lastEventId: string | null;
  lastAttemptAt: string | null;
  lastDurableCommitAt: string | null;
  lastFallbackAt: string | null;
  lastMismatchAt: string | null;
  runCount: number;
  durableCommitCount: number;
  fallbackCount: number;
  mismatchCount: number;
  pendingRecoveryCount: number;
  lastReconciliationStatus: ReconciliationStatus | null;
  lastPredictionComparison: CommandComparisonSummary | null;
  lastLegacyVerificationComparison: CommandComparisonSummary | null;
  lastErrorCategory: string | null;
  lastErrorMessage: string | null;
  recordCount: number;
}

/** The immutable outcome the router returns to its caller. `handled` is true
 * whenever the router ran to a terminal state (durable commit or a single legacy
 * fallback). */
export interface DurableAuthorityOutcome {
  handled: boolean;
  phase: DurableAuthorityPhase;
  decision: DurableAuthorityDecision;
  fallbackReason: DurableFallbackReason | null;
  record: DurableAuthorityDiagnosticRecord;
}

import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CommandCampaignKind, CommandComparisonSummary } from '../command-shadow/commandShadowTypes';

/**
 * Stage 16 — universal COMPLEX (aggregate-level) durable authority.
 *
 * Stage 15 made the universal production repository the durable source of truth
 * for a field-level scalar/text allowlist. Stage 16 generalises that to
 * *aggregate-level* transition ownership: reveal / presented-card visibility,
 * placements, party location and route progress. Each transition still follows
 * the Stage 15 flow — compose a durable base (fresh legacy-owned data + any
 * universal-ahead owned aggregate slot), execute a TYPED command first, validate
 * + invariant-check + scope-check the candidate, independently predict the legacy
 * post-state and parity-check, atomically commit to the production universal
 * namespace under an expected-revision guard, verify read-after-write, then run
 * exactly ONE legacy compatibility projection and verify it. Legacy-owned data
 * (maps, hotspot/faction geometry, timeline, battles, entity content) is always
 * composed fresh, so a stale universal snapshot can never overwrite it.
 *
 * Namespaces are isolated from every earlier stage AND from Stage 15.
 */

export const STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE =
  'campaign-timeline-vtt:universal-complex-authority:stage-16';

export const STAGE_16_COMPLEX_RECOVERY_NAMESPACE =
  'campaign-timeline-vtt:universal-complex-authority:stage-16:recovery';

/** The complex aggregates Stage 16 can own. Closed union. */
export type ComplexAggregateKind =
  | 'reveal'
  | 'presentedCard'
  | 'placement'
  | 'partyLocation'
  | 'routeProgress';

/** Typed command kinds per aggregate. Closed union — never an arbitrary patch. */
export type ComplexCommandKind =
  | 'reveal.entity'
  | 'reveal.hide'
  | 'presentedCard.present'
  | 'presentedCard.dismiss'
  | 'placement.place'
  | 'placement.move'
  | 'placement.remove'
  | 'partyLocation.move'
  | 'routeProgress.advance'
  | 'routeProgress.clear';

/**
 * Allowlisted Stage 16 scopes: `<stack>.<aggregate>`. A config allowlist can only
 * narrow this set. Party location and route progress exist for Greyholm only
 * (Caldran has no party runtime — a documented campaign-capability difference,
 * not missing universal support).
 */
export type ComplexAuthorityScope =
  | 'greyholm.reveal'
  | 'greyholm.presentedCard'
  | 'greyholm.placement'
  | 'greyholm.partyLocation'
  | 'greyholm.routeProgress'
  | 'userCampaign.reveal'
  | 'userCampaign.presentedCard'
  | 'userCampaign.placement';

export const ALL_COMPLEX_AUTHORITY_SCOPES: readonly ComplexAuthorityScope[] = [
  'greyholm.reveal',
  'greyholm.presentedCard',
  'greyholm.placement',
  'greyholm.partyLocation',
  'greyholm.routeProgress',
  'userCampaign.reveal',
  'userCampaign.presentedCard',
  'userCampaign.placement',
] as const;

/** Deterministic Stage 16 transaction lifecycle. The critical boundary is
 * `repository_committed`: BEFORE it a safe pre-commit fallback is allowed (no
 * repository write); AT/after it the universal repository is durable and
 * authoritative — the legacy action is never re-run as an arbitrary fallback and
 * the universal write is never automatically rolled back. */
export type ComplexAuthorityPhase =
  | 'not_started'
  | 'capturing'
  | 'repository_reading'
  | 'reconciling'
  | 'composing'
  | 'identity_resolving'
  | 'universal_executing'
  | 'candidate_validating'
  | 'invariants_validating'
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

export type ComplexAuthorityDecision = 'durable_committed' | 'fallback';

export type ComplexFallbackReason =
  | 'flag_disabled'
  | 'not_allowlisted'
  | 'wrong_campaign'
  | 'mapping_failed'
  | 'invalid_pre_state'
  | 'command_rejected'
  | 'validation_failed'
  | 'invariant_violation'
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

export type ComplexReconciliationStatus =
  | 'equal'
  | 'initialized'
  | 'universal_ahead'
  | 'legacy_ahead_imported'
  | 'conflict'
  | 'missing_universal'
  | 'invalid_universal'
  | 'skipped';

export type ComplexLegacyProjectionStatus = 'committed' | 'pending' | 'failed' | 'not_attempted';

/** Bounded, redacted Stage 16 diagnostic record. Never a full snapshot, never raw
 * DM notes / card content / geometry — only ids, aggregate kind, dotted owned
 * paths, counts and stable hashes. */
export interface ComplexAuthorityDiagnosticRecord {
  eventId: string;
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  commandScope: ComplexAuthorityScope;
  aggregateKind: ComplexAggregateKind;
  commandKind: ComplexCommandKind;
  targetIdentityHash: string;
  occurredAt: string;
  recordedAt: string;
  phase: ComplexAuthorityPhase;
  decision: ComplexAuthorityDecision;
  fallbackReason: ComplexFallbackReason | null;
  authorityOwner: 'universal' | 'legacy';
  initializationStatus: 'existing' | 'initialized' | 'none';
  baseRepositoryRevision: UniversalRevision | null;
  candidateRepositoryRevision: UniversalRevision | null;
  legacyPreHash: string | null;
  composedBaseHash: string | null;
  aggregatePreHash: string | null;
  candidateHash: string | null;
  repositoryCommittedHash: string | null;
  repositoryReadHash: string | null;
  predictedLegacyHash: string | null;
  legacyPostHash: string | null;
  dmProjectionHash: string | null;
  playerSafeProjectionHash: string | null;
  observerProjectionHash: string | null;
  identityStatus: 'ok' | 'ambiguous' | 'missing' | 'wrong_kind' | 'skipped';
  preconditionStatus: 'ok' | 'failed' | 'skipped';
  candidateValidationStatus: 'ok' | 'failed' | 'skipped';
  invariantStatus: 'ok' | 'violation' | 'skipped';
  scopeStatus: 'ok' | 'violation' | 'skipped';
  predictionComparison: CommandComparisonSummary | null;
  repositoryCommitStatus: 'committed' | 'not_committed' | 'failed';
  repositoryReadStatus: 'ok' | 'failed' | 'skipped';
  legacyProjectionStatus: ComplexLegacyProjectionStatus;
  legacyVerificationComparison: CommandComparisonSummary | null;
  reconciliationStatus: ComplexReconciliationStatus;
  recoveryStatus: 'none' | 'pending_created' | 'resolved';
  changedAggregatePaths: readonly string[];
  durationBucketMs: string;
  errorCategory: string | null;
  errorMessage: string | null;
  /** Redacted reversibility hint — the inverse command kind + hashes only. */
  inverse: { commandKind: ComplexCommandKind | null; previousStateHash: string; nextStateHash: string } | null;
}

/** Idempotent pending compatibility-projection record for a durably-committed
 * aggregate transition whose legacy projection did not confirm. Stores the owned
 * aggregate slot key + committed value hash — recovery re-reads the intent from
 * the committed universal snapshot. */
export interface ComplexPendingProjectionRecord {
  eventId: string;
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  commandScope: ComplexAuthorityScope;
  aggregateKind: ComplexAggregateKind;
  commandKind: ComplexCommandKind;
  /** Stable owned-slot key `${aggregateKind}:${targetId}` used for dedup + the
   * universal-ahead reconciliation set. */
  slotKey: string;
  targetId: string;
  committedUniversalRevision: UniversalRevision;
  committedValueHash: string;
  legacyProjectionStatus: ComplexLegacyProjectionStatus;
  attemptCount: number;
  lastErrorCategory: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ComplexAuthorityCampaignStatus {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  namespace: string;
  phase: ComplexAuthorityPhase;
  lastDecision: ComplexAuthorityDecision | null;
  lastFallbackReason: ComplexFallbackReason | null;
  running: boolean;
  currentRevision: UniversalRevision | null;
  lastEventId: string | null;
  lastAggregateKind: ComplexAggregateKind | null;
  lastAttemptAt: string | null;
  lastDurableCommitAt: string | null;
  lastFallbackAt: string | null;
  lastMismatchAt: string | null;
  runCount: number;
  durableCommitCount: number;
  fallbackCount: number;
  mismatchCount: number;
  pendingRecoveryCount: number;
  lastReconciliationStatus: ComplexReconciliationStatus | null;
  lastPredictionComparison: CommandComparisonSummary | null;
  lastLegacyVerificationComparison: CommandComparisonSummary | null;
  lastErrorCategory: string | null;
  lastErrorMessage: string | null;
  recordCount: number;
}

export interface ComplexAuthorityOutcome {
  handled: boolean;
  phase: ComplexAuthorityPhase;
  decision: ComplexAuthorityDecision;
  fallbackReason: ComplexFallbackReason | null;
  record: ComplexAuthorityDiagnosticRecord;
}

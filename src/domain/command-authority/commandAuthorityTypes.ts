import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CommandCampaignKind, CommandComparisonSummary } from '../command-shadow/commandShadowTypes';

/**
 * Stage 14 — controlled local universal COMMAND AUTHORITY.
 *
 * Unlike Stage 13 (which observes an already-committed legacy mutation and
 * replays a universal command as a pure shadow), Stage 14 lets the universal
 * command layer own the *decision* for a tiny reversible allowlist: the
 * universal command executes FIRST to form a validated candidate; the equivalent
 * legacy transition is predicted independently; only on proven semantic parity
 * is the existing legacy mutation invoked ONCE as a compatibility commit; the
 * committed legacy post-state is then verified against the universal candidate.
 *
 * There is never a second independent authoritative write. The universal
 * candidate is calculated/validated only; exactly one durable write happens
 * through the existing legacy persistence boundary.
 */

/** Isolated Stage 14 diagnostics namespace prefix. Distinct from the Stage 6
 * default shadow namespace, the Stage 9 shadow namespace, the Stage 13
 * command-shadow namespace AND the production universal namespace. Per-campaign
 * key is appended. */
export const STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE =
  'campaign-timeline-vtt:universal-command-authority:stage-14';

/** Allowlisted Stage 14 authority scopes. Closed union so an unknown scope can
 * never take authority and config allowlists can only ever narrow this set. Each
 * maps 1:1 to a proven Stage 13 command scope (see `authorityScopes`). */
export type CommandAuthorityScope =
  | 'greyholm.npc.role.update'
  | 'userCampaign.npc.role.update';

export const ALL_COMMAND_AUTHORITY_SCOPES: readonly CommandAuthorityScope[] = [
  'greyholm.npc.role.update',
  'userCampaign.npc.role.update',
] as const;

/** Explicit, deterministic lifecycle phases. The critical boundary is
 * `legacy_committing`: before it, a safe fallback is allowed; at/after
 * `legacy_committed`, the legacy result is authoritative and the legacy action
 * is NEVER re-run (no duplicate mutation, no automatic rollback). */
export type CommandAuthorityPhase =
  | 'not_started'
  | 'preparing'
  | 'universal_executing'
  | 'universal_validated'
  | 'legacy_prediction_matching'
  | 'commit_ready'
  | 'legacy_committing'
  | 'legacy_committed'
  | 'post_commit_verifying'
  | 'success'
  | 'fallback_legacy'
  | 'fallback_success'
  | 'fallback_failed'
  | 'post_commit_mismatch';

/** Whether the universal layer owned the commit decision, or the unchanged
 * legacy path ran as a fallback. */
export type AuthorityDecision = 'committed' | 'fallback';

/** Structured pre-commit fallback reasons (never a post-commit fallback). */
export type FallbackReason =
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
  | 'executor_exception';

/** The persisted, bounded, redacted Stage 14 diagnostic record. Never a full
 * snapshot, never raw secret values — only ids, dotted paths, counts and stable
 * hashes. */
export interface CommandAuthorityDiagnosticRecord {
  eventId: string;
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  commandScope: CommandAuthorityScope;
  commandType: string;
  occurredAt: string;
  recordedAt: string;
  phase: CommandAuthorityPhase;
  authorityDecision: AuthorityDecision;
  fallbackReason: FallbackReason | null;
  legacyPreHash: string | null;
  universalCandidateHash: string | null;
  predictedLegacyHash: string | null;
  committedLegacyPostHash: string | null;
  mappingStatus: 'ok' | 'failed' | 'skipped';
  preValidationStatus: 'ok' | 'failed' | 'skipped';
  candidateValidationStatus: 'ok' | 'failed' | 'skipped';
  candidateScopeStatus: 'ok' | 'violation' | 'skipped';
  predictionComparison: CommandComparisonSummary | null;
  postCommitComparison: CommandComparisonSummary | null;
  legacyCommitStatus: 'committed' | 'not_committed' | 'failed';
  fallbackStatus: 'not_used' | 'succeeded' | 'failed';
  changedSafePaths: readonly string[];
  targetIds: readonly string[];
  baseRevision: UniversalRevision | null;
  candidateRevision: UniversalRevision | null;
  durationBucketMs: string;
  errorCategory: string | null;
  errorMessage: string | null;
  /** Redacted reversibility hint — hashes only, never the raw values. */
  inverse: { field: string; previousValueHash: string; nextValueHash: string } | null;
}

/** Live per-campaign status the DM diagnostics UI subscribes to. */
export interface CommandAuthorityCampaignStatus {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  namespace: string;
  phase: CommandAuthorityPhase;
  lastDecision: AuthorityDecision | null;
  lastFallbackReason: FallbackReason | null;
  pending: number;
  running: boolean;
  lastEventId: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastFallbackAt: string | null;
  lastMismatchAt: string | null;
  runCount: number;
  successCount: number;
  fallbackCount: number;
  mismatchCount: number;
  lastPredictionComparison: CommandComparisonSummary | null;
  lastPostCommitComparison: CommandComparisonSummary | null;
  lastErrorCategory: string | null;
  lastErrorMessage: string | null;
  recordCount: number;
}

/** The immutable outcome the router returns to its caller. `handled` is always
 * true when the router ran (it always performs exactly one legacy commit — as an
 * authority commit or as a fallback). */
export interface CommandAuthorityOutcome {
  handled: true;
  phase: CommandAuthorityPhase;
  decision: AuthorityDecision;
  fallbackReason: FallbackReason | null;
  record: CommandAuthorityDiagnosticRecord;
}

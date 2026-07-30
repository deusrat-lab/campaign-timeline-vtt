import type { CampaignId } from '../campaign/ids';
import type { CampaignSourceKind } from '../campaign/source';
import type { AdapterResult } from '../adapters/types';
import { hasAdapterErrors } from '../adapters/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import { stableHash } from '../command-shadow/commandShadowCoordinator';
import { executeUniversalCommand, type CommandInput } from '../command-shadow/commandRegistry';
import { compareCommandResult, semanticSnapshotHash } from '../command-shadow/commandComparison';
import type { CommandCampaignKind, CommandComparisonSummary } from '../command-shadow/commandShadowTypes';
import type { CommandDiagnosticsStorage } from '../command-shadow/commandDiagnosticsStore';
import { AuthorityDiagnosticsStore } from './authorityDiagnosticsStore';
import { isAllowedAuthorityChangePath } from './authorityScopes';
import {
  STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE,
  type CommandAuthorityCampaignStatus,
  type CommandAuthorityDiagnosticRecord,
  type CommandAuthorityOutcome,
  type CommandAuthorityScope,
  type FallbackReason,
} from './commandAuthorityTypes';

/**
 * One Stage 14 authority route request. Everything is injected so the same core
 * runs identically under the real React stores and the deterministic harness.
 * All accessors are synchronous and pure (no network, no server sync); the ONLY
 * durable side effect the router itself triggers is exactly one call to `commit`
 * OR one call to `fallback` — never both, never twice.
 */
export interface AuthorityRouteRequest {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  sourceKind: CampaignSourceKind;
  scope: CommandAuthorityScope;
  /** Underlying Stage 13-proven universal command input. */
  input: CommandInput;
  sourceIdentity: string;
  occurredAt?: string;
  /** Redacted reversibility hint (hashes only), optional. */
  previousValue?: string;
  nextValue?: string;
  /** Adapt the captured immutable legacy PRE-state. May be called twice (base +
   * stale re-check). Must never mutate legacy. */
  buildPre: () => AdapterResult;
  /** Adapt the PREDICTED legacy post-state from a pure transition on an
   * immutable clone. Must never perform a real mutation / storage / network. */
  predictPost: () => AdapterResult;
  /** Perform the ONE real legacy compatibility commit and return the adapted,
   * stable committed post-state. Called at most once, only after parity. */
  commit: () => AdapterResult;
  /** Run the unchanged legacy action once as a pre-commit fallback. Same
   * underlying legacy mutation as `commit`; the router calls exactly one of the
   * two on the pre-commit path so the legacy action runs exactly once. */
  fallback: () => void;
}

export interface CommandAuthorityRouterOptions {
  diagnosticsStorage: CommandDiagnosticsStorage;
  allowedScopes: ReadonlySet<CommandAuthorityScope>;
  enabled: boolean;
  now?: () => string;
  maxRecords?: number;
}

interface CampaignEntry {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  status: CommandAuthorityCampaignStatus;
}

/**
 * Stage 14 — universal command-authority router.
 *
 * For an allowlisted, reversible single-field NPC edit it executes the universal
 * command FIRST to form a validated candidate, independently predicts the
 * equivalent legacy transition, requires semantic parity, then performs exactly
 * ONE real legacy compatibility commit and verifies the committed post-state
 * against the candidate. Any uncertainty before the commit runs the unchanged
 * legacy action once as a safe fallback. After a successful commit the legacy
 * result is authoritative and is never re-run or rolled back. It never writes the
 * production universal namespace and never performs network / server sync.
 */
export class CommandAuthorityRouter {
  private readonly diagnostics: AuthorityDiagnosticsStore;
  private readonly allowedScopes: ReadonlySet<CommandAuthorityScope>;
  private readonly enabled: boolean;
  private readonly now: () => string;
  private readonly entries = new Map<string, CampaignEntry>();
  private readonly listeners = new Set<() => void>();
  private readonly seenEventIds = new Set<string>();
  private disposed = false;
  private statusesSnapshot: CommandAuthorityCampaignStatus[] = [];

  constructor(options: CommandAuthorityRouterOptions) {
    this.diagnostics = new AuthorityDiagnosticsStore(options.diagnosticsStorage, options.maxRecords);
    this.allowedScopes = options.allowedScopes;
    this.enabled = options.enabled;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  get namespace(): string {
    return STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE;
  }

  isAllowlisted(scope: string): boolean {
    return this.allowedScopes.has(scope as CommandAuthorityScope);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(campaignId: CampaignId): CommandAuthorityCampaignStatus | null {
    const entry = this.entries.get(campaignId);
    return entry ? { ...entry.status } : null;
  }

  getAllStatuses(): CommandAuthorityCampaignStatus[] {
    return this.statusesSnapshot;
  }

  readDiagnostics(campaignId: CampaignId): CommandAuthorityDiagnosticRecord[] {
    return this.diagnostics.read(campaignId);
  }

  clearDiagnostics(campaignId: CampaignId): void {
    this.diagnostics.clear(campaignId);
    const entry = this.entries.get(campaignId);
    if (entry) {
      entry.status.recordCount = 0;
      entry.status.lastPredictionComparison = null;
      entry.status.lastPostCommitComparison = null;
      this.emit();
    }
  }

  dispose(): void {
    // Disposing may only cancel PRE-commit authority work. A committed legacy
    // mutation is authoritative and untouched by dispose (the router never holds
    // uncommitted legacy state). Clearing local structures here is safe.
    this.disposed = true;
    this.entries.clear();
    this.statusesSnapshot = [];
    this.listeners.clear();
  }

  /**
   * Route one command through universal authority. Guarantees exactly ONE legacy
   * commit (via `commit` on the parity path, or `fallback` on the pre-commit
   * failure path). Returns the structured outcome.
   */
  route(request: AuthorityRouteRequest): CommandAuthorityOutcome {
    const started = Date.now();
    const occurredAt = request.occurredAt ?? this.now();

    // Disabled or not-allowlisted: run the unchanged legacy action once. No
    // diagnostics are read or written on the flag-off path.
    if (this.disposed || !this.enabled) {
      return this.runFallback(request, 'flag_disabled', occurredAt, started, /*record*/ false);
    }
    if (!this.isAllowlisted(request.scope)) {
      return this.runFallback(request, 'not_allowlisted', occurredAt, started, false);
    }
    if (!request.campaignId) {
      return this.runFallback(request, 'wrong_campaign', occurredAt, started, true);
    }

    const entry = this.ensureEntry(request.campaignId, request.campaignKind);
    entry.status.running = true;
    entry.status.phase = 'preparing';
    entry.status.runCount += 1;
    entry.status.lastAttemptAt = this.now();
    this.emit();

    try {
      return this.runPipeline(request, entry, occurredAt, started);
    } catch (error) {
      // Any exception BEFORE the commit: safe fallback. (After a commit the
      // pipeline returns without throwing — see runPipeline.)
      return this.finishFallback(request, entry, 'executor_exception', occurredAt, started, messageOf(error));
    } finally {
      entry.status.running = false;
      this.emit();
    }
  }

  private runPipeline(
    request: AuthorityRouteRequest,
    entry: CampaignEntry,
    occurredAt: string,
    started: number,
  ): CommandAuthorityOutcome {
    // 1. Build + validate the exact pre-command snapshot.
    entry.status.phase = 'preparing';
    const preRes = safeBuild(request.buildPre);
    if (!preRes.snapshot || hasAdapterErrors(preRes)) {
      return this.finishFallback(request, entry, 'invalid_pre_state', occurredAt, started, firstError(preRes) ?? 'pre-state adapter produced no snapshot');
    }
    const preSnapshot = preRes.snapshot;
    if (preSnapshot.metadata.campaignId !== request.campaignId) {
      return this.finishFallback(request, entry, 'wrong_campaign', occurredAt, started, `pre campaign ${preSnapshot.metadata.campaignId} != ${request.campaignId}`);
    }
    const preHash = semanticSnapshotHash(preSnapshot);
    const eventId = stableHash({ c: request.campaignId, s: request.scope, t: occurredAt, pre: preHash, v: request.nextValue ?? null });

    // Idempotent dedup: an identical event is never committed twice.
    if (this.seenEventIds.has(eventId)) {
      const record = this.baseRecord(request, entry, eventId, occurredAt);
      record.phase = 'success';
      record.authorityDecision = 'committed';
      record.legacyCommitStatus = 'not_committed';
      record.errorCategory = 'duplicate_event';
      record.errorMessage = 'Duplicate authority event deduplicated; no second commit.';
      record.legacyPreHash = preHash;
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: 'success', decision: 'committed', fallbackReason: null, record };
    }

    // 2. Execute the universal command FIRST → validated candidate.
    entry.status.phase = 'universal_executing';
    const result = executeUniversalCommand(preSnapshot, request.input);
    const mappingFailed = result.rejectionCode === 'mapping_failed';
    if (!result.accepted || !result.snapshot) {
      const reason: FallbackReason = mappingFailed ? 'mapping_failed' : 'command_rejected';
      return this.finishFallback(request, entry, reason, occurredAt, started, result.rejectionMessage ?? 'universal command rejected', { preHash, eventId });
    }
    const candidate = result.snapshot;

    // 3. Blocking validation of the candidate — never weakened.
    const validation = validateCampaignSnapshot(candidate);
    if (!validation.ok) {
      const errs = validation.issues.filter((i) => i.severity === 'error').length;
      return this.finishFallback(request, entry, 'validation_failed', occurredAt, started, `${errs} validation error(s)`, { preHash, eventId, candidateValidation: 'failed' });
    }
    entry.status.phase = 'universal_validated';

    // 4. Candidate change-set must stay within the allowlisted path shape.
    const outOfScope = result.changedPaths.filter((p) => !isAllowedAuthorityChangePath(request.scope, p));
    if (outOfScope.length > 0 || result.createdIds.length > 0 || result.deletedIds.length > 0) {
      return this.finishFallback(request, entry, 'candidate_scope_violation', occurredAt, started, `out-of-scope change(s): ${outOfScope.join(',') || 'created/deleted ids'}`, { preHash, eventId, candidateValidation: 'ok', scopeViolation: true });
    }

    const candidateHash = semanticSnapshotHash(candidate);

    // 5. Independent legacy transition prediction on an immutable clone.
    entry.status.phase = 'legacy_prediction_matching';
    const predictRes = safeBuild(request.predictPost);
    if (!predictRes.snapshot || hasAdapterErrors(predictRes)) {
      return this.finishFallback(request, entry, 'prediction_unavailable', occurredAt, started, firstError(predictRes) ?? 'legacy prediction unavailable', { preHash, eventId, candidateValidation: 'ok', candidateHash });
    }
    const predicted = predictRes.snapshot;
    const predictionComparison = compareCommandResult(candidate, predicted);
    if (!isMatch(predictionComparison)) {
      return this.finishFallback(request, entry, 'prediction_mismatch', occurredAt, started, `${predictionComparison.mismatchCount} prediction mismatch(es)`, { preHash, eventId, candidateValidation: 'ok', candidateHash, predictionComparison, predictedHash: semanticSnapshotHash(predicted) });
    }

    // 6. Stale precondition re-check: the authoritative pre-state must not have
    // changed since capture. (Synchronous path: always fresh; guarded anyway.)
    const recheck = safeBuild(request.buildPre);
    if (!recheck.snapshot || semanticSnapshotHash(recheck.snapshot) !== preHash) {
      return this.finishFallback(request, entry, 'stale_precondition', occurredAt, started, 'legacy pre-state changed before commit', { preHash, eventId, candidateValidation: 'ok', candidateHash, predictionComparison, predictedHash: semanticSnapshotHash(predicted) });
    }

    // 7. Commit-ready → the ONE real legacy compatibility commit.
    entry.status.phase = 'commit_ready';
    this.seenEventIds.add(eventId);
    const record = this.baseRecord(request, entry, eventId, occurredAt);
    record.legacyPreHash = preHash;
    record.baseRevision = preSnapshot.revision;
    record.universalCandidateHash = candidateHash;
    record.candidateRevision = candidate.revision;
    record.predictedLegacyHash = semanticSnapshotHash(predicted);
    record.predictionComparison = predictionComparison;
    record.candidateValidationStatus = 'ok';
    record.preValidationStatus = 'ok';
    record.candidateScopeStatus = 'ok';
    record.mappingStatus = 'ok';
    record.changedSafePaths = result.changedPaths;

    entry.status.phase = 'legacy_committing';
    let committedRes: AdapterResult;
    try {
      committedRes = request.commit();
    } catch (error) {
      // Legacy commit itself failed (would also have failed at baseline). Do NOT
      // re-run the legacy action — no duplicate mutation, no fallback after a
      // commit attempt. Record honestly.
      record.phase = 'fallback_failed';
      record.authorityDecision = 'committed';
      record.legacyCommitStatus = 'failed';
      record.errorCategory = 'legacy_commit_failed';
      record.errorMessage = messageOf(error);
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: 'fallback_failed', decision: 'committed', fallbackReason: null, record };
    }
    record.legacyCommitStatus = 'committed';
    record.authorityDecision = 'committed';
    entry.status.phase = 'legacy_committed';

    // 8. Post-commit verification against the candidate. A mismatch is recorded
    // honestly; the committed legacy result stays authoritative — no rollback,
    // no second mutation.
    entry.status.phase = 'post_commit_verifying';
    if (!committedRes.snapshot || hasAdapterErrors(committedRes)) {
      record.phase = 'post_commit_mismatch';
      record.errorCategory = 'post_commit_adapter_failed';
      record.errorMessage = firstError(committedRes) ?? 'committed post-state adapter produced no snapshot';
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: 'post_commit_mismatch', decision: 'committed', fallbackReason: null, record };
    }
    const committed = committedRes.snapshot;
    record.committedLegacyPostHash = semanticSnapshotHash(committed);
    const postCommitComparison = compareCommandResult(candidate, committed);
    record.postCommitComparison = postCommitComparison;
    if (isMatch(postCommitComparison)) {
      record.phase = 'success';
    } else {
      record.phase = 'post_commit_mismatch';
      record.errorCategory = 'post_commit_mismatch';
      record.errorMessage = `${postCommitComparison.mismatchCount} post-commit mismatch(es)`;
    }
    this.persistAndApply(entry, record, started);
    return { handled: true, phase: record.phase, decision: 'committed', fallbackReason: null, record };
  }

  /** Pre-commit fallback: run the unchanged legacy action exactly once. */
  private finishFallback(
    request: AuthorityRouteRequest,
    entry: CampaignEntry,
    reason: FallbackReason,
    occurredAt: string,
    started: number,
    message: string,
    partial?: {
      preHash?: string;
      eventId?: string;
      candidateValidation?: 'ok' | 'failed';
      candidateHash?: string;
      scopeViolation?: boolean;
      predictionComparison?: CommandComparisonSummary;
      predictedHash?: string;
    },
  ): CommandAuthorityOutcome {
    const eventId = partial?.eventId ?? stableHash({ c: request.campaignId, s: request.scope, t: occurredAt, r: reason });
    const record = this.baseRecord(request, entry, eventId, occurredAt);
    record.authorityDecision = 'fallback';
    record.fallbackReason = reason;
    record.phase = 'fallback_legacy';
    record.legacyPreHash = partial?.preHash ?? null;
    record.universalCandidateHash = partial?.candidateHash ?? null;
    record.predictedLegacyHash = partial?.predictedHash ?? null;
    record.predictionComparison = partial?.predictionComparison ?? null;
    record.candidateValidationStatus = partial?.candidateValidation ?? 'skipped';
    record.candidateScopeStatus = partial?.scopeViolation ? 'violation' : 'skipped';
    record.mappingStatus = reason === 'mapping_failed' ? 'failed' : 'skipped';
    record.legacyCommitStatus = 'not_committed';
    record.errorCategory = reason;
    record.errorMessage = message;

    let fallbackOk = true;
    try {
      request.fallback();
    } catch (error) {
      fallbackOk = false;
      record.errorMessage = `fallback failed: ${messageOf(error)}`;
    }
    record.fallbackStatus = fallbackOk ? 'succeeded' : 'failed';
    record.phase = fallbackOk ? 'fallback_success' : 'fallback_failed';
    this.persistAndApply(entry, record, started);
    return { handled: true, phase: record.phase, decision: 'fallback', fallbackReason: reason, record };
  }

  /** Flag-off / not-allowlisted fallback: run legacy once, optionally without any
   * diagnostics I/O (flag-off path writes nothing). */
  private runFallback(
    request: AuthorityRouteRequest,
    reason: FallbackReason,
    occurredAt: string,
    started: number,
    record: boolean,
  ): CommandAuthorityOutcome {
    if (!record) {
      let ok = true;
      try {
        request.fallback();
      } catch {
        ok = false;
      }
      const rec = this.baseRecord(request, this.transientEntry(request), '', occurredAt);
      rec.authorityDecision = 'fallback';
      rec.fallbackReason = reason;
      rec.fallbackStatus = ok ? 'succeeded' : 'failed';
      rec.phase = ok ? 'fallback_success' : 'fallback_failed';
      rec.legacyCommitStatus = 'not_committed';
      return { handled: true, phase: rec.phase, decision: 'fallback', fallbackReason: reason, record: rec };
    }
    const entry = this.ensureEntry(request.campaignId, request.campaignKind);
    return this.finishFallback(request, entry, reason, occurredAt, started, reason);
  }

  private persistAndApply(entry: CampaignEntry, record: CommandAuthorityDiagnosticRecord, started: number): void {
    record.recordedAt = this.now();
    record.durationBucketMs = bucketDuration(Date.now() - started);
    const persisted = this.diagnostics.append(record);
    entry.status.recordCount = this.diagnostics.count(entry.campaignId);
    entry.status.phase = record.phase;
    entry.status.lastEventId = record.eventId || entry.status.lastEventId;
    entry.status.lastDecision = record.authorityDecision;
    entry.status.lastFallbackReason = record.fallbackReason;
    entry.status.lastPredictionComparison = record.predictionComparison;
    entry.status.lastPostCommitComparison = record.postCommitComparison;
    entry.status.lastErrorCategory = record.errorCategory;
    entry.status.lastErrorMessage = record.errorMessage;
    if (record.phase === 'success' && record.authorityDecision === 'committed') {
      entry.status.successCount += 1;
      entry.status.lastSuccessAt = record.recordedAt;
    } else if (record.authorityDecision === 'fallback') {
      entry.status.fallbackCount += 1;
      entry.status.lastFallbackAt = record.recordedAt;
    } else if (record.phase === 'post_commit_mismatch') {
      entry.status.mismatchCount += 1;
      entry.status.lastMismatchAt = record.recordedAt;
    }
    if (!persisted) {
      entry.status.lastErrorCategory = 'diagnostics_persistence_failed';
    }
    this.emit();
  }

  private ensureEntry(campaignId: CampaignId, campaignKind: CommandCampaignKind): CampaignEntry {
    let entry = this.entries.get(campaignId);
    if (!entry) {
      entry = { campaignId, campaignKind, status: emptyStatus(campaignId, campaignKind, this.diagnostics.count(campaignId)) };
      this.entries.set(campaignId, entry);
    }
    return entry;
  }

  private transientEntry(request: AuthorityRouteRequest): CampaignEntry {
    return { campaignId: request.campaignId, campaignKind: request.campaignKind, status: emptyStatus(request.campaignId, request.campaignKind, 0) };
  }

  private baseRecord(
    request: AuthorityRouteRequest,
    entry: CampaignEntry,
    eventId: string,
    occurredAt: string,
  ): CommandAuthorityDiagnosticRecord {
    return {
      eventId,
      campaignId: request.campaignId,
      campaignKind: entry.campaignKind,
      commandScope: request.scope,
      commandType: request.scope,
      occurredAt,
      recordedAt: this.now(),
      phase: 'not_started',
      authorityDecision: 'fallback',
      fallbackReason: null,
      legacyPreHash: null,
      universalCandidateHash: null,
      predictedLegacyHash: null,
      committedLegacyPostHash: null,
      mappingStatus: 'skipped',
      preValidationStatus: 'skipped',
      candidateValidationStatus: 'skipped',
      candidateScopeStatus: 'skipped',
      predictionComparison: null,
      postCommitComparison: null,
      legacyCommitStatus: 'not_committed',
      fallbackStatus: 'not_used',
      changedSafePaths: [],
      targetIds: targetIdsOf(request.input),
      baseRevision: null,
      candidateRevision: null,
      durationBucketMs: '0-1ms',
      errorCategory: null,
      errorMessage: null,
      inverse: inverseOf(request),
    };
  }

  private emit(): void {
    this.statusesSnapshot = Array.from(this.entries.values()).map((entry) => ({ ...entry.status }));
    for (const listener of this.listeners) listener();
  }
}

function emptyStatus(campaignId: CampaignId, campaignKind: CommandCampaignKind, recordCount: number): CommandAuthorityCampaignStatus {
  return {
    campaignId,
    campaignKind,
    namespace: STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE,
    phase: 'not_started',
    lastDecision: null,
    lastFallbackReason: null,
    pending: 0,
    running: false,
    lastEventId: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    lastFallbackAt: null,
    lastMismatchAt: null,
    runCount: 0,
    successCount: 0,
    fallbackCount: 0,
    mismatchCount: 0,
    lastPredictionComparison: null,
    lastPostCommitComparison: null,
    lastErrorCategory: null,
    lastErrorMessage: null,
    recordCount,
  };
}

function isMatch(comparison: CommandComparisonSummary): boolean {
  return (
    comparison.classification === 'equal' ||
    comparison.classification === 'revision_only' ||
    comparison.classification === 'ordering_only'
  );
}

function targetIdsOf(input: CommandInput): readonly string[] {
  if (input.scope === 'greyholm.npc.update' || input.scope === 'userCampaign.npc.update') {
    return [`npc:${input.legacyNpcId}`];
  }
  return [];
}

function inverseOf(request: AuthorityRouteRequest): CommandAuthorityDiagnosticRecord['inverse'] {
  const input = request.input;
  if (input.scope === 'greyholm.npc.update' || input.scope === 'userCampaign.npc.update') {
    return {
      field: input.field,
      previousValueHash: stableHash(request.previousValue ?? null),
      nextValueHash: stableHash(request.nextValue ?? input.value),
    };
  }
  return null;
}

function safeBuild(build: () => AdapterResult): AdapterResult {
  try {
    return build();
  } catch (error) {
    return { snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'adapter_threw', path: '<root>', message: messageOf(error) }] };
  }
}

function firstError(result: AdapterResult): string | undefined {
  return result.diagnostics.find((d) => d.severity === 'error')?.message;
}

function bucketDuration(ms: number): string {
  if (ms <= 1) return '0-1ms';
  if (ms <= 5) return '1-5ms';
  if (ms <= 20) return '5-20ms';
  if (ms <= 100) return '20-100ms';
  return '100ms+';
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}


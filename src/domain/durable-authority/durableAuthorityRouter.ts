import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CampaignSourceKind } from '../campaign/source';
import type { AdapterResult } from '../adapters/types';
import { hasAdapterErrors } from '../adapters/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import { stableHash } from '../command-shadow/commandShadowCoordinator';
import { compareCommandResult, semanticSnapshotHash } from '../command-shadow/commandComparison';
import type { CommandCampaignKind, CommandComparisonSummary } from '../command-shadow/commandShadowTypes';
import type { CommandDiagnosticsStorage } from '../command-shadow/commandDiagnosticsStore';
import type { RepositoryStorage } from '../repository/shadowRepository';
import { SyncDurableRepository } from './syncDurableRepository';
import { DurableDiagnosticsStore } from './durableDiagnosticsStore';
import { RecoveryStore } from './recoveryStore';
import { composeDurableBase } from './composeDurableBase';
import { executeSafeFieldCommand, type SafeFieldCommand } from './safeFieldCommand';
import { isAllowedDurableChangePath, safeFieldDescriptor } from './safeFieldRegistry';
import {
  STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE,
  type DurableAuthorityCampaignStatus,
  type DurableAuthorityDiagnosticRecord,
  type DurableAuthorityOutcome,
  type DurableAuthorityScope,
  type DurableFallbackReason,
  type PendingProjectionRecord,
} from './durableAuthorityTypes';
import { entityIdFromLegacy } from '../adapters/idMapping';

/** One Stage 15 durable-authority route request. All accessors are synchronous
 * and pure except the ONE real legacy compatibility commit (`commit`) or the
 * single unchanged legacy fallback (`fallback`). */
export interface DurableRouteRequest {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  sourceKind: CampaignSourceKind;
  scope: DurableAuthorityScope;
  command: SafeFieldCommand;
  sourceIdentity: string;
  occurredAt?: string;
  previousValue?: string;
  nextValue?: string;
  /** Adapt the exact current legacy state. May be called twice (base + stale
   * re-check). Never mutates legacy. */
  buildPre: () => AdapterResult;
  /** Adapt the predicted legacy post-state from a pure transition on a clone.
   * Never performs a real mutation / storage / network. */
  predictPost: () => AdapterResult;
  /** Perform the ONE real legacy compatibility commit and return the adapted
   * committed post-state. Called at most once, only AFTER the durable universal
   * commit succeeded. */
  commit: () => AdapterResult;
  /** Run the unchanged legacy action once as a PRE-commit fallback only. */
  fallback: () => void;
}

export interface DurableAuthorityRouterOptions {
  repositoryStorage: RepositoryStorage;
  diagnosticsStorage: CommandDiagnosticsStorage;
  recoveryStorage: CommandDiagnosticsStorage;
  allowedScopes: ReadonlySet<DurableAuthorityScope>;
  enabled: boolean;
  now?: () => string;
  maxRecords?: number;
  productionNamespace?: string;
}

/** Injected accessors so the router can resolve a pending projection at reload:
 * read the current legacy value and perform the deterministic legacy projection
 * for one record. Pure except `project`, which performs the ONE legacy action. */
export interface RecoveryContext {
  readLegacyValue: (entityKind: string, legacyEntityId: string, universalField: string) => string | undefined;
  project: (record: PendingProjectionRecord, committedValue: string) => AdapterResult;
  maxAttempts?: number;
}

interface CampaignEntry {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  status: DurableAuthorityCampaignStatus;
}

/**
 * Stage 15 — universal durable-authority router. For an allowlisted safe field
 * edit it composes a durable base (fresh legacy-owned data + universal-owned
 * fields), executes the universal command first, validates + scope-checks +
 * predicts + parity-checks, atomically commits the candidate to the production
 * universal namespace under an expected-revision guard, verifies read-after-
 * write, and only THEN performs exactly ONE legacy compatibility projection.
 * Pre-commit uncertainty runs the unchanged legacy action once (no repository
 * write). After the durable commit the universal repository is authoritative and
 * is never rolled back; a failed legacy projection becomes a pending, idempotent
 * recovery record.
 */
export class DurableAuthorityRouter {
  private readonly repo: SyncDurableRepository;
  private readonly diagnostics: DurableDiagnosticsStore;
  private readonly recovery: RecoveryStore;
  private readonly allowedScopes: ReadonlySet<DurableAuthorityScope>;
  private readonly enabled: boolean;
  private readonly now: () => string;
  private readonly entries = new Map<string, CampaignEntry>();
  private readonly listeners = new Set<() => void>();
  private readonly seenEventIds = new Set<string>();
  private disposed = false;
  private statusesSnapshot: DurableAuthorityCampaignStatus[] = [];

  constructor(options: DurableAuthorityRouterOptions) {
    this.repo = new SyncDurableRepository(options.repositoryStorage, options.productionNamespace);
    this.diagnostics = new DurableDiagnosticsStore(options.diagnosticsStorage, options.maxRecords);
    this.recovery = new RecoveryStore(options.recoveryStorage, options.maxRecords);
    this.allowedScopes = options.allowedScopes;
    this.enabled = options.enabled;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  get namespace(): string {
    return STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE;
  }

  get productionNamespace(): string {
    return this.repo.namespace;
  }

  isAllowlisted(scope: string): boolean {
    return this.allowedScopes.has(scope as DurableAuthorityScope);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(campaignId: CampaignId): DurableAuthorityCampaignStatus | null {
    const entry = this.entries.get(campaignId);
    return entry ? { ...entry.status } : null;
  }

  getAllStatuses(): DurableAuthorityCampaignStatus[] {
    return this.statusesSnapshot;
  }

  readDiagnostics(campaignId: CampaignId): DurableAuthorityDiagnosticRecord[] {
    return this.diagnostics.read(campaignId);
  }

  readPendingRecovery(campaignId: CampaignId): PendingProjectionRecord[] {
    return this.recovery.read(campaignId);
  }

  currentRevision(campaignId: CampaignId): UniversalRevision | null {
    try {
      return this.repo.readRevision(campaignId);
    } catch {
      return null;
    }
  }

  clearDiagnostics(campaignId: CampaignId): void {
    this.diagnostics.clear(campaignId);
    const entry = this.entries.get(campaignId);
    if (entry) {
      entry.status.recordCount = 0;
      this.emit();
    }
  }

  dispose(): void {
    // Disposing only abandons in-memory bookkeeping. A committed durable
    // universal transaction and any persisted pending recovery record survive in
    // storage untouched.
    this.disposed = true;
    this.entries.clear();
    this.statusesSnapshot = [];
    this.listeners.clear();
  }

  /**
   * Reload-time recovery: for each still-pending projection, if the legacy value
   * already matches the committed universal value mark it resolved; otherwise
   * perform the deterministic legacy projection exactly once (bounded retries)
   * and resolve on success. Never re-runs a completed commit, never crosses
   * campaigns, never rolls back universal state.
   */
  runRecovery(campaignId: CampaignId, ctx: RecoveryContext): { resolved: number; stillPending: number } {
    if (this.disposed || !this.enabled) return { resolved: 0, stillPending: 0 };
    const maxAttempts = Math.max(1, ctx.maxAttempts ?? 3);
    let resolved = 0;
    for (const record of this.recovery.read(campaignId)) {
      if (record.legacyProjectionStatus === 'committed') {
        this.recovery.resolve(campaignId, record.eventId);
        resolved += 1;
        continue;
      }
      // Read the durably committed value from the universal snapshot (never from
      // the record, which stores only a hash).
      let committedValue: string | undefined;
      try {
        const snapshot = this.repo.read(campaignId);
        const universalId = entityIdFromLegacy(record.entityKind, record.entityId);
        const entity = snapshot?.durable.entities.find((e) => e.id === universalId && e.kind === record.entityKind);
        const value = entity ? (entity as unknown as Record<string, unknown>)[fieldFromScope(record.commandScope)] : undefined;
        committedValue = typeof value === 'string' ? value : undefined;
      } catch {
        committedValue = undefined;
      }
      if (committedValue === undefined) continue; // cannot verify; leave pending
      // Already-applied legacy projection is recognised idempotently.
      const legacyValue = ctx.readLegacyValue(record.entityKind, record.entityId, fieldFromScope(record.commandScope));
      if (legacyValue === committedValue) {
        this.recovery.resolve(campaignId, record.eventId);
        resolved += 1;
        continue;
      }
      if (record.attemptCount >= maxAttempts) continue; // bounded; leave for manual inspection
      try {
        const res = ctx.project(record, committedValue);
        if (res.snapshot && !hasAdapterErrors(res)) {
          this.recovery.resolve(campaignId, record.eventId);
          resolved += 1;
        } else {
          this.recovery.upsert({ ...record, attemptCount: record.attemptCount + 1, lastErrorCategory: 'projection_adapter_failed', updatedAt: this.now() });
        }
      } catch (error) {
        this.recovery.upsert({ ...record, attemptCount: record.attemptCount + 1, lastErrorCategory: messageOf(error), updatedAt: this.now() });
      }
    }
    const entry = this.entries.get(campaignId);
    if (entry) {
      entry.status.pendingRecoveryCount = this.recovery.count(campaignId);
      this.emit();
    }
    return { resolved, stillPending: this.recovery.count(campaignId) };
  }

  /** Route one command through durable authority. */
  route(request: DurableRouteRequest): DurableAuthorityOutcome {
    const started = Date.now();
    const occurredAt = request.occurredAt ?? this.now();

    if (this.disposed || !this.enabled) {
      return this.runBareFallback(request, 'flag_disabled', occurredAt);
    }
    if (!this.isAllowlisted(request.scope)) {
      return this.runBareFallback(request, 'not_allowlisted', occurredAt);
    }
    if (!request.campaignId) {
      const entry = this.ensureEntry(request.campaignId, request.campaignKind);
      return this.finishFallback(request, entry, 'wrong_campaign', occurredAt, started, 'missing campaignId');
    }

    const entry = this.ensureEntry(request.campaignId, request.campaignKind);
    entry.status.running = true;
    entry.status.phase = 'capturing';
    entry.status.runCount += 1;
    entry.status.lastAttemptAt = this.now();
    this.emit();
    try {
      return this.runPipeline(request, entry, occurredAt, started);
    } catch (error) {
      return this.finishFallback(request, entry, 'executor_exception', occurredAt, started, messageOf(error));
    } finally {
      entry.status.running = false;
      this.emit();
    }
  }

  private runPipeline(
    request: DurableRouteRequest,
    entry: CampaignEntry,
    occurredAt: string,
    started: number,
  ): DurableAuthorityOutcome {
    const descriptor = safeFieldDescriptor(request.scope);

    // 1. Capture + validate the exact current legacy-adapted pre-state.
    entry.status.phase = 'capturing';
    const preRes = safeBuild(request.buildPre);
    if (!preRes.snapshot || hasAdapterErrors(preRes)) {
      return this.finishFallback(request, entry, 'invalid_pre_state', occurredAt, started, firstError(preRes) ?? 'pre-state adapter produced no snapshot');
    }
    const pre = preRes.snapshot;
    if (pre.metadata.campaignId !== request.campaignId) {
      return this.finishFallback(request, entry, 'wrong_campaign', occurredAt, started, `pre campaign ${pre.metadata.campaignId} != ${request.campaignId}`);
    }
    const preHash = semanticSnapshotHash(pre);
    const eventId = stableHash({ c: request.campaignId, s: request.scope, e: request.command.legacyEntityId, t: occurredAt, pre: preHash, v: request.nextValue ?? request.command.value });

    // Idempotent dedup.
    if (this.seenEventIds.has(eventId)) {
      const record = this.baseRecord(request, entry, eventId, occurredAt, descriptor.entityKind);
      record.phase = 'success';
      record.decision = 'durable_committed';
      record.authorityOwner = 'universal';
      record.errorCategory = 'duplicate_event';
      record.errorMessage = 'Duplicate durable-authority event deduplicated; no second commit.';
      record.legacyPreHash = preHash;
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: 'success', decision: 'durable_committed', fallbackReason: null, record };
    }

    // 2. Read the current durable universal snapshot + pending projections.
    entry.status.phase = 'repository_reading';
    const pendingKeys = this.recovery.pendingFieldKeys(request.campaignId);
    let universalCurrent;
    let currentRevision: UniversalRevision | null;
    try {
      universalCurrent = this.repo.read(request.campaignId);
      currentRevision = universalCurrent ? universalCurrent.revision : null;
    } catch (error) {
      return this.finishFallback(request, entry, 'repository_write_failed', occurredAt, started, `production read failed: ${messageOf(error)}`, { preHash, eventId });
    }

    // 3. Reconcile + compose the durable base.
    entry.status.phase = 'reconciling';
    const composed = composeDurableBase(pre, universalCurrent, pendingKeys);
    if (composed.report.status === 'invalid_universal') {
      return this.finishFallback(request, entry, 'reconciliation_conflict', occurredAt, started, 'stored universal snapshot is invalid; refusing automatic repair', { preHash, eventId, reconciliation: 'invalid_universal' });
    }
    const targetUniversalId = entityIdFromLegacy(descriptor.entityKind, request.command.legacyEntityId);
    const targetKey = `${targetUniversalId}.${descriptor.universalField}`;
    const conflictingAhead = composed.report.slots.some((slot) => slot.outcome === 'universal_ahead' && `${slot.entityId}.${slot.field}` !== targetKey);
    if (conflictingAhead) {
      return this.finishFallback(request, entry, 'reconciliation_conflict', occurredAt, started, 'unresolved pending projection on another field; run recovery first', { preHash, eventId, reconciliation: composed.report.status });
    }
    entry.status.phase = 'composing';
    const composedBaseHash = semanticSnapshotHash(composed.base);

    // 4. Execute the universal command → candidate.
    entry.status.phase = 'universal_executing';
    const result = executeSafeFieldCommand(composed.base, request.command);
    if (!result.accepted || !result.snapshot) {
      const reason: DurableFallbackReason = result.rejectionCode === 'mapping_failed' ? 'mapping_failed' : 'command_rejected';
      return this.finishFallback(request, entry, reason, occurredAt, started, result.rejectionMessage ?? 'universal command rejected', { preHash, eventId, reconciliation: composed.report.status, composedBaseHash });
    }
    const candidate = result.snapshot;

    // 5. Blocking candidate validation.
    entry.status.phase = 'candidate_validating';
    if (!validateCampaignSnapshot(candidate).ok) {
      return this.finishFallback(request, entry, 'validation_failed', occurredAt, started, 'candidate failed validation', { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'failed' });
    }

    // 6. Candidate change-set must stay within the allowlisted single-path shape.
    entry.status.phase = 'scope_validating';
    const outOfScope = result.changedPaths.filter((p) => !isAllowedDurableChangePath(request.scope, p));
    if (outOfScope.length > 0 || result.changedPaths.length !== 1) {
      return this.finishFallback(request, entry, 'candidate_scope_violation', occurredAt, started, `out-of-scope change(s): ${outOfScope.join(',') || 'unexpected path count'}`, { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'ok', scopeViolation: true });
    }
    const candidateHash = semanticSnapshotHash(candidate);

    // 7. Independent legacy transition prediction + parity.
    entry.status.phase = 'legacy_predicting';
    const predictRes = safeBuild(request.predictPost);
    if (!predictRes.snapshot || hasAdapterErrors(predictRes)) {
      return this.finishFallback(request, entry, 'prediction_unavailable', occurredAt, started, firstError(predictRes) ?? 'legacy prediction unavailable', { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'ok', candidateHash });
    }
    entry.status.phase = 'parity_validating';
    const predictionComparison = compareCommandResult(candidate, predictRes.snapshot);
    if (!isMatch(predictionComparison)) {
      return this.finishFallback(request, entry, 'prediction_mismatch', occurredAt, started, `${predictionComparison.mismatchCount} prediction mismatch(es)`, { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'ok', candidateHash, predictionComparison, predictedHash: semanticSnapshotHash(predictRes.snapshot) });
    }

    // 8. Stale precondition re-check: legacy pre-state AND repo revision must be
    // unchanged since capture.
    entry.status.phase = 'stale_rechecking';
    const recheck = safeBuild(request.buildPre);
    if (!recheck.snapshot || semanticSnapshotHash(recheck.snapshot) !== preHash) {
      return this.finishFallback(request, entry, 'stale_precondition', occurredAt, started, 'legacy pre-state changed before commit', { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'ok', candidateHash, predictionComparison, predictedHash: semanticSnapshotHash(predictRes.snapshot) });
    }
    let revisionNow: UniversalRevision | null;
    try {
      revisionNow = this.repo.readRevision(request.campaignId);
    } catch {
      revisionNow = null;
    }
    if (revisionNow !== currentRevision) {
      return this.finishFallback(request, entry, 'repository_conflict', occurredAt, started, `production revision changed ${currentRevision} -> ${revisionNow}`, { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'ok', candidateHash, predictionComparison, predictedHash: semanticSnapshotHash(predictRes.snapshot) });
    }

    // 9. Atomic durable universal commit (expected-revision guard).
    entry.status.phase = 'repository_committing';
    this.seenEventIds.add(eventId);
    const record = this.baseRecord(request, entry, eventId, occurredAt, descriptor.entityKind);
    record.legacyPreHash = preHash;
    record.baseRepositoryRevision = currentRevision;
    record.composedBaseHash = composedBaseHash;
    record.candidateHash = candidateHash;
    record.predictedLegacyHash = semanticSnapshotHash(predictRes.snapshot);
    record.predictionComparison = predictionComparison;
    record.preValidationStatus = 'ok';
    record.candidateValidationStatus = 'ok';
    record.scopeStatus = 'ok';
    record.reconciliationStatus = composed.report.status;
    record.initializationStatus = composed.initialization === 'initialized' ? 'initialized' : 'existing';
    record.changedSafePaths = result.changedPaths;

    let newRevision: UniversalRevision;
    try {
      newRevision = currentRevision === null ? this.repo.create(candidate).newRevision : this.repo.replace(candidate, currentRevision).newRevision;
    } catch (error) {
      const message = messageOf(error);
      const reason: DurableFallbackReason = message.startsWith('CONFLICT') ? 'repository_conflict' : 'repository_write_failed';
      // Pre-durable: safe fallback. seenEventIds keeps the id, but nothing was
      // committed; that is fine — the fallback runs the legacy action once.
      this.seenEventIds.delete(eventId);
      return this.finishFallback(request, entry, reason, occurredAt, started, message, { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'ok', candidateHash, predictionComparison, predictedHash: record.predictedLegacyHash });
    }
    // ---- DURABLE FROM HERE. No pre-commit fallback beyond this point. ----
    entry.status.phase = 'repository_committed';
    record.repositoryCommitStatus = 'committed';
    record.candidateRepositoryRevision = newRevision;
    record.decision = 'durable_committed';
    record.authorityOwner = 'universal';

    // 10. Read-after-write verification. The persisted record is JSON — which
    // drops `undefined`-valued keys — so compare the read-back against the
    // canonical (JSON-roundtripped) candidate, not the in-memory candidate.
    entry.status.phase = 'repository_read_verifying';
    // The repository stores the candidate at `newRevision`; hash that exact
    // persisted form (JSON-roundtripped, revision-stamped) so the read-back
    // comparison is a true equality of what was durably written.
    const committedHash = semanticSnapshotHash(JSON.parse(JSON.stringify({ ...candidate, revision: newRevision })) as typeof candidate);
    let readBackHash: string | null = null;
    try {
      const readBack = this.repo.read(request.campaignId);
      readBackHash = readBack ? semanticSnapshotHash(readBack) : null;
    } catch {
      readBackHash = null;
    }
    record.repositoryCommittedHash = committedHash;
    record.repositoryReadHash = readBackHash;
    if (readBackHash !== committedHash) {
      record.repositoryReadStatus = 'failed';
      record.phase = 'universal_committed_legacy_pending';
      record.errorCategory = 'repository_read_verify_failed';
      record.errorMessage = 'durable commit read-after-write mismatch; legacy projection deferred to recovery';
      this.createPending(request, descriptor, newRevision, record);
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: record.phase, decision: 'durable_committed', fallbackReason: null, record };
    }
    record.repositoryReadStatus = 'ok';

    // 11. ONE deterministic legacy compatibility projection.
    entry.status.phase = 'legacy_projecting';
    let committedRes: AdapterResult;
    try {
      committedRes = request.commit();
    } catch (error) {
      record.phase = 'universal_committed_legacy_pending';
      record.legacyProjectionStatus = 'pending';
      record.errorCategory = 'legacy_projection_threw';
      record.errorMessage = messageOf(error);
      this.createPending(request, descriptor, newRevision, record);
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: record.phase, decision: 'durable_committed', fallbackReason: null, record };
    }

    // 12. Verify legacy projection.
    entry.status.phase = 'legacy_verifying';
    if (!committedRes.snapshot || hasAdapterErrors(committedRes)) {
      record.phase = 'universal_committed_legacy_failed';
      record.legacyProjectionStatus = 'failed';
      record.errorCategory = 'legacy_projection_adapter_failed';
      record.errorMessage = firstError(committedRes) ?? 'committed legacy post-state adapter produced no snapshot';
      this.createPending(request, descriptor, newRevision, record);
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: record.phase, decision: 'durable_committed', fallbackReason: null, record };
    }
    record.legacyProjectionStatus = 'committed';
    record.legacyPostHash = semanticSnapshotHash(committedRes.snapshot);
    const legacyComparison = compareCommandResult(candidate, committedRes.snapshot);
    record.legacyVerificationComparison = legacyComparison;
    if (isMatch(legacyComparison)) {
      record.phase = 'success';
      // A successful projection resolves any prior pending record on this slot.
      for (const pending of this.recovery.read(request.campaignId)) {
        if (pending.entityId === request.command.legacyEntityId && pending.field === descriptor.universalField) {
          this.recovery.resolve(request.campaignId, pending.eventId);
          record.recoveryStatus = 'resolved';
        }
      }
    } else {
      record.phase = 'post_commit_mismatch';
      record.errorCategory = 'legacy_projection_mismatch';
      record.errorMessage = `${legacyComparison.mismatchCount} legacy projection mismatch(es)`;
    }
    this.persistAndApply(entry, record, started);
    return { handled: true, phase: record.phase, decision: 'durable_committed', fallbackReason: null, record };
  }

  private createPending(
    request: DurableRouteRequest,
    descriptor: ReturnType<typeof safeFieldDescriptor>,
    committedRevision: UniversalRevision,
    record: DurableAuthorityDiagnosticRecord,
  ): void {
    const now = this.now();
    const ok = this.recovery.upsert({
      eventId: record.eventId,
      campaignId: request.campaignId,
      campaignKind: request.campaignKind,
      commandScope: request.scope,
      entityKind: descriptor.entityKind,
      entityId: request.command.legacyEntityId,
      field: descriptor.universalField,
      committedUniversalRevision: committedRevision,
      committedValueHash: stableHash(request.command.value),
      legacyProjectionStatus: record.legacyProjectionStatus === 'failed' ? 'failed' : 'pending',
      attemptCount: 0,
      lastErrorCategory: record.errorCategory,
      createdAt: now,
      updatedAt: now,
    });
    record.recoveryStatus = ok ? 'pending_created' : record.recoveryStatus;
  }

  /** Pre-commit fallback: run the unchanged legacy action exactly once, record. */
  private finishFallback(
    request: DurableRouteRequest,
    entry: CampaignEntry,
    reason: DurableFallbackReason,
    occurredAt: string,
    started: number,
    message: string,
    partial?: {
      preHash?: string;
      eventId?: string;
      reconciliation?: DurableAuthorityDiagnosticRecord['reconciliationStatus'];
      composedBaseHash?: string;
      candidateValidation?: 'ok' | 'failed';
      candidateHash?: string;
      scopeViolation?: boolean;
      predictionComparison?: CommandComparisonSummary;
      predictedHash?: string;
    },
  ): DurableAuthorityOutcome {
    const descriptor = safeFieldDescriptor(request.scope);
    const eventId = partial?.eventId ?? stableHash({ c: request.campaignId, s: request.scope, t: occurredAt, r: reason });
    const record = this.baseRecord(request, entry, eventId, occurredAt, descriptor.entityKind);
    record.decision = 'fallback';
    record.authorityOwner = 'legacy';
    record.fallbackReason = reason;
    record.phase = 'fallback_legacy';
    record.legacyPreHash = partial?.preHash ?? null;
    record.composedBaseHash = partial?.composedBaseHash ?? null;
    record.candidateHash = partial?.candidateHash ?? null;
    record.predictedLegacyHash = partial?.predictedHash ?? null;
    record.predictionComparison = partial?.predictionComparison ?? null;
    record.candidateValidationStatus = partial?.candidateValidation ?? 'skipped';
    record.scopeStatus = partial?.scopeViolation ? 'violation' : 'skipped';
    record.reconciliationStatus = partial?.reconciliation ?? 'skipped';
    record.repositoryCommitStatus = 'not_committed';
    record.legacyProjectionStatus = 'not_attempted';
    record.errorCategory = reason;
    record.errorMessage = message;

    let ok = true;
    try {
      request.fallback();
    } catch (error) {
      ok = false;
      record.errorMessage = `fallback failed: ${messageOf(error)}`;
    }
    record.phase = ok ? 'fallback_success' : 'fallback_failed';
    this.persistAndApply(entry, record, started);
    return { handled: true, phase: record.phase, decision: 'fallback', fallbackReason: reason, record };
  }

  /** Flag-off / not-allowlisted fallback: run legacy once, write NO diagnostics
   * and touch NO repository/recovery storage. */
  private runBareFallback(request: DurableRouteRequest, reason: DurableFallbackReason, occurredAt: string): DurableAuthorityOutcome {
    let ok = true;
    try {
      request.fallback();
    } catch {
      ok = false;
    }
    const descriptor = safeFieldDescriptor(request.scope);
    const rec = this.baseRecord(request, this.transientEntry(request), '', occurredAt, descriptor.entityKind);
    rec.decision = 'fallback';
    rec.authorityOwner = 'legacy';
    rec.fallbackReason = reason;
    rec.phase = ok ? 'fallback_success' : 'fallback_failed';
    rec.repositoryCommitStatus = 'not_committed';
    rec.legacyProjectionStatus = 'not_attempted';
    return { handled: false, phase: rec.phase, decision: 'fallback', fallbackReason: reason, record: rec };
  }

  private persistAndApply(entry: CampaignEntry, record: DurableAuthorityDiagnosticRecord, started: number): void {
    record.recordedAt = this.now();
    record.durationBucketMs = bucketDuration(Date.now() - started);
    const persisted = this.diagnostics.append(record);
    entry.status.recordCount = this.diagnostics.count(entry.campaignId);
    entry.status.pendingRecoveryCount = this.recovery.count(entry.campaignId);
    entry.status.currentRevision = this.currentRevision(entry.campaignId);
    entry.status.phase = record.phase;
    entry.status.lastEventId = record.eventId || entry.status.lastEventId;
    entry.status.lastDecision = record.decision;
    entry.status.lastFallbackReason = record.fallbackReason;
    entry.status.lastReconciliationStatus = record.reconciliationStatus;
    entry.status.lastPredictionComparison = record.predictionComparison;
    entry.status.lastLegacyVerificationComparison = record.legacyVerificationComparison;
    entry.status.lastErrorCategory = record.errorCategory;
    entry.status.lastErrorMessage = record.errorMessage;
    if (record.phase === 'success' && record.decision === 'durable_committed') {
      entry.status.durableCommitCount += 1;
      entry.status.lastDurableCommitAt = record.recordedAt;
    } else if (record.decision === 'fallback') {
      entry.status.fallbackCount += 1;
      entry.status.lastFallbackAt = record.recordedAt;
    } else if (record.phase === 'post_commit_mismatch') {
      entry.status.durableCommitCount += 1;
      entry.status.mismatchCount += 1;
      entry.status.lastMismatchAt = record.recordedAt;
    } else if (record.decision === 'durable_committed') {
      entry.status.durableCommitCount += 1;
    }
    if (!persisted) entry.status.lastErrorCategory = 'diagnostics_persistence_failed';
    this.emit();
  }

  private ensureEntry(campaignId: CampaignId, campaignKind: CommandCampaignKind): CampaignEntry {
    let entry = this.entries.get(campaignId);
    if (!entry) {
      entry = { campaignId, campaignKind, status: emptyStatus(campaignId, campaignKind, this.diagnostics.count(campaignId), this.recovery.count(campaignId), this.currentRevision(campaignId)) };
      this.entries.set(campaignId, entry);
    }
    return entry;
  }

  private transientEntry(request: DurableRouteRequest): CampaignEntry {
    return { campaignId: request.campaignId, campaignKind: request.campaignKind, status: emptyStatus(request.campaignId, request.campaignKind, 0, 0, null) };
  }

  private baseRecord(
    request: DurableRouteRequest,
    entry: CampaignEntry,
    eventId: string,
    occurredAt: string,
    entityKind: string,
  ): DurableAuthorityDiagnosticRecord {
    return {
      eventId,
      campaignId: request.campaignId,
      campaignKind: entry.campaignKind,
      commandScope: request.scope,
      entityKind,
      entityIdHash: stableHash(request.command.legacyEntityId),
      fields: [safeFieldDescriptor(request.scope).universalField],
      occurredAt,
      recordedAt: this.now(),
      phase: 'not_started',
      decision: 'fallback',
      fallbackReason: null,
      authorityOwner: 'legacy',
      initializationStatus: 'none',
      baseRepositoryRevision: null,
      candidateRepositoryRevision: null,
      legacyPreHash: null,
      composedBaseHash: null,
      candidateHash: null,
      repositoryCommittedHash: null,
      repositoryReadHash: null,
      predictedLegacyHash: null,
      legacyPostHash: null,
      preValidationStatus: 'skipped',
      candidateValidationStatus: 'skipped',
      scopeStatus: 'skipped',
      predictionComparison: null,
      repositoryCommitStatus: 'not_committed',
      repositoryReadStatus: 'skipped',
      legacyProjectionStatus: 'not_attempted',
      legacyVerificationComparison: null,
      reconciliationStatus: 'skipped',
      recoveryStatus: 'none',
      changedSafePaths: [],
      durationBucketMs: '0-1ms',
      errorCategory: null,
      errorMessage: null,
      inverse: {
        field: safeFieldDescriptor(request.scope).universalField,
        previousValueHash: stableHash(request.previousValue ?? null),
        nextValueHash: stableHash(request.nextValue ?? request.command.value),
      },
    };
  }

  private emit(): void {
    this.statusesSnapshot = Array.from(this.entries.values()).map((entry) => ({ ...entry.status }));
    for (const listener of this.listeners) listener();
  }
}

function fieldFromScope(scope: DurableAuthorityScope): string {
  return safeFieldDescriptor(scope).universalField;
}

function emptyStatus(
  campaignId: CampaignId,
  campaignKind: CommandCampaignKind,
  recordCount: number,
  pendingRecoveryCount: number,
  currentRevision: UniversalRevision | null,
): DurableAuthorityCampaignStatus {
  return {
    campaignId,
    campaignKind,
    namespace: STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE,
    phase: 'not_started',
    lastDecision: null,
    lastFallbackReason: null,
    running: false,
    pending: 0,
    currentRevision,
    lastEventId: null,
    lastAttemptAt: null,
    lastDurableCommitAt: null,
    lastFallbackAt: null,
    lastMismatchAt: null,
    runCount: 0,
    durableCommitCount: 0,
    fallbackCount: 0,
    mismatchCount: 0,
    pendingRecoveryCount,
    lastReconciliationStatus: null,
    lastPredictionComparison: null,
    lastLegacyVerificationComparison: null,
    lastErrorCategory: null,
    lastErrorMessage: null,
    recordCount,
  };
}

function isMatch(comparison: CommandComparisonSummary): boolean {
  return comparison.classification === 'equal' || comparison.classification === 'revision_only' || comparison.classification === 'ordering_only';
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

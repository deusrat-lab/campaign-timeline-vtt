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
import { projectDMWorkspace, projectPlayerSafe, projectObserver } from '../projection/projectCampaign';
import { SyncDurableRepository } from '../durable-authority/syncDurableRepository';
import { ComplexDiagnosticsStore } from './complexDiagnosticsStore';
import { ComplexRecoveryStore } from './complexRecoveryStore';
import { composeAggregateBase } from './composeAggregateBase';
import { aggregateDescriptor } from './aggregateOwnership';
import {
  executeComplexCommand,
  ownedPathPrefixes,
  readAggregateSlot,
  inverseCommandKind,
  type ComplexCommand,
} from './complexCommands';
import { validateAggregateInvariants } from './aggregateInvariants';
import {
  STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE,
  type ComplexAggregateKind,
  type ComplexAuthorityCampaignStatus,
  type ComplexAuthorityDiagnosticRecord,
  type ComplexAuthorityOutcome,
  type ComplexAuthorityScope,
  type ComplexCommandKind,
  type ComplexFallbackReason,
  type ComplexPendingProjectionRecord,
} from './complexAuthorityTypes';

/** One Stage 16 complex-authority route request. All accessors are synchronous
 * and pure except the ONE real legacy compatibility commit (`commit`) or the
 * single unchanged legacy fallback (`fallback`). */
export interface ComplexRouteRequest {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  sourceKind: CampaignSourceKind;
  scope: ComplexAuthorityScope;
  command: ComplexCommand;
  sourceIdentity: string;
  occurredAt?: string;
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

export interface ComplexAuthorityRouterOptions {
  repositoryStorage: RepositoryStorage;
  diagnosticsStorage: CommandDiagnosticsStorage;
  recoveryStorage: CommandDiagnosticsStorage;
  allowedScopes: ReadonlySet<ComplexAuthorityScope>;
  enabled: boolean;
  now?: () => string;
  maxRecords?: number;
  productionNamespace?: string;
}

export interface ComplexRecoveryContext {
  /** Read the current legacy owned-slot value for idempotent recognition. */
  readLegacySlot: (aggregateKind: ComplexAggregateKind, targetId: string) => unknown;
  /** Perform the deterministic legacy projection for one pending record. */
  project: (record: ComplexPendingProjectionRecord, committedValue: unknown) => AdapterResult;
  maxAttempts?: number;
}

interface CampaignEntry {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  status: ComplexAuthorityCampaignStatus;
}

/**
 * Stage 16 — universal complex (aggregate) durable-authority coordinator.
 * Generalises the Stage 15 durable router from field-level to aggregate-level
 * ownership. The lifecycle and the `repository_committed` boundary semantics are
 * identical: safe pre-commit fallback before the durable write; after it the
 * universal repository is authoritative and never rolled back, and a failed
 * legacy projection becomes a pending idempotent recovery record.
 */
export class ComplexAuthorityRouter {
  private readonly repo: SyncDurableRepository;
  private readonly diagnostics: ComplexDiagnosticsStore;
  private readonly recovery: ComplexRecoveryStore;
  private readonly allowedScopes: ReadonlySet<ComplexAuthorityScope>;
  private readonly enabled: boolean;
  private readonly now: () => string;
  private readonly entries = new Map<string, CampaignEntry>();
  private readonly listeners = new Set<() => void>();
  private readonly seenEventIds = new Set<string>();
  private disposed = false;
  private statusesSnapshot: ComplexAuthorityCampaignStatus[] = [];

  constructor(options: ComplexAuthorityRouterOptions) {
    this.repo = new SyncDurableRepository(options.repositoryStorage, options.productionNamespace);
    this.diagnostics = new ComplexDiagnosticsStore(options.diagnosticsStorage, options.maxRecords);
    this.recovery = new ComplexRecoveryStore(options.recoveryStorage, options.maxRecords);
    this.allowedScopes = options.allowedScopes;
    this.enabled = options.enabled;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  get namespace(): string {
    return STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE;
  }

  get productionNamespace(): string {
    return this.repo.namespace;
  }

  isAllowlisted(scope: string): boolean {
    return this.allowedScopes.has(scope as ComplexAuthorityScope);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(campaignId: CampaignId): ComplexAuthorityCampaignStatus | null {
    const entry = this.entries.get(campaignId);
    return entry ? { ...entry.status } : null;
  }

  getAllStatuses(): ComplexAuthorityCampaignStatus[] {
    return this.statusesSnapshot;
  }

  readDiagnostics(campaignId: CampaignId): ComplexAuthorityDiagnosticRecord[] {
    return this.diagnostics.read(campaignId);
  }

  readPendingRecovery(campaignId: CampaignId): ComplexPendingProjectionRecord[] {
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
    this.disposed = true;
    this.entries.clear();
    this.statusesSnapshot = [];
    this.listeners.clear();
  }

  /** Reload-time recovery for pending aggregate projections. */
  runRecovery(campaignId: CampaignId, ctx: ComplexRecoveryContext): { resolved: number; stillPending: number } {
    if (this.disposed || !this.enabled) return { resolved: 0, stillPending: 0 };
    const maxAttempts = Math.max(1, ctx.maxAttempts ?? 3);
    let resolved = 0;
    for (const record of this.recovery.read(campaignId)) {
      if (record.legacyProjectionStatus === 'committed') {
        this.recovery.resolve(campaignId, record.eventId);
        resolved += 1;
        continue;
      }
      let committedValue: unknown;
      try {
        const snapshot = this.repo.read(campaignId);
        committedValue = snapshot ? readAggregateSlot(snapshot, record.aggregateKind, record.targetId) : undefined;
      } catch {
        committedValue = undefined;
      }
      if (committedValue === undefined) continue; // cannot verify; leave pending
      const legacyValue = ctx.readLegacySlot(record.aggregateKind, record.targetId);
      if (JSON.stringify(legacyValue) === JSON.stringify(committedValue)) {
        this.recovery.resolve(campaignId, record.eventId);
        resolved += 1;
        continue;
      }
      if (record.attemptCount >= maxAttempts) continue; // bounded; leave for inspection
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

  route(request: ComplexRouteRequest): ComplexAuthorityOutcome {
    const started = Date.now();
    const occurredAt = request.occurredAt ?? this.now();

    if (this.disposed || !this.enabled) {
      return this.runBareFallback(request, 'flag_disabled', occurredAt);
    }
    if (!this.isAllowlisted(request.scope)) {
      return this.runBareFallback(request, 'not_allowlisted', occurredAt);
    }
    // The command kind must belong to the scope's aggregate.
    const descriptor = aggregateDescriptor(request.scope);
    if (!descriptor.commandKinds.includes(request.command.kind)) {
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
    entry.status.lastAggregateKind = descriptor.aggregateKind;
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
    request: ComplexRouteRequest,
    entry: CampaignEntry,
    occurredAt: string,
    started: number,
  ): ComplexAuthorityOutcome {
    const descriptor = aggregateDescriptor(request.scope);
    const aggregateKind = descriptor.aggregateKind;

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
    const eventId = stableHash({ c: request.campaignId, s: request.scope, k: request.command.kind, cmd: request.command, t: occurredAt, pre: preHash });

    if (this.seenEventIds.has(eventId)) {
      const record = this.baseRecord(request, entry, eventId, occurredAt, aggregateKind, request.command.kind);
      record.phase = 'success';
      record.decision = 'durable_committed';
      record.authorityOwner = 'universal';
      record.errorCategory = 'duplicate_event';
      record.errorMessage = 'Duplicate complex-authority event deduplicated; no second commit.';
      record.legacyPreHash = preHash;
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: 'success', decision: 'durable_committed', fallbackReason: null, record };
    }

    // 2. Read the current durable universal snapshot + pending projections.
    entry.status.phase = 'repository_reading';
    const pendingSlots = this.recovery.pendingSlotKeys(request.campaignId);
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
    const composed = composeAggregateBase(pre, universalCurrent, pendingSlots);
    if (composed.report.status === 'invalid_universal') {
      return this.finishFallback(request, entry, 'reconciliation_conflict', occurredAt, started, 'stored universal snapshot is invalid; refusing automatic repair', { preHash, eventId, reconciliation: 'invalid_universal' });
    }

    // 4. Identity + owned-slot for the target (executed below); block if there is
    // an unresolved pending projection on a DIFFERENT slot.
    entry.status.phase = 'composing';
    const composedBaseHash = semanticSnapshotHash(composed.base);

    // 5. Execute the typed complex command → candidate.
    entry.status.phase = 'universal_executing';
    const result = executeComplexCommand(composed.base, request.command);
    if (!result.accepted || !result.snapshot || !result.slotKey || result.targetId === null) {
      const reason: ComplexFallbackReason = result.rejectionCode === 'mapping_failed' ? 'mapping_failed' : 'command_rejected';
      const record = this.partial(request, entry, eventId, occurredAt, aggregateKind, request.command.kind, { preHash, composedBaseHash, reconciliation: composed.report.status });
      if (result.rejectionCode === 'mapping_failed') record.identityStatus = 'missing';
      return this.finishFallbackWith(request, entry, record, reason, started, result.rejectionMessage ?? 'universal command rejected');
    }
    const candidate = result.snapshot;
    const slotKey = result.slotKey;
    const targetId = result.targetId;

    // Block if a pending projection is unresolved on ANOTHER slot.
    const conflictingAhead = composed.report.universalAheadSlots.some((k) => k !== slotKey);
    if (conflictingAhead) {
      return this.finishFallback(request, entry, 'reconciliation_conflict', occurredAt, started, 'unresolved pending projection on another aggregate slot; run recovery first', { preHash, eventId, reconciliation: composed.report.status, composedBaseHash });
    }

    // 6. Blocking candidate schema validation.
    entry.status.phase = 'candidate_validating';
    if (!validateCampaignSnapshot(candidate).ok) {
      return this.finishFallback(request, entry, 'validation_failed', occurredAt, started, 'candidate failed validation', { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'failed' });
    }

    // 7. System-specific invariants.
    entry.status.phase = 'invariants_validating';
    const invariantViolations = validateAggregateInvariants(composed.base, candidate, request.command);
    if (invariantViolations.length > 0) {
      const record = this.partial(request, entry, eventId, occurredAt, aggregateKind, request.command.kind, { preHash, composedBaseHash, reconciliation: composed.report.status, candidateValidation: 'ok' });
      record.invariantStatus = 'violation';
      return this.finishFallbackWith(request, entry, record, 'invariant_violation', started, invariantViolations.join('; '));
    }

    // 8. Candidate change-set must stay inside the owned aggregate region.
    entry.status.phase = 'scope_validating';
    const prefixes = ownedPathPrefixes(aggregateKind, targetId);
    const inScope = (p: string): boolean => prefixes.some((prefix) => p === prefix || p.startsWith(`${prefix}.`) || p.startsWith(`${prefix}:`));
    const outOfScope = result.changedPaths.filter((p) => !inScope(p));
    if (outOfScope.length > 0 || result.changedPaths.length === 0) {
      const record = this.partial(request, entry, eventId, occurredAt, aggregateKind, request.command.kind, { preHash, composedBaseHash, reconciliation: composed.report.status, candidateValidation: 'ok' });
      record.invariantStatus = 'ok';
      record.scopeStatus = 'violation';
      return this.finishFallbackWith(request, entry, record, 'candidate_scope_violation', started, `out-of-scope change(s): ${outOfScope.join(',') || 'no changed path'}`);
    }
    const candidateHash = semanticSnapshotHash(candidate);
    const aggregatePreHash = stableHash(readAggregateSlot(composed.base, aggregateKind, targetId));

    // 9. Independent legacy prediction + parity.
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

    // 10. Stale precondition re-check: legacy pre-state AND repo revision.
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

    // 11. Atomic durable universal commit (expected-revision guard).
    entry.status.phase = 'repository_committing';
    this.seenEventIds.add(eventId);
    const record = this.baseRecord(request, entry, eventId, occurredAt, aggregateKind, request.command.kind);
    record.targetIdentityHash = stableHash(targetId);
    record.legacyPreHash = preHash;
    record.baseRepositoryRevision = currentRevision;
    record.composedBaseHash = composedBaseHash;
    record.aggregatePreHash = aggregatePreHash;
    record.candidateHash = candidateHash;
    record.predictedLegacyHash = semanticSnapshotHash(predictRes.snapshot);
    record.predictionComparison = predictionComparison;
    record.preconditionStatus = 'ok';
    record.candidateValidationStatus = 'ok';
    record.invariantStatus = 'ok';
    record.scopeStatus = 'ok';
    record.identityStatus = 'ok';
    record.reconciliationStatus = composed.report.status;
    record.initializationStatus = composed.initialization === 'initialized' ? 'initialized' : 'existing';
    record.changedAggregatePaths = result.changedPaths;

    let newRevision: UniversalRevision;
    try {
      newRevision = currentRevision === null ? this.repo.create(candidate).newRevision : this.repo.replace(candidate, currentRevision).newRevision;
    } catch (error) {
      const message = messageOf(error);
      const reason: ComplexFallbackReason = message.startsWith('CONFLICT') ? 'repository_conflict' : 'repository_write_failed';
      this.seenEventIds.delete(eventId);
      return this.finishFallback(request, entry, reason, occurredAt, started, message, { preHash, eventId, reconciliation: composed.report.status, composedBaseHash, candidateValidation: 'ok', candidateHash, predictionComparison, predictedHash: record.predictedLegacyHash });
    }
    // ---- DURABLE FROM HERE. No pre-commit fallback beyond this point. ----
    entry.status.phase = 'repository_committed';
    record.repositoryCommitStatus = 'committed';
    record.candidateRepositoryRevision = newRevision;
    record.decision = 'durable_committed';
    record.authorityOwner = 'universal';

    // 12. Read-after-write verification (compare against the persisted form).
    entry.status.phase = 'repository_read_verifying';
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
    // Projection hashes (DM / Player-Safe / Observer) of the durably committed
    // candidate — redacted (hashes only).
    this.stampProjectionHashes(record, candidate);
    if (readBackHash !== committedHash) {
      record.repositoryReadStatus = 'failed';
      record.phase = 'universal_committed_legacy_pending';
      record.errorCategory = 'repository_read_verify_failed';
      record.errorMessage = 'durable commit read-after-write mismatch; legacy projection deferred to recovery';
      this.createPending(request, aggregateKind, slotKey, targetId, candidate, newRevision, record);
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: record.phase, decision: 'durable_committed', fallbackReason: null, record };
    }
    record.repositoryReadStatus = 'ok';

    // 13. ONE deterministic legacy compatibility projection.
    entry.status.phase = 'legacy_projecting';
    let committedRes: AdapterResult;
    try {
      committedRes = request.commit();
    } catch (error) {
      record.phase = 'universal_committed_legacy_pending';
      record.legacyProjectionStatus = 'pending';
      record.errorCategory = 'legacy_projection_threw';
      record.errorMessage = messageOf(error);
      this.createPending(request, aggregateKind, slotKey, targetId, candidate, newRevision, record);
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: record.phase, decision: 'durable_committed', fallbackReason: null, record };
    }

    // 14. Verify legacy projection.
    entry.status.phase = 'legacy_verifying';
    if (!committedRes.snapshot || hasAdapterErrors(committedRes)) {
      record.phase = 'universal_committed_legacy_failed';
      record.legacyProjectionStatus = 'failed';
      record.errorCategory = 'legacy_projection_adapter_failed';
      record.errorMessage = firstError(committedRes) ?? 'committed legacy post-state adapter produced no snapshot';
      this.createPending(request, aggregateKind, slotKey, targetId, candidate, newRevision, record);
      this.persistAndApply(entry, record, started);
      return { handled: true, phase: record.phase, decision: 'durable_committed', fallbackReason: null, record };
    }
    record.legacyProjectionStatus = 'committed';
    record.legacyPostHash = semanticSnapshotHash(committedRes.snapshot);
    const legacyComparison = compareCommandResult(candidate, committedRes.snapshot);
    record.legacyVerificationComparison = legacyComparison;
    if (isMatch(legacyComparison)) {
      record.phase = 'success';
      for (const pending of this.recovery.read(request.campaignId)) {
        if (pending.slotKey === slotKey) {
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

  private stampProjectionHashes(record: ComplexAuthorityDiagnosticRecord, candidate: Parameters<typeof projectDMWorkspace>[0]): void {
    try {
      record.dmProjectionHash = stableHash(projectDMWorkspace(candidate));
      record.playerSafeProjectionHash = stableHash(projectPlayerSafe(candidate));
      record.observerProjectionHash = stableHash(projectObserver(candidate));
    } catch {
      /* projection hashing is diagnostic-only; never affects the commit */
    }
  }

  private createPending(
    request: ComplexRouteRequest,
    aggregateKind: ComplexAggregateKind,
    slotKey: string,
    targetId: string,
    candidate: Parameters<typeof readAggregateSlot>[0],
    committedRevision: UniversalRevision,
    record: ComplexAuthorityDiagnosticRecord,
  ): void {
    const now = this.now();
    const committedValue = readAggregateSlot(candidate, aggregateKind, targetId);
    const ok = this.recovery.upsert({
      eventId: record.eventId,
      campaignId: request.campaignId,
      campaignKind: request.campaignKind,
      commandScope: request.scope,
      aggregateKind,
      commandKind: request.command.kind,
      slotKey,
      targetId,
      committedUniversalRevision: committedRevision,
      committedValueHash: stableHash(committedValue),
      legacyProjectionStatus: record.legacyProjectionStatus === 'failed' ? 'failed' : 'pending',
      attemptCount: 0,
      lastErrorCategory: record.errorCategory,
      createdAt: now,
      updatedAt: now,
    });
    record.recoveryStatus = ok ? 'pending_created' : record.recoveryStatus;
  }

  private finishFallback(
    request: ComplexRouteRequest,
    entry: CampaignEntry,
    reason: ComplexFallbackReason,
    occurredAt: string,
    started: number,
    message: string,
    partial?: {
      preHash?: string;
      eventId?: string;
      reconciliation?: ComplexAuthorityDiagnosticRecord['reconciliationStatus'];
      composedBaseHash?: string;
      candidateValidation?: 'ok' | 'failed';
      candidateHash?: string;
      predictionComparison?: CommandComparisonSummary;
      predictedHash?: string;
    },
  ): ComplexAuthorityOutcome {
    const descriptor = aggregateDescriptor(request.scope);
    const eventId = partial?.eventId ?? stableHash({ c: request.campaignId, s: request.scope, t: occurredAt, r: reason });
    const record = this.baseRecord(request, entry, eventId, occurredAt, descriptor.aggregateKind, request.command.kind);
    record.legacyPreHash = partial?.preHash ?? null;
    record.composedBaseHash = partial?.composedBaseHash ?? null;
    record.candidateHash = partial?.candidateHash ?? null;
    record.predictedLegacyHash = partial?.predictedHash ?? null;
    record.predictionComparison = partial?.predictionComparison ?? null;
    record.candidateValidationStatus = partial?.candidateValidation ?? 'skipped';
    record.reconciliationStatus = partial?.reconciliation ?? 'skipped';
    return this.finishFallbackWith(request, entry, record, reason, started, message);
  }

  private finishFallbackWith(
    request: ComplexRouteRequest,
    entry: CampaignEntry,
    record: ComplexAuthorityDiagnosticRecord,
    reason: ComplexFallbackReason,
    started: number,
    message: string,
  ): ComplexAuthorityOutcome {
    record.decision = 'fallback';
    record.authorityOwner = 'legacy';
    record.fallbackReason = reason;
    record.phase = 'fallback_legacy';
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

  private runBareFallback(request: ComplexRouteRequest, reason: ComplexFallbackReason, occurredAt: string): ComplexAuthorityOutcome {
    let ok = true;
    try {
      request.fallback();
    } catch {
      ok = false;
    }
    const descriptor = aggregateDescriptor(request.scope);
    const rec = this.baseRecord(request, this.transientEntry(request), '', occurredAt, descriptor.aggregateKind, request.command.kind);
    rec.decision = 'fallback';
    rec.authorityOwner = 'legacy';
    rec.fallbackReason = reason;
    rec.phase = ok ? 'fallback_success' : 'fallback_failed';
    rec.repositoryCommitStatus = 'not_committed';
    rec.legacyProjectionStatus = 'not_attempted';
    return { handled: false, phase: rec.phase, decision: 'fallback', fallbackReason: reason, record: rec };
  }

  private persistAndApply(entry: CampaignEntry, record: ComplexAuthorityDiagnosticRecord, started: number): void {
    record.recordedAt = this.now();
    record.durationBucketMs = bucketDuration(Date.now() - started);
    const persisted = this.diagnostics.append(record);
    entry.status.recordCount = this.diagnostics.count(entry.campaignId);
    entry.status.pendingRecoveryCount = this.recovery.count(entry.campaignId);
    entry.status.currentRevision = this.currentRevision(entry.campaignId);
    entry.status.phase = record.phase;
    entry.status.lastEventId = record.eventId || entry.status.lastEventId;
    entry.status.lastAggregateKind = record.aggregateKind;
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

  private transientEntry(request: ComplexRouteRequest): CampaignEntry {
    return { campaignId: request.campaignId, campaignKind: request.campaignKind, status: emptyStatus(request.campaignId, request.campaignKind, 0, 0, null) };
  }

  private partial(
    request: ComplexRouteRequest,
    entry: CampaignEntry,
    eventId: string,
    occurredAt: string,
    aggregateKind: ComplexAggregateKind,
    commandKind: ComplexCommandKind,
    fields: { preHash?: string; composedBaseHash?: string; reconciliation?: ComplexAuthorityDiagnosticRecord['reconciliationStatus']; candidateValidation?: 'ok' | 'failed' },
  ): ComplexAuthorityDiagnosticRecord {
    const record = this.baseRecord(request, entry, eventId, occurredAt, aggregateKind, commandKind);
    record.legacyPreHash = fields.preHash ?? null;
    record.composedBaseHash = fields.composedBaseHash ?? null;
    record.reconciliationStatus = fields.reconciliation ?? 'skipped';
    record.candidateValidationStatus = fields.candidateValidation ?? 'skipped';
    return record;
  }

  private baseRecord(
    request: ComplexRouteRequest,
    entry: CampaignEntry,
    eventId: string,
    occurredAt: string,
    aggregateKind: ComplexAggregateKind,
    commandKind: ComplexCommandKind,
  ): ComplexAuthorityDiagnosticRecord {
    return {
      eventId,
      campaignId: request.campaignId,
      campaignKind: entry.campaignKind,
      commandScope: request.scope,
      aggregateKind,
      commandKind,
      targetIdentityHash: stableHash(request.sourceIdentity),
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
      aggregatePreHash: null,
      candidateHash: null,
      repositoryCommittedHash: null,
      repositoryReadHash: null,
      predictedLegacyHash: null,
      legacyPostHash: null,
      dmProjectionHash: null,
      playerSafeProjectionHash: null,
      observerProjectionHash: null,
      identityStatus: 'skipped',
      preconditionStatus: 'skipped',
      candidateValidationStatus: 'skipped',
      invariantStatus: 'skipped',
      scopeStatus: 'skipped',
      predictionComparison: null,
      repositoryCommitStatus: 'not_committed',
      repositoryReadStatus: 'skipped',
      legacyProjectionStatus: 'not_attempted',
      legacyVerificationComparison: null,
      reconciliationStatus: 'skipped',
      recoveryStatus: 'none',
      changedAggregatePaths: [],
      durationBucketMs: '0-1ms',
      errorCategory: null,
      errorMessage: null,
      inverse: {
        commandKind: inverseCommandKind(commandKind),
        previousStateHash: stableHash(null),
        nextStateHash: stableHash(request.command),
      },
    };
  }

  private emit(): void {
    this.statusesSnapshot = Array.from(this.entries.values()).map((entry) => ({ ...entry.status }));
    for (const listener of this.listeners) listener();
  }
}

function emptyStatus(
  campaignId: CampaignId,
  campaignKind: CommandCampaignKind,
  recordCount: number,
  pendingRecoveryCount: number,
  currentRevision: UniversalRevision | null,
): ComplexAuthorityCampaignStatus {
  return {
    campaignId,
    campaignKind,
    namespace: STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE,
    phase: 'not_started',
    lastDecision: null,
    lastFallbackReason: null,
    running: false,
    currentRevision,
    lastEventId: null,
    lastAggregateKind: null,
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

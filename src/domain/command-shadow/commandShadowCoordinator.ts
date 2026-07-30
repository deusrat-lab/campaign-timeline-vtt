import type { CampaignId } from '../campaign/ids';
import type { AdapterResult } from '../adapters/types';
import { hasAdapterErrors } from '../adapters/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import { CommandDiagnosticsStore, type CommandDiagnosticsStorage } from './commandDiagnosticsStore';
import { compareCommandResult } from './commandComparison';
import { executeUniversalCommand, isKnownCommandScope, type CommandInput } from './commandRegistry';
import {
  STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE,
  type CommandCampaignKind,
  type CommandShadowCampaignStatus,
  type CommandShadowDiagnosticRecord,
  type CommandShadowEvent,
  type CommandShadowScope,
  type CommandShadowStatus,
  type CommandComparisonSummary,
} from './commandShadowTypes';

/** Injected async boundary so the harness can drive processing deterministically
 * (manual scheduler) while the browser uses microtasks. */
export interface CommandScheduler {
  set(fn: () => void): unknown;
  clear(handle: unknown): void;
}

const defaultScheduler: CommandScheduler = {
  set: (fn) => setTimeout(fn, 0),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/** Stable JSON hash of an arbitrary value (order-insensitive for objects). */
export function stableHash(value: unknown): string {
  const json = stableStringify(value);
  let h = 5381;
  for (let i = 0; i < json.length; i += 1) h = ((h << 5) + h + json.charCodeAt(i)) | 0;
  return `h${(h >>> 0).toString(16)}:${json.length}`;
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const keys = Object.keys(value as Record<string, unknown>).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`).join(',')}}`;
}

export interface CommandShadowSubmission {
  event: CommandShadowEvent;
  input: CommandInput;
  /** Adapter of the captured, immutable legacy PRE-command state. Lazy so it
   * runs at drain time; must never mutate the legacy source. */
  buildPre: () => AdapterResult;
  /** Adapter of the captured, immutable legacy POST-command state. */
  buildPost: () => AdapterResult;
}

export interface CommandShadowCoordinatorOptions {
  diagnosticsStorage: CommandDiagnosticsStorage;
  /** The subset of scopes allowed to run (config allowlist ∩ known scopes). */
  allowedScopes: ReadonlySet<CommandShadowScope>;
  scheduler?: CommandScheduler;
  now?: () => string;
  maxRecords?: number;
}

interface CampaignEntry {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  queue: CommandShadowSubmission[];
  running: boolean;
  timer: unknown;
  status: CommandShadowCampaignStatus;
  /** Newest occurredAt whose terminal status was applied — guards stale
   * out-of-order completion from regressing the live status. */
  latestAppliedOccurredAt: string | null;
  /** The live terminal status of the newest event, restored verbatim when a
   * stale (older) event finishes so the status never sticks at `running`. */
  latestTerminalStatus: CommandShadowStatus | null;
}

/**
 * Stage 13 — isolated universal command-shadow coordinator.
 *
 * Consumes legacy mutation events AFTER the legacy command has already
 * committed. It never owns legacy execution, never mutates legacy state, never
 * writes the production universal namespace, never performs network / server
 * sync, and never throws back into the legacy workflow. Every outcome is a
 * structured, bounded, redacted diagnostic record.
 */
export class CommandShadowCoordinator {
  private readonly diagnostics: CommandDiagnosticsStore;
  private readonly allowedScopes: ReadonlySet<CommandShadowScope>;
  private readonly scheduler: CommandScheduler;
  private readonly now: () => string;
  private readonly entries = new Map<string, CampaignEntry>();
  private readonly listeners = new Set<() => void>();
  /** Every eventId ever queued — enforces idempotent, exactly-once processing
   * (a duplicate event is deduped at submit time, never re-run at drain). */
  private readonly seenEventIds = new Set<string>();
  private disposed = false;
  /** Referentially-stable statuses array for React useSyncExternalStore.
   * Rebuilt only in emit(), so identity is preserved between changes and no
   * render loop occurs. */
  private statusesSnapshot: CommandShadowCampaignStatus[] = [];

  constructor(options: CommandShadowCoordinatorOptions) {
    this.diagnostics = new CommandDiagnosticsStore(options.diagnosticsStorage, options.maxRecords);
    this.allowedScopes = options.allowedScopes;
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.now = options.now ?? (() => new Date().toISOString());
  }

  get namespace(): string {
    return STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(campaignId: CampaignId): CommandShadowCampaignStatus | null {
    const entry = this.entries.get(campaignId);
    return entry ? { ...entry.status } : null;
  }

  getAllStatuses(): CommandShadowCampaignStatus[] {
    return this.statusesSnapshot;
  }

  isAllowlisted(scope: string): boolean {
    return isKnownCommandScope(scope) && this.allowedScopes.has(scope);
  }

  /** Enqueue a command event. Idempotent per eventId (duplicates are ignored).
   * Returns the immediate disposition for callers/tests; terminal status is
   * resolved asynchronously via the diagnostics record. */
  submit(submission: CommandShadowSubmission): CommandShadowStatus {
    if (this.disposed) return 'cancelled';
    const { event } = submission;
    if (!this.isAllowlisted(event.commandScope)) return 'not_allowlisted';
    if (!event.campaignId) return 'wrong_campaign';
    // Idempotent dedup: a duplicate event is never enqueued or re-run.
    if (this.seenEventIds.has(event.eventId)) return 'scheduled';
    this.seenEventIds.add(event.eventId);

    const entry = this.ensureEntry(event.campaignId, event.campaignKind);
    entry.queue.push(submission);
    entry.status.pending = entry.queue.length;
    entry.status.status = entry.running ? entry.status.status : 'scheduled';
    entry.status.lastEventId = event.eventId;
    this.scheduleDrain(entry);
    this.emit();
    return 'scheduled';
  }

  private scheduleDrain(entry: CampaignEntry): void {
    if (entry.running || entry.timer !== null || this.disposed) return;
    entry.timer = this.scheduler.set(() => {
      entry.timer = null;
      void this.drain(entry.campaignId);
    });
  }

  private async drain(campaignId: CampaignId): Promise<void> {
    const entry = this.entries.get(campaignId);
    if (!entry || this.disposed || entry.running) return;
    const submission = entry.queue.shift();
    if (!submission) return;
    entry.running = true;
    entry.status.running = true;
    entry.status.pending = entry.queue.length;
    entry.status.status = 'running';
    entry.status.lastAttemptAt = this.now();
    entry.status.runCount += 1;
    this.emit();

    let record: CommandShadowDiagnosticRecord;
    try {
      record = this.runPipeline(entry, submission);
    } catch (error) {
      record = this.baseRecord(entry, submission, 'command_failed');
      record.errorCategory = 'command_failed';
      record.errorMessage = messageOf(error);
    }

    // Persist bounded diagnostics; a persistence failure never affects legacy.
    const persisted = this.diagnostics.append(record);
    if (!persisted && record.status === 'success') {
      record = { ...record, status: 'diagnostics_persistence_failed', errorCategory: 'diagnostics_persistence_failed' };
    }
    record.recordedAt = this.now();
    this.applyTerminal(entry, submission, record, persisted);

    entry.running = false;
    entry.status.running = false;
    if (this.disposed) return;
    if (entry.queue.length > 0) {
      this.scheduleDrain(entry);
    } else {
      entry.status.pending = 0;
    }
    this.emit();
  }

  private runPipeline(entry: CampaignEntry, submission: CommandShadowSubmission): CommandShadowDiagnosticRecord {
    const { event, input } = submission;
    const record = this.baseRecord(entry, submission, 'running');

    // 1. Build the exact pre-command universal snapshot from captured legacy pre-state.
    const preResult = safeBuild(submission.buildPre);
    if (!preResult.snapshot || hasAdapterErrors(preResult)) {
      return fail(record, 'adapter_failed', firstError(preResult) ?? 'Pre-state adapter produced no snapshot.');
    }
    const preSnapshot = preResult.snapshot;

    // Precondition / freshness: the built pre-state must hash-match the event's
    // captured pre hash. A mismatch means the base is stale — reject rather than
    // run against a wrong base.
    if (stableHash(preSnapshot) !== event.legacyPreHash) {
      return fail(record, 'stale_precondition', 'Pre-command base hash does not match captured legacy pre-state.');
    }
    // Campaign ownership.
    if (preSnapshot.metadata.campaignId !== event.campaignId) {
      return fail(record, 'wrong_campaign', `Pre-state campaign ${preSnapshot.metadata.campaignId} != ${event.campaignId}`);
    }
    record.baseRevision = preSnapshot.revision;

    // 2. Build the adapter-derived expected post-state.
    const postResult = safeBuild(submission.buildPost);
    if (!postResult.snapshot || hasAdapterErrors(postResult)) {
      return fail(record, 'adapter_failed', firstError(postResult) ?? 'Post-state adapter produced no snapshot.');
    }
    const expectedPost = postResult.snapshot;
    if (expectedPost.metadata.campaignId !== event.campaignId) {
      return fail(record, 'wrong_campaign', `Post-state campaign ${expectedPost.metadata.campaignId} != ${event.campaignId}`);
    }
    if (stableHash(expectedPost) !== event.legacyPostHash) {
      return fail(record, 'stale_precondition', 'Post-command state hash does not match captured legacy post-state.');
    }

    // 3. Execute the equivalent universal command against the isolated pre clone.
    const result = executeUniversalCommand(preSnapshot, input);
    record.mappingOk = result.accepted || result.rejectionCode !== 'mapping_failed';
    if (!result.accepted || !result.snapshot) {
      const category: CommandShadowStatus = result.rejectionCode === 'mapping_failed' ? 'mapping_failed' : 'command_rejected';
      return fail(record, category, result.rejectionMessage ?? 'Universal command rejected the payload.');
    }

    // 4. Blocking validation of the universal result — never weakened.
    const validation = validateCampaignSnapshot(result.snapshot);
    record.validationErrorCount = validation.issues.filter((i) => i.severity === 'error').length;
    if (!validation.ok) {
      return fail(record, 'validation_failed', `${record.validationErrorCount} validation error(s)`);
    }
    record.resultRevision = result.snapshot.revision;

    // 5. Semantic comparison against the adapter-derived expected post-state.
    const comparison = compareCommandResult(result.snapshot, expectedPost);
    record.comparison = comparison;
    if (isMatch(comparison)) {
      record.status = 'success';
    } else {
      record.status = 'semantic_mismatch';
      record.errorCategory = 'semantic_mismatch';
      record.errorMessage = `${comparison.mismatchCount} semantic mismatch(es)`;
    }
    return record;
  }

  private applyTerminal(
    entry: CampaignEntry,
    submission: CommandShadowSubmission,
    record: CommandShadowDiagnosticRecord,
    persisted: boolean,
  ): void {
    // Stale completion guard: never let an OLDER event regress the live status
    // once a newer event's terminal status has been applied.
    const occurredAt = submission.event.occurredAt;
    const isNewest = !entry.latestAppliedOccurredAt || occurredAt >= entry.latestAppliedOccurredAt;
    entry.status.recordCount = this.diagnostics.count(entry.campaignId);
    if (!isNewest) {
      // A stale (older) event finished after a newer one. Its diagnostic is
      // still recorded, but it must not regress the live status — restore the
      // newest terminal status so the entry never sticks at `running`.
      entry.status.status = entry.latestTerminalStatus ?? record.status;
      return;
    }
    entry.latestAppliedOccurredAt = occurredAt;
    entry.latestTerminalStatus = record.status;

    entry.status.status = record.status;
    entry.status.lastComparison = record.comparison;
    entry.status.lastErrorCategory = record.errorCategory;
    entry.status.lastErrorMessage = record.errorMessage;
    if (record.status === 'success') {
      entry.status.successCount += 1;
      entry.status.lastSuccessAt = record.recordedAt;
    } else if (record.status === 'semantic_mismatch') {
      entry.status.mismatchCount += 1;
      entry.status.lastMismatchAt = record.recordedAt;
    }
    if (!persisted) {
      entry.status.lastErrorCategory = 'diagnostics_persistence_failed';
    }
  }

  /** Read persisted diagnostics for one campaign (read-only DM action). */
  readDiagnostics(campaignId: CampaignId): CommandShadowDiagnosticRecord[] {
    return this.diagnostics.read(campaignId);
  }

  /** Clear ONLY this campaign's diagnostics. Never touches legacy/production or
   * any other campaign. */
  clearDiagnostics(campaignId: CampaignId): void {
    this.diagnostics.clear(campaignId);
    const entry = this.entries.get(campaignId);
    if (entry) {
      entry.status.recordCount = 0;
      entry.status.lastComparison = null;
      this.emit();
    }
  }

  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      if (entry.timer !== null) this.scheduler.clear(entry.timer);
      entry.timer = null;
      entry.queue = [];
    }
    this.entries.clear();
    this.statusesSnapshot = [];
    this.listeners.clear();
  }

  private ensureEntry(campaignId: CampaignId, campaignKind: CommandCampaignKind): CampaignEntry {
    let entry = this.entries.get(campaignId);
    if (!entry) {
      entry = {
        campaignId,
        campaignKind,
        queue: [],
        running: false,
        timer: null,
        latestAppliedOccurredAt: null,
        latestTerminalStatus: null,
        status: {
          campaignId,
          campaignKind,
          namespace: STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE,
          status: 'idle',
          pending: 0,
          running: false,
          lastEventId: null,
          lastAttemptAt: null,
          lastSuccessAt: null,
          lastMismatchAt: null,
          runCount: 0,
          successCount: 0,
          mismatchCount: 0,
          lastComparison: null,
          lastErrorCategory: null,
          lastErrorMessage: null,
          recordCount: this.diagnostics.count(campaignId),
        },
      };
      this.entries.set(campaignId, entry);
    }
    return entry;
  }

  private baseRecord(
    entry: CampaignEntry,
    submission: CommandShadowSubmission,
    status: CommandShadowStatus,
  ): CommandShadowDiagnosticRecord {
    const { event } = submission;
    return {
      eventId: event.eventId,
      campaignId: event.campaignId,
      campaignKind: entry.campaignKind,
      commandScope: event.commandScope,
      commandType: event.commandType,
      occurredAt: event.occurredAt,
      recordedAt: this.now(),
      status,
      legacyPreHash: event.legacyPreHash,
      legacyPostHash: event.legacyPostHash,
      targetIds: event.commandPayload.targetIds,
      changedFieldPaths: event.commandPayload.changedFieldPaths,
      baseRevision: null,
      resultRevision: null,
      mappingOk: true,
      validationErrorCount: 0,
      comparison: null,
      errorCategory: null,
      errorMessage: null,
    };
  }

  private emit(): void {
    this.statusesSnapshot = Array.from(this.entries.values()).map((entry) => ({ ...entry.status }));
    for (const listener of this.listeners) listener();
  }
}

function isMatch(comparison: CommandComparisonSummary): boolean {
  return (
    comparison.classification === 'equal' ||
    comparison.classification === 'revision_only' ||
    comparison.classification === 'ordering_only'
  );
}

function fail(
  record: CommandShadowDiagnosticRecord,
  category: CommandShadowStatus,
  message: string,
): CommandShadowDiagnosticRecord {
  record.status = category;
  record.errorCategory = category;
  record.errorMessage = message;
  return record;
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

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export { CommandDiagnosticsStore };

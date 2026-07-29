import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import type { CampaignSourceKind } from '../campaign/source';
import type { AdapterResult } from '../adapters/types';
import { hasAdapterErrors } from '../adapters/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import type { RepositoryError } from '../repository/types';
import { compareSnapshots } from './compareSnapshots';
import type { ShadowCampaignStatus, ShadowRunStatus } from './shadowTypes';

/** The isolated Stage 9 shadow namespace prefix (kept distinct from the Stage 6
 * default shadow namespace AND the production universal namespace). */
export const STAGE_09_SHADOW_NAMESPACE = 'campaign-timeline-vtt:universal-shadow:stage-09';

/** Minimal subset of the shadow repository the coordinator depends on. */
export interface ShadowCoordinatorRepository {
  readonly namespace: string;
  readCampaign(campaignId: CampaignId): Promise<CampaignSnapshot | null>;
  createCampaign(snapshot: CampaignSnapshot): Promise<{ newRevision: UniversalRevision }>;
  replaceCampaign(
    snapshot: CampaignSnapshot,
    expectedRevision: UniversalRevision,
  ): Promise<{ newRevision: UniversalRevision }>;
  clearCampaign(campaignId: CampaignId): Promise<void>;
}

export interface ShadowScheduler {
  set(fn: () => void, ms: number): unknown;
  clear(handle: unknown): void;
}

export interface ShadowCoordinatorOptions {
  repository: ShadowCoordinatorRepository;
  now?: () => string;
  scheduler?: ShadowScheduler;
  /** Debounce window in ms for coalescing rapid legacy state changes. */
  debounceMs?: number;
}

export interface ShadowSubmitRequest {
  campaignId: CampaignId;
  sourceKind: CampaignSourceKind;
  /**
   * Lazily builds the universal candidate from the CURRENT legacy state. Called
   * at drain time (after debounce) so coalesced rapid changes always project
   * the latest consistent legacy state. Must never mutate the legacy source.
   */
  build: () => AdapterResult;
}

interface CampaignEntry {
  status: ShadowCampaignStatus;
  pendingBuild: (() => AdapterResult) | null;
  pendingSourceKind: CampaignSourceKind;
  timer: unknown;
  running: boolean;
  lastCandidate: CampaignSnapshot | null;
}

const MAX_VALIDATION_REPORTED = 25;
const defaultScheduler: ShadowScheduler = {
  set: (fn, ms) => setTimeout(fn, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Stage 9 — local universal shadow-integration coordinator.
 *
 * Framework-agnostic and pure of side effects beyond the injected repository +
 * scheduler, so it runs identically in the browser and the Stage 9 Node
 * harness. It NEVER mutates the legacy source, NEVER writes the production
 * universal namespace, and NEVER performs any network / server sync. A failure
 * at any stage is recorded as structured status and never propagated back to
 * the legacy save path.
 */
export class ShadowIntegrationCoordinator {
  private readonly repository: ShadowCoordinatorRepository;
  private readonly now: () => string;
  private readonly scheduler: ShadowScheduler;
  private readonly debounceMs: number;
  private readonly entries = new Map<string, CampaignEntry>();
  private readonly listeners = new Set<() => void>();
  private disposed = false;
  /** Referentially-stable snapshot for React useSyncExternalStore. Rebuilt only
   * on emit(), so identity is preserved between changes (no render loop). */
  private statusesSnapshot: ShadowCampaignStatus[] = [];

  constructor(options: ShadowCoordinatorOptions) {
    this.repository = options.repository;
    this.now = options.now ?? (() => new Date().toISOString());
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.debounceMs = options.debounceMs ?? 400;
  }

  get namespace(): string {
    return this.repository.namespace;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getStatus(campaignId: CampaignId): ShadowCampaignStatus | null {
    const entry = this.entries.get(campaignId);
    return entry ? { ...entry.status } : null;
  }

  getAllStatuses(): ShadowCampaignStatus[] {
    return this.statusesSnapshot;
  }

  /** Enqueue a debounced shadow run for a campaign. Latest submission wins. */
  submit(request: ShadowSubmitRequest): void {
    if (this.disposed) return;
    const entry = this.ensureEntry(request.campaignId, request.sourceKind);
    entry.pendingBuild = request.build;
    entry.pendingSourceKind = request.sourceKind;
    entry.status.sourceKind = request.sourceKind;
    entry.status.pending = true;
    if (!entry.running) entry.status.status = 'scheduled';
    if (entry.timer !== null) this.scheduler.clear(entry.timer);
    entry.timer = this.scheduler.set(() => {
      entry.timer = null;
      void this.drain(request.campaignId);
    }, this.debounceMs);
    this.emit();
  }

  /** Force an immediate drain (skips the debounce), e.g. a manual "Run now". */
  async runNow(campaignId: CampaignId): Promise<void> {
    const entry = this.entries.get(campaignId);
    if (!entry || this.disposed) return;
    if (entry.timer !== null) {
      this.scheduler.clear(entry.timer);
      entry.timer = null;
    }
    await this.drain(campaignId);
  }

  /** Read the persisted shadow snapshot and compare it to the last candidate
   * (read-only manual diagnostic action; never writes). */
  async reloadAndCompare(campaignId: CampaignId): Promise<void> {
    const entry = this.entries.get(campaignId);
    if (!entry || this.disposed) return;
    try {
      const reloaded = await this.repository.readCampaign(campaignId);
      if (!reloaded) {
        entry.status.comparison = null;
        this.emit();
        return;
      }
      if (entry.lastCandidate) {
        entry.status.comparison = compareSnapshots(entry.lastCandidate, reloaded);
      }
      entry.status.persistedRevision = reloaded.revision;
      this.emit();
    } catch (error) {
      this.recordError(entry, 'persistence_failed', messageOf(error));
    }
  }

  /** Clear ONLY this campaign's shadow snapshot. Never touches legacy or
   * production data. */
  async clearCampaign(campaignId: CampaignId): Promise<void> {
    const entry = this.entries.get(campaignId);
    if (this.disposed) return;
    await this.repository.clearCampaign(campaignId);
    if (entry) {
      entry.lastCandidate = null;
      entry.status.persistedRevision = null;
      entry.status.comparison = null;
      entry.status.status = 'idle';
      this.emit();
    }
  }

  /** Cancel every pending timer and drop all state. Idempotent. */
  dispose(): void {
    this.disposed = true;
    for (const entry of this.entries.values()) {
      if (entry.timer !== null) this.scheduler.clear(entry.timer);
      entry.timer = null;
      entry.pendingBuild = null;
    }
    this.entries.clear();
    this.statusesSnapshot = [];
    this.listeners.clear();
  }

  private ensureEntry(campaignId: CampaignId, sourceKind: CampaignSourceKind): CampaignEntry {
    let entry = this.entries.get(campaignId);
    if (!entry) {
      entry = {
        pendingBuild: null,
        pendingSourceKind: sourceKind,
        timer: null,
        running: false,
        lastCandidate: null,
        status: {
          campaignId,
          sourceKind,
          status: 'idle',
          namespace: this.repository.namespace,
          lastAttemptAt: null,
          lastSuccessAt: null,
          pending: false,
          running: false,
          candidateRevision: null,
          persistedRevision: null,
          validationErrorCount: 0,
          validationErrors: [],
          adapterErrorCount: 0,
          comparison: null,
          droppedCollections: [],
          lastErrorCategory: null,
          lastErrorMessage: null,
          runCount: 0,
        },
      };
      this.entries.set(campaignId, entry);
    }
    return entry;
  }

  private async drain(campaignId: CampaignId): Promise<void> {
    const entry = this.entries.get(campaignId);
    if (!entry || this.disposed) return;
    // Serialize per campaign: a run in flight will re-drain the newest pending
    // build when it finishes, so a stale run can never overwrite a newer one.
    if (entry.running) return;
    const build = entry.pendingBuild;
    if (!build) return;
    entry.pendingBuild = null;
    entry.running = true;
    entry.status.running = true;
    entry.status.pending = entry.pendingBuild !== null;
    entry.status.status = 'running';
    entry.status.lastAttemptAt = this.now();
    entry.status.runCount += 1;
    this.emit();

    try {
      await this.runPipeline(entry, build);
    } catch (error) {
      // Defensive: no pipeline path should throw, but a shadow failure must
      // never escape into the caller / legacy path.
      this.recordError(entry, 'adapter_failed', messageOf(error));
    } finally {
      entry.running = false;
      entry.status.running = false;
      if (this.disposed) return;
      // A newer submission arrived mid-run — process it now (latest wins).
      if (entry.pendingBuild) {
        entry.status.pending = true;
        void this.drain(campaignId);
      } else {
        entry.status.pending = false;
        this.emit();
      }
    }
  }

  private async runPipeline(entry: CampaignEntry, build: () => AdapterResult): Promise<void> {
    // 1. Build the candidate from current legacy state.
    let result: AdapterResult;
    try {
      result = build();
    } catch (error) {
      this.recordError(entry, 'adapter_failed', messageOf(error));
      return;
    }

    entry.status.droppedCollections = result.classifications
      .filter((classification) => classification.state === 'dropped')
      .map((classification) => classification.path);
    entry.status.adapterErrorCount = result.diagnostics.filter((d) => d.severity === 'error').length;

    const snapshot = result.snapshot;
    if (!snapshot || hasAdapterErrors(result)) {
      this.recordError(
        entry,
        'adapter_failed',
        result.diagnostics.find((d) => d.severity === 'error')?.message ?? 'Adapter produced no snapshot.',
      );
      return;
    }
    entry.status.candidateRevision = snapshot.revision;
    entry.lastCandidate = snapshot;

    // 2. Blocking validation — never weakened. Invalid candidates are not
    //    persisted; any previously valid shadow snapshot is left untouched.
    const validation = validateCampaignSnapshot(snapshot);
    entry.status.validationErrorCount = validation.issues.filter((i) => i.severity === 'error').length;
    entry.status.validationErrors = validation.issues
      .filter((i) => i.severity === 'error')
      .slice(0, MAX_VALIDATION_REPORTED)
      .map((i) => ({ path: i.path, message: i.message }));
    if (!validation.ok) {
      this.recordError(entry, 'validation_failed', `${entry.status.validationErrorCount} validation error(s)`);
      return;
    }

    // 3. Persist into the isolated shadow namespace (create or expected-version
    //    replace). Revision conflicts are surfaced, not silently retried.
    let persisted: { newRevision: UniversalRevision };
    try {
      const existing = await this.repository.readCampaign(snapshot.metadata.campaignId);
      persisted = existing
        ? await this.repository.replaceCampaign(snapshot, existing.revision)
        : await this.repository.createCampaign(snapshot);
    } catch (error) {
      const code = (error as RepositoryError | undefined)?.code;
      if (code === 'CONFLICT') {
        this.recordError(entry, 'conflict', messageOf(error));
      } else {
        this.recordError(entry, 'persistence_failed', messageOf(error));
      }
      return;
    }
    entry.status.persistedRevision = persisted.newRevision;

    // 4. Reload and semantically compare (round-trip integrity).
    let reloaded: CampaignSnapshot | null;
    try {
      reloaded = await this.repository.readCampaign(snapshot.metadata.campaignId);
    } catch (error) {
      this.recordError(entry, 'reload_mismatch', messageOf(error));
      return;
    }
    if (!reloaded) {
      this.recordError(entry, 'reload_mismatch', 'Shadow snapshot could not be read back after write.');
      return;
    }
    const comparison = compareSnapshots(snapshot, reloaded);
    entry.status.comparison = comparison;
    if (!comparison.equal && !comparison.revisionOnly) {
      this.recordError(entry, 'reload_mismatch', `${comparison.mismatchCount} reload mismatch(es)`);
      return;
    }

    // 5. Success.
    entry.status.status = 'success';
    entry.status.lastSuccessAt = this.now();
    entry.status.lastErrorCategory = null;
    entry.status.lastErrorMessage = null;
    this.emit();
  }

  private recordError(entry: CampaignEntry, category: ShadowRunStatus, message: string): void {
    entry.status.status = category;
    entry.status.lastErrorCategory = category;
    entry.status.lastErrorMessage = message;
    this.emit();
  }

  private emit(): void {
    this.statusesSnapshot = Array.from(this.entries.values()).map((entry) => ({ ...entry.status }));
    for (const listener of this.listeners) listener();
  }
}

function messageOf(error: unknown): string {
  if (error && typeof error === 'object') {
    const repoError = error as Partial<RepositoryError>;
    if (typeof repoError.message === 'string') return repoError.message;
  }
  return String(error);
}

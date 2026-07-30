import { makeRevision, type CampaignId, type UniversalRevision } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import type { RepositoryStorage } from '../repository/shadowRepository';
import { UNIVERSAL_PRODUCTION_NAMESPACE } from '../repository/shadowRepository';
import type { CampaignSummary } from '../repository/types';

/**
 * A SYNCHRONOUS, campaign-scoped, compare-and-swap accessor over the production
 * universal namespace, byte-compatible with `createProductionCampaignRepository`
 * (same `${namespace}:index` + `${namespace}:campaign:<id>` keys, same
 * `{ snapshot }` record shape). Stage 15's authority router is synchronous (it is
 * consulted inline by the synchronous legacy stores and must return a definitive
 * `handled` before the store would otherwise commit), so it cannot use the
 * async repository — but it writes the exact same production records, so the
 * async repository, the real app and the harness all observe one source of
 * truth. It only ever touches the production namespace; never a shadow, legacy or
 * server key.
 */
export class SyncDurableRepository {
  readonly namespace: string;
  private readonly storage: RepositoryStorage;

  constructor(storage: RepositoryStorage, namespace: string = UNIVERSAL_PRODUCTION_NAMESPACE) {
    this.storage = storage;
    this.namespace = namespace;
  }

  private indexKey(): string {
    return `${this.namespace}:index`;
  }

  private campaignKey(campaignId: CampaignId): string {
    return `${this.namespace}:campaign:${campaignId}`;
  }

  /** Read the committed snapshot, or null when absent. Throws only on corruption
   * (caller treats a throw as a safe fallback). */
  read(campaignId: CampaignId): CampaignSnapshot | null {
    const raw = this.storage.getItem(this.campaignKey(campaignId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snapshot?: unknown };
    const snapshot = parsed?.snapshot as CampaignSnapshot | undefined;
    if (!snapshot || !validateCampaignSnapshot(snapshot).ok) {
      throw new Error(`Corrupt or invalid production universal record: ${campaignId}`);
    }
    if (snapshot.metadata.campaignId !== campaignId) {
      throw new Error(`Production record campaign id mismatch: ${campaignId}`);
    }
    return snapshot;
  }

  readRevision(campaignId: CampaignId): UniversalRevision | null {
    const raw = this.storage.getItem(this.campaignKey(campaignId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { snapshot?: { revision?: number } };
    const revision = parsed?.snapshot?.revision;
    return typeof revision === 'number' ? makeRevision(revision) : null;
  }

  /** Create the campaign record at revision 1. Fails if one already exists. */
  create(snapshot: CampaignSnapshot): { newRevision: UniversalRevision } {
    const campaignId = snapshot.metadata.campaignId;
    if (this.storage.getItem(this.campaignKey(campaignId)) !== null) {
      throw new Error(`ALREADY_EXISTS: ${campaignId}`);
    }
    const newRevision = makeRevision(1);
    this.writeRecord({ ...structuredClone(snapshot), revision: newRevision });
    return { newRevision };
  }

  /**
   * Atomic compare-and-swap replace: the write only succeeds when the stored
   * revision equals `expectedRevision`. On success the record is written at
   * `expectedRevision + 1`. Throws `CONFLICT` otherwise.
   */
  replace(snapshot: CampaignSnapshot, expectedRevision: UniversalRevision): { newRevision: UniversalRevision } {
    const campaignId = snapshot.metadata.campaignId;
    const current = this.readRevision(campaignId);
    if (current === null) throw new Error(`NOT_FOUND: ${campaignId}`);
    if (current !== expectedRevision) {
      throw new Error(`CONFLICT: expected ${expectedRevision} but current ${current} for ${campaignId}`);
    }
    const newRevision = makeRevision(current + 1);
    this.writeRecord({ ...structuredClone(snapshot), revision: newRevision });
    return { newRevision };
  }

  private writeRecord(snapshot: CampaignSnapshot): void {
    if (!validateCampaignSnapshot(snapshot).ok) {
      throw new Error(`INVALID_SCHEMA: ${snapshot.metadata.campaignId}`);
    }
    this.storage.setItem(this.campaignKey(snapshot.metadata.campaignId), JSON.stringify({ snapshot }));
    // Maintain the index identically to the async production repository so a
    // later async reader / listing stays consistent.
    const summaries = this.readIndex().filter((s) => s.campaignId !== snapshot.metadata.campaignId);
    summaries.push({
      campaignId: snapshot.metadata.campaignId,
      title: snapshot.metadata.title,
      revision: snapshot.revision,
      updatedAt: snapshot.metadata.updatedAt,
    });
    summaries.sort((left, right) => left.title.localeCompare(right.title));
    this.storage.setItem(this.indexKey(), JSON.stringify(summaries));
  }

  private readIndex(): CampaignSummary[] {
    const raw = this.storage.getItem(this.indexKey());
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CampaignSummary[]) : [];
    } catch {
      return [];
    }
  }
}

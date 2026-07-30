import type { CampaignId } from '../campaign/ids';
import type { CommandDiagnosticsStorage } from '../command-shadow/commandDiagnosticsStore';
import {
  STAGE_15_RECOVERY_NAMESPACE,
  type PendingProjectionRecord,
} from './durableAuthorityTypes';

/** Bounded cap on pending recovery records per campaign. */
export const DEFAULT_RECOVERY_MAX_RECORDS = 50;

/**
 * Campaign-scoped, isolated store of pending compatibility-projection records.
 * A record is written ONLY when a durable universal commit has succeeded but its
 * legacy projection did not confirm; it is idempotent (keyed by eventId) and
 * carries no raw value (recovery re-reads the value from the committed universal
 * snapshot). Never touches a legacy key, the Stage 9 shadow namespace, the
 * production universal namespace or a server key. Never throws out of its
 * mutating methods.
 */
export class RecoveryStore {
  private readonly storage: CommandDiagnosticsStorage;
  private readonly maxRecords: number;

  constructor(storage: CommandDiagnosticsStorage, maxRecords: number = DEFAULT_RECOVERY_MAX_RECORDS) {
    this.storage = storage;
    this.maxRecords = Math.max(1, maxRecords);
  }

  static keyFor(campaignId: CampaignId): string {
    return `${STAGE_15_RECOVERY_NAMESPACE}:${campaignId}`;
  }

  read(campaignId: CampaignId): PendingProjectionRecord[] {
    const raw = this.storage.getItem(RecoveryStore.keyFor(campaignId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as PendingProjectionRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** The set of `${entityId}.${field}` slots covered by a still-pending record. */
  pendingFieldKeys(campaignId: CampaignId): Set<string> {
    const keys = new Set<string>();
    for (const record of this.read(campaignId)) {
      if (record.legacyProjectionStatus === 'pending' || record.legacyProjectionStatus === 'failed') {
        keys.add(`${record.entityId}.${record.field}`);
      }
    }
    return keys;
  }

  /** Upsert one pending record (idempotent by eventId). Returns false on a
   * persistence failure instead of throwing. */
  upsert(record: PendingProjectionRecord): boolean {
    try {
      const existing = this.read(record.campaignId).filter((r) => r.eventId !== record.eventId);
      const next = [...existing, record].slice(-this.maxRecords);
      this.storage.setItem(RecoveryStore.keyFor(record.campaignId), JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  /** Remove a resolved record by eventId. */
  resolve(campaignId: CampaignId, eventId: string): void {
    try {
      const next = this.read(campaignId).filter((r) => r.eventId !== eventId);
      if (next.length === 0) this.storage.removeItem(RecoveryStore.keyFor(campaignId));
      else this.storage.setItem(RecoveryStore.keyFor(campaignId), JSON.stringify(next));
    } catch {
      /* never throw */
    }
  }

  count(campaignId: CampaignId): number {
    return this.read(campaignId).length;
  }

  clear(campaignId: CampaignId): void {
    this.storage.removeItem(RecoveryStore.keyFor(campaignId));
  }
}

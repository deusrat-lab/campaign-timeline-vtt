import type { CampaignId } from '../campaign/ids';
import type { CommandDiagnosticsStorage } from '../command-shadow/commandDiagnosticsStore';
import {
  STAGE_16_COMPLEX_RECOVERY_NAMESPACE,
  type ComplexPendingProjectionRecord,
} from './complexAuthorityTypes';

export const DEFAULT_COMPLEX_RECOVERY_MAX_RECORDS = 50;

/**
 * Campaign-scoped, isolated store of pending aggregate compatibility-projection
 * records. Written ONLY when a durable universal commit succeeded but its legacy
 * projection did not confirm. Idempotent (keyed by eventId), carries no raw value
 * (recovery re-reads intent from the committed universal snapshot). Never touches
 * a legacy key, any shadow/production universal namespace, the Stage 15
 * namespaces or a server key. Never throws out of its mutating methods.
 */
export class ComplexRecoveryStore {
  private readonly storage: CommandDiagnosticsStorage;
  private readonly maxRecords: number;

  constructor(storage: CommandDiagnosticsStorage, maxRecords: number = DEFAULT_COMPLEX_RECOVERY_MAX_RECORDS) {
    this.storage = storage;
    this.maxRecords = Math.max(1, maxRecords);
  }

  static keyFor(campaignId: CampaignId): string {
    return `${STAGE_16_COMPLEX_RECOVERY_NAMESPACE}:${campaignId}`;
  }

  read(campaignId: CampaignId): ComplexPendingProjectionRecord[] {
    const raw = this.storage.getItem(ComplexRecoveryStore.keyFor(campaignId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ComplexPendingProjectionRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** The set of owned slot keys covered by a still-pending record. */
  pendingSlotKeys(campaignId: CampaignId): Set<string> {
    const keys = new Set<string>();
    for (const record of this.read(campaignId)) {
      if (record.legacyProjectionStatus === 'pending' || record.legacyProjectionStatus === 'failed') {
        keys.add(record.slotKey);
      }
    }
    return keys;
  }

  upsert(record: ComplexPendingProjectionRecord): boolean {
    try {
      const existing = this.read(record.campaignId).filter((r) => r.eventId !== record.eventId);
      const next = [...existing, record].slice(-this.maxRecords);
      this.storage.setItem(ComplexRecoveryStore.keyFor(record.campaignId), JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  resolve(campaignId: CampaignId, eventId: string): void {
    try {
      const next = this.read(campaignId).filter((r) => r.eventId !== eventId);
      if (next.length === 0) this.storage.removeItem(ComplexRecoveryStore.keyFor(campaignId));
      else this.storage.setItem(ComplexRecoveryStore.keyFor(campaignId), JSON.stringify(next));
    } catch {
      /* never throw */
    }
  }

  count(campaignId: CampaignId): number {
    return this.read(campaignId).length;
  }

  clear(campaignId: CampaignId): void {
    this.storage.removeItem(ComplexRecoveryStore.keyFor(campaignId));
  }
}

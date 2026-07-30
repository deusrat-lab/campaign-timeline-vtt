import type { CampaignId } from '../campaign/ids';
import type { CommandDiagnosticsStorage } from '../command-shadow/commandDiagnosticsStore';
import {
  STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE,
  type DurableAuthorityDiagnosticRecord,
} from './durableAuthorityTypes';

export const DEFAULT_DURABLE_MAX_RECORDS = 50;

/**
 * Bounded, campaign-scoped Stage 15 diagnostics store. Each campaign gets its
 * own key under the isolated durable-authority namespace — never a legacy key,
 * never the Stage 9 shadow namespace, never the Stage 13/14 namespaces, never
 * the production universal namespace, never a server key. A persistence failure
 * is surfaced to the caller but MUST NEVER affect the durable commit, the legacy
 * projection or the fallback; the store never throws out of `append`.
 */
export class DurableDiagnosticsStore {
  private readonly storage: CommandDiagnosticsStorage;
  private readonly maxRecords: number;

  constructor(storage: CommandDiagnosticsStorage, maxRecords: number = DEFAULT_DURABLE_MAX_RECORDS) {
    this.storage = storage;
    this.maxRecords = Math.max(1, maxRecords);
  }

  static keyFor(campaignId: CampaignId): string {
    return `${STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE}:${campaignId}`;
  }

  read(campaignId: CampaignId): DurableAuthorityDiagnosticRecord[] {
    const raw = this.storage.getItem(DurableDiagnosticsStore.keyFor(campaignId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as DurableAuthorityDiagnosticRecord[]) : [];
    } catch {
      return [];
    }
  }

  append(record: DurableAuthorityDiagnosticRecord): boolean {
    try {
      const existing = this.read(record.campaignId).filter((r) => r.eventId !== record.eventId);
      const next = [...existing, record].slice(-this.maxRecords);
      this.storage.setItem(DurableDiagnosticsStore.keyFor(record.campaignId), JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  clear(campaignId: CampaignId): void {
    this.storage.removeItem(DurableDiagnosticsStore.keyFor(campaignId));
  }

  count(campaignId: CampaignId): number {
    return this.read(campaignId).length;
  }
}

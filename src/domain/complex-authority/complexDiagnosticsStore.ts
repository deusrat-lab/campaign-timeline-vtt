import type { CampaignId } from '../campaign/ids';
import type { CommandDiagnosticsStorage } from '../command-shadow/commandDiagnosticsStore';
import {
  STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE,
  type ComplexAuthorityDiagnosticRecord,
} from './complexAuthorityTypes';

export const DEFAULT_COMPLEX_MAX_RECORDS = 50;

/**
 * Bounded, campaign-scoped Stage 16 diagnostics store under an isolated
 * namespace — never a legacy key, never any earlier shadow/authority namespace,
 * never the Stage 15 namespace, never the production universal namespace, never
 * a server key. A persistence failure never affects the durable commit, the
 * legacy projection or the fallback; the store never throws out of `append`.
 */
export class ComplexDiagnosticsStore {
  private readonly storage: CommandDiagnosticsStorage;
  private readonly maxRecords: number;

  constructor(storage: CommandDiagnosticsStorage, maxRecords: number = DEFAULT_COMPLEX_MAX_RECORDS) {
    this.storage = storage;
    this.maxRecords = Math.max(1, maxRecords);
  }

  static keyFor(campaignId: CampaignId): string {
    return `${STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE}:${campaignId}`;
  }

  read(campaignId: CampaignId): ComplexAuthorityDiagnosticRecord[] {
    const raw = this.storage.getItem(ComplexDiagnosticsStore.keyFor(campaignId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ComplexAuthorityDiagnosticRecord[]) : [];
    } catch {
      return [];
    }
  }

  append(record: ComplexAuthorityDiagnosticRecord): boolean {
    try {
      const existing = this.read(record.campaignId).filter((r) => r.eventId !== record.eventId);
      const next = [...existing, record].slice(-this.maxRecords);
      this.storage.setItem(ComplexDiagnosticsStore.keyFor(record.campaignId), JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  clear(campaignId: CampaignId): void {
    this.storage.removeItem(ComplexDiagnosticsStore.keyFor(campaignId));
  }

  count(campaignId: CampaignId): number {
    return this.read(campaignId).length;
  }
}

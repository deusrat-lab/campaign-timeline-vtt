import type { CampaignId } from '../campaign/ids';
import type { CommandDiagnosticsStorage } from '../command-shadow/commandDiagnosticsStore';
import {
  STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE,
  type CommandAuthorityDiagnosticRecord,
} from './commandAuthorityTypes';

/** Default cap on retained records per campaign — bounded history, never a full
 * snapshot per event. Oldest records are evicted first. */
export const DEFAULT_AUTHORITY_MAX_RECORDS = 50;

/**
 * Bounded, campaign-scoped Stage 14 diagnostics store. Each campaign gets its
 * own key under the isolated authority namespace — never a legacy key, never the
 * Stage 9 shadow namespace, never the Stage 13 command-shadow namespace, never
 * the production universal namespace, never a server key. A persistence failure
 * is surfaced to the caller but MUST NEVER affect the legacy compatibility commit
 * or the fallback; the store itself never throws out of `append`.
 */
export class AuthorityDiagnosticsStore {
  private readonly storage: CommandDiagnosticsStorage;
  private readonly maxRecords: number;

  constructor(storage: CommandDiagnosticsStorage, maxRecords: number = DEFAULT_AUTHORITY_MAX_RECORDS) {
    this.storage = storage;
    this.maxRecords = Math.max(1, maxRecords);
  }

  static keyFor(campaignId: CampaignId): string {
    return `${STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE}:${campaignId}`;
  }

  read(campaignId: CampaignId): CommandAuthorityDiagnosticRecord[] {
    const raw = this.storage.getItem(AuthorityDiagnosticsStore.keyFor(campaignId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CommandAuthorityDiagnosticRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** Append one record (newest last), evicting oldest beyond the cap. Returns
   * `false` on a persistence failure instead of throwing. Deduplicates by
   * eventId so a re-recorded event never appears twice. */
  append(record: CommandAuthorityDiagnosticRecord): boolean {
    try {
      const existing = this.read(record.campaignId).filter((r) => r.eventId !== record.eventId);
      const next = [...existing, record].slice(-this.maxRecords);
      this.storage.setItem(AuthorityDiagnosticsStore.keyFor(record.campaignId), JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  /** Clear ONLY this campaign's diagnostics. Never touches another campaign,
   * legacy state, or production data. */
  clear(campaignId: CampaignId): void {
    this.storage.removeItem(AuthorityDiagnosticsStore.keyFor(campaignId));
  }

  count(campaignId: CampaignId): number {
    return this.read(campaignId).length;
  }
}

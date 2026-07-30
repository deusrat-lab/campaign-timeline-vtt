import type { CampaignId } from '../campaign/ids';
import {
  STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE,
  type CommandShadowDiagnosticRecord,
} from './commandShadowTypes';

/** Minimal synchronous key/value storage (localStorage-compatible subset). */
export interface CommandDiagnosticsStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** Default cap on retained records per campaign — bounded history, never a full
 * snapshot per event. Oldest records are evicted first. */
export const DEFAULT_MAX_RECORDS = 50;

/**
 * Bounded, campaign-scoped diagnostics store for Stage 13. Each campaign gets
 * its own key under the isolated command-shadow namespace — never a legacy key,
 * never the Stage 9 shadow namespace, never the production universal namespace,
 * never a server key. Persistence failures are surfaced to the caller (which
 * records `diagnostics_persistence_failed`) but MUST NOT affect the legacy
 * action; the store itself never throws out of `append`.
 */
export class CommandDiagnosticsStore {
  private readonly storage: CommandDiagnosticsStorage;
  private readonly maxRecords: number;

  constructor(storage: CommandDiagnosticsStorage, maxRecords: number = DEFAULT_MAX_RECORDS) {
    this.storage = storage;
    this.maxRecords = Math.max(1, maxRecords);
  }

  static keyFor(campaignId: CampaignId): string {
    return `${STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE}:${campaignId}`;
  }

  read(campaignId: CampaignId): CommandShadowDiagnosticRecord[] {
    const raw = this.storage.getItem(CommandDiagnosticsStore.keyFor(campaignId));
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as CommandShadowDiagnosticRecord[]) : [];
    } catch {
      return [];
    }
  }

  /** Append one record (newest last), evicting oldest beyond the cap. Returns
   * `false` on a persistence failure instead of throwing. */
  append(record: CommandShadowDiagnosticRecord): boolean {
    try {
      const existing = this.read(record.campaignId).filter((r) => r.eventId !== record.eventId);
      const next = [...existing, record].slice(-this.maxRecords);
      this.storage.setItem(CommandDiagnosticsStore.keyFor(record.campaignId), JSON.stringify(next));
      return true;
    } catch {
      return false;
    }
  }

  /** Clear ONLY this campaign's diagnostics. Never touches another campaign,
   * legacy state, or production data. */
  clear(campaignId: CampaignId): void {
    this.storage.removeItem(CommandDiagnosticsStore.keyFor(campaignId));
  }

  count(campaignId: CampaignId): number {
    return this.read(campaignId).length;
  }
}

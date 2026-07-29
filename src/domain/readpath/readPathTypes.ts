import type { UniversalRevision } from '../campaign/ids';

/**
 * Stage 10 — controlled local universal READ path.
 *
 * These types describe a guarded, read-only decision layer that sits BETWEEN a
 * small allowlist of pilot UI consumers and the Stage 9 shadow snapshot. It
 * never writes, never calls the network, never invokes universal commands and
 * never mutates the legacy source. Legacy stores remain authoritative for every
 * write. The gateway only ever DECIDES whether a given pilot consumer may read
 * from the validated universal shadow snapshot for this render, or must fall
 * back to the legacy read path — and records a structured, non-secret reason.
 *
 * See rebuild-reports/stage-10.
 */

/** Which audience projection a pilot consumer is allowed to read. */
export type ReadPathProjectionKind = 'dm' | 'playerSafe' | 'observer';

/** The universal source of a campaign snapshot (legacy stack it came from). */
export type ReadPathSourceStack = 'greyholm' | 'userCampaign';

/**
 * The structured outcome of a read-source decision. Exactly one is selected per
 * evaluation. Only `universal` reads from the shadow snapshot; every other
 * outcome falls back to the legacy read path (or rejects the campaign).
 */
export type ReadPathSource =
  | 'disabled' // read flag off, or scope not in the pilot allowlist
  | 'unavailable' // shadow says success but the snapshot could not be read back
  | 'waiting_for_shadow' // no shadow status/snapshot yet (initial load / hydration)
  | 'universal' // fresh, valid, campaign-matched -> read from shadow snapshot
  | 'legacy_fallback' // generic safe fallback (e.g. adapter failure)
  | 'stale_fallback' // newer legacy state pending / shadow not yet at success
  | 'validation_fallback' // last shadow candidate failed blocking validation
  | 'mismatch_fallback' // reload comparison diverged from the candidate
  | 'wrong_campaign' // missing id, or snapshot belongs to a different campaign
  | 'projection_failed' // building the requested projection threw
  | 'repository_failed'; // shadow persistence/conflict/invalid schema

export function readsUniversal(source: ReadPathSource): boolean {
  return source === 'universal';
}

/** Which normalized read-only view model a pilot renders. */
export type ReadPathViewModelVariant = 'summary' | 'npcList' | 'entities' | 'observer' | 'runtime';

/** A definition of one allowlisted pilot consumer. */
export interface PilotScopeDefinition {
  /** Stable dotted scope id (also the allowlist token). */
  scope: string;
  /** Human label for DM diagnostics. */
  label: string;
  /** Which legacy stack this scope reads. */
  stack: ReadPathSourceStack;
  /** Which projection the consumer is allowed to receive. */
  projection: ReadPathProjectionKind;
  /** Which normalized view model the consumer renders. */
  variant: ReadPathViewModelVariant;
  /** True when the pilot reads runtime (non-durable) data. */
  runtime: boolean;
}

/**
 * A minimal, non-secret view of the Stage 9 shadow status the gateway needs to
 * decide freshness. Kept structurally separate from the full ShadowCampaignStatus
 * so the decision core is pure and trivially testable in the harness.
 */
export interface ShadowFreshnessView {
  status: string;
  pending: boolean;
  running: boolean;
  candidateRevision: UniversalRevision | null;
  persistedRevision: UniversalRevision | null;
  lastSuccessAt: string | null;
  comparison: { equal: boolean; revisionOnly: boolean } | null;
}

/** Everything the pure decision core needs. No I/O, no async. */
export interface ReadDecisionInput {
  /** Stage 10 read-path flag. */
  enabled: boolean;
  /** The resolved pilot allowlist for this run. */
  allowedScopes: ReadonlySet<string>;
  /** The requesting pilot scope. */
  scope: string;
  /** The campaign the route/consumer is asking for (null when unknown). */
  requestedCampaignId: string | null;
  /** Stage 9 status for this campaign, or null if none exists yet. */
  status: ShadowFreshnessView | null;
  /** Whether a persisted shadow snapshot was actually read back. */
  snapshotPresent: boolean;
  /** campaignId of the read-back snapshot (null when absent). */
  snapshotCampaignId: string | null;
  /** schemaVersion of the read-back snapshot (null when absent). */
  snapshotSchemaVersion: string | null;
}

/** Safe, non-secret metadata surfaced to DM diagnostics. */
export interface ReadDecisionMetadata {
  scope: string;
  requestedProjection: ReadPathProjectionKind | null;
  requestedCampaignId: string | null;
  snapshotCampaignId: string | null;
  shadowRevision: UniversalRevision | null;
  legacyPendingNewer: boolean;
  lastShadowSuccess: string | null;
  comparisonEqual: boolean | null;
}

export interface ReadDecision {
  source: ReadPathSource;
  useUniversal: boolean;
  fallbackReason: string | null;
  metadata: ReadDecisionMetadata;
}

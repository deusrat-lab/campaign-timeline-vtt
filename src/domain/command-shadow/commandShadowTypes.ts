import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import type { CampaignSourceKind } from '../campaign/source';

/**
 * Stage 13 — controlled universal command / write-path *shadow* execution.
 *
 * A `CommandShadowEvent` is emitted AFTER a legacy command has already executed
 * for real and its post-state has stabilised. It is an immutable record of one
 * observed legacy mutation, from which the coordinator independently replays an
 * equivalent universal command against an isolated in-memory clone of the
 * pre-command universal snapshot, then compares the universal result with the
 * adapter-derived expected post-state. The legacy command remains the sole
 * authoritative writer; nothing here ever mutates legacy state, writes the
 * production universal namespace, or performs any network / server sync.
 */

/** The isolated Stage 13 command-shadow diagnostics namespace prefix. Distinct
 * from the Stage 6 default shadow namespace, the Stage 9 shadow namespace AND
 * the production universal namespace. Per-campaign key is appended. */
export const STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE =
  'campaign-timeline-vtt:universal-command-shadow:stage-13';

export type CommandCampaignKind = 'greyholm' | 'userCampaign';

/** Allowlisted command scopes. Kept as a closed union so an unknown scope can
 * never be executed and so config allowlists can only ever narrow this set. */
export type CommandShadowScope =
  | 'greyholm.npc.update'
  | 'greyholm.presentedCard.set'
  | 'greyholm.reveal.update'
  | 'userCampaign.npc.update'
  | 'userCampaign.reveal.update'
  | 'userCampaign.mapPlacement.update';

export const ALL_COMMAND_SHADOW_SCOPES: readonly CommandShadowScope[] = [
  'greyholm.npc.update',
  'greyholm.presentedCard.set',
  'greyholm.reveal.update',
  'userCampaign.npc.update',
  'userCampaign.reveal.update',
  'userCampaign.mapPlacement.update',
] as const;

/**
 * Immutable, redacted command event. Full legacy payloads are never stored as
 * secrets: only a bounded, path-scoped, summarised `commandPayload` plus stable
 * hashes of the pre/post legacy states are carried, so diagnostics can be shown
 * to the DM without dumping campaign content.
 */
export interface CommandShadowEvent {
  readonly eventId: string;
  readonly campaignId: CampaignId;
  readonly campaignKind: CommandCampaignKind;
  readonly sourceKind: CampaignSourceKind;
  readonly commandScope: CommandShadowScope;
  readonly commandType: string;
  readonly occurredAt: string;
  readonly legacyPreHash: string;
  readonly legacyPostHash: string;
  /** Bounded, redacted, path-scoped description of the command inputs. Never a
   * full snapshot and never a raw secret value. */
  readonly commandPayload: RedactedCommandPayload;
  readonly sourceIdentity: string;
}

/** A small, bounded, redaction-safe view of a command's inputs. Only ids,
 * kinds, dotted field paths and short scalar summaries are permitted. */
export interface RedactedCommandPayload {
  /** Kind-aware legacy ids the command touched (never raw secret text). */
  readonly targetIds: readonly string[];
  /** Dotted field paths the command intends to change. */
  readonly changedFieldPaths: readonly string[];
  /** Short, non-sensitive scalar summaries keyed by field path (e.g. an enum
   * value or a boolean). Long / free-text values are redacted upstream. */
  readonly summary: Readonly<Record<string, string | number | boolean | null>>;
}

/** How the coordinator scheduled / resolved a single command event. */
export type CommandShadowStatus =
  | 'idle'
  | 'disabled'
  | 'not_allowlisted'
  | 'scheduled'
  | 'running'
  | 'success'
  | 'semantic_mismatch'
  | 'validation_failed'
  | 'mapping_failed'
  | 'command_rejected'
  | 'command_failed'
  | 'adapter_failed'
  | 'stale_precondition'
  | 'wrong_campaign'
  | 'conflict'
  | 'diagnostics_persistence_failed'
  | 'cancelled';

/** Structured classification of the universal-result vs adapter-post comparison. */
export type CommandComparisonClassification =
  | 'equal'
  | 'revision_only'
  | 'ordering_only'
  | 'semantic_mismatch';

/** Safe (id / path / count only) comparison detail — never payload values. */
export interface CommandComparisonSummary {
  classification: CommandComparisonClassification;
  mismatchCount: number;
  changedPaths: string[];
  missingIds: string[];
  addedIds: string[];
  referenceMismatches: string[];
  runtimeMismatches: string[];
  visibilityMismatches: string[];
}

/** Structured result of one universal command handler execution. */
export interface UniversalCommandResult {
  accepted: boolean;
  rejectionCode?: string;
  rejectionMessage?: string;
  snapshot: CampaignSnapshot | null;
  changedPaths: string[];
  createdIds: string[];
  updatedIds: string[];
  deletedIds: string[];
  referenceChanges: string[];
  runtimeChanges: string[];
}

/** The persisted, bounded diagnostics record for one command event. */
export interface CommandShadowDiagnosticRecord {
  eventId: string;
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  commandScope: CommandShadowScope;
  commandType: string;
  occurredAt: string;
  recordedAt: string;
  status: CommandShadowStatus;
  legacyPreHash: string;
  legacyPostHash: string;
  targetIds: readonly string[];
  changedFieldPaths: readonly string[];
  baseRevision: UniversalRevision | null;
  resultRevision: UniversalRevision | null;
  mappingOk: boolean;
  validationErrorCount: number;
  comparison: CommandComparisonSummary | null;
  errorCategory: CommandShadowStatus | null;
  errorMessage: string | null;
}

/** Live per-campaign status the DM diagnostics UI subscribes to. */
export interface CommandShadowCampaignStatus {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  namespace: string;
  status: CommandShadowStatus;
  pending: number;
  running: boolean;
  lastEventId: string | null;
  lastAttemptAt: string | null;
  lastSuccessAt: string | null;
  lastMismatchAt: string | null;
  runCount: number;
  successCount: number;
  mismatchCount: number;
  lastComparison: CommandComparisonSummary | null;
  lastErrorCategory: CommandShadowStatus | null;
  lastErrorMessage: string | null;
  recordCount: number;
}

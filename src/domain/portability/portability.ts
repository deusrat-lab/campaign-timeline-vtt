/**
 * Stage 17 — universal import / export / backup / restore pipeline.
 *
 * A thin, *safe* envelope over the existing repository primitives
 * (create/replace/backup/restore/export/import). Adds: canonical deterministic
 * bytes + hash, format detection, strict campaign-identity resolution (NO hidden
 * Greyholm fallback, NO active-campaign fallback), dry-run planning with a
 * conflict report, a rollback checkpoint before any overwrite, and a strict
 * separation between a DM export and a player-safe export.
 */
import type { CampaignId, UniversalRevision } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalCampaignRepository, CampaignBackup, RevisionWriteResult } from '../repository/types';
import { stableStringify } from '../persistence/serialization';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import type { ValidationResult } from '../validation/validateCampaignSnapshot';
import { projectPlayerSafe } from '../projection/projectCampaign';
import type { PlayerSafeProjection } from '../projection/types';

export const EXPORT_FORMAT_VERSION = '1.0.0';

export type ExportKind = 'portable' | 'backup' | 'player-safe';

export interface CampaignExportEnvelope {
  format: 'campaign-timeline-vtt/universal-export';
  formatVersion: string;
  kind: ExportKind;
  campaignId: CampaignId;
  schemaVersion: string;
  revision: number;
  exportedAt: string;
  snapshotHash: string;
  battleCount: number;
  /** DM exports carry the full snapshot; player-safe carries only the projection. */
  snapshot?: CampaignSnapshot;
  playerSafe?: PlayerSafeProjection;
}

// --- canonical bytes + hash -------------------------------------------------

export function canonicalSnapshotString(snapshot: CampaignSnapshot): string {
  return stableStringify(snapshot);
}

/** Deterministic FNV-1a hash of the canonical snapshot bytes. */
export function snapshotHash(snapshot: CampaignSnapshot): string {
  return fnv1a(canonicalSnapshotString(snapshot));
}

function fnv1a(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function battleCount(snapshot: CampaignSnapshot): number {
  return Object.keys(snapshot.runtime.battles ?? {}).length;
}

// --- export variants (deterministic) ----------------------------------------

function exportEnvelope(snapshot: CampaignSnapshot, kind: ExportKind): CampaignExportEnvelope {
  return {
    format: 'campaign-timeline-vtt/universal-export',
    formatVersion: EXPORT_FORMAT_VERSION,
    kind,
    campaignId: snapshot.metadata.campaignId,
    schemaVersion: String(snapshot.schemaVersion),
    revision: snapshot.revision,
    exportedAt: new Date(0).toISOString(),
    snapshotHash: snapshotHash(snapshot),
    battleCount: battleCount(snapshot),
  };
}

/** Portable DM export — full snapshot (battles included), campaign-scoped. */
export function exportPortable(snapshot: CampaignSnapshot): string {
  return stableStringify({ ...exportEnvelope(snapshot, 'portable'), snapshot });
}

/** Exact backup — same as portable today but carries the `backup` kind so a
 * restore flow can require an exact-revision match. */
export function exportBackup(snapshot: CampaignSnapshot): string {
  return stableStringify({ ...exportEnvelope(snapshot, 'backup'), snapshot });
}

/** Player-safe export — carries ONLY the player-safe projection. The full DM
 * snapshot is never present, so hidden entities / DM notes cannot leak. */
export function exportPlayerSafe(snapshot: CampaignSnapshot): string {
  return stableStringify({ ...exportEnvelope(snapshot, 'player-safe'), playerSafe: projectPlayerSafe(snapshot) });
}

// --- format detection -------------------------------------------------------

export type ImportFormat = 'universal-export' | 'raw-snapshot' | 'unknown';

export function detectImportFormat(text: string): { format: ImportFormat; envelope?: CampaignExportEnvelope; snapshot?: CampaignSnapshot } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { format: 'unknown' };
  }
  if (isEnvelope(parsed)) return { format: 'universal-export', envelope: parsed, snapshot: parsed.snapshot };
  if (isRawSnapshot(parsed)) return { format: 'raw-snapshot', snapshot: parsed as CampaignSnapshot };
  return { format: 'unknown' };
}

function isEnvelope(value: unknown): value is CampaignExportEnvelope {
  return !!value && typeof value === 'object' && (value as Record<string, unknown>).format === 'campaign-timeline-vtt/universal-export';
}
function isRawSnapshot(value: unknown): boolean {
  const v = value as Record<string, unknown> | null;
  return !!v && typeof v === 'object' && !!v.metadata && !!v.durable && !!v.runtime && typeof v.schemaVersion !== 'undefined';
}

// --- import planning (dry-run) ----------------------------------------------

export type ImportMode = 'create' | 'replace';

export interface ImportPlanRequest {
  text: string;
  /** Explicit target campaign id — REQUIRED. No hidden fallback. */
  targetCampaignId: CampaignId;
  mode: ImportMode;
}

export interface ImportPlan {
  ok: boolean;
  format: ImportFormat;
  targetCampaignId: CampaignId;
  mode: ImportMode;
  incomingCampaignId?: CampaignId;
  incomingRevision?: number;
  existingRevision?: number;
  battleCount?: number;
  snapshotHash?: string;
  validation?: ValidationResult;
  conflicts: string[];
  errors: string[];
}

export async function planImport(repo: UniversalCampaignRepository, request: ImportPlanRequest): Promise<ImportPlan> {
  const plan: ImportPlan = {
    ok: false,
    format: 'unknown',
    targetCampaignId: request.targetCampaignId,
    mode: request.mode,
    conflicts: [],
    errors: [],
  };

  const detected = detectImportFormat(request.text);
  plan.format = detected.format;

  if (detected.format === 'unknown' || !detected.snapshot) {
    plan.errors.push('unrecognized or empty import payload');
    return plan;
  }
  if (detected.envelope?.kind === 'player-safe') {
    plan.errors.push('player-safe exports cannot be imported as a campaign (no DM data)');
    return plan;
  }

  const snapshot = detected.snapshot;
  plan.incomingCampaignId = snapshot.metadata.campaignId;
  plan.incomingRevision = snapshot.revision;
  plan.battleCount = battleCount(snapshot);
  plan.snapshotHash = snapshotHash(snapshot);

  // Strict identity: payload campaign id MUST equal the explicit target.
  if (snapshot.metadata.campaignId !== request.targetCampaignId) {
    plan.errors.push(`campaign id mismatch: payload ${snapshot.metadata.campaignId} vs target ${request.targetCampaignId}`);
  }

  plan.validation = validateCampaignSnapshot(snapshot);
  if (!plan.validation.ok) {
    plan.errors.push(`snapshot validation failed: ${plan.validation.issues.filter((i) => i.severity === 'error').length} error(s)`);
  }

  const existing = await repo.readCampaign(request.targetCampaignId);
  plan.existingRevision = existing?.revision;

  if (request.mode === 'create' && existing) {
    plan.conflicts.push('target already exists; create mode would fail (use replace)');
    plan.errors.push('create into existing campaign');
  }
  if (request.mode === 'replace' && !existing) {
    plan.conflicts.push('target does not exist; replace has nothing to overwrite (use create)');
    plan.errors.push('replace of missing campaign');
  }

  plan.ok = plan.errors.length === 0;
  return plan;
}

// --- import apply (with rollback checkpoint) --------------------------------

export interface ImportApplyResult {
  ok: boolean;
  plan: ImportPlan;
  rollbackCheckpoint?: CampaignBackup;
  write?: RevisionWriteResult;
  errors: string[];
}

export async function applyImport(repo: UniversalCampaignRepository, request: ImportPlanRequest): Promise<ImportApplyResult> {
  const plan = await planImport(repo, request);
  if (!plan.ok) return { ok: false, plan, errors: plan.errors };

  const snapshot = detectImportFormat(request.text).snapshot!;

  // Rollback checkpoint before any overwrite.
  let rollbackCheckpoint: CampaignBackup | undefined;
  if (request.mode === 'replace') {
    rollbackCheckpoint = await repo.backupCampaign(request.targetCampaignId);
  }

  let write: RevisionWriteResult;
  if (request.mode === 'create') {
    write = await repo.createCampaign(snapshot);
  } else {
    write = await repo.replaceCampaign(snapshot, plan.existingRevision as UniversalRevision);
  }

  // Read-after-write verification.
  const readBack = await repo.readCampaign(request.targetCampaignId);
  if (!readBack) return { ok: false, plan, rollbackCheckpoint, write, errors: ['read-after-write returned null'] };

  return { ok: true, plan, rollbackCheckpoint, write, errors: [] };
}

// --- backup / restore with validation ---------------------------------------

export interface RestoreResult {
  ok: boolean;
  rollbackCheckpoint?: CampaignBackup;
  write?: RevisionWriteResult;
  errors: string[];
}

/** Restore a backup with a validation gate + a rollback checkpoint of whatever
 * the backup is about to overwrite. Corrupt backups are rejected. */
export async function safeRestore(
  repo: UniversalCampaignRepository,
  backup: CampaignBackup,
  expectedRevision?: UniversalRevision,
): Promise<RestoreResult> {
  if (!backup?.snapshot?.metadata?.campaignId || backup.snapshot.metadata.campaignId !== backup.campaignId) {
    return { ok: false, errors: ['corrupt backup: campaign id mismatch or missing snapshot'] };
  }
  const validation = validateCampaignSnapshot(backup.snapshot);
  if (!validation.ok) return { ok: false, errors: ['corrupt backup: snapshot failed validation'] };

  const existing = await repo.readCampaign(backup.campaignId);
  const rollbackCheckpoint = existing ? await repo.backupCampaign(backup.campaignId) : undefined;

  try {
    const write = await repo.restoreCampaign(backup, expectedRevision);
    const readBack = await repo.readCampaign(backup.campaignId);
    if (!readBack) return { ok: false, rollbackCheckpoint, write, errors: ['read-after-write returned null'] };
    return { ok: true, rollbackCheckpoint, write, errors: [] };
  } catch (error) {
    return { ok: false, rollbackCheckpoint, errors: [String((error as Error).message ?? error)] };
  }
}

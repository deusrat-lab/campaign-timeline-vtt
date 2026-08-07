/**
 * Stage 17 — universal import/export for User Campaigns.
 *
 * The DM export is a universal envelope: it carries the validated universal
 * snapshot (durable + runtime + battle definitions/runtime), a canonical hash,
 * portable identity metadata AND — for lossless reconstruction of the exact
 * User Campaign compatibility representation — the typed legacy `{ data, runtime }`
 * under a namespaced extension. Import validates the universal snapshot, then
 * reconstructs a NEW, isolated campaign (new campaignId) from the typed legacy
 * payload. No arbitrary JSON patch, no hidden Greyholm fallback.
 *
 * The Player-Safe export is built from the player-safe projection only and never
 * carries the DM snapshot or the legacy blob.
 */
import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import { adaptUserCampaignToUniversal } from '../adapters/userCampaignAdapter';
import { stableStringify } from '../persistence/serialization';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import { projectPlayerSafe } from '../projection/projectCampaign';
import { snapshotHash, canonicalHash, EXPORT_FORMAT_VERSION } from './portability';

const LEGACY_KIND = 'dmCompanion.userCampaign.v1';
const LEGACY_EXT = 'legacy:userCampaign';

export interface UserCampaignExportEnvelope {
  format: 'campaign-timeline-vtt/universal-export';
  formatVersion: string;
  kind: 'portable' | 'player-safe';
  campaignId: string;
  title: string;
  schemaVersion: string;
  revision: number;
  exportedAt: string;
  snapshotHash: string;
  battleCount: number;
  boardCount: number;
  tokenCount: number;
  snapshot?: unknown;
  playerSafe?: unknown;
  extensions?: { [LEGACY_EXT]?: { kind: string; data: UserCampaignData; runtime?: UserCampaignRuntime } };
}

/** Normalize volatile timestamps so a re-export of an unchanged campaign is
 * byte-identical (the only non-deterministic adapter output is wall-clock time). */
function normalizeVolatile<T>(snapshot: T): T {
  if (!snapshot) return snapshot;
  const s = snapshot as unknown as {
    metadata?: { createdAt?: string; updatedAt?: string };
    migrationMetadata?: Array<{ migratedAt?: string }>;
  };
  const EPOCH = new Date(0).toISOString();
  if (s.metadata) { s.metadata.createdAt = EPOCH; s.metadata.updatedAt = EPOCH; }
  for (const m of s.migrationMetadata ?? []) m.migratedAt = EPOCH;
  return snapshot;
}

/**
 * Camera/viewport (zoom/pan) contract — see also the mirrored contract at
 * src/pages/MapWorkspacePage.tsx (Greyholm's CAMERA_STORAGE_KEY).
 *
 * `UserCampaignRuntime.mapViewState` (zoom/panX/panY) is UI/session/tab-local
 * viewport state, NOT durable campaign content. It must be excluded from
 * every export payload (DM and Player-Safe alike) for the same reason
 * Greyholm's camera lives in a separate, never-exported localStorage key:
 * panning/zooming a map must never be treated as a content edit, must never
 * round-trip through Export/Import, and must never leak between isolated
 * browser tabs (Block H tab-scoped isolation). This function is the single
 * enforcement point for that rule on the User-Campaign (Caldran) stack.
 * Enforced by scripts/final-cutover/verify-camera-not-exported.mjs.
 */
function stripCameraViewState(runtime: UserCampaignRuntime | undefined): UserCampaignRuntime | undefined {
  if (!runtime) return runtime;
  const { mapViewState: _omit, ...rest } = runtime;
  return rest as UserCampaignRuntime;
}

function battleTokenCounts(runtime?: UserCampaignRuntime): { boards: number; tokens: number } {
  const boards = runtime?.battleBoards ?? {};
  const boardCount = Object.keys(boards).length;
  const tokenCount = Object.values(boards).reduce((sum, b) => sum + (b.tokens?.length ?? 0), 0);
  return { boards: boardCount, tokens: tokenCount };
}

/** Deterministic DM export (carries universal snapshot + typed legacy blob). */
export function exportUserCampaignDM(data: UserCampaignData, runtime?: UserCampaignRuntime): string {
  const adapted = adaptUserCampaignToUniversal({ data, runtime });
  const snapshot = normalizeVolatile(adapted.snapshot);
  const counts = battleTokenCounts(runtime);
  const envelope: UserCampaignExportEnvelope = {
    format: 'campaign-timeline-vtt/universal-export',
    formatVersion: EXPORT_FORMAT_VERSION,
    kind: 'portable',
    campaignId: data.campaignId,
    title: data.title,
    schemaVersion: snapshot ? String(snapshot.schemaVersion) : '1.0.0',
    revision: snapshot?.revision ?? 0,
    exportedAt: new Date(0).toISOString(),
    snapshotHash: snapshot ? snapshotHash(snapshot) : '00000000',
    battleCount: snapshot ? Object.keys(snapshot.runtime.battles ?? {}).length : 0,
    boardCount: counts.boards,
    tokenCount: counts.tokens,
    snapshot,
    extensions: { [LEGACY_EXT]: { kind: LEGACY_KIND, data, runtime: stripCameraViewState(runtime) } },
  };
  return stableStringify(envelope);
}

/** Player-Safe export — projection only, no DM snapshot, no legacy blob. */
export function exportUserCampaignPlayerSafe(data: UserCampaignData, runtime?: UserCampaignRuntime): string {
  const adapted = adaptUserCampaignToUniversal({ data, runtime });
  const snapshot = normalizeVolatile(adapted.snapshot);
  const envelope: UserCampaignExportEnvelope = {
    format: 'campaign-timeline-vtt/universal-export',
    formatVersion: EXPORT_FORMAT_VERSION,
    kind: 'player-safe',
    campaignId: data.campaignId,
    title: data.title,
    schemaVersion: snapshot ? String(snapshot.schemaVersion) : '1.0.0',
    revision: snapshot?.revision ?? 0,
    exportedAt: new Date(0).toISOString(),
    snapshotHash: snapshot ? snapshotHash(snapshot) : '00000000',
    battleCount: snapshot ? Object.keys(snapshot.runtime.battles ?? {}).length : 0,
    boardCount: 0,
    tokenCount: 0,
    playerSafe: snapshot ? projectPlayerSafe(snapshot) : undefined,
  };
  return stableStringify(envelope);
}

/** A canonical hash that ignores the volatile export timestamp. */
export function userCampaignExportHash(text: string): string {
  try {
    const env = JSON.parse(text) as UserCampaignExportEnvelope;
    return canonicalHash({ ...env, exportedAt: undefined });
  } catch {
    return '00000000';
  }
}

// --- import preview + apply -------------------------------------------------

export interface UserCampaignImportPreview {
  ok: boolean;
  format: 'universal-user-campaign' | 'legacy-user-campaign' | 'unknown';
  kind?: 'portable' | 'player-safe';
  campaignId?: string;
  title?: string;
  battleCount?: number;
  boardCount?: number;
  tokenCount?: number;
  snapshotHash?: string;
  errors: string[];
}

export function previewUserCampaignImport(text: string): UserCampaignImportPreview {
  const preview: UserCampaignImportPreview = { ok: false, format: 'unknown', errors: [] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    preview.errors.push('malformed JSON');
    return preview;
  }
  const obj = parsed as Record<string, unknown>;

  // universal envelope
  if (obj?.format === 'campaign-timeline-vtt/universal-export') {
    preview.format = 'universal-user-campaign';
    preview.kind = obj.kind as UserCampaignImportPreview['kind'];
    preview.campaignId = obj.campaignId as string;
    preview.title = obj.title as string;
    preview.battleCount = obj.battleCount as number;
    preview.boardCount = obj.boardCount as number;
    preview.tokenCount = obj.tokenCount as number;
    preview.snapshotHash = obj.snapshotHash as string;
    if (obj.kind === 'player-safe') {
      preview.errors.push('player-safe export cannot be imported as a campaign (no DM data)');
      return preview;
    }
    const legacy = (obj.extensions as Record<string, unknown> | undefined)?.[LEGACY_EXT] as
      | { kind?: string; data?: UserCampaignData; runtime?: UserCampaignRuntime }
      | undefined;
    if (!legacy?.data || legacy.kind !== LEGACY_KIND) {
      preview.errors.push('universal export is missing the user-campaign compatibility payload');
      return preview;
    }
    const dupes = duplicateIssues(legacy.data, legacy.runtime);
    preview.errors.push(...dupes);
    // validate the embedded snapshot when present
    if (obj.snapshot) {
      const validation = validateCampaignSnapshot(obj.snapshot as never);
      if (!validation.ok) preview.errors.push(`snapshot validation failed: ${validation.issues.filter((i) => i.severity === 'error').length} error(s)`);
    }
    preview.ok = preview.errors.length === 0;
    return preview;
  }

  // legacy user-campaign format
  if (obj?.kind === LEGACY_KIND && obj.data) {
    preview.format = 'legacy-user-campaign';
    const data = obj.data as UserCampaignData;
    preview.campaignId = data.campaignId;
    preview.title = data.title;
    const counts = battleTokenCounts(obj.runtime as UserCampaignRuntime | undefined);
    preview.boardCount = counts.boards;
    preview.tokenCount = counts.tokens;
    preview.errors.push(...duplicateIssues(data, obj.runtime as UserCampaignRuntime | undefined));
    preview.ok = preview.errors.length === 0;
    return preview;
  }

  preview.errors.push('unrecognized import format');
  return preview;
}

export interface ReconstructedUserCampaign {
  ok: boolean;
  data?: UserCampaignData;
  runtime?: UserCampaignRuntime;
  errors: string[];
}

/**
 * Reconstruct a NEW, isolated User Campaign from an export (universal or legacy),
 * rewriting the campaignId. The token/board/placement ids are preserved (they are
 * campaign-scoped), proving campaign-scoped identity across A and B.
 */
export function reconstructUserCampaign(text: string, newCampaignId: string): ReconstructedUserCampaign {
  const preview = previewUserCampaignImport(text);
  if (!preview.ok) return { ok: false, errors: preview.errors };

  const obj = JSON.parse(text) as Record<string, unknown>;
  let legacyData: UserCampaignData | undefined;
  let legacyRuntime: UserCampaignRuntime | undefined;

  if (preview.format === 'universal-user-campaign') {
    const legacy = (obj.extensions as Record<string, unknown>)[LEGACY_EXT] as { data: UserCampaignData; runtime?: UserCampaignRuntime };
    legacyData = legacy.data;
    legacyRuntime = legacy.runtime;
  } else if (preview.format === 'legacy-user-campaign') {
    legacyData = obj.data as UserCampaignData;
    legacyRuntime = obj.runtime as UserCampaignRuntime | undefined;
  }
  if (!legacyData) return { ok: false, errors: ['no reconstructable campaign payload'] };

  const data: UserCampaignData = { ...legacyData, campaignId: newCampaignId };
  const runtime: UserCampaignRuntime | undefined = legacyRuntime
    ? { ...legacyRuntime, campaignId: newCampaignId }
    : undefined;
  return { ok: true, data, runtime, errors: [] };
}

function duplicateIssues(data: UserCampaignData, runtime?: UserCampaignRuntime): string[] {
  const errors: string[] = [];
  const dupIds = (arr: Array<{ id: string }> | undefined, label: string) => {
    const seen = new Set<string>();
    for (const item of arr ?? []) {
      if (seen.has(item.id)) errors.push(`duplicate ${label} id: ${item.id}`);
      seen.add(item.id);
    }
  };
  dupIds(data.locations, 'location');
  dupIds(data.npcs, 'npc');
  dupIds(data.enemies, 'enemy');
  dupIds(data.quests, 'quest');
  dupIds(data.mapPlacements, 'placement');
  // duplicate battle token ids within a board
  for (const [mapId, board] of Object.entries(runtime?.battleBoards ?? {})) {
    const seen = new Set<string>();
    for (const t of board.tokens ?? []) {
      if (seen.has(t.id)) errors.push(`duplicate battle token id ${t.id} on board ${mapId}`);
      seen.add(t.id);
    }
  }
  return errors;
}

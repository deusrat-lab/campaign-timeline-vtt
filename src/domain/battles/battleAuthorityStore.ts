/**
 * Stage 17 — durable battle authority.
 *
 * When the Stage 17 battle-authority cutover is on, a normal battle mutation in
 * the real UI routes THROUGH this store: the typed universal battle command runs
 * first, the resulting `BattleRuntime` is committed durably (campaign-scoped,
 * expected-revision guarded, verified read-after-write) to an isolated Stage 17
 * namespace, and only then does the legacy board update run as a deterministic
 * compatibility projection. This is the same universal-first / legacy-compat
 * discipline Stage 15/16 use for scalar fields and aggregates, extended to
 * battle runtime. No network, no production namespace, no server.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';
import type { BattleRuntime } from './types';
import type { UniversalPoint } from '../maps/types';
import { executeBattleCommand } from './battleCommands';
import type { BattleCommandFail } from './battleCommands';
import { battleTokenId } from './battleIdentity';
import { userBoardToUniversal, universalToUserBoard } from './battleAdapters';
import type { CampaignBattleBoard } from '../../types/userCampaign';

export const UNIVERSAL_BATTLE_NAMESPACE = 'campaign-timeline-vtt:universal-battle:v1';

export interface StoredBattle {
  runtime: BattleRuntime;
  revision: number;
}

function battleKey(campaignId: CampaignId, battleId: string): string {
  return `${UNIVERSAL_BATTLE_NAMESPACE}:${campaignId}:${battleId}`;
}

export function readStoredBattle(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  battleId: string,
): StoredBattle | null {
  const raw = storage.getItem(battleKey(campaignId, battleId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredBattle;
    if (!parsed?.runtime || typeof parsed.revision !== 'number') return null;
    if (parsed.runtime.campaignId !== campaignId) return null; // campaign isolation
    return parsed;
  } catch {
    return null;
  }
}

export interface BattleCommitResult {
  ok: boolean;
  newRevision?: number;
  currentRevision?: number;
  code?: 'conflict' | 'read-after-write' | 'command';
  message?: string;
}

/** Atomically commit a battle runtime under an expected-revision guard, then
 * verify it read-after-write. */
export function commitBattle(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  battleId: string,
  runtime: BattleRuntime,
  expectedRevision: number,
): BattleCommitResult {
  const existing = readStoredBattle(storage, campaignId, battleId);
  const current = existing?.revision ?? 0;
  if (current !== expectedRevision) {
    return { ok: false, code: 'conflict', currentRevision: current, message: `expected ${expectedRevision}, current ${current}` };
  }
  const newRevision = current + 1;
  const record: StoredBattle = { runtime: { ...runtime, revision: newRevision }, revision: newRevision };
  storage.setItem(battleKey(campaignId, battleId), JSON.stringify(record));
  const readBack = readStoredBattle(storage, campaignId, battleId);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, code: 'read-after-write', message: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision };
}

export interface BattleMoveOutcome {
  ok: boolean;
  newRevision?: number;
  /** Deterministic legacy compatibility board to apply after the durable commit. */
  compatBoard?: CampaignBattleBoard;
  error?: string;
}

/**
 * Route a user-campaign token move through universal battle authority:
 * seed-or-read universal runtime → typed move command (expected revision) →
 * durable commit → produce the legacy compatibility board.
 *
 * `legacyBoard` is the exact current legacy board (so a first move seeds the
 * universal runtime from the true current state, never a stale snapshot).
 */
export function routeUserTokenMove(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  battleId: string,
  legacyBoard: CampaignBattleBoard,
  legacyTokenId: string,
  position: UniversalPoint,
): BattleMoveOutcome {
  const stored = readStoredBattle(storage, campaignId, battleId);
  const runtime: BattleRuntime = stored
    ? stored.runtime
    : userBoardToUniversal(campaignId, battleId, legacyBoard, { active: true });
  const expectedRevision = stored?.revision ?? 0;
  if (!stored) runtime.revision = 0;

  const universalTokenId = battleTokenId(campaignId, battleId, legacyTokenId);
  const result = executeBattleCommand(runtime, {
    kind: 'move-token',
    campaignId,
    battleId,
    tokenId: universalTokenId,
    position,
    expectedRevision,
  });
  if (!result.ok) return { ok: false, error: (result as BattleCommandFail).error.message };

  const commit = commitBattle(storage, campaignId, battleId, result.next, expectedRevision);
  if (!commit.ok) return { ok: false, error: commit.message };

  return { ok: true, newRevision: commit.newRevision, compatBoard: universalToUserBoard(result.next) };
}

export interface TurnAdvanceOutcome {
  ok: boolean;
  newRevision?: number;
  currentTurnTokenId?: string;
  round?: number;
  error?: string;
}

/**
 * Route a turn advance (Greyholm "Следующий ход") through universal authority:
 * seed-or-read the universal battle runtime, apply a typed `set-turn` command
 * (the next combatant + round chosen by the legacy UI), durably commit under an
 * expected-revision guard. `seedRuntime` is used only when this battle has never
 * been committed (so it is seeded from the true current legacy state).
 */
export function routeSetTurn(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  battleId: string,
  seedRuntime: BattleRuntime,
  nextLegacyTokenId: string,
  round: number,
): TurnAdvanceOutcome {
  const stored = readStoredBattle(storage, campaignId, battleId);
  const runtime = stored ? stored.runtime : seedRuntime;
  const expectedRevision = stored?.revision ?? 0;
  if (!stored) runtime.revision = 0;

  const universalTokenId = battleTokenId(campaignId, battleId, nextLegacyTokenId);
  const result = executeBattleCommand(runtime, {
    kind: 'set-turn',
    campaignId,
    battleId,
    currentTurnTokenId: universalTokenId,
    round,
    expectedRevision,
  });
  if (!result.ok) return { ok: false, error: (result as BattleCommandFail).error.message };

  const commit = commitBattle(storage, campaignId, battleId, result.next, expectedRevision);
  if (!commit.ok) return { ok: false, error: commit.message };
  return { ok: true, newRevision: commit.newRevision, currentTurnTokenId: nextLegacyTokenId, round };
}

/** Current durable revision for a battle (0 when never committed). */
export function battleRevision(storage: RepositoryStorage, campaignId: CampaignId, battleId: string): number {
  return readStoredBattle(storage, campaignId, battleId)?.revision ?? 0;
}

// --- pending compatibility-projection recovery ------------------------------
//
// When the universal battle commit succeeds but the legacy compatibility
// projection fails, a bounded, redacted, campaign-scoped pending record is
// written. On reload, recovery re-applies the (idempotent) compatibility
// transition and clears the record — WITHOUT a second universal commit.

export const UNIVERSAL_BATTLE_PENDING_NAMESPACE = 'campaign-timeline-vtt:universal-battle-pending:v1';

export interface PendingBattleProjection {
  campaignId: CampaignId;
  battleId: string;
  tokenId: string;
  position: UniversalPoint;
  /** The universal revision already durably committed (never re-committed). */
  committedRevision: number;
}

function pendingKey(campaignId: CampaignId, battleId: string): string {
  return `${UNIVERSAL_BATTLE_PENDING_NAMESPACE}:${campaignId}:${battleId}`;
}

export function recordPendingProjection(storage: RepositoryStorage, pending: PendingBattleProjection): void {
  storage.setItem(pendingKey(pending.campaignId, pending.battleId), JSON.stringify(pending));
}

export function readPendingProjection(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  battleId: string,
): PendingBattleProjection | null {
  const raw = storage.getItem(pendingKey(campaignId, battleId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingBattleProjection;
    if (parsed?.campaignId !== campaignId || parsed.battleId !== battleId) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearPendingProjection(storage: RepositoryStorage, campaignId: CampaignId, battleId: string): void {
  storage.removeItem(pendingKey(campaignId, battleId));
}

export function pendingProjectionCount(storage: RepositoryStorage, campaignId: CampaignId): number {
  const prefix = `${UNIVERSAL_BATTLE_PENDING_NAMESPACE}:${campaignId}:`;
  return storage.keys().filter((key) => key.startsWith(prefix)).length;
}

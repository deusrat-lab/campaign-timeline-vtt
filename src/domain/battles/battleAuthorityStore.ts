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
import { executeBattleCommand, checkInvariants } from './battleCommands';
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

// --- Decision 2 — whole-board sole-authority commit --------------------------
//
// `routeUserTokenMove`/`routeSetTurn` above route ONE typed command each. A
// real board UI (CampaignBattlePage.tsx) computes its next board locally
// (token add/move/remove, rename, hp, terrain paint, grid, variant, turn/round
// all share the same `patchBoard(updater)` call site) and needs ONE commit per
// user gesture, not a hand-maintained diff-to-typed-command translator for
// every field combination a `patchBoard` caller might touch together.
//
// `commitUserBoard` closes that gap while keeping the same durable-authority
// discipline as the single-command routes above: the candidate board is
// converted through the SAME `userBoardToUniversal` adapter the Stage 17
// harness already proves is lossless, validated with the SAME
// `checkInvariants` every typed command result is checked against (duplicate
// token ids, non-finite positions, hp > maxHp), then committed under an
// expected-revision guard with read-after-write verification. A board that
// fails invariants is rejected before anything is persisted -- exactly the
// same rejection a bad typed command would produce, just checked once against
// the whole next board instead of once per field. This is universal-first:
// the legacy `CampaignBattleBoard` a caller then displays/persists is always
// the read-after-write projection of what was actually committed, never an
// independent write.
export interface BoardCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed board, round-tripped back through the adapter --
   * always what the caller should treat as current, never its own candidate. */
  compatBoard?: CampaignBattleBoard;
  error?: string;
}

export function commitUserBoard(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  battleId: string,
  nextBoard: CampaignBattleBoard,
): BoardCommitOutcome {
  const stored = readStoredBattle(storage, campaignId, battleId);
  const expectedRevision = stored?.revision ?? 0;
  const nextRuntime = userBoardToUniversal(campaignId, battleId, nextBoard, {
    active: true,
    presented: stored?.runtime.presentedToPlayers ?? false,
  });
  const invariant = checkInvariants(nextRuntime);
  if (invariant) return { ok: false, error: invariant.message };

  const commit = commitBattle(storage, campaignId, battleId, nextRuntime, expectedRevision);
  if (!commit.ok) return { ok: false, error: commit.message };

  const readBack = readStoredBattle(storage, campaignId, battleId);
  if (!readBack) return { ok: false, error: 'commit not visible read-after-write' };
  return { ok: true, newRevision: commit.newRevision, compatBoard: universalToUserBoard(readBack.runtime) };
}

/** Reload/bootstrap: the durably-committed board if one exists, else null
 * (caller falls back to its own legacy seed -- the one allowed migration
 * boundary, for a board that predates this cutover / was never committed). */
export function readUserBoard(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  battleId: string,
): CampaignBattleBoard | null {
  const stored = readStoredBattle(storage, campaignId, battleId);
  return stored ? universalToUserBoard(stored.runtime) : null;
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

export interface BattleRecordSummary {
  campaignId: string;
  battleId: string;
  revision: number;
  hash: string;
  currentTurnTokenId?: string;
  round?: number;
  tokenCount: number;
}

/** Enumerate all durable battle records (for live diagnostics). Campaign-scoped
 * keys are parsed, not guessed. */
export function listBattleRecords(storage: RepositoryStorage): BattleRecordSummary[] {
  const prefix = `${UNIVERSAL_BATTLE_NAMESPACE}:`;
  const out: BattleRecordSummary[] = [];
  for (const key of storage.keys()) {
    if (!key.startsWith(prefix)) continue;
    const raw = storage.getItem(key);
    if (!raw) continue;
    try {
      const rec = JSON.parse(raw) as StoredBattle;
      const rt = rec.runtime;
      out.push({
        campaignId: String(rt.campaignId),
        battleId: rt.battleMapRef,
        revision: rec.revision,
        hash: fnvHash(raw),
        currentTurnTokenId: rt.initiative?.currentTurnTokenId,
        round: rt.initiative?.round,
        tokenCount: rt.board.tokens.length,
      });
    } catch {
      /* skip corrupt */
    }
  }
  return out.sort((a, b) => (a.campaignId + a.battleId).localeCompare(b.campaignId + b.battleId));
}

/** Total pending compatibility projections across all campaigns. */
export function totalPendingCount(storage: RepositoryStorage): number {
  const prefix = `${UNIVERSAL_BATTLE_PENDING_NAMESPACE}:`;
  return storage.keys().filter((key) => key.startsWith(prefix)).length;
}

function fnvHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

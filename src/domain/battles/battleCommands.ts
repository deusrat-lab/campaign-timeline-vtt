/**
 * Stage 17 — typed, campaign-scoped battle commands + invariants.
 *
 * Every mutation is a typed command carrying its exact campaign + battle, is
 * guarded by an expected revision, produces exactly one next runtime, and is
 * invariant-checked. No arbitrary patches, no wildcard deletes, no guessed
 * tokens, no first-match. The reducer is pure (no storage / network / React).
 */
import type { CampaignId } from '../campaign/ids';
import type { UniversalPoint } from '../maps/types';
import type { BattleRuntime, BattleToken } from './types';
import { assertBattleCampaign, resolveToken, findDuplicateTokenIds } from './battleIdentity';
import type { BattleIdentityError } from './battleIdentity';

export type BattleCommand =
  | { kind: 'start-battle'; campaignId: CampaignId; battleId: string; expectedRevision: number }
  | { kind: 'end-battle'; campaignId: CampaignId; battleId: string; expectedRevision: number }
  | { kind: 'place-token'; campaignId: CampaignId; battleId: string; token: BattleToken; expectedRevision: number }
  | { kind: 'move-token'; campaignId: CampaignId; battleId: string; tokenId: string; position: UniversalPoint; expectedRevision: number }
  | { kind: 'remove-token'; campaignId: CampaignId; battleId: string; tokenId: string; expectedRevision: number }
  | { kind: 'set-initiative'; campaignId: CampaignId; battleId: string; order: string[]; round: number; expectedRevision: number }
  | { kind: 'advance-turn'; campaignId: CampaignId; battleId: string; expectedRevision: number }
  | { kind: 'advance-round'; campaignId: CampaignId; battleId: string; expectedRevision: number }
  | { kind: 'set-runtime'; campaignId: CampaignId; battleId: string; tokenId: string; patch: TokenRuntimePatch; expectedRevision: number }
  | { kind: 'set-visibility'; campaignId: CampaignId; battleId: string; presented: boolean; expectedRevision: number };

export type BattleCommandKind = BattleCommand['kind'];

export interface TokenRuntimePatch {
  currentHp?: number;
  maxHp?: number;
  ac?: number;
  statuses?: string[];
}

export type BattleCommandError =
  | BattleIdentityError
  | { code: 'revision-conflict'; message: string }
  | { code: 'invariant'; message: string }
  | { code: 'not-active'; message: string };

export interface BattleCommandOk {
  ok: true;
  next: BattleRuntime;
  newRevision: number;
}
export interface BattleCommandFail {
  ok: false;
  error: BattleCommandError;
}
export type BattleCommandResult = BattleCommandOk | BattleCommandFail;

const ALL_KINDS: readonly BattleCommandKind[] = [
  'start-battle', 'end-battle', 'place-token', 'move-token', 'remove-token',
  'set-initiative', 'advance-turn', 'advance-round', 'set-runtime', 'set-visibility',
];
export function allBattleCommandKinds(): readonly BattleCommandKind[] {
  return ALL_KINDS;
}

export function executeBattleCommand(runtime: BattleRuntime, command: BattleCommand): BattleCommandResult {
  const campaignError = assertBattleCampaign(runtime, command.campaignId);
  if (campaignError) return fail(campaignError);

  const current = runtime.revision ?? 0;
  if (current !== command.expectedRevision) {
    return fail({ code: 'revision-conflict', message: `expected revision ${command.expectedRevision}, actual ${current}` });
  }

  const draft = clone(runtime);
  const applied = apply(draft, command);
  if (!applied.ok) return applied;

  const invariant = checkInvariants(applied.next);
  if (invariant) return fail(invariant);

  applied.next.revision = current + 1;
  return { ok: true, next: applied.next, newRevision: current + 1 };
}

function apply(runtime: BattleRuntime, command: BattleCommand): BattleCommandResult {
  const done = (): BattleCommandResult => ({ ok: true, next: runtime, newRevision: runtime.revision ?? 0 });
  switch (command.kind) {
    case 'start-battle':
      runtime.active = true;
      return done();
    case 'end-battle':
      runtime.active = false;
      runtime.presentedToPlayers = false;
      return done();
    case 'place-token':
      runtime.board.tokens = [...runtime.board.tokens, command.token];
      return done();
    case 'move-token': {
      const found = resolveToken(runtime, command.tokenId);
      if ('error' in found) return fail(found.error);
      found.token.position = { ...command.position };
      return done();
    }
    case 'remove-token': {
      const found = resolveToken(runtime, command.tokenId);
      if ('error' in found) return fail(found.error);
      runtime.board.tokens = runtime.board.tokens.filter((token) => token.id !== command.tokenId);
      if (runtime.initiative?.currentTurnTokenId === command.tokenId) {
        runtime.initiative = { ...runtime.initiative, currentTurnTokenId: undefined };
      }
      return done();
    }
    case 'set-initiative': {
      const ids = new Set(runtime.board.tokens.map((token) => token.id));
      for (const id of command.order) {
        if (!ids.has(id)) return fail({ code: 'unknown-token', message: `initiative references unknown token ${id}` });
      }
      applyInitiativeOrder(runtime, command.order);
      runtime.initiative = { round: command.round, currentTurnTokenId: command.order[0] };
      return done();
    }
    case 'advance-turn': {
      if (!runtime.active) return fail({ code: 'not-active', message: 'battle is not active' });
      const order = initiativeOrder(runtime);
      if (order.length === 0) return done();
      const currentIndex = order.indexOf(runtime.initiative?.currentTurnTokenId ?? order[0]);
      const nextIndex = (currentIndex + 1) % order.length;
      const round = (runtime.initiative?.round ?? 1) + (nextIndex === 0 ? 1 : 0);
      runtime.initiative = { round, currentTurnTokenId: order[nextIndex] };
      return done();
    }
    case 'advance-round': {
      if (!runtime.active) return fail({ code: 'not-active', message: 'battle is not active' });
      runtime.initiative = { round: (runtime.initiative?.round ?? 1) + 1, currentTurnTokenId: runtime.initiative?.currentTurnTokenId };
      return done();
    }
    case 'set-runtime': {
      const found = resolveToken(runtime, command.tokenId);
      if ('error' in found) return fail(found.error);
      Object.assign(found.token, prunePatch(command.patch));
      return done();
    }
    case 'set-visibility':
      runtime.presentedToPlayers = command.presented;
      return done();
  }
}

// invariants -----------------------------------------------------------------

export function checkInvariants(runtime: BattleRuntime): BattleCommandError | null {
  const duplicates = findDuplicateTokenIds(runtime.board.tokens);
  if (duplicates.length) return { code: 'invariant', message: `duplicate token ids: ${duplicates.join(', ')}` };

  for (const token of runtime.board.tokens) {
    if (!finite(token.position.x) || !finite(token.position.y)) {
      return { code: 'invariant', message: `token ${token.id} has non-finite position` };
    }
    if (token.currentHp != null && token.maxHp != null && token.currentHp > token.maxHp) {
      return { code: 'invariant', message: `token ${token.id} currentHp exceeds maxHp` };
    }
    if (token.currentHp != null && !finite(token.currentHp)) {
      return { code: 'invariant', message: `token ${token.id} has non-finite hp` };
    }
  }

  const initiative = runtime.initiative;
  if (initiative) {
    if (!Number.isInteger(initiative.round) || initiative.round < 1) {
      return { code: 'invariant', message: `round must be a positive integer` };
    }
    if (initiative.currentTurnTokenId) {
      const exists = runtime.board.tokens.some((token) => token.id === initiative.currentTurnTokenId);
      if (!exists) return { code: 'invariant', message: `current turn references a removed token` };
    }
  }
  return null;
}

// helpers --------------------------------------------------------------------

function initiativeOrder(runtime: BattleRuntime): string[] {
  return [...runtime.board.tokens]
    .sort((a, b) => (b.initiative ?? -Infinity) - (a.initiative ?? -Infinity) || compare(a.id, b.id))
    .map((token) => token.id);
}
function applyInitiativeOrder(runtime: BattleRuntime, order: string[]): void {
  const rank = new Map(order.map((id, index) => [id, order.length - index]));
  for (const token of runtime.board.tokens) {
    if (rank.has(token.id)) token.initiative = rank.get(token.id);
  }
}
function prunePatch(patch: TokenRuntimePatch): TokenRuntimePatch {
  const out: TokenRuntimePatch = {};
  if (patch.currentHp !== undefined) out.currentHp = patch.currentHp;
  if (patch.maxHp !== undefined) out.maxHp = patch.maxHp;
  if (patch.ac !== undefined) out.ac = patch.ac;
  if (patch.statuses !== undefined) out.statuses = patch.statuses;
  return out;
}
function finite(value: number): boolean {
  return Number.isFinite(value);
}
function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function clone(runtime: BattleRuntime): BattleRuntime {
  return JSON.parse(JSON.stringify(runtime)) as BattleRuntime;
}
function fail(error: BattleCommandError): BattleCommandFail {
  return { ok: false, error };
}

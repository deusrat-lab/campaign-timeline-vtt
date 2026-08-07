/**
 * Stage 17 — exact, campaign-scoped battle identity.
 *
 * All battle references are resolved *within* a single campaign. There is no
 * first-match, no active-campaign fallback, and no Greyholm fallback: a source
 * id that exists in Greyholm and in Caldran resolves to two distinct universal
 * ids that never collide. Ambiguous or cross-campaign references are rejected.
 */
import { makeRuntimeId, sourceScopedId } from '../campaign/ids';
import type { CampaignId, UniversalRuntimeId } from '../campaign/ids';
import type { BattleRuntime, BattleToken } from './types';

/** Deterministic universal runtime id for a battle, scoped to its campaign. */
export function battleRuntimeId(campaignId: CampaignId, battleId: string): UniversalRuntimeId {
  return makeRuntimeId(sourceScopedId(`runtime:battle:${scopeKey(campaignId)}`, battleId));
}

/** Deterministic universal token id, scoped to campaign + battle. */
export function battleTokenId(campaignId: CampaignId, battleId: string, tokenId: string): string {
  return sourceScopedId(`token:${scopeKey(campaignId)}:${normalize(battleId)}`, tokenId);
}

function scopeKey(campaignId: CampaignId): string {
  // campaignId already contains colons (camp:user:...) — collapse to a single
  // path-safe segment so nested sourceScopedId output stays a valid id.
  return normalize(String(campaignId));
}

function normalize(value: string): string {
  return value.trim().replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

export interface BattleIdentityError {
  code:
    | 'campaign-mismatch'
    | 'unknown-battle'
    | 'unknown-token'
    | 'duplicate-token'
    | 'ambiguous-token';
  message: string;
}

/** Guard: the runtime belongs to exactly this campaign. */
export function assertBattleCampaign(
  runtime: BattleRuntime,
  campaignId: CampaignId,
): BattleIdentityError | null {
  if (runtime.campaignId !== campaignId) {
    return {
      code: 'campaign-mismatch',
      message: `battle ${runtime.id} belongs to ${runtime.campaignId}, not ${campaignId}`,
    };
  }
  return null;
}

/** Exact token lookup with no first-match: duplicate ids are an error, not a pick. */
export function resolveToken(
  runtime: BattleRuntime,
  tokenId: string,
): { token: BattleToken } | { error: BattleIdentityError } {
  const matches = runtime.board.tokens.filter((token) => token.id === tokenId);
  if (matches.length === 0) {
    return { error: { code: 'unknown-token', message: `no token ${tokenId} in battle ${runtime.id}` } };
  }
  if (matches.length > 1) {
    return { error: { code: 'ambiguous-token', message: `token ${tokenId} is duplicated in battle ${runtime.id}` } };
  }
  return { token: matches[0] };
}

/** Every token id in a board must be unique. */
export function findDuplicateTokenIds(tokens: readonly BattleToken[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const token of tokens) {
    if (seen.has(token.id)) duplicates.add(token.id);
    seen.add(token.id);
  }
  return [...duplicates];
}

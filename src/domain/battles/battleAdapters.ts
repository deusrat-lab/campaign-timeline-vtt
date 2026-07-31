/**
 * Stage 17 — battle adapters.
 *
 * Round-trips the two real legacy battle models into the single universal
 * `BattleRuntime` contract and back, without loss:
 *   - Greyholm  : `ActiveBattleState` + `ActiveBattleCombatant[]` (one active battle)
 *   - User camp : `CampaignBattleBoard` + `CampaignBattleToken[]` (one board per map)
 *
 * Fields that have no first-class universal home are preserved verbatim under a
 * namespaced `extensions` bag so a legacy → universal → legacy round-trip is an
 * identity on the data the legacy stack owns.
 */
import type { ActiveBattleState, ActiveBattleCombatant } from '../../types';
import type { CampaignBattleBoard, CampaignBattleToken } from '../../types/userCampaign';
import type { CampaignId } from '../campaign/ids';
import { DM_ONLY_VISIBILITY } from '../visibility/types';
import type { BattleRuntime, BattleToken, BattleSide } from './types';
import { battleRuntimeId, battleTokenId } from './battleIdentity';

const GREYHOLM_EXT = 'legacy:greyholm-active';
const USER_EXT = 'legacy:user-board';

// ---------------------------------------------------------------------------
// Greyholm ActiveBattleState  <->  BattleRuntime
// ---------------------------------------------------------------------------

export function greyholmBattleToUniversal(
  campaignId: CampaignId,
  active: ActiveBattleState,
): BattleRuntime {
  const tokens = active.combatants.map((combatant) => combatantToToken(campaignId, active.id, combatant));
  return {
    id: battleRuntimeId(campaignId, active.id),
    campaignId,
    battleMapRef: active.battleMapId,
    battleEntryRef: active.sceneId,
    active: true,
    board: {
      battleMapRef: active.battleMapId,
      variant: active.variantType,
      tokens,
      terrain: (active.terrainCells ?? []).map((cell) => ({
        cellKey: `${cell.row},${cell.column}`,
        type: cell.type,
      })),
    },
    initiative: { round: active.round, currentTurnTokenId: currentTurnToken(campaignId, active) },
    presentedToPlayers: true,
    extensions: {
      [GREYHOLM_EXT]: {
        legacyId: active.id,
        sceneId: active.sceneId,
        locationStateId: active.locationStateId,
        title: active.title,
        startedAt: active.startedAt,
      },
    },
  };
}

function currentTurnToken(campaignId: CampaignId, active: ActiveBattleState): string | undefined {
  if (!active.currentTurnCombatantId) return undefined;
  return battleTokenId(campaignId, active.id, active.currentTurnCombatantId);
}

function combatantToToken(
  campaignId: CampaignId,
  battleId: string,
  combatant: ActiveBattleCombatant,
): BattleToken {
  return {
    id: battleTokenId(campaignId, battleId, combatant.id),
    name: combatant.name,
    side: normalizeSide(combatant.side),
    sourceEntityRef: undefined,
    position: { x: combatant.x, y: combatant.y },
    currentHp: combatant.currentHp,
    maxHp: combatant.maxHp,
    ac: combatant.armorClass,
    initiative: combatant.initiative,
    statuses: undefined,
    extensions: {
      [GREYHOLM_EXT]: {
        legacyId: combatant.id,
        sourceId: combatant.sourceId,
        imageId: combatant.imageId,
        tokenSrc: combatant.tokenSrc,
        notes: combatant.notes,
        row: combatant.row,
        column: combatant.column,
        speedFeet: combatant.speedFeet,
        tokenDefinitionId: combatant.tokenDefinitionId,
      },
    },
  };
}

/** Reverse projection: universal BattleRuntime → legacy ActiveBattleState. */
export function universalToGreyholmBattle(runtime: BattleRuntime): ActiveBattleState {
  const meta = ext(runtime.extensions, GREYHOLM_EXT);
  return {
    id: (meta?.legacyId as string) ?? runtime.battleMapRef,
    battleMapId: runtime.battleMapRef,
    sceneId: meta?.sceneId as string | undefined,
    locationStateId: meta?.locationStateId as string | undefined,
    title: (meta?.title as string) ?? 'Battle',
    variantType: runtime.board.variant ?? 'default',
    startedAt: (meta?.startedAt as string) ?? new Date(0).toISOString(),
    currentTurnCombatantId: legacyTokenIdOf(runtime, runtime.initiative?.currentTurnTokenId),
    round: runtime.initiative?.round ?? 1,
    combatants: runtime.board.tokens.map((token) => tokenToCombatant(token)),
    terrainCells: (runtime.board.terrain ?? []).map((cell) => {
      const [row, column] = cell.cellKey.split(',').map((value) => Number(value));
      return { row, column, type: cell.type === 'custom' ? 'blocked' : cell.type };
    }),
  };
}

function tokenToCombatant(token: BattleToken): ActiveBattleCombatant {
  const meta = ext(token.extensions, GREYHOLM_EXT);
  return {
    id: (meta?.legacyId as string) ?? token.id,
    // Greyholm's ActiveBattleCombatant only distinguishes enemy/player; ally &
    // neutral collapse to enemy on the way back (real Greyholm sources are only
    // ever enemy/player, so genuine round-trips are unaffected).
    side: token.side === 'player' ? 'player' : 'enemy',
    sourceId: (meta?.sourceId as string) ?? '',
    name: token.name,
    imageId: meta?.imageId as string | undefined,
    tokenSrc: meta?.tokenSrc as string | undefined,
    currentHp: token.currentHp ?? 0,
    maxHp: token.maxHp ?? 0,
    armorClass: token.ac,
    initiative: token.initiative,
    notes: meta?.notes as string | undefined,
    row: meta?.row as number | undefined,
    column: meta?.column as number | undefined,
    speedFeet: meta?.speedFeet as number | undefined,
    tokenDefinitionId: meta?.tokenDefinitionId as string | undefined,
    x: token.position.x,
    y: token.position.y,
  };
}

// ---------------------------------------------------------------------------
// User campaign CampaignBattleBoard  <->  BattleRuntime
// ---------------------------------------------------------------------------

export function userBoardToUniversal(
  campaignId: CampaignId,
  mapId: string,
  board: CampaignBattleBoard,
  options?: { active?: boolean; presented?: boolean },
): BattleRuntime {
  const battleId = mapId;
  return {
    id: battleRuntimeId(campaignId, battleId),
    campaignId,
    battleMapRef: mapId,
    active: options?.active ?? false,
    board: {
      battleMapRef: mapId,
      variant: board.variant,
      tokens: board.tokens.map((token) => userTokenToUniversal(campaignId, battleId, token)),
      terrain: Object.entries(board.terrain ?? {}).map(([cellKey, type]) => ({ cellKey, type })),
      grid: board.columns != null ? { columns: board.columns, snap: board.snap ?? true } : undefined,
      view: board.view,
      showGrid: board.showGrid,
      showTerrain: board.showTerrain,
    },
    initiative: { round: board.round ?? 1, currentTurnTokenId: userCurrentTurn(campaignId, battleId, board) },
    presentedToPlayers: options?.presented ?? false,
    extensions: {
      [USER_EXT]: { mapId, variant: board.variant },
    },
  };
}

function userCurrentTurn(campaignId: CampaignId, battleId: string, board: CampaignBattleBoard): string | undefined {
  if (!board.currentTurnTokenId) return undefined;
  return battleTokenId(campaignId, battleId, board.currentTurnTokenId);
}

function userTokenToUniversal(
  campaignId: CampaignId,
  battleId: string,
  token: CampaignBattleToken,
): BattleToken {
  return {
    id: battleTokenId(campaignId, battleId, token.id),
    name: token.name,
    side: normalizeSide(token.side),
    position: { x: token.x, y: token.y },
    currentHp: token.currentHp,
    maxHp: token.maxHp,
    ac: token.ac,
    initiative: token.initiative,
    statuses: token.statuses,
    extensions: {
      [USER_EXT]: {
        legacyId: token.id,
        sourceEnemyId: token.sourceEnemyId,
        sourcePlayerId: token.sourcePlayerId,
        imageId: token.imageId,
        speedFeet: token.speedFeet,
      },
    },
  };
}

/** Reverse projection: universal BattleRuntime → legacy CampaignBattleBoard. */
export function universalToUserBoard(runtime: BattleRuntime): CampaignBattleBoard {
  const terrain: Record<string, 'blocked' | 'difficult'> = {};
  for (const cell of runtime.board.terrain ?? []) {
    if (cell.type === 'custom') continue;
    terrain[cell.cellKey] = cell.type;
  }
  return {
    mapId: runtime.battleMapRef,
    variant: runtime.board.variant,
    tokens: runtime.board.tokens.map((token) => universalToUserToken(token)),
    round: runtime.initiative?.round,
    currentTurnTokenId: legacyTokenIdOf(runtime, runtime.initiative?.currentTurnTokenId),
    view: runtime.board.view,
    showGrid: runtime.board.showGrid,
    columns: runtime.board.grid?.columns,
    snap: runtime.board.grid?.snap,
    showTerrain: runtime.board.showTerrain,
    terrain: Object.keys(terrain).length ? terrain : undefined,
  };
}

function universalToUserToken(token: BattleToken): CampaignBattleToken {
  const meta = ext(token.extensions, USER_EXT);
  return {
    id: (meta?.legacyId as string) ?? token.id,
    name: token.name,
    side: token.side,
    sourceEnemyId: meta?.sourceEnemyId as string | undefined,
    sourcePlayerId: meta?.sourcePlayerId as string | undefined,
    imageId: meta?.imageId as string | undefined,
    x: token.position.x,
    y: token.position.y,
    currentHp: token.currentHp,
    maxHp: token.maxHp,
    ac: token.ac,
    initiative: token.initiative,
    speedFeet: meta?.speedFeet as number | undefined,
    statuses: token.statuses,
  };
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function ext(bag: Record<string, unknown> | undefined, key: string): Record<string, unknown> | undefined {
  const value = bag?.[key];
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : undefined;
}

function normalizeSide(side: string): BattleSide {
  return side === 'enemy' || side === 'player' || side === 'ally' || side === 'neutral' ? side : 'neutral';
}

/** Map a universal token id back to the legacy id stored in its extensions. */
function legacyTokenIdOf(runtime: BattleRuntime, universalTokenId: string | undefined): string | undefined {
  if (!universalTokenId) return undefined;
  const token = runtime.board.tokens.find((candidate) => candidate.id === universalTokenId);
  if (!token) return undefined;
  const meta = ext(token.extensions, GREYHOLM_EXT) ?? ext(token.extensions, USER_EXT);
  return (meta?.legacyId as string) ?? undefined;
}

export const BATTLE_EXTENSION_KEYS = { greyholm: GREYHOLM_EXT, user: USER_EXT } as const;
export { DM_ONLY_VISIBILITY };

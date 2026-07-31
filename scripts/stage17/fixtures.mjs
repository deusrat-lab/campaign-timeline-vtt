// Stage 17 fixtures — realistic Greyholm ActiveBattleState and Caldran user
// battle boards (4 boards, 16 tokens, matching the real Caldran anchor).
import { makeCampaignId } from './.dist/domain/index.js';

export const GREYHOLM_ID = makeCampaignId('camp:greyholm:main');
export const CALDRAN_ID = makeCampaignId('camp:user:camp-ms8k0er0-wgwr2');
export const OTHER_UC_ID = makeCampaignId('camp:user:camp-second-uc');

export function greyholmActiveBattle() {
  return {
    id: 'battle-market-square',
    battleMapId: 'bm-market',
    sceneId: 'scene-1',
    locationStateId: 'loc-market',
    title: 'Ambush at the Market',
    variantType: 'day',
    startedAt: '2026-07-31T10:00:00.000Z',
    currentTurnCombatantId: 'cmb-hero',
    round: 2,
    combatants: [
      { id: 'cmb-hero', side: 'player', sourceId: 'pc-1', name: 'Hero', currentHp: 22, maxHp: 30, armorClass: 16, initiative: 18, x: 10, y: 12, row: 1, column: 1, speedFeet: 30 },
      { id: 'cmb-bandit-1', side: 'enemy', sourceId: 'enm-bandit', name: 'Bandit', currentHp: 7, maxHp: 11, armorClass: 12, initiative: 9, x: 20, y: 8, notes: 'flanking' },
      { id: 'cmb-bandit-2', side: 'enemy', sourceId: 'enm-bandit', name: 'Bandit', currentHp: 11, maxHp: 11, armorClass: 12, initiative: 5, x: 24, y: 9 },
    ],
    terrainCells: [
      { row: 0, column: 3, type: 'blocked' },
      { row: 2, column: 4, type: 'difficult' },
    ],
  };
}

function board(mapId, tokens, round = 1) {
  return {
    mapId,
    variant: 'day',
    round,
    currentTurnTokenId: tokens[0]?.id,
    columns: 20,
    snap: true,
    showGrid: true,
    showTerrain: true,
    view: { zoom: 1, panX: 0, panY: 0 },
    terrain: { '3,3': 'blocked', '5,5': 'difficult' },
    tokens,
  };
}

function tok(id, name, side, x, y, extra = {}) {
  return { id, name, side, x, y, currentHp: 10, maxHp: 10, ac: 13, initiative: x, statuses: [], ...extra };
}

// 4 boards, 4 tokens each = 16 tokens total (Caldran anchor).
export function caldranBoards() {
  return {
    'custom-alpha': board('custom-alpha', [
      tok('t-a1', 'Goblin', 'enemy', 5, 5, { sourceEnemyId: 'enm-goblin' }),
      tok('t-a2', 'Goblin', 'enemy', 6, 6, { sourceEnemyId: 'enm-goblin' }),
      tok('t-a3', 'Rogue', 'player', 7, 7, { sourcePlayerId: 'pl-1' }),
      tok('t-a4', 'Wolf', 'enemy', 8, 8, { sourceEnemyId: 'enm-wolf' }),
    ]),
    'custom-beta': board('custom-beta', [
      tok('t-b1', 'Cleric', 'player', 3, 3, { sourcePlayerId: 'pl-2' }),
      tok('t-b2', 'Skeleton', 'enemy', 4, 4, { sourceEnemyId: 'enm-skel' }),
      tok('t-b3', 'Skeleton', 'enemy', 5, 4, { sourceEnemyId: 'enm-skel' }),
      tok('t-b4', 'Ally NPC', 'ally', 6, 3),
    ]),
    'shared-forest': board('shared-forest', [
      tok('t-c1', 'Bear', 'enemy', 9, 2, { sourceEnemyId: 'enm-bear' }),
      tok('t-c2', 'Ranger', 'player', 2, 9, { sourcePlayerId: 'pl-3' }),
      tok('t-c3', 'Spider', 'enemy', 3, 8, { sourceEnemyId: 'enm-spider' }),
      tok('t-c4', 'Spider', 'enemy', 4, 8, { sourceEnemyId: 'enm-spider' }),
    ]),
    'shared-crypt': board('shared-crypt', [
      tok('t-d1', 'Wraith', 'enemy', 1, 1, { sourceEnemyId: 'enm-wraith' }),
      tok('t-d2', 'Fighter', 'player', 2, 2, { sourcePlayerId: 'pl-4' }),
      tok('t-d3', 'Zombie', 'enemy', 3, 3, { sourceEnemyId: 'enm-zombie' }),
      tok('t-d4', 'Zombie', 'enemy', 4, 4, { sourceEnemyId: 'enm-zombie' }),
    ]),
  };
}

export function totalTokens(boards) {
  return Object.values(boards).reduce((sum, b) => sum + b.tokens.length, 0);
}

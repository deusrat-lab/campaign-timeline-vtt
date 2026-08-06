// Stage 17 — universal battle contract, adapters, identity, commands, invariants.
import {
  greyholmBattleToUniversal, universalToGreyholmBattle,
  userBoardToUniversal, universalToUserBoard,
  executeBattleCommand, checkInvariants,
  battleRuntimeId, battleTokenId, resolveToken, findDuplicateTokenIds,
  allBattleCommandKinds,
} from './.dist/domain/index.js';
import { Checks, stableEqual } from '../stage08/lib.mjs';
import {
  GREYHOLM_ID, CALDRAN_ID, OTHER_UC_ID,
  greyholmActiveBattle, caldranBoards, totalTokens,
} from './fixtures.mjs';

export function runBattles(c = new Checks()) {
const clone = (v) => JSON.parse(JSON.stringify(v));

// --- Greyholm adapter round-trip -------------------------------------------
{
  const active = greyholmActiveBattle();
  const universal = greyholmBattleToUniversal(GREYHOLM_ID, active);
  c.eq('greyholm: runtime scoped to campaign', universal.campaignId, GREYHOLM_ID);
  c.eq('greyholm: battleMapRef preserved', universal.battleMapRef, 'bm-market');
  c.eq('greyholm: token count preserved', universal.board.tokens.length, 3);
  c.eq('greyholm: round preserved', universal.initiative.round, 2);
  c.ok('greyholm: current turn maps to a real token',
    universal.board.tokens.some((t) => t.id === universal.initiative.currentTurnTokenId));
  c.eq('greyholm: terrain preserved', universal.board.terrain.length, 2);
  const back = universalToGreyholmBattle(universal);
  c.ok('greyholm: round-trip is lossless', stableEqual(back, active), JSON.stringify(back));
}

// --- Caldran adapter round-trip + anchors -----------------------------------
{
  const boards = caldranBoards();
  c.eq('caldran anchor: 4 battle boards', Object.keys(boards).length, 4);
  c.eq('caldran anchor: 16 battle tokens', totalTokens(boards), 16);
  for (const [mapId, board] of Object.entries(boards)) {
    const universal = userBoardToUniversal(CALDRAN_ID, mapId, board, { active: false });
    c.eq(`caldran ${mapId}: scoped to caldran`, universal.campaignId, CALDRAN_ID);
    c.eq(`caldran ${mapId}: token count`, universal.board.tokens.length, board.tokens.length);
    const back = universalToUserBoard(universal);
    c.ok(`caldran ${mapId}: round-trip lossless`, stableEqual(back, board), JSON.stringify(back));
  }
}

// --- Identity: cross-campaign isolation, no first-match ----------------------
{
  // Same *battleId* in two campaigns must yield two distinct universal ids.
  const gId = battleRuntimeId(GREYHOLM_ID, 'shared-forest');
  const cId = battleRuntimeId(CALDRAN_ID, 'shared-forest');
  const oId = battleRuntimeId(OTHER_UC_ID, 'shared-forest');
  c.ok('identity: greyholm vs caldran battle ids differ', gId !== cId);
  c.ok('identity: caldran vs other-uc battle ids differ', cId !== oId);
  c.ok('identity: ids are deterministic', battleRuntimeId(CALDRAN_ID, 'shared-forest') === cId);

  // Same source token id in two campaigns is isolated.
  const gTok = battleTokenId(GREYHOLM_ID, 'b', 't-1');
  const cTok = battleTokenId(CALDRAN_ID, 'b', 't-1');
  c.ok('identity: token ids isolated across campaigns', gTok !== cTok);

  const universal = userBoardToUniversal(CALDRAN_ID, 'custom-alpha', caldranBoards()['custom-alpha']);
  const first = universal.board.tokens[0];
  const r = resolveToken(universal, first.id);
  c.ok('identity: exact token resolve', 'token' in r && r.token.id === first.id);
  const missing = resolveToken(universal, 'nope');
  c.ok('identity: missing token rejected', 'error' in missing && missing.error.code === 'unknown-token');

  const dup = clone(universal);
  dup.board.tokens.push(clone(dup.board.tokens[0]));
  c.eq('identity: duplicate token detected', findDuplicateTokenIds(dup.board.tokens).length, 1);
  const amb = resolveToken(dup, first.id);
  c.ok('identity: ambiguous token rejected (no first-match)', 'error' in amb && amb.error.code === 'ambiguous-token');
}

// --- Commands: authority contract -------------------------------------------
function base() {
  const u = userBoardToUniversal(CALDRAN_ID, 'custom-alpha', caldranBoards()['custom-alpha'], { active: true });
  u.revision = 0;
  return u;
}

{
  // command kind allowlist is closed and complete
  // Decision 2 cutover-prep: added set-variant/set-grid/paint-terrain/clear-terrain
  // (board-presentation commands the legacy Caldran patchBoard call sites need
  // a typed home for before their writes can route through universal authority).
  c.eq('commands: 15 typed kinds', allBattleCommandKinds().length, 15);

  // expected-revision guard
  const stale = executeBattleCommand(base(), { kind: 'start-battle', campaignId: CALDRAN_ID, battleId: 'custom-alpha', expectedRevision: 5 });
  c.ok('commands: stale revision rejected', !stale.ok && stale.error.code === 'revision-conflict');

  // campaign mismatch rejected
  const wrong = executeBattleCommand(base(), { kind: 'start-battle', campaignId: GREYHOLM_ID, battleId: 'custom-alpha', expectedRevision: 0 });
  c.ok('commands: cross-campaign command rejected', !wrong.ok && wrong.error.code === 'campaign-mismatch');

  // one commit → exactly one revision bump
  const started = executeBattleCommand(base(), { kind: 'start-battle', campaignId: CALDRAN_ID, battleId: 'custom-alpha', expectedRevision: 0 });
  c.ok('commands: start ok', started.ok && started.next.active === true);
  c.eq('commands: revision bumped by one', started.newRevision, 1);

  // move token
  const b = base();
  const tid = b.board.tokens[0].id;
  const moved = executeBattleCommand(b, { kind: 'move-token', campaignId: CALDRAN_ID, battleId: 'custom-alpha', tokenId: tid, position: { x: 99, y: 1 }, expectedRevision: 0 });
  c.ok('commands: move ok', moved.ok && moved.next.board.tokens.find((t) => t.id === tid).position.x === 99);
  c.ok('commands: original unchanged (immutability)', b.board.tokens[0].position.x !== 99);

  // remove token clears current turn if it was the current
  const b2 = base();
  const curr = b2.initiative.currentTurnTokenId;
  const removed = executeBattleCommand(b2, { kind: 'remove-token', campaignId: CALDRAN_ID, battleId: 'custom-alpha', tokenId: curr, expectedRevision: 0 });
  c.ok('commands: remove ok', removed.ok && removed.next.board.tokens.length === 3);
  c.ok('commands: removed current-turn cleared', removed.ok && removed.next.initiative.currentTurnTokenId === undefined);

  // remove unknown token rejected
  const badRemove = executeBattleCommand(base(), { kind: 'remove-token', campaignId: CALDRAN_ID, battleId: 'custom-alpha', tokenId: 'ghost', expectedRevision: 0 });
  c.ok('commands: remove unknown rejected', !badRemove.ok && badRemove.error.code === 'unknown-token');

  // set-initiative with unknown token rejected
  const badInit = executeBattleCommand(base(), { kind: 'set-initiative', campaignId: CALDRAN_ID, battleId: 'custom-alpha', order: ['ghost'], round: 1, expectedRevision: 0 });
  c.ok('commands: set-initiative unknown rejected', !badInit.ok && badInit.error.code === 'unknown-token');

  // advance-turn cycles and bumps round on wrap
  let rt = base();
  const order = [...rt.board.tokens].sort((a, z) => (z.initiative ?? -1) - (a.initiative ?? -1)).map((t) => t.id);
  let rev = 0;
  for (let i = 0; i < order.length; i += 1) {
    const res = executeBattleCommand(rt, { kind: 'advance-turn', campaignId: CALDRAN_ID, battleId: 'custom-alpha', expectedRevision: rev });
    c.ok(`commands: advance-turn step ${i} ok`, res.ok);
    rt = res.next; rev = res.newRevision;
  }
  c.ok('commands: full turn cycle advanced the round', rt.initiative.round === 2);

  // advance-turn on inactive battle rejected
  const inactive = base(); inactive.active = false;
  const at = executeBattleCommand(inactive, { kind: 'advance-turn', campaignId: CALDRAN_ID, battleId: 'custom-alpha', expectedRevision: 0 });
  c.ok('commands: advance-turn requires active', !at.ok && at.error.code === 'not-active');

  // set-runtime hp
  const sr = executeBattleCommand(base(), { kind: 'set-runtime', campaignId: CALDRAN_ID, battleId: 'custom-alpha', tokenId: tid, patch: { currentHp: 3 }, expectedRevision: 0 });
  c.ok('commands: set-runtime hp applied', sr.ok && sr.next.board.tokens.find((t) => t.id === tid).currentHp === 3);

  // set-visibility
  const vis = executeBattleCommand(base(), { kind: 'set-visibility', campaignId: CALDRAN_ID, battleId: 'custom-alpha', presented: true, expectedRevision: 0 });
  c.ok('commands: visibility set', vis.ok && vis.next.presentedToPlayers === true);
  const end = executeBattleCommand(vis.next, { kind: 'end-battle', campaignId: CALDRAN_ID, battleId: 'custom-alpha', expectedRevision: 1 });
  c.ok('commands: end clears presentation', end.ok && end.next.active === false && end.next.presentedToPlayers === false);

  // set-runtime name/extensions (Decision 2 prep: needed to route Caldran's
  // token rename / speedFeet edit through universal instead of raw patchBoard)
  const rn = executeBattleCommand(base(), { kind: 'set-runtime', campaignId: CALDRAN_ID, battleId: 'custom-alpha', tokenId: tid, patch: { name: 'Ренамед', extensions: { speedFeet: 40 } }, expectedRevision: 0 });
  c.ok('commands: set-runtime name applied', rn.ok && rn.next.board.tokens.find((t) => t.id === tid).name === 'Ренамед');
  c.ok('commands: set-runtime extensions merged', rn.ok && rn.next.board.tokens.find((t) => t.id === tid).extensions?.speedFeet === 40);

  // set-variant (day/night)
  const sv = executeBattleCommand(base(), { kind: 'set-variant', campaignId: CALDRAN_ID, battleId: 'custom-alpha', variant: 'night', expectedRevision: 0 });
  c.ok('commands: set-variant applied', sv.ok && sv.next.board.variant === 'night');

  // set-grid (partial patch preserves existing fields)
  const g1 = executeBattleCommand(base(), { kind: 'set-grid', campaignId: CALDRAN_ID, battleId: 'custom-alpha', grid: { columns: 30, snap: false }, expectedRevision: 0 });
  c.ok('commands: set-grid applied', g1.ok && g1.next.board.grid.columns === 30 && g1.next.board.grid.snap === false);
  const g2 = executeBattleCommand(g1.next, { kind: 'set-grid', campaignId: CALDRAN_ID, battleId: 'custom-alpha', grid: { snap: true }, expectedRevision: g1.newRevision });
  c.ok('commands: set-grid partial patch preserves columns', g2.ok && g2.next.board.grid.columns === 30 && g2.next.board.grid.snap === true);

  // paint-terrain / clear-terrain
  const pt = executeBattleCommand(base(), { kind: 'paint-terrain', campaignId: CALDRAN_ID, battleId: 'custom-alpha', cellKey: '3,4', type: 'blocked', expectedRevision: 0 });
  c.ok('commands: paint-terrain adds cell', pt.ok && pt.next.board.terrain.some((cell) => cell.cellKey === '3,4' && cell.type === 'blocked'));
  const pt2 = executeBattleCommand(pt.next, { kind: 'paint-terrain', campaignId: CALDRAN_ID, battleId: 'custom-alpha', cellKey: '3,4', type: 'difficult', expectedRevision: pt.newRevision });
  c.ok('commands: paint-terrain overwrites same cell (no duplicate)', pt2.ok && pt2.next.board.terrain.filter((cell) => cell.cellKey === '3,4').length === 1 && pt2.next.board.terrain.find((cell) => cell.cellKey === '3,4').type === 'difficult');
  const pt3 = executeBattleCommand(pt2.next, { kind: 'paint-terrain', campaignId: CALDRAN_ID, battleId: 'custom-alpha', cellKey: '3,4', type: null, expectedRevision: pt2.newRevision });
  c.ok('commands: paint-terrain erase (type null) removes cell', pt3.ok && !pt3.next.board.terrain.some((cell) => cell.cellKey === '3,4'));
  const ct = executeBattleCommand(pt.next, { kind: 'clear-terrain', campaignId: CALDRAN_ID, battleId: 'custom-alpha', expectedRevision: pt.newRevision });
  c.ok('commands: clear-terrain empties board', ct.ok && ct.next.board.terrain.length === 0);
}

// --- Invariants -------------------------------------------------------------
{
  const dup = base();
  dup.board.tokens.push(clone(dup.board.tokens[0]));
  c.ok('invariant: duplicate token id', checkInvariants(dup)?.code === 'invariant');

  const nan = base();
  nan.board.tokens[0].position.x = Number.POSITIVE_INFINITY;
  c.ok('invariant: non-finite position', checkInvariants(nan)?.code === 'invariant');

  const hp = base();
  hp.board.tokens[0].currentHp = 999;
  c.ok('invariant: hp exceeds max', checkInvariants(hp)?.code === 'invariant');

  const round = base();
  round.initiative.round = 0;
  c.ok('invariant: round must be positive', checkInvariants(round)?.code === 'invariant');

  const stale = base();
  stale.initiative.currentTurnTokenId = 'removed-ghost';
  c.ok('invariant: current turn must exist', checkInvariants(stale)?.code === 'invariant');

  c.ok('invariant: healthy battle passes', checkInvariants(base()) === null);

  // a command that would violate an invariant is rejected (place duplicate)
  const bad = executeBattleCommand(base(), {
    kind: 'place-token', campaignId: CALDRAN_ID, battleId: 'custom-alpha',
    token: clone(base().board.tokens[0]), expectedRevision: 0,
  });
  c.ok('invariant: command producing duplicate token rejected', !bad.ok && bad.error.code === 'invariant');
}

  return c;
}

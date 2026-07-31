// Stage 17 — durable battle authority (the real UI move path routes through this).
import {
  createMemoryRepositoryStorage,
  routeUserTokenMove, routeSetTurn, commitBattle, readStoredBattle, battleRevision,
  recordPendingProjection, readPendingProjection, clearPendingProjection, pendingProjectionCount,
  listBattleRecords, totalPendingCount,
  userBoardToUniversal, greyholmBattleToUniversal, executeBattleCommand,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';
import { CALDRAN_ID, OTHER_UC_ID, GREYHOLM_ID, caldranBoards, greyholmActiveBattle } from './fixtures.mjs';

export function runBattleAuthority(c = new Checks()) {
  const boards = caldranBoards();
  const board = boards['custom-alpha'];
  const tokenId = board.tokens[0].id; // 't-a1'

  // --- first move seeds + durably commits (rev 0 -> 1) ---
  {
    const storage = createMemoryRepositoryStorage();
    c.eq('authority: initial revision 0', battleRevision(storage, CALDRAN_ID, 'custom-alpha'), 0);
    const out = routeUserTokenMove(storage, CALDRAN_ID, 'custom-alpha', board, tokenId, { x: 90, y: 10 });
    c.ok('authority: first move ok', out.ok);
    c.eq('authority: revision bumped to 1', out.newRevision, 1);
    c.eq('authority: durable revision persisted', battleRevision(storage, CALDRAN_ID, 'custom-alpha'), 1);
    const moved = out.compatBoard.tokens.find((t) => t.id === tokenId);
    c.ok('authority: compat board carries moved token at new pos', moved && moved.x === 90 && moved.y === 10);
    c.ok('authority: compat board preserves legacy token id', !!moved);
    c.eq('authority: token count preserved', out.compatBoard.tokens.length, board.tokens.length);
  }

  // --- second move honors expected revision (1 -> 2), no first-move re-seed ---
  {
    const storage = createMemoryRepositoryStorage();
    routeUserTokenMove(storage, CALDRAN_ID, 'custom-alpha', board, tokenId, { x: 50, y: 50 });
    const out2 = routeUserTokenMove(storage, CALDRAN_ID, 'custom-alpha', board, tokenId, { x: 12, y: 34 });
    c.eq('authority: second move revision 2', out2.newRevision, 2);
    const stored = readStoredBattle(storage, CALDRAN_ID, 'custom-alpha');
    const t = stored.runtime.board.tokens.find((tk) => tk.extensions['legacy:user-board']?.legacyId === tokenId);
    c.ok('authority: durable runtime reflects last move', t && t.position.x === 12 && t.position.y === 34);
  }

  // --- exactly one revision per logical move (no double commit) ---
  {
    const storage = createMemoryRepositoryStorage();
    for (let i = 1; i <= 5; i += 1) {
      const out = routeUserTokenMove(storage, CALDRAN_ID, 'custom-alpha', board, tokenId, { x: i, y: i });
      c.eq(`authority: move ${i} -> revision ${i}`, out.newRevision, i);
    }
  }

  // --- unknown token rejected, no durable write ---
  {
    const storage = createMemoryRepositoryStorage();
    const out = routeUserTokenMove(storage, CALDRAN_ID, 'custom-alpha', board, 'ghost-token', { x: 1, y: 1 });
    c.ok('authority: unknown token rejected', !out.ok);
    c.eq('authority: no durable write on rejection', battleRevision(storage, CALDRAN_ID, 'custom-alpha'), 0);
  }

  // --- commitBattle expected-revision conflict ---
  {
    const storage = createMemoryRepositoryStorage();
    const runtime = userBoardToUniversal(CALDRAN_ID, 'custom-alpha', board, { active: true });
    runtime.revision = 0;
    const first = commitBattle(storage, CALDRAN_ID, 'custom-alpha', runtime, 0);
    c.ok('authority: commit ok', first.ok && first.newRevision === 1);
    const stale = commitBattle(storage, CALDRAN_ID, 'custom-alpha', runtime, 0);
    c.ok('authority: stale commit is conflict', !stale.ok && stale.code === 'conflict');
    c.eq('authority: conflict reports current revision', stale.currentRevision, 1);
  }

  // --- campaign isolation: same battleId, two campaigns ---
  {
    const storage = createMemoryRepositoryStorage();
    routeUserTokenMove(storage, CALDRAN_ID, 'custom-alpha', board, tokenId, { x: 1, y: 1 });
    routeUserTokenMove(storage, OTHER_UC_ID, 'custom-alpha', board, tokenId, { x: 2, y: 2 });
    c.eq('authority: caldran isolated revision', battleRevision(storage, CALDRAN_ID, 'custom-alpha'), 1);
    c.eq('authority: other-uc isolated revision', battleRevision(storage, OTHER_UC_ID, 'custom-alpha'), 1);
    const a = readStoredBattle(storage, CALDRAN_ID, 'custom-alpha');
    const b = readStoredBattle(storage, OTHER_UC_ID, 'custom-alpha');
    c.ok('authority: distinct campaign runtimes', a.runtime.campaignId !== b.runtime.campaignId);
  }

  // --- Greyholm turn advance via routeSetTurn (single ActiveBattleState) ---
  {
    const storage = createMemoryRepositoryStorage();
    const active = greyholmActiveBattle(); // combatants: cmb-hero, cmb-bandit-1, cmb-bandit-2
    const seed = () => greyholmBattleToUniversal(GREYHOLM_ID, active);
    // advance turn to bandit-1, round stays 2
    const r1 = routeSetTurn(storage, GREYHOLM_ID, active.id, seed(), 'cmb-bandit-1', 2);
    c.ok('greyholm turn: first advance ok', r1.ok);
    c.eq('greyholm turn: revision 1', r1.newRevision, 1);
    const stored1 = readStoredBattle(storage, GREYHOLM_ID, active.id);
    const cur1 = stored1.runtime.initiative.currentTurnTokenId;
    const bandit1Universal = stored1.runtime.board.tokens.find((t) => t.extensions['legacy:greyholm-active']?.legacyId === 'cmb-bandit-1');
    c.ok('greyholm turn: current turn set to bandit-1 (universal id)', cur1 === bandit1Universal.id);

    // advance again to bandit-2, round 2 -> then wrap to hero round 3
    const r2 = routeSetTurn(storage, GREYHOLM_ID, active.id, seed(), 'cmb-bandit-2', 2);
    c.eq('greyholm turn: revision 2', r2.newRevision, 2);
    const r3 = routeSetTurn(storage, GREYHOLM_ID, active.id, seed(), 'cmb-hero', 3);
    c.eq('greyholm turn: revision 3', r3.newRevision, 3);
    c.eq('greyholm turn: round advanced to 3', readStoredBattle(storage, GREYHOLM_ID, active.id).runtime.initiative.round, 3);

    // set-turn to unknown combatant rejected, no durable write
    const bad = routeSetTurn(storage, GREYHOLM_ID, active.id, seed(), 'ghost', 3);
    c.ok('greyholm turn: unknown combatant rejected', !bad.ok);
    c.eq('greyholm turn: revision unchanged after rejection', battleRevision(storage, GREYHOLM_ID, active.id), 3);

    // isolation: same battle id would-be, but Greyholm scoped distinctly from Caldran
    c.ok('greyholm turn: campaign-scoped record', readStoredBattle(storage, GREYHOLM_ID, active.id).runtime.campaignId === GREYHOLM_ID);
    c.ok('greyholm turn: caldran unaffected', readStoredBattle(storage, CALDRAN_ID, active.id) === null);
  }

  // --- set-turn command semantics ---
  {
    const rt = greyholmBattleToUniversal(GREYHOLM_ID, greyholmActiveBattle());
    rt.revision = 0;
    const tokenId = rt.board.tokens[1].id;
    const res = executeBattleCommand(rt, { kind: 'set-turn', campaignId: GREYHOLM_ID, battleId: rt.battleMapRef, currentTurnTokenId: tokenId, round: 5, expectedRevision: 0 });
    c.ok('set-turn: applies round + current token', res.ok && res.next.initiative.round === 5 && res.next.initiative.currentTurnTokenId === tokenId);
  }

  // --- live diagnostics enumeration (listBattleRecords) ---
  {
    const storage = createMemoryRepositoryStorage();
    routeUserTokenMove(storage, CALDRAN_ID, 'custom-alpha', board, tokenId, { x: 1, y: 1 });
    routeUserTokenMove(storage, OTHER_UC_ID, 'custom-beta', boards['custom-beta'], boards['custom-beta'].tokens[0].id, { x: 2, y: 2 });
    const active = greyholmActiveBattle();
    routeSetTurn(storage, GREYHOLM_ID, active.id, greyholmBattleToUniversal(GREYHOLM_ID, active), 'cmb-bandit-1', 2);
    const records = listBattleRecords(storage);
    c.eq('diagnostics: 3 durable battle records', records.length, 3);
    c.ok('diagnostics: records campaign-scoped + distinct', new Set(records.map((r) => r.campaignId)).size === 3);
    c.ok('diagnostics: each record carries revision + hash', records.every((r) => r.revision >= 1 && !!r.hash));
    c.ok('diagnostics: distinct hashes per record', new Set(records.map((r) => r.hash)).size === 3);
    c.eq('diagnostics: no pending across campaigns', totalPendingCount(storage), 0);
    recordPendingProjection(storage, { campaignId: CALDRAN_ID, battleId: 'custom-alpha', tokenId, position: { x: 1, y: 1 }, committedRevision: 1 });
    c.eq('diagnostics: total pending reflects records', totalPendingCount(storage), 1);
  }

  // --- pending recovery lifecycle ---
  {
    const storage = createMemoryRepositoryStorage();
    routeUserTokenMove(storage, CALDRAN_ID, 'custom-alpha', board, tokenId, { x: 7, y: 7 });
    c.eq('authority: no pending initially', pendingProjectionCount(storage, CALDRAN_ID), 0);
    recordPendingProjection(storage, { campaignId: CALDRAN_ID, battleId: 'custom-alpha', tokenId, position: { x: 7, y: 7 }, committedRevision: 1 });
    c.eq('authority: pending recorded', pendingProjectionCount(storage, CALDRAN_ID), 1);
    const pending = readPendingProjection(storage, CALDRAN_ID, 'custom-alpha');
    c.ok('authority: pending readable + campaign-scoped', pending && pending.tokenId === tokenId && pending.committedRevision === 1);
    const revBefore = battleRevision(storage, CALDRAN_ID, 'custom-alpha');
    clearPendingProjection(storage, CALDRAN_ID, 'custom-alpha');
    c.eq('authority: pending cleared', pendingProjectionCount(storage, CALDRAN_ID), 0);
    c.eq('authority: recovery did not re-commit universal', battleRevision(storage, CALDRAN_ID, 'custom-alpha'), revBefore);
  }

  return c;
}

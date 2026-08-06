// Stage 17 — durable battle authority (the real UI move path routes through this).
import {
  createMemoryRepositoryStorage,
  routeUserTokenMove, routeSetTurn, commitBattle, readStoredBattle, battleRevision,
  recordPendingProjection, readPendingProjection, clearPendingProjection, pendingProjectionCount,
  listBattleRecords, totalPendingCount,
  userBoardToUniversal, greyholmBattleToUniversal, executeBattleCommand,
  commitUserBoard, readUserBoard,
  commitGreyholmBattle, readGreyholmBattle,
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

  // --- Decision 2: whole-board sole-authority commit (CampaignBattlePage.tsx's
  // real `patchBoard` write path -- one commit per user gesture, covering
  // multi-field mutations a single typed command can't express in one call:
  // place-a-token-and-set-current-turn, roll-all-initiative-and-select-first,
  // finish-battle-clears-tokens-round-and-turn, etc.) ---
  {
    const storage = createMemoryRepositoryStorage();

    // reload/bootstrap: nothing committed yet -> null (caller falls back to legacy seed)
    c.ok('board-commit: readUserBoard null before any commit', readUserBoard(storage, CALDRAN_ID, 'custom-alpha') === null);

    // token placement + auto-select-as-current-turn in ONE commit (mirrors the
    // real onPointerUp placement call site: tokens + currentTurnTokenId together)
    const withNewToken = {
      ...board,
      tokens: [...board.tokens, { id: 'tok-new-1', name: 'Новый враг', side: 'enemy', x: 40, y: 60, ac: 12, currentHp: 9, maxHp: 9 }],
      currentTurnTokenId: board.currentTurnTokenId ?? 'tok-new-1',
    };
    const r1 = commitUserBoard(storage, CALDRAN_ID, 'custom-alpha', withNewToken);
    c.ok('board-commit: place+set-turn combined mutation ok', r1.ok);
    c.eq('board-commit: revision 1', r1.newRevision, 1);
    c.eq('board-commit: token count +1', r1.compatBoard.tokens.length, board.tokens.length + 1);
    c.ok('board-commit: new token present with correct fields', r1.compatBoard.tokens.some((t) => t.id === 'tok-new-1' && t.name === 'Новый враг' && t.x === 40 && t.y === 60));

    // reload/bootstrap now sees the durable commit
    const reloaded = readUserBoard(storage, CALDRAN_ID, 'custom-alpha');
    c.ok('board-commit: readUserBoard recovers exact committed board', reloaded && reloaded.tokens.length === board.tokens.length + 1);

    // roll-all-initiative + select-first in ONE commit (every token's initiative
    // changes together with currentTurnTokenId -- exactly rollAllInitiative())
    const rolled = {
      ...reloaded,
      tokens: reloaded.tokens.map((t, i) => ({ ...t, initiative: 20 - i })),
      currentTurnTokenId: reloaded.tokens[0].id,
    };
    const r2 = commitUserBoard(storage, CALDRAN_ID, 'custom-alpha', rolled);
    c.ok('board-commit: roll-all-initiative combined mutation ok', r2.ok);
    c.eq('board-commit: revision 2', r2.newRevision, 2);
    c.ok('board-commit: initiative values persisted', r2.compatBoard.tokens.every((t) => typeof t.initiative === 'number'));

    // terrain paint + grid + variant in ONE commit (Slice A4 board-configuration fields)
    const configured = { ...r2.compatBoard, terrain: { '3,4': 'blocked', '5,5': 'difficult' }, columns: 30, snap: false, variant: 'night' };
    const r3 = commitUserBoard(storage, CALDRAN_ID, 'custom-alpha', configured);
    c.ok('board-commit: terrain+grid+variant combined mutation ok', r3.ok);
    c.eq('board-commit: terrain cell count', Object.keys(r3.compatBoard.terrain ?? {}).length, 2);
    c.eq('board-commit: grid columns persisted', r3.compatBoard.columns, 30);
    c.eq('board-commit: variant persisted', r3.compatBoard.variant, 'night');

    // finish battle: clears tokens/round/turn in ONE commit (finishBattle())
    const finished = { ...r3.compatBoard, tokens: [], round: 1, currentTurnTokenId: undefined };
    const r4 = commitUserBoard(storage, CALDRAN_ID, 'custom-alpha', finished);
    c.ok('board-commit: finish-battle combined mutation ok', r4.ok);
    c.eq('board-commit: tokens cleared', r4.compatBoard.tokens.length, 0);
    c.eq('board-commit: round reset', r4.compatBoard.round, 1);
    c.ok('board-commit: current turn cleared', !r4.compatBoard.currentTurnTokenId);
    // terrain/grid explicitly survive finish (task requirement: "террейн и сетка останутся")
    c.eq('board-commit: terrain survives finish', Object.keys(r4.compatBoard.terrain ?? {}).length, 2);
    c.eq('board-commit: grid survives finish', r4.compatBoard.columns, 30);

    c.eq('board-commit: exactly 4 revisions for 4 user gestures (no duplicate writes)', battleRevision(storage, CALDRAN_ID, 'custom-alpha'), 4);
  }

  // --- Decision 2: invariant rejection leaves nothing persisted (no partial write) ---
  {
    const storage = createMemoryRepositoryStorage();
    const dup = { ...board, tokens: [...board.tokens, { ...board.tokens[0] }] }; // duplicate id
    const bad = commitUserBoard(storage, CALDRAN_ID, 'custom-alpha', dup);
    c.ok('board-commit: duplicate token id rejected', !bad.ok);
    c.eq('board-commit: no durable write on invariant rejection', battleRevision(storage, CALDRAN_ID, 'custom-alpha'), 0);
    c.ok('board-commit: readUserBoard still null after rejection', readUserBoard(storage, CALDRAN_ID, 'custom-alpha') === null);

    const nonFinite = { ...board, tokens: board.tokens.map((t, i) => (i === 0 ? { ...t, x: Number.POSITIVE_INFINITY } : t)) };
    const bad2 = commitUserBoard(storage, CALDRAN_ID, 'custom-alpha', nonFinite);
    c.ok('board-commit: non-finite position rejected', !bad2.ok);

    const overHp = { ...board, tokens: board.tokens.map((t, i) => (i === 0 ? { ...t, currentHp: 999, maxHp: 10 } : t)) };
    const bad3 = commitUserBoard(storage, CALDRAN_ID, 'custom-alpha', overHp);
    c.ok('board-commit: hp > maxHp rejected', !bad3.ok);
  }

  // --- Decision 2: campaign isolation for whole-board commits ---
  {
    const storage = createMemoryRepositoryStorage();
    commitUserBoard(storage, CALDRAN_ID, 'custom-alpha', { ...board, round: 5 });
    commitUserBoard(storage, OTHER_UC_ID, 'custom-alpha', { ...board, round: 9 });
    c.eq('board-commit: caldran round isolated', readUserBoard(storage, CALDRAN_ID, 'custom-alpha').round, 5);
    c.eq('board-commit: other-uc round isolated', readUserBoard(storage, OTHER_UC_ID, 'custom-alpha').round, 9);
  }

  // --- Decision 2: Greyholm whole-battle sole-authority commit (the real UI's
  // startActiveBattle/updateActiveBattle/updateActiveBattleCombatant/
  // addActiveBattleCombatant now route through this instead of dispatching
  // straight to the reducer) ---
  {
    const storage = createMemoryRepositoryStorage();
    const active = greyholmActiveBattle();

    c.ok('greyholm board-commit: readGreyholmBattle null before any commit', readGreyholmBattle(storage, GREYHOLM_ID, active.id) === null);

    // startActiveBattle
    const r1 = commitGreyholmBattle(storage, GREYHOLM_ID, active);
    c.ok('greyholm board-commit: start ok', r1.ok);
    c.eq('greyholm board-commit: revision 1', r1.newRevision, 1);
    c.eq('greyholm board-commit: combatant count preserved', r1.compatBattle.combatants.length, 3);
    c.ok('greyholm board-commit: readGreyholmBattle recovers exact committed battle', readGreyholmBattle(storage, GREYHOLM_ID, active.id).combatants.length === 3);

    // updateActiveBattle (round + currentTurnCombatantId together, mirrors "Следующий ход")
    const advanced = { ...r1.compatBattle, currentTurnCombatantId: 'cmb-bandit-1', round: 3 };
    const r2 = commitGreyholmBattle(storage, GREYHOLM_ID, advanced);
    c.ok('greyholm board-commit: turn+round combined mutation ok', r2.ok);
    c.eq('greyholm board-commit: revision 2', r2.newRevision, 2);
    c.eq('greyholm board-commit: round persisted', r2.compatBattle.round, 3);
    c.eq('greyholm board-commit: current turn persisted', r2.compatBattle.currentTurnCombatantId, 'cmb-bandit-1');

    // updateActiveBattleCombatant (hp change on one combatant, others untouched)
    const hpPatched = {
      ...r2.compatBattle,
      combatants: r2.compatBattle.combatants.map((cb) => (cb.id === 'cmb-bandit-1' ? { ...cb, currentHp: 2 } : cb)),
    };
    const r3 = commitGreyholmBattle(storage, GREYHOLM_ID, hpPatched);
    c.ok('greyholm board-commit: combatant hp update ok', r3.ok);
    c.eq('greyholm board-commit: hp persisted', r3.compatBattle.combatants.find((cb) => cb.id === 'cmb-bandit-1').currentHp, 2);
    c.eq('greyholm board-commit: other combatant hp untouched', r3.compatBattle.combatants.find((cb) => cb.id === 'cmb-hero').currentHp, 22);

    // addActiveBattleCombatant
    const withNew = {
      ...r3.compatBattle,
      combatants: [...r3.compatBattle.combatants, { id: 'cmb-bandit-3', side: 'enemy', sourceId: 'enm-bandit', name: 'Bandit', currentHp: 11, maxHp: 11, armorClass: 12, x: 30, y: 10 }],
    };
    const r4 = commitGreyholmBattle(storage, GREYHOLM_ID, withNew);
    c.ok('greyholm board-commit: add combatant ok', r4.ok);
    c.eq('greyholm board-commit: combatant count +1', r4.compatBattle.combatants.length, 4);

    c.eq('greyholm board-commit: exactly 4 revisions for 4 user gestures', battleRevision(storage, GREYHOLM_ID, active.id), 4);

    // reload/bootstrap recovery
    const reloaded = readGreyholmBattle(storage, GREYHOLM_ID, active.id);
    c.eq('greyholm board-commit: reload recovers combatant count', reloaded.combatants.length, 4);
    c.eq('greyholm board-commit: reload recovers round', reloaded.round, 3);
    c.eq('greyholm board-commit: reload recovers current turn', reloaded.currentTurnCombatantId, 'cmb-bandit-1');

    // invariant rejection: duplicate combatant id -> nothing persisted
    const dup = { ...r4.compatBattle, combatants: [...r4.compatBattle.combatants, { ...r4.compatBattle.combatants[0] }] };
    const bad = commitGreyholmBattle(storage, GREYHOLM_ID, dup);
    c.ok('greyholm board-commit: duplicate combatant id rejected', !bad.ok);
    c.eq('greyholm board-commit: no durable write on rejection', battleRevision(storage, GREYHOLM_ID, active.id), 4);

    // campaign isolation
    const otherActive = { ...active, id: 'battle-other', combatants: [active.combatants[0]] };
    commitGreyholmBattle(storage, CALDRAN_ID, otherActive);
    c.eq('greyholm board-commit: greyholm battle unaffected by caldran-scoped commit of a different battle id', battleRevision(storage, GREYHOLM_ID, active.id), 4);
    c.ok('greyholm board-commit: distinct campaign record isolated', readGreyholmBattle(storage, CALDRAN_ID, 'battle-other') !== null);
  }

  return c;
}

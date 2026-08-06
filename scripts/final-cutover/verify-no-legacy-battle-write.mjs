// Decision 2 anti-legacy guard: fails if the real Caldran/Greyholm battle UI
// re-introduces the shadow-then-legacy-reapply pattern (a legacy board/active-
// battle write that happens regardless of the universal commit's outcome) or
// writes battle state through any path other than the single sole-authority
// choke point each file is supposed to have.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

// --- Caldran: CampaignBattlePage.tsx ----------------------------------------
{
  const file = 'src/features/campaigns/CampaignBattlePage.tsx';
  const text = read(file);

  // The old shadow API (shadow commit, then legacy re-apply regardless of
  // outcome) must not be called from this file anymore -- commitBoard/readBoard
  // are the only battleAuth methods this file is allowed to use.
  const forbiddenCalls = ['battleAuth.moveUserToken', 'battleAuth.recordPending', 'battleAuth.readPending', 'battleAuth.clearPending', 'battleAuth.consumeFailCompatOnce'];
  for (const call of forbiddenCalls) {
    if (text.includes(call)) failed.push(`${file}: forbidden shadow-authority call still present: ${call}`);
  }

  // battleBoards must be written in exactly one place (patchBoard's commit
  // result) plus the one allowed migration-boundary seed (bootstrap effect) --
  // any additional `battleBoards:` write site would be an independent legacy
  // write bypassing commitBoard.
  const writeSites = (text.match(/battleBoards:\s*\{/g) ?? []).length;
  if (writeSites !== 2) {
    failed.push(`${file}: expected exactly 2 battleBoards write sites (bootstrap seed + patchBoard commit), found ${writeSites}`);
  }

  // patchBoard must route through the universal authority, not a raw
  // store.updateRuntime with a caller-computed board.
  if (!/battleAuth\.commitBoard\(/.test(text)) {
    failed.push(`${file}: patchBoard no longer calls battleAuth.commitBoard -- sole-authority write path missing`);
  }
}

// --- Greyholm: campaignStore.tsx --------------------------------------------
{
  const file = 'src/state/campaignStore.tsx';
  const text = read(file);

  // Every one of the 5 active-battle action creators must commit through
  // commitGreyholmBattle before dispatching -- a direct
  // `dispatch({ type: 'UPDATE_ACTIVE_BATTLE', ... })`/`UPDATE_ACTIVE_BATTLE_COMBATANT`/
  // `ADD_ACTIVE_BATTLE_COMBATANT` from these action creators would be an
  // uncommitted-candidate write bypassing universal authority (END_ACTIVE_BATTLE
  // is exempt -- it clears the durable Greyholm battle record's local runtime
  // presence but does not need a commit of its own since there's no candidate
  // state to validate).
  const forbiddenDispatches = [
    "dispatch({ type: 'UPDATE_ACTIVE_BATTLE',",
    "dispatch({ type: 'UPDATE_ACTIVE_BATTLE_COMBATANT',",
    "dispatch({ type: 'ADD_ACTIVE_BATTLE_COMBATANT',",
  ];
  for (const snippet of forbiddenDispatches) {
    if (text.includes(snippet)) failed.push(`${file}: found a direct uncommitted dispatch bypassing commitGreyholmBattle: ${snippet}`);
  }

  if (!/commitGreyholmBattle\(/.test(text)) {
    failed.push(`${file}: no call to commitGreyholmBattle found -- Greyholm active-battle actions no longer route through universal authority`);
  }

  // All 4 candidate-computing action creators must commit before dispatching.
  const commitCount = (text.match(/commitGreyholmBattle\(greyholmBattleStorage\(\)/g) ?? []).length;
  if (commitCount !== 4) {
    failed.push(`${file}: expected exactly 4 commitGreyholmBattle call sites (start/update/updateCombatant/addCombatant), found ${commitCount}`);
  }
}

if (failed.length) {
  console.error('LEGACY_BATTLE_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 2, verdict: 'NO_LEGACY_BATTLE_WRITE_PATH_FOUND' }));

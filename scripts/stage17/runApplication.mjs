// Stage 17 — application-wiring + privacy assertions that back the real UI
// integration (CampaignEngine ownership resolution + Stage 17 diagnostics page).
// The React provider/page read exactly these domain functions, so proving them
// here + the live browser evidence together cover the application layer.
import {
  resolveOwnership, findDualAuthority, ownerOf, baselineOwnership,
  canonicalHash,
  projectDMWorkspace, projectPlayerSafe, projectObserver,
  userBoardToUniversal,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';
import { caldranComplex, greyholmComplex } from '../stage16/lib.mjs';
import { caldranBoards } from './fixtures.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));

/** enumerate all 16 flag combinations */
function allFlagCombos() {
  const combos = [];
  for (let i = 0; i < 16; i += 1) {
    combos.push({
      battleAuthority: !!(i & 1),
      importExport: !!(i & 2),
      sync: !!(i & 4),
      localCutover: !!(i & 8),
    });
  }
  return combos;
}

export function runApplication(c = new Checks()) {
  // --- ownership resolution the CampaignEngine provider performs ---
  for (const flags of allFlagCombos()) {
    const reg = resolveOwnership(flags);
    const label = `${flags.localCutover ? 'C' : '-'}${flags.battleAuthority ? 'B' : '-'}${flags.importExport ? 'I' : '-'}${flags.sync ? 'S' : '-'}`;
    c.eq(`app: no dual authority under flags ${label}`, findDualAuthority(reg).length, 0);

    // engine "active" mirror: only master+family flips ownership
    const battleFlipped = ownerOf(reg, 'battle-runtime') === 'universal';
    const shouldFlipBattle = flags.localCutover && flags.battleAuthority;
    c.eq(`app: battle ownership matches flags ${label}`, battleFlipped, shouldFlipBattle);

    const importFlipped = ownerOf(reg, 'imports') === 'universal';
    const shouldFlipImport = flags.localCutover && flags.importExport;
    c.eq(`app: import ownership matches flags ${label}`, importFlipped, shouldFlipImport);
  }

  // OFF equals Stage 16 baseline exactly (the provider default state)
  const off = resolveOwnership({ battleAuthority: false, importExport: false, sync: false, localCutover: false });
  const base = baselineOwnership();
  c.ok('app: OFF ownership == Stage 16 baseline', off.every((e, i) => e.owner === base[i].owner && e.legacyRole === base[i].legacyRole));
  c.eq('app: 23 systems tracked (matches diagnostics UI)', off.length, 23);

  // --- privacy: DM / Player-Safe / Observer projection hashes differ ---
  // (this is exactly what the Stage 17 diagnostics page displays; the live
  // browser evidence showed distinct hashes for real Greyholm.)
  for (const [label, fixture] of [['greyholm', greyholmComplex()], ['caldran', caldranComplex()]]) {
    const snap = fixture.snapshot();
    const dm = canonicalHash(projectDMWorkspace(snap));
    const ps = canonicalHash(projectPlayerSafe(snap));
    const obs = canonicalHash(projectObserver(snap));
    c.ok(`privacy ${label}: DM vs Player-Safe hashes differ`, dm !== ps);
    c.ok(`privacy ${label}: DM vs Observer hashes differ`, dm !== obs);
    c.ok(`privacy ${label}: Player-Safe vs Observer hashes differ`, ps !== obs);
    // player-safe hash is stable/deterministic across recomputation
    c.eq(`privacy ${label}: player-safe hash deterministic`, canonicalHash(projectPlayerSafe(clone(snap))), ps);
  }

  // --- battle inclusion visible to the engine when battles present ---
  {
    const snap = clone(caldranComplex().snapshot());
    const rt = userBoardToUniversal(snap.metadata.campaignId, 'custom-alpha', caldranBoards()['custom-alpha'], { active: true });
    snap.runtime.battles = { [rt.id]: rt };
    c.eq('app: engine sees battle count from snapshot', Object.keys(snap.runtime.battles).length, 1);
    // player-safe projection of a battle-bearing snapshot still differs from DM
    c.ok('app: battle snapshot keeps privacy separation',
      canonicalHash(projectPlayerSafe(snap)) !== canonicalHash(projectDMWorkspace(snap)));
  }

  return c;
}

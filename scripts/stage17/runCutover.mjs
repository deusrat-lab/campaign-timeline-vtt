// Stage 17 — cutover flags + ownership registry (default off, no dual authority).
import {
  STAGE_17_DEFAULT_FLAGS, baselineOwnership, resolveOwnership,
  findDualAuthority, ownerOf,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';

export function runCutover(c = new Checks()) {
  // --- flags default off ---
  const f = STAGE_17_DEFAULT_FLAGS;
  c.ok('cutover: battleAuthority default off', f.battleAuthority === false);
  c.ok('cutover: importExport default off', f.importExport === false);
  c.ok('cutover: sync default off', f.sync === false);
  c.ok('cutover: localCutover default off', f.localCutover === false);

  // --- baseline has no dual authority and preserves Stage 15/16 ownership ---
  const baseline = baselineOwnership();
  c.eq('cutover: baseline has no dual authority', findDualAuthority(baseline).length, 0);
  c.eq('cutover: reveal is universal (Stage 16)', ownerOf(baseline, 'reveal'), 'universal');
  c.eq('cutover: presented-cards universal (Stage 16)', ownerOf(baseline, 'presented-cards'), 'universal');
  c.eq('cutover: placements universal (Stage 16)', ownerOf(baseline, 'placements'), 'universal');
  c.eq('cutover: npc universal (Stage 15)', ownerOf(baseline, 'npc'), 'universal');
  c.eq('cutover: battle-runtime legacy at baseline', ownerOf(baseline, 'battle-runtime'), 'legacy');
  c.eq('cutover: imports legacy at baseline', ownerOf(baseline, 'imports'), 'legacy');
  c.eq('cutover: party deferred (honest)', ownerOf(baseline, 'party'), 'deferred');
  c.eq('cutover: routes deferred (honest)', ownerOf(baseline, 'routes'), 'deferred');

  // --- OFF changes nothing ---
  const off = resolveOwnership(STAGE_17_DEFAULT_FLAGS);
  c.ok('cutover: OFF equals baseline ownership',
    off.every((e, i) => e.owner === baseline[i].owner && e.legacyRole === baseline[i].legacyRole));
  c.eq('cutover: OFF has no dual authority', findDualAuthority(off).length, 0);

  // --- flags without master switch do NOT flip ---
  const noMaster = resolveOwnership({ battleAuthority: true, importExport: true, sync: true, localCutover: false });
  c.eq('cutover: family flags need master switch (battle)', ownerOf(noMaster, 'battle-runtime'), 'legacy');
  c.eq('cutover: family flags need master switch (imports)', ownerOf(noMaster, 'imports'), 'legacy');

  // --- full cutover flips cutover-owned families, demotes legacy ---
  const on = resolveOwnership({ battleAuthority: true, importExport: true, sync: true, localCutover: true });
  c.eq('cutover: ON no dual authority', findDualAuthority(on).length, 0);
  c.eq('cutover: battle-definitions universal', ownerOf(on, 'battle-definitions'), 'universal');
  c.eq('cutover: battle-runtime universal', ownerOf(on, 'battle-runtime'), 'universal');
  c.eq('cutover: imports universal', ownerOf(on, 'imports'), 'universal');
  c.eq('cutover: exports universal', ownerOf(on, 'exports'), 'universal');
  c.eq('cutover: backup universal', ownerOf(on, 'backup'), 'universal');
  c.eq('cutover: restore universal', ownerOf(on, 'restore'), 'universal');
  c.eq('cutover: sync compatibility-only (no prod activation)', ownerOf(on, 'sync'), 'compatibility');

  // legacy demoted for flipped families
  const battleRow = on.find((e) => e.system === 'battle-runtime');
  c.eq('cutover: legacy demoted to compatibility for battles', battleRow.legacyRole, 'compatibility');

  // deferred families are NOT auto-claimed even under full cutover
  c.eq('cutover: party stays deferred under full cutover', ownerOf(on, 'party'), 'deferred');
  c.eq('cutover: routes stay deferred under full cutover', ownerOf(on, 'routes'), 'deferred');

  // --- partial cutover: only battle family ---
  const battleOnly = resolveOwnership({ battleAuthority: true, importExport: false, sync: false, localCutover: true });
  c.eq('cutover: partial flips battles', ownerOf(battleOnly, 'battle-runtime'), 'universal');
  c.eq('cutover: partial leaves imports legacy', ownerOf(battleOnly, 'imports'), 'legacy');
  c.eq('cutover: partial no dual authority', findDualAuthority(battleOnly).length, 0);

  // --- an injected dual-authority row is caught ---
  const bad = baselineOwnership();
  bad.push({ system: 'battle-runtime', owner: 'universal', legacyRole: 'authoritative', family: 'battle' });
  c.ok('cutover: injected dual authority detected', findDualAuthority(bad).length >= 1);

  return c;
}

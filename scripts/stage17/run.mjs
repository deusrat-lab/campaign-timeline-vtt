// Stage 17 — orchestrates all sub-harnesses against one compiled domain and
// reports a single consolidated verdict.
import { Checks } from '../stage08/lib.mjs';
import { runBattles } from './runBattles.mjs';
import { runImportExport } from './runImportExport.mjs';
import { runSync } from './runSync.mjs';
import { runMigration } from './runMigration.mjs';
import { runCutover } from './runCutover.mjs';
import { runApplication } from './runApplication.mjs';
import { runBattleAuthority } from './runBattleAuthority.mjs';
import { runPortabilityUC } from './runPortabilityUC.mjs';

const groups = [
  ['battles', runBattles],
  ['battle authority (durable move path)', runBattleAuthority],
  ['user-campaign import/export round-trip', runPortabilityUC],
  ['import/export/backup/restore', runImportExport],
  ['sync', runSync],
  ['migration rehearsal', runMigration],
  ['cutover + ownership', runCutover],
  ['application wiring + privacy', runApplication],
];

const c = new Checks();
for (const [label, fn] of groups) {
  const before = c.passed + c.failed;
  await fn(c);
  const added = c.passed + c.failed - before;
  console.log(`  · ${label}: ${added} assertions`);
}

const s = c.summary();
for (const r of c.results) if (!r.pass) console.log('FAIL:', r.name, '—', r.detail);
console.log(`\nStage 17 harness: ${s.passed}/${s.total} ${s.ok ? 'PASS -> STAGE_17_HARNESS_PASS' : 'FAIL'}`);
process.exit(s.ok ? 0 : 1);

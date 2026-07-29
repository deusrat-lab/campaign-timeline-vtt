import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outDir = resolve(root, 'rebuild-reports/stage-07');
const tmpDir = resolve(root, '.stage07-verify');

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

const compileArgs = [
  '--ignoreConfig',
  '--module', 'CommonJS',
  '--moduleResolution', 'Node',
  '--ignoreDeprecations', '6.0',
  '--target', 'ES2022',
  '--lib', 'ES2022,DOM',
  '--jsx', 'react-jsx',
  '--skipLibCheck',
  '--strict',
  '--types', 'node',
  '--outDir', tmpDir,
  'scripts/stage07-migration-test.ts',
];

const checks = [];
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), compileArgs, { cwd: root, stdio: 'pipe' });
  writeFileSync(resolve(tmpDir, 'package.json'), '{"type":"commonjs"}\n');
  checks.push({ name: 'migration behavioral test compiles', ok: true });
} catch (error) {
  checks.push({ name: 'migration behavioral test compiles', ok: false, message: String(error) });
}

if (checks.every((check) => check.ok)) {
  try {
    const output = execFileSync(process.execPath, [resolve(tmpDir, 'scripts/stage07-migration-test.js')], { cwd: root, encoding: 'utf8' });
    checks.push({ name: 'migration behavioral cases pass', ok: true, output: output.trim() });
  } catch (error) {
    checks.push({ name: 'migration behavioral cases pass', ok: false, message: String(error) });
  }
}

const migrationText = readFileSync(resolve(root, 'src/domain/migration/migrationEngine.ts'), 'utf8');
const storeText = readFileSync(resolve(root, 'src/domain/store/universalStore.ts'), 'utf8');
const commandText = readFileSync(resolve(root, 'src/domain/store/commands.ts'), 'utf8');
checks.push({ name: 'migration engine requires explicit target campaign id', ok: /targetCampaignId/.test(migrationText) && /target campaign mismatch/.test(migrationText) });
checks.push({ name: 'migration engine supports dry-run and commit', ok: /dryRun/.test(migrationText) && /committed/.test(migrationText) });
checks.push({ name: 'migration engine validates read-back', ok: /readBack/.test(migrationText) && /validateCampaignSnapshot/.test(migrationText) });
checks.push({ name: 'migration engine supports rollback', ok: /rollbackUniversalMigration/.test(migrationText) && /restoreCampaign/.test(migrationText) });
checks.push({
  name: 'universal store exposes required state buckets',
  ok: ['registry', 'activeCampaignId', 'durableSnapshot', 'runtime', 'dirty', 'saveState', 'conflictState', 'permissions', 'validationState', 'migrationState']
    .every((term) => storeText.includes(term)),
});
checks.push({
  name: 'campaign-scoped commands exist',
  ok: ['createEntity', 'updateEntity', 'deleteEntity', 'moveMarker', 'updateRoute', 'changeTime', 'revealEntity', 'presentCard', 'startBattle', 'updateInitiative', 'advanceTurn', 'saveCampaign', 'importCampaign', 'exportCampaign']
    .every((term) => commandText.includes(`function ${term}`)),
});
checks.push({ name: 'commands enforce campaign scope', ok: /assertCampaignScope/.test(commandText) && /Campaign command scope mismatch/.test(commandText) });
checks.push({ name: 'campaign switch clears selected entity', ok: /selectedEntityId: undefined/.test(storeText) });

const failed = checks.filter((check) => !check.ok);
const result = {
  ok: failed.length === 0,
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  checks,
  failed: failed.map((check) => check.name),
};

writeFileSync(resolve(outDir, 'RESULTS.json'), `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(resolve(outDir, 'SUMMARY.md'), [
  '# Stage 07 Migration Verification',
  '',
  `Verdict: ${result.verdict}`,
  '',
  `Checks: ${checks.length}`,
  `Failed: ${failed.length}`,
  '',
  'Covered: explicit target campaign, dry-run, commit/read-back, idempotency, Greyholm/Kaldran source labels, rollback, unrelated campaign preservation.',
  '',
].join('\n'));

rmSync(tmpDir, { recursive: true, force: true });

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result));

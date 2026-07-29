import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const outDir = resolve(root, 'rebuild-reports/stage-06');
const tmpDir = resolve(root, '.stage06-verify');
const resultsPath = resolve(outDir, 'RESULTS.json');

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
  'scripts/stage06-repository-test.ts',
];

const checks = [];
try {
  execFileSync(resolve(root, 'node_modules/.bin/tsc'), compileArgs, { cwd: root, stdio: 'pipe' });
  writeFileSync(resolve(tmpDir, 'package.json'), '{"type":"commonjs"}\n');
  checks.push({ name: 'repository behavioral test compiles', ok: true });
} catch (error) {
  checks.push({ name: 'repository behavioral test compiles', ok: false, message: String(error) });
}

if (checks.every((check) => check.ok)) {
  try {
    const output = execFileSync(process.execPath, [resolve(tmpDir, 'scripts/stage06-repository-test.js')], { cwd: root, encoding: 'utf8' });
    checks.push({ name: 'repository behavioral cases pass', ok: true, output: output.trim() });
  } catch (error) {
    checks.push({ name: 'repository behavioral cases pass', ok: false, message: String(error) });
  }
}

const repositoryText = [
  'src/domain/repository/types.ts',
  'src/domain/repository/shadowRepository.ts',
].map((file) => readFileSync(resolve(root, file), 'utf8')).join('\n');
checks.push({ name: 'revision contract exposes expected/current/new revisions', ok: /expectedRevision/.test(repositoryText) && /currentRevision/.test(repositoryText) && /newRevision/.test(repositoryText) });
checks.push({ name: 'conflicts use CONFLICT code', ok: /'CONFLICT'/.test(repositoryText) && /assertRevision/.test(repositoryText) });
checks.push({ name: 'shadow namespace does not use legacy overlay keys', ok: /universal-shadow/.test(repositoryText) && !/overlay:v2|state:v1/.test(repositoryText) });
checks.push({ name: 'production repository exists without UI switch', ok: /createProductionCampaignRepository/.test(repositoryText) && /UNIVERSAL_PRODUCTION_NAMESPACE/.test(repositoryText) });

const failed = checks.filter((check) => !check.ok);
const result = {
  ok: failed.length === 0,
  verdict: failed.length === 0 ? 'PASS' : 'FAIL',
  checks,
  failed: failed.map((check) => check.name),
};

writeFileSync(resultsPath, `${JSON.stringify(result, null, 2)}\n`);
writeFileSync(resolve(outDir, 'SUMMARY.md'), [
  '# Stage 06 Repository Verification',
  '',
  `Verdict: ${result.verdict}`,
  '',
  `Checks: ${checks.length}`,
  `Failed: ${failed.length}`,
  '',
  'Covered: repository contract, revision conflicts, shadow namespace, production namespace, snapshot round-trip, backup/restore, corruption, invalid schema, clear campaign, clear all shadow, isolation.',
  '',
].join('\n'));

rmSync(tmpDir, { recursive: true, force: true });

if (!result.ok) {
  console.error(JSON.stringify(result, null, 2));
  process.exit(1);
}

console.log(JSON.stringify(result));

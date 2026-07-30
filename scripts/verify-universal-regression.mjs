// Consolidated universal-engine regression runner.
//
// Runs the critical stable gates across the universal rebuild in one command so
// later stages need one entry point instead of a dozen. Each stage's own build
// step compiles its isolated `.dist`, so stages are independent and safe to run
// sequentially. Historical reports are NOT regenerated here (each runner writes
// only its own machine-readable artifact); this runner writes a single compact
// summary under rebuild-reports/stage-15/ (the current stage's folder) and exits
// non-zero on any failure.
//
// `typecheck` and `build` are intentionally NOT included here (they are slower,
// full-app gates run separately) — this runner is the fast domain/harness suite.
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

// Ordered list of critical gates. Each entry is one `npm run <script>`.
const GATES = [
  'verify:stage08',
  'verify:stage08d',
  'verify:stage09',
  'verify:stage10',
  'verify:stage11',
  'verify:stage12',
  'verify:stage13',
  'verify:stage14',
  'verify:stage15',
  'verify:stage06',
  'verify:stage07',
  'verify:stage05',
];

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const results = [];
let failed = 0;

for (const gate of GATES) {
  const started = Date.now();
  let ok = true;
  let tail = '';
  try {
    const out = execFileSync(npm, ['run', '--silent', gate], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    tail = lastLine(out);
  } catch (error) {
    ok = false;
    failed += 1;
    tail = lastLine(`${error.stdout ?? ''}\n${error.stderr ?? ''}`) || String(error.message).split('\n')[0];
  }
  const ms = Date.now() - started;
  results.push({ gate, ok, ms, tail });
  console.log(`${ok ? '✓' : '✗'} ${gate.padEnd(22)} ${String(ms).padStart(6)}ms  ${tail}`);
}

const verdict = failed === 0 ? 'UNIVERSAL_REGRESSION_PASS' : 'UNIVERSAL_REGRESSION_FAIL';
mkdirSync(resolve(root, 'rebuild-reports/stage-15'), { recursive: true });
writeFileSync(
  resolve(root, 'rebuild-reports/stage-15/consolidated-regression.json'),
  JSON.stringify({ verdict, ranAt: new Date().toISOString(), total: GATES.length, failed, results }, null, 2),
);
console.log(`\n${verdict}: ${GATES.length - failed}/${GATES.length} gates passed`);
process.exit(failed === 0 ? 0 : 1);

function lastLine(text) {
  const lines = String(text).split('\n').map((l) => l.trim()).filter(Boolean);
  return lines[lines.length - 1] ?? '';
}

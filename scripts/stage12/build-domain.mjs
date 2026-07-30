// Compiles the universal domain to standalone ESM under scripts/stage12/.dist so
// the Stage 12 harness runs from plain Node (same approach as Stage 9/10/11).
import { rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
rmSync(resolve(here, '.dist'), { recursive: true, force: true });
execFileSync(
  resolve(here, '../../node_modules/.bin/tsc'),
  ['-p', resolve(here, 'tsconfig.harness.json')],
  { stdio: 'inherit' },
);
writeFileSync(resolve(here, '.dist/package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
console.log('Stage 12 domain build complete.');

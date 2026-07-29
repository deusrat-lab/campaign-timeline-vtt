// Compiles the universal domain (incl. src/domain/shadow/**) to standalone ESM
// under scripts/stage09/.dist so the Stage 9 harness runs from plain Node.
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
console.log('Stage 9 domain build complete.');

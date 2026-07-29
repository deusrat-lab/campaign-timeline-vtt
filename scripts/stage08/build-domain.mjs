// Compiles the universal domain (src/domain/**) to standalone ESM JS under
// scripts/stage08/.dist so the Stage 8 harness can import it from plain Node.
// Cross-boundary imports in the domain are type-only and are erased.
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
// The compiled tree is CommonJS; mark it so Node ignores the package "type": "module".
writeFileSync(resolve(here, '.dist/package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
console.log('Stage 8 domain build complete.');

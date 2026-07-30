// Compiles the universal domain + the Stage 16.1 pure bridge/sink to standalone
// ESM under scripts/stage16-1/.dist so the integration harness exercises the
// EXACT production wiring (bridge + sink) from plain Node.
import { rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
rmSync(resolve(here, '.dist'), { recursive: true, force: true });
execFileSync(resolve(here, '../../node_modules/.bin/tsc'), ['-p', resolve(here, 'tsconfig.harness.json')], { stdio: 'inherit' });
writeFileSync(resolve(here, '.dist/package.json'), JSON.stringify({ type: 'commonjs' }, null, 2));
console.log('Stage 16.1 bridge build complete.');

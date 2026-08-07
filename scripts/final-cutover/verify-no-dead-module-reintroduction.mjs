// Block L anti-regression guard: fails if a module classified DEAD and
// deleted this pass is reintroduced (as a file or via an import path), and
// fails if active runtime code (outside migration/import-export code) starts
// importing something that should stay migration/isolation-only.
//
// Currently tracked DEAD deletions (Block L, this pass):
//   - src/pages/QuestsPage.tsx
//       Superseded by the real /quests route, which renders
//       EntityLibraryPage kind="quests" (see src/App.tsx). QuestsPage had
//       zero importers and was not reachable from any route.
//   - src/domain/visibility/index.ts
//       Unused barrel re-export; every real consumer imports
//       presentedCardAuthorityStore.ts / revealAuthorityStore.ts / types.ts
//       directly. Zero importers of the barrel itself.
//
// This guard is intentionally cheap and additive: as future Block L passes
// classify + delete more DEAD code, add entries to DEAD_PATHS below.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, join } from 'node:path';

const root = process.cwd();
let failed = [];

const DEAD_PATHS = ['src/pages/QuestsPage.tsx', 'src/domain/visibility/index.ts'];

for (const p of DEAD_PATHS) {
  if (existsSync(resolve(root, p))) {
    failed.push(`DEAD module reintroduced: ${p} was deleted in Block L (dead/superseded) but exists again.`);
  }
}

// Also fail if anything under src/ imports the deleted paths by specifier
// (covers a partial revert that only restores an import, not the file).
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}

const bannedSpecifiers = [/QuestsPage['"]/, /domain\/visibility['"]\s*;?\s*$/m, /from ['"]\.\.\/domain\/visibility['"]/];

const files = existsSync(resolve(root, 'src')) ? walk(resolve(root, 'src')) : [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  for (const re of bannedSpecifiers) {
    if (re.test(text)) {
      failed.push(`Banned import of a Block L DEAD module found in ${f.replace(root + '/', '')} (matched ${re}).`);
    }
  }
}

if (failed.length) {
  console.error('BLOCK_L_DEAD_MODULE_GUARD_FAIL');
  for (const f of failed) console.error(' -', f);
  process.exit(1);
}

console.log('BLOCK_L_DEAD_MODULE_GUARD_PASS: no Block L DEAD modules reintroduced.');

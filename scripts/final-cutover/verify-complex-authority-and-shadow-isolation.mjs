// Block L architecture guard: statically verifies (1) the active application
// import graph, starting from src/main.tsx, never reaches the command-shadow
// coordinator module via a STATIC import (only via a dynamic import() gated
// behind the default-off UNIVERSAL_COMMAND_SHADOW_ENABLED flag), and (2) the
// aggregateOwnership.ts registry's live/'wired' complex-authority scopes are
// exactly the set this pass's grep-verified as actually called from the real
// store (greyholm.placement only) — so a future edit can't silently re-wire a
// dead scope, or silently widen the shadow module's reachability, without this
// guard failing.
//
// Static import-graph walk: parses `import ... from '...'` / `export ... from
// '...'` specifiers with a regex (not a full bundler) — reasonable rigor for a
// guard script, not a claim of perfect JS/TS parsing.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';

const root = process.cwd();
const failed = [];

// ---------------------------------------------------------------------------
// Part A — aggregateOwnership.ts: exactly one 'wired' scope, greyholm.placement.
// ---------------------------------------------------------------------------
const ownershipPath = resolve(root, 'src/domain/complex-authority/aggregateOwnership.ts');
const ownershipText = readFileSync(ownershipPath, 'utf8');

// Extract each descriptor block's scope + uiStatus pair (order-preserving,
// tolerant of the exact field order used in the file).
const descriptorBlocks = ownershipText.split(/\{\s*\n\s*scope:/).slice(1);
const wiredScopes = [];
for (const block of descriptorBlocks) {
  const scopeMatch = block.match(/^\s*'([^']+)'/);
  const statusMatch = block.match(/uiStatus:\s*'([^']+)'/);
  if (!scopeMatch || !statusMatch) continue;
  if (statusMatch[1] === 'wired') wiredScopes.push(scopeMatch[1]);
}

const EXPECTED_WIRED = ['greyholm.placement'];
if (JSON.stringify(wiredScopes.sort()) !== JSON.stringify([...EXPECTED_WIRED].sort())) {
  failed.push(
    `aggregateOwnership.ts uiStatus:'wired' scopes changed unexpectedly. Expected exactly ${JSON.stringify(EXPECTED_WIRED)}, found ${JSON.stringify(wiredScopes)}. ` +
      `If a scope was genuinely re-wired to a live UI call site, update EXPECTED_WIRED here deliberately (with a fresh grep of routeGreyComplex/routeUserComplex call sites as evidence) — do not just silence this guard.`,
  );
}

// ---------------------------------------------------------------------------
// Part B — routeGreyComplex/routeUserComplex call sites match the wired set.
// ---------------------------------------------------------------------------
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(p);
  }
  return out;
}
const srcFiles = walk(resolve(root, 'src'));

const liveScopeCallSites = new Set();
for (const f of srcFiles) {
  const text = readFileSync(f, 'utf8');
  // routeGreyComplex('scope', ...) / routeUserComplex(...) style calls, or a
  // direct complexScope: 'x.y' literal passed to the sink.
  for (const m of text.matchAll(/routeGreyComplex\(\s*\n?\s*'([^']+)'/g)) liveScopeCallSites.add(m[1]);
  for (const m of text.matchAll(/complexScope:\s*'([^']+)'/g)) liveScopeCallSites.add(m[1]);
}
// Exclude the type-signature / comment occurrences inside the domain-layer
// files themselves (they document the mechanism, not a real call site).
const DOC_ONLY_FILES = new Set([
  'src/domain/placements/mapPlacementAuthorityStore.ts',
  'src/domain/visibility/revealAuthorityStore.ts',
  'src/domain/visibility/presentedCardAuthorityStore.ts',
  'src/domain/party/partyPositionAuthorityStore.ts',
  'src/domain/complex-authority/aggregateOwnership.ts',
]);

const realCallSiteScopes = new Set();
for (const f of srcFiles) {
  const rel = f.replace(root + '/', '');
  if (DOC_ONLY_FILES.has(rel)) continue;
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/routeGreyComplex\(\s*\n?\s*'([^']+)'/g)) realCallSiteScopes.add(m[1]);
}

for (const scope of realCallSiteScopes) {
  if (!EXPECTED_WIRED.includes(scope)) {
    failed.push(`A live routeGreyComplex('${scope}', ...) call site exists but '${scope}' is not in EXPECTED_WIRED — update this guard AND aggregateOwnership.ts's uiStatus together.`);
  }
}
for (const scope of EXPECTED_WIRED) {
  if (!realCallSiteScopes.has(scope)) {
    failed.push(`EXPECTED_WIRED scope '${scope}' has no live routeGreyComplex/routeUserComplex call site any more — it should be reclassified 'superseded-by-authority-store' (or its real replacement status) in aggregateOwnership.ts.`);
  }
}

// ---------------------------------------------------------------------------
// Part C — command-shadow isolation: the active graph from src/main.tsx never
// STATICALLY imports CommandShadowProviderEnabled.tsx (the heavy,
// domain-consuming half). It may only be reached via a dynamic import().
// ---------------------------------------------------------------------------
const SHADOW_ENABLED_MODULE = 'src/features/command-shadow/CommandShadowProviderEnabled.tsx';

function resolveSpecifier(fromFile, specifier) {
  if (!specifier.startsWith('.')) return null; // external / alias — not part of this walk
  const base = resolve(dirname(fromFile), specifier);
  const candidates = [`${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`, base];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  return null;
}

function staticImportSpecifiers(text) {
  const specs = [];
  // Static `import ... from '...'` and `export ... from '...'` only — NOT
  // `import(...)` dynamic calls, which are the intended escape hatch.
  for (const m of text.matchAll(/^\s*import\s+(?:type\s+)?[^;]*?from\s+['"]([^'"]+)['"]/gm)) specs.push(m[1]);
  for (const m of text.matchAll(/^\s*export\s+[^;]*?from\s+['"]([^'"]+)['"]/gm)) specs.push(m[1]);
  return specs;
}

const entry = resolve(root, 'src/main.tsx');
const visited = new Set();
const queue = [entry];
let reachedShadowEnabled = false;
while (queue.length) {
  const file = queue.shift();
  if (!file || visited.has(file)) continue;
  visited.add(file);
  const rel = file.replace(root + '/', '');
  if (rel === SHADOW_ENABLED_MODULE) {
    reachedShadowEnabled = true;
    continue;
  }
  if (!existsSync(file)) continue;
  const text = readFileSync(file, 'utf8');
  for (const spec of staticImportSpecifiers(text)) {
    const resolved = resolveSpecifier(file, spec);
    if (resolved) queue.push(resolved);
  }
}

if (reachedShadowEnabled) {
  failed.push(
    `${SHADOW_ENABLED_MODULE} is STATICALLY reachable from src/main.tsx — it must only be loaded via a dynamic import() behind UNIVERSAL_COMMAND_SHADOW_ENABLED (see src/features/command-shadow/CommandShadowProvider.tsx). This defeats the Block L bundle-isolation of the diagnostic-only command-shadow coordinator.`,
  );
}

// The thin shell (CommandShadowProvider.tsx) itself IS expected to be
// reachable (it's mounted in App.tsx) — that's fine, it contains no domain
// imports and only lazy-loads the heavy module conditionally.
const shellFile = resolve(root, 'src/features/command-shadow/CommandShadowProvider.tsx');
if (!visited.has(shellFile)) {
  failed.push('src/features/command-shadow/CommandShadowProvider.tsx is not reachable from src/main.tsx any more — App.tsx wiring may have changed; re-verify command-shadow mounting.');
} else {
  const shellText = readFileSync(shellFile, 'utf8');
  if (!/import\(['"]\.\/CommandShadowProviderEnabled['"]\)/.test(shellText)) {
    failed.push('CommandShadowProvider.tsx no longer dynamically import()s CommandShadowProviderEnabled — the isolation mechanism this guard checks for may have been refactored away without updating the guard.');
  }
}

if (failed.length) {
  console.error('BLOCK_L_COMPLEX_AUTHORITY_AND_SHADOW_ISOLATION_GUARD_FAIL');
  for (const f of failed) console.error(' -', f);
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      ok: true,
      verdict: 'BLOCK_L_COMPLEX_AUTHORITY_AND_SHADOW_ISOLATION_GUARD_PASS',
      wiredComplexScopes: wiredScopes,
      realGreyComplexCallSiteScopes: [...realCallSiteScopes],
      filesWalkedForImportGraph: visited.size,
      commandShadowProviderEnabledStaticallyReachable: reachedShadowEnabled,
    },
    null,
    2,
  ),
);

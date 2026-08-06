// Block I anti-legacy guard for the route authority cutover (Caldran
// addRoute/updateRoute/removeRoute in userCampaignStore.tsx): fails if these
// action creators regress to writing `routes` directly through `patchData`
// without first committing through the unconditional `commitRoutes`
// whole-collection sole-authority choke point. Caldran-only subsystem --
// Greyholm has a differently-shaped `MapRoute` concept (hotspot-to-hotspot
// travel routes in campaignStore.tsx), out of scope (see
// src/domain/routes/routeAuthorityStore.ts header).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

// --- Caldran: userCampaignStore.tsx -----------------------------------------
{
  const file = 'src/state/userCampaignStore.tsx';
  const text = read(file);

  const commitCount = (text.match(/commitRoutes\(ucFieldStorage\(\),\s*campaignIdFromLegacy\('user',\s*id\),\s*'userCampaign\.routes'/g) ?? []).length;
  if (commitCount < 3) {
    failed.push(`${file}: expected 3 calls to commitRoutes (addRoute/updateRoute/removeRoute), found ${commitCount} -- Caldran routes no longer route through universal routes authority for all three action creators`);
  }

  // The old direct-write shape (no commit) looked like:
  //   addRoute: (id, route) => { const rid = uid('rte'); patchData(id, (p) => ({ ...p, routes: [...p.routes, { ...route, id: rid }] })); return rid; },
  if (/patchData\(id,\s*\(p\)\s*=>\s*\(\{\s*\.\.\.p,\s*routes:\s*\[\.\.\.p\.routes,/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to routes reintroduced (bypassing commitRoutes)`);
  }
  if (/patchData\(id,\s*\(p\)\s*=>\s*\(\{\s*\.\.\.p,\s*routes:\s*p\.routes\.map/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to routes reintroduced (bypassing commitRoutes)`);
  }
  if (/patchData\(id,\s*\(p\)\s*=>\s*\(\{\s*\.\.\.p,\s*routes:\s*p\.routes\.filter/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to routes reintroduced (bypassing commitRoutes)`);
  }
}

if (failed.length) {
  console.error('LEGACY_ROUTES_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 1, verdict: 'NO_LEGACY_ROUTES_WRITE_PATH_FOUND' }));

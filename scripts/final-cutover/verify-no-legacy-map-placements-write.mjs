// Block I anti-legacy guard for the map-placements authority cutover
// (Caldran addPlacement/updatePlacement/removePlacement in
// userCampaignStore.tsx): fails if the file re-introduces the optional,
// flag-gated `routeUserComplex({ complexScope: 'userCampaign.placement', ... })`
// complex-authority sink for placement mutations, or if the unconditional
// `commitMapPlacements` whole-collection sole-authority choke point is
// removed. Caldran-only subsystem -- Greyholm has no equivalent
// `mapPlacements` collection (see
// src/domain/placements/mapPlacementAuthorityStore.ts header).
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

  if (/routeUserComplex\(/.test(text)) {
    failed.push(`${file}: forbidden optional/flag-gated complex-authority routing (routeUserComplex) reintroduced -- map placements must commit unconditionally through commitMapPlacements`);
  }

  if (/import\s*\{\s*routeUserComplex\s*\}/.test(text)) {
    failed.push(`${file}: forbidden import of routeUserComplex reintroduced`);
  }

  const commitCount = (text.match(/commitMapPlacements\(ucFieldStorage\(\),\s*campaignIdFromLegacy\('user',\s*id\),\s*'userCampaign\.placements'/g) ?? []).length;
  if (commitCount < 3) {
    failed.push(`${file}: expected 3 calls to commitMapPlacements (addPlacement/updatePlacement/removePlacement), found ${commitCount} -- Caldran map placements no longer route through universal map-placements authority for all three action creators`);
  }
}

if (failed.length) {
  console.error('LEGACY_MAP_PLACEMENTS_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 1, verdict: 'NO_LEGACY_MAP_PLACEMENTS_WRITE_PATH_FOUND' }));

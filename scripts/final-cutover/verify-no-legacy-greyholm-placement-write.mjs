// Block L anti-legacy guard for Greyholm's map-object placement authority
// cutover (src/domain/placements/greyholmPlacementAuthorityStore.ts) -- this
// was the LAST scope in the whole project with a live routeGreyComplex
// (Stage 16.1 default-off shadow) call site; converting it is what makes
// "ACTIVE legacy authority = 0" true.
//
// Fails if addPlacement/patchPlacement/deletePlacement in campaignStore.tsx
// regress to writing placements directly into the legacy overlay
// (newPlacements/placementPatches/ADD_PLACEMENT dispatch) without first
// committing through the unconditional commitGreyholmPlacements
// whole-collection choke point, or if routeGreyComplex is reintroduced.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

{
  const file = 'src/state/campaignStore.tsx';
  const text = read(file);

  const commitCount = (text.match(/commitGreyholmPlacements\(\s*greyholmBattleStorage\(\),\s*GREYHOLM_UNIVERSAL_CAMPAIGN_ID,\s*'greyholm\.placements'/g) ?? []).length;
  if (commitCount !== 3) {
    failed.push(`${file}: expected exactly 3 calls to commitGreyholmPlacements (addPlacement/patchPlacement/deletePlacement), found ${commitCount} -- Greyholm placements no longer route through universal placement authority for all three action creators`);
  }

  if (/function materializePlacements/.test(text) === false) {
    failed.push(`${file}: materializePlacements() helper missing -- placement authority cutover regressed`);
  }

  if (/\brouteGreyComplex\(/.test(text)) {
    failed.push(`${file}: routeGreyComplex(...) call reintroduced -- the Stage 16.1 default-off shadow sink must not be used any more (it had zero remaining callers after the placement conversion, and was deliberately removed as a function)`);
  }

  if (/'ADD_PLACEMENT'/.test(text)) {
    failed.push(`${file}: ADD_PLACEMENT action/reducer case reintroduced -- addPlacement must dispatch COMMIT_PLACEMENTS only, never the old direct-append action`);
  }

  const commitPlacementsCaseCount = (text.match(/case 'COMMIT_PLACEMENTS':/g) ?? []).length;
  if (commitPlacementsCaseCount !== 1) {
    failed.push(`${file}: expected exactly 1 'COMMIT_PLACEMENTS' reducer case, found ${commitPlacementsCaseCount}`);
  }
}

{
  const file = 'src/domain/placements/greyholmPlacementAuthorityStore.ts';
  const text = read(file);
  if (!/export function commitGreyholmPlacements/.test(text)) {
    failed.push(`${file}: commitGreyholmPlacements export missing -- authority module regressed`);
  }
}

{
  const file = 'src/domain/complex-authority/aggregateOwnership.ts';
  const text = read(file);
  if (!/scope: 'greyholm\.placement'[\s\S]{0,400}?uiStatus: 'superseded-by-authority-store'/.test(text)) {
    failed.push(`${file}: greyholm.placement's uiStatus is not 'superseded-by-authority-store' -- ownership registry out of sync with the real cutover`);
  }
}

if (failed.length) {
  console.error('LEGACY_GREYHOLM_PLACEMENT_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 3, verdict: 'NO_LEGACY_GREYHOLM_PLACEMENT_WRITE_PATH_FOUND (ACTIVE legacy authority = 0)' }));

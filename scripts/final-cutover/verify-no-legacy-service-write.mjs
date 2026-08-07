// Block I anti-legacy guard for the Greyholm economy-services (shop/tavern)
// authority cutover: fails if campaignStore.tsx stops routing every
// patchShop/patchTavern write through the unconditional `commitServicePatch`
// whole-patch-object sole-authority choke point, or if a bypass path (a
// direct `dispatch({ type: 'PATCH_ENTITY', kind: 'shop'|'tavern', ... })`
// outside the two store methods, using a raw candidate patch instead of
// outcome.patch) is reintroduced.
// Greyholm-only subsystem -- Caldran (userCampaignStore.tsx) has no
// DM Companion shop/tavern data model at all (see
// src/domain/services/serviceAuthorityStore.ts header).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

// --- Greyholm: campaignStore.tsx --------------------------------------------
{
  const file = 'src/state/campaignStore.tsx';
  const text = read(file);

  const commitCount = (text.match(/commitServicePatch\(greyholmBattleStorage\(\),\s*GREYHOLM_UNIVERSAL_CAMPAIGN_ID,\s*kind,\s*id,\s*mergedPatch\)/g) ?? []).length;
  if (commitCount < 2) {
    failed.push(`${file}: expected 2 calls to commitServicePatch (patchTavern/patchShop), found ${commitCount} -- Greyholm shop/tavern writes no longer route through universal service authority`);
  }

  // Every non-DELETED PATCH_ENTITY dispatch for kind 'tavern'/'shop' must
  // project outcome.patch, never the raw incoming patch.
  const tavernDispatches = [...text.matchAll(/dispatch\(\{\s*type:\s*'PATCH_ENTITY',\s*kind:\s*'tavern',\s*id,\s*patch:\s*([^}]+)\s*\}\)/g)].map((m) => m[1].trim());
  const shopDispatches = [...text.matchAll(/dispatch\(\{\s*type:\s*'PATCH_ENTITY',\s*kind:\s*'shop',\s*id,\s*patch:\s*([^}]+)\s*\}\)/g)].map((m) => m[1].trim());

  const badTavern = tavernDispatches.filter((p) => p !== 'DELETED' && !p.startsWith('outcome.patch'));
  const badShop = shopDispatches.filter((p) => p !== 'DELETED' && !p.startsWith('outcome.patch'));
  if (tavernDispatches.length !== 2 || badTavern.length > 0) {
    failed.push(`${file}: expected exactly 2 tavern PATCH_ENTITY dispatches (DELETED passthrough + outcome.patch projection), found ${tavernDispatches.length} with payloads [${tavernDispatches.join(', ')}]`);
  }
  if (shopDispatches.length !== 2 || badShop.length > 0) {
    failed.push(`${file}: expected exactly 2 shop PATCH_ENTITY dispatches (DELETED passthrough + outcome.patch projection), found ${shopDispatches.length} with payloads [${shopDispatches.join(', ')}]`);
  }
}

if (failed.length) {
  console.error('LEGACY_SERVICE_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 1, verdict: 'NO_LEGACY_SERVICE_WRITE_PATH_FOUND' }));

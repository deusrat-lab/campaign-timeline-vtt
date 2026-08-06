// Block I anti-legacy guard for the zone authority cutover (Caldran
// addZone/updateZone/removeZone in userCampaignStore.tsx, and the
// IsolatedCampaignMapWorkspace.tsx call sites that used to write `zones`
// directly through `store.updateData`): fails if these action creators
// regress to writing `zones` directly through `patchData`/`updateData`
// without first committing through the unconditional `commitZones`
// whole-collection sole-authority choke point. Caldran-only subsystem --
// Greyholm has a differently-shaped `FactionZone` concept (a record keyed by
// id, campaignStore.tsx ADD_FACTION_ZONE/UPDATE_FACTION_ZONE/
// ARCHIVE_FACTION_ZONE), out of scope (see
// src/domain/zones/zoneAuthorityStore.ts header).
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

  const commitCount = (text.match(/commitZones\(ucFieldStorage\(\),\s*campaignIdFromLegacy\('user',\s*id\),\s*'userCampaign\.zones'/g) ?? []).length;
  if (commitCount < 3) {
    failed.push(`${file}: expected 3 calls to commitZones (addZone/updateZone/removeZone), found ${commitCount} -- Caldran zones no longer route through universal zones authority for all three action creators`);
  }

  if (/patchData\(id,\s*\(p\)\s*=>\s*\(\{\s*\.\.\.p,\s*zones:\s*\[\.\.\.p\.zones,/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to zones reintroduced (bypassing commitZones)`);
  }
  if (/patchData\(id,\s*\(p\)\s*=>\s*\(\{\s*\.\.\.p,\s*zones:\s*p\.zones\.map/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to zones reintroduced (bypassing commitZones)`);
  }
  if (/patchData\(id,\s*\(p\)\s*=>\s*\(\{\s*\.\.\.p,\s*zones:\s*p\.zones\.filter/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to zones reintroduced (bypassing commitZones)`);
  }
}

// --- Caldran: IsolatedCampaignMapWorkspace.tsx call sites -------------------
{
  const file = 'src/features/campaigns/IsolatedCampaignMapWorkspace.tsx';
  const text = read(file);

  if (/store\.updateData\([^)]*=>\s*\(\{\s*\.\.\.(p|prev),\s*zones:/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to zones reintroduced via store.updateData (bypassing store.addZone/updateZone/removeZone)`);
  }
  const addCount = (text.match(/store\.addZone\(campaignId,/g) ?? []).length;
  const updateCount = (text.match(/store\.updateZone\(campaignId,/g) ?? []).length;
  const removeCount = (text.match(/store\.removeZone\(campaignId,/g) ?? []).length;
  if (addCount < 1) failed.push(`${file}: expected at least 1 call to store.addZone, found ${addCount}`);
  if (updateCount < 3) failed.push(`${file}: expected at least 3 calls to store.updateZone (drag-point/remove-point/toggle-visibility), found ${updateCount}`);
  if (removeCount < 1) failed.push(`${file}: expected at least 1 call to store.removeZone, found ${removeCount}`);
}

if (failed.length) {
  console.error('LEGACY_ZONES_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 2, verdict: 'NO_LEGACY_ZONES_WRITE_PATH_FOUND' }));

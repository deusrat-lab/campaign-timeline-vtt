// Block I anti-legacy guard for the party-position authority cutover
// (Greyholm setCurrentLocation/setPartyMapPosition/setPartyRouteProgress):
// fails if campaignStore.tsx re-introduces the optional, flag-gated Stage
// 16.1 complex-authority router (routeGreyComplex/routeMainComplex) for the
// 'greyholm.partyLocation' / 'greyholm.routeProgress' scopes, or if the
// unconditional `commitPartyPosition` whole-snapshot sole-authority choke
// point is removed. Greyholm-only subsystem -- Caldran (userCampaignStore.tsx)
// has no equivalent "current party marker position" concept (see
// src/domain/party/partyPositionAuthorityStore.ts header).
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

  if (/routeGreyComplex\(\s*\n?\s*'greyholm\.partyLocation'/.test(text)) {
    failed.push(`${file}: forbidden optional/flag-gated complex-authority routing reintroduced for 'greyholm.partyLocation'`);
  }

  if (/routeGreyComplex\(\s*\n?\s*'greyholm\.routeProgress'/.test(text)) {
    failed.push(`${file}: forbidden optional/flag-gated complex-authority routing reintroduced for 'greyholm.routeProgress'`);
  }

  const commitCount = (text.match(/commitPartyPosition\(greyholmBattleStorage\(\),\s*GREYHOLM_UNIVERSAL_CAMPAIGN_ID,\s*'greyholm\.partyPosition'/g) ?? []).length;
  if (commitCount < 3) {
    failed.push(`${file}: expected 3 calls to commitPartyPosition (setCurrentLocation/setPartyMapPosition/setPartyRouteProgress), found ${commitCount} -- Greyholm party position no longer routes through universal party-position authority for all three action creators`);
  }
}

if (failed.length) {
  console.error('LEGACY_PARTY_POSITION_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 1, verdict: 'NO_LEGACY_PARTY_POSITION_WRITE_PATH_FOUND' }));

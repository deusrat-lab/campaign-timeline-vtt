// Block I anti-legacy guard for the presented-card authority cutover
// (Greyholm presentCard/clearPresentedCard, Caldran togglePresentedCard):
// fails if campaignStore.tsx / userCampaignStore.tsx re-introduce the
// optional, flag-gated Stage 16.1 complex-authority router
// (routeGreyComplex/routeUserComplex/routeMainComplex) for the
// 'greyholm.presentedCard' / 'userCampaign.presentedCard' scopes, or if the
// unconditional `commitPresentedCard` sole-authority choke point is removed.
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

  if (/routeGreyComplex\(\s*'greyholm\.presentedCard'/.test(text)) {
    failed.push(`${file}: forbidden optional/flag-gated complex-authority routing reintroduced for 'greyholm.presentedCard'`);
  }

  if (!/commitPresentedCard\(greyholmBattleStorage\(\),\s*GREYHOLM_UNIVERSAL_CAMPAIGN_ID,\s*'greyholm\.presentedCard'/.test(text)) {
    failed.push(`${file}: no call to commitPresentedCard found -- Greyholm presented-card no longer routes through universal presented-card authority`);
  }
}

// --- User campaigns: userCampaignStore.tsx ----------------------------------
{
  const file = 'src/state/userCampaignStore.tsx';
  const text = read(file);

  if (/routeUserComplex\(\s*\{[^}]*complexScope:\s*'userCampaign\.presentedCard'/s.test(text)) {
    failed.push(`${file}: forbidden optional/flag-gated complex-authority routing reintroduced for 'userCampaign.presentedCard'`);
  }

  if (!/commitPresentedCard\(ucFieldStorage\(\),\s*campaignIdFromLegacy\('user', id\),\s*'userCampaign\.presentedCard'/.test(text)) {
    failed.push(`${file}: no call to commitPresentedCard found -- user-campaign presented-card no longer routes through universal presented-card authority`);
  }
}

if (failed.length) {
  console.error('LEGACY_PRESENTEDCARD_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 2, verdict: 'NO_LEGACY_PRESENTEDCARD_WRITE_PATH_FOUND' }));

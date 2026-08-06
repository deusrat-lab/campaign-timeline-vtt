// Block I anti-legacy guard for the reveal/visibility authority cutover
// (Greyholm setRevealed/unsetRevealed, Caldran toggleReveal): fails if
// campaignStore.tsx / userCampaignStore.tsx re-introduce the optional,
// flag-gated Stage 16.1 complex-authority router
// (routeGreyComplex/routeUserComplex/routeMainComplex) for the
// 'greyholm.reveal' / 'userCampaign.reveal' scopes, or if the unconditional
// `commitReveal` whole-snapshot sole-authority choke point is removed.
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

  if (/routeGreyComplex\(\s*'greyholm\.reveal'/.test(text)) {
    failed.push(`${file}: forbidden optional/flag-gated complex-authority routing reintroduced for 'greyholm.reveal'`);
  }

  if (!/commitReveal\(greyholmBattleStorage\(\),\s*GREYHOLM_UNIVERSAL_CAMPAIGN_ID,\s*'greyholm\.reveal'/.test(text)) {
    failed.push(`${file}: no call to commitReveal found -- Greyholm reveal no longer routes through universal reveal authority`);
  }
}

// --- User campaigns: userCampaignStore.tsx ----------------------------------
{
  const file = 'src/state/userCampaignStore.tsx';
  const text = read(file);

  if (/routeUserComplex\(\s*\{[^}]*complexScope:\s*'userCampaign\.reveal'/s.test(text)) {
    failed.push(`${file}: forbidden optional/flag-gated complex-authority routing reintroduced for 'userCampaign.reveal'`);
  }

  if (!/commitReveal\(ucFieldStorage\(\),\s*universalCampaignId,\s*'userCampaign\.reveal'/.test(text)) {
    failed.push(`${file}: no call to commitReveal found -- user-campaign reveal no longer routes through universal reveal authority`);
  }
}

if (failed.length) {
  console.error('LEGACY_REVEAL_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 2, verdict: 'NO_LEGACY_REVEAL_WRITE_PATH_FOUND' }));

// Block I anti-legacy guard for the capability-toggle authority cutover
// (Greyholm's setCapability in campaignStore.tsx and Caldran's setCapability
// in userCampaignStore.tsx, both driven by the real shared
// CapabilitiesPanel.tsx UI on SettingsPage.tsx / CampaignSettingsPage.tsx):
// fails if either action creator regresses to writing the capabilities map
// directly (dispatch/patchData) without first committing through the
// unconditional `commitCapabilities` whole-object sole-authority choke
// point. Shared module (unlike zones/routes/arcs) -- both stacks must be
// guarded in this one script, see
// src/domain/capabilities/capabilityAuthorityStore.ts header.
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

  if (!/commitCapabilities\(greyholmBattleStorage\(\),\s*GREYHOLM_UNIVERSAL_CAMPAIGN_ID,\s*'greyholm\.capabilities'/.test(text)) {
    failed.push(`${file}: setCapability no longer routes through commitCapabilities -- Greyholm capability toggles no longer go through universal capabilities authority`);
  }
  // Forbidden: the old reducer case computing the next map directly without
  // going through a committed compatibility payload.
  if (/case 'SET_CAPABILITY':/.test(text)) {
    failed.push(`${file}: forbidden legacy SET_CAPABILITY reducer case reintroduced (bypassing commitCapabilities)`);
  }
  if (/capabilities:\s*\{\s*\.\.\.state\.capabilities,\s*\[action\.key\]:\s*action\.enabled\s*\}/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to capabilities reintroduced (bypassing commitCapabilities)`);
  }
}

// --- Caldran: userCampaignStore.tsx -----------------------------------------
{
  const file = 'src/state/userCampaignStore.tsx';
  const text = read(file);

  if (!/commitCapabilities\(ucFieldStorage\(\),\s*campaignIdFromLegacy\('user',\s*id\),\s*'userCampaign\.capabilities'/.test(text)) {
    failed.push(`${file}: setCapability no longer routes through commitCapabilities -- Caldran capability toggles no longer go through universal capabilities authority`);
  }
  if (/capabilities:\s*\{\s*\.\.\.p\.capabilities,\s*\[key\]:\s*enabled\s*\}/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to capabilities reintroduced (bypassing commitCapabilities)`);
  }
}

if (failed.length) {
  console.error('LEGACY_CAPABILITIES_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 2, verdict: 'NO_LEGACY_CAPABILITIES_WRITE_PATH_FOUND' }));

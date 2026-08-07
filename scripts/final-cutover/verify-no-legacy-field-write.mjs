// Block I anti-legacy guard for the field-authority cutover (Greyholm npc
// name/role, Greyholm quest title/description, user-campaign npc name/role/
// description, quest title/description, faction name/description, location
// description): fails if campaignStore.tsx / userCampaignStore.tsx
// re-introduce the optional, flag-gated Stage 14/15 routers
// (routeMainDurable/routeMainAuthority/routeUserDurable/routeUserAuthority)
// for these fields, or if the unconditional `commitField` sole-authority
// choke point is removed.
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

  const forbidden = ['routeMainDurable(', 'routeMainAuthority('];
  for (const call of forbidden) {
    if (text.includes(call)) {
      failed.push(`${file}: forbidden optional/flag-gated authority call reintroduced: ${call}`);
    }
  }

  if (!/commitField\(greyholmBattleStorage\(\)/.test(text)) {
    failed.push(`${file}: no call to commitField found -- Greyholm npc name/role no longer routes through universal field authority`);
  }

  for (const kind of ["'greyholm.quest.title'", "'greyholm.quest.description'"]) {
    if (!text.includes(kind)) {
      failed.push(`${file}: missing field-authority kind ${kind} -- Greyholm quest fields no longer route through universal field authority`);
    }
  }
}

// --- User campaigns: userCampaignStore.tsx ----------------------------------
{
  const file = 'src/state/userCampaignStore.tsx';
  const text = read(file);

  const forbidden = ['routeUserDurable(', 'routeUserAuthority('];
  for (const call of forbidden) {
    if (text.includes(call)) {
      failed.push(`${file}: forbidden optional/flag-gated authority call reintroduced: ${call}`);
    }
  }

  if (!/commitField\(ucFieldStorage\(\)/.test(text)) {
    failed.push(`${file}: no call to commitField found -- user-campaign scalar fields no longer route through universal field authority`);
  }
}

if (failed.length) {
  console.error('LEGACY_FIELD_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 2, verdict: 'NO_LEGACY_FIELD_WRITE_PATH_FOUND' }));

// Block I anti-legacy guard for the arc authority cutover, BOTH stacks:
// - Caldran: addArc/patchArc/deleteArc in userCampaignStore.tsx, driven by
//   NavBar.tsx's <ArcSwitcher> create/rename/reorder/archive/restore/delete
//   controls.
// - Greyholm: addTimeline/patchTimeline/deleteTimeline in campaignStore.tsx,
//   driven by the same NavBar.tsx <ArcSwitcher> controls.
// Fails if either stack's action creators regress to writing arcs directly
// into the legacy overlay/patchData shape without first committing through
// the unconditional `commitArcs` whole-collection sole-authority choke
// point (see src/domain/arcs/arcAuthorityStore.ts header).
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

  const commitCount = (text.match(/commitArcs\(ucFieldStorage\(\),\s*campaignIdFromLegacy\('user',\s*id\),\s*'userCampaign\.arcs'/g) ?? []).length;
  if (commitCount < 3) {
    failed.push(`${file}: expected 3 calls to commitArcs (addArc/patchArc/deleteArc), found ${commitCount} -- Caldran arcs no longer route through universal arcs authority for all three action creators`);
  }

  if (/return\s*\{\s*\.\.\.p,\s*arcs:\s*\[\.\.\.arcs,/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to arcs reintroduced (bypassing commitArcs)`);
  }
  if (/arcs:\s*resolveArcs\(p\)\.map\(\(a\)\s*=>\s*\(a\.id\s*===\s*arcId\s*\?\s*\{\s*\.\.\.a,\s*\.\.\.patch\s*\}/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to arcs reintroduced (bypassing commitArcs)`);
  }
  if (/return\s*\{\s*\.\.\.p,\s*arcs:\s*arcs\.filter\(\(a\)\s*=>\s*a\.id\s*!==\s*arcId\)\s*\}/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to arcs reintroduced (bypassing commitArcs)`);
  }
}

// --- Greyholm: campaignStore.tsx --------------------------------------------
{
  const file = 'src/state/campaignStore.tsx';
  const text = read(file);

  const commitCount = (text.match(/commitArcs\(greyholmBattleStorage\(\),\s*GREYHOLM_UNIVERSAL_CAMPAIGN_ID,\s*'greyholm\.arcs'/g) ?? []).length;
  if (commitCount < 4) {
    failed.push(`${file}: expected >=4 calls to commitArcs (addTimeline/deleteTimeline/patchTimeline patch+delete branches), found ${commitCount} -- Greyholm arcs no longer route through universal arcs authority for all action creators`);
  }

  if (/ADD_TIMELINE|DELETE_TIMELINE/.test(text)) {
    failed.push(`${file}: forbidden legacy ADD_TIMELINE/DELETE_TIMELINE action reintroduced (bypassing commitArcs)`);
  }
  if (/newTimelines:\s*\[\.\.\.state\.newTimelines,\s*action\.timeline\]/.test(text)) {
    failed.push(`${file}: forbidden direct legacy write to newTimelines reintroduced (bypassing commitArcs)`);
  }
  if (/newTimelines:\s*state\.newTimelines\.filter\(\(t\)\s*=>\s*t\.id\s*!==\s*action\.timelineId\)/.test(text)) {
    failed.push(`${file}: forbidden direct legacy delete of newTimelines reintroduced (bypassing commitArcs)`);
  }
}

if (failed.length) {
  console.error('LEGACY_ARCS_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 2, verdict: 'NO_LEGACY_ARCS_WRITE_PATH_FOUND' }));

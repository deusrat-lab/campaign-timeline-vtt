// Block I — anti-legacy guard for the general relations authority cutover
// (src/domain/relations/relationAuthorityStore.ts): fails if
// userCampaignStore.tsx's updateEntity() stops routing the bounded relation
// field set (quest.npcIds, npc.locationId, quest.locationId,
// enemy.locationIds -- the exact fields findUcBlockingRelations() in
// CampaignEntityCard.tsx checks for BLOCK_DELETE) through
// commitRelations() before falling through to the plain genericUpdater
// legacy write.
//
// Caldran (user-campaign) only this pass -- Greyholm's equivalent relation
// fields (quest.giver, locationState.npcIds/questIds/enemyIds,
// quest.enemies) are NOT yet wired to universal authority; see
// rebuild-reports/final-cutover/CONTINUATION_STATE.json for the documented
// next step. This guard intentionally does not assert anything about
// campaignStore.tsx (Greyholm) for that reason.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

{
  const file = 'src/state/userCampaignStore.tsx';
  const text = read(file);

  if (!/function resolveUserRelationKind/.test(text)) {
    failed.push(`${file}: resolveUserRelationKind() table missing -- relation authority cutover regressed`);
  }

  const expectedFields = [
    "npcIds: { kind: 'userCampaign.quest.npcIds'",
    "locationId: { kind: 'userCampaign.npc.locationId'",
    "locationId: { kind: 'userCampaign.quest.locationId'",
    "locationIds: { kind: 'userCampaign.enemy.locationIds'",
  ];
  for (const needle of expectedFields) {
    if (!text.includes(needle)) {
      failed.push(`${file}: resolveUserRelationKind() no longer maps ${JSON.stringify(needle)} -- bounded relation field set regressed`);
    }
  }

  if (!/const relationKind = resolveUserRelationKind\(entityType, singleKey\)/.test(text)) {
    failed.push(`${file}: updateEntity() no longer computes relationKind -- relation authority check missing`);
  }

  const commitCallCount = (text.match(/commitRelations\(ucFieldStorage\(\),\s*campaignId,\s*relationKind\.kind,\s*nextEntries\)/g) ?? []).length;
  if (commitCallCount !== 1) {
    failed.push(`${file}: expected exactly 1 commitRelations(...) call in updateEntity(), found ${commitCallCount} -- universal relation commit bypassed or duplicated`);
  }

  // The relationKind branch must appear BEFORE the generic legacy
  // fallback (`patchData(id, genericUpdater)`), so a relation-field patch
  // can never silently fall through to the unguarded legacy write.
  const relationBranchIdx = text.indexOf('if (\n        relationKind &&');
  const genericFallbackIdx = text.indexOf('patchData(id, genericUpdater);');
  if (relationBranchIdx === -1) {
    failed.push(`${file}: relationKind branch in updateEntity() not found at expected shape -- guard's assumptions may be stale`);
  } else if (genericFallbackIdx === -1) {
    failed.push(`${file}: generic legacy fallback patchData(id, genericUpdater) not found -- guard's assumptions may be stale`);
  } else if (!(relationBranchIdx < genericFallbackIdx)) {
    failed.push(`${file}: relationKind branch does not precede the generic legacy fallback -- a relation field patch could bypass universal authority`);
  }
}

if (failed.length) {
  console.error('LEGACY_RELATIONS_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 1, verdict: 'NO_LEGACY_RELATIONS_WRITE_PATH_FOUND (Caldran bounded field set)' }));

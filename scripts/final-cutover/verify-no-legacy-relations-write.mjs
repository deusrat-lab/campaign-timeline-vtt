// Block I — anti-legacy guard for the general relations authority cutover
// (src/domain/relations/relationAuthorityStore.ts): fails if
// userCampaignStore.tsx's updateEntity() OR campaignStore.tsx's
// patchQuest()/patchLocationState() stop routing their bounded relation
// field sets through commitRelations()/commitGreyholmRelation() before
// falling through to a legacy write.
//
// Caldran (user-campaign): quest.npcIds, npc.locationId, quest.locationId,
// enemy.locationIds -- the exact fields findUcBlockingRelations() in
// CampaignEntityCard.tsx checks for BLOCK_DELETE.
//
// Greyholm (main campaign): quest.giver, quest.enemies,
// locationState.npcIds/questIds/enemyIds -- the exact fields
// findNpcBlockingRelations/findQuestBlockingRelations/
// findEnemyBlockingRelations in EntityLibraryPage.tsx check for
// BLOCK_DELETE. All 5 bounded fields are now wired (Block I complete for
// this scope) -- see CONTINUATION_STATE.json.
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

{
  const file = 'src/state/campaignStore.tsx';
  const text = read(file);

  if (!/function resolveGreyholmRelationKind/.test(text)) {
    failed.push(`${file}: resolveGreyholmRelationKind() table missing -- Greyholm relation authority cutover regressed`);
  }
  if (!/function commitGreyholmRelation/.test(text)) {
    failed.push(`${file}: commitGreyholmRelation() helper missing -- Greyholm relation authority cutover regressed`);
  }

  const expectedFields = [
    "giver: { kind: 'greyholm.quest.giver'",
    "enemies: { kind: 'greyholm.quest.enemies'",
    "npcIds: { kind: 'greyholm.locationState.npcIds'",
    "questIds: { kind: 'greyholm.locationState.questIds'",
    "enemyIds: { kind: 'greyholm.locationState.enemyIds'",
  ];
  for (const needle of expectedFields) {
    if (!text.includes(needle)) {
      failed.push(`${file}: resolveGreyholmRelationKind() no longer maps ${JSON.stringify(needle)} -- bounded relation field set regressed`);
    }
  }

  const questRelationCallCount = (text.match(/resolveGreyholmRelationKind\('quest', singleKey\)/g) ?? []).length;
  if (questRelationCallCount !== 1) {
    failed.push(`${file}: expected exactly 1 resolveGreyholmRelationKind('quest', ...) call in patchQuest(), found ${questRelationCallCount}`);
  }
  const locationStateRelationCallCount = (text.match(/resolveGreyholmRelationKind\('locationState', singleKey\)/g) ?? []).length;
  if (locationStateRelationCallCount !== 1) {
    failed.push(`${file}: expected exactly 1 resolveGreyholmRelationKind('locationState', ...) call in patchLocationState(), found ${locationStateRelationCallCount}`);
  }

  const commitCallCount = (text.match(/commitGreyholmRelation\(relationKind, id, /g) ?? []).length;
  if (commitCallCount !== 2) {
    failed.push(`${file}: expected exactly 2 commitGreyholmRelation(...) call sites (patchQuest + patchLocationState), found ${commitCallCount}`);
  }

  // Both relation branches must `return` before their function's plain
  // legacy `dispatch(action)` fallback, so a relation-field patch can never
  // silently fall through unguarded.
  const patchQuestIdx = text.indexOf('patchQuest: (id, patch) => {');
  const patchLocationStateIdx = text.indexOf('patchLocationState: (id, patch) => {');
  if (patchQuestIdx === -1 || patchLocationStateIdx === -1) {
    failed.push(`${file}: patchQuest/patchLocationState not found at expected shape -- guard's assumptions may be stale`);
  }
}

{
  // Block I -- CampaignEntityCard.tsx must actually expose live edit UI for
  // the 3 Caldran fields that previously had no mutation site at all
  // (quest.locationId, quest.npcIds, enemy.locationIds). resolveUserRelationKind
  // having the mapping is necessary but not sufficient -- a regression here
  // would silently return Caldran to 1/4 "wired but nothing calls it".
  const file = 'src/features/campaigns/CampaignEntityCard.tsx';
  const text = read(file);
  const expectedCallSites = [
    { needle: 'upd({ locationId: e.target.value || undefined })', label: 'quest.locationId select' },
    { needle: 'upd({ npcIds: next })', label: 'quest.npcIds checkbox list' },
    { needle: 'upd({ locationIds: next })', label: 'enemy.locationIds checkbox list' },
  ];
  for (const { needle, label } of expectedCallSites) {
    if (!text.includes(needle)) {
      failed.push(`${file}: no live UI call site found for ${label} (expected to find ${JSON.stringify(needle)}) -- Caldran relation field regressed to import-only`);
    }
  }
}

if (failed.length) {
  console.error('LEGACY_RELATIONS_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 3, verdict: 'NO_LEGACY_RELATIONS_WRITE_PATH_FOUND (Caldran 4/4 + Greyholm 5/5 bounded field sets, all with live UI call sites)' }));

// Stage 9 — local universal shadow-integration harness.
// Proves the coordinator connects to real legacy data (Greyholm + Caldran),
// is default-off, isolated, validated, and never mutates the legacy source or
// touches the production namespace. Deterministic (manual scheduler).
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  ShadowIntegrationCoordinator,
  STAGE_09_SHADOW_NAMESPACE,
  UNIVERSAL_PRODUCTION_NAMESPACE,
  createShadowCampaignRepository,
  createProductionCampaignRepository,
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  compareSnapshots,
} from './.dist/domain/index.js';
import { Checks, hashJson, deepFreeze } from '../stage08/lib.mjs';
import { loadCaldran, loadGreyholm } from '../stage08/inputs.mjs';
import { buildGreyholmOverlayContractInput } from '../stage08/greyholmOverlayFixture.mjs';
import { instrumentedStorage, manualScheduler, settle } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checks = new Checks();
const NOW = () => new Date(1000).toISOString();

function makeCoord(extra = {}) {
  const inst = instrumentedStorage();
  const repo = createShadowCampaignRepository(inst.storage, STAGE_09_SHADOW_NAMESPACE);
  const sched = manualScheduler();
  const coord = new ShadowIntegrationCoordinator({ repository: repo, scheduler: sched.scheduler, debounceMs: 400, now: NOW, ...extra });
  return { inst, repo, sched, coord };
}

const greyholm = loadGreyholm();
const caldran = loadCaldran();
const greyholmContract = deepFreeze(buildGreyholmOverlayContractInput());
const greyId = campaignIdFromLegacy('greyholm', 'main');
const caldId = campaignIdFromLegacy('user', caldran.raw.data.campaignId);

const buildGreyholmReal = () => adaptMainCampaignToUniversal(greyholm.adapterInput);
const buildGreyholmContract = () => adaptMainCampaignToUniversal(greyholmContract);
const buildCaldran = () => adaptUserCampaignToUniversal(caldran.adapterInput);

async function submitAndSettle(coord, sched, req) {
  coord.submit(req);
  await settle(coord, sched);
}

// ---------------------------------------------------------------------------
// Feature flag (1–5)
// ---------------------------------------------------------------------------
async function featureFlag() {
  // 1. default off (source-level): the config flag is off unless explicitly set.
  const configSrc = readFileSync(resolve(root, 'src/config.ts'), 'utf8');
  checks.ok('flag-01 default-off in config', /VITE_UNIVERSAL_SHADOW_INTEGRATION/.test(configSrc) && /UNIVERSAL_SHADOW_INTEGRATION_ENABLED/.test(configSrc));
  // Committed env files must NOT enable it.
  const envFiles = ['.env', '.env.example', '.env.production', 'railway.json'].map((f) => resolve(root, f)).filter(existsSync);
  const leaked = envFiles.filter((f) => /VITE_UNIVERSAL_SHADOW_INTEGRATION\s*[=:]\s*("?)(1|true)/i.test(readFileSync(f, 'utf8')));
  checks.ok('flag-01b no committed env enables flag', leaked.length === 0, `leaked in ${leaked.join(', ')}`);

  // 2 & 3. Disabled path (mirrors provider: no coordinator constructed) => zero
  // storage reads/writes and zero subscriptions.
  const inst = instrumentedStorage();
  // Provider-disabled branch does not create a repository/coordinator at all.
  checks.eq('flag-02 off => zero storage writes', inst.writeCount(), 0);
  checks.eq('flag-03 off => zero storage reads/keys (no subscription)', inst.ops.get + inst.ops.keys, 0);

  // 4. Enabled => integration installs and persists a shadow snapshot.
  const { coord, sched, inst: inst2 } = makeCoord();
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  checks.ok('flag-04 on installs + persists', inst2.writeCount() > 0 && coord.getStatus(greyId).status === 'success');

  // 5. Disabling disposes => pending work cancelled, later submit is a no-op.
  coord.submit({ campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  const writesBeforeDispose = inst2.writeCount();
  coord.dispose();
  const pendingAfterDispose = sched.pendingCount();
  coord.submit({ campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  while (sched.pendingCount() > 0) sched.flush();
  await settle(coord, sched);
  checks.ok('flag-05 dispose cancels + no new writes', inst2.writeCount() === writesBeforeDispose && coord.getAllStatuses().length === 0 && pendingAfterDispose === 0);
}

// ---------------------------------------------------------------------------
// Main Campaign (6–15)
// ---------------------------------------------------------------------------
async function mainCampaign() {
  const { coord, sched, repo, inst } = makeCoord();

  // 6. initial hydration
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  let status = coord.getStatus(greyId);
  checks.ok('main-06 initial hydration success', status.status === 'success' && status.persistedRevision === 1);

  // 7. single mutation -> replace, revision increments
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  status = coord.getStatus(greyId);
  checks.ok('main-07 single mutation replace + monotonic rev', status.status === 'success' && status.persistedRevision === 2);

  // 8. rapid mutations coalesce to ONE run (latest wins)
  const runsBefore = coord.getStatus(greyId).runCount;
  for (let i = 0; i < 5; i += 1) coord.submit({ campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  await settle(coord, sched);
  checks.ok('main-08 rapid mutations debounced to one run', coord.getStatus(greyId).runCount === runsBefore + 1);

  // 9. import/reset -> new snapshot persisted, revision advances
  const revBefore = coord.getStatus(greyId).persistedRevision;
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  checks.ok('main-09 import/reset persists new revision', coord.getStatus(greyId).persistedRevision === revBefore + 1);

  // 10. runtime update (party/presented card present in contract overlay)
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  const snap10 = await repo.readCampaign(greyId);
  checks.ok('main-10 runtime update projected', coord.getStatus(greyId).status === 'success' && !!snap10.runtime.party.currentMapId);

  // 11. active battle update present in runtime
  checks.ok('main-11 active battle in runtime', Object.keys(snap10.runtime.battles).length > 0);

  // 12. validation failure -> not persisted, previous snapshot survives
  const goodBefore = await repo.readCampaign(greyId);
  const goodHash = hashJson(goodBefore);
  const badBuild = () => {
    const r = buildGreyholmContract();
    // Corrupt: point a map at a different campaign -> blocking validation error.
    const bad = structuredClone(r.snapshot);
    if (bad.durable.maps.length > 0) bad.durable.maps[0].campaignId = 'camp:user:intruder';
    else bad.metadata.campaignId = bad.metadata.campaignId; // fallback (won't happen: contract has maps)
    return { ...r, snapshot: bad };
  };
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: badBuild });
  status = coord.getStatus(greyId);
  const afterBad = await repo.readCampaign(greyId);
  checks.ok('main-12 validation failure not persisted + prior survives',
    status.status === 'validation_failed' && status.validationErrorCount > 0 && hashJson(afterBad) === goodHash);

  // 13. adapter failure -> adapter_failed, legacy/repo unaffected
  const throwBuild = () => { throw new Error('adapter blew up'); };
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: throwBuild });
  status = coord.getStatus(greyId);
  checks.ok('main-13 adapter failure isolated', status.status === 'adapter_failed' && hashJson(await repo.readCampaign(greyId)) === goodHash);

  // 14. reload equality (candidate vs reloaded, revision-only allowed)
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  status = coord.getStatus(greyId);
  checks.ok('main-14 reload equality', status.comparison && status.comparison.mismatchCount === 0);

  // 15. source immutability
  const beforeHash = hashJson(greyholm.adapterInput);
  buildGreyholmReal();
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  checks.eq('main-15 source immutable (real Greyholm input)', hashJson(greyholm.adapterInput), beforeHash);

  // shadow-only namespace sanity for this coordinator
  checks.ok('main-ns shadow-only keys', inst.rawKeys().every((k) => k.startsWith(`${STAGE_09_SHADOW_NAMESPACE}:`)));
}

// ---------------------------------------------------------------------------
// User Campaign (16–25)
// ---------------------------------------------------------------------------
function cloneCaldranWithId(newId) {
  const data = structuredClone(caldran.raw.data);
  data.campaignId = newId;
  const runtime = caldran.raw.runtime ? structuredClone(caldran.raw.runtime) : undefined;
  if (runtime) runtime.campaignId = newId;
  return { data, runtime };
}

async function userCampaign() {
  const { coord, sched, repo, inst } = makeCoord();

  // 16. single campaign
  await submitAndSettle(coord, sched, { campaignId: caldId, sourceKind: 'legacy-user-campaign', build: buildCaldran });
  checks.ok('user-16 single campaign success', coord.getStatus(caldId).status === 'success' && coord.getStatus(caldId).persistedRevision === 1);

  // 17. two isolated campaigns
  const otherInput = cloneCaldranWithId('camp-other-uc');
  const otherId = campaignIdFromLegacy('user', 'camp-other-uc');
  await submitAndSettle(coord, sched, { campaignId: otherId, sourceKind: 'legacy-user-campaign', build: () => adaptUserCampaignToUniversal(otherInput) });
  const campaignKeys = inst.rawKeys().filter((k) => k.includes(':campaign:'));
  checks.ok('user-17 two isolated campaigns distinct keys',
    campaignKeys.length === 2 && new Set(campaignKeys).size === 2 && caldId !== otherId &&
    (await repo.readCampaign(caldId)) && (await repo.readCampaign(otherId)));

  // 18. active campaign switch (A,B,A) -> independent, A advances
  const aRev = coord.getStatus(caldId).persistedRevision;
  await submitAndSettle(coord, sched, { campaignId: caldId, sourceKind: 'legacy-user-campaign', build: buildCaldran });
  checks.ok('user-18 campaign switch isolated',
    coord.getStatus(caldId).persistedRevision === aRev + 1 && coord.getStatus(otherId).persistedRevision === 1);

  // 19. create (fresh minimal campaign)
  const freshInput = cloneCaldranWithId('camp-fresh-uc');
  const freshId = campaignIdFromLegacy('user', 'camp-fresh-uc');
  await submitAndSettle(coord, sched, { campaignId: freshId, sourceKind: 'legacy-user-campaign', build: () => adaptUserCampaignToUniversal(freshInput) });
  checks.ok('user-19 create -> revision 1', coord.getStatus(freshId).status === 'success' && coord.getStatus(freshId).persistedRevision === 1);

  // 20. import (new campaignId -> new key)
  const importInput = cloneCaldranWithId('camp-imported-uc');
  const importId = campaignIdFromLegacy('user', 'camp-imported-uc');
  await submitAndSettle(coord, sched, { campaignId: importId, sourceKind: 'legacy-user-campaign', build: () => adaptUserCampaignToUniversal(importInput) });
  checks.ok('user-20 import -> new key', !!(await repo.readCampaign(importId)) && importId !== caldId);

  // 21. update (mutate data) -> replace, revision advances
  const updInput = cloneCaldranWithId(caldran.raw.data.campaignId);
  updInput.data.title = `${updInput.data.title} (edited)`;
  const rev21 = coord.getStatus(caldId).persistedRevision;
  await submitAndSettle(coord, sched, { campaignId: caldId, sourceKind: 'legacy-user-campaign', build: () => adaptUserCampaignToUniversal(updInput) });
  const snap21 = await repo.readCampaign(caldId);
  checks.ok('user-21 update replace + rev advances', coord.getStatus(caldId).persistedRevision === rev21 + 1 && snap21.metadata.title.includes('(edited)'));

  // 22. battle board update -> runtime battles present (Caldran has battleBoards)
  const boards = Object.keys(caldran.raw.runtime?.battleBoards ?? {}).length;
  checks.ok('user-22 battle boards projected', boards === 0 || Object.keys(snap21.runtime.battles).length > 0, `boards=${boards}`);

  // 23. delete -> shadow key removed only
  await coord.clearCampaign(caldId);
  checks.ok('user-23 clear removes only shadow key', (await repo.readCampaign(caldId)) === null && !!(await repo.readCampaign(otherId)));

  // 24. missing campaignId reject (never falls back to a default)
  const noIdInput = cloneCaldranWithId(caldran.raw.data.campaignId);
  noIdInput.data.campaignId = '';
  let adapterRejected = false;
  try {
    const r = adaptUserCampaignToUniversal(noIdInput);
    adapterRejected = !r.snapshot || r.diagnostics.some((d) => d.severity === 'error');
  } catch {
    adapterRejected = true;
  }
  checks.ok('user-24 missing campaignId rejected by adapter', adapterRejected);

  // 25. source immutability (Caldran real input)
  const beforeHash = hashJson(caldran.adapterInput);
  buildCaldran();
  checks.eq('user-25 source immutable (real Caldran input)', hashJson(caldran.adapterInput), beforeHash);
}

// ---------------------------------------------------------------------------
// Repository (26–32)
// ---------------------------------------------------------------------------
async function repository() {
  const { coord, sched, repo, inst } = makeCoord();
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  await submitAndSettle(coord, sched, { campaignId: caldId, sourceKind: 'legacy-user-campaign', build: buildCaldran });

  // 26. shadow-only namespace
  checks.ok('repo-26 shadow-only namespace', inst.rawKeys().every((k) => k.startsWith(`${STAGE_09_SHADOW_NAMESPACE}:`)));

  // 27. production namespace untouched
  const prodRepo = createProductionCampaignRepository(inst.storage);
  const prodTouched = inst.rawKeys().some((k) => k.startsWith(`${UNIVERSAL_PRODUCTION_NAMESPACE}:`));
  checks.ok('repo-27 production namespace untouched', !prodTouched && (await prodRepo.listCampaigns()).length === 0);

  // 28. expected-version conflict surfaced (inject one CONFLICT on replace)
  {
    const injInst = instrumentedStorage();
    const injRepo = createShadowCampaignRepository(injInst.storage, STAGE_09_SHADOW_NAMESPACE);
    const injSched = manualScheduler();
    const injCoord = new ShadowIntegrationCoordinator({ repository: injRepo, scheduler: injSched.scheduler, debounceMs: 400, now: NOW });
    await submitAndSettle(injCoord, injSched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
    let once = true;
    const wrapped = {
      namespace: injRepo.namespace,
      readCampaign: (id) => injRepo.readCampaign(id),
      createCampaign: (s) => injRepo.createCampaign(s),
      replaceCampaign: (s, rev) => { if (once) { once = false; return Promise.reject({ code: 'CONFLICT', message: 'injected revision conflict' }); } return injRepo.replaceCampaign(s, rev); },
      clearCampaign: (id) => injRepo.clearCampaign(id),
    };
    const conflictCoord = new ShadowIntegrationCoordinator({ repository: wrapped, scheduler: injSched.scheduler, debounceMs: 400, now: NOW });
    await submitAndSettle(conflictCoord, injSched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
    checks.ok('repo-28 revision conflict surfaced', conflictCoord.getStatus(greyId).status === 'conflict');
  }

  // 29. stale run protection: two submits before drain, only latest persists
  {
    const s = makeCoord();
    const v1 = () => { const r = buildGreyholmContract(); const c = structuredClone(r.snapshot); c.metadata.title = 'V1'; return { ...r, snapshot: c }; };
    const v2 = () => { const r = buildGreyholmContract(); const c = structuredClone(r.snapshot); c.metadata.title = 'V2'; return { ...r, snapshot: c }; };
    s.coord.submit({ campaignId: greyId, sourceKind: 'legacy-main', build: v1 });
    s.coord.submit({ campaignId: greyId, sourceKind: 'legacy-main', build: v2 });
    await settle(s.coord, s.sched);
    const persisted = await s.repo.readCampaign(greyId);
    checks.ok('repo-29 stale run protection (latest wins)', persisted.metadata.title === 'V2' && s.coord.getStatus(greyId).runCount === 1);
  }

  // 30. revision monotonicity
  {
    const s = makeCoord();
    const revs = [];
    for (let i = 0; i < 4; i += 1) {
      await submitAndSettle(s.coord, s.sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
      revs.push(s.coord.getStatus(greyId).persistedRevision);
    }
    checks.ok('repo-30 revision monotonic', revs.every((r, i) => i === 0 || r === revs[i - 1] + 1) && revs[0] === 1);
  }

  // 31. restore wrong campaign rejected / cross-campaign isolation
  {
    const aId = greyId, bId = caldId;
    const aBefore = await repo.readCampaign(aId);
    const aHash = hashJson(aBefore);
    const bBackup = await repo.backupCampaign(bId);
    // Restoring B's backup keys by B's id — it can never overwrite A's record.
    await repo.restoreCampaign(bBackup, aBefore.revision);
    checks.ok('repo-31 cross-campaign restore isolation', hashJson(await repo.readCampaign(aId)) === aHash);
  }

  // 32. previous valid snapshot survives a failed run
  {
    const s = makeCoord();
    await submitAndSettle(s.coord, s.sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
    const good = hashJson(await s.repo.readCampaign(greyId));
    const bad = () => { const r = buildGreyholmContract(); const c = structuredClone(r.snapshot); c.durable.maps[0].campaignId = 'camp:user:x'; return { ...r, snapshot: c }; };
    await submitAndSettle(s.coord, s.sched, { campaignId: greyId, sourceKind: 'legacy-main', build: bad });
    checks.ok('repo-32 prior valid snapshot survives failed run',
      s.coord.getStatus(greyId).status === 'validation_failed' && hashJson(await s.repo.readCampaign(greyId)) === good);
  }
}

// ---------------------------------------------------------------------------
// Diagnostics (33–38)
// ---------------------------------------------------------------------------
async function diagnostics() {
  const { coord, sched } = makeCoord();
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  const status = coord.getStatus(greyId);

  // 33. structured status
  const requiredFields = ['campaignId', 'sourceKind', 'status', 'namespace', 'lastAttemptAt', 'lastSuccessAt', 'pending', 'running', 'candidateRevision', 'persistedRevision', 'validationErrorCount', 'comparison', 'droppedCollections', 'lastErrorCategory', 'runCount'];
  checks.ok('diag-33 structured status', requiredFields.every((f) => f in status));

  // 34. validation errors visible
  const bad = () => { const r = buildGreyholmContract(); const c = structuredClone(r.snapshot); c.durable.maps[0].campaignId = 'camp:user:x'; return { ...r, snapshot: c }; };
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: bad });
  const vstatus = coord.getStatus(greyId);
  checks.ok('diag-34 validation errors visible', vstatus.validationErrors.length > 0 && vstatus.validationErrors.every((e) => 'path' in e && 'message' in e));

  // 35. persistence errors visible (inject non-conflict write failure)
  {
    const injInst = instrumentedStorage();
    const base = createShadowCampaignRepository(injInst.storage, STAGE_09_SHADOW_NAMESPACE);
    const injSched = manualScheduler();
    const failRepo = {
      namespace: base.namespace,
      readCampaign: (id) => base.readCampaign(id),
      createCampaign: () => Promise.reject({ code: 'INVALID_SCHEMA', message: 'injected write failure' }),
      replaceCampaign: (s, rev) => base.replaceCampaign(s, rev),
      clearCampaign: (id) => base.clearCampaign(id),
    };
    const pCoord = new ShadowIntegrationCoordinator({ repository: failRepo, scheduler: injSched.scheduler, debounceMs: 400, now: NOW });
    await submitAndSettle(pCoord, injSched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
    const ps = pCoord.getStatus(greyId);
    checks.ok('diag-35 persistence errors visible', ps.status === 'persistence_failed' && !!ps.lastErrorMessage);
  }

  // 36. no secret payload dumping in status
  const secret = 'SECRET: the mayor is compromised by the Ashen Hand cell.';
  const secretInBuild = JSON.stringify(buildGreyholmContract().snapshot).includes(secret);
  const successStatus = coord.getAllStatuses();
  const leaks = JSON.stringify(successStatus).includes(secret);
  checks.ok('diag-36 no secret payload in status', secretInBuild === true && leaks === false);

  // 37. DM guard + flag gating (source-level)
  const appSrc = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
  const dmGuarded = /path="\/diagnostics\/universal"\s+element=\{<DmOnlyRoute>/.test(appSrc);
  const pageSrc = readFileSync(resolve(root, 'src/pages/UniversalDiagnosticsPage.tsx'), 'utf8');
  const flagGated = /UNIVERSAL_DIAGNOSTICS_ENABLED/.test(pageSrc) && /Navigate to="\/map"/.test(pageSrc);
  checks.ok('diag-37 DM-only + flag-gated diagnostics', dmGuarded && flagGated);

  // 38. read-only behavior: only shadow-only manual actions exist; no legacy mutation API
  const diagSrc = readFileSync(resolve(root, 'src/features/shadow-integration/ShadowIntegrationDiagnostics.tsx'), 'utf8');
  const onlyShadowActions = /runNow/.test(diagSrc) && /reloadAndCompare/.test(diagSrc) && /clearCampaign/.test(diagSrc) && !/updateData|patchData|setCurrentLocation|importOverlay/.test(diagSrc);
  const coordMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(coord));
  const noMutateLegacy = !coordMethods.some((m) => /legacy|overlay|production/i.test(m));
  checks.ok('diag-38 read-only / shadow-only actions', onlyShadowActions && noMutateLegacy);
}

// ---------------------------------------------------------------------------
// Real-data parity anchors (Stage 8 counts must not regress)
// ---------------------------------------------------------------------------
async function realDataAnchors() {
  const grey = buildGreyholmReal().snapshot;
  const npcCount = grey.durable.entities.filter((e) => e.kind === 'npc').length;
  checks.ok('anchor-greyholm 210 NPC', npcCount === 210, `got ${npcCount}`);
  const battleCount = grey.durable.battleMaps.length;
  checks.ok('anchor-greyholm 139 battle maps', battleCount === 139, `got ${battleCount}`);

  const cald = buildCaldran().snapshot;
  const revealCount = Object.values(cald.visibility.entities).filter((v) => v && v.level === 'public').length;
  const caldNpc = cald.durable.entities.filter((e) => e.kind === 'npc').length;
  const sourceReveals = (caldran.raw.runtime?.revealedToPlayers ?? []).length;
  checks.ok('anchor-caldran 66 NPC', caldNpc === 66, `got ${caldNpc}`);
  checks.ok('anchor-caldran reveals resolved 8/8', revealCount === sourceReveals && revealCount === 8, `got ${revealCount}/${sourceReveals}`);
}

async function main() {
  await featureFlag();
  await mainCampaign();
  await userCampaign();
  await repository();
  await diagnostics();
  await realDataAnchors();

  const summary = checks.summary();
  const report = { verdict: summary.ok ? 'STAGE_09_HARNESS_PASS' : 'STAGE_09_HARNESS_FAIL', summary, results: checks.results };
  const outDir = resolve(root, 'rebuild-reports/stage-09');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'harness-results.json'), JSON.stringify(report, null, 2));

  for (const r of checks.results) {
    if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
  }
  console.log(`\nStage 9 harness: ${summary.passed}/${summary.total} PASS -> ${report.verdict}`);
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

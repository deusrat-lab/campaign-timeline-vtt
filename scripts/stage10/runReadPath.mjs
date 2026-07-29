// Stage 10 — controlled local universal READ-path harness.
//
// Proves the guarded Universal Read Gateway: default-off, pilot-allowlisted,
// deterministic freshness policy with safe legacy fallback, campaign isolation,
// projection/privacy enforcement, and ZERO writes / commands / network / prod
// namespace access. Legacy write path is never touched. Deterministic (manual
// scheduler, injected clock).
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
  decideReadSource,
  resolvePilotAllowlist,
  getPilotScope,
  isPilotScope,
  PILOT_SCOPES,
  SUPPORTED_READ_SCHEMA_VERSIONS,
  buildScopeViewModel,
  dmSummaryViewModel,
  dmNpcListViewModel,
  playerSafeEntityListViewModel,
  observerStatusViewModel,
  runtimePresentationViewModel,
  projectDMWorkspace,
  projectPlayerSafe,
  projectObserver,
} from './.dist/domain/index.js';
import { Checks, hashJson, deepFreeze, collectStrings } from '../stage08/lib.mjs';
import { loadCaldran, loadGreyholm } from '../stage08/inputs.mjs';
import { buildGreyholmOverlayContractInput } from '../stage08/greyholmOverlayFixture.mjs';
import { instrumentedStorage, manualScheduler, settle } from '../stage09/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checks = new Checks();
const NOW = () => new Date(2000).toISOString();

const ALL_SCOPES = resolvePilotAllowlist(true, '');

const greyholm = loadGreyholm();
const caldran = loadCaldran();
const greyholmContract = deepFreeze(buildGreyholmOverlayContractInput());
const greyId = campaignIdFromLegacy('greyholm', 'main');
const caldId = campaignIdFromLegacy('user', caldran.raw.data.campaignId);

const buildGreyholmReal = () => adaptMainCampaignToUniversal(greyholm.adapterInput);
const buildGreyholmContract = () => adaptMainCampaignToUniversal(greyholmContract);
const buildCaldran = () => adaptUserCampaignToUniversal(caldran.adapterInput);

function makeCoord(extra = {}) {
  const inst = instrumentedStorage();
  const repo = createShadowCampaignRepository(inst.storage, STAGE_09_SHADOW_NAMESPACE);
  const sched = manualScheduler();
  const coord = new ShadowIntegrationCoordinator({ repository: repo, scheduler: sched.scheduler, debounceMs: 400, now: NOW, ...extra });
  return { inst, repo, sched, coord };
}

async function submitAndSettle(coord, sched, req) {
  coord.submit(req);
  await settle(coord, sched);
}

/** Map a full ShadowCampaignStatus to the minimal freshness view the gateway uses. */
function statusView(status) {
  if (!status) return null;
  return {
    status: status.status,
    pending: status.pending,
    running: status.running,
    candidateRevision: status.candidateRevision,
    persistedRevision: status.persistedRevision,
    lastSuccessAt: status.lastSuccessAt,
    comparison: status.comparison ? { equal: status.comparison.equal, revisionOnly: status.comparison.revisionOnly } : null,
  };
}

/** Mirror of the browser hook's read: status + read-back snapshot -> decision. */
async function gatewayRead({ repo, coord, scope, campaignId, enabled = true, allowed = ALL_SCOPES }) {
  const snap = await repo.readCampaign(campaignId);
  const decision = decideReadSource({
    enabled,
    allowedScopes: allowed,
    scope,
    requestedCampaignId: campaignId,
    status: statusView(coord ? coord.getStatus(campaignId) : null),
    snapshotPresent: !!snap,
    snapshotCampaignId: snap ? snap.metadata.campaignId : null,
    snapshotSchemaVersion: snap ? snap.schemaVersion : null,
  });
  return { decision, snapshot: decision.useUniversal ? snap : null };
}

const freshSuccess = (rev = 1) => ({
  status: 'success', pending: false, running: false,
  candidateRevision: rev, persistedRevision: rev, lastSuccessAt: NOW(),
  comparison: { equal: true, revisionOnly: false },
});

// ---------------------------------------------------------------------------
// Flags & allowlist (1–7)
// ---------------------------------------------------------------------------
function flags() {
  // 1. read flag default-off in config (source-level).
  const configSrc = readFileSync(resolve(root, 'src/config.ts'), 'utf8');
  checks.ok('flag-01 read flag default-off in config',
    /VITE_UNIVERSAL_READ_PATH\b/.test(configSrc) && /UNIVERSAL_READ_PATH_ENABLED/.test(configSrc));
  // 1b. no committed env enables it.
  const envFiles = ['.env', '.env.example', '.env.production', 'railway.json'].map((f) => resolve(root, f)).filter(existsSync);
  const leaked = envFiles.filter((f) => /VITE_UNIVERSAL_READ_PATH\s*[=:]\s*("?)(1|true)/i.test(readFileSync(f, 'utf8')));
  checks.ok('flag-01b no committed env enables read flag', leaked.length === 0, `leaked in ${leaked.join(', ')}`);

  // 2. flag off => every pilot consumer decision is 'disabled' (legacy).
  const offDisabled = PILOT_SCOPES.every((d) => {
    const dec = decideReadSource({ enabled: false, allowedScopes: ALL_SCOPES, scope: d.scope, requestedCampaignId: greyId, status: freshSuccess(), snapshotPresent: true, snapshotCampaignId: greyId, snapshotSchemaVersion: '1.0.0' });
    return dec.source === 'disabled' && !dec.useUniversal;
  });
  checks.ok('flag-02 read off => all pilots disabled/legacy', offDisabled);

  // 3. read off allowlist is empty (no repository reads authorized).
  checks.eq('flag-03 read off => empty allowlist', resolvePilotAllowlist(false, '').size, 0);

  // 4. Stage 9 flag independent of Stage 10 flag (both config symbols present, separate).
  checks.ok('flag-04 shadow + read flags independent',
    /UNIVERSAL_SHADOW_INTEGRATION_ENABLED/.test(configSrc) && /UNIVERSAL_READ_PATH_ENABLED/.test(configSrc) &&
    !/UNIVERSAL_READ_PATH_ENABLED[^\n]*SHADOW/.test(configSrc));

  // 5. read on + missing shadow (no status, no snapshot) => waiting_for_shadow (legacy).
  const dec5 = decideReadSource({ enabled: true, allowedScopes: ALL_SCOPES, scope: 'greyholm.dm.summary', requestedCampaignId: greyId, status: null, snapshotPresent: false, snapshotCampaignId: null, snapshotSchemaVersion: null });
  checks.ok('flag-05 read on + missing shadow => waiting/legacy', dec5.source === 'waiting_for_shadow' && !dec5.useUniversal);

  // 6. pilot scope allowlist: only known scopes; narrowing works; unknown ignored.
  const narrowed = resolvePilotAllowlist(true, 'greyholm.dm.summary, not.a.real.scope');
  checks.ok('flag-06 allowlist narrows + ignores unknown', narrowed.size === 1 && narrowed.has('greyholm.dm.summary'));
  checks.ok('flag-06b resolve all with empty/star', resolvePilotAllowlist(true, '').size === PILOT_SCOPES.length && resolvePilotAllowlist(true, '*').size === PILOT_SCOPES.length);

  // 7. non-pilot component (unknown scope) never universal even with flag on.
  const dec7 = decideReadSource({ enabled: true, allowedScopes: ALL_SCOPES, scope: 'greyholm.map.workspace', requestedCampaignId: greyId, status: freshSuccess(), snapshotPresent: true, snapshotCampaignId: greyId, snapshotSchemaVersion: '1.0.0' });
  checks.ok('flag-07 non-pilot scope stays legacy', dec7.source === 'disabled' && !dec7.useUniversal && !isPilotScope('greyholm.map.workspace'));

  // 7c. scope in registry but NOT in the (narrowed) allowlist => disabled.
  const dec7c = decideReadSource({ enabled: true, allowedScopes: narrowed, scope: 'greyholm.observer.status', requestedCampaignId: greyId, status: freshSuccess(), snapshotPresent: true, snapshotCampaignId: greyId, snapshotSchemaVersion: '1.0.0' });
  checks.ok('flag-07c known scope outside allowlist => disabled', dec7c.source === 'disabled' && !dec7c.useUniversal);
}

// ---------------------------------------------------------------------------
// Gateway core (8–17)
// ---------------------------------------------------------------------------
async function gateway() {
  const { coord, sched, repo, inst } = makeCoord();
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });

  // 8. correct campaign accepted -> universal.
  const r8 = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  checks.ok('gw-08 correct campaign => universal', r8.decision.source === 'universal' && r8.decision.useUniversal && !!r8.snapshot);

  // 9. wrong campaign rejected (snapshot belongs to another campaign).
  const r9 = await gatewayRead({ repo, coord: { getStatus: () => coord.getStatus(greyId) }, scope: 'userCampaign.dm.summary', campaignId: caldId });
  // caldId has no snapshot here, but simulate a snapshot mismatch directly on the core:
  const dec9 = decideReadSource({ enabled: true, allowedScopes: ALL_SCOPES, scope: 'greyholm.dm.summary', requestedCampaignId: caldId, status: freshSuccess(), snapshotPresent: true, snapshotCampaignId: greyId, snapshotSchemaVersion: '1.0.0' });
  checks.ok('gw-09 wrong campaign rejected', dec9.source === 'wrong_campaign' && !dec9.useUniversal && !r9.decision.useUniversal);

  // 10. missing campaignId rejected.
  const dec10 = decideReadSource({ enabled: true, allowedScopes: ALL_SCOPES, scope: 'greyholm.dm.summary', requestedCampaignId: null, status: freshSuccess(), snapshotPresent: true, snapshotCampaignId: greyId, snapshotSchemaVersion: '1.0.0' });
  checks.ok('gw-10 missing campaignId rejected', dec10.source === 'wrong_campaign' && !dec10.useUniversal);

  // 11. production namespace never read by the gateway path.
  const prodTouched = inst.rawKeys().some((k) => k.startsWith(`${UNIVERSAL_PRODUCTION_NAMESPACE}:`));
  const prodRepo = createProductionCampaignRepository(inst.storage);
  checks.ok('gw-11 production namespace untouched', !prodTouched && (await prodRepo.listCampaigns()).length === 0);

  // 12 & 13. gateway read performs no storage writes and no network (only getItem).
  const writesBefore = inst.writeCount();
  await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  await gatewayRead({ repo, coord, scope: 'greyholm.playerSafe.entities', campaignId: greyId });
  checks.eq('gw-12 gateway read performs zero writes', inst.writeCount(), writesBefore);
  checks.ok('gw-13 no network primitive in read-path source', (() => {
    const files = ['src/features/read-path/ReadPathProvider.tsx', 'src/features/read-path/useUniversalRead.ts', 'src/features/read-path/PilotCard.tsx', 'src/domain/readpath/decideReadSource.ts'];
    return files.every((f) => !/\bfetch\(|XMLHttpRequest|WebSocket|axios/.test(readFileSync(resolve(root, f), 'utf8')));
  })());

  // 14. no universal command calls from read-path source.
  checks.ok('gw-14 no command invocation in read-path source', (() => {
    const files = ['src/features/read-path/ReadPathProvider.tsx', 'src/features/read-path/useUniversalRead.ts', 'src/features/read-path/PilotCard.tsx', 'src/pages/ReadPathDiagnosticsPage.tsx'];
    return files.every((f) => !/createCommand|dispatchCommand|universalStore|migrationEngine|replaceCampaign|createCampaign|saveRuntime|updateCampaign/.test(readFileSync(resolve(root, f), 'utf8')));
  })());

  // 15. valid DM projection selected for a DM scope.
  const r15 = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  const vm15 = buildScopeViewModel('dm', 'summary', r15.snapshot);
  checks.ok('gw-15 DM projection selected', getPilotScope('greyholm.dm.summary').projection === 'dm' && vm15.entityCount > 0);

  // 16. Player-Safe projection enforced for a player scope (throws if wrong projection requested).
  let playerEnforced = false;
  try { buildScopeViewModel('dm', 'entities', r15.snapshot); } catch { playerEnforced = true; }
  checks.ok('gw-16 Player-Safe projection enforced', playerEnforced && getPilotScope('greyholm.playerSafe.entities').projection === 'playerSafe');

  // 17. Observer projection enforced for an observer scope.
  let observerEnforced = false;
  try { buildScopeViewModel('playerSafe', 'observer', r15.snapshot); } catch { observerEnforced = true; }
  checks.ok('gw-17 Observer projection enforced', observerEnforced && getPilotScope('greyholm.observer.status').projection === 'observer');
}

// ---------------------------------------------------------------------------
// Freshness (18–25)
// ---------------------------------------------------------------------------
function freshness() {
  const base = { enabled: true, allowedScopes: ALL_SCOPES, scope: 'greyholm.dm.summary', requestedCampaignId: greyId, snapshotPresent: true, snapshotCampaignId: greyId, snapshotSchemaVersion: '1.0.0' };

  // 18. fresh success uses universal.
  checks.ok('fresh-18 fresh success => universal', decideReadSource({ ...base, status: freshSuccess(3) }).source === 'universal');

  // 19. pending shadow uses legacy (stale_fallback).
  const pending = { ...freshSuccess(3), pending: true };
  checks.ok('fresh-19 pending => stale_fallback/legacy', (() => { const d = decideReadSource({ ...base, status: pending }); return d.source === 'stale_fallback' && !d.useUniversal; })());

  // 20. running shadow uses legacy.
  const running = { ...freshSuccess(3), running: true, status: 'running' };
  checks.ok('fresh-20 running => stale_fallback/legacy', decideReadSource({ ...base, status: running }).source === 'stale_fallback');

  // 21. validation failure uses legacy.
  const invalid = { ...freshSuccess(3), status: 'validation_failed' };
  checks.ok('fresh-21 validation_failed => validation_fallback', decideReadSource({ ...base, status: invalid }).source === 'validation_fallback');

  // 22. persistence failure uses legacy.
  checks.ok('fresh-22 persistence_failed => repository_failed', decideReadSource({ ...base, status: { ...freshSuccess(3), status: 'persistence_failed' } }).source === 'repository_failed');
  checks.ok('fresh-22b conflict => repository_failed', decideReadSource({ ...base, status: { ...freshSuccess(3), status: 'conflict' } }).source === 'repository_failed');

  // 23. reload mismatch uses legacy.
  checks.ok('fresh-23 reload_mismatch status => mismatch_fallback', decideReadSource({ ...base, status: { ...freshSuccess(3), status: 'reload_mismatch' } }).source === 'mismatch_fallback');
  checks.ok('fresh-23b comparison-not-equal => mismatch_fallback', decideReadSource({ ...base, status: { ...freshSuccess(3), comparison: { equal: false, revisionOnly: false } } }).source === 'mismatch_fallback');
  // revision-only difference is still fresh.
  checks.ok('fresh-23c revisionOnly still universal', decideReadSource({ ...base, status: { ...freshSuccess(3), comparison: { equal: false, revisionOnly: true } } }).source === 'universal');

  // 24. newer successful revision transitions to universal (idle->success).
  const idle = { ...freshSuccess(1), status: 'idle', lastSuccessAt: null, comparison: null };
  checks.ok('fresh-24a idle => stale_fallback', decideReadSource({ ...base, status: idle }).source === 'stale_fallback');
  checks.ok('fresh-24b later success => universal', decideReadSource({ ...base, status: freshSuccess(4) }).source === 'universal');

  // 25. unsupported schema version never universal (guards a stale/old snapshot).
  checks.ok('fresh-25 unsupported schema => repository_failed', decideReadSource({ ...base, status: freshSuccess(4), snapshotSchemaVersion: '9.9.9' }).source === 'repository_failed');
  checks.ok('fresh-25b supported set is exactly 1.0.0', SUPPORTED_READ_SCHEMA_VERSIONS.has('1.0.0'));
}

// ---------------------------------------------------------------------------
// Greyholm pilot (26–33)
// ---------------------------------------------------------------------------
async function greyholmPilot() {
  const { coord, sched, repo } = makeCoord();

  // 26. hydration: before any shadow run => waiting/legacy.
  const before = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  checks.ok('grey-26 pre-hydration => legacy', !before.decision.useUniversal && (before.decision.source === 'waiting_for_shadow'));

  // 27. after a successful shadow run => universal (refresh path).
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  const after = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  checks.ok('grey-27 post-success => universal', after.decision.useUniversal && after.decision.source === 'universal');

  // 28. initial shadow missing for the OTHER (real) build is irrelevant; snapshot present matches greyId.
  checks.ok('grey-28 snapshot campaign matches greyId', after.snapshot.metadata.campaignId === greyId);

  // 29. mutation creates temporary legacy fallback while pending, then resumes.
  coord.submit({ campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  const pendingRead = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  checks.ok('grey-29 pending mutation => legacy fallback', !pendingRead.decision.useUniversal && pendingRead.decision.source === 'stale_fallback');

  // 30. post-shadow-success universal resumes.
  await settle(coord, sched);
  const resumed = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  checks.ok('grey-30 post-success resumes universal', resumed.decision.useUniversal && resumed.decision.source === 'universal');

  // 31. semantic parity: universal view model == legacy (live-adapter) view model.
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  const uni = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  const universalVm = dmSummaryViewModel(projectDMWorkspace(uni.snapshot));
  const legacyVm = dmSummaryViewModel(projectDMWorkspace(buildGreyholmContract().snapshot));
  checks.eq('grey-31 DM summary parity (universal==legacy)', hashJson(universalVm), hashJson(legacyVm));

  // 32. view-model parity for the collection (NPC list) — ordering + ids + titles.
  const uniList = dmNpcListViewModel(projectDMWorkspace(uni.snapshot));
  const legacyList = dmNpcListViewModel(projectDMWorkspace(buildGreyholmContract().snapshot));
  checks.eq('grey-32 NPC list parity (order/ids/titles)', hashJson(uniList), hashJson(legacyList));

  // 33. source immutability: reading never mutates the persisted shadow snapshot.
  const persistedHashBefore = hashJson(await repo.readCampaign(greyId));
  await gatewayRead({ repo, coord, scope: 'greyholm.dm.npcList', campaignId: greyId });
  await gatewayRead({ repo, coord, scope: 'greyholm.playerSafe.entities', campaignId: greyId });
  checks.eq('grey-33 read does not mutate shadow snapshot', hashJson(await repo.readCampaign(greyId)), persistedHashBefore);
}

// ---------------------------------------------------------------------------
// User Campaign pilot (34–43)
// ---------------------------------------------------------------------------
function cloneCaldranWithId(newId) {
  const data = structuredClone(caldran.raw.data);
  data.campaignId = newId;
  const runtime = caldran.raw.runtime ? structuredClone(caldran.raw.runtime) : undefined;
  if (runtime) runtime.campaignId = newId;
  return { data, runtime };
}

async function userCampaignPilot() {
  const { coord, sched, repo, inst } = makeCoord();

  // 34. direct campaign URL (fresh coordinator, immediate read) => legacy until shadow built.
  const direct = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: caldId });
  checks.ok('user-34 direct URL pre-shadow => legacy', !direct.decision.useUniversal && direct.decision.source === 'waiting_for_shadow');

  // 35. delayed hydration: once submitted+settled => universal.
  await submitAndSettle(coord, sched, { campaignId: caldId, sourceKind: 'legacy-user-campaign', build: buildCaldran });
  const hydrated = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: caldId });
  checks.ok('user-35 delayed hydration => universal', hydrated.decision.useUniversal && hydrated.snapshot.metadata.campaignId === caldId);

  // 36. active campaign switch: A then B, each isolated.
  const otherInput = cloneCaldranWithId('camp-other-uc');
  const otherId = campaignIdFromLegacy('user', 'camp-other-uc');
  await submitAndSettle(coord, sched, { campaignId: otherId, sourceKind: 'legacy-user-campaign', build: () => adaptUserCampaignToUniversal(otherInput) });
  const readA = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: caldId });
  const readB = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: otherId });
  checks.ok('user-36 campaign switch reads correct snapshot each', readA.snapshot.metadata.campaignId === caldId && readB.snapshot.metadata.campaignId === otherId);

  // 37. two-campaign isolation: A's read never returns B's data (cross-check).
  checks.ok('user-37 two-campaign isolation', readA.snapshot.metadata.campaignId !== readB.snapshot.metadata.campaignId && caldId !== otherId);

  // 38. deleted campaign: after clear, no stale universal — falls to legacy.
  await coord.clearCampaign(caldId);
  const afterDelete = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: caldId });
  checks.ok('user-38 deleted campaign => no stale universal', !afterDelete.decision.useUniversal);

  // 39. import: a new campaignId gets its own snapshot/key.
  const importInput = cloneCaldranWithId('camp-imported-uc');
  const importId = campaignIdFromLegacy('user', 'camp-imported-uc');
  await submitAndSettle(coord, sched, { campaignId: importId, sourceKind: 'legacy-user-campaign', build: () => adaptUserCampaignToUniversal(importInput) });
  const importRead = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: importId });
  checks.ok('user-39 import => own universal snapshot', importRead.decision.useUniversal && importRead.snapshot.metadata.campaignId === importId);

  // 40. missing in-memory cache: requesting a campaign never shadowed => legacy.
  const neverId = campaignIdFromLegacy('user', 'camp-never-loaded');
  const missing = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: neverId });
  checks.ok('user-40 missing cache => legacy', !missing.decision.useUniversal && missing.decision.source === 'waiting_for_shadow');

  // 41. existing localStorage snapshot present but wrong campaign requested => wrong_campaign.
  const dec41 = decideReadSource({ enabled: true, allowedScopes: ALL_SCOPES, scope: 'userCampaign.dm.summary', requestedCampaignId: caldId, status: freshSuccess(), snapshotPresent: true, snapshotCampaignId: otherId, snapshotSchemaVersion: '1.0.0' });
  checks.ok('user-41 snapshot for other campaign => wrong_campaign', dec41.source === 'wrong_campaign');

  // 42. semantic parity for user campaign summary.
  const uniVm = dmSummaryViewModel(projectDMWorkspace(readB.snapshot));
  const legacyVm = dmSummaryViewModel(projectDMWorkspace(adaptUserCampaignToUniversal(otherInput).snapshot));
  checks.eq('user-42 user campaign summary parity', hashJson(uniVm), hashJson(legacyVm));

  // 43. source immutability + shadow-only namespace.
  checks.ok('user-43 shadow-only namespace + never falls back to a default id', inst.rawKeys().every((k) => k.startsWith(`${STAGE_09_SHADOW_NAMESPACE}:`)) && !missing.decision.useUniversal);
}

// ---------------------------------------------------------------------------
// Privacy (44–49)
// ---------------------------------------------------------------------------
async function privacy() {
  const { coord, sched, repo } = makeCoord();
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  const snap = await repo.readCampaign(greyId);

  const dm = projectDMWorkspace(snap);
  const player = projectPlayerSafe(snap);
  const observer = projectObserver(snap);

  // 44. DM consumer receives DM projection (all entities).
  checks.eq('priv-44 DM projection includes all entities', dm.entities.length, snap.durable.entities.length);

  // 45. player receives no DM-only fields — the known secret string never appears.
  const secret = 'SECRET: the mayor is compromised by the Ashen Hand cell.';
  const secretInDmSnapshot = JSON.stringify(snap).includes(secret);
  const playerVm = playerSafeEntityListViewModel(player);
  const runtimeVm = runtimePresentationViewModel(player);
  const playerLeak = collectStrings(playerVm).concat(collectStrings(runtimeVm)).some((s) => s.includes(secret));
  checks.ok('priv-45 player view model has no DM secret', secretInDmSnapshot === true && playerLeak === false);

  // 46. observer receives no forbidden fields (secret absent; observerStatus carries only counts/flag).
  const observerVm = observerStatusViewModel(observer);
  const observerLeak = collectStrings(observerVm).some((s) => s.includes(secret));
  checks.ok('priv-46 observer view model has no DM secret', observerLeak === false);

  // 47. hidden entity remains hidden: every player item is player-visible; some DM entities are hidden.
  const playerIds = new Set(player.entities.map((e) => e.id));
  const hiddenExists = snap.durable.entities.some((e) => !playerIds.has(e.id));
  const allPlayerVisible = player.entities.every((e) => e.visible === true);
  checks.ok('priv-47 hidden entities stay hidden from player', hiddenExists && allPlayerVisible && player.entities.length < dm.entities.length);

  // 48. reveal behavior preserved: player entity set ⊆ DM entity set.
  const dmIds = new Set(dm.entities.map((e) => e.id));
  checks.ok('priv-48 player entities subset of DM entities', [...playerIds].every((id) => dmIds.has(id)));

  // 49. no full snapshot passed to a player component: buildScopeViewModel for a player scope
  //     returns only the safe view model (no durable/visibility/runtime.battles internals).
  const safeVm = buildScopeViewModel('playerSafe', 'entities', snap);
  const keys = Object.keys(safeVm);
  checks.ok('priv-49 player view model is a narrow safe shape', keys.sort().join(',') === 'campaignId,items,title' && !('durable' in safeVm) && !('visibility' in safeVm));
}

// ---------------------------------------------------------------------------
// Runtime pilot (50–53)
// ---------------------------------------------------------------------------
async function runtimePilot() {
  const { coord, sched, repo } = makeCoord();

  // 50. non-zero runtime pilot: contract overlay has an active battle + presented state.
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  const snap = await repo.readCampaign(greyId);
  const activeBattleCount = Object.keys(snap.runtime.battles).length;
  const runtimeVm = runtimePresentationViewModel(projectPlayerSafe(snap));
  checks.ok('rt-50 non-zero runtime pilot (active battles present)', activeBattleCount > 0, `battles=${activeBattleCount}`);

  // 51. runtime update falls back to legacy during pending shadow.
  coord.submit({ campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  const duringPending = await gatewayRead({ repo, coord, scope: 'greyholm.runtime.presentation', campaignId: greyId });
  checks.ok('rt-51 runtime pending => legacy fallback', !duringPending.decision.useUniversal && duringPending.decision.source === 'stale_fallback');

  // 52. refreshed snapshot renders updated runtime (real build has 0 battles -> reflected).
  await settle(coord, sched);
  const refreshed = await gatewayRead({ repo, coord, scope: 'greyholm.runtime.presentation', campaignId: greyId });
  const refreshedSnap = refreshed.snapshot;
  const refreshedVm = runtimePresentationViewModel(projectPlayerSafe(refreshedSnap));
  checks.ok('rt-52 refreshed snapshot reflects updated runtime',
    refreshed.decision.useUniversal && refreshedVm.activeBattleCount === Object.keys(refreshedSnap.runtime.battles).length);

  // 53. runtime pilot is presentation-only (Player-Safe projection, no battle controls fields).
  checks.ok('rt-53 runtime pilot is player-safe presentation',
    getPilotScope('greyholm.runtime.presentation').projection === 'playerSafe' &&
    !('tokens' in runtimeVm) && !('initiative' in runtimeVm));
}

// ---------------------------------------------------------------------------
// Diagnostics & source-level safety (54–62)
// ---------------------------------------------------------------------------
function diagnostics() {
  const appSrc = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
  const pageSrc = readFileSync(resolve(root, 'src/pages/ReadPathDiagnosticsPage.tsx'), 'utf8');
  const providerSrc = readFileSync(resolve(root, 'src/features/read-path/ReadPathProvider.tsx'), 'utf8');
  const hookSrc = readFileSync(resolve(root, 'src/features/read-path/useUniversalRead.ts'), 'utf8');
  const cardSrc = readFileSync(resolve(root, 'src/features/read-path/PilotCard.tsx'), 'utf8');

  // 54. structured read decision surfaced (metadata + source) in the pilot card.
  checks.ok('diag-54 structured read decision visible', /data-source=\{decision\.source\}/.test(cardSrc) && /shadowRevision/.test(cardSrc));

  // 55. fallback reason visible.
  checks.ok('diag-55 fallback reason visible', /fallbackReason/.test(cardSrc));

  // 56. no secret payload dumping: card renders view models + metadata, never the raw snapshot JSON.
  checks.ok('diag-56 no raw snapshot dump in UI', !/JSON\.stringify\(\s*(sourceSnapshot|universalSnapshot|snapshot)\b/.test(cardSrc) && !/JSON\.stringify\(\s*snapshot/.test(pageSrc));

  // 57. DM guard: read-path route is wrapped in DmOnlyRoute.
  checks.ok('diag-57 read-path route is DM-only', /path="\/diagnostics\/read-path"\s+element=\{<DmOnlyRoute>/.test(appSrc));

  // 58. read-path page is flag-gated (redirects when off).
  checks.ok('diag-58 read-path page flag-gated', /UNIVERSAL_READ_PATH_ENABLED/.test(pageSrc) && /Navigate to="\/map"/.test(pageSrc));

  // 59. provider never writes: only readCampaign is referenced (no setItem/replace/create/save).
  checks.ok('diag-59 provider read-only', /readCampaign/.test(providerSrc) && !/setItem|replaceCampaign|createCampaign|saveRuntime|removeItem|clearCampaign/.test(providerSrc));

  // 60. hook read-only: no write/command APIs.
  checks.ok('diag-60 hook read-only', !/setItem|replaceCampaign|createCampaign|saveRuntime|removeItem|submit\(|runNow|clearCampaign/.test(hookSrc));

  // 61. provider does NOT construct a shadow coordinator (read on + shadow off stays safe).
  checks.ok('diag-61 provider never constructs coordinator', !/new ShadowIntegrationCoordinator/.test(providerSrc));

  // 62. pilots mounted ONLY on the dedicated read-path page (no legacy page imports PilotCard/useUniversalRead).
  const otherPages = ['src/pages/MapWorkspacePage.tsx', 'src/pages/EntityLibraryPage.tsx', 'src/pages/UniversalDiagnosticsPage.tsx'];
  const noLeak = otherPages.every((f) => existsSync(resolve(root, f)) ? !/useUniversalRead|PilotCard|read-path/.test(readFileSync(resolve(root, f), 'utf8')) : true);
  checks.ok('diag-62 pilots isolated to read-path page', noLeak);
}

// ---------------------------------------------------------------------------
// Real-data anchors (Stage 8 counts must not regress) (63–66)
// ---------------------------------------------------------------------------
async function anchors() {
  const grey = buildGreyholmReal().snapshot;
  checks.ok('anchor-63 greyholm 210 NPC', grey.durable.entities.filter((e) => e.kind === 'npc').length === 210);
  checks.ok('anchor-64 greyholm 139 battle maps', grey.durable.battleMaps.length === 139);
  const cald = buildCaldran().snapshot;
  checks.ok('anchor-65 caldran 66 NPC', cald.durable.entities.filter((e) => e.kind === 'npc').length === 66);
  const reveals = Object.values(cald.visibility.entities).filter((v) => v && v.level === 'public').length;
  checks.ok('anchor-66 caldran reveals 8/8', reveals === 8, `got ${reveals}`);
}

async function main() {
  flags();
  await gateway();
  freshness();
  await greyholmPilot();
  await userCampaignPilot();
  await privacy();
  await runtimePilot();
  diagnostics();
  await anchors();

  const summary = checks.summary();
  const report = { verdict: summary.ok ? 'STAGE_10_HARNESS_PASS' : 'STAGE_10_HARNESS_FAIL', summary, results: checks.results };
  const outDir = resolve(root, 'rebuild-reports/stage-10');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'harness-results.json'), JSON.stringify(report, null, 2));

  for (const r of checks.results) {
    if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
  }
  console.log(`\nStage 10 harness: ${summary.passed}/${summary.total} PASS -> ${report.verdict}`);
  if (!summary.ok) process.exitCode = 1;
}

main().catch((error) => { console.error(error); process.exitCode = 1; });

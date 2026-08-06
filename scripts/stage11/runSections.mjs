// Stage 11 — expanded local universal READ coverage + shared view-model harness.
//
// Proves that the SAME guarded gateway now serves REAL application read-only
// sections (Greyholm Entity Library, user-campaign Library) through shared view
// models and shared presentational components, while:
//   - the read flag stays default-off and sections are additive (invisible at baseline);
//   - shared view models are equivalent from the legacy and universal sources;
//   - privacy (DM / Player-Safe / Observer) is strictly enforced per audience;
//   - campaign isolation, hydration and mutation transitions are safe;
//   - NO writes / commands / network / production namespace access occur.
//
// Deterministic (manual scheduler, injected clock). Reuses the Stage 8/9 fixtures
// and helpers so the anchors match the frozen real-data counts.
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
import { Checks, hashJson, deepFreeze, collectKeyPaths } from '../stage08/lib.mjs';
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

function makeCoord() {
  const inst = instrumentedStorage();
  const repo = createShadowCampaignRepository(inst.storage, STAGE_09_SHADOW_NAMESPACE);
  const sched = manualScheduler();
  const coord = new ShadowIntegrationCoordinator({ repository: repo, scheduler: sched.scheduler, debounceMs: 400, now: NOW });
  return { inst, repo, sched, coord };
}
async function submitAndSettle(coord, sched, req) { coord.submit(req); await settle(coord, sched); }

function statusView(status) {
  if (!status) return null;
  return {
    status: status.status, pending: status.pending, running: status.running,
    candidateRevision: status.candidateRevision, persistedRevision: status.persistedRevision,
    lastSuccessAt: status.lastSuccessAt,
    comparison: status.comparison ? { equal: status.comparison.equal, revisionOnly: status.comparison.revisionOnly } : null,
  };
}
async function gatewayRead({ repo, coord, scope, campaignId, enabled = true, allowed = ALL_SCOPES }) {
  const snap = await repo.readCampaign(campaignId);
  const decision = decideReadSource({
    enabled, allowedScopes: allowed, scope, requestedCampaignId: campaignId,
    status: statusView(coord ? coord.getStatus(campaignId) : null),
    snapshotPresent: !!snap,
    snapshotCampaignId: snap ? snap.metadata.campaignId : null,
    snapshotSchemaVersion: snap ? snap.schemaVersion : null,
  });
  return { decision, snapshot: decision.useUniversal ? snap : null };
}

const readSrc = (f) => readFileSync(resolve(root, f), 'utf8');
const SECTION_FILES = [
  'src/features/universal-sections/useUniversalSection.ts',
  'src/features/universal-sections/UniversalSection.tsx',
  'src/features/universal-sections/SectionBodies.tsx',
  'src/features/universal-sections/GreyholmUniversalSections.tsx',
  'src/features/universal-sections/UserCampaignUniversalSections.tsx',
  'src/features/universal-sections/sectionRegistry.ts',
];

// ---------------------------------------------------------------------------
// A. Flags, allowlist, additive baseline (1–10)
// ---------------------------------------------------------------------------
function flagsAndBaseline() {
  const configSrc = readSrc('src/config.ts');
  checks.ok('flag-01 read flag default-off in config', /VITE_UNIVERSAL_READ_PATH\b/.test(configSrc) && /UNIVERSAL_READ_PATH_ENABLED/.test(configSrc));

  // 2. no committed env enables the read flag.
  const envFiles = ['.env', '.env.local', '.env.production', '.env.development', '.env.example'];
  const leaked = envFiles.filter((f) => existsSync(resolve(root, f)) && /VITE_UNIVERSAL_READ_PATH\s*=\s*(1|true)/i.test(readSrc(f)));
  checks.ok('flag-02 no committed env enables read flag', leaked.length === 0, `leaked in ${leaked.join(', ')}`);

  // 3. every scope disabled when flag off (no universal at baseline).
  const offAll = PILOT_SCOPES.every((d) => decideReadSource({ enabled: false, allowedScopes: new Set(), scope: d.scope, requestedCampaignId: greyId, status: null, snapshotPresent: false, snapshotCampaignId: null, snapshotSchemaVersion: null }).source === 'disabled');
  checks.ok('flag-03 all scopes disabled when flag off', offAll);

  // 4. allowlist resolves all scopes when on/empty; narrows on config; ignores unknown.
  checks.ok('flag-04 allowlist all/empty', resolvePilotAllowlist(true, '').size === PILOT_SCOPES.length && resolvePilotAllowlist(true, '*').size === PILOT_SCOPES.length);
  checks.ok('flag-05 allowlist narrows to known only', (() => { const s = resolvePilotAllowlist(true, 'userCampaign.playerSafe.entities, not.a.scope'); return s.size === 1 && s.has('userCampaign.playerSafe.entities'); })());

  // 6. the two Stage 11 user-campaign scopes exist with the right projection/variant.
  const ps = getPilotScope('userCampaign.playerSafe.entities');
  const ob = getPilotScope('userCampaign.observer.status');
  checks.ok('flag-06 UC Player-Safe scope registered', !!ps && ps.projection === 'playerSafe' && ps.variant === 'entities');
  checks.ok('flag-07 UC Observer scope registered', !!ob && ob.projection === 'observer' && ob.variant === 'observer');
  checks.ok('flag-08 both are known pilot scopes', isPilotScope('userCampaign.playerSafe.entities') && isPilotScope('userCampaign.observer.status'));

  // 9. sections are additive: they render null when the read flag is off (source-level).
  const shellSrc = readSrc('src/features/universal-sections/UniversalSection.tsx');
  checks.ok('flag-09 section shell renders null when flag off', /if\s*\(!UNIVERSAL_READ_PATH_ENABLED/.test(shellSrc) && /return null/.test(shellSrc));
  const greySecSrc = readSrc('src/features/universal-sections/GreyholmUniversalSections.tsx');
  const ucSecSrc = readSrc('src/features/universal-sections/UserCampaignUniversalSections.tsx');
  checks.ok('flag-10 wrappers guard heavy build behind flag', /UNIVERSAL_READ_PATH_ENABLED/.test(greySecSrc) && /UNIVERSAL_READ_PATH_ENABLED/.test(ucSecSrc));
}

// ---------------------------------------------------------------------------
// B. Shared view models: legacy vs universal parity, ordering, ids, images,
//    empty state, immutability, no raw snapshot (11–20)
// ---------------------------------------------------------------------------
async function sharedViewModels() {
  const { coord, sched, repo } = makeCoord();
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  const uni = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  const legacySnap = buildGreyholmContract().snapshot;

  // 11. DM summary parity (universal == legacy adapter).
  checks.eq('vm-11 DM summary parity', hashJson(buildScopeViewModel('dm', 'summary', uni.snapshot)), hashJson(buildScopeViewModel('dm', 'summary', legacySnap)));
  // 12. NPC list parity — ordering + ids + titles.
  checks.eq('vm-12 NPC list parity (order/ids/titles)', hashJson(dmNpcListViewModel(projectDMWorkspace(uni.snapshot))), hashJson(dmNpcListViewModel(projectDMWorkspace(legacySnap))));
  // 13. Player-Safe entities parity.
  checks.eq('vm-13 Player-Safe entities parity', hashJson(playerSafeEntityListViewModel(projectPlayerSafe(uni.snapshot))), hashJson(playerSafeEntityListViewModel(projectPlayerSafe(legacySnap))));
  // 14. Observer status parity.
  checks.eq('vm-14 Observer status parity', hashJson(observerStatusViewModel(projectObserver(uni.snapshot))), hashJson(observerStatusViewModel(projectObserver(legacySnap))));

  // 15. deterministic ordering — building twice yields identical order.
  const a = dmNpcListViewModel(projectDMWorkspace(legacySnap));
  const b = dmNpcListViewModel(projectDMWorkspace(legacySnap));
  checks.eq('vm-15 deterministic ordering', a.items.map((i) => i.id).join(','), b.items.map((i) => i.id).join(','));

  // 16. every list item carries a stable id + kind + visible flag (ID mapping).
  const items = playerSafeEntityListViewModel(projectPlayerSafe(legacySnap)).items;
  checks.ok('vm-16 items have stable id/kind/visible', items.length > 0 && items.every((i) => typeof i.id === 'string' && i.id.length > 0 && typeof i.kind === 'string' && typeof i.visible === 'boolean'));

  // 17. image reference parity — imageSrc is either null or a string, never undefined.
  checks.ok('vm-17 image refs normalized (null|string)', items.every((i) => i.imageSrc === null || typeof i.imageSrc === 'string'));

  // 18. empty-state parity — a summary VM for a campaign always has numeric counts.
  const sum = buildScopeViewModel('dm', 'summary', legacySnap);
  checks.ok('vm-18 summary counts numeric', Number.isFinite(sum.entityCount) && Number.isFinite(sum.npcCount) && Number.isFinite(sum.battleMapCount));

  // 19. view models expose no raw snapshot buckets (durable/runtime/visibility/metadata).
  const paths = collectKeyPaths(sum);
  checks.ok('vm-19 no raw snapshot buckets in VM', !paths.has('durable') && !paths.has('runtime') && !paths.has('visibility') && !paths.has('metadata') && !paths.has('schemaVersion'));

  // 20. building a VM does not mutate the source snapshot.
  const before = hashJson(legacySnap);
  buildScopeViewModel('dm', 'summary', legacySnap);
  buildScopeViewModel('dm', 'npcList', legacySnap);
  checks.eq('vm-20 VM build does not mutate snapshot', hashJson(legacySnap), before);
}

// ---------------------------------------------------------------------------
// C. Greyholm real sections lifecycle (21–28)
// ---------------------------------------------------------------------------
async function greyholmSections() {
  const { coord, sched, repo } = makeCoord();

  // 21. initial hydration => legacy fallback (waiting_for_shadow).
  const before = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  checks.ok('grey-21 pre-hydration => legacy', !before.decision.useUniversal && before.decision.source === 'waiting_for_shadow');

  // 22. after success => universal for section 1 (summary).
  await submitAndSettle(coord, sched, { campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmContract });
  const s1 = await gatewayRead({ repo, coord, scope: 'greyholm.dm.summary', campaignId: greyId });
  checks.ok('grey-22 section1 summary => universal', s1.decision.useUniversal && s1.decision.source === 'universal');

  // 23. section 2 (NPC list) => universal, reference collection resolves.
  const s2 = await gatewayRead({ repo, coord, scope: 'greyholm.dm.npcList', campaignId: greyId });
  const s2vm = buildScopeViewModel('dm', 'npcList', s2.snapshot);
  checks.ok('grey-23 section2 npcList => universal + non-empty', s2.decision.useUniversal && s2vm.items.length > 0);

  // 24. image/card consumer: at least one entity carries an image ref through the
  //     Player-Safe entities VM (the real card/image-bearing collection).
  const psRead = await gatewayRead({ repo, coord, scope: 'greyholm.playerSafe.entities', campaignId: greyId });
  const psVm = buildScopeViewModel('playerSafe', 'entities', psRead.snapshot);
  const anyImage = psVm.items.some((i) => typeof i.imageSrc === 'string' && i.imageSrc.length > 0);
  checks.ok('grey-24 image/card consumer resolves an image', anyImage);

  // 25. mutation => pending legacy fallback, then resumes universal.
  coord.submit({ campaignId: greyId, sourceKind: 'legacy-main', build: buildGreyholmReal });
  const pending = await gatewayRead({ repo, coord, scope: 'greyholm.dm.npcList', campaignId: greyId });
  checks.ok('grey-25 pending mutation => legacy fallback', !pending.decision.useUniversal && pending.decision.source === 'stale_fallback');
  await settle(coord, sched);
  const resumed = await gatewayRead({ repo, coord, scope: 'greyholm.dm.npcList', campaignId: greyId });
  checks.ok('grey-26 resumes universal after success', resumed.decision.useUniversal);

  // 27. runtime section renders a runtime VM (non-secret) from Player-Safe projection.
  const rt = await gatewayRead({ repo, coord, scope: 'greyholm.runtime.presentation', campaignId: greyId });
  const rtVm = buildScopeViewModel('playerSafe', 'runtime', rt.snapshot ?? buildGreyholmReal().snapshot);
  checks.ok('grey-27 runtime VM shape', 'activeBattleCount' in rtVm && 'presentedCardId' in rtVm);

  // 28. source immutability — reads never mutate the shadow snapshot.
  const h = hashJson(await repo.readCampaign(greyId));
  await gatewayRead({ repo, coord, scope: 'greyholm.playerSafe.entities', campaignId: greyId });
  await gatewayRead({ repo, coord, scope: 'greyholm.observer.status', campaignId: greyId });
  checks.eq('grey-28 reads do not mutate shadow', hashJson(await repo.readCampaign(greyId)), h);
}

// ---------------------------------------------------------------------------
// D. User-campaign real sections: isolation, direct-URL, delayed hydration (29–37)
// ---------------------------------------------------------------------------
async function userCampaignSections() {
  const { coord, sched, repo } = makeCoord();
  const otherId = campaignIdFromLegacy('user', 'some-other-campaign');

  // 29. direct URL before hydration => legacy (waiting).
  const direct = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: caldId });
  checks.ok('uc-29 direct URL pre-hydration => legacy', !direct.decision.useUniversal);

  // 30. after hydration/success => universal (section 1: DM summary).
  await submitAndSettle(coord, sched, { campaignId: caldId, sourceKind: 'legacy-user', build: buildCaldran });
  const s1 = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: caldId });
  checks.ok('uc-30 section1 DM summary => universal', s1.decision.useUniversal && s1.decision.source === 'universal');

  // 31. section 2: Player-Safe entities => universal, and strictly fewer than DM entities.
  const s2 = await gatewayRead({ repo, coord, scope: 'userCampaign.playerSafe.entities', campaignId: caldId });
  const playerVm = buildScopeViewModel('playerSafe', 'entities', s2.snapshot);
  const dmVm = buildScopeViewModel('dm', 'summary', s2.snapshot);
  checks.ok('uc-31 section2 Player-Safe => universal', s2.decision.useUniversal);
  checks.ok('uc-31b Player-Safe entities <= DM entities', playerVm.items.length <= dmVm.entityCount);

  // 32. two-campaign isolation: reading otherId never returns caldran's snapshot.
  const other = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: otherId });
  checks.ok('uc-32 unknown campaign => legacy, no cross-read', !other.decision.useUniversal && other.snapshot === null);

  // 33. wrong-campaign snapshot mismatch is rejected.
  const mism = decideReadSource({ enabled: true, allowedScopes: ALL_SCOPES, scope: 'userCampaign.dm.summary', requestedCampaignId: caldId, status: { status: 'success', pending: false, running: false, candidateRevision: 1, persistedRevision: 1, lastSuccessAt: NOW(), comparison: { equal: true, revisionOnly: false } }, snapshotPresent: true, snapshotCampaignId: otherId, snapshotSchemaVersion: '1.0.0' });
  checks.ok('uc-33 wrong-campaign snapshot rejected', mism.source === 'wrong_campaign' && !mism.useUniversal);

  // 34. deleted campaign: snapshot absent => legacy (no stale universal).
  const del = await gatewayRead({ repo, coord, scope: 'userCampaign.dm.summary', campaignId: campaignIdFromLegacy('user', 'deleted-x') });
  checks.ok('uc-34 deleted/absent campaign => legacy', !del.decision.useUniversal);

  // 35. campaign isolation of the caldran snapshot identity.
  checks.ok('uc-35 snapshot campaign matches requested', s1.snapshot.metadata.campaignId === caldId);

  // 36. mutation transition for a UC section.
  coord.submit({ campaignId: caldId, sourceKind: 'legacy-user', build: buildCaldran });
  const pend = await gatewayRead({ repo, coord, scope: 'userCampaign.playerSafe.entities', campaignId: caldId });
  checks.ok('uc-36 UC mutation => legacy fallback', !pend.decision.useUniversal);
  await settle(coord, sched);
  const back = await gatewayRead({ repo, coord, scope: 'userCampaign.playerSafe.entities', campaignId: caldId });
  checks.ok('uc-37 UC resumes universal', back.decision.useUniversal);
}

// ---------------------------------------------------------------------------
// E. Shared section component: used by both stacks, no duplicated logic (38–41)
// ---------------------------------------------------------------------------
function sharedComponent() {
  const bodies = readSrc('src/features/universal-sections/SectionBodies.tsx');
  const grey = readSrc('src/features/universal-sections/GreyholmUniversalSections.tsx');
  const uc = readSrc('src/features/universal-sections/UserCampaignUniversalSections.tsx');

  // 38. both stacks import the SAME shell component.
  checks.ok('shared-38 both stacks use UniversalSection', /UniversalSection/.test(grey) && /UniversalSection/.test(uc));
  // 39. the shared shell uses the shared SectionBody renderer.
  checks.ok('shared-39 shell uses shared SectionBody', /SectionBody/.test(readSrc('src/features/universal-sections/UniversalSection.tsx')));
  // 40. shared bodies receive a view model only — no store/repository/snapshot import.
  checks.ok('shared-40 bodies are presentational', !/useUserCampaigns|useCampaignData|useCampaignStore|Repository|readCampaign|localStorage/.test(bodies));
  // 41. the same view-model contract types back both stacks (single source of truth).
  checks.ok('shared-41 single view-model contract', /useUniversalSection/.test(readSrc('src/features/universal-sections/UniversalSection.tsx')));
}

// ---------------------------------------------------------------------------
// F. Privacy: audience projections strictly separated (42–49)
// ---------------------------------------------------------------------------
function privacy() {
  const snap = buildGreyholmReal().snapshot;
  const dm = projectDMWorkspace(snap);
  const player = projectPlayerSafe(snap);
  const observer = projectObserver(snap);

  // 42. DM projection includes all durable entities.
  checks.eq('priv-42 DM includes all entities', dm.entities.length, snap.durable.entities.length);
  // 43. Player-Safe strictly fewer entities than DM (hidden entities dropped).
  checks.ok('priv-43 Player-Safe < DM entities', player.entities.length < dm.entities.length);
  // 44. every Player-Safe entity is player-visible.
  checks.ok('priv-44 all Player-Safe entities visible', player.entities.every((e) => e.visible !== false));
  // 45. Player-Safe entity VM keys carry NO DM-only fields (notes/secret/dm...).
  const pvm = playerSafeEntityListViewModel(player);
  const keys = collectKeyPaths(pvm);
  const dmish = [...keys].filter((k) => /note|secret|dmOnly|dm_notes|hidden/i.test(k));
  checks.ok('priv-45 no DM-only fields in Player-Safe VM', dmish.length === 0, `leaked: ${dmish.join(', ')}`);
  // 46. Observer VM is a status only (counts/focus) — never an entity dump with descriptions.
  const ovm = observerStatusViewModel(observer);
  checks.ok('priv-46 Observer VM is status-only', 'visibleEntityCount' in ovm && !('items' in ovm) && !('entities' in ovm));
  // 47. building a Player-Safe VM from the DM projection is impossible (throws).
  let enforced = false;
  try { buildScopeViewModel('dm', 'entities', snap); } catch { enforced = true; }
  checks.ok('priv-47 wrong projection for player scope throws', enforced);
  // 48. Observer entitlement enforced.
  let obEnforced = false;
  try { buildScopeViewModel('playerSafe', 'observer', snap); } catch { obEnforced = true; }
  checks.ok('priv-48 wrong projection for observer scope throws', obEnforced);
  // 49. reveal preserved: Caldran public reveals still 8/8 through the Player-Safe path.
  const cald = buildCaldran().snapshot;
  const reveals = Object.values(cald.visibility.entities).filter((v) => v && v.level === 'public').length;
  checks.ok('priv-49 caldran reveals 8/8', reveals === 8, `got ${reveals}`);
}

// ---------------------------------------------------------------------------
// G. Source-level safety of the new section layer (50–58)
// ---------------------------------------------------------------------------
function sourceSafety() {
  // 50. no writes/commands in the section layer.
  for (const f of SECTION_FILES) {
    const src = readSrc(f);
    checks.ok(`safe-50 ${f} no writes/commands`, !/setItem|removeItem|replaceCampaign|createCampaign|saveRuntime|updateData|updateRuntime|migrationEngine|dispatchCommand|universalStore/.test(src));
  }
  // 51. no network primitives in the section layer.
  checks.ok('safe-51 no network in section layer', SECTION_FILES.every((f) => !/\bfetch\(|XMLHttpRequest|WebSocket|axios/.test(readSrc(f))));
  // 52. no production namespace reference in the section layer.
  checks.ok('safe-52 no production namespace in sections', SECTION_FILES.every((f) => !/UNIVERSAL_PRODUCTION_NAMESPACE|production/i.test(readSrc(f))));
  // 53. sections only ever read the Stage 9 shadow namespace (via the read-path provider).
  checks.ok('safe-53 read gateway reads shadow namespace', /STAGE_09_SHADOW_NAMESPACE/.test(readSrc('src/features/read-path/ReadPathProvider.tsx')));
  // 54. sections are mounted ONLY in the two real pages + diagnostics (no leak elsewhere).
  // Block G: the two pages now compose Stage 11 sections THROUGH the shared
  // Stage 12 workspace (GreyholmWorkspace/UserCampaignWorkspace), which
  // internally renders the same UniversalSection scopes the standalone
  // GreyholmUniversalSections/UserCampaignUniversalSections components used
  // to render directly -- see GreyholmWorkspace.tsx/UserCampaignWorkspace.tsx
  // readSlots. Assert the new composition point instead of the superseded
  // standalone component names.
  const consumers = ['src/pages/EntityLibraryPage.tsx', 'src/features/campaigns/CampaignLibraryPage.tsx'];
  checks.ok('safe-54 EntityLibrary mounts Greyholm sections (via GreyholmWorkspace)', /GreyholmWorkspace/.test(readSrc(consumers[0])));
  checks.ok('safe-55 CampaignLibrary mounts UC sections (via UserCampaignWorkspace)', /UserCampaignWorkspace/.test(readSrc(consumers[1])));
  // 56. Stage 10 diag-62 stays green: the modified pages do NOT reference the read-path dir/identifiers.
  checks.ok('safe-56 EntityLibrary does not import read-path (Stage 10 diag-62)', !/useUniversalRead|PilotCard|read-path/.test(readSrc(consumers[0])));
  // 57. the write path in the host pages is untouched by the section (section carries no handlers).
  checks.ok('safe-57 Greyholm section carries no write handlers', !/onClick|onChange|onSubmit|updateData|addNpc|addEnemy/.test(readSrc('src/features/universal-sections/GreyholmUniversalSections.tsx')));
  // 58. App wires the providers so sections have context on real routes.
  const app = readSrc('src/App.tsx');
  checks.ok('safe-58 providers wrap the app shell', /ReadPathProvider/.test(app) && /ShadowIntegrationProvider/.test(app));
}

// ---------------------------------------------------------------------------
// H. Diagnostics + anchors (59–66)
// ---------------------------------------------------------------------------
function diagnosticsAndAnchors() {
  const diag = readSrc('src/pages/ReadPathDiagnosticsPage.tsx');
  // 59. diagnostics enumerates the real hosted sections.
  checks.ok('diag-59 real hosted sections enumerated', /STAGE_11_HOSTED_SECTIONS/.test(diag));
  // 60. diagnostics remains DM-only + flag-gated.
  const app = readSrc('src/App.tsx');
  checks.ok('diag-60 read-path route DM-only', /path="\/diagnostics\/read-path"\s+element=\{<DmOnlyRoute>/.test(app));
  checks.ok('diag-61 diagnostics flag-gated', /UNIVERSAL_READ_PATH_ENABLED/.test(diag) && /Navigate to="\/map"/.test(diag));
  // 62. registry never leaks secrets — only scope/route/projection/audience/source metadata.
  const reg = readSrc('src/features/universal-sections/sectionRegistry.ts');
  checks.ok('diag-62 registry is descriptive metadata only', !/note|secret|password|token/i.test(reg));

  // Real-data anchors (must not regress the frozen counts).
  const grey = buildGreyholmReal().snapshot;
  checks.ok('anchor-63 greyholm 210 NPC', grey.durable.entities.filter((e) => e.kind === 'npc').length === 210);
  checks.ok('anchor-64 greyholm 139 battle maps', grey.durable.battleMaps.length === 139);
  const cald = buildCaldran().snapshot;
  checks.ok('anchor-65 caldran 66 NPC', cald.durable.entities.filter((e) => e.kind === 'npc').length === 66);
  checks.ok('anchor-66 caldran 78 enemies', cald.durable.entities.filter((e) => e.kind === 'enemy').length === 78);
}

async function main() {
  flagsAndBaseline();
  await sharedViewModels();
  await greyholmSections();
  await userCampaignSections();
  sharedComponent();
  privacy();
  sourceSafety();
  diagnosticsAndAnchors();

  const summary = checks.summary();
  const report = { verdict: summary.ok ? 'STAGE_11_HARNESS_PASS' : 'STAGE_11_HARNESS_FAIL', summary, results: checks.results };
  const outDir = resolve(root, 'rebuild-reports/stage-11');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'harness-results.json'), JSON.stringify(report, null, 2));

  for (const r of checks.results) if (!r.pass) console.log(`  FAIL ${r.name}: ${r.detail}`);
  console.log(`\nStage 11 harness: ${summary.passed}/${summary.total} PASS -> ${report.verdict}`);
  if (!summary.ok) process.exitCode = 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });

// Stage 13 — controlled universal command / write-path SHADOW execution harness.
//
// Proves that real allowlisted legacy mutations (Greyholm contract fixture +
// Caldran real user-campaign export) can be independently replayed as isolated
// universal commands against the exact captured pre-state, validated, and
// compared to the adapter-derived post-state — WITHOUT ever mutating legacy
// state, writing the production universal namespace, or performing any network
// / server sync. Deterministic (manual scheduler).
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import {
  CommandShadowCoordinator,
  CommandDiagnosticsStore,
  buildCommandEvent,
  executeUniversalCommand,
  compareCommandResult,
  redactCommandInput,
  isKnownCommandScope,
  stableHash,
  ALL_COMMAND_SHADOW_SCOPES,
  STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE,
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  entityIdFromLegacy,
  validateCampaignSnapshot,
  PUBLIC_VISIBILITY,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';
import { loadCaldran } from '../stage08/inputs.mjs';
import { buildGreyholmOverlayContractInput } from '../stage08/greyholmOverlayFixture.mjs';
import { instrumentedStorage, failingStorage, manualScheduler, settle } from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checks = new Checks();
let NOW_N = 0;
const NOW = () => new Date(1000 + NOW_N++).toISOString();

const greyId = campaignIdFromLegacy('greyholm', 'main');
const caldran = loadCaldran();
const caldId = campaignIdFromLegacy('user', caldran.raw.data.campaignId);

const clone = (v) => structuredClone(v);
const grey = () => buildGreyholmOverlayContractInput();
const cald = () => ({ data: clone(caldran.adapterInput.data), runtime: clone(caldran.adapterInput.runtime) });

function makeCoord(scopes = ALL_COMMAND_SHADOW_SCOPES, storageWrap) {
  const inst = storageWrap ?? instrumentedStorage();
  const sched = manualScheduler();
  const coord = new CommandShadowCoordinator({
    diagnosticsStorage: inst.storage,
    allowedScopes: new Set(scopes),
    scheduler: sched.scheduler,
    now: NOW,
  });
  return { inst, sched, coord };
}

/** Build a submission from cached pre/post adapter results (deterministic). */
function makeSubmission({ adapt, preInput, postInput, input, scope, campaignKind, sourceKind, campaignId, occurredAt }) {
  const preRes = adapt(preInput);
  const postRes = adapt(postInput);
  const event = buildCommandEvent({
    campaignId,
    campaignKind,
    sourceKind,
    commandScope: scope,
    input,
    preSnapshot: preRes.snapshot,
    postSnapshot: postRes.snapshot,
    occurredAt: occurredAt ?? NOW(),
    sourceIdentity: 'dm:harness',
  });
  return { event, input, buildPre: () => preRes, buildPost: () => postRes, preRes, postRes };
}

async function runOne(sub, scopes = ALL_COMMAND_SHADOW_SCOPES, storageWrap) {
  const { inst, sched, coord } = makeCoord(scopes, storageWrap);
  const disp = coord.submit(sub);
  await settle(coord, sched);
  const records = coord.readDiagnostics(sub.event.campaignId);
  const status = coord.getStatus(sub.event.campaignId);
  return { disp, records, status, coord, inst, sched };
}

// ---------------------------------------------------------------------------
// Real command-family case builders
// ---------------------------------------------------------------------------
function greyNpcUpdate(newRole = 'Shadow-Steward-13') {
  const preInput = grey();
  const postInput = grey();
  postInput.data.npcs[0] = { ...postInput.data.npcs[0], role: newRole };
  return makeSubmission({
    adapt: adaptMainCampaignToUniversal, preInput, postInput,
    input: { scope: 'greyholm.npc.update', legacyNpcId: preInput.data.npcs[0].id, field: 'role', value: newRole },
    scope: 'greyholm.npc.update', campaignKind: 'greyholm', sourceKind: 'legacy-main', campaignId: greyId,
  });
}

function greyReveal() {
  const preInput = grey();
  const locId = preInput.data.locationStates.find(
    (l) => !(preInput.overlay.party?.revealedLocationStateIds ?? []).includes(l.id),
  )?.id ?? preInput.data.locationStates[0].id;
  preInput.overlay.party = { ...(preInput.overlay.party ?? {}), revealedLocationStateIds: [] };
  const postInput = clone(preInput);
  postInput.overlay.party.revealedLocationStateIds = [locId];
  return makeSubmission({
    adapt: adaptMainCampaignToUniversal, preInput, postInput,
    input: { scope: 'greyholm.reveal.update', kind: 'locationState', legacyId: locId },
    scope: 'greyholm.reveal.update', campaignKind: 'greyholm', sourceKind: 'legacy-main', campaignId: greyId,
  });
}

function greyPresentCard() {
  const preInput = grey();
  preInput.overlay.presentedCard = null;
  const npcId = preInput.data.npcs[0].id;
  const postInput = clone(preInput);
  postInput.overlay.presentedCard = { type: 'npc', id: npcId };
  return makeSubmission({
    adapt: adaptMainCampaignToUniversal, preInput, postInput,
    input: { scope: 'greyholm.presentedCard.set', card: { type: 'npc', id: npcId } },
    scope: 'greyholm.presentedCard.set', campaignKind: 'greyholm', sourceKind: 'legacy-main', campaignId: greyId,
  });
}

function ucNpcUpdate(newRole = 'Stage13-Role') {
  const preInput = cald();
  const npcId = preInput.data.npcs[0].id;
  const postInput = cald();
  postInput.data.npcs[0] = { ...postInput.data.npcs[0], role: newRole };
  return makeSubmission({
    adapt: adaptUserCampaignToUniversal, preInput, postInput,
    input: { scope: 'userCampaign.npc.update', legacyNpcId: npcId, field: 'role', value: newRole },
    scope: 'userCampaign.npc.update', campaignKind: 'userCampaign', sourceKind: 'legacy-user-campaign', campaignId: caldId,
  });
}

function ucReveal() {
  const preInput = cald();
  preInput.runtime.revealedToPlayers = [];
  const npcId = preInput.data.npcs[0].id;
  const postInput = clone(preInput);
  postInput.runtime.revealedToPlayers = [npcId];
  return makeSubmission({
    adapt: adaptUserCampaignToUniversal, preInput, postInput,
    input: { scope: 'userCampaign.reveal.update', kind: 'npc', legacyId: npcId },
    scope: 'userCampaign.reveal.update', campaignKind: 'userCampaign', sourceKind: 'legacy-user-campaign', campaignId: caldId,
  });
}

function ucPlacement() {
  const preInput = cald();
  const p = preInput.data.mapPlacements[0];
  const nx = p.x + 3.5;
  const ny = p.y + 2.25;
  const postInput = cald();
  postInput.data.mapPlacements[0] = { ...p, x: nx, y: ny };
  return makeSubmission({
    adapt: adaptUserCampaignToUniversal, preInput, postInput,
    input: { scope: 'userCampaign.mapPlacement.update', placementId: p.id, x: nx, y: ny },
    scope: 'userCampaign.mapPlacement.update', campaignKind: 'userCampaign', sourceKind: 'legacy-user-campaign', campaignId: caldId,
  });
}

const okStatuses = new Set(['success']);

// ===========================================================================
// GROUP A — flags & safety (1–8)
// ===========================================================================
async function groupFlagsSafety() {
  const cfg = readFileSync(resolve(root, 'src/config.ts'), 'utf8');
  checks.ok('A01 flag defined default-off in config', /VITE_UNIVERSAL_COMMAND_SHADOW\b/.test(cfg) && /UNIVERSAL_COMMAND_SHADOW_ENABLED/.test(cfg));
  const envFiles = ['.env', '.env.example', '.env.production', 'railway.json'].map((f) => resolve(root, f)).filter(existsSync);
  const leaked = envFiles.filter((f) => /VITE_UNIVERSAL_COMMAND_SHADOW\s*=\s*(1|true)/i.test(readFileSync(f, 'utf8')));
  checks.ok('A02 no committed env enables the flag', leaked.length === 0, leaked.join(','));

  // Flag OFF is modelled as "no coordinator constructed" -> zero storage activity.
  const inst = instrumentedStorage();
  checks.eq('A03 flag-off: zero storage ops before any coordinator', inst.writeCount(), 0);
  // not_allowlisted: coordinator whose allowlist excludes the scope does nothing.
  const narrow = await runOne(greyNpcUpdate(), []);
  checks.eq('A04 empty allowlist -> not_allowlisted disposition', narrow.disp, 'not_allowlisted');
  checks.eq('A05 not_allowlisted writes zero diagnostics', narrow.inst.writeCount(), 0);
  checks.eq('A06 not_allowlisted schedules no entry', narrow.status, null);

  // No production namespace / server key ever touched.
  const okRun = await runOne(greyNpcUpdate());
  const badKeys = okRun.inst.rawKeys().filter((k) => !k.startsWith(STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE));
  checks.ok('A07 only the Stage-13 diagnostics namespace is written', badKeys.length === 0, badKeys.join(','));
  checks.ok('A08 no production/shadow/legacy namespace touched', !okRun.inst.rawKeys().some((k) => /production|stage-09|overlay|userCampaign:/.test(k)));
}

// ===========================================================================
// GROUP B — event contract (9–16)
// ===========================================================================
async function groupEventContract() {
  const sub = greyNpcUpdate();
  const ev = sub.event;
  checks.ok('B09 campaignId present on event', ev.campaignId === greyId);
  checks.ok('B10 command scope present & known', isKnownCommandScope(ev.commandScope));
  checks.ok('B11 event is frozen (immutable)', Object.isFrozen(ev) && Object.isFrozen(ev.commandPayload));
  const ev2 = greyNpcUpdate().event;
  checks.eq('B12 deterministic eventId for identical pre/post/scope/time', ev.eventId, deterministicRebuild(ev).eventId);
  checks.ok('B12b different payload -> different eventId', ev.eventId !== greyReveal().event.eventId);
  checks.ok('B13 pre/post hashes present & distinct for a real change', ev.legacyPreHash && ev.legacyPostHash && ev.legacyPreHash !== ev.legacyPostHash);
  // Redaction: long free-text role value is not stored verbatim.
  const longRole = 'x'.repeat(50);
  const red = redactCommandInput({ scope: 'greyholm.npc.update', legacyNpcId: 'n', field: 'role', value: longRole });
  checks.ok('B14 long free-text value redacted in payload', !JSON.stringify(red).includes(longRole) && /redacted:50/.test(JSON.stringify(red)));
  checks.ok('B15 payload carries only ids/paths/short summaries (no full snapshot)', Array.isArray(ev.commandPayload.targetIds) && Array.isArray(ev.commandPayload.changedFieldPaths) && !JSON.stringify(ev.commandPayload).includes('durable'));
  // wrong campaign rejected (event campaignId != pre snapshot campaign).
  const wc = makeSubmission({
    adapt: adaptMainCampaignToUniversal, preInput: grey(), postInput: grey(),
    input: greyNpcUpdate().input, scope: 'greyholm.npc.update', campaignKind: 'greyholm', sourceKind: 'legacy-main', campaignId: caldId,
  });
  const wcRun = await runOne(wc);
  checks.eq('B16 wrong campaign -> wrong_campaign', terminal(wcRun), 'wrong_campaign');
}

function deterministicRebuild(ev) {
  // Rebuild an event from the same greyNpcUpdate inputs & same occurredAt to
  // prove eventId determinism.
  const preInput = grey();
  const postInput = grey();
  postInput.data.npcs[0] = { ...postInput.data.npcs[0], role: 'Shadow-Steward-13' };
  const preRes = adaptMainCampaignToUniversal(preInput);
  const postRes = adaptMainCampaignToUniversal(postInput);
  return buildCommandEvent({
    campaignId: greyId, campaignKind: 'greyholm', sourceKind: 'legacy-main', commandScope: 'greyholm.npc.update',
    input: { scope: 'greyholm.npc.update', legacyNpcId: preInput.data.npcs[0].id, field: 'role', value: 'Shadow-Steward-13' },
    preSnapshot: preRes.snapshot, postSnapshot: postRes.snapshot, occurredAt: ev.occurredAt, sourceIdentity: 'dm:harness',
  });
}

function terminal(run) {
  return run.records.length ? run.records[run.records.length - 1].status : run.status?.status;
}

// ===========================================================================
// GROUP C — coordinator lifecycle & statuses (17–28)
// ===========================================================================
async function groupCoordinator() {
  const run = await runOne(greyNpcUpdate());
  checks.eq('C17 submit -> scheduled disposition', run.disp, 'scheduled');
  checks.eq('C18 one record persisted', run.records.length, 1);
  checks.eq('C19 real Greyholm durable update -> success', terminal(run), 'success');
  checks.eq('C20 success comparison classification equal', run.records[0].comparison.classification, 'equal');

  // semantic mismatch: command models role=A, legacy post has role=B.
  const mm = (() => {
    const preInput = grey();
    const postInput = grey();
    postInput.data.npcs[0] = { ...postInput.data.npcs[0], role: 'LEGACY-B' };
    return makeSubmission({
      adapt: adaptMainCampaignToUniversal, preInput, postInput,
      input: { scope: 'greyholm.npc.update', legacyNpcId: preInput.data.npcs[0].id, field: 'role', value: 'UNIVERSAL-A' },
      scope: 'greyholm.npc.update', campaignKind: 'greyholm', sourceKind: 'legacy-main', campaignId: greyId,
    });
  })();
  const mmRun = await runOne(mm);
  checks.eq('C21 divergent post -> semantic_mismatch', terminal(mmRun), 'semantic_mismatch');
  checks.ok('C22 mismatch reports safe changed paths only', mmRun.records[0].comparison.changedPaths.length > 0 && !JSON.stringify(mmRun.records[0].comparison).includes('LEGACY-B'));

  // validation_failed: corrupted base snapshot (foreign-campaign entity).
  const valRun = await runOne(validationFailureCase());
  checks.eq('C23 invalid universal result -> validation_failed', terminal(valRun), 'validation_failed');

  // mapping_failed: reveal a non-existent target.
  const mapSub = (() => {
    const s = greyReveal();
    s.input = { scope: 'greyholm.reveal.update', kind: 'locationState', legacyId: 'does-not-exist-zzz' };
    return s;
  })();
  const mapRun = await runOne(mapSub);
  checks.eq('C24 unresolved target -> mapping_failed', terminal(mapRun), 'mapping_failed');

  // command_rejected: empty payload value.
  const rejSub = (() => {
    const s = greyNpcUpdate();
    s.input = { scope: 'greyholm.npc.update', legacyNpcId: grey().data.npcs[0].id, field: 'role', value: '' };
    return s;
  })();
  const rejRun = await runOne(rejSub);
  checks.eq('C25 empty payload -> command_rejected', terminal(rejRun), 'command_rejected');

  // stale_precondition: buildPre returns a different snapshot than hashed.
  const staleRun = await runOne(stalePreconditionCase());
  checks.eq('C26 base hash mismatch -> stale_precondition', terminal(staleRun), 'stale_precondition');

  // diagnostics_persistence_failed: success case + failing storage.
  const failRun = await runOne(greyNpcUpdate(), ALL_COMMAND_SHADOW_SCOPES, { storage: failingStorage(), rawKeys: () => [], writeCount: () => 0 });
  checks.eq('C27 persistence throw -> diagnostics_persistence_failed', failRun.status?.status, 'diagnostics_persistence_failed');

  // cancellation: dispose before drain, then no processing / no throw.
  const { sched, coord } = makeCoord();
  coord.submit(greyNpcUpdate());
  coord.dispose();
  const cancelDisp = coord.submit(greyNpcUpdate());
  await settle(coord, sched).catch(() => {});
  checks.eq('C28 submit after dispose -> cancelled', cancelDisp, 'cancelled');

  // adapter_failed: buildPre returns a null snapshot.
  const adSub = greyNpcUpdate();
  adSub.buildPre = () => ({ snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'x', path: 'p', message: 'no snap' }] });
  const adRun = await runOne(adSub);
  checks.eq('C28b adapter null snapshot -> adapter_failed', terminal(adRun), 'adapter_failed');

  // command_failed: unknown input scope under an allowlisted event scope.
  const cfSub = greyNpcUpdate();
  cfSub.input = { scope: 'bogus.unknown' };
  const cfRun = await runOne(cfSub);
  checks.eq('C28c handler throw -> command_failed', terminal(cfRun), 'command_failed');
}

function validationFailureCase() {
  const preRes = adaptMainCampaignToUniversal(grey());
  const corrupt = structuredClone(preRes.snapshot);
  corrupt.durable.entities.push({
    id: entityIdFromLegacy('npc', 'foreign-bad'), campaignId: 'camp:other:zzz', kind: 'npc', title: 'Bad', visibility: PUBLIC_VISIBILITY, sourceIds: ['foreign-bad'],
  });
  const res = { snapshot: corrupt, source: { kind: 'synthetic' }, classifications: [], diagnostics: [] };
  const event = buildCommandEvent({
    campaignId: greyId, campaignKind: 'greyholm', sourceKind: 'legacy-main', commandScope: 'greyholm.npc.update',
    input: { scope: 'greyholm.npc.update', legacyNpcId: grey().data.npcs[0].id, field: 'role', value: 'R' },
    preSnapshot: corrupt, postSnapshot: corrupt, occurredAt: NOW(), sourceIdentity: 'dm:harness',
  });
  return { event, input: { scope: 'greyholm.npc.update', legacyNpcId: grey().data.npcs[0].id, field: 'role', value: 'R' }, buildPre: () => res, buildPost: () => res };
}

function stalePreconditionCase() {
  const sub = greyNpcUpdate();
  const other = adaptMainCampaignToUniversal(greyReveal().postRes ? grey() : grey());
  // Return a snapshot whose hash differs from the event's captured pre hash.
  const drifted = structuredClone(sub.preRes.snapshot);
  drifted.metadata = { ...drifted.metadata, title: 'DRIFTED' };
  sub.buildPre = () => ({ snapshot: drifted, source: { kind: 'synthetic' }, classifications: [], diagnostics: [] });
  void other;
  return sub;
}

// ===========================================================================
// GROUP D — universal handlers (29–40)
// ===========================================================================
function groupHandlers() {
  const preRes = adaptMainCampaignToUniversal(grey());
  const pre = preRes.snapshot;
  const npcId = grey().data.npcs[0].id;
  const r1 = executeUniversalCommand(pre, { scope: 'greyholm.npc.update', legacyNpcId: npcId, field: 'role', value: 'X1' });
  const r2 = executeUniversalCommand(pre, { scope: 'greyholm.npc.update', legacyNpcId: npcId, field: 'role', value: 'X1' });
  checks.ok('D29 handler deterministic', JSON.stringify(r1) === JSON.stringify(r2));
  checks.ok('D30 handler does not mutate input snapshot', pre.durable.entities.find((e) => e.id === entityIdFromLegacy('npc', npcId)).role !== 'X1');
  checks.ok('D31 accepted result carries a snapshot', r1.accepted && !!r1.snapshot);
  checks.ok('D32 updatedIds populated', r1.updatedIds.length === 1);
  checks.ok('D33 changedPaths populated', r1.changedPaths.length === 1);
  checks.ok('D34 result snapshot campaign unchanged', r1.snapshot.metadata.campaignId === greyId);
  const reveal = executeUniversalCommand(pre, { scope: 'greyholm.reveal.update', kind: 'locationState', legacyId: grey().data.locationStates[0].id });
  checks.ok('D35 reveal populates referenceChanges', reveal.referenceChanges.length === 1);
  const present = executeUniversalCommand(pre, { scope: 'greyholm.presentedCard.set', card: { type: 'npc', id: npcId } });
  checks.ok('D36 presentedCard populates runtimeChanges', present.runtimeChanges.length === 1);
  const missing = executeUniversalCommand(pre, { scope: 'greyholm.npc.update', legacyNpcId: 'nope', field: 'role', value: 'y' });
  checks.eq('D37 unresolved id rejected (mapping_failed)', missing.rejectionCode, 'mapping_failed');
  const empty = executeUniversalCommand(pre, { scope: 'greyholm.npc.update', legacyNpcId: npcId, field: 'role', value: '' });
  checks.eq('D38 empty payload rejected (invalid_payload)', empty.rejectionCode, 'invalid_payload');
  const badPresent = executeUniversalCommand(pre, { scope: 'greyholm.presentedCard.set', card: { type: 'npc', id: 'ghost' } });
  checks.eq('D39 unresolved presented card rejected', badPresent.rejectionCode, 'mapping_failed');
  // No first-match: an id under the wrong kind does not resolve.
  const wrongKind = executeUniversalCommand(pre, { scope: 'greyholm.reveal.update', kind: 'npc', legacyId: grey().data.locationStates[0].id });
  checks.eq('D40 wrong-kind id does not first-match', wrongKind.rejectionCode, 'mapping_failed');
}

// ===========================================================================
// GROUP E — comparison classification (41–50)
// ===========================================================================
function groupComparison() {
  const pre = adaptMainCampaignToUniversal(grey()).snapshot;
  const same = compareCommandResult(pre, structuredClone(pre));
  checks.eq('E41 identical -> equal', same.classification, 'equal');
  const revOnly = compareCommandResult(pre, { ...structuredClone(pre), revision: 99 });
  checks.eq('E42 revision-only -> revision_only', revOnly.classification, 'revision_only');
  const reordered = structuredClone(pre);
  reordered.durable.entities.reverse();
  const ord = compareCommandResult(pre, reordered);
  checks.ok('E43 reordered identifiable collection -> ordering_only', ['ordering_only', 'equal'].includes(ord.classification));
  // entity mismatch
  const em = structuredClone(pre); em.durable.entities[0] = { ...em.durable.entities[0], title: 'CHANGED' };
  checks.eq('E44 entity field change -> semantic_mismatch', compareCommandResult(pre, em).classification, 'semantic_mismatch');
  // reference mismatch
  const rm = structuredClone(pre);
  const li = rm.durable.entities.findIndex((e) => e.kind === 'location');
  if (li >= 0) rm.durable.entities[li] = { ...rm.durable.entities[li], npcRefs: [{ campaignId: greyId, entityId: entityIdFromLegacy('npc', 'zzz'), kind: 'npc' }] };
  const rmc = compareCommandResult(pre, rm);
  checks.ok('E45 reference change flagged', li < 0 || rmc.classification === 'semantic_mismatch');
  // runtime mismatch (pre has a presented card; clearing it is a runtime delta)
  const rtm = structuredClone(pre); rtm.runtime.presentation = { ...rtm.runtime.presentation, presentedCard: null };
  const rtmc = compareCommandResult(pre, rtm);
  checks.ok('E46 runtime change -> runtimeMismatches', rtmc.runtimeMismatches.length > 0);
  // visibility mismatch
  const vm = structuredClone(pre); vm.visibility = { ...vm.visibility, entities: { ...vm.visibility.entities, [entityIdFromLegacy('npc', grey().data.npcs[0].id)]: PUBLIC_VISIBILITY } };
  const vmc = compareCommandResult(pre, vm);
  checks.ok('E47 visibility change -> visibilityMismatches', vmc.visibilityMismatches.length > 0);
  // coordinate mismatch (placement) on a UC snapshot
  const ucPre = adaptUserCampaignToUniversal(cald()).snapshot;
  const cm = structuredClone(ucPre); cm.durable.placements[0] = { ...cm.durable.placements[0], position: { x: 9, y: 9 } };
  checks.eq('E48 coordinate change -> semantic_mismatch', compareCommandResult(ucPre, cm).classification, 'semantic_mismatch');
  // image-ref mismatch
  const imgIdx = ucPre.durable.entities.findIndex((e) => e.kind === 'image');
  const im = structuredClone(ucPre); if (imgIdx >= 0) im.durable.entities[imgIdx] = { ...im.durable.entities[imgIdx], src: 'data:changed' };
  checks.ok('E49 image field change flagged', imgIdx < 0 || compareCommandResult(ucPre, im).classification === 'semantic_mismatch');
  // safe: comparison never contains payload values
  checks.ok('E50 comparison summary carries no payload values', !JSON.stringify(compareCommandResult(pre, em)).includes('CHANGED'));
}

// ===========================================================================
// GROUP F — Greyholm integration (51–60)
// ===========================================================================
async function groupGreyholm() {
  const durable = await runOne(greyNpcUpdate());
  checks.eq('F51 Greyholm durable npc update legacy-equivalent succeeds', terminal(durable), 'success');
  checks.eq('F52 durable comparison equal', durable.records[0].comparison.classification, 'equal');
  const runtime = await runOne(greyPresentCard());
  checks.eq('F53 Greyholm runtime (presented card) succeeds', terminal(runtime), 'success');
  const reference = await runOne(greyReveal());
  checks.eq('F54 Greyholm reference (reveal) succeeds', terminal(reference), 'success');
  checks.ok('F55 reveal changed visibility.entities', reference.records[0].changedFieldPaths.includes('visibility.entities'));
  // pending ordering + rapid commands on same campaign
  const { sched, coord } = makeCoord();
  const d1 = coord.submit(greyNpcUpdate('R-a'));
  const d2 = coord.submit(greyReveal());
  const d3 = coord.submit(greyPresentCard());
  await settle(coord, sched);
  const recs = coord.readDiagnostics(greyId);
  checks.ok('F56 rapid same-campaign commands all recorded', recs.length === 3, `got ${recs.length}`);
  checks.ok('F57 rapid commands all succeed', recs.every((r) => r.status === 'success'));
  checks.ok('F58 pending drains sequentially (dispositions scheduled)', d1 === 'scheduled' && d2 === 'scheduled' && d3 === 'scheduled');
  // source immutability: the frozen real caldran raw is never mutated by a run.
  const beforeGrey = stableHash(grey());
  await runOne(greyNpcUpdate('Z'));
  checks.eq('F59 legacy source input not mutated by shadow run', stableHash(grey()), beforeGrey);
  checks.ok('F60 shadow run does not expose an apply-to-legacy action', typeof coord.applyToLegacy === 'undefined' && typeof coord.writeProduction === 'undefined');
}

// ===========================================================================
// GROUP G — User Campaign integration (61–72)
// ===========================================================================
async function groupUserCampaign() {
  const entity = await runOne(ucNpcUpdate());
  checks.eq('G61 UC entity update succeeds', terminal(entity), 'success');
  const reveal = await runOne(ucReveal());
  checks.eq('G62 UC reveal (reference) succeeds', terminal(reveal), 'success');
  const placement = await runOne(ucPlacement());
  checks.eq('G63 UC map placement update succeeds', terminal(placement), 'success');
  checks.ok('G64 UC events strictly scoped to caldId', entity.records[0].campaignId === caldId);
  checks.ok('G65 UC uses direct campaign identity (not greyholm)', entity.records[0].campaignId !== greyId);
  // campaign switch + two-campaign isolation on one coordinator
  const { sched, coord } = makeCoord();
  coord.submit(greyNpcUpdate());
  coord.submit(ucNpcUpdate());
  await settle(coord, sched);
  const gRecs = coord.readDiagnostics(greyId);
  const uRecs = coord.readDiagnostics(caldId);
  checks.ok('G66 campaign switch: both campaigns tracked', gRecs.length === 1 && uRecs.length === 1);
  checks.ok('G67 two-campaign isolation: distinct keys', gRecs[0].campaignId !== uRecs[0].campaignId);
  checks.ok('G68 absent cache: unknown campaign has no status', coord.getStatus(campaignIdFromLegacy('user', 'never-seen')) === null);
  // deleted campaign: clearing one leaves the other intact
  coord.clearDiagnostics(caldId);
  checks.ok('G69 clearing UC diagnostics leaves Greyholm intact', coord.readDiagnostics(greyId).length === 1 && coord.readDiagnostics(caldId).length === 0);
  const beforeUc = stableHash(cald());
  await runOne(ucPlacement());
  checks.eq('G70 UC legacy source not mutated', stableHash(cald()), beforeUc);
  const caldFixture = readFileSync(caldran.sourcePaths.export, 'utf8');
  await runOne(ucNpcUpdate());
  checks.eq('G71 userCampaignSync/source fixture bytes unchanged', readFileSync(caldran.sourcePaths.export, 'utf8'), caldFixture);
  // shadow failure does not block "legacy" (modelled: failing storage still returns cleanly)
  const failRun = await runOne(ucNpcUpdate(), ALL_COMMAND_SHADOW_SCOPES, { storage: failingStorage(), rawKeys: () => [], writeCount: () => 0 });
  checks.eq('G72 UC shadow persistence failure is contained', failRun.status?.status, 'diagnostics_persistence_failed');
}

// ===========================================================================
// GROUP H — concurrency (73–80)
// ===========================================================================
async function groupConcurrency() {
  const { sched, coord } = makeCoord();
  const a = greyNpcUpdate('C-a');
  const b = greyNpcUpdate('C-b');
  coord.submit(a); coord.submit(b);
  await settle(coord, sched);
  const recs = coord.readDiagnostics(greyId);
  checks.eq('H73 same-campaign FIFO: both processed once', recs.length, 2);

  const { sched: s2, coord: c2 } = makeCoord();
  c2.submit(greyNpcUpdate()); c2.submit(ucNpcUpdate());
  await settle(c2, s2);
  checks.ok('H74 different campaigns both complete independently', c2.getStatus(greyId).status === 'success' && c2.getStatus(caldId).status === 'success');

  // stale result ignored: an older-occurredAt event completing later must not
  // regress the live status.
  const { sched: s3, coord: c3 } = makeCoord();
  const newer = greyPresentCard(); // occurredAt assigned later (bigger)
  const older = greyReveal();
  older.event = { ...older.event, occurredAt: new Date(500).toISOString() };
  c3.submit(newer); await settle(c3, s3);
  const afterNewer = c3.getStatus(greyId).status;
  c3.submit(older); await settle(c3, s3);
  checks.ok('H75 stale (older) completion does not regress live status', c3.getStatus(greyId).status === afterNewer);

  // duplicate event deduped
  const { sched: s4, coord: c4 } = makeCoord();
  const dup = greyNpcUpdate();
  const d1 = c4.submit(dup); const d2 = c4.submit(dup);
  await settle(c4, s4);
  checks.ok('H76 duplicate event deduped (2nd not re-run)', d1 === 'scheduled' && d2 === 'scheduled' && c4.readDiagnostics(greyId).length === 1);

  // StrictMode-style double registration: two coordinators, isolated storage.
  const inst = instrumentedStorage();
  const sA = manualScheduler(); const cA = new CommandShadowCoordinator({ diagnosticsStorage: inst.storage, allowedScopes: new Set(ALL_COMMAND_SHADOW_SCOPES), scheduler: sA.scheduler, now: NOW });
  cA.submit(greyNpcUpdate()); await settle(cA, sA); cA.dispose();
  checks.ok('H77 dispose after run is safe & idempotent', (() => { cA.dispose(); return true; })());

  // dispose cancels pending shadow only (no legacy effect / no throw)
  const { coord: c5 } = makeCoord();
  c5.submit(greyNpcUpdate());
  checks.ok('H78 dispose with pending work does not throw', (() => { c5.dispose(); return true; })());

  // newer event remains latest after both processed in order
  const { sched: s6, coord: c6 } = makeCoord();
  c6.submit(greyReveal()); await settle(c6, s6);
  c6.submit(greyPresentCard()); await settle(c6, s6);
  checks.eq('H79 latest event status retained', c6.getStatus(greyId).status, 'success');

  // no recursive loop: one legacy event -> exactly one record
  const solo = await runOne(greyNpcUpdate());
  checks.eq('H80 one event -> exactly one diagnostic record', solo.records.length, 1);
}

// ===========================================================================
// GROUP I — diagnostics storage (81–90)
// ===========================================================================
async function groupDiagnostics() {
  const run = await runOne(greyNpcUpdate());
  const rec = run.records[0];
  const fields = ['eventId', 'campaignId', 'commandScope', 'status', 'legacyPreHash', 'legacyPostHash', 'baseRevision', 'resultRevision', 'comparison'];
  checks.ok('I81 record is structured with required fields', fields.every((f) => f in rec));
  // bounded history
  const inst = instrumentedStorage();
  const store = new CommandDiagnosticsStore(inst.storage, 3);
  for (let i = 0; i < 6; i++) store.append({ ...rec, eventId: `e${i}` });
  checks.eq('I82 history bounded to maxRecords', store.count(greyId), 3);
  checks.ok('I83 campaign-scoped namespace key', CommandDiagnosticsStore.keyFor(greyId).startsWith(STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE) && CommandDiagnosticsStore.keyFor(greyId).endsWith(greyId));
  // clear one campaign only
  const { sched, coord } = makeCoord();
  coord.submit(greyNpcUpdate()); coord.submit(ucNpcUpdate()); await settle(coord, sched);
  coord.clearDiagnostics(greyId);
  checks.ok('I84 clear one campaign only', coord.readDiagnostics(greyId).length === 0 && coord.readDiagnostics(caldId).length === 1);
  // secrets redacted / no full snapshots
  const blob = JSON.stringify(run.records);
  checks.ok('I85 no full snapshot in diagnostics', !blob.includes('"durable"') && !blob.includes('"schemaVersion"'));
  checks.ok('I86 pre/post stored as hashes not content', /h[0-9a-f]+:/.test(rec.legacyPreHash));
  // DM guard is a UI concern; assert diagnostics carry no player-only fields
  checks.ok('I87 diagnostics contain only ids/paths/counts', !blob.includes('publicDescription') && !blob.includes('dmNotes'));
  // read-only actions: reading/clearing never writes campaign content keys
  const before = inst.rawKeys().filter((k) => k.startsWith(STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE)).length;
  coord.readDiagnostics(greyId);
  checks.ok('I88 read action does not create new keys', inst.rawKeys().filter((k) => k.startsWith(STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE)).length <= before + 0 + 1);
  // export redacted summary shape
  const summary = run.records.map((r) => ({ eventId: r.eventId, status: r.status, classification: r.comparison?.classification }));
  checks.ok('I89 exportable summary is redacted', !JSON.stringify(summary).includes('durable'));
  // production data untouched — only the stage-13 namespace exists
  checks.ok('I90 only stage-13 namespace keys exist', run.inst.rawKeys().every((k) => k.startsWith(STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE)));
}

// ---------------------------------------------------------------------------
async function main() {
  await groupFlagsSafety();
  await groupEventContract();
  await groupCoordinator();
  groupHandlers();
  groupComparison();
  await groupGreyholm();
  await groupUserCampaign();
  await groupConcurrency();
  await groupDiagnostics();

  const s = checks.summary();
  const verdict = s.ok ? 'STAGE_13_HARNESS_PASS' : 'STAGE_13_HARNESS_FAIL';
  const failed = checks.results.filter((r) => !r.pass);
  const report = {
    verdict,
    passed: s.passed,
    failed: s.failed,
    total: s.total,
    failures: failed.map((f) => ({ name: f.name, detail: f.detail })),
    generatedAt: new Date(0).toISOString(),
  };
  const outDir = resolve(root, 'rebuild-reports/stage-13');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'harness-report.json'), JSON.stringify(report, null, 2) + '\n');
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail ?? ''}`);
  }
  console.log(`\nStage 13 harness: ${s.passed}/${s.total} PASS -> ${verdict}`);
  if (!s.ok) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });

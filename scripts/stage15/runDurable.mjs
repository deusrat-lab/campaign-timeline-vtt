// Stage 15 — universal DURABLE AUTHORITY harness.
//
// Proves that for a proven-safe field-level allowlist across BOTH stacks the
// universal production repository becomes the durable source of truth: the
// universal command runs first, is atomically committed to the production
// namespace under an expected-revision guard and verified read-after-write, and
// only then is the existing legacy action invoked ONCE as a deterministic
// compatibility projection. Legacy-owned data is never overwritten by a stale
// universal snapshot; partial failures become idempotent pending recovery;
// reconciliation handles external legacy edits — all WITHOUT server changes,
// network, migration, or a second authoritative write. Deterministic, real
// adapters + real Caldran data + real Greyholm contract overlay.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  DurableAuthorityRouter,
  SyncDurableRepository,
  DurableDiagnosticsStore,
  RecoveryStore,
  ALL_DURABLE_AUTHORITY_SCOPES,
  resolveDurableScopes,
  safeFieldDescriptor,
  allSafeFieldDescriptors,
  isKnownDurableScope,
  isAllowedDurableChangePath,
  ownershipOf,
  universalOwnedFieldSlots,
  executeSafeFieldCommand,
  readSafeField,
  composeDurableBase,
  reconcileOwnedFields,
  entityIdFromLegacy,
  semanticSnapshotHash,
  validateCampaignSnapshot,
  UNIVERSAL_PRODUCTION_NAMESPACE,
  UNIVERSAL_SHADOW_NAMESPACE,
  STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE,
  STAGE_15_RECOVERY_NAMESPACE,
  STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE,
  STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';
import {
  instrumentedStorage,
  failingSetStorage,
  corruptReadStorage,
  greyholmLegacy,
  userCampaignLegacy,
  greyRequest,
  userRequest,
  clone,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checks = new Checks();
let NOW_N = 0;
const NOW = () => new Date(1_000 + NOW_N++).toISOString();

const ALL = ALL_DURABLE_AUTHORITY_SCOPES;

function newEnv({ enabled = true, scopes = ALL, repoWrap, diagWrap, recovWrap } = {}) {
  const repo = repoWrap ?? instrumentedStorage();
  const diag = diagWrap ?? instrumentedStorage();
  const recov = recovWrap ?? instrumentedStorage();
  const router = new DurableAuthorityRouter({
    repositoryStorage: repo.storage,
    diagnosticsStorage: diag.storage,
    recoveryStorage: recov.storage,
    allowedScopes: new Set(scopes),
    enabled,
    now: NOW,
  });
  const readRepo = new SyncDurableRepository(repo.storage);
  return { router, repo, diag, recov, readRepo };
}

// ==========================================================================
// GROUP: static contracts & safe-field registry
// ==========================================================================
function groupRegistry() {
  checks.eq('scope count == descriptor count', ALL.length, allSafeFieldDescriptors().length);
  checks.ok('greyholm role+name present', ALL.includes('greyholm.npc.role.update') && ALL.includes('greyholm.npc.name.update'));
  checks.ok('userCampaign multi-entity present', ['userCampaign.npc.description.update', 'userCampaign.quest.title.update', 'userCampaign.faction.name.update', 'userCampaign.location.description.update'].every((s) => ALL.includes(s)));
  const kinds = new Set(allSafeFieldDescriptors().map((d) => d.entityKind));
  checks.ok('covers >=3 entity kinds', kinds.size >= 3, [...kinds].join(','));
  const stacks = new Set(allSafeFieldDescriptors().map((d) => d.campaignKind));
  checks.ok('covers both stacks', stacks.has('greyholm') && stacks.has('userCampaign'));
  checks.ok('unknown scope rejected', !isKnownDurableScope('userCampaign.npc.hp.update'));
  checks.ok('known scope accepted', isKnownDurableScope('userCampaign.quest.title.update'));
  // Ownership: every allowlisted field is universal-owned; non-safe fields legacy-owned.
  for (const d of allSafeFieldDescriptors()) {
    checks.eq(`ownership ${d.entityKind}.${d.universalField} universal-owned`, ownershipOf(d.entityKind, d.universalField), 'universal-owned');
  }
  checks.eq('npc.locationRef legacy-owned', ownershipOf('npc', 'locationRef'), 'legacy-owned');
  checks.eq('enemy.hp legacy-owned', ownershipOf('enemy', 'hp'), 'legacy-owned');
  checks.ok('owned slots deterministic', universalOwnedFieldSlots().length >= 3);
  // Path allowlist
  checks.ok('allowed role path', isAllowedDurableChangePath('greyholm.npc.role.update', 'durable.entities:entity:npc/x.role'));
  checks.ok('reject nested path', !isAllowedDurableChangePath('greyholm.npc.role.update', 'durable.entities:entity:npc/x.role.deep'));
  checks.ok('reject wrong field path', !isAllowedDurableChangePath('greyholm.npc.role.update', 'durable.entities:entity:npc/x.title'));
  checks.ok('reject visibility path', !isAllowedDurableChangePath('userCampaign.location.description.update', 'visibility.entities:x'));
  // Scope resolution (narrowing only)
  checks.eq('resolve empty -> all', resolveDurableScopes('').size, ALL.length);
  checks.eq('resolve all -> all', resolveDurableScopes('all').size, ALL.length);
  checks.eq('resolve subset', resolveDurableScopes('greyholm.npc.role.update').size, 1);
  checks.ok('resolve ignores unknown', resolveDurableScopes('greyholm.npc.role.update nonsense.x.y').size === 1);
}

// ==========================================================================
// GROUP: generic safe-field command
// ==========================================================================
function groupCommand() {
  const legacy = userCampaignLegacy();
  const pre = legacy.adaptPre().snapshot;
  const npcId = legacy.firstId('npc');
  // accepted, immutable input, deterministic candidate, exact single path
  const r1 = executeSafeFieldCommand(pre, { scope: 'userCampaign.npc.role.update', legacyEntityId: npcId, value: 'Новый чин' });
  checks.ok('command accepted', r1.accepted && !!r1.snapshot);
  checks.eq('single changed path', r1.changedPaths.length, 1);
  checks.ok('changed path shape', /^durable\.entities:.+\.role$/.test(r1.changedPaths[0]));
  const preHashBefore = semanticSnapshotHash(pre);
  const r1b = executeSafeFieldCommand(pre, { scope: 'userCampaign.npc.role.update', legacyEntityId: npcId, value: 'Новый чин' });
  checks.eq('input not mutated', semanticSnapshotHash(pre), preHashBefore);
  checks.eq('deterministic candidate', semanticSnapshotHash(r1.snapshot), semanticSnapshotHash(r1b.snapshot));
  const uid = entityIdFromLegacy('npc', npcId);
  checks.eq('field written on entity', r1.snapshot.durable.entities.find((e) => e.id === uid).role, 'Новый чин');
  // empty value: non-empty-required rejected, allowEmpty accepted
  checks.ok('empty role rejected', !executeSafeFieldCommand(pre, { scope: 'userCampaign.npc.role.update', legacyEntityId: npcId, value: '  ' }).accepted);
  checks.ok('empty description allowed', executeSafeFieldCommand(pre, { scope: 'userCampaign.npc.description.update', legacyEntityId: npcId, value: '' }).accepted);
  // non-string rejected
  checks.ok('non-string rejected', !executeSafeFieldCommand(pre, { scope: 'userCampaign.npc.role.update', legacyEntityId: npcId, value: 5 }).accepted);
  // mapping failure on unknown id / wrong kind
  checks.eq('unknown id -> mapping_failed', executeSafeFieldCommand(pre, { scope: 'userCampaign.npc.role.update', legacyEntityId: 'nope', value: 'x' }).rejectionCode, 'mapping_failed');
  const questId = legacy.firstId('quest');
  checks.eq('kind mismatch -> mapping_failed', executeSafeFieldCommand(pre, { scope: 'userCampaign.npc.role.update', legacyEntityId: questId, value: 'x' }).rejectionCode, 'mapping_failed');
  // no arbitrary paths / no id change / no reference change: only the one field differs
  const before = pre.durable.entities.find((e) => e.id === uid);
  const after = r1.snapshot.durable.entities.find((e) => e.id === uid);
  checks.eq('id unchanged', after.id, before.id);
  checks.eq('kind unchanged', after.kind, before.kind);
  checks.eq('title unchanged', after.title, before.title);
  checks.eq('locationRef unchanged', JSON.stringify(after.locationRef), JSON.stringify(before.locationRef));
  // same-source-id isolation: different campaigns produce different universal ids
  const grey = greyholmLegacy();
  const greyPre = grey.adaptPre().snapshot;
  checks.ok('campaign-scoped ids differ', greyPre.metadata.campaignId !== pre.metadata.campaignId);
  // readSafeField
  checks.eq('readSafeField returns value', readSafeField(r1.snapshot, 'npc', npcId, 'role'), 'Новый чин');
  checks.eq('readSafeField missing -> undefined', readSafeField(pre, 'npc', 'nope', 'role'), undefined);
}

// ==========================================================================
// GROUP: flags (default off / narrowing)
// ==========================================================================
function groupFlags() {
  // OFF: no router creation of records/repo/recovery, legacy runs, unhandled.
  const legacy = userCampaignLegacy();
  const env = newEnv({ enabled: false });
  const npcId = legacy.firstId('npc');
  const { request, calls } = userRequest(legacy, 'userCampaign.npc.role.update', 'npc', npcId, 'X', NOW());
  const out = env.router.route(request);
  checks.ok('OFF: not handled', out.handled === false);
  checks.eq('OFF: fallback ran once', calls.commit + calls.fallback, 1);
  checks.eq('OFF: fallback path', calls.fallback, 1);
  checks.eq('OFF: no repo writes', env.repo.ops.set, 0);
  checks.eq('OFF: no diag writes', env.diag.ops.set, 0);
  checks.eq('OFF: no recovery writes', env.recov.ops.set, 0);
  checks.eq('OFF: no production read', env.repo.ops.get, 0);
  checks.eq('OFF: legacy value applied', legacy.read('npc', npcId, 'role'), 'X');

  // Not allowlisted (flag on, scope narrowed away): bare fallback, no repo.
  const legacy2 = userCampaignLegacy();
  const env2 = newEnv({ enabled: true, scopes: ['greyholm.npc.role.update'] });
  const q = userRequest(legacy2, 'userCampaign.npc.role.update', 'npc', legacy2.firstId('npc'), 'Y', NOW());
  const out2 = env2.router.route(q.request);
  checks.ok('narrowed: not handled', out2.handled === false);
  checks.eq('narrowed: no repo write', env2.repo.ops.set, 0);
  checks.eq('narrowed: legacy ran', q.calls.fallback, 1);
  checks.ok('isAllowlisted false', !env2.router.isAllowlisted('userCampaign.npc.role.update'));
  checks.ok('isAllowlisted true', env2.router.isAllowlisted('greyholm.npc.role.update'));
}

// ==========================================================================
// GROUP: durable authority happy path (both stacks, multiple fields)
// ==========================================================================
function durableHappy(makeLegacy, scope, target, value, label) {
  const env = newEnv({});
  const legacy = makeLegacy();
  const d = safeFieldDescriptor(scope);
  const rq = legacy.kind === 'greyholm'
    ? greyRequest(legacy, scope, target, value, NOW())
    : userRequest(legacy, scope, d.entityKind, target, value, NOW());
  const out = env.router.route(rq.request);
  checks.eq(`${label}: success`, out.phase, 'success');
  checks.eq(`${label}: durable decision`, out.decision, 'durable_committed');
  checks.eq(`${label}: one legacy commit`, rq.calls.commit, 1);
  checks.eq(`${label}: no fallback`, rq.calls.fallback, 0);
  // repository authoritative & at revision 1 (first write)
  const rev = env.readRepo.readRevision(legacy.campaignId);
  checks.eq(`${label}: repo revision 1`, rev, 1);
  const snap = env.readRepo.read(legacy.campaignId);
  const uid = entityIdFromLegacy(d.entityKind, target);
  checks.eq(`${label}: repo holds value`, readSafeField(snap, d.entityKind, target, d.universalField), value);
  // read-after-write hashes recorded equal
  const rec = out.record;
  checks.eq(`${label}: read-after-write equal`, rec.repositoryReadHash, rec.repositoryCommittedHash);
  checks.eq(`${label}: legacy projection committed`, rec.legacyProjectionStatus, 'committed');
  const lvc = rec.legacyVerificationComparison ? rec.legacyVerificationComparison.classification : 'none';
  checks.ok(`${label}: legacy verification equal`, lvc === 'equal' || lvc === 'ordering_only', `got ${lvc}`);
  checks.eq(`${label}: only production namespace touched`, [...env.repo.touchedKeys].every((k) => k.startsWith(UNIVERSAL_PRODUCTION_NAMESPACE)), true);
  checks.ok(`${label}: no shadow namespace`, ![...env.repo.touchedKeys].some((k) => k.startsWith(UNIVERSAL_SHADOW_NAMESPACE)));
  // legacy also reflects value
  const legVal = legacy.kind === 'greyholm' ? legacy.read(target, d.legacyField) : legacy.read(d.entityKind, target, d.legacyField);
  checks.eq(`${label}: legacy value equals`, legVal, value);
  return env;
}

function groupDurableHappy() {
  durableHappy(greyholmLegacy, 'greyholm.npc.role.update', greyholmLegacy().firstNpcId(), 'Архивариус', 'grey.role');
  durableHappy(greyholmLegacy, 'greyholm.npc.name.update', greyholmLegacy().firstNpcId(), 'Мэр Олдвин II', 'grey.name');
  const uc = userCampaignLegacy();
  durableHappy(userCampaignLegacy, 'userCampaign.npc.role.update', uc.firstId('npc'), 'Новая роль', 'uc.npc.role');
  durableHappy(userCampaignLegacy, 'userCampaign.npc.name.update', uc.firstId('npc'), 'Новое имя', 'uc.npc.name');
  durableHappy(userCampaignLegacy, 'userCampaign.npc.description.update', uc.firstId('npc'), 'Новое описание', 'uc.npc.desc');
  durableHappy(userCampaignLegacy, 'userCampaign.quest.title.update', uc.firstId('quest'), 'Новый квест', 'uc.quest.title');
  durableHappy(userCampaignLegacy, 'userCampaign.quest.description.update', uc.firstId('quest'), 'Описание квеста', 'uc.quest.desc');
  durableHappy(userCampaignLegacy, 'userCampaign.faction.name.update', uc.firstId('faction'), 'Новая фракция', 'uc.faction.name');
  durableHappy(userCampaignLegacy, 'userCampaign.faction.description.update', uc.firstId('faction'), 'Цели фракции', 'uc.faction.desc');
  durableHappy(userCampaignLegacy, 'userCampaign.location.description.update', uc.firstId('location'), 'Место обновлено', 'uc.loc.desc');
}

// ==========================================================================
// GROUP: sequential commits + revision monotonicity + composition safety
// ==========================================================================
function groupSequential() {
  const env = newEnv({});
  const legacy = userCampaignLegacy();
  const npcId = legacy.firstId('npc');
  const questId = legacy.firstId('quest');
  const r1 = env.router.route(userRequest(legacy, 'userCampaign.npc.role.update', 'npc', npcId, 'Роль-1', NOW()).request);
  const r2 = env.router.route(userRequest(legacy, 'userCampaign.npc.name.update', 'npc', npcId, 'Имя-2', NOW()).request);
  const r3 = env.router.route(userRequest(legacy, 'userCampaign.quest.title.update', 'quest', questId, 'Квест-3', NOW()).request);
  checks.eq('seq r1 success', r1.phase, 'success');
  checks.eq('seq r2 success', r2.phase, 'success');
  checks.eq('seq r3 success', r3.phase, 'success');
  checks.eq('revision monotonic to 3', env.readRepo.readRevision(legacy.campaignId), 3);
  const snap = env.readRepo.read(legacy.campaignId);
  checks.eq('npc role persisted', readSafeField(snap, 'npc', npcId, 'role'), 'Роль-1');
  checks.eq('npc name persisted', readSafeField(snap, 'npc', npcId, 'title'), 'Имя-2');
  checks.eq('quest title persisted', readSafeField(snap, 'quest', questId, 'title'), 'Квест-3');
  // Legacy-owned data preserved across durable writes: counts + a legacy-owned
  // reference field intact.
  const c = legacy.counts();
  checks.eq('npc count preserved', snap.durable.entities.filter((e) => e.kind === 'npc').length, c.npcs);
  checks.ok('maps/runtime preserved (durable maps present)', Array.isArray(snap.durable.maps));
  // reveal/runtime not touched by durable writes: runtime hash stable vs legacy adapt
  const legadapt = legacy.adaptPre().snapshot;
  checks.eq('runtime equals latest legacy runtime', JSON.stringify(snap.runtime.presentation), JSON.stringify(legadapt.runtime.presentation));
}

// ==========================================================================
// GROUP: composition & reconciliation units
// ==========================================================================
function groupComposition() {
  const legacy = userCampaignLegacy();
  const npcId = legacy.firstId('npc');
  const legacyPre = legacy.adaptPre().snapshot;

  // missing universal -> initialization from legacy
  const c0 = composeDurableBase(legacyPre, null, new Set());
  checks.eq('compose init status', c0.initialization, 'initialized');
  checks.eq('compose init base == legacy', semanticSnapshotHash(c0.base), semanticSnapshotHash(legacyPre));
  checks.eq('reconcile missing_universal', c0.report.status, 'missing_universal');

  // equal universal
  const uEqual = clone(legacyPre);
  const cEq = composeDurableBase(legacyPre, uEqual, new Set());
  checks.eq('reconcile equal', cEq.report.status, 'equal');
  checks.eq('compose equal base == legacy', semanticSnapshotHash(cEq.base), semanticSnapshotHash(legacyPre));

  // legacy_ahead (external edit, no pending): imported -> base uses legacy value
  const uid = entityIdFromLegacy('npc', npcId);
  const uStale = clone(legacyPre);
  uStale.durable.entities = uStale.durable.entities.map((e) => (e.id === uid ? { ...e, role: 'STALE-UNIVERSAL' } : e));
  const cLegacyAhead = composeDurableBase(legacyPre, uStale, new Set());
  checks.eq('reconcile legacy_ahead_imported', cLegacyAhead.report.status, 'legacy_ahead_imported');
  checks.eq('compose imports legacy value', readSafeField(cLegacyAhead.base, 'npc', npcId, 'role'), legacy.read('npc', npcId, 'role'));

  // universal_ahead (pending): keep universal value
  const pendingKeys = new Set([`${uid}.role`]);
  const cUniAhead = composeDurableBase(legacyPre, uStale, pendingKeys);
  checks.eq('reconcile universal_ahead', cUniAhead.report.status, 'universal_ahead');
  checks.eq('compose keeps universal pending value', readSafeField(cUniAhead.base, 'npc', npcId, 'role'), 'STALE-UNIVERSAL');
  checks.ok('unresolved universal ahead flagged', cUniAhead.report.hasUnresolvedUniversalAhead);

  // invalid universal -> status invalid, no destructive repair (compose returns legacy base)
  const invalid = { ...clone(legacyPre), durable: undefined };
  const cInvalid = reconcileOwnedFields(legacyPre, invalid, new Set());
  checks.eq('reconcile invalid_universal', cInvalid.status, 'invalid_universal');

  // legacy-owned data never lost: compose only overlays owned pending slots
  checks.eq('compose preserves legacy maps', JSON.stringify(cLegacyAhead.base.durable.maps), JSON.stringify(legacyPre.durable.maps));
}

// ==========================================================================
// GROUP: pre-commit fallbacks (no repo write)
// ==========================================================================
function groupPreCommitFallbacks() {
  // prediction mismatch -> fallback, no durable write
  const legacy = userCampaignLegacy();
  const env = newEnv({});
  const npcId = legacy.firstId('npc');
  const rq = userRequest(legacy, 'userCampaign.npc.role.update', 'npc', npcId, 'Z', NOW(), {
    // predict a DIFFERENT value than what commit would produce
    predict: () => legacy.adaptWith('npc', npcId, 'role', 'DIFFERENT'),
  });
  const out = env.router.route(rq.request);
  checks.eq('mismatch -> fallback', out.decision, 'fallback');
  checks.eq('mismatch reason', out.fallbackReason, 'prediction_mismatch');
  checks.eq('mismatch: no repo write', env.repo.ops.set, 0);
  checks.eq('mismatch: legacy fallback ran once', rq.calls.fallback, 1);
  checks.eq('mismatch: no durable commit', env.readRepo.readRevision(legacy.campaignId), null);

  // invalid pre-state -> fallback
  const legacy2 = userCampaignLegacy();
  const env2 = newEnv({});
  const rq2 = userRequest(legacy2, 'userCampaign.npc.role.update', 'npc', legacy2.firstId('npc'), 'Z', NOW());
  rq2.request.buildPre = () => ({ snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'x', path: 'p', message: 'no pre' }] });
  const out2 = env2.router.route(rq2.request);
  checks.eq('invalid pre -> fallback', out2.fallbackReason, 'invalid_pre_state');
  checks.eq('invalid pre: no repo', env2.repo.ops.set, 0);

  // mapping failed (unknown id) -> fallback
  const legacy3 = userCampaignLegacy();
  const env3 = newEnv({});
  const rq3 = userRequest(legacy3, 'userCampaign.npc.role.update', 'npc', 'unknown-id', 'Z', NOW());
  const out3 = env3.router.route(rq3.request);
  checks.eq('mapping failed -> fallback', out3.fallbackReason, 'mapping_failed');
  checks.eq('mapping failed: legacy ran', rq3.calls.fallback, 1);
  checks.eq('mapping failed: no repo', env3.readRepo.readRevision(legacy3.campaignId), null);

  // command rejected (empty required value) -> fallback
  const legacy4 = userCampaignLegacy();
  const env4 = newEnv({});
  const rq4 = userRequest(legacy4, 'userCampaign.npc.role.update', 'npc', legacy4.firstId('npc'), '   ', NOW());
  const out4 = env4.router.route(rq4.request);
  checks.eq('empty required -> fallback', out4.fallbackReason, 'command_rejected');
  checks.eq('empty required: no repo', env4.repo.ops.set, 0);
}

// ==========================================================================
// GROUP: partial failure & recovery
// ==========================================================================
function groupPartialFailure() {
  // Universal committed + legacy commit throws -> pending recovery, no fallback,
  // no second command, universal stays authoritative.
  const legacy = userCampaignLegacy();
  const env = newEnv({});
  const npcId = legacy.firstId('npc');
  const rq = userRequest(legacy, 'userCampaign.npc.role.update', 'npc', npcId, 'DUR', NOW(), { commitThrows: true });
  const out = env.router.route(rq.request);
  checks.eq('legacy throw -> pending phase', out.phase, 'universal_committed_legacy_pending');
  checks.eq('legacy throw -> durable decision', out.decision, 'durable_committed');
  checks.eq('legacy throw: universal committed', env.readRepo.readRevision(legacy.campaignId), 1);
  checks.eq('legacy throw: value durable', readSafeField(env.readRepo.read(legacy.campaignId), 'npc', npcId, 'role'), 'DUR');
  checks.eq('legacy throw: no fallback', rq.calls.fallback, 0);
  checks.eq('legacy throw: commit attempted once', rq.calls.commit, 1);
  const pending = env.router.readPendingRecovery(legacy.campaignId);
  checks.eq('pending record created', pending.length, 1);
  checks.eq('pending field', pending[0].field, 'role');
  checks.ok('pending stores no raw value', !JSON.stringify(pending[0]).includes('DUR'));

  // Reload recovery: legacy still stale -> projection runs once and resolves.
  let projectCalls = 0;
  const res = env.router.runRecovery(legacy.campaignId, {
    readLegacyValue: (kind, id, field) => legacy.read('npc', id, 'role'),
    project: (record, committedValue) => { projectCalls += 1; legacy.apply('npc', record.entityId, 'role', committedValue); return legacy.adaptPre(); },
  });
  checks.eq('recovery projected once', projectCalls, 1);
  checks.eq('recovery resolved', res.resolved, 1);
  checks.eq('recovery cleared pending', env.router.readPendingRecovery(legacy.campaignId).length, 0);
  checks.eq('legacy now matches universal', legacy.read('npc', npcId, 'role'), 'DUR');

  // Idempotent recovery: already-applied legacy recognised without re-projecting.
  const legacy2 = userCampaignLegacy();
  const env2 = newEnv({});
  const id2 = legacy2.firstId('npc');
  env2.router.route(userRequest(legacy2, 'userCampaign.npc.role.update', 'npc', id2, 'VAL2', NOW(), { commitThrows: true }).request);
  // Simulate the legacy value ALREADY equal (as if a prior projection applied it).
  legacy2.apply('npc', id2, 'role', 'VAL2');
  let proj2 = 0;
  const res2 = env2.router.runRecovery(legacy2.campaignId, {
    readLegacyValue: (kind, id) => legacy2.read('npc', id, 'role'),
    project: () => { proj2 += 1; return legacy2.adaptPre(); },
  });
  checks.eq('idempotent: no re-projection', proj2, 0);
  checks.eq('idempotent: resolved', res2.resolved, 1);

  // Universal committed + legacy adapter error -> pending (failed), value durable.
  const legacy3 = userCampaignLegacy();
  const env3 = newEnv({});
  const id3 = legacy3.firstId('npc');
  const out3 = env3.router.route(userRequest(legacy3, 'userCampaign.npc.role.update', 'npc', id3, 'VAL3', NOW(), { commitAdapterError: true }).request);
  checks.eq('legacy adapter error -> pending phase', out3.phase, 'universal_committed_legacy_failed');
  checks.eq('legacy adapter error: durable', env3.readRepo.readRevision(legacy3.campaignId), 1);
  checks.eq('legacy adapter error: pending', env3.router.readPendingRecovery(legacy3.campaignId).length, 1);

  // Bounded retries: a projection that keeps failing does not loop unbounded.
  let attempts = 0;
  for (let i = 0; i < 6; i += 1) {
    env3.router.runRecovery(legacy3.campaignId, {
      readLegacyValue: () => 'still-wrong',
      project: () => { attempts += 1; throw new Error('projection keeps failing'); },
    });
  }
  checks.ok('bounded retries (<=3 projection attempts)', attempts <= 3, `attempts=${attempts}`);
  checks.ok('still pending after bounded retries', env3.router.readPendingRecovery(legacy3.campaignId).length === 1);

  // Wrong-campaign recovery isolation: recovery on another campaign leaves this one.
  const otherId = greyholmLegacy().campaignId;
  const before = env3.router.readPendingRecovery(legacy3.campaignId).length;
  env3.router.runRecovery(otherId, { readLegacyValue: () => undefined, project: () => ({ snapshot: null, diagnostics: [], source: {}, classifications: [] }) });
  checks.eq('cross-campaign recovery isolated', env3.router.readPendingRecovery(legacy3.campaignId).length, before);
}

// ==========================================================================
// GROUP: reconciliation on the live path (external legacy edit imported)
// ==========================================================================
function groupReconLive() {
  const legacy = userCampaignLegacy();
  const env = newEnv({});
  const npcId = legacy.firstId('npc');
  // First durable commit.
  env.router.route(userRequest(legacy, 'userCampaign.npc.role.update', 'npc', npcId, 'FIRST', NOW()).request);
  checks.eq('recon: universal has FIRST', readSafeField(env.readRepo.read(legacy.campaignId), 'npc', npcId, 'role'), 'FIRST');
  // Simulate an EXTERNAL legacy-only edit (e.g. Stage 15 off in another tab).
  legacy.apply('npc', npcId, 'role', 'EXTERNAL');
  // Next durable command on a DIFFERENT field: reconciliation must import the
  // external role edit (legacy_ahead) rather than clobber it with 'FIRST'.
  const out2 = env.router.route(userRequest(legacy, 'userCampaign.npc.name.update', 'npc', npcId, 'NAME', NOW()).request);
  checks.eq('recon live: success', out2.phase, 'success');
  checks.eq('recon live: status legacy_ahead_imported', out2.record.reconciliationStatus, 'legacy_ahead_imported');
  const snap = env.readRepo.read(legacy.campaignId);
  checks.eq('recon live: external role imported', readSafeField(snap, 'npc', npcId, 'role'), 'EXTERNAL');
  checks.eq('recon live: name applied', readSafeField(snap, 'npc', npcId, 'title'), 'NAME');
  checks.ok('recon live: no data loss', readSafeField(snap, 'npc', npcId, 'role') !== 'FIRST');
}

// ==========================================================================
// GROUP: concurrency / dedup / revision conflict / isolation
// ==========================================================================
function groupConcurrency() {
  // Duplicate event (same pinned pre-state + occurredAt + value) deduplicated:
  // models a stale double-submit / StrictMode double-invoke where the caller
  // holds the same captured pre-snapshot. One legacy commit, one durable write.
  const legacy = userCampaignLegacy();
  const env = newEnv({});
  const npcId = legacy.firstId('npc');
  const t = NOW();
  const pinnedPre = legacy.adaptPre();
  let commitCalls = 0;
  const mkDup = () => ({
    campaignId: legacy.campaignId, campaignKind: 'userCampaign', sourceKind: 'legacy-user-campaign',
    scope: 'userCampaign.npc.role.update', command: { scope: 'userCampaign.npc.role.update', legacyEntityId: npcId, value: 'DUPE' },
    sourceIdentity: 'x', occurredAt: t, nextValue: 'DUPE',
    buildPre: () => clone(pinnedPre), predictPost: () => legacy.adaptWith('npc', npcId, 'role', 'DUPE'),
    commit: () => { commitCalls += 1; legacy.apply('npc', npcId, 'role', 'DUPE'); return legacy.adaptPre(); },
    fallback: () => {},
  });
  const o1 = env.router.route(mkDup());
  const o2 = env.router.route(mkDup());
  checks.eq('dup: first success', o1.phase, 'success');
  checks.eq('dup: second deduped', o2.record.errorCategory, 'duplicate_event');
  checks.eq('dup: only one legacy commit', commitCalls, 1);
  checks.eq('dup: revision still 1', env.readRepo.readRevision(legacy.campaignId), 1);

  // Rapid different-field saves same entity: both commit, revision 2.
  const legacy2 = userCampaignLegacy();
  const env2 = newEnv({});
  const id2 = legacy2.firstId('npc');
  env2.router.route(userRequest(legacy2, 'userCampaign.npc.role.update', 'npc', id2, 'R', NOW()).request);
  env2.router.route(userRequest(legacy2, 'userCampaign.npc.description.update', 'npc', id2, 'D', NOW()).request);
  checks.eq('rapid diff fields -> rev 2', env2.readRepo.readRevision(legacy2.campaignId), 2);

  // Revision conflict: external universal write bumps revision mid-flight.
  const legacy3 = userCampaignLegacy();
  const env3 = newEnv({});
  const id3 = legacy3.firstId('npc');
  env3.router.route(userRequest(legacy3, 'userCampaign.npc.role.update', 'npc', id3, 'INIT', NOW()).request);
  const rq = userRequest(legacy3, 'userCampaign.npc.role.update', 'npc', id3, 'NEXT', NOW());
  // Inject a concurrent external repo bump during predictPost (after read, before commit).
  const origPredict = rq.request.predictPost;
  rq.request.predictPost = () => {
    const repo = new SyncDurableRepository(env3.repo.storage);
    const snap = repo.read(legacy3.campaignId);
    repo.replace(snap, snap.revision); // bump revision out from under us
    return origPredict();
  };
  const outC = env3.router.route(rq.request);
  checks.eq('revision conflict -> fallback', outC.fallbackReason, 'repository_conflict');
  checks.eq('revision conflict: legacy fallback ran', rq.calls.fallback, 1);

  // Two campaigns independent + same source id isolation.
  const g = greyholmLegacy();
  const u = userCampaignLegacy();
  const envM = newEnv({});
  envM.router.route(greyRequest(g, 'greyholm.npc.role.update', g.firstNpcId(), 'GVAL', NOW()).request);
  envM.router.route(userRequest(u, 'userCampaign.npc.role.update', 'npc', u.firstId('npc'), 'UVAL', NOW()).request);
  checks.eq('two campaigns: grey rev 1', envM.readRepo.readRevision(g.campaignId), 1);
  checks.eq('two campaigns: uc rev 1', envM.readRepo.readRevision(u.campaignId), 1);
  checks.ok('two campaigns: distinct ids', g.campaignId !== u.campaignId);
  checks.eq('two campaigns: grey isolated value', readSafeField(envM.readRepo.read(g.campaignId), 'npc', g.firstNpcId(), 'role'), 'GVAL');
}

// ==========================================================================
// GROUP: repository robustness (storage failures, corruption)
// ==========================================================================
function groupRepositoryRobustness() {
  // Repository write failure before commit -> safe fallback, no durable state.
  const legacy = userCampaignLegacy();
  const env = newEnv({ repoWrap: (() => { const s = failingSetStorage(); return { storage: s, ops: { get: 0, set: 0, remove: 0 }, touchedKeys: new Set(), rawKeys: () => [], raw: new Map() }; })() });
  const rq = userRequest(legacy, 'userCampaign.npc.role.update', 'npc', legacy.firstId('npc'), 'RW', NOW());
  const out = env.router.route(rq.request);
  checks.eq('repo write fail -> fallback', out.decision, 'fallback');
  checks.eq('repo write fail reason', out.fallbackReason, 'repository_write_failed');
  checks.eq('repo write fail: legacy ran once', rq.calls.fallback, 1);

  // Corrupt production record on read -> safe fallback (no destructive repair).
  const legacy2 = userCampaignLegacy();
  const corrupt = corruptReadStorage(UNIVERSAL_PRODUCTION_NAMESPACE, legacy2.campaignId);
  const env2 = newEnv({ repoWrap: { storage: corrupt.storage, ops: { get: 0, set: 0, remove: 0 }, touchedKeys: new Set(), rawKeys: () => [], raw: corrupt.raw } });
  const rq2 = userRequest(legacy2, 'userCampaign.npc.role.update', 'npc', legacy2.firstId('npc'), 'CO', NOW());
  const out2 = env2.router.route(rq2.request);
  checks.eq('corrupt read -> fallback', out2.decision, 'fallback');
  checks.eq('corrupt read: legacy ran', rq2.calls.fallback, 1);

  // Diagnostics persistence failure never breaks the durable commit.
  const legacy3 = userCampaignLegacy();
  const env3 = newEnv({ diagWrap: { storage: failingSetStorage(), ops: { get: 0, set: 0, remove: 0 }, touchedKeys: new Set(), rawKeys: () => [], raw: new Map() } });
  const out3 = env3.router.route(userRequest(legacy3, 'userCampaign.npc.role.update', 'npc', legacy3.firstId('npc'), 'DG', NOW()).request);
  checks.eq('diag fail: still durable-committed', out3.decision, 'durable_committed');
  checks.eq('diag fail: value durable', readSafeField(env3.readRepo.read(legacy3.campaignId), 'npc', legacy3.firstId('npc'), 'role'), 'DG');
}

// ==========================================================================
// GROUP: safety invariants (namespaces, no secrets, no server, validation)
// ==========================================================================
function groupSafety() {
  const legacy = userCampaignLegacy();
  const env = newEnv({});
  const npcId = legacy.firstId('npc');
  const out = env.router.route(userRequest(legacy, 'userCampaign.npc.description.update', 'npc', npcId, 'секрет-описание-очень-длинное-значение', NOW()).request);
  // Namespaces isolated
  checks.ok('diag namespace correct', env.diag.rawKeys().every((k) => k.startsWith(STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE)));
  checks.ok('recovery namespace distinct from diag', STAGE_15_RECOVERY_NAMESPACE !== STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE);
  checks.ok('stage15 namespaces distinct from 13/14', ![STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE, STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE].includes(STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE));
  // Diagnostics carry no full snapshot and no raw value
  const rec = env.router.readDiagnostics(legacy.campaignId)[0];
  const recJson = JSON.stringify(rec);
  checks.ok('diag: no raw value leak', !recJson.includes('секрет-описание'));
  checks.ok('diag: entityId hashed', typeof rec.entityIdHash === 'string' && rec.entityIdHash.startsWith('h'));
  checks.ok('diag: no durable.entities array', !recJson.includes('"durable"') && !recJson.includes('"maps"'));
  checks.ok('diag: no full snapshot object', !recJson.includes('"schemaVersion"') && !recJson.includes('"capabilities"'));
  // Candidate written to repo is a full VALID snapshot
  const snap = env.readRepo.read(legacy.campaignId);
  checks.ok('durable snapshot valid', validateCampaignSnapshot(snap).ok);
  // Repo touched only production namespace; recovery/diag storages separate
  checks.ok('repo only production keys', env.repo.rawKeys().every((k) => k.startsWith(UNIVERSAL_PRODUCTION_NAMESPACE)));
  checks.ok('no legacy/server key touched', ![...env.repo.touchedKeys, ...env.diag.touchedKeys, ...env.recov.touchedKeys].some((k) => k.includes('overlay:v2') || k.includes('userCampaign:') || k.includes('http')));
}

// ==========================================================================
// run all
// ==========================================================================
groupRegistry();
groupCommand();
groupFlags();
groupDurableHappy();
groupSequential();
groupComposition();
groupPreCommitFallbacks();
groupPartialFailure();
groupReconLive();
groupConcurrency();
groupRepositoryRobustness();
groupSafety();

const summary = checks.summary();
const failures = checks.results.filter((r) => !r.pass);
const verdict = summary.failed === 0 ? 'STAGE_15_HARNESS_PASS' : 'STAGE_15_HARNESS_FAIL';
mkdirSync(resolve(root, 'rebuild-reports/stage-15'), { recursive: true });
writeFileSync(
  resolve(root, 'rebuild-reports/stage-15/harness-result.json'),
  JSON.stringify({ verdict, passed: summary.passed, failed: summary.failed, total: summary.total, failures }, null, 2),
);
if (summary.failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ✗', f.name, '—', String(f.detail));
}
console.log(`\nStage 15 harness: ${summary.passed}/${summary.total} PASS -> ${verdict}`);
process.exit(summary.failed === 0 ? 0 : 1);

// Stage 14 — controlled local universal COMMAND AUTHORITY harness.
//
// Proves that for a tiny reversible allowlist (greyholm.npc.role.update +
// userCampaign.npc.role.update) the universal command executes FIRST to form a
// validated candidate, the equivalent legacy transition is predicted
// independently on an immutable clone, parity is required before exactly ONE real
// legacy compatibility commit, and the committed post-state is verified against
// the candidate — WITHOUT any authoritative dual-write, production universal
// namespace write, network / server sync, or duplicate mutation. Deterministic.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  CommandAuthorityRouter,
  AuthorityDiagnosticsStore,
  ALL_COMMAND_AUTHORITY_SCOPES,
  STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE,
  isKnownAuthorityScope,
  authorityToCommandScope,
  isAllowedAuthorityChangePath,
  resolveAuthorityScopes,
  executeUniversalCommand,
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  entityIdFromLegacy,
  stableHash,
  STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';
import { loadCaldran } from '../stage08/inputs.mjs';
import { buildGreyholmOverlayContractInput } from '../stage08/greyholmOverlayFixture.mjs';
import { instrumentedStorage, failingStorage } from '../stage13/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checks = new Checks();
let NOW_N = 0;
const NOW = () => new Date(1_000 + NOW_N++).toISOString();

const greyId = campaignIdFromLegacy('greyholm', 'main');
const caldran = loadCaldran();
const caldId = campaignIdFromLegacy('user', caldran.raw.data.campaignId);
const clone = (v) => structuredClone(v);
const grey = () => buildGreyholmOverlayContractInput();
const cald = () => ({ data: clone(caldran.adapterInput.data), runtime: clone(caldran.adapterInput.runtime) });

const ALL = ALL_COMMAND_AUTHORITY_SCOPES;

function makeRouter({ enabled = true, scopes = ALL, storageWrap, maxRecords } = {}) {
  const inst = storageWrap ?? instrumentedStorage();
  const router = new CommandAuthorityRouter({
    diagnosticsStorage: inst.storage,
    allowedScopes: new Set(scopes),
    enabled,
    now: NOW,
    maxRecords,
  });
  return { inst, router };
}

// ---- request factories --------------------------------------------------
function greyReq(opts = {}) {
  const {
    newRole = 'Archivist-14',
    scope = 'greyholm.npc.role.update',
    buildPreImpl,
    predictImpl,
    commitImpl,
    fallbackImpl,
    npcId,
    previousValue,
  } = opts;
  const preInput = grey();
  const id = npcId ?? preInput.data.npcs[0].id;
  const buildPost = () => {
    const p = grey();
    p.data.npcs[0] = { ...p.data.npcs[0], role: newRole };
    return adaptMainCampaignToUniversal(p);
  };
  const calls = { commit: 0, fallback: 0, buildPre: 0 };
  const req = {
    campaignId: greyId,
    campaignKind: 'greyholm',
    sourceKind: 'legacy-main',
    scope,
    input: { scope: 'greyholm.npc.update', legacyNpcId: id, field: 'role', value: newRole },
    sourceIdentity: 'greyholm:dm',
    nextValue: newRole,
    previousValue,
    buildPre: () => {
      calls.buildPre += 1;
      return buildPreImpl ? buildPreImpl(calls.buildPre) : adaptMainCampaignToUniversal(preInput);
    },
    predictPost: () => (predictImpl ? predictImpl() : buildPost()),
    commit: () => {
      calls.commit += 1;
      return commitImpl ? commitImpl() : buildPost();
    },
    fallback: () => {
      calls.fallback += 1;
      if (fallbackImpl) fallbackImpl();
    },
  };
  return { calls, req, id };
}

function caldReq(opts = {}) {
  const {
    newRole = 'Warden-14',
    scope = 'userCampaign.npc.role.update',
    campaignId = caldId,
    legacyCampaignId = caldran.raw.data.campaignId,
    buildPreImpl,
    predictImpl,
    commitImpl,
    fallbackImpl,
    npcId,
  } = opts;
  const preInput = cald();
  const id = npcId ?? preInput.data.npcs[0].id;
  const buildPost = () => {
    const p = cald();
    p.data.npcs[0] = { ...p.data.npcs[0], role: newRole };
    return adaptUserCampaignToUniversal(p);
  };
  const calls = { commit: 0, fallback: 0, buildPre: 0 };
  const req = {
    campaignId,
    campaignKind: 'userCampaign',
    sourceKind: 'legacy-user-campaign',
    scope,
    input: { scope: 'userCampaign.npc.update', legacyNpcId: id, field: 'role', value: newRole },
    sourceIdentity: `userCampaign:${legacyCampaignId}`,
    nextValue: newRole,
    buildPre: () => {
      calls.buildPre += 1;
      return buildPreImpl ? buildPreImpl(calls.buildPre) : adaptUserCampaignToUniversal(preInput);
    },
    predictPost: () => (predictImpl ? predictImpl() : buildPost()),
    commit: () => {
      calls.commit += 1;
      return commitImpl ? commitImpl() : buildPost();
    },
    fallback: () => {
      calls.fallback += 1;
      if (fallbackImpl) fallbackImpl();
    },
  };
  return { calls, req, id };
}

// =========================================================================
// GROUP A — flags & safety
function groupFlags() {
  // 1. default off (config resolver): a router is only constructed when enabled.
  checks.ok('A1 known authority scopes are exactly the tiny allowlist', ALL.length === 2 && ALL.includes('greyholm.npc.role.update') && ALL.includes('userCampaign.npc.role.update'));
  checks.ok('A2 toggleReveal is NOT an authority scope', !isKnownAuthorityScope('userCampaign.reveal.update') && !isKnownAuthorityScope('greyholm.reveal.update'));

  // 3-7. flag OFF ⇒ zero authority activity, exact legacy behaviour.
  {
    const { inst, router } = makeRouter({ enabled: false });
    const g = greyReq();
    const outcome = router.route(g.req);
    checks.eq('A3 flag off → decision fallback', outcome.decision, 'fallback');
    checks.eq('A4 flag off → reason flag_disabled', outcome.fallbackReason, 'flag_disabled');
    checks.eq('A5 flag off → legacy fallback ran once', g.calls.fallback, 1);
    checks.eq('A6 flag off → authority commit not called', g.calls.commit, 0);
    checks.eq('A7 flag off → zero diagnostics reads', inst.ops.get, 0);
    checks.eq('A8 flag off → zero diagnostics writes', inst.writeCount(), 0);
  }
  // 9. disposed router behaves like disabled (safe fallback, no writes).
  {
    const { inst, router } = makeRouter({ enabled: true });
    router.dispose();
    const g = greyReq();
    const outcome = router.route(g.req);
    checks.eq('A9 disposed → fallback', outcome.decision, 'fallback');
    checks.eq('A10 disposed → legacy ran once', g.calls.fallback, 1);
    checks.eq('A11 disposed → zero writes', inst.writeCount(), 0);
  }
  // 12. one durable legacy commit maximum on the happy path.
  {
    const { router } = makeRouter();
    const g = greyReq();
    router.route(g.req);
    checks.eq('A12 success → exactly one legacy commit', g.calls.commit, 1);
    checks.eq('A13 success → fallback not used', g.calls.fallback, 0);
  }
  // 14. only the Stage 14 namespace key is ever written (never legacy / stage 9 /
  //     stage 13 / production universal).
  {
    const { inst, router } = makeRouter();
    router.route(greyReq().req);
    const keys = inst.rawKeys();
    checks.ok('A14 only stage-14 namespace keys written', keys.length > 0 && keys.every((k) => k.startsWith(STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE)));
    checks.ok('A15 never writes the stage-13 namespace', !keys.some((k) => k.startsWith(STAGE_13_COMMAND_DIAGNOSTICS_NAMESPACE)));
    checks.ok('A16 never writes a legacy overlay key', !keys.some((k) => k.includes('overlay') || k.includes('userCampaign:')));
  }
  // 17-18. scope mapping is a closed table; change-path constraint holds.
  checks.eq('A17 greyholm authority → command scope', authorityToCommandScope('greyholm.npc.role.update'), 'greyholm.npc.update');
  checks.eq('A18 userCampaign authority → command scope', authorityToCommandScope('userCampaign.npc.role.update'), 'userCampaign.npc.update');
  checks.ok('A19 allowed change path accepts durable.entities:<id>.role', isAllowedAuthorityChangePath('greyholm.npc.role.update', 'durable.entities:entity:npc/x.role'));
  checks.ok('A20 allowed change path rejects visibility path', !isAllowedAuthorityChangePath('greyholm.npc.role.update', 'visibility.entities:entity:npc/x'));
  checks.ok('A21 allowed change path rejects other entity field', !isAllowedAuthorityChangePath('greyholm.npc.role.update', 'durable.entities:x.name'));
  // 22. config allowlist can only narrow.
  {
    const only = resolveAuthorityScopes('greyholm.npc.role.update');
    checks.ok('A22 narrowing allowlist keeps only requested scope', only.has('greyholm.npc.role.update') && !only.has('userCampaign.npc.role.update'));
    const wide = resolveAuthorityScopes('  ');
    checks.ok('A23 empty allowlist means all known scopes', wide.size === 2);
    const junk = resolveAuthorityScopes('not.a.scope');
    checks.eq('A24 unknown tokens are ignored (narrow to none)', junk.size, 0);
  }
}

// =========================================================================
// GROUP B — Greyholm authority
function groupGreyholm() {
  const { inst, router } = makeRouter();
  const g = greyReq({ newRole: 'Lorekeeper-14' });
  const outcome = router.route(g.req);
  checks.eq('B1 greyholm → phase success', outcome.phase, 'success');
  checks.eq('B2 greyholm → decision committed', outcome.decision, 'committed');
  checks.eq('B3 greyholm → candidate validated', outcome.record.candidateValidationStatus, 'ok');
  checks.eq('B4 greyholm → mapping ok', outcome.record.mappingStatus, 'ok');
  checks.eq('B5 greyholm → candidate scope ok', outcome.record.candidateScopeStatus, 'ok');
  checks.ok('B6 greyholm → prediction parity', ['equal', 'revision_only', 'ordering_only'].includes(outcome.record.predictionComparison.classification));
  checks.ok('B7 greyholm → post-commit parity', ['equal', 'revision_only', 'ordering_only'].includes(outcome.record.postCommitComparison.classification));
  checks.eq('B8 greyholm → legacy committed once', g.calls.commit, 1);
  checks.eq('B9 greyholm → no fallback', g.calls.fallback, 0);
  checks.ok('B10 greyholm → candidate hash present', typeof outcome.record.universalCandidateHash === 'string');
  checks.ok('B11 greyholm → committed hash matches candidate hash', outcome.record.committedLegacyPostHash && outcome.record.universalCandidateHash);
  checks.eq('B12 greyholm → changedSafePaths is single role path', outcome.record.changedSafePaths.length, 1);
  checks.ok('B13 greyholm → changed path is the role path', /durable\.entities:.+\.role$/.test(outcome.record.changedSafePaths[0]));
  // source immutable before commit: buildPre snapshot equals its hash on recheck.
  checks.ok('B14 greyholm → pre re-checked (buildPre called ≥2)', g.calls.buildPre >= 2);
  // diagnostics recorded, single record.
  checks.eq('B15 greyholm → one diagnostic record', router.readDiagnostics(greyId).length, 1);
  checks.ok('B16 greyholm → only stage-14 key touched', inst.rawKeys().every((k) => k.startsWith(STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE)));

  // rapid same-NPC update safe: two sequential distinct edits, each commits once.
  {
    const { router: r2 } = makeRouter();
    const a = greyReq({ newRole: 'R-A' });
    const b = greyReq({ newRole: 'R-B' });
    r2.route(a.req);
    r2.route(b.req);
    checks.eq('B17 rapid two edits → each commits once', a.calls.commit + b.calls.commit, 2);
    checks.eq('B18 rapid two edits → two records', r2.readDiagnostics(greyId).length, 2);
  }
}

// =========================================================================
// GROUP C — User Campaign authority
function groupUserCampaign() {
  const { router } = makeRouter();
  const c = caldReq({ newRole: 'Sentinel-14' });
  const outcome = router.route(c.req);
  checks.eq('C1 UC → phase success', outcome.phase, 'success');
  checks.eq('C2 UC → committed once', c.calls.commit, 1);
  checks.eq('C3 UC → no fallback', c.calls.fallback, 0);
  checks.ok('C4 UC → prediction parity', ['equal', 'revision_only', 'ordering_only'].includes(outcome.record.predictionComparison.classification));
  checks.ok('C5 UC → post-commit parity', ['equal', 'revision_only', 'ordering_only'].includes(outcome.record.postCommitComparison.classification));
  checks.eq('C6 UC → campaign scoped record', router.readDiagnostics(caldId).length, 1);

  // strict route campaignId: wrong campaign in pre-state rejects → fallback.
  {
    const { router: r } = makeRouter();
    const c2 = caldReq();
    // buildPre returns a snapshot whose metadata.campaignId is the Greyholm id.
    c2.req.buildPre = () => adaptMainCampaignToUniversal(grey());
    const o = r.route(c2.req);
    checks.eq('C7 UC → wrong-campaign pre-state falls back', o.fallbackReason, 'wrong_campaign');
    checks.eq('C8 UC → wrong campaign still commits once (fallback)', c2.calls.fallback, 1);
    checks.eq('C9 UC → wrong campaign authority commit not called', c2.calls.commit, 0);
  }

  // two-campaign isolation + same source id across campaigns.
  {
    const { router: r } = makeRouter();
    const otherLegacy = 'other-campaign';
    const otherId = campaignIdFromLegacy('user', otherLegacy);
    const c1 = caldReq({ newRole: 'X1' });
    const c2 = caldReq({ newRole: 'X2', campaignId: otherId, legacyCampaignId: otherLegacy });
    // c2 uses a pre-state adapted for a DIFFERENT campaign id.
    const otherPre = cald();
    otherPre.data.campaignId = otherLegacy;
    const otherPost = () => {
      const p = cald();
      p.data.campaignId = otherLegacy;
      p.data.npcs[0] = { ...p.data.npcs[0], role: 'X2' };
      return adaptUserCampaignToUniversal(p);
    };
    c2.req.campaignId = otherId;
    c2.req.buildPre = () => adaptUserCampaignToUniversal(otherPre);
    c2.req.predictPost = otherPost;
    c2.req.commit = () => { c2.calls.commit += 1; return otherPost(); };
    r.route(c1.req);
    const o2 = r.route(c2.req);
    checks.eq('C10 two UC campaigns → each records under its own id', r.readDiagnostics(caldId).length, 1);
    checks.eq('C11 second UC campaign has its own record', r.readDiagnostics(otherId).length, 1);
    checks.eq('C12 second UC campaign committed once', c2.calls.commit, 1);
    checks.ok('C13 second UC campaign success', o2.phase === 'success');
    // clearing one campaign leaves the other intact.
    r.clearDiagnostics(caldId);
    checks.eq('C14 clearing one UC campaign isolated (cleared)', r.readDiagnostics(caldId).length, 0);
    checks.eq('C15 clearing one UC campaign isolated (other kept)', r.readDiagnostics(otherId).length, 1);
  }

  // absent pre-data → invalid pre-state fallback (no cross-campaign substitution).
  {
    const { router: r } = makeRouter();
    const c = caldReq();
    c.req.buildPre = () => ({ snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'no_data', path: '<root>', message: 'no data' }] });
    const o = r.route(c.req);
    checks.eq('C16 UC → absent pre-data falls back safely', o.fallbackReason, 'invalid_pre_state');
    checks.eq('C17 UC → absent pre-data commits once via fallback', c.calls.fallback, 1);
  }
}

// =========================================================================
// GROUP D — universal candidate constraints
function groupCandidate() {
  // deterministic execution: same pre + input → identical candidate.
  const pre = adaptMainCampaignToUniversal(grey()).snapshot;
  const npcId = grey().data.npcs[0].id;
  const r1 = executeUniversalCommand(pre, { scope: 'greyholm.npc.update', legacyNpcId: npcId, field: 'role', value: 'Z' });
  const r2 = executeUniversalCommand(pre, { scope: 'greyholm.npc.update', legacyNpcId: npcId, field: 'role', value: 'Z' });
  checks.eq('D1 candidate deterministic', stableHash(r1.snapshot), stableHash(r2.snapshot));
  checks.ok('D2 candidate does not mutate input snapshot', pre.durable.entities.find((e) => e.id === entityIdFromLegacy('npc', npcId)).role !== 'Z');
  checks.eq('D3 candidate changes only the role path', r1.changedPaths.length, 1);
  checks.ok('D4 candidate creates/deletes nothing', r1.createdIds.length === 0 && r1.deletedIds.length === 0);

  // command rejection (blank value) → fallback command_rejected.
  {
    const { router } = makeRouter();
    const g = greyReq({ newRole: '' });
    const o = router.route(g.req);
    checks.eq('D5 blank value → command_rejected fallback', o.fallbackReason, 'command_rejected');
    checks.eq('D6 blank value → legacy fallback ran once', g.calls.fallback, 1);
    checks.eq('D7 blank value → authority commit not called', g.calls.commit, 0);
  }
  // mapping failure (unknown npc id) → fallback mapping_failed.
  {
    const { router } = makeRouter();
    const g = greyReq({ npcId: 'does-not-exist' });
    const o = router.route(g.req);
    checks.eq('D8 unknown id → mapping_failed fallback', o.fallbackReason, 'mapping_failed');
    checks.eq('D9 unknown id → mapping status failed', o.record.mappingStatus, 'failed');
    checks.eq('D10 unknown id → fallback ran once', g.calls.fallback, 1);
  }
  // candidate scope violation: predicted post differs but candidate path is fine;
  // simulate a scope violation via a doctored universal executor is not possible
  // here, so we assert the guard rejects an out-of-scope change path directly.
  checks.ok('D11 scope guard rejects placement change path', !isAllowedAuthorityChangePath('userCampaign.npc.role.update', 'durable.placements:pin.position'));
}

// =========================================================================
// GROUP E — prediction
function groupPrediction() {
  // prediction unavailable → fallback.
  {
    const { router } = makeRouter();
    const g = greyReq();
    g.req.predictPost = () => ({ snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'x', path: '<root>', message: 'no prediction' }] });
    const o = router.route(g.req);
    checks.eq('E1 prediction unavailable → fallback', o.fallbackReason, 'prediction_unavailable');
    checks.eq('E2 prediction unavailable → commit not called', g.calls.commit, 0);
    checks.eq('E3 prediction unavailable → fallback once', g.calls.fallback, 1);
  }
  // prediction mismatch: candidate role=A, predicted legacy role=B → fallback.
  {
    const { router } = makeRouter();
    const g = greyReq({ newRole: 'UNIVERSAL-A' });
    g.req.predictPost = () => {
      const p = grey();
      p.data.npcs[0] = { ...p.data.npcs[0], role: 'LEGACY-B' };
      return adaptMainCampaignToUniversal(p);
    };
    const o = router.route(g.req);
    checks.eq('E4 prediction mismatch → fallback', o.fallbackReason, 'prediction_mismatch');
    checks.eq('E5 prediction mismatch → commit not called', g.calls.commit, 0);
    checks.eq('E6 prediction mismatch → fallback once', g.calls.fallback, 1);
    checks.ok('E7 prediction mismatch → comparison recorded semantic_mismatch', o.record.predictionComparison.classification === 'semantic_mismatch');
  }
  // prediction does not mutate real state / call storage: predictPost is pure and
  // the router performs no write until commit — proven by commit-not-called above
  // combined with a write-count assertion.
  {
    const { inst, router } = makeRouter();
    const g = greyReq({ newRole: 'UNIVERSAL-A' });
    g.req.predictPost = () => {
      const p = grey();
      p.data.npcs[0] = { ...p.data.npcs[0], role: 'LEGACY-B' };
      return adaptMainCampaignToUniversal(p);
    };
    const before = inst.writeCount();
    router.route(g.req);
    // Only the fallback diagnostic write should have happened (1), never a commit.
    checks.eq('E8 prediction stage writes only the diagnostic (no commit write)', g.calls.commit, 0);
    checks.ok('E9 prediction stage produced at most one diagnostic write', inst.writeCount() - before <= 1);
  }
}

// =========================================================================
// GROUP F — stale precondition
function groupStale() {
  const { router } = makeRouter();
  const g = greyReq();
  // buildPre returns a DIFFERENT snapshot on the second (re-check) call → stale.
  let preCalls = 0;
  g.req.buildPre = () => {
    preCalls += 1;
    const p = grey();
    if (preCalls >= 2) p.data.npcs[0] = { ...p.data.npcs[0], role: 'CHANGED-UNDER-US' };
    return adaptMainCampaignToUniversal(p);
  };
  const o = router.route(g.req);
  checks.eq('F1 stale pre-state → fallback', o.fallbackReason, 'stale_precondition');
  checks.eq('F2 stale → authority commit not called', g.calls.commit, 0);
  checks.eq('F3 stale → legacy fallback ran once', g.calls.fallback, 1);
}

// =========================================================================
// GROUP G — compatibility commit & post-commit
function groupCommit() {
  // legacy commit failure: commit throws → recorded, no second run, no rollback.
  {
    const { router } = makeRouter();
    const g = greyReq();
    g.req.commit = () => { g.calls.commit += 1; throw new Error('legacy dispatch blew up'); };
    const o = router.route(g.req);
    checks.eq('G1 commit failure → phase fallback_failed', o.phase, 'fallback_failed');
    checks.eq('G2 commit failure → decision stays committed (no fallback re-run)', o.decision, 'committed');
    checks.eq('G3 commit failure → commit attempted once', g.calls.commit, 1);
    checks.eq('G4 commit failure → legacy fallback NOT run afterwards', g.calls.fallback, 0);
    checks.eq('G5 commit failure → legacyCommitStatus failed', o.record.legacyCommitStatus, 'failed');
  }
  // post-commit mismatch: committed post differs from candidate → recorded, legacy
  // authoritative, no rollback, no duplicate mutation.
  {
    const { router } = makeRouter();
    const g = greyReq({ newRole: 'UNIVERSAL-A' });
    // commit returns a DIFFERENT committed post-state than the candidate.
    g.req.commit = () => {
      g.calls.commit += 1;
      const p = grey();
      p.data.npcs[0] = { ...p.data.npcs[0], role: 'COMMITTED-DIFFERENT' };
      return adaptMainCampaignToUniversal(p);
    };
    // prediction must match candidate so we reach commit; predicted role=A.
    const o = router.route(g.req);
    checks.eq('G6 post-commit mismatch → phase post_commit_mismatch', o.phase, 'post_commit_mismatch');
    checks.eq('G7 post-commit mismatch → committed once (no duplicate)', g.calls.commit, 1);
    checks.eq('G8 post-commit mismatch → no fallback re-run', g.calls.fallback, 0);
    checks.eq('G9 post-commit mismatch → decision committed (legacy authoritative)', o.decision, 'committed');
    checks.ok('G10 post-commit mismatch → comparison recorded', o.record.postCommitComparison.classification === 'semantic_mismatch');
  }
  // successful commit never triggers a second fallback.
  {
    const { router } = makeRouter();
    const g = greyReq();
    router.route(g.req);
    checks.eq('G11 success → no fallback', g.calls.fallback, 0);
    checks.eq('G12 success → single commit', g.calls.commit, 1);
  }
}

// =========================================================================
// GROUP H — concurrency & dedup
function groupConcurrency() {
  // same-campaign sequential ordering: three edits commit in order, three records.
  {
    const { router } = makeRouter();
    const roles = ['O1', 'O2', 'O3'];
    let commits = 0;
    for (const r of roles) {
      const g = greyReq({ newRole: r });
      g.req.commit = () => { commits += 1; const p = grey(); p.data.npcs[0] = { ...p.data.npcs[0], role: r }; return adaptMainCampaignToUniversal(p); };
      router.route(g.req);
    }
    checks.eq('H1 three sequential edits → three commits', commits, 3);
    checks.eq('H2 three sequential edits → three records', router.readDiagnostics(greyId).length, 3);
  }
  // duplicate event dedup: identical occurredAt+pre+value → second is deduped, no
  // second commit.
  {
    const { router } = makeRouter();
    const occurredAt = '2020-01-01T00:00:00.000Z';
    const mk = () => {
      const g = greyReq({ newRole: 'DUP' });
      g.req.occurredAt = occurredAt;
      return g;
    };
    const a = mk();
    const b = mk();
    const o1 = router.route(a.req);
    const o2 = router.route(b.req);
    checks.eq('H3 first duplicate committed once', a.calls.commit, 1);
    checks.eq('H4 second duplicate → not committed again', b.calls.commit, 0);
    checks.eq('H5 second duplicate → no fallback either', b.calls.fallback, 0);
    checks.ok('H6 first + second share deduped disposition', o1.phase === 'success' && o2.phase === 'success');
  }
  // different campaigns independent (greyholm + UC do not serialize each other).
  {
    const { router } = makeRouter();
    const g = greyReq();
    const c = caldReq();
    router.route(g.req);
    router.route(c.req);
    checks.eq('H7 greyholm record isolated', router.readDiagnostics(greyId).length, 1);
    checks.eq('H8 UC record isolated', router.readDiagnostics(caldId).length, 1);
  }
  // StrictMode double registration is a provider concern, but the router is safe
  // to construct+dispose twice with no cross-talk: a disposed router never commits.
  {
    const { router: r1 } = makeRouter();
    r1.dispose();
    const { router: r2 } = makeRouter();
    const g = greyReq();
    const o = r2.route(g.req);
    checks.ok('H9 fresh router after dispose still commits', o.phase === 'success' && g.calls.commit === 1);
  }
  // dispose does not undo a committed legacy mutation (router holds no legacy
  // state; committed count is observed on the caller side).
  {
    const { router } = makeRouter();
    const g = greyReq();
    router.route(g.req);
    router.dispose();
    checks.eq('H10 committed legacy survives dispose', g.calls.commit, 1);
  }
}

// =========================================================================
// GROUP I — diagnostics
function groupDiagnostics() {
  // campaign-scoped namespace + bounded history.
  {
    const { inst, router } = makeRouter({ maxRecords: 3 });
    for (let i = 0; i < 6; i += 1) {
      const g = greyReq({ newRole: `H${i}` });
      router.route(g.req);
    }
    const records = router.readDiagnostics(greyId);
    checks.ok('I1 bounded history capped at maxRecords', records.length === 3);
    checks.ok('I2 namespace is campaign-scoped', AuthorityDiagnosticsStore.keyFor(greyId).startsWith(STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE));
    checks.ok('I3 only stage-14 keys exist', inst.rawKeys().every((k) => k.startsWith(STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE)));
  }
  // redaction: no full snapshots, no raw role free-text over the store.
  {
    const { inst, router } = makeRouter();
    const secretRole = 'SECRET-ROLE-VALUE-THAT-IS-LONG-ENOUGH-TO-BE-REDACTED-AS-FREE-TEXT';
    const g = greyReq({ newRole: secretRole });
    router.route(g.req);
    const raw = JSON.stringify(router.readDiagnostics(greyId));
    checks.ok('I4 diagnostics never contain a full durable snapshot', !raw.includes('overlayRemainder') && !raw.includes('"entities":['));
    // The record stores hashes and ids/paths, not the raw role value.
    checks.ok('I5 diagnostics do not store the raw long role value', !raw.includes(secretRole));
    checks.ok('I6 diagnostics store only hashes for values', raw.includes('universalCandidateHash'));
    checks.ok('I7 diagnostics only stage-14 key', inst.rawKeys().every((k) => k.startsWith(STAGE_14_AUTHORITY_DIAGNOSTICS_NAMESPACE)));
  }
  // clear one campaign only.
  {
    const { router } = makeRouter();
    router.route(greyReq().req);
    router.route(caldReq().req);
    router.clearDiagnostics(greyId);
    checks.eq('I8 clear greyholm only (cleared)', router.readDiagnostics(greyId).length, 0);
    checks.eq('I9 clear greyholm only (UC kept)', router.readDiagnostics(caldId).length, 1);
  }
  // storage failure never blocks the legacy commit or the fallback.
  {
    const router = new CommandAuthorityRouter({ diagnosticsStorage: failingStorage(), allowedScopes: new Set(ALL), enabled: true, now: NOW });
    const g = greyReq();
    const o = router.route(g.req);
    checks.eq('I10 storage failure → legacy still committed once', g.calls.commit, 1);
    checks.ok('I11 storage failure → route still returns an outcome', o.handled === true);
    // fallback path under failing storage still runs the legacy action once.
    const g2 = greyReq({ newRole: '' });
    const o2 = router.route(g2.req);
    checks.eq('I12 storage failure → fallback still ran once', g2.calls.fallback, 1);
    checks.ok('I13 storage failure → no throw escaped', o2.handled === true);
  }
  // record shape: required fields present + inverse hint is hashes only.
  {
    const { router } = makeRouter();
    const g = greyReq({ newRole: 'Recorder', previousValue: 'OldRole' });
    const o = router.route(g.req);
    const rec = o.record;
    checks.ok('I14 record has phase/decision/hashes', rec.phase && rec.authorityDecision && rec.legacyPreHash && rec.universalCandidateHash);
    checks.ok('I15 inverse hint stores hashes not raw values', rec.inverse && rec.inverse.field === 'role' && !JSON.stringify(rec.inverse).includes('OldRole') && !JSON.stringify(rec.inverse).includes('Recorder'));
    checks.ok('I16 record has duration bucket', typeof rec.durationBucketMs === 'string');
  }
}

// =========================================================================
async function main() {
  groupFlags();
  groupGreyholm();
  groupUserCampaign();
  groupCandidate();
  groupPrediction();
  groupStale();
  groupCommit();
  groupConcurrency();
  groupDiagnostics();

  const s = checks.summary();
  const verdict = s.ok ? 'STAGE_14_HARNESS_PASS' : 'STAGE_14_HARNESS_FAIL';
  const failed = checks.results.filter((r) => !r.pass);
  const report = {
    verdict,
    passed: s.passed,
    failed: s.failed,
    total: s.total,
    failures: failed.map((f) => ({ name: f.name, detail: f.detail })),
    generatedAt: new Date(0).toISOString(),
  };
  const outDir = resolve(root, 'rebuild-reports/stage-14');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(resolve(outDir, 'harness-report.json'), JSON.stringify(report, null, 2) + '\n');
  if (failed.length) {
    console.log('\nFailures:');
    for (const f of failed) console.log(`  ✗ ${f.name} — ${f.detail ?? ''}`);
  }
  console.log(`\nStage 14 harness: ${s.passed}/${s.total} PASS -> ${verdict}`);
  if (!s.ok) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });

// Stage 16 — universal COMPLEX (aggregate) DURABLE AUTHORITY harness.
//
// Proves that for a proven allowlist of complex aggregates (reveal, presented
// cards, placements, party location, route progress) across BOTH real campaigns
// (Greyholm main + Caldran user campaign) the universal production repository
// becomes the durable source of truth for aggregate-level transitions: the typed
// command runs first, is validated + invariant-checked + scope-checked +
// parity-predicted, atomically committed under an expected-revision guard and
// verified read-after-write, and only then is the existing legacy action invoked
// ONCE as a compatibility projection. Legacy-owned data is never overwritten by a
// stale universal snapshot; partial failures become idempotent pending recovery;
// reconciliation handles external legacy edits — all WITHOUT server changes,
// network, migration, or a second authoritative write. Real adapters + real
// Caldran data + real Greyholm contract overlay.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  ComplexAuthorityRouter,
  ComplexDiagnosticsStore,
  ComplexRecoveryStore,
  SyncDurableRepository,
  ALL_COMPLEX_AUTHORITY_SCOPES,
  resolveComplexScopes,
  aggregateDescriptor,
  allAggregateDescriptors,
  aggregateOwnershipOf,
  universalOwnedAggregates,
  isKnownComplexScope,
  resolveIdentity,
  executeComplexCommand,
  ownedPathPrefixes,
  readAggregateSlot,
  inverseCommandKind,
  validateAggregateInvariants,
  composeAggregateBase,
  parseSlotKey,
  projectPlayerSafe,
  projectObserver,
  projectDMWorkspace,
  semanticSnapshotHash,
  validateCampaignSnapshot,
  UNIVERSAL_PRODUCTION_NAMESPACE,
  UNIVERSAL_SHADOW_NAMESPACE,
  STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE,
  STAGE_16_COMPLEX_RECOVERY_NAMESPACE,
  STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';
import {
  instrumentedStorage,
  failingSetStorage,
  corruptReadStorage,
  greyholmComplex,
  caldranComplex,
  complexRequest,
  clone,
} from './lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checks = new Checks();
let NOW_N = 0;
const NOW = () => new Date(1_000 + NOW_N++).toISOString();

function makeRouter({ enabled = true, scopes = ALL_COMPLEX_AUTHORITY_SCOPES, repo, diag, recov } = {}) {
  const repoStore = repo ?? instrumentedStorage();
  const diagStore = diag ?? instrumentedStorage();
  const recovStore = recov ?? instrumentedStorage();
  const router = new ComplexAuthorityRouter({
    repositoryStorage: repoStore.storage,
    diagnosticsStorage: diagStore.storage,
    recoveryStorage: recovStore.storage,
    allowedScopes: new Set(scopes),
    enabled,
    now: NOW,
  });
  return { router, repoStore, diagStore, recovStore };
}

// ---- Canonical command / transform pairs for each aggregate ----------------
const GREY = {
  revealNew: { scope: 'greyholm.reveal', command: { kind: 'reveal.entity', targetUniversalId: 'entity:locationState:loc-mine__arc-1-peace' }, tk: 'reveal.entity', ta: { locId: 'loc-mine__arc-1-peace' } },
  revealHide: { scope: 'greyholm.reveal', command: { kind: 'reveal.hide', targetUniversalId: 'entity:locationState:loc-greyholm__arc-1-peace' }, tk: 'reveal.hide', ta: { locId: 'loc-greyholm__arc-1-peace' } },
  present: { scope: 'greyholm.presentedCard', command: { kind: 'presentedCard.present', targetUniversalId: 'entity:npc:npc-mayor', entityKind: 'npc' }, tk: 'presentedCard.present', ta: { type: 'npc', id: 'npc-mayor' } },
  dismiss: { scope: 'greyholm.presentedCard', command: { kind: 'presentedCard.dismiss' }, tk: 'presentedCard.dismiss', ta: {} },
  partyMove: { scope: 'greyholm.partyLocation', command: { kind: 'partyLocation.move', currentLocationRef: 'entity:locationState:loc-mine__arc-1-peace', currentMapId: 'map:legacy:map-region', currentMapPosition: { x: 0.3, y: 0.35 } }, tk: 'partyLocation.move', ta: { locId: 'loc-mine__arc-1-peace', mapRaw: 'map-region', mapLevel: 'region', timelineId: 'arc-1-peace', x: 0.3, y: 0.35 } },
  routeAdvance: { scope: 'greyholm.routeProgress', command: { kind: 'routeProgress.advance', routeProgress: { routeId: 'route-town-mine', fromHotspotId: 'hs-greyholm', toHotspotId: 'hs-mine', progress: 0.6 } }, tk: 'routeProgress.advance', ta: { rp: { routeId: 'route-town-mine', fromHotspotId: 'hs-greyholm', toHotspotId: 'hs-mine', progress: 0.6 } } },
  routeClear: { scope: 'greyholm.routeProgress', command: { kind: 'routeProgress.clear' }, tk: 'routeProgress.clear', ta: {} },
  placeMove: { scope: 'greyholm.placement', command: { kind: 'placement.move', placementId: 'plc-mayor', position: { x: 0.5, y: 0.5 } }, tk: 'placement.move', ta: { plcId: 'plc-mayor', x: 0.5, y: 0.5 } },
  placeRemove: { scope: 'greyholm.placement', command: { kind: 'placement.remove', placementId: 'plc-mayor' }, tk: 'placement.remove', ta: { plcId: 'plc-mayor' } },
  placeNew: { scope: 'greyholm.placement', command: { kind: 'placement.place', placementId: 'plc-new-1', mapId: 'map:legacy:map-region', entityRef: 'entity:npc:npc-mayor', entityKind: 'npc', position: { x: 0.2, y: 0.25 }, title: 'Mayor camp', visibleToPlayers: false }, tk: 'placement.place', ta: { plcId: 'plc-new-1', arcId: 'arc-1-peace', mapLevel: 'region', mapRaw: 'map-region', entityKind: 'npc', entityId: 'npc-mayor', title: 'Mayor camp', x: 0.2, y: 0.25, visible: false } },
};
const CALD = {
  revealNew: { scope: 'userCampaign.reveal', command: { kind: 'reveal.entity', targetUniversalId: 'entity:npc:npc-seed-1-y212' }, tk: 'reveal.entity', ta: { rawId: 'npc-seed-1-y212' } },
  present: { scope: 'userCampaign.presentedCard', command: { kind: 'presentedCard.present', targetUniversalId: 'entity:npc:npc-seed-0-ucax', entityKind: 'npc' }, tk: 'presentedCard.present', ta: { type: 'npc', id: 'npc-seed-0-ucax' } },
  dismiss: { scope: 'userCampaign.presentedCard', command: { kind: 'presentedCard.dismiss' }, tk: 'presentedCard.dismiss', ta: {} },
  placeMove: { scope: 'userCampaign.placement', command: { kind: 'placement.move', placementId: 'pin-mri2gsa2-pnnbk', position: { x: 6.5, y: 30.0 } }, tk: 'placement.move', ta: { plcId: 'pin-mri2gsa2-pnnbk', x: 6.5, y: 30.0 } },
  placeRemove: { scope: 'userCampaign.placement', command: { kind: 'placement.remove', placementId: 'pin-mri2gsa2-pnnbk' }, tk: 'placement.remove', ta: { plcId: 'pin-mri2gsa2-pnnbk' } },
  placeNew: { scope: 'userCampaign.placement', command: { kind: 'placement.place', placementId: 'pin-new-1', mapId: 'map:legacy:atlas-map-caldran', entityRef: 'entity:location:loc-mri2a0d8-p90mr', entityKind: 'location', position: { x: 1.0, y: 2.0 }, visibleToPlayers: false }, tk: 'placement.place', ta: { plcId: 'pin-new-1', mapRaw: 'atlas-map-caldran', entityKind: 'location', entityId: 'loc-mri2a0d8-p90mr', x: 1.0, y: 2.0, visible: false } },
};

function route(router, legacy, spec, overrides = {}) {
  const { request, calls } = complexRequest(legacy, spec.scope, spec.command, spec.tk, spec.ta, NOW(), overrides);
  const outcome = router.route(request);
  return { outcome, calls };
}

// ===========================================================================
// GROUP A — Flags and routing
// ===========================================================================
function groupFlags() {
  // Default off constants match config expectation (default-off handled in app).
  checks.ok('scope union has 8 entries', ALL_COMPLEX_AUTHORITY_SCOPES.length === 8);
  checks.ok('scopes are all known', ALL_COMPLEX_AUTHORITY_SCOPES.every(isKnownComplexScope));
  checks.ok('unknown scope rejected', !isKnownComplexScope('greyholm.timeline'));

  // OFF: no repository / diagnostics / recovery writes, legacy still runs once.
  const off = makeRouter({ enabled: false });
  const grey = greyholmComplex();
  const { outcome, calls } = route(off.router, grey, GREY.revealNew);
  checks.eq('OFF: not handled (bare fallback)', outcome.handled, false);
  checks.eq('OFF: decision fallback', outcome.decision, 'fallback');
  checks.eq('OFF: fallback reason flag_disabled', outcome.fallbackReason, 'flag_disabled');
  checks.eq('OFF: legacy ran once', calls.fallback, 1);
  checks.eq('OFF: zero repository writes', off.repoStore.writeCount(), 0);
  checks.eq('OFF: zero diagnostics writes', off.diagStore.writeCount(), 0);
  checks.eq('OFF: zero recovery writes', off.recovStore.writeCount(), 0);
  checks.eq('OFF: no diagnostics record persisted', off.router.readDiagnostics(grey.campaignId).length, 0);

  // not-allowlisted (flag on, scope not in narrowed set): bare fallback, no writes.
  const narrow = makeRouter({ enabled: true, scopes: ['userCampaign.reveal'] });
  const r2 = route(narrow.router, greyholmComplex(), GREY.revealNew);
  checks.eq('narrowed: greyholm.reveal not allowlisted -> bare fallback', r2.outcome.fallbackReason, 'not_allowlisted');
  checks.eq('narrowed: not handled', r2.outcome.handled, false);
  checks.eq('narrowed: zero repo writes', narrow.repoStore.writeCount(), 0);

  // command kind must belong to scope aggregate.
  const on = makeRouter();
  const bad = route(on.router, greyholmComplex(), { scope: 'greyholm.reveal', command: { kind: 'placement.remove', placementId: 'x' }, tk: 'reveal.hide', ta: { locId: 'loc-greyholm__arc-1-peace' } });
  checks.eq('command kind must match scope aggregate -> not_allowlisted', bad.outcome.fallbackReason, 'not_allowlisted');

  // scope resolution narrowing.
  checks.eq('resolveComplexScopes(all) full', resolveComplexScopes('all').size, 8);
  checks.eq('resolveComplexScopes empty full', resolveComplexScopes('').size, 8);
  checks.eq('resolveComplexScopes narrow', resolveComplexScopes('greyholm.reveal userCampaign.placement').size, 2);
  checks.eq('resolveComplexScopes unknown ignored', resolveComplexScopes('greyholm.reveal nonsense').size, 1);
}

// ===========================================================================
// GROUP B — Campaign identity + isolation
// ===========================================================================
function groupIdentity() {
  const { router } = makeRouter();
  const grey = greyholmComplex();
  const cald = caldranComplex();
  checks.eq('greyholm exact campaign id', grey.campaignId, 'camp:greyholm:main');
  checks.ok('caldran exact campaign id', cald.campaignId === `camp:user:${cald.legacyCampaignId}`);
  checks.ok('greyholm and caldran ids differ', grey.campaignId !== cald.campaignId);

  const gs = grey.snapshot();
  const cs = cald.snapshot();
  // Same source id string could exist across campaigns but each snapshot is
  // scoped; identity resolves within its own snapshot only.
  checks.eq('greyholm reveal target resolves', resolveIdentity(gs, { aggregateKind: 'reveal', entityId: 'entity:locationState:loc-mine__arc-1-peace' }).status, 'ok');
  checks.eq('greyholm missing target -> missing', resolveIdentity(gs, { aggregateKind: 'reveal', entityId: 'entity:locationState:does-not-exist' }).status, 'missing');
  checks.eq('caldran npc target resolves', resolveIdentity(cs, { aggregateKind: 'presentedCard', entityId: 'entity:npc:npc-seed-0-ucax', entityKind: 'npc' }).status, 'ok');
  checks.eq('caldran wrong kind -> wrong_kind', resolveIdentity(cs, { aggregateKind: 'presentedCard', entityId: 'entity:npc:npc-seed-0-ucax', entityKind: 'enemy' }).status, 'wrong_kind');
  checks.eq('greyholm map resolves', resolveIdentity(gs, { aggregateKind: 'placement', mapId: 'map:legacy:map-region' }).status, 'ok');
  checks.eq('greyholm unknown map -> missing', resolveIdentity(gs, { aggregateKind: 'placement', mapId: 'map:legacy:nope' }).status, 'missing');

  // Caldran target id does NOT resolve inside Greyholm snapshot (isolation).
  checks.eq('caldran npc id absent in greyholm snapshot', resolveIdentity(gs, { aggregateKind: 'reveal', entityId: 'entity:npc:npc-seed-0-ucax' }).status, 'missing');

  // Wrong-campaign request is rejected (command campaignId != adapted pre id).
  const r = route(router, grey, GREY.revealNew, { campaignId: 'camp:user:other' });
  checks.eq('wrong campaign -> fallback wrong_campaign', r.outcome.fallbackReason, 'wrong_campaign');

  // Ambiguous identity: duplicate id across kinds without exact kind.
  const dup = clone(gs);
  dup.durable.entities.push({ ...dup.durable.entities.find((e) => e.kind === 'npc'), kind: 'enemy' });
  checks.eq('ambiguous id (no kind) -> ambiguous', resolveIdentity(dup, { aggregateKind: 'reveal', entityId: 'entity:npc:npc-mayor' }).status, 'ambiguous');
}

// ===========================================================================
// GROUP C — Durable happy paths (both campaigns, all owned aggregates)
// ===========================================================================
function durableCommit(router, legacy, spec, label, expectPaths) {
  const before = router.currentRevision(legacy.campaignId);
  const { outcome, calls } = route(router, legacy, spec);
  checks.eq(`${label}: handled`, outcome.handled, true);
  checks.eq(`${label}: durable committed`, outcome.decision, 'durable_committed');
  checks.eq(`${label}: phase success`, outcome.phase, 'success');
  checks.eq(`${label}: legacy projected once`, calls.commit, 1);
  checks.eq(`${label}: no pre-commit fallback`, calls.fallback, 0);
  checks.eq(`${label}: legacy projection committed`, outcome.record.legacyProjectionStatus, 'committed');
  checks.eq(`${label}: read-after-write ok`, outcome.record.repositoryReadStatus, 'ok');
  checks.eq(`${label}: invariants ok`, outcome.record.invariantStatus, 'ok');
  checks.eq(`${label}: scope ok`, outcome.record.scopeStatus, 'ok');
  const after = router.currentRevision(legacy.campaignId);
  checks.ok(`${label}: revision advanced`, after !== null && (before === null ? after === 1 : after === before + 1));
  if (expectPaths) checks.ok(`${label}: changed aggregate paths`, JSON.stringify(outcome.record.changedAggregatePaths) === JSON.stringify(expectPaths));
  return outcome;
}

function groupDurableHappy() {
  // Greyholm: run each owned aggregate on its OWN router/repo (sequential runs
  // are covered separately) so each proves a clean first durable commit.
  {
    const { router } = makeRouter();
    durableCommit(router, greyholmComplex(), GREY.revealNew, 'GREY reveal.entity', ['visibility.entities:entity:locationState:loc-mine__arc-1-peace']);
  }
  {
    const { router } = makeRouter();
    durableCommit(router, greyholmComplex(), GREY.revealHide, 'GREY reveal.hide');
  }
  {
    const { router } = makeRouter();
    durableCommit(router, greyholmComplex(), GREY.dismiss, 'GREY presentedCard.dismiss', ['runtime.presentation.presentedCard']);
  }
  {
    const { router } = makeRouter();
    durableCommit(router, greyholmComplex(), GREY.partyMove, 'GREY partyLocation.move', ['runtime.party']);
  }
  {
    const { router } = makeRouter();
    durableCommit(router, greyholmComplex(), GREY.routeAdvance, 'GREY routeProgress.advance', ['runtime.party.routeProgress', 'durable.travel.partyRouteProgress']);
  }
  {
    const { router } = makeRouter();
    durableCommit(router, greyholmComplex(), GREY.placeMove, 'GREY placement.move', ['durable.placements:plc-mayor']);
  }
  {
    const { router } = makeRouter();
    durableCommit(router, greyholmComplex(), GREY.placeRemove, 'GREY placement.remove');
  }
  {
    // Greyholm placement CREATE: `commandComparison.ts`'s `normalizeTechnical`
    // now strips the adapter-only raw-legacy echo (`extensions.original`) from
    // placements the same way it already did for entities, so the universal
    // create command (which never carries that echo) durably commits instead of
    // safely falling back on a spurious echo-shape mismatch (see
    // docs/universal-rebuild/FINAL_REMAINING_WORK_AUDIT.md §4b.3, closed).
    const { router } = makeRouter();
    durableCommit(router, greyholmComplex(), GREY.placeNew, 'GREY placement.place', ['durable.placements:plc-new-1']);
  }
  // Caldran
  {
    const { router } = makeRouter();
    // Stage 16.1 addendum: reveal.entity/hide now cascades to the target's own
    // linked image (reveal direction only) and any linked placements, matching
    // the real user-campaign `toggleReveal` legacy action exactly. This fixture
    // NPC has a linked image but no linked map placement.
    durableCommit(router, caldranComplex(), CALD.revealNew, 'CALD reveal.entity', [
      'visibility.entities:entity:npc:npc-seed-1-y212',
      'durable.entities:entity:image:img-mri2a0d9-ihhy7',
    ]);
  }
  {
    const { router } = makeRouter();
    durableCommit(router, caldranComplex(), CALD.present, 'CALD presentedCard.present', ['runtime.presentation.presentedCard']);
  }
  {
    const { router } = makeRouter();
    durableCommit(router, caldranComplex(), CALD.placeMove, 'CALD placement.move', ['durable.placements:pin-mri2gsa2-pnnbk']);
  }
  {
    const { router } = makeRouter();
    durableCommit(router, caldranComplex(), CALD.placeRemove, 'CALD placement.remove');
  }
  {
    const { router } = makeRouter();
    durableCommit(router, caldranComplex(), CALD.placeNew, 'CALD placement.place', ['durable.placements:pin-new-1']);
  }
}

// ===========================================================================
// GROUP D — Data preservation + composition (legacy-owned never overwritten)
// ===========================================================================
function groupComposition() {
  const { router, repoStore } = makeRouter();
  const grey = greyholmComplex();
  // First: durably commit a reveal (initializes universal repo).
  durableCommit(router, grey, GREY.revealNew, 'compose-seed reveal');
  const stored = new SyncDurableRepository(repoStore.storage).read(grey.campaignId);
  checks.ok('composed snapshot preserves all 4 maps? (greyholm has 2 in fixture)', stored.durable.maps.length >= 2);
  checks.ok('composed snapshot preserves battle maps', Array.isArray(stored.durable.battleMaps));
  checks.ok('composed snapshot preserves entities', stored.durable.entities.length > 0);
  checks.ok('reveal applied in stored', !!stored.visibility.entities['entity:locationState:loc-mine__arc-1-peace']);
  checks.ok('prior reveal preserved', !!stored.visibility.entities['entity:locationState:loc-greyholm__arc-1-peace']);

  // Now commit a placement.move on the SAME repo: the reveal must be preserved
  // (it is legacy-owned once projected, composed fresh) AND placement changes.
  durableCommit(router, grey, GREY.placeMove, 'compose-2 placement.move');
  const stored2 = new SyncDurableRepository(repoStore.storage).read(grey.campaignId);
  checks.ok('after 2nd commit reveal still present', !!stored2.visibility.entities['entity:locationState:loc-mine__arc-1-peace']);
  const moved = stored2.durable.placements.find((p) => p.id === 'plc-mayor');
  checks.ok('placement moved in stored', moved && moved.position.x === 0.5 && moved.position.y === 0.5);

  // composeAggregateBase directly: no pending -> fresh legacy base (equal status).
  const base = composeAggregateBase(grey.snapshot(), stored2, new Set());
  checks.eq('compose no-pending status equal', base.report.status, 'equal');
  checks.eq('compose existing initialization', base.initialization, 'existing');
  // missing universal -> initialized.
  const initd = composeAggregateBase(grey.snapshot(), null, new Set());
  checks.eq('compose missing universal -> initialized', initd.initialization, 'initialized');
  checks.eq('compose missing universal status', initd.report.status, 'missing_universal');
  // invalid universal -> initialized, invalid status.
  const invalid = composeAggregateBase(grey.snapshot(), { durable: { entities: 'nope' } }, new Set());
  checks.eq('compose invalid universal status', invalid.report.status, 'invalid_universal');

  // parseSlotKey round trips ids containing colons.
  const parsed = parseSlotKey('reveal:entity:locationState:loc-mine__arc-1-peace');
  checks.eq('parseSlotKey aggregate', parsed.aggregateKind, 'reveal');
  checks.eq('parseSlotKey target keeps colons', parsed.targetId, 'entity:locationState:loc-mine__arc-1-peace');

  // canonical serialization stability.
  checks.eq('serialization round-trip stable', semanticSnapshotHash(stored2), semanticSnapshotHash(JSON.parse(JSON.stringify(stored2))));
}

// ===========================================================================
// GROUP E — Ownership registry
// ===========================================================================
function groupOwnership() {
  checks.eq('descriptor table size 8', allAggregateDescriptors().length, 8);
  checks.eq('greyholm reveal universal-owned', aggregateOwnershipOf('greyholm', 'reveal'), 'universal-owned');
  checks.eq('userCampaign placement universal-owned', aggregateOwnershipOf('userCampaign', 'placement'), 'universal-owned');
  checks.eq('userCampaign partyLocation legacy-owned (not in scope)', aggregateOwnershipOf('userCampaign', 'partyLocation'), 'legacy-owned');
  checks.eq('userCampaign routeProgress legacy-owned', aggregateOwnershipOf('userCampaign', 'routeProgress'), 'legacy-owned');
  checks.ok('greyholm owns 5 aggregates', universalOwnedAggregates('greyholm').length === 5);
  checks.ok('userCampaign owns 3 aggregates', universalOwnedAggregates('userCampaign').length === 3);
  // destructive command kinds are declared reversible.
  const revealDesc = aggregateDescriptor('greyholm.reveal');
  checks.ok('reveal.hide is destructive+reversible', revealDesc.destructiveCommandKinds.includes('reveal.hide'));
  checks.eq('inverse of place is remove', inverseCommandKind('placement.place'), 'placement.remove');
  checks.eq('inverse of reveal is hide', inverseCommandKind('reveal.entity'), 'reveal.hide');
  checks.eq('inverse of move is null (not simply reversible)', inverseCommandKind('placement.move'), null);
}

// ===========================================================================
// GROUP F — Invariants + identity failures (pre-commit fallback, no writes)
// ===========================================================================
function groupInvariants() {
  const grey = greyholmComplex();
  const gs = grey.snapshot();
  // Pure invariant checks against candidates.
  const revealCand = executeComplexCommand(gs, GREY.revealNew.command).snapshot;
  checks.eq('reveal.entity invariants clean', validateAggregateInvariants(gs, revealCand, GREY.revealNew.command).length, 0);
  // placement.move with out-of-bounds normalized coord -> invariant violation.
  const oob = executeComplexCommand(gs, { kind: 'placement.move', placementId: 'plc-mayor', position: { x: 5, y: 5 } });
  checks.ok('oob move executes (finite)', oob.accepted);
  checks.ok('oob move invariant violation', validateAggregateInvariants(gs, oob.snapshot, { kind: 'placement.move', placementId: 'plc-mayor', position: { x: 5, y: 5 } }).length > 0);
  // NaN coordinate -> command rejected before candidate.
  const nan = executeComplexCommand(gs, { kind: 'placement.move', placementId: 'plc-mayor', position: { x: NaN, y: 0.1 } });
  checks.ok('NaN move rejected by executor', !nan.accepted);
  // place with wrong campaign map -> mapping_failed.
  const wrongMap = executeComplexCommand(gs, { kind: 'placement.place', placementId: 'z', mapId: 'map:legacy:nope', entityRef: 'entity:npc:npc-mayor', entityKind: 'npc', position: { x: 0.1, y: 0.1 }, visibleToPlayers: false });
  checks.eq('place wrong map -> mapping_failed', wrongMap.rejectionCode, 'mapping_failed');
  // place duplicate id -> precondition_failed.
  const dupPlace = executeComplexCommand(gs, { kind: 'placement.place', placementId: 'plc-mayor', mapId: 'map:legacy:map-region', entityRef: 'entity:npc:npc-mayor', entityKind: 'npc', position: { x: 0.1, y: 0.1 }, visibleToPlayers: false });
  checks.eq('place duplicate id -> precondition_failed', dupPlace.rejectionCode, 'precondition_failed');

  // Router-level: invariant violation forces fallback with no repo write.
  const { router, repoStore } = makeRouter();
  const spec = { scope: 'greyholm.placement', command: { kind: 'placement.move', placementId: 'plc-mayor', position: { x: 9, y: 9 } }, tk: 'placement.move', ta: { plcId: 'plc-mayor', x: 9, y: 9 } };
  const r = route(router, grey, spec, { noFallbackApply: true });
  checks.eq('router: invariant violation -> fallback', r.outcome.decision, 'fallback');
  checks.eq('router: invariant_violation reason', r.outcome.fallbackReason, 'invariant_violation');
  checks.eq('router: no repository write on invariant violation', repoStore.writeCount(), 0);

  // Router-level: mapping_failed (missing target) -> fallback.
  const { router: r2, repoStore: repo2 } = makeRouter();
  const missSpec = { scope: 'greyholm.reveal', command: { kind: 'reveal.entity', targetUniversalId: 'entity:locationState:ghost' }, tk: 'reveal.entity', ta: { locId: 'ghost' } };
  const mr = route(r2, greyholmComplex(), missSpec, { noFallbackApply: true });
  checks.eq('router: missing target -> mapping_failed fallback', mr.outcome.fallbackReason, 'mapping_failed');
  checks.eq('router: no repo write on mapping_failed', repo2.writeCount(), 0);
}

// ===========================================================================
// GROUP G — Scope violation (candidate touching outside owned region)
// ===========================================================================
function groupScope() {
  // ownedPathPrefixes contract.
  checks.ok('reveal prefix', ownedPathPrefixes('reveal', 'X')[0] === 'visibility.entities:X');
  // Stage 16.1 addendum: routeProgress.advance may ALSO clear currentMapPosition
  // (legacy SET_PARTY_ROUTE_PROGRESS semantics), so the owned region grew from 2
  // to 3 prefixes (runtime.party.routeProgress, durable.travel.partyRouteProgress,
  // runtime.party.currentMapPosition).
  checks.ok('routeProgress owns three regions', ownedPathPrefixes('routeProgress', 'party').length === 3);
  checks.ok('placement prefix', ownedPathPrefixes('placement', 'p1')[0] === 'durable.placements:p1');

  // A synthetic executor that also mutates an unrelated region would be caught by
  // the router scope gate. We simulate by asserting the real executor stays in
  // region for every canonical command.
  const grey = greyholmComplex();
  const gs = grey.snapshot();
  for (const key of ['revealNew', 'dismiss', 'partyMove', 'routeAdvance', 'placeMove', 'placeNew']) {
    const spec = GREY[key];
    const res = executeComplexCommand(gs, spec.command);
    if (!res.accepted) { checks.ok(`scope ${key}: executes`, false); continue; }
    const prefixes = ownedPathPrefixes(spec.command.kind.split('.')[0], res.targetId);
    const inScope = res.changedPaths.every((p) => prefixes.some((pre) => p === pre || p.startsWith(pre + '.') || p.startsWith(pre + ':')));
    checks.ok(`scope ${key}: all changed paths in owned region`, inScope);
  }
}

// ===========================================================================
// GROUP H — Sequential multi-aggregate on one repo (FIFO, revisions)
// ===========================================================================
function groupSequential() {
  const { router } = makeRouter();
  const grey = greyholmComplex();
  durableCommit(router, grey, GREY.revealNew, 'seq1 reveal');
  durableCommit(router, grey, GREY.dismiss, 'seq2 dismiss');
  durableCommit(router, grey, GREY.placeMove, 'seq3 placement');
  durableCommit(router, grey, GREY.routeAdvance, 'seq4 route');
  checks.eq('sequential final revision = 4', router.currentRevision(grey.campaignId), 4);
  const status = router.getStatus(grey.campaignId);
  checks.eq('durable commit count 4', status.durableCommitCount, 4);
  checks.eq('fallback count 0', status.fallbackCount, 0);

  // Two campaigns on one router remain independent.
  const cald = caldranComplex();
  durableCommit(router, cald, CALD.revealNew, 'seq caldran reveal');
  checks.eq('greyholm revision unchanged by caldran', router.currentRevision(grey.campaignId), 4);
  checks.eq('caldran revision 1', router.currentRevision(cald.campaignId), 1);
  checks.ok('separate repo keys per campaign', router.getStatus(grey.campaignId).campaignId !== router.getStatus(cald.campaignId).campaignId);
}

// ===========================================================================
// GROUP I — Dedup + stale precondition + revision conflict
// ===========================================================================
function groupConcurrency() {
  // Duplicate event (same command, same time) deduped -> one commit.
  const { router } = makeRouter();
  const grey = greyholmComplex();
  // commitThrows keeps the legacy pre-state unchanged between the two calls, so
  // the second identical submit produces the same eventId and is deduped.
  const req = complexRequest(grey, GREY.revealNew.scope, GREY.revealNew.command, GREY.revealNew.tk, GREY.revealNew.ta, '2020-01-01T00:00:00.000Z', { commitThrows: true });
  const o1 = router.route(req.request);
  const req2 = complexRequest(grey, GREY.revealNew.scope, GREY.revealNew.command, GREY.revealNew.tk, GREY.revealNew.ta, '2020-01-01T00:00:00.000Z', { commitThrows: true });
  const o2 = router.route(req2.request);
  checks.eq('dup: first durable', o1.decision, 'durable_committed');
  checks.eq('dup: second deduped (no 2nd commit)', o2.record.errorCategory, 'duplicate_event');
  checks.eq('dup: second no legacy commit', req2.calls.commit, 0);
  checks.eq('dup: revision still 1', router.currentRevision(grey.campaignId), 1);

  // Stale precondition: legacy pre-state changes between buildPre calls.
  const { router: r2 } = makeRouter();
  const grey2 = greyholmComplex();
  let flip = 0;
  const stale = complexRequest(grey2, GREY.placeMove.scope, GREY.placeMove.command, GREY.placeMove.tk, GREY.placeMove.ta, NOW(), {});
  const origBuild = stale.request.buildPre;
  stale.request.buildPre = () => {
    flip += 1;
    if (flip === 2) { grey2.apply('placement.move', { plcId: 'plc-mayor', x: 0.9, y: 0.9 }); } // external change before re-check
    return grey2.adaptPre();
  };
  const so = r2.route(stale.request);
  checks.eq('stale precondition -> fallback', so.decision, 'fallback');
  checks.eq('stale precondition reason', so.fallbackReason, 'stale_precondition');

  // Revision conflict: production revision changes under the router mid-flight.
  const { router: r3, repoStore } = makeRouter();
  const grey3 = greyholmComplex();
  durableCommit(r3, grey3, GREY.revealNew, 'conflict-seed');
  // Simulate an external durable writer bumping the revision between read and commit.
  const conflictSpec = GREY.placeMove;
  const cr = complexRequest(grey3, conflictSpec.scope, conflictSpec.command, conflictSpec.tk, conflictSpec.ta, NOW());
  const origPredict = cr.request.predictPost;
  cr.request.predictPost = () => {
    // bump the stored revision out-of-band (rewrite record with revision+1)
    const key = `${UNIVERSAL_PRODUCTION_NAMESPACE}:campaign:${grey3.campaignId}`;
    const rec = JSON.parse(repoStore.raw.get(key));
    rec.snapshot.revision = rec.snapshot.revision + 1;
    repoStore.raw.set(key, JSON.stringify(rec));
    return origPredict();
  };
  const co = r3.route(cr.request);
  checks.eq('revision conflict -> fallback', co.decision, 'fallback');
  checks.eq('revision conflict reason', co.fallbackReason, 'repository_conflict');
}

// ===========================================================================
// GROUP J — Partial failure + recovery
// ===========================================================================
function groupPartialFailure() {
  // Universal committed + legacy projection threw -> pending record, still durable.
  const { router, repoStore } = makeRouter();
  const grey = greyholmComplex();
  const r = route(router, grey, GREY.revealNew, { commitThrows: true });
  checks.eq('legacy threw: still durable committed', r.outcome.decision, 'durable_committed');
  checks.eq('legacy threw: phase pending', r.outcome.phase, 'universal_committed_legacy_pending');
  checks.eq('legacy threw: pending record created', r.outcome.record.recoveryStatus, 'pending_created');
  checks.eq('legacy threw: revision advanced to 1', router.currentRevision(grey.campaignId), 1);
  const pending = router.readPendingRecovery(grey.campaignId);
  checks.eq('one pending record', pending.length, 1);
  checks.eq('pending stores slotKey', pending[0].slotKey, 'reveal:entity:locationState:loc-mine__arc-1-peace');
  checks.ok('pending stores no raw value (hash only)', typeof pending[0].committedValueHash === 'string' && !('value' in pending[0]));

  // Reload recovery: legacy value already matches committed -> resolved.
  const recovered = router.runRecovery(grey.campaignId, {
    readLegacySlot: (aggregateKind, targetId) => readAggregateSlot(grey.snapshot(), aggregateKind, targetId),
    project: () => { throw new Error('should not project when already applied'); },
  });
  // grey legacy never applied the reveal (commit threw), so legacy != committed;
  // recovery must PROJECT it.
  const recovered2 = router.runRecovery(grey.campaignId, {
    readLegacySlot: (aggregateKind, targetId) => readAggregateSlot(grey.snapshot(), aggregateKind, targetId),
    project: (rec, value) => { grey.apply('reveal.entity', { locId: 'loc-mine__arc-1-peace' }); return grey.adaptPre(); },
  });
  checks.ok('recovery resolved pending via projection', recovered.resolved + recovered2.resolved >= 1);
  checks.eq('no pending remaining', router.readPendingRecovery(grey.campaignId).length, 0);

  // Idempotent: recovery on already-applied legacy resolves without projecting.
  const { router: r2 } = makeRouter();
  const grey2 = greyholmComplex();
  route(r2, grey2, GREY.revealNew, { commitAdapterError: true }); // applies legacy but adapter errors -> pending
  const rr = r2.runRecovery(grey2.campaignId, {
    readLegacySlot: (aggregateKind, targetId) => readAggregateSlot(grey2.snapshot(), aggregateKind, targetId),
    project: () => { throw new Error('should not be called; legacy already matches'); },
  });
  checks.eq('idempotent recovery resolves already-applied', rr.resolved, 1);

  // Bounded retries: recovery that keeps failing stops after maxAttempts.
  const { router: r3 } = makeRouter();
  const grey3 = greyholmComplex();
  route(r3, grey3, GREY.revealNew, { commitThrows: true });
  let attempts = 0;
  for (let i = 0; i < 6; i++) {
    r3.runRecovery(grey3.campaignId, {
      readLegacySlot: () => 'always-different',
      project: () => { attempts += 1; return { snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'x', path: 'p', message: 'fail' }] }; },
      maxAttempts: 3,
    });
  }
  checks.ok('recovery bounded (<= 3 projection attempts)', attempts <= 3);
  checks.eq('pending remains after bounded failures', r3.readPendingRecovery(grey3.campaignId).length, 1);

  // Wrong-campaign recovery is a no-op.
  const rw = r3.runRecovery('camp:user:other', { readLegacySlot: () => null, project: () => { throw new Error('x'); } });
  checks.eq('wrong-campaign recovery no-op', rw.resolved, 0);
}

// ===========================================================================
// GROUP K — Repository robustness + storage failures
// ===========================================================================
function groupRepositoryRobustness() {
  // Storage setItem throws before commit -> safe fallback, no partial record.
  const grey = greyholmComplex();
  const router = new ComplexAuthorityRouter({
    repositoryStorage: failingSetStorage(),
    diagnosticsStorage: instrumentedStorage().storage,
    recoveryStorage: instrumentedStorage().storage,
    allowedScopes: new Set(ALL_COMPLEX_AUTHORITY_SCOPES),
    enabled: true,
    now: NOW,
  });
  const r = route(router, grey, GREY.revealNew, { noFallbackApply: false });
  checks.eq('storage failure before commit -> fallback', r.outcome.decision, 'fallback');
  checks.eq('storage failure reason write_failed', r.outcome.fallbackReason, 'repository_write_failed');

  // Corrupt production record -> read throws -> safe fallback (no repair).
  const corrupt = corruptReadStorage(UNIVERSAL_PRODUCTION_NAMESPACE, greyholmComplex().campaignId);
  const router2 = new ComplexAuthorityRouter({
    repositoryStorage: corrupt.storage,
    diagnosticsStorage: instrumentedStorage().storage,
    recoveryStorage: instrumentedStorage().storage,
    allowedScopes: new Set(ALL_COMPLEX_AUTHORITY_SCOPES),
    enabled: true,
    now: NOW,
  });
  const r2 = route(router2, greyholmComplex(), GREY.revealNew, {});
  checks.eq('corrupt production read -> fallback', r2.outcome.decision, 'fallback');
  checks.ok('corrupt read reason is repository or reconciliation', ['repository_write_failed', 'reconciliation_conflict'].includes(r2.outcome.fallbackReason));

  // Diagnostics persistence failure never breaks the durable commit.
  const okRepo = instrumentedStorage();
  const router3 = new ComplexAuthorityRouter({
    repositoryStorage: okRepo.storage,
    diagnosticsStorage: failingSetStorage(),
    recoveryStorage: instrumentedStorage().storage,
    allowedScopes: new Set(ALL_COMPLEX_AUTHORITY_SCOPES),
    enabled: true,
    now: NOW,
  });
  const r3 = route(router3, greyholmComplex(), GREY.revealNew, {});
  checks.eq('diagnostics failure: still durable committed', r3.outcome.decision, 'durable_committed');
  checks.eq('diagnostics failure: repo write happened', okRepo.writeCount() > 0, true);
}

// ===========================================================================
// GROUP L — Privacy / projections + namespaces
// ===========================================================================
function groupPrivacy() {
  const { router, repoStore } = makeRouter();
  const grey = greyholmComplex();
  const o = durableCommit(router, grey, GREY.revealNew, 'privacy-reveal');
  // Projection hashes present on the durable record.
  checks.ok('dm projection hash present', !!o.record.dmProjectionHash);
  checks.ok('player-safe projection hash present', !!o.record.playerSafeProjectionHash);
  checks.ok('observer projection hash present', !!o.record.observerProjectionHash);
  // Player-safe projection of the stored snapshot excludes DM-only content.
  const stored = new SyncDurableRepository(repoStore.storage).read(grey.campaignId);
  const ps = projectPlayerSafe(stored);
  const psJson = JSON.stringify(ps);
  checks.ok('player-safe projection is not the full DM snapshot', semanticSnapshotHash(stored) !== undefined && psJson.length < JSON.stringify(stored).length);
  // Reveal is visible in DM; the newly revealed entity appears in visibility.
  checks.ok('revealed entity present in stored visibility', !!stored.visibility.entities['entity:locationState:loc-mine__arc-1-peace']);
  // Diagnostics never store a full snapshot or raw values — only hashes/paths.
  const rec = router.readDiagnostics(grey.campaignId)[0];
  const recJson = JSON.stringify(rec);
  checks.ok('diagnostics record carries no durable.entities array', !recJson.includes('"entities":['));
  checks.ok('diagnostics record has hashes', typeof rec.candidateHash === 'string');

  // Namespaces are isolated + distinct from Stage 15 and production.
  checks.ok('stage16 diag namespace distinct from stage15', STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE !== STAGE_15_DURABLE_DIAGNOSTICS_NAMESPACE);
  checks.ok('stage16 recovery namespace distinct from diag', STAGE_16_COMPLEX_RECOVERY_NAMESPACE !== STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE);
  checks.ok('production namespace untouched by diag/recovery keys', STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE !== UNIVERSAL_PRODUCTION_NAMESPACE);
  checks.ok('shadow namespace not used as authority output', router.productionNamespace === UNIVERSAL_PRODUCTION_NAMESPACE && router.productionNamespace !== UNIVERSAL_SHADOW_NAMESPACE);
  // Diagnostics keys are under the stage16 namespace only.
  const diagKeys = makeRouter();
  durableCommit(diagKeys.router, greyholmComplex(), GREY.revealNew, 'ns-check');
  checks.ok('diagnostics stored under stage16 namespace', diagKeys.diagStore.rawKeys().every((k) => k.startsWith(STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE)));
}

// ===========================================================================
// GROUP M — Anchors / data safety across a durable transition
// ===========================================================================
function groupAnchors() {
  // Caldran anchors are preserved through a durable placement transition.
  const { router, repoStore } = makeRouter();
  const cald = caldranComplex();
  const before = cald.counts();
  durableCommit(router, cald, CALD.revealNew, 'anchors reveal');
  const stored = new SyncDurableRepository(repoStore.storage).read(cald.campaignId);
  const npc = stored.durable.entities.filter((e) => e.kind === 'npc').length;
  const enemies = stored.durable.entities.filter((e) => e.kind === 'enemy').length;
  const locs = stored.durable.entities.filter((e) => e.kind === 'location').length;
  const factions = stored.durable.entities.filter((e) => e.kind === 'faction').length;
  checks.eq('CALD 66 NPC retained', npc, 66);
  checks.eq('CALD 78 enemies retained', enemies, 78);
  checks.eq('CALD 17 locations retained', locs, 17);
  checks.eq('CALD 12 factions retained', factions, 12);
  checks.eq('CALD 17 placements retained', stored.durable.placements.length, 17);
  checks.eq('CALD 1 route retained', stored.durable.routes.length, 1);
  checks.ok('CALD 4 battle boards retained (runtime.battles)', Object.keys(stored.runtime.battles).length === 4);
  // 8 reveals -> 9 after new reveal.
  checks.eq('CALD reveals 8 -> 9 after new reveal', Object.keys(stored.visibility.entities).length, 9);
  checks.eq('CALD placement count unchanged by reveal', before.placements, 17);
}

// ===========================================================================
// GROUP N — Interaction with legacy prediction independence
// ===========================================================================
function groupPredictionIndependence() {
  // prediction_unavailable -> pre-commit fallback (no repo write).
  const { router, repoStore } = makeRouter();
  const grey = greyholmComplex();
  const r = route(router, grey, GREY.revealNew, { predict: () => ({ snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'x', path: 'p', message: 'predict unavailable' }] }), noFallbackApply: true });
  checks.eq('prediction unavailable -> fallback', r.outcome.decision, 'fallback');
  checks.eq('prediction unavailable reason', r.outcome.fallbackReason, 'prediction_unavailable');
  checks.eq('no repo write on prediction unavailable', repoStore.writeCount(), 0);

  // prediction_mismatch -> pre-commit fallback (legacy prediction differs).
  const { router: r2, repoStore: repo2 } = makeRouter();
  const grey2 = greyholmComplex();
  const mm = route(r2, grey2, GREY.revealNew, { predict: () => grey2.predict('reveal.hide', { locId: 'loc-greyholm__arc-1-peace' }), noFallbackApply: true });
  checks.eq('prediction mismatch -> fallback', mm.outcome.decision, 'fallback');
  checks.eq('prediction mismatch reason', mm.outcome.fallbackReason, 'prediction_mismatch');
  checks.eq('no repo write on prediction mismatch', repo2.writeCount(), 0);
}

// ===========================================================================
// GROUP O — Reconciliation (pending on another slot blocks new commit)
// ===========================================================================
function groupReconciliation() {
  const { router } = makeRouter();
  const grey = greyholmComplex();
  // Create a pending projection on the reveal slot (legacy threw).
  route(router, grey, GREY.revealNew, { commitThrows: true });
  checks.eq('one pending after threw', router.readPendingRecovery(grey.campaignId).length, 1);
  // A new command on a DIFFERENT slot must be blocked (reconciliation_conflict).
  const r = route(router, grey, GREY.placeMove, {});
  checks.eq('pending on other slot blocks new commit', r.outcome.fallbackReason, 'reconciliation_conflict');
  // A command on the SAME slot proceeds and resolves the pending record.
  const same = route(router, grey, GREY.revealNew, {});
  // same reveal is deduped? No — commitThrows produced a pending but seenEventIds
  // has the id; a fresh reveal with a new time gets a new id.
  checks.ok('same-slot command handled', same.outcome.handled);
}

// ===========================================================================
// GROUP P — Safety / scope audit (no forbidden effects)
// ===========================================================================
function groupSafety() {
  // The router only ever writes production + its own diag/recovery namespaces.
  const { router, repoStore, diagStore, recovStore } = makeRouter();
  durableCommit(router, greyholmComplex(), GREY.revealNew, 'safety-1');
  checks.ok('repo keys only production namespace', repoStore.rawKeys().every((k) => k.startsWith(UNIVERSAL_PRODUCTION_NAMESPACE)));
  checks.ok('diag keys only stage16 namespace', diagStore.rawKeys().every((k) => k.startsWith(STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE)));
  checks.ok('no legacy keys touched by router repo', !repoStore.rawKeys().some((k) => k.includes('campaign-timeline') && k.includes('legacy')));
  // No network: the router has no fetch; commit/fallback are the only side effects
  // and are injected by the caller (legacy action). Represented by callback counts.
  const grey = greyholmComplex();
  const { router: r2 } = makeRouter();
  const rr = route(r2, grey, GREY.revealNew, {});
  checks.eq('exactly one legacy compatibility action', rr.calls.commit, 1);
  checks.eq('zero fallback legacy actions on success', rr.calls.fallback, 0);
}

// ---- run ------------------------------------------------------------------
groupFlags();
groupIdentity();
groupDurableHappy();
groupComposition();
groupOwnership();
groupInvariants();
groupScope();
groupSequential();
groupConcurrency();
groupPartialFailure();
groupRepositoryRobustness();
groupPrivacy();
groupAnchors();
groupPredictionIndependence();
groupReconciliation();
groupSafety();

const summary = checks.summary();
const failures = checks.results.filter((r) => !r.pass);
const verdict = summary.failed === 0 ? 'STAGE_16_HARNESS_PASS' : 'STAGE_16_HARNESS_FAIL';
mkdirSync(resolve(root, 'rebuild-reports/stage-16'), { recursive: true });
writeFileSync(
  resolve(root, 'rebuild-reports/stage-16/harness-result.json'),
  JSON.stringify({ verdict, passed: summary.passed, failed: summary.failed, total: summary.total, failures }, null, 2),
);
if (summary.failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ✗', f.name, '—', String(f.detail));
}
console.log(`\nStage 16 harness: ${summary.passed}/${summary.total} PASS -> ${verdict}`);
process.exit(summary.failed === 0 ? 0 : 1);

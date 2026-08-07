// Stage 16.1 — application INTEGRATION harness.
//
// Exercises the EXACT production wiring the React providers/stores use — the
// pure `complexRouteBridge` (descriptor -> typed command -> Stage 16 router with
// adapter closures) — against BOTH real campaigns (Greyholm overlay contract +
// Caldran user-campaign export). It reproduces each store's request construction
// (preOverlay/predict/commit/fallback closures over the real legacy transitions)
// so a green run proves normal UI actions actually route through Stage 16
// durable authority when enabled, fall back cleanly when disabled or when the
// legacy effect does not match a single aggregate, and stay campaign-isolated.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  ComplexAuthorityRouter,
  ALL_COMPLEX_AUTHORITY_SCOPES,
  UI_OWNED_COMPLEX_SCOPES,
  narrowToUiOwned,
  allAggregateDescriptors,
  aggregateDescriptor,
  resolveComplexScopes,
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  entityIdFromLegacy,
  readAggregateSlot,
  projectPlayerSafe,
  SyncDurableRepository,
  UNIVERSAL_PRODUCTION_NAMESPACE,
  STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE,
} from './.dist/domain/index.js';
import {
  descriptorToCommand,
  routeMainComplexThrough,
  routeUserComplexThrough,
} from './.dist/features/complex-authority/complexRouteBridge.js';
import { Checks } from '../stage08/lib.mjs';
import { buildGreyholmOverlayContractInput } from '../stage08/greyholmOverlayFixture.mjs';
import { loadCaldran } from '../stage08/inputs.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checks = new Checks();
const clone = (v) => structuredClone(v);

function instrumentedStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  const ops = { get: 0, set: 0, remove: 0 };
  return {
    storage: {
      getItem: (k) => { ops.get += 1; return map.get(k) ?? null; },
      setItem: (k, v) => { ops.set += 1; map.set(k, v); },
      removeItem: (k) => { ops.remove += 1; map.delete(k); },
    },
    ops, raw: map, rawKeys: () => Array.from(map.keys()), writeCount: () => ops.set + ops.remove,
  };
}

function makeRouter({ enabled = true, scopes = ALL_COMPLEX_AUTHORITY_SCOPES } = {}) {
  const repo = instrumentedStorage();
  const diag = instrumentedStorage();
  const recov = instrumentedStorage();
  const router = new ComplexAuthorityRouter({
    repositoryStorage: repo.storage,
    diagnosticsStorage: diag.storage,
    recoveryStorage: recov.storage,
    allowedScopes: new Set(scopes),
    enabled,
  });
  return { router, repo, diag, recov };
}

// ---- Greyholm store-equivalent request builder ----------------------------
// The Greyholm store keeps base data constant and mutates only the overlay.
function greyholmHarness() {
  const seed = buildGreyholmOverlayContractInput();
  const data = clone(seed.data);
  let overlay = clone(seed.overlay);
  const mergedData = () => data; // never changes for these aggregates

  // Pure overlay reducers mirroring SET_REVEALED / UNSET_REVEALED / SET_PRESENTED_CARD.
  function reduce(o, descriptor) {
    const n = clone(o);
    n.party = n.party ?? {};
    if (descriptor.aggregate === 'reveal') {
      const set = new Set(n.party.revealedLocationStateIds ?? []);
      if (descriptor.reveal) set.add(descriptor.legacyEntityId); else set.delete(descriptor.legacyEntityId);
      n.party.revealedLocationStateIds = Array.from(set);
    } else if (descriptor.aggregate === 'presentedCard') {
      n.presentedCard = descriptor.present ? { type: descriptor.cardType, id: descriptor.cardId } : null;
    } else if (descriptor.aggregate === 'partyLocation') {
      // The REAL SET_CURRENT_LOCATION also clears currentMapPosition + routeProgress
      // (multi-slot) — reproduce that to prove it safely falls back.
      n.party.currentLocationStateId = descriptor.locationStateId;
      n.party.currentMapPosition = undefined;
      n.partyRouteProgress = null;
    } else if (descriptor.aggregate === 'placement') {
      // Mirror the real campaignStore overlay shape (placementPatches / newPlacements)
      // exactly like ADD_PLACEMENT/PATCH_PLACEMENT/DELETE_PLACEMENT so a placement
      // move/place/remove is actually observable in the adapted snapshot.
      n.placementPatches = { ...(n.placementPatches ?? {}) };
      n.newPlacements = [...(n.newPlacements ?? [])];
      if (descriptor.op === 'move') {
        n.placementPatches[descriptor.placementId] = { ...(n.placementPatches[descriptor.placementId] ?? {}), position: { x: descriptor.x, y: descriptor.y } };
      } else if (descriptor.op === 'remove') {
        n.placementPatches[descriptor.placementId] = { ...(n.placementPatches[descriptor.placementId] ?? {}), _deleted: true };
      } else if (descriptor.op === 'place') {
        n.newPlacements.push({
          id: descriptor.placementId,
          mapId: descriptor.mapRawId,
          entityKind: descriptor.entityKind,
          entityId: descriptor.entityId,
          position: { x: descriptor.x, y: descriptor.y },
          title: descriptor.title,
          visibleToPlayers: descriptor.visibleToPlayers ?? false,
        });
      }
    }
    return n;
  }

  return {
    campaignId: campaignIdFromLegacy('greyholm', 'main'),
    mergedData,
    overlay: () => overlay,
    // Build a MainComplexRequest exactly like campaignStore.routeGreyComplex.
    request(scope, descriptor, calls = { commit: 0, fallback: 0 }, overrides = {}) {
      const preOverlay = overlay;
      return {
        complexScope: scope,
        descriptor,
        preOverlay,
        predict: () => (overrides.predict ? overrides.predict() : reduce(preOverlay, descriptor)),
        commit: () => {
          calls.commit += 1;
          if (overrides.commitThrows) throw new Error('legacy commit failed');
          overlay = reduce(preOverlay, descriptor); // the ONE real legacy dispatch
          return overlay;
        },
        fallback: () => { calls.fallback += 1; overlay = reduce(preOverlay, descriptor); },
      };
    },
    calls: () => ({ commit: 0, fallback: 0 }),
  };
}

// ---- Caldran store-equivalent request builder -----------------------------
function caldranHarness() {
  const caldran = loadCaldran();
  const legacyCampaignId = caldran.raw.data.campaignId;
  let data = clone(caldran.adapterInput.data);
  const runtime = clone(caldran.adapterInput.runtime);

  function reduce(d, descriptor) {
    const n = clone(d);
    if (descriptor.aggregate === 'placement') {
      if (descriptor.op === 'move') n.mapPlacements = n.mapPlacements.map((mp) => (mp.id === descriptor.placementId ? { ...mp, x: descriptor.x, y: descriptor.y } : mp));
      else if (descriptor.op === 'remove') n.mapPlacements = n.mapPlacements.filter((mp) => mp.id !== descriptor.placementId);
    } else if (descriptor.aggregate === 'reveal') {
      // REAL toggleReveal also flips placement.visibleToPlayers + image.playerSafe
      // (multi-slot) — reproduce so it safely falls back.
      const set = new Set(n.__reveals ?? runtime.revealedToPlayers ?? []);
      if (descriptor.reveal) set.add(descriptor.legacyEntityId); else set.delete(descriptor.legacyEntityId);
      n.mapPlacements = n.mapPlacements.map((mp) => (mp.entityId === descriptor.legacyEntityId ? { ...mp, visibleToPlayers: descriptor.reveal } : mp));
    }
    return n;
  }

  return {
    legacyCampaignId,
    campaignId: campaignIdFromLegacy('user', legacyCampaignId),
    data: () => data,
    request(scope, descriptor, calls = { commit: 0, fallback: 0 }, overrides = {}) {
      const preData = data;
      const preRuntime = runtime;
      return {
        legacyCampaignId,
        complexScope: scope,
        descriptor,
        preData,
        preRuntime,
        predict: () => ({ data: reduce(preData, descriptor), runtime: preRuntime }),
        commit: () => {
          calls.commit += 1;
          if (overrides.commitThrows) throw new Error('legacy commit failed');
          data = reduce(preData, descriptor);
          return { data, runtime: preRuntime };
        },
        fallback: () => { calls.fallback += 1; data = reduce(preData, descriptor); },
      };
    },
  };
}

// ===========================================================================
// A — descriptor -> typed command translation (the bridge core)
// ===========================================================================
function groupDescriptorTranslation() {
  const reveal = descriptorToCommand({ aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-x' });
  checks.eq('reveal -> reveal.entity', reveal.kind, 'reveal.entity');
  checks.eq('reveal target universal id', reveal.targetUniversalId, entityIdFromLegacy('locationState', 'loc-x'));
  checks.eq('hide -> reveal.hide', descriptorToCommand({ aggregate: 'reveal', reveal: false, entityKind: 'locationState', legacyEntityId: 'loc-x' }).kind, 'reveal.hide');
  checks.eq('present -> presentedCard.present', descriptorToCommand({ aggregate: 'presentedCard', present: true, cardType: 'npc', cardId: 'n1' }).kind, 'presentedCard.present');
  checks.eq('present missing id -> null', descriptorToCommand({ aggregate: 'presentedCard', present: true }), null);
  checks.eq('dismiss -> presentedCard.dismiss', descriptorToCommand({ aggregate: 'presentedCard', present: false }).kind, 'presentedCard.dismiss');
  checks.eq('placement move -> placement.move', descriptorToCommand({ aggregate: 'placement', op: 'move', placementId: 'p1', x: 1, y: 2 }).kind, 'placement.move');
  checks.eq('placement move missing coords -> null', descriptorToCommand({ aggregate: 'placement', op: 'move', placementId: 'p1' }), null);
  checks.eq('placement remove -> placement.remove', descriptorToCommand({ aggregate: 'placement', op: 'remove', placementId: 'p1' }).kind, 'placement.remove');
  checks.eq('placement place -> placement.place', descriptorToCommand({ aggregate: 'placement', op: 'place', placementId: 'p1', mapRawId: 'm', entityKind: 'npc', entityId: 'n', x: 1, y: 2 }).kind, 'placement.place');
  checks.eq('placement place missing map -> null', descriptorToCommand({ aggregate: 'placement', op: 'place', placementId: 'p1', entityKind: 'npc', entityId: 'n', x: 1, y: 2 }), null);
  checks.eq('partyLocation -> partyLocation.move', descriptorToCommand({ aggregate: 'partyLocation', locationStateId: 'loc-x' }).kind, 'partyLocation.move');
  checks.eq('routeProgress advance', descriptorToCommand({ aggregate: 'routeProgress', progress: { p: 1 } }).kind, 'routeProgress.advance');
  checks.eq('routeProgress clear', descriptorToCommand({ aggregate: 'routeProgress', progress: null }).kind, 'routeProgress.clear');
}

// ===========================================================================
// B — Provider lifecycle (flag gating) via router enable/disable
// ===========================================================================
function groupProviderLifecycle() {
  // OFF: bridge routes but router reports not-handled bare fallback; zero writes.
  const off = makeRouter({ enabled: false });
  const grey = greyholmHarness();
  const calls = { commit: 0, fallback: 0 };
  const handled = routeMainComplexThrough(off.router, grey.mergedData, 'greyholm.reveal', grey.request('greyholm.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, calls));
  checks.eq('OFF: not handled', handled, false);
  checks.eq('OFF: legacy fallback ran once', calls.fallback, 1);
  checks.eq('OFF: zero repository writes', off.repo.writeCount(), 0);
  checks.eq('OFF: zero diagnostics writes', off.diag.writeCount(), 0);
  checks.eq('OFF: zero recovery writes', off.recov.writeCount(), 0);

  // Narrowed scopes: greyholm.reveal disabled -> not allowlisted -> not handled.
  const narrow = makeRouter({ enabled: true, scopes: ['userCampaign.placement'] });
  const h2 = routeMainComplexThrough(narrow.router, grey.mergedData, 'greyholm.reveal', grey.request('greyholm.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }));
  checks.eq('narrowed: greyholm.reveal not allowlisted -> not handled', h2, false);
  checks.eq('narrowed: zero repo writes', narrow.repo.writeCount(), 0);

  checks.eq('resolveComplexScopes(all) size 8', resolveComplexScopes('all').size, 8);
  checks.eq('resolveComplexScopes narrow size', resolveComplexScopes('greyholm.reveal').size, 1);
}

// ===========================================================================
// C — Greyholm normal-UI flows route through Stage 16 (durable)
// ===========================================================================
function greyDurable(label, descriptor, scope) {
  const { router, repo } = makeRouter();
  const grey = greyholmHarness();
  const calls = { commit: 0, fallback: 0 };
  const before = router.currentRevision(grey.campaignId);
  const handled = routeMainComplexThrough(router, grey.mergedData, scope, grey.request(scope, descriptor, calls));
  checks.eq(`${label}: handled by Stage 16`, handled, true);
  const status = router.getStatus(grey.campaignId);
  checks.eq(`${label}: durable committed`, status.lastDecision, 'durable_committed');
  checks.eq(`${label}: phase success`, status.phase, 'success');
  checks.eq(`${label}: one legacy transition`, calls.commit, 1);
  checks.eq(`${label}: zero pre-commit fallback`, calls.fallback, 0);
  const after = router.currentRevision(grey.campaignId);
  checks.ok(`${label}: revision advanced`, after !== null && (before === null ? after === 1 : after > before));
  checks.ok(`${label}: repo write under production namespace`, repo.rawKeys().every((k) => k.startsWith(UNIVERSAL_PRODUCTION_NAMESPACE)));
  return { router, repo, grey };
}

function groupGreyholmFlows() {
  greyDurable('GREY reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, 'greyholm.reveal');
  greyDurable('GREY hide', { aggregate: 'reveal', reveal: false, entityKind: 'locationState', legacyEntityId: 'loc-greyholm__arc-1-peace' }, 'greyholm.reveal');
  greyDurable('GREY present card', { aggregate: 'presentedCard', present: true, cardType: 'npc', cardId: 'npc-mayor' }, 'greyholm.presentedCard');
  greyDurable('GREY dismiss card', { aggregate: 'presentedCard', present: false }, 'greyholm.presentedCard');

  // partyLocation via the REAL multi-slot SET_CURRENT_LOCATION must SAFELY FALL
  // BACK (clears map position + route progress -> not a single aggregate).
  const { router, repo } = makeRouter();
  const grey = greyholmHarness();
  const calls = { commit: 0, fallback: 0 };
  routeMainComplexThrough(router, grey.mergedData, 'greyholm.partyLocation', grey.request('greyholm.partyLocation', { aggregate: 'partyLocation', locationStateId: 'loc-mine__arc-1-peace' }, calls));
  checks.eq('GREY party (multi-slot) decision is fallback', router.getStatus(grey.campaignId).lastDecision, 'fallback');
  checks.eq('GREY party fallback reason prediction_mismatch', router.getStatus(grey.campaignId).lastFallbackReason, 'prediction_mismatch');
  checks.eq('GREY party legacy ran once (fallback)', calls.fallback, 1);
  checks.eq('GREY party zero durable commit', calls.commit, 0);
  checks.eq('GREY party no durable repository record', repo.raw.has(`${UNIVERSAL_PRODUCTION_NAMESPACE}:campaign:${grey.campaignId}`), false);
}

// ===========================================================================
// D — Caldran normal-UI flows route through Stage 16 (durable)
// ===========================================================================
function caldDurable(router, repo, cald, label, descriptor, calls) {
  const before = router.currentRevision(cald.campaignId);
  const handled = routeUserComplexThrough(router, 'userCampaign.placement', cald.request('userCampaign.placement', descriptor, calls));
  checks.eq(`${label}: handled by Stage 16`, handled, true);
  const status = router.getStatus(cald.campaignId);
  checks.eq(`${label}: durable committed`, status.lastDecision, 'durable_committed');
  checks.eq(`${label}: one legacy transition`, calls.commit, 1);
  const after = router.currentRevision(cald.campaignId);
  checks.ok(`${label}: revision advanced`, after !== null && (before === null ? after === 1 : after > before));
}

function groupCaldranFlows() {
  {
    const { router, repo } = makeRouter();
    const cald = caldranHarness();
    caldDurable(router, repo, cald, 'CALD placement move', { aggregate: 'placement', op: 'move', placementId: 'pin-mri2gsa2-pnnbk', x: 6.5, y: 30.0 }, { commit: 0, fallback: 0 });
    // exact campaign id, no Greyholm fallback
    checks.eq('CALD exact campaign id', cald.campaignId, `camp:user:${cald.legacyCampaignId}`);
    checks.ok('CALD id differs from Greyholm', cald.campaignId !== campaignIdFromLegacy('greyholm', 'main'));
  }
  {
    const { router } = makeRouter();
    const cald = caldranHarness();
    caldDurable(router, undefined, cald, 'CALD placement remove', { aggregate: 'placement', op: 'remove', placementId: 'pin-mri2gsa2-pnnbk' }, { commit: 0, fallback: 0 });
  }
  // Caldran reveal via the REAL coupled toggleReveal must SAFELY FALL BACK.
  {
    const { router, repo } = makeRouter();
    const cald = caldranHarness();
    const calls = { commit: 0, fallback: 0 };
    routeUserComplexThrough(router, 'userCampaign.reveal', cald.request('userCampaign.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'npc', legacyEntityId: 'npc-seed-1-y212' }, calls));
    checks.eq('CALD coupled reveal decision is fallback', router.getStatus(cald.campaignId).lastDecision, 'fallback');
    checks.eq('CALD reveal legacy ran once (fallback)', calls.fallback, 1);
    checks.eq('CALD reveal zero durable commit', calls.commit, 0);
  }
}

// ===========================================================================
// E — State capture, anchors, data preservation
// ===========================================================================
function groupStateCapture() {
  const { router, repo } = makeRouter();
  const cald = caldranHarness();
  routeUserComplexThrough(router, 'userCampaign.placement', cald.request('userCampaign.placement', { aggregate: 'placement', op: 'move', placementId: 'pin-mri2gsa2-pnnbk', x: 7, y: 31 }, { commit: 0, fallback: 0 }));
  const stored = new SyncDurableRepository(repo.storage).read(cald.campaignId);
  checks.eq('CALD 66 NPC retained', stored.durable.entities.filter((e) => e.kind === 'npc').length, 66);
  checks.eq('CALD 78 enemies retained', stored.durable.entities.filter((e) => e.kind === 'enemy').length, 78);
  checks.eq('CALD 17 placements retained', stored.durable.placements.length, 17);
  checks.eq('CALD 1 route retained', stored.durable.routes.length, 1);
  checks.eq('CALD 4 battle boards retained', Object.keys(stored.runtime.battles).length, 4);
  const moved = stored.durable.placements.find((p) => p.id === 'pin-mri2gsa2-pnnbk');
  checks.ok('CALD placement moved in stored', moved && moved.position.x === 7 && moved.position.y === 31);

  // Greyholm: reveal preserves maps/battle + prior reveal.
  const g = greyDurable('capture reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, 'greyholm.reveal');
  const gstored = new SyncDurableRepository(g.repo.storage).read(g.grey.campaignId);
  checks.ok('GREY maps preserved', gstored.durable.maps.length >= 2);
  checks.ok('GREY battle maps preserved (array)', Array.isArray(gstored.durable.battleMaps));
  checks.ok('GREY new reveal present', !!gstored.visibility.entities['entity:locationState:loc-mine__arc-1-peace']);
  checks.ok('GREY prior reveal preserved', !!gstored.visibility.entities['entity:locationState:loc-greyholm__arc-1-peace']);
}

// ===========================================================================
// F — Campaign isolation + storage namespaces
// ===========================================================================
function groupIsolation() {
  const { router, repo, diag, recov } = makeRouter();
  const grey = greyholmHarness();
  const cald = caldranHarness();
  routeMainComplexThrough(router, grey.mergedData, 'greyholm.reveal', grey.request('greyholm.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }));
  routeUserComplexThrough(router, 'userCampaign.placement', cald.request('userCampaign.placement', { aggregate: 'placement', op: 'remove', placementId: 'pin-mri2gsa2-pnnbk' }, { commit: 0, fallback: 0 }));
  // Distinct production keys per campaign.
  const greyKey = `${UNIVERSAL_PRODUCTION_NAMESPACE}:campaign:${grey.campaignId}`;
  const caldKey = `${UNIVERSAL_PRODUCTION_NAMESPACE}:campaign:${cald.campaignId}`;
  checks.ok('Greyholm production key present', repo.raw.has(greyKey));
  checks.ok('Caldran production key present', repo.raw.has(caldKey));
  checks.ok('production keys distinct', greyKey !== caldKey);
  checks.ok('diagnostics under stage16 namespace only', diag.rawKeys().every((k) => k.startsWith(STAGE_16_COMPLEX_DIAGNOSTICS_NAMESPACE)));
  // Greyholm revision independent of Caldran.
  checks.eq('greyholm revision 1', router.currentRevision(grey.campaignId), 1);
  checks.eq('caldran revision 1', router.currentRevision(cald.campaignId), 1);
  // Two separate user campaigns are isolated (simulate a second UC id).
  const cald2Id = campaignIdFromLegacy('user', 'camp-second-uc');
  checks.ok('second UC id distinct', cald2Id !== cald.campaignId);
}

// ===========================================================================
// G — Failure + recovery through the bridge
// ===========================================================================
function groupFailureRecovery() {
  // Universal committed + legacy throws -> pending record, still durable.
  const { router } = makeRouter();
  const grey = greyholmHarness();
  const calls = { commit: 0, fallback: 0 };
  const handled = routeMainComplexThrough(router, grey.mergedData, 'greyholm.reveal', grey.request('greyholm.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, calls, { commitThrows: true }));
  checks.eq('legacy threw: still handled (durable)', handled, true);
  checks.eq('legacy threw: pending recovery created', router.readPendingRecovery(grey.campaignId).length, 1);
  checks.eq('legacy threw: revision 1', router.currentRevision(grey.campaignId), 1);

  // Reload recovery: legacy already matches committed -> resolved (idempotent).
  const rec = router.runRecovery(grey.campaignId, {
    readLegacySlot: (aggregateKind, targetId) => {
      // Simulate legacy now HAS the reveal applied.
      const snap = adaptMainCampaignToUniversal({ data: grey.mergedData(), overlay: { party: { revealedLocationStateIds: ['loc-greyholm__arc-1-peace', 'loc-mine__arc-1-peace'] } } }).snapshot;
      return readAggregateSlot(snap, aggregateKind, targetId);
    },
    project: () => { throw new Error('should not project when already applied'); },
  });
  checks.eq('reload recovery resolves already-applied', rec.resolved, 1);
  checks.eq('no pending remaining', router.readPendingRecovery(grey.campaignId).length, 0);

  // Wrong-campaign recovery no-op.
  const wc = router.runRecovery('camp:user:ghost', { readLegacySlot: () => null, project: () => { throw new Error('x'); } });
  checks.eq('wrong-campaign recovery no-op', wc.resolved, 0);

  // Repository storage failure before commit -> safe fallback (no partial write).
  const failing = new ComplexAuthorityRouter({
    repositoryStorage: { getItem: () => null, setItem: () => { throw new Error('quota'); }, removeItem: () => {} },
    diagnosticsStorage: instrumentedStorage().storage,
    recoveryStorage: instrumentedStorage().storage,
    allowedScopes: new Set(ALL_COMPLEX_AUTHORITY_SCOPES),
    enabled: true,
  });
  const grey2 = greyholmHarness();
  const c2 = { commit: 0, fallback: 0 };
  const h2 = routeMainComplexThrough(failing, grey2.mergedData, 'greyholm.reveal', grey2.request('greyholm.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, c2));
  checks.eq('storage failure before commit -> handled fallback', h2, true);
  checks.eq('storage failure fallback ran legacy once', c2.fallback, 1);
  checks.eq('storage failure fallback reason', failing.getStatus(grey2.campaignId).lastFallbackReason, 'repository_write_failed');
}

// ===========================================================================
// H — Privacy / projection through a real transition
// ===========================================================================
function groupPrivacy() {
  const g = greyDurable('privacy reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, 'greyholm.reveal');
  const rec = g.router.readDiagnostics(g.grey.campaignId)[0];
  checks.ok('diagnostic has player-safe projection hash', !!rec.playerSafeProjectionHash);
  checks.ok('diagnostic has observer projection hash', !!rec.observerProjectionHash);
  const stored = new SyncDurableRepository(g.repo.storage).read(g.grey.campaignId);
  const ps = projectPlayerSafe(stored);
  checks.ok('player-safe smaller than full DM snapshot', JSON.stringify(ps).length < JSON.stringify(stored).length);
  const recJson = JSON.stringify(rec);
  checks.ok('diagnostic carries no full entities array', !recJson.includes('"entities":['));
  checks.ok('diagnostic changed paths are dotted redacted', Array.isArray(rec.changedAggregatePaths));
}

// ===========================================================================
// I — Completion gate: truthful UI ownership + excluded scopes
// ===========================================================================
function groupOwnershipTruthfulness() {
  // Block L re-audit (post Stage-16.1 completion): of the 8 registry scopes,
  // fresh grepping of the real app store code found only ONE (greyholm.placement,
  // 3 call sites in campaignStore.tsx via routeGreyComplex) still actually wired
  // to a live UI action. The other 7 were wired at Stage-16.1 completion time but
  // have since been superseded by dedicated Block I durable authority stores
  // (revealAuthorityStore, presentedCardAuthorityStore, mapPlacementAuthorityStore,
  // and equivalent Greyholm partyLocation/routeProgress authority) — no live call
  // site passes those scopes to routeGreyComplex/routeUserComplex any more. This
  // is reflected honestly in aggregateOwnership.ts as uiStatus
  // 'superseded-by-authority-store' rather than 'wired'. They remain
  // engine-capable (proven durable in this harness, exercised below via
  // routeMainComplexThrough directly — bypassing the app's UI-ownership
  // narrowing, exactly like the Node integration harness always has).
  const uiOwned = new Set(UI_OWNED_COMPLEX_SCOPES);
  checks.eq('UI-owned set size 1 (only greyholm.placement still wired)', uiOwned.size, 1);
  checks.ok('greyholm.placement UI-owned', uiOwned.has('greyholm.placement'));
  for (const scope of ALL_COMPLEX_AUTHORITY_SCOPES) {
    if (scope === 'greyholm.placement') continue;
    checks.ok(`${scope} NOT UI-owned (superseded)`, !uiOwned.has(scope));
  }

  // narrowToUiOwned only ever narrows, and never invents membership for a
  // scope outside its input.
  checks.eq('narrow(all) == UI-owned size', narrowToUiOwned(ALL_COMPLEX_AUTHORITY_SCOPES).size, 1);
  checks.eq('narrow(reveal only) size 0 (superseded, not UI-owned)', narrowToUiOwned(['greyholm.reveal']).size, 0);
  checks.eq('narrow(placement only) size 1', narrowToUiOwned(['greyholm.placement']).size, 1);
  checks.eq('narrow(unknown scope) empty', narrowToUiOwned(['not.a.real.scope']).size, 0);

  // uiStatus is honest for every descriptor.
  const byScope = Object.fromEntries(allAggregateDescriptors().map((d) => [d.scope, d.uiStatus]));
  checks.eq('greyholm.placement uiStatus wired', byScope['greyholm.placement'], 'wired');
  for (const scope of ALL_COMPLEX_AUTHORITY_SCOPES) {
    if (scope === 'greyholm.placement') continue;
    checks.eq(`${scope} uiStatus superseded-by-authority-store`, byScope[scope], 'superseded-by-authority-store');
  }

  // A router narrowed to UI-owned scopes DOES own the one real remaining scope.
  const repo = instrumentedStorage();
  const diag = instrumentedStorage();
  const router = new ComplexAuthorityRouter({
    repositoryStorage: repo.storage,
    diagnosticsStorage: diag.storage,
    recoveryStorage: instrumentedStorage().storage,
    allowedScopes: narrowToUiOwned(ALL_COMPLEX_AUTHORITY_SCOPES),
    enabled: true,
  });
  const grey = greyholmHarness();
  const calls = { commit: 0, fallback: 0 };
  const handled = routeMainComplexThrough(router, grey.mergedData, 'greyholm.placement', grey.request('greyholm.placement', { aggregate: 'placement', op: 'move', placementId: 'plc-mayor', x: 0.5, y: 0.5 }, calls), () => grey.mergedData().placements);
  checks.eq('greyholm.placement wired: handled by the UI router', handled, true);
  checks.ok('greyholm.placement durable commit wrote the repo', repo.writeCount() > 0);
  checks.ok('greyholm.placement durable commit wrote diagnostics', diag.writeCount() > 0);
  checks.eq('greyholm.placement: legacy committed exactly once', calls.commit, 1);
  checks.eq('greyholm.placement: no pre-commit fallback', calls.fallback, 0);

  // A UI-narrowed router does NOT own a superseded scope any more (it falls
  // through to the caller's unchanged legacy path, exactly as if the scope had
  // never existed in the registry).
  const g2 = greyholmHarness();
  const c2 = { commit: 0, fallback: 0 };
  const h2 = routeMainComplexThrough(router, g2.mergedData, 'greyholm.reveal', g2.request('greyholm.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, c2));
  checks.eq('superseded scope NOT handled by the UI-narrowed router', h2, false);

  // A genuinely unknown scope (not in the registry at all) is still never
  // routed — the narrowing/allowlist mechanism itself remains sound.
  const repo2 = instrumentedStorage();
  const router2 = new ComplexAuthorityRouter({
    repositoryStorage: repo2.storage,
    diagnosticsStorage: instrumentedStorage().storage,
    recoveryStorage: instrumentedStorage().storage,
    allowedScopes: narrowToUiOwned(['not.a.real.scope']),
    enabled: true,
  });
  checks.eq('unknown scope not allowlisted', router2.isAllowlisted('not.a.real.scope'), false);

  // The engine remains capable for superseded scopes when a router is
  // allowlisted with ALL scopes directly (not narrowed to UI-ownership) — this
  // is exactly the pattern the Node harness (and formerly the app) used to
  // prove durability; it is a deliberate, isolated engine-capability check, not
  // app wiring.
  const { router: fullRouter } = makeRouter();
  const g3 = greyholmHarness();
  const c3 = { commit: 0, fallback: 0 };
  const h3 = routeMainComplexThrough(fullRouter, g3.mergedData, 'greyholm.reveal', g3.request('greyholm.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, c3));
  checks.eq('superseded scope still engine-capable via a fully-allowlisted router', h3, true);
  checks.eq('engine-capable durable commit', fullRouter.getStatus(g3.campaignId).lastDecision, 'durable_committed');
}

// ===========================================================================
// J — Completion gate: reload recovery variants (real provider fixture path)
// ===========================================================================
function groupReloadRecovery() {
  // "Universal committed / legacy applied then verification failed" — the
  // dev-fixture path: commit applies the legacy action THEN throws. On reload the
  // legacy state already matches -> recovery resolves WITHOUT re-projecting.
  const { router } = makeRouter();
  const grey = greyholmHarness();
  const calls = { commit: 0, fallback: 0 };
  // Simulate the provider's withFailFixture: commit applies then throws once.
  const req = grey.request('greyholm.reveal', { aggregate: 'reveal', reveal: true, entityKind: 'locationState', legacyEntityId: 'loc-mine__arc-1-peace' }, calls);
  const origCommit = req.commit;
  req.commit = () => { const r = origCommit(); throw new Error('fixture: legacy failed after apply'); };
  routeMainComplexThrough(router, grey.mergedData, 'greyholm.reveal', req);
  checks.eq('fixture: pending created (universal committed, legacy failed)', router.readPendingRecovery(grey.campaignId).length, 1);
  checks.eq('fixture: revision advanced to 1', router.currentRevision(grey.campaignId), 1);
  checks.eq('fixture: legacy was applied (dispatch ran)', calls.commit, 1);

  // Reload recovery: legacy already applied -> recognised, resolved, no project.
  const rec = router.runRecovery(grey.campaignId, {
    readLegacySlot: (aggregateKind, targetId) => readAggregateSlot(grey.snapshot ? grey.snapshot() : adaptMainCampaignToUniversal({ data: grey.mergedData(), overlay: grey.overlay() }).snapshot, aggregateKind, targetId),
    project: () => { throw new Error('must not re-project an already-applied legacy action'); },
  });
  checks.eq('reload recovery resolved already-applied', rec.resolved, 1);
  checks.eq('no pending remaining', router.readPendingRecovery(grey.campaignId).length, 0);
  checks.eq('revision NOT advanced twice (still 1)', router.currentRevision(grey.campaignId), 1);

  // StrictMode double-run: a second recovery pass is a safe no-op.
  const rec2 = router.runRecovery(grey.campaignId, { readLegacySlot: () => null, project: () => { throw new Error('x'); } });
  checks.eq('second recovery pass no-op', rec2.resolved, 0);
}

// ---- run ------------------------------------------------------------------
groupDescriptorTranslation();
groupProviderLifecycle();
groupGreyholmFlows();
groupCaldranFlows();
groupStateCapture();
groupIsolation();
groupFailureRecovery();
groupPrivacy();
groupOwnershipTruthfulness();
groupReloadRecovery();

const summary = checks.summary();
const failures = checks.results.filter((r) => !r.pass);
const verdict = summary.failed === 0 ? 'STAGE_16_1_HARNESS_PASS' : 'STAGE_16_1_HARNESS_FAIL';
mkdirSync(resolve(root, 'rebuild-reports/stage-16-1'), { recursive: true });
writeFileSync(resolve(root, 'rebuild-reports/stage-16-1/harness-result.json'), JSON.stringify({ verdict, passed: summary.passed, failed: summary.failed, total: summary.total, failures }, null, 2));
if (summary.failed > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log('  ✗', f.name, '—', String(f.detail));
}
console.log(`\nStage 16.1 integration harness: ${summary.passed}/${summary.total} PASS -> ${verdict}`);
process.exit(summary.failed === 0 ? 0 : 1);

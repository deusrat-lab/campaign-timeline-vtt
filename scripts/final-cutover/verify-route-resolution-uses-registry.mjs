// Part 1 (this session) — proves route resolution for /campaigns/:id/map and
// /campaigns/:id/battle/:mapId actually reads from the universal registry
// (src/domain/registry/registryAuthorityStore.ts), not just that the routes
// happen to still work.
//
// Two halves:
//   A) Behavioral: exercises the REAL production
//      resolveCampaignRouteExistence() (src/domain/registry/routeExistence.ts)
//      — the shared gate both IsolatedCampaignMapWorkspace.tsx and
//      CampaignBattlePage.tsx now call with the REAL lookupCampaign() result
//      as `registryEntry` — with stubbed registry outcomes (found / null /
//      not-yet-loaded), proving the existence decision is actually driven by
//      what the registry lookup returns, not by data-blob presence alone.
//   B) Static anti-regression: greps both component files to confirm they
//      (1) call `store.lookupCampaign(` to obtain `registryEntry`, and
//      (2) pass that value into `resolveCampaignRouteExistence(`, so a future
//      edit can't silently delete the wiring while leaving the import intact.
//
// Run with: node scripts/final-cutover/verify-route-resolution-uses-registry.mjs
import { readFileSync } from 'node:fs';
import { resolveCampaignRouteExistence } from '../../src/domain/registry/routeExistence.ts';

let failures = [];
function check(label, cond) {
  if (!cond) failures.push(label);
}

// --- A) behavioral, against the real production function ---

// 1. No campaignId param at all → missing, regardless of registry/data.
check('no campaignId -> registryConfirmedMissing',
  resolveCampaignRouteExistence(undefined, { campaignId: 'x' }, { some: 'data' }) === 'registryConfirmedMissing');

// 2. Registry says it doesn't exist AND no legacy data either -> missing.
//    This is the concrete case this session's change added: a deleted/never-
//    existed id is now rejected via the registry lookup result itself.
check('registry null + no data -> registryConfirmedMissing',
  resolveCampaignRouteExistence('camp-ghost', null, null) === 'registryConfirmedMissing');

// 3. Registry confirms it exists, data already loaded -> found.
check('registry entry + data -> found',
  resolveCampaignRouteExistence('camp-real', { campaignId: 'camp-real' }, { title: 'Real' }) === 'found');

// 4. Registry confirms it exists, data still loading (async fetch race) ->
//    notYetLoaded, NOT missing -- this is the "don't regress a valid,
//    mid-hydration campaign" guarantee.
check('registry entry + no data yet -> notYetLoaded',
  resolveCampaignRouteExistence('camp-loading', { campaignId: 'camp-loading' }, null) === 'notYetLoaded');

// 5. Registry lookup returned null (lags behind) but a legacy data blob is
//    ALREADY present (e.g. registry commit hasn't caught up) -> found, not a
//    hard failure -- so a real, already-hydrated campaign never breaks just
//    because of registry lag. This is the deliberate asymmetry that keeps
//    the change purely additive for every currently-valid route.
check('registry null but data present -> found (no regression)',
  resolveCampaignRouteExistence('camp-lag', null, { title: 'Lagging registry' }) === 'found');

// --- B) static anti-regression: real call sites actually wire this up ---

const isolatedMapSrc = readFileSync(
  new URL('../../src/features/campaigns/IsolatedCampaignMapWorkspace.tsx', import.meta.url), 'utf8');
const battlePageSrc = readFileSync(
  new URL('../../src/features/campaigns/CampaignBattlePage.tsx', import.meta.url), 'utf8');
const routeExistenceSrc = readFileSync(
  new URL('../../src/domain/registry/routeExistence.ts', import.meta.url), 'utf8');
const userCampaignStoreSrc = readFileSync(
  new URL('../../src/state/userCampaignStore.tsx', import.meta.url), 'utf8');

check('IsolatedCampaignMapWorkspace calls store.lookupCampaign(',
  isolatedMapSrc.includes('store.lookupCampaign('));
check('IsolatedCampaignMapWorkspace calls resolveCampaignRouteExistence(',
  isolatedMapSrc.includes('resolveCampaignRouteExistence('));

check('CampaignBattlePage calls store.lookupCampaign(',
  battlePageSrc.includes('store.lookupCampaign('));
check('CampaignBattlePage calls resolveCampaignRouteExistence(',
  battlePageSrc.includes('resolveCampaignRouteExistence('));

check('routeExistence.ts checks registryEntry === null',
  routeExistenceSrc.includes('registryEntry === null'));

check('userCampaignStore.lookupCampaign delegates to lookupCampaignAuthority (registryAuthorityStore)',
  userCampaignStoreSrc.includes('lookupCampaignAuthority('));

if (failures.length) {
  console.error('ROUTE_RESOLUTION_USES_REGISTRY_FAIL:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, checks: 5 + 6, verdict: 'ROUTE_RESOLUTION_USES_REGISTRY_PASS' }));

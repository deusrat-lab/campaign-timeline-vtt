// Stage 12 — shared Campaign Workspace composition harness.
//
// Verifies the PURE composition layer that both legacy stacks now share:
//   - one immutable workspace descriptor contract (campaignId required; no store,
//     repository or full snapshot inside it);
//   - one honest module registry (shared-read-only vs legacy-owned; no write
//     module ever marked universal; audience + kind compatibility);
//   - audience-filtered module slots + navigation (DM-only slots absent for
//     player/observer — privacy applied in the builder, not via CSS);
//   - stack-specific navigation adapters with stable ids and strict campaign
//     scoping (no Greyholm fallback for a user campaign);
//   - the default-off flag semantics (flag off / scope allowlist).
//
// It does NOT touch React, storage, network, universal commands, or the
// production namespace. Deterministic and dependency-free (domain only).
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import {
  buildCampaignWorkspaceDescriptor,
  buildGreyholmNavigation,
  buildUserCampaignNavigation,
  WORKSPACE_MODULE_REGISTRY,
  getWorkspaceModule,
  isSharedReadOnly,
  isWriteCapable,
  moduleAllowsAudience,
  moduleAllowsKind,
  resolveModuleReadScope,
  findWriteModulesMarkedUniversal,
  allWorkspaceModuleIds,
  campaignIdFromLegacy,
  isPilotScope,
} from './.dist/domain/index.js';
import { Checks } from '../stage08/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const checks = new Checks();

const GREY_ID = campaignIdFromLegacy('greyholm', 'main');
const UC_ID = campaignIdFromLegacy('user', 'caldran');
const UC2_ID = campaignIdFromLegacy('user', 'other-campaign');

// ---- Local pure re-implementation of the config flag gate (config.ts is not in
// the domain build). Mirrors isSharedWorkspaceEnabledForKind exactly. ----
function flagGate(enabled, scopes, kind) {
  if (!enabled) return false;
  const t = (scopes ?? '').trim().toLowerCase();
  if (t === '' || t === '*' || t === 'all') return true;
  return t.split(/[\s,]+/).filter(Boolean).includes(kind.toLowerCase());
}

function greyholmDescriptor(audience = 'dm', activeRoute = '/npc') {
  return buildCampaignWorkspaceDescriptor({
    campaignId: GREY_ID,
    campaignKind: 'greyholm',
    title: 'Greyholm',
    subtitle: null,
    audience,
    activeRoute,
    navigationItems: buildGreyholmNavigation(activeRoute, audience),
    requestedModules: [
      'campaign.summary',
      'library.dmList',
      'library.playerSafe',
      'observer.status',
      'runtime.presentation',
      'library.body',
    ],
    status: { hydrated: true, usingLegacyFallback: false, note: null },
  });
}

function ucDescriptor(audience = 'dm', legacyId = 'caldran', kind = 'npc') {
  const activeRoute = `/campaigns/${legacyId}/library/${kind}`;
  return buildCampaignWorkspaceDescriptor({
    campaignId: campaignIdFromLegacy('user', legacyId),
    campaignKind: 'userCampaign',
    title: 'Caldran',
    subtitle: null,
    audience,
    activeRoute,
    navigationItems: buildUserCampaignNavigation(legacyId, kind, activeRoute, audience),
    requestedModules: ['campaign.summary', 'library.playerSafe', 'observer.status', 'library.body'],
    status: { hydrated: true, usingLegacyFallback: false, note: null },
  });
}

const slotIds = (d) => d.moduleSlots.map((s) => s.moduleId);
const navIds = (d) => d.navigationItems.map((n) => n.id);

// ======================================================================
// A. Flag / baseline semantics
// ======================================================================
checks.eq('A1 flag default off (greyholm)', flagGate(false, '', 'greyholm'), false);
checks.eq('A2 flag default off (userCampaign)', flagGate(false, '', 'userCampaign'), false);
checks.eq('A3 flag on, no scope -> both kinds', flagGate(true, '', 'greyholm') && flagGate(true, '', 'userCampaign'), true);
checks.eq('A4 flag on, all -> both', flagGate(true, 'all', 'userCampaign'), true);
checks.eq('A5 flag on, * -> both', flagGate(true, '*', 'greyholm'), true);
checks.eq('A6 scope allowlist narrows to greyholm', flagGate(true, 'greyholm', 'greyholm'), true);
checks.eq('A7 scope allowlist excludes userCampaign', flagGate(true, 'greyholm', 'userCampaign'), false);
checks.eq('A8 unknown scope token cannot enable', flagGate(true, 'bogus', 'greyholm'), false);
checks.eq('A9 flag off ignores scope', flagGate(false, 'greyholm', 'greyholm'), false);
checks.eq('A10 descriptor build is pure (no throw on valid)', typeof greyholmDescriptor() === 'object', true);

// ======================================================================
// B. Workspace descriptor contract
// ======================================================================
checks.throws('B1 campaignId required', () =>
  buildCampaignWorkspaceDescriptor({
    campaignId: '',
    campaignKind: 'greyholm',
    title: 'x',
    audience: 'dm',
    activeRoute: '/npc',
    navigationItems: [],
    requestedModules: [],
    status: { hydrated: true, usingLegacyFallback: false, note: null },
  }),
);
{
  const d = greyholmDescriptor();
  checks.eq('B2 campaignKind explicit', d.campaignKind, 'greyholm');
  checks.eq('B3 audience explicit', d.audience, 'dm');
  checks.eq('B4 descriptor frozen (immutable)', Object.isFrozen(d), true);
  checks.eq('B5 moduleSlots frozen', Object.isFrozen(d.moduleSlots), true);
  checks.eq('B6 nav frozen', Object.isFrozen(d.navigationItems), true);
  checks.eq('B7 status frozen', Object.isFrozen(d.status), true);
  checks.eq('B8 each slot frozen', d.moduleSlots.every((s) => Object.isFrozen(s)), true);
  checks.eq('B9 no raw store in descriptor', !('store' in d) && !('getData' in d), true);
  checks.eq('B10 no repository in descriptor', !('repository' in d) && !('repo' in d), true);
  checks.eq('B11 no full snapshot in descriptor', !('snapshot' in d) && !('entities' in d), true);
  checks.eq('B12 writes remain legacy flag', d.legacyActionCapabilities.writesRemainLegacy, true);
  checks.eq('B13 universal commands not invoked', d.legacyActionCapabilities.universalCommandsInvoked, false);
  // Stable ids across two builds (nav + module).
  const d2 = greyholmDescriptor();
  checks.eq('B14 stable nav ids across builds', JSON.stringify(navIds(d)), JSON.stringify(navIds(d2)));
  checks.eq('B15 stable module ids across builds', JSON.stringify(slotIds(d)), JSON.stringify(slotIds(d2)));
  // Mutation attempt is rejected (frozen).
  let mutated = false;
  try { d.moduleSlots.push({}); mutated = true; } catch { mutated = false; }
  checks.eq('B16 slots array cannot be mutated', mutated, false);
}

// ======================================================================
// C. Module registry
// ======================================================================
checks.ok('C1 registry non-empty', WORKSPACE_MODULE_REGISTRY.length >= 8);
checks.eq('C2 registry frozen', Object.isFrozen(WORKSPACE_MODULE_REGISTRY), true);
checks.eq('C3 shared-read-only classification present', WORKSPACE_MODULE_REGISTRY.some((e) => e.classification === 'shared-read-only'), true);
checks.eq('C4 legacy-mixed classification present', WORKSPACE_MODULE_REGISTRY.some((e) => e.classification === 'legacy-mixed'), true);
checks.eq('C5 legacy-write classification present', WORKSPACE_MODULE_REGISTRY.some((e) => e.classification === 'legacy-write'), true);
checks.eq('C6 NO write module marked universal', findWriteModulesMarkedUniversal().length, 0);
checks.eq('C7 every shared-read-only has read scope', WORKSPACE_MODULE_REGISTRY.filter(isSharedReadOnly).every((e) => !!e.readScope), true);
checks.eq('C8 every shared-read-only has no writeOwner', WORKSPACE_MODULE_REGISTRY.filter(isSharedReadOnly).every((e) => e.writeOwner === null), true);
checks.eq('C9 every write-capable has writeOwner', WORKSPACE_MODULE_REGISTRY.filter(isWriteCapable).every((e) => !!e.writeOwner), true);
checks.eq('C10 library.body is legacy-mixed', getWorkspaceModule('library.body').classification, 'legacy-mixed');
checks.eq('C11 campaign.summary is shared-read-only', getWorkspaceModule('campaign.summary').classification, 'shared-read-only');
checks.eq('C12 map.workspace legacy-mixed', getWorkspaceModule('map.workspace').classification, 'legacy-mixed');
checks.eq('C13 battle.board legacy-write', getWorkspaceModule('battle.board').classification, 'legacy-write');
checks.eq('C14 settings legacy-write', getWorkspaceModule('settings').classification, 'legacy-write');
checks.eq('C15 importExport legacy-write', getWorkspaceModule('importExport').classification, 'legacy-write');
// read scope resolution
checks.eq('C16 summary scope resolves per greyholm', resolveModuleReadScope(getWorkspaceModule('campaign.summary'), 'greyholm'), 'greyholm.dm.summary');
checks.eq('C17 summary scope resolves per userCampaign', resolveModuleReadScope(getWorkspaceModule('campaign.summary'), 'userCampaign'), 'userCampaign.dm.summary');
checks.eq('C18 playerSafe scope resolves per userCampaign', resolveModuleReadScope(getWorkspaceModule('library.playerSafe'), 'userCampaign'), 'userCampaign.playerSafe.entities');
checks.eq('C19 resolved read scopes are real pilot scopes', WORKSPACE_MODULE_REGISTRY.filter(isSharedReadOnly).every((e) => {
  const g = resolveModuleReadScope(e, e.campaignKinds.includes('greyholm') ? 'greyholm' : 'userCampaign');
  return isPilotScope(g);
}), true);
checks.eq('C20 audience compat helper works', moduleAllowsAudience(getWorkspaceModule('campaign.summary'), 'dm'), true);
checks.eq('C21 campaign.summary not for player', moduleAllowsAudience(getWorkspaceModule('campaign.summary'), 'player'), false);
checks.eq('C22 library.dmList only greyholm kind', moduleAllowsKind(getWorkspaceModule('library.dmList'), 'userCampaign'), false);
checks.eq('C23 library.body allowed both kinds', moduleAllowsKind(getWorkspaceModule('library.body'), 'greyholm') && moduleAllowsKind(getWorkspaceModule('library.body'), 'userCampaign'), true);
checks.eq('C24 allWorkspaceModuleIds returns all', allWorkspaceModuleIds().length, WORKSPACE_MODULE_REGISTRY.length);

// ======================================================================
// D. Greyholm composition
// ======================================================================
{
  const dm = greyholmDescriptor('dm', '/npc');
  const dmSlots = slotIds(dm);
  checks.ok('D1 greyholm DM has >=2 shared-read-only slots', dm.moduleSlots.filter((s) => s.classification === 'shared-read-only').length >= 2);
  checks.ok('D2 greyholm DM includes legacy-mixed library.body', dmSlots.includes('library.body'));
  checks.ok('D3 greyholm DM includes runtime.presentation', dmSlots.includes('runtime.presentation'));
  checks.ok('D4 greyholm DM includes campaign.summary + dmList', dmSlots.includes('campaign.summary') && dmSlots.includes('library.dmList'));
  checks.eq('D5 module order preserved', JSON.stringify(dmSlots), JSON.stringify(['campaign.summary','library.dmList','library.playerSafe','observer.status','runtime.presentation','library.body']));
  checks.eq('D6 active nav = /npc', dm.navigationItems.find((n) => n.active)?.path, '/npc');
  const questsDesc = greyholmDescriptor('dm', '/quests');
  checks.eq('D7 active nav follows route', questsDesc.navigationItems.find((n) => n.active)?.path, '/quests');
  checks.eq('D8 nav labels present', dm.navigationItems.every((n) => n.label.length > 0), true);
}

// ======================================================================
// E. User Campaign composition + isolation
// ======================================================================
{
  const dm = ucDescriptor('dm', 'caldran', 'npc');
  const dmSlots = slotIds(dm);
  checks.ok('E1 UC uses SAME contract type (has moduleSlots+nav)', Array.isArray(dm.moduleSlots) && Array.isArray(dm.navigationItems));
  checks.ok('E2 UC DM has >=2 shared-read-only slots', dm.moduleSlots.filter((s) => s.classification === 'shared-read-only').length >= 2);
  checks.ok('E3 UC DM includes legacy-mixed library.body', dmSlots.includes('library.body'));
  checks.ok('E4 UC does NOT include greyholm-only runtime', !dmSlots.includes('runtime.presentation'));
  checks.ok('E5 UC does NOT include greyholm-only library.dmList', !dmSlots.includes('library.dmList'));
  checks.eq('E6 UC campaignId scoped (caldran)', String(dm.campaignId).includes('caldran') || String(dm.campaignId) === String(UC_ID), true);
  // Two-campaign isolation.
  const a = ucDescriptor('dm', 'caldran', 'npc');
  const b = ucDescriptor('dm', 'other-campaign', 'npc');
  checks.ok('E7 two campaigns get distinct ids', String(a.campaignId) !== String(b.campaignId));
  checks.ok('E8 nav strictly scoped to campaign a', a.navigationItems.every((n) => n.path.includes('/campaigns/caldran')));
  checks.ok('E9 nav strictly scoped to campaign b', b.navigationItems.every((n) => n.path.includes('/campaigns/other-campaign')));
  // No Greyholm fallback: navigation adapter rejects empty id.
  checks.throws('E10 UC nav rejects empty campaignId (no greyholm fallback)', () => buildUserCampaignNavigation('', 'npc', '/x', 'dm'));
  checks.ok('E11 no greyholm path leaks into UC nav', a.navigationItems.every((n) => !['/npc','/enemies','/quests'].includes(n.path)));
}

// ======================================================================
// F. Navigation adapters
// ======================================================================
{
  const gDm = buildGreyholmNavigation('/npc', 'dm');
  const gPlayer = buildGreyholmNavigation('/map', 'player');
  checks.ok('F1 greyholm nav stable ids', gDm.every((n) => n.id.startsWith('gh.')));
  checks.eq('F2 greyholm player nav excludes DM-only npc', gPlayer.some((n) => n.id === 'gh.npc'), false);
  checks.eq('F3 greyholm player nav includes map', gPlayer.some((n) => n.id === 'gh.map'), true);
  const uDm = buildUserCampaignNavigation('caldran', 'npc', '/campaigns/caldran/library/npc', 'dm');
  const uPlayer = buildUserCampaignNavigation('caldran', 'locations', '/campaigns/caldran/library/locations', 'player');
  checks.ok('F4 UC nav stable ids', uDm.every((n) => n.id.startsWith('uc.')));
  checks.eq('F5 UC player nav excludes DM-only npc', uPlayer.some((n) => n.id === 'uc.npc'), false);
  checks.ok('F6 UC player nav paths carry ?as=player', uPlayer.every((n) => n.path.includes('as=player')));
  checks.ok('F7 UC observer nav paths carry observer=1', buildUserCampaignNavigation('caldran', 'npc', '/x', 'observer').every((n) => n.path.includes('observer=1')));
  checks.eq('F8 nav items frozen', Object.isFrozen(gDm[0]), true);
}

// ======================================================================
// G. Privacy (audience filtering in the builder, before render)
// ======================================================================
{
  const player = greyholmDescriptor('player', '/map');
  const observer = greyholmDescriptor('observer', '/observer');
  const pSlots = slotIds(player);
  const oSlots = slotIds(observer);
  checks.eq('G1 player descriptor excludes campaign.summary (DM-only)', pSlots.includes('campaign.summary'), false);
  checks.eq('G2 player descriptor excludes library.dmList (DM-only)', pSlots.includes('library.dmList'), false);
  checks.eq('G3 player descriptor excludes observer.status (DM/observer only)', pSlots.includes('observer.status'), false);
  checks.eq('G4 player descriptor still has playerSafe', pSlots.includes('library.playerSafe'), true);
  checks.eq('G5 player descriptor still has runtime (playerSafe projection)', pSlots.includes('runtime.presentation'), true);
  checks.eq('G6 observer descriptor includes observer.status', oSlots.includes('observer.status'), true);
  checks.eq('G7 observer descriptor excludes campaign.summary (DM-only)', oSlots.includes('campaign.summary'), false);
  // UC privacy
  const ucPlayer = ucDescriptor('player', 'caldran', 'npc');
  checks.eq('G8 UC player excludes DM summary', slotIds(ucPlayer).includes('campaign.summary'), false);
  checks.eq('G9 UC player excludes observer.status', slotIds(ucPlayer).includes('observer.status'), false);
  checks.eq('G10 UC player has playerSafe only among shared', slotIds(ucPlayer).filter((id) => id !== 'library.body').every((id) => id === 'library.playerSafe'), true);
  // no full DM snapshot / secret payload leaks into any descriptor
  const serialized = JSON.stringify(player);
  checks.eq('G11 no getData/store/secret keys in serialized player descriptor', /"store"|"snapshot"|"secret"|"dmNotes"/.test(serialized), false);
  // DM-only nav absent for player
  checks.eq('G12 player nav has no DM-only npc item', player.navigationItems.some((n) => n.id === 'gh.npc'), false);
  // shared-read-only slots for player carry only playerSafe/observer projections (never dm)
  checks.eq('G13 player shared slots never carry dm projection', player.moduleSlots.filter((s) => s.classification === 'shared-read-only').every((s) => s.projection !== 'dm'), true);
}

// ======================================================================
// H. State/route integrity + registry honesty invariants
// ======================================================================
{
  // Selecting a different route only flips active flags, not slot identity.
  const a = greyholmDescriptor('dm', '/npc');
  const b = greyholmDescriptor('dm', '/enemies');
  checks.eq('H1 route change keeps identical slot ids', JSON.stringify(slotIds(a)), JSON.stringify(slotIds(b)));
  checks.eq('H2 route change only moves active nav', b.navigationItems.find((n) => n.active)?.path, '/enemies');
  // requested but kind-incompatible module is silently dropped (not mounted).
  const forced = buildCampaignWorkspaceDescriptor({
    campaignId: UC_ID, campaignKind: 'userCampaign', title: 'x', audience: 'dm', activeRoute: '/x',
    navigationItems: [], requestedModules: ['library.dmList', 'runtime.presentation', 'library.body'],
    status: { hydrated: true, usingLegacyFallback: false, note: null },
  });
  checks.eq('H3 kind-incompatible modules dropped for UC', slotIds(forced).join(','), 'library.body');
  // unknown module id ignored
  const withUnknown = buildCampaignWorkspaceDescriptor({
    campaignId: GREY_ID, campaignKind: 'greyholm', title: 'x', audience: 'dm', activeRoute: '/npc',
    navigationItems: [], requestedModules: ['campaign.summary', 'does.not.exist', 'library.body'],
    status: { hydrated: true, usingLegacyFallback: false, note: null },
  });
  checks.eq('H4 unknown module id ignored', slotIds(withUnknown).join(','), 'campaign.summary,library.body');
  checks.eq('H5 fallback status surfaced honestly', greyholmDescriptor('dm','/npc').status.usingLegacyFallback, false);
  const fb = buildCampaignWorkspaceDescriptor({
    campaignId: GREY_ID, campaignKind: 'greyholm', title: 'x', audience: 'dm', activeRoute: '/npc',
    navigationItems: [], requestedModules: ['library.body'],
    status: { hydrated: false, usingLegacyFallback: true, note: 'shadow off' },
  });
  checks.eq('H6 legacy fallback status not hidden', fb.status.usingLegacyFallback, true);
  checks.eq('H7 status note preserved', fb.status.note, 'shadow off');
}

const summary = checks.summary();
const verdict = summary.ok ? 'STAGE_12_HARNESS_PASS' : 'STAGE_12_HARNESS_FAIL';
console.log('');
for (const r of checks.results.filter((r) => !r.pass)) console.log(`  FAIL: ${r.name} — ${r.detail}`);
console.log(`\nStage 12 harness: ${summary.passed}/${summary.total} PASS -> ${verdict}`);

mkdirSync(resolve(root, 'rebuild-reports/stage-12'), { recursive: true });
writeFileSync(
  resolve(root, 'rebuild-reports/stage-12/harness-results.json'),
  JSON.stringify({ verdict, summary, results: checks.results }, null, 2),
);

if (!summary.ok) process.exit(1);

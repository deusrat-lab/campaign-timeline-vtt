// Stage 8d — Greyholm live overlay and runtime parity completion.
//
// Two independent things:
//   (A) REAL-DATA SEARCH: enumerate + hash every local candidate for a real
//       Greyholm live overlay/runtime source and classify it. Conclusion drives
//       the honest verdict — no synthetic data is ever counted as real parity.
//   (B) CONTRACT COVERAGE: run a clearly-labeled synthetic overlay fixture
//       through the full MC runtime pipeline so the adapter's runtime/overlay
//       mapping is proven lossless at the CONTRACT level (Stage 8 fed empty
//       overlay and never exercised this).
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { adaptMainCampaignToUniversal } = require('./.dist/domain/adapters/mainCampaignAdapter.js');
const { entityIdFromLegacy } = require('./.dist/domain/adapters/idMapping.js');
const { validateCampaignSnapshot, assertSnapshotPersistable } = require('./.dist/domain/validation/validateCampaignSnapshot.js');
const {
  createShadowCampaignRepository, createProductionCampaignRepository, createMemoryRepositoryStorage,
  UNIVERSAL_PRODUCTION_NAMESPACE,
} = require('./.dist/domain/repository/shadowRepository.js');
const { projectDMWorkspace, projectPlayerSafe, projectObserver } = require('./.dist/domain/projection/projectCampaign.js');

import { Checks, sha256File, stableEqual, hashJson } from './lib.mjs';
import { buildGreyholmOverlayContractInput, CONTRACT_RUNTIME_COLLECTIONS } from './greyholmOverlayFixture.mjs';

const STAGE8D_NAMESPACE = 'campaign-timeline-vtt:universal-shadow:stage-08d';
const reportsDir = resolve(process.cwd(), 'rebuild-reports/stage-08d');
const DOWNLOADS = '/Users/dmitry/Downloads';

function isPlayerVisibleLevel(level) {
  return ['public', 'revealed', 'playerSafe', 'observerVisible', 'presented'].includes(level);
}

// ---- (A) Real-data source search ----------------------------------------
function searchRealSources() {
  const candidates = [
    { path: resolve(process.cwd(), 'src/data/campaignOverlaySnapshot.json'), role: 'promoted MC overlay snapshot' },
    { path: `${DOWNLOADS}/greyholm_region_routes_graph.json`, role: 'route-graph design artifact' },
    { path: resolve(process.cwd(), '../dm-companion/seed-import/campaign-2026-06-25.zip'), role: 'DM Companion campaign export (zip)' },
    { path: resolve(process.cwd(), 'server/src/db.js'), role: 'server overlay store (SQLite) code' },
    { path: resolve(process.cwd(), 'data/campaign.db'), role: 'local server overlay DB' },
  ];
  const findings = [];
  for (const c of candidates) {
    if (!existsSync(c.path)) {
      findings.push({ ...c, exists: false, verdict: 'absent' });
      continue;
    }
    let sha = null, sizeNote = '';
    try { sha = sha256File(c.path); } catch (e) { sizeNote = String(e?.message ?? e); }
    findings.push({ ...c, exists: true, sha256: sha, note: sizeNote });
  }
  return findings;
}

// Classify whether any found source is a real MC live overlay in the adapter's
// MainCampaignOverlayInput shape with non-zero runtime.
function classifyRealOverlay(findings) {
  const promoted = findings.find((f) => f.path.endsWith('campaignOverlaySnapshot.json'));
  let promotedIsEmpty = true;
  if (promoted?.exists) {
    // Empty {} is 3 bytes; treat non-empty object as a real overlay.
    const { readFileSync } = require('node:fs');
    try {
      const parsed = JSON.parse(readFileSync(promoted.path, 'utf8'));
      promotedIsEmpty = !parsed || typeof parsed !== 'object' || Object.keys(parsed).length === 0;
    } catch { promotedIsEmpty = true; }
  }
  return {
    realMcOverlayFound: promoted?.exists === true && promotedIsEmpty === false,
    promotedOverlayEmpty: promotedIsEmpty,
    notes: [
      'campaignOverlaySnapshot.json is {} (empty) in this clone and in every git revision of both clones.',
      'greyholm_region_routes_graph.json is a {canvas,nodes,routes,adjacency} design graph, NOT MainCampaignOverlayInput; it carries no worldMapStates/party/activeBattle/reveal runtime.',
      'DM Companion campaign zip contains combat-state.json (real battle runtime) but the DM Companion adapter (adaptDmCompanionToUniversal) is DURABLE-ONLY — it has no overlay/runtime/battle input fields, so there is no universal adapter path that consumes it.',
      'The real MC overlay lives only in browser localStorage key `campaign-timeline-vtt:overlay:v2` and the production server SQLite (server/src/db.js, ./data/campaign.db) — no local ./data/campaign.db exists and the browser store is not accessible read-only here.',
    ],
  };
}

// ---- (B) Contract coverage of the MC runtime/overlay pipeline ------------
async function runContractFixture(checks) {
  const input = buildGreyholmOverlayContractInput();
  // Freeze inputs to detect any adapter mutation of the source.
  const before = hashJson(input);

  const result = adaptMainCampaignToUniversal(input);
  const snap = result.snapshot;
  checks.ok('contract: adapter produced snapshot', !!snap);
  checks.ok('contract: source object not mutated by adapter', hashJson(input) === before, 'adapter mutated its input');

  const validation = validateCampaignSnapshot(snap);
  checks.ok('contract: snapshot passes hardened validation', validation.ok, JSON.stringify(validation.issues.filter((i) => i.severity === 'error').slice(0, 6)));
  checks.ok('contract: assertSnapshotPersistable does not throw', (() => { try { assertSnapshotPersistable(snap); return true; } catch { return false; } })());

  // ---- runtime collection coverage (each must be non-zero / present) ----
  const battles = Object.values(snap.runtime.battles);
  const activeBattle = battles[0];
  const cov = {
    'party.position': !!snap.runtime.party.currentMapPosition,
    'party.routeProgress': !!snap.runtime.party.routeProgress,
    reveal: Object.keys(snap.visibility.entities).length,
    movableEntities: Object.keys(snap.durable.extensions?.movableEntitiesById ?? {}).length,
    campaignEvents: Object.keys(snap.durable.timeline?.eventsById ?? {}).length,
    delayedTriggers: Object.keys(snap.durable.timeline?.triggersById ?? {}).length,
    factionZones: Object.keys(snap.durable.extensions?.factionZonesById ?? {}).length,
    dynamicOverlays: Object.keys(snap.durable.extensions?.dynamicMapOverlaysById ?? {}).length,
    battleEntries: snap.durable.battleEntries.length,
    activeBattle: battles.length,
    tokens: activeBattle ? activeBattle.board.tokens.length : 0,
    initiative: activeBattle && activeBattle.initiative && Number.isFinite(activeBattle.initiative.round) ? 1 : 0,
    round: activeBattle?.initiative?.round ?? 0,
    currentTurn: activeBattle?.initiative?.currentTurnTokenId ? 1 : 0,
    terrain: activeBattle ? activeBattle.board.terrain.length : 0,
    presentedCard: snap.runtime.presentation.presentedCard ? 1 : 0,
  };
  for (const name of CONTRACT_RUNTIME_COLLECTIONS) {
    checks.ok(`contract: runtime collection non-zero — ${name}`, (cov[name] ?? 0) > 0 || cov[name] === true, `value=${JSON.stringify(cov[name])}`);
  }

  // ---- identity / reference resolution ----
  const entityIds = new Set(snap.durable.entities.map((e) => e.id));
  checks.ok('contract: reveal target resolves to a real entity', Object.keys(snap.visibility.entities).every((k) => entityIds.has(k)));
  checks.ok('contract: presentedCard entityRef resolves', entityIds.has(snap.runtime.presentation.presentedCard.entityRef));
  const be = snap.durable.battleEntries[0];
  checks.ok('contract: battleEntry.battleMapRef resolves to a unique durable battleMap',
    snap.durable.battleMaps.filter((m) => m.id === be.battleMapRef).length === 1);
  checks.ok('contract: active battle tokens map to source entities',
    activeBattle.board.tokens.every((t) => !t.sourceEntityRef || entityIds.has(t.sourceEntityRef)));
  checks.ok('contract: active battle preserves round + current turn', activeBattle.initiative.round === 2 && activeBattle.initiative.currentTurnTokenId === 'cmb-kira');
  checks.ok('contract: active battle preserves all 3 tokens + terrain', activeBattle.board.tokens.length === 3 && activeBattle.board.terrain.length === 2);
  const mv = snap.durable.extensions.movableEntitiesById['mv-1'];
  checks.ok('contract: movable entity preserved with coordinates', mv && mv.currentPosition.x === 0.5 && mv.currentPosition.y === 0.5);

  // ---- shadow save -> reload -> round-trip ----
  const storage = createMemoryRepositoryStorage();
  const repo = createShadowCampaignRepository(storage, STAGE8D_NAMESPACE);
  let reloaded = null, saveErr = null;
  try { await repo.createCampaign(snap); reloaded = await repo.readCampaign(snap.metadata.campaignId); } catch (e) { saveErr = e; }
  checks.ok('contract: shadow save + reload succeeded', !!reloaded && !saveErr, String(saveErr?.message ?? 'no reload'));
  if (reloaded) {
    checks.ok('contract: round-trip lossless (durable+runtime+visibility)', stableEqual({ ...snap, revision: 1 }, reloaded));
    checks.ok('contract: reloaded re-validates', validateCampaignSnapshot(reloaded).ok);
    checks.ok('contract: deterministic serialization', hashJson(reloaded) === hashJson({ ...snap, revision: 1 }));
  }

  // ---- projections + privacy ----
  const dm = projectDMWorkspace(snap);
  const player = projectPlayerSafe(snap);
  const observer = projectObserver(snap);
  checks.eq('contract: DM projection includes all entities', dm.entities.length, snap.durable.entities.length);
  const playerJson = JSON.stringify(player);
  const observerJson = JSON.stringify(observer);
  const noDmNotesField = player.entities.every((c) => !Object.prototype.hasOwnProperty.call(c, 'dmNotes'));
  checks.ok('contract: PlayerSafe cards carry no dmNotes field', noDmNotesField);
  const hiddenSecrets = snap.durable.entities
    .filter((e) => !isPlayerVisibleLevel(e.visibility.level) && typeof e.dmNotes === 'string' && e.dmNotes.length >= 10)
    .map((e) => e.dmNotes);
  const leakP = hiddenSecrets.filter((s) => playerJson.includes(s));
  const leakO = hiddenSecrets.filter((s) => observerJson.includes(s));
  checks.ok('contract: PlayerSafe leaks no hidden DM notes', leakP.length === 0, JSON.stringify(leakP));
  checks.ok('contract: Observer leaks no hidden DM notes', leakO.length === 0, JSON.stringify(leakO));
  // hidden battle-entry dmNotes must never appear (battleEntries are DM-only planning)
  checks.ok('contract: hidden battleEntry dmNotes not in PlayerSafe/Observer', !playerJson.includes('SECRET tactics') && !observerJson.includes('SECRET tactics'));
  // hidden image source not exposed
  checks.ok('contract: hidden image src not in PlayerSafe', !playerJson.includes('/img/relic.png'));
  // hidden location secret not exposed
  checks.ok('contract: hidden locationState secret not in PlayerSafe', !playerJson.includes('goblin warren'));

  // ---- namespace isolation ----
  const prod = createProductionCampaignRepository(storage);
  const fromProd = await prod.readCampaign(snap.metadata.campaignId);
  checks.ok('contract: production namespace cannot read stage-08d shadow campaign', fromProd === null);
  checks.ok('contract: no production namespace keys written', !storage.keys().some((k) => k.startsWith(`${UNIVERSAL_PRODUCTION_NAMESPACE}:`)));

  return { coverage: cov, adapterDiagnosticsErrors: result.diagnostics.filter((d) => d.severity === 'error').length };
}

async function main() {
  mkdirSync(reportsDir, { recursive: true });
  const checks = new Checks();

  const findings = searchRealSources();
  const classification = classifyRealOverlay(findings);
  const contract = await runContractFixture(checks);

  const summary = checks.summary();
  // Real MC live overlay/runtime parity is NOT proven (no real source). Contract
  // coverage passing does not upgrade this — synthetic fixtures never count as
  // real-data parity.
  const verdict = classification.realMcOverlayFound
    ? (summary.ok ? 'STAGE_8_PASS' : 'STAGE_8D_FAILED')
    : 'STAGE_8_PASS_WITH_WARNINGS';

  const undocedCapabilities = classification.realMcOverlayFound ? [] : [
    'worldMaps / worldMapStates (real MC map runtime)', 'locationStates', 'hotspots', 'placements',
    'party position + current route state', 'timeline / calendar / current campaign time',
    'reveal (revealedLocationStateIds)', 'movable entities', 'campaign events', 'delayed triggers',
    'faction zones', 'dynamic overlays', 'observer focus', 'presented card', 'active battle runtime',
    'tokens / initiative / round / current turn',
  ];

  const results = {
    stage: 'stage-08d',
    verdict,
    generatedAt: new Date(0).toISOString(),
    checks: summary,
    failing: checks.results.filter((r) => !r.pass),
    realDataSearch: { findings, classification },
    contractCoverage: {
      note: 'SYNTHETIC contract fixture — proves MC runtime/overlay mapping is lossless at the contract level, NOT real-data parity.',
      coverage: contract.coverage,
      adapterDiagnosticErrors: contract.adapterDiagnosticsErrors,
    },
    undocedRealRuntimeCapabilities: undocedCapabilities,
    manualExportInstructions: [
      'To obtain a REAL Greyholm overlay without modifying any data:',
      '1. Open the campaign-timeline-vtt app in the DM browser (the one holding the live campaign).',
      '2. Use the in-app export (NavBar "Export"/download overlay JSON) which serializes store.exportOverlay() — this only READS state, it writes nothing back.',
      '   Alternatively, in DevTools console (read-only): copy(localStorage.getItem("campaign-timeline-vtt:overlay:v2")) and paste into a new file.',
      '3. Save the file locally (e.g. campaign-timeline-vtt-export.json). Do NOT run snapshot:promote against the live src/data (that would edit tracked state) — instead drop the file under scripts/stage08/fixtures/ as an immutable Stage 8d fixture.',
      '4. Re-run this harness pointing at that fixture to convert PASS_WITH_WARNINGS into full real-data PASS.',
    ],
  };
  writeFileSync(resolve(reportsDir, 'RESULTS.json'), JSON.stringify(results, null, 2));

  console.log(`Stage 8d verdict: ${verdict}`);
  console.log(`Contract checks: ${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
  console.log(`Real MC overlay found: ${classification.realMcOverlayFound}`);
  if (summary.failed) {
    for (const r of checks.results.filter((x) => !x.pass)) console.log(`  FAIL - ${r.name}: ${r.detail}`);
  }
  // Exit non-zero only if the CONTRACT checks fail (a real regression). Absence
  // of a real overlay is an expected WARNINGS state, not a harness failure.
  process.exit(summary.ok ? 0 : 1);
}

main().catch((e) => { console.error('Stage 8d harness crashed:', e); process.exit(2); });

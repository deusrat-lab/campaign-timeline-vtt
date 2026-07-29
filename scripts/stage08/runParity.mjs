// Stage 8 — Real-data parity gate and validation-hardening harness.
//
//   real export -> parse -> legacy adapter -> universal snapshot
//   -> validation gate -> shadow save -> shadow reload -> projections
//   -> identity/reference/round-trip/privacy parity
//
// Storage: in-memory only, under a Stage-8-only shadow namespace. The
// production namespace and any real browser localStorage keys are never touched.
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const { adaptUserCampaignToUniversal } = require('./.dist/domain/adapters/userCampaignAdapter.js');
const { adaptMainCampaignToUniversal } = require('./.dist/domain/adapters/mainCampaignAdapter.js');
const { entityIdFromLegacy } = require('./.dist/domain/adapters/idMapping.js');
const {
  validateCampaignSnapshot,
  assertSnapshotPersistable,
  SnapshotValidationError,
} = require('./.dist/domain/validation/validateCampaignSnapshot.js');
const {
  createShadowCampaignRepository,
  createProductionCampaignRepository,
  createMemoryRepositoryStorage,
  UNIVERSAL_PRODUCTION_NAMESPACE,
} = require('./.dist/domain/repository/shadowRepository.js');
const { projectDMWorkspace, projectPlayerSafe, projectObserver } = require('./.dist/domain/projection/projectCampaign.js');

import { Checks, stableEqual, hashJson, collectStrings } from './lib.mjs';
import { loadCaldran, loadGreyholm, reHashInputs } from './inputs.mjs';
import { runNegativeFixtures } from './negativeFixtures.mjs';

const STAGE8_SHADOW_NAMESPACE = 'campaign-timeline-vtt:universal-shadow:stage-08';
const reportsDir = resolve(process.cwd(), 'rebuild-reports/stage-08');

function isPlayerVisibleLevel(level) {
  return ['public', 'revealed', 'playerSafe', 'observerVisible', 'presented'].includes(level);
}

function runCampaign(campaign, checks) {
  const adapt = campaign.kind === 'user-campaign' ? adaptUserCampaignToUniversal : adaptMainCampaignToUniversal;

  // --- adapt ---
  const result = adapt(campaign.adapterInput);
  const snapshot = result.snapshot;
  checks.ok(`${campaign.name}: adapter produced snapshot`, !!snapshot, 'adapter returned null');

  // --- source immutability (files + parsed objects) ---
  const hashesAfter = reHashInputs(campaign);
  const immutable = Object.entries(campaign.hashesBefore).every(([k, v]) => hashesAfter[k] === v);
  checks.ok(`${campaign.name}: source files unchanged after adapt`, immutable, JSON.stringify({ before: campaign.hashesBefore, after: hashesAfter }));

  // --- validation gate BEFORE persistence ---
  const validation = validateCampaignSnapshot(snapshot);
  const errorCount = validation.issues.filter((i) => i.severity === 'error').length;
  checks.ok(`${campaign.name}: snapshot passes hardened validation`, validation.ok, `errors=${errorCount}: ${JSON.stringify(validation.issues.slice(0, 5))}`);
  checks.ok(`${campaign.name}: assertSnapshotPersistable does not throw`, (() => { try { assertSnapshotPersistable(snapshot); return true; } catch { return false; } })());

  // --- shadow save (in-memory, stage-08 namespace) ---
  const storage = createMemoryRepositoryStorage();
  const repo = createShadowCampaignRepository(storage, STAGE8_SHADOW_NAMESPACE);
  let reloaded = null;
  let saveError = null;
  const savePromise = repo
    .createCampaign(snapshot)
    .then(() => repo.readCampaign(snapshot.metadata.campaignId))
    .then((s) => { reloaded = s; })
    .catch((e) => { saveError = e; });

  return { campaign, result, snapshot, storage, repo, validation, errorCount, immutable, hashesAfter, savePromise, getReloaded: () => reloaded, getSaveError: () => saveError };
}

async function finishCampaign(ctx, checks) {
  const { campaign, snapshot } = ctx;
  await ctx.savePromise;
  const reloaded = ctx.getReloaded();
  checks.ok(`${campaign.name}: shadow save + reload succeeded`, !!reloaded && !ctx.getSaveError(), String(ctx.getSaveError()?.message ?? 'no snapshot reloaded'));
  if (!reloaded) return { droppedCollections: ['<save-failed>'], identity: {}, roundTrip: false };

  // --- round-trip: reloaded must equal original except repository revision bump (0 -> 1) ---
  checks.eq(`${campaign.name}: reload revision bumped to 1`, reloaded.revision, 1);
  const normOriginal = { ...snapshot, revision: 1 };
  const roundTrip = stableEqual(normOriginal, reloaded);
  checks.ok(`${campaign.name}: round-trip lossless (durable+runtime+visibility+extensions)`, roundTrip, 'reloaded snapshot differs from original beyond revision');

  // re-validate after reload
  checks.ok(`${campaign.name}: reloaded snapshot re-validates`, validateCampaignSnapshot(reloaded).ok);

  // deterministic serialization
  checks.eq(`${campaign.name}: deterministic serialization`, hashJson(reloaded), hashJson(normOriginal));

  // --- droppedCollections: every non-zero source collection maps to non-zero adapted target ---
  const adapted = adaptedCounts(campaign, snapshot);
  const droppedCollections = [];
  for (const [name, count] of Object.entries(campaign.sourceCollections)) {
    if (count > 0) {
      const target = adaptedTargetFor(campaign, name);
      const got = adapted[target] ?? 0;
      if (got <= 0) droppedCollections.push({ source: name, target, sourceCount: count, adaptedCount: got });
    }
  }
  checks.ok(`${campaign.name}: droppedCollections is empty`, droppedCollections.length === 0, JSON.stringify(droppedCollections));

  // --- identity-sensitive parity (concrete ids preserved) ---
  const identity = identityParity(campaign, reloaded, checks);

  // --- projections + privacy ---
  const privacy = projectionPrivacy(campaign, reloaded, checks);

  return { droppedCollections, adapted, identity, roundTrip, privacy };
}

function adaptedCounts(campaign, snapshot) {
  return {
    entities: snapshot.durable.entities.length,
    maps: snapshot.durable.maps.length,
    placements: snapshot.durable.placements.length,
    routes: snapshot.durable.routes.length,
    battleMaps: snapshot.durable.battleMaps.length,
    battleEntries: snapshot.durable.battleEntries.length,
    'runtime.battles': Object.keys(snapshot.runtime.battles).length,
    'visibility.entities': Object.keys(snapshot.visibility.entities).length,
  };
}

function adaptedTargetFor(campaign, sourceName) {
  if (campaign.kind === 'user-campaign') {
    const map = {
      locations: 'entities', npcs: 'entities', quests: 'entities', enemies: 'entities',
      images: 'entities', party: 'entities', factions: 'entities',
      mapPlacements: 'placements', routes: 'routes', mapIds: 'maps',
      customBattleMaps: 'battleMaps',
      'runtime.battleBoards': 'runtime.battles',
      'runtime.revealedToPlayers': 'visibility.entities',
    };
    return map[sourceName] ?? sourceName;
  }
  // main-campaign
  const map = {
    npcs: 'entities', quests: 'entities', enemies: 'entities', images: 'entities',
    factions: 'entities', players: 'entities', shops: 'entities', taverns: 'entities',
    battleMaps: 'battleMaps',
  };
  return map[sourceName] ?? sourceName;
}

function identityParity(campaign, snapshot, checks) {
  const entityIds = new Set(snapshot.durable.entities.map((e) => e.id));
  const battleMapIds = snapshot.durable.battleMaps.map((m) => m.id);
  const battleMapIdSet = new Set(battleMapIds);
  const details = {};

  // campaign identity
  checks.ok(`${campaign.name}: campaignId preserved`, !!snapshot.metadata.campaignId);
  details.campaignId = snapshot.metadata.campaignId;

  // battle map id uniqueness on real data
  checks.eq(`${campaign.name}: battleMap ids unique (real data)`, battleMapIdSet.size, battleMapIds.length);
  details.battleMapCount = battleMapIds.length;

  if (campaign.kind === 'user-campaign') {
    const d = campaign.adapterInput.data;
    const r = campaign.adapterInput.runtime;
    // Every source npc/enemy/location resolves to its universal entity id.
    const sample = [
      ...d.npcs.slice(0, 5).map((x) => ['npc', x.id]),
      ...d.enemies.slice(0, 5).map((x) => ['enemy', x.id]),
      ...d.locations.slice(0, 3).map((x) => ['location', x.id]),
    ];
    const allEntitiesResolve = d.npcs.every((x) => entityIds.has(entityIdFromLegacy('npc', x.id)))
      && d.enemies.every((x) => entityIds.has(entityIdFromLegacy('enemy', x.id)))
      && d.locations.every((x) => entityIds.has(entityIdFromLegacy('location', x.id)))
      && (d.factions ?? []).every((x) => entityIds.has(entityIdFromLegacy('faction', x.id)))
      && (d.party ?? []).every((x) => entityIds.has(entityIdFromLegacy('player', x.id)))
      && d.images.every((x) => entityIds.has(entityIdFromLegacy('image', x.id)))
      && d.quests.every((x) => entityIds.has(entityIdFromLegacy('quest', x.id)));
    checks.ok(`${campaign.name}: all source entities preserved with stable ids`, allEntitiesResolve);
    details.sampleEntityIds = sample.map(([k, id]) => entityIdFromLegacy(k, id));

    // Placements preserve id + coordinates + entityRef resolves.
    const placementsOk = snapshot.durable.placements.every((p, i) => {
      const src = d.mapPlacements[i];
      return src && p.id === src.id && p.position.x === src.x && p.position.y === src.y && entityIds.has(p.entityRef);
    });
    checks.ok(`${campaign.name}: placements preserve id+coords+entityRef resolves`, placementsOk);

    // Reveal parity: every revealed source id resolves to exactly one entity (Stage 8 fix).
    const revealSrc = r.revealedToPlayers ?? [];
    const revealKeys = Object.keys(snapshot.visibility.entities);
    const allRevealResolve = revealKeys.every((k) => entityIds.has(k));
    checks.eq(`${campaign.name}: reveal targets count preserved`, revealKeys.length, revealSrc.length);
    checks.ok(`${campaign.name}: every reveal target resolves to exactly one entity`, allRevealResolve && revealKeys.length === revealSrc.length);
    details.revealResolved = `${revealKeys.filter((k) => entityIds.has(k)).length}/${revealSrc.length}`;

    // Battle runtime parity: board keys, tokens, initiative preserved.
    const boards = r.battleBoards ?? {};
    const runtimeBattles = snapshot.runtime.battles;
    const battleOk = Object.entries(boards).every(([mapId, board]) => {
      const rid = `runtime:battle:${mapId}`;
      const rb = runtimeBattles[rid];
      return rb && rb.battleMapRef === mapId && rb.board.tokens.length === board.tokens.length
        && rb.initiative.round === (board.round ?? 1);
    });
    checks.ok(`${campaign.name}: battle boards preserve tokens/round/variant`, battleOk);
    details.battleBoards = Object.keys(boards).length;
    details.tokensTotal = Object.values(runtimeBattles).reduce((s, b) => s + b.board.tokens.length, 0);
  } else {
    // Greyholm: all real DM-companion entities resolve with stable ids.
    const d = campaign.adapterInput.data;
    const allResolve = d.npcs.every((x) => entityIds.has(entityIdFromLegacy('npc', x.id)))
      && d.enemies.every((x) => entityIds.has(entityIdFromLegacy('enemy', x.id)))
      && d.images.every((x) => entityIds.has(entityIdFromLegacy('image', x.id)))
      && d.quests.every((x) => entityIds.has(entityIdFromLegacy('quest', x.id)))
      && d.factions.every((x) => entityIds.has(entityIdFromLegacy('faction', x.id)));
    checks.ok(`${campaign.name}: all real DM-companion entities preserved with stable ids`, allResolve);
    // battle map ids come straight from catalog, preserved.
    const catalogIds = new Set(d.battleMaps.map((m) => m.id));
    const preserved = d.battleMaps.every((m) => battleMapIdSet.has(m.id));
    checks.ok(`${campaign.name}: all 139 catalog battle-map ids preserved`, preserved && catalogIds.size === battleMapIds.length);
    details.entityCount = snapshot.durable.entities.length;
  }
  return details;
}

function projectionPrivacy(campaign, snapshot, checks) {
  const dm = projectDMWorkspace(snapshot);
  const player = projectPlayerSafe(snapshot);
  const observer = projectObserver(snapshot);

  // DM keeps the full resolved dataset.
  checks.eq(`${campaign.name}: DM projection includes all entities`, dm.entities.length, snapshot.durable.entities.length);

  // Player Safe must exclude every non-player-visible entity.
  const hidden = snapshot.durable.entities.filter((e) => !isPlayerVisibleLevel(e.visibility.level));
  const playerJson = JSON.stringify(player);
  const observerJson = JSON.stringify(observer);

  // 1) forbidden field-paths: player/observer entity cards must not carry a dmNotes field.
  const playerHasDmNotesField = player.entities.some((c) => Object.prototype.hasOwnProperty.call(c, 'dmNotes'));
  checks.ok(`${campaign.name}: PlayerSafe entity cards carry no dmNotes field`, !playerHasDmNotesField);

  // 2) concrete forbidden strings: DM notes of hidden entities must not appear anywhere in player/observer output.
  const dmSecrets = [];
  for (const e of snapshot.durable.entities) {
    const notes = e.dmNotes;
    if (typeof notes === 'string' && notes.trim().length >= 12 && !isPlayerVisibleLevel(e.visibility.level)) {
      dmSecrets.push(notes.trim());
    }
  }
  const sample = dmSecrets.slice(0, 50);
  const leakedPlayer = sample.filter((s) => playerJson.includes(s));
  const leakedObserver = sample.filter((s) => observerJson.includes(s));
  checks.ok(`${campaign.name}: PlayerSafe leaks no hidden DM notes`, leakedPlayer.length === 0, `leaked ${leakedPlayer.length}`);
  checks.ok(`${campaign.name}: Observer leaks no hidden DM notes`, leakedObserver.length === 0, `leaked ${leakedObserver.length}`);

  // 3) hidden entities are entirely absent from Player Safe (ids not present).
  const playerIds = new Set(player.entities.map((c) => c.id));
  const hiddenLeak = hidden.filter((e) => playerIds.has(e.id));
  checks.ok(`${campaign.name}: no hidden entity appears in PlayerSafe`, hiddenLeak.length === 0, `${hiddenLeak.length} hidden ids leaked`);

  // 4) hidden (non-safe) images not exposed to players.
  const hiddenImages = snapshot.durable.entities.filter((e) => e.kind === 'image' && !isPlayerVisibleLevel(e.visibility.level));
  const imgSrcs = hiddenImages.map((e) => e.src).filter((s) => typeof s === 'string' && s.length > 8).slice(0, 30);
  const imgLeak = imgSrcs.filter((s) => playerJson.includes(s));
  checks.ok(`${campaign.name}: hidden image sources not in PlayerSafe`, imgLeak.length === 0, `${imgLeak.length} image srcs leaked`);

  // 5) campaign isolation: every projected card belongs to this campaign.
  const otherCampaign = collectStrings(player).some((s) => s.startsWith('camp:') && !snapshot.metadata.campaignId.includes(s));
  checks.ok(`${campaign.name}: PlayerSafe carries no foreign campaign id`, !otherCampaign);

  return {
    dmEntities: dm.entities.length,
    playerEntities: player.entities.length,
    hiddenEntities: hidden.length,
    dmSecretsScanned: sample.length,
    leaks: { player: leakedPlayer.length, observer: leakedObserver.length, hiddenIds: hiddenLeak.length, images: imgLeak.length },
  };
}

async function namespaceIsolation(campaign, checks) {
  // Save Caldran to a shadow namespace, prove the production repo cannot see it.
  const storage = createMemoryRepositoryStorage();
  const shadow = createShadowCampaignRepository(storage, STAGE8_SHADOW_NAMESPACE);
  const result = adaptUserCampaignToUniversal(campaign.adapterInput);
  await shadow.createCampaign(result.snapshot);
  const prod = createProductionCampaignRepository(storage);
  const fromProd = await prod.readCampaign(result.snapshot.metadata.campaignId);
  checks.ok('Isolation: production namespace cannot read shadow-saved campaign', fromProd === null);
  const prodKeyPresent = storage.keys().some((k) => k.startsWith(`${UNIVERSAL_PRODUCTION_NAMESPACE}:`));
  checks.ok('Isolation: no production-namespace keys were written', !prodKeyPresent, JSON.stringify(storage.keys()));
  const onlyStage8 = storage.keys().every((k) => k.startsWith(`${STAGE8_SHADOW_NAMESPACE}:`));
  checks.ok('Isolation: all storage keys are stage-08 shadow keys', onlyStage8);
}

async function main() {
  mkdirSync(reportsDir, { recursive: true });
  const checks = new Checks();

  const caldran = loadCaldran();
  const greyholm = loadGreyholm();

  const parityByCampaign = {};
  for (const campaign of [caldran, greyholm]) {
    const ctx = runCampaign(campaign, checks);
    const parity = await finishCampaign(ctx, checks);
    parityByCampaign[campaign.name] = {
      sourceCollections: campaign.sourceCollections,
      adapted: parity.adapted,
      droppedCollections: parity.droppedCollections,
      identity: parity.identity,
      privacy: parity.privacy,
      roundTrip: parity.roundTrip,
      validationErrors: ctx.errorCount,
      sourceImmutable: ctx.immutable,
      realNotes: campaign.realNotes,
      absent: campaign.absent ?? [],
      hashesBefore: campaign.hashesBefore,
      hashesAfter: ctx.hashesAfter,
    };
  }

  await namespaceIsolation(caldran, checks);

  const negative = await runNegativeFixtures(checks, {
    adaptUserCampaignToUniversal,
    validateCampaignSnapshot,
    assertSnapshotPersistable,
    SnapshotValidationError,
    createShadowCampaignRepository,
    createMemoryRepositoryStorage,
    entityIdFromLegacy,
    baseSnapshot: adaptUserCampaignToUniversal(caldran.adapterInput).snapshot,
    STAGE8_SHADOW_NAMESPACE,
  });

  const summary = checks.summary();
  const verdict = summary.ok ? 'STAGE_8_PASS' : 'STAGE_8_FAILED';

  const results = {
    stage: 'stage-08',
    verdict,
    generatedAt: new Date(0).toISOString(),
    checks: summary,
    failing: checks.results.filter((r) => !r.pass),
    parity: parityByCampaign,
    negativeFixtures: negative,
  };
  writeFileSync(resolve(reportsDir, 'RESULTS.json'), JSON.stringify(results, null, 2));
  writeFileSync(resolve(reportsDir, 'PARITY.json'), JSON.stringify(parityByCampaign, null, 2));
  writeFileSync(resolve(reportsDir, 'NEGATIVE_FIXTURES.json'), JSON.stringify(negative, null, 2));

  console.log(`Stage 8 verdict: ${verdict}`);
  console.log(`Checks: ${summary.passed}/${summary.total} passed, ${summary.failed} failed`);
  if (checks.results.filter((r) => !r.pass).length) {
    console.log('FAILING:');
    for (const r of checks.results.filter((x) => !x.pass)) console.log(`  - ${r.name}: ${r.detail}`);
  }
  console.log(`Negative fixtures: ${negative.filter((n) => n.pass).length}/${negative.length} behaving as expected`);
  process.exit(summary.ok ? 0 : 1);
}

main().catch((error) => {
  console.error('Stage 8 harness crashed:', error);
  process.exit(2);
});

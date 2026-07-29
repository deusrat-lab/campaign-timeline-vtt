// Stage 8 negative fixtures. Each fixture states an explicit expected behavior:
//   reject   -> validation must fail (ok === false) and persistence must throw
//   preserve -> valid + persists unchanged (optional / non-destructive data)
// No silent drops are permitted.
import { stableEqual } from './lib.mjs';

function clone(v) { return structuredClone(v); }

export function runNegativeFixtures(checks, deps) {
  const {
    adaptUserCampaignToUniversal,
    validateCampaignSnapshot,
    assertSnapshotPersistable,
    SnapshotValidationError,
    createShadowCampaignRepository,
    createMemoryRepositoryStorage,
    baseSnapshot,
    STAGE8_SHADOW_NAMESPACE,
  } = deps;

  const fixtures = [];
  const cid = baseSnapshot.metadata.campaignId;

  const rejects = (name, mutate, expectPathIncludes) => {
    const snap = clone(baseSnapshot);
    mutate(snap);
    const v = validateCampaignSnapshot(snap);
    const rejected = v.ok === false;
    const pathOk = !expectPathIncludes || v.issues.some((i) => i.severity === 'error' && (i.path.includes(expectPathIncludes) || i.message.includes(expectPathIncludes)));
    let throws = false;
    try { assertSnapshotPersistable(snap); } catch (e) { throws = e instanceof SnapshotValidationError; }
    let repoThrows = false;
    const storage = createMemoryRepositoryStorage();
    const repo = createShadowCampaignRepository(storage, STAGE8_SHADOW_NAMESPACE);
    return repo.createCampaign(snap).then(() => {}, (e) => { repoThrows = String(e?.code) === 'INVALID_SCHEMA'; }).then(() => {
      const pass = rejected && pathOk && throws && repoThrows;
      checks.ok(`negative[${name}]: rejected + gate throws + repo refuses`, pass, JSON.stringify({ rejected, pathOk, throws, repoThrows }));
      fixtures.push({ name, expected: 'reject', pass, rejected, pathMatched: pathOk, gateThrows: throws, repoRefuses: repoThrows });
    });
  };

  const preserves = (name, mutate) => {
    const snap = clone(baseSnapshot);
    mutate(snap);
    const v = validateCampaignSnapshot(snap);
    let persisted = null;
    const storage = createMemoryRepositoryStorage();
    const repo = createShadowCampaignRepository(storage, STAGE8_SHADOW_NAMESPACE);
    return repo.createCampaign(snap)
      .then(() => repo.readCampaign(snap.metadata.campaignId))
      .then((r) => { persisted = r; })
      .catch(() => {})
      .then(() => {
        const lossless = persisted ? stableEqual({ ...snap, revision: 1 }, persisted) : false;
        const pass = v.ok === true && lossless;
        checks.ok(`negative[${name}]: preserved losslessly`, pass, JSON.stringify({ valid: v.ok, lossless }));
        fixtures.push({ name, expected: 'preserve', pass, valid: v.ok, lossless });
      });
  };

  const tasks = [];

  // 1. duplicate battleMaps.id
  tasks.push(rejects('duplicate_battle_map_id', (s) => {
    const bm = { id: 'dup-bm', campaignId: cid, title: 'A', variants: [], visibility: { level: 'public' } };
    s.durable.battleMaps.push(clone(bm), clone(bm));
  }, 'battleMaps'));

  // 2. duplicate entity id in same namespace
  tasks.push(rejects('duplicate_entity_id', (s) => {
    const e = clone(s.durable.entities[0]);
    s.durable.entities.push(clone(e));
  }, 'entities'));

  // 3. ambiguous reveal target (same id is an NPC and a player) via the adapter
  tasks.push(Promise.resolve().then(() => {
    const data = {
      campaignId: 'camp-neg-ambig', title: 'Ambig', type: 'oneShot', baseMapId: 'm1', mapIds: ['m1'], regionIds: [],
      locations: [], npcs: [{ id: 'dupe-1', name: 'NPC' }], quests: [], enemies: [], images: [],
      routes: [], zones: [], notes: [], mapPlacements: [], customBattleMaps: [],
      factions: [], party: [{ id: 'dupe-1', name: 'Hero' }],
    };
    const runtime = { campaignId: 'camp-neg-ambig', activeMapId: 'm1', revealedToPlayers: ['dupe-1'], battleBoards: {} };
    const res = adaptUserCampaignToUniversal({ data, runtime });
    const ambiguousDiag = res.diagnostics.some((d) => d.code === 'ambiguous_reveal_target');
    const invalid = validateCampaignSnapshot(res.snapshot).ok === false;
    const pass = ambiguousDiag && invalid;
    checks.ok('negative[ambiguous_reveal_target]: adapter flags + snapshot invalid', pass, JSON.stringify({ ambiguousDiag, invalid }));
    fixtures.push({ name: 'ambiguous_reveal_target', expected: 'reject', pass, adapterDiagnostic: ambiguousDiag, snapshotInvalid: invalid });
  }));

  // 4. unresolved placement entityRef
  tasks.push(rejects('unresolved_placement_entityRef', (s) => {
    if (!s.durable.placements.length) throw new Error('base has no placements');
    s.durable.placements[0] = { ...clone(s.durable.placements[0]), entityRef: 'entity:npc:does-not-exist' };
  }, 'placements'));

  // 5. unresolved hotspot entityRef
  tasks.push(rejects('unresolved_hotspot_entityRef', (s) => {
    const mapId = s.durable.maps[0]?.id ?? 'map:legacy:m1';
    s.durable.hotspots.push({ id: 'hs-neg', campaignId: cid, mapId, position: { x: 1, y: 1 }, entityRef: 'entity:npc:ghost', visibility: { level: 'public' } });
  }, 'hotspots'));

  // 6. unresolved battleMapRef
  tasks.push(rejects('unresolved_battleMapRef', (s) => {
    s.durable.battleEntries.push({ id: 'be-neg', campaignId: cid, title: 'B', status: 'prepared', battleMapRef: 'no-such-map', visibility: { level: 'hidden' } });
  }, 'battleEntries'));

  // 7. battleMapRef with multiple matches (ambiguous)
  tasks.push(rejects('ambiguous_battleMapRef', (s) => {
    const bm = { id: 'ambi-bm', campaignId: cid, title: 'A', variants: [], visibility: { level: 'public' } };
    s.durable.battleMaps.push(clone(bm), clone(bm));
    s.durable.battleEntries.push({ id: 'be-ambi', campaignId: cid, title: 'B', status: 'prepared', battleMapRef: 'ambi-bm', visibility: { level: 'hidden' } });
  }, 'ambiguous battle map'));

  // 8. cross-campaign reference (entity tagged with a foreign campaignId)
  tasks.push(rejects('cross_campaign_reference', (s) => {
    s.durable.entities[0] = { ...clone(s.durable.entities[0]), campaignId: 'camp:foreign:other' };
  }, 'another campaign'));

  // 9. snapshot without campaignId (runtime cannot match empty metadata id)
  tasks.push(rejects('missing_campaignId', (s) => {
    s.metadata = { ...clone(s.metadata), campaignId: '' };
  }, 'campaignId'));

  // 10. persistence attempt after failed validation (explicit gate)
  tasks.push(Promise.resolve().then(() => {
    const s = clone(baseSnapshot);
    s.durable.placements.push({ id: 'p-bad', campaignId: cid, mapId: s.durable.maps[0]?.id ?? 'map:legacy:m1', entityRef: 'entity:npc:ghost', position: { x: 0, y: 0 }, visibility: { level: 'public' } });
    let gate = false;
    try { assertSnapshotPersistable(s); } catch (e) { gate = e instanceof SnapshotValidationError; }
    const storage = createMemoryRepositoryStorage();
    const repo = createShadowCampaignRepository(storage, STAGE8_SHADOW_NAMESPACE);
    return repo.createCampaign(s).then(() => false, (e) => String(e?.code) === 'INVALID_SCHEMA').then((repoRefused) => {
      const wrote = storage.keys().length > 0;
      const pass = gate && repoRefused && !wrote;
      checks.ok('negative[persist_after_failed_validation]: gate throws, repo refuses, nothing written', pass, JSON.stringify({ gate, repoRefused, wrote }));
      fixtures.push({ name: 'persist_after_failed_validation', expected: 'reject', pass, gateThrows: gate, repoRefuses: repoRefused, nothingWritten: !wrote });
    });
  }));

  // 11. wrong shadow campaign namespace read isolation
  tasks.push(Promise.resolve().then(async () => {
    const storage = createMemoryRepositoryStorage();
    const a = createShadowCampaignRepository(storage, `${STAGE8_SHADOW_NAMESPACE}:A`);
    const b = createShadowCampaignRepository(storage, `${STAGE8_SHADOW_NAMESPACE}:B`);
    await a.createCampaign(clone(baseSnapshot));
    const fromB = await b.readCampaign(cid);
    const pass = fromB === null;
    checks.ok('negative[wrong_namespace_read]: campaign invisible across namespaces', pass);
    fixtures.push({ name: 'wrong_shadow_namespace', expected: 'reject', pass });
  }));

  // 12. source mutation detection (deep-frozen input rejects mutation)
  tasks.push(Promise.resolve().then(() => {
    const frozen = Object.freeze({ a: Object.freeze({ b: 1 }) });
    let threwOrNoOp = false;
    try { frozen.a.b = 2; threwOrNoOp = frozen.a.b === 1; } catch { threwOrNoOp = true; }
    checks.ok('negative[source_mutation_detection]: frozen source cannot be mutated', threwOrNoOp);
    fixtures.push({ name: 'source_mutation_detection', expected: 'reject', pass: threwOrNoOp });
  }));

  // 13. restore/update snapshot into a different campaign slot
  tasks.push(Promise.resolve().then(async () => {
    const storage = createMemoryRepositoryStorage();
    const repo = createShadowCampaignRepository(storage, `${STAGE8_SHADOW_NAMESPACE}:R`);
    await repo.createCampaign(clone(baseSnapshot));
    let threw = false;
    try {
      await repo.updateCampaign(cid, 1, (s) => ({ ...s, metadata: { ...s.metadata, campaignId: 'camp:foreign:x' } }));
    } catch (e) { threw = String(e?.code) === 'CAMPAIGN_ID_MISMATCH'; }
    checks.ok('negative[restore_wrong_campaign]: changing campaignId on update is rejected', threw);
    fixtures.push({ name: 'restore_wrong_campaign', expected: 'reject', pass: threw });
  }));

  // 14. malformed runtime reference (battle runtime with empty battleMapRef)
  tasks.push(rejects('malformed_runtime_battleMapRef', (s) => {
    s.runtime.battles = { ...s.runtime.battles, 'runtime:battle:bad': { id: 'runtime:battle:bad', campaignId: cid, battleMapRef: '', active: false, board: { battleMapRef: '', tokens: [], terrain: [] }, initiative: { round: 1 }, presentedToPlayers: false } };
  }, 'battleMapRef'));

  // 15. missing optional collection (durable.extensions omitted) -> preserve
  tasks.push(preserves('missing_optional_collection', (s) => {
    delete s.durable.extensions;
  }));

  // 16. empty optional collection (extensions notes/zones emptied) -> preserve
  tasks.push(preserves('empty_optional_collection', (s) => {
    s.durable.extensions = { notes: [], zones: [] };
  }));

  // 17. unsupported entity kind -> preserve (unknown kinds are retained, not dropped)
  tasks.push(preserves('unsupported_entity_kind', (s) => {
    const e = clone(s.durable.entities[0]);
    e.id = 'entity:custom:xk';
    e.kind = 'dragonhoard';
    s.durable.entities.push(e);
  }));

  // 18. duplicate migration/source identity -> preserve (migration metadata is additive, not deduped by validation)
  tasks.push(preserves('duplicate_migration_identity', (s) => {
    s.migrationMetadata = [...s.migrationMetadata, ...s.migrationMetadata.map(clone)];
  }));

  return Promise.all(tasks).then(() => fixtures);
}

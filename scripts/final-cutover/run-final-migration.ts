// Final cutover — Block B: run the REAL universal migration engine
// (src/domain/migration/migrationEngine.ts, already Stage-7-proven:
// idempotent, dry-run, atomic commit+backup, rollback, read-after-write
// validation) against the REAL Greyholm + Caldran canonical data, into a
// real in-memory production-shaped repository (createProductionCampaignRepository
// + createMemoryRepositoryStorage — the exact same repository implementation
// the browser app uses, just backed by an in-memory Map instead of
// localStorage). Nothing here is a reimplementation of migration logic; it
// exercises the production adapters/engine/repository exactly as committed.
//
// Run with `npx tsx` (no new project dependency).
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import {
  TIMELINES,
  WORLD_MAPS,
  buildLocationStates,
  buildWorldMapStatesAndHotspots,
  buildRoutes,
  buildTravelEvents,
} from '../../src/data/loadCampaignData';
import { buildBattleMapLocationLinks } from '../../src/data/battleMapLocationLinks';
import { adaptMainCampaignToUniversal, type MainCampaignDataInput } from '../../src/domain/adapters/mainCampaignAdapter';
import { adaptUserCampaignToUniversal } from '../../src/domain/adapters/userCampaignAdapter';
import { campaignIdFromLegacy } from '../../src/domain/adapters/idMapping';
import { runUniversalMigration, rollbackUniversalMigration, type LegacyMigrationSource } from '../../src/domain/migration/migrationEngine';
import { createProductionCampaignRepository, createMemoryRepositoryStorage } from '../../src/domain/repository/shadowRepository';
import type { CampaignId } from '../../src/domain/campaign/ids';
import type { DmLocation, DmNpc, DmQuest, DmCustomEnemy, DmImageItem, DmFaction, DmTavern, DmShop, DmPlayer, DmEconomyEntry, DmEconomyReferenceItem } from '../../src/types/dmCompanion';
import type { BattleMapManifestEntry } from '../../src/data/battleMapManifest';
import type { UserCampaignData, UserCampaignRuntime } from '../../src/types/userCampaign';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dmData = (name: string) => resolve(root, 'public/data/dm-companion', name);
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

function buildGreyholmMainCampaignDataInput(): MainCampaignDataInput {
  const locations = readJson<DmLocation[]>(dmData('locations.json'));
  const npcs = readJson<DmNpc[]>(dmData('npcs.json'));
  const quests = readJson<DmQuest[]>(dmData('quests.json'));
  const enemies = readJson<DmCustomEnemy[]>(dmData('custom-enemies.json'));
  const images = readJson<DmImageItem[]>(dmData('images.json'));
  const factions = readJson<DmFaction[]>(dmData('factions.json'));
  const players = readJson<DmPlayer[]>(dmData('players.json'));
  const shops = readJson<DmShop[]>(dmData('shops.json'));
  const taverns = readJson<DmTavern[]>(dmData('taverns.json'));
  const economyRef = readJson<DmEconomyReferenceItem[]>(dmData('economy-reference.json'));
  const economyRaw = readJson<DmEconomyEntry[] | { entries: DmEconomyEntry[] }>(dmData('economy.json'));
  const economy = Array.isArray(economyRaw) ? economyRaw : (economyRaw.entries ?? []);
  const battleCatalog = readJson<{ maps: BattleMapManifestEntry[] }>(resolve(root, 'public/data/battle-map-vtt/catalog.json'));
  const battleMaps = battleCatalog.maps;

  for (const q of quests) {
    if (!Array.isArray((q as { enemies?: unknown }).enemies)) (q as { enemies: unknown[] }).enemies = [];
  }

  const timelines = TIMELINES;
  const locationStates = buildLocationStates(locations, npcs, quests, enemies, images, timelines, taverns);
  const { worldMapStates, hotspots } = buildWorldMapStatesAndHotspots(timelines);
  const routes = buildRoutes();
  const travelEvents = buildTravelEvents();
  // battleMapLocationLinks feeds MapObjectPlacement-shaped links elsewhere in
  // the real app (via a separate feature, not the adapter's `placements`
  // input) — computed here only to prove it derives cleanly, not consumed by
  // MainCampaignDataInput (which has no field for it).
  void buildBattleMapLocationLinks(battleMaps, locationStates, locations);

  return {
    timelines,
    locationStates,
    worldMaps: WORLD_MAPS,
    worldMapStates,
    hotspots,
    routes,
    travelEvents,
    placements: [], // by design: no canonical seed, 100% DM-created at runtime (see loadCampaignData.ts)
    battleMaps,
    npcs,
    quests,
    enemies,
    images,
    factions,
    locations,
    taverns,
    economy,
    economyReference: economyRef,
    shops,
    players,
  };
}

function buildCaldranAdapterInput(): { data: UserCampaignData; runtime: UserCampaignRuntime } {
  const raw = readJson<{ data: UserCampaignData; runtime: UserCampaignRuntime }>(
    resolve(root, 'scripts/stage08/fixtures/caldran-real-export.json'),
  );
  return raw;
}

interface ManifestEntityType {
  count: number;
  ids: string[];
  contentHash: string;
}
interface ManifestCampaign {
  campaignId: string;
  entities: Record<string, ManifestEntityType>;
}

function loadManifest(): ManifestCampaign[] {
  const raw = readJson<{ campaigns: ManifestCampaign[] }>(resolve(root, 'rebuild-reports/final-cutover/PRODUCTION_REFERENCE_MANIFEST.json'));
  return raw.campaigns;
}

/** For each `manifestKind -> universalKind` pair, verify every manifest id
 * appears in the union of `sourceIds` across matching-kind universal
 * entities. Extra universal-side entries (e.g. the two synthesized
 * Kingdom/Region location-hierarchy nodes) are expected and not flagged --
 * only a manifest id with NO matching universal sourceIds counts as missing. */
function idCoverageDiff(
  manifest: ManifestCampaign,
  entities: { kind: string; sourceIds?: string[] }[],
  kindMap: Record<string, string>,
): Record<string, { manifestCount: number; coveredCount: number; missingIds: string[] }> {
  const out: Record<string, { manifestCount: number; coveredCount: number; missingIds: string[] }> = {};
  for (const [manifestKind, universalKind] of Object.entries(kindMap)) {
    const manifestType = manifest.entities[manifestKind];
    if (!manifestType) continue;
    const sourceIdUnion = new Set(
      entities.filter((e) => e.kind === universalKind).flatMap((e) => e.sourceIds ?? []),
    );
    const missingIds = manifestType.ids.filter((id) => !sourceIdUnion.has(id));
    out[manifestKind] = { manifestCount: manifestType.count, coveredCount: manifestType.count - missingIds.length, missingIds: missingIds.slice(0, 20) };
  }
  return out;
}

interface ReconciliationRow {
  campaignId: string;
  dryRun: { ok: boolean; alreadyMigrated: boolean; committed: boolean };
  commit: { ok: boolean; committed: boolean; revisionAfterCommit: number | null };
  readBack: { ok: boolean; matchesCommitted: boolean };
  rollback: { ok: boolean; revisionAfterRollback: number | null; matchesPreCommit: boolean };
  entityCounts: Record<string, number>;
  lostEntities: number;
  idCoverage: Record<string, { manifestCount: number; coveredCount: number; missingIds: string[] }>;
}

async function migrateOne(
  name: string,
  source: LegacyMigrationSource,
  targetCampaignId: CampaignId,
  manifest: ManifestCampaign | undefined,
  kindMap: Record<string, string>,
): Promise<ReconciliationRow> {
  const storage = createMemoryRepositoryStorage();
  const repository = createProductionCampaignRepository(storage);

  const dry = await runUniversalMigration(repository, source, { targetCampaignId, dryRun: true });
  const preCommitRead = await repository.readCampaign(targetCampaignId); // must still be null

  const commit = await runUniversalMigration(repository, source, { targetCampaignId, dryRun: false });
  const readBack = commit.committed ? await repository.readCampaign(targetCampaignId) : null;
  const matchesCommitted = !!readBack && !!commit.write && readBack.revision === commit.write.newRevision;

  // Rollback proof: mutate the campaign once (so there is something to roll
  // back FROM), then restore the backup taken by a second migration run
  // (idempotency means a second `runUniversalMigration` call is a no-op —
  // exercise rollback directly against the ORIGINAL commit's backup instead).
  let rollbackOk = false;
  let revisionAfterRollback: number | null = null;
  let matchesPreCommit = false;
  if (commit.committed && readBack) {
    const backup = await repository.backupCampaign(targetCampaignId);
    // simulate a subsequent bad write
    await repository.updateCampaign(targetCampaignId, readBack.revision, (snap) => ({
      ...snap,
      metadata: { ...snap.metadata, title: 'CORRUPTED-FOR-ROLLBACK-TEST' },
    }));
    const corrupted = await repository.readCampaign(targetCampaignId);
    // RevisionWriteResult carries no `ok` field: the repository throws (a
    // CONFLICT error) on failure rather than returning a falsy result, so a
    // resolved promise with a defined newRevision IS the success signal.
    const restore = await rollbackUniversalMigration(repository, backup, corrupted!.revision);
    rollbackOk = typeof restore.newRevision === 'number';
    const afterRollback = await repository.readCampaign(targetCampaignId);
    revisionAfterRollback = afterRollback?.revision ?? null;
    matchesPreCommit = afterRollback?.metadata.title === readBack.metadata.title;
  }

  const finalSnap = commit.committed ? await repository.readCampaign(targetCampaignId) : null;
  const entityCounts: Record<string, number> = finalSnap
    ? {
        maps: finalSnap.durable.maps.length,
        hotspots: finalSnap.durable.hotspots.length,
        placements: finalSnap.durable.placements.length,
        routes: finalSnap.durable.routes.length,
        entities: finalSnap.durable.entities.length,
        battleMaps: finalSnap.durable.battleMaps.length,
      }
    : {};

  const idCoverage = manifest && finalSnap ? idCoverageDiff(manifest, finalSnap.durable.entities, kindMap) : {};

  return {
    campaignId: name,
    dryRun: { ok: dry.ok, alreadyMigrated: dry.alreadyMigrated, committed: dry.committed },
    commit: { ok: commit.ok, committed: commit.committed, revisionAfterCommit: commit.write?.newRevision ?? null },
    readBack: { ok: !!readBack, matchesCommitted },
    rollback: { ok: rollbackOk, revisionAfterRollback, matchesPreCommit },
    entityCounts,
    lostEntities: preCommitRead ? 1 : 0, // preCommitRead must be null after a dry-run; non-null = a lost-invariant bug
    idCoverage,
  };
}

async function main() {
  const greyId = campaignIdFromLegacy('greyholm', 'main');
  const greySource: LegacyMigrationSource = {
    sourceId: 'greyholm:main',
    expectedTargetCampaignId: greyId,
    adapt: () => adaptMainCampaignToUniversal({ data: buildGreyholmMainCampaignDataInput(), overlay: {} }),
  };

  const caldran = buildCaldranAdapterInput();
  const caldranId = campaignIdFromLegacy('user', caldran.data.campaignId);
  const caldranSource: LegacyMigrationSource = {
    sourceId: `user:${caldran.data.campaignId}`,
    expectedTargetCampaignId: caldranId,
    adapt: () => adaptUserCampaignToUniversal({ data: caldran.data, runtime: caldran.runtime }),
  };

  const manifestCampaigns = loadManifest();
  const greyManifest = manifestCampaigns.find((c) => c.campaignId === 'greyholm:main');
  const caldranManifest = manifestCampaigns.find((c) => c.campaignId === 'user:caldran-captivity');

  const greyKindMap: Record<string, string> = { npcs: 'npc', quests: 'quest', enemies: 'enemy', images: 'image', factions: 'faction', players: 'player', shops: 'shop', taverns: 'tavern' };
  const caldranKindMap: Record<string, string> = { npcs: 'npc', quests: 'quest', enemies: 'enemy', images: 'image', factions: 'faction' };

  const greyholm = await migrateOne('greyholm:main', greySource, greyId, greyManifest, greyKindMap);
  const caldranResult: Record<string, unknown> = await migrateOne('user:caldran-captivity', caldranSource, caldranId, caldranManifest, caldranKindMap);
  // Curated annotation (not reproducible from this script's own inputs) --
  // re-attached explicitly rather than relying on it surviving a prior run's
  // output, since this script fully regenerates the `results` array every
  // time it runs.
  caldranResult.fixtureCaveat = "This 'user:caldran-captivity' entry is produced by verify:final-migration against a FROZEN static fixture (scripts/stage08/fixtures/caldran-real-export.json), NOT a live read of any of the 3 real present Caldran localStorage campaigns. The 407/26-quests/78-enemies numbers describe that fixture only.";

  // This script owns exactly these 4 top-level keys. Any other top-level key
  // already present in the file on disk (e.g. liveCaldranReconciliation,
  // rootCampaignIdentityPolicy, canonicalCaldranSource -- curated,
  // manually-verified sections that this script cannot reproduce) is
  // preserved as-is. A prior session's incident: this script used to
  // unconditionally overwrite the whole file, silently destroying
  // liveCaldranReconciliation each time it ran -- fixed here by merging
  // instead of clobbering.
  const outPath = resolve(root, 'rebuild-reports/final-cutover/FINAL_DATA_PARITY_REPORT.json');
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch {
    existing = {};
  }
  const ownedKeys = new Set(['generatedAt', 'engine', 'repository', 'results']);
  const preserved = Object.fromEntries(Object.entries(existing).filter(([k]) => !ownedKeys.has(k)));
  const report = {
    generatedAt: new Date().toISOString(),
    engine: 'src/domain/migration/migrationEngine.ts (runUniversalMigration / rollbackUniversalMigration) — real production code, not reimplemented.',
    repository: 'createProductionCampaignRepository + createMemoryRepositoryStorage (in-memory Map, same repository implementation the browser app uses over localStorage).',
    results: [greyholm, caldranResult],
    ...preserved,
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
  console.log(`Wrote ${outPath}`);
  console.log(JSON.stringify(report.results.map((r) => ({
    id: r.campaignId,
    dryRunOk: r.dryRun.ok,
    committed: r.commit.committed,
    readBackMatches: r.readBack.matchesCommitted,
    rollbackOk: r.rollback.ok,
    rollbackRestoresTitle: r.rollback.matchesPreCommit,
    lostEntities: r.lostEntities,
    entityCounts: r.entityCounts,
    idCoverage: Object.fromEntries(Object.entries(r.idCoverage).map(([k, v]) => [k, `${v.coveredCount}/${v.manifestCount}`])),
  })), null, 2));

  const totalMissingIds = report.results.reduce(
    (sum, r) => sum + Object.values(r.idCoverage).reduce((s, v) => s + v.missingIds.length, 0),
    0,
  );
  const anyFail = report.results.some((r) =>
    !r.dryRun.ok || !r.commit.committed || !r.readBack.matchesCommitted || !r.rollback.ok || !r.rollback.matchesPreCommit || r.lostEntities > 0,
  ) || totalMissingIds > 0;
  if (anyFail) {
    console.error('FINAL_MIGRATION_FAIL');
    process.exit(1);
  }
  console.log('FINAL_MIGRATION_PASS');
}

main();

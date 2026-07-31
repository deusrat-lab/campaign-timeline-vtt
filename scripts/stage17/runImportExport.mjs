// Stage 17 — import / export / backup / restore pipeline, on real snapshots.
import {
  exportPortable, exportBackup, exportPlayerSafe,
  detectImportFormat, planImport, applyImport, safeRestore,
  snapshotHash, canonicalSnapshotString,
  createProductionCampaignRepository, createMemoryRepositoryStorage,
  UNIVERSAL_PRODUCTION_NAMESPACE,
  userBoardToUniversal, battleRuntimeId,
} from './.dist/domain/index.js';
import { Checks, stableEqual } from '../stage08/lib.mjs';
import { caldranComplex, greyholmComplex } from '../stage16/lib.mjs';
import { caldranBoards, CALDRAN_ID } from './fixtures.mjs';

const clone = (v) => JSON.parse(JSON.stringify(v));
function freshRepo() {
  return createProductionCampaignRepository(createMemoryRepositoryStorage(), UNIVERSAL_PRODUCTION_NAMESPACE);
}

/** Take a real Caldran snapshot and inject a universal battle runtime so we can
 * prove battle state survives export/import. */
function caldranSnapshotWithBattle() {
  const snap = clone(caldranComplex().snapshot());
  const boards = caldranBoards();
  const runtime = userBoardToUniversal(snap.metadata.campaignId, 'custom-alpha', boards['custom-alpha'], { active: true });
  snap.runtime.battles = { [runtime.id]: runtime };
  return snap;
}

export function runImportExport(c = new Checks()) {
  const caldran = caldranComplex().snapshot();
  const greyholm = greyholmComplex().snapshot();

  // --- deterministic exports ---
  c.ok('export: portable is deterministic', exportPortable(caldran) === exportPortable(clone(caldran)));
  c.ok('export: backup is deterministic', exportBackup(greyholm) === exportBackup(clone(greyholm)));
  c.ok('export: hash stable across clones', snapshotHash(caldran) === snapshotHash(clone(caldran)));
  c.ok('export: distinct campaigns hash differently', snapshotHash(caldran) !== snapshotHash(greyholm));

  // --- format detection ---
  c.eq('detect: portable envelope', detectImportFormat(exportPortable(caldran)).format, 'universal-export');
  c.eq('detect: raw snapshot', detectImportFormat(canonicalSnapshotString(caldran)).format, 'raw-snapshot');
  c.eq('detect: garbage', detectImportFormat('{not json').format, 'unknown');

  // --- player-safe export carries NO DM snapshot ---
  const ps = JSON.parse(exportPlayerSafe(greyholm));
  c.eq('export: player-safe kind', ps.kind, 'player-safe');
  c.ok('export: player-safe has no DM snapshot', ps.snapshot === undefined && ps.playerSafe !== undefined);
  const psText = exportPlayerSafe(greyholm);
  c.eq('export: player-safe cannot be imported', detectImportFormat(psText).envelope.kind, 'player-safe');

  // --- round-trip through a fresh repo (create) ---
  return (async () => {
    const repo = freshRepo();
    const text = exportPortable(caldranSnapshotWithBattle());
    const target = caldran.metadata.campaignId;

    // dry-run must NOT write
    const plan = await planImport(repo, { text, targetCampaignId: target, mode: 'create' });
    c.ok('import: dry-run plan ok', plan.ok);
    c.ok('import: battle counted in plan', plan.battleCount === 1);
    c.ok('import: dry-run wrote nothing', (await repo.readCampaign(target)) === null);

    // wrong target rejected (no hidden fallback)
    const wrong = await planImport(repo, { text, targetCampaignId: greyholm.metadata.campaignId, mode: 'create' });
    c.ok('import: wrong target rejected', !wrong.ok && wrong.errors.some((e) => e.includes('mismatch')));

    // apply create
    const created = await applyImport(repo, { text, targetCampaignId: target, mode: 'create' });
    c.ok('import: create applied', created.ok);
    const readBack = await repo.readCampaign(target);
    c.ok('import: read-after-write present', !!readBack);
    c.ok('import: battle survived round-trip', Object.keys(readBack.runtime.battles).length === 1);

    // create into existing rejected
    const dup = await planImport(repo, { text, targetCampaignId: target, mode: 'create' });
    c.ok('import: create into existing rejected', !dup.ok);

    // replace requires rollback checkpoint
    const replaced = await applyImport(repo, { text, targetCampaignId: target, mode: 'replace' });
    c.ok('import: replace applied', replaced.ok);
    c.ok('import: rollback checkpoint captured on replace', !!replaced.rollbackCheckpoint);
    c.eq('import: rollback checkpoint is exact campaign', replaced.rollbackCheckpoint.campaignId, target);

    // replace of missing rejected
    const missing = await planImport(freshRepo(), { text, targetCampaignId: target, mode: 'replace' });
    c.ok('import: replace of missing rejected', !missing.ok);

    // --- backup / restore ---
    const backup = await repo.backupCampaign(target);
    c.eq('backup: exact campaign', backup.campaignId, target);

    // corrupt backup rejected
    const corrupt = clone(backup);
    corrupt.snapshot.metadata.campaignId = greyholm.metadata.campaignId;
    const badRestore = await safeRestore(repo, corrupt, readBack.revision);
    c.ok('restore: corrupt backup rejected', !badRestore.ok);

    // valid restore into fresh repo (create path)
    const fresh = freshRepo();
    const restored = await safeRestore(fresh, backup);
    c.ok('restore: valid backup restored to fresh repo', restored.ok);
    const restoredSnap = await fresh.readCampaign(target);
    c.ok('restore: restored data matches backup durable',
      stableEqual(restoredSnap.durable, backup.snapshot.durable));

    // restore over existing captures rollback checkpoint
    const restore2 = await safeRestore(repo, backup, (await repo.readCampaign(target)).revision);
    c.ok('restore: over existing ok', restore2.ok);
    c.ok('restore: rollback checkpoint captured', !!restore2.rollbackCheckpoint);

    // battle id determinism sanity
    c.ok('battle id deterministic in export scope',
      battleRuntimeId(CALDRAN_ID, 'custom-alpha') === battleRuntimeId(CALDRAN_ID, 'custom-alpha'));

    return c;
  })();
}

// Final cutover — Phase 2: PRODUCTION_REFERENCE_MANIFEST.json
//
// Production (Railway) is not reachable from this local, offline environment —
// there is no browser session, API token, or network path to it here. Per
// FINAL_REMAINING_WORK_AUDIT.md and the task's own fallback instruction ("если
// production данные невозможно получить автоматически, используй уже имеющиеся
// canonical exports"), this manifest is built from the two canonical,
// hash-pinned, read-only sources already established and used as production's
// stand-in by Stage 8 (`scripts/stage08/inputs.mjs`), which the original Stage
// 8 audit documented as: "Immutable copy of a live DM Companion export" (Caldran)
// and "the real, committed Greyholm dataset" (Greyholm DM Companion JSON +
// generated battle-map-vtt catalog). No production write, read, or network call
// is made by this script. Source provenance is recorded per campaign below.
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
import { loadGreyholm, loadCaldran } from '../stage08/inputs.mjs';
import { hashJson } from '../stage08/lib.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outPath = resolve(root, 'rebuild-reports/final-cutover/PRODUCTION_REFERENCE_MANIFEST.json');

function arrayOf(v) {
  return Array.isArray(v) ? v : v ? [v] : [];
}

function idSet(list) {
  return new Set((list ?? []).map((item) => item.id));
}

function countType(list) {
  const ids = (list ?? []).map((item) => item.id).sort();
  return {
    count: list?.length ?? 0,
    ids,
    contentHash: hashJson(list ?? []),
  };
}

function countBrokenRefs(rows) {
  return rows.length;
}

function greyholmManifest() {
  const g = loadGreyholm();
  const d = g.adapterInput.data;
  const locationIds = idSet(d.locations);
  const npcIds = idSet(d.npcs);
  const questIds = idSet(d.quests);
  const enemyIds = idSet(d.enemies);
  const imageIds = idSet(d.images);
  const factionIds = idSet(d.factions);

  const relations = {
    'npc.location': d.npcs.filter((n) => n.location && !locationIds.has(n.location)).length === 0
      ? d.npcs.filter((n) => n.location).length
      : d.npcs.filter((n) => n.location).length,
    'quest.location': d.quests.filter((q) => q.location).length,
    'quest.giver': d.quests.filter((q) => q.giver).length,
    'quest.enemies': d.quests.reduce((sum, q) => sum + arrayOf(q.enemies).length, 0),
    'enemy.locationIds': d.enemies.reduce((sum, e) => sum + arrayOf(e.locationIds).length, 0),
    'location.npcs': d.locations.reduce((sum, l) => sum + arrayOf(l.npcs).length, 0),
    'location.quests': d.locations.reduce((sum, l) => sum + arrayOf(l.quests).length, 0),
    'location.images': d.locations.reduce((sum, l) => sum + arrayOf(l.images).length, 0),
  };

  const brokenReferences = {
    'npc.location': countBrokenRefs(d.npcs.filter((n) => n.location && !locationIds.has(n.location))),
    'quest.location': countBrokenRefs(d.quests.filter((q) => q.location && !locationIds.has(q.location))),
    'quest.giver': countBrokenRefs(d.quests.filter((q) => q.giver && !npcIds.has(q.giver))),
    'quest.enemies': countBrokenRefs(d.quests.flatMap((q) => arrayOf(q.enemies).filter((id) => !enemyIds.has(id)))),
    'enemy.locationIds': countBrokenRefs(d.enemies.flatMap((e) => arrayOf(e.locationIds).filter((id) => !locationIds.has(id)))),
    'location.npcs': countBrokenRefs(d.locations.flatMap((l) => arrayOf(l.npcs).filter((id) => !npcIds.has(id)))),
    'location.quests': countBrokenRefs(d.locations.flatMap((l) => arrayOf(l.quests).filter((id) => !questIds.has(id)))),
    'location.images': countBrokenRefs(d.locations.flatMap((l) => arrayOf(l.images).filter((id) => !imageIds.has(id)))),
  };

  const imageReferenceCount = d.locations.reduce((sum, l) => sum + arrayOf(l.images).length, 0)
    + d.npcs.filter((n) => n.image).length
    + d.quests.filter((q) => q.image).length
    + d.enemies.filter((e) => e.image).length;

  return {
    campaignId: 'greyholm:main',
    title: 'Greyholm',
    source: {
      kind: g.kind,
      description: 'Local canonical DM Companion JSON (public/data/dm-companion/*.json) + generated battle-map-vtt catalog. NOT a live Railway production read — Railway is unreachable from this offline environment. Hash-pinned per Stage 8 (scripts/stage08/inputs.mjs).',
      sourcePaths: g.sourcePaths,
      hashesBefore: g.hashesBefore,
    },
    knownGaps: [
      'timeline-scoped MC collections (worldMaps/locationStates/hotspots/placements/routes/travelEvents) are assembled at app runtime by loadCampaignData + the browser localStorage overlay, not by this static-file read — reported empty here, not fabricated (see loadGreyholm() comment in scripts/stage08/inputs.mjs).',
    ],
    entities: {
      locations: countType(d.locations),
      npcs: countType(d.npcs),
      quests: countType(d.quests),
      enemies: countType(d.enemies),
      images: countType(d.images),
      factions: countType(d.factions),
      players: countType(d.players),
      shops: countType(d.shops),
      taverns: countType(d.taverns),
      battleMaps: countType(d.battleMaps),
      economy: countType(d.economy),
      economyReference: countType(d.economyReference),
    },
    relationCounts: relations,
    imageReferenceCount,
    brokenReferenceCounts: brokenReferences,
    totalBrokenReferences: Object.values(brokenReferences).reduce((a, b) => a + b, 0),
  };
}

function caldranManifest() {
  const c = loadCaldran();
  const d = c.raw.data;
  const r = c.raw.runtime ?? {};
  const locationIds = idSet(d.locations);
  const npcIds = idSet(d.npcs);
  const questIds = idSet(d.quests);
  const enemyIds = idSet(d.enemies);

  const brokenReferences = {
    'npc.location': countBrokenRefs((d.npcs ?? []).filter((n) => n.location && !locationIds.has(n.location))),
    'quest.location': countBrokenRefs((d.quests ?? []).filter((q) => q.location && !locationIds.has(q.location))),
    'placement.entity': countBrokenRefs((d.mapPlacements ?? []).filter((p) => {
      const set = { npc: npcIds, location: locationIds, quest: questIds, enemy: enemyIds }[p.entityKind];
      return set && p.entityId && !set.has(p.entityId);
    })),
  };

  return {
    campaignId: 'user:caldran-captivity',
    title: 'Caldran: Цена имени (плен)',
    source: {
      kind: c.kind,
      description: 'Immutable snapshot of a real DM Companion export (scripts/stage08/fixtures/caldran-real-export.json), used as the read-only Caldran reference per Stage 8. NOT a live Railway production read.',
      sourcePaths: c.sourcePaths,
      hashesBefore: c.hashesBefore,
    },
    knownGaps: [],
    entities: {
      locations: countType(d.locations),
      npcs: countType(d.npcs),
      quests: countType(d.quests),
      enemies: countType(d.enemies),
      images: countType(d.images),
      factions: countType(d.factions),
      mapPlacements: countType(d.mapPlacements),
      routes: countType(d.routes),
      zones: countType(d.zones),
      notes: countType(d.notes),
      customBattleMaps: countType(d.customBattleMaps),
    },
    relationCounts: {
      'placement.entity': (d.mapPlacements ?? []).length,
      'runtime.battleBoards': Object.keys(r.battleBoards ?? {}).length,
      'runtime.revealedToPlayers': (r.revealedToPlayers ?? []).length,
    },
    imageReferenceCount: (d.images ?? []).length,
    brokenReferenceCounts: brokenReferences,
    totalBrokenReferences: Object.values(brokenReferences).reduce((a, b) => a + b, 0),
  };
}

const manifest = {
  generatedAt: new Date().toISOString(),
  productionAccess: 'read-only sources only; no Railway network access from this environment; no production writes',
  campaigns: [greyholmManifest(), caldranManifest()],
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(manifest, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
console.log(JSON.stringify({
  campaigns: manifest.campaigns.map((c) => ({
    id: c.campaignId,
    totalBrokenReferences: c.totalBrokenReferences,
    entityCounts: Object.fromEntries(Object.entries(c.entities).map(([k, v]) => [k, v.count])),
  })),
}, null, 2));

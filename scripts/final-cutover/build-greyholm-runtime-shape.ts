// Final cutover — closes the "timeline-scoped MC collections reported empty"
// gap in PRODUCTION_REFERENCE_MANIFEST.json / REFERENTIAL_INTEGRITY_REPORT.json
// for Greyholm. loadCampaignData.ts's `loadCampaignData()` entry point is
// browser-only (fetch() against a running dev server), but the PURE builder
// functions it calls (buildLocationStates, buildWorldMapStatesAndHotspots,
// buildRoutes, buildTravelEvents, buildBattleMapLocationLinks, TIMELINES,
// WORLD_MAPS) take plain data in and return plain data out — no network, no
// DOM. They were module-private; exported (additive, zero behavior change,
// typecheck/build verified) so this script can call the SAME derivation logic
// the real app uses, outside a browser, against the same canonical
// hash-pinned static JSON Stage 8 already reads. Run with `npx tsx` (no new
// project dependency: tsx is fetched on demand via npx, not added to
// package.json).
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  TIMELINES,
  WORLD_MAPS,
  buildLocationStates,
  buildWorldMapStatesAndHotspots,
  buildRoutes,
  buildTravelEvents,
} from '../../src/data/loadCampaignData';
import { buildBattleMapLocationLinks } from '../../src/data/battleMapLocationLinks';
import type { DmLocation, DmNpc, DmQuest, DmCustomEnemy, DmImageItem, DmTavern } from '../../src/types/dmCompanion';
import type { BattleMapManifestEntry } from '../../src/data/battleMapManifest';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dmData = (name: string) => resolve(root, 'public/data/dm-companion', name);
const readJson = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;

function hashJson(value: unknown): string {
  const json = JSON.stringify(value, Object.keys(value as object).sort ? undefined : undefined);
  return 'sha256:' + createHash('sha256').update(JSON.stringify(value)).digest('hex').slice(0, 16);
}

const locations = readJson<DmLocation[]>(dmData('locations.json'));
const npcs = readJson<DmNpc[]>(dmData('npcs.json'));
const quests = readJson<DmQuest[]>(dmData('quests.json'));
const enemies = readJson<DmCustomEnemy[]>(dmData('custom-enemies.json'));
const images = readJson<DmImageItem[]>(dmData('images.json'));
const taverns = readJson<DmTavern[]>(dmData('taverns.json'));
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
const battleMapLocationLinks = buildBattleMapLocationLinks(battleMaps, locationStates, locations);

const worldMapIds = new Set(WORLD_MAPS.map((m) => m.id));
const locationStateIds = new Set(locationStates.map((ls) => ls.id));
const battleMapIds = new Set(battleMaps.map((m) => m.id));

const brokenReferences = {
  'hotspot -> worldMap': hotspots.filter((h) => !worldMapIds.has(h.mapId)).length,
  'hotspot -> locationState': hotspots.filter((h) => !locationStateIds.has(h.locationStateId)).length,
  'worldMapState -> worldMap': worldMapStates.filter((s) => !worldMapIds.has(s.mapId)).length,
  'worldMapState -> hotspot': worldMapStates.flatMap((s) => s.hotspotIds).filter((id) => !hotspots.some((h) => h.id === id)).length,
  // `buildBattleMapLocationLinks` intentionally emits `locationStateId: ''`
  // with `confidence: 'manual_required'` for a battle map it could not
  // text-match to any location -- a deliberate, typed "needs DM review"
  // orphan marker (surfaced to the DM in the Library panel), not a silently
  // dropped or corrupted reference. Excluded from the broken count and
  // reported separately below, per the task's own "typed explicit orphan"
  // instruction (Block C).
  'battleMapLocationLink -> locationState': battleMapLocationLinks.filter((l) => l.locationStateId !== '' && !locationStateIds.has(l.locationStateId)).length,
  'battleMapLocationLink -> battleMap': battleMapLocationLinks.filter((l) => !battleMapIds.has(l.battleMapId)).length,
};
const explicitOrphans = {
  'battleMapLocationLink (unmatched, manual_required)': battleMapLocationLinks.filter((l) => l.locationStateId === '' && l.confidence === 'manual_required').length,
};
const totalBroken = Object.values(brokenReferences).reduce((a, b) => a + b, 0);

const result = {
  generatedAt: new Date().toISOString(),
  provenance: 'Derived by directly invoking loadCampaignData.ts\'s exported pure builder functions (buildLocationStates, buildWorldMapStatesAndHotspots, buildRoutes, buildTravelEvents) + battleMapLocationLinks.ts\'s buildBattleMapLocationLinks against the same canonical static JSON as PRODUCTION_REFERENCE_MANIFEST.json -- the SAME derivation code path the real app runs (not a reimplementation), executed outside a browser via `npx tsx`. This closes the "timeline-scoped MC collections reported empty" gap recorded in CONTINUATION_STATE.json for Greyholm\'s worldMapStates/locationStates/hotspots/routes/travelEvents/battleMapLocationLinks -- everything EXCEPT placements, which loadCampaignData.ts itself documents as having "no seed data at all -- placements are 100% DM-created, living entirely in the local overlay" (never in any static/canonical file, by design).',
  worldMaps: { count: WORLD_MAPS.length, ids: WORLD_MAPS.map((m) => m.id).sort() },
  timelines: { count: timelines.length, ids: timelines.map((t) => t.id) },
  locationStates: { count: locationStates.length, contentHash: hashJson(locationStates) },
  worldMapStates: { count: worldMapStates.length, contentHash: hashJson(worldMapStates) },
  hotspots: { count: hotspots.length, contentHash: hashJson(hotspots) },
  routes: { count: routes.length, contentHash: hashJson(routes) },
  travelEvents: { count: travelEvents.length, contentHash: hashJson(travelEvents) },
  battleMapLocationLinks: { count: battleMapLocationLinks.length, contentHash: hashJson(battleMapLocationLinks) },
  placements: { count: 0, note: 'Not applicable by design -- see provenance note. No canonical source exists; production placements live only in that specific browser session\'s localStorage overlay, never exported to a static file.' },
  brokenReferenceCounts: brokenReferences,
  explicitOrphanCounts: explicitOrphans,
  totalBrokenReferences: totalBroken,
};

const outPath = resolve(root, 'rebuild-reports/final-cutover/GREYHOLM_RUNTIME_SHAPE.json');
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n');
console.log(`Wrote ${outPath}`);
console.log(JSON.stringify({
  locationStates: locationStates.length,
  worldMapStates: worldMapStates.length,
  hotspots: hotspots.length,
  routes: routes.length,
  travelEvents: travelEvents.length,
  battleMapLocationLinks: battleMapLocationLinks.length,
  totalBrokenReferences: totalBroken,
}, null, 2));

if (totalBroken > 0) {
  console.error(`GREYHOLM_RUNTIME_SHAPE_FAIL: ${totalBroken} broken references.`);
  process.exit(1);
}
console.log('GREYHOLM_RUNTIME_SHAPE_PASS');

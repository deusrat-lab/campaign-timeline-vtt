// Block K — FULL Greyholm universal export/import round trip.
//
// Greyholm real seed data -> materializeGreyholmAsUserCampaign() ->
// exportGreyholmUniversal() (the SAME serializer/envelope Caldran uses) ->
// reconstructUserCampaign() with a fresh disposable target id -> normalized
// semantic comparison against the materialized source, section by section
// (not just counts): locations, npcs, quests, enemies, factions, images,
// players, mapPlacements, routes, zones, arcs, capabilities.
//
// Run with: npx tsx scripts/final-cutover/verify-greyholm-full-round-trip.ts
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  TIMELINES,
  WORLD_MAPS,
  buildLocationStates,
  buildWorldMapStatesAndHotspots,
  buildRoutes,
  buildTravelEvents,
} from '../../src/data/loadCampaignData';
import type { MainCampaignDataInput, MainCampaignOverlayInput } from '../../src/domain/adapters/mainCampaignAdapter';
import { materializeGreyholmAsUserCampaign } from '../../src/domain/adapters/greyholmToUserCampaignAdapter';
import { exportGreyholmUniversal, reconstructUserCampaign } from '../../src/domain/portability/userCampaignPortability';
import type { UserCampaignData } from '../../src/types/userCampaign';
import type { DmLocation, DmNpc, DmQuest, DmCustomEnemy, DmImageItem, DmFaction, DmTavern, DmShop, DmPlayer } from '../../src/types/dmCompanion';
import type { BattleMapManifestEntry } from '../../src/data/battleMapManifest';
import type { FactionZone } from '../../src/types';

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
  const battleCatalog = readJson<{ maps: BattleMapManifestEntry[] }>(resolve(root, 'public/data/battle-map-vtt/catalog.json'));
  const battleMaps = battleCatalog.maps;

  for (const q of quests) {
    if (!Array.isArray((q as { enemies?: unknown }).enemies)) (q as { enemies: unknown[] }).enemies = [];
  }

  const timelines = TIMELINES;
  const locationStates = buildLocationStates(locations, npcs, quests, enemies, images, timelines, taverns);
  const { worldMapStates, hotspots } = buildWorldMapStatesAndHotspots(timelines);
  const seedRoutes = buildRoutes();
  const travelEvents = buildTravelEvents();

  // Block K — real seed data (src/data/routes.json) has 0 entries (confirmed
  // empty), so synthesize one representative route from two real hotspots on
  // the same map state, to actually exercise the route-mapping path this
  // harness checks (not just prove "0 routes round-trips trivially").
  const mapState = worldMapStates.find((s) => hotspots.filter((h) => h.mapId === s.mapId && h.timelineId === s.timelineId).length >= 2);
  const routes = seedRoutes;
  if (mapState) {
    const [from, to] = hotspots.filter((h) => h.mapId === mapState.mapId && h.timelineId === mapState.timelineId);
    routes.push({
      id: 'route-round-trip-check',
      mapStateId: mapState.id,
      fromHotspotId: from.id,
      toHotspotId: to.id,
      label: 'Round-trip check route',
      routeType: 'road',
      visibleInPlayerView: true,
    });
  }

  return {
    timelines,
    locationStates,
    worldMaps: WORLD_MAPS,
    worldMapStates,
    hotspots,
    routes,
    travelEvents,
    placements: [
      // Block K — synthesize one representative placement so this harness
      // proves mapPlacements round-trips too (real seed data has none, by
      // design -- see loadCampaignData.ts's placements:[] comment).
      {
        id: 'plc-round-trip-check',
        arcId: timelines[0].id,
        mapLevel: WORLD_MAPS[0]?.scope ?? 'kingdom',
        mapId: WORLD_MAPS[0]?.id,
        entityKind: 'npc',
        entityId: npcs[0].id,
        title: npcs[0].name,
        position: { x: 0.42, y: 0.58 },
        visibleInPlayerView: true,
      },
    ],
    battleMaps,
    npcs,
    quests,
    enemies,
    images,
    factions,
    locations,
    taverns,
    economy: [],
    economyReference: [],
    shops,
    players,
  };
}

function buildOverlay(): MainCampaignOverlayInput {
  const zone: FactionZone = {
    id: 'zone-round-trip-check',
    timelineId: TIMELINES[0].id,
    mapId: WORLD_MAPS[0]?.id,
    name: 'Round-trip check zone',
    type: 'territory',
    polygon: [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.1 },
      { x: 0.2, y: 0.2 },
    ],
    status: 'stable',
    visibleInPlayerView: true,
    color: '#ff0000',
    description: 'Synthetic zone for the Block K round-trip harness.',
  };
  return {
    capabilities: { economy: true, battleMaps: false } as MainCampaignOverlayInput['capabilities'],
    factionZonesById: { [zone.id]: zone },
  };
}

let failures: string[] = [];
function check(label: string, cond: boolean) {
  if (!cond) failures.push(label);
}

/** Deep, key-order-independent normalization -- `stableStringify` (the real
 * export serializer) sorts object keys, so a naive `JSON.stringify` diff
 * between the pre-export materialized object and the post-import
 * reconstructed object would false-positive on key order alone. This
 * recursively sorts every plain object's keys before stringifying. */
function deepSortedJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort);
    if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>;
      return Object.fromEntries(Object.keys(obj).sort().map((k) => [k, sort(obj[k])]));
    }
    return v;
  };
  return JSON.stringify(sort(value));
}

function idSet(arr: Array<{ id: string }> | undefined): Set<string> {
  return new Set((arr ?? []).map((x) => x.id));
}

function setsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const x of a) if (!b.has(x)) return false;
  return true;
}

// --- run the real pipeline ---
const data = buildGreyholmMainCampaignDataInput();
const overlay = buildOverlay();
const materialized = materializeGreyholmAsUserCampaign(data, overlay);

const exportedText = exportGreyholmUniversal(data, overlay);
check('export produced non-empty text', exportedText.length > 1000);

const DISPOSABLE_TARGET_ID = 'camp-round-trip-disposable-test';
const reconstructed = reconstructUserCampaign(exportedText, DISPOSABLE_TARGET_ID);
check('reconstruction ok', reconstructed.ok === true);
if (!reconstructed.ok || !reconstructed.data) {
  console.error('GREYHOLM_FULL_ROUND_TRIP_FAIL: reconstruction failed:', 'errors' in reconstructed ? reconstructed.errors : []);
  process.exit(1);
}
const imported: UserCampaignData = reconstructed.data;

// --- root identity: Case B -- imported id MUST differ from both the
// materialized placeholder and Greyholm's own registry id; content ids are
// what must match, never the root id. ---
check('imported campaignId is the caller-supplied disposable target', imported.campaignId === DISPOSABLE_TARGET_ID);
check('imported campaignId differs from the materialized placeholder', imported.campaignId !== materialized.campaignId);
check('imported campaignId differs from Greyholm\'s own registry id', imported.campaignId !== 'greyholm:main');

// --- original source (materialized) is never mutated by export/import ---
const materializedSnapshotBefore = JSON.stringify(materialized);
void exportGreyholmUniversal(data, overlay); // re-export, must be side-effect-free
check('materializing/exporting again does not mutate the original materialized snapshot', JSON.stringify(materialized) === materializedSnapshotBefore);

// --- per-section semantic comparison ---
type Section = keyof UserCampaignData;
const sections: Section[] = ['locations', 'npcs', 'quests', 'enemies', 'factions', 'images', 'party', 'mapPlacements', 'routes', 'zones', 'arcs'];
for (const section of sections) {
  const src = materialized[section] as Array<{ id: string }> | undefined;
  const imp = imported[section] as Array<{ id: string }> | undefined;
  const srcArr = src ?? [];
  const impArr = imp ?? [];
  if (srcArr.length === 0) continue; // per-section rule applies to non-empty sections only
  check(`${section}: source count == imported count`, srcArr.length === impArr.length);
  check(`${section}: source ID set == imported ID set`, setsEqual(idSet(srcArr), idSet(impArr)));
  // Normalized full-object snapshot equality (element order AND key order
  // independent), sorted by id.
  const normalize = (arr: Array<{ id: string }>) => deepSortedJson([...arr].sort((a, b) => a.id.localeCompare(b.id)));
  check(`${section}: normalized snapshot matches`, normalize(srcArr) === normalize(impArr));
}

// capabilities (object, not array)
check('capabilities: economy toggle preserved', imported.capabilities?.economy === true);
check('capabilities: battleMaps toggle preserved', imported.capabilities?.battleMaps === false);

// --- referential integrity within the imported copy: 0 dangling refs ---
const impLocationIds = idSet(imported.locations);
const impNpcIds = idSet(imported.npcs);
const impImageIds = idSet(imported.images);
let dangling = 0;
for (const npc of imported.npcs) {
  if (npc.locationId && !impLocationIds.has(npc.locationId)) dangling++;
  if (npc.imageId && !impImageIds.has(npc.imageId)) dangling++;
}
for (const quest of imported.quests) {
  if (quest.locationId && !impLocationIds.has(quest.locationId)) dangling++;
  for (const npcId of quest.npcIds ?? []) if (!impNpcIds.has(npcId)) dangling++;
}
for (const enemy of imported.enemies) {
  for (const locId of enemy.locationIds ?? []) if (!impLocationIds.has(locId)) dangling++;
}
for (const placement of imported.mapPlacements) {
  if (placement.entityType === 'npc' && !impNpcIds.has(placement.entityId)) dangling++;
}
check('0 dangling references in the imported copy', dangling === 0);

// --- duplicate IDs within the imported copy ---
let duplicates = 0;
for (const section of sections) {
  const arr = (imported[section] as Array<{ id: string }> | undefined) ?? [];
  const seen = new Set<string>();
  for (const item of arr) {
    if (seen.has(item.id)) duplicates++;
    seen.add(item.id);
  }
}
check('0 duplicate IDs in the imported copy', duplicates === 0);

// --- isolation: mutating/discarding the imported copy is structurally
// impossible to leak back into `materialized`/`data` -- reconstructUserCampaign
// always returns a fresh object graph (JS reference check as a structural proof). ---
check('imported.locations is a different array reference than materialized.locations', imported.locations !== materialized.locations);
check('imported data object is a different reference than materialized', (imported as unknown) !== (materialized as unknown));

if (failures.length) {
  console.error('GREYHOLM_FULL_ROUND_TRIP_FAIL:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({
  ok: true,
  verdict: 'GREYHOLM_FULL_ROUND_TRIP_PASS',
  sectionsChecked: sections,
  sourceCounts: Object.fromEntries(sections.map((s) => [s, ((materialized[s] as Array<unknown> | undefined) ?? []).length])),
}, null, 2));

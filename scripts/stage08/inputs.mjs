// Stage 8 real-data input loaders.
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { readJson, sha256File, deepFreeze } from './lib.mjs';

const root = resolve(process.cwd());
const dmData = (name) => resolve(root, 'public/data/dm-companion', name);
const CALDRAN_FIXTURE = resolve(root, 'scripts/stage08/fixtures/caldran-real-export.json');

/**
 * Caldran — real user-campaign export (Кальдран: Цена имени (плен)).
 * Immutable copy of a live DM Companion export; the original in the user's
 * Downloads folder is never touched by this harness.
 */
export function loadCaldran() {
  const sourcePaths = { export: CALDRAN_FIXTURE };
  const hashesBefore = { export: sha256File(CALDRAN_FIXTURE) };
  const raw = deepFreeze(readJson(CALDRAN_FIXTURE));
  const sourceCollections = countCaldran(raw);
  return {
    name: 'Caldran',
    kind: 'user-campaign',
    sourcePaths,
    hashesBefore,
    raw,
    // Adapter input shape: { data, runtime }
    adapterInput: { data: raw.data, runtime: raw.runtime },
    sourceCollections,
    // What we assert is real vs absent.
    realNotes: 'Full real one-shot export: durable + runtime + battle boards + reveal.',
  };
}

function countCaldran(raw) {
  const d = raw.data;
  const r = raw.runtime ?? {};
  return {
    locations: d.locations.length,
    npcs: d.npcs.length,
    quests: d.quests.length,
    enemies: d.enemies.length,
    images: d.images.length,
    party: (d.party ?? []).length,
    factions: (d.factions ?? []).length,
    mapPlacements: d.mapPlacements.length,
    routes: d.routes.length,
    mapIds: d.mapIds.length,
    zones: (d.zones ?? []).length,
    notes: (d.notes ?? []).length,
    customBattleMaps: (d.customBattleMaps ?? []).length,
    'runtime.battleBoards': Object.keys(r.battleBoards ?? {}).length,
    'runtime.revealedToPlayers': (r.revealedToPlayers ?? []).length,
  };
}

/**
 * Greyholm — real main-campaign content. The durable DM Companion collections
 * (npcs/quests/enemies/images/factions/players/shops/taverns/locations/economy)
 * are the real, committed Greyholm dataset. The battle-map catalog is the real
 * generated battle-map-vtt catalog (139 maps).
 *
 * The timeline-scoped MC collections (worldMaps / locationStates / hotspots /
 * placements / routes / travelEvents) and the live campaign overlay are NOT
 * exercised here: their real source is the baked-TS runtime assembled by
 * loadCampaignData at app runtime plus the browser-localStorage overlay, which
 * is out of Stage 8's read-only scope. They are fed empty so this harness never
 * manufactures unresolved references, and this gap is reported honestly.
 */
export function loadGreyholm() {
  const files = {
    npcs: dmData('npcs.json'),
    quests: dmData('quests.json'),
    enemies: dmData('custom-enemies.json'),
    images: dmData('images.json'),
    factions: dmData('factions.json'),
    players: dmData('players.json'),
    shops: dmData('shops.json'),
    taverns: dmData('taverns.json'),
    locations: dmData('locations.json'),
    economy: dmData('economy.json'),
    economyReference: dmData('economy-reference.json'),
    battleCatalog: resolve(root, 'public/data/battle-map-vtt/catalog.json'),
  };
  for (const [key, path] of Object.entries(files)) {
    if (!existsSync(path)) throw new Error(`Missing Greyholm real data: ${key} -> ${path}`);
  }
  const hashesBefore = Object.fromEntries(Object.entries(files).map(([k, p]) => [k, sha256File(p)]));

  const npcs = deepFreeze(readJson(files.npcs));
  const quests = deepFreeze(readJson(files.quests));
  const enemies = deepFreeze(readJson(files.enemies));
  const images = deepFreeze(readJson(files.images));
  const factions = deepFreeze(readJson(files.factions));
  const players = deepFreeze(readJson(files.players));
  const shops = deepFreeze(readJson(files.shops));
  const taverns = deepFreeze(readJson(files.taverns));
  const economyRef = deepFreeze(readJson(files.economyReference));
  const economy = deepFreeze(readJson(files.economy));
  const catalog = deepFreeze(readJson(files.battleCatalog));
  const battleMaps = catalog.maps;

  const data = {
    timelines: [],
    locationStates: [],
    worldMaps: [],
    worldMapStates: [],
    hotspots: [],
    routes: [],
    travelEvents: [],
    placements: [],
    battleMaps,
    npcs,
    quests,
    enemies,
    images,
    factions,
    locations: deepFreeze(readJson(files.locations)),
    taverns,
    economy: Array.isArray(economy) ? economy : (economy.entries ?? []),
    economyReference: economyRef,
    shops,
    players,
  };

  const sourceCollections = {
    npcs: npcs.length,
    quests: quests.length,
    enemies: enemies.length,
    images: images.length,
    factions: factions.length,
    players: players.length,
    shops: shops.length,
    taverns: taverns.length,
    battleMaps: battleMaps.length,
  };

  return {
    name: 'Greyholm',
    kind: 'main-campaign',
    sourcePaths: files,
    hashesBefore,
    raw: { data },
    adapterInput: { data, overlay: {} },
    sourceCollections,
    realNotes:
      'Real DM Companion durable collections + real 139-map battle catalog. ' +
      'Timeline/worldMap/locationState/placement/route collections and live overlay are out of read-only scope (baked-TS + localStorage) and fed empty.',
    absent: ['worldMaps', 'worldMapStates', 'locationStates', 'hotspots', 'placements', 'routes', 'travelEvents', 'timelines', 'liveOverlay'],
  };
}

export function reHashInputs(campaign) {
  const after = {};
  for (const [key, path] of Object.entries(campaign.sourcePaths)) {
    after[key] = sha256File(path);
  }
  return after;
}

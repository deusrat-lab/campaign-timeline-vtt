// Stage 8d — builds the REAL merged effective Greyholm CampaignData in Node,
// exactly as the app does at runtime:
//   base = loadCampaignData()            (real src/data loader, compiled)
//   merged = <useCampaignData merge>     (real applyOverlayToList + helpers)
//
// The merge body and its four helper functions are transcribed VERBATIM from
// src/state/campaignDataContext.tsx (useCampaignData) — same call order, same
// logic — so this is the documented contract, not a speculative re-merge.
// `fetch` is polyfilled to read the committed public/data JSON off disk.
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);

const PUBLIC = resolve(process.cwd(), 'public');

// Polyfill fetch for loadCampaignData / battleMapManifest, which fetch
// '/data/...'. Map the URL path onto the committed public/ tree.
if (!globalThis.__stage8dFetchPatched) {
  globalThis.fetch = async (url) => {
    const path = String(url).replace(/^https?:\/\/[^/]+/, '');
    const file = resolve(PUBLIC, `.${path}`);
    const text = readFileSync(file, 'utf8');
    return {
      ok: true,
      status: 200,
      json: async () => JSON.parse(text),
      text: async () => text,
    };
  };
  globalThis.__stage8dFetchPatched = true;
}

const { loadCampaignData } = require('./.dist/data/loadCampaignData.js');
const { applyOverlayToList } = require('./.dist/state/overlay.js');

// ── helpers transcribed verbatim from campaignDataContext.tsx (types stripped) ──
function mergeBattleMapLocationLinks(base, overrides) {
  const seenKeys = new Set();
  const merged = [];
  for (const l of base) {
    const key = `${l.locationStateId}__${l.battleMapId}`;
    seenKeys.add(key);
    const override = overrides[key];
    if (override?.rejected) continue;
    merged.push(override ?? l);
  }
  for (const [key, override] of Object.entries(overrides)) {
    if (seenKeys.has(key)) continue;
    if (override.rejected) continue;
    merged.push(override);
  }
  return merged;
}

function mirrorArc1RegionHotspotsForArc2(hotspots, locationStates) {
  const existingIds = new Set(hotspots.map((h) => h.id));
  const locationStateIds = new Set(locationStates.map((ls) => ls.id));
  const mirrored = [];
  for (const h of hotspots) {
    if (h.mapId !== 'map-region' || h.timelineId !== 'arc-1-peace') continue;
    if (!h.locationStateId.endsWith('__arc-1-peace')) continue;
    const arc2LocationStateId = h.locationStateId.replace('__arc-1-peace', '__arc-2-war');
    if (!locationStateIds.has(arc2LocationStateId)) continue;
    const id = `arc2-region-copy:${h.id}`;
    if (existingIds.has(id)) continue;
    existingIds.add(id);
    mirrored.push({ ...h, id, mapId: 'map-region-arc2-war', timelineId: 'arc-2-war', locationStateId: arc2LocationStateId, needsCoordinateReview: false });
  }
  return mirrored.length ? [...hotspots, ...mirrored] : hotspots;
}

function attachHotspotsToMapStates(mapStates, hotspots) {
  return mapStates.map((ms) => {
    const ids = hotspots.filter((h) => h.mapId === ms.mapId && h.timelineId === ms.timelineId).map((h) => h.id);
    const merged = Array.from(new Set([...ms.hotspotIds, ...ids]));
    return merged.length === ms.hotspotIds.length && merged.every((id, index) => id === ms.hotspotIds[index]) ? ms : { ...ms, hotspotIds: merged };
  });
}

function sanitizeArc2VelKarNpcLinks(locationStates, npcs) {
  const npcById = new Map(npcs.map((npc) => [npc.id, npc]));
  return locationStates.map((state) => {
    if (state.locationId !== 'arc2:location:kal:vel-kar-forward-camp' || state.timelineId !== 'arc-2-war') return state;
    const npcIds = state.npcIds.filter((npcId) => npcById.get(npcId)?.primaryFactionId !== 'faction-auroleon');
    return npcIds.length === state.npcIds.length ? state : { ...state, npcIds };
  });
}

// ── merge body transcribed verbatim from useCampaignData() ──
function mergeOverlay(base, overlay) {
  const npcs = applyOverlayToList(
    base.npcs.map((npc) => ({ ...npc, visibleToPlayers: false })),
    overlay.npcPatches,
    overlay.newNpcs,
  );
  const locations = applyOverlayToList(base.locations, overlay.locationPatches, []);
  const locationImagesByLocationId = new Map(locations.map((loc) => [loc.id, loc.images ?? []]));
  const tavernsForArt = applyOverlayToList(base.taverns, overlay.tavernPatches, []);
  const shopsForArt = applyOverlayToList(base.shops, overlay.shopPatches, []);
  const baseImages = base.images;
  const tavernById = new Map(tavernsForArt.map((t) => [t.id, t]));
  const shopById = new Map(shopsForArt.map((s) => [s.id, s]));
  function sourceEntityArtImageId(ls) {
    if (ls.sourceLibraryType === 'tavern' && ls.sourceLibraryId) {
      const t = tavernById.get(ls.sourceLibraryId);
      if (!t) return undefined;
      if (t.imageOverrideId) return t.imageOverrideId;
      const linked = baseImages.find((i) => i.relatedEntity === t.id || i.linkedLocationIds?.includes(t.id) || t.relatedImages?.includes(i.id));
      return linked?.id;
    }
    if (ls.sourceLibraryType === 'shop' && ls.sourceLibraryId) {
      const s = shopById.get(ls.sourceLibraryId);
      if (!s) return undefined;
      if (s.image) return s.image;
      const linked = baseImages.find((i) => i.relatedEntity === s.id || i.linkedLocationIds?.includes(s.id));
      return linked?.id;
    }
    return undefined;
  }
  const locationStatesWithImages = applyOverlayToList(base.locationStates, overlay.locationStatePatches, overlay.newLocationStates).map((ls) => {
    const extraIds = [...(locationImagesByLocationId.get(ls.locationId) ?? [])];
    const artId = sourceEntityArtImageId(ls);
    if (artId) extraIds.push(artId);
    if (extraIds.length === 0) return ls;
    const merged = [...ls.imageIds];
    for (const id of extraIds) if (!merged.includes(id)) merged.push(id);
    return merged.length === ls.imageIds.length ? ls : { ...ls, imageIds: merged };
  });
  const locationStates = sanitizeArc2VelKarNpcLinks(locationStatesWithImages, npcs);
  const projectedHotspots = mirrorArc1RegionHotspotsForArc2(
    applyOverlayToList(base.hotspots, overlay.hotspotPatches, overlay.newHotspots),
    locationStates,
  );
  const hotspots = applyOverlayToList(projectedHotspots, overlay.hotspotPatches, []);
  const worldMapStates = attachHotspotsToMapStates(
    applyOverlayToList(base.worldMapStates, overlay.worldMapStatePatches, overlay.newWorldMapStates),
    hotspots,
  );
  return {
    ...base,
    timelines: applyOverlayToList(base.timelines, overlay.timelinePatches, overlay.newTimelines),
    worldMaps: applyOverlayToList(base.worldMaps, overlay.worldMapPatches, overlay.newWorldMaps),
    worldMapStates,
    locationStates,
    hotspots,
    routes: applyOverlayToList(base.routes, overlay.routePatches, overlay.newRoutes),
    travelEvents: applyOverlayToList(base.travelEvents, overlay.travelEventPatches, overlay.newTravelEvents),
    placements: applyOverlayToList(base.placements, overlay.placementPatches, overlay.newPlacements),
    npcs,
    taverns: tavernsForArt,
    shops: shopsForArt,
    images: applyOverlayToList(base.images.map((image) => ({ ...image, safeForPlayers: true })), overlay.imagePatches, overlay.newImages),
    quests: applyOverlayToList(base.quests, overlay.questPatches, []),
    enemies: applyOverlayToList(base.enemies, overlay.enemyPatches, overlay.newEnemies),
    players: applyOverlayToList(base.players, overlay.playerPatches, []),
    economyReference: applyOverlayToList(base.economyReference, overlay.economyReferencePatches, []),
    locations,
    battleMapLocationLinks: mergeBattleMapLocationLinks(base.battleMapLocationLinks, overlay.battleMapLocationLinkOverrides),
  };
}

/** Loads the real seed then applies the real overlay, returning merged CampaignData. */
export async function buildRealGreyholmData(overlay) {
  const base = await loadCampaignData();
  return { base, merged: mergeOverlay(base, overlay) };
}

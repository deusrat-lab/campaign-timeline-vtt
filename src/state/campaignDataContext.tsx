import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadCampaignData } from '../data/loadCampaignData';
import type { CampaignData } from '../data/loadCampaignData';
import { useCampaignStore } from './campaignStore';
import { applyOverlayToList } from './overlay';
import type { BattleMapLocationLink, LocationState, MapHotspot, WorldMapState } from '../types';
import type { DmNpc } from '../types/dmCompanion';

/**
 * Merges re-derived battle-map<->location links with the DM override layer:
 *  - base links whose pair has a 'rejected' override are dropped entirely
 *    (so they don't reappear from re-derivation on reload);
 *  - base links whose pair has a non-rejected override are replaced by the
 *    override (e.g. promoted to confidence: 'exact' via "Подтвердить");
 *  - override entries with no matching base link (manual additions via
 *    "addManualBattleMapLink") are appended.
 */
function mergeBattleMapLocationLinks(
  base: BattleMapLocationLink[],
  overrides: Record<string, BattleMapLocationLink>,
): BattleMapLocationLink[] {
  const seenKeys = new Set<string>();
  const merged: BattleMapLocationLink[] = [];

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

function mirrorArc1RegionHotspotsForArc2(
  hotspots: MapHotspot[],
  locationStates: LocationState[],
): MapHotspot[] {
  const existingIds = new Set(hotspots.map((h) => h.id));
  const locationStateIds = new Set(locationStates.map((ls) => ls.id));
  const mirrored: MapHotspot[] = [];
  for (const h of hotspots) {
    if (h.mapId !== 'map-region' || h.timelineId !== 'arc-1-peace') continue;
    if (!h.locationStateId.endsWith('__arc-1-peace')) continue;
    const arc2LocationStateId = h.locationStateId.replace('__arc-1-peace', '__arc-2-war');
    if (!locationStateIds.has(arc2LocationStateId)) continue;
    const id = `arc2-region-copy:${h.id}`;
    if (existingIds.has(id)) continue;
    existingIds.add(id);
    mirrored.push({
      ...h,
      id,
      mapId: 'map-region-arc2-war',
      timelineId: 'arc-2-war',
      locationStateId: arc2LocationStateId,
      needsCoordinateReview: false,
    });
  }
  return mirrored.length ? [...hotspots, ...mirrored] : hotspots;
}

function attachHotspotsToMapStates(mapStates: WorldMapState[], hotspots: MapHotspot[]): WorldMapState[] {
  return mapStates.map((ms) => {
    const ids = hotspots
      .filter((h) => h.mapId === ms.mapId && h.timelineId === ms.timelineId)
      .map((h) => h.id);
    const merged = Array.from(new Set([...ms.hotspotIds, ...ids]));
    return merged.length === ms.hotspotIds.length && merged.every((id, index) => id === ms.hotspotIds[index])
      ? ms
      : { ...ms, hotspotIds: merged };
  });
}

function sanitizeArc2VelKarNpcLinks(locationStates: LocationState[], npcs: DmNpc[]): LocationState[] {
  const npcById = new Map(npcs.map((npc) => [npc.id, npc]));
  return locationStates.map((state) => {
    if (state.locationId !== 'arc2:location:kal:vel-kar-forward-camp' || state.timelineId !== 'arc-2-war') {
      return state;
    }
    const npcIds = state.npcIds.filter((npcId) => npcById.get(npcId)?.primaryFactionId !== 'faction-auroleon');
    return npcIds.length === state.npcIds.length ? state : { ...state, npcIds };
  });
}

interface CampaignDataState {
  data: CampaignData | null;
  loading: boolean;
  error: string | null;
}

const BaseCampaignDataContext = createContext<CampaignDataState>({ data: null, loading: true, error: null });

/** Loads the read-only seed/base layer once (dm-companion JSON + our seeds). */
export function CampaignDataProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CampaignDataState>({ data: null, loading: true, error: null });

  useEffect(() => {
    loadCampaignData()
      .then((data) => setState({ data, loading: false, error: null }))
      .catch((err) => setState({ data: null, loading: false, error: String(err) }));
  }, []);

  return <BaseCampaignDataContext.Provider value={state}>{children}</BaseCampaignDataContext.Provider>;
}

function useBaseCampaignData(): CampaignDataState {
  return useContext(BaseCampaignDataContext);
}

/**
 * Merges the read-only base layer with the localStorage overlay (DM edits),
 * so every page that calls useCampaignData() automatically sees DM Edit Mode
 * changes without needing its own merge logic.
 */
export function useCampaignData(): CampaignDataState {
  const base = useBaseCampaignData();
  const overlay = useCampaignStore();

  const merged = useMemo<CampaignData | null>(() => {
    if (!base.data) return null;
    const npcs = applyOverlayToList(
      base.data.npcs.map((npc) => ({ ...npc, visibleToPlayers: false })),
      overlay.npcPatches,
      overlay.newNpcs,
    );
    // Resolve the base-location list (with DM edits) FIRST, so the
    // locationState build below can back-fill from it. `locationState.imageIds`
    // is derived once, at load time, from the SEED location.images (see
    // buildLocationStates in loadCampaignData.ts) — it is NOT re-derived when a
    // DM later edits a location and the edit lands in `overlay.locationPatches`
    // as `location.images`. That left a stale, empty `imageIds` on locations
    // whose art was added via a location edit (e.g. "Магическая коллегия",
    // whose art `tg-img-11` lives in the patched `location.images` but never
    // reached `locationState.imageIds`). Every consumer that reads
    // `ls.imageIds` directly (the "Изображения: N" count, LocationSidePanel's
    // header image shown to players) then saw nothing, so a revealed location's
    // art was invisible to players even though the DM could see it. Union the
    // two here, once, so all of those read sites are correct without each
    // needing its own fallback.
    const locations = applyOverlayToList(base.data.locations, overlay.locationPatches, []);
    const locationImagesByLocationId = new Map(locations.map((loc) => [loc.id, loc.images ?? []]));
    // Taverns/shops carry their own art (a tavern's `imageOverrideId`, or an
    // image whose `relatedEntity`/`linkedLocationIds`/`relatedImages` points at
    // it) that lives OUTSIDE `locationState.imageIds`. A tavern placed on the
    // map materializes as a LocationState tagged `sourceLibraryType:'tavern'`,
    // and the DM's card resolves that art via `resolveEntityPreviewImage`, but
    // every player-facing read (the "Изображения: N" count, the hero image in
    // LocationSidePanel, the PlayerSafeCompanionWindow) reads `ls.imageIds`
    // directly — which was empty for such places. Result: a revealed tavern
    // (e.g. «Синяя Форель») showed "Изображения: 0" and no picture to players,
    // while a tavern whose art happened to already be in imageIds («Золотой
    // Колокол») showed fine. Resolve the source entity's art image id here and
    // union it into imageIds so all those sites just work.
    const tavernsForArt = applyOverlayToList(base.data.taverns, overlay.tavernPatches, []);
    const shopsForArt = applyOverlayToList(base.data.shops, overlay.shopPatches, []);
    const baseImages = base.data.images;
    const tavernById = new Map(tavernsForArt.map((t) => [t.id, t]));
    const shopById = new Map(shopsForArt.map((s) => [s.id, s]));
    function sourceEntityArtImageId(ls: LocationState): string | undefined {
      if (ls.sourceLibraryType === 'tavern' && ls.sourceLibraryId) {
        const t = tavernById.get(ls.sourceLibraryId);
        if (!t) return undefined;
        if (t.imageOverrideId) return t.imageOverrideId;
        const linked = baseImages.find(
          (i) => i.relatedEntity === t.id || i.linkedLocationIds?.includes(t.id) || t.relatedImages?.includes(i.id),
        );
        return linked?.id;
      }
      if (ls.sourceLibraryType === 'shop' && ls.sourceLibraryId) {
        const s = shopById.get(ls.sourceLibraryId);
        if (!s) return undefined;
        if (s.image) return s.image;
        const linked = baseImages.find(
          (i) => i.relatedEntity === s.id || i.linkedLocationIds?.includes(s.id),
        );
        return linked?.id;
      }
      return undefined;
    }
    const locationStatesWithImages = applyOverlayToList(base.data.locationStates, overlay.locationStatePatches, overlay.newLocationStates).map((ls) => {
      const extraIds = [...(locationImagesByLocationId.get(ls.locationId) ?? [])];
      const artId = sourceEntityArtImageId(ls);
      if (artId) extraIds.push(artId);
      if (extraIds.length === 0) return ls;
      const merged = [...ls.imageIds];
      for (const id of extraIds) if (!merged.includes(id)) merged.push(id);
      return merged.length === ls.imageIds.length ? ls : { ...ls, imageIds: merged };
    });
    const locationStates = sanitizeArc2VelKarNpcLinks(
      locationStatesWithImages,
      npcs,
    );
    const projectedHotspots = mirrorArc1RegionHotspotsForArc2(
      applyOverlayToList(base.data.hotspots, overlay.hotspotPatches, overlay.newHotspots),
      locationStates,
    );
    // Arc 2 region points can be mirrored from Arc 1 after the first overlay
    // merge, so their own patches must be applied once more after projection.
    const hotspots = applyOverlayToList(projectedHotspots, overlay.hotspotPatches, []);
    const worldMapStates = attachHotspotsToMapStates(
      applyOverlayToList(
        base.data.worldMapStates,
        overlay.worldMapStatePatches,
        overlay.newWorldMapStates,
      ),
      hotspots,
    );
    return {
      ...base.data,
      timelines: applyOverlayToList(base.data.timelines, overlay.timelinePatches, overlay.newTimelines),
      worldMaps: applyOverlayToList(base.data.worldMaps, overlay.worldMapPatches, overlay.newWorldMaps),
      worldMapStates,
      locationStates,
      hotspots,
      routes: applyOverlayToList(base.data.routes, overlay.routePatches, overlay.newRoutes),
      travelEvents: applyOverlayToList(base.data.travelEvents, overlay.travelEventPatches, overlay.newTravelEvents),
      placements: applyOverlayToList(base.data.placements, overlay.placementPatches, overlay.newPlacements),
      npcs,
      taverns: tavernsForArt,
      shops: shopsForArt,
      // Default ALL images to player-visible (per the DM's request: "по
      // умолчанию сделай все картинки... открытыми для игроков"). The seed
      // data was bulk-imported with `safeForPlayers: false` on ~225 of 420
      // images — not a deliberate per-image DM choice — which hid location
      // and NPC art from players everywhere. Forcing the base default to
      // true neutralizes that bulk flag while still letting an explicit DM
      // hide win: `overlay.imagePatches` is applied AFTER this map, so a
      // `patchImage(id, { safeForPlayers: false })` the DM makes later still
      // takes effect. Every `safeForPlayers !== false` player-side check
      // then just works, no per-call-site change needed.
      images: applyOverlayToList(
        base.data.images.map((image) => ({ ...image, safeForPlayers: true })),
        overlay.imagePatches,
        overlay.newImages,
      ),
      quests: applyOverlayToList(base.data.quests, overlay.questPatches, []),
      enemies: applyOverlayToList(base.data.enemies, overlay.enemyPatches, overlay.newEnemies),
      players: applyOverlayToList(base.data.players, overlay.playerPatches, []),
      economyReference: applyOverlayToList(base.data.economyReference, overlay.economyReferencePatches, []),
      locations,
      battleMapLocationLinks: mergeBattleMapLocationLinks(
        base.data.battleMapLocationLinks,
        overlay.battleMapLocationLinkOverrides,
      ),
    };
  }, [base.data, overlay]);

  return { data: merged, loading: base.loading, error: base.error };
}

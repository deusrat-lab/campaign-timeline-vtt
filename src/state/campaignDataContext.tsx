import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { loadCampaignData } from '../data/loadCampaignData';
import type { CampaignData } from '../data/loadCampaignData';
import { useCampaignStore } from './campaignStore';
import { applyOverlayToList } from './overlay';
import type { BattleMapLocationLink } from '../types';

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
    return {
      ...base.data,
      timelines: applyOverlayToList(base.data.timelines, overlay.timelinePatches, overlay.newTimelines),
      worldMaps: applyOverlayToList(base.data.worldMaps, overlay.worldMapPatches, overlay.newWorldMaps),
      worldMapStates: applyOverlayToList(
        base.data.worldMapStates,
        overlay.worldMapStatePatches,
        overlay.newWorldMapStates,
      ),
      locationStates: applyOverlayToList(
        base.data.locationStates,
        overlay.locationStatePatches,
        overlay.newLocationStates,
      ),
      hotspots: applyOverlayToList(base.data.hotspots, overlay.hotspotPatches, overlay.newHotspots),
      routes: applyOverlayToList(base.data.routes, overlay.routePatches, overlay.newRoutes),
      travelEvents: applyOverlayToList(base.data.travelEvents, overlay.travelEventPatches, overlay.newTravelEvents),
      placements: applyOverlayToList(base.data.placements, overlay.placementPatches, overlay.newPlacements),
      npcs: applyOverlayToList(base.data.npcs, overlay.npcPatches, overlay.newNpcs),
      taverns: applyOverlayToList(base.data.taverns, overlay.tavernPatches, []),
      shops: applyOverlayToList(base.data.shops, overlay.shopPatches, []),
      images: applyOverlayToList(base.data.images, overlay.imagePatches, []),
      battleMapLocationLinks: mergeBattleMapLocationLinks(
        base.data.battleMapLocationLinks,
        overlay.battleMapLocationLinkOverrides,
      ),
    };
  }, [base.data, overlay]);

  return { data: merged, loading: base.loading, error: base.error };
}

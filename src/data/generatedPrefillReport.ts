/**
 * Computes a DM-facing summary of how much of the seed/derived data was
 * successfully pre-filled vs. needs manual review, for display on HomePage.
 * Pure function over already-loaded CampaignData — not persisted, recomputed
 * on every load (and whenever the overlay changes, since callers should pass
 * the merged CampaignData from useCampaignData()).
 */
import type { CampaignData } from './loadCampaignData';
import { LOCATION_HIERARCHY_OVERLAY } from './locationHierarchy';

export interface PrefillReport {
  totalLocationsImported: number;
  locationStatesPerTimeline: { timelineId: string; timelineTitle: string; count: number }[];
  npcsLinked: number;
  questsLinked: number;
  enemiesLinked: number;
  imagesLinked: number;
  battleMapLinksByConfidence: { exact: number; likely: number; manual_required: number };
  hotspotsByCoordinateReview: { needsReview: number; ok: number };
  hierarchyLinksBySource: { inferred: number; sourced: number };
  needsManualReview: {
    battleMapIds: string[];
    hotspotLabels: string[];
    hierarchyLocationIds: string[];
  };
}

export function buildPrefillReport(data: CampaignData): PrefillReport {
  const locationStatesPerTimeline = data.timelines.map((t) => ({
    timelineId: t.id,
    timelineTitle: t.title,
    count: data.locationStates.filter((ls) => ls.timelineId === t.id).length,
  }));

  const npcsLinked = data.locationStates.reduce((sum, ls) => sum + ls.npcIds.length, 0);
  const questsLinked = data.locationStates.reduce((sum, ls) => sum + ls.questIds.length, 0);
  const enemiesLinked = data.locationStates.reduce((sum, ls) => sum + ls.enemyIds.length, 0);
  const imagesLinked = data.locationStates.reduce((sum, ls) => sum + ls.imageIds.length, 0);

  const battleMapLinksByConfidence = {
    exact: data.battleMapLocationLinks.filter((b) => b.confidence === 'exact').length,
    likely: data.battleMapLocationLinks.filter((b) => b.confidence === 'likely').length,
    manual_required: data.battleMapLocationLinks.filter((b) => b.confidence === 'manual_required').length,
  };

  const hotspotsByCoordinateReview = {
    needsReview: data.hotspots.filter((h) => h.needsCoordinateReview).length,
    ok: data.hotspots.filter((h) => !h.needsCoordinateReview).length,
  };

  const hierarchyLinksBySource = {
    inferred: LOCATION_HIERARCHY_OVERLAY.filter((l) => l.source === 'inferred').length,
    sourced: LOCATION_HIERARCHY_OVERLAY.filter((l) => l.source === 'sourced').length,
  };

  const needsManualReview = {
    battleMapIds: data.battleMapLocationLinks.filter((b) => b.confidence === 'manual_required').map((b) => b.battleMapId),
    hotspotLabels: data.hotspots.filter((h) => h.needsCoordinateReview).map((h) => h.label),
    hierarchyLocationIds: LOCATION_HIERARCHY_OVERLAY.filter((l) => l.source === 'inferred').map((l) => l.locationId),
  };

  return {
    totalLocationsImported: data.locations.length,
    locationStatesPerTimeline,
    npcsLinked,
    questsLinked,
    enemiesLinked,
    imagesLinked,
    battleMapLinksByConfidence,
    hotspotsByCoordinateReview,
    hierarchyLinksBySource,
    needsManualReview,
  };
}

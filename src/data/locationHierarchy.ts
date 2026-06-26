/**
 * Gap-filling location hierarchy overlay.
 *
 * dm-companion/public/data/locations.json defines `parentLocationId` and
 * `childLocationIds` fields on every location, but as of this writing NONE
 * of the 73 seed locations actually populate them (verified by reading the
 * file: every parentLocationId/childLocationIds is absent/empty).
 *
 * Since campaign-timeline-vtt needs a usable tree (kingdom -> region -> city
 * -> district) for the map level selector and the LocationPage "Navigation"
 * section, this file supplies INFERRED parent links for the Arc-1 Greyholm
 * city + immediate region, based on each location's own `region` field and
 * naming. These are overlay-only — dm-companion's JSON is never edited.
 *
 * Every entry below is marked with its source:
 *   - 'inferred': we derived the parent from the `region` field / domain
 *     knowledge of the city, not from any explicit field in the JSON.
 *   - 'sourced': would mean it came directly from parentLocationId in the
 *     JSON — none currently qualify, but the shape is kept for when seed
 *     data is eventually filled in upstream.
 */

export interface InferredParentLink {
  locationId: string;
  parentLocationId: string;
  source: 'inferred' | 'sourced';
  note: string;
}

/**
 * Two structural/technical hierarchy container ids, synthesized purely to
 * give the map level selector (kingdom -> region -> city) real nodes to
 * point at. They are not lore entities — see SYNTHETIC_HIERARCHY_LOCATIONS
 * in loadCampaignData.ts for the actual LocationState/DmLocation-shaped
 * records, named directly off the map art:
 *   - "Kingdom of Aurelon" visible on public/maps/kingdom/kingdom_arc1_peace.jpeg
 *   - "Caldran" visible on public/maps/regions/greyholm_region_arc1_peace.jpeg
 */
export const KINGDOM_LOCATION_ID = 'loc-kingdom-aurelon';
export const REGION_LOCATION_ID = 'loc-region-caldran';

export const LOCATION_HIERARCHY_OVERLAY: InferredParentLink[] = [
  // Structural container nodes: region -> kingdom, and loc-greyholm -> region.
  // INFERRED purely for map-level navigation purposes; no lore claim is made
  // beyond the names visible on the map art itself.
  { locationId: REGION_LOCATION_ID, parentLocationId: KINGDOM_LOCATION_ID, source: 'inferred', note: 'Map-art hierarchy: Caldran region sits inside the Kingdom of Aurelon on kingdom_arc1_peace.jpeg' },
  { locationId: 'loc-greyholm', parentLocationId: REGION_LOCATION_ID, source: 'inferred', note: 'Map-art hierarchy: Greyholm is the central city of the Caldran region on greyholm_region_arc1_peace.jpeg' },

  // Greyholm city districts -> Greyholm city (loc-greyholm).
  // INFERRED from region === 'Грейхольм' matching the city location's own name.
  { locationId: 'loc-greyholm-market', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },
  { locationId: 'loc-greyholm-caravan-yards', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },
  { locationId: 'loc-greyholm-river-docks', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },
  { locationId: 'loc-greyholm-guild', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },
  { locationId: 'loc-greyholm-mayor-palace', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },
  { locationId: 'loc-greyholm-mage-tower', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },
  { locationId: 'loc-greyholm-mage-college', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },
  { locationId: 'loc-greyholm-temple-quarter', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },
  { locationId: 'loc-greyholm-walls', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Грейхольм"' },

  // Greyholm-region locations -> Greyholm city, as the nearest hub.
  // INFERRED purely from region === 'Окрестности Грейхольма' (lit. "outskirts of Greyholm").
  { locationId: 'loc-dense-forest-road', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Окрестности Грейхольма"' },
  { locationId: 'loc-lashdale', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Окрестности Грейхольма"' },
  { locationId: 'loc-dunwood', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Окрестности Грейхольма"' },
  { locationId: 'loc-lake-rundel', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Окрестности Грейхольма"' },
  { locationId: 'loc-southern-hills', parentLocationId: 'loc-greyholm', source: 'inferred', note: 'region field = "Окрестности Грейхольма"' },
];

export function getInferredParentId(locationId: string): string | undefined {
  return LOCATION_HIERARCHY_OVERLAY.find((l) => l.locationId === locationId)?.parentLocationId;
}

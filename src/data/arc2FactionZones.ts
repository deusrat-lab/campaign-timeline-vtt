import type { FactionZone } from '../types';

export const LEGACY_ARC2_SEEDED_FACTION_ZONE_IDS = [
  'arc2-zone-kaldran-main',
  'arc2-zone-auroleon-main',
  'arc2-zone-grey-front',
  'arc2-zone-grey-cloaks',
  'arc2-zone-blekmark',
  'arc2-zone-firbolgs',
  'arc2-zone-karad-dum',
];

// Arc 2 starts without authored influence polygons. Grey territory is the
// empty space between DM-created zones, not a separate prefilled polygon.
export const ARC2_FACTION_ZONES: FactionZone[] = [];

export const ARC2_FACTION_ZONES_BY_ID: Record<string, FactionZone> = Object.fromEntries(
  ARC2_FACTION_ZONES.map((z) => [z.id, z]),
);

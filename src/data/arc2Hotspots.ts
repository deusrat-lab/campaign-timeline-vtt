import type { MapHotspot } from '../types';

// Arc 2 locations are seeded as cards, but their map positions are now fully
// DM-authored. Do not auto-place temporary "position not confirmed" markers.
export const ARC2_HOTSPOTS: MapHotspot[] = [];

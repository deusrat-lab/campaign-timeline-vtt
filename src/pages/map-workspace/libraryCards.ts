import type { BattleEntry, MapHotspot } from '../../types';
import type { DmNpc, DmQuest, DmCustomEnemy, DmImageItem, DmTavern, DmShop } from '../../types/dmCompanion';
import { getBattleMapById, getBattleMapPreviewUrl } from './battleMapManifestHelpers';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';

/**
 * Stage 6C.3A — shared, read-only view-model + resolvers for every "existing
 * prepared content" card shown in the Library panel and the map-click
 * Existing Object Picker. Pure functions only: nothing here mutates source
 * data, stores anything, or decides placement — callers (LibraryPanel /
 * the picker in MapWorkspacePage.tsx) still own that. The point is just to
 * stop re-deriving "what image/description does this NPC/quest/enemy/battle
 * entry have" in N different places with N different bugs.
 */

export type LibrarySourceType =
  | 'location'
  | 'npc'
  | 'tavern'
  | 'shop'
  | 'quest'
  | 'enemy'
  | 'battleEntry'
  | 'image';

/** Fallback glyph shown when no real preview image resolves — never a
 * broken-image icon, always a deliberate placeholder. */
export const LIBRARY_FALLBACK_ICON: Record<LibrarySourceType, string> = {
  location: '🗺️',
  npc: '🧑',
  tavern: '🍺',
  shop: '🛒',
  quest: '📜',
  enemy: '⚔️',
  battleEntry: '🗡️',
  image: '🖼️',
};

export interface LibraryCardImage {
  src: string;
  thumbnailSrc?: string;
  title?: string;
}

/** Resolves an images.json id (as carried on `npc.image`/`shop.image`/
 * `enemy.image`, all confirmed-by-data ids, not raw paths) to a renderable
 * image, or undefined if absent/unresolvable. Never throws on missing data. */
function imageById(images: DmImageItem[], id: string | undefined): LibraryCardImage | undefined {
  if (!id) return undefined;
  const img = images.find((i) => i.id === id);
  if (!img) return undefined;
  return { src: img.src, thumbnailSrc: img.thumbnailSrc, title: img.title };
}

/** Resolves the first image linked to a location/tavern by relation (id
 * lookup via `relatedEntity`/`linkedLocationIds`/`relatedImages`) — mirrors
 * the exact convention `loadCampaignData.ts` already uses to compute
 * `LocationState.imageIds` (first id = "header" image, by established
 * convention at MapWorkspacePage.tsx's `headerImage = images[0]`). */
function firstLinkedImage(images: DmImageItem[], entityId: string, relatedImageIds?: string[]): LibraryCardImage | undefined {
  const linked = images.filter(
    (i) => i.relatedEntity === entityId || i.linkedLocationIds?.includes(entityId) || relatedImageIds?.includes(i.id),
  );
  if (linked.length === 0) return undefined;
  return { src: linked[0].src, thumbnailSrc: linked[0].thumbnailSrc, title: linked[0].title };
}

/**
 * Resolves a preview image for any supported entity type. Returns undefined
 * (never a broken-image src) when no real link exists — callers must render
 * `LIBRARY_FALLBACK_ICON[type]` in that case.
 */
export function resolveEntityPreviewImage(
  type: LibrarySourceType,
  entity: unknown,
  images: DmImageItem[],
  battleMaps?: BattleMapManifestEntry[],
): LibraryCardImage | undefined {
  switch (type) {
    case 'npc': {
      // Stage 6C.5 Phase 2E-Reset — mirrors DM Companion's own fallback
      // chain (`utils/entityPreview.ts`): direct `image` id first, then
      // fall back to a relation lookup by the NPC's own id. Previously
      // this case had no fallback at all, so an NPC with no direct
      // `image` field (but with a related image in images.json) always
      // showed the placeholder icon even when a real image existed.
      const n = entity as DmNpc;
      return imageById(images, n.image) ?? firstLinkedImage(images, n.id);
    }
    case 'shop':
      return imageById(images, (entity as DmShop).image) ?? firstLinkedImage(images, (entity as DmShop).id);
    case 'enemy': {
      const e = entity as DmCustomEnemy;
      return imageById(images, e.image) ?? firstLinkedImage(images, e.id);
    }
    case 'quest':
      return imageById(images, (entity as DmQuest).image) ?? firstLinkedImage(images, (entity as DmQuest).id);
    case 'tavern': {
      const t = entity as DmTavern;
      return imageById(images, t.imageOverrideId) ?? firstLinkedImage(images, t.id, t.relatedImages);
    }
    case 'location': {
      // Stage 6C.5 Phase 2D-Fix — `entity` here is a `LocationState`, whose
      // `id` is the composite `${locationId}__${timelineId}` key (see
      // `locationStateId()` in loadCampaignData.ts), not the raw DM
      // Companion location id that `images.json`'s `relatedEntity` field
      // actually carries. Looking up by `entity.id` directly never
      // matched anything. `LocationState.imageIds` is already correctly
      // populated from the raw location's `images` field by
      // `buildLocationStates` — read that directly instead, falling back
      // to the relation lookup keyed by the non-composite `locationId`.
      const loc = entity as { id: string; locationId?: string; imageIds?: string[] };
      const byImageIds = loc.imageIds?.length ? imageById(images, loc.imageIds[0]) : undefined;
      return byImageIds ?? firstLinkedImage(images, loc.locationId ?? loc.id);
    }
    case 'image': {
      const img = entity as DmImageItem;
      return { src: img.src, thumbnailSrc: img.thumbnailSrc, title: img.title };
    }
    case 'battleEntry': {
      const be = entity as BattleEntry;
      const overridden = imageById(images, be.previewImageId);
      if (overridden) return overridden;
      if (!battleMaps) return undefined;
      const manifestEntry = getBattleMapById(battleMaps, be.battleMapId);
      const url = getBattleMapPreviewUrl(manifestEntry);
      return url ? { src: url, title: be.name } : undefined;
    }
    default:
      return undefined;
  }
}

const NO_DESCRIPTION = 'Описание не заполнено';

/**
 * Resolves a short, card-sized description for any supported entity type.
 * Priority generally follows: player-safe/public text > DM's own free text >
 * role/context fields > explicit "not filled in" placeholder. Truncates to
 * `maxLen` chars (default 140) — cards are for scanning, not reading.
 */
export function resolveEntityShortDescription(type: LibrarySourceType, entity: unknown, maxLen = 140): string {
  let text: string | undefined;
  switch (type) {
    case 'npc': {
      const n = entity as DmNpc & { publicDescription?: string };
      text = n.publicDescription || n.personality || n.role;
      break;
    }
    case 'location': {
      const l = entity as { publicDescription?: string; description?: string; type?: string };
      text = l.publicDescription || l.description || l.type;
      break;
    }
    case 'tavern':
    case 'shop': {
      const s = entity as DmTavern | DmShop;
      text = s.description;
      break;
    }
    case 'quest': {
      const q = entity as DmQuest;
      text = q.description || q.goal;
      break;
    }
    case 'enemy': {
      const e = entity as DmCustomEnemy;
      text = [e.role, e.faction].filter(Boolean).join(' · ') || undefined;
      break;
    }
    case 'battleEntry': {
      const be = entity as BattleEntry;
      text = be.playerSafeDescription || be.description;
      break;
    }
    case 'image': {
      const img = entity as DmImageItem;
      text = img.title;
      break;
    }
    default:
      text = undefined;
  }
  const trimmed = (text ?? '').trim();
  if (!trimmed) return NO_DESCRIPTION;
  return trimmed.length > maxLen ? `${trimmed.slice(0, maxLen - 1)}…` : trimmed;
}

export type LibraryPlacementState =
  | 'not_placed'
  | 'placed_current_map'
  | 'placed_other_map'
  | 'linked_to_location_only'
  | 'hidden_from_map';

/** Stage 6C.3A — read-only counts used both for the Library's section
 * headers and for the audit numbers in the Stage report. Pure aggregation
 * over already-loaded data; never recomputes/duplicates source entities. */
export interface LibraryAuditCounts {
  total: number;
  placedCurrentMap: number;
  placedOtherMap: number;
  linkedOnly: number;
  unplaced: number;
  missingImage: number;
  missingDescription: number;
}

export function auditEntityList<T>(
  list: T[],
  opts: {
    hasImage: (item: T) => boolean;
    hasDescription: (item: T) => boolean;
    placement: (item: T) => LibraryPlacementState;
  },
): LibraryAuditCounts {
  const counts: LibraryAuditCounts = {
    total: list.length,
    placedCurrentMap: 0,
    placedOtherMap: 0,
    linkedOnly: 0,
    unplaced: 0,
    missingImage: 0,
    missingDescription: 0,
  };
  for (const item of list) {
    const placement = opts.placement(item);
    if (placement === 'placed_current_map') counts.placedCurrentMap++;
    else if (placement === 'placed_other_map') counts.placedOtherMap++;
    else if (placement === 'linked_to_location_only') counts.linkedOnly++;
    else counts.unplaced++;
    if (!opts.hasImage(item)) counts.missingImage++;
    if (!opts.hasDescription(item)) counts.missingDescription++;
  }
  return counts;
}

/** Locations/taverns/shops materialized via Stage 6C placement all become a
 * `MapHotspot` pointing at a `LocationState` — this is the one placement
 * check every section that CAN be placed shares. */
export function hotspotPlacementState(
  locationStateId: string,
  hotspotsOnCurrentMap: MapHotspot[],
  allHotspots: MapHotspot[],
): 'placed_current_map' | 'placed_other_map' | 'not_placed' {
  if (hotspotsOnCurrentMap.some((h) => h.locationStateId === locationStateId)) return 'placed_current_map';
  if (allHotspots.some((h) => h.locationStateId === locationStateId)) return 'placed_other_map';
  return 'not_placed';
}

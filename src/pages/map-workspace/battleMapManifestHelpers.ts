import { BATTLE_MAP_VTT_ORIGIN } from '../../config';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';

/**
 * Stage 5C, Step 2 — small read-only resolver helpers over the already-loaded
 * battle-map-vtt manifest (`data.battleMaps`, see loadCampaignData.ts /
 * battleMapManifest.ts). Deliberately named `battleMapManifestHelpers.ts`
 * (not `battleMapManifest.ts`) to avoid colliding with the existing loader
 * module at `src/data/battleMapManifest.ts`.
 *
 * `BattleMapManifestEntry` only ever carries `id`/`title`/`normalizedName?`/
 * `variants`/`status?` — there is no scene size, grid size, tag, or arc id on
 * a manifest entry, so none of those are resolved here. The preview-url logic
 * mirrors `BattleMapThumbnail.tsx`'s existing `${BATTLE_MAP_VTT_BASE_URL}${variant.url}`
 * pattern rather than reinventing it.
 */

export function getBattleMapById(
  battleMaps: BattleMapManifestEntry[],
  battleMapId: string | undefined,
): BattleMapManifestEntry | undefined {
  if (!battleMapId) return undefined;
  return battleMaps.find((m) => m.id === battleMapId);
}

/**
 * Picks the first variant that has a `url`, exactly like BattleMapThumbnail's
 * existing resolution order (it's just handed one variant directly there);
 * here we additionally have to pick WHICH variant out of the manifest entry's
 * list, since no single "the" image field exists.
 */
export function getBattleMapPreviewUrl(battleMap: BattleMapManifestEntry | undefined): string | undefined {
  if (!battleMap) return undefined;
  const variantWithUrl = battleMap.variants?.find((v) => v.url);
  if (!variantWithUrl?.url) return undefined;
  return `${BATTLE_MAP_VTT_ORIGIN}${variantWithUrl.url}`;
}

export function getBattleMapDisplayName(
  battleMap: BattleMapManifestEntry | undefined,
  fallbackId: string,
): string {
  return battleMap?.title ?? battleMap?.normalizedName ?? fallbackId;
}

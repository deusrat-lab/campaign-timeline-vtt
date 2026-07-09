import { loadBattleMapManifest, type BattleMapManifestEntry } from './battleMapManifest';
import { BATTLE_MAP_ASSET_ORIGIN } from '../config';

/**
 * Shared, read-only battle-map catalog (battle-map-vtt). Loaded once and
 * reused everywhere — user campaigns pick ready-made battle maps from here
 * instead of building fields from scratch. Nothing is written back.
 */
let cache: BattleMapManifestEntry[] | null = null;
let inflight: Promise<BattleMapManifestEntry[]> | null = null;

export async function getBattleMapCatalog(): Promise<BattleMapManifestEntry[]> {
  if (cache) return cache;
  if (!inflight) {
    inflight = loadBattleMapManifest()
      .then((maps) => { cache = maps; return maps; })
      .catch(() => { cache = []; return []; });
  }
  return inflight;
}

export function getBattleMapById(maps: BattleMapManifestEntry[], id: string): BattleMapManifestEntry | undefined {
  return maps.find((m) => m.id === id);
}

/** Variant types this map actually has (day/evening/night/default), in a
 * stable order. */
export function battleMapVariantTypes(map: BattleMapManifestEntry): string[] {
  const order = ['day', 'evening', 'night', 'default'];
  const present = (map.variants ?? []).map((v) => v.type ?? 'default');
  const uniq = Array.from(new Set(present));
  return uniq.sort((a, b) => order.indexOf(a) - order.indexOf(b));
}

export const BATTLE_VARIANT_LABEL: Record<string, string> = {
  day: 'День', evening: 'Вечер', night: 'Ночь', default: 'Обычный',
};

/** Image URL for a map at a chosen variant (falls back to any available). */
export function battleMapImageUrl(map: BattleMapManifestEntry | undefined, variantType?: string): string | undefined {
  if (!map) return undefined;
  const v = (variantType && map.variants?.find((x) => x.type === variantType && x.url))
    || map.variants?.find((x) => x.url);
  return v?.url ? `${BATTLE_MAP_ASSET_ORIGIN}${v.url}` : undefined;
}

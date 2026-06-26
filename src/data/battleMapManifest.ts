/**
 * Loader + types for the read-only copy of the battle-map-vtt manifest at
 * /public/data/battle-map-vtt/manifest.json. That file is copied verbatim
 * (trimmed to the fields we use) from
 * battle-map-vtt/public/battle-maps/manifest.json — see battleMapLocationLinks.ts
 * for the matching logic that links these maps to LocationStates.
 */

export interface BattleMapVariant {
  type?: string;
  fileName?: string;
  url?: string;
}

export interface BattleMapManifestEntry {
  id: string;
  title: string;
  normalizedName?: string;
  variants: BattleMapVariant[];
  status?: string;
}

export interface BattleMapManifest {
  version: number;
  maps: BattleMapManifestEntry[];
}

const MANIFEST_URL = '/data/battle-map-vtt/manifest.json';

export async function loadBattleMapManifest(): Promise<BattleMapManifestEntry[]> {
  try {
    const res = await fetch(MANIFEST_URL);
    if (!res.ok) return [];
    const json = (await res.json()) as BattleMapManifest;
    return json.maps ?? [];
  } catch {
    return [];
  }
}

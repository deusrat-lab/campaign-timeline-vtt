/**
 * Loader + types for the read-only battle-map-vtt catalog at
 * /public/data/battle-map-vtt/catalog.json. The catalog is generated from
 * battle-map-vtt's manifests + db-export so the campaign map can filter maps
 * by group/arc/size and deep-link into a concrete VTT scene.
 */

export interface BattleMapVariant {
  type?: string;
  fileName?: string;
  url?: string;
}

export interface BattleMapSceneRef {
  id: string;
  name?: string;
  updatedAt?: string;
  tokenCount?: number;
}

export interface BattleMapGroupRef {
  id: string;
  title: string;
  arcId?: string;
}

export interface BattleMapManifestEntry {
  id: string;
  title: string;
  normalizedName?: string;
  variants: BattleMapVariant[];
  status?: string;
  arcId?: string;
  mapSize?: string;
  gridSizeLabel?: string;
  groupIds?: string[];
  groupLabels?: string[];
  labels?: string[];
  scenes?: BattleMapSceneRef[];
  primarySceneId?: string;
  gridStatus?: string;
  gridProfile?: {
    verticalLines?: number[];
    horizontalLines?: number[];
    columns?: number;
    rows?: number;
  } | null;
  navigationProfile?: {
    terrainCells?: Array<{ row: number; column: number; type: 'blocked' | 'difficult' }>;
  } | null;
  terrainCellCount?: number;
  originalSceneTokens?: Array<{
    id: string;
    tokenDefinitionId?: string;
    name: string;
    category?: string;
    side?: 'enemy' | 'player' | 'ally' | 'neutral';
    imageAssetId?: string;
    row: number;
    column: number;
    speedFeet?: number;
    sizeCells?: number;
    instanceNumber?: number;
  }>;
}

export interface BattleMapManifest {
  version: number;
  groups?: BattleMapGroupRef[];
  maps: BattleMapManifestEntry[];
}

const CATALOG_URL = '/data/battle-map-vtt/catalog.json';
const MANIFEST_URL = '/data/battle-map-vtt/manifest.json';

function normalizeBattleMaps(maps: BattleMapManifestEntry[]): BattleMapManifestEntry[] {
  return maps
    .map((map) => {
      const seenVariants = new Set<string>();
      const variants = (map.variants ?? []).filter((variant) => {
        if (!variant.url) return false;
        const key = `${variant.type ?? 'default'}__${variant.url}`;
        if (seenVariants.has(key)) return false;
        seenVariants.add(key);
        return true;
      });
      return { ...map, variants };
    })
    .filter((map) => map.variants.length > 0);
}

export async function loadBattleMapManifest(): Promise<BattleMapManifestEntry[]> {
  const urls = [CATALOG_URL, MANIFEST_URL];
  try {
    for (const url of urls) {
      const res = await fetch(url);
      if (!res.ok) continue;
      const json = (await res.json()) as BattleMapManifest;
      if (json.maps?.length) return normalizeBattleMaps(json.maps);
    }
    return [];
  } catch {
    return [];
  }
}

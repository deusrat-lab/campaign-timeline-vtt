import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import type { BattleMapDefinition, BattleRuntime } from '../battles/types';
import type { CampaignId } from '../campaign/ids';
import type { SourceMetadata } from '../campaign/source';
import { HIDDEN_VISIBILITY, PUBLIC_VISIBILITY } from '../visibility/types';
import { adapterWarning, classification } from './types';
import type { AdapterDiagnostic } from './types';
import { entityIdFromLegacy, runtimeIdFromLegacy } from './idMapping';

export interface BattleMapVttExport {
  version?: string | number;
  maps?: Array<{ id: string; name?: string; title?: string; width?: number; height?: number; image?: string; imageUrl?: string }>;
  scenes?: Array<{ id: string; mapId?: string; name?: string; tokens?: unknown[] }>;
  tokens?: Array<{ id: string; name?: string; mapId?: string; sceneId?: string; x?: number; y?: number; initiative?: number }>;
  assets?: unknown[];
  [key: string]: unknown;
}

export interface BattleMapVttAdapterResult {
  source: SourceMetadata;
  battleMaps: BattleMapDefinition[];
  battleRuntimes: Record<string, BattleRuntime>;
  classifications: ReturnType<typeof classification>[];
  diagnostics: AdapterDiagnostic[];
}

export function adaptBattleMapManifestToDefinitions(
  campaignId: CampaignId,
  manifestMaps: BattleMapManifestEntry[],
  source: SourceMetadata = { kind: 'battle-map-vtt', sourceId: 'manifest' },
): BattleMapVttAdapterResult {
  return {
    source,
    battleMaps: manifestMaps.map((map) => ({
      id: map.id,
      campaignId,
      title: map.title,
      variants: map.variants.map((variant, index) => ({
        id: variant.type ?? `variant-${index}`,
        kind: variant.type === 'day' || variant.type === 'night' || variant.type === 'evening' || variant.type === 'rain' || variant.type === 'destroyed'
          ? variant.type
          : 'default',
        assetRef: variant.url ?? variant.fileName ?? map.id,
      })),
      grid: map.gridProfile?.columns ? { columns: map.gridProfile.columns, rows: map.gridProfile.rows, snap: true } : undefined,
      visibility: PUBLIC_VISIBILITY,
      extensions: { original: map },
    })),
    battleRuntimes: {},
    classifications: [classification('manifest.maps', 'mapped'), classification('manifest.maps[].originalSceneTokens', 'preservedAsExtension')],
    diagnostics: [],
  };
}

export function adaptBattleMapVttExport(
  campaignId: CampaignId,
  exported: BattleMapVttExport,
  source: SourceMetadata = { kind: 'battle-map-vtt', sourceId: 'db-export' },
): BattleMapVttAdapterResult {
  const battleMaps: BattleMapDefinition[] = (exported.maps ?? []).map((map) => ({
    id: map.id,
    campaignId,
    title: map.title ?? map.name ?? map.id,
    variants: [{ id: 'default', kind: 'default', assetRef: map.imageUrl ?? map.image ?? map.id, width: map.width, height: map.height }],
    visibility: HIDDEN_VISIBILITY,
    extensions: { original: map },
  }));
  const battleRuntimes: Record<string, BattleRuntime> = {};
  const tokensByScene = new Map<string, NonNullable<BattleMapVttExport['tokens']>>();
  for (const token of exported.tokens ?? []) {
    const key = token.sceneId ?? token.mapId ?? 'unscoped';
    tokensByScene.set(key, [...(tokensByScene.get(key) ?? []), token]);
  }
  for (const scene of exported.scenes ?? []) {
    const id = runtimeIdFromLegacy('battleMapVttScene', scene.id);
    const battleMapRef = scene.mapId ?? scene.id;
    const tokens = tokensByScene.get(scene.id) ?? [];
    battleRuntimes[id] = {
      id,
      campaignId,
      battleMapRef,
      active: false,
      board: {
        battleMapRef,
        tokens: tokens.map((token) => ({
          id: token.id,
          name: token.name ?? token.id,
          side: 'neutral',
          sourceEntityRef: entityIdFromLegacy('battleMapVttToken', token.id),
          position: { x: token.x ?? 0, y: token.y ?? 0 },
          initiative: token.initiative,
        })),
      },
      extensions: { original: scene },
    };
  }
  return {
    source,
    battleMaps,
    battleRuntimes,
    classifications: [
      classification('maps', 'mapped'),
      classification('scenes', 'mapped'),
      classification('tokens', 'mapped'),
      classification('assets', 'preservedAsExtension'),
    ],
    diagnostics: battleMaps.length === 0 && Object.keys(battleRuntimes).length === 0
      ? [adapterWarning('db-export', 'empty_battle_map_vtt_export', 'No maps or scenes found in Battle Map VTT export.')]
      : [],
  };
}

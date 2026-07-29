import type { BattleRuntime } from '../battles/types';
import type { UniversalEntity, UniversalEntityKind } from '../entities/types';
import type { UniversalHotspot, UniversalMapDefinition, UniversalPlacement, UniversalRoute } from '../maps/types';

export interface EntityCardProjection {
  id: string;
  kind: UniversalEntityKind;
  title: string;
  description?: string;
  imageSrc?: string;
  status?: string;
  visible: boolean;
}

export interface MapProjection {
  maps: UniversalMapDefinition[];
  hotspots: UniversalHotspot[];
  placements: UniversalPlacement[];
  routes: UniversalRoute[];
}

export interface BattleProjection {
  battleMaps: number;
  battleEntries: number;
  activeBattles: BattleRuntime[];
  tokens: number;
}

export interface TimelineProjection {
  timeline: Record<string, unknown>;
  calendar: Record<string, unknown>;
}

export interface TravelProjection {
  routes: UniversalRoute[];
  travel: Record<string, unknown>;
}

export interface DMWorkspaceProjection {
  campaignId: string;
  title: string;
  entities: EntityCardProjection[];
  map: MapProjection;
  timeline: TimelineProjection;
  travel: TravelProjection;
  battles: BattleProjection;
  diagnostics: {
    entityCount: number;
    mapCount: number;
    warningCount: number;
  };
}

export interface PlayerSafeProjection {
  campaignId: string;
  title: string;
  entities: EntityCardProjection[];
  map: MapProjection;
  presentedCard?: EntityCardProjection;
  activeBattles: BattleRuntime[];
}

export interface ObserverProjection extends PlayerSafeProjection {
  observerFocus?: Record<string, unknown> | null;
}

export interface ProjectionParityResult {
  ok: boolean;
  differences: Array<{ path: string; expected: unknown; actual: unknown; message: string }>;
}

export type ProjectableEntity = UniversalEntity;

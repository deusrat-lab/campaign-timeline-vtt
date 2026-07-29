import type { CampaignId, UniversalEntityId, UniversalMapId } from '../campaign/ids';
import type { VisibilityState } from '../visibility/types';

export type CoordinateSpaceKind = 'normalized' | 'percent' | 'pixel';

export interface CoordinateSpace {
  kind: CoordinateSpaceKind;
  width?: number;
  height?: number;
}

export interface UniversalPoint {
  x: number;
  y: number;
}

export interface UniversalMapLayer {
  id: string;
  kind: 'base' | 'hotspots' | 'routes' | 'placements' | 'zones' | 'overlays' | 'movableEntities' | 'battleEntries' | 'custom';
  label?: string;
  enabled: boolean;
  order: number;
  extensions?: Record<string, unknown>;
}

export interface UniversalMapDefinition {
  id: UniversalMapId;
  campaignId: CampaignId;
  title: string;
  scope?: 'world' | 'region' | 'city' | 'local' | 'battle' | 'custom';
  parentMapId?: UniversalMapId;
  timelineId?: string;
  backgroundImageSrc?: string;
  coordinateSpace: CoordinateSpace;
  layers: UniversalMapLayer[];
  visibility: VisibilityState;
  source?: string;
  extensions?: Record<string, unknown>;
}

export interface UniversalHotspot {
  id: string;
  campaignId: CampaignId;
  mapId: UniversalMapId;
  position: UniversalPoint;
  label?: string;
  entityRef?: UniversalEntityId;
  timelineId?: string;
  visibility: VisibilityState;
  extensions?: Record<string, unknown>;
}

export interface UniversalPlacement {
  id: string;
  campaignId: CampaignId;
  mapId: UniversalMapId;
  entityRef: UniversalEntityId;
  entityKind: string;
  position: UniversalPoint;
  title?: string;
  visibility: VisibilityState;
  extensions?: Record<string, unknown>;
}

export interface UniversalRoute {
  id: string;
  campaignId: CampaignId;
  mapId: UniversalMapId;
  points: UniversalPoint[];
  fromHotspotId?: string;
  toHotspotId?: string;
  routeType?: string;
  travelTime?: string;
  visibility: VisibilityState;
  extensions?: Record<string, unknown>;
}

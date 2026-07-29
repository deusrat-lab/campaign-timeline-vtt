import type { BattleEntryDefinition, BattleMapDefinition } from '../battles/types';
import type { CampaignCapabilities } from './capabilities';
import type { CampaignId, UniversalRevision, UniversalSchemaVersion } from './ids';
import type { MigrationMetadata, SourceMetadata } from './source';
import type { UniversalEntity } from '../entities/types';
import type { UniversalHotspot, UniversalMapDefinition, UniversalPlacement, UniversalRoute } from '../maps/types';
import type { CampaignRuntime } from '../runtime/types';
import type { VisibilityState } from '../visibility/types';

export interface CampaignMetadata {
  campaignId: CampaignId;
  title: string;
  kind: 'greyholm' | 'kaldran' | 'campaign' | 'oneShot' | 'sandbox' | 'custom';
  createdAt: string;
  updatedAt: string;
  sources: SourceMetadata[];
}

export interface CampaignDurableData {
  maps: UniversalMapDefinition[];
  hotspots: UniversalHotspot[];
  placements: UniversalPlacement[];
  routes: UniversalRoute[];
  entities: UniversalEntity[];
  battleMaps: BattleMapDefinition[];
  battleEntries: BattleEntryDefinition[];
  timeline: Record<string, unknown>;
  calendar: Record<string, unknown>;
  travel: Record<string, unknown>;
  economy: Record<string, unknown>;
  extensions?: Record<string, unknown>;
}

export interface CampaignVisibilityData {
  entities: Record<string, VisibilityState>;
  fields: Record<string, VisibilityState>;
  maps: Record<string, VisibilityState>;
  presentations: Record<string, VisibilityState>;
}

export interface CampaignSnapshot {
  schemaVersion: UniversalSchemaVersion;
  revision: UniversalRevision;
  metadata: CampaignMetadata;
  capabilities: CampaignCapabilities;
  durable: CampaignDurableData;
  runtime: CampaignRuntime;
  visibility: CampaignVisibilityData;
  extensions: Record<string, unknown>;
  migrationMetadata: MigrationMetadata[];
}

export interface CampaignSnapshotInput {
  schemaVersion: UniversalSchemaVersion;
  revision: UniversalRevision;
  metadata: CampaignMetadata;
  capabilities: CampaignCapabilities;
  durable: CampaignDurableData;
  runtime: CampaignRuntime;
  visibility?: Partial<CampaignVisibilityData>;
  extensions?: Record<string, unknown>;
  migrationMetadata?: MigrationMetadata[];
}

export function createCampaignSnapshot(input: CampaignSnapshotInput): CampaignSnapshot {
  return {
    ...input,
    durable: cloneDurable(input.durable),
    runtime: structuredClone(input.runtime),
    visibility: {
      entities: input.visibility?.entities ?? {},
      fields: input.visibility?.fields ?? {},
      maps: input.visibility?.maps ?? {},
      presentations: input.visibility?.presentations ?? {},
    },
    extensions: input.extensions ?? {},
    migrationMetadata: input.migrationMetadata ?? [],
  };
}

function cloneDurable(durable: CampaignDurableData): CampaignDurableData {
  return {
    maps: durable.maps.map((item) => structuredClone(item)),
    hotspots: durable.hotspots.map((item) => structuredClone(item)),
    placements: durable.placements.map((item) => structuredClone(item)),
    routes: durable.routes.map((item) => structuredClone(item)),
    entities: durable.entities.map((item) => structuredClone(item)),
    battleMaps: durable.battleMaps.map((item) => structuredClone(item)),
    battleEntries: durable.battleEntries.map((item) => structuredClone(item)),
    timeline: structuredClone(durable.timeline),
    calendar: structuredClone(durable.calendar),
    travel: structuredClone(durable.travel),
    economy: structuredClone(durable.economy),
    extensions: durable.extensions ? structuredClone(durable.extensions) : undefined,
  };
}

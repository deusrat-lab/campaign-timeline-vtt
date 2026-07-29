import { UNIVERSAL_CAPABILITY_KEYS } from '../campaign/capabilities';
import type { CampaignSnapshot } from '../campaign/snapshot';

export type ValidationSeverity = 'error' | 'warning';

export interface ValidationIssue {
  severity: ValidationSeverity;
  code: string;
  path: string;
  message: string;
}

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
}

export function validateCampaignSnapshot(snapshot: CampaignSnapshot): ValidationResult {
  const issues: ValidationIssue[] = [];
  const campaignId = snapshot.metadata.campaignId;

  if (snapshot.runtime.campaignId !== campaignId) {
    issues.push(error('runtime.campaignId', 'runtime campaignId must match metadata campaignId'));
  }

  for (const key of UNIVERSAL_CAPABILITY_KEYS) {
    if (!snapshot.capabilities[key]) {
      issues.push(error(`capabilities.${key}`, 'capability key is missing'));
    }
  }

  const mapIds = new Set<string>();
  snapshot.durable.maps.forEach((map, index) => {
    if (map.campaignId !== campaignId) issues.push(error(`durable.maps.${index}.campaignId`, 'map belongs to another campaign'));
    if (mapIds.has(map.id)) issues.push(error(`durable.maps.${index}.id`, `duplicate map id ${map.id}`));
    mapIds.add(map.id);
    validatePointLike(map.coordinateSpace.kind, `durable.maps.${index}.coordinateSpace.kind`, issues);
  });

  const entityIds = new Set<string>();
  snapshot.durable.entities.forEach((entity, index) => {
    if (entity.campaignId !== campaignId) issues.push(error(`durable.entities.${index}.campaignId`, 'entity belongs to another campaign'));
    if (entityIds.has(entity.id)) issues.push(error(`durable.entities.${index}.id`, `duplicate entity id ${entity.id}`));
    entityIds.add(entity.id);
  });

  snapshot.durable.hotspots.forEach((hotspot, index) => {
    if (!mapIds.has(hotspot.mapId)) issues.push(error(`durable.hotspots.${index}.mapId`, `unknown map ${hotspot.mapId}`));
    validatePoint(hotspot.position, `durable.hotspots.${index}.position`, issues);
    if (hotspot.entityRef && !entityIds.has(hotspot.entityRef)) {
      issues.push(warning(`durable.hotspots.${index}.entityRef`, `unresolved entity ${hotspot.entityRef}`));
    }
  });

  snapshot.durable.placements.forEach((placement, index) => {
    if (!mapIds.has(placement.mapId)) issues.push(error(`durable.placements.${index}.mapId`, `unknown map ${placement.mapId}`));
    validatePoint(placement.position, `durable.placements.${index}.position`, issues);
    if (!entityIds.has(placement.entityRef)) {
      issues.push(warning(`durable.placements.${index}.entityRef`, `unresolved entity ${placement.entityRef}`));
    }
  });

  snapshot.durable.routes.forEach((route, index) => {
    if (!mapIds.has(route.mapId)) issues.push(error(`durable.routes.${index}.mapId`, `unknown map ${route.mapId}`));
    route.points.forEach((point, pointIndex) => validatePoint(point, `durable.routes.${index}.points.${pointIndex}`, issues));
  });

  snapshot.durable.battleEntries.forEach((entry, index) => {
    if (entry.battleMapRef && !snapshot.durable.battleMaps.some((map) => map.id === entry.battleMapRef)) {
      issues.push(warning(`durable.battleEntries.${index}.battleMapRef`, `unresolved battle map ${entry.battleMapRef}`));
    }
  });

  for (const [key, battle] of Object.entries(snapshot.runtime.battles)) {
    if (battle.campaignId !== campaignId) issues.push(error(`runtime.battles.${key}.campaignId`, 'battle runtime belongs to another campaign'));
    if (!battle.battleMapRef) issues.push(error(`runtime.battles.${key}.battleMapRef`, 'battle runtime requires battleMapRef'));
  }

  return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
}

function validatePoint(point: { x: number; y: number }, path: string, issues: ValidationIssue[]): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    issues.push(error(path, 'point coordinates must be finite numbers'));
  }
}

function validatePointLike(value: string, path: string, issues: ValidationIssue[]): void {
  if (!['normalized', 'percent', 'pixel'].includes(value)) {
    issues.push(error(path, `invalid coordinate space ${value}`));
  }
}

function error(path: string, message: string): ValidationIssue {
  return { severity: 'error', code: 'invalid_snapshot', path, message };
}

function warning(path: string, message: string): ValidationIssue {
  return { severity: 'warning', code: 'snapshot_warning', path, message };
}

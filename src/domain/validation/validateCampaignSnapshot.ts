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

/**
 * Stage 8 severity policy (see rebuild-reports/stage-08/SUMMARY.md):
 *
 *   error  -> loss-sensitive or ambiguity-inducing problems. A reference that
 *             resolves to 0 targets, or to 2+ targets, is a blocking error
 *             because the referenced object becomes unusable or is resolved
 *             non-deterministically (first-match / array order). Persistence is
 *             refused when any error is present.
 *   warning -> genuinely optional / non-destructive observations that do not
 *             change the meaning of the campaign if dropped. Warnings never
 *             block persistence.
 *
 * Ambiguity is never resolved with find()/first-match: a reference that matches
 * more than one semantic target is reported as an error, not silently resolved.
 */
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

  // Stage 8: campaign-scoped uniqueness of battleMaps.id is a blocking rule.
  // A duplicate id makes every battleMapRef pointing at it ambiguous (it could
  // resolve to 2+ maps), so it must be rejected instead of first-match resolved.
  const battleMapIdCounts = new Map<string, number>();
  // A placement's entityRef for a battle-map marker is the generic universal id
  // (`entity:battleMap:<rawId>`, from `entityIdFromLegacy`), but `durable.battleMaps`
  // ids are the RAW legacy id — a distinct namespace from `durable.entities`. Track
  // the prefixed form too so such placements resolve during reference-integrity
  // validation instead of being rejected as unresolved.
  const battleMapEntityRefIds = new Set<string>();
  snapshot.durable.battleMaps.forEach((map, index) => {
    if (map.campaignId !== campaignId) issues.push(error(`durable.battleMaps.${index}.campaignId`, 'battle map belongs to another campaign'));
    const seen = battleMapIdCounts.get(map.id) ?? 0;
    battleMapIdCounts.set(map.id, seen + 1);
    if (seen >= 1) {
      issues.push(error(`durable.battleMaps.${index}.id`, `duplicate battle map id ${map.id}`));
    }
    battleMapEntityRefIds.add(`entity:battleMap:${map.id}`);
  });

  snapshot.durable.hotspots.forEach((hotspot, index) => {
    if (!mapIds.has(hotspot.mapId)) issues.push(error(`durable.hotspots.${index}.mapId`, `unknown map ${hotspot.mapId}`));
    validatePoint(hotspot.position, `durable.hotspots.${index}.position`, issues);
    // Loss-sensitive: a hotspot that names an entity but cannot resolve it is a
    // dead hotspot. Absent entityRef is allowed (label-only hotspot).
    if (hotspot.entityRef && !entityIds.has(hotspot.entityRef)) {
      issues.push(error(`durable.hotspots.${index}.entityRef`, `unresolved entity ${hotspot.entityRef}`));
    }
  });

  snapshot.durable.placements.forEach((placement, index) => {
    if (!mapIds.has(placement.mapId)) issues.push(error(`durable.placements.${index}.mapId`, `unknown map ${placement.mapId}`));
    validatePoint(placement.position, `durable.placements.${index}.position`, issues);
    // Loss-sensitive: a placement always carries an entityRef; if it cannot be
    // resolved the placement is meaningless, so this is a blocking error.
    if (!entityIds.has(placement.entityRef) && !battleMapEntityRefIds.has(placement.entityRef)) {
      issues.push(error(`durable.placements.${index}.entityRef`, `unresolved entity ${placement.entityRef}`));
    }
  });

  snapshot.durable.routes.forEach((route, index) => {
    if (!mapIds.has(route.mapId)) issues.push(error(`durable.routes.${index}.mapId`, `unknown map ${route.mapId}`));
    route.points.forEach((point, pointIndex) => validatePoint(point, `durable.routes.${index}.points.${pointIndex}`, issues));
  });

  snapshot.durable.battleEntries.forEach((entry, index) => {
    if (!entry.battleMapRef) return;
    const matches = battleMapIdCounts.get(entry.battleMapRef) ?? 0;
    if (matches === 0) {
      // Loss-sensitive: a battle entry whose map cannot be resolved is unusable.
      issues.push(error(`durable.battleEntries.${index}.battleMapRef`, `unresolved battle map ${entry.battleMapRef}`));
    } else if (matches > 1) {
      // Ambiguous: refuse first-match resolution.
      issues.push(error(`durable.battleEntries.${index}.battleMapRef`, `ambiguous battle map ${entry.battleMapRef} (${matches} matches)`));
    }
  });

  // Reveal targets must resolve to exactly one entity. Entity ids are already
  // asserted unique above, so an unresolved reveal target (0 matches) is a
  // blocking loss-sensitive error: a reveal that points at nothing is lost.
  Object.keys(snapshot.visibility.entities).forEach((revealId) => {
    if (!entityIds.has(revealId)) {
      issues.push(error(`visibility.entities.${revealId}`, `unresolved reveal target ${revealId}`));
    }
  });

  for (const [key, battle] of Object.entries(snapshot.runtime.battles)) {
    if (battle.campaignId !== campaignId) issues.push(error(`runtime.battles.${key}.campaignId`, 'battle runtime belongs to another campaign'));
    if (!battle.battleMapRef) issues.push(error(`runtime.battles.${key}.battleMapRef`, 'battle runtime requires battleMapRef'));
  }

  return { ok: issues.every((issue) => issue.severity !== 'error'), issues };
}

/**
 * Stage 8 pre-persistence gate. Throws a diagnosable error if the snapshot is
 * not valid, so a broken snapshot can never be written to any repository
 * (shadow or otherwise). Reusable helper used by the Stage 8 parity harness in
 * addition to the repository's own write-time validation.
 */
export class SnapshotValidationError extends Error {
  readonly issues: ValidationIssue[];
  constructor(campaignId: string, issues: ValidationIssue[]) {
    const errors = issues.filter((issue) => issue.severity === 'error');
    super(
      `Snapshot ${campaignId} failed validation with ${errors.length} error(s): ` +
        errors.map((issue) => `[${issue.code}] ${issue.path}: ${issue.message}`).join('; '),
    );
    this.name = 'SnapshotValidationError';
    this.issues = issues;
  }
}

export function assertSnapshotPersistable(snapshot: CampaignSnapshot): ValidationResult {
  const result = validateCampaignSnapshot(snapshot);
  if (!result.ok) {
    throw new SnapshotValidationError(snapshot.metadata.campaignId, result.issues);
  }
  return result;
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

import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalPoint } from '../maps/types';
import type { ComplexCommand } from './complexCommands';

/**
 * System-specific invariant validation over the (base, candidate, command)
 * triple. Runs AFTER schema validation and BEFORE the durable commit. A
 * non-empty result forces a pre-commit fallback (`invariant_violation`). Pure.
 */
export function validateAggregateInvariants(
  base: CampaignSnapshot,
  candidate: CampaignSnapshot,
  command: ComplexCommand,
): string[] {
  const violations: string[] = [];
  switch (command.kind) {
    case 'reveal.entity': {
      const id = command.targetUniversalId;
      if (!candidate.visibility.entities[id]) violations.push('reveal.entity: candidate is not revealed');
      if (base.durable.entities.filter((e) => e.id === id).length !== 1) violations.push('reveal.entity: target does not resolve to exactly one entity');
      break;
    }
    case 'reveal.hide': {
      const id = command.targetUniversalId;
      if (candidate.visibility.entities[id]) violations.push('reveal.hide: candidate still reveals target');
      break;
    }
    case 'presentedCard.present': {
      const card = candidate.runtime.presentation.presentedCard;
      if (!card || card.entityRef !== command.targetUniversalId) violations.push('presentedCard.present: candidate card does not match target');
      if (card && card.kind !== command.entityKind) violations.push('presentedCard.present: candidate card kind mismatch');
      break;
    }
    case 'presentedCard.dismiss': {
      if (candidate.runtime.presentation.presentedCard !== null) violations.push('presentedCard.dismiss: candidate card not cleared');
      break;
    }
    case 'placement.place': {
      const matches = candidate.durable.placements.filter((p) => p.id === command.placementId);
      if (matches.length !== 1) violations.push('placement.place: candidate must contain exactly one placement with the id');
      if (matches.length === 1) {
        boundsViolations(candidate, matches[0].mapId, matches[0].position, 'placement.place', violations);
        if (matches[0].entityRef !== command.entityRef) violations.push('placement.place: entityRef mismatch');
      }
      if (base.durable.placements.some((p) => p.id === command.placementId)) violations.push('placement.place: id already existed in base');
      break;
    }
    case 'placement.move': {
      const match = candidate.durable.placements.find((p) => p.id === command.placementId);
      if (!match) violations.push('placement.move: placement missing in candidate');
      else boundsViolations(candidate, match.mapId, match.position, 'placement.move', violations);
      if (candidate.durable.placements.length !== base.durable.placements.length) violations.push('placement.move: placement count changed');
      break;
    }
    case 'placement.remove': {
      if (candidate.durable.placements.some((p) => p.id === command.placementId)) violations.push('placement.remove: candidate still contains placement');
      if (!base.durable.placements.some((p) => p.id === command.placementId)) violations.push('placement.remove: nothing to remove in base');
      if (candidate.durable.placements.length !== base.durable.placements.length - 1) violations.push('placement.remove: exactly one placement must be removed');
      break;
    }
    case 'partyLocation.move': {
      if (command.currentMapId !== undefined && !candidate.durable.maps.some((m) => m.id === command.currentMapId)) {
        violations.push('partyLocation.move: target map does not exist');
      }
      if (command.currentMapPosition && !finite(command.currentMapPosition)) violations.push('partyLocation.move: non-finite position');
      break;
    }
    case 'routeProgress.advance': {
      const rp = candidate.runtime.party.routeProgress;
      if (!rp || typeof rp !== 'object') violations.push('routeProgress.advance: candidate routeProgress missing');
      else {
        const progress = (rp as Record<string, unknown>).progress;
        if (typeof progress === 'number' && (!Number.isFinite(progress) || progress < 0 || progress > 1)) {
          violations.push('routeProgress.advance: progress out of [0,1] bounds');
        }
      }
      break;
    }
    case 'routeProgress.clear': {
      if (candidate.runtime.party.routeProgress !== null) violations.push('routeProgress.clear: candidate routeProgress not cleared');
      break;
    }
  }
  return violations;
}

function finite(point: UniversalPoint): boolean {
  return Number.isFinite(point.x) && Number.isFinite(point.y);
}

function boundsViolations(
  candidate: CampaignSnapshot,
  mapId: string,
  position: UniversalPoint,
  label: string,
  violations: string[],
): void {
  if (!finite(position)) {
    violations.push(`${label}: non-finite coordinates`);
    return;
  }
  const map = candidate.durable.maps.find((m) => m.id === mapId);
  if (!map) return; // schema validation already flags an unknown map.
  const kind = map.coordinateSpace.kind;
  if (kind === 'normalized' && (position.x < 0 || position.x > 1 || position.y < 0 || position.y > 1)) {
    violations.push(`${label}: normalized coordinates out of [0,1]`);
  } else if (kind === 'percent' && (position.x < 0 || position.x > 100 || position.y < 0 || position.y > 100)) {
    violations.push(`${label}: percent coordinates out of [0,100]`);
  }
}

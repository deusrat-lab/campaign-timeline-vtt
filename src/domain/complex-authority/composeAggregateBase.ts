import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalPlacement } from '../maps/types';
import type { VisibilityState } from '../visibility/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import type { ComplexAggregateKind, ComplexReconciliationStatus } from './complexAuthorityTypes';
import { readAggregateSlot } from './complexCommands';

/** Split a slot key `${aggregateKind}:${targetId}` at the FIRST colon only
 * (universal ids themselves contain colons). */
export function parseSlotKey(slotKey: string): { aggregateKind: ComplexAggregateKind; targetId: string } {
  const idx = slotKey.indexOf(':');
  return {
    aggregateKind: slotKey.slice(0, idx) as ComplexAggregateKind,
    targetId: slotKey.slice(idx + 1),
  };
}

export interface AggregateReconciliationReport {
  status: ComplexReconciliationStatus;
  /** Slot keys where the universal snapshot is ahead under a pending projection. */
  universalAheadSlots: string[];
}

export interface ComposedAggregateBase {
  base: CampaignSnapshot;
  report: AggregateReconciliationReport;
  initialization: 'existing' | 'initialized';
}

/**
 * Compose the durable universal base for a Stage 16 aggregate transaction.
 *
 * Legacy-owned data is always taken fresh from the exact current legacy-adapted
 * snapshot, so maps, hotspot/faction geometry, timeline, battles and entity
 * content can never be overwritten by a stale universal snapshot. The ONLY thing
 * carried over from the durable universal snapshot is a universal-owned aggregate
 * slot that is AHEAD under a pending compatibility projection (so an in-flight
 * committed transition is not lost). Every other owned slot naturally imports the
 * current legacy value (an external legacy edit is the new intent).
 */
export function composeAggregateBase(
  legacyAdapted: CampaignSnapshot,
  universalCurrent: CampaignSnapshot | null,
  pendingSlotKeys: ReadonlySet<string>,
): ComposedAggregateBase {
  if (!universalCurrent) {
    return { base: structuredClone(legacyAdapted), report: { status: 'missing_universal', universalAheadSlots: [] }, initialization: 'initialized' };
  }
  let valid = false;
  try {
    valid = !!universalCurrent.durable && Array.isArray(universalCurrent.durable.entities) && validateCampaignSnapshot(universalCurrent).ok;
  } catch {
    valid = false;
  }
  if (!valid) {
    return { base: structuredClone(legacyAdapted), report: { status: 'invalid_universal', universalAheadSlots: [] }, initialization: 'initialized' };
  }

  const base = structuredClone(legacyAdapted);
  const universalAheadSlots: string[] = [];
  for (const slotKey of pendingSlotKeys) {
    const { aggregateKind, targetId } = parseSlotKey(slotKey);
    const universalValue = readAggregateSlot(universalCurrent, aggregateKind, targetId);
    const legacyValue = readAggregateSlot(base, aggregateKind, targetId);
    if (JSON.stringify(universalValue) === JSON.stringify(legacyValue)) continue; // already equal
    overlaySlot(base, aggregateKind, targetId, universalValue);
    universalAheadSlots.push(slotKey);
  }

  const status: ComplexReconciliationStatus = universalAheadSlots.length > 0 ? 'universal_ahead' : 'equal';
  return { base, report: { status, universalAheadSlots }, initialization: 'existing' };
}

/** Overlay a single universal-owned aggregate slot value onto a legacy base
 * clone. Only ever touches the owned region of the given aggregate. */
function overlaySlot(base: CampaignSnapshot, aggregateKind: ComplexAggregateKind, targetId: string, value: unknown): void {
  switch (aggregateKind) {
    case 'reveal': {
      if (value == null) delete base.visibility.entities[targetId];
      else base.visibility.entities[targetId] = value as VisibilityState;
      break;
    }
    case 'presentedCard': {
      base.runtime.presentation.presentedCard = (value as CampaignSnapshot['runtime']['presentation']['presentedCard']) ?? null;
      break;
    }
    case 'placement': {
      const without = base.durable.placements.filter((p) => p.id !== targetId);
      if (value != null) without.push(value as UniversalPlacement);
      base.durable.placements = without;
      break;
    }
    case 'partyLocation': {
      if (value != null) base.runtime.party = value as CampaignSnapshot['runtime']['party'];
      break;
    }
    case 'routeProgress': {
      base.runtime.party = { ...base.runtime.party, routeProgress: (value as CampaignSnapshot['runtime']['party']['routeProgress']) ?? null };
      break;
    }
  }
}

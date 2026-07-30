import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalEntity } from '../entities/types';
import { validateCampaignSnapshot } from '../validation/validateCampaignSnapshot';
import type { ReconciliationStatus } from './durableAuthorityTypes';
import { universalOwnedFieldSlots, type SafeUniversalField } from './safeFieldRegistry';

/**
 * Per-entity/per-field reconciliation of a universal-owned slot between the
 * durable universal snapshot and the exact current legacy-adapted snapshot.
 */
export interface OwnedFieldReconciliation {
  entityId: string;
  entityKind: string;
  field: SafeUniversalField;
  universalValue: string | undefined;
  legacyValue: string | undefined;
  outcome: 'equal' | 'universal_ahead' | 'legacy_ahead' | 'missing';
}

export interface ReconciliationReport {
  status: ReconciliationStatus;
  slots: OwnedFieldReconciliation[];
  /** True when the universal snapshot holds a value ahead of legacy that a
   * pending projection is responsible for (must be resolved before a new
   * command rides on top). */
  hasUnresolvedUniversalAhead: boolean;
}

function fieldValue(entity: UniversalEntity, field: SafeUniversalField): string | undefined {
  const value = (entity as unknown as Record<string, unknown>)[field];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Read-only reconciliation of every universal-owned field between the durable
 * universal snapshot and the exact current legacy-adapted snapshot. `pendingKeys`
 * is the set of `${entityId}.${field}` slots a pending projection covers. Never
 * mutates anything.
 */
export function reconcileOwnedFields(
  legacyAdapted: CampaignSnapshot,
  universalCurrent: CampaignSnapshot | null,
  pendingKeys: ReadonlySet<string>,
): ReconciliationReport {
  if (!universalCurrent) {
    return { status: 'missing_universal', slots: [], hasUnresolvedUniversalAhead: false };
  }
  let valid = false;
  try {
    valid = !!universalCurrent.durable && Array.isArray(universalCurrent.durable.entities) && validateCampaignSnapshot(universalCurrent).ok;
  } catch {
    valid = false;
  }
  if (!valid) {
    return { status: 'invalid_universal', slots: [], hasUnresolvedUniversalAhead: false };
  }

  const slots: OwnedFieldReconciliation[] = [];
  let anyLegacyAhead = false;
  let anyUniversalAhead = false;
  let hasUnresolvedUniversalAhead = false;

  const ownedSlots = universalOwnedFieldSlots();
  const legacyEntities = legacyAdapted.durable.entities;
  const universalEntities = new Map(universalCurrent.durable.entities.map((entity) => [entity.id, entity]));

  for (const legacyEntity of legacyEntities) {
    const uEntity = universalEntities.get(legacyEntity.id);
    for (const slot of ownedSlots) {
      if (slot.entityKind !== legacyEntity.kind) continue;
      const legacyValue = fieldValue(legacyEntity, slot.universalField);
      const universalValue = uEntity ? fieldValue(uEntity, slot.universalField) : undefined;
      if (universalValue === legacyValue) continue; // equal (incl. both undefined)
      const key = `${legacyEntity.id}.${slot.universalField}`;
      const isPending = pendingKeys.has(key);
      if (isPending) {
        anyUniversalAhead = true;
        hasUnresolvedUniversalAhead = true;
      } else {
        anyLegacyAhead = true;
      }
      slots.push({
        entityId: legacyEntity.id,
        entityKind: legacyEntity.kind,
        field: slot.universalField,
        universalValue,
        legacyValue,
        outcome: isPending ? 'universal_ahead' : 'legacy_ahead',
      });
    }
  }

  let status: ReconciliationStatus = 'equal';
  if (anyUniversalAhead) status = 'universal_ahead';
  else if (anyLegacyAhead) status = 'legacy_ahead_imported';

  return { status, slots, hasUnresolvedUniversalAhead };
}

export interface ComposedBase {
  base: CampaignSnapshot;
  report: ReconciliationReport;
  /** `initialized` when there was no prior universal snapshot (the base is the
   * exact current legacy state, used to create the durable record). */
  initialization: 'existing' | 'initialized';
}

/**
 * Compose the durable universal base for a Stage 15 transaction.
 *
 * Legacy-owned data (everything but the universal-owned field slots) is always
 * taken from the exact current legacy-adapted snapshot — so maps, runtime,
 * reveal, battle, routes and timeline can never be overwritten by a stale
 * universal snapshot. Universal-owned fields are taken from legacy too EXCEPT
 * where the durable universal snapshot is ahead under a pending projection, in
 * which case the universal value is preserved. A legacy-only external edit to an
 * owned field (no pending projection) is imported as the new intent.
 */
export function composeDurableBase(
  legacyAdapted: CampaignSnapshot,
  universalCurrent: CampaignSnapshot | null,
  pendingKeys: ReadonlySet<string>,
): ComposedBase {
  const report = reconcileOwnedFields(legacyAdapted, universalCurrent, pendingKeys);
  if (!universalCurrent || report.status === 'invalid_universal') {
    return { base: structuredClone(legacyAdapted), report, initialization: 'initialized' };
  }

  // Overlay ONLY the universal-ahead (pending) slots onto a fresh legacy base.
  const aheadKeys = new Set(
    report.slots.filter((slot) => slot.outcome === 'universal_ahead').map((slot) => `${slot.entityId}.${slot.field}`),
  );
  const universalById = new Map(universalCurrent.durable.entities.map((entity) => [entity.id, entity]));

  const base = structuredClone(legacyAdapted);
  if (aheadKeys.size > 0) {
    base.durable = {
      ...base.durable,
      entities: base.durable.entities.map((entity) => {
        let next = entity;
        for (const slot of universalOwnedFieldSlots()) {
          if (slot.entityKind !== entity.kind) continue;
          if (!aheadKeys.has(`${entity.id}.${slot.universalField}`)) continue;
          const uEntity = universalById.get(entity.id);
          const uValue = uEntity ? fieldValue(uEntity, slot.universalField) : undefined;
          if (uValue !== undefined) next = { ...next, [slot.universalField]: uValue } as UniversalEntity;
        }
        return next;
      }),
    };
  }

  return { base, report, initialization: 'existing' };
}

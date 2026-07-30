import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalEntity } from '../entities/types';
import { entityIdFromLegacy } from '../adapters/idMapping';
import type { DurableAuthorityScope } from './durableAuthorityTypes';
import { safeFieldDescriptor, type SafeUniversalField } from './safeFieldRegistry';

/**
 * A generic, TYPED safe-field update command. Never an arbitrary JSON patch:
 * the scope selects a closed descriptor (entity kind + single normalised field +
 * value type), the target is a legacy entity id resolved deterministically to a
 * single universal entity, and the value is a plain scalar/text string. No
 * nested paths, no wildcards, no prototype keys, no array mutation, no id
 * change, no reference change.
 */
export interface SafeFieldCommand {
  scope: DurableAuthorityScope;
  legacyEntityId: string;
  value: string;
}

export interface SafeFieldCommandResult {
  accepted: boolean;
  rejectionCode?: 'invalid_payload' | 'mapping_failed';
  rejectionMessage?: string;
  snapshot: CampaignSnapshot | null;
  changedPaths: string[];
  universalId: string | null;
}

function reject(code: 'invalid_payload' | 'mapping_failed', message: string): SafeFieldCommandResult {
  return { accepted: false, rejectionCode: code, rejectionMessage: message, snapshot: null, changedPaths: [], universalId: null };
}

/**
 * Deterministically resolve a legacy `(entityKind, id)` to the single universal
 * entity id and confirm exactly one entity of the expected kind exists. Never
 * first-match, never prefix-guessing. Returns `null` on unresolved/ambiguous so
 * the caller reports `mapping_failed`.
 */
function resolveEntity(
  snapshot: CampaignSnapshot,
  entityKind: string,
  legacyId: string,
): { universalId: string } | null {
  const universalId = entityIdFromLegacy(entityKind, legacyId);
  const matches = snapshot.durable.entities.filter(
    (entity) => entity.id === universalId && entity.kind === entityKind,
  );
  if (matches.length !== 1) return null;
  return { universalId };
}

/**
 * Execute a generic safe-field command against an ISOLATED clone of the given
 * base snapshot. Pure: no storage, no network, no legacy access. Writes exactly
 * one normalised universal field on exactly one entity and reports the single
 * changed path `durable.entities:<id>.<field>`.
 */
export function executeSafeFieldCommand(
  base: CampaignSnapshot,
  command: SafeFieldCommand,
): SafeFieldCommandResult {
  const descriptor = safeFieldDescriptor(command.scope);

  if (typeof command.value !== 'string') {
    return reject('invalid_payload', `${command.scope} requires a string value`);
  }
  if (!descriptor.allowEmpty && command.value.trim() === '') {
    return reject('invalid_payload', `${command.scope} requires a non-empty value`);
  }

  const snapshot = structuredClone(base);
  const resolved = resolveEntity(snapshot, descriptor.entityKind, command.legacyEntityId);
  if (!resolved) {
    return reject('mapping_failed', `Unresolved ${descriptor.entityKind} id: ${command.legacyEntityId}`);
  }

  const entities = snapshot.durable.entities.map((entity) =>
    entity.id === resolved.universalId
      ? applyField(entity, descriptor.universalField, descriptor.legacyField, command.value)
      : entity,
  );

  return {
    accepted: true,
    snapshot: { ...snapshot, durable: { ...snapshot.durable, entities } },
    changedPaths: [`durable.entities:${resolved.universalId}.${descriptor.universalField}`],
    universalId: resolved.universalId,
  };
}

/**
 * Read the current normalised value of a safe field from a snapshot (used by
 * safe composition and reconciliation). Returns `undefined` when the entity or
 * field is absent.
 */
export function readSafeField(
  snapshot: CampaignSnapshot,
  entityKind: string,
  legacyId: string,
  universalField: SafeUniversalField,
): string | undefined {
  const universalId = entityIdFromLegacy(entityKind, legacyId);
  const entity = snapshot.durable.entities.find((item) => item.id === universalId && item.kind === entityKind);
  if (!entity) return undefined;
  const value = (entity as unknown as Record<string, unknown>)[universalField];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Apply one normalised scalar/text field and mirror the raw-legacy echo
 * (`extensions.original.<legacyField>`) when present, so the persisted universal
 * snapshot stays internally coherent. The echo is neutralised by
 * `normalizeTechnical`, so it never affects parity — it is written only for
 * lossless round-trip fidelity.
 */
function applyField(
  entity: UniversalEntity,
  universalField: SafeUniversalField,
  legacyField: string,
  value: string,
): UniversalEntity {
  const next = { ...entity, [universalField]: value } as UniversalEntity;
  const original = (entity.extensions as Record<string, unknown> | undefined)?.original;
  if (original && typeof original === 'object' && legacyField in (original as Record<string, unknown>)) {
    next.extensions = {
      ...(entity.extensions as Record<string, unknown>),
      original: { ...(original as Record<string, unknown>), [legacyField]: value },
    };
  }
  return next;
}

import type { CampaignSnapshot } from '../campaign/snapshot';
import type { UniversalEntity } from '../entities/types';
import { entityIdFromLegacy } from '../adapters/idMapping';
import { PUBLIC_VISIBILITY } from '../visibility/types';
import type {
  CommandShadowScope,
  RedactedCommandPayload,
  UniversalCommandResult,
} from './commandShadowTypes';

/**
 * Transient, in-memory command inputs. These carry the ACTUAL new values used
 * to replay a universal command and are NEVER persisted — only the derived
 * `RedactedCommandPayload` is stored in diagnostics. One variant per allowlisted
 * scope; the discriminant is `scope`, matching the legacy command 1:1.
 */
export type CommandInput =
  | { scope: 'greyholm.npc.update'; legacyNpcId: string; field: 'role'; value: string }
  | { scope: 'userCampaign.npc.update'; legacyNpcId: string; field: 'role'; value: string }
  | { scope: 'greyholm.presentedCard.set'; card: { type: string; id: string } | null }
  | { scope: 'greyholm.reveal.update'; kind: string; legacyId: string }
  | { scope: 'userCampaign.reveal.update'; kind: string; legacyId: string }
  | { scope: 'userCampaign.mapPlacement.update'; placementId: string; x: number; y: number };

const FREE_TEXT_FIELDS = new Set(['role', 'title', 'name', 'description', 'notes']);

/** Derive the bounded, redaction-safe payload persisted in diagnostics. Long /
 * free-text field values are replaced with a length marker, never stored. */
export function redactCommandInput(input: CommandInput): RedactedCommandPayload {
  switch (input.scope) {
    case 'greyholm.npc.update':
    case 'userCampaign.npc.update':
      return {
        targetIds: [`npc:${input.legacyNpcId}`],
        changedFieldPaths: [`entity.${input.field}`],
        summary: { [`entity.${input.field}`]: redactScalar(input.field, input.value) },
      };
    case 'greyholm.presentedCard.set':
      return {
        targetIds: input.card ? [`${input.card.type}:${input.card.id}`] : [],
        changedFieldPaths: ['runtime.presentation.presentedCard'],
        summary: { 'runtime.presentation.presentedCard': input.card ? input.card.type : null },
      };
    case 'greyholm.reveal.update':
    case 'userCampaign.reveal.update':
      return {
        targetIds: [`${input.kind}:${input.legacyId}`],
        changedFieldPaths: ['visibility.entities'],
        summary: { 'visibility.entities': 'public' },
      };
    case 'userCampaign.mapPlacement.update':
      return {
        targetIds: [`placement:${input.placementId}`],
        changedFieldPaths: ['durable.placements.position'],
        summary: { 'durable.placements.position.x': input.x, 'durable.placements.position.y': input.y },
      };
  }
}

function redactScalar(field: string, value: string): string {
  if (FREE_TEXT_FIELDS.has(field) && value.length > 24) return `<redacted:${value.length}>`;
  return value;
}

function reject(code: string, message: string): UniversalCommandResult {
  return {
    accepted: false,
    rejectionCode: code,
    rejectionMessage: message,
    snapshot: null,
    changedPaths: [],
    createdIds: [],
    updatedIds: [],
    deletedIds: [],
    referenceChanges: [],
    runtimeChanges: [],
  };
}

/**
 * Resolve a legacy (kind, id) to the single universal entity id and confirm it
 * exists in the pre-snapshot. Deterministic and kind-aware: never first-match,
 * never prefix-guessing. Returns `null` when unresolved or ambiguous so the
 * caller reports `mapping_failed`.
 */
function resolveEntity(
  snapshot: CampaignSnapshot,
  kind: string,
  legacyId: string,
): { universalId: string; ambiguous: boolean } | null {
  const universalId = entityIdFromLegacy(kind, legacyId);
  const matches = snapshot.durable.entities.filter((entity) => entity.id === universalId);
  if (matches.length === 0) return null;
  if (matches.length > 1) return { universalId, ambiguous: true };
  return { universalId, ambiguous: false };
}

/**
 * Execute the universal command equivalent of an allowlisted legacy mutation
 * against an ISOLATED pre-command snapshot clone. Pure: no storage, no network,
 * no legacy access, no global active campaign. The caller owns cloning; this
 * function clones defensively too so the input is never mutated.
 */
export function executeUniversalCommand(
  preSnapshot: CampaignSnapshot,
  input: CommandInput,
): UniversalCommandResult {
  const snapshot = structuredClone(preSnapshot);

  switch (input.scope) {
    case 'greyholm.npc.update':
    case 'userCampaign.npc.update': {
      // Payload-level rejection (distinct from a mapping failure): an empty
      // field value is not a valid mutation.
      if (typeof input.value !== 'string' || input.value.trim() === '') {
        return reject('invalid_payload', 'npc update requires a non-empty value');
      }
      const resolved = resolveEntity(snapshot, 'npc', input.legacyNpcId);
      if (!resolved) return reject('mapping_failed', `Unresolved npc id: ${input.legacyNpcId}`);
      if (resolved.ambiguous) return reject('mapping_failed', `Ambiguous npc id: ${input.legacyNpcId}`);
      const entities = snapshot.durable.entities.map((entity) =>
        entity.id === resolved.universalId ? applyNpcField(entity, input.field, input.value) : entity,
      );
      return accepted({ ...snapshot, durable: { ...snapshot.durable, entities } }, {
        changedPaths: [`durable.entities:${resolved.universalId}.${input.field}`],
        updatedIds: [resolved.universalId],
      });
    }

    case 'greyholm.presentedCard.set': {
      if (input.card) {
        const resolved = resolveEntity(snapshot, input.card.type, input.card.id);
        if (!resolved || resolved.ambiguous) {
          return reject('mapping_failed', `Unresolved presented card target: ${input.card.type}:${input.card.id}`);
        }
      }
      const presentedCard = input.card
        ? { entityRef: entityIdFromLegacy(input.card.type, input.card.id), kind: input.card.type }
        : null;
      const next: CampaignSnapshot = {
        ...snapshot,
        runtime: {
          ...snapshot.runtime,
          presentation: { ...snapshot.runtime.presentation, presentedCard },
        },
      };
      return accepted(next, {
        changedPaths: ['runtime.presentation.presentedCard'],
        runtimeChanges: ['runtime.presentation.presentedCard'],
      });
    }

    case 'greyholm.reveal.update':
    case 'userCampaign.reveal.update': {
      const resolved = resolveEntity(snapshot, input.kind, input.legacyId);
      if (!resolved) return reject('mapping_failed', `Unresolved reveal target: ${input.kind}:${input.legacyId}`);
      if (resolved.ambiguous) return reject('mapping_failed', `Ambiguous reveal target: ${input.kind}:${input.legacyId}`);
      const next: CampaignSnapshot = {
        ...snapshot,
        visibility: {
          ...snapshot.visibility,
          entities: { ...snapshot.visibility.entities, [resolved.universalId]: PUBLIC_VISIBILITY },
        },
      };
      return accepted(next, {
        changedPaths: [`visibility.entities:${resolved.universalId}`],
        referenceChanges: [`visibility.entities:${resolved.universalId}`],
      });
    }

    case 'userCampaign.mapPlacement.update': {
      const placement = snapshot.durable.placements.find((item) => item.id === input.placementId);
      if (!placement) return reject('mapping_failed', `Unresolved placement id: ${input.placementId}`);
      const placements = snapshot.durable.placements.map((item) =>
        item.id === input.placementId ? { ...item, position: { x: input.x, y: input.y } } : item,
      );
      return accepted({ ...snapshot, durable: { ...snapshot.durable, placements } }, {
        changedPaths: [`durable.placements:${input.placementId}.position`],
        updatedIds: [input.placementId],
      });
    }
  }
}

/** Apply a single scalar field update to an entity, mirroring the adapter's
 * projection AND (for Greyholm) the preserved raw `extensions.original` echo so
 * the universal result matches `adapter(legacyPost)` exactly. */
function applyNpcField(entity: UniversalEntity, field: 'role', value: string): UniversalEntity {
  const next: UniversalEntity = { ...entity, [field]: value } as UniversalEntity;
  const original = (entity.extensions as Record<string, unknown> | undefined)?.original;
  if (original && typeof original === 'object') {
    next.extensions = {
      ...(entity.extensions as Record<string, unknown>),
      original: { ...(original as Record<string, unknown>), [field]: value },
    };
  }
  return next;
}

function accepted(
  snapshot: CampaignSnapshot,
  parts: Partial<Omit<UniversalCommandResult, 'accepted' | 'snapshot'>>,
): UniversalCommandResult {
  return {
    accepted: true,
    snapshot,
    changedPaths: parts.changedPaths ?? [],
    createdIds: parts.createdIds ?? [],
    updatedIds: parts.updatedIds ?? [],
    deletedIds: parts.deletedIds ?? [],
    referenceChanges: parts.referenceChanges ?? [],
    runtimeChanges: parts.runtimeChanges ?? [],
  };
}

const KNOWN_SCOPES = new Set<string>([
  'greyholm.npc.update',
  'greyholm.presentedCard.set',
  'greyholm.reveal.update',
  'userCampaign.npc.update',
  'userCampaign.reveal.update',
  'userCampaign.mapPlacement.update',
]);

export function isKnownCommandScope(scope: string): scope is CommandShadowScope {
  return KNOWN_SCOPES.has(scope);
}

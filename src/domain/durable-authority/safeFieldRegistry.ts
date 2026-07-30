import type { CommandCampaignKind } from '../command-shadow/commandShadowTypes';
import {
  ALL_DURABLE_AUTHORITY_SCOPES,
  type DurableAuthorityScope,
} from './durableAuthorityTypes';

/**
 * The universal entity field a safe scope writes. Only NORMALISED scalar/text
 * fields that map 1:1 to a single legacy field (never a composed/joined field,
 * never an id, reference, array, coordinate, visibility, runtime or geometry
 * field). `title` is the universal projection of a legacy display name.
 */
export type SafeUniversalField = 'role' | 'title' | 'publicDescription';

export type SafeValueType = 'text';

/**
 * One row of the safe-field coverage matrix. `legacyField` is the field name a
 * store must patch on the raw legacy entity; `universalField` is the normalised
 * field the universal command writes. For these rows the adapter maps
 * `legacyField -> universalField` as identity, so `adapter(legacyPost)` equals
 * the universal candidate at semantic parity (the verbatim `extensions.original`
 * echo is neutralised by `normalizeTechnical`, so echoing it is optional).
 */
export interface SafeFieldDescriptor {
  scope: DurableAuthorityScope;
  campaignKind: CommandCampaignKind;
  entityKind: 'npc' | 'quest' | 'faction' | 'location';
  universalField: SafeUniversalField;
  legacyField: string;
  valueType: SafeValueType;
  /** Whether an empty string is an acceptable value (clearing free-text). Name /
   * role / title-style identity fields require a non-empty value. */
  allowEmpty: boolean;
}

const DESCRIPTORS: readonly SafeFieldDescriptor[] = [
  { scope: 'greyholm.npc.role.update', campaignKind: 'greyholm', entityKind: 'npc', universalField: 'role', legacyField: 'role', valueType: 'text', allowEmpty: false },
  { scope: 'greyholm.npc.name.update', campaignKind: 'greyholm', entityKind: 'npc', universalField: 'title', legacyField: 'name', valueType: 'text', allowEmpty: false },
  { scope: 'userCampaign.npc.role.update', campaignKind: 'userCampaign', entityKind: 'npc', universalField: 'role', legacyField: 'role', valueType: 'text', allowEmpty: false },
  { scope: 'userCampaign.npc.name.update', campaignKind: 'userCampaign', entityKind: 'npc', universalField: 'title', legacyField: 'name', valueType: 'text', allowEmpty: false },
  { scope: 'userCampaign.npc.description.update', campaignKind: 'userCampaign', entityKind: 'npc', universalField: 'publicDescription', legacyField: 'description', valueType: 'text', allowEmpty: true },
  { scope: 'userCampaign.quest.title.update', campaignKind: 'userCampaign', entityKind: 'quest', universalField: 'title', legacyField: 'title', valueType: 'text', allowEmpty: false },
  { scope: 'userCampaign.quest.description.update', campaignKind: 'userCampaign', entityKind: 'quest', universalField: 'publicDescription', legacyField: 'description', valueType: 'text', allowEmpty: true },
  { scope: 'userCampaign.faction.name.update', campaignKind: 'userCampaign', entityKind: 'faction', universalField: 'title', legacyField: 'name', valueType: 'text', allowEmpty: false },
  { scope: 'userCampaign.faction.description.update', campaignKind: 'userCampaign', entityKind: 'faction', universalField: 'publicDescription', legacyField: 'description', valueType: 'text', allowEmpty: true },
  { scope: 'userCampaign.location.description.update', campaignKind: 'userCampaign', entityKind: 'location', universalField: 'publicDescription', legacyField: 'description', valueType: 'text', allowEmpty: true },
];

const BY_SCOPE = new Map<DurableAuthorityScope, SafeFieldDescriptor>(
  DESCRIPTORS.map((descriptor) => [descriptor.scope, descriptor]),
);

const KNOWN_SCOPES = new Set<string>(ALL_DURABLE_AUTHORITY_SCOPES);

// Sanity: the descriptor table must stay 1:1 with the scope union.
if (BY_SCOPE.size !== ALL_DURABLE_AUTHORITY_SCOPES.length) {
  throw new Error('Stage 15 safe-field descriptor table is out of sync with DurableAuthorityScope.');
}

export function isKnownDurableScope(scope: string): scope is DurableAuthorityScope {
  return KNOWN_SCOPES.has(scope);
}

export function safeFieldDescriptor(scope: DurableAuthorityScope): SafeFieldDescriptor {
  const descriptor = BY_SCOPE.get(scope);
  if (!descriptor) throw new Error(`Unknown durable-authority scope: ${scope}`);
  return descriptor;
}

export function allSafeFieldDescriptors(): readonly SafeFieldDescriptor[] {
  return DESCRIPTORS;
}

/**
 * Field-level ownership registry. A durable universal write must NEVER take
 * ownership at the whole-entity level (a safe edit owns exactly one field of one
 * entity). This maps `<entityKind>.<universalField>` to `universal-owned` for
 * every allowlisted field; everything else is legacy-owned by construction and
 * is composed fresh from the exact current legacy state.
 */
export type FieldOwnership = 'universal-owned' | 'legacy-owned';

const OWNED_FIELD_KEYS = new Set<string>(
  DESCRIPTORS.map((descriptor) => `${descriptor.entityKind}.${descriptor.universalField}`),
);

export function ownershipOf(entityKind: string, universalField: string): FieldOwnership {
  return OWNED_FIELD_KEYS.has(`${entityKind}.${universalField}`) ? 'universal-owned' : 'legacy-owned';
}

/** All universal-owned `(entityKind, universalField)` slots, deterministically
 * ordered. Used by safe composition and reconciliation. */
export function universalOwnedFieldSlots(): readonly { entityKind: string; universalField: SafeUniversalField }[] {
  const seen = new Set<string>();
  const slots: { entityKind: string; universalField: SafeUniversalField }[] = [];
  for (const descriptor of DESCRIPTORS) {
    const key = `${descriptor.entityKind}.${descriptor.universalField}`;
    if (seen.has(key)) continue;
    seen.add(key);
    slots.push({ entityKind: descriptor.entityKind, universalField: descriptor.universalField });
  }
  return slots;
}

/**
 * Predicate over a universal-command changed path. A Stage 15 candidate may only
 * change the single allowlisted normalised field path shape
 * `durable.entities:<id>.<field>` for that scope's universal field. Anything
 * else is a scope violation and forces a pre-commit fallback.
 */
export function isAllowedDurableChangePath(scope: DurableAuthorityScope, path: string): boolean {
  const field = safeFieldDescriptor(scope).universalField;
  const escaped = field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^durable\\.entities:[^.]+\\.${escaped}$`).test(path);
}

/** Resolve the active durable scopes from a (narrowing-only) config string. */
export function resolveDurableScopes(configValue: string): Set<DurableAuthorityScope> {
  const trimmed = configValue.trim().toLowerCase();
  if (trimmed === '' || trimmed === '*' || trimmed === 'all') {
    return new Set(ALL_DURABLE_AUTHORITY_SCOPES);
  }
  const tokens = new Set(trimmed.split(/[\s,]+/).filter(Boolean));
  return new Set(ALL_DURABLE_AUTHORITY_SCOPES.filter((scope) => tokens.has(scope.toLowerCase())));
}

import type { CommandShadowScope } from '../command-shadow/commandShadowTypes';
import {
  ALL_COMMAND_AUTHORITY_SCOPES,
  type CommandAuthorityScope,
} from './commandAuthorityTypes';

const KNOWN_AUTHORITY_SCOPES = new Set<string>(ALL_COMMAND_AUTHORITY_SCOPES);

export function isKnownAuthorityScope(scope: string): scope is CommandAuthorityScope {
  return KNOWN_AUTHORITY_SCOPES.has(scope);
}

/**
 * Map a Stage 14 authority scope to the underlying, Stage 13-proven universal
 * command scope. Kept explicit (never string slicing) so the mapping is a closed
 * table, and so an authority scope can only ever drive its exact command.
 */
export function authorityToCommandScope(scope: CommandAuthorityScope): CommandShadowScope {
  switch (scope) {
    case 'greyholm.npc.role.update':
      return 'greyholm.npc.update';
    case 'userCampaign.npc.role.update':
      return 'userCampaign.npc.update';
  }
}

/**
 * Predicate over a universal-command changed-path. Stage 14 candidates may only
 * change the single allowlisted NPC field path shape produced by
 * `executeUniversalCommand` for an npc-update, i.e.
 * `durable.entities:<id>.role`. Anything else is a scope violation and forces a
 * fallback. Technical revision changes are handled separately by the comparator
 * (revision is normalised out), so they never appear in `changedPaths`.
 */
export function isAllowedAuthorityChangePath(scope: CommandAuthorityScope, path: string): boolean {
  switch (scope) {
    case 'greyholm.npc.role.update':
    case 'userCampaign.npc.role.update':
      // e.g. "durable.entities:entity:npc/<legacyId>.role"
      return /^durable\.entities:[^.]+\.role$/.test(path);
  }
}

/** Resolve the active authority scopes from a (narrowing-only) config string. */
export function resolveAuthorityScopes(configValue: string): Set<CommandAuthorityScope> {
  const trimmed = configValue.trim().toLowerCase();
  if (trimmed === '' || trimmed === '*' || trimmed === 'all') {
    return new Set(ALL_COMMAND_AUTHORITY_SCOPES);
  }
  const tokens = new Set(trimmed.split(/[\s,]+/).filter(Boolean));
  return new Set(ALL_COMMAND_AUTHORITY_SCOPES.filter((scope) => tokens.has(scope.toLowerCase())));
}

import type { PilotScopeDefinition } from './readPathTypes';

/**
 * Stage 10 — the fixed registry of allowlisted pilot read-path consumers.
 *
 * Adding a scope here is the ONLY way a consumer can ever read from the
 * universal shadow snapshot. Every other UI consumer keeps reading legacy data.
 * The registry is intentionally small and representative (Step 4): a Greyholm DM
 * consumer, a Greyholm collection/reference consumer, Player-Safe and Observer
 * consumers, a runtime consumer, and a user-campaign DM consumer.
 */
export const PILOT_SCOPES: readonly PilotScopeDefinition[] = Object.freeze([
  {
    scope: 'greyholm.dm.summary',
    label: 'Greyholm — DM campaign summary (counts)',
    stack: 'greyholm',
    projection: 'dm',
    variant: 'summary',
    runtime: false,
  },
  {
    scope: 'greyholm.dm.npcList',
    label: 'Greyholm — DM NPC list (collection/reference)',
    stack: 'greyholm',
    projection: 'dm',
    variant: 'npcList',
    runtime: false,
  },
  {
    scope: 'greyholm.playerSafe.entities',
    label: 'Greyholm — Player-Safe entity list',
    stack: 'greyholm',
    projection: 'playerSafe',
    variant: 'entities',
    runtime: false,
  },
  {
    scope: 'greyholm.observer.status',
    label: 'Greyholm — Observer status',
    stack: 'greyholm',
    projection: 'observer',
    variant: 'observer',
    runtime: false,
  },
  {
    scope: 'greyholm.runtime.presentation',
    label: 'Greyholm — presented card / active battles (runtime)',
    stack: 'greyholm',
    projection: 'playerSafe',
    variant: 'runtime',
    runtime: true,
  },
  {
    scope: 'userCampaign.dm.summary',
    label: 'User campaign — DM summary (counts)',
    stack: 'userCampaign',
    projection: 'dm',
    variant: 'summary',
    runtime: false,
  },
] as const);

const BY_SCOPE = new Map(PILOT_SCOPES.map((definition) => [definition.scope, definition]));

export function getPilotScope(scope: string): PilotScopeDefinition | undefined {
  return BY_SCOPE.get(scope);
}

export function isPilotScope(scope: string): boolean {
  return BY_SCOPE.has(scope);
}

/**
 * Resolve the effective pilot allowlist from the read-path flag + optional scope
 * configuration string (comma/space separated). When the flag is OFF the
 * allowlist is always empty. When ON with no explicit scope config, ALL pilot
 * scopes are allowed. An explicit config narrows to the named, KNOWN scopes only
 * (unknown tokens are ignored — never silently enabling a non-pilot consumer).
 */
export function resolvePilotAllowlist(enabled: boolean, scopeConfig?: string | null): Set<string> {
  if (!enabled) return new Set();
  const trimmed = (scopeConfig ?? '').trim();
  if (trimmed === '' || trimmed === '*' || trimmed.toLowerCase() === 'all') {
    return new Set(PILOT_SCOPES.map((definition) => definition.scope));
  }
  const requested = trimmed
    .split(/[\s,]+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0);
  return new Set(requested.filter((token) => BY_SCOPE.has(token)));
}

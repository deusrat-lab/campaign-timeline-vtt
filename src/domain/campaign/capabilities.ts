/**
 * Additive superset covering the task's named minimum capability list
 * (arcs/atlas/maps/locations/placements/party/routes/timeline/calendar/
 * events/triggers/npc/quests/enemies/factions/images/economy/zones/overlays/
 * movableEntities/battleMaps/battles/playerView/observer/importExport).
 * Several task names map onto keys that already existed under a slightly
 * different name from an earlier stage — kept as-is rather than renamed, to
 * avoid breaking every already-committed snapshot/test that references them:
 * triggers -> `delayedTriggers`, zones -> `factionZones`, overlays ->
 * `dynamicOverlays`, battles -> `battleRuntime`, playerView -> `playerSafe`.
 * Every other task-named key is added below as a genuinely new key.
 */
export const UNIVERSAL_CAPABILITY_KEYS = [
  'maps',
  'timeline',
  'calendar',
  'travel',
  'events',
  'delayedTriggers',
  'factionZones',
  'dynamicOverlays',
  'movableEntities',
  'economy',
  'battleMaps',
  'battleRuntime',
  'playerSafe',
  'observer',
  'serverSync',
  'arcs',
  'atlas',
  'locations',
  'placements',
  'party',
  'routes',
  'npc',
  'quests',
  'enemies',
  'factions',
  'images',
  'importExport',
] as const;

export type UniversalCapabilityKey = typeof UNIVERSAL_CAPABILITY_KEYS[number];

export interface CapabilityState {
  enabled: boolean;
  readonly?: boolean;
  reason?: string;
}

export type CampaignCapabilities = Record<UniversalCapabilityKey, CapabilityState>;

export function defaultCapabilities(enabled = true): CampaignCapabilities {
  return Object.fromEntries(
    UNIVERSAL_CAPABILITY_KEYS.map((key) => [key, { enabled } satisfies CapabilityState]),
  ) as CampaignCapabilities;
}

export function capabilityEnabled(capabilities: CampaignCapabilities, key: UniversalCapabilityKey): boolean {
  return capabilities[key]?.enabled === true;
}

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

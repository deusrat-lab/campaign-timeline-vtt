export type Brand<TValue, TBrand extends string> = TValue & { readonly __brand: TBrand };

export type CampaignId = Brand<string, 'CampaignId'>;
export type UniversalEntityId = Brand<string, 'UniversalEntityId'>;
export type UniversalMapId = Brand<string, 'UniversalMapId'>;
export type UniversalRuntimeId = Brand<string, 'UniversalRuntimeId'>;
export type UniversalRevision = Brand<number, 'UniversalRevision'>;
export type UniversalSchemaVersion = Brand<string, 'UniversalSchemaVersion'>;

const ID_PATTERN = /^[a-z][a-z0-9-]*(?::[a-zA-Z0-9._-]+)+$/;

export function makeCampaignId(value: string): CampaignId {
  return assertId(value, 'campaign id') as CampaignId;
}

export function makeEntityId(value: string): UniversalEntityId {
  return assertId(value, 'entity id') as UniversalEntityId;
}

export function makeMapId(value: string): UniversalMapId {
  return assertId(value, 'map id') as UniversalMapId;
}

export function makeRuntimeId(value: string): UniversalRuntimeId {
  return assertId(value, 'runtime id') as UniversalRuntimeId;
}

export function makeRevision(value: number): UniversalRevision {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`Invalid revision: ${value}`);
  }
  return value as UniversalRevision;
}

export function makeSchemaVersion(value: string): UniversalSchemaVersion {
  if (!/^\d+\.\d+\.\d+$/.test(value)) {
    throw new Error(`Invalid schema version: ${value}`);
  }
  return value as UniversalSchemaVersion;
}

function assertId(value: string, label: string): string {
  if (!ID_PATTERN.test(value)) {
    throw new Error(`Invalid ${label}: ${value}`);
  }
  return value;
}

/**
 * Single shared placement-id authority for BOTH the Greyholm and user-campaign
 * legacy stores. Previously each store independently minted its own id
 * (`` `placement-${Date.now()}` `` in `campaignStore.tsx`, `uid('pin')` — a
 * `Date.now()` + `Math.random()` composite — in `userCampaignStore.tsx`), so
 * the same "new placement" intent could resolve to two unrelated ids depending
 * on which stack handled it. Routing both stacks' placement-create action
 * through this one function means the id is decided exactly once, before the
 * legacy dispatch AND the universal `placement.place` command are built, so
 * they always agree — no independent re-generation, no drift.
 */
let placementIdSequence = 0;
export function mintPlacementId(): string {
  placementIdSequence += 1;
  const time = Date.now().toString(36);
  const random = Math.random().toString(36).slice(2, 8);
  return `placement-${time}-${placementIdSequence}-${random}`;
}

export function sourceScopedId(prefix: string, sourceId: string): string {
  const normalized = sourceId
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
    .replace(/-+/g, '-');
  return `${prefix}:${normalized}`;
}

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

export function sourceScopedId(prefix: string, sourceId: string): string {
  const normalized = sourceId
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-zA-Z0-9._:-]/g, '-')
    .replace(/-+/g, '-');
  return `${prefix}:${normalized}`;
}

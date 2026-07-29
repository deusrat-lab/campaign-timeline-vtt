import type { CampaignSnapshot } from '../campaign/snapshot';

export function stableStringify(value: unknown): string {
  return JSON.stringify(sortForSerialization(value));
}

export function serializeCampaignSnapshot(snapshot: CampaignSnapshot): string {
  return stableStringify(snapshot);
}

export function parseCampaignSnapshotJson(json: string): unknown {
  return JSON.parse(json) as unknown;
}

function sortForSerialization(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortForSerialization);
  }
  if (!value || typeof value !== 'object') {
    return value;
  }
  const record = value as Record<string, unknown>;
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(record).sort()) {
    const item = record[key];
    if (item !== undefined) {
      sorted[key] = sortForSerialization(item);
    }
  }
  return sorted;
}

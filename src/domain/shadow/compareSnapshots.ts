import type { CampaignSnapshot } from '../campaign/snapshot';
import type { ShadowComparisonSummary } from './shadowTypes';

const MAX_REPORTED = 25;

/**
 * Semantic (not raw JSON-string) comparison of two campaign snapshots. Used by
 * the Stage 9 coordinator to prove a persisted shadow snapshot round-trips
 * losslessly (candidate vs reloaded) and to detect divergence.
 *
 * Only IDs, dotted paths and counts are returned — never payload values — so
 * the result is safe to log in DM diagnostics without dumping secrets. The
 * persisted `revision` is normalized out: the repository bumps it on every
 * write, so a revision-only delta is expected and reported as `revisionOnly`.
 */
export function compareSnapshots(candidate: CampaignSnapshot, reloaded: CampaignSnapshot): ShadowComparisonSummary {
  const changedPaths: string[] = [];
  const missingIds: string[] = [];
  const addedIds: string[] = [];

  const left = normalize(candidate);
  const right = normalize(reloaded);

  // Collection-level ID diffing for the identifiable durable collections.
  const idCollections: Array<[string, Array<{ id: string }>]> = [
    ['durable.maps', left.durable.maps as Array<{ id: string }>],
    ['durable.hotspots', left.durable.hotspots as Array<{ id: string }>],
    ['durable.placements', left.durable.placements as Array<{ id: string }>],
    ['durable.routes', left.durable.routes as Array<{ id: string }>],
    ['durable.entities', left.durable.entities as Array<{ id: string }>],
    ['durable.battleMaps', left.durable.battleMaps as Array<{ id: string }>],
    ['durable.battleEntries', left.durable.battleEntries as Array<{ id: string }>],
  ];
  const rightById: Record<string, Set<string>> = {};
  for (const [path] of idCollections) {
    const coll = getByPath(right, path) as Array<{ id: string }> | undefined;
    rightById[path] = new Set((coll ?? []).map((item) => item.id));
  }
  const leftById: Record<string, Set<string>> = {};
  for (const [path, coll] of idCollections) {
    leftById[path] = new Set((coll ?? []).map((item) => item.id));
    for (const item of coll ?? []) {
      if (!rightById[path].has(item.id)) missingIds.push(`${path}:${item.id}`);
    }
    for (const id of rightById[path]) {
      if (!leftById[path].has(id)) addedIds.push(`${path}:${id}`);
    }
  }

  // Deep structural diff over the whole normalized snapshot for changed paths.
  diff(left, right, '', changedPaths);

  const revisionOnly =
    changedPaths.length === 0 &&
    missingIds.length === 0 &&
    addedIds.length === 0 &&
    candidate.revision !== reloaded.revision;

  const mismatchCount = changedPaths.length + missingIds.length + addedIds.length;

  return {
    equal: mismatchCount === 0,
    mismatchCount,
    changedPaths: changedPaths.slice(0, MAX_REPORTED),
    missingIds: missingIds.slice(0, MAX_REPORTED),
    addedIds: addedIds.slice(0, MAX_REPORTED),
    revisionOnly,
  };
}

/** Strip the repository-managed revision so it never registers as a mismatch. */
function normalize(snapshot: CampaignSnapshot): CampaignSnapshot {
  return { ...snapshot, revision: 0 as CampaignSnapshot['revision'] };
}

function getByPath(root: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, root);
}

function diff(a: unknown, b: unknown, path: string, out: string[]): void {
  if (out.length > MAX_REPORTED * 4) return; // bound work on huge datasets
  if (a === b) return;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') {
    if (!Object.is(a, b)) out.push(path || '<root>');
    return;
  }
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b)) {
      out.push(path || '<root>');
      return;
    }
    if (a.length !== b.length) {
      out.push(`${path}.length`);
    }
    const max = Math.min(a.length, b.length);
    for (let i = 0; i < max; i += 1) diff(a[i], b[i], `${path}[${i}]`, out);
    return;
  }
  const keys = new Set([...Object.keys(a as object), ...Object.keys(b as object)]);
  for (const key of keys) {
    diff(
      (a as Record<string, unknown>)[key],
      (b as Record<string, unknown>)[key],
      path ? `${path}.${key}` : key,
      out,
    );
  }
}

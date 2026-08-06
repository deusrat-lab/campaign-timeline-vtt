import type { CampaignSnapshot } from '../campaign/snapshot';
import { compareSnapshots } from '../shadow/compareSnapshots';
import { stableHash } from './commandShadowCoordinator';
import type { CommandComparisonSummary } from './commandShadowTypes';

const MAX_REPORTED = 25;

/**
 * Compare the universal-command result (A) with the adapter-derived expected
 * post-state (B). Reuses the Stage 9 semantic snapshot comparison for the heavy
 * lifting (id-diffing + structural path diff, revision normalised out), then
 * classifies the outcome for Stage 13 and buckets safe mismatch paths by
 * concern (reference / runtime / visibility). Only ids, dotted paths and counts
 * are ever returned — never payload values.
 *
 *   equal            — A and B are semantically identical.
 *   revision_only    — identical apart from the repository-managed revision.
 *   ordering_only    — identical after sorting identifiable collections by id
 *                      (a semantically-irrelevant element reordering).
 *   semantic_mismatch — a real divergence (entities/refs/runtime/visibility…).
 */
export function compareCommandResult(a: CampaignSnapshot, b: CampaignSnapshot): CommandComparisonSummary {
  const na = normalizeTechnical(a);
  const nb = normalizeTechnical(b);
  const raw = compareSnapshots(na, nb);

  // revision_only must be checked BEFORE equal: a pure revision delta leaves
  // mismatchCount at 0 (so raw.equal is also true), but the classification we
  // want to surface is that the repository revision advanced.
  if (raw.revisionOnly) {
    return summarize('revision_only', raw);
  }
  if (raw.equal) {
    return summarize('equal', raw);
  }

  // Ordering-only: identical once identifiable durable collections are sorted by
  // id. This proves the only delta is element order, which is semantically
  // irrelevant for these keyed collections.
  const sortedCompare = compareSnapshots(sortIdentifiable(na), sortIdentifiable(nb));
  if (sortedCompare.equal || sortedCompare.revisionOnly) {
    return summarize('ordering_only', raw);
  }

  return summarize('semantic_mismatch', raw);
}

function summarize(
  classification: CommandComparisonSummary['classification'],
  raw: ReturnType<typeof compareSnapshots>,
): CommandComparisonSummary {
  const paths = raw.changedPaths;
  return {
    classification,
    mismatchCount: raw.mismatchCount,
    changedPaths: paths.slice(0, MAX_REPORTED),
    missingIds: raw.missingIds.slice(0, MAX_REPORTED),
    addedIds: raw.addedIds.slice(0, MAX_REPORTED),
    referenceMismatches: paths.filter(isReferencePath).slice(0, MAX_REPORTED),
    runtimeMismatches: paths.filter((p) => p.startsWith('runtime')).slice(0, MAX_REPORTED),
    visibilityMismatches: paths.filter((p) => p.startsWith('visibility')).slice(0, MAX_REPORTED),
  };
}

function isReferencePath(path: string): boolean {
  return /Ref|Refs|entityRef|placements|hotspots|routes/.test(path);
}

/**
 * Blank out the explicitly-allowed technical differences before diffing: the
 * repository-managed revision (also handled by compareSnapshots) and the
 * command/adaptation timestamps (metadata.createdAt/updatedAt and each
 * source.importedAt). These are NOT semantic campaign data — they change purely
 * because the pre- and post-states are adapted at different instants — so a
 * delta confined to them must never be reported as a mismatch.
 *
 * ALSO neutralised: the adapter's verbatim raw-legacy *preservation mirrors* —
 * `durable.extensions.overlayRemainder` (a byte-for-byte echo of the whole
 * legacy overlay) and `runtime.extensions` (which mirrors overlay.party /
 * revealedToPlayers). These are retained only for lossless round-trip
 * persistence and are NOT part of the normalised universal model a universal
 * command operates on; a universal command deliberately writes the normalised
 * fields (runtime.presentation, visibility.entities, …), not the raw echo. The
 * semantic comparison is therefore between the normalised projections. Every
 * normalised field — entities, refs, coordinates, visibility, runtime.party,
 * runtime.presentation, images — is preserved and still compared.
 */
/**
 * A stable hash of a snapshot's SEMANTIC content — the same normalisation the
 * command comparison applies (repository revision + adaptation timestamps + the
 * verbatim raw-legacy echoes neutralised). Two adapter runs over the identical
 * legacy state hash equal, even though their raw `stableHash` differs because the
 * adapter stamps a fresh `importedAt`/`updatedAt` each run. Used by Stage 14 for
 * stable pre/candidate/committed hashes, deterministic event ids and the stale
 * precondition re-check.
 */
export function semanticSnapshotHash(snapshot: CampaignSnapshot): string {
  return stableHash(normalizeTechnical(snapshot));
}

export function normalizeTechnical(snapshot: CampaignSnapshot): CampaignSnapshot {
  const durableExtensions = { ...(snapshot.durable.extensions ?? {}) };
  delete (durableExtensions as Record<string, unknown>).overlayRemainder;
  return {
    ...snapshot,
    metadata: {
      ...snapshot.metadata,
      createdAt: '',
      updatedAt: '',
      sources: snapshot.metadata.sources.map((source) => ({ ...source, importedAt: undefined })),
    },
    durable: {
      ...snapshot.durable,
      extensions: durableExtensions,
      // Neutralise the per-entity verbatim raw-legacy preservation mirror
      // (`extensions.original`). Like `durable.extensions.overlayRemainder` and
      // `runtime.extensions`, it is retained only for lossless round-trip
      // persistence and is NOT part of the normalised universal model a command
      // operates on: the normalised fields (`entity.role`, `entity.name`, …) are
      // still compared directly. Without this, a legacy edit applied through the
      // overlay (which leaves the base-data echo untouched) would spuriously
      // differ from a universal command that also rewrites the echo.
      entities: snapshot.durable.entities.map((entity) => stripEntityOriginal(entity)),
      // Same rationale for placements: `adaptMainCampaignToUniversal` stamps every
      // placement with `extensions: { original: <legacy placement> }`, but the
      // pure `placement.place`/`move`/`remove` command executors never populate
      // `extensions` on the placement they produce (see
      // `src/domain/complex-authority/complexCommands.ts`). Left unstripped, that
      // asymmetry alone made every Greyholm placement-create durable commit
      // report a spurious `semantic_mismatch` and fall back to legacy — this was
      // the residual layer of FINAL_REMAINING_WORK_AUDIT.md §4b.3, exposed once
      // the underlying data-staleness bug was fixed.
      placements: snapshot.durable.placements.map((placement) => stripEntityOriginal(placement)),
    },
    runtime: { ...snapshot.runtime, extensions: {} },
    migrationMetadata: snapshot.migrationMetadata.map((meta) => ({ ...meta, migratedAt: '' })),
  };
}

function stripEntityOriginal<T extends { extensions?: Record<string, unknown> }>(entity: T): T {
  if (!entity.extensions || !('original' in entity.extensions)) return entity;
  const extensions = { ...entity.extensions };
  delete (extensions as Record<string, unknown>).original;
  // A pure domain command (e.g. `placement.place`) never sets `extensions` at
  // all on the record it produces — the key is absent, not `{}`. If stripping
  // `original` here left `extensions: {}` behind, that would itself be a
  // structural mismatch against the command's key-absent record (`{}` !==
  // `undefined` under the structural diff below). Drop the key entirely once
  // it is empty so both sides normalize to the same "no extensions" shape.
  const result: T = { ...entity, extensions };
  if (Object.keys(extensions).length === 0) delete (result as { extensions?: unknown }).extensions;
  return result;
}

function sortIdentifiable(snapshot: CampaignSnapshot): CampaignSnapshot {
  const sortById = <T extends { id: string }>(list: readonly T[]): T[] =>
    [...list].sort((x, y) => (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  return {
    ...snapshot,
    durable: {
      ...snapshot.durable,
      maps: sortById(snapshot.durable.maps),
      hotspots: sortById(snapshot.durable.hotspots),
      placements: sortById(snapshot.durable.placements),
      routes: sortById(snapshot.durable.routes),
      entities: sortById(snapshot.durable.entities),
      battleMaps: sortById(snapshot.durable.battleMaps),
      battleEntries: sortById(snapshot.durable.battleEntries),
    },
  };
}

/**
 * Stage 17 — local source-of-truth cutover: default-off flags + a typed
 * ownership registry.
 *
 * The registry is the single place that answers "who owns writes for system X".
 * The core safety invariant is NO ambiguous dual authority: a system can never
 * be universal-owned while legacy is still an authoritative writer. When cutover
 * is enabled for a family, legacy is demoted to a compatibility view for that
 * family; honestly-deferred families stay legacy-owned and are NOT claimed.
 */

export interface Stage17Flags {
  /** Universal battle contract owns battle writes. */
  battleAuthority: boolean;
  /** Universal import/export/backup/restore pipeline is primary. */
  importExport: boolean;
  /** Universal sync contract is active (still local/compat only). */
  sync: boolean;
  /** Master switch: universal repo/store is the primary local source of truth. */
  localCutover: boolean;
}

export const STAGE_17_DEFAULT_FLAGS: Stage17Flags = {
  battleAuthority: false,
  importExport: false,
  sync: false,
  localCutover: false,
};

export type Owner = 'universal' | 'legacy' | 'compatibility' | 'deferred';
export type LegacyRole = 'authoritative' | 'compatibility' | 'none';

export type OwnershipSystem =
  | 'campaign-metadata' | 'npc' | 'quests' | 'factions' | 'locations' | 'maps'
  | 'placements' | 'reveal' | 'presented-cards' | 'party' | 'routes' | 'timeline'
  | 'events' | 'faction-zones' | 'movable-entities' | 'hotspots'
  | 'battle-definitions' | 'battle-runtime' | 'imports' | 'exports'
  | 'backup' | 'restore' | 'sync';

export interface OwnershipEntry {
  system: OwnershipSystem;
  owner: Owner;
  legacyRole: LegacyRole;
  /** Which Stage 17 family/flag governs this system (for cutover flips). */
  family?: 'battle' | 'import-export' | 'sync';
  note?: string;
}

/**
 * Baseline = the proven state at the START of Stage 17 (Stage 15 + Stage 16).
 * Universal already owns the Stage 15 scalar text scopes (folded into the
 * per-system rows below where applicable) and the Stage 16 aggregates
 * (reveal, presented cards, placement move/remove). Everything else is legacy.
 */
export function baselineOwnership(): OwnershipEntry[] {
  return [
    { system: 'campaign-metadata', owner: 'universal', legacyRole: 'compatibility', note: 'Stage 15 scalar/text scopes' },
    { system: 'npc', owner: 'universal', legacyRole: 'compatibility', note: 'Stage 15 safe fields' },
    { system: 'quests', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'factions', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'locations', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'maps', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'placements', owner: 'universal', legacyRole: 'compatibility', note: 'Stage 16 move/remove; create still deferred' },
    { system: 'reveal', owner: 'universal', legacyRole: 'compatibility', note: 'Stage 16 (Greyholm)' },
    { system: 'presented-cards', owner: 'universal', legacyRole: 'compatibility', note: 'Stage 16' },
    { system: 'party', owner: 'deferred', legacyRole: 'authoritative', note: 'multi-region runtime; honestly deferred' },
    { system: 'routes', owner: 'deferred', legacyRole: 'authoritative', note: 'honestly deferred' },
    { system: 'timeline', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'events', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'faction-zones', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'movable-entities', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'hotspots', owner: 'legacy', legacyRole: 'authoritative' },
    { system: 'battle-definitions', owner: 'legacy', legacyRole: 'authoritative', family: 'battle' },
    { system: 'battle-runtime', owner: 'legacy', legacyRole: 'authoritative', family: 'battle' },
    { system: 'imports', owner: 'legacy', legacyRole: 'authoritative', family: 'import-export' },
    { system: 'exports', owner: 'legacy', legacyRole: 'authoritative', family: 'import-export' },
    { system: 'backup', owner: 'legacy', legacyRole: 'authoritative', family: 'import-export' },
    { system: 'restore', owner: 'legacy', legacyRole: 'authoritative', family: 'import-export' },
    { system: 'sync', owner: 'legacy', legacyRole: 'authoritative', family: 'sync' },
  ];
}

/**
 * Effective ownership under a set of flags. Cutover only flips a family when BOTH
 * the master `localCutover` switch and the family flag are on. A flip promotes
 * the system to universal and demotes legacy to a compatibility view (never a
 * second authoritative writer). Deferred systems are never auto-flipped.
 */
export function resolveOwnership(flags: Stage17Flags, baseline = baselineOwnership()): OwnershipEntry[] {
  return baseline.map((entry) => {
    if (!flags.localCutover) return { ...entry };
    if (entry.owner === 'deferred') return { ...entry };
    const flip =
      (entry.family === 'battle' && flags.battleAuthority) ||
      (entry.family === 'import-export' && flags.importExport) ||
      (entry.family === 'sync' && flags.sync);
    if (!flip) return { ...entry };
    // sync stays compatibility-only (no production activation) but is no longer
    // an independent authoritative legacy writer.
    const owner: Owner = entry.family === 'sync' ? 'compatibility' : 'universal';
    return { ...entry, owner, legacyRole: 'compatibility' };
  });
}

export interface DualAuthorityViolation {
  system: OwnershipSystem;
  message: string;
}

/** No system may be universal-owned while legacy is still authoritative. */
export function findDualAuthority(registry: OwnershipEntry[]): DualAuthorityViolation[] {
  const violations: DualAuthorityViolation[] = [];
  const seen = new Set<string>();
  for (const entry of registry) {
    if (seen.has(entry.system)) {
      violations.push({ system: entry.system, message: `duplicate ownership row for ${entry.system}` });
    }
    seen.add(entry.system);
    if (entry.owner === 'universal' && entry.legacyRole === 'authoritative') {
      violations.push({ system: entry.system, message: `${entry.system} is universal-owned but legacy is still authoritative` });
    }
  }
  return violations;
}

export function ownerOf(registry: OwnershipEntry[], system: OwnershipSystem): Owner | undefined {
  return registry.find((entry) => entry.system === system)?.owner;
}

/**
 * Stage 5C, Step 6 — encounter preset resolver MVP.
 *
 * Audited: there is NO encounter-preset data model anywhere in this codebase.
 * Neither `src/types.ts` nor `src/types/dmCompanion.ts` define any
 * preset/encounter-preset shape, and no JSON under `public/data/` carries
 * preset records — `BattleEntry.encounterPresetIds` is a bare `string[]` with
 * nothing on the other end to resolve it against. This resolver therefore
 * NEVER fabricates a name/composition — it always reports `missing: true`.
 * If a future stage adds a real preset data source, this is the single place
 * to wire it in.
 */
export interface ResolvedEncounterPreset {
  id: string;
  name: string;
  missing: true;
}

export function resolveEncounterPreset(presetId: string): ResolvedEncounterPreset {
  return { id: presetId, name: presetId, missing: true };
}

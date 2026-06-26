/**
 * Layer Presets MVP (Stage 3) — named bundles of "which existing layers are
 * visible" for the Map Workspace. A preset never reimplements filtering: the
 * two player-facing presets ('player_safe', 'observer') route straight
 * through src/data/playerSafeProjection.ts, exactly like the existing
 * isPlayerView branches in MapWorkspacePage.tsx already do. This module only
 * decides WHICH layers a preset turns on/off — it never decides HOW a layer
 * is filtered for player safety.
 *
 * Limitation (documented per the Stage 3 brief rather than solved): switching
 * presets does not attempt to preserve any other custom/manual layer toggle
 * the DM may have set (e.g. placementLayerVisible in the overlay) — applying
 * a preset simply overwrites the layer-visibility flags below. Merging would
 * require a separate "custom overrides on top of preset" model, which is out
 * of scope for this MVP.
 */

export type LayerPresetId = 'dm_full' | 'session' | 'player_safe' | 'observer' | 'travel' | 'clean_map';

export interface LayerVisibility {
  locations: boolean;
  placements: boolean;
  routes: boolean;
  events: boolean;
  quickPins: boolean;
  party: boolean;
  battleMapLinks: boolean;
  /** Hidden/DM-only content (status==='hidden', visibleInPlayerView:false,
   * dmNotes, etc) — only ever true for DM-only presets. */
  hiddenDmOnly: boolean;
  /** Free-text DM notes / secrets fields specifically (a subset of
   * hiddenDmOnly that some presets may still want separate from e.g. hidden
   * locations) — kept distinct so a future preset could show hidden markers
   * without exposing notes text, even though none of the six MVP presets
   * below actually split them. */
  notesAndSecrets: boolean;
  /** True when this preset must be rendered via the Player Safe Projection
   * module rather than raw DM data — a hint for the call site, not a
   * filtering rule in itself. */
  usesPlayerSafeProjection: boolean;
  /** True when edit UI (drag, create, delete, status selects, etc.) should be
   * suppressed regardless of the surrounding mode. */
  hideEditControls: boolean;
  /** Faction Zones (Stage 4A). For player-facing presets this layer is ALWAYS
   * rendered via getPlayerSafeFactionZones() — never raw factionZonesById —
   * exactly like usesPlayerSafeProjection governs hotspots/routes/events.
   * Hidden/DM-only zones must never leak into player_safe/observer regardless
   * of this flag (the projection enforces that independently). */
  factionZones: boolean;
  /** Dynamic Map Overlays (Stage 4B). For player-facing presets this layer is
   * ALWAYS rendered via getPlayerSafeDynamicMapOverlays() — never raw
   * dynamicMapOverlaysById — exactly like usesPlayerSafeProjection governs
   * hotspots/routes/events/factionZones. */
  dynamicOverlays: boolean;
  /** Movable Entities (Stage 4B). Player-facing presets keep this false for
   * clarity even though getPlayerSafeMovableEntities() already returns []
   * unconditionally — the flag documents intent at the preset level too. */
  movableEntities: boolean;
  /** Battle Entries (Stage 5A). For player-facing presets this layer is
   * ALWAYS rendered via getPlayerSafeBattleEntries() — never raw
   * battleEntriesById — exactly like usesPlayerSafeProjection governs
   * hotspots/routes/events/factionZones. Hidden/disabled/DM-only entries must
   * never leak into player_safe/observer regardless of this flag (the
   * projection enforces that independently). */
  battleEntries: boolean;
}

export const LAYER_PRESETS: Record<LayerPresetId, LayerVisibility> = {
  dm_full: {
    locations: true,
    placements: true,
    routes: true,
    events: true,
    quickPins: true,
    party: true,
    battleMapLinks: true,
    hiddenDmOnly: true,
    notesAndSecrets: true,
    usesPlayerSafeProjection: false,
    hideEditControls: false,
    factionZones: true,
    dynamicOverlays: true,
    movableEntities: true,
    battleEntries: true,
  },
  session: {
    locations: true,
    placements: true,
    routes: true,
    events: true,
    quickPins: true,
    party: true,
    battleMapLinks: true,
    // Session view is still DM-side (used during live play at the table) so
    // hidden/DM-only content stays visible — it just emphasizes active
    // content; the actual "active/planned only" filtering already happens in
    // MapWorkspacePage's sessionCampaignEvents/etc, this preset just keeps
    // the layer switched on.
    hiddenDmOnly: true,
    notesAndSecrets: false,
    usesPlayerSafeProjection: false,
    hideEditControls: false,
    // Active/contested/danger/warfront zones relevant to the live session
    // stay visible to the DM here too — same "DM-side, hidden stays visible"
    // philosophy as the rest of this preset.
    factionZones: true,
    dynamicOverlays: true,
    movableEntities: true,
    // Available/active/prepared entries relevant to the live session stay
    // visible to the DM (rendering of which subset is session-relevant
    // happens in MapWorkspacePage, this preset just keeps the layer on).
    battleEntries: true,
  },
  player_safe: {
    locations: true,
    placements: true,
    routes: true,
    events: true,
    quickPins: false,
    party: true,
    battleMapLinks: false,
    hiddenDmOnly: false,
    notesAndSecrets: false,
    usesPlayerSafeProjection: true,
    hideEditControls: true,
    // Only ever rendered via getPlayerSafeFactionZones() — see usesPlayerSafeProjection.
    factionZones: true,
    // Gated by getPlayerSafeDynamicMapOverlays(), not raw access — see usesPlayerSafeProjection.
    dynamicOverlays: true,
    // Moot in practice since getPlayerSafeMovableEntities() always returns []
    // for now, but set false here for clarity/intent.
    movableEntities: false,
    // Only ever rendered via getPlayerSafeBattleEntries() — see usesPlayerSafeProjection.
    battleEntries: true,
  },
  observer: {
    locations: true,
    placements: true,
    routes: true,
    // Player-visible CampaignEvents ARE shown to Observer (always through
    // getPlayerSafeEvents() — see playerSafeProjection.ts); only DM-only
    // events are excluded, which the projection already enforces.
    events: true,
    quickPins: false,
    party: true,
    battleMapLinks: false,
    hiddenDmOnly: false,
    notesAndSecrets: false,
    usesPlayerSafeProjection: true,
    hideEditControls: true,
    // Only ever rendered via getPlayerSafeFactionZones() — see usesPlayerSafeProjection.
    factionZones: true,
    dynamicOverlays: true,
    movableEntities: false,
    // Only ever rendered via getPlayerSafeBattleEntries() — see usesPlayerSafeProjection.
    battleEntries: true,
  },
  travel: {
    locations: true,
    placements: false,
    routes: true,
    events: true,
    quickPins: false,
    party: true,
    battleMapLinks: false,
    hiddenDmOnly: true,
    notesAndSecrets: false,
    usesPlayerSafeProjection: false,
    hideEditControls: false,
    // Danger/restricted zones may help DM travel planning, but this preset is
    // DM-only context (never exposed to a player-facing render path) — see
    // module doc comment.
    factionZones: true,
    dynamicOverlays: true,
    movableEntities: false,
    // Available/active entries may be relevant while planning a travel leg
    // (e.g. an ambush prepared along the route) — DM-only context, never
    // exposed to a player-facing render path.
    battleEntries: true,
  },
  clean_map: {
    locations: false,
    placements: false,
    routes: false,
    events: false,
    quickPins: false,
    party: true,
    battleMapLinks: false,
    hiddenDmOnly: false,
    notesAndSecrets: false,
    usesPlayerSafeProjection: false,
    hideEditControls: true,
    factionZones: false,
    // Off for the MVP. A future "public ambient effect" exception (e.g. a
    // purely cosmetic weather tint shown even on the cleanest map view) could
    // flip this on later, but no such exception is built now.
    dynamicOverlays: false,
    movableEntities: false,
    battleEntries: false,
  },
};

export const LAYER_PRESET_LABELS: Record<LayerPresetId, string> = {
  dm_full: 'ДМ: всё',
  session: 'Сессия',
  player_safe: 'Игроки (безопасно)',
  observer: 'Наблюдатель',
  travel: 'Путешествие',
  clean_map: 'Чистая карта',
};

export function getLayerVisibility(preset: LayerPresetId): LayerVisibility {
  return LAYER_PRESETS[preset];
}

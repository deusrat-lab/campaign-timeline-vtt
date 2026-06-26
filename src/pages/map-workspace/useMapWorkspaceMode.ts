/**
 * Workspace Modes (Etap A) — a thin coordinating layer ON TOP OF the existing
 * per-tool local state in MapWorkspacePage.tsx (placingHotspot, placementMode,
 * routeDraft, editingRouteId, showSessionPanel, selectedRouteId,
 * locationPlacementDraft). This intentionally does NOT replace any of that
 * state — MapWorkspacePage already has a single mutual-exclusivity chokepoint
 * (cancelAllEditTools()) that every "start tool X" action calls first. This
 * hook derives a single MapWorkspaceMode value FROM that existing state (so
 * there is only one source of truth) and exposes a stable `cancelAllTools`
 * pass-through plus a small set of "is X allowed right now" guards that
 * MapWorkspacePage can use at call sites without duplicating the mutual-
 * exclusion logic.
 *
 * MapWorkspaceMode is intentionally separate from the global AppMode
 * ('dm-view' | 'dm-edit' | 'player-view', defined in src/types.ts) — AppMode
 * is "who is looking and can they edit at all"; MapWorkspaceMode is "what
 * tool/activity is active on the map right now" and only has meaning inside
 * the map workspace screen.
 */
export type MapWorkspaceMode =
  | 'view'
  | 'placement'
  | 'route_edit'
  | 'session'
  | 'travel'
  | 'battle_launch'
  | 'player_safe_preview'
  | 'area_edit';

export interface MapWorkspaceToolState {
  placingHotspot: boolean;
  placementMode: unknown | null;
  routeDraft: unknown | null;
  editingRouteId: string | null;
  showSessionPanel: boolean;
  selectedRouteId: string | null;
  locationPlacementDraft: unknown | null;
  /** True while the party marker is mid-walk along a route — used to block
   * manual hotspot dragging from starting mid-animation. */
  partyTravelAnimActive: boolean;
  /** Global AppMode === 'player-view' forces player_safe_preview regardless
   * of any other local tool state (edit controls are always disabled there). */
  isPlayerView: boolean;
  /** True while Area Edit Mode (Stage 4A — faction zone polygon create/edit)
   * is active. Mutually exclusive with placement/route_edit/session/travel,
   * same chokepoint pattern as every other tool here. */
  areaEditActive: boolean;
}

/**
 * Pure derivation — given the current snapshot of MapWorkspacePage's local
 * tool state, returns the single MapWorkspaceMode that best describes it.
 * Order matters: player_safe_preview wins over everything (Player View must
 * never report an editing mode even if stale tool state lingers), then the
 * route editor, then placement, then session, then plain view.
 */
export function deriveMapWorkspaceMode(state: MapWorkspaceToolState): MapWorkspaceMode {
  if (state.isPlayerView) return 'player_safe_preview';
  if (state.partyTravelAnimActive) return 'travel';
  if (state.routeDraft || state.editingRouteId) return 'route_edit';
  if (state.placingHotspot || state.placementMode || state.locationPlacementDraft) return 'placement';
  if (state.areaEditActive) return 'area_edit';
  if (state.showSessionPanel) return 'session';
  return 'view';
}

/** Mutual-exclusivity rules enforced by mode — used by call sites that want to
 * pre-emptively disable a control rather than rely on cancelAllEditTools()
 * silently overriding it once clicked. Kept data-only (no React) so it's
 * trivially unit-testable and reusable outside a component. */
export function isToolAllowedInMode(
  tool: 'route_edit' | 'placement' | 'hotspot_drag' | 'session' | 'area_edit',
  mode: MapWorkspaceMode,
): boolean {
  if (mode === 'player_safe_preview') return false;
  switch (tool) {
    case 'route_edit':
      // route_edit doesn't conflict with placement, but never while travelling or editing zones.
      return mode !== 'travel' && mode !== 'area_edit';
    case 'placement':
      // placement doesn't conflict with session, but never while editing a route, zones, or travelling.
      return mode !== 'route_edit' && mode !== 'travel' && mode !== 'area_edit';
    case 'hotspot_drag':
      // travel (party walking a route) must never race with manual hotspot dragging.
      return mode !== 'travel' && mode !== 'area_edit';
    case 'area_edit':
      // area_edit never runs alongside placement, route_edit, or travel.
      return mode !== 'placement' && mode !== 'route_edit' && mode !== 'travel';
    case 'session':
      return true;
    default:
      return true;
  }
}

/**
 * Coordinating hook. Takes the cancel-all callback MapWorkspacePage already
 * owns (cancelAllEditTools) plus a live snapshot of its tool state, and
 * returns the derived mode + a stable cancelAllTools wrapper + the guard
 * function above. Does not introduce any new useState — every piece of state
 * it reads already lives in MapWorkspacePage; this purely coordinates it.
 */
export function useMapWorkspaceMode(state: MapWorkspaceToolState, cancelAllEditTools: () => void) {
  const mode = deriveMapWorkspaceMode(state);
  return {
    mode,
    cancelAllTools: cancelAllEditTools,
    isAllowed: (tool: 'route_edit' | 'placement' | 'hotspot_drag' | 'session') => isToolAllowedInMode(tool, mode),
  };
}

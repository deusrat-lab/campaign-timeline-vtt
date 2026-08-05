/**
 * Stage 16.1 — a tiny, dependency-light registry that lets the legacy campaign
 * stores route an allowlisted COMPLEX (aggregate-level) transition through the
 * OPTIONAL, default-off universal complex-authority router WITHOUT the state
 * layer depending on the domain / feature layer.
 *
 * It is consulted BEFORE the Stage 15 durable sink (Stage 16 owns whole
 * aggregates: reveal / presented cards / party location / route progress /
 * placements — disjoint from the Stage 15 safe scalar fields, so there is never
 * double authority for one event). When Stage 16 owns the scope (flag on +
 * allowlisted) it performs the durable universal aggregate commit and the ONE
 * legacy compatibility projection, and reports `handled` so the store does not
 * commit again. When no router is registered (default, flag off) or the scope is
 * not Stage-16-owned, the route functions return `false` and the caller falls
 * through to its existing unchanged path. Always invoked defensively (never
 * throws back into the store): on an unexpected throw the store falls back to its
 * own legacy action.
 *
 * The store passes LEGACY identifiers only (a `ComplexActionDescriptor`); the
 * feature-layer provider translates them into the typed universal command with
 * proper universal ids, so this module stays free of any domain dependency.
 */

/** A legacy-terms description of the aggregate transition. The provider maps it
 * to the typed universal `ComplexCommand`. */
export type ComplexActionDescriptor =
  | { aggregate: 'reveal'; reveal: boolean; entityKind: string; legacyEntityId: string }
  | { aggregate: 'presentedCard'; present: boolean; cardType?: string; cardId?: string; clearPresentedBattle?: boolean }
  | {
      aggregate: 'partyLocation';
      locationStateId?: string;
      mapRawId?: string;
      x?: number;
      y?: number;
      clearMapPosition?: boolean;
      clearLocation?: boolean;
      clearRouteProgress?: boolean;
    }
  | { aggregate: 'routeProgress'; progress: Record<string, unknown> | null; clearMapPosition?: boolean }
  | { aggregate: 'placement'; op: 'place' | 'move' | 'remove'; placementId: string; mapRawId?: string; entityKind?: string; entityId?: string; x?: number; y?: number; title?: string; visibleToPlayers?: boolean };

export interface MainComplexRequest {
  /** One of the `greyholm.*` Stage 16 scopes. */
  complexScope: string;
  descriptor: ComplexActionDescriptor;
  /** The exact pre-mutation legacy overlay (immutable). */
  preOverlay: unknown;
  /** Pure predicted post-overlay WITHOUT dispatching. */
  predict: () => unknown;
  /** The ONE real legacy dispatch; returns the committed post-overlay. */
  commit: () => unknown;
  /** The unchanged legacy dispatch once (pre-commit fallback). */
  fallback: () => void;
}

export interface UserComplexRequest {
  legacyCampaignId: string;
  /** One of the `userCampaign.*` Stage 16 scopes. */
  complexScope: string;
  descriptor: ComplexActionDescriptor;
  preData: unknown;
  preRuntime: unknown;
  predict: () => { data: unknown; runtime: unknown };
  commit: () => { data: unknown; runtime: unknown };
  fallback: () => void;
}

export interface ComplexAuthoritySink {
  routeMain(request: MainComplexRequest): boolean;
  routeUser(request: UserComplexRequest): boolean;
}

let currentSink: ComplexAuthoritySink | null = null;

export function setComplexAuthoritySink(sink: ComplexAuthoritySink | null): void {
  currentSink = sink;
}

/** Returns `true` when the complex router handled the commit (caller must NOT
 * commit again and must NOT fall through); `false` otherwise. */
export function routeMainComplex(request: MainComplexRequest): boolean {
  if (!currentSink) return false;
  try {
    return currentSink.routeMain(request);
  } catch {
    return false;
  }
}

export function routeUserComplex(request: UserComplexRequest): boolean {
  if (!currentSink) return false;
  try {
    return currentSink.routeUser(request);
  } catch {
    return false;
  }
}

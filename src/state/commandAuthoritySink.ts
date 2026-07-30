/**
 * Stage 14 — a tiny, dependency-light registry that lets the legacy campaign
 * stores route an allowlisted single-field NPC edit through the OPTIONAL,
 * default-off universal command-authority router WITHOUT the state layer taking
 * a dependency on the domain / feature layer.
 *
 * Unlike the Stage 13 command-shadow sink (which observes an already-committed
 * mutation), the Stage 14 router runs the universal command FIRST and, only on
 * proven parity, performs the ONE real legacy compatibility commit via the
 * `commit` callback the store provides. When no router is registered (the
 * default, flag off) the route functions return `false` and the store performs
 * its own unchanged legacy commit — so the store behaves byte/semantics-exactly
 * as before Stage 14. A registered router GUARANTEES exactly one legacy commit
 * (its `commit` on the parity path, or `fallback` on a pre-commit failure), and
 * is always invoked defensively (never throws back into the store): if it throws
 * unexpectedly the store falls back to its own legacy commit.
 */

/** Request the store hands to the Main (Greyholm) authority route. Values are
 * raw legacy overlays; the registered router adapts them. `commit` performs the
 * real legacy dispatch and returns the exact committed post-overlay; `predict`
 * returns the pure-reducer post-overlay WITHOUT dispatching; `fallback` performs
 * the unchanged legacy dispatch once. */
export interface MainAuthorityRequest {
  scope: string;
  input: unknown;
  preOverlay: unknown;
  previousValue?: string;
  nextValue?: string;
  predict: () => unknown;
  commit: () => unknown;
  fallback: () => void;
}

export interface UserAuthorityRequest {
  legacyCampaignId: string;
  scope: string;
  input: unknown;
  preData: unknown;
  preRuntime: unknown;
  previousValue?: string;
  nextValue?: string;
  predict: () => { data: unknown; runtime: unknown };
  commit: () => { data: unknown; runtime: unknown };
  fallback: () => void;
}

export interface CommandAuthoritySink {
  routeMain(request: MainAuthorityRequest): boolean;
  routeUser(request: UserAuthorityRequest): boolean;
}

let currentSink: CommandAuthoritySink | null = null;

/** Register (or clear, with `null`) the single active command-authority sink. */
export function setCommandAuthoritySink(sink: CommandAuthoritySink | null): void {
  currentSink = sink;
}

/** Returns `true` when the router handled the legacy commit (the store must NOT
 * commit again); `false` when no router is active (the store commits itself). */
export function routeMainAuthority(request: MainAuthorityRequest): boolean {
  if (!currentSink) return false;
  try {
    return currentSink.routeMain(request);
  } catch {
    // A router failure must never lose the user's save: fall back to the store's
    // own legacy commit by reporting "not handled".
    return false;
  }
}

export function routeUserAuthority(request: UserAuthorityRequest): boolean {
  if (!currentSink) return false;
  try {
    return currentSink.routeUser(request);
  } catch {
    return false;
  }
}

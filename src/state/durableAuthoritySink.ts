/**
 * Stage 15 — a tiny, dependency-light registry that lets the legacy campaign
 * stores route an allowlisted safe-field edit through the OPTIONAL, default-off
 * universal DURABLE-authority router WITHOUT the state layer depending on the
 * domain / feature layer.
 *
 * This sink is consulted BEFORE the Stage 14 command-authority sink. When Stage
 * 15 owns the scope (flag on + allowlisted) it performs the durable universal
 * commit and the ONE legacy compatibility projection, and reports `handled` so
 * neither the Stage 14 router nor the store commits again. When no durable
 * router is registered (default, flag off) or the scope is not Stage-15-owned,
 * the route functions return `false` and the caller falls through to the Stage
 * 14 path (or its own unchanged legacy commit) — exactly the pre-Stage-15
 * behaviour. A registered router GUARANTEES exactly one durable write and at most
 * one legacy commit; it is always invoked defensively (never throws back into the
 * store): on an unexpected throw the store falls back to its own legacy commit.
 */

/** A safe single-field edit the store hands to the durable router. `durableScope`
 * is one of the Stage 15 scopes; `legacyEntityId` is the raw legacy entity id;
 * `value` the new scalar/text value. The adapter closures mirror the store's
 * exact pre / predicted-post / committed-post / fallback transitions. */
export interface MainDurableRequest {
  durableScope: string;
  legacyEntityId: string;
  value: string;
  preOverlay: unknown;
  previousValue?: string;
  /** Pure predicted post-overlay WITHOUT dispatching. */
  predict: () => unknown;
  /** The ONE real legacy dispatch; returns the committed post-overlay. */
  commit: () => unknown;
  /** The unchanged legacy dispatch once (pre-commit fallback). */
  fallback: () => void;
}

export interface UserDurableRequest {
  legacyCampaignId: string;
  durableScope: string;
  entityKind: string;
  legacyEntityId: string;
  value: string;
  preData: unknown;
  preRuntime: unknown;
  previousValue?: string;
  predict: () => { data: unknown; runtime: unknown };
  commit: () => { data: unknown; runtime: unknown };
  fallback: () => void;
}

export interface DurableAuthoritySink {
  routeMain(request: MainDurableRequest): boolean;
  routeUser(request: UserDurableRequest): boolean;
}

let currentSink: DurableAuthoritySink | null = null;

export function setDurableAuthoritySink(sink: DurableAuthoritySink | null): void {
  currentSink = sink;
}

/** Returns `true` when the durable router handled the commit (caller must NOT
 * commit again and must NOT fall through to Stage 14); `false` otherwise. */
export function routeMainDurable(request: MainDurableRequest): boolean {
  if (!currentSink) return false;
  try {
    return currentSink.routeMain(request);
  } catch {
    return false;
  }
}

export function routeUserDurable(request: UserDurableRequest): boolean {
  if (!currentSink) return false;
  try {
    return currentSink.routeUser(request);
  } catch {
    return false;
  }
}

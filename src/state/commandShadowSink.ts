/**
 * Stage 13 — a tiny, dependency-light sink registry that lets the legacy
 * campaign stores emit an already-committed command event to an OPTIONAL,
 * default-off universal command-shadow consumer WITHOUT the state layer taking
 * a dependency on the domain / feature layer.
 *
 * The legacy stores call `emitMainCommand` / `emitUserCommand` AFTER they have
 * already dispatched the real mutation, passing the immutable pre- and
 * post-command legacy states. When no sink is registered (the default), these
 * are no-ops — the store behaves exactly as before Stage 13. A registered sink
 * is always invoked defensively (never throws back into the store), so a shadow
 * consumer can never block, delay, or fail a legacy action.
 */

export interface MainCommandEmission {
  scope: string;
  /** Transient command input (raw values) — consumed in-memory, never persisted. */
  input: unknown;
  /** Immutable legacy overlay BEFORE the command. */
  preOverlay: unknown;
  /** Immutable legacy overlay AFTER the command (reducer-computed, exact). */
  postOverlay: unknown;
}

export interface UserCommandEmission {
  legacyCampaignId: string;
  scope: string;
  input: unknown;
  preData: unknown;
  postData: unknown;
  preRuntime: unknown;
  postRuntime: unknown;
}

export interface CommandShadowSink {
  emitMain(emission: MainCommandEmission): void;
  emitUser(emission: UserCommandEmission): void;
}

let currentSink: CommandShadowSink | null = null;

/** Register (or clear, with `null`) the single active command-shadow sink. */
export function setCommandShadowSink(sink: CommandShadowSink | null): void {
  currentSink = sink;
}

export function emitMainCommand(emission: MainCommandEmission): void {
  if (!currentSink) return;
  try {
    currentSink.emitMain(emission);
  } catch {
    // A shadow consumer must never affect the legacy action.
  }
}

export function emitUserCommand(emission: UserCommandEmission): void {
  if (!currentSink) return;
  try {
    currentSink.emitUser(emission);
  } catch {
    // A shadow consumer must never affect the legacy action.
  }
}

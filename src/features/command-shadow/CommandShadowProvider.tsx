import { lazy, Suspense, type ReactNode } from 'react';
import { UNIVERSAL_COMMAND_SHADOW_ENABLED } from '../../config';
import { CommandShadowContext, DISABLED_COMMAND_SHADOW, useCommandShadow } from './commandShadowContext';

export { useCommandShadow };

/** Loaded ONLY when the flag is on — keeps the CommandShadowCoordinator /
 * domain-adapter code out of the default (flag-off) production bundle graph. */
const LazyEnabledCommandShadowProvider = lazy(() =>
  import('./CommandShadowProviderEnabled').then((m) => ({ default: m.EnabledCommandShadowProvider })),
);

/**
 * Stage 13 — hosts the isolated universal command-shadow coordinator and wires
 * it to the legacy stores' command emissions.
 *
 * When the (default-off) flag is disabled, this renders its children and does
 * nothing else: no coordinator, no sink registration, no storage access, and
 * — per Block L — the heavy coordinator/domain-adapter module is not even
 * imported (dynamic `import()`, only triggered when the flag is on). When
 * enabled, it registers ONE sink so already-committed allowlisted legacy
 * mutations replay an isolated universal command whose result is compared to
 * the adapter-derived post-state and recorded as bounded, redacted, DM-only
 * diagnostics. It NEVER mutates legacy state, writes the production
 * namespace, or performs any network / server sync. It is purely a
 * diagnostics/parity-comparison side-channel: no active-authority write path
 * reads from or depends on its output (verified Block L — see
 * CONTINUATION_STATE.json).
 */
export function CommandShadowProvider({ children }: { children: ReactNode }) {
  if (!UNIVERSAL_COMMAND_SHADOW_ENABLED) {
    return <CommandShadowContext.Provider value={DISABLED_COMMAND_SHADOW}>{children}</CommandShadowContext.Provider>;
  }
  return (
    <Suspense fallback={children}>
      <LazyEnabledCommandShadowProvider>{children}</LazyEnabledCommandShadowProvider>
    </Suspense>
  );
}

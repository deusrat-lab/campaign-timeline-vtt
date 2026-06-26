import { BATTLE_LAUNCH_PARAM_KEYS } from './battleMapContract';
import { clearBattleReturnParams } from './battleReturn';

/**
 * Stage 5D, Step 2 — constructs the `returnUrl` that `battleMapLaunch.ts`'s
 * `BattleMapLaunchContext.returnUrl` field carries to the battle-map-vtt app,
 * so that app can redirect the DM's browser back to this Campaign Map tab
 * (with battle-return query params of its own appended on its side) once a
 * battle concludes.
 *
 * Deliberately NOT in `battleReturn.ts`: that module is pure by design (no
 * window access) so it stays trivially unit-testable and reusable outside a
 * browser. This module's whole job is reading `window.location`, so it can't
 * share that purity constraint — hence a separate file.
 *
 * The returned URL is generated fresh at launch time only. It is never
 * persisted onto a BattleEntry, never written to the overlay/localStorage,
 * and never included in any player-safe projection output — callers must
 * keep it that way (pass it straight into `buildBattleMapLaunchUrl`'s
 * context and nowhere else).
 */
export interface BattleReturnUrlContext {
  timelineId: string;
  sourceMapId?: string;
  battleEntryId: string;
  selectedPanel?: string;
}

/** Param key for "which panel to reopen" — not part of the battle-return
 * contract (battleReturn.ts never reads this back), purely a Campaign-Map-
 * side convenience for restoring context if the user reopens the app fresh.
 * Not added to battleMapContract.ts's BATTLE_LAUNCH_PARAM_KEYS/
 * BATTLE_RETURN_PARAM_KEYS since it is neither a launch param appended by
 * battleMapLaunch.ts nor a return param read by battleReturn.ts — it only
 * ever appears inside the returnUrl's own query string. */
const SELECTED_PANEL_PARAM_KEY = 'selectedPanel';

/**
 * Builds an absolute URL pointing back at the current Campaign Map route,
 * carrying enough context (timelineId, sourceMapId, battleEntryId) for this
 * app to restore its place if reopened fresh, with any stale battle-return
 * params already stripped so a returnUrl generated while reviewing a
 * previous return never carries that previous return's params forward.
 *
 * Never throws. Falls back to an empty string if `window` is unavailable
 * (defensive only — this app is client-only, so this is mostly a no-op
 * safeguard rather than a real SSR concern).
 */
export function buildBattleReturnUrl(context: BattleReturnUrlContext): string {
  if (typeof window === 'undefined' || !window.location) return '';

  try {
    const base = `${window.location.origin}${window.location.pathname}`;
    const currentSearch = window.location.search;

    // Strip any pre-existing battle-return params from the CURRENT url's
    // query string first, so reviewing a previous return and launching a new
    // battle from the same tab doesn't round-trip stale params.
    const cleanedHref = clearBattleReturnParams(`${base}${currentSearch}`);
    const url = new URL(cleanedHref, base);

    url.searchParams.set(BATTLE_LAUNCH_PARAM_KEYS.timelineId, context.timelineId);
    if (context.sourceMapId) {
      url.searchParams.set(BATTLE_LAUNCH_PARAM_KEYS.sourceMapId, context.sourceMapId);
    }
    url.searchParams.set(BATTLE_LAUNCH_PARAM_KEYS.battleEntryId, context.battleEntryId);
    if (context.selectedPanel) {
      url.searchParams.set(SELECTED_PANEL_PARAM_KEY, context.selectedPanel);
    }

    return url.toString();
  } catch {
    return '';
  }
}

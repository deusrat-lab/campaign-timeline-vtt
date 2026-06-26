/**
 * Battle Return Flow MVP (Stage 5B, Step 2) — a pure module (no React, no
 * window/history access) that parses/clears the "return from battle map"
 * query params that battleMapLaunch.ts's `returnUrl` context is meant to
 * round-trip back to. Mirrors battleMapLaunch.ts's style: pure functions,
 * the caller is responsible for any actual navigation/window/history calls.
 *
 * This module NEVER decides what happens with the parsed params — it only
 * extracts/strips them. MapWorkspacePage.tsx is responsible for turning a
 * parsed BattleReturnParams into a pre-filled (never auto-applied) Battle
 * Consequences draft, and for calling clearBattleReturnParams only after an
 * explicit DM "Применить последствия боя" click.
 */

import { BATTLE_RETURN_PARAM_KEYS, type BattleReturnResult } from './battleMapContract';

export type { BattleReturnResult };

const BATTLE_RETURN_RESULTS: BattleReturnResult[] = ['completed', 'retreated', 'failed', 'cancelled', 'unknown'];

export interface BattleReturnParams {
  battleEntryId: string;
  battleResult?: BattleReturnResult;
  battleSummary?: string;
  completed?: boolean;
  /** Raw string value as received in the query string — the caller is
   * responsible for mapping this onto the app's real LocationStatus union
   * (see BattleConsequencesPanel.tsx), since the battle-map-vtt app may use
   * a different vocabulary than this app's LocationStatus type. */
  locationStatus?: string;
  visibleInPlayerView?: boolean;
  timeAdvancePhase?: string;
}

/** Every query-string key this module owns — used by both the parser and
 * clearBattleReturnParams, so the two never drift apart. Sourced from the
 * centralized contract in battleMapContract.ts (Stage 5C, Step 9). */
const BATTLE_RETURN_KEYS = Object.values(BATTLE_RETURN_PARAM_KEYS);

/**
 * Parses a return-from-battle-map query string. Returns null when there is
 * no `battleEntryId` present — nothing to do in that case (a normal page
 * load/refresh with no return context).
 */
export function parseBattleReturnParams(search: string): BattleReturnParams | null {
  const params = new URLSearchParams(search);
  const battleEntryId = params.get('battleEntryId');
  if (!battleEntryId) return null;

  const rawResult = params.get('battleResult');
  const battleResult = BATTLE_RETURN_RESULTS.includes(rawResult as BattleReturnResult)
    ? (rawResult as BattleReturnResult)
    : undefined;

  const rawCompleted = params.get('completed');
  const completed = rawCompleted === null ? undefined : rawCompleted === 'true' || rawCompleted === '1';

  const rawVisible = params.get('visibleInPlayerView');
  const visibleInPlayerView = rawVisible === null ? undefined : rawVisible === 'true' || rawVisible === '1';

  return {
    battleEntryId,
    ...(battleResult ? { battleResult } : {}),
    ...(params.get('battleSummary') ? { battleSummary: params.get('battleSummary') ?? undefined } : {}),
    ...(completed !== undefined ? { completed } : {}),
    ...(params.get('locationStatus') ? { locationStatus: params.get('locationStatus') ?? undefined } : {}),
    ...(visibleInPlayerView !== undefined ? { visibleInPlayerView } : {}),
    ...(params.get('timeAdvancePhase') ? { timeAdvancePhase: params.get('timeAdvancePhase') ?? undefined } : {}),
  };
}

/**
 * Strips just the battle-return-related query keys from a URL string,
 * leaving any other query params/hash intact. Pure string transform — the
 * caller is responsible for actually applying the result (history.replaceState,
 * react-router's navigate(..., { replace: true }), etc).
 */
export function clearBattleReturnParams(currentUrl: string): string {
  let url: URL;
  try {
    url = new URL(currentUrl);
  } catch {
    // Relative URL (e.g. just a search string or pathname) — fall back to
    // a base that lets URL() parse it, then strip the origin back off below.
    try {
      url = new URL(currentUrl, 'http://localhost');
    } catch {
      return currentUrl;
    }
    for (const key of BATTLE_RETURN_KEYS) url.searchParams.delete(key);
    const search = url.searchParams.toString();
    return `${url.pathname}${search ? `?${search}` : ''}${url.hash}`;
  }
  for (const key of BATTLE_RETURN_KEYS) url.searchParams.delete(key);
  return url.toString();
}

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  createBrowserRepositoryStorage,
  routeUserTokenMove,
  routeSetTurn,
  greyholmBattleToUniversal,
  battleRevision,
  recordPendingProjection,
  readPendingProjection,
  clearPendingProjection,
  pendingProjectionCount,
  type RepositoryStorage,
  type BattleMoveOutcome,
  type TurnAdvanceOutcome,
  type PendingBattleProjection,
  type CampaignId,
} from '../../domain';
import type { CampaignBattleBoard } from '../../types/userCampaign';
import type { ActiveBattleState } from '../../types';
import { UNIVERSAL_BATTLE_AUTHORITY_ENABLED, UNIVERSAL_LOCAL_CUTOVER_ENABLED } from '../../config';

/**
 * Stage 17 — universal BATTLE AUTHORITY provider.
 *
 * Active only when BOTH the master local-cutover switch and the battle-authority
 * flag are on (both default off). When active, a user-campaign token move routes
 * through `routeUserTokenMove`: typed universal command → durable, expected-
 * revision-guarded commit to the Stage 17 battle namespace → read-after-write →
 * a legacy compatibility board the caller then applies. When inactive the
 * provider is inert and the caller runs its exact legacy path.
 *
 * Dev/test-only failure fixture: with `localStorage['stage17.test.failBattleCompatOnce']='1'`
 * the NEXT compatibility projection is asked to fail once (the caller throws
 * after the durable commit), exercising the real universal-committed / legacy-
 * pending recovery path. Never present in a production build.
 */
export interface BattleAuthorityContextValue {
  active: boolean;
  moveUserToken(
    campaignId: string,
    battleId: string,
    legacyBoard: CampaignBattleBoard,
    tokenId: string,
    position: { x: number; y: number },
  ): BattleMoveOutcome | null;
  /** Greyholm turn advance (single ActiveBattleState) through universal authority. */
  advanceGreyholmTurn(
    campaignId: string,
    activeBattle: ActiveBattleState,
    nextCombatantId: string,
    round: number,
  ): TurnAdvanceOutcome | null;
  revisionOf(campaignId: string, battleId: string): number;
  consumeFailCompatOnce(): boolean;
  recordPending(pending: PendingBattleProjection): void;
  readPending(campaignId: string, battleId: string): PendingBattleProjection | null;
  clearPending(campaignId: string, battleId: string): void;
  pendingCount(campaignId: string): number;
}

const DISABLED: BattleAuthorityContextValue = {
  active: false,
  moveUserToken: () => null,
  advanceGreyholmTurn: () => null,
  revisionOf: () => 0,
  consumeFailCompatOnce: () => false,
  recordPending: () => {},
  readPending: () => null,
  clearPending: () => {},
  pendingCount: () => 0,
};

const BattleAuthorityContext = createContext<BattleAuthorityContextValue>(DISABLED);

const FAIL_COMPAT_ONCE_KEY = 'stage17.test.failBattleCompatOnce';

export function BattleAuthorityProvider({ children }: { children: ReactNode }) {
  const active = UNIVERSAL_BATTLE_AUTHORITY_ENABLED && UNIVERSAL_LOCAL_CUTOVER_ENABLED;

  const value = useMemo<BattleAuthorityContextValue>(() => {
    if (!active || typeof window === 'undefined') return DISABLED;
    const storage: RepositoryStorage = createBrowserRepositoryStorage(window.localStorage);
    return {
      active: true,
      moveUserToken: (campaignId, battleId, legacyBoard, tokenId, position) =>
        routeUserTokenMove(storage, campaignId as never, battleId, legacyBoard, tokenId, position),
      advanceGreyholmTurn: (campaignId, activeBattle, nextCombatantId, round) => {
        const cid = campaignId as unknown as CampaignId;
        const seed = greyholmBattleToUniversal(cid, activeBattle);
        return routeSetTurn(storage, cid, activeBattle.id, seed, nextCombatantId, round);
      },
      revisionOf: (campaignId, battleId) => battleRevision(storage, campaignId as never, battleId),
      recordPending: (pending) => recordPendingProjection(storage, pending),
      readPending: (campaignId, battleId) => readPendingProjection(storage, campaignId as never, battleId),
      clearPending: (campaignId, battleId) => clearPendingProjection(storage, campaignId as never, battleId),
      pendingCount: (campaignId) => pendingProjectionCount(storage, campaignId as never),
      consumeFailCompatOnce: () => {
        if (!import.meta.env.DEV) return false;
        try {
          if (window.localStorage.getItem(FAIL_COMPAT_ONCE_KEY) === '1') {
            window.localStorage.removeItem(FAIL_COMPAT_ONCE_KEY);
            return true;
          }
        } catch {
          /* ignore */
        }
        return false;
      },
    };
  }, [active]);

  return <BattleAuthorityContext.Provider value={value}>{children}</BattleAuthorityContext.Provider>;
}

export function useBattleAuthority(): BattleAuthorityContextValue {
  return useContext(BattleAuthorityContext);
}

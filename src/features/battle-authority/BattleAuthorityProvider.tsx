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
  enqueueBattleSync,
  syncPending,
  flushBattleSync,
  remoteRevision,
  remoteAppliedCount,
  canonicalHash,
  commitUserBoard,
  readUserBoard,
  type RepositoryStorage,
  type BattleMoveOutcome,
  type TurnAdvanceOutcome,
  type PendingBattleProjection,
  type SyncFlushResult,
  type CampaignId,
  type BoardCommitOutcome,
} from '../../domain';
import type { CampaignBattleBoard } from '../../types/userCampaign';
import type { ActiveBattleState } from '../../types';
import { UNIVERSAL_BATTLE_AUTHORITY_ENABLED, UNIVERSAL_LOCAL_CUTOVER_ENABLED, UNIVERSAL_SYNC_ENABLED } from '../../config';

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
  /** Sync (local/mock transport only). */
  syncActive: boolean;
  syncPendingCount(campaignId: string): number;
  flushSync(campaignId: string, online?: boolean): SyncFlushResult;
  remoteRevisionOf(campaignId: string, battleId: string): number;
  remoteAppliedTotal(campaignId: string): number;
  /**
   * Decision 2 — whole-board sole-authority commit/read. UNCONDITIONALLY
   * available (not gated by UNIVERSAL_BATTLE_AUTHORITY/UNIVERSAL_LOCAL_CUTOVER
   * -- those flags gate the OLD shadow-then-legacy-reapply move path above,
   * which board-owning UI no longer needs once it routes every mutation
   * through `commitBoard`). Every Caldran board write goes through this; the
   * legacy `runtime.battleBoards[mapId]` is only ever the read-after-write
   * projection of what was actually committed here, never an independent
   * write -- see CampaignBattlePage.tsx's `patchBoard`.
   */
  commitBoard(campaignId: string, battleId: string, nextBoard: CampaignBattleBoard): BoardCommitOutcome;
  /** Durable board for reload/bootstrap, or null if this battle was never
   * committed yet (caller falls back to its legacy seed once, the one
   * allowed migration boundary for pre-cutover boards). */
  readBoard(campaignId: string, battleId: string): CampaignBattleBoard | null;
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
  syncActive: false,
  syncPendingCount: () => 0,
  flushSync: () => ({ attempted: 0, applied: 0, duplicates: 0, conflicts: 0, remaining: 0, statuses: [] }),
  remoteRevisionOf: () => 0,
  remoteAppliedTotal: () => 0,
  commitBoard: () => ({ ok: false, error: 'battle authority unavailable (no window)' }),
  readBoard: () => null,
};

const BattleAuthorityContext = createContext<BattleAuthorityContextValue>(DISABLED);

const FAIL_COMPAT_ONCE_KEY = 'stage17.test.failBattleCompatOnce';

export function BattleAuthorityProvider({ children }: { children: ReactNode }) {
  const active = UNIVERSAL_BATTLE_AUTHORITY_ENABLED && UNIVERSAL_LOCAL_CUTOVER_ENABLED;

  const syncActive = active && UNIVERSAL_SYNC_ENABLED;

  const value = useMemo<BattleAuthorityContextValue>(() => {
    if (typeof window === 'undefined') return DISABLED;
    const storage: RepositoryStorage = createBrowserRepositoryStorage(window.localStorage);

    // Decision 2 board commit/read: always wired, independent of the shadow
    // flags below (those only gate the legacy move-shadow path this replaces
    // for board-owning UI).
    const commitBoard = (campaignId: string, battleId: string, nextBoard: CampaignBattleBoard): BoardCommitOutcome =>
      commitUserBoard(storage, campaignId as never, battleId, nextBoard);
    const readBoard = (campaignId: string, battleId: string): CampaignBattleBoard | null =>
      readUserBoard(storage, campaignId as never, battleId);

    if (!active) return { ...DISABLED, commitBoard, readBoard };

    // Enqueue EXACTLY ONE sync op per successful durable commit. Deterministic
    // eventId (per campaign/battle/revision) makes a re-enqueue idempotent.
    const afterCommit = (campaignId: string, battleId: string, newRevision?: number) => {
      if (!syncActive || newRevision == null) return;
      enqueueBattleSync(storage, {
        campaignId,
        battleId,
        baseRevision: newRevision - 1,
        candidateRevision: newRevision,
        snapshotHash: canonicalHash({ campaignId, battleId, newRevision }),
        eventId: `${campaignId}:${battleId}:rev${newRevision}`,
        occurredAt: new Date(0).toISOString(),
      });
      // Flush online immediately so one UI mutation → one commit → one sync op →
      // one remote application. A dev fixture keeps the client "offline" so the
      // persisted queue can be demonstrated surviving a reload.
      const offline = import.meta.env.DEV && (() => {
        try { return window.localStorage.getItem('stage17.test.syncOffline') === '1'; } catch { return false; }
      })();
      flushBattleSync(storage, campaignId, !offline);
    };

    return {
      active: true,
      moveUserToken: (campaignId, battleId, legacyBoard, tokenId, position) => {
        const outcome = routeUserTokenMove(storage, campaignId as never, battleId, legacyBoard, tokenId, position);
        if (outcome.ok) afterCommit(campaignId, battleId, outcome.newRevision);
        return outcome;
      },
      advanceGreyholmTurn: (campaignId, activeBattle, nextCombatantId, round) => {
        const cid = campaignId as unknown as CampaignId;
        const seed = greyholmBattleToUniversal(cid, activeBattle);
        const outcome = routeSetTurn(storage, cid, activeBattle.id, seed, nextCombatantId, round);
        if (outcome.ok) afterCommit(campaignId, activeBattle.id, outcome.newRevision);
        return outcome;
      },
      syncActive,
      syncPendingCount: (campaignId) => syncPending(storage, campaignId),
      flushSync: (campaignId, online = true) => flushBattleSync(storage, campaignId, online),
      remoteRevisionOf: (campaignId, battleId) => remoteRevision(storage, campaignId, battleId),
      remoteAppliedTotal: (campaignId) => remoteAppliedCount(storage, campaignId),
      revisionOf: (campaignId, battleId) => battleRevision(storage, campaignId as never, battleId),
      commitBoard,
      readBoard,
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
  }, [active, syncActive]);

  return <BattleAuthorityContext.Provider value={value}>{children}</BattleAuthorityContext.Provider>;
}

export function useBattleAuthority(): BattleAuthorityContextValue {
  return useContext(BattleAuthorityContext);
}

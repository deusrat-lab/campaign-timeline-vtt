import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  IsolatedCampaignRuntime,
  CampaignCombatant,
  CampaignCanonOutcome,
} from '../types/campaign';
import { getCampaignById, isProtectedCampaign } from '../data/campaignModules';

/**
 * Isolated per-campaign runtime store.
 *
 * DATA SAFETY: each campaign persists to ITS OWN key
 * (`dmCompanion.campaignRuntime.${id}.v1`). The store hard-refuses to operate
 * on a protected campaign (the main Arc 1/2 campaign), so its legacy runtime
 * (`campaign-timeline-vtt:overlay:v2`) is never touched here. Two campaigns
 * sharing the same world map keep completely separate state.
 */
function keyFor(campaignId: string): string {
  return getCampaignById(campaignId)?.runtimeKey ?? `dmCompanion.campaignRuntime.${campaignId}.v1`;
}

function createInitial(campaignId: string): IsolatedCampaignRuntime {
  return {
    campaignId,
    status: 'notStarted',
    notes: [],
    questStatuses: {},
    npcStates: {},
    enemyStates: {},
    battleTracker: { combatants: [], round: 1 },
    revealedToPlayers: [],
    completedSceneIds: [],
  };
}

function loadRuntime(campaignId: string): IsolatedCampaignRuntime {
  try {
    const raw = localStorage.getItem(keyFor(campaignId));
    if (!raw) return createInitial(campaignId);
    const parsed = JSON.parse(raw) as IsolatedCampaignRuntime;
    return { ...createInitial(campaignId), ...parsed, campaignId };
  } catch {
    return createInitial(campaignId);
  }
}

function persist(runtime: IsolatedCampaignRuntime): void {
  if (isProtectedCampaign(runtime.campaignId)) return; // never write the main campaign
  try {
    localStorage.setItem(keyFor(runtime.campaignId), JSON.stringify(runtime));
  } catch {
    // localStorage unavailable — state stays in memory only.
  }
}

interface CampaignRuntimeValue {
  getRuntime: (campaignId: string) => IsolatedCampaignRuntime;
  startSession: (campaignId: string, firstSceneId?: string, activeMapId?: string) => void;
  setActiveScene: (campaignId: string, sceneId: string) => void;
  setActiveMap: (campaignId: string, mapId: string) => void;
  markSceneComplete: (campaignId: string, sceneId: string, complete: boolean) => void;
  addNote: (campaignId: string, note: string) => void;
  setEnemyHp: (campaignId: string, enemyId: string, currentHp: number) => void;
  addCombatant: (campaignId: string, combatant: CampaignCombatant) => void;
  updateCombatant: (campaignId: string, combatantId: string, patch: Partial<CampaignCombatant>) => void;
  removeCombatant: (campaignId: string, combatantId: string) => void;
  completeCampaign: (campaignId: string, outcome: CampaignCanonOutcome) => void;
  resetCampaign: (campaignId: string) => void;
}

const CampaignRuntimeContext = createContext<CampaignRuntimeValue | null>(null);

export function CampaignRuntimeProvider({ children }: { children: ReactNode }) {
  // Lazily-hydrated in-memory cache keyed by campaignId. Persisted per-key.
  const [cache, setCache] = useState<Record<string, IsolatedCampaignRuntime>>({});

  const read = useCallback((campaignId: string): IsolatedCampaignRuntime => {
    return cache[campaignId] ?? loadRuntime(campaignId);
  }, [cache]);

  const patch = useCallback((campaignId: string, updater: (prev: IsolatedCampaignRuntime) => IsolatedCampaignRuntime) => {
    if (isProtectedCampaign(campaignId)) return; // guard: never mutate the protected campaign
    setCache((prev) => {
      const current = prev[campaignId] ?? loadRuntime(campaignId);
      const next = updater(current);
      persist(next);
      return { ...prev, [campaignId]: next };
    });
  }, []);

  const value = useMemo<CampaignRuntimeValue>(() => ({
    getRuntime: read,

    startSession: (campaignId, firstSceneId, activeMapId) => patch(campaignId, (prev) => ({
      ...prev,
      status: 'active',
      activeSceneId: prev.activeSceneId ?? firstSceneId,
      activeMapId: prev.activeMapId ?? activeMapId,
    })),

    setActiveScene: (campaignId, sceneId) => patch(campaignId, (prev) => ({ ...prev, activeSceneId: sceneId })),
    setActiveMap: (campaignId, mapId) => patch(campaignId, (prev) => ({ ...prev, activeMapId: mapId })),

    markSceneComplete: (campaignId, sceneId, complete) => patch(campaignId, (prev) => ({
      ...prev,
      completedSceneIds: complete
        ? Array.from(new Set([...prev.completedSceneIds, sceneId]))
        : prev.completedSceneIds.filter((id) => id !== sceneId),
    })),

    addNote: (campaignId, note) => patch(campaignId, (prev) => ({
      ...prev,
      notes: [...prev.notes, `${new Date().toLocaleTimeString()} — ${note}`],
    })),

    setEnemyHp: (campaignId, enemyId, currentHp) => patch(campaignId, (prev) => ({
      ...prev,
      enemyStates: { ...prev.enemyStates, [enemyId]: { ...(prev.enemyStates[enemyId] as object), currentHp } },
    })),

    addCombatant: (campaignId, combatant) => patch(campaignId, (prev) => ({
      ...prev,
      battleTracker: { ...prev.battleTracker, combatants: [...prev.battleTracker.combatants, combatant] },
    })),

    updateCombatant: (campaignId, combatantId, patchData) => patch(campaignId, (prev) => ({
      ...prev,
      battleTracker: {
        ...prev.battleTracker,
        combatants: prev.battleTracker.combatants.map((c) => (c.id === combatantId ? { ...c, ...patchData } : c)),
      },
    })),

    removeCombatant: (campaignId, combatantId) => patch(campaignId, (prev) => ({
      ...prev,
      battleTracker: {
        ...prev.battleTracker,
        combatants: prev.battleTracker.combatants.filter((c) => c.id !== combatantId),
      },
    })),

    completeCampaign: (campaignId, outcome) => patch(campaignId, (prev) => ({
      ...prev,
      status: 'completed',
      completedAt: new Date().toISOString(),
      canonOutcome: outcome,
    })),

    resetCampaign: (campaignId) => patch(campaignId, () => createInitial(campaignId)),
  }), [read, patch]);

  return <CampaignRuntimeContext.Provider value={value}>{children}</CampaignRuntimeContext.Provider>;
}

export function useCampaignRuntime(): CampaignRuntimeValue {
  const ctx = useContext(CampaignRuntimeContext);
  if (!ctx) throw new Error('useCampaignRuntime must be used within CampaignRuntimeProvider');
  return ctx;
}

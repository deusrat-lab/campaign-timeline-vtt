import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type {
  UserCampaignData,
  UserCampaignRuntime,
  UserCampaignRegistryEntry,
  UserCampaignType,
  UserCampaignMode,
  CampaignLocation,
  CampaignNpc,
  CampaignQuest,
  CampaignEnemy,
  CampaignRoute,
  CampaignMapPlacement,
  CampaignEntityType,
} from '../types/userCampaign';
import { getRegionPreset } from '../data/regionPresets';

/**
 * Isolated user-campaign store.
 *
 * Storage keys (never overlap the main campaign's `campaign-timeline-vtt:*`):
 *   dmCompanion.userCampaigns.registry.v1
 *   dmCompanion.userCampaignData.${id}.v1
 *   dmCompanion.userCampaignRuntime.${id}.v1
 */
const REGISTRY_KEY = 'dmCompanion.userCampaigns.registry.v1';
const dataKey = (id: string) => `dmCompanion.userCampaignData.${id}.v1`;
const runtimeKey = (id: string) => `dmCompanion.userCampaignRuntime.${id}.v1`;

function uid(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function readJson<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode — in-memory only */
  }
}

function loadRegistry(): UserCampaignRegistryEntry[] {
  return readJson<UserCampaignRegistryEntry[]>(REGISTRY_KEY) ?? [];
}

function emptyData(campaignId: string, title: string, type: UserCampaignType, baseMapId: string, regionIds: string[]): UserCampaignData {
  // Seed the new campaign's library with COPIES of the region's canon presets
  // (general locations + houses/powers). Fresh ids → fully isolated data.
  const preset = getRegionPreset(baseMapId);
  const locations: CampaignLocation[] = (preset?.locations ?? []).map((l, i) => ({
    id: `loc-seed-${i}-${Math.random().toString(36).slice(2, 6)}`,
    title: l.title,
    description: l.description,
  }));
  const npcs: CampaignNpc[] = (preset?.npcs ?? []).map((n, i) => ({
    id: `npc-seed-${i}-${Math.random().toString(36).slice(2, 6)}`,
    name: n.name,
    role: n.role,
    description: n.description,
  }));
  return {
    campaignId, title, type, baseMapId,
    mapIds: [baseMapId], regionIds,
    locations, npcs, quests: [], enemies: [], images: [], routes: [], zones: [], notes: [], mapPlacements: [],
  };
}

function emptyRuntime(campaignId: string, baseMapId: string): UserCampaignRuntime {
  return {
    campaignId, activeMapId: baseMapId, mode: 'dmView',
    notes: [], revealedToPlayers: [], questStatuses: {}, battleTracker: null,
    mapViewState: { zoom: 1, panX: 0, panY: 0 },
  };
}

interface UserCampaignValue {
  registry: UserCampaignRegistryEntry[];
  createCampaign: (input: { title: string; type: UserCampaignType; baseMapId: string; regionIds: string[] }) => string;
  deleteCampaign: (id: string) => void;

  getData: (id: string) => UserCampaignData | null;
  getRuntime: (id: string) => UserCampaignRuntime;
  updateData: (id: string, updater: (prev: UserCampaignData) => UserCampaignData) => void;
  updateRuntime: (id: string, updater: (prev: UserCampaignRuntime) => UserCampaignRuntime) => void;

  setMode: (id: string, mode: UserCampaignMode) => void;
  setSelected: (id: string, entityId?: string, entityType?: CampaignEntityType) => void;

  addLocation: (id: string, loc: Omit<CampaignLocation, 'id'>) => string;
  addNpc: (id: string, npc: Omit<CampaignNpc, 'id'>) => string;
  addQuest: (id: string, quest: Omit<CampaignQuest, 'id'>) => string;
  addEnemy: (id: string, enemy: Omit<CampaignEnemy, 'id'>) => string;
  addImage: (id: string, image: { title: string; src: string; playerSafe?: boolean }) => string;
  addNote: (id: string, text: string) => void;
  removeNote: (id: string, noteId: string) => void;
  updateEntity: (id: string, entityType: CampaignEntityType, entityId: string, patch: Record<string, unknown>) => void;
  deleteEntity: (id: string, entityType: CampaignEntityType, entityId: string) => void;

  addPlacement: (id: string, placement: Omit<CampaignMapPlacement, 'id'>) => void;
  updatePlacement: (id: string, placementId: string, patch: Partial<CampaignMapPlacement>) => void;
  removePlacement: (id: string, placementId: string) => void;

  addRoute: (id: string, route: Omit<CampaignRoute, 'id'>) => string;
  updateRoute: (id: string, routeId: string, patch: Partial<CampaignRoute>) => void;
  removeRoute: (id: string, routeId: string) => void;

  exportCampaign: (id: string, includeRuntime: boolean) => string;
  importCampaign: (json: string) => string | null;
}

const UserCampaignContext = createContext<UserCampaignValue | null>(null);

export function UserCampaignProvider({ children }: { children: ReactNode }) {
  const [registry, setRegistry] = useState<UserCampaignRegistryEntry[]>(() => loadRegistry());
  // In-memory caches so components re-render on change; each write also persists.
  const [dataCache, setDataCache] = useState<Record<string, UserCampaignData>>({});
  const [runtimeCache, setRuntimeCache] = useState<Record<string, UserCampaignRuntime>>({});

  const persistRegistry = useCallback((next: UserCampaignRegistryEntry[]) => {
    setRegistry(next);
    writeJson(REGISTRY_KEY, next);
  }, []);

  const readData = useCallback((id: string): UserCampaignData | null => {
    return dataCache[id] ?? readJson<UserCampaignData>(dataKey(id));
  }, [dataCache]);

  const readRuntime = useCallback((id: string): UserCampaignRuntime => {
    const entry = registry.find((r) => r.campaignId === id);
    const fallbackMap = entry?.baseMapId ?? '';
    return runtimeCache[id] ?? readJson<UserCampaignRuntime>(runtimeKey(id)) ?? emptyRuntime(id, fallbackMap);
  }, [runtimeCache, registry]);

  const touchRegistry = useCallback((id: string) => {
    setRegistry((prev) => {
      const next = prev.map((r) => (r.campaignId === id ? { ...r, updatedAt: new Date().toISOString() } : r));
      writeJson(REGISTRY_KEY, next);
      return next;
    });
  }, []);

  const patchData = useCallback((id: string, updater: (prev: UserCampaignData) => UserCampaignData) => {
    setDataCache((prev) => {
      const current = prev[id] ?? readJson<UserCampaignData>(dataKey(id));
      if (!current) return prev;
      const next = updater(current);
      writeJson(dataKey(id), next);
      return { ...prev, [id]: next };
    });
    touchRegistry(id);
  }, [touchRegistry]);

  const patchRuntime = useCallback((id: string, updater: (prev: UserCampaignRuntime) => UserCampaignRuntime) => {
    setRuntimeCache((prev) => {
      const entry = registry.find((r) => r.campaignId === id);
      const current = prev[id] ?? readJson<UserCampaignRuntime>(runtimeKey(id)) ?? emptyRuntime(id, entry?.baseMapId ?? '');
      const next = updater(current);
      writeJson(runtimeKey(id), next);
      return { ...prev, [id]: next };
    });
  }, [registry]);

  const value = useMemo<UserCampaignValue>(() => ({
    registry,

    createCampaign: ({ title, type, baseMapId, regionIds }) => {
      const id = uid('camp');
      const now = new Date().toISOString();
      const entry: UserCampaignRegistryEntry = { campaignId: id, title, type, baseMapId, regionIds, createdAt: now, updatedAt: now };
      persistRegistry([...registry, entry]);
      const data = emptyData(id, title, type, baseMapId, regionIds);
      writeJson(dataKey(id), data);
      setDataCache((prev) => ({ ...prev, [id]: data }));
      const rt = emptyRuntime(id, baseMapId);
      writeJson(runtimeKey(id), rt);
      setRuntimeCache((prev) => ({ ...prev, [id]: rt }));
      return id;
    },

    deleteCampaign: (id) => {
      persistRegistry(registry.filter((r) => r.campaignId !== id));
      try { localStorage.removeItem(dataKey(id)); localStorage.removeItem(runtimeKey(id)); } catch { /* noop */ }
      setDataCache((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setRuntimeCache((prev) => { const n = { ...prev }; delete n[id]; return n; });
    },

    getData: readData,
    getRuntime: readRuntime,
    updateData: patchData,
    updateRuntime: patchRuntime,

    setMode: (id, mode) => patchRuntime(id, (prev) => ({ ...prev, mode })),
    setSelected: (id, entityId, entityType) => patchRuntime(id, (prev) => ({ ...prev, selectedEntityId: entityId, selectedEntityType: entityType })),

    addLocation: (id, loc) => { const eid = uid('loc'); patchData(id, (p) => ({ ...p, locations: [...p.locations, { ...loc, id: eid }] })); return eid; },
    addNpc: (id, npc) => { const eid = uid('npc'); patchData(id, (p) => ({ ...p, npcs: [...p.npcs, { ...npc, id: eid }] })); return eid; },
    addQuest: (id, quest) => { const eid = uid('qst'); patchData(id, (p) => ({ ...p, quests: [...p.quests, { ...quest, id: eid }] })); return eid; },
    addEnemy: (id, enemy) => { const eid = uid('emy'); patchData(id, (p) => ({ ...p, enemies: [...p.enemies, { ...enemy, id: eid }] })); return eid; },
    addImage: (id, image) => { const eid = uid('img'); patchData(id, (p) => ({ ...p, images: [...p.images, { ...image, id: eid }] })); return eid; },
    addNote: (id, text) => patchData(id, (p) => ({ ...p, notes: [...p.notes, { id: uid('note'), text, createdAt: new Date().toISOString() }] })),
    removeNote: (id, noteId) => patchData(id, (p) => ({ ...p, notes: p.notes.filter((n) => n.id !== noteId) })),

    updateEntity: (id, entityType, entityId, patch) => patchData(id, (p) => {
      const key = ({ location: 'locations', npc: 'npcs', quest: 'quests', enemy: 'enemies', image: 'images' } as const)[entityType as 'location'];
      if (!key) return p;
      const list = (p[key] as Array<{ id: string }>).map((e) => (e.id === entityId ? { ...e, ...patch } : e));
      return { ...p, [key]: list } as UserCampaignData;
    }),

    deleteEntity: (id, entityType, entityId) => patchData(id, (p) => {
      const key = ({ location: 'locations', npc: 'npcs', quest: 'quests', enemy: 'enemies', image: 'images' } as const)[entityType as 'location'];
      if (!key) return p;
      const list = (p[key] as Array<{ id: string }>).filter((e) => e.id !== entityId);
      return { ...p, [key]: list, mapPlacements: p.mapPlacements.filter((mp) => !(mp.entityType === entityType && mp.entityId === entityId)) } as UserCampaignData;
    }),

    addPlacement: (id, placement) => patchData(id, (p) => ({ ...p, mapPlacements: [...p.mapPlacements, { ...placement, id: uid('pin') }] })),
    updatePlacement: (id, placementId, patch) => patchData(id, (p) => ({ ...p, mapPlacements: p.mapPlacements.map((mp) => (mp.id === placementId ? { ...mp, ...patch } : mp)) })),
    removePlacement: (id, placementId) => patchData(id, (p) => ({ ...p, mapPlacements: p.mapPlacements.filter((mp) => mp.id !== placementId) })),

    addRoute: (id, route) => { const rid = uid('rte'); patchData(id, (p) => ({ ...p, routes: [...p.routes, { ...route, id: rid }] })); return rid; },
    updateRoute: (id, routeId, patch) => patchData(id, (p) => ({ ...p, routes: p.routes.map((r) => (r.id === routeId ? { ...r, ...patch } : r)) })),
    removeRoute: (id, routeId) => patchData(id, (p) => ({ ...p, routes: p.routes.filter((r) => r.id !== routeId) })),

    exportCampaign: (id, includeRuntime) => {
      const entry = registry.find((r) => r.campaignId === id);
      const data = readData(id);
      const payload: Record<string, unknown> = { kind: 'dmCompanion.userCampaign.v1', registryEntry: entry, data };
      if (includeRuntime) payload.runtime = readRuntime(id);
      return JSON.stringify(payload, null, 2);
    },

    importCampaign: (json) => {
      try {
        const parsed = JSON.parse(json) as { kind?: string; data?: UserCampaignData; runtime?: UserCampaignRuntime };
        if (parsed.kind !== 'dmCompanion.userCampaign.v1' || !parsed.data) return null;
        const newId = uid('camp');
        const now = new Date().toISOString();
        const data: UserCampaignData = { ...parsed.data, campaignId: newId };
        const entry: UserCampaignRegistryEntry = {
          campaignId: newId, title: `${data.title} (import)`, type: data.type,
          baseMapId: data.baseMapId, regionIds: data.regionIds, createdAt: now, updatedAt: now,
        };
        persistRegistry([...registry, entry]);
        writeJson(dataKey(newId), data);
        setDataCache((prev) => ({ ...prev, [newId]: data }));
        const rt = parsed.runtime ? { ...parsed.runtime, campaignId: newId } : emptyRuntime(newId, data.baseMapId);
        writeJson(runtimeKey(newId), rt);
        setRuntimeCache((prev) => ({ ...prev, [newId]: rt }));
        return newId;
      } catch {
        return null;
      }
    },
  }), [registry, persistRegistry, readData, readRuntime, patchData, patchRuntime]);

  return <UserCampaignContext.Provider value={value}>{children}</UserCampaignContext.Provider>;
}

export function useUserCampaigns(): UserCampaignValue {
  const ctx = useContext(UserCampaignContext);
  if (!ctx) throw new Error('useUserCampaigns must be used within UserCampaignProvider');
  return ctx;
}

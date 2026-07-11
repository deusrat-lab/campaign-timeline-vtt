import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  CampaignPlayer,
  CampaignFaction,
  CampaignImage,
} from '../types/userCampaign';
import { getRegionPreset } from '../data/regionPresets';
import { syncEnabled, pushCampaign, deleteCampaignRemote, fetchRegistry, fetchCampaign, subscribeUc } from './userCampaignSync';

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

export interface CampaignSeed {
  locations?: Array<{ title: string; type?: string; description?: string; dmNotes?: string; image?: string }>;
  npcs?: Array<{ name: string; role?: string; description?: string; dmNotes?: string; image?: string }>;
  enemies?: Array<{ title: string; ac?: number; hp?: number; description?: string; dmNotes?: string }>;
}

function emptyData(campaignId: string, title: string, type: UserCampaignType, baseMapId: string, regionIds: string[], seed?: CampaignSeed): UserCampaignData {
  // Seed the new campaign's library with COPIES (fresh ids → isolated data).
  // A scenario seed wins; otherwise fall back to the region's canon presets.
  const preset = getRegionPreset(baseMapId);
  const rid = (p: string, i: number) => `${p}-seed-${i}-${Math.random().toString(36).slice(2, 6)}`;
  const locSrc = seed?.locations ?? preset?.locations ?? [];
  const npcSrc = seed?.npcs ?? preset?.npcs ?? [];
  const enemySrc = seed?.enemies ?? [];
  const factionSrc = preset?.factions ?? [];
  // Seeded art (scenario portraits / location images) becomes CampaignImage
  // records referenced by imageId, so the cards show pictures.
  const images: CampaignImage[] = [];
  const mkImage = (imgTitle: string, src?: string): string | undefined => {
    if (!src) return undefined;
    const id = rid('img', images.length);
    images.push({ id, title: imgTitle, src });
    return id;
  };
  const locations: CampaignLocation[] = locSrc.map((l, i) => ({ id: rid('loc', i), title: l.title, description: l.description, dmNotes: (l as { dmNotes?: string }).dmNotes, imageId: mkImage(l.title, (l as { image?: string }).image) }));
  const npcs: CampaignNpc[] = npcSrc.map((n, i) => ({ id: rid('npc', i), name: n.name, role: n.role, description: n.description, dmNotes: (n as { dmNotes?: string }).dmNotes, imageId: mkImage(n.name, (n as { image?: string }).image) }));
  const enemies: CampaignEnemy[] = enemySrc.map((e, i) => ({ id: rid('emy', i), title: e.title, ac: e.ac, hp: e.hp, description: e.description, tactics: e.dmNotes }));
  const factions: CampaignFaction[] = factionSrc.map((f, i) => ({ id: rid('fac', i), name: f.name, role: f.role, description: f.description, attitude: 'neutral' as const }));
  return {
    campaignId, title, type, baseMapId,
    mapIds: [baseMapId], regionIds,
    locations, npcs, quests: [], enemies, factions, images, routes: [], zones: [], notes: [], mapPlacements: [],
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
  createCampaign: (input: { title: string; type: UserCampaignType; baseMapId: string; regionIds: string[]; seed?: CampaignSeed }) => string;
  renameCampaign: (id: string, title: string) => void;
  deleteCampaign: (id: string) => void;

  getData: (id: string) => UserCampaignData | null;
  getRuntime: (id: string) => UserCampaignRuntime;
  updateData: (id: string, updater: (prev: UserCampaignData) => UserCampaignData) => void;
  updateRuntime: (id: string, updater: (prev: UserCampaignRuntime) => UserCampaignRuntime) => void;

  setMode: (id: string, mode: UserCampaignMode) => void;
  setSelected: (id: string, entityId?: string, entityType?: CampaignEntityType) => void;
  /** Toggle whether a library entity (location/NPC/quest/enemy, by id) is
   * revealed to players. Player View only lists revealed entities. */
  toggleReveal: (id: string, entityId: string) => void;
  isRevealed: (id: string, entityId: string) => boolean;

  addLocation: (id: string, loc: Omit<CampaignLocation, 'id'>) => string;
  addNpc: (id: string, npc: Omit<CampaignNpc, 'id'>) => string;
  addQuest: (id: string, quest: Omit<CampaignQuest, 'id'>) => string;
  addEnemy: (id: string, enemy: Omit<CampaignEnemy, 'id'>) => string;
  addPlayer: (id: string, player: Omit<CampaignPlayer, 'id'>) => string;
  addFaction: (id: string, faction: Omit<CampaignFaction, 'id'>) => string;
  addImage: (id: string, image: { title: string; src: string; playerSafe?: boolean }) => string;
  addNote: (id: string, text: string) => void;
  removeNote: (id: string, noteId: string) => void;
  addCustomBattleMap: (id: string, map: { title: string; dayImage: string; nightImage?: string; columns: number; rows?: number }) => string;
  removeCustomBattleMap: (id: string, mapId: string) => void;
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
  // Campaign ids we've already kicked a one-time server fetch for (players /
  // fresh browsers with no local copy). Prevents re-fetching on every render.
  const fetchedRef = useRef<Set<string>>(new Set());

  const persistRegistry = useCallback((next: UserCampaignRegistryEntry[]) => {
    setRegistry(next);
    writeJson(REGISTRY_KEY, next);
  }, []);

  /** Push the latest `{ data, runtime }` for a campaign to the server (DM only;
   * no-op without a server or token). Reads from localStorage, which every
   * write updates synchronously before this debounced push fires. */
  const pushBlob = useCallback((id: string) => {
    if (!syncEnabled()) return;
    pushCampaign(id, () => {
      const data = readJson<UserCampaignData>(dataKey(id));
      if (!data) return null;
      return { data, runtime: readJson<UserCampaignRuntime>(runtimeKey(id)) ?? undefined };
    });
  }, []);

  // Server hydration + live sync (no-op when no server is configured). Pulls
  // the campaign registry from the server on mount so players / fresh browsers
  // see the DM's campaigns, and applies live pushes over /ws-uc. Never mutates
  // the main campaign (separate endpoints + socket).
  const upsertRegistryFrom = useCallback((entries: Array<{ campaignId: string; title: string; type: UserCampaignType; baseMapId: string; regionIds?: string[]; updatedAt?: string }>) => {
    setRegistry((prev) => {
      const map = new Map(prev.map((r) => [r.campaignId, r]));
      for (const e of entries) {
        const ex = map.get(e.campaignId);
        map.set(e.campaignId, {
          campaignId: e.campaignId, title: e.title, type: e.type, baseMapId: e.baseMapId,
          regionIds: e.regionIds ?? ex?.regionIds ?? [],
          createdAt: ex?.createdAt ?? e.updatedAt ?? new Date().toISOString(),
          updatedAt: e.updatedAt ?? new Date().toISOString(),
        });
      }
      const next = [...map.values()];
      writeJson(REGISTRY_KEY, next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!syncEnabled()) return;
    let cancelled = false;
    fetchRegistry().then((serverReg) => {
      if (cancelled || serverReg.length === 0) return;
      upsertRegistryFrom(serverReg);
    });
    const unsub = subscribeUc((m) => {
      if (m.deleted) {
        setRegistry((prev) => { const n = prev.filter((r) => r.campaignId !== m.campaignId); writeJson(REGISTRY_KEY, n); return n; });
        setDataCache((p) => { const n = { ...p }; delete n[m.campaignId]; return n; });
        setRuntimeCache((p) => { const n = { ...p }; delete n[m.campaignId]; return n; });
        try { localStorage.removeItem(dataKey(m.campaignId)); localStorage.removeItem(runtimeKey(m.campaignId)); } catch { /* noop */ }
        return;
      }
      if (m.payload?.data) {
        const { data, runtime } = m.payload;
        writeJson(dataKey(m.campaignId), data);
        setDataCache((p) => ({ ...p, [m.campaignId]: data }));
        if (runtime) { writeJson(runtimeKey(m.campaignId), runtime); setRuntimeCache((p) => ({ ...p, [m.campaignId]: runtime })); }
        upsertRegistryFrom([{ campaignId: m.campaignId, title: data.title, type: data.type, baseMapId: data.baseMapId, regionIds: data.regionIds }]);
      }
    });
    return () => { cancelled = true; unsub(); };
  }, [upsertRegistryFrom]);

  const readData = useCallback((id: string): UserCampaignData | null => {
    const local = dataCache[id] ?? readJson<UserCampaignData>(dataKey(id));
    // Player / fresh browser with no local copy: pull it from the server once,
    // then let the resulting setState re-render. (Async — never mutates state
    // synchronously during render.)
    if (!local && syncEnabled() && !fetchedRef.current.has(id)) {
      fetchedRef.current.add(id);
      fetchCampaign(id).then((blob) => {
        if (!blob?.data) return;
        writeJson(dataKey(id), blob.data);
        setDataCache((p) => ({ ...p, [id]: blob.data }));
        if (blob.runtime) {
          writeJson(runtimeKey(id), blob.runtime);
          setRuntimeCache((p) => ({ ...p, [id]: blob.runtime! }));
        }
        setRegistry((prev) => {
          if (prev.some((r) => r.campaignId === id)) return prev;
          const now = new Date().toISOString();
          const next = [...prev, { campaignId: id, title: blob.data.title, type: blob.data.type, baseMapId: blob.data.baseMapId, regionIds: blob.data.regionIds, createdAt: now, updatedAt: now }];
          writeJson(REGISTRY_KEY, next);
          return next;
        });
      });
    }
    return local;
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
    pushBlob(id);
  }, [touchRegistry, pushBlob]);

  const patchRuntime = useCallback((id: string, updater: (prev: UserCampaignRuntime) => UserCampaignRuntime) => {
    setRuntimeCache((prev) => {
      const entry = registry.find((r) => r.campaignId === id);
      const current = prev[id] ?? readJson<UserCampaignRuntime>(runtimeKey(id)) ?? emptyRuntime(id, entry?.baseMapId ?? '');
      const next = updater(current);
      writeJson(runtimeKey(id), next);
      return { ...prev, [id]: next };
    });
    pushBlob(id);
  }, [registry, pushBlob]);

  const value = useMemo<UserCampaignValue>(() => ({
    registry,

    createCampaign: ({ title, type, baseMapId, regionIds, seed }) => {
      const id = uid('camp');
      const now = new Date().toISOString();
      const entry: UserCampaignRegistryEntry = { campaignId: id, title, type, baseMapId, regionIds, createdAt: now, updatedAt: now };
      persistRegistry([...registry, entry]);
      const data = emptyData(id, title, type, baseMapId, regionIds, seed);
      writeJson(dataKey(id), data);
      setDataCache((prev) => ({ ...prev, [id]: data }));
      const rt = emptyRuntime(id, baseMapId);
      writeJson(runtimeKey(id), rt);
      setRuntimeCache((prev) => ({ ...prev, [id]: rt }));
      pushBlob(id);
      return id;
    },

    renameCampaign: (id, title) => {
      setRegistry((prev) => {
        const next = prev.map((r) => (r.campaignId === id ? { ...r, title, updatedAt: new Date().toISOString() } : r));
        writeJson(REGISTRY_KEY, next);
        return next;
      });
      patchData(id, (p) => ({ ...p, title }));
    },

    deleteCampaign: (id) => {
      persistRegistry(registry.filter((r) => r.campaignId !== id));
      try { localStorage.removeItem(dataKey(id)); localStorage.removeItem(runtimeKey(id)); } catch { /* noop */ }
      setDataCache((prev) => { const n = { ...prev }; delete n[id]; return n; });
      setRuntimeCache((prev) => { const n = { ...prev }; delete n[id]; return n; });
      deleteCampaignRemote(id);
    },

    getData: readData,
    getRuntime: readRuntime,
    updateData: patchData,
    updateRuntime: patchRuntime,

    setMode: (id, mode) => patchRuntime(id, (prev) => ({ ...prev, mode })),
    setSelected: (id, entityId, entityType) => patchRuntime(id, (prev) => ({ ...prev, selectedEntityId: entityId, selectedEntityType: entityType })),
    toggleReveal: (id, entityId) => patchRuntime(id, (prev) => {
      const set = new Set(prev.revealedToPlayers ?? []);
      if (set.has(entityId)) set.delete(entityId); else set.add(entityId);
      return { ...prev, revealedToPlayers: [...set] };
    }),
    isRevealed: (id, entityId) => (readRuntime(id).revealedToPlayers ?? []).includes(entityId),

    addLocation: (id, loc) => { const eid = uid('loc'); patchData(id, (p) => ({ ...p, locations: [...p.locations, { ...loc, id: eid }] })); return eid; },
    addNpc: (id, npc) => { const eid = uid('npc'); patchData(id, (p) => ({ ...p, npcs: [...p.npcs, { ...npc, id: eid }] })); return eid; },
    addQuest: (id, quest) => { const eid = uid('qst'); patchData(id, (p) => ({ ...p, quests: [...p.quests, { ...quest, id: eid }] })); return eid; },
    addEnemy: (id, enemy) => { const eid = uid('emy'); patchData(id, (p) => ({ ...p, enemies: [...p.enemies, { ...enemy, id: eid }] })); return eid; },
    addPlayer: (id, player) => { const eid = uid('pc'); patchData(id, (p) => ({ ...p, party: [...(p.party ?? []), { ...player, id: eid }] })); return eid; },
    addFaction: (id, faction) => { const eid = uid('fac'); patchData(id, (p) => ({ ...p, factions: [...(p.factions ?? []), { ...faction, id: eid }] })); return eid; },
    addImage: (id, image) => { const eid = uid('img'); patchData(id, (p) => ({ ...p, images: [...p.images, { ...image, id: eid }] })); return eid; },
    addNote: (id, text) => patchData(id, (p) => ({ ...p, notes: [...p.notes, { id: uid('note'), text, createdAt: new Date().toISOString() }] })),
    removeNote: (id, noteId) => patchData(id, (p) => ({ ...p, notes: p.notes.filter((n) => n.id !== noteId) })),
    addCustomBattleMap: (id, map) => { const eid = uid('bmap'); patchData(id, (p) => ({ ...p, customBattleMaps: [...(p.customBattleMaps ?? []), { ...map, id: eid }] })); return eid; },
    removeCustomBattleMap: (id, mapId) => patchData(id, (p) => ({ ...p, customBattleMaps: (p.customBattleMaps ?? []).filter((m) => m.id !== mapId) })),

    updateEntity: (id, entityType, entityId, patch) => patchData(id, (p) => {
      const key = ({ location: 'locations', npc: 'npcs', quest: 'quests', enemy: 'enemies', image: 'images', party: 'party', faction: 'factions' } as const)[entityType as 'location'];
      if (!key) return p;
      const list = ((p[key] as Array<{ id: string }> | undefined) ?? []).map((e) => (e.id === entityId ? { ...e, ...patch } : e));
      return { ...p, [key]: list } as UserCampaignData;
    }),

    deleteEntity: (id, entityType, entityId) => patchData(id, (p) => {
      const key = ({ location: 'locations', npc: 'npcs', quest: 'quests', enemy: 'enemies', image: 'images', party: 'party', faction: 'factions' } as const)[entityType as 'location'];
      if (!key) return p;
      const list = ((p[key] as Array<{ id: string }> | undefined) ?? []).filter((e) => e.id !== entityId);
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
        pushBlob(newId);
        return newId;
      } catch {
        return null;
      }
    },
  }), [registry, persistRegistry, readData, readRuntime, patchData, patchRuntime, pushBlob]);

  return <UserCampaignContext.Provider value={value}>{children}</UserCampaignContext.Provider>;
}

export function useUserCampaigns(): UserCampaignValue {
  const ctx = useContext(UserCampaignContext);
  if (!ctx) throw new Error('useUserCampaigns must be used within UserCampaignProvider');
  return ctx;
}

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
import type { UniversalCapabilityKey } from '../domain/campaign/capabilities';
import type { Timeline } from '../types';
import { mergeScenarioIntoData, scenarioForCampaign } from '../data/scenarioMerge';
import { exportUserCampaignDM, exportUserCampaignPlayerSafe, reconstructUserCampaign, previewUserCampaignImport, userCampaignExportHash, mintPlacementId } from '../domain';

const UC_BACKUP_NS = 'campaign-timeline-vtt:uc-backup:v1';
const UC_ROLLBACK_NS = 'campaign-timeline-vtt:uc-rollback:v1';
import { emitUserCommand } from './commandShadowSink';
import { routeUserAuthority } from './commandAuthoritySink';
import { routeUserDurable } from './durableAuthoritySink';
import { routeUserComplex } from './complexAuthoritySink';
import { syncEnabled, pushCampaign, deleteCampaignRemote, fetchRegistry, fetchCampaign, subscribeUc, patchPlayerRemote } from './userCampaignSync';

/**
 * Isolated user-campaign store.
 *
 * Storage keys (never overlap the main campaign's `campaign-timeline-vtt:*`):
 *   dmCompanion.userCampaigns.registry.v1
 *   dmCompanion.userCampaignData.${id}.v1
 *   dmCompanion.userCampaignRuntime.${id}.v1
 */
/**
 * Stage 15 — map a user-campaign entity kind + single patched field to its
 * proven-safe durable-authority scope, or null when the edit is not an
 * allowlisted single scalar/text field. Kept as a closed table so an unknown
 * field can never take durable authority.
 */
function resolveUserDurableScope(entityType: string, field: string | null): string | null {
  if (!field) return null;
  const table: Record<string, Record<string, string>> = {
    npc: {
      role: 'userCampaign.npc.role.update',
      name: 'userCampaign.npc.name.update',
      description: 'userCampaign.npc.description.update',
    },
    quest: {
      title: 'userCampaign.quest.title.update',
      description: 'userCampaign.quest.description.update',
    },
    faction: {
      name: 'userCampaign.faction.name.update',
      description: 'userCampaign.faction.description.update',
    },
    location: {
      description: 'userCampaign.location.description.update',
    },
  };
  return table[entityType]?.[field] ?? null;
}

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
  locations?: Array<{ key?: string; title: string; type?: string; description?: string; dmNotes?: string; image?: string }>;
  npcs?: Array<{ name: string; role?: string; description?: string; dmNotes?: string; image?: string; locationKey?: string }>;
  enemies?: Array<{ title: string; ac?: number; hp?: number; description?: string; dmNotes?: string; image?: string; locationKeys?: string[] }>;
  factions?: Array<{ name: string; role?: string; description?: string; image?: string }>;
  quests?: Array<{ title: string; description?: string; dmNotes?: string; locationKey?: string; status?: string; image?: string }>;
  players?: Array<Omit<CampaignPlayer, 'id'>>;
  images?: Array<{ title: string; src: string; playerSafe?: boolean }>;
}

const DEFAULT_ARC_ID = 'arc-1';

function defaultArc(): Timeline {
  return { id: DEFAULT_ARC_ID, arcId: DEFAULT_ARC_ID, title: 'Арка 1', order: 1, isDefault: true, isCurrent: true, visibleToPlayers: true };
}

/** Universal arcs, shared type/domain with Greyholm (Timeline, src/types.ts).
 * A campaign with no `arcs` array at all (every campaign created before this
 * feature existed, and any fixture/import that predates it) is treated as
 * having exactly one implicit default arc — never a migration step, same
 * "always defaulted" pattern the Greyholm overlay uses throughout. */
export function resolveArcs(data: UserCampaignData | null | undefined): Timeline[] {
  if (!data?.arcs || data.arcs.length === 0) return [defaultArc()];
  return data.arcs;
}

export function resolveCurrentArcId(data: UserCampaignData | null | undefined, runtime: UserCampaignRuntime | null | undefined): string {
  const arcs = resolveArcs(data);
  const wanted = runtime?.currentArcId;
  if (wanted && arcs.some((a) => a.id === wanted && !a.archived)) return wanted;
  return (arcs.find((a) => a.isDefault && !a.archived) ?? arcs.find((a) => !a.archived) ?? arcs[0]).id;
}

function emptyData(campaignId: string, title: string, type: UserCampaignType, baseMapId: string, regionIds: string[], seed?: CampaignSeed): UserCampaignData {
  // Seed the new campaign's library with COPIES (fresh ids → isolated data).
  // A scenario seed wins; otherwise fall back to the region's canon presets.
  const preset = getRegionPreset(baseMapId);
  const rid = (p: string, i: number) => `${p}-seed-${i}-${Math.random().toString(36).slice(2, 6)}`;
  const locSrc = seed?.locations ?? preset?.locations ?? [];
  const npcSrc = seed?.npcs ?? preset?.npcs ?? [];
  const enemySrc = seed?.enemies ?? [];
  const factionSrc = seed?.factions ?? preset?.factions ?? [];
  const playerSrc = seed?.players ?? [];
  // Seeded art (scenario portraits / location images) becomes CampaignImage
  // records referenced by imageId, so the cards show pictures.
  const images: CampaignImage[] = [];
  const mkImage = (imgTitle: string, src?: string): string | undefined => {
    if (!src) return undefined;
    const id = rid('img', images.length);
    images.push({ id, title: imgTitle, src });
    return id;
  };
  // Resolve scenario relation keys (location `key`) → generated location ids so
  // NPCs and enemies cross-link to the right location cards.
  const locKeyToId: Record<string, string> = {};
  const locations: CampaignLocation[] = locSrc.map((l, i) => {
    const id = rid('loc', i);
    const key = (l as { key?: string }).key;
    if (key) locKeyToId[key] = id;
    return { id, title: l.title, description: l.description, dmNotes: (l as { dmNotes?: string }).dmNotes, imageId: mkImage(l.title, (l as { image?: string }).image) };
  });
  const npcs: CampaignNpc[] = npcSrc.map((n, i) => ({ id: rid('npc', i), name: n.name, role: n.role, description: n.description, dmNotes: (n as { dmNotes?: string }).dmNotes, imageId: mkImage(n.name, (n as { image?: string }).image), locationId: locKeyToId[(n as { locationKey?: string }).locationKey ?? ''] }));
  const enemies: CampaignEnemy[] = enemySrc.map((e, i) => ({ id: rid('emy', i), title: e.title, ac: e.ac, hp: e.hp, description: e.description, tactics: e.dmNotes, imageId: mkImage(e.title, (e as { image?: string }).image), locationIds: ((e as { locationKeys?: string[] }).locationKeys ?? []).map((k) => locKeyToId[k]).filter(Boolean) }));
  const factions: CampaignFaction[] = factionSrc.map((f, i) => ({ id: rid('fac', i), name: f.name, role: f.role, description: f.description, attitude: 'neutral' as const, imageId: mkImage(f.name, (f as { image?: string }).image) }));
  const questSrc = seed?.quests ?? [];
  const quests: CampaignQuest[] = questSrc.map((q, i) => ({ id: rid('qst', i), title: q.title, status: (q.status as CampaignQuest['status']) ?? 'notStarted', description: q.description, dmNotes: q.dmNotes, locationId: locKeyToId[q.locationKey ?? ''], imageId: mkImage(q.title, q.image) }));
  const party: CampaignPlayer[] = playerSrc.map((p, i) => ({ ...p, id: rid('pc', i) }));
  for (const extra of seed?.images ?? []) {
    images.push({ id: rid('img', images.length), title: extra.title, src: extra.src, playerSafe: extra.playerSafe });
  }
  return {
    campaignId, title, type, baseMapId,
    mapIds: [baseMapId], regionIds,
    locations, npcs, quests, enemies, factions, images, routes: [], zones: [], notes: [], party, mapPlacements: [],
    arcs: [defaultArc()],
  };
}

// Block H (Caldran side) — `runtime.mode` (dmView/dmEdit/playerView, the
// in-page DM Edit / Player View toggle used by CampaignLibraryPage and
// IsolatedCampaignMapWorkspace) must be tab-scoped, exactly like Greyholm's
// `mode` in campaignStore.tsx. Historically it lived inside `UserCampaignRuntime`,
// which is written to localStorage under `runtimeKey(id)` AND pushed to the
// server / broadcast to every other subscribed tab/client via `pushBlob` +
// `subscribeUc` — so toggling "Player View" in one DM tab would silently
// flip every other open tab (including real players' browsers) into that
// mode too. sessionStorage is scoped to a single tab (new tab/window = fresh,
// independent sessionStorage; reload keeps it), so it's used here the same
// way as the Greyholm fix: `mode` is read from/written to sessionStorage only,
// stripped out of every runtime write to localStorage/server, and ignored on
// every incoming sync payload.
export const ucModeSessionKey = (id: string) => `campaign-timeline-vtt:uc-mode:tab:${id}`;

export function loadUcTabMode(id: string): UserCampaignMode {
  try {
    const raw = window.sessionStorage.getItem(ucModeSessionKey(id));
    if (raw === 'dmView' || raw === 'dmEdit' || raw === 'playerView') return raw;
  } catch {
    // sessionStorage unavailable (SSR, privacy mode) — fall through to default.
  }
  return 'dmView';
}

export function saveUcTabMode(id: string, mode: UserCampaignMode): void {
  try {
    window.sessionStorage.setItem(ucModeSessionKey(id), mode);
  } catch {
    // Best-effort only; an in-memory mode still works for this page's lifetime.
  }
}

function emptyRuntime(campaignId: string, baseMapId: string): UserCampaignRuntime {
  return {
    campaignId, activeMapId: baseMapId, mode: 'dmView', currentArcId: DEFAULT_ARC_ID,
    notes: [], revealedToPlayers: [], questStatuses: {}, battleTracker: null,
    mapViewState: { zoom: 1, panX: 0, panY: 0 },
  };
}

function upgradeFromScenarioIfNeeded(data: UserCampaignData): UserCampaignData {
  const scenario = scenarioForCampaign(data);
  if (!scenario) return data;
  const before = JSON.stringify(data);
  const clone = JSON.parse(before) as UserCampaignData;
  const result = mergeScenarioIntoData(clone, scenario, (p) => uid(p));
  return JSON.stringify(result.data) === before ? data : result.data;
}

interface UserCampaignValue {
  registry: UserCampaignRegistryEntry[];
  createCampaign: (input: { title: string; type: UserCampaignType; baseMapId: string; regionIds: string[]; seed?: CampaignSeed }) => string;
  renameCampaign: (id: string, title: string) => void;
  setCapability: (id: string, key: UniversalCapabilityKey, enabled: boolean) => void;
  addArc: (id: string, title: string) => void;
  patchArc: (id: string, arcId: string, patch: Partial<Timeline>) => void;
  deleteArc: (id: string, arcId: string) => void;
  setCurrentArc: (id: string, arcId: string) => void;
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
  /** Toggle presenting an entity card to players (closing any open presented
   * battle at the same time, matching the legacy mutual-exclusion). Centralizes
   * what was previously 3 identical raw `updateRuntime` call sites. */
  togglePresentedCard: (id: string, entityType: CampaignEntityType, entityId: string) => void;
  /** Non-destructively upsert the matching scenario template into a campaign
   * (fill missing images/relations, add new cards). Returns a summary, or null
   * if no scenario matches the campaign's base map. */
  upgradeFromScenario: (id: string) => { added: { locations: number; npcs: number; enemies: number; factions: number; players: number }; imagesAttached: number } | null;

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
  /** Stage 17 — universal DM / player-safe export of a campaign. */
  exportUniversal: (id: string, playerSafe: boolean) => string | null;
  /** Stage 17 — import a universal (or legacy) export as a NEW isolated campaign. */
  importUniversalApply: (text: string) => string | null;
  /** Stage 17 — create a campaign-scoped backup (universal export + hash). */
  createUniversalBackup: (id: string) => { ok: boolean; hash: string; at: string } | null;
  /** Stage 17 — restore a campaign from its backup (same id) with a rollback checkpoint. */
  restoreUniversalBackup: (id: string) => { ok: boolean; restoredHash?: string; rollbackHash?: string; errors: string[] };

  /**
   * Stage 9 shadow integration — side-effect-free snapshot of the in-memory
   * user-campaign state, keyed by campaignId. Reads ONLY the in-memory caches
   * (never localStorage, never the server, never triggering an upgrade/fetch),
   * so it is safe to poll from a shadow-integration subscription without
   * mutating legacy state. Identity of each entry's `data`/`runtime` changes
   * only when that campaign is actually mutated, letting the bridge dedupe.
   */
  listShadowSources: () => Array<{ campaignId: string; data: UserCampaignData | null; runtime: UserCampaignRuntime | null }>;
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
    const localRaw = dataCache[id] ?? readJson<UserCampaignData>(dataKey(id));
    const local = localRaw ? upgradeFromScenarioIfNeeded(localRaw) : null;
    if (localRaw && local && local !== localRaw) {
      const upgradedLocal = local;
      writeJson(dataKey(id), upgradedLocal);
      setTimeout(() => {
        setDataCache((p) => ({ ...p, [id]: upgradedLocal }));
        pushBlob(id);
      }, 0);
    }
    // Player / fresh browser with no local copy: pull it from the server once,
    // then let the resulting setState re-render. (Async — never mutates state
    // synchronously during render.)
    if (!local && syncEnabled() && !fetchedRef.current.has(id)) {
      fetchedRef.current.add(id);
      fetchCampaign(id).then((blob) => {
        if (!blob?.data) return;
        const upgradedData = upgradeFromScenarioIfNeeded(blob.data);
        writeJson(dataKey(id), upgradedData);
        setDataCache((p) => ({ ...p, [id]: upgradedData }));
        if (blob.runtime) {
          writeJson(runtimeKey(id), blob.runtime);
          setRuntimeCache((p) => ({ ...p, [id]: blob.runtime! }));
        }
        if (upgradedData !== blob.data) pushBlob(id);
        setRegistry((prev) => {
          if (prev.some((r) => r.campaignId === id)) return prev;
          const now = new Date().toISOString();
          const next = [...prev, { campaignId: id, title: upgradedData.title, type: upgradedData.type, baseMapId: upgradedData.baseMapId, regionIds: upgradedData.regionIds, createdAt: now, updatedAt: now }];
          writeJson(REGISTRY_KEY, next);
          return next;
        });
      });
    }
    return local;
  }, [dataCache, pushBlob]);

  const readRuntime = useCallback((id: string): UserCampaignRuntime => {
    const entry = registry.find((r) => r.campaignId === id);
    const fallbackMap = entry?.baseMapId ?? '';
    const base = runtimeCache[id] ?? readJson<UserCampaignRuntime>(runtimeKey(id)) ?? emptyRuntime(id, fallbackMap);
    // Block H — always override with THIS tab's own sessionStorage-backed
    // mode, never the shared/synced value (see loadUcTabMode above).
    return { ...base, mode: loadUcTabMode(id) };
  }, [runtimeCache, registry]);

  const touchRegistry = useCallback((id: string) => {
    setRegistry((prev) => {
      const next = prev.map((r) => (r.campaignId === id ? { ...r, updatedAt: new Date().toISOString() } : r));
      writeJson(REGISTRY_KEY, next);
      return next;
    });
  }, []);

  const patchData = useCallback((id: string, updater: (prev: UserCampaignData) => UserCampaignData) => {
    const current = dataCache[id] ?? readJson<UserCampaignData>(dataKey(id));
    if (!current) return;
    const next = updater(current);
    writeJson(dataKey(id), next);
    setDataCache((prev) => ({ ...prev, [id]: next }));
    touchRegistry(id);
    pushBlob(id);
  }, [dataCache, touchRegistry, pushBlob]);

  const patchRuntime = useCallback((id: string, updater: (prev: UserCampaignRuntime) => UserCampaignRuntime) => {
    const entry = registry.find((r) => r.campaignId === id);
    const current = runtimeCache[id] ?? readJson<UserCampaignRuntime>(runtimeKey(id)) ?? emptyRuntime(id, entry?.baseMapId ?? '');
    const next = updater(current);
    // Block H — `mode` never joins the persisted/synced runtime blob (see
    // ucModeSessionKey helpers above). Persist a neutral placeholder so any
    // code reading the raw localStorage/server blob directly never sees a
    // real tab's mode; readRuntime always re-attaches the caller's own tab
    // mode on top regardless of what's stored here.
    writeJson(runtimeKey(id), { ...next, mode: 'dmView' as UserCampaignMode });
    setRuntimeCache((prev) => ({ ...prev, [id]: next }));
    pushBlob(id);
  }, [registry, runtimeCache, pushBlob]);

  // Stage 13 — emit an already-committed user-campaign command to the OPTIONAL,
  // default-off universal command-shadow sink. Reads the exact pre/post legacy
  // data+runtime straight from persisted storage (patchData/patchRuntime write
  // synchronously) so the captured states are precise. Fully guarded — a shadow
  // emission can never affect the legacy action. `pre` is captured by the caller
  // BEFORE running the real action.
  const emitUcCommand = (
    id: string,
    scope: string,
    input: unknown,
    pre: { data: UserCampaignData | null; runtime: UserCampaignRuntime | null },
  ): void => {
    try {
      const postData = readJson<UserCampaignData>(dataKey(id)) ?? pre.data;
      const postRuntime = readJson<UserCampaignRuntime>(runtimeKey(id)) ?? pre.runtime;
      emitUserCommand({
        legacyCampaignId: id,
        scope,
        input,
        preData: pre.data,
        postData,
        preRuntime: pre.runtime,
        postRuntime,
      });
    } catch {
      /* never affect the legacy action */
    }
  };
  const captureUc = (id: string) => ({
    data: readJson<UserCampaignData>(dataKey(id)),
    runtime: readJson<UserCampaignRuntime>(runtimeKey(id)),
  });
  const resolveUcKind = (data: UserCampaignData | null, entityId: string): string | null => {
    if (!data) return null;
    const owners: Array<[string, Array<{ id: string }> | undefined]> = [
      ['npc', data.npcs], ['location', data.locations], ['quest', data.quests],
      ['enemy', data.enemies], ['faction', data.factions], ['player', data.party], ['image', data.images],
    ];
    const hits = owners.filter(([, list]) => (list ?? []).some((e) => e.id === entityId)).map(([k]) => k);
    return hits.length === 1 ? hits[0] : null; // deterministic; never first-match on ambiguity
  };

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

    setCapability: (id, key, enabled) => {
      patchData(id, (p) => ({ ...p, capabilities: { ...p.capabilities, [key]: enabled } }));
    },

    // Universal arcs — same Timeline type + same CRUD shape as Greyholm's
    // addTimeline/patchTimeline/deleteTimeline (campaignStore.tsx), just
    // persisted through this store's patchData/patchRuntime instead of a
    // reducer action. One shared <ArcSwitcher> component drives both.
    addArc: (id, title) => {
      patchData(id, (p) => {
        const arcs = resolveArcs(p);
        const arcIdNew = `arc-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
        const order = Math.max(0, ...arcs.map((a) => a.order)) + 1;
        return { ...p, arcs: [...arcs, { id: arcIdNew, arcId: arcIdNew, title, order }] };
      });
      // patchData above already committed synchronously; read the just-written
      // arc id back from storage rather than recomputing it (avoids a second
      // random-id generation that could drift from what was actually saved).
      const fresh = readJson<UserCampaignData>(dataKey(id));
      const last = fresh?.arcs?.[fresh.arcs.length - 1];
      if (last) patchRuntime(id, (r) => ({ ...r, currentArcId: last.id }));
    },
    patchArc: (id, arcId, patch) => {
      patchData(id, (p) => ({ ...p, arcs: resolveArcs(p).map((a) => (a.id === arcId ? { ...a, ...patch } : a)) }));
    },
    deleteArc: (id, arcId) => {
      patchData(id, (p) => {
        const arcs = resolveArcs(p);
        // Safe delete: never the seed default arc, never the currently active
        // arc, never the last remaining arc -- structurally impossible to
        // leave a campaign with zero arcs or pointed at a just-deleted one.
        const runtime = runtimeCache[id] ?? readJson<UserCampaignRuntime>(runtimeKey(id));
        const currentId = resolveCurrentArcId(p, runtime);
        if (arcId === DEFAULT_ARC_ID || arcId === currentId || arcs.length <= 1) return p;
        return { ...p, arcs: arcs.filter((a) => a.id !== arcId) };
      });
    },
    setCurrentArc: (id, arcId) => {
      patchRuntime(id, (r) => ({ ...r, currentArcId: arcId }));
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

    // Block H — tab-scoped only: sessionStorage write + in-memory cache
    // update, deliberately bypassing patchRuntime (which would persist to
    // localStorage and push/broadcast to every other tab/client).
    setMode: (id, mode) => {
      saveUcTabMode(id, mode);
      setRuntimeCache((prev) => {
        const entry = registry.find((r) => r.campaignId === id);
        const current = prev[id] ?? readJson<UserCampaignRuntime>(runtimeKey(id)) ?? emptyRuntime(id, entry?.baseMapId ?? '');
        return { ...prev, [id]: { ...current, mode } };
      });
    },
    setSelected: (id, entityId, entityType) => patchRuntime(id, (prev) => ({ ...prev, selectedEntityId: entityId, selectedEntityType: entityType })),
    toggleReveal: (id, entityId) => {
    const __pre = captureUc(id);
    const __wasRevealed = (__pre.runtime?.revealedToPlayers ?? []).includes(entityId);
    const reveal = !__wasRevealed;
    // Pure computation of the FULL coupled transition (runtime.revealedToPlayers
    // + data.mapPlacements[].visibleToPlayers + — reveal direction only, matching
    // the legacy asymmetry exactly — the entity's single linked image's
    // playerSafe flag). Building this as one pure function lets the universal
    // `reveal` command's cascade (placements + image) be compared for real
    // parity instead of taking a direct legacy-only write for a coupled action.
    const computeNext = (): { runtime: UserCampaignRuntime | null; data: UserCampaignData | null } => {
      const set = new Set(__pre.runtime?.revealedToPlayers ?? []);
      if (reveal) set.add(entityId); else set.delete(entityId);
      const nextRuntime = __pre.runtime ? { ...__pre.runtime, revealedToPlayers: [...set] } : __pre.runtime;
      let nextData = __pre.data;
      if (__pre.data) {
        const imageId =
          __pre.data.locations.find((e) => e.id === entityId)?.imageId ??
          __pre.data.npcs.find((e) => e.id === entityId)?.imageId ??
          __pre.data.quests.find((e) => e.id === entityId)?.imageId ??
          __pre.data.enemies.find((e) => e.id === entityId)?.imageId ??
          __pre.data.factions?.find((e) => e.id === entityId)?.imageId ??
          __pre.data.party?.find((e) => e.id === entityId)?.imageId;
        nextData = {
          ...__pre.data,
          mapPlacements: __pre.data.mapPlacements.map((mp) => (mp.entityId === entityId ? { ...mp, visibleToPlayers: reveal } : mp)),
          images: reveal && imageId
            ? __pre.data.images.map((im) => (im.id === imageId ? { ...im, playerSafe: true } : im))
            : __pre.data.images,
        };
      }
      return { runtime: nextRuntime, data: nextData };
    };
    const applyReal = (): void => {
      const next = computeNext();
      if (next.data) { writeJson(dataKey(id), next.data); setDataCache((prevData) => ({ ...prevData, [id]: next.data as UserCampaignData })); }
      patchRuntime(id, (prev) => ({ ...prev, revealedToPlayers: next.runtime?.revealedToPlayers ?? prev.revealedToPlayers }));
    };
    // Only route through the universal reveal command when the target resolves
    // unambiguously to a single kind (never first-match / guessed identity).
    const kind = resolveUcKind(__pre.data, entityId);
    const handled = kind
      ? routeUserComplex({
          legacyCampaignId: id,
          complexScope: 'userCampaign.reveal',
          descriptor: { aggregate: 'reveal', reveal, entityKind: kind, legacyEntityId: entityId },
          preData: __pre.data,
          preRuntime: __pre.runtime,
          predict: computeNext,
          commit: () => { applyReal(); return captureUc(id); },
          fallback: applyReal,
        })
      : false;
    if (!handled) applyReal();
    if (!__wasRevealed && kind) {
      emitUcCommand(id, 'userCampaign.reveal.update', { scope: 'userCampaign.reveal.update', kind, legacyId: entityId }, __pre);
    }
    },
    isRevealed: (id, entityId) => (readRuntime(id).revealedToPlayers ?? []).includes(entityId),
    togglePresentedCard: (id, entityType, entityId) => {
      const pre = captureUc(id);
      const wasPresenting = pre.runtime?.presentedCard?.entityType === entityType && pre.runtime?.presentedCard?.entityId === entityId;
      const present = !wasPresenting;
      // The real legacy mutation always clears `presentedBattle` in the same
      // write (mutual exclusion between "showing a card" and "showing a battle
      // board") — that field is Stage 17 battle-authority scope, not modeled in
      // the universal presentation aggregate, so it is performed here exactly
      // as before, in the SAME one legacy commit (never a second write).
      const computeNext = (): { runtime: UserCampaignRuntime | null } => ({
        runtime: pre.runtime
          ? { ...pre.runtime, presentedBattle: null, presentedCard: present ? { entityType, entityId } : null }
          : pre.runtime,
      });
      const applyReal = (): void => {
        patchRuntime(id, (prev) => ({ ...prev, presentedBattle: null, presentedCard: present ? { entityType, entityId } : null }));
      };
      const handled = routeUserComplex({
        legacyCampaignId: id,
        complexScope: 'userCampaign.presentedCard',
        descriptor: present
          ? { aggregate: 'presentedCard', present: true, cardType: entityType, cardId: entityId, clearPresentedBattle: true }
          : { aggregate: 'presentedCard', present: false, clearPresentedBattle: true },
        preData: pre.data,
        preRuntime: pre.runtime,
        predict: () => ({ data: pre.data, runtime: computeNext().runtime }),
        commit: () => { applyReal(); return captureUc(id); },
        fallback: applyReal,
      });
      if (!handled) applyReal();
    },
    upgradeFromScenario: (id) => {
      const data = readData(id);
      if (!data) return null;
      const scenario = scenarioForCampaign(data);
      if (!scenario) return null;
      const result = mergeScenarioIntoData(data, scenario, (p) => uid(p));
      writeJson(dataKey(id), result.data);
      setDataCache((prev) => ({ ...prev, [id]: result.data }));
      touchRegistry(id);
      pushBlob(id);
      return { added: result.added, imagesAttached: result.imagesAttached };
    },

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

    updateEntity: (id, entityType, entityId, patch) => {
      const pre = captureUc(id);
      const keys = Object.keys(patch);

      const genericUpdater = (p: UserCampaignData): UserCampaignData => {
        const key = ({ location: 'locations', npc: 'npcs', quest: 'quests', enemy: 'enemies', image: 'images', party: 'party', faction: 'factions' } as const)[entityType as 'location'];
        if (!key) return p;
        const list = ((p[key] as Array<{ id: string }> | undefined) ?? []).map((e) => (e.id === entityId ? { ...e, ...patch } : e));
        if (entityType === 'party') patchPlayerRemote(id, entityId, patch);
        return { ...p, [key]: list } as UserCampaignData;
      };

      // Stage 15 durable-authority scope for a proven-safe single scalar/text
      // field edit on this entity kind (see safeFieldRegistry). Only exact
      // single-field patches qualify.
      const singleKey = keys.length === 1 ? keys[0] : null;
      const singleVal = singleKey ? (patch as Record<string, unknown>)[singleKey] : undefined;
      const durableScope = resolveUserDurableScope(entityType, singleKey);

      if (durableScope && typeof singleVal === 'string') {
        const nextValue = singleVal;
        // A pure single-field updater on the target list. None of npc / quest /
        // faction / location trigger `patchPlayerRemote`, so it has no side effect
        // beyond the single field. Used for the pure prediction (on the captured
        // immutable pre-data) and the ONE real legacy commit.
        const listKey = ({ npc: 'npcs', quest: 'quests', faction: 'factions', location: 'locations' } as const)[entityType as 'npc'];
        const fieldUpdater = (p: UserCampaignData): UserCampaignData => ({
          ...p,
          [listKey]: ((p[listKey] as Array<{ id: string }> | undefined) ?? []).map((e) => (e.id === entityId ? { ...e, ...patch } : e)),
        } as UserCampaignData);

        // Stage 15 — universal DURABLE authority runs FIRST: the universal command
        // is committed to the production repository, then this exact legacy
        // `patchData` runs once as the compatibility projection (existing
        // persistence + existing `pushBlob` sync, fired exactly once). When the
        // Stage 15 flag is off / scope not owned, `routeUserDurable` returns false
        // and we fall through to the Stage 14 path (role only) or a direct
        // `patchData` — exactly the pre-Stage-15 behaviour.
        const commitOnce = () => {
          patchData(id, fieldUpdater);
          return captureUc(id);
        };
        let handled = routeUserDurable({
          legacyCampaignId: id,
          durableScope,
          entityKind: entityType,
          legacyEntityId: entityId,
          value: nextValue,
          preData: pre.data,
          preRuntime: pre.runtime,
          predict: () => ({ data: pre.data ? fieldUpdater(pre.data) : pre.data, runtime: pre.runtime }),
          commit: commitOnce,
          fallback: () => patchData(id, fieldUpdater),
        });
        // Stage 14 — universal command authority (npc role only) if Stage 15 did
        // not take the scope.
        if (!handled && durableScope === 'userCampaign.npc.role.update') {
          handled = routeUserAuthority({
            legacyCampaignId: id,
            scope: 'userCampaign.npc.role.update',
            input: { scope: 'userCampaign.npc.update', legacyNpcId: entityId, field: 'role', value: nextValue },
            preData: pre.data,
            preRuntime: pre.runtime,
            nextValue,
            predict: () => ({ data: pre.data ? fieldUpdater(pre.data) : pre.data, runtime: pre.runtime }),
            commit: commitOnce,
            fallback: () => patchData(id, fieldUpdater),
          });
        }
        if (!handled) patchData(id, fieldUpdater);
        // Stage 13 shadow diagnostics remain independent (npc role only maps to a
        // Stage 13 command scope).
        if (durableScope === 'userCampaign.npc.role.update') {
          emitUcCommand(id, 'userCampaign.npc.update', { scope: 'userCampaign.npc.update', legacyNpcId: entityId, field: 'role', value: nextValue }, pre);
        }
      } else {
        patchData(id, genericUpdater);
      }
    },

    deleteEntity: (id, entityType, entityId) => patchData(id, (p) => {
      const key = ({ location: 'locations', npc: 'npcs', quest: 'quests', enemy: 'enemies', image: 'images', party: 'party', faction: 'factions' } as const)[entityType as 'location'];
      if (!key) return p;
      const list = ((p[key] as Array<{ id: string }> | undefined) ?? []).filter((e) => e.id !== entityId);
      return { ...p, [key]: list, mapPlacements: p.mapPlacements.filter((mp) => !(mp.entityType === entityType && mp.entityId === entityId)) } as UserCampaignData;
    }),

    addPlacement: (id, placement) => {
      // The placement id is minted ONCE here, before either the universal
      // command or the legacy patch is built — the same shared authority
      // function Greyholm's addPlacement uses — so there is never a second,
      // independent id generated for the same create action.
      const placementId = mintPlacementId();
      const full: CampaignMapPlacement = { ...placement, id: placementId };
      const pre = captureUc(id);
      const updater = (p: UserCampaignData): UserCampaignData => ({ ...p, mapPlacements: [...p.mapPlacements, full] });
      const handled = routeUserComplex({
        legacyCampaignId: id,
        complexScope: 'userCampaign.placement',
        descriptor: {
          aggregate: 'placement',
          op: 'place',
          placementId,
          mapRawId: placement.mapId,
          entityKind: placement.entityType,
          entityId: placement.entityId,
          x: placement.x,
          y: placement.y,
          visibleToPlayers: placement.visibleToPlayers,
        },
        preData: pre.data,
        preRuntime: pre.runtime,
        predict: () => ({ data: pre.data ? updater(pre.data) : pre.data, runtime: pre.runtime }),
        commit: () => { patchData(id, updater); return captureUc(id); },
        fallback: () => patchData(id, updater),
      });
      if (!handled) patchData(id, updater);
    },
    updatePlacement: (id, placementId, patch) => {
      const pre = captureUc(id);
      const updater = (p: UserCampaignData): UserCampaignData => ({ ...p, mapPlacements: p.mapPlacements.map((mp) => (mp.id === placementId ? { ...mp, ...patch } : mp)) });
      const keys = Object.keys(patch);
      const isPureMove = typeof patch.x === 'number' && typeof patch.y === 'number' && keys.every((k) => k === 'x' || k === 'y');
      if (isPureMove) {
        // Stage 16.1 — a pure position move maps 1:1 to the universal placement
        // command; route it through the (default off) complex-authority sink
        // first (durable universal commit + this exact patchData once as the
        // compatibility projection). Flag off / scope not owned -> false -> normal.
        const handled = routeUserComplex({
          legacyCampaignId: id,
          complexScope: 'userCampaign.placement',
          descriptor: { aggregate: 'placement', op: 'move', placementId, x: patch.x as number, y: patch.y as number },
          preData: pre.data,
          preRuntime: pre.runtime,
          predict: () => ({ data: pre.data ? updater(pre.data) : pre.data, runtime: pre.runtime }),
          commit: () => { patchData(id, updater); return captureUc(id); },
          fallback: () => patchData(id, updater),
        });
        if (!handled) patchData(id, updater);
        emitUcCommand(id, 'userCampaign.mapPlacement.update', { scope: 'userCampaign.mapPlacement.update', placementId, x: patch.x, y: patch.y }, pre);
      } else {
        patchData(id, updater);
      }
    },
    removePlacement: (id, placementId) => {
      const pre = captureUc(id);
      const updater = (p: UserCampaignData): UserCampaignData => ({ ...p, mapPlacements: p.mapPlacements.filter((mp) => mp.id !== placementId) });
      const handled = routeUserComplex({
        legacyCampaignId: id,
        complexScope: 'userCampaign.placement',
        descriptor: { aggregate: 'placement', op: 'remove', placementId },
        preData: pre.data,
        preRuntime: pre.runtime,
        predict: () => ({ data: pre.data ? updater(pre.data) : pre.data, runtime: pre.runtime }),
        commit: () => { patchData(id, updater); return captureUc(id); },
        fallback: () => patchData(id, updater),
      });
      if (!handled) patchData(id, updater);
    },

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

    exportUniversal: (id, playerSafe) => {
      const data = readData(id);
      if (!data) return null;
      const runtime = readRuntime(id);
      return playerSafe ? exportUserCampaignPlayerSafe(data, runtime) : exportUserCampaignDM(data, runtime);
    },
    importUniversalApply: (text) => {
      const newId = uid('camp');
      const rec = reconstructUserCampaign(text, newId);
      if (!rec.ok || !rec.data) return null;
      const now = new Date().toISOString();
      const data: UserCampaignData = { ...rec.data, campaignId: newId };
      const entry: UserCampaignRegistryEntry = {
        campaignId: newId, title: `${data.title} (import)`, type: data.type,
        baseMapId: data.baseMapId, regionIds: data.regionIds, createdAt: now, updatedAt: now,
      };
      persistRegistry([...registry, entry]);
      writeJson(dataKey(newId), data);
      setDataCache((prev) => ({ ...prev, [newId]: data }));
      const rt = rec.runtime ? { ...rec.runtime, campaignId: newId } : emptyRuntime(newId, data.baseMapId);
      writeJson(runtimeKey(newId), rt);
      setRuntimeCache((prev) => ({ ...prev, [newId]: rt }));
      pushBlob(newId);
      return newId;
    },
    createUniversalBackup: (id) => {
      const text = readData(id) ? exportUserCampaignDM(readData(id)!, readRuntime(id)) : null;
      if (!text) return null;
      const at = new Date().toISOString();
      const hash = userCampaignExportHash(text);
      try { window.localStorage.setItem(`${UC_BACKUP_NS}:${id}`, JSON.stringify({ at, hash, text })); } catch { return null; }
      return { ok: true, hash, at };
    },
    restoreUniversalBackup: (id) => {
      let backup: { at: string; hash: string; text: string } | null = null;
      try { backup = JSON.parse(window.localStorage.getItem(`${UC_BACKUP_NS}:${id}`) || 'null'); } catch { backup = null; }
      if (!backup?.text) return { ok: false, errors: ['no backup found for campaign'] };
      const preview = previewUserCampaignImport(backup.text);
      if (!preview.ok) return { ok: false, errors: ['corrupt backup: ' + preview.errors.join('; ')] };
      if (preview.campaignId && preview.campaignId !== id) return { ok: false, errors: [`wrong-campaign backup (${preview.campaignId} != ${id})`] };
      // rollback checkpoint of the CURRENT state before overwriting
      const rollbackText = readData(id) ? exportUserCampaignDM(readData(id)!, readRuntime(id)) : null;
      const rollbackHash = rollbackText ? userCampaignExportHash(rollbackText) : undefined;
      if (rollbackText) { try { window.localStorage.setItem(`${UC_ROLLBACK_NS}:${id}`, JSON.stringify({ at: new Date().toISOString(), hash: rollbackHash, text: rollbackText })); } catch { /* best effort */ } }
      // reconstruct into the SAME id and write
      const rec = reconstructUserCampaign(backup.text, id);
      if (!rec.ok || !rec.data) return { ok: false, errors: ['restore reconstruct failed'] };
      writeJson(dataKey(id), rec.data);
      setDataCache((prev) => ({ ...prev, [id]: rec.data! }));
      const rt = rec.runtime ?? emptyRuntime(id, rec.data.baseMapId);
      writeJson(runtimeKey(id), rt);
      setRuntimeCache((prev) => ({ ...prev, [id]: rt }));
      pushBlob(id);
      // read-after-write
      const back = readData(id);
      if (!back) return { ok: false, errors: ['read-after-write returned null'] };
      return { ok: true, restoredHash: backup.hash, rollbackHash, errors: [] };
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
    listShadowSources: () => registry.map((entry) => ({
      campaignId: entry.campaignId,
      // In-memory only: never fall back to localStorage / server, never run the
      // scenario-upgrade side effect that readData performs.
      data: dataCache[entry.campaignId] ?? null,
      runtime: runtimeCache[entry.campaignId] ?? null,
    })),
  }), [registry, persistRegistry, readData, readRuntime, patchData, patchRuntime, pushBlob, dataCache, runtimeCache]);

  return <UserCampaignContext.Provider value={value}>{children}</UserCampaignContext.Provider>;
}

export function useUserCampaigns(): UserCampaignValue {
  const ctx = useContext(UserCampaignContext);
  if (!ctx) throw new Error('useUserCampaigns must be used within UserCampaignProvider');
  return ctx;
}

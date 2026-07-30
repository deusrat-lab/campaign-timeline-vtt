// Stage 15 harness helpers. Pure Node, deterministic. Provides mutable legacy
// stubs whose `commit` really mutates the legacy model (so `buildPre` reflects
// prior commits — needed for multi-command / reload / reconciliation checks),
// backed by the REAL universal adapters.
import {
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  safeFieldDescriptor,
} from './.dist/domain/index.js';
import { buildGreyholmOverlayContractInput } from '../stage08/greyholmOverlayFixture.mjs';
import { loadCaldran } from '../stage08/inputs.mjs';

const clone = (v) => structuredClone(v);

/** Instrumented, isolated storage (localStorage-compatible). */
export function instrumentedStorage(seed = {}) {
  const map = new Map(Object.entries(seed));
  const ops = { get: 0, set: 0, remove: 0 };
  const touchedKeys = new Set();
  return {
    storage: {
      getItem: (k) => { ops.get += 1; touchedKeys.add(k); return map.get(k) ?? null; },
      setItem: (k, v) => { ops.set += 1; touchedKeys.add(k); map.set(k, v); },
      removeItem: (k) => { ops.remove += 1; touchedKeys.add(k); map.delete(k); },
    },
    ops,
    touchedKeys,
    rawKeys: () => Array.from(map.keys()),
    raw: map,
    writeCount: () => ops.set + ops.remove,
  };
}

/** A storage whose setItem always throws. */
export function failingSetStorage() {
  return { getItem: () => null, setItem: () => { throw new Error('quota exceeded'); }, removeItem: () => {} };
}

/** A storage whose getItem returns corrupt JSON for campaign records. */
export function corruptReadStorage(namespace, campaignId) {
  const map = new Map();
  const campaignKey = `${namespace}:campaign:${campaignId}`;
  return {
    storage: {
      getItem: (k) => (k === campaignKey ? '{not valid json' : (map.get(k) ?? null)),
      setItem: (k, v) => map.set(k, v),
      removeItem: (k) => map.delete(k),
    },
    raw: map,
  };
}

// ---- Greyholm (main) mutable legacy stub ---------------------------------
export function greyholmLegacy() {
  const base = buildGreyholmOverlayContractInput();
  let data = clone(base.data);
  const overlay = clone(base.overlay);
  const campaignId = campaignIdFromLegacy('greyholm', 'main');
  const adapt = (d) => adaptMainCampaignToUniversal({ data: d, overlay });
  const withField = (npcId, legacyField, value) => {
    const d = clone(data);
    d.npcs = d.npcs.map((n) => (n.id === npcId ? { ...n, [legacyField]: value } : n));
    return d;
  };
  return {
    campaignId,
    kind: 'greyholm',
    firstNpcId: () => data.npcs[0].id,
    read: (npcId, legacyField) => data.npcs.find((n) => n.id === npcId)?.[legacyField],
    adaptPre: () => adapt(clone(data)),
    adaptWith: (npcId, legacyField, value) => adapt(withField(npcId, legacyField, value)),
    apply: (npcId, legacyField, value) => { data = withField(npcId, legacyField, value); },
  };
}

// ---- User campaign (Caldran) mutable legacy stub -------------------------
const KEY_FOR = { npc: 'npcs', quest: 'quests', faction: 'factions', location: 'locations', enemy: 'enemies' };

export function userCampaignLegacy() {
  const caldran = loadCaldran();
  let data = clone(caldran.adapterInput.data);
  const runtime = clone(caldran.adapterInput.runtime);
  const legacyCampaignId = caldran.raw.data.campaignId;
  const campaignId = campaignIdFromLegacy('user', legacyCampaignId);
  const adapt = (d) => adaptUserCampaignToUniversal({ data: d, runtime });
  const withField = (entityKind, id, legacyField, value) => {
    const key = KEY_FOR[entityKind];
    const d = clone(data);
    d[key] = (d[key] ?? []).map((e) => (e.id === id ? { ...e, [legacyField]: value } : e));
    return d;
  };
  return {
    campaignId,
    legacyCampaignId,
    kind: 'userCampaign',
    firstId: (entityKind) => (data[KEY_FOR[entityKind]] ?? [])[0]?.id,
    read: (entityKind, id, legacyField) => (data[KEY_FOR[entityKind]] ?? []).find((e) => e.id === id)?.[legacyField],
    adaptPre: () => adapt(clone(data)),
    adaptWith: (entityKind, id, legacyField, value) => adapt(withField(entityKind, id, legacyField, value)),
    apply: (entityKind, id, legacyField, value) => { data = withField(entityKind, id, legacyField, value); },
    counts: () => ({ npcs: data.npcs.length, quests: data.quests.length, enemies: data.enemies.length, factions: (data.factions ?? []).length, locations: data.locations.length }),
  };
}

/**
 * Build a DurableRouteRequest for a Greyholm scope against a mutable legacy stub.
 * `commit` really mutates the stub; the returned `calls` object counts side
 * effects. `overrides` may inject failing/throwing commit/fallback/predict.
 */
export function greyRequest(legacy, scope, npcId, value, occurredAt, overrides = {}) {
  const d = safeFieldDescriptor(scope);
  const calls = { commit: 0, fallback: 0, predict: 0, buildPre: 0 };
  return {
    request: {
      campaignId: legacy.campaignId,
      campaignKind: 'greyholm',
      sourceKind: 'legacy-main',
      scope,
      command: { scope, legacyEntityId: npcId, value },
      sourceIdentity: 'greyholm:dm',
      occurredAt,
      previousValue: legacy.read(npcId, d.legacyField),
      nextValue: value,
      buildPre: () => { calls.buildPre += 1; return legacy.adaptPre(); },
      predictPost: () => { calls.predict += 1; if (overrides.predict) return overrides.predict(); return legacy.adaptWith(npcId, d.legacyField, value); },
      commit: () => {
        calls.commit += 1;
        if (overrides.commitThrows) throw new Error('legacy commit failed');
        legacy.apply(npcId, d.legacyField, value);
        if (overrides.commitAdapterError) return { snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'x', path: 'p', message: 'legacy adapter error' }] };
        return legacy.adaptPre();
      },
      fallback: () => { calls.fallback += 1; if (overrides.fallbackThrows) throw new Error('fallback failed'); legacy.apply(npcId, d.legacyField, value); },
    },
    calls,
  };
}

export function userRequest(legacy, scope, entityKind, id, value, occurredAt, overrides = {}) {
  const d = safeFieldDescriptor(scope);
  const calls = { commit: 0, fallback: 0, predict: 0, buildPre: 0 };
  return {
    request: {
      campaignId: legacy.campaignId,
      campaignKind: 'userCampaign',
      sourceKind: 'legacy-user-campaign',
      scope,
      command: { scope, legacyEntityId: id, value },
      sourceIdentity: `userCampaign:${legacy.legacyCampaignId}`,
      occurredAt,
      previousValue: legacy.read(entityKind, id, d.legacyField),
      nextValue: value,
      buildPre: () => { calls.buildPre += 1; return legacy.adaptPre(); },
      predictPost: () => { calls.predict += 1; if (overrides.predict) return overrides.predict(); return legacy.adaptWith(entityKind, id, d.legacyField, value); },
      commit: () => {
        calls.commit += 1;
        if (overrides.commitThrows) throw new Error('legacy commit failed');
        legacy.apply(entityKind, id, d.legacyField, value);
        if (overrides.commitAdapterError) return { snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'x', path: 'p', message: 'legacy adapter error' }] };
        return legacy.adaptPre();
      },
      fallback: () => { calls.fallback += 1; if (overrides.fallbackThrows) throw new Error('fallback failed'); legacy.apply(entityKind, id, d.legacyField, value); },
    },
    calls,
  };
}

export { clone };

// Stage 16 harness helpers. Pure Node, deterministic. Provides aggregate-level
// mutable legacy stubs (Greyholm main + Caldran user campaign) whose `commit`
// really mutates the legacy model, backed by the REAL universal adapters, so
// buildPre / predictPost / commit all produce real universal snapshots and the
// durable-authority parity checks are genuine.
import {
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
} from './.dist/domain/index.js';
import { buildGreyholmOverlayContractInput } from '../stage08/greyholmOverlayFixture.mjs';
import { loadCaldran } from '../stage08/inputs.mjs';

export const clone = (v) => structuredClone(v);

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

export function failingSetStorage() {
  return { getItem: () => null, setItem: () => { throw new Error('quota exceeded'); }, removeItem: () => {} };
}

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

const ADAPTER_ERROR = { snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'x', path: 'p', message: 'legacy adapter error' }] };

// ---- Greyholm (main) aggregate legacy stub -------------------------------
export function greyholmComplex() {
  const seed = buildGreyholmOverlayContractInput();
  let data = clone(seed.data);
  let overlay = clone(seed.overlay);
  const campaignId = campaignIdFromLegacy('greyholm', 'main');
  const adapt = (d, o) => adaptMainCampaignToUniversal({ data: d, overlay: o });

  // Pure transforms: (data, overlay) -> { data, overlay }
  function transform(kind, args, d0, o0) {
    const d = clone(d0);
    const o = clone(o0);
    o.party = o.party ?? {};
    switch (kind) {
      case 'reveal.entity': {
        const set = new Set(o.party.revealedLocationStateIds ?? []);
        set.add(args.locId);
        o.party.revealedLocationStateIds = Array.from(set);
        break;
      }
      case 'reveal.hide': {
        o.party.revealedLocationStateIds = (o.party.revealedLocationStateIds ?? []).filter((id) => id !== args.locId);
        break;
      }
      case 'presentedCard.present':
        o.presentedCard = { type: args.type, id: args.id };
        break;
      case 'presentedCard.dismiss':
        o.presentedCard = null;
        break;
      case 'placement.move':
        d.placements = d.placements.map((p) => (p.id === args.plcId ? { ...p, position: { x: args.x, y: args.y } } : p));
        break;
      case 'placement.remove':
        d.placements = d.placements.filter((p) => p.id !== args.plcId);
        break;
      case 'placement.place':
        d.placements = [...d.placements, { id: args.plcId, arcId: args.arcId, mapLevel: args.mapLevel, mapId: args.mapRaw, entityKind: args.entityKind, entityId: args.entityId, title: args.title, position: { x: args.x, y: args.y }, visibleInPlayerView: args.visible, status: 'active' }];
        break;
      case 'partyLocation.move':
        o.party.currentLocationStateId = args.locId;
        o.party.currentMapPosition = { timelineId: args.timelineId, mapId: args.mapRaw, mapLevel: args.mapLevel, x: args.x, y: args.y };
        break;
      case 'routeProgress.advance':
        o.partyRouteProgress = clone(args.rp);
        break;
      case 'routeProgress.clear':
        o.partyRouteProgress = null;
        break;
      default:
        throw new Error(`unknown transform ${kind}`);
    }
    return { data: d, overlay: o };
  }

  return {
    campaignId,
    kind: 'greyholm',
    sourceKind: 'legacy-main',
    adaptPre: () => adapt(data, overlay),
    snapshot: () => adapt(data, overlay).snapshot,
    transform,
    predict: (kind, args) => { const t = transform(kind, args, data, overlay); return adapt(t.data, t.overlay); },
    apply: (kind, args) => { const t = transform(kind, args, data, overlay); data = t.data; overlay = t.overlay; return adapt(data, overlay); },
    peek: () => ({ data: clone(data), overlay: clone(overlay) }),
  };
}

// ---- Caldran (user campaign) aggregate legacy stub -----------------------
export function caldranComplex() {
  const caldran = loadCaldran();
  let data = clone(caldran.adapterInput.data);
  let runtime = clone(caldran.adapterInput.runtime);
  const legacyCampaignId = caldran.raw.data.campaignId;
  const campaignId = campaignIdFromLegacy('user', legacyCampaignId);
  const adapt = (d, r) => adaptUserCampaignToUniversal({ data: d, runtime: r });

  function transform(kind, args, d0, r0) {
    const d = clone(d0);
    const r = clone(r0);
    switch (kind) {
      case 'reveal.entity':
      case 'reveal.hide': {
        // Mirrors the REAL `toggleReveal` legacy action (userCampaignStore.tsx):
        // a coupled multi-slot transition — runtime.revealedToPlayers, EVERY
        // mapPlacement linked to the entity (both directions), and — reveal
        // direction only, matching the legacy asymmetry — the entity's single
        // linked image's playerSafe flag.
        const reveal = kind === 'reveal.entity';
        const set = new Set(r.revealedToPlayers ?? []);
        if (reveal) set.add(args.rawId); else set.delete(args.rawId);
        r.revealedToPlayers = Array.from(set);
        const imageId =
          d.locations.find((e) => e.id === args.rawId)?.imageId ??
          d.npcs.find((e) => e.id === args.rawId)?.imageId ??
          d.quests.find((e) => e.id === args.rawId)?.imageId ??
          d.enemies.find((e) => e.id === args.rawId)?.imageId ??
          d.factions?.find((e) => e.id === args.rawId)?.imageId ??
          d.party?.find((e) => e.id === args.rawId)?.imageId;
        d.mapPlacements = d.mapPlacements.map((mp) => (mp.entityId === args.rawId ? { ...mp, visibleToPlayers: reveal } : mp));
        if (reveal && imageId) {
          d.images = d.images.map((im) => (im.id === imageId ? { ...im, playerSafe: true } : im));
        }
        break;
      }
      case 'presentedCard.present':
        r.presentedCard = { entityType: args.type, entityId: args.id };
        break;
      case 'presentedCard.dismiss':
        r.presentedCard = null;
        break;
      case 'placement.move':
        d.mapPlacements = d.mapPlacements.map((p) => (p.id === args.plcId ? { ...p, x: args.x, y: args.y } : p));
        break;
      case 'placement.remove':
        d.mapPlacements = d.mapPlacements.filter((p) => p.id !== args.plcId);
        break;
      case 'placement.place':
        d.mapPlacements = [...d.mapPlacements, { id: args.plcId, mapId: args.mapRaw, entityType: args.entityKind, entityId: args.entityId, x: args.x, y: args.y, visibleToPlayers: args.visible }];
        break;
      default:
        throw new Error(`unknown transform ${kind}`);
    }
    return { data: d, runtime: r };
  }

  return {
    campaignId,
    legacyCampaignId,
    kind: 'userCampaign',
    sourceKind: 'legacy-user-campaign',
    adaptPre: () => adapt(data, runtime),
    snapshot: () => adapt(data, runtime).snapshot,
    transform,
    predict: (kind, args) => { const t = transform(kind, args, data, runtime); return adapt(t.data, t.runtime); },
    apply: (kind, args) => { const t = transform(kind, args, data, runtime); data = t.data; runtime = t.runtime; return adapt(data, runtime); },
    counts: () => ({ npcs: data.npcs.length, enemies: data.enemies.length, locations: data.locations.length, quests: data.quests.length, factions: (data.factions ?? []).length, placements: d_len(data.mapPlacements), routes: d_len(data.routes) }),
  };
}

function d_len(a) { return Array.isArray(a) ? a.length : 0; }

/**
 * Build a ComplexRouteRequest bound to a legacy stub. `command` is the typed
 * universal command; `transformKind`/`transformArgs` describe the matching legacy
 * transition (kept consistent with `command` by the caller). `overrides` may
 * inject failing/throwing commit/fallback/predict for failure-path tests.
 */
export function complexRequest(legacy, scope, command, transformKind, transformArgs, occurredAt, overrides = {}) {
  const calls = { commit: 0, fallback: 0, predict: 0, buildPre: 0 };
  return {
    calls,
    request: {
      campaignId: overrides.campaignId ?? legacy.campaignId,
      campaignKind: legacy.kind,
      sourceKind: legacy.sourceKind,
      scope,
      command,
      sourceIdentity: `${legacy.kind}:${legacy.legacyCampaignId ?? 'main'}`,
      occurredAt,
      buildPre: () => { calls.buildPre += 1; if (overrides.buildPre) return overrides.buildPre(); return legacy.adaptPre(); },
      predictPost: () => { calls.predict += 1; if (overrides.predict) return overrides.predict(); return legacy.predict(transformKind, transformArgs); },
      commit: () => {
        calls.commit += 1;
        if (overrides.commitThrows) throw new Error('legacy commit failed');
        if (overrides.commitAdapterError) { legacy.apply(transformKind, transformArgs); return ADAPTER_ERROR; }
        return legacy.apply(transformKind, transformArgs);
      },
      fallback: () => { calls.fallback += 1; if (overrides.fallbackThrows) throw new Error('fallback failed'); if (!overrides.noFallbackApply) legacy.apply(transformKind, transformArgs); },
    },
  };
}

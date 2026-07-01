/**
 * Player Safe Projection — the single place that decides what a non-DM
 * viewer (Player View inside MapWorkspacePage, or the standalone Observer
 * page) is allowed to see. Every rule here mirrors filtering logic that used
 * to live scattered inline across MapWorkspacePage.tsx (visibleHotspots,
 * visibleRoutes, visiblePlacements, image lists, search results) — this
 * module centralizes it so DM-only data (dmNotes, hidden locations/
 * placements/routes, enemies/enemy stats, unsafe images, hidden quests,
 * travel events with visibleInPlayerView:false, non-player-safe battle maps,
 * secret/internal status text) can never leak through a second, forgotten
 * inline filter.
 *
 * DM modes (dm-view/dm-edit) must see everything — every function here is a
 * pure read-only projection; callers in DM modes should simply not call it
 * (or pass the unfiltered list straight through), exactly as MapWorkspacePage
 * already does via its own `isPlayerView` checks at call sites.
 */
import type { CampaignData } from './loadCampaignData';
import type {
  LocationState,
  MapHotspot,
  MapRoute,
  MapObjectPlacement,
  CampaignProgress,
  ImageItem,
  CampaignEvent,
  DelayedTrigger,
  FactionZone,
  DynamicMapOverlay,
  MovableEntity,
  BattleEntry,
  Npc,
} from '../types';
import { isLocationVisibleToPlayers } from './selectors';

// TODO(data-safety): the following DM-only structures either don't exist yet
// in the data model, or exist but have no projection helper here yet — when
// any of these get a concrete shape, add a getPlayerSafe* filter alongside
// the others in this file rather than filtering inline at the call site:
//  - enemy stat blocks (CustomEnemy) currently have NO player-safe filter at
//    all; getPlayerSafeSearchResults() drops enemies entirely from search,
//    but nothing here strips a raw CustomEnemy object if a caller renders it
//    directly (Observer/MapWorkspacePage already avoid this by never passing
//    enemies into player-facing components — keep it that way).
//  - TravelEvent (src/types.ts) has `visibleInPlayerView`/`status` fields but
//    no getPlayerSafeTravelEvents() helper exists yet; MapWorkspacePage
//    filters travel events inline in its DM-only panels instead of via this
//    module — fine for now since Observer never reads TravelEvent at all.
//  - quest internal/DM-only fields (if/when DmQuest grows any) have no
//    stripping helper here — getPlayerSafeSearchResults() only filters by
//    status==='hidden', it doesn't redact fields off the Quest object itself.
//  - "raw overlay internals" (battleMapLocationLinkOverrides, calendars,
//    routeEditorVersion, etc.) are never exposed to Observer today because
//    ObserverViewPage only reads store.party/store.progress + data — if a
//    future feature starts passing the raw CampaignOverlay to a player-facing
//    component, it MUST go through a projection added here first.

export function getPlayerSafeLocationStates(data: CampaignData, progress: CampaignProgress, timelineId: string): LocationState[] {
  return data.locationStates.filter(
    (ls) => ls.timelineId === timelineId && isLocationVisibleToPlayers(ls, progress),
  );
}

/** Hotspots are player-safe by default for locations, matching the table-map
 * rule that players should see the same geography as the DM. Only explicit
 * hidden flags remove a location marker from Player View/Observer. */
export function getPlayerSafeHotspots(data: CampaignData, progress: CampaignProgress, hotspots: MapHotspot[]): MapHotspot[] {
  return hotspots.filter((h) => {
    if (!h.locationStateId) return h.visibleInPlayerView !== false;
    const ls = data.locationStates.find((l) => l.id === h.locationStateId);
    if (ls && !isLocationVisibleToPlayers(ls, progress)) return false;
    return true;
  });
}

export function getPlayerSafeRoutes(routes: MapRoute[]): MapRoute[] {
  return routes
    .filter((route) => route.visibleInPlayerView === true && route.status !== 'hidden' && route.status !== 'blocked')
    .map((route) => {
      const { notes: _notes, linkedQuestIds: _linkedQuestIds, linkedLocationIds: _linkedLocationIds, linkedFactionIds: _linkedFactionIds, linkedEventIds: _linkedEventIds, ...rest } = route;
      return { ...rest } as MapRoute;
    });
}

/**
 * NPCs — hidden by default. A linked NPC only appears to players when the DM
 * explicitly sets `visibleToPlayers: true`; absent/false both mean hidden.
 * Always strips `dmNotes`/`secrets`
 * regardless of visibility. This is belt-and-suspenders: every existing
 * render site (MapWorkspacePage's NPC drawer/cards) already gates
 * `secrets`/`dmNotes` behind `!isPlayerView` inline, but any future
 * caller (Observer, search) must go through this function rather than
 * reading `data.npcs` raw.
 */
export function getPlayerSafeNpcs(npcs: Npc[]): Npc[] {
  return npcs
    .filter((n) => n.visibleToPlayers === true)
    .map((n) => {
      const { dmNotes: _dmNotes, secrets: _secrets, ...rest } = n;
      return { ...rest } as Npc;
    });
}

/** Placements: location markers are player-visible by default so the player
 * map starts with the same geography as the DM map. Other marker types
 * (NPC/quest/enemy/image/custom notes) still require explicit reveal. */
export function getPlayerSafePlacements(placements: MapObjectPlacement[]): MapObjectPlacement[] {
  return placements.filter((p) => {
    if (p.status === 'archived' || p.status === 'hidden') return false;
    if (p.entityKind === 'location') return true;
    return p.visibleInPlayerView === true;
  });
}

/** Location/object images are player-safe by default. The DM can explicitly
 * hide spoilery art with `safeForPlayers:false`; absent/true both mean
 * visible, matching the table rule that a visible location's default image
 * should open for players automatically. */
export function getPlayerSafeImages(images: ImageItem[]): ImageItem[] {
  return images.filter((im) => im.safeForPlayers !== false);
}

/** CampaignEvents (Event System MVP) are DM-only by default — only events
 * explicitly flagged visibleInPlayerView===true are ever shown to a player
 * or to Observer. Mirrors the placement/route/hotspot visibility rule: an
 * absent flag means "not visible", never "visible by default". */
/**
 * Event System + Delayed Triggers MVP — previously this only filtered by
 * visibility and returned the event as-is, which meant a DM-authored
 * `description` (written before playerSafeDescription existed as a field)
 * would leak verbatim to players for any event flagged visibleInPlayerView.
 * Fixed to mirror the FactionZone description/playerSafeDescription split
 * exactly: `description` is never included, `playerSafeDescription` is
 * included only when the DM explicitly wrote one.
 */
export function getPlayerSafeEvents(events: CampaignEvent[]): CampaignEvent[] {
  return events
    .filter((ev) => ev.visibleInPlayerView === true && ev.status !== 'cancelled' && ev.status !== 'hidden')
    .map((ev) => {
      const { description: _description, ...rest } = ev;
      return {
        ...rest,
        ...(ev.playerSafeDescription ? { playerSafeDescription: ev.playerSafeDescription } : {}),
      } as CampaignEvent;
    });
}

/**
 * DelayedTriggers (Stage 3) are fundamentally DM planning tools — internal
 * scheduling/automation stubs, not narrative content. The default leans
 * toward exclusion: even a trigger explicitly flagged
 * `visibleInPlayerView: true` is still dropped here, because nothing in this
 * MVP defines what a "safe to show" trigger summary would look like without
 * leaking DM-only effect payloads. Always returns an empty array for now —
 * kept as a real function (not just "don't call it") so any future caller
 * that wires Observer/player UI to triggers is forced through one explicit
 * choke point instead of reading triggersById directly.
 */
export function getPlayerSafeTriggers(_triggers: DelayedTrigger[]): DelayedTrigger[] {
  return [];
}

/**
 * FactionZones (Stage 4A) are excluded from player-safe output unless
 * explicitly flagged `visibleInPlayerView === true` — same "absent means not
 * visible" rule as every other entity in this module. `status === 'hidden'`
 * is DM-only and always excluded regardless of the visibility flag (a DM
 * might forget to also flip visibleInPlayerView back to false when hiding a
 * zone, so status is checked independently as a belt-and-suspenders rule).
 * `dmNotes` is never included in the returned shape. Mirrors the
 * `publicDescription`/`dmNotes` split already established on `LocationState`:
 * `description` here is the DM-authored field that is NOT automatically
 * player-safe (unlike LocationState.publicDescription, which IS public by
 * name) — so the returned shape prefers `playerSafeDescription` and falls
 * back to omitting the description entirely (never to the raw `description`)
 * when no player-safe rewrite has been authored, to avoid ever leaking
 * DM-authored text that wasn't explicitly cleared for players.
 */
export function getPlayerSafeFactionZones(zones: FactionZone[]): FactionZone[] {
  return zones
    .filter((z) => z.visibleInPlayerView === true && z.status !== 'hidden')
    .map((z) => {
      const { dmNotes: _dmNotes, description: _description, ...rest } = z;
      return {
        ...rest,
        ...(z.playerSafeDescription ? { playerSafeDescription: z.playerSafeDescription } : {}),
      } as FactionZone;
    });
}

/**
 * DynamicMapOverlays (Stage 4B) are excluded from player-safe output unless
 * BOTH `active === true` AND `visibleInPlayerView === true` — same "absent
 * means not visible" rule as every other entity in this module. `description`
 * is DM-only (a DM-authored note about the overlay, e.g. why the fog is
 * there) and is never included in the returned shape, mirroring how
 * `dmNotes`/`description` are stripped off FactionZone above — there is no
 * `playerSafeDescription` field on DynamicMapOverlay, so the description is
 * simply omitted entirely rather than partially redacted.
 */
export function getPlayerSafeDynamicMapOverlays(overlays: DynamicMapOverlay[]): DynamicMapOverlay[] {
  return overlays
    .filter((o) => o.active === true && o.visibleInPlayerView === true)
    .map((o) => {
      const { description: _description, ...rest } = o;
      return { ...rest } as DynamicMapOverlay;
    });
}

/**
 * MovableEntities (Stage 4C re-audit) — still returns an empty array
 * unconditionally; this was re-examined in Stage 4C and the conservative
 * default was kept deliberately rather than shipping a half-safe projection.
 * Reasoning checked during the Stage 4C audit:
 *  - DmNpc (src/types/dmCompanion.ts) has NO visibleToPlayers/safeForPlayers
 *    field at all — there is no existing NPC-visibility concept anywhere in
 *    the data model to cross-reference against `entityId`. A `visibleInPlayerView
 *    === true` MovableEntity could still carry an `entityId` referencing an
 *    NPC the DM never intended players to know exists by that name.
 *  - `entityId` is always free text (no Npc/CustomEnemy resolver exists yet —
 *    see the MovableEntity selection panel's TODO in MapWorkspacePage.tsx),
 *    so even "stripping the raw id" would require inventing a new safe-label
 *    scheme with no existing precedent to model it on (FactionZone's
 *    description/playerSafeDescription split doesn't apply here — there is
 *    no equivalent playerSafe-name field on MovableEntity).
 *  - `currentPosition` for an `army`/`enemy_group` could trivially leak
 *    hidden troop movements even when `visibleInPlayerView` is true and
 *    `movementState` is excluded from 'hidden'/'unknown', because nothing
 *    guarantees a DM remembered to flip visibleInPlayerView back off after a
 *    war-front situation changed.
 * Given all three gaps, shipping a partial filter now would create exactly
 * the kind of "half-safe projection that quietly leaks a field nobody
 * thought about" this module exists to prevent. Always returns an empty
 * array unconditionally, so no caller can accidentally leak even a partial
 * entity. Kept as a real function (not just "don't call it") so any future
 * caller that wires Observer/player UI to movable entities is forced through
 * one explicit choke point instead of reading movableEntitiesById directly.
 *
 * TODO(stage-4d?): once entityId has a real resolver AND a safe-label/
 * safe-name scheme is designed (mirroring FactionZone's playerSafeDescription
 * pattern), revisit this — likely shape: filter to
 * visibleInPlayerView===true && movementState in ('stationary','travelling'),
 * map to { id, entityType, safeLabel, currentPosition? }, never the raw
 * entityId or dmNotes-equivalent fields.
 */
export function getPlayerSafeMovableEntities(_entities: MovableEntity[]): MovableEntity[] {
  return [];
}

/**
 * BattleEntries (Stage 5A) — excluded from player-safe output unless
 * explicitly flagged `visibleInPlayerView === true`, same "absent means not
 * visible" rule as every other entity in this module. `status === 'hidden'`
 * is always excluded (belt-and-suspenders, same rule as FactionZone). This
 * additionally excludes `status === 'disabled'` by default: a disabled entry
 * is one the DM has deliberately turned off (wrong scene, retired branch,
 * etc) and is conceptually closer to "not currently real" than "real but
 * secret" — showing a disabled-but-visibleInPlayerView-true entry to players
 * would surface a battle that isn't actually going to happen, which is worse
 * than just omitting it. If a future stage wants players to see a disabled
 * entry's marker fade out gracefully instead of vanish, that needs a new
 * explicit field — not a relaxation of this default.
 *
 * `dmNotes`, `linkedEnemyIds`, and `encounterPresetIds` are NEVER included in
 * the returned shape under any circumstance — DM planning info, never safe
 * even partially. `linkedQuestIds`/`linkedNpcIds` are also stripped: nothing
 * in this MVP defines a safe partial-reveal of "which quests/NPCs are tied to
 * this fight" (mirrors the conservative posture already taken for
 * MovableEntity/DelayedTrigger in this module). `description` is DM-authored
 * and not automatically safe (mirrors FactionZone): the returned shape prefers
 * `playerSafeDescription` and otherwise omits any description text entirely.
 * `variants`/`battleMapId`/`battleMapUrl` carry internal launch wiring and are
 * never included; only a minimal `safeVariantPreview` (kind + imageId, if a
 * variant happens to expose an imageId) is surfaced, since an imageId alone
 * is not the launch URL and is the same kind of reference already considered
 * safe for ImageItem via getPlayerSafeImages() elsewhere in this module.
 *
 * Stage 5B addition: `playerSafeSummary` is the ONLY summary text ever
 * returned for a completed entry — never the raw DM consequences-panel
 * `summary`/draft text, which never reaches this function in the first
 * place (drafts are local component state, see BattleConsequencesPanel.tsx).
 */
export function getPlayerSafeBattleEntries(entries: BattleEntry[]): BattleEntry[] {
  return entries
    .filter((e) => e.visibleInPlayerView === true && e.status !== 'hidden' && e.status !== 'disabled')
    .map((e) => {
      const safeVariant = e.variants?.find((v) => v.imageId);
      return {
        id: e.id,
        timelineId: e.timelineId,
        name: e.name,
        ...(e.playerSafeDescription ? { playerSafeDescription: e.playerSafeDescription } : {}),
        ...(e.status === 'completed' && e.playerSafeSummary ? { playerSafeSummary: e.playerSafeSummary } : {}),
        ...(e.position ? { position: e.position } : {}),
        sceneSize: e.sceneSize,
        status: e.status,
        visibleInPlayerView: true,
        ...(safeVariant ? { variants: [{ id: safeVariant.id, kind: safeVariant.kind, name: safeVariant.name, imageId: safeVariant.imageId }] } : {}),
        createdAt: e.createdAt,
        updatedAt: e.updatedAt,
      } as BattleEntry;
    });
}

export interface PlayerSafeSearchInput {
  locs: LocationState[];
  npcs: Array<{ id: string; location?: string; visibleToPlayers?: boolean }>;
  quests: Array<{ id: string; status?: string; location?: string }>;
  placements: MapObjectPlacement[];
}

/**
 * Filters a pre-computed search-result bundle down to player-safe entries.
 * Enemies and battle maps are intentionally dropped entirely from player
 * search results (never partially redacted) — they're DM-only categories.
 */
export function getPlayerSafeSearchResults(
  data: CampaignData,
  progress: CampaignProgress,
  input: PlayerSafeSearchInput,
) {
  const safeLocIds = new Set(
    data.locationStates.filter((ls) => isLocationVisibleToPlayers(ls, progress)).map((ls) => ls.id),
  );
  return {
    locs: input.locs.filter((ls) => isLocationVisibleToPlayers(ls, progress)),
    npcs: input.npcs.filter(
      (n) => n.visibleToPlayers === true && (!n.location || safeLocIds.has(n.location)),
    ),
    quests: input.quests.filter((q) => q.status !== 'hidden' && (!q.location || safeLocIds.has(q.location))),
    placements: getPlayerSafePlacements(input.placements),
  };
}

/**
 * Strips DM-only fields off a LocationState before handing it to a player-
 * facing component (Observer, player drawers) — belt-and-suspenders on top
 * of the visibility filters above, in case a caller renders the raw object.
 * Also strips the DM-only sub-fields of the Stage 6B.1 template details
 * (`tavernDetails.secrets`, `shopDetails.illegalGoods`) rather than the
 * whole sub-object, since the rest of those details (rooms/rumors/goods)
 * are player-safe-by-default flavor text the DM may want Observer to show.
 */
export function stripDmOnlyLocationFields(ls: LocationState): Omit<LocationState, 'dmNotes' | 'enemyIds'> {
  const { dmNotes: _dmNotes, enemyIds: _enemyIds, ...rest } = ls;
  if (rest.tavernDetails) {
    // staffNpcIds/pricesNotes/troubleHooks/secrets are DM-only by default —
    // mirrors the inline !isPlayerView gating in LocationSidePanel's "Таверна
    // — детали" section (MapWorkspacePage.tsx). Only ownerNpcId,
    // roomsServices, and rumors are shown to players today (no per-field
    // playerSafe override exists yet, so "hidden unless explicitly
    // player-safe" — see CAMPAIGN_MAP_WORKSPACE_MANUAL_CONTENT_AUTHORING_SPEC.md §2 —
    // means these stay DM-only rather than being guessed at as safe).
    const { staffNpcIds: _staffNpcIds, pricesNotes: _pricesNotes, troubleHooks: _troubleHooks, secrets: _secrets, ...tavernRest } = rest.tavernDetails;
    rest.tavernDetails = tavernRest;
  }
  if (rest.shopDetails) {
    // inventoryNotes/pricePolicy/reputationRequirement/illegalGoods are
    // DM-only by default, same rule as tavernDetails above.
    const { inventoryNotes: _inventoryNotes, pricePolicy: _pricePolicy, reputationRequirement: _reputationRequirement, illegalGoods: _illegalGoods, ...shopRest } = rest.shopDetails;
    rest.shopDetails = shopRest;
  }
  return rest;
}

/**
 * One-call convenience wrapper bundling the above for a given map's hotspots/
 * routes/placements — used by ObserverViewPage and can replace the inline
 * filtering blocks in MapWorkspacePage's player-view branches incrementally.
 */
export function getPlayerSafeCampaignProjection(
  data: CampaignData,
  progress: CampaignProgress,
  opts: { timelineId: string; hotspots: MapHotspot[]; routes: MapRoute[]; placements: MapObjectPlacement[] },
) {
  return {
    locationStates: getPlayerSafeLocationStates(data, progress, opts.timelineId),
    hotspots: getPlayerSafeHotspots(data, progress, opts.hotspots),
    routes: getPlayerSafeRoutes(opts.routes),
    placements: getPlayerSafePlacements(opts.placements),
  };
}

/**
 * Block K (Greyholm export) — materializes Greyholm's live overlay + seed
 * data into the SAME `UserCampaignData` shape User Campaigns already export
 * through (src/domain/portability/userCampaignPortability.ts's
 * `exportUserCampaignDM`). This is deliberately NOT a second handcrafted
 * export format: `exportGreyholmUniversal()` (userCampaignPortability.ts)
 * calls this materializer, then hands the result to the exact same
 * `exportUserCampaignDM()` function Caldran uses — same envelope, same
 * universal snapshot adapter (`adaptUserCampaignToUniversal`), same hash.
 *
 * Scope (Block K full-coverage pass, see CONTINUATION_STATE.json for exact
 * evidence): metadata + capabilities + arcs + locations + npcs + quests +
 * enemies + images + factions + players + map placements + routes + zones
 * are all covered — every durable, campaign-owned Greyholm section that the
 * shared `UserCampaignData` schema (`src/types/userCampaign.ts`) has a slot
 * for. Calendar/durable-events/economy/services/movable-entities/full battle
 * definitions are DELIBERATELY excluded: `UserCampaignData` itself has NO
 * fields for them (confirmed by reading the type directly — this is not a
 * Greyholm-specific omission, Caldran/User Campaigns have never had these
 * sections either, and the project's own `FINAL_FUNCTIONAL_PARITY_REPORT.md`
 * already classifies Timeline/Events and Economy as
 * `NOT_APPLICABLE_BY_SOURCE_DESIGN` for the UC stack for exactly this
 * reason). Extending the shared schema to add them would be new scope for
 * BOTH stacks, not a Greyholm export gap — out of bounds for "one universal
 * format, no second schema." `customBattleMaps` (the one battle-adjacent
 * field the schema DOES have) is covered from Greyholm's battle-map catalog.
 *
 * Runtime/session state is explicitly SESSION_EXCLUDED, never exported:
 * activeBattle, presentedCard, current arc/tab mode, camera/viewport,
 * selection — none of these have a field on `UserCampaignData` (they only
 * exist on the separate per-campaign runtime blob, which this materializer
 * never touches and `exportUserCampaignDM` never receives). This is the same
 * explicit, previously-tested contract `stripCameraViewState()` enforces for
 * Caldran's own DM export.
 *
 * The result always gets a NEW campaignId distinct from Greyholm's own
 * `greyholm:main` identity — Greyholm itself is never "the" import target;
 * every import (via the existing `importUniversalApply` path) creates a
 * brand-new, isolated User Campaign. There is exactly one Greyholm. Per this
 * project's established root-campaign-identity policy (Case B —
 * `verify:root-campaign-identity-policy`), the imported copy's root id is
 * expected and allowed to differ from any Greyholm-side placeholder; only
 * stable content entity ids (locations/npcs/quests/enemies/...) are part of
 * the semantic parity contract.
 */
/**
 * Deliberately typed against `MainCampaignDataInput`/`MainCampaignOverlayInput`
 * (mainCampaignAdapter.ts's own structural input types) rather than the app's
 * `CampaignData`/`CampaignOverlay` types directly: those live under
 * `src/data/loadCampaignData.ts`, which imports raw `.json` seed files —
 * fine under Vite, but it breaks the narrow non-Vite `tsc` invocation several
 * `scripts/stage0*-*.mjs` guards use to compile files that transitively
 * import the `src/domain` barrel (no `--resolveJsonModule`). Structural
 * typing here avoids that transitive import entirely while still matching
 * the real live shapes `useCampaignData()`/`useCampaignStore()` produce
 * (both are structural supersets of these interfaces).
 */
import type { MainCampaignDataInput, MainCampaignOverlayInput } from './mainCampaignAdapter';
import type {
  CampaignEnemy,
  CampaignFaction,
  CampaignImage,
  CampaignLocation,
  CampaignMapPlacement,
  CampaignNpc,
  CampaignPlayer,
  CampaignQuest,
  CampaignQuestStatus,
  CampaignRoute,
  CampaignZone,
  UserCampaignData,
} from '../../types/userCampaign';

/** Deterministic id for the materialized export — NOT Greyholm's own
 * `greyholm:main` registry id, and re-computed fresh on every export call
 * (import always rewrites the id again anyway — see
 * `reconstructUserCampaign` — so this is only ever a placeholder). */
export const GREYHOLM_EXPORT_SOURCE_ID = 'greyholm-export-source';

export function materializeGreyholmAsUserCampaign(data: MainCampaignDataInput, overlay: MainCampaignOverlayInput): UserCampaignData {
  // IMPORTANT: locations are materialized from `data.locations` (the raw
  // DmLocation catalog), NOT `data.locationStates` (per-timeline/arc
  // instances). `npc.location`, `quest.location`, and `enemy.locationIds`
  // all reference DmLocation ids directly (confirmed against the real seed
  // JSON: e.g. npcs.json's `location: "loc-greyholm-guild"` matches
  // locations.json's `id: "loc-greyholm-guild"`) -- LocationState ids are a
  // DIFFERENT id space (one DmLocation can have multiple per-arc
  // LocationState instances) and do not resolve these cross-references.
  // Found and fixed this pass after a live round-trip check surfaced 206
  // dangling npc/quest/enemy -> location references when this incorrectly
  // sourced from locationStates.
  const locations: CampaignLocation[] = data.locations.map((loc) => ({
    id: loc.id,
    title: loc.name,
    description: loc.description,
    dmNotes: [loc.dmSecrets, loc.notes].filter(Boolean).join('\n\n') || undefined,
    playerSafeDescription: loc.playerView,
    imageId: loc.images?.[0],
    tags: loc.tags,
  }));

  const npcs: CampaignNpc[] = data.npcs.map((npc) => ({
    id: npc.id,
    name: npc.name,
    role: npc.role,
    locationId: npc.location,
    description: npc.personality,
    dmNotes: [npc.goals, npc.secrets].filter(Boolean).join('\n\n') || undefined,
    imageId: npc.image,
    tags: npc.tags,
  }));

  const quests: CampaignQuest[] = data.quests.map((quest) => ({
    id: quest.id,
    title: quest.title,
    status: quest.status as CampaignQuestStatus,
    locationId: quest.location,
    npcIds: quest.giver ? [quest.giver] : undefined,
    description: quest.description,
    dmNotes: quest.consequences,
    imageId: quest.image,
    tags: quest.tags,
  }));

  const enemies: CampaignEnemy[] = data.enemies.map((enemy) => ({
    id: enemy.id,
    title: enemy.name,
    baseMonster: enemy.baseMonsterName,
    ac: enemy.ac,
    hp: enemy.hp,
    tactics: undefined,
    imageId: enemy.image,
    tags: enemy.tags,
    locationIds: enemy.locationIds,
  }));

  const images: CampaignImage[] = data.images.map((img) => ({
    id: img.id,
    title: img.title,
    src: img.src,
    playerSafe: img.safeForPlayers,
  }));

  const factions: CampaignFaction[] = data.factions.map((f) => ({
    id: f.id,
    name: f.name,
    role: f.subtype,
    description: f.description,
    dmNotes: [f.goals, f.resources].filter(Boolean).join('\n\n') || undefined,
  }));

  const knownEntityTypes = new Set(['location', 'npc', 'quest', 'enemy', 'image']);
  const mapPlacements: CampaignMapPlacement[] = data.placements
    .filter((p) => p.mapId && p.entityId && knownEntityTypes.has(p.entityKind))
    .map((p) => ({
      id: p.id,
      mapId: p.mapId as string,
      entityType: p.entityKind as CampaignMapPlacement['entityType'],
      entityId: p.entityId as string,
      x: p.position.x,
      y: p.position.y,
      visibleToPlayers: p.visibleInPlayerView ?? false,
    }));

  // Block K — arcs: `data.timelines` is already the LIVE MERGED array (base
  // seed timelines + overlay newTimelines/timelinePatches applied) -- the
  // exact same materialization `useCampaignData()` produces for every other
  // section this adapter reads (`data.locations`, `data.npcs`, ...). No
  // separate merge step needed; `UserCampaignData.arcs` is literally the
  // same `Timeline[]` type Greyholm uses, so this is a direct passthrough.
  const arcs = data.timelines;

  // Block K — routes: MapRoute references two hotspots (not raw
  // coordinates) and a `mapStateId` (not a `mapId` directly) -- resolve both
  // via `data.hotspots`/`data.worldMapStates`, the same lookups
  // `mainCampaignAdapter.ts` uses for its own route mapping. Hotspot
  // coordinates are 0..1 normalized; `CampaignRoute.points` are 0..100
  // percentages (see this file's own header comment on userCampaign.ts) --
  // scaled by *100 here, the one real unit conversion this pass required.
  const hotspotsById = new Map(data.hotspots.map((h) => [h.id, h]));
  const mapStatesById = new Map(data.worldMapStates.map((s) => [s.id, s]));
  const routes: CampaignRoute[] = data.routes
    .map((route): CampaignRoute | null => {
      const mapState = mapStatesById.get(route.mapStateId);
      const from = hotspotsById.get(route.fromHotspotId);
      const to = hotspotsById.get(route.toHotspotId);
      if (!mapState || !from || !to) return null; // orphaned route, nothing stable to resolve
      const points = [{ x: from.x * 100, y: from.y * 100 }, ...(route.points ?? []).map((p) => ({ x: p.x * 100, y: p.y * 100 })), { x: to.x * 100, y: to.y * 100 }];
      return {
        id: route.id,
        title: route.label ?? `${from.label} — ${to.label}`,
        mapId: mapState.mapId,
        points,
        type: (route.routeType === 'street' || route.routeType === 'tunnel' || route.routeType === 'secret' || route.routeType === 'dangerous'
          ? 'custom'
          : (route.routeType ?? 'custom')) as CampaignRoute['type'],
        visibleToPlayers: route.visibleInPlayerView,
        notes: route.notes,
      };
    })
    .filter((r): r is CampaignRoute => r !== null);

  // Block K — zones: FactionZone lives entirely in the overlay (no seed
  // data), keyed by id -> object. Polygon is 0..1 normalized, same *100
  // conversion as routes above.
  const zones: CampaignZone[] = Object.values(overlay.factionZonesById ?? {}).map((zone) => ({
    id: zone.id,
    title: zone.name,
    mapId: zone.mapId ?? '',
    points: zone.polygon.map((p) => ({ x: p.x * 100, y: p.y * 100 })),
    color: zone.color,
    visibleToPlayers: zone.visibleInPlayerView ?? false,
    notes: zone.description,
  }));

  // Block K — party: `data.players` is Greyholm's DM Companion character
  // roster (DmPlayer[]) -- the same entity kind `CampaignPlayer` models for
  // Caldran. `level` is a free-text field on DmPlayer (unlike the numeric
  // CampaignPlayer.level); parsed defensively, never thrown on non-numeric text.
  const party: CampaignPlayer[] = data.players.map((player) => {
    const parsedLevel = Number(player.level);
    return {
      id: player.id,
      name: player.characterName,
      playerName: player.playerName,
      class: player.class,
      level: Number.isFinite(parsedLevel) && player.level.trim() !== '' ? parsedLevel : undefined,
      imageId: player.image || undefined,
      description: player.description,
      dmNotes: [player.dmNotes, player.dmSecrets].filter(Boolean).join('\n\n') || undefined,
    };
  });

  return {
    campaignId: GREYHOLM_EXPORT_SOURCE_ID,
    title: 'Greyholm (export)',
    type: 'campaign',
    baseMapId: data.worldMaps[0]?.id ?? '',
    mapIds: data.worldMaps.map((m) => m.id),
    regionIds: [],
    locations,
    npcs,
    quests,
    enemies,
    images,
    routes,
    zones,
    notes: [],
    party,
    factions,
    mapPlacements,
    capabilities: overlay.capabilities as UserCampaignData['capabilities'],
    arcs,
  };
}

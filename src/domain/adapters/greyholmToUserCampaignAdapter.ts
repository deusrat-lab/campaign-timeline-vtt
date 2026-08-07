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
 * Scope (see CONTINUATION_STATE.json for the precise coverage note): this
 * pass covers metadata + locations + npcs + quests + enemies + images +
 * factions + map placements — a meaningful, real subset of Greyholm's data,
 * not the full runtime (battles/calendar/economy/routes/zones/arcs are
 * deferred; Greyholm's own `mainCampaignAdapter.ts` already covers those for
 * other Block I purposes, but wiring them into this export is a follow-up).
 *
 * The result always gets a NEW campaignId distinct from Greyholm's own
 * `greyholm:main` identity — Greyholm itself is never "the" import target;
 * every import (via the existing `importUniversalApply` path) creates a
 * brand-new, isolated User Campaign. There is exactly one Greyholm.
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
  CampaignQuest,
  CampaignQuestStatus,
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
    routes: [],
    zones: [],
    notes: [],
    party: undefined,
    factions,
    mapPlacements,
    capabilities: overlay.capabilities as UserCampaignData['capabilities'],
  };
}

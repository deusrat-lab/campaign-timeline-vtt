/**
 * Non-destructive "update campaign from template".
 *
 * Given an existing campaign's data and a scenario template, this UPSERTS by
 * title/name: it fills in only MISSING fields (image, relation link, empty
 * description/notes/role) on matching entities, and ADDS scenario entities that
 * aren't present yet — it never deletes or overwrites the DM's existing content.
 * Safe to run repeatedly as the scenario grows over time.
 */
import type { UserCampaignData, CampaignImage, CampaignPlayer } from '../types/userCampaign';
import type { CampaignScenario } from './campaignScenarios';
import { CAMPAIGN_SCENARIOS } from './campaignScenarios';

const norm = (s: string) => s.trim().toLowerCase();
const hasDamageDice = (s?: string): boolean => !!s && /(?:\d+[кd]\d+|\d+;\s*\d+к\d+)/i.test(s);
const OBSOLETE_ENEMY_IMAGE_NEEDLES: Record<string, string[]> = {
  'Рой прибрежных скребней': ['enemy/cliff-crab.jpg'],
  'Канатный клещ': ['enemy/cave-scrapers-swarm.jpg'],
  'Камнерогий баран': ['enemy/stonebeak.jpg'],
  'Канальный хищник': ['enemy/salt-ray.jpg'],
  'Ветропыльный шакал': ['enemy/plateau-wolf.jpg'],
  'Железоедный слизень': ['enemy/slag-crawler.jpg'],
  'Рой кузнечных клещей': ['enemy/cave-scrapers-swarm.jpg'],
  'Дымная моль': ['enemy/moth-of-quiet-sleep.jpg'],
  'Восковой жук-печатник': ['enemy/ink-guardian.jpg'],
  'Террасный камнепёс': ['enemy/oathbound-gargoyle-guardian.jpg'],
  'Бескрылый дракончик': ['enemy/young-wyvern.jpg'],
  'Буревой змей': ['enemy/cloud-ray.jpg'],
  'Страж Камней Договора': ['enemy/treaty-keeper-winged-bone.jpg'],
};

const shouldReplaceScenarioEnemyImage = (title: string, currentSrc?: string, nextSrc?: string): boolean => {
  if (!currentSrc || !nextSrc || currentSrc === nextSrc) return false;
  if (currentSrc.includes('/scenarios/caldran-captivity/house/forces/')) return true;
  return (OBSOLETE_ENEMY_IMAGE_NEEDLES[title] ?? []).some((needle) => currentSrc.includes(needle));
};

/** The scenario whose base map matches this campaign (used for the upgrade). */
export function scenarioForCampaign(data: Pick<UserCampaignData, 'baseMapId'>): CampaignScenario | undefined {
  return CAMPAIGN_SCENARIOS.find((s) => s.baseMapId === data.baseMapId);
}

export interface MergeResult { data: UserCampaignData; added: { locations: number; npcs: number; enemies: number; factions: number; players: number }; imagesAttached: number }

const fillMissingPlayerFields = (target: CampaignPlayer, source: Omit<CampaignPlayer, 'id'>) => {
  const next = target as CampaignPlayer & Record<string, unknown>;
  const src = source as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    if (key === 'name') continue;
    const current = next[key];
    if (current == null || current === '' || (Array.isArray(current) && current.length === 0)) next[key] = src[key];
  }
};

export function mergeScenarioIntoData(data: UserCampaignData, scenario: CampaignScenario, uid: (p: string) => string): MergeResult {
  const images: CampaignImage[] = [...data.images];
  let imagesAttached = 0;
  const mkImage = (title: string, src?: string): string | undefined => {
    if (!src) return undefined;
    // Reuse an identical src already present rather than duplicating.
    const existing = images.find((im) => im.src === src);
    if (existing) return existing.id;
    const id = uid('img');
    images.push({ id, title, src });
    imagesAttached += 1;
    return id;
  };
  const imageSrcById = (imageId?: string): string | undefined => images.find((im) => im.id === imageId)?.src;

  const added = { locations: 0, npcs: 0, enemies: 0, factions: 0, players: 0 };

  // ── Locations (match by title) — build scenario key → resulting id map ──
  const locations = [...data.locations];
  const keyToLocId: Record<string, string> = {};
  for (const sl of scenario.locations) {
    const ex = locations.find((l) => norm(l.title) === norm(sl.title));
    if (ex) {
      if (!ex.imageId && sl.image) ex.imageId = mkImage(sl.title, sl.image);
      if (!ex.description && sl.description) ex.description = sl.description;
      if (!ex.dmNotes && sl.dmNotes) ex.dmNotes = sl.dmNotes;
      if ((!ex.tags || ex.tags.length === 0) && sl.type) ex.tags = [sl.type];
      if (sl.key) keyToLocId[sl.key] = ex.id;
    } else {
      const id = uid('loc');
      locations.push({ id, title: sl.title, description: sl.description, dmNotes: sl.dmNotes, imageId: mkImage(sl.title, sl.image), tags: sl.type ? [sl.type] : undefined });
      if (sl.key) keyToLocId[sl.key] = id;
      added.locations += 1;
    }
  }

  // ── NPCs (match by name) ──
  const npcs = [...data.npcs];
  for (const sn of scenario.npcs) {
    const locId = sn.locationKey ? keyToLocId[sn.locationKey] : undefined;
    const ex = npcs.find((n) => norm(n.name) === norm(sn.name));
    if (ex) {
      if (!ex.imageId && sn.image) ex.imageId = mkImage(sn.name, sn.image);
      if (!ex.locationId && locId) ex.locationId = locId;
      if (!ex.role && sn.role) ex.role = sn.role;
      if (!ex.description && sn.description) ex.description = sn.description;
      if (!ex.dmNotes && sn.dmNotes) ex.dmNotes = sn.dmNotes;
    } else {
      npcs.push({ id: uid('npc'), name: sn.name, role: sn.role, description: sn.description, dmNotes: sn.dmNotes, imageId: mkImage(sn.name, sn.image), locationId: locId });
      added.npcs += 1;
    }
  }

  // ── Enemies (match by title) ──
  const enemies = [...data.enemies];
  for (const se of scenario.enemies) {
    const locIds = (se.locationKeys ?? []).map((k) => keyToLocId[k]).filter(Boolean) as string[];
    const ex = enemies.find((e) => norm(e.title) === norm(se.title));
    if (ex) {
      if ((!ex.imageId || shouldReplaceScenarioEnemyImage(se.title, imageSrcById(ex.imageId), se.image)) && se.image) ex.imageId = mkImage(se.title, se.image);
      if ((!ex.locationIds || ex.locationIds.length === 0) && locIds.length) ex.locationIds = locIds;
      if (ex.ac == null && se.ac != null) ex.ac = se.ac;
      if (ex.hp == null && se.hp != null) ex.hp = se.hp;
      if (!ex.description && se.description) ex.description = se.description;
      else if (se.description && hasDamageDice(se.description) && !hasDamageDice(ex.description)) ex.description = se.description;
      if (!ex.tactics && se.dmNotes) ex.tactics = se.dmNotes;
    } else {
      enemies.push({ id: uid('emy'), title: se.title, ac: se.ac, hp: se.hp, description: se.description, tactics: se.dmNotes, imageId: mkImage(se.title, se.image), locationIds: locIds });
      added.enemies += 1;
    }
  }

  // ── Factions (match by name) ──
  const factions = [...(data.factions ?? [])];
  for (const sf of scenario.factions) {
    const ex = factions.find((f) => norm(f.name) === norm(sf.name));
    if (ex) {
      if (!ex.imageId && sf.image) ex.imageId = mkImage(sf.name, sf.image);
      if (!ex.role && sf.role) ex.role = sf.role;
      if (!ex.description && sf.description) ex.description = sf.description;
    } else {
      factions.push({ id: uid('fac'), name: sf.name, role: sf.role, description: sf.description, attitude: 'neutral', imageId: mkImage(sf.name, sf.image) });
      added.factions += 1;
    }
  }

  // ── Party / player character sheets (match by name) ──
  const party = [...(data.party ?? [])];
  for (const sp of scenario.players ?? []) {
    const ex = party.find((p) => norm(p.name) === norm(sp.name));
    if (ex) {
      fillMissingPlayerFields(ex, sp);
    } else {
      party.push({ ...sp, id: uid('pc') });
      added.players += 1;
    }
  }

  // ── Quests (scenes / encounter packs — match by title) ──
  const quests = [...data.quests];
  for (const sq of scenario.quests) {
    const locId = sq.locationKey ? keyToLocId[sq.locationKey] : undefined;
    const legacyTitles = sq.legacyTitles ?? [];
    const ex = quests.find((q) => norm(q.title) === norm(sq.title) || legacyTitles.some((t) => norm(q.title) === norm(t)));
    if (ex) {
      if (norm(ex.title) !== norm(sq.title)) ex.title = sq.title;
      if (!ex.locationId && locId) ex.locationId = locId;
      if (!ex.description && sq.description) ex.description = sq.description;
      if (!ex.dmNotes && sq.dmNotes) ex.dmNotes = sq.dmNotes;
      if (!ex.imageId && sq.image) ex.imageId = mkImage(sq.title, sq.image);
    } else {
      quests.push({ id: uid('qst'), title: sq.title, status: (sq.status as (typeof quests)[number]['status']) ?? 'notStarted', description: sq.description, dmNotes: sq.dmNotes, locationId: locId, imageId: mkImage(sq.title, sq.image) });
    }
  }

  for (const simg of scenario.images ?? []) {
    mkImage(simg.title, simg.src);
  }

  // ── Map placements + canonical route (match by entity id / route title) ──
  const mapPlacements = [...data.mapPlacements];
  scenario.locations
    .forEach((sl) => {
      const entityId = keyToLocId[sl.key];
      if (!entityId || sl.x == null || sl.y == null) return;
      if (!mapPlacements.some((mp) => mp.mapId === scenario.baseMapId && mp.entityType === 'location' && mp.entityId === entityId)) {
        mapPlacements.push({
          id: uid('pin'),
          mapId: scenario.baseMapId,
          entityType: 'location',
          entityId,
          x: sl.x,
          y: sl.y,
          visibleToPlayers: false,
        });
      }
    });

  // The DM requested route drawing to be manual. Remove the old template route
  // if it exists, but leave every custom/manual route untouched.
  const routes = data.routes.filter((r) => !(r.mapId === scenario.baseMapId && norm(r.title) === norm('Маршрут: Цена имени')));

  return { data: { ...data, locations, npcs, enemies, factions, quests, party, images, mapPlacements, routes }, added, imagesAttached };
}

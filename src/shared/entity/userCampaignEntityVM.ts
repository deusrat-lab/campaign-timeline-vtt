/**
 * Maps a new (user) campaign's data into the neutral entity view-models the
 * shared components consume. This is the new-campaign side of the "single UI
 * contract, per-campaign data" boundary — it reads ONLY the passed-in
 * UserCampaignData (already scoped to one campaignId by the store), never any
 * global/main-campaign data, so campaigns stay isolated.
 */
import type { UserCampaignData } from '../../types/userCampaign';
import type { EntityDetailVM, EntityListItemVM, EntityKind, EntityRelationLink } from './types';

export type LibraryKind = 'npc' | 'locations' | 'quests' | 'enemies' | 'players' | 'factions';

const KIND_ENTITY: Record<LibraryKind, EntityKind> = {
  npc: 'npc', locations: 'location', quests: 'quest', enemies: 'enemy', players: 'party', factions: 'faction',
};
const KIND_LABEL: Record<EntityKind, string> = {
  location: 'Локация', npc: 'NPC', quest: 'Квест', enemy: 'Враг', faction: 'Фракция', party: 'Игрок', image: 'Картинка',
};

export interface VMOpts {
  imageUrl: (imageId?: string) => string | undefined;
  onOpen: (kind: LibraryKind, id: string) => void;
  isPlaced: (entityType: EntityKind, id: string) => boolean;
  isRevealed: (id: string) => boolean;
  match: (s: string) => boolean; // search predicate
  isPlayer: boolean;
}

function locName(data: UserCampaignData, id?: string): string | undefined {
  return id ? data.locations.find((l) => l.id === id)?.title : undefined;
}

function locRelation(data: UserCampaignData, o: VMOpts, id: string): EntityRelationLink | undefined {
  const l = data.locations.find((x) => x.id === id);
  if (!l) return undefined;
  return {
    id: l.id,
    label: l.title,
    subtitle: l.tags?.join(' · '),
    imageUrl: o.imageUrl(l.imageId),
    onOpen: () => o.onOpen('locations', l.id),
  };
}

export function buildListItems(kind: LibraryKind, data: UserCampaignData, o: VMOpts): EntityListItemVM[] {
  const et = KIND_ENTITY[kind];
  const wrap = (id: string, title: string, subtitle?: string, imageId?: string): EntityListItemVM =>
    ({ id, title, subtitle, imageUrl: o.imageUrl(imageId), placed: o.isPlaced(et, id), revealed: o.isRevealed(id) });
  switch (kind) {
    case 'locations': return data.locations.filter((l) => o.match(l.title)).map((l) => wrap(l.id, l.title, l.tags?.join(' · '), l.imageId));
    case 'npc': return data.npcs.filter((n) => o.match(n.name)).map((n) => wrap(n.id, n.name, [n.role, locName(data, n.locationId)].filter(Boolean).join(' · '), n.imageId));
    case 'quests': return data.quests.filter((q) => o.match(q.title) && (!o.isPlayer || q.status !== 'hidden')).map((q) => wrap(q.id, q.title, q.status, q.imageId));
    case 'enemies': return data.enemies.filter((e) => o.match(e.title)).map((e) => wrap(e.id, e.title, e.hp ? `HP ${e.hp}` : e.baseMonster, e.imageId));
    case 'players': return (data.party ?? []).filter((p) => o.match(p.name)).map((p) => wrap(p.id, p.name, [p.class, p.level ? `ур. ${p.level}` : ''].filter(Boolean).join(' · ')));
    case 'factions': return (data.factions ?? []).filter((f) => o.match(f.name)).map((f) => wrap(f.id, f.name, [f.role, f.attitude].filter(Boolean).join(' · '), f.imageId));
  }
}

export function buildDetail(kind: LibraryKind, id: string, data: UserCampaignData, o: VMOpts): EntityDetailVM | null {
  const et = KIND_ENTITY[kind];
  const base = (title: string): EntityDetailVM => ({ id, kind: et, kindLabel: KIND_LABEL[et], title });

  if (kind === 'locations') {
    const l = data.locations.find((x) => x.id === id); if (!l) return null;
    const npcs = data.npcs.filter((n) => n.locationId === l.id && (!o.isPlayer || o.isRevealed(n.id)));
    const quests = data.quests.filter((q) => q.locationId === l.id && (!o.isPlayer || (q.status !== 'hidden' && o.isRevealed(q.id))));
    const enemies = data.enemies.filter((e) => e.locationIds?.includes(l.id) && (!o.isPlayer || o.isRevealed(e.id)));
    const images = data.images.filter((im) => im.id === l.imageId);
    return {
      ...base(l.title), subtitle: undefined, imageUrl: o.imageUrl(l.imageId), description: l.description,
      dmNotes: l.dmNotes, tags: l.tags,
      counters: [
        { key: 'npc', label: 'NPC', value: npcs.length },
        { key: 'quests', label: 'Квесты', value: quests.length },
        { key: 'enemies', label: 'Враги', value: enemies.length },
        { key: 'images', label: 'Изображения', value: images.length },
      ],
      relations: [
        {
          key: 'npc',
          label: 'NPC',
          items: npcs.map((n) => ({
            id: n.id,
            label: n.name,
            subtitle: n.role,
            imageUrl: o.imageUrl(n.imageId),
            onOpen: () => o.onOpen('npc', n.id),
          })),
        },
        {
          key: 'quests',
          label: 'Квесты',
          items: quests.map((q) => ({
            id: q.id,
            label: q.title,
            subtitle: q.status,
            meta: locName(data, q.locationId),
            imageUrl: o.imageUrl(q.imageId),
            onOpen: () => o.onOpen('quests', q.id),
          })),
        },
        {
          key: 'enemies',
          label: 'Враги',
          items: enemies.map((e) => ({
            id: e.id,
            label: e.title,
            subtitle: [e.baseMonster, e.ac != null ? `AC ${e.ac}` : '', e.hp != null ? `HP ${e.hp}` : ''].filter(Boolean).join(' · '),
            imageUrl: o.imageUrl(e.imageId),
            onOpen: () => o.onOpen('enemies', e.id),
          })),
        },
      ],
    };
  }
  if (kind === 'npc') {
    const n = data.npcs.find((x) => x.id === id); if (!n) return null;
    const quests = data.quests.filter((q) => q.npcIds?.includes(n.id) && (!o.isPlayer || (q.status !== 'hidden' && o.isRevealed(q.id))));
    const location = n.locationId && (!o.isPlayer || o.isRevealed(n.locationId)) ? locRelation(data, o, n.locationId) : undefined;
    return {
      ...base(n.name), subtitle: n.role, imageUrl: o.imageUrl(n.imageId), description: n.description, dmNotes: n.dmNotes, tags: n.tags,
      fields: [{ label: 'Локация', value: locName(data, n.locationId) ?? '—' }],
      relations: [
        { key: 'loc', label: 'Локация', items: location ? [location] : [] },
        {
          key: 'quests',
          label: 'Связанные квесты',
          items: quests.map((q) => ({
            id: q.id,
            label: q.title,
            subtitle: q.status,
            meta: locName(data, q.locationId),
            imageUrl: o.imageUrl(q.imageId),
            onOpen: () => o.onOpen('quests', q.id),
          })),
        },
      ],
    };
  }
  if (kind === 'quests') {
    const q = data.quests.find((x) => x.id === id); if (!q) return null;
    const npcs = data.npcs.filter((n) => q.npcIds?.includes(n.id) && (!o.isPlayer || o.isRevealed(n.id)));
    const location = q.locationId && (!o.isPlayer || o.isRevealed(q.locationId)) ? locRelation(data, o, q.locationId) : undefined;
    return {
      ...base(q.title), subtitle: q.status, description: q.description, dmNotes: q.dmNotes, tags: q.tags,
      imageUrl: o.imageUrl(q.imageId),
      fields: [{ label: 'Статус', value: q.status }, { label: 'Локация', value: locName(data, q.locationId) ?? '—' }],
      relations: [
        { key: 'loc', label: 'Локация', items: location ? [location] : [] },
        {
          key: 'npc',
          label: 'Участники (NPC)',
          items: npcs.map((n) => ({
            id: n.id,
            label: n.name,
            subtitle: n.role,
            imageUrl: o.imageUrl(n.imageId),
            onOpen: () => o.onOpen('npc', n.id),
          })),
        },
      ],
    };
  }
  if (kind === 'enemies') {
    const e = data.enemies.find((x) => x.id === id); if (!e) return null;
    const locs = (e.locationIds ?? []).filter((lid) => !o.isPlayer || o.isRevealed(lid)).map((lid) => data.locations.find((l) => l.id === lid)).filter(Boolean) as typeof data.locations;
    return {
      ...base(e.title), subtitle: e.baseMonster, imageUrl: o.imageUrl(e.imageId), description: e.description, dmNotes: e.tactics, tags: e.tags,
      fields: [{ label: 'AC', value: String(e.ac ?? '—') }, { label: 'HP', value: String(e.hp ?? '—') }],
      relations: [{
        key: 'locs',
        label: 'Локации',
        items: locs.map((l) => ({
          id: l.id,
          label: l.title,
          subtitle: l.tags?.join(' · '),
          imageUrl: o.imageUrl(l.imageId),
          onOpen: () => o.onOpen('locations', l.id),
        })),
      }],
    };
  }
  if (kind === 'players') {
    const p = (data.party ?? []).find((x) => x.id === id); if (!p) return null;
    return {
      ...base(p.name), subtitle: [p.class, p.level ? `ур. ${p.level}` : ''].filter(Boolean).join(' · '), description: p.description, dmNotes: p.dmNotes,
      fields: [{ label: 'Игрок', value: p.playerName ?? '—' }, { label: 'AC', value: String(p.ac ?? '—') }, { label: 'HP', value: p.hp != null ? `${p.hp}${p.maxHp ? '/' + p.maxHp : ''}` : '—' }],
    };
  }
  if (kind === 'factions') {
    const f = (data.factions ?? []).find((x) => x.id === id); if (!f) return null;
    return { ...base(f.name), subtitle: f.role, imageUrl: o.imageUrl(f.imageId), description: f.description, dmNotes: f.dmNotes, fields: [{ label: 'Отношение', value: f.attitude ?? '—' }] };
  }
  return null;
}

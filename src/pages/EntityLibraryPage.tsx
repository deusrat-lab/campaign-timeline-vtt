import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { effectiveQuestStatus } from '../data/selectors';
import type { CampaignData } from '../data/loadCampaignData';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import type { QuestStatus } from '../types';
import type { DmCustomEnemy, DmFaction, DmLocation, DmNpc, DmPlayer, DmQuest } from '../types/dmCompanion';
import { CompanionEnemyCard } from '../features/embedded-dm-companion/CompanionEnemyCard';
import { CompanionLocationCard } from '../features/embedded-dm-companion/CompanionLocationCard';
import { CompanionNpcCard } from '../features/embedded-dm-companion/CompanionNpcCard';
import { CompanionQuestCard } from '../features/embedded-dm-companion/CompanionQuestCard';
import { BATTLE_MAP_ASSET_ORIGIN } from '../config';
import type { BattleMapManifestEntry } from '../data/battleMapManifest';

export type EntityLibraryKind = 'npc' | 'quests' | 'enemies' | 'bestiary' | 'players' | 'battleMaps' | 'factions';
type EntitySortKey = 'name_asc' | 'name_desc' | 'location' | 'status' | 'role';

const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: 'Активен',
  completed: 'Завершён',
  failed: 'Провален',
  hidden: 'Скрыт',
};

function safeText(value: unknown): string {
  return typeof value === 'string' ? value : value === undefined || value === null ? '' : String(value);
}

function safeQuestStatus(value: unknown): QuestStatus {
  return value === 'active' || value === 'completed' || value === 'failed' || value === 'hidden'
    ? value
    : 'hidden';
}

function effectiveSafeQuestStatus(quest: Pick<DmQuest, 'id' | 'status'>, store: ReturnType<typeof useCampaignStore>): QuestStatus {
  return effectiveQuestStatus(quest.id, safeQuestStatus(quest.status), store.progress);
}

interface BestiaryMonsterAction {
  name: string;
  description?: string;
  toHit?: string;
  damage?: string;
  condition?: string;
  recharge?: string;
}

interface BestiaryMonster {
  id: string;
  nameRu: string;
  nameEn?: string;
  altName?: string;
  sourceBook?: string;
  sourcePage?: string;
  size?: string;
  type?: string;
  creatureType?: string;
  alignment?: string;
  cr?: string;
  xp?: number;
  ac?: number;
  hp?: number;
  hitDice?: string;
  speed?: string;
  abilityScores?: { str?: number; dex?: number; con?: number; int?: number; wis?: number; cha?: number };
  savingThrows?: string[];
  skills?: string[];
  vulnerabilities?: string[];
  resistances?: string[];
  immunities?: string[];
  conditionImmunities?: string[];
  senses?: string;
  passivePerception?: number;
  languages?: string;
  actions?: BestiaryMonsterAction[];
  features?: BestiaryMonsterAction[];
  traits?: BestiaryMonsterAction[];
  reactions?: BestiaryMonsterAction[];
  legendaryActions?: BestiaryMonsterAction[];
  description?: string;
  notes?: string;
  tags?: string[];
  imageUrl?: string;
  customImages?: string[];
}

function getEntityTitle(item: DmNpc | DmQuest | DmCustomEnemy | DmPlayer): string {
  if ('title' in item) return safeText(item.title) || item.id;
  if ('characterName' in item) return safeText(item.characterName) || item.id;
  return safeText(item.name) || item.id;
}

type FactionTaggedEntity = {
  faction?: string;
  primaryFactionId?: string;
  factionIds?: string[];
};

function getEntityFactionKeys(item: FactionTaggedEntity): string[] {
  return Array.from(new Set([...(item.factionIds ?? []), item.primaryFactionId, item.faction].filter(Boolean) as string[]));
}

function getFactionLabel(data: CampaignData, key: string): string {
  const faction = data.factions.find((f) => f.id === key || f.name === key || f.shortName === key);
  return faction?.shortName ?? faction?.name ?? key;
}

function getFactionSummary(data: CampaignData, item: FactionTaggedEntity): string {
  return getEntityFactionKeys(item).map((key) => getFactionLabel(data, key)).join(', ');
}

function matchesFaction(item: FactionTaggedEntity, filter: string): boolean {
  return filter === 'all' || getEntityFactionKeys(item).includes(filter);
}

function buildFactionOptions<T extends FactionTaggedEntity>(
  data: CampaignData,
  items: T[],
): { id: string; name: string }[] {
  const ids = new Set<string>();
  for (const item of items) {
    for (const key of getEntityFactionKeys(item)) ids.add(key);
  }
  return Array.from(ids)
    .map((id) => ({ id, name: getFactionLabel(data, id) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

function imageSrcFromId(data: CampaignData, imageId?: string): string | undefined {
  if (!imageId) return undefined;
  if (imageId.startsWith('/') || imageId.startsWith('http') || imageId.startsWith('data:')) return imageId;
  const img = data.images.find((candidate) => candidate.id === imageId);
  return img?.thumbnailSrc ?? img?.src;
}

function locationThumbnail(data: CampaignData, location: DmLocation): string | undefined {
  return imageSrcFromId(data, location.images?.[0]);
}

function entityThumbnail(data: CampaignData, item: DmNpc | DmQuest | DmCustomEnemy | DmPlayer): string | undefined {
  if ('characterName' in item) return imageSrcFromId(data, item.image) ?? item.image;
  if ('image' in item) return imageSrcFromId(data, item.image) ?? item.image;
  return undefined;
}

function entityInitials(title: string): string {
  return title
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

function ImagePickerField({
  value,
  data,
  onChange,
}: {
  value: string;
  data: CampaignData;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Изображение
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">Нет изображения</option>
        {data.images.map((image) => (
          <option key={image.id} value={image.id}>{image.title}</option>
        ))}
      </select>
      <input
        type="file"
        accept="image/*"
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          if (!file) return;
          const reader = new FileReader();
          reader.onload = () => {
            if (typeof reader.result === 'string') onChange(reader.result);
          };
          reader.readAsDataURL(file);
          e.currentTarget.value = '';
        }}
      />
    </label>
  );
}

function isLocationPlaced(data: CampaignData, timelineId: string, locationId: string): boolean {
  const stateIds = new Set(data.locationStates.filter((state) => state.timelineId === timelineId && state.locationId === locationId).map((state) => state.id));
  return data.hotspots.some((hotspot) => stateIds.has(hotspot.locationStateId));
}

function entityPlacementLabel(
  data: CampaignData,
  timelineId: string,
  kind: EntityLibraryKind | 'location',
  item: DmNpc | DmQuest | DmCustomEnemy | DmPlayer | DmLocation,
): string | null {
  if (kind === 'players') return null;
  if (kind === 'location') {
    return isLocationPlaced(data, timelineId, (item as DmLocation).id) ? 'Размещено' : 'Не размещено';
  }
  const matchingLocationState = data.locationStates.find((state) => {
    if (state.timelineId !== timelineId) return false;
    if (kind === 'npc') return state.npcIds.includes(item.id) || (item as DmNpc).location === state.locationId;
    if (kind === 'quests') return state.questIds.includes(item.id) || (item as DmQuest).location === state.locationId;
    if (kind === 'enemies') return state.enemyIds.includes(item.id) || ((item as DmCustomEnemy).locationIds ?? []).includes(state.locationId);
    return false;
  });
  if (!matchingLocationState) return 'Не размещено';
  return data.hotspots.some((hotspot) => hotspot.locationStateId === matchingLocationState.id)
    ? 'Размещено'
    : 'Локация не на карте';
}

function normalizePlaceText(value?: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/№/g, 'no')
    .replace(/[^a-zа-я0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function locationNameParts(location: DmLocation): string[] {
  return [location.name, ...(location.aliases ?? [])]
    .flatMap((value) => String(value ?? '').split(/[\/|]/g))
    .map(normalizePlaceText)
    .filter((value) => value.length >= 4);
}

function locationsAreSamePlace(a: DmLocation, b: DmLocation): boolean {
  if (a.id === b.id) return true;
  const aParts = locationNameParts(a);
  const bParts = locationNameParts(b);
  return aParts.some((aPart) => bParts.some((bPart) => aPart === bPart || aPart.includes(bPart) || bPart.includes(aPart)));
}

function canonicalArcLocation(location: DmLocation, locations: DmLocation[]): DmLocation {
  if ((location.arcId ?? 'arc-1') !== 'arc-2') return location;
  return locations.find((candidate) => (candidate.arcId ?? 'arc-1') === 'arc-1' && locationsAreSamePlace(candidate, location)) ?? location;
}

function FilterChips({
  label,
  value,
  options,
  onChange,
}: {
  label?: string;
  value: string;
  options: { id: string; name: string; count?: number }[];
  onChange: (value: string) => void;
}) {
  return (
    <div className="entity-filter-chips" aria-label={label}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={value === option.id ? 'active' : ''}
          onClick={() => onChange(option.id)}
        >
          {option.name}{typeof option.count === 'number' ? ` ${option.count}` : ''}
        </button>
      ))}
    </div>
  );
}

function sortEntities<T extends DmNpc | DmQuest | DmCustomEnemy | DmPlayer>(
  items: T[],
  sortKey: EntitySortKey,
  data: CampaignData,
  store: ReturnType<typeof useCampaignStore>,
): T[] {
  return [...items].sort((a, b) => {
    if (sortKey === 'name_desc') return getEntityTitle(b).localeCompare(getEntityTitle(a), 'ru');
    if (sortKey === 'location') {
      const aLocId = 'location' in a ? a.location : undefined;
      const bLocId = 'location' in b ? b.location : undefined;
      const aLoc = data.locations.find((loc) => loc.id === aLocId)?.name ?? safeText(aLocId);
      const bLoc = data.locations.find((loc) => loc.id === bLocId)?.name ?? safeText(bLocId);
      return aLoc.localeCompare(bLoc, 'ru') || getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru');
    }
    if (sortKey === 'status') {
      const aStatus = 'status' in a ? effectiveSafeQuestStatus(a, store) : '';
      const bStatus = 'status' in b ? effectiveSafeQuestStatus(b, store) : '';
      return aStatus.localeCompare(bStatus, 'ru') || getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru');
    }
    if (sortKey === 'role') {
      const aRole = 'role' in a ? safeText(a.role) : '';
      const bRole = 'role' in b ? safeText(b.role) : '';
      return aRole.localeCompare(bRole, 'ru') || getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru');
    }
    return getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru');
  });
}

export function EntityLibraryPage({ kind }: { kind: EntityLibraryKind }) {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');
  const [questStatusFilter, setQuestStatusFilter] = useState<QuestStatus | 'all'>('all');
  const [questFactionFilter, setQuestFactionFilter] = useState('all');
  const [npcLocationFilter, setNpcLocationFilter] = useState('all');
  const [npcRoleFilter, setNpcRoleFilter] = useState('all');
  const [npcFactionFilter, setNpcFactionFilter] = useState('all');
  const [enemyRoleFilter, setEnemyRoleFilter] = useState('all');
  const [enemyLocationFilter, setEnemyLocationFilter] = useState('all');
  const [enemyQuestFilter, setEnemyQuestFilter] = useState('all');
  const [enemyFactionFilter, setEnemyFactionFilter] = useState('all');
  const [enemyCrFilter, setEnemyCrFilter] = useState('all');
  const [enemyTagFilter, setEnemyTagFilter] = useState('all');
  const [sortKey, setSortKey] = useState<EntitySortKey>('name_asc');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [inlineEnemyEditId, setInlineEnemyEditId] = useState<string | null>(null);

  const timeline = data?.timelines.find((t) => t.id === store.currentTimelineId) ?? data?.timelines[0];
  const arcId = timeline?.arcId ?? 'arc-1';
  const q = search.trim().toLowerCase();
  const npcLocationOptions = useMemo(() => {
    if (!data) return [];
    if (kind === 'battleMaps') return [];
	    const ids = new Set(
	      data.npcs
	        .filter((n) => (n.arcId ?? 'arc-1') === arcId)
	        .map((n) => n.location)
	        .filter((location): location is string => Boolean(location)),
	    );
    return Array.from(ids)
      .map((id) => ({ id, name: data.locations.find((loc) => loc.id === id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [arcId, data]);
  const npcRoleOptions = useMemo(() => {
    if (!data) return [];
	    return Array.from(new Set(data.npcs.filter((n) => (n.arcId ?? 'arc-1') === arcId).map((n) => n.role).filter((role): role is string => Boolean(role)))).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [arcId, data]);
  const npcFactionOptions = useMemo(() => {
    if (!data) return [];
    return buildFactionOptions(data, data.npcs.filter((n) => (n.arcId ?? 'arc-1') === arcId));
  }, [arcId, data]);
  const questFactionOptions = useMemo(() => {
    if (!data) return [];
    return buildFactionOptions(data, data.quests.filter((quest) => (quest.arcId ?? 'arc-1') === arcId));
  }, [arcId, data]);
  const enemyRoleOptions = useMemo(() => {
    if (!data) return [];
	    return Array.from(new Set(data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId).map((enemy) => enemy.role).filter((role): role is string => Boolean(role)))).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [arcId, data]);
  const enemyLocationOptions = useMemo(() => {
    if (!data) return [];
    const enemiesForArc = data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId);
    const ids = new Set(enemiesForArc.flatMap((enemy) => enemy.locationIds ?? []));
    return Array.from(ids)
      .map((id) => ({ id, name: data.locations.find((loc) => loc.id === id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [arcId, data]);
  const enemyQuestOptions = useMemo(() => {
    if (!data) return [];
    const enemiesForArc = data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId);
    const ids = new Set(enemiesForArc.flatMap((enemy) => enemy.questIds ?? []));
    return Array.from(ids)
      .map((id) => ({ id, title: data.quests.find((quest) => quest.id === id)?.title ?? id }))
      .sort((a, b) => safeText(a.title).localeCompare(safeText(b.title), 'ru'));
  }, [arcId, data]);
  const enemyFactionOptions = useMemo(() => {
    if (!data) return [];
    return buildFactionOptions(data, data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId));
  }, [arcId, data]);
  const enemyCrOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId).map((enemy) => enemy.cr).filter((cr): cr is string => Boolean(cr)))).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  }, [arcId, data]);
  const enemyTagOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId).flatMap((enemy) => enemy.tags ?? []))).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [arcId, data]);

  const items = useMemo(() => {
    if (!data) return [];
    if (kind === 'npc') {
      return sortEntities(data.npcs
        .filter((n) => (n.arcId ?? 'arc-1') === arcId)
        .filter((n) => matchesFaction(n, npcFactionFilter))
        .filter((n) => npcLocationFilter === 'all' || n.location === npcLocationFilter)
        .filter((n) => npcRoleFilter === 'all' || n.role === npcRoleFilter)
        .filter((n) => !q || [n.name, n.role, n.race, n.faction, getFactionSummary(data, n), n.location].some((v) => safeText(v).toLowerCase().includes(q))), sortKey, data, store);
    }
    if (kind === 'quests') {
      return sortEntities(data.quests
        .filter((quest) => (quest.arcId ?? 'arc-1') === arcId)
        .filter((quest) => matchesFaction(quest, questFactionFilter))
        .filter((quest) => questStatusFilter === 'all' || effectiveSafeQuestStatus(quest, store) === questStatusFilter)
        .filter((quest) => !q || [quest.title, quest.goal, quest.description, quest.reward, quest.proof, quest.consequences, quest.notes, getFactionSummary(data, quest), quest.location]
          .some((v) => safeText(v).toLowerCase().includes(q))), sortKey, data, store);
    }
    if (kind === 'players') {
      return sortEntities(data.players
        .filter((player) => !q || [player.characterName, player.playerName, player.race, player.class, player.description, player.dmNotes].some((v) => safeText(v).toLowerCase().includes(q))), sortKey, data, store);
    }
    return sortEntities(data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId)
      .filter((enemy) => enemyRoleFilter === 'all' || enemy.role === enemyRoleFilter)
      .filter((enemy) => enemyLocationFilter === 'all' || (enemy.locationIds ?? []).includes(enemyLocationFilter))
      .filter((enemy) => enemyQuestFilter === 'all' || (enemy.questIds ?? []).includes(enemyQuestFilter))
      .filter((enemy) => matchesFaction(enemy, enemyFactionFilter))
      .filter((enemy) => enemyCrFilter === 'all' || enemy.cr === enemyCrFilter)
      .filter((enemy) => enemyTagFilter === 'all' || (enemy.tags ?? []).includes(enemyTagFilter))
      .filter((enemy) => !q || [enemy.name, enemy.role, enemy.faction, getFactionSummary(data, enemy), enemy.cr, enemy.baseMonsterName, ...(enemy.tags ?? [])].some((v) => safeText(v).toLowerCase().includes(q))), sortKey, data, store);
  }, [arcId, data, enemyCrFilter, enemyFactionFilter, enemyLocationFilter, enemyQuestFilter, enemyRoleFilter, enemyTagFilter, kind, npcFactionFilter, npcLocationFilter, npcRoleFilter, q, questFactionFilter, questStatusFilter, sortKey, store]);

  useEffect(() => {
    const idFromUrl = new URLSearchParams(location.search).get('selected');
    if (!idFromUrl || idFromUrl === selectedId) return;
    if (items.some((item) => item.id === idFromUrl)) {
      setSelectedId(idFromUrl);
      setEditing(false);
      setInlineEnemyEditId(null);
    }
  }, [items, location.search, selectedId]);

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(null);
      setEditing(false);
      setInlineEnemyEditId(null);
    }
  }, [items, selectedId]);

  if (loading) return <p className="page">Загрузка…</p>;
  if (error || !data) return <p className="page">Ошибка загрузки: {error}</p>;
  if (kind === 'bestiary') return <BestiaryEntityLibraryPage arcId={arcId} timelineTitle={timeline?.title ?? ''} />;
  if (kind === 'battleMaps') return <BattleMapsEntityLibraryPage data={data} arcId={arcId} />;
  if (kind === 'factions') return <FactionEntityLibraryPage data={data} arcId={arcId} timelineTitle={timeline?.title ?? ''} />;

  const selected = (selectedId ? items.find((item) => item.id === selectedId) : items[0]) ?? null;
  const title = kind === 'npc' ? 'NPC' : kind === 'quests' ? 'Квесты' : kind === 'players' ? 'Игроки' : 'Мои враги';

  function openMapLibrary(entity?: DmNpc | DmQuest | DmCustomEnemy) {
    if (store.mode !== 'dm-edit') store.setMode('dm-edit');
    const library = kind === 'npc' ? 'npc' : kind === 'quests' ? 'quests' : 'enemies';
    if (entity) {
      const placeKind = kind === 'npc' ? 'npc' : kind === 'quests' ? 'quest' : 'enemy';
      navigate(`/map?placeKind=${placeKind}&placeId=${encodeURIComponent(entity.id)}`);
      return;
    }
    navigate(`/map?library=${library}`);
  }

  function createEnemy() {
    const id = `enemy-custom-${Date.now()}`;
    const enemy: DmCustomEnemy = {
      id,
      arcId,
      name: 'Новый враг',
      role: 'custom',
      faction: '',
      locationIds: [],
      questIds: [],
      cr: '',
      ac: 10,
      hp: 8,
      speed: '30 фт.',
      tags: ['custom'],
      customVersion: true,
      isCustom: true,
      lore: '',
      attacks: [],
      features: [],
      importedFromBestiaryAt: new Date().toISOString(),
    };
    store.addEnemy(enemy);
    setSelectedId(id);
    setEditing(true);
  }

  return (
    <div className="page entity-library-page">
      <header className="entity-library-header">
        <div>
          <h1>{title} — {timeline?.title}</h1>
          <p className="muted">Просмотр, правка карточек и быстрый переход к размещению на текущей карте.</p>
        </div>
        <div className="entity-library-actions">
          {kind === 'enemies' && (
            <button className="btn-primary" onClick={createEnemy}>
              Создать врага
            </button>
          )}
          {kind !== 'players' && (
            <button className="btn-primary" onClick={() => selected ? openMapLibrary(selected as DmNpc | DmQuest | DmCustomEnemy) : openMapLibrary()}>
              {kind === 'quests' ? 'Разместить цель на карте' : 'Разместить на карте'}
            </button>
          )}
        </div>
      </header>

      <div className="entity-library-layout">
        <aside className="entity-library-list">
          <input
            type="search"
            placeholder="Поиск…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {kind === 'quests' && (
            <FilterChips
              label="Статусы квестов"
              value={questStatusFilter}
              options={[
                { id: 'all', name: 'Все статусы' },
                ...(Object.keys(QUEST_STATUS_LABELS) as QuestStatus[]).map((status) => ({ id: status, name: QUEST_STATUS_LABELS[status] })),
              ]}
              onChange={(value) => {
                setQuestStatusFilter(value as QuestStatus | 'all');
                setSelectedId(null);
                setEditing(false);
              }}
            />
          )}
          {kind === 'quests' && (
            <FilterChips
              label="Стороны квестов"
              value={questFactionFilter}
              options={[{ id: 'all', name: 'Все стороны' }, ...questFactionOptions]}
              onChange={(value) => {
                setQuestFactionFilter(value);
                setSelectedId(null);
                setEditing(false);
              }}
            />
          )}
          {kind === 'npc' && (
            <FilterChips
              label="Стороны NPC"
              value={npcFactionFilter}
              options={[{ id: 'all', name: 'Все стороны' }, ...npcFactionOptions]}
              onChange={(value) => {
                setNpcFactionFilter(value);
                setSelectedId(null);
                setEditing(false);
              }}
            />
          )}
          {kind === 'npc' && (
            <select
              className="entity-library-filter"
              value={npcLocationFilter}
              onChange={(e) => {
                setNpcLocationFilter(e.target.value);
                setSelectedId(null);
                setEditing(false);
              }}
            >
              <option value="all">Все локации</option>
              {npcLocationOptions.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
          )}
          {kind === 'npc' && (
            <select
              className="entity-library-filter"
              value={npcRoleFilter}
              onChange={(e) => {
                setNpcRoleFilter(e.target.value);
                setSelectedId(null);
                setEditing(false);
              }}
            >
              <option value="all">Все роли</option>
              {npcRoleOptions.map((role) => (
                <option key={role} value={role}>{role}</option>
              ))}
            </select>
          )}
          {kind === 'enemies' && (
            <>
              <select className="entity-library-filter" value={enemyLocationFilter} onChange={(e) => { setEnemyLocationFilter(e.target.value); setSelectedId(null); setEditing(false); }}>
                <option value="all">Локация: все</option>
                {enemyLocationOptions.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
              </select>
              <select className="entity-library-filter" value={enemyQuestFilter} onChange={(e) => { setEnemyQuestFilter(e.target.value); setSelectedId(null); setEditing(false); }}>
                <option value="all">Квест: все</option>
                {enemyQuestOptions.map((quest) => <option key={quest.id} value={quest.id}>{safeText(quest.title) || quest.id}</option>)}
              </select>
              <select className="entity-library-filter" value={enemyFactionFilter} onChange={(e) => { setEnemyFactionFilter(e.target.value); setSelectedId(null); setEditing(false); }}>
                <option value="all">Фракция: все</option>
                {enemyFactionOptions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}
              </select>
              <select className="entity-library-filter" value={enemyCrFilter} onChange={(e) => { setEnemyCrFilter(e.target.value); setSelectedId(null); setEditing(false); }}>
                <option value="all">CR: все</option>
                {enemyCrOptions.map((cr) => <option key={cr} value={cr}>{cr}</option>)}
              </select>
              <select className="entity-library-filter" value={enemyTagFilter} onChange={(e) => { setEnemyTagFilter(e.target.value); setSelectedId(null); setEditing(false); }}>
                <option value="all">Тег: все</option>
                {enemyTagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
              <select className="entity-library-filter" value={enemyRoleFilter} onChange={(e) => { setEnemyRoleFilter(e.target.value); setSelectedId(null); setEditing(false); }}>
                <option value="all">Роль: все</option>
                {enemyRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
              </select>
            </>
          )}
          <select
            className="entity-library-filter"
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as EntitySortKey);
              setSelectedId(null);
              setEditing(false);
            }}
          >
            <option value="name_asc">Сортировка: имя А-Я</option>
            <option value="name_desc">Сортировка: имя Я-А</option>
            <option value="location">Сортировка: локация</option>
            {kind === 'quests' && <option value="status">Сортировка: статус</option>}
            {kind !== 'quests' && <option value="role">Сортировка: роль</option>}
          </select>
          <div className="entity-library-count">{items.length} объектов</div>
          <ul>
            {items.map((item) => {
              const active = item.id === selected?.id;
              const title = getEntityTitle(item as DmNpc | DmQuest | DmCustomEnemy | DmPlayer);
              const thumb = entityThumbnail(data, item as DmNpc | DmQuest | DmCustomEnemy | DmPlayer);
              const subtitle =
                kind === 'npc'
                  ? [getFactionSummary(data, item as DmNpc), (item as DmNpc).role, data.locations.find((l) => l.id === (item as DmNpc).location)?.name ?? (item as DmNpc).location].filter(Boolean).join(' · ')
                  : kind === 'quests'
                    ? [QUEST_STATUS_LABELS[effectiveSafeQuestStatus(item as DmQuest, store)], getFactionSummary(data, item as DmQuest)].filter(Boolean).join(' · ')
                      : kind === 'players'
                        ? [(item as DmPlayer).playerName, (item as DmPlayer).race, (item as DmPlayer).class, (item as DmPlayer).level ? `ур. ${(item as DmPlayer).level}` : undefined].filter(Boolean).join(' · ')
                      : [(item as DmCustomEnemy).role, (item as DmCustomEnemy).cr ? `CR ${(item as DmCustomEnemy).cr}` : undefined].filter(Boolean).join(' · ');
              const placement = entityPlacementLabel(data, store.currentTimelineId, kind, item as DmNpc | DmQuest | DmCustomEnemy | DmPlayer);
              return (
                <li key={item.id}>
                  <button
                    className={active ? 'entity-library-row active' : 'entity-library-row'}
                    onClick={() => {
	                      setSelectedId(item.id);
	                      setEditing(false);
	                      setInlineEnemyEditId(null);
	                    }}
                  >
                    {thumb ? (
                      <img className="entity-library-row-thumb" src={thumb} alt="" loading="lazy" />
                    ) : (
                      <span className="entity-library-row-thumb entity-library-row-thumb-fallback">{entityInitials(title)}</span>
                    )}
                    <span className="entity-library-row-main">
                      <strong>{title}</strong>
                      {subtitle && <span>{subtitle}</span>}
                      {placement && <small className={placement === 'Размещено' ? 'placement-badge placement-badge--placed' : 'placement-badge'}>{placement}</small>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <section className="entity-library-detail">
          {!selected ? (
            <p className="muted">Ничего не найдено.</p>
          ) : (
            <>
              <div className="entity-library-actions">
                <button className="btn-primary" onClick={() => setEditing((v) => !v)}>
                  {editing ? 'Закрыть редактор' : 'Редактировать'}
                </button>
                {kind !== 'players' && (
                  <button onClick={() => openMapLibrary(selected as DmNpc | DmQuest | DmCustomEnemy)}>
                    {kind === 'quests' ? 'Разместить цель на карте' : 'Разместить на карте'}
                  </button>
                )}
              </div>
              {editing ? (
                <EntityEditor
                  kind={kind}
                  entity={selected}
                  data={data}
                  onDone={() => setEditing(false)}
                />
              ) : kind === 'npc' ? (
                <CompanionNpcCard
                  npc={selected as DmNpc}
                  locationName={data.locations.find((l) => l.id === (selected as DmNpc).location)?.name}
                  shop={data.shops.find((s) => s.ownerNpcId === selected.id)}
                  quests={data.quests}
                  images={data.images}
                />
              ) : kind === 'quests' ? (
                <>
                  <CompanionQuestCard
                    quest={selected as DmQuest}
                    npcs={data.npcs}
                    enemies={data.enemies}
                    images={data.images}
                    locationName={data.locations.find((l) => l.id === (selected as DmQuest).location)?.name}
                    onOpenNpc={(id) => navigate(`/npc?selected=${encodeURIComponent(id)}`)}
                    onOpenLocation={(id) => {
                      const state =
                        data.locationStates.find((ls) => ls.locationId === id && ls.timelineId === store.currentTimelineId) ??
                        data.locationStates.find((ls) => ls.locationId === id);
                      navigate(state ? `/map?selected=${encodeURIComponent(state.id)}` : '/map');
                    }}
                    onOpenEnemy={(id) => navigate(`/enemies?selected=${encodeURIComponent(id)}`)}
                    onEditEnemy={(enemyId) => setInlineEnemyEditId(enemyId)}
                    onRemoveEnemy={(enemyId) => {
                      const quest = selected as DmQuest;
                      store.patchQuest(quest.id, { enemies: (quest.enemies ?? []).filter((id) => id !== enemyId) });
                      const enemy = data.enemies.find((e) => e.id === enemyId);
                      if (enemy) store.patchEnemy(enemy.id, { questIds: (enemy.questIds ?? []).filter((id) => id !== quest.id) });
                    }}
                  />
                  {inlineEnemyEditId && (() => {
                    const enemy = data.enemies.find((e) => e.id === inlineEnemyEditId);
                    if (!enemy) return null;
                    return (
                      <div className="entity-nested-editor">
                        <h3>Редактировать врага в этом квесте</h3>
                        <EnemyEditor enemy={enemy} data={data} onDone={() => setInlineEnemyEditId(null)} />
                      </div>
                    );
                  })()}
                </>
              ) : kind === 'players' ? (
                <PlayerCard player={selected as DmPlayer} data={data} />
              ) : (
                <CompanionEnemyCard
                  enemy={selected as DmCustomEnemy}
                  locations={data.locations}
                  quests={data.quests}
                  images={data.images}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function battleMapPreview(map: BattleMapManifestEntry): string | undefined {
  const variant = map.variants.find((v) => v.url);
  return variant?.url ? `${BATTLE_MAP_ASSET_ORIGIN}${variant.url}` : undefined;
}

function entityMatchesFaction(item: FactionTaggedEntity, faction: DmFaction): boolean {
  return getEntityFactionKeys(item).some((key) => key === faction.id || key === faction.name || key === faction.shortName);
}

type FactionPreviewTarget =
  | { type: 'npc'; id: string }
  | { type: 'quest'; id: string }
  | { type: 'location'; id: string }
  | { type: 'enemy'; id: string };

function FactionLinkedCard({
  title,
  subtitle,
  imageSrc,
  placement,
  onClick,
}: {
  title: string;
  subtitle?: string;
  imageSrc?: string;
  placement?: string | null;
  onClick: () => void;
}) {
  return (
    <button type="button" className="faction-linked-card" onClick={onClick}>
      {imageSrc ? (
        <img className="faction-linked-card-thumb" src={imageSrc} alt="" />
      ) : (
        <span className="faction-linked-card-thumb faction-linked-card-thumb--empty" aria-hidden="true">
          ?
        </span>
      )}
      <span className="faction-linked-card-main">
        <strong>{title}</strong>
        {subtitle && <span>{subtitle}</span>}
        {placement && <small className={placement === 'Размещено' ? 'placement-badge placement-badge--placed' : 'placement-badge'}>{placement}</small>}
      </span>
    </button>
  );
}

function FactionEntityLibraryPage({ data, arcId, timelineTitle }: { data: CampaignData; arcId: string; timelineTitle: string }) {
  const navigate = useNavigate();
  const store = useCampaignStore();
  const [selectedFactionId, setSelectedFactionId] = useState<string | null>(null);
  const [previewTarget, setPreviewTarget] = useState<FactionPreviewTarget | null>(null);

  const arcNpcs = data.npcs.filter((npc) => (npc.arcId ?? 'arc-1') === arcId);
  const arcQuests = data.quests.filter((quest) => (quest.arcId ?? 'arc-1') === arcId);
  const arcLocations = data.locations.filter((location) => (location.arcId ?? 'arc-1') === arcId);
  const arcEnemies = data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId);
  const arcLocationRows = useMemo(() => {
    const rows = new Map<string, { location: DmLocation; sources: DmLocation[] }>();
    const candidates = arcId === 'arc-2'
      ? data.locations.filter((location) => (location.arcId ?? 'arc-1') === 'arc-1' || location.arcId === 'arc-2')
      : arcLocations;
    candidates.forEach((location) => {
      const canonical = arcId === 'arc-2' ? canonicalArcLocation(location, data.locations) : location;
      const existing = rows.get(canonical.id);
      if (existing) {
        existing.sources.push(location);
      } else {
        rows.set(canonical.id, { location: canonical, sources: [location] });
      }
    });
    return Array.from(rows.values());
  }, [arcId, arcLocations, data.locations]);
  const factionRows = useMemo(() => data.factions
    .map((faction) => {
      const npcCount = arcNpcs.filter((npc) => entityMatchesFaction(npc, faction)).length;
      const questCount = arcQuests.filter((quest) => entityMatchesFaction(quest, faction)).length;
      const locationCount = arcLocationRows.filter((row) => row.sources.some((location) => entityMatchesFaction(location, faction))).length;
      const enemyCount = arcEnemies.filter((enemy) => entityMatchesFaction(enemy, faction)).length;
      return { faction, npcCount, questCount, locationCount, enemyCount, total: npcCount + questCount + locationCount + enemyCount };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => (b.faction.arcId === arcId ? 1 : 0) - (a.faction.arcId === arcId ? 1 : 0) || b.total - a.total || a.faction.name.localeCompare(b.faction.name, 'ru')), [arcEnemies, arcId, arcLocationRows, arcNpcs, arcQuests, data.factions]);
  useEffect(() => {
    if (selectedFactionId && !factionRows.some((row) => row.faction.id === selectedFactionId)) {
      setSelectedFactionId(null);
    }
  }, [factionRows, selectedFactionId]);
  const selected = factionRows.find((row) => row.faction.id === selectedFactionId)?.faction ?? factionRows[0]?.faction ?? null;
  const linkedNpcs = selected ? arcNpcs.filter((npc) => entityMatchesFaction(npc, selected)).slice(0, 8) : [];
  const linkedQuests = selected ? arcQuests.filter((quest) => entityMatchesFaction(quest, selected)).slice(0, 8) : [];
  const linkedLocations = selected
    ? arcLocationRows.filter((row) => row.sources.some((location) => entityMatchesFaction(location, selected))).map((row) => row.location).slice(0, 8)
    : [];
  const linkedEnemies = selected ? arcEnemies.filter((enemy) => entityMatchesFaction(enemy, selected)).slice(0, 8) : [];
  const selectedStats = selected ? factionRows.find((row) => row.faction.id === selected.id) : null;
  const previewNpc = previewTarget?.type === 'npc' ? data.npcs.find((npc) => npc.id === previewTarget.id) : undefined;
  const previewQuest = previewTarget?.type === 'quest' ? data.quests.find((quest) => quest.id === previewTarget.id) : undefined;
  const previewLocation = previewTarget?.type === 'location' ? data.locations.find((location) => location.id === previewTarget.id) : undefined;
  const previewEnemy = previewTarget?.type === 'enemy' ? data.enemies.find((enemy) => enemy.id === previewTarget.id) : undefined;
  const previewTitle = previewNpc?.name ?? previewQuest?.title ?? previewLocation?.name ?? previewEnemy?.name ?? 'Карточка';
  const previewBody = previewNpc ? (
    <CompanionNpcCard
      npc={previewNpc}
      locationName={data.locations.find((location) => location.id === previewNpc.location)?.name}
      shop={data.shops.find((shop) => shop.ownerNpcId === previewNpc.id)}
      quests={data.quests}
      images={data.images}
      onOpenQuest={(id) => setPreviewTarget({ type: 'quest', id })}
      onOpenShop={() => undefined}
    />
  ) : previewQuest ? (
    <CompanionQuestCard
      quest={previewQuest}
      npcs={data.npcs}
      enemies={data.enemies}
      images={data.images}
      locationName={data.locations.find((location) => location.id === previewQuest.location)?.name}
      onOpenNpc={(id) => setPreviewTarget({ type: 'npc', id })}
      onOpenLocation={(id) => setPreviewTarget({ type: 'location', id })}
      onOpenEnemy={(id) => setPreviewTarget({ type: 'enemy', id })}
    />
  ) : previewLocation ? (
    <CompanionLocationCard
      loc={previewLocation}
      npcs={data.npcs}
      quests={data.quests}
      shops={data.shops.filter((shop) => shop.location === previewLocation.id)}
      enemies={data.enemies.filter((enemy) => enemy.locationIds?.includes(previewLocation.id))}
      images={data.images}
      onOpenNpc={(id) => setPreviewTarget({ type: 'npc', id })}
      onOpenQuest={(id) => setPreviewTarget({ type: 'quest', id })}
      onOpenShop={() => undefined}
      onOpenEnemy={(id) => setPreviewTarget({ type: 'enemy', id })}
    />
  ) : previewEnemy ? (
    <CompanionEnemyCard
      enemy={previewEnemy}
      locations={data.locations}
      quests={data.quests}
      images={data.images}
      onOpenLocation={(id) => setPreviewTarget({ type: 'location', id })}
      onOpenQuest={(id) => setPreviewTarget({ type: 'quest', id })}
    />
  ) : null;

  return (
    <div className="page entity-library-page entity-library-page--wide">
      <header className="entity-library-header">
        <div>
          <h1>Стороны конфликта — {timelineTitle}</h1>
          <p className="muted">Фракции арки, связанные NPC, квесты, локации и враги в одном месте.</p>
        </div>
      </header>
      <div className="faction-overview-grid">
        {factionRows.map(({ faction, total }) => (
          <button
            key={faction.id}
            className={selected?.id === faction.id ? 'faction-overview-card active' : 'faction-overview-card'}
            style={{ borderColor: selected?.id === faction.id ? faction.color : undefined }}
            onClick={() => setSelectedFactionId(faction.id)}
          >
            <span className="faction-overview-icon">{faction.icon ?? '⚔'}</span>
            <strong style={{ color: faction.color ?? undefined }}>{faction.name}</strong>
            <span>{total} объектов</span>
          </button>
        ))}
      </div>

      {selected && (
        <section className="entity-library-detail faction-detail-panel">
          <div className="faction-detail-heading">
            <div>
              <h2><span>{selected.icon ?? '⚔'}</span> {selected.name}</h2>
              <p className="muted">{selected.description ?? selected.subtype ?? 'Фракция кампании'}</p>
            </div>
            <div className="faction-stat-strip">
              <span><strong>{selectedStats?.npcCount ?? 0}</strong> NPC</span>
              <span><strong>{selectedStats?.questCount ?? 0}</strong> квестов</span>
              <span><strong>{selectedStats?.locationCount ?? 0}</strong> локаций</span>
              <span><strong>{selectedStats?.enemyCount ?? 0}</strong> врагов</span>
            </div>
          </div>

          <div className="faction-linked-grid">
            <section>
              <h3>Ключевые NPC</h3>
              {linkedNpcs.map((npc) => (
                <FactionLinkedCard key={npc.id} title={npc.name} subtitle={npc.role} imageSrc={entityThumbnail(data, npc)} placement={entityPlacementLabel(data, store.currentTimelineId, 'npc', npc)} onClick={() => setPreviewTarget({ type: 'npc', id: npc.id })} />
              ))}
              <button onClick={() => navigate('/npc')}>Все NPC</button>
            </section>
            <section>
              <h3>Квесты</h3>
              {linkedQuests.map((quest) => (
                <FactionLinkedCard key={quest.id} title={getEntityTitle(quest)} subtitle={quest.goal} imageSrc={entityThumbnail(data, quest)} placement={entityPlacementLabel(data, store.currentTimelineId, 'quests', quest)} onClick={() => setPreviewTarget({ type: 'quest', id: quest.id })} />
              ))}
              <button onClick={() => navigate('/quests')}>Все квесты</button>
            </section>
            <section>
              <h3>Локации</h3>
              {linkedLocations.map((location) => (
                <FactionLinkedCard key={location.id} title={location.name} subtitle={location.type} imageSrc={locationThumbnail(data, location)} placement={entityPlacementLabel(data, store.currentTimelineId, 'location', location)} onClick={() => setPreviewTarget({ type: 'location', id: location.id })} />
              ))}
            </section>
            <section>
              <h3>Враги</h3>
              {linkedEnemies.map((enemy) => (
                <FactionLinkedCard key={enemy.id} title={enemy.name} subtitle={[enemy.role, enemy.cr ? `CR ${enemy.cr}` : undefined].filter(Boolean).join(' · ')} imageSrc={entityThumbnail(data, enemy)} placement={entityPlacementLabel(data, store.currentTimelineId, 'enemies', enemy)} onClick={() => setPreviewTarget({ type: 'enemy', id: enemy.id })} />
              ))}
              <button onClick={() => navigate('/enemies')}>Все враги</button>
            </section>
          </div>
        </section>
      )}
      {previewTarget && (
        <div className="entity-card-modal-backdrop" onClick={() => setPreviewTarget(null)}>
          <div className="entity-card-modal" onClick={(event) => event.stopPropagation()}>
            <header className="entity-card-modal-header">
              <h2>{previewTitle}</h2>
              <button type="button" className="btn-ghost" onClick={() => setPreviewTarget(null)}>
                Закрыть ✕
              </button>
            </header>
            <div className="entity-card-modal-body">
              {previewBody ?? <p className="muted">Карточка не найдена.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function normalizeBestiaryText(value?: string | number): string {
  return String(value ?? '').trim();
}

function enemyFromBestiaryMonster(monster: BestiaryMonster, arcId: string): DmCustomEnemy {
  const image = monster.customImages?.[0] ?? monster.imageUrl ?? '';
  const features = monster.traits?.length ? monster.traits : monster.features ?? [];
  return {
    id: `enemy-custom-${Date.now()}-${monster.id}`,
    arcId,
    name: monster.nameRu,
    role: monster.type ?? monster.creatureType ?? 'bestiary',
    faction: '',
    locationIds: [],
    questIds: [],
    image,
    cr: monster.cr ?? '',
    ac: monster.ac,
    hp: monster.hp,
    tags: Array.from(new Set([...(monster.tags ?? []), monster.size, monster.type, monster.sourceBook, 'custom'].filter(Boolean) as string[])),
    baseMonsterId: monster.id,
    baseMonsterName: monster.nameEn ?? monster.nameRu,
    baseMonsterSourceBook: monster.sourceBook,
    baseMonsterSourcePage: monster.sourcePage,
    baseMonsterCr: monster.cr,
    customVersion: true,
    isCustom: true,
    lore: monster.description ?? '',
    xp: monster.xp,
    hitDice: monster.hitDice,
    speed: monster.speed,
    abilityScores: monster.abilityScores ? { ...monster.abilityScores } : undefined,
    savingThrows: [...(monster.savingThrows ?? [])],
    skills: [...(monster.skills ?? [])],
    vulnerabilities: [...(monster.vulnerabilities ?? [])],
    resistances: [...(monster.resistances ?? [])],
    immunities: [...(monster.immunities ?? [])],
    conditionImmunities: [...(monster.conditionImmunities ?? [])],
    senses: monster.senses,
    passivePerception: monster.passivePerception,
    languages: monster.languages,
    attacks: (monster.actions ?? []).map((action) => ({ ...action })),
    features: features.map((feature) => ({ ...feature })),
    reactions: (monster.reactions ?? []).map((reaction) => ({ ...reaction })),
    legendaryActions: (monster.legendaryActions ?? []).map((legendaryAction) => ({ ...legendaryAction })),
    tactics: '',
    dmNotes: monster.notes ?? '',
    importedFromBestiaryAt: new Date().toISOString(),
  };
}

function BestiaryEntityLibraryPage({ arcId, timelineTitle }: { arcId: string; timelineTitle: string }) {
  const store = useCampaignStore();
  const navigate = useNavigate();
  const [monsters, setMonsters] = useState<BestiaryMonster[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [crFilter, setCrFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addedId, setAddedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function loadBestiary() {
      setLoading(true);
      setError(null);
      try {
        const local = await fetch('/data/dm-companion/bestiary.local.json');
        const response = local.ok ? local : await fetch('/data/dm-companion/bestiary.sample.json');
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const next = await response.json() as BestiaryMonster[];
        if (!cancelled) {
          setMonsters(next);
          setSelectedId(next[0]?.id ?? null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Не удалось загрузить бестиарий');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadBestiary();
    return () => {
      cancelled = true;
    };
  }, []);

  const crOptions = useMemo(() => Array.from(new Set(monsters.map((m) => m.cr).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true })), [monsters]);
  const typeOptions = useMemo(() => Array.from(new Set(monsters.map((m) => m.type ?? m.creatureType).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru')), [monsters]);
  const sizeOptions = useMemo(() => Array.from(new Set(monsters.map((m) => m.size).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru')), [monsters]);
  const sourceOptions = useMemo(() => Array.from(new Set(monsters.map((m) => m.sourceBook).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru')), [monsters]);
  const q = search.trim().toLowerCase();
  const filtered = useMemo(() => monsters
    .filter((monster) => crFilter === 'all' || monster.cr === crFilter)
    .filter((monster) => typeFilter === 'all' || (monster.type ?? monster.creatureType) === typeFilter)
    .filter((monster) => sizeFilter === 'all' || monster.size === sizeFilter)
    .filter((monster) => sourceFilter === 'all' || monster.sourceBook === sourceFilter)
    .filter((monster) => {
      if (!q) return true;
      const haystack = [
        monster.nameRu,
        monster.nameEn,
        monster.altName,
        monster.type,
        monster.creatureType,
        monster.sourceBook,
        monster.cr,
        monster.languages,
        monster.senses,
        monster.description,
        ...(monster.tags ?? []),
        ...(monster.actions ?? []).map((action) => `${action.name} ${action.description ?? ''}`),
        ...(monster.traits ?? monster.features ?? []).map((feature) => `${feature.name} ${feature.description ?? ''}`),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    })
    .sort((a, b) => a.nameRu.localeCompare(b.nameRu, 'ru')), [crFilter, monsters, q, sizeFilter, sourceFilter, typeFilter]);

  const selected = (selectedId ? filtered.find((monster) => monster.id === selectedId) ?? monsters.find((monster) => monster.id === selectedId) : filtered[0]) ?? null;
  const previewEnemy = selected ? enemyFromBestiaryMonster(selected, arcId) : null;

  function addSelectedToEnemies() {
    if (!selected) return;
    const enemy = enemyFromBestiaryMonster(selected, arcId);
    store.addEnemy(enemy);
    setAddedId(enemy.id);
  }

  return (
    <div className="page entity-library-page">
      <header className="entity-library-header">
        <div>
          <h1>Бестиарий — {timelineTitle}</h1>
          <p className="muted">Полный каталог монстров DM Companion. Отсюда враг добавляется в “Мои враги” и дальше редактируется для кампании.</p>
        </div>
        <div className="entity-library-actions">
          <button className="btn-primary" disabled={!selected} onClick={addSelectedToEnemies}>Добавить в мои враги</button>
          <button onClick={() => navigate('/enemies')}>Открыть мои враги</button>
        </div>
      </header>

      {loading ? (
        <p className="muted">Загрузка бестиария…</p>
      ) : error ? (
        <p className="muted">Ошибка загрузки бестиария: {error}</p>
      ) : (
        <div className="entity-library-layout">
          <aside className="entity-library-list">
            <input type="search" placeholder="Имя, тип, тег, атака…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className="entity-library-filter" value={crFilter} onChange={(e) => { setCrFilter(e.target.value); setSelectedId(null); }}>
              <option value="all">CR: все</option>
              {crOptions.map((cr) => <option key={cr} value={cr}>CR {cr}</option>)}
            </select>
            <select className="entity-library-filter" value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setSelectedId(null); }}>
              <option value="all">Тип: все</option>
              {typeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
            </select>
            <select className="entity-library-filter" value={sizeFilter} onChange={(e) => { setSizeFilter(e.target.value); setSelectedId(null); }}>
              <option value="all">Размер: все</option>
              {sizeOptions.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
            <select className="entity-library-filter" value={sourceFilter} onChange={(e) => { setSourceFilter(e.target.value); setSelectedId(null); }}>
              <option value="all">Источник: все</option>
              {sourceOptions.map((source) => <option key={source} value={source}>{source}</option>)}
            </select>
            <div className="entity-library-count">{filtered.length} / {monsters.length} монстров</div>
            <ul>
              {filtered.map((monster) => (
                <li key={monster.id}>
                  <button
                    className={monster.id === selected?.id ? 'entity-library-row active' : 'entity-library-row'}
                    onClick={() => {
                      setSelectedId(monster.id);
                      setAddedId(null);
                    }}
                  >
                    <strong>{monster.nameRu}</strong>
                    <span>{[monster.nameEn, monster.cr ? `CR ${monster.cr}` : undefined, monster.type, monster.sourceBook].filter(Boolean).join(' · ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          </aside>

          <section className="entity-library-detail">
            {!selected || !previewEnemy ? (
              <p className="muted">Ничего не найдено.</p>
            ) : (
              <>
                <div className="entity-library-actions">
                  <button className="btn-primary" onClick={addSelectedToEnemies}>Добавить в мои враги</button>
                  {addedId && <button onClick={() => navigate('/enemies')}>Добавлено. Открыть мои враги</button>}
                </div>
                <CompanionEnemyCard enemy={previewEnemy} locations={[]} quests={[]} images={[]} />
                <div className="entity-card">
                  <h3>Источник</h3>
                  <p>{[normalizeBestiaryText(selected.sourceBook), normalizeBestiaryText(selected.sourcePage)].filter(Boolean).join(', ') || 'не указан'}</p>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

function BattleMapsEntityLibraryPage({ data, arcId }: { data: CampaignData; arcId: string }) {
  const store = useCampaignStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [arcFilter, setArcFilter] = useState<'all' | string>(arcId);
  const [groupFilter, setGroupFilter] = useState('all');
  const [sizeFilter, setSizeFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [locationSearch, setLocationSearch] = useState('');
  const [selectedLocationIds, setSelectedLocationIds] = useState<Set<string>>(new Set());
  const [selectedMapIds, setSelectedMapIds] = useState<Set<string>>(new Set());

  const maps = data.battleMaps;
  const groups = Array.from(new Set(maps.flatMap((map) => map.groupLabels ?? []))).sort((a, b) => a.localeCompare(b, 'ru'));
  const sizes = Array.from(new Set(maps.map((map) => map.gridSizeLabel ?? map.mapSize).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  const statuses = Array.from(new Set(maps.map((map) => map.status ?? map.gridStatus).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru'));
  const q = search.trim().toLowerCase();
  const filteredMaps = maps
    .filter((map) => arcFilter === 'all' || map.arcId === arcFilter)
    .filter((map) => groupFilter === 'all' || (map.groupLabels ?? []).includes(groupFilter))
    .filter((map) => sizeFilter === 'all' || (map.gridSizeLabel ?? map.mapSize) === sizeFilter)
    .filter((map) => statusFilter === 'all' || (map.status ?? map.gridStatus) === statusFilter)
    .filter((map) => !q || [map.title, map.normalizedName, ...(map.groupLabels ?? [])].some((part) => (part ?? '').toLowerCase().includes(q)))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }));
  const lq = locationSearch.trim().toLowerCase();
  const visibleLocations = data.locationStates
    .filter((loc) => (loc.timelineId ? data.timelines.find((t) => t.id === loc.timelineId)?.arcId === arcId : true))
    .filter((loc) => !lq || [loc.title, loc.type, loc.publicDescription].some((part) => (part ?? '').toLowerCase().includes(lq)))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));

  function bindSelected() {
    const locationIds = Array.from(selectedLocationIds);
    const mapIds = Array.from(selectedMapIds);
    for (const locationStateId of locationIds) {
      for (const battleMapId of mapIds) {
        const exists = data.battleMapLocationLinks.some((link) => link.locationStateId === locationStateId && link.battleMapId === battleMapId && !link.rejected);
        if (!exists) store.addManualBattleMapLink(locationStateId, battleMapId, 'Manual bulk link from battle-map page');
      }
    }
    setSelectedMapIds(new Set());
  }

  return (
    <div className="page entity-library-page">
      <header className="entity-library-header">
        <div>
          <h1>Карты боя</h1>
          <p className="muted">Отдельная библиотека карт Battle Map VTT внутри интерактивной карты.</p>
        </div>
        <button className="btn-secondary" onClick={() => navigate('/map')}>Вернуться к карте</button>
      </header>

      <div className="battle-map-link-panel">
        <div className="battle-map-panel-header">
          <strong>Пакетная привязка к локациям</strong>
          <span>{selectedLocationIds.size} локаций · {selectedMapIds.size} карт выбрано</span>
        </div>
        <input placeholder="Найти локацию..." value={locationSearch} onChange={(e) => setLocationSearch(e.target.value)} />
        <div className="battle-map-location-checklist">
          {visibleLocations.slice(0, 120).map((loc) => (
            <label key={loc.id}>
              <input
                type="checkbox"
                checked={selectedLocationIds.has(loc.id)}
                onChange={(e) => {
                  const next = new Set(selectedLocationIds);
                  if (e.target.checked) next.add(loc.id);
                  else next.delete(loc.id);
                  setSelectedLocationIds(next);
                }}
              />
              <span>{loc.title}</span>
            </label>
          ))}
        </div>
        <div className="entity-library-actions">
          <button className="btn-primary" disabled={!selectedLocationIds.size || !selectedMapIds.size} onClick={bindSelected}>
            Привязать выбранные карты ({selectedMapIds.size}) к локациям ({selectedLocationIds.size})
          </button>
          <button disabled={!selectedLocationIds.size} onClick={() => setSelectedLocationIds(new Set())}>Снять локации</button>
          <button disabled={!selectedMapIds.size} onClick={() => setSelectedMapIds(new Set())}>Снять карты</button>
        </div>
      </div>

      <div className="battle-map-filter-panel">
        <input placeholder="Поиск карты..." value={search} onChange={(e) => setSearch(e.target.value)} />
        <div className="battle-map-filter-grid">
          <label>Арка<select value={arcFilter} onChange={(e) => setArcFilter(e.target.value)}>
            <option value="all">Все</option>
            <option value="arc-1">Арка 1</option>
            <option value="arc-2">Арка 2</option>
          </select></label>
          <label>Группа<select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
            <option value="all">Все группы</option>
            {groups.map((group) => <option key={group} value={group}>{group}</option>)}
          </select></label>
          <label>Размер<select value={sizeFilter} onChange={(e) => setSizeFilter(e.target.value)}>
            <option value="all">Все размеры</option>
            {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
          </select></label>
          <label>Статус<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="all">Все статусы</option>
            {statuses.map((status) => <option key={status} value={status}>{status}</option>)}
          </select></label>
        </div>
        <div className="entity-library-count">{filteredMaps.length} / {maps.length} карт</div>
      </div>

      <section className="battle-map-page-grid">
        {filteredMaps.length === 0 ? (
          <div className="search-empty">По этим фильтрам карт боя не найдено.</div>
        ) : filteredMaps.map((map) => {
          const preview = battleMapPreview(map);
          return (
            <article key={map.id} className={selectedMapIds.has(map.id) ? 'battle-map-page-card active' : 'battle-map-page-card'}>
              <label className="battle-map-row-check">
                <input
                  type="checkbox"
                  checked={selectedMapIds.has(map.id)}
                  onChange={(e) => {
                    const next = new Set(selectedMapIds);
                    if (e.target.checked) next.add(map.id);
                    else next.delete(map.id);
                    setSelectedMapIds(next);
                  }}
                />
                Выбрать
              </label>
              {preview && <img src={preview} alt={map.title} />}
              <h3>{map.title}</h3>
              <p className="muted">
                {[map.arcId === 'arc-2' ? 'Арка 2' : 'Арка 1', map.gridSizeLabel ?? map.mapSize, ...(map.groupLabels ?? [])].filter(Boolean).join(' · ')}
              </p>
              <div className="actions">
                <button className="btn-primary" onClick={() => navigate(`/map?battleMap=${encodeURIComponent(map.id)}`)}>Открыть бой</button>
                <button className="btn-secondary" onClick={() => setSelectedMapIds(new Set([map.id]))}>Выбрать одну</button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}

export function EntityEditor({
  kind,
  entity,
  data,
  onDone,
}: {
  kind: EntityLibraryKind;
  entity: DmNpc | DmQuest | DmCustomEnemy | DmPlayer;
  data: CampaignData;
  onDone: () => void;
}) {
  if (kind === 'npc') return <NpcEditor npc={entity as DmNpc} data={data} onDone={onDone} />;
  if (kind === 'quests') return <QuestEditor quest={entity as DmQuest} data={data} onDone={onDone} />;
  if (kind === 'players') return <PlayerEditor player={entity as DmPlayer} data={data} onDone={onDone} />;
  return <EnemyEditor enemy={entity as DmCustomEnemy} data={data} onDone={onDone} />;
}

function PlayerCard({ player, data }: { player: DmPlayer; data: CampaignData }) {
  const playerImage = imageSrcFromId(data, player.image) ?? player.image;
  const relatedNpcs = (player.relatedNpcs ?? [])
    .map((id) => data.npcs.find((npc) => npc.id === id))
    .filter((npc): npc is DmNpc => Boolean(npc));
  const relatedQuests = (player.relatedQuests ?? [])
    .map((id) => data.quests.find((quest) => quest.id === id))
    .filter((quest): quest is DmQuest => Boolean(quest));
  return (
    <article className="companion-source-card">
      <div className="companion-source-header">
        <h3>{player.characterName}</h3>
        <span className="muted">
          {[player.playerName, player.race, player.class, player.level ? `ур. ${player.level}` : undefined].filter(Boolean).join(' · ') || 'Игрок'}
        </span>
      </div>
      {playerImage ? (
        <img className="companion-source-hero" src={playerImage} alt={player.characterName} />
      ) : (
        <div className="companion-source-hero companion-source-hero--placeholder">Нет изображения</div>
      )}
      {player.tags?.length ? <p className="muted">{player.tags.join(', ')}</p> : null}
      {player.description && <p>{player.description}</p>}
      {player.backstory && (
        <>
          <h4>Предыстория</h4>
          <p>{player.backstory}</p>
        </>
      )}
      {player.personality && (
        <>
          <h4>Характер</h4>
          <p>{player.personality}</p>
        </>
      )}
      {player.ideals && (
        <>
          <h4>Идеалы</h4>
          <p>{player.ideals}</p>
        </>
      )}
      {player.bonds && (
        <>
          <h4>Привязанности</h4>
          <p>{player.bonds}</p>
        </>
      )}
      {player.flaws && (
        <>
          <h4>Слабости</h4>
          <p>{player.flaws}</p>
        </>
      )}
      {relatedNpcs.length > 0 && (
        <>
          <h4>Связанные NPC</h4>
          <div className="economy-tags">
            {relatedNpcs.map((npc) => (
              <Link key={npc.id} className="companion-tag-chip" to={`/npc?selected=${encodeURIComponent(npc.id)}`}>
                {npc.name}
              </Link>
            ))}
          </div>
        </>
      )}
      {relatedQuests.length > 0 && (
        <>
          <h4>Связанные квесты</h4>
          <div className="economy-tags">
            {relatedQuests.map((quest) => (
              <Link key={quest.id} className="companion-tag-chip" to={`/quests?selected=${encodeURIComponent(quest.id)}`}>
                {getEntityTitle(quest)}
              </Link>
            ))}
          </div>
        </>
      )}
      {player.reputation?.length > 0 && (
        <>
          <h4>Репутация</h4>
          <ul className="companion-item-list">
            {player.reputation.map((rep) => (
              <li key={rep.id}><strong>{rep.faction}</strong> — {rep.value}</li>
            ))}
          </ul>
        </>
      )}
      {player.dmNotes && (
        <>
          <h4>Заметки ДМ (DM-ONLY)</h4>
          <p className="muted">{player.dmNotes}</p>
        </>
      )}
      {player.dmSecrets && (
        <>
          <h4>Секреты ДМ (DM-ONLY)</h4>
          <p className="muted">{player.dmSecrets}</p>
        </>
      )}
    </article>
  );
}

function PlayerEditor({ player, data, onDone }: { player: DmPlayer; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    characterName: player.characterName ?? '',
    playerName: player.playerName ?? '',
    race: player.race ?? '',
    class: player.class ?? '',
    level: player.level ?? '',
    image: player.image ?? '',
    description: player.description ?? '',
    backstory: player.backstory ?? '',
    personality: player.personality ?? '',
    ideals: player.ideals ?? '',
    bonds: player.bonds ?? '',
    flaws: player.flaws ?? '',
    dmNotes: player.dmNotes ?? '',
    dmSecrets: player.dmSecrets ?? '',
    tags: (player.tags ?? []).join(', '),
    relatedNpcs: player.relatedNpcs ?? [],
    relatedQuests: player.relatedQuests ?? [],
    journalText: (player.journal ?? []).map((entry) => `${entry.date}: ${entry.text}`).join('\n'),
    reputationText: (player.reputation ?? []).map((rep) => `${rep.faction}: ${rep.value}`).join('\n'),
  });

  function toggleDraftList(key: 'relatedNpcs' | 'relatedQuests', id: string) {
    setDraft((current) => {
      const list = current[key];
      return {
        ...current,
        [key]: list.includes(id) ? list.filter((itemId) => itemId !== id) : [...list, id],
      };
    });
  }

  function parseJournal(): DmPlayer['journal'] {
    return draft.journalText
      .split('\n')
      .map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const separatorIndex = trimmed.indexOf(':');
        const date = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex).trim() : '';
        const text = separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1).trim() : trimmed;
        if (!text) return null;
        return {
          id: player.journal?.[index]?.id ?? `journal-${player.id}-${index}`,
          date,
          text,
        };
      })
      .filter((entry): entry is DmPlayer['journal'][number] => Boolean(entry));
  }

  function parseReputation(): DmPlayer['reputation'] {
    const entries: DmPlayer['reputation'] = [];
    draft.reputationText
      .split('\n')
      .forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return;
        const separatorIndex = trimmed.lastIndexOf(':');
        const faction = separatorIndex >= 0 ? trimmed.slice(0, separatorIndex).trim() : trimmed;
        const value = separatorIndex >= 0 ? Number(trimmed.slice(separatorIndex + 1).trim()) : 0;
        entries.push({
          id: player.reputation?.[index]?.id ?? `rep-${player.id}-${index}`,
          arcId: player.reputation?.[index]?.arcId,
          faction,
          value: Number.isFinite(value) ? value : 0,
          history: player.reputation?.[index]?.history ?? [],
        });
      });
    return entries;
  }

  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchPlayer(player.id, {
        characterName: draft.characterName.trim(),
        playerName: draft.playerName.trim(),
        race: draft.race.trim(),
        class: draft.class.trim(),
        level: draft.level.trim(),
        image: draft.image,
        description: draft.description.trim(),
        backstory: draft.backstory.trim(),
        personality: draft.personality.trim(),
        ideals: draft.ideals.trim(),
        bonds: draft.bonds.trim(),
        flaws: draft.flaws.trim(),
        dmNotes: draft.dmNotes.trim(),
        dmSecrets: draft.dmSecrets.trim(),
        journal: parseJournal(),
        tags: draft.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
        relatedNpcs: draft.relatedNpcs,
        relatedQuests: draft.relatedQuests,
        reputation: parseReputation(),
      });
      onDone();
    }}>
      <label>Имя персонажа<input value={draft.characterName} onChange={(e) => setDraft({ ...draft, characterName: e.target.value })} /></label>
      <label>Игрок<input value={draft.playerName} onChange={(e) => setDraft({ ...draft, playerName: e.target.value })} /></label>
      <label>Раса<input value={draft.race} onChange={(e) => setDraft({ ...draft, race: e.target.value })} /></label>
      <label>Класс<input value={draft.class} onChange={(e) => setDraft({ ...draft, class: e.target.value })} /></label>
      <label>Уровень<input value={draft.level} onChange={(e) => setDraft({ ...draft, level: e.target.value })} /></label>
      <ImagePickerField value={draft.image} data={data} onChange={(image) => setDraft({ ...draft, image })} />
      <label>Описание<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Предыстория<textarea value={draft.backstory} onChange={(e) => setDraft({ ...draft, backstory: e.target.value })} /></label>
      <label>Характер<textarea value={draft.personality} onChange={(e) => setDraft({ ...draft, personality: e.target.value })} /></label>
      <label>Идеалы<textarea value={draft.ideals} onChange={(e) => setDraft({ ...draft, ideals: e.target.value })} /></label>
      <label>Привязанности<textarea value={draft.bonds} onChange={(e) => setDraft({ ...draft, bonds: e.target.value })} /></label>
      <label>Слабости<textarea value={draft.flaws} onChange={(e) => setDraft({ ...draft, flaws: e.target.value })} /></label>
      <label>Теги<input value={draft.tags} onChange={(e) => setDraft({ ...draft, tags: e.target.value })} /></label>
      <fieldset className="entity-editor-linkset">
        <legend>Связанные NPC</legend>
        {data.npcs.length === 0 ? (
          <p className="muted">NPC не найдены.</p>
        ) : (
          data.npcs.map((npc) => (
            <label key={npc.id} className="entity-editor-check">
              <input
                type="checkbox"
                checked={draft.relatedNpcs.includes(npc.id)}
                onChange={() => toggleDraftList('relatedNpcs', npc.id)}
              />
              <span>{npc.name}</span>
            </label>
          ))
        )}
      </fieldset>
      <fieldset className="entity-editor-linkset">
        <legend>Связанные квесты</legend>
        {data.quests.length === 0 ? (
          <p className="muted">Квесты не найдены.</p>
        ) : (
          data.quests.map((quest) => (
            <label key={quest.id} className="entity-editor-check">
              <input
                type="checkbox"
                checked={draft.relatedQuests.includes(quest.id)}
                onChange={() => toggleDraftList('relatedQuests', quest.id)}
              />
              <span>{getEntityTitle(quest)}</span>
            </label>
          ))
        )}
      </fieldset>
      <label>Журнал<textarea value={draft.journalText} onChange={(e) => setDraft({ ...draft, journalText: e.target.value })} placeholder="Дата: запись" /></label>
      <label>Репутация<textarea value={draft.reputationText} onChange={(e) => setDraft({ ...draft, reputationText: e.target.value })} placeholder="Фракция: 0" /></label>
      <label>Заметки ДМ<textarea value={draft.dmNotes} onChange={(e) => setDraft({ ...draft, dmNotes: e.target.value })} /></label>
      <label>Секреты ДМ<textarea value={draft.dmSecrets} onChange={(e) => setDraft({ ...draft, dmSecrets: e.target.value })} /></label>
      <EditorActions disabled={!draft.characterName.trim()} onCancel={onDone} onReset={() => store.resetOverride('player', player.id)} />
    </form>
  );
}

function NpcEditor({ npc, data, onDone }: { npc: DmNpc; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    name: npc.name,
    race: npc.race ?? '',
    role: npc.role ?? '',
    location: npc.location ?? '',
    personality: npc.personality ?? '',
    goals: npc.goals ?? '',
    knowledge: npc.knowledge ?? '',
    secrets: npc.secrets ?? '',
    notes: npc.notes ?? npc.dmNotes ?? '',
    image: npc.image ?? '',
    visibleToPlayers: npc.visibleToPlayers === true,
  });

  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchNpc(npc.id, {
        name: draft.name.trim(),
        race: draft.race.trim(),
        role: draft.role.trim(),
        location: draft.location.trim(),
        personality: draft.personality.trim() || undefined,
        goals: draft.goals.trim() || undefined,
        knowledge: draft.knowledge.trim() || undefined,
        secrets: draft.secrets.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        image: draft.image || undefined,
        visibleToPlayers: draft.visibleToPlayers,
      });
      onDone();
    }}>
      <label>Имя<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Раса<input value={draft.race} onChange={(e) => setDraft({ ...draft, race: e.target.value })} /></label>
      <label>Роль<input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></label>
      <label>Локация<select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>
        <option value="">Не задана</option>
        {data.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
      </select></label>
      <ImagePickerField value={draft.image} data={data} onChange={(image) => setDraft({ ...draft, image })} />
      <label>Характер<textarea value={draft.personality} onChange={(e) => setDraft({ ...draft, personality: e.target.value })} /></label>
      <label>Цели<textarea value={draft.goals} onChange={(e) => setDraft({ ...draft, goals: e.target.value })} /></label>
      <label>Что знает<textarea value={draft.knowledge} onChange={(e) => setDraft({ ...draft, knowledge: e.target.value })} /></label>
      <label>Секреты<textarea value={draft.secrets} onChange={(e) => setDraft({ ...draft, secrets: e.target.value })} /></label>
      <label>Заметки ДМ<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <label className="reveal-toggle"><input type="checkbox" checked={draft.visibleToPlayers} onChange={(e) => setDraft({ ...draft, visibleToPlayers: e.target.checked })} /> Видим игрокам</label>
      <EditorActions disabled={!draft.name.trim()} onCancel={onDone} onReset={() => store.resetOverride('npc', npc.id)} />
    </form>
  );
}

function QuestEditor({ quest, data, onDone }: { quest: DmQuest; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    title: getEntityTitle(quest),
    status: effectiveSafeQuestStatus(quest, store),
    location: quest.location ?? '',
    giver: quest.giver ?? '',
    goal: quest.goal ?? '',
    description: quest.description ?? '',
    reward: quest.reward ?? '',
    proof: quest.proof ?? '',
    consequences: quest.consequences ?? '',
	    notes: quest.notes ?? '',
	    image: quest.image ?? '',
	    enemies: quest.enemies ?? [],
      enemySearch: '',
	  });
  const enemySearch = draft.enemySearch.trim().toLowerCase();
  const enemyOptions = data.enemies
    .filter((enemy) => (enemy.arcId ?? quest.arcId ?? 'arc-1') === (quest.arcId ?? 'arc-1'))
    .filter((enemy) => !enemySearch || [enemy.name, enemy.role, enemy.faction, enemy.cr].some((v) => safeText(v).toLowerCase().includes(enemySearch)))
    .sort((a, b) => getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru'));

  function toggleEnemy(enemyId: string) {
    setDraft((current) => {
      const selected = current.enemies.includes(enemyId)
        ? current.enemies.filter((id) => id !== enemyId)
        : [...current.enemies, enemyId];
      return { ...current, enemies: selected };
    });
  }

  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchQuest(quest.id, {
        title: draft.title.trim(),
        status: draft.status,
        location: draft.location.trim(),
        giver: draft.giver.trim() || undefined,
        goal: draft.goal.trim() || undefined,
        description: draft.description.trim() || undefined,
        reward: draft.reward.trim() || undefined,
        proof: draft.proof.trim() || undefined,
        consequences: draft.consequences.trim() || undefined,
        notes: draft.notes.trim() || undefined,
        image: draft.image || undefined,
        enemies: draft.enemies,
      });
      const selectedEnemyIds = new Set(draft.enemies);
      for (const enemy of data.enemies) {
        const hadQuest = (enemy.questIds ?? []).includes(quest.id);
        const shouldHaveQuest = selectedEnemyIds.has(enemy.id);
        if (hadQuest === shouldHaveQuest) continue;
        store.patchEnemy(enemy.id, {
          questIds: shouldHaveQuest
            ? [...(enemy.questIds ?? []), quest.id]
            : (enemy.questIds ?? []).filter((id) => id !== quest.id),
        });
      }
      store.setQuestStatus(quest.id, draft.status);
      onDone();
    }}>
      <label>Название<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>Статус<select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as QuestStatus })}>
        {(Object.keys(QUEST_STATUS_LABELS) as QuestStatus[]).map((status) => <option key={status} value={status}>{QUEST_STATUS_LABELS[status]}</option>)}
      </select></label>
      <label>Локация<select value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })}>
        <option value="">Не задана</option>
        {data.locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
      </select></label>
      <label>Квестодатель<select value={draft.giver} onChange={(e) => setDraft({ ...draft, giver: e.target.value })}>
        <option value="">Не задан</option>
        {data.npcs.map((npc) => <option key={npc.id} value={npc.id}>{npc.name}</option>)}
      </select></label>
      <ImagePickerField value={draft.image} data={data} onChange={(image) => setDraft({ ...draft, image })} />
      <label>Цель<textarea value={draft.goal} onChange={(e) => setDraft({ ...draft, goal: e.target.value })} /></label>
      <label>Описание<textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      <label>Награда<textarea value={draft.reward} onChange={(e) => setDraft({ ...draft, reward: e.target.value })} /></label>
      <label>Подтверждение<textarea value={draft.proof} onChange={(e) => setDraft({ ...draft, proof: e.target.value })} /></label>
	      <label>Последствия<textarea value={draft.consequences} onChange={(e) => setDraft({ ...draft, consequences: e.target.value })} /></label>
	      <section className="entity-link-editor">
	        <h3>Враги квеста</h3>
	        <input
	          value={draft.enemySearch}
	          onChange={(e) => setDraft({ ...draft, enemySearch: e.target.value })}
	          placeholder="Найти врага..."
	        />
	        <div className="entity-link-list">
	          {enemyOptions.map((enemy) => (
	            <label key={enemy.id} className="entity-link-row">
	              <input
	                type="checkbox"
	                checked={draft.enemies.includes(enemy.id)}
	                onChange={() => toggleEnemy(enemy.id)}
	              />
	              <span>
	                <strong>{enemy.name}</strong>
	                <small>{[enemy.role, enemy.cr ? `CR ${enemy.cr}` : '', enemy.faction].filter(Boolean).join(' · ')}</small>
	              </span>
	            </label>
	          ))}
	        </div>
	      </section>
	      <label>Заметки ДМ<textarea value={draft.notes} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} /></label>
      <EditorActions disabled={!draft.title.trim()} onCancel={onDone} onReset={() => store.resetOverride('quest', quest.id)} />
    </form>
  );
}

function EnemyEditor({ enemy, data, onDone }: { enemy: DmCustomEnemy; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    name: enemy.name,
    role: enemy.role ?? '',
    faction: enemy.faction ?? '',
    cr: enemy.cr ?? '',
    ac: enemy.ac?.toString() ?? '',
    hp: enemy.hp?.toString() ?? '',
    lore: enemy.lore ?? '',
    tactics: enemy.tactics ?? '',
	    image: enemy.image ?? '',
	    dmNotes: enemy.dmNotes ?? '',
	    locationIds: enemy.locationIds ?? [],
	    questIds: enemy.questIds ?? [],
	    locationSearch: '',
	    questSearch: '',
	  });
  const locationSearch = draft.locationSearch.trim().toLowerCase();
  const locationOptions = data.locations
    .filter((location) => !location.arcId || location.arcId === (enemy.arcId ?? 'arc-1'))
    .filter((location) => !locationSearch || [location.name, location.type, location.region, ...(location.tags ?? [])].some((v) => safeText(v).toLowerCase().includes(locationSearch)))
    .sort((a, b) => safeText(a.name).localeCompare(safeText(b.name), 'ru'));
  const questSearch = draft.questSearch.trim().toLowerCase();
  const questOptions = data.quests
    .filter((quest) => (quest.arcId ?? enemy.arcId ?? 'arc-1') === (enemy.arcId ?? 'arc-1'))
    .filter((quest) => !questSearch || [quest.title, quest.goal, quest.description].some((v) => safeText(v).toLowerCase().includes(questSearch)))
    .sort((a, b) => getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru'));

  function toggleLocation(locationId: string) {
    setDraft((current) => {
      const selected = current.locationIds.includes(locationId)
        ? current.locationIds.filter((id) => id !== locationId)
        : [...current.locationIds, locationId];
      return { ...current, locationIds: selected };
    });
  }

  function toggleQuest(questId: string) {
    setDraft((current) => {
      const selected = current.questIds.includes(questId)
        ? current.questIds.filter((id) => id !== questId)
        : [...current.questIds, questId];
      return { ...current, questIds: selected };
    });
  }
  return (
    <form className="entity-inline-editor" onSubmit={(e) => {
      e.preventDefault();
      store.patchEnemy(enemy.id, {
        name: draft.name.trim(),
        role: draft.role.trim() || undefined,
        faction: draft.faction.trim() || undefined,
        cr: draft.cr.trim() || undefined,
        ac: draft.ac.trim() ? Number(draft.ac) : undefined,
        hp: draft.hp.trim() ? Number(draft.hp) : undefined,
	        lore: draft.lore.trim() || undefined,
	        tactics: draft.tactics.trim() || undefined,
	        image: draft.image || undefined,
	        dmNotes: draft.dmNotes.trim() || undefined,
	        locationIds: draft.locationIds,
	        questIds: draft.questIds,
	      });
	      const selectedLocationIds = new Set(draft.locationIds);
	      for (const locationState of data.locationStates) {
	        const shouldHaveEnemy = selectedLocationIds.has(locationState.locationId) || selectedLocationIds.has(locationState.id);
	        const hadEnemy = locationState.enemyIds.includes(enemy.id);
	        if (hadEnemy === shouldHaveEnemy) continue;
	        store.patchLocationState(locationState.id, {
	          enemyIds: shouldHaveEnemy
	            ? [...locationState.enemyIds, enemy.id]
	            : locationState.enemyIds.filter((id) => id !== enemy.id),
	        });
	      }
	      const selectedQuestIds = new Set(draft.questIds);
	      for (const quest of data.quests) {
	        const hadEnemy = (quest.enemies ?? []).includes(enemy.id);
	        const shouldHaveEnemy = selectedQuestIds.has(quest.id);
	        if (hadEnemy === shouldHaveEnemy) continue;
	        store.patchQuest(quest.id, {
	          enemies: shouldHaveEnemy
	            ? [...(quest.enemies ?? []), enemy.id]
	            : (quest.enemies ?? []).filter((id) => id !== enemy.id),
	        });
	      }
	      onDone();
    }}>
      <label>Имя<input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
      <label>Роль<input value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value })} /></label>
      <label>Фракция<input value={draft.faction} onChange={(e) => setDraft({ ...draft, faction: e.target.value })} /></label>
      <label>CR<input value={draft.cr} onChange={(e) => setDraft({ ...draft, cr: e.target.value })} /></label>
      <label>AC<input type="number" value={draft.ac} onChange={(e) => setDraft({ ...draft, ac: e.target.value })} /></label>
      <label>HP<input type="number" value={draft.hp} onChange={(e) => setDraft({ ...draft, hp: e.target.value })} /></label>
      <ImagePickerField value={draft.image} data={data} onChange={(image) => setDraft({ ...draft, image })} />
      <label>Лор<textarea value={draft.lore} onChange={(e) => setDraft({ ...draft, lore: e.target.value })} /></label>
	      <label>Тактика<textarea value={draft.tactics} onChange={(e) => setDraft({ ...draft, tactics: e.target.value })} /></label>
	      <section className="entity-link-editor">
	        <h3>Связанные локации</h3>
	        <input
	          value={draft.locationSearch}
	          onChange={(e) => setDraft({ ...draft, locationSearch: e.target.value })}
	          placeholder="Найти локацию..."
	        />
	        <div className="entity-link-list">
	          {locationOptions.map((location) => (
	            <label key={location.id} className="entity-link-row">
	              <input
	                type="checkbox"
	                checked={draft.locationIds.includes(location.id)}
	                onChange={() => toggleLocation(location.id)}
	              />
	              <span>
	                <strong>{location.name}</strong>
	                <small>{[location.type, location.region].filter(Boolean).join(' · ')}</small>
	              </span>
	            </label>
	          ))}
	        </div>
	      </section>
	      <section className="entity-link-editor">
	        <h3>Связанные квесты</h3>
	        <input
	          value={draft.questSearch}
	          onChange={(e) => setDraft({ ...draft, questSearch: e.target.value })}
	          placeholder="Найти квест..."
	        />
	        <div className="entity-link-list">
	          {questOptions.map((quest) => (
	            <label key={quest.id} className="entity-link-row">
	              <input
	                type="checkbox"
	                checked={draft.questIds.includes(quest.id)}
	                onChange={() => toggleQuest(quest.id)}
	              />
              <span>
                <strong>{getEntityTitle(quest)}</strong>
                <small>{QUEST_STATUS_LABELS[effectiveSafeQuestStatus(quest, store)]}</small>
              </span>
	            </label>
	          ))}
	        </div>
	      </section>
	      <label>Заметки ДМ<textarea value={draft.dmNotes} onChange={(e) => setDraft({ ...draft, dmNotes: e.target.value })} /></label>
      <EditorActions disabled={!draft.name.trim()} onCancel={onDone} onReset={() => store.resetOverride('enemy', enemy.id)} />
    </form>
  );
}

function EditorActions({ disabled, onCancel, onReset }: { disabled: boolean; onCancel: () => void; onReset: () => void }) {
  return (
    <div className="entity-editor-actions">
      <button className="btn-primary" type="submit" disabled={disabled}>Сохранить</button>
      <button type="button" onClick={onCancel}>Отмена</button>
      <button type="button" className="btn-secondary" onClick={() => {
        if (window.confirm('Сбросить локальные правки этой карточки?')) onReset();
      }}>
        Сбросить локальные правки
      </button>
    </div>
  );
}

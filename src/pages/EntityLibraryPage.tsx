import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { effectiveQuestStatus } from '../data/selectors';
import type { CampaignData } from '../data/loadCampaignData';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import type { QuestStatus } from '../types';
import type { DmCustomEnemy, DmNpc, DmPlayer, DmQuest } from '../types/dmCompanion';
import { CompanionEnemyCard } from '../features/embedded-dm-companion/CompanionEnemyCard';
import { CompanionNpcCard } from '../features/embedded-dm-companion/CompanionNpcCard';
import { CompanionQuestCard } from '../features/embedded-dm-companion/CompanionQuestCard';
import { BATTLE_MAP_ASSET_ORIGIN } from '../config';
import type { BattleMapManifestEntry } from '../data/battleMapManifest';

export type EntityLibraryKind = 'npc' | 'quests' | 'enemies' | 'bestiary' | 'players' | 'battleMaps';
type EntitySortKey = 'name_asc' | 'name_desc' | 'location' | 'status' | 'role';

const QUEST_STATUS_LABELS: Record<QuestStatus, string> = {
  active: 'Активен',
  completed: 'Завершён',
  failed: 'Провален',
  hidden: 'Скрыт',
};

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
  if ('title' in item) return item.title;
  if ('characterName' in item) return item.characterName;
  return item.name;
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
      const aLoc = data.locations.find((loc) => loc.id === aLocId)?.name ?? aLocId ?? '';
      const bLoc = data.locations.find((loc) => loc.id === bLocId)?.name ?? bLocId ?? '';
      return aLoc.localeCompare(bLoc, 'ru') || getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru');
    }
    if (sortKey === 'status') {
      const aStatus = 'status' in a ? effectiveQuestStatus(a.id, a.status, store.progress) : '';
      const bStatus = 'status' in b ? effectiveQuestStatus(b.id, b.status, store.progress) : '';
      return aStatus.localeCompare(bStatus, 'ru') || getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru');
    }
    if (sortKey === 'role') {
      const aRole = 'role' in a ? a.role ?? '' : '';
      const bRole = 'role' in b ? b.role ?? '' : '';
      return aRole.localeCompare(bRole, 'ru') || getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru');
    }
    return getEntityTitle(a).localeCompare(getEntityTitle(b), 'ru');
  });
}

export function EntityLibraryPage({ kind }: { kind: EntityLibraryKind }) {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [questStatusFilter, setQuestStatusFilter] = useState<QuestStatus | 'all'>('all');
  const [npcLocationFilter, setNpcLocationFilter] = useState('all');
  const [npcRoleFilter, setNpcRoleFilter] = useState('all');
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
  const enemyRoleOptions = useMemo(() => {
    if (!data) return [];
	    return Array.from(new Set(data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId).map((enemy) => enemy.role).filter((role): role is string => Boolean(role)))).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [arcId, data]);
  const enemyLocationOptions = useMemo(() => {
    if (!data) return [];
    const ids = new Set(data.enemies.flatMap((enemy) => enemy.locationIds ?? []));
    return Array.from(ids)
      .map((id) => ({ id, name: data.locations.find((loc) => loc.id === id)?.name ?? id }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }, [data]);
  const enemyQuestOptions = useMemo(() => {
    if (!data) return [];
    const ids = new Set(data.enemies.flatMap((enemy) => enemy.questIds ?? []));
    return Array.from(ids)
      .map((id) => ({ id, title: data.quests.find((quest) => quest.id === id)?.title ?? id }))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [data]);
  const enemyFactionOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.enemies.map((enemy) => enemy.faction).filter((faction): faction is string => Boolean(faction)))).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [data]);
  const enemyCrOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.enemies.map((enemy) => enemy.cr).filter((cr): cr is string => Boolean(cr)))).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  }, [data]);
  const enemyTagOptions = useMemo(() => {
    if (!data) return [];
    return Array.from(new Set(data.enemies.flatMap((enemy) => enemy.tags ?? []))).sort((a, b) => a.localeCompare(b, 'ru'));
  }, [data]);

  const items = useMemo(() => {
    if (!data) return [];
    if (kind === 'npc') {
      return sortEntities(data.npcs
        .filter((n) => (n.arcId ?? 'arc-1') === arcId)
        .filter((n) => npcLocationFilter === 'all' || n.location === npcLocationFilter)
        .filter((n) => npcRoleFilter === 'all' || n.role === npcRoleFilter)
        .filter((n) => !q || [n.name, n.role, n.race, n.faction, n.location].some((v) => (v ?? '').toLowerCase().includes(q))), sortKey, data, store);
    }
    if (kind === 'quests') {
      return sortEntities(data.quests
        .filter((quest) => (quest.arcId ?? 'arc-1') === arcId)
        .filter((quest) => questStatusFilter === 'all' || effectiveQuestStatus(quest.id, quest.status, store.progress) === questStatusFilter)
        .filter((quest) => !q || [quest.title, quest.goal, quest.description, quest.location].some((v) => (v ?? '').toLowerCase().includes(q))), sortKey, data, store);
    }
    if (kind === 'players') {
      return sortEntities(data.players
        .filter((player) => !q || [player.characterName, player.playerName, player.race, player.class, player.description, player.dmNotes].some((v) => (v ?? '').toLowerCase().includes(q))), sortKey, data, store);
    }
    return sortEntities(data.enemies.filter((enemy) => (enemy.arcId ?? 'arc-1') === arcId)
      .filter((enemy) => enemyRoleFilter === 'all' || enemy.role === enemyRoleFilter)
      .filter((enemy) => enemyLocationFilter === 'all' || (enemy.locationIds ?? []).includes(enemyLocationFilter))
      .filter((enemy) => enemyQuestFilter === 'all' || (enemy.questIds ?? []).includes(enemyQuestFilter))
      .filter((enemy) => enemyFactionFilter === 'all' || enemy.faction === enemyFactionFilter)
      .filter((enemy) => enemyCrFilter === 'all' || enemy.cr === enemyCrFilter)
      .filter((enemy) => enemyTagFilter === 'all' || (enemy.tags ?? []).includes(enemyTagFilter))
      .filter((enemy) => !q || [enemy.name, enemy.role, enemy.faction, enemy.cr, enemy.baseMonsterName, ...(enemy.tags ?? [])].some((v) => (v ?? '').toLowerCase().includes(q))), sortKey, data, store);
  }, [arcId, data, enemyCrFilter, enemyFactionFilter, enemyLocationFilter, enemyQuestFilter, enemyRoleFilter, enemyTagFilter, kind, npcLocationFilter, npcRoleFilter, q, questStatusFilter, sortKey, store]);

  if (loading) return <p className="page">Загрузка…</p>;
  if (error || !data) return <p className="page">Ошибка загрузки: {error}</p>;
  if (kind === 'bestiary') return <BestiaryEntityLibraryPage arcId={arcId} timelineTitle={timeline?.title ?? ''} />;
  if (kind === 'battleMaps') return <BattleMapsEntityLibraryPage data={data} arcId={arcId} />;

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
            <select
              className="entity-library-filter"
              value={questStatusFilter}
              onChange={(e) => {
                setQuestStatusFilter(e.target.value as QuestStatus | 'all');
                setSelectedId(null);
                setEditing(false);
              }}
            >
              <option value="all">Все статусы</option>
              {(Object.keys(QUEST_STATUS_LABELS) as QuestStatus[]).map((status) => (
                <option key={status} value={status}>{QUEST_STATUS_LABELS[status]}</option>
              ))}
            </select>
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
                {enemyQuestOptions.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}
              </select>
              <select className="entity-library-filter" value={enemyFactionFilter} onChange={(e) => { setEnemyFactionFilter(e.target.value); setSelectedId(null); setEditing(false); }}>
                <option value="all">Фракция: все</option>
                {enemyFactionOptions.map((faction) => <option key={faction} value={faction}>{faction}</option>)}
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
              const subtitle =
                kind === 'npc'
                  ? [(item as DmNpc).role, data.locations.find((l) => l.id === (item as DmNpc).location)?.name ?? (item as DmNpc).location].filter(Boolean).join(' · ')
                  : kind === 'quests'
                    ? QUEST_STATUS_LABELS[effectiveQuestStatus(item.id, (item as DmQuest).status, store.progress)]
                      : kind === 'players'
                        ? [(item as DmPlayer).playerName, (item as DmPlayer).race, (item as DmPlayer).class, (item as DmPlayer).level ? `ур. ${(item as DmPlayer).level}` : undefined].filter(Boolean).join(' · ')
                      : [(item as DmCustomEnemy).role, (item as DmCustomEnemy).cr ? `CR ${(item as DmCustomEnemy).cr}` : undefined].filter(Boolean).join(' · ');
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
                    <strong>{kind === 'quests' ? (item as DmQuest).title : kind === 'players' ? (item as DmPlayer).characterName : (item as DmNpc | DmCustomEnemy).name}</strong>
                    {subtitle && <span>{subtitle}</span>}
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
                {kind !== 'players' && (
                  <button className="btn-primary" onClick={() => setEditing((v) => !v)}>
                    {editing ? 'Закрыть редактор' : 'Редактировать'}
                  </button>
                )}
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
        <strong>Пакетная привязка к локациям</strong>
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
        <button className="btn-primary" disabled={!selectedLocationIds.size || !selectedMapIds.size} onClick={bindSelected}>
          Привязать выбранные карты ({selectedMapIds.size}) к локациям ({selectedLocationIds.size})
        </button>
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
      </div>

      <section className="battle-map-page-grid">
        {filteredMaps.map((map) => {
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
  if (kind === 'players') return <PlayerCard player={entity as DmPlayer} data={data} />;
  return <EnemyEditor enemy={entity as DmCustomEnemy} data={data} onDone={onDone} />;
}

function PlayerCard({ player, data }: { player: DmPlayer; data: CampaignData }) {
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
      {player.image && <img className="companion-source-hero" src={player.image} alt={player.characterName} />}
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
          <p>{relatedNpcs.map((npc) => npc.name).join(', ')}</p>
        </>
      )}
      {relatedQuests.length > 0 && (
        <>
          <h4>Связанные квесты</h4>
          <p>{relatedQuests.map((quest) => quest.title).join(', ')}</p>
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
    title: quest.title,
    status: effectiveQuestStatus(quest.id, quest.status, store.progress),
    location: quest.location ?? '',
    giver: quest.giver ?? '',
    goal: quest.goal ?? '',
    description: quest.description ?? '',
    reward: quest.reward ?? '',
    proof: quest.proof ?? '',
    consequences: quest.consequences ?? '',
	    notes: quest.notes ?? '',
	    enemies: quest.enemies ?? [],
      enemySearch: '',
	  });
  const enemySearch = draft.enemySearch.trim().toLowerCase();
  const enemyOptions = data.enemies
    .filter((enemy) => (enemy.arcId ?? quest.arcId ?? 'arc-1') === (quest.arcId ?? 'arc-1'))
    .filter((enemy) => !enemySearch || [enemy.name, enemy.role, enemy.faction, enemy.cr].some((v) => (v ?? '').toLowerCase().includes(enemySearch)))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));

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
	    dmNotes: enemy.dmNotes ?? '',
	    questIds: enemy.questIds ?? [],
	    questSearch: '',
	  });
  const questSearch = draft.questSearch.trim().toLowerCase();
  const questOptions = data.quests
    .filter((quest) => (quest.arcId ?? enemy.arcId ?? 'arc-1') === (enemy.arcId ?? 'arc-1'))
    .filter((quest) => !questSearch || [quest.title, quest.goal, quest.description].some((v) => (v ?? '').toLowerCase().includes(questSearch)))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));

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
	        dmNotes: draft.dmNotes.trim() || undefined,
	        questIds: draft.questIds,
	      });
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
      <label>Лор<textarea value={draft.lore} onChange={(e) => setDraft({ ...draft, lore: e.target.value })} /></label>
	      <label>Тактика<textarea value={draft.tactics} onChange={(e) => setDraft({ ...draft, tactics: e.target.value })} /></label>
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
	                <strong>{quest.title}</strong>
	                <small>{QUEST_STATUS_LABELS[effectiveQuestStatus(quest.id, quest.status, store.progress)]}</small>
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

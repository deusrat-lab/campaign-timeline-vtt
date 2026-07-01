import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import type { CampaignData } from '../data/loadCampaignData';

type SearchKind =
  | 'location'
  | 'npc'
  | 'quest'
  | 'enemy'
  | 'player'
  | 'shop'
  | 'tavern'
  | 'economy'
  | 'image'
  | 'faction'
  | 'battleMap';

interface SearchResult {
  id: string;
  kind: SearchKind;
  title: string;
  subtitle: string;
  body: string;
  tags: string[];
  to: string;
  imageUrl?: string;
  dmOnly?: boolean;
}

const KIND_LABELS: Record<SearchKind, string> = {
  location: 'Локации',
  npc: 'NPC',
  quest: 'Квесты',
  enemy: 'Враги',
  player: 'Игроки',
  shop: 'Магазины',
  tavern: 'Таверны',
  economy: 'Экономика',
  image: 'Картинки',
  faction: 'Фракции',
  battleMap: 'Карты боя',
};

const KIND_ORDER: SearchKind[] = [
  'location',
  'npc',
  'quest',
  'enemy',
  'player',
  'shop',
  'tavern',
  'economy',
  'image',
  'faction',
  'battleMap',
];

function normalize(value: unknown): string {
  return String(value ?? '').toLocaleLowerCase('ru-RU').replace(/ё/g, 'е');
}

function compact(values: Array<string | undefined | null>): string {
  return values.map((value) => value?.trim()).filter(Boolean).join(' · ');
}

function matches(query: string, values: Array<unknown>): boolean {
  const q = normalize(query);
  return values.some((value) => {
    if (Array.isArray(value)) return value.some((item) => normalize(item).includes(q));
    return normalize(value).includes(q);
  });
}

function imageById(data: CampaignData, id?: string): string | undefined {
  if (!id) return undefined;
  const image = data.images.find((item) => item.id === id);
  return image?.thumbnailSrc ?? image?.src;
}

function locationName(data: CampaignData, id?: string): string {
  return data.locations.find((location) => location.id === id)?.name ?? id ?? '';
}

function buildResults(data: CampaignData, timelineId: string): SearchResult[] {
  const currentLocationStates = data.locationStates.filter((state) => state.timelineId === timelineId);
  const results: SearchResult[] = [];

  for (const state of currentLocationStates) {
    const location = data.locations.find((item) => item.id === state.locationId);
    results.push({
      id: state.id,
      kind: 'location',
      title: state.title,
      subtitle: compact([state.type ?? location?.type, location?.region, state.status]),
      body: compact([state.publicDescription, state.playerSafeDescription, state.dmNotes, location?.description, location?.dmSecrets]),
      tags: [...(state.tags ?? []), ...(location?.tags ?? [])],
      to: `/map?selected=${encodeURIComponent(state.id)}`,
      imageUrl: imageById(data, state.imageIds[0] ?? location?.images?.[0]),
      dmOnly: state.status === 'hidden' || state.visibleToPlayers === false,
    });
  }

  for (const npc of data.npcs) {
    results.push({
      id: npc.id,
      kind: 'npc',
      title: npc.name,
      subtitle: compact([npc.role, npc.race, locationName(data, npc.location)]),
      body: compact([npc.personality, npc.goals, npc.knowledge, npc.secrets, npc.notes, npc.dmNotes]),
      tags: npc.tags ?? [],
      to: `/npc?selected=${encodeURIComponent(npc.id)}`,
      imageUrl: imageById(data, npc.image),
      dmOnly: npc.visibleToPlayers === false,
    });
  }

  for (const quest of data.quests) {
    results.push({
      id: quest.id,
      kind: 'quest',
      title: quest.title,
      subtitle: compact([quest.status, locationName(data, quest.location), quest.goal]),
      body: compact([
        quest.description,
        Array.isArray(quest.solutions) ? quest.solutions.join(' ') : quest.solutions,
        quest.consequences,
        quest.proof,
        quest.reward,
      ]),
      tags: quest.tags ?? [],
      to: `/quests?selected=${encodeURIComponent(quest.id)}`,
      imageUrl: imageById(data, quest.image),
      dmOnly: quest.status === 'hidden',
    });
  }

  for (const enemy of data.enemies) {
    results.push({
      id: enemy.id,
      kind: 'enemy',
      title: enemy.name,
      subtitle: compact([enemy.role, enemy.baseMonsterName, enemy.faction]),
      body: compact([enemy.lore, enemy.tactics, enemy.dmNotes]),
      tags: enemy.tags ?? [],
      to: `/enemies?selected=${encodeURIComponent(enemy.id)}`,
      imageUrl: imageById(data, enemy.image),
      dmOnly: true,
    });
  }

  for (const player of data.players) {
    results.push({
      id: player.id,
      kind: 'player',
      title: player.characterName,
      subtitle: compact([player.playerName, player.race, player.class, player.level ? `${player.level} ур.` : undefined]),
      body: compact([player.description, player.backstory, player.personality, player.dmNotes, player.dmSecrets, player.journal.map((entry) => entry.text).join(' ')]),
      tags: player.tags ?? [],
      to: `/players?selected=${encodeURIComponent(player.id)}`,
      imageUrl: imageById(data, player.image),
      dmOnly: true,
    });
  }

  for (const shop of data.shops) {
    results.push({
      id: shop.id,
      kind: 'shop',
      title: shop.name,
      subtitle: compact([shop.type, locationName(data, shop.location)]),
      body: compact([shop.description, shop.relationToPlayers, shop.discounts, shop.notes, shop.rumors?.join(' '), shop.items?.map((item) => item.name).join(' ')]),
      tags: shop.tags ?? [],
      to: `/services?type=shop&selected=${encodeURIComponent(shop.id)}`,
      imageUrl: imageById(data, shop.image),
      dmOnly: Boolean(shop.notes),
    });
  }

  for (const tavern of data.taverns) {
    results.push({
      id: tavern.id,
      kind: 'tavern',
      title: tavern.name,
      subtitle: compact([tavern.ownerName, locationName(data, tavern.location)]),
      body: compact([tavern.description, tavern.atmosphere, tavern.notes, tavern.rumors?.join(' '), tavern.menu?.map((item) => item.name).join(' ')]),
      tags: tavern.tags ?? [],
      to: `/services?type=tavern&selected=${encodeURIComponent(tavern.id)}`,
      imageUrl: imageById(data, tavern.imageOverrideId ?? tavern.relatedImages?.[0]),
      dmOnly: Boolean(tavern.notes),
    });
  }

  for (const item of data.economyReference) {
    results.push({
      id: item.id,
      kind: 'economy',
      title: item.name,
      subtitle: compact([item.category, `${item.price} ${item.currency}`.trim(), item.availability]),
      body: compact([item.quality, item.source, item.notes]),
      tags: [item.category, item.availability, item.quality].filter(Boolean) as string[],
      to: `/economy?selected=${encodeURIComponent(item.id)}`,
    });
  }

  for (const item of data.economy) {
    results.push({
      id: item.id,
      kind: 'economy',
      title: item.title,
      subtitle: compact([item.category, 'заметка']),
      body: compact([item.text, item.prices, item.wages, item.goods]),
      tags: item.tags ?? [],
      to: `/economy?note=${encodeURIComponent(item.id)}`,
    });
  }

  for (const image of data.images) {
    results.push({
      id: image.id,
      kind: 'image',
      title: image.title,
      subtitle: compact([image.type, image.safeForPlayers === false ? 'DM-only' : 'игрокам']),
      body: compact([image.relatedEntity, image.linkedQuestIds?.join(' '), image.linkedLocationIds?.join(' '), image.linkedEnemyIds?.join(' ')]),
      tags: [],
      to: `/images?selected=${encodeURIComponent(image.id)}`,
      imageUrl: image.thumbnailSrc ?? image.src,
      dmOnly: image.safeForPlayers === false,
    });
  }

  for (const faction of data.factions) {
    results.push({
      id: faction.id,
      kind: 'faction',
      title: faction.name,
      subtitle: compact([faction.shortName, faction.subtype, faction.leader]),
      body: compact([faction.description, faction.goals, faction.resources]),
      tags: faction.tags ?? [],
      to: `/factions?selected=${encodeURIComponent(faction.id)}`,
    });
  }

  for (const battleMap of data.battleMaps) {
    results.push({
      id: battleMap.id,
      kind: 'battleMap',
      title: battleMap.title,
      subtitle: compact([battleMap.mapSize, battleMap.gridSizeLabel, battleMap.status, battleMap.groupLabels?.join(', ')]),
      body: compact([
        battleMap.normalizedName,
        battleMap.labels?.join(' '),
        battleMap.scenes?.map((scene) => scene.name ?? scene.id).join(' '),
      ]),
      tags: [...(battleMap.labels ?? []), ...(battleMap.groupLabels ?? [])],
      to: `/battle-maps?selected=${encodeURIComponent(battleMap.id)}`,
      imageUrl: battleMap.variants.find((variant) => variant.url)?.url,
    });
  }

  return results;
}

export function SearchPage() {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();
  const [query, setQuery] = useState('');
  const [activeKinds, setActiveKinds] = useState<SearchKind[]>([]);

  const allResults = useMemo(() => (data ? buildResults(data, store.currentTimelineId) : []), [data, store.currentTimelineId]);
  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [];
    return allResults
      .filter((result) => activeKinds.length === 0 || activeKinds.includes(result.kind))
      .filter((result) => matches(q, [result.title, result.subtitle, result.body, result.tags]))
      .slice(0, 120);
  }, [activeKinds, allResults, query]);

  function toggleKind(kind: SearchKind) {
    setActiveKinds((current) => (current.includes(kind) ? current.filter((item) => item !== kind) : [...current, kind]));
  }

  if (loading) return <p className="page">Загрузка поиска...</p>;
  if (error || !data) return <p className="page">Ошибка загрузки: {error}</p>;

  return (
    <div className="page search-page">
      <header className="entity-library-header">
        <div>
          <h1>Поиск</h1>
          <p className="muted">Быстрый переход к карточкам, товарам, изображениям, фракциям и локациям текущей арки.</p>
        </div>
      </header>

      <section className="search-panel">
        <input
          autoFocus
          type="search"
          value={query}
          placeholder="Имя, место, товар, враг, заметка..."
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="entity-filter-chips">
          {KIND_ORDER.map((kind) => (
            <button key={kind} type="button" className={activeKinds.includes(kind) ? 'active' : ''} onClick={() => toggleKind(kind)}>
              {KIND_LABELS[kind]}
            </button>
          ))}
        </div>
      </section>

      {!query.trim() ? (
        <div className="search-empty">
          Введите запрос, чтобы найти сущность и сразу открыть её в нужной карточке или на карте.
        </div>
      ) : results.length === 0 ? (
        <div className="search-empty">Ничего не найдено.</div>
      ) : (
        <section className="search-results" aria-label="Результаты поиска">
          {results.map((result) => (
            <Link key={`${result.kind}:${result.id}`} className="search-result-card" to={result.to}>
              {result.imageUrl ? (
                <img src={result.imageUrl} alt="" loading="lazy" />
              ) : (
                <span className="search-result-fallback">{result.title.slice(0, 1).toLocaleUpperCase('ru-RU')}</span>
              )}
              <span className="search-result-main">
                <span className="search-result-title-row">
                  <strong>{result.title}</strong>
                  <small>{KIND_LABELS[result.kind]}</small>
                  {result.dmOnly && <small className="placement-badge">DM</small>}
                </span>
                <span>{result.subtitle}</span>
                {result.body && <em>{result.body}</em>}
                {result.tags.length > 0 && (
                  <span className="search-result-tags">
                    {result.tags.slice(0, 6).map((tag) => <small key={tag}>{tag}</small>)}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </section>
      )}
    </div>
  );
}

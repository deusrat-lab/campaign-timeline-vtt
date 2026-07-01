import { useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import type { CampaignData } from '../data/loadCampaignData';
import type { DmImageItem, ImageType } from '../types/dmCompanion';
import { CompanionImageCard } from '../features/embedded-dm-companion/CompanionImageCard';

const TYPE_LABELS: Record<ImageType, string> = {
  npc: 'NPC',
  location: 'Локации',
  enemy: 'Враги',
  item: 'Предметы',
  map: 'Карты',
  battle_map: 'Боевые карты',
  other: 'Другое',
};

const FILTERABLE_TYPES: Array<ImageType | 'all'> = ['all', 'npc', 'location', 'enemy', 'item', 'map', 'battle_map', 'other'];

function imageUrl(image: DmImageItem): string {
  return image.thumbnailSrc ?? image.src;
}

function relatedEntityLabel(data: CampaignData, id?: string): string {
  if (!id) return '';
  return (
    data.locations.find((item) => item.id === id)?.name ??
    data.npcs.find((item) => item.id === id)?.name ??
    data.enemies.find((item) => item.id === id)?.name ??
    data.quests.find((item) => item.id === id)?.title ??
    id
  );
}

function mapLocationLink(data: CampaignData, timelineId: string, locationId: string): string {
  const state = data.locationStates.find((locationState) => locationState.timelineId === timelineId && locationState.locationId === locationId);
  return state ? `/map?selected=${encodeURIComponent(state.id)}` : '/map';
}

function relatedEntityLink(data: CampaignData, timelineId: string, id?: string): string | null {
  if (!id) return null;
  if (data.locations.some((item) => item.id === id)) return mapLocationLink(data, timelineId, id);
  if (data.npcs.some((item) => item.id === id)) return `/npc?selected=${encodeURIComponent(id)}`;
  if (data.enemies.some((item) => item.id === id)) return `/enemies?selected=${encodeURIComponent(id)}`;
  if (data.quests.some((item) => item.id === id)) return `/quests?selected=${encodeURIComponent(id)}`;
  return null;
}

function makeUploadedImageId(): string {
  return `image-upload-${Date.now().toString(36)}`;
}

export function ImagesPage() {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<ImageType | 'all'>('all');
  const [visibilityFilter, setVisibilityFilter] = useState<'all' | 'safe' | 'dm'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('selected');
    if (id) {
      setSelectedId(id);
      setEditing(false);
    }
  }, [location.search]);

  const images = useMemo(() => {
    if (!data) return [];
    const q = query.trim().toLocaleLowerCase('ru-RU');
    return data.images
      .filter((image) => typeFilter === 'all' || image.type === typeFilter)
      .filter((image) => {
        if (visibilityFilter === 'safe') return image.safeForPlayers !== false;
        if (visibilityFilter === 'dm') return image.safeForPlayers === false;
        return true;
      })
      .filter((image) => {
        if (!q) return true;
        return [
          image.title,
          image.type,
          image.relatedEntity,
          relatedEntityLabel(data, image.relatedEntity),
          ...(image.linkedQuestIds ?? []),
          ...(image.linkedLocationIds ?? []),
          ...(image.linkedEnemyIds ?? []),
        ].some((field) => String(field ?? '').toLocaleLowerCase('ru-RU').includes(q));
      })
      .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  }, [data, query, typeFilter, visibilityFilter]);

  useEffect(() => {
    if (selectedId && images.some((image) => image.id === selectedId)) return;
    setSelectedId(images[0]?.id ?? null);
    setEditing(false);
  }, [images, selectedId]);

  function uploadImage(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== 'string') return;
      const id = makeUploadedImageId();
      const image: DmImageItem = {
        id,
        title: file.name.replace(/\.[^.]+$/, ''),
        src: reader.result,
        thumbnailSrc: reader.result,
        type: 'other',
        safeForPlayers: false,
      };
      store.addImage(image);
      setSelectedId(id);
      setEditing(true);
    };
    reader.readAsDataURL(file);
  }

  if (loading) return <p className="page">Загрузка изображений...</p>;
  if (error || !data) return <p className="page">Ошибка загрузки: {error}</p>;

  const selected = selectedId ? data.images.find((image) => image.id === selectedId) : images[0];
  const selectedRelatedEntity = selected?.relatedEntity;
  const selectedRelatedLink = relatedEntityLink(data, store.currentTimelineId, selectedRelatedEntity);

  return (
    <div className="page images-page">
      <header className="entity-library-header">
        <div>
          <h1>Картинки</h1>
          <p className="muted">Галерея DM Companion: просмотр, флаги показа игрокам, связи и локальные загрузки.</p>
        </div>
        <label className="btn-secondary image-upload-button">
          Загрузить
          <input
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) uploadImage(file);
              event.currentTarget.value = '';
            }}
          />
        </label>
      </header>

      <div className="image-workspace">
        <aside className="image-gallery-panel">
          <input type="search" placeholder="Название, связь, тип..." value={query} onChange={(e) => setQuery(e.target.value)} />
          <div className="entity-filter-chips">
            {FILTERABLE_TYPES.map((type) => (
              <button key={type} className={typeFilter === type ? 'active' : ''} onClick={() => setTypeFilter(type)}>
                {type === 'all' ? 'Все' : TYPE_LABELS[type]}
              </button>
            ))}
          </div>
          <div className="entity-filter-chips">
            <button className={visibilityFilter === 'all' ? 'active' : ''} onClick={() => setVisibilityFilter('all')}>Все</button>
            <button className={visibilityFilter === 'safe' ? 'active' : ''} onClick={() => setVisibilityFilter('safe')}>Игрокам</button>
            <button className={visibilityFilter === 'dm' ? 'active' : ''} onClick={() => setVisibilityFilter('dm')}>DM-only</button>
          </div>
          <div className="entity-library-count">{images.length} изображений</div>
          <div className="image-grid">
            {images.map((image) => (
              <button key={image.id} className={image.id === selected?.id ? 'image-tile active' : 'image-tile'} onClick={() => { setSelectedId(image.id); setEditing(false); }}>
                <img src={imageUrl(image)} alt="" loading="lazy" />
                <span className="image-tile-title">{image.title}</span>
                <span className={image.safeForPlayers === false ? 'image-tile-badge image-tile-badge--dm' : 'image-tile-badge'}>{image.safeForPlayers === false ? 'DM' : 'Игрокам'}</span>
              </button>
            ))}
          </div>
        </aside>

        <section className="image-detail-panel">
          {!selected ? (
            <p className="muted">Изображения не найдены.</p>
          ) : (
            <>
              <div className="entity-library-actions">
                <button className="btn-primary" onClick={() => setEditing((value) => !value)}>{editing ? 'Закрыть редактор' : 'Редактировать'}</button>
                <button onClick={() => store.patchImage(selected.id, { safeForPlayers: selected.safeForPlayers === false })}>
                  {selected.safeForPlayers === false ? 'Показать игрокам' : 'Скрыть от игроков'}
                </button>
                {selectedRelatedLink && <Link className="btn-secondary" to={selectedRelatedLink}>Открыть связь</Link>}
              </div>
              {editing ? (
                <ImageEditor image={selected} data={data} onDone={() => setEditing(false)} />
              ) : (
                <CompanionImageCard
                  image={selected}
                  locationName={data.locations.find((item) => item.id === selectedRelatedEntity)?.name}
                  npcName={data.npcs.find((item) => item.id === selectedRelatedEntity)?.name}
                  enemyName={data.enemies.find((item) => item.id === selectedRelatedEntity)?.name}
                  questItems={(selected.linkedQuestIds ?? []).map((id) => ({ id, label: data.quests.find((quest) => quest.id === id)?.title ?? id }))}
                  onOpenLocation={selectedRelatedEntity ? () => navigate(mapLocationLink(data, store.currentTimelineId, selectedRelatedEntity)) : undefined}
                  onOpenNpc={selectedRelatedEntity ? () => navigate(`/npc?selected=${encodeURIComponent(selectedRelatedEntity)}`) : undefined}
                  onOpenEnemy={selectedRelatedEntity ? () => navigate(`/enemies?selected=${encodeURIComponent(selectedRelatedEntity)}`) : undefined}
                  onOpenQuest={(id) => navigate(`/quests?selected=${encodeURIComponent(id)}`)}
                />
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ImageEditor({ image, data, onDone }: { image: DmImageItem; data: CampaignData; onDone: () => void }) {
  const store = useCampaignStore();
  const [draft, setDraft] = useState({
    title: image.title,
    src: image.src,
    thumbnailSrc: image.thumbnailSrc ?? '',
    type: image.type,
    safeForPlayers: image.safeForPlayers !== false,
    relatedEntity: image.relatedEntity ?? '',
    linkedQuestIds: image.linkedQuestIds ?? [],
    linkedLocationIds: image.linkedLocationIds ?? [],
    linkedEnemyIds: image.linkedEnemyIds ?? [],
  });

  function toggleList(key: 'linkedQuestIds' | 'linkedLocationIds' | 'linkedEnemyIds', id: string) {
    setDraft((current) => {
      const list = current[key];
      return { ...current, [key]: list.includes(id) ? list.filter((itemId) => itemId !== id) : [...list, id] };
    });
  }

  return (
    <form className="entity-inline-editor" onSubmit={(event) => {
      event.preventDefault();
      store.patchImage(image.id, {
        title: draft.title.trim(),
        src: draft.src.trim(),
        thumbnailSrc: draft.thumbnailSrc.trim() || undefined,
        type: draft.type,
        safeForPlayers: draft.safeForPlayers,
        relatedEntity: draft.relatedEntity.trim() || undefined,
        linkedQuestIds: draft.linkedQuestIds,
        linkedLocationIds: draft.linkedLocationIds,
        linkedEnemyIds: draft.linkedEnemyIds,
      });
      onDone();
    }}>
      <label>Название<input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></label>
      <label>Тип<select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as ImageType })}>{Object.entries(TYPE_LABELS).map(([type, label]) => <option key={type} value={type}>{label}</option>)}</select></label>
      <label>Путь / data URL<textarea value={draft.src} onChange={(e) => setDraft({ ...draft, src: e.target.value })} /></label>
      <label>Превью<textarea value={draft.thumbnailSrc} onChange={(e) => setDraft({ ...draft, thumbnailSrc: e.target.value })} /></label>
      <label>Основная связь<select value={draft.relatedEntity} onChange={(e) => setDraft({ ...draft, relatedEntity: e.target.value })}>
        <option value="">Нет</option>
        <optgroup label="Локации">{data.locations.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
        <optgroup label="NPC">{data.npcs.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
        <optgroup label="Враги">{data.enemies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</optgroup>
        <optgroup label="Квесты">{data.quests.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</optgroup>
      </select></label>
      <label className="reveal-toggle"><input type="checkbox" checked={draft.safeForPlayers} onChange={(e) => setDraft({ ...draft, safeForPlayers: e.target.checked })} /> Безопасно для игроков</label>
      <fieldset className="entity-editor-linkset">
        <legend>Связанные квесты</legend>
        {data.quests.map((quest) => (
          <label key={quest.id} className="entity-editor-check">
            <input type="checkbox" checked={draft.linkedQuestIds.includes(quest.id)} onChange={() => toggleList('linkedQuestIds', quest.id)} />
            <span>{quest.title}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="entity-editor-linkset">
        <legend>Связанные локации</legend>
        {data.locations.map((loc) => (
          <label key={loc.id} className="entity-editor-check">
            <input type="checkbox" checked={draft.linkedLocationIds.includes(loc.id)} onChange={() => toggleList('linkedLocationIds', loc.id)} />
            <span>{loc.name}</span>
          </label>
        ))}
      </fieldset>
      <fieldset className="entity-editor-linkset">
        <legend>Связанные враги</legend>
        {data.enemies.map((enemy) => (
          <label key={enemy.id} className="entity-editor-check">
            <input type="checkbox" checked={draft.linkedEnemyIds.includes(enemy.id)} onChange={() => toggleList('linkedEnemyIds', enemy.id)} />
            <span>{enemy.name}</span>
          </label>
        ))}
      </fieldset>
      <div className="entity-editor-actions">
        <button className="btn-primary" disabled={!draft.title.trim() || !draft.src.trim()}>Сохранить</button>
        <button type="button" onClick={onDone}>Отмена</button>
        <button type="button" onClick={() => { store.resetOverride('image', image.id); onDone(); }}>Сбросить правки</button>
      </div>
    </form>
  );
}

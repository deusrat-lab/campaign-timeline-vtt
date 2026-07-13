import { useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import '../../shared/entity/sharedEntity.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';
import type { CampaignEntityType, UserCampaignMode } from '../../types/userCampaign';
import { CampaignEntityCard } from './CampaignEntityCard';
import { RichEntityLibrary } from '../../shared/entity/RichEntityLibrary';
import { buildListItems, buildDetail, type LibraryKind } from '../../shared/entity/userCampaignEntityVM';
import type { EntityKind, FilterConfig } from '../../shared/entity/types';

type Kind = LibraryKind | 'images' | 'notes';

const KIND_LABEL: Record<Kind, string> = {
  locations: 'Локации', npc: 'NPC', quests: 'Квесты', enemies: 'Враги', players: 'Игроки', factions: 'Фракции', images: 'Картинки', notes: 'Заметки',
};
const KIND_ENTITY: Record<string, CampaignEntityType> = { locations: 'location', npc: 'npc', quests: 'quest', enemies: 'enemy', players: 'party', factions: 'faction' };
const CREATE_LABEL: Record<LibraryKind, string> = { locations: 'Локация', npc: 'NPC', quests: 'Квест', enemies: 'Враг', players: 'Персонаж', factions: 'Фракция' };

function orderFromTitle(title?: string): number {
  const match = title?.match(/^\s*([A-ZА-Я]{0,2})(\d{1,3})(?:[\.\-]|$)/i);
  return match ? Number(match[2]) : 9999;
}

function alphaKey(title?: string): string {
  return (title ?? '').toLocaleLowerCase('ru');
}

export function CampaignLibraryPage() {
  const { campaignId, kind } = useParams<{ campaignId: string; kind: Kind }>();
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const [searchParams] = useSearchParams();
  const [editOpen, setEditOpen] = useState<{ type: CampaignEntityType; id: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [locFilter, setLocFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [tagFilter, setTagFilter] = useState('all');
  const [imageFilter, setImageFilter] = useState('all');
  const [sortFilter, setSortFilter] = useState('route');

  const data = campaignId ? store.getData(campaignId) : null;
  const runtime = campaignId ? store.getRuntime(campaignId) : null;
  const registryEntry = campaignId ? getCampaignById(campaignId) : undefined; // main campaign guard

  const k = (kind && KIND_LABEL[kind] ? kind : 'locations') as Kind;
  const isEntityKind = k !== 'images' && k !== 'notes';
  const asPlayer = searchParams.get('as') === 'player';
  const mode: UserCampaignMode = asPlayer ? 'playerView' : (runtime?.mode ?? 'dmView');
  const isEdit = mode === 'dmEdit';
  const isPlayer = mode === 'playerView';
  const canEdit = isEdit;
  const isPresenting = (entityType: CampaignEntityType, entityId: string) => runtime?.presentedCard?.entityType === entityType && runtime?.presentedCard?.entityId === entityId;
  const togglePresentedCard = (entityType: CampaignEntityType, entityId: string) => {
    if (!campaignId) return;
    store.updateRuntime(campaignId, (prev) => ({
      ...prev,
      presentedCard: prev.presentedCard?.entityType === entityType && prev.presentedCard?.entityId === entityId
        ? null
        : { entityType, entityId },
    }));
  };

  const q = query.trim().toLowerCase();
  const revealed = new Set(runtime?.revealedToPlayers ?? []);

  // Neutral view-models for the shared rich library (hook order stable —
  // computed before the early return; null-safe).
  const vmOpts = useMemo(() => ({
    imageUrl: (imageId?: string) => (imageId && data ? data.images.find((im) => im.id === imageId)?.src : undefined),
    onOpen: (nk: LibraryKind, id: string) => { setSelectedId(id); navigate(`/campaigns/${campaignId}/library/${nk}?sel=${id}`); },
    isPlaced: (et: EntityKind, id: string) => !!data?.mapPlacements.some((mp) => mp.entityType === et && mp.entityId === id),
    isRevealed: (id: string) => revealed.has(id),
    match: (s: string) => !q || s.toLowerCase().includes(q),
    isPlayer,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, campaignId, navigate, q, isPlayer, runtime?.revealedToPlayers]);

  const items = useMemo(() => {
    if (!data || !isEntityKind) return [];
    let list = buildListItems(k as LibraryKind, data, vmOpts);
    if (isPlayer) list = list.filter((it) => revealed.has(it.id)); // player: only revealed
    if (k === 'npc' && roleFilter !== 'all') list = list.filter((it) => data.npcs.find((n) => n.id === it.id)?.role === roleFilter);
    if (locFilter !== 'all') {
      list = list.filter((it) => {
        if (k === 'locations') return it.id === locFilter;
        if (k === 'npc') return data.npcs.find((n) => n.id === it.id)?.locationId === locFilter;
        if (k === 'quests') return data.quests.find((quest) => quest.id === it.id)?.locationId === locFilter;
        if (k === 'enemies') return data.enemies.find((enemy) => enemy.id === it.id)?.locationIds?.includes(locFilter);
        return true;
      });
    }
    if (k === 'quests' && statusFilter !== 'all') list = list.filter((it) => data.quests.find((quest) => quest.id === it.id)?.status === statusFilter);
    if (tagFilter !== 'all') {
      list = list.filter((it) => {
        const tags =
          k === 'locations' ? data.locations.find((entity) => entity.id === it.id)?.tags :
          k === 'npc' ? data.npcs.find((entity) => entity.id === it.id)?.tags :
          k === 'quests' ? data.quests.find((entity) => entity.id === it.id)?.tags :
          k === 'enemies' ? data.enemies.find((entity) => entity.id === it.id)?.tags :
          k === 'factions' ? data.factions?.find((entity) => entity.id === it.id)?.attitude ? [data.factions.find((entity) => entity.id === it.id)!.attitude!] : [] :
          [];
        return tags?.includes(tagFilter);
      });
    }
    if (imageFilter !== 'all') {
      list = list.filter((it) => imageFilter === 'with' ? !!it.imageUrl : !it.imageUrl);
    }
    const locRank = (id?: string) => {
      const loc = id ? data.locations.find((entity) => entity.id === id) : undefined;
      return [orderFromTitle(loc?.title), alphaKey(loc?.title)] as const;
    };
    const entityRank = (id: string) => {
      if (k === 'locations') {
        const loc = data.locations.find((entity) => entity.id === id);
        return [orderFromTitle(loc?.title), alphaKey(loc?.title), 0] as const;
      }
      if (k === 'quests') {
        const quest = data.quests.find((entity) => entity.id === id);
        const [rank, locTitle] = locRank(quest?.locationId);
        return [rank, locTitle, orderFromTitle(quest?.title)] as const;
      }
      if (k === 'npc') {
        const npc = data.npcs.find((entity) => entity.id === id);
        const [rank, locTitle] = locRank(npc?.locationId);
        return [rank, locTitle, orderFromTitle(npc?.name)] as const;
      }
      if (k === 'enemies') {
        const enemy = data.enemies.find((entity) => entity.id === id);
        const locRanks = (enemy?.locationIds ?? []).map((locationId) => locRank(locationId));
        const first = locRanks.sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1], 'ru'))[0] ?? [9999, ''] as const;
        return [first[0], first[1], orderFromTitle(enemy?.title)] as const;
      }
      return [9999, '', 9999] as const;
    };
    list = [...list].sort((a, b) => {
      if (sortFilter === 'name') return a.title.localeCompare(b.title, 'ru');
      if (sortFilter === 'image') return Number(!!b.imageUrl) - Number(!!a.imageUrl) || a.title.localeCompare(b.title, 'ru');
      const ar = entityRank(a.id);
      const br = entityRank(b.id);
      return ar[0] - br[0] || ar[1].localeCompare(br[1], 'ru') || ar[2] - br[2] || a.title.localeCompare(b.title, 'ru');
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, k, isEntityKind, vmOpts, isPlayer, runtime?.revealedToPlayers, roleFilter, locFilter, statusFilter, tagFilter, imageFilter, sortFilter]);

  if (!campaignId || !data || !runtime || registryEntry?.protected) {
    return (
      <div className="ucw-lib-page">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Кампания не найдена.</p>
      </div>
    );
  }

  const activeId = selectedId && items.some((it) => it.id === selectedId) ? selectedId : items[0]?.id ?? null;
  const detail = isEntityKind && activeId ? buildDetail(k as LibraryKind, activeId, data, vmOpts) : null;

  const createEntity = () => {
    let id = '';
    if (k === 'locations') id = store.addLocation(campaignId, { title: 'Новая локация' });
    else if (k === 'npc') id = store.addNpc(campaignId, { name: 'Новый NPC' });
    else if (k === 'quests') id = store.addQuest(campaignId, { title: 'Новый квест', status: 'notStarted' });
    else if (k === 'enemies') id = store.addEnemy(campaignId, { title: 'Новый враг' });
    else if (k === 'players') id = store.addPlayer(campaignId, { name: 'Новый персонаж' });
    else if (k === 'factions') id = store.addFaction(campaignId, { name: 'Новая фракция', attitude: 'neutral' });
    if (id) { setSelectedId(id); setEditOpen({ type: KIND_ENTITY[k], id }); }
  };

  const orderedLocations = [...data.locations].sort((a, b) => orderFromTitle(a.title) - orderFromTitle(b.title) || a.title.localeCompare(b.title, 'ru'));
  const tagOptions = Array.from(new Set([
    ...(k === 'locations' ? data.locations.flatMap((entity) => entity.tags ?? []) : []),
    ...(k === 'npc' ? data.npcs.flatMap((entity) => entity.tags ?? []) : []),
    ...(k === 'quests' ? data.quests.flatMap((entity) => entity.tags ?? []) : []),
    ...(k === 'enemies' ? data.enemies.flatMap((entity) => entity.tags ?? []) : []),
    ...(k === 'factions' ? (data.factions ?? []).map((entity) => entity.attitude).filter(Boolean) as string[] : []),
  ])).sort((a, b) => a.localeCompare(b, 'ru'));
  const filters: FilterConfig[] | undefined = isEntityKind ? [
    { key: 'sort', value: sortFilter, onChange: setSortFilter, options: [{ id: 'route', name: 'Сортировка: порядок локаций' }, { id: 'name', name: 'Сортировка: имя А-Я' }, { id: 'image', name: 'Сортировка: сначала с картинкой' }] },
    ...(k === 'npc' ? [{ key: 'role', value: roleFilter, onChange: setRoleFilter, options: [{ id: 'all', name: 'Роль: все' }, ...Array.from(new Set(data.npcs.map((n) => n.role).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru')).map((r) => ({ id: r, name: r }))] }] : []),
    ...(['locations', 'npc', 'quests', 'enemies'].includes(k) ? [{ key: 'loc', value: locFilter, onChange: setLocFilter, options: [{ id: 'all', name: 'Локация: все' }, ...orderedLocations.map((l) => ({ id: l.id, name: l.title }))] }] : []),
    ...(k === 'quests' ? [{ key: 'status', value: statusFilter, onChange: setStatusFilter, options: [{ id: 'all', name: 'Статус: все' }, { id: 'notStarted', name: 'notStarted' }, { id: 'active', name: 'active' }, { id: 'completed', name: 'completed' }, { id: 'failed', name: 'failed' }, { id: 'hidden', name: 'hidden' }] }] : []),
    ...(tagOptions.length ? [{ key: 'tag', value: tagFilter, onChange: setTagFilter, options: [{ id: 'all', name: 'Тег: все' }, ...tagOptions.map((tag) => ({ id: tag, name: tag }))] }] : []),
    { key: 'image', value: imageFilter, onChange: setImageFilter, options: [{ id: 'all', name: 'Визуал: все' }, { id: 'with', name: 'С картинкой' }, { id: 'missing', name: 'Без картинки' }] },
  ] : undefined;

  const type = isEntityKind ? KIND_ENTITY[k] : undefined;

  return (
    <div className="ucw-lib-page entity-library-page--wide">
      <div className="ucw-lib-page-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <button className="atlas-back-link" style={{ margin: 0 }} onClick={() => navigate(`/campaigns/${campaignId}/map`)}>← Карта</button>
          <h1>{data.title} · {KIND_LABEL[k]}</h1>
        </div>
        {asPlayer ? (
          <span className="ucw-chip">Вид игрока</span>
        ) : (
          <div className="ucw-segmented" role="group" aria-label="Режим">
            {(['dmView', 'dmEdit', 'playerView'] as UserCampaignMode[]).map((m) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => store.setMode(campaignId, m)}>
                {m === 'dmView' ? 'DM View' : m === 'dmEdit' ? 'DM Edit' : 'Player View'}
              </button>
            ))}
          </div>
        )}
      </div>

      {k === 'notes' ? (
        <NotesSection campaignId={campaignId} canEdit={canEdit} />
      ) : k === 'images' ? (
        <>
          {canEdit && <div className="atlas-toolbar"><ImageAdder campaignId={campaignId} /></div>}
          <ImagesSection campaignId={campaignId} canReveal={!isPlayer} isPlayer={isPlayer} />
        </>
      ) : (
        <RichEntityLibrary
          title={KIND_LABEL[k]}
          items={items}
          selectedId={activeId}
          onSelect={setSelectedId}
          search={query}
          onSearch={setQuery}
          filters={filters}
          onCreate={!isPlayer ? createEntity : undefined}
          createLabel={CREATE_LABEL[k as LibraryKind]}
          detail={detail}
          isPlayer={isPlayer}
          emptyLabel={!isPlayer ? `Пусто. Нажмите «+ ${CREATE_LABEL[k as LibraryKind]}».` : 'Пусто.'}
          actions={type ? {
            onOpenWindow: activeId ? () => setEditOpen({ type, id: activeId }) : undefined,
            onEdit: !isPlayer && activeId ? () => setEditOpen({ type, id: activeId }) : undefined,
            onPlace: !isPlayer && activeId ? () => navigate(`/campaigns/${campaignId}/map?place=${type}:${activeId}`) : undefined,
            onPresent: !isPlayer && activeId ? () => togglePresentedCard(type, activeId) : undefined,
            presenting: activeId ? isPresenting(type, activeId) : false,
            onToggleReveal: !isPlayer && activeId ? () => store.toggleReveal(campaignId, activeId) : undefined,
            revealed: activeId ? revealed.has(activeId) : false,
            placed: activeId ? data.mapPlacements.some((mp) => mp.entityType === type && mp.entityId === activeId) : false,
            onDelete: !isPlayer && activeId ? () => { store.deleteEntity(campaignId, type, activeId); setSelectedId(null); } : undefined,
          } : undefined}
        />
      )}

      {editOpen && (
        <CampaignEntityCard
          campaignId={campaignId}
          type={editOpen.type}
          id={editOpen.id}
          canEdit={!isPlayer}
          isPlayer={isPlayer}
          onClose={() => setEditOpen(null)}
          onPlaceOnMap={(entityType, entityId) => navigate(`/campaigns/${campaignId}/map?place=${entityType}:${entityId}`)}
        />
      )}
    </div>
  );
}

function ImageAdder({ campaignId }: { campaignId: string }) {
  const store = useUserCampaigns();
  return (
    <button className="atlas-btn" onClick={() => {
      const src = window.prompt('URL картинки (https://…):');
      if (!src) return;
      const title = window.prompt('Название:') || 'Картинка';
      store.addImage(campaignId, { title, src });
    }}>+ Картинка</button>
  );
}

function ImagesSection({ campaignId, canReveal, isPlayer }: { campaignId: string; canReveal: boolean; isPlayer: boolean }) {
  const store = useUserCampaigns();
  const data = store.getData(campaignId);
  if (!data) return null;
  const images = isPlayer ? data.images.filter((img) => img.playerSafe) : data.images;
  if (images.length === 0) return <p className="atlas-empty">{isPlayer ? 'Открытых картинок пока нет.' : 'Картинок пока нет.'}</p>;
  return (
    <div className="ucw-cardgrid">
      {images.map((img) => (
        <div key={img.id} className="ucw-ecard" style={{ cursor: 'default' }}>
          <a href={img.src} target="_blank" rel="noreferrer" title="Открыть изображение">
            <img className="atlas-map-img" src={img.src} alt={img.title} style={{ maxHeight: 140, objectFit: 'contain', background: '#050403' }} />
          </a>
          <h3>{img.title}</h3>
          {canReveal && (
            <button
              className="atlas-btn ghost small"
              style={{ alignSelf: 'flex-start', marginTop: 6 }}
              onClick={() => store.updateData(campaignId, (prev) => ({
                ...prev,
                images: prev.images.map((item) => (item.id === img.id ? { ...item, playerSafe: !item.playerSafe } : item)),
              }))}
            >
              {img.playerSafe ? '👁 Показано игрокам' : '🚫 Показать игрокам'}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

function NotesSection({ campaignId, canEdit }: { campaignId: string; canEdit: boolean }) {
  const store = useUserCampaigns();
  const data = store.getData(campaignId);
  const [text, setText] = useState('');
  if (!data) return null;
  return (
    <div>
      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
          <input className="atlas-input" style={{ flex: 1 }} placeholder="Новая заметка…" value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && text.trim()) { store.addNote(campaignId, text.trim()); setText(''); } }} />
          <button className="atlas-btn" onClick={() => { if (text.trim()) { store.addNote(campaignId, text.trim()); setText(''); } }}>+ Заметка</button>
        </div>
      )}
      {data.notes.length === 0 ? <p className="atlas-empty">Заметок пока нет.</p> : (
        <div className="ucw-cardgrid">
          {data.notes.map((n) => (
            <div key={n.id} className="ucw-ecard" style={{ cursor: 'default' }}>
              <p style={{ whiteSpace: 'pre-wrap' }}>{n.text}</p>
              <span className="meta">{new Date(n.createdAt).toLocaleString()}</span>
              {canEdit && <button className="atlas-btn ghost small" style={{ marginTop: 6, alignSelf: 'flex-start' }} onClick={() => store.removeNote(campaignId, n.id)}>Удалить</button>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

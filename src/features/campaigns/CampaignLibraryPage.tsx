import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
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

export function CampaignLibraryPage() {
  const { campaignId, kind } = useParams<{ campaignId: string; kind: Kind }>();
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const [editOpen, setEditOpen] = useState<{ type: CampaignEntityType; id: string } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [locFilter, setLocFilter] = useState('all');

  const data = campaignId ? store.getData(campaignId) : null;
  const runtime = campaignId ? store.getRuntime(campaignId) : null;
  const registryEntry = campaignId ? getCampaignById(campaignId) : undefined; // main campaign guard

  const k = (kind && KIND_LABEL[kind] ? kind : 'locations') as Kind;
  const isEntityKind = k !== 'images' && k !== 'notes';
  const mode: UserCampaignMode = runtime?.mode ?? 'dmView';
  const isEdit = mode === 'dmEdit';
  const isPlayer = mode === 'playerView';
  const canEdit = isEdit;

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
    if (k === 'npc' && locFilter !== 'all') list = list.filter((it) => data.npcs.find((n) => n.id === it.id)?.locationId === locFilter);
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, k, isEntityKind, vmOpts, isPlayer, runtime?.revealedToPlayers, roleFilter, locFilter]);

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

  // NPC filters (role, location) — same idea as the main campaign's library.
  const filters: FilterConfig[] | undefined = k === 'npc' ? [
    { key: 'role', value: roleFilter, onChange: setRoleFilter, options: [{ id: 'all', name: 'Все роли' }, ...Array.from(new Set(data.npcs.map((n) => n.role).filter(Boolean) as string[])).sort().map((r) => ({ id: r, name: r }))] },
    { key: 'loc', value: locFilter, onChange: setLocFilter, options: [{ id: 'all', name: 'Все локации' }, ...data.locations.map((l) => ({ id: l.id, name: l.title }))] },
  ] : undefined;

  const type = isEntityKind ? KIND_ENTITY[k] : undefined;

  return (
    <div className="ucw-lib-page entity-library-page--wide">
      <div className="ucw-lib-page-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <button className="atlas-back-link" style={{ margin: 0 }} onClick={() => navigate(`/campaigns/${campaignId}/map`)}>← Карта</button>
          <h1>{data.title} · {KIND_LABEL[k]}</h1>
        </div>
        <div className="ucw-segmented" role="group" aria-label="Режим">
          {(['dmView', 'dmEdit', 'playerView'] as UserCampaignMode[]).map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => store.setMode(campaignId, m)}>
              {m === 'dmView' ? 'DM View' : m === 'dmEdit' ? 'DM Edit' : 'Player View'}
            </button>
          ))}
        </div>
      </div>

      {k === 'notes' ? (
        <NotesSection campaignId={campaignId} canEdit={canEdit} />
      ) : k === 'images' ? (
        <>
          {canEdit && <div className="atlas-toolbar"><ImageAdder campaignId={campaignId} /></div>}
          <ImagesSection campaignId={campaignId} />
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
            onEdit: !isPlayer && activeId ? () => setEditOpen({ type, id: activeId }) : undefined,
            onPlace: !isPlayer && activeId ? () => navigate(`/campaigns/${campaignId}/map?place=${type}:${activeId}`) : undefined,
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
          onPlaceOnMap={() => navigate(`/campaigns/${campaignId}/map?place=${editOpen.type}:${editOpen.id}`)}
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

function ImagesSection({ campaignId }: { campaignId: string }) {
  const store = useUserCampaigns();
  const data = store.getData(campaignId);
  if (!data) return null;
  if (data.images.length === 0) return <p className="atlas-empty">Картинок пока нет.</p>;
  return (
    <div className="ucw-cardgrid">
      {data.images.map((img) => (
        <a key={img.id} className="ucw-ecard" href={img.src} target="_blank" rel="noreferrer">
          <img className="atlas-map-img" src={img.src} alt={img.title} style={{ maxHeight: 140, objectFit: 'cover' }} />
          <h3>{img.title}</h3>
        </a>
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

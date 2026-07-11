import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';
import type { CampaignEntityType, UserCampaignMode } from '../../types/userCampaign';
import { CampaignEntityCard } from './CampaignEntityCard';

type Kind = 'locations' | 'npc' | 'quests' | 'enemies' | 'players' | 'factions' | 'images' | 'notes';

const KIND_LABEL: Record<Kind, string> = {
  locations: 'Локации', npc: 'NPC', quests: 'Квесты', enemies: 'Враги', players: 'Игроки', factions: 'Фракции', images: 'Картинки', notes: 'Заметки',
};
const KIND_ENTITY: Record<string, CampaignEntityType> = { locations: 'location', npc: 'npc', quests: 'quest', enemies: 'enemy', players: 'party', factions: 'faction' };

export function CampaignLibraryPage() {
  const { campaignId, kind } = useParams<{ campaignId: string; kind: Kind }>();
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const [open, setOpen] = useState<{ type: CampaignEntityType; id: string } | null>(null);
  const [query, setQuery] = useState('');

  const data = campaignId ? store.getData(campaignId) : null;
  const runtime = campaignId ? store.getRuntime(campaignId) : null;
  const registryEntry = campaignId ? getCampaignById(campaignId) : undefined; // main campaign guard

  const k = (kind && KIND_LABEL[kind] ? kind : 'locations') as Kind;
  const mode: UserCampaignMode = runtime?.mode ?? 'dmView';
  const isEdit = mode === 'dmEdit';
  const isPlayer = mode === 'playerView';
  const canEdit = isEdit;

  const q = query.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  // Computed before the early return below so hook order is stable while the
  // campaign hydrates from the server (data null → present). Null-safe.
  // Player View lists only entities the DM has revealed.
  const revealed = new Set(runtime?.revealedToPlayers ?? []);
  const shown = (id: string) => !isPlayer || revealed.has(id);
  const items = useMemo(() => {
    if (!data) return [];
    if (k === 'locations') return data.locations.filter((l) => match(l.title) && shown(l.id)).map((l) => ({ id: l.id, title: l.title, sub: l.description }));
    if (k === 'npc') return data.npcs.filter((n) => match(n.name) && shown(n.id)).map((n) => ({ id: n.id, title: n.name, sub: n.role || n.description }));
    if (k === 'quests') return data.quests.filter((x) => match(x.title) && shown(x.id) && (!isPlayer || x.status !== 'hidden')).map((x) => ({ id: x.id, title: x.title, sub: x.status }));
    if (k === 'enemies') return data.enemies.filter((e) => match(e.title) && shown(e.id)).map((e) => ({ id: e.id, title: e.title, sub: e.hp ? `HP ${e.hp}` : e.description }));
    if (k === 'players') return (data.party ?? []).filter((pc) => match(pc.name) && shown(pc.id)).map((pc) => ({ id: pc.id, title: pc.name, sub: [pc.class, pc.level ? `ур. ${pc.level}` : '', pc.playerName ? `(${pc.playerName})` : ''].filter(Boolean).join(' · ') }));
    if (k === 'factions') return (data.factions ?? []).filter((f) => match(f.name) && shown(f.id)).map((f) => ({ id: f.id, title: f.name, sub: [f.role, f.attitude].filter(Boolean).join(' · ') }));
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [k, data, q, isPlayer, runtime?.revealedToPlayers]);

  if (!campaignId || !data || !runtime || registryEntry?.protected) {
    return (
      <div className="ucw-lib-page">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Кампания не найдена.</p>
      </div>
    );
  }

  const createEntity = () => {
    let id = '';
    if (k === 'locations') id = store.addLocation(campaignId, { title: 'Новая локация' });
    else if (k === 'npc') id = store.addNpc(campaignId, { name: 'Новый NPC' });
    else if (k === 'quests') id = store.addQuest(campaignId, { title: 'Новый квест', status: 'notStarted' });
    else if (k === 'enemies') id = store.addEnemy(campaignId, { title: 'Новый враг' });
    else if (k === 'players') id = store.addPlayer(campaignId, { name: 'Новый персонаж' });
    else if (k === 'factions') id = store.addFaction(campaignId, { name: 'Новая фракция', attitude: 'neutral' });
    if (id) setOpen({ type: KIND_ENTITY[k], id });
  };

  const placeOnMap = (type: CampaignEntityType, id: string) => {
    navigate(`/campaigns/${campaignId}/map?place=${type}:${id}`);
  };

  return (
    <div className="ucw-lib-page">
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

      <div className="atlas-toolbar">
        <input className="atlas-input" placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {canEdit && k !== 'notes' && k !== 'images' && <button className="atlas-btn" onClick={createEntity}>+ Создать</button>}
        {canEdit && k === 'images' && <ImageAdder campaignId={campaignId} />}
      </div>

      {k === 'notes' ? (
        <NotesSection campaignId={campaignId} canEdit={canEdit} />
      ) : k === 'images' ? (
        <ImagesSection campaignId={campaignId} />
      ) : items.length === 0 ? (
        <p className="atlas-empty">{canEdit ? `Пусто. Нажмите «+ ${KIND_LABEL[k]}», чтобы добавить.` : 'Пусто.'}</p>
      ) : (
        <div className="ucw-cardgrid">
          {items.map((it) => {
            const type = KIND_ENTITY[k];
            const placed = data.mapPlacements.some((mp) => mp.entityType === type && mp.entityId === it.id);
            return (
              <button key={it.id} type="button" className="ucw-ecard" onClick={() => setOpen({ type, id: it.id })}>
                <h3>{it.title}</h3>
                {it.sub && <p>{it.sub}</p>}
                <span className="meta">{placed ? '● на карте' : 'не на карте'}</span>
              </button>
            );
          })}
        </div>
      )}

      {open && (
        <CampaignEntityCard
          campaignId={campaignId}
          type={open.type}
          id={open.id}
          canEdit={canEdit}
          isPlayer={isPlayer}
          onClose={() => setOpen(null)}
          onPlaceOnMap={() => placeOnMap(open.type, open.id)}
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

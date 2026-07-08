import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import { WORLD_ATLAS_MAPS, getAtlasMapById } from '../../data/worldAtlasMaps';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { USER_CAMPAIGN_TYPE_LABELS, type UserCampaignType } from '../../types/userCampaign';

const TYPES: UserCampaignType[] = ['campaign', 'oneShot', 'miniArc', 'sandbox'];

export function NewCampaignWizard() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const store = useUserCampaigns();

  const [type, setType] = useState<UserCampaignType>((params.get('type') as UserCampaignType) || 'campaign');
  const [title, setTitle] = useState('');
  const [mapId, setMapId] = useState<string>(() => {
    const raw = params.get('mapId');
    if (!raw) return '';
    // accept short slug or full id
    const map = getAtlasMapById(raw) ?? WORLD_ATLAS_MAPS.find((m) => m.id.replace(/^atlas-map-/, '') === raw);
    return map?.id ?? '';
  });

  const canCreate = title.trim().length > 0 && !!mapId;

  const create = () => {
    if (!canCreate) return;
    const map = getAtlasMapById(mapId);
    const id = store.createCampaign({
      title: title.trim(),
      type,
      baseMapId: mapId,
      regionIds: map?.regionIds ?? [],
    });
    navigate(`/campaigns/${id}/map`);
  };

  return (
    <div className="atlas-layer">
      <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
      <h1>Новая кампания</h1>
      <p className="atlas-sub">Возьмите любую карту мира как основу пустой изолированной кампании.</p>

      <div className="atlas-section" style={{ marginTop: 8 }}>
        <h2>1. Тип</h2>
        <div className="atlas-badges">
          {TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`atlas-btn ${type === t ? '' : 'ghost'} small`}
              onClick={() => setType(t)}
            >
              {USER_CAMPAIGN_TYPE_LABELS[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="atlas-section">
        <h2>2. Название</h2>
        <input
          className="atlas-input"
          style={{ minWidth: 320 }}
          placeholder="Например: Кампания в Кальдране"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
      </div>

      <div className="atlas-section">
        <h2>3. Карта / регион мира</h2>
        <div className="atlas-grid">
          {WORLD_ATLAS_MAPS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="atlas-card"
              style={{ borderColor: mapId === m.id ? 'var(--gold)' : undefined }}
              onClick={() => setMapId(m.id)}
            >
              <img className="atlas-map-img" src={m.imageSrc} alt={m.titleRu ?? m.title} loading="lazy" style={{ maxHeight: 120, objectFit: 'cover' }} />
              <h3>{m.titleRu ?? m.title}</h3>
              {mapId === m.id && <span className="atlas-badge canon-fixedCanon">выбрано</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="atlas-section">
        <button className="atlas-btn" disabled={!canCreate} onClick={create}>Создать</button>
        {!canCreate && <span className="atlas-empty" style={{ marginLeft: 12 }}>Введите название и выберите карту.</span>}
      </div>
    </div>
  );
}

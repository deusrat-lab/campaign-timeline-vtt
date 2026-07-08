import { useNavigate } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import { CAMPAIGN_MODULES } from '../../data/campaignModules';
import { WORLD_ATLAS_MAPS, atlasMapRouteId } from '../../data/worldAtlasMaps';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { USER_CAMPAIGN_TYPE_LABELS } from '../../types/userCampaign';

export function WorldHomePage() {
  const navigate = useNavigate();
  const { registry } = useUserCampaigns();
  const main = CAMPAIGN_MODULES.find((c) => c.protected)!;
  const worldMap = WORLD_ATLAS_MAPS.find((m) => m.id === 'atlas-map-known-world');

  return (
    <div className="atlas-layer">
      <div className="atlas-header">
        <div>
          <h1>Дом мира · World Home</h1>
          <p className="atlas-sub">Один мир, много кампаний. Возьмите любую карту и создайте на её основе кампанию.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="atlas-btn" onClick={() => navigate('/campaigns/new?type=campaign')}>+ Новая кампания</button>
          <button className="atlas-btn ghost" onClick={() => navigate('/campaigns/new?type=oneShot')}>+ Новый ваншот</button>
          <button className="atlas-btn ghost" onClick={() => navigate('/world')}>World Atlas</button>
        </div>
      </div>

      {worldMap && (
        <button
          type="button"
          onClick={() => navigate('/world/region-known-world')}
          style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', marginBottom: 8 }}
          title="Открыть справку в World Atlas"
        >
          <img className="atlas-map-img" src={worldMap.imageSrc} alt="Карта мира" loading="lazy" />
        </button>
      )}

      <div className="atlas-section">
        <h2>Основная кампания</h2>
        <div className="atlas-grid">
          <div className="atlas-card" style={{ cursor: 'default' }}>
            <div className="atlas-badges">
              <span className="atlas-badge canon-fixedCanon">protected</span>
              <span className="atlas-badge status-active">active</span>
            </div>
            <h3>{main.titleRu ?? main.title}</h3>
            <p>{main.description}</p>
            <div style={{ marginTop: 'auto' }}>
              <button className="atlas-btn small" onClick={() => navigate('/map')}>Открыть основную кампанию</button>
            </div>
          </div>
        </div>
      </div>

      <div className="atlas-section">
        <h2>Мои кампании</h2>
        {registry.length === 0 ? (
          <p className="atlas-empty">Новых кампаний пока нет. Создайте кампанию или ваншот на любой карте ниже.</p>
        ) : (
          <div className="atlas-grid">
            {registry.map((c) => (
              <div key={c.campaignId} className="atlas-card" style={{ cursor: 'default' }}>
                <div className="atlas-badges"><span className="atlas-badge type-badge">{USER_CAMPAIGN_TYPE_LABELS[c.type]}</span></div>
                <h3>{c.title}</h3>
                <div style={{ marginTop: 'auto' }}>
                  <button className="atlas-btn small" onClick={() => navigate(`/campaigns/${c.campaignId}/map`)}>Открыть</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="atlas-section">
        <h2>Карты мира — основа для кампании</h2>
        <div className="atlas-grid">
          {WORLD_ATLAS_MAPS.map((m) => (
            <div key={m.id} className="atlas-card" style={{ cursor: 'default' }}>
              <img className="atlas-map-img" src={m.imageSrc} alt={m.titleRu ?? m.title} loading="lazy" style={{ maxHeight: 150, objectFit: 'cover' }} />
              <h3>{m.titleRu ?? m.title}</h3>
              {m.description && <p>{m.description}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                <button className="atlas-btn small" onClick={() => navigate(`/campaigns/new?type=campaign&mapId=${atlasMapRouteId(m)}`)}>Создать кампанию</button>
                <button className="atlas-btn ghost small" onClick={() => navigate(`/campaigns/new?type=oneShot&mapId=${atlasMapRouteId(m)}`)}>Создать ваншот</button>
                <button className="atlas-btn ghost small" onClick={() => navigate(`/world/${m.regionIds[0]}`)}>Справка в Атласе</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

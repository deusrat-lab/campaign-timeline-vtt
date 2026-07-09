import { useNavigate } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import { CAMPAIGN_MODULES } from '../../data/campaignModules';
import { WORLD_ATLAS_MAPS, atlasMapRouteId } from '../../data/worldAtlasMaps';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { USER_CAMPAIGN_TYPE_LABELS } from '../../types/userCampaign';
import { CAMPAIGN_SCENARIOS } from '../../data/campaignScenarios';

export function WorldHomePage() {
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const { registry } = store;
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
        <h2>Готовые ваншоты</h2>
        <p className="atlas-sub" style={{ marginBottom: 12 }}>Сценарии с уже заполненными карточками локаций, NPC и врагов из канон-документов.</p>
        <div className="atlas-grid">
          {CAMPAIGN_SCENARIOS.map((s) => (
            <div key={s.id} className="atlas-card" style={{ cursor: 'default' }}>
              <div className="atlas-badges">
                <span className="atlas-badge type-badge">{USER_CAMPAIGN_TYPE_LABELS[s.type]}</span>
                <span className="atlas-badge">{s.locations.length} лок · {s.npcs.length} NPC · {s.enemies.length} врагов</span>
              </div>
              <h3>{s.title}</h3>
              <p>{s.summary}</p>
              <div style={{ marginTop: 'auto' }}>
                <button className="atlas-btn small" onClick={() => {
                  const id = store.createCampaign({ title: s.title, type: s.type, baseMapId: s.baseMapId, regionIds: s.regionIds, seed: { locations: s.locations, npcs: s.npcs, enemies: s.enemies } });
                  navigate(`/campaigns/${id}/map`);
                }}>Создать этот ваншот</button>
              </div>
            </div>
          ))}
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
                <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button className="atlas-btn small" onClick={() => navigate(`/campaigns/${c.campaignId}/map`)}>Открыть</button>
                  <button className="atlas-btn ghost small" onClick={() => { const t = window.prompt('Новое название кампании:', c.title); if (t && t.trim()) store.renameCampaign(c.campaignId, t.trim()); }}>Переименовать</button>
                  <button className="atlas-btn danger small" onClick={() => { if (window.confirm(`Удалить кампанию «${c.title}»? Это не затронет основную кампанию.`)) store.deleteCampaign(c.campaignId); }}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="atlas-section">
        <h2>Создать кампанию — выберите карту</h2>
        <p className="atlas-sub" style={{ marginBottom: 12 }}>
          Например, чтобы играть в Кальдране: найдите карту «Кальдран» ниже и нажмите «Создать кампанию».
          Откроется пустая изолированная кампания с канон-локациями региона.
        </p>
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

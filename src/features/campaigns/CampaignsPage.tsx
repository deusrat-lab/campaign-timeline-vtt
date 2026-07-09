import { useNavigate } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import { CAMPAIGN_MODULES } from '../../data/campaignModules';
import { getRegionById } from '../../data/worldRegions';
import { getAtlasMapById } from '../../data/worldAtlasMaps';
import { CAMPAIGN_TYPE_LABELS } from '../../types/campaign';
import { USER_CAMPAIGN_TYPE_LABELS } from '../../types/userCampaign';
import { useUserCampaigns } from '../../state/userCampaignStore';

export function CampaignsPage() {
  const navigate = useNavigate();
  const { registry, deleteCampaign, renameCampaign } = useUserCampaigns();
  const main = CAMPAIGN_MODULES.find((c) => c.protected)!;

  return (
    <div className="atlas-layer">
      <div className="atlas-header">
        <div>
          <h1>Кампании · Campaigns</h1>
          <p className="atlas-sub">Защищённая основная кампания и созданные вами кампании. Заранее готовых ваншотов здесь нет.</p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="atlas-btn" onClick={() => navigate('/campaigns/new?type=campaign')}>+ Новая кампания</button>
          <button className="atlas-btn ghost" onClick={() => navigate('/campaigns/new?type=oneShot')}>+ Новый ваншот</button>
        </div>
      </div>

      <div className="atlas-section" style={{ marginTop: 8 }}>
        <h2>Основная кампания</h2>
        <div className="atlas-grid">
          <button type="button" className="atlas-card" onClick={() => navigate('/map')}>
            <div className="atlas-badges">
              <span className="atlas-badge type-badge">{CAMPAIGN_TYPE_LABELS[main.type]}</span>
              <span className="atlas-badge canon-fixedCanon">protected</span>
              <span className="atlas-badge status-active">active</span>
            </div>
            <h3>{main.titleRu ?? main.title}</h3>
            <p>{main.description}</p>
          </button>
        </div>
      </div>

      <div className="atlas-section">
        <h2>Мои кампании</h2>
        {registry.length === 0 ? (
          <div className="atlas-panel">
            <p className="atlas-empty" style={{ margin: 0 }}>Новых кампаний пока нет.</p>
            <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="atlas-btn" onClick={() => navigate('/campaigns/new?type=campaign')}>+ Создать кампанию</button>
              <button className="atlas-btn ghost" onClick={() => navigate('/campaigns/new?type=oneShot')}>+ Создать ваншот</button>
            </div>
          </div>
        ) : (
          <div className="atlas-grid">
            {registry.map((c) => {
              const region = c.regionIds[0] ? getRegionById(c.regionIds[0]) : undefined;
              const map = getAtlasMapById(c.baseMapId);
              return (
                <div key={c.campaignId} className="atlas-card" style={{ cursor: 'default' }}>
                  <div className="atlas-badges">
                    <span className="atlas-badge type-badge">{USER_CAMPAIGN_TYPE_LABELS[c.type]}</span>
                  </div>
                  <h3>{c.title}</h3>
                  <p>{map?.titleRu ?? map?.title}{region ? ` · ${region.titleRu ?? region.title}` : ''}</p>
                  <div style={{ marginTop: 'auto', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="atlas-btn small" onClick={() => navigate(`/campaigns/${c.campaignId}/map`)}>Открыть</button>
                    <button className="atlas-btn ghost small" onClick={() => { const t = window.prompt('Новое название:', c.title); if (t && t.trim()) renameCampaign(c.campaignId, t.trim()); }}>Переименовать</button>
                    <button className="atlas-btn danger small" onClick={() => { if (window.confirm(`Удалить кампанию «${c.title}»? Это не затронет основную кампанию.`)) deleteCampaign(c.campaignId); }}>Удалить</button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

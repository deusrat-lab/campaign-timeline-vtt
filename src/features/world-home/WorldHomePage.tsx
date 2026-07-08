import { Link, useNavigate } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import { CAMPAIGN_MODULES, MAIN_CAMPAIGN_ID } from '../../data/campaignModules';
import { WORLD_ATLAS_MAPS, atlasMapRouteId } from '../../data/worldAtlasMaps';
import { getRegionById } from '../../data/worldRegions';
import { CAMPAIGN_TYPE_LABELS, type CampaignModule } from '../../types/campaign';
import { useCampaignRuntime } from '../../state/campaignRuntimeStore';

function CampaignRow({ campaign, onOpen }: { campaign: CampaignModule; onOpen: () => void }) {
  const runtime = useCampaignRuntime();
  const region = campaign.regionIds[0] ? getRegionById(campaign.regionIds[0]) : undefined;
  const st = campaign.protected ? 'active' : runtime.getRuntime(campaign.id).status;
  return (
    <div className="atlas-card" style={{ cursor: 'default' }}>
      <div className="atlas-badges">
        <span className="atlas-badge type-badge">{CAMPAIGN_TYPE_LABELS[campaign.type]}</span>
        {campaign.protected && <span className="atlas-badge canon-fixedCanon">protected</span>}
        {st && st !== 'notStarted' && <span className={`atlas-badge status-${st}`}>{st}</span>}
      </div>
      <h3>{campaign.titleRu ?? campaign.title}</h3>
      <p>{campaign.description}</p>
      <div className="atlas-badges" style={{ marginTop: 4 }}>
        {region && <span className="atlas-tag">{region.titleRu ?? region.title}</span>}
        <span className="atlas-tag">{campaign.canonPolicy}</span>
      </div>
      <div style={{ marginTop: 'auto', paddingTop: 8 }}>
        <button className="atlas-btn small" onClick={onOpen}>Открыть</button>
      </div>
    </div>
  );
}

export function WorldHomePage() {
  const navigate = useNavigate();
  const main = CAMPAIGN_MODULES.find((c) => c.id === MAIN_CAMPAIGN_ID)!;
  const oneShots = CAMPAIGN_MODULES.filter((c) => !c.protected && c.status !== 'draft');
  const drafts = CAMPAIGN_MODULES.filter((c) => c.status === 'draft');

  const openCampaign = (c: CampaignModule) => {
    if (c.protected) navigate(c.startRoute); // legacy /map flow
    else navigate(`/campaigns/${c.id}`);
  };

  const worldMap = WORLD_ATLAS_MAPS.find((m) => m.id === 'atlas-map-known-world');

  return (
    <div className="atlas-layer">
      <div className="atlas-header">
        <div>
          <h1>Дом мира · World Home</h1>
          <p className="atlas-sub">Один мир, много кампаний. Выберите контекст игры.</p>
        </div>
        <button className="atlas-btn ghost" onClick={() => navigate('/world')}>Открыть World Atlas</button>
      </div>

      {worldMap && (
        <button
          type="button"
          onClick={() => navigate('/world/region-known-world')}
          style={{ display: 'block', width: '100%', border: 'none', background: 'none', padding: 0, cursor: 'pointer', marginBottom: 8 }}
        >
          <img className="atlas-map-img" src={worldMap.imageSrc} alt="Карта мира" loading="lazy" />
        </button>
      )}

      <div className="atlas-section">
        <h2>Активная кампания</h2>
        <div className="atlas-grid">
          <CampaignRow campaign={main} onOpen={() => openCampaign(main)} />
        </div>
      </div>

      <div className="atlas-section">
        <h2>Ваншоты и кампании</h2>
        <div className="atlas-grid">
          {oneShots.map((c) => <CampaignRow key={c.id} campaign={c} onOpen={() => openCampaign(c)} />)}
        </div>
      </div>

      {drafts.length > 0 && (
        <div className="atlas-section">
          <h2>Черновики</h2>
          <div className="atlas-grid">
            {drafts.map((c) => <CampaignRow key={c.id} campaign={c} onOpen={() => openCampaign(c)} />)}
          </div>
        </div>
      )}

      <div className="atlas-section">
        <h2>Карты мира</h2>
        <div className="atlas-grid">
          {WORLD_ATLAS_MAPS.map((m) => (
            <div key={m.id} className="atlas-card" style={{ cursor: 'default' }}>
              <img className="atlas-map-img" src={m.imageSrc} alt={m.titleRu ?? m.title} loading="lazy" style={{ maxHeight: 150, objectFit: 'cover' }} />
              <h3>{m.titleRu ?? m.title}</h3>
              {m.description && <p>{m.description}</p>}
              <div style={{ display: 'flex', gap: 8, marginTop: 'auto', flexWrap: 'wrap' }}>
                <Link className="atlas-btn small" to={`/atlas/maps/${atlasMapRouteId(m)}`}>Открыть карту</Link>
                <button className="atlas-btn ghost small" onClick={() => navigate(`/world/${m.regionIds[0]}`)}>Открыть библиотеку</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

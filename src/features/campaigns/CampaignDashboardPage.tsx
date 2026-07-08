import { useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import { getCampaignById, buildCampaignContext } from '../../data/campaignModules';
import { getModuleById } from '../../data/adventureModules';
import { getRegionById } from '../../data/worldRegions';
import { getAtlasMapById } from '../../data/worldAtlasMaps';
import { CAMPAIGN_TYPE_LABELS } from '../../types/campaign';
import { useCampaignRuntime } from '../../state/campaignRuntimeStore';
import { useCampaignStore } from '../../state/campaignStore';

export function CampaignDashboardPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const runtime = useCampaignRuntime();
  const store = useCampaignStore();
  const [playerSafeLocal, setPlayerSafeLocal] = useState(false);

  const campaign = campaignId ? getCampaignById(campaignId) : undefined;

  if (!campaign || !campaignId) {
    return (
      <div className="atlas-layer">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Кампания не найдена.</p>
      </div>
    );
  }

  // Protected main campaign is never played through this isolated screen.
  if (campaign.protected) {
    return (
      <div className="atlas-layer">
        <button className="atlas-back-link" onClick={() => navigate('/')}>← Дом мира</button>
        <h1>{campaign.titleRu ?? campaign.title}</h1>
        <p className="atlas-sub">Это защищённая основная кампания. Она открывается старым flow без изменений.</p>
        <button className="atlas-btn" onClick={() => navigate(campaign.startRoute)}>Открыть основную кампанию</button>
      </div>
    );
  }

  const playerSafe = store.mode === 'player-view' || playerSafeLocal;
  const state = runtime.getRuntime(campaignId);
  const context = buildCampaignContext(campaignId);
  const adv = campaign.adventureModuleId ? getModuleById(campaign.adventureModuleId) : undefined;
  const primaryMap = campaign.mapIds[0] ? getAtlasMapById(campaign.mapIds[0]) : undefined;
  const primaryRegion = campaign.regionIds[0] ? getRegionById(campaign.regionIds[0]) : undefined;

  const start = () => {
    runtime.startSession(campaignId, adv?.scenes[0]?.id, campaign.mapIds[0]);
    navigate(`/campaigns/${campaignId}/session`);
  };

  return (
    <div className="atlas-layer">
      <button className="atlas-back-link" onClick={() => navigate('/')}>← Дом мира</button>

      <div className="atlas-header">
        <div>
          <h1>{campaign.titleRu ?? campaign.title}</h1>
          <div className="atlas-badges">
            <span className="atlas-badge type-badge">{CAMPAIGN_TYPE_LABELS[campaign.type]}</span>
            <span className="atlas-badge">{campaign.canonPolicy}</span>
            <span className={`atlas-badge status-${state.status}`}>{state.status}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {store.mode !== 'player-view' && (
            <label className="atlas-safe-toggle">
              <input type="checkbox" checked={playerSafeLocal} onChange={(e) => setPlayerSafeLocal(e.target.checked)} />
              Player Safe preview
            </label>
          )}
          {state.status === 'active'
            ? <button className="atlas-btn" onClick={() => navigate(`/campaigns/${campaignId}/session`)}>Продолжить сессию</button>
            : <button className="atlas-btn" onClick={start}>Запустить сессию</button>}
        </div>
      </div>

      <div className="atlas-detail-cols">
        {/* ── CAMPAIGN INFO ─────────────────────────────────────────── */}
        <div>
          <div className="atlas-section" style={{ marginTop: 0 }}>
            <h2>Campaign Info · Кампания</h2>
            <div className="atlas-panel"><p>{campaign.description}</p></div>
          </div>

          <div className="atlas-section">
            <h2>{playerSafe ? 'Для игроков' : 'Бриф мастера'}</h2>
            <div className={playerSafe ? 'atlas-panel' : 'atlas-dm-block'}>
              <p>{playerSafe ? (adv?.playerBrief ?? campaign.playerBrief ?? '—') : (adv?.dmBrief ?? campaign.dmBrief ?? '—')}</p>
            </div>
          </div>

          {adv && adv.scenes.length > 0 && (
            <div className="atlas-section">
              <h2>Сцены ({adv.scenes.length})</h2>
              <div className="atlas-scene-list">
                {[...adv.scenes].sort((a, b) => a.order - b.order).map((sc) => (
                  <div key={sc.id} className={`atlas-scene${state.completedSceneIds.includes(sc.id) ? ' done' : ''}`}>
                    <h3><span>{sc.title}</span><span className="scene-order">#{sc.order} · {sc.type}</span></h3>
                    <p style={{ color: 'var(--fg-dim)', fontSize: '0.9rem', margin: '6px 0 0' }}>
                      {playerSafe ? (sc.playerText ?? '—') : sc.dmText}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {adv && adv.hooks.length > 0 && (
            <div className="atlas-section">
              <h2>Зацепки</h2>
              <div className="atlas-panel"><ul>{adv.hooks.map((h, i) => <li key={i}>{h}</li>)}</ul></div>
            </div>
          )}

          {!playerSafe && adv && adv.secrets.length > 0 && (
            <div className="atlas-section">
              <h2>Секреты</h2>
              <div className="atlas-dm-block">
                <div className="atlas-dm-label">Только для мастера</div>
                <ul>{adv.secrets.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          )}

          <div className="atlas-section">
            <h2>Данные кампании</h2>
            <div className="atlas-panel" style={{ fontSize: '0.88rem', color: 'var(--fg-dim)' }}>
              <div>NPC: {context?.campaignNpcIds.length ? context.campaignNpcIds.join(', ') : <span className="atlas-empty">только этой кампании (пока не заданы)</span>}</div>
              <div>Квесты: {context?.campaignQuestIds.length ? context.campaignQuestIds.join(', ') : <span className="atlas-empty">только этой кампании</span>}</div>
              <div>Враги: {context?.campaignEnemyIds.length ? context.campaignEnemyIds.join(', ') : <span className="atlas-empty">только этой кампании</span>}</div>
              <p style={{ marginTop: 6, color: 'var(--fg-faint)' }}>Данные основной кампании (Арка 1/2) здесь не показываются.</p>
            </div>
          </div>
        </div>

        {/* ── WORLD INFO (shared) ───────────────────────────────────── */}
        <aside>
          {primaryMap && (
            <div className="atlas-section" style={{ marginTop: 0 }}>
              <h2>World Info · Карта</h2>
              <img className="atlas-map-img" src={primaryMap.imageSrc} alt={primaryMap.titleRu ?? primaryMap.title} loading="lazy" />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <a className="atlas-btn small" href={primaryMap.imageSrc} target="_blank" rel="noreferrer">Открыть карту {primaryMap.titleRu ?? primaryMap.title}</a>
                <button className="atlas-btn ghost small" onClick={() => navigate(`/world/${campaign.regionIds[0]}`)}>О регионе в атласе</button>
              </div>
            </div>
          )}

          <div className="atlas-section">
            <h2>Регионы мира</h2>
            <ul className="atlas-link-list">
              {campaign.regionIds.map((rid) => {
                const r = getRegionById(rid);
                return <li key={rid}><Link to={`/world/${rid}`} style={{ color: 'var(--gold)' }}>{r?.titleRu ?? r?.title ?? rid}</Link></li>;
              })}
            </ul>
          </div>

          {primaryRegion && (
            <div className="atlas-section">
              <h2>О регионе</h2>
              <div className="atlas-panel">
                <p style={{ margin: 0, color: 'var(--fg-dim)', fontSize: '0.9rem' }}>{primaryRegion.shortDescription}</p>
                {primaryRegion.rulingPower && <p style={{ marginTop: 6, fontSize: '0.85rem', color: 'var(--fg-faint)' }}>Контроль: {primaryRegion.rulingPower}</p>}
              </div>
            </div>
          )}

          {adv?.handouts && adv.handouts.length > 0 && (
            <div className="atlas-section">
              <h2>Handouts</h2>
              <div className="atlas-taglist">{adv.handouts.map((h, i) => <span key={i} className="atlas-tag">{h}</span>)}</div>
            </div>
          )}

          <div className="atlas-section">
            <h2>Runtime</h2>
            <div className="atlas-panel" style={{ fontSize: '0.8rem', color: 'var(--fg-faint)' }}>
              <div>Ключ: <code>{campaign.runtimeKey}</code></div>
              <div>Изолирован от основной кампании.</div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import './atlasLayer.css';
import { getAtlasMapByRouteId } from '../../data/worldAtlasMaps';
import { getRegionById, getRegionSubtree } from '../../data/worldRegions';
import { ADVENTURE_MODULES } from '../../data/adventureModules';
import { CAMPAIGN_MODULES, getCampaignByAdventureModuleId } from '../../data/campaignModules';
import type { WorldRegion } from '../../types/worldAtlas';
import { useCampaignStore } from '../../state/campaignStore';

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 4;
const ZOOM_STEP = 0.25;

/** One-shots that reference a region (directly or via its linked ids). */
function modulesForRegion(regionId: string) {
  const region = getRegionById(regionId);
  return ADVENTURE_MODULES.filter(
    (m) => m.regionIds.includes(regionId) || region?.linkedAdventureModuleIds?.includes(m.id));
}

function RegionInspector({ region, onCreateOneShot }: { region: WorldRegion; onCreateOneShot: () => void }) {
  const store = useCampaignStore();
  const playerSafe = store.mode === 'player-view';
  const modules = modulesForRegion(region.id);
  return (
    <div>
      <div className="atlas-badges">
        <span className="atlas-badge type-badge">{region.type}</span>
        <span className={`atlas-badge canon-${region.canonStatus}`}>{region.canonStatus}</span>
      </div>
      <h3 style={{ marginTop: 8 }}>{region.titleRu ?? region.title}</h3>
      <p style={{ color: 'var(--fg-dim)', fontSize: '0.9rem' }}>{region.shortDescription}</p>

      <div className="atlas-panel" style={{ marginTop: 10 }}>
        {playerSafe ? <p>{region.playerDescription ?? region.shortDescription}</p> : <p>{region.dmDescription}</p>}
      </div>

      <dl className="atlas-kv" style={{ marginTop: 12 }}>
        {region.visualTone && (<><dt>Визуальный тон</dt><dd>{region.visualTone}</dd></>)}
        {region.rulingPower && (<><dt>Контроль</dt><dd>{region.rulingPower}</dd></>)}
      </dl>

      {region.factions && region.factions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="atlas-inspector-label">Фракции / дома</div>
          <div className="atlas-taglist">{region.factions.map((f, i) => <span key={i} className="atlas-tag">{f}</span>)}</div>
        </div>
      )}

      {region.adventureHooks && region.adventureHooks.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="atlas-inspector-label">Adventure hooks</div>
          <ul style={{ margin: '4px 0 0', paddingLeft: 18, fontSize: '0.88rem' }}>{region.adventureHooks.map((h, i) => <li key={i}>{h}</li>)}</ul>
        </div>
      )}

      <div style={{ marginTop: 12 }}>
        <div className="atlas-inspector-label">Связанные ваншоты</div>
        {modules.length > 0 ? (
          <ul className="atlas-link-list" style={{ marginTop: 4 }}>
            {modules.map((m) => {
              const campaign = getCampaignByAdventureModuleId(m.id);
              return (
                <li key={m.id}>
                  {campaign
                    ? <Link to={`/campaigns/${campaign.id}`} style={{ color: 'var(--gold)' }}>{m.titleRu ?? m.title}</Link>
                    : <span>{m.titleRu ?? m.title}</span>}
                </li>
              );
            })}
          </ul>
        ) : <p className="atlas-empty" style={{ fontSize: '0.85rem' }}>Пока нет.</p>}
      </div>

      <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <Link className="atlas-btn ghost small" to={`/world/${region.id}`}>Открыть в библиотеке</Link>
        <button className="atlas-btn small" onClick={onCreateOneShot}>Создать ваншот здесь</button>
      </div>
    </div>
  );
}

export function AtlasMapWorkspace() {
  const { mapId } = useParams<{ mapId: string }>();
  const navigate = useNavigate();
  const [zoom, setZoom] = useState(1);
  const [selectedRegionId, setSelectedRegionId] = useState<string | null>(null);

  const map = mapId ? getAtlasMapByRouteId(mapId) : undefined;

  const regions = useMemo(() => (map ? getRegionSubtree(map.regionIds) : []), [map]);
  const linkedCampaigns = useMemo(
    () => (map ? CAMPAIGN_MODULES.filter((c) => c.mapIds.includes(map.id)) : []),
    [map]);
  const factions = useMemo(() => {
    const set = new Set<string>();
    regions.forEach((r) => (r.factions ?? []).forEach((f) => set.add(f)));
    return [...set];
  }, [regions]);

  if (!map || !mapId) {
    return (
      <div className="atlas-layer">
        <button className="atlas-back-link" onClick={() => navigate('/world')}>← Атлас</button>
        <p className="atlas-empty">Карта не найдена.</p>
      </div>
    );
  }

  const selectedRegion = selectedRegionId ? getRegionById(selectedRegionId) : undefined;
  const prep = (what: string) => window.alert(`${what}\n\nКонструктор появится позже. Карта: ${map.titleRu ?? map.title}.`);

  return (
    <div className="atlas-workspace">
      <div className="atlas-workspace-topbar">
        <div className="atlas-workspace-title">
          <button className="atlas-back-link" style={{ margin: 0 }} onClick={() => navigate('/world')}>← Атлас мира</button>
          <span className="atlas-crumb-sep">→</span>
          <strong>{map.titleRu ?? map.title}</strong>
          <span className="atlas-mode-chip">Режим: Атлас мира · Campaign Prep</span>
        </div>
        <div className="atlas-workspace-tools">
          <button className="atlas-btn ghost small" onClick={() => setZoom((z) => Math.max(ZOOM_MIN, z - ZOOM_STEP))} aria-label="Уменьшить">−</button>
          <button className="atlas-btn ghost small" onClick={() => setZoom((z) => Math.min(ZOOM_MAX, z + ZOOM_STEP))} aria-label="Увеличить">+</button>
          <button className="atlas-btn ghost small" onClick={() => setZoom(1)}>По размеру экрана</button>
          <span className="atlas-zoom-readout">{Math.round(zoom * 100)}%</span>
        </div>
      </div>

      <div className="atlas-workspace-body">
        <div className="atlas-map-viewport">
          <div className="atlas-map-scaler" style={{ transform: `scale(${zoom})` }}>
            <img className="atlas-map-canvas" src={map.imageSrc} alt={map.titleRu ?? map.title} />
          </div>
          <div className="atlas-map-legend">
            <div><span className="dot dot-region" /> Регион мира</div>
            <div><span className="dot dot-selected" /> Выбрано</div>
          </div>
        </div>

        <aside className="atlas-library-panel">
          {selectedRegion ? (
            <>
              <button className="atlas-back-link" style={{ margin: '0 0 10px' }} onClick={() => setSelectedRegionId(null)}>← К обзору карты</button>
              <RegionInspector region={selectedRegion} onCreateOneShot={() => prep('Создать ваншот здесь')} />
            </>
          ) : (
            <>
              <h2 className="atlas-panel-heading">Библиотека · {map.titleRu ?? map.title}</h2>
              {map.description && <p style={{ color: 'var(--fg-dim)', fontSize: '0.9rem', marginTop: 4 }}>{map.description}</p>}

              <div className="atlas-inspector-label" style={{ marginTop: 14 }}>Регионы ({regions.length})</div>
              <div className="atlas-region-chips">
                {regions.map((r) => (
                  <button key={r.id} type="button" className="atlas-region-chip" onClick={() => setSelectedRegionId(r.id)}>
                    {r.titleRu ?? r.title}
                  </button>
                ))}
              </div>

              <div className="atlas-inspector-label" style={{ marginTop: 14 }}>Фракции / дома</div>
              {factions.length > 0
                ? <div className="atlas-taglist">{factions.map((f, i) => <span key={i} className="atlas-tag">{f}</span>)}</div>
                : <p className="atlas-empty" style={{ fontSize: '0.85rem' }}>Не заданы.</p>}

              <div className="atlas-inspector-label" style={{ marginTop: 14 }}>Связанные кампании / ваншоты</div>
              {linkedCampaigns.length > 0 ? (
                <ul className="atlas-link-list" style={{ marginTop: 4 }}>
                  {linkedCampaigns.map((c) => (
                    <li key={c.id}>
                      {c.protected
                        ? <Link to="/map" style={{ color: 'var(--gold)' }}>{c.titleRu ?? c.title}</Link>
                        : <Link to={`/campaigns/${c.id}`} style={{ color: 'var(--gold)' }}>{c.titleRu ?? c.title}</Link>}
                    </li>
                  ))}
                </ul>
              ) : <p className="atlas-empty" style={{ fontSize: '0.85rem' }}>Пока нет.</p>}

              <div className="atlas-prep-actions">
                <button className="atlas-btn small" onClick={() => prep('Создать кампанию на этой карте')}>Создать кампанию</button>
                <button className="atlas-btn small" onClick={() => prep('Создать ваншот на этой карте')}>Создать ваншот</button>
                <button className="atlas-btn ghost small" onClick={() => navigate('/campaigns')}>Связанные кампании</button>
                <Link className="atlas-btn ghost small" to={`/world/${map.regionIds[0]}`}>Полная библиотека</Link>
              </div>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}

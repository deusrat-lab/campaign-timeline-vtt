import { useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import './atlasLayer.css';
import {
  WORLD_REGIONS,
  getRegionById,
  getChildRegions,
  getRegionBreadcrumbs,
} from '../../data/worldRegions';
import { getAtlasMapById, atlasMapRouteId } from '../../data/worldAtlasMaps';
import { ADVENTURE_MODULES } from '../../data/adventureModules';
import { getCampaignByAdventureModuleId } from '../../data/campaignModules';
import type { WorldRegion } from '../../types/worldAtlas';
import { useCampaignStore } from '../../state/campaignStore';

function CanonBadge({ status }: { status: WorldRegion['canonStatus'] }) {
  return <span className={`atlas-badge canon-${status}`}>{status}</span>;
}

function RegionCard({ region, onOpen }: { region: WorldRegion; onOpen: () => void }) {
  return (
    <button type="button" className="atlas-card" onClick={onOpen}>
      <div className="atlas-badges">
        <span className="atlas-badge type-badge">{region.type}</span>
        <CanonBadge status={region.canonStatus} />
      </div>
      <h3>{region.titleRu ?? region.title}</h3>
      <p>{region.shortDescription}</p>
    </button>
  );
}

/** The one-shots that reference a given region (directly or via linked ids). */
function modulesForRegion(regionId: string) {
  return ADVENTURE_MODULES.filter(
    (m) => m.regionIds.includes(regionId) ||
      getRegionById(regionId)?.linkedAdventureModuleIds?.includes(m.id));
}

function RegionDetail({ region }: { region: WorldRegion }) {
  const navigate = useNavigate();
  const store = useCampaignStore();
  // Local Player-Safe preview toggle. Independent of the main campaign store,
  // but if the whole app is already in player-view we force it on.
  const [playerSafeLocal, setPlayerSafeLocal] = useState(false);
  const playerSafe = store.mode === 'player-view' || playerSafeLocal;

  const breadcrumbs = getRegionBreadcrumbs(region.id);
  const children = getChildRegions(region.id);
  const modules = modulesForRegion(region.id);
  const map = region.mapId ? getAtlasMapById(region.mapId) : undefined;

  return (
    <div className="atlas-layer">
      <nav className="atlas-breadcrumbs">
        {breadcrumbs.map((r, i) => (
          <span key={r.id} style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}>
            {i > 0 && <span className="crumb-sep">→</span>}
            {r.id === region.id ? (
              <span className="crumb-current">{r.titleRu ?? r.title}</span>
            ) : (
              <button type="button" className="crumb" onClick={() => navigate(`/world/${r.id}`)}>
                {r.titleRu ?? r.title}
              </button>
            )}
          </span>
        ))}
      </nav>

      <div className="atlas-header">
        <div>
          <h1>{region.titleRu ?? region.title}</h1>
          <div className="atlas-badges">
            <span className="atlas-badge type-badge">{region.type}</span>
            <CanonBadge status={region.canonStatus} />
          </div>
        </div>
        {store.mode !== 'player-view' && (
          <label className="atlas-safe-toggle">
            <input type="checkbox" checked={playerSafeLocal} onChange={(e) => setPlayerSafeLocal(e.target.checked)} />
            Player Safe preview
          </label>
        )}
      </div>

      <div className="atlas-detail-cols">
        <div>
          <p className="atlas-sub">{region.shortDescription}</p>

          <div className="atlas-section">
            <h2>Описание</h2>
            <div className="atlas-panel">
              {playerSafe
                ? <p>{region.playerDescription ?? region.shortDescription}</p>
                : <p>{region.dmDescription}</p>}
            </div>
          </div>

          {region.adventureHooks && region.adventureHooks.length > 0 && (
            <div className="atlas-section">
              <h2>Adventure Hooks</h2>
              <div className="atlas-panel">
                <ul>{region.adventureHooks.map((h, i) => <li key={i}>{h}</li>)}</ul>
              </div>
            </div>
          )}

          {!playerSafe && region.dmSecrets && region.dmSecrets.length > 0 && (
            <div className="atlas-section">
              <h2>DM Notes / Secrets</h2>
              <div className="atlas-dm-block">
                <div className="atlas-dm-label">Только для мастера</div>
                <ul>{region.dmSecrets.map((s, i) => <li key={i}>{s}</li>)}</ul>
              </div>
            </div>
          )}

          {children.length > 0 && (
            <div className="atlas-section">
              <h2>Подрегионы</h2>
              <div className="atlas-grid">
                {children.map((c) => (
                  <RegionCard key={c.id} region={c} onOpen={() => navigate(`/world/${c.id}`)} />
                ))}
              </div>
            </div>
          )}
        </div>

        <aside>
          {map && (
            <div className="atlas-section" style={{ marginTop: 0 }}>
              <h2>Карта</h2>
              <img className="atlas-map-img" src={map.imageSrc} alt={map.titleRu ?? map.title} loading="lazy" />
              <div style={{ marginTop: 8 }}>
                <Link className="atlas-btn ghost small" to={`/atlas/maps/${atlasMapRouteId(map)}`}>
                  Открыть карту
                </Link>
              </div>
            </div>
          )}

          <div className="atlas-section">
            <h2>Сводка</h2>
            <div className="atlas-panel">
              <dl className="atlas-kv">
                {region.rulingPower && (<><dt>Контроль</dt><dd>{region.rulingPower}</dd></>)}
                {region.culture && (<><dt>Культура</dt><dd>{region.culture}</dd></>)}
                {region.visualTone && (<><dt>Визуальный тон</dt><dd>{region.visualTone}</dd></>)}
              </dl>
              {region.dangers && region.dangers.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="atlas-dm-label" style={{ color: 'var(--fg-faint)', fontSize: '0.75rem', marginBottom: 4 }}>Угрозы</div>
                  <div className="atlas-taglist">{region.dangers.map((d, i) => <span key={i} className="atlas-tag">{d}</span>)}</div>
                </div>
              )}
              {region.themes && region.themes.length > 0 && (
                <div style={{ marginTop: 10 }}>
                  <div className="atlas-dm-label" style={{ color: 'var(--fg-faint)', fontSize: '0.75rem', marginBottom: 4 }}>Темы</div>
                  <div className="atlas-taglist">{region.themes.map((d, i) => <span key={i} className="atlas-tag">{d}</span>)}</div>
                </div>
              )}
            </div>
          </div>

          {modules.length > 0 && (
            <div className="atlas-section">
              <h2>Связанные ваншоты</h2>
              <ul className="atlas-link-list">
                {modules.map((m) => {
                  const campaign = getCampaignByAdventureModuleId(m.id);
                  return (
                    <li key={m.id}>
                      {campaign
                        ? <Link to={`/campaigns/${campaign.id}`} style={{ color: 'var(--gold)' }}>{m.titleRu ?? m.title}</Link>
                        : <span>{m.titleRu ?? m.title}</span>}
                      <span className="muted"> · {m.type}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {(region.linkedLocationIds?.length || region.linkedNpcIds?.length || region.linkedQuestIds?.length) ? (
            <div className="atlas-section">
              <h2>Связи с кампанией</h2>
              <div className="atlas-panel" style={{ fontSize: '0.85rem', color: 'var(--fg-dim)' }}>
                {region.linkedLocationIds?.length ? <div>Локации: {region.linkedLocationIds.join(', ')}</div> : null}
                {region.linkedNpcIds?.length ? <div>NPC: {region.linkedNpcIds.join(', ')}</div> : null}
                {region.linkedQuestIds?.length ? <div>Квесты: {region.linkedQuestIds.join(', ')}</div> : null}
              </div>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}

export function WorldAtlasPage() {
  const { regionId } = useParams<{ regionId: string }>();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  const region = regionId ? getRegionById(regionId) : undefined;

  const topRegions = useMemo(() => {
    const roots = getChildRegions('region-known-world');
    if (!query.trim()) return roots;
    const q = query.trim().toLowerCase();
    return WORLD_REGIONS.filter((r) =>
      (r.titleRu ?? r.title).toLowerCase().includes(q) ||
      r.title.toLowerCase().includes(q) ||
      r.shortDescription.toLowerCase().includes(q));
  }, [query]);

  if (regionId) {
    if (!region) {
      return (
        <div className="atlas-layer">
          <button className="atlas-back-link" onClick={() => navigate('/world')}>← Известный мир</button>
          <p className="atlas-empty">Регион не найден.</p>
        </div>
      );
    }
    return <RegionDetail region={region} />;
  }

  const knownWorld = getRegionById('region-known-world');

  return (
    <div className="atlas-layer">
      <div className="atlas-header">
        <div>
          <h1>Мир · World Atlas</h1>
          <p className="atlas-sub">Известный мир: державы, регионы, города и связанные ваншоты.</p>
        </div>
      </div>

      <div className="atlas-toolbar">
        <input
          className="atlas-input"
          placeholder="Поиск по регионам…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {knownWorld && !query && (
          <button type="button" className="atlas-btn ghost small" onClick={() => navigate('/world/region-known-world')}>
            Открыть карту Известного мира
          </button>
        )}
      </div>

      <div className="atlas-grid">
        {topRegions.map((r) => (
          <RegionCard key={r.id} region={r} onOpen={() => navigate(`/world/${r.id}`)} />
        ))}
      </div>
      {topRegions.length === 0 && <p className="atlas-empty">Ничего не найдено.</p>}
    </div>
  );
}

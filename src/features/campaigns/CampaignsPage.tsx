import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import { CAMPAIGN_MODULES } from '../../data/campaignModules';
import { getRegionById } from '../../data/worldRegions';
import { CAMPAIGN_TYPE_LABELS, type CampaignCanonPolicy, type CampaignModuleType } from '../../types/campaign';
import { useCampaignRuntime } from '../../state/campaignRuntimeStore';

const TYPE_FILTERS: (CampaignModuleType | 'all')[] = [
  'all', 'mainCampaign', 'campaign', 'miniCampaign', 'oneShot', 'historicalOneShot', 'sandbox',
];
const POLICY_FILTERS: (CampaignCanonPolicy | 'all')[] = [
  'all', 'mainCanon', 'historicalCanon', 'possibleCanon', 'alternateCanon', 'nonCanonSandbox',
];

export function CampaignsPage() {
  const navigate = useNavigate();
  const runtime = useCampaignRuntime();
  const [typeFilter, setTypeFilter] = useState<CampaignModuleType | 'all'>('all');
  const [policyFilter, setPolicyFilter] = useState<CampaignCanonPolicy | 'all'>('all');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => CAMPAIGN_MODULES.filter((c) => {
    if (typeFilter !== 'all' && c.type !== typeFilter) return false;
    if (policyFilter !== 'all' && c.canonPolicy !== policyFilter) return false;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      if (!((c.titleRu ?? c.title).toLowerCase().includes(q) || c.description.toLowerCase().includes(q))) return false;
    }
    return true;
  }), [typeFilter, policyFilter, query]);

  return (
    <div className="atlas-layer">
      <div className="atlas-header">
        <div>
          <h1>Кампании · Campaigns</h1>
          <p className="atlas-sub">Все игровые контексты одного мира. Основная кампания открывается старым flow.</p>
        </div>
      </div>

      <div className="atlas-toolbar">
        <input className="atlas-input" placeholder="Поиск…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="atlas-select" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as CampaignModuleType | 'all')}>
          {TYPE_FILTERS.map((t) => <option key={t} value={t}>{t === 'all' ? 'Все типы' : CAMPAIGN_TYPE_LABELS[t]}</option>)}
        </select>
        <select className="atlas-select" value={policyFilter} onChange={(e) => setPolicyFilter(e.target.value as CampaignCanonPolicy | 'all')}>
          {POLICY_FILTERS.map((p) => <option key={p} value={p}>{p === 'all' ? 'Любой canon policy' : p}</option>)}
        </select>
      </div>

      <div className="atlas-grid">
        {filtered.map((c) => {
          const region = c.regionIds[0] ? getRegionById(c.regionIds[0]) : undefined;
          const st = c.protected ? undefined : runtime.getRuntime(c.id).status;
          return (
            <button
              key={c.id}
              type="button"
              className="atlas-card"
              onClick={() => (c.protected ? navigate(c.startRoute) : navigate(`/campaigns/${c.id}`))}
            >
              <div className="atlas-badges">
                <span className="atlas-badge type-badge">{CAMPAIGN_TYPE_LABELS[c.type]}</span>
                <span className="atlas-badge">{c.canonPolicy}</span>
                {c.protected && <span className="atlas-badge canon-fixedCanon">protected</span>}
                {st && st !== 'notStarted' && <span className={`atlas-badge status-${st}`}>{st}</span>}
              </div>
              <h3>{c.titleRu ?? c.title}</h3>
              <p>{c.description}</p>
              {region && <div className="atlas-badges" style={{ marginTop: 'auto' }}><span className="atlas-tag">{region.titleRu ?? region.title}</span></div>}
            </button>
          );
        })}
      </div>
      {filtered.length === 0 && <p className="atlas-empty">Ничего не найдено.</p>}
    </div>
  );
}

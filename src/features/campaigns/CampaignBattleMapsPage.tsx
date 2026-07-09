import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { getBattleMapCatalog, battleMapImageUrl } from '../../data/battleMapCatalog';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';

export function CampaignBattleMapsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const [maps, setMaps] = useState<BattleMapManifestEntry[] | null>(null);
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('all');

  useEffect(() => { getBattleMapCatalog().then(setMaps); }, []);

  const data = campaignId ? store.getData(campaignId) : null;
  const runtime = campaignId ? store.getRuntime(campaignId) : null;
  const isMain = campaignId ? getCampaignById(campaignId)?.protected : false;

  const groups = useMemo(() => {
    const s = new Set<string>();
    (maps ?? []).forEach((m) => (m.groupLabels ?? []).forEach((g) => s.add(g)));
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [maps]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (maps ?? [])
      .filter((m) => group === 'all' || (m.groupLabels ?? []).includes(group))
      .filter((m) => !q || [m.title, m.normalizedName, ...(m.groupLabels ?? [])].some((p) => (p ?? '').toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }));
  }, [maps, query, group]);

  if (!campaignId || !data || !runtime || isMain) {
    return (
      <div className="ucw-lib-page">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Кампания не найдена.</p>
      </div>
    );
  }

  return (
    <div className="ucw-lib-page">
      <div className="ucw-lib-page-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <button className="atlas-back-link" style={{ margin: 0 }} onClick={() => navigate(`/campaigns/${campaignId}/map`)}>← Карта</button>
          <h1>{data.title} · Карты боя</h1>
        </div>
      </div>
      <p className="atlas-sub" style={{ marginTop: -6 }}>
        Готовые поля боя из общей библиотеки (battle-map-vtt). Выберите карту и откройте бой — с переключением день / вечер / ночь.
      </p>

      <div className="atlas-toolbar">
        <input className="atlas-input" placeholder="Поиск карты…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="atlas-select" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">Все группы</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="atlas-sub" style={{ margin: 0 }}>{filtered.length} / {maps?.length ?? 0}</span>
      </div>

      {maps === null ? (
        <p className="atlas-empty">Загрузка каталога…</p>
      ) : (
        <div className="ucw-cardgrid">
          {filtered.map((m) => {
            const preview = battleMapImageUrl(m, 'day');
            const variants = (m.variants ?? []).map((v) => v.type ?? 'default');
            return (
              <button key={m.id} type="button" className="ucw-ecard" onClick={() => navigate(`/campaigns/${campaignId}/battle/${encodeURIComponent(m.id)}`)}>
                {preview && <img className="atlas-map-img" src={preview} alt={m.title} loading="lazy" style={{ maxHeight: 150, objectFit: 'cover' }} />}
                <h3>{m.title}</h3>
                <span className="meta">{[m.gridSizeLabel ?? m.mapSize, ...(m.groupLabels ?? [])].filter(Boolean).join(' · ')}</span>
                <span className="meta">Варианты: {Array.from(new Set(variants)).join(', ') || '—'}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

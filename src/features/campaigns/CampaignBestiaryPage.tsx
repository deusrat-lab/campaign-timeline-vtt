import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';

/**
 * Campaign Bestiary — reuses the SAME shared monster reference the main
 * campaign uses (/data/dm-companion/bestiary.*.json), read-only. The only
 * mutation is "+ В кампанию", which adds the monster as an enemy into THE
 * CURRENT campaign (campaignId from the route) via store.addEnemy — so it can
 * never leak into another campaign or the protected main campaign.
 */
interface BestiaryMonster {
  id: string;
  nameRu?: string;
  nameEn?: string;
  type?: string;
  creatureType?: string;
  cr?: string | number;
  ac?: number;
  hp?: number;
  speed?: string;
  size?: string;
  alignment?: string;
}

function enemyDescription(m: BestiaryMonster): string {
  return [
    m.size && m.type ? `${m.size} · ${m.type}` : (m.type ?? m.creatureType),
    m.cr != null ? `CR ${m.cr}` : '',
    m.speed ? `Скорость ${m.speed}` : '',
    m.alignment,
  ].filter(Boolean).join(' · ');
}

export function CampaignBestiaryPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const [monsters, setMonsters] = useState<BestiaryMonster[] | null>(null);
  const [query, setQuery] = useState('');
  const [added, setAdded] = useState<Record<string, number>>({});

  const data = campaignId ? store.getData(campaignId) : null;
  const isMain = campaignId ? getCampaignById(campaignId)?.protected : false;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const local = await fetch('/data/dm-companion/bestiary.local.json');
        const res = local.ok ? local : await fetch('/data/dm-companion/bestiary.sample.json');
        const json = (await res.json()) as BestiaryMonster[];
        if (!cancelled) setMonsters(Array.isArray(json) ? json : []);
      } catch {
        if (!cancelled) setMonsters([]);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (monsters ?? [])
      .filter((m) => !q || [m.nameRu, m.nameEn, String(m.cr ?? ''), m.type].some((s) => (s ?? '').toLowerCase().includes(q)))
      .sort((a, b) => (a.nameRu ?? a.nameEn ?? '').localeCompare(b.nameRu ?? b.nameEn ?? '', 'ru'));
  }, [monsters, query]);

  if (!campaignId || !data || isMain) {
    return (
      <div className="ucw-lib-page">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Кампания не найдена.</p>
      </div>
    );
  }

  const addToCampaign = (m: BestiaryMonster) => {
    // Scoped strictly to THIS campaign via campaignId from the route.
    store.addEnemy(campaignId, {
      title: m.nameRu ?? m.nameEn ?? 'Существо',
      baseMonster: m.nameEn ?? m.nameRu,
      ac: m.ac,
      hp: m.hp,
      description: enemyDescription(m),
      tags: ['из бестиария'],
    });
    setAdded((prev) => ({ ...prev, [m.id]: (prev[m.id] ?? 0) + 1 }));
  };

  return (
    <div className="ucw-lib-page">
      <div className="ucw-lib-page-head">
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap' }}>
          <button className="atlas-back-link" style={{ margin: 0 }} onClick={() => navigate(`/campaigns/${campaignId}/map`)}>← Карта</button>
          <h1>{data.title} · Бестиарий</h1>
        </div>
      </div>
      <p className="atlas-sub" style={{ marginTop: -6 }}>
        Общий справочник существ (read-only). «+ В кампанию» добавляет существо во <strong>врагов этой кампании</strong> — другие кампании и основная кампания не затрагиваются.
      </p>

      <div className="atlas-toolbar">
        <input className="atlas-input" placeholder="Поиск существа…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <span className="atlas-sub" style={{ margin: 0 }}>{filtered.length} / {monsters?.length ?? 0}</span>
      </div>

      {monsters === null ? (
        <p className="atlas-empty">Загрузка бестиария…</p>
      ) : filtered.length === 0 ? (
        <p className="atlas-empty">Ничего не найдено.</p>
      ) : (
        <div className="ucw-cardgrid">
          {filtered.map((m) => (
            <div key={m.id} className="ucw-ecard" style={{ cursor: 'default' }}>
              <h3>{m.nameRu ?? m.nameEn}</h3>
              {m.nameRu && m.nameEn && <span className="meta">{m.nameEn}</span>}
              <span className="meta">{[m.cr != null ? `CR ${m.cr}` : '', m.ac != null ? `AC ${m.ac}` : '', m.hp != null ? `HP ${m.hp}` : ''].filter(Boolean).join(' · ')}</span>
              <span className="meta">{m.type ?? m.creatureType ?? ''}</span>
              <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
                <button className="atlas-btn small" onClick={() => addToCampaign(m)}>+ В кампанию</button>
                {added[m.id] ? <span className="ucw-placed-badge">добавлено{added[m.id] > 1 ? ` ×${added[m.id]}` : ''}</span> : null}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

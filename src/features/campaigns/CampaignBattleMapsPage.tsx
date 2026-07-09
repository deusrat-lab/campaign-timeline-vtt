import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { getBattleMapCatalog, battleMapImageUrl } from '../../data/battleMapCatalog';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';

/** Create a battle field from any image (upload / generated / URL): the DM
 * gives it a name + grid columns; it becomes a playable field with grid +
 * terrain. Reuses the same board tools — nothing is built by hand. */
function CustomFieldCreator({ campaignId, onCreated }: { campaignId: string; onCreated: (mapId: string) => void }) {
  const store = useUserCampaigns();
  const fileRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('Горное поле боя');
  const [columns, setColumns] = useState(24);

  const create = (imageSrc: string) => {
    const id = store.addCustomBattleMap(campaignId, { title: title.trim() || 'Поле боя', imageSrc, columns });
    onCreated(`custom-${id}`);
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    if (file.size > 4_000_000 && !window.confirm('Картинка больше ~4 МБ — она хранится в браузере и может замедлить приложение. Продолжить?')) { e.target.value = ''; return; }
    const reader = new FileReader();
    reader.onload = () => create(String(reader.result));
    reader.readAsDataURL(file); e.target.value = '';
  };

  return (
    <div className="atlas-panel" style={{ marginBottom: 20 }}>
      <h3 style={{ margin: '0 0 8px', color: 'var(--gold-soft)', fontFamily: 'var(--font-heading)' }}>Создать своё поле боя</h3>
      <p className="atlas-sub" style={{ margin: '0 0 10px' }}>Нет нужной карты (например, горной)? Вставьте свою картинку — сгенерированную или с диска — и она станет полем с сеткой и террейном.</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--fg-faint)' }}>Название<br /><input className="atlas-input" style={{ minWidth: 220 }} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
        <label style={{ fontSize: '0.8rem', color: 'var(--fg-faint)' }}>Клеток по ширине<br /><input className="atlas-input" style={{ minWidth: 90 }} type="number" min={4} max={80} value={columns} onChange={(e) => setColumns(Math.max(4, Math.min(80, Number(e.target.value) || 24)))} /></label>
        <button className="atlas-btn" onClick={() => fileRef.current?.click()}>Загрузить картинку</button>
        <button className="atlas-btn ghost" onClick={() => { const url = window.prompt('URL картинки (https://…):'); if (url && url.trim()) create(url.trim()); }}>Вставить по URL</button>
        <input ref={fileRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={onFile} />
      </div>
    </div>
  );
}

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
        Готовые поля боя из общей библиотеки (battle-map-vtt) + свои поля из любой картинки — с сеткой, террейном и день/ночь.
      </p>

      <CustomFieldCreator campaignId={campaignId} onCreated={(mid) => navigate(`/campaigns/${campaignId}/battle/${mid}`)} />

      {(data.customBattleMaps ?? []).length > 0 && (
        <div className="atlas-section" style={{ marginTop: 0 }}>
          <h2>Мои поля боя</h2>
          <div className="ucw-cardgrid">
            {(data.customBattleMaps ?? []).map((m) => (
              <div key={m.id} className="ucw-ecard" style={{ cursor: 'default' }}>
                <img className="atlas-map-img" src={m.imageSrc} alt={m.title} loading="lazy" style={{ maxHeight: 150, objectFit: 'cover' }} />
                <h3>{m.title}</h3>
                <span className="meta">сетка {m.columns} клеток</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button className="atlas-btn small" onClick={() => navigate(`/campaigns/${campaignId}/battle/custom-${m.id}`)}>Открыть бой</button>
                  <button className="atlas-btn danger small" onClick={() => { if (window.confirm(`Удалить поле «${m.title}»?`)) store.removeCustomBattleMap(campaignId, m.id); }}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="atlas-section" style={{ marginBottom: 0 }}>Общая библиотека</h2>
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

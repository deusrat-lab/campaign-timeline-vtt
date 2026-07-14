import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { getBattleMapCatalog, battleMapImageUrl } from '../../data/battleMapCatalog';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import { scenarioForCampaign } from '../../data/scenarioMerge';

const GRID_PRESETS = [
  { label: '20 × 20', cols: 20, rows: 20 },
  { label: '25 × 25', cols: 25, rows: 25 },
  { label: '30 × 30', cols: 30, rows: 30 },
  { label: '40 × 40', cols: 40, rows: 40 },
  { label: 'По ширине картинки', cols: 30, rows: 0 },
];

async function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}

/** «Создать карту боя»: загрузить дневную (и, по желанию, ночную) картинку,
 * выбрать сетку и сохранить карту в библиотеку кампании. Дальше карта играется
 * с сеткой, террейном и переключением день/ночь. */
function CustomFieldCreator({ campaignId, onCreated }: { campaignId: string; onCreated: (mapId: string) => void }) {
  const store = useUserCampaigns();
  const dayRef = useRef<HTMLInputElement>(null);
  const nightRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [presetIdx, setPresetIdx] = useState(2); // 30×30
  const [dayImage, setDayImage] = useState<string>('');
  const [nightImage, setNightImage] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const pick = async (which: 'day' | 'night', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 5_000_000 && !window.confirm('Картинка больше ~5 МБ — она хранится в браузере. Продолжить?')) return;
    setBusy(true);
    const url = await fileToDataUrl(file);
    if (which === 'day') setDayImage(url); else setNightImage(url);
    setBusy(false);
  };

  const create = () => {
    if (!dayImage) { window.alert('Загрузите хотя бы дневную картинку.'); return; }
    const p = GRID_PRESETS[presetIdx];
    const id = store.addCustomBattleMap(campaignId, {
      title: title.trim() || 'Карта боя',
      dayImage,
      nightImage: nightImage || undefined,
      columns: p.cols,
      rows: p.rows || undefined,
    });
    onCreated(`custom-${id}`);
  };

  if (!open) {
    return (
      <div style={{ marginBottom: 20 }}>
        <button className="atlas-btn" onClick={() => setOpen(true)}>+ Создать карту боя</button>
      </div>
    );
  }

  return (
    <div className="atlas-panel" style={{ marginBottom: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h3 style={{ margin: 0, color: 'var(--gold-soft)', fontFamily: 'var(--font-heading)' }}>Создать карту боя</h3>
        <button className="atlas-btn ghost small" onClick={() => setOpen(false)}>Свернуть</button>
      </div>
      <p className="atlas-sub" style={{ margin: '6px 0 12px' }}>Загрузите дневную и (по желанию) ночную версию картинки, выберите сетку — карта добавится в библиотеку кампании.</p>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <label style={{ fontSize: '0.8rem', color: 'var(--fg-faint)' }}>Название<br />
          <input className="atlas-input" style={{ minWidth: 220 }} placeholder="Например: Горный перевал" value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label style={{ fontSize: '0.8rem', color: 'var(--fg-faint)' }}>Сетка<br />
          <select className="atlas-select" value={presetIdx} onChange={(e) => setPresetIdx(Number(e.target.value))}>
            {GRID_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
          </select>
        </label>
        <div style={{ fontSize: '0.8rem', color: 'var(--fg-faint)' }}>Дневная картинка<br />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
            <button className="atlas-btn small" onClick={() => dayRef.current?.click()}>{dayImage ? 'Заменить' : 'Загрузить'}</button>
            {dayImage && <img src={dayImage} alt="день" style={{ height: 44, borderRadius: 6, border: '1px solid var(--border)' }} />}
          </div>
        </div>
        <div style={{ fontSize: '0.8rem', color: 'var(--fg-faint)' }}>Ночная картинка (необязательно)<br />
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 3 }}>
            <button className="atlas-btn ghost small" onClick={() => nightRef.current?.click()}>{nightImage ? 'Заменить' : 'Загрузить'}</button>
            {nightImage && <img src={nightImage} alt="ночь" style={{ height: 44, borderRadius: 6, border: '1px solid var(--border)' }} />}
          </div>
        </div>
        <input ref={dayRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pick('day', e)} />
        <input ref={nightRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => pick('night', e)} />
      </div>
      <div style={{ marginTop: 14 }}>
        <button className="atlas-btn" disabled={!dayImage || busy} onClick={create}>Создать и открыть</button>
        {busy && <span className="atlas-sub" style={{ marginLeft: 10 }}>Загрузка…</span>}
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
  const scenarioBattleMapIds = useMemo(() => {
    if (!data) return null;
    const ids = scenarioForCampaign(data)?.battleMapIds;
    return ids?.length ? new Set(ids) : null;
  }, [data]);

  const groups = useMemo(() => {
    const s = new Set<string>();
    (maps ?? [])
      .filter((m) => !scenarioBattleMapIds || scenarioBattleMapIds.has(m.id))
      .forEach((m) => (m.groupLabels ?? []).forEach((g) => s.add(g)));
    return [...s].sort((a, b) => a.localeCompare(b, 'ru'));
  }, [maps, scenarioBattleMapIds]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (maps ?? [])
      .filter((m) => !scenarioBattleMapIds || scenarioBattleMapIds.has(m.id))
      .filter((m) => group === 'all' || (m.groupLabels ?? []).includes(group))
      .filter((m) => !q || [m.title, m.normalizedName, ...(m.groupLabels ?? [])].some((p) => (p ?? '').toLowerCase().includes(q)))
      .sort((a, b) => a.title.localeCompare(b.title, 'ru', { numeric: true }));
  }, [maps, query, group, scenarioBattleMapIds]);

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
        Готовые поля боя, отфильтрованные под выбранную кампанию, + свои поля из любой картинки — с сеткой, террейном и день/ночь.
      </p>

      <CustomFieldCreator campaignId={campaignId} onCreated={(mid) => navigate(`/campaigns/${campaignId}/battle/${mid}?returnTo=${encodeURIComponent(`/campaigns/${campaignId}/library/battle-maps`)}`)} />

      {(data.customBattleMaps ?? []).length > 0 && (
        <div className="atlas-section" style={{ marginTop: 0 }}>
          <h2>Мои поля боя</h2>
          <div className="ucw-cardgrid">
            {(data.customBattleMaps ?? []).map((m) => (
              <div key={m.id} className="ucw-ecard" style={{ cursor: 'default' }}>
                <img className="atlas-map-img" src={m.dayImage} alt={m.title} loading="lazy" style={{ maxHeight: 150, objectFit: 'cover' }} />
                <h3>{m.title}</h3>
                <span className="meta">сетка {m.rows ? `${m.columns}×${m.rows}` : `${m.columns} клеток`}{m.nightImage ? ' · день/ночь' : ''}</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                  <button className="atlas-btn small" onClick={() => navigate(`/campaigns/${campaignId}/battle/custom-${m.id}?returnTo=${encodeURIComponent(`/campaigns/${campaignId}/library/battle-maps`)}`)}>Открыть бой</button>
                  <button className="atlas-btn danger small" onClick={() => { if (window.confirm(`Удалить поле «${m.title}»?`)) store.removeCustomBattleMap(campaignId, m.id); }}>Удалить</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2 className="atlas-section" style={{ marginBottom: 0 }}>Подходящие карты библиотеки</h2>
      <div className="atlas-toolbar">
        <input className="atlas-input" placeholder="Поиск карты…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="atlas-select" value={group} onChange={(e) => setGroup(e.target.value)}>
          <option value="all">Все группы</option>
          {groups.map((g) => <option key={g} value={g}>{g}</option>)}
        </select>
        <span className="atlas-sub" style={{ margin: 0 }}>{filtered.length} / {scenarioBattleMapIds ? scenarioBattleMapIds.size : (maps?.length ?? 0)}</span>
      </div>

      {maps === null ? (
        <p className="atlas-empty">Загрузка каталога…</p>
      ) : filtered.length === 0 ? (
        <p className="atlas-empty">Для этой кампании пока нет подходящих готовых карт в общей библиотеке. Используйте «Мои поля боя» и загрузите свои карты сражений.</p>
      ) : (
        <div className="ucw-cardgrid">
          {filtered.map((m) => {
            const preview = battleMapImageUrl(m, 'day');
            const variants = (m.variants ?? []).map((v) => v.type ?? 'default');
            return (
              <button key={m.id} type="button" className="ucw-ecard" onClick={() => navigate(`/campaigns/${campaignId}/battle/${encodeURIComponent(m.id)}?returnTo=${encodeURIComponent(`/campaigns/${campaignId}/library/battle-maps`)}`)}>
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

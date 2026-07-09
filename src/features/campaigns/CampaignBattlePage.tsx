import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { getBattleMapCatalog, getBattleMapById, battleMapImageUrl, battleMapVariantTypes, BATTLE_VARIANT_LABEL } from '../../data/battleMapCatalog';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import type { CampaignBattleToken, BattleTokenSide, CampaignBattleBoard } from '../../types/userCampaign';

const SIDE_LABEL: Record<BattleTokenSide, string> = { enemy: 'Враг', player: 'Игрок', ally: 'Союзник', neutral: 'Нейтрал' };

export function CampaignBattlePage() {
  const { campaignId, mapId } = useParams<{ campaignId: string; mapId: string }>();
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const [catalog, setCatalog] = useState<BattleMapManifestEntry[] | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const data = campaignId ? store.getData(campaignId) : null;
  const runtime = campaignId ? store.getRuntime(campaignId) : null;
  const isMain = campaignId ? getCampaignById(campaignId)?.protected : false;

  const board: CampaignBattleBoard = runtime?.battleBoard ?? { tokens: [], round: 1 };
  const map = catalog && mapId ? getBattleMapById(catalog, mapId) : undefined;
  const variants = map ? battleMapVariantTypes(map) : [];
  const variant = board.variant && variants.includes(board.variant) ? board.variant : variants[0];

  const [zoom, setZoom] = useState(board.view?.zoom ?? 1);
  const [pan, setPan] = useState({ x: board.view?.panX ?? 0, y: board.view?.panY ?? 0 });
  const [placing, setPlacing] = useState<{ side: BattleTokenSide; name: string; ac?: number; hp?: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fitted, setFitted] = useState(false);

  useEffect(() => { getBattleMapCatalog().then(setCatalog); }, []);

  // Persist the loaded map id once the catalog is ready.
  useEffect(() => {
    if (campaignId && map && board.mapId !== map.id) {
      store.updateRuntime(campaignId, (p) => ({ ...p, battleBoard: { ...(p.battleBoard ?? { tokens: [] }), mapId: map.id, variant: p.battleBoard?.variant ?? variants[0] } }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map?.id]);

  const patchBoard = (updater: (b: CampaignBattleBoard) => CampaignBattleBoard) => {
    if (!campaignId) return;
    store.updateRuntime(campaignId, (p) => ({ ...p, battleBoard: updater(p.battleBoard ?? { tokens: [], round: 1 }) }));
  };

  const fit = () => {
    const vp = viewportRef.current, img = imgRef.current;
    if (!vp || !img || !img.naturalWidth || vp.clientWidth < 2 || vp.clientHeight < 2) return;
    const z = Math.min(vp.clientWidth / img.naturalWidth, vp.clientHeight / img.naturalHeight) * 0.98;
    setZoom(z);
    setPan({ x: (vp.clientWidth - img.naturalWidth * z) / 2, y: (vp.clientHeight - img.naturalHeight * z) / 2 });
  };
  useEffect(() => {
    if (fitted) return;
    const t = setTimeout(() => { fit(); setFitted(true); }, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitted, variant, map?.id]);

  if (!campaignId || !data || !runtime || isMain) {
    return (
      <div className="ucw-lib-page">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Кампания не найдена.</p>
      </div>
    );
  }

  const imgUrl = battleMapImageUrl(map, variant);

  const clientToPct = (cx: number, cy: number) => {
    const img = imgRef.current; if (!img) return { x: 50, y: 50 };
    const r = img.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((cy - r.top) / r.height) * 100)) };
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const vp = viewportRef.current; if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const nz = Math.max(0.15, Math.min(6, zoom * (e.deltaY < 0 ? 1.12 : 0.89)));
    const wx = (cx - pan.x) / zoom, wy = (cy - pan.y) / zoom;
    setZoom(nz); setPan({ x: cx - wx * nz, y: cy - wy * nz });
  };

  const downRef = useRef<{ x: number; y: number; moved: boolean; sp: { x: number; y: number } } | null>(null);
  const onDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    downRef.current = { x: e.clientX, y: e.clientY, moved: false, sp: { ...pan } };
    const move = (ev: MouseEvent) => {
      const d = downRef.current; if (!d) return;
      if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 4) d.moved = true;
      if (!placing && d.moved) setPan({ x: d.sp.x + (ev.clientX - d.x), y: d.sp.y + (ev.clientY - d.y) });
    };
    const up = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up);
      const d = downRef.current; downRef.current = null; if (!d) return;
      if (!d.moved && placing) {
        const pct = clientToPct(ev.clientX, ev.clientY);
        const tok: CampaignBattleToken = { id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: placing.name, side: placing.side, x: pct.x, y: pct.y, ac: placing.ac, currentHp: placing.hp, maxHp: placing.hp };
        patchBoard((b) => ({ ...b, tokens: [...b.tokens, tok] }));
        setPlacing(null);
      } else if (d.moved) {
        patchBoard((b) => ({ ...b, view: { zoom, panX: d.sp.x + (ev.clientX - d.x), panY: d.sp.y + (ev.clientY - d.y) } }));
      }
    };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  const dragToken = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const move = (ev: MouseEvent) => { const pct = clientToPct(ev.clientX, ev.clientY); patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === id ? { ...t, x: pct.x, y: pct.y } : t) })); };
    const up = () => { window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); };
    window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
  };

  const selTok = board.tokens.find((t) => t.id === selected);

  return (
    <div className="ucw">
      <div className="ucw-header">
        <div className="ucw-title">
          <button className="atlas-back-link" style={{ margin: 0 }} onClick={() => navigate(`/campaigns/${campaignId}/library/battle-maps`)}>← Карты боя</button>
          <span className="atlas-crumb-sep">→</span>
          <strong>{map?.title ?? 'Бой'}</strong>
          <span className="ucw-chip">Бой · изолирован</span>
        </div>
        <div className="ucw-header-actions">
          {variants.length > 1 && (
            <div className="ucw-segmented" role="group" aria-label="Время суток">
              {variants.map((v) => (
                <button key={v} className={variant === v ? 'active' : ''} onClick={() => patchBoard((b) => ({ ...b, variant: v }))}>
                  {BATTLE_VARIANT_LABEL[v] ?? v}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="ucw-toolbar">
        <button className="ucw-tbtn" onClick={() => setZoom((z) => Math.min(6, z * 1.2))}>+</button>
        <button className="ucw-tbtn" onClick={() => setZoom((z) => Math.max(0.15, z / 1.2))}>−</button>
        <span className="ucw-zoomreadout">{Math.round(zoom * 100)}%</span>
        <button className="ucw-tbtn" onClick={fit}>По размеру экрана</button>
        <span className="sep" />
        <span className="atlas-sub" style={{ margin: 0 }}>Раунд {board.round ?? 1}</span>
        <button className="ucw-tbtn" onClick={() => patchBoard((b) => ({ ...b, round: (b.round ?? 1) + 1 }))}>+ раунд</button>
        <button className="ucw-tbtn" onClick={() => { if (window.confirm('Убрать все токены с поля?')) patchBoard((b) => ({ ...b, tokens: [] })); }}>Очистить поле</button>
        {placing && <span className="ucw-chip">Клик по карте — поставить: {placing.name}</span>}
      </div>

      <div className="ucw-body">
        <div className={`ucw-viewport${placing ? ' placing' : ''}`} ref={viewportRef} onMouseDown={onDown} onWheel={onWheel}>
          <div className="ucw-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <div className="ucw-mapstack">
              {imgUrl && <img ref={imgRef} className="ucw-mapimg" src={imgUrl} alt={map?.title} draggable={false} onLoad={() => { if (!fitted) { fit(); setFitted(true); } }} />}
              <div className="ucw-markers">
                {board.tokens.map((t) => (
                  <div key={t.id} className={`ucw-btoken side-${t.side}${selected === t.id ? ' selected' : ''}`} style={{ left: `${t.x}%`, top: `${t.y}%` }}
                    onMouseDown={(e) => dragToken(e, t.id)} onClick={(e) => { e.stopPropagation(); setSelected(t.id); }} title={t.name}>
                    <span className="btoken-init">{t.name.slice(0, 2)}</span>
                    {(t.currentHp != null) && <span className="btoken-hp">{t.currentHp}{t.maxHp ? `/${t.maxHp}` : ''}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="ucw-legend">
            <div><span className="dot" style={{ background: 'var(--danger)' }} />Враг</div>
            <div><span className="dot" style={{ background: '#4f7fd6' }} />Игрок</div>
            <div><span className="dot" style={{ background: 'var(--green)' }} />Союзник</div>
          </div>
        </div>

        <aside className="ucw-library">
          <h2 className="ucw-lib-heading">Расстановка</h2>
          <p className="atlas-sub" style={{ fontSize: '0.82rem' }}>Выберите токен и кликните по карте, чтобы поставить.</p>
          <div className="ucw-add-grid">
            <button className="atlas-btn small" onClick={() => setPlacing({ side: 'player', name: 'Игрок' })}>+ Игрок</button>
            <button className="atlas-btn small" onClick={() => setPlacing({ side: 'ally', name: 'Союзник' })}>+ Союзник</button>
            <button className="atlas-btn small" onClick={() => setPlacing({ side: 'neutral', name: 'Нейтрал' })}>+ Нейтрал</button>
            <button className="atlas-btn small" onClick={() => { const n = window.prompt('Имя токена:'); if (n) setPlacing({ side: 'enemy', name: n }); }}>+ Свой</button>
          </div>

          <div className="ucw-lib-group">
            <div className="label">Враги кампании</div>
            {data.enemies.length === 0 ? <p className="ucw-empty-note">Нет врагов. Добавьте их в разделе «Враги».</p> : data.enemies.map((e) => (
              <div key={e.id} className="ucw-entity-row">
                <span>{e.title}{e.hp ? ` · HP ${e.hp}` : ''}</span>
                <div className="row-actions">
                  <button onClick={() => setPlacing({ side: 'enemy', name: e.title, ac: e.ac, hp: e.hp })}>{placing?.name === e.title ? '…клик' : 'На поле'}</button>
                </div>
              </div>
            ))}
          </div>

          <div className="ucw-lib-group">
            <div className="label">Токены на поле ({board.tokens.length})</div>
            {board.tokens.length === 0 ? <p className="ucw-empty-note">Пока пусто.</p> : board.tokens.map((t) => (
              <div key={t.id} className={`ucw-entity-row${selected === t.id ? ' selected' : ''}`}>
                <span>{SIDE_LABEL[t.side]}: {t.name}{t.currentHp != null ? ` · ${t.currentHp}${t.maxHp ? '/' + t.maxHp : ''}` : ''}</span>
                <div className="row-actions">
                  <button onClick={() => setSelected(t.id)}>Открыть</button>
                  <button onClick={() => patchBoard((b) => ({ ...b, tokens: b.tokens.filter((x) => x.id !== t.id) }))}>✕</button>
                </div>
              </div>
            ))}
          </div>

          {selTok && (
            <div className="ucw-card" style={{ marginTop: 12 }}>
              <label>Имя</label>
              <input value={selTok.name} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, name: e.target.value } : t) }))} />
              <div style={{ display: 'flex', gap: 8 }}>
                <div style={{ flex: 1 }}><label>HP</label><input type="number" value={selTok.currentHp ?? ''} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, currentHp: Number(e.target.value) } : t) }))} /></div>
                <div style={{ flex: 1 }}><label>Макс HP</label><input type="number" value={selTok.maxHp ?? ''} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, maxHp: Number(e.target.value) } : t) }))} /></div>
                <div style={{ flex: 1 }}><label>AC</label><input type="number" value={selTok.ac ?? ''} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, ac: Number(e.target.value) } : t) }))} /></div>
              </div>
              <div className="ucw-card-actions">
                <button className="atlas-btn ghost small" onClick={() => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, currentHp: (t.currentHp ?? 0) - 5 } : t) }))}>−5 HP</button>
                <button className="atlas-btn ghost small" onClick={() => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, currentHp: (t.currentHp ?? 0) + 5 } : t) }))}>+5 HP</button>
                <button className="atlas-btn danger small" onClick={() => { patchBoard((b) => ({ ...b, tokens: b.tokens.filter((t) => t.id !== selTok.id) })); setSelected(null); }}>Убрать</button>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

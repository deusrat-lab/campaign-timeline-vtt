import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { getBattleMapCatalog, getBattleMapById, battleMapImageUrl, battleMapVariantTypes, BATTLE_VARIANT_LABEL } from '../../data/battleMapCatalog';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import type { CampaignBattleToken, BattleTokenSide, CampaignBattleBoard } from '../../types/userCampaign';


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

  // Each battle map has its OWN board (tokens/terrain/grid/view), keyed by the
  // route map id. Fall back to the legacy single `battleBoard` only when it
  // belonged to THIS same map, so old campaigns keep their one saved setup on
  // that map and every other map opens clean.
  const emptyBoard: CampaignBattleBoard = { tokens: [], round: 1 };
  const board: CampaignBattleBoard =
    (mapId ? runtime?.battleBoards?.[mapId] : undefined)
    ?? (runtime?.battleBoard && runtime.battleBoard.mapId === mapId ? runtime.battleBoard : emptyBoard);
  // Player view = read-only board (see what the DM set up, edit nothing). The
  // DM can flip to Player View to preview exactly what players get.
  const isPlayer = runtime?.mode === 'playerView';
  const isPresented = !!mapId && runtime?.presentedBattle?.mapId === mapId;
  // Custom field (`custom-<id>`) or a shared-catalog map.
  const isCustom = !!mapId && mapId.startsWith('custom-');
  const customMap = isCustom ? (data?.customBattleMaps ?? []).find((m) => m.id === mapId!.slice(7)) : undefined;
  const map = !isCustom && catalog && mapId ? getBattleMapById(catalog, mapId) : undefined;
  const variants = isCustom
    ? (customMap?.nightImage ? ['day', 'night'] : [])
    : (map ? battleMapVariantTypes(map) : []);
  const variant = board.variant && variants.includes(board.variant) ? board.variant : variants[0];
  const columns = board.columns ?? customMap?.columns ?? 24;
  const title = customMap?.title ?? map?.title ?? 'Бой';

  const [zoom, setZoom] = useState(board.view?.zoom ?? 1);
  const [pan, setPan] = useState({ x: board.view?.panX ?? 0, y: board.view?.panY ?? 0 });
  const [placing, setPlacing] = useState<{ side: BattleTokenSide; name: string; ac?: number; hp?: number } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fitted, setFitted] = useState(false);
  const [terrainMode, setTerrainMode] = useState<'off' | 'blocked' | 'difficult' | 'erase'>('off');
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  // Live distance readout while a token is dragged (D&D 5e: 1 cell = 5 ft,
  // diagonal counts as one — Chebyshev distance). Positioned at the pointer.
  const [measure, setMeasure] = useState<{ cells: number; feet: number; sx: number; sy: number; ex: number; ey: number } | null>(null);
  // Active touch/mouse pointers (id → viewport-local point) for pinch-zoom.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist: number; zoom: number; midWorldX: number; midWorldY: number } | null>(null);
  // The app shell is content-height, so size the board explicitly to fill the
  // space below the top chrome — otherwise the map viewport collapses (esp. on
  // mobile, where the library stacks below it). Mirrors the map workspace.
  const rootRef = useRef<HTMLDivElement>(null);
  const [shellHeight, setShellHeight] = useState<number>();

  useEffect(() => { getBattleMapCatalog().then(setCatalog); }, []);

  useLayoutEffect(() => {
    const measure = () => {
      const el = rootRef.current; if (!el) return;
      setShellHeight(Math.max(360, window.innerHeight - el.getBoundingClientRect().top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  // Initialize this map's own board once (if it has no entry yet), carrying over
  // a legacy single-board setup only when it belonged to this same map.
  useEffect(() => {
    if (campaignId && mapId && (map || customMap) && !runtime?.battleBoards?.[mapId]) {
      store.updateRuntime(campaignId, (p) => {
        const legacy = p.battleBoard && p.battleBoard.mapId === mapId ? p.battleBoard : undefined;
        const seed: CampaignBattleBoard = legacy ?? { tokens: [], round: 1, mapId, variant: variants[0], columns: customMap?.columns };
        return { ...p, battleBoards: { ...(p.battleBoards ?? {}), [mapId]: { ...seed, mapId } } };
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapId, map?.id, customMap?.id]);

  const patchBoard = (updater: (b: CampaignBattleBoard) => CampaignBattleBoard) => {
    if (!campaignId || !mapId) return;
    store.updateRuntime(campaignId, (p) => {
      const prev = p.battleBoards?.[mapId]
        ?? (p.battleBoard && p.battleBoard.mapId === mapId ? p.battleBoard : { tokens: [], round: 1 });
      return { ...p, battleBoards: { ...(p.battleBoards ?? {}), [mapId]: { ...updater(prev), mapId } } };
    });
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

  // Declared before the early return below so hook order stays stable when the
  // campaign hydrates from the server (data null → present).
  const downRef = useRef<{ x: number; y: number; moved: boolean; sp: { x: number; y: number } } | null>(null);

  if (!campaignId || !data || !runtime || isMain) {
    return (
      <div className="ucw-lib-page">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Кампания не найдена.</p>
      </div>
    );
  }

  const imgUrl = isCustom
    ? (variant === 'night' && customMap?.nightImage ? customMap.nightImage : customMap?.dayImage)
    : battleMapImageUrl(map, variant);

  const clientToPct = (cx: number, cy: number) => {
    const img = imgRef.current; if (!img) return { x: 50, y: 50 };
    const r = img.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((cy - r.top) / r.height) * 100)) };
  };

  // Grid geometry. Custom maps with a fixed NxN preset use those rows; otherwise
  // rows follow the image aspect so cells stay square.
  const rows = customMap?.rows
    ? customMap.rows
    : (natural ? Math.max(1, Math.round((natural.h / natural.w) * columns)) : columns);
  const cellW = 100 / columns;            // % of width
  const cellH = 100 / rows;               // % of height
  const cellAt = (pctX: number, pctY: number) => ({ col: Math.min(columns - 1, Math.floor(pctX / cellW)), row: Math.min(rows - 1, Math.floor(pctY / cellH)) });
  const snapPct = (pctX: number, pctY: number) => {
    if (!board.showGrid || !board.snap) return { x: pctX, y: pctY };
    const { col, row } = cellAt(pctX, pctY);
    return { x: (col + 0.5) * cellW, y: (row + 0.5) * cellH };
  };
  const paintCell = (pctX: number, pctY: number) => {
    const { col, row } = cellAt(pctX, pctY);
    const key = `${row},${col}`;
    patchBoard((b) => {
      const terrain = { ...(b.terrain ?? {}) };
      if (terrainMode === 'erase') delete terrain[key];
      else if (terrainMode === 'blocked' || terrainMode === 'difficult') terrain[key] = terrainMode;
      return { ...b, terrain };
    });
  };

  const zoomAt = (cx: number, cy: number, factor: number) => {
    const nz = Math.max(0.15, Math.min(6, zoom * factor));
    const wx = (cx - pan.x) / zoom, wy = (cy - pan.y) / zoom;
    setZoom(nz); setPan({ x: cx - wx * nz, y: cy - wy * nz });
    patchBoard((b) => ({ ...b, view: { zoom: nz, panX: cx - wx * nz, panY: cy - wy * nz } }));
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const vp = viewportRef.current; if (!vp) return;
    const rect = vp.getBoundingClientRect();
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 0.89);
  };

  // Pointer-based pan / place / paint / pinch-zoom — works with both mouse and
  // touch. Two fingers = pinch to zoom; one finger = pan (or place/paint).
  const onPointerDown = (e: React.PointerEvent) => {
    const vp = viewportRef.current; if (!vp) return;
    const rect = vp.getBoundingClientRect();
    vp.setPointerCapture?.(e.pointerId);
    pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (pointersRef.current.size === 2) {
      const [a, b] = [...pointersRef.current.values()];
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), zoom, midWorldX: (midX - pan.x) / zoom, midWorldY: (midY - pan.y) / zoom };
      downRef.current = null;
      return;
    }
    if (e.button != null && e.button !== 0 && e.pointerType === 'mouse') return;
    downRef.current = { x: e.clientX, y: e.clientY, moved: false, sp: { ...pan } };
    if (terrainMode !== 'off') { const p = clientToPct(e.clientX, e.clientY); paintCell(p.x, p.y); }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const vp = viewportRef.current; if (!vp) return;
    const rect = vp.getBoundingClientRect();
    if (pointersRef.current.has(e.pointerId)) pointersRef.current.set(e.pointerId, { x: e.clientX - rect.left, y: e.clientY - rect.top });
    // Pinch-zoom with two pointers.
    if (pointersRef.current.size === 2 && pinchRef.current) {
      const [a, b] = [...pointersRef.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const midX = (a.x + b.x) / 2, midY = (a.y + b.y) / 2;
      const nz = Math.max(0.15, Math.min(6, pinchRef.current.zoom * (dist / (pinchRef.current.dist || 1))));
      setZoom(nz); setPan({ x: midX - pinchRef.current.midWorldX * nz, y: midY - pinchRef.current.midWorldY * nz });
      return;
    }
    const d = downRef.current; if (!d) return;
    if (Math.abs(e.clientX - d.x) + Math.abs(e.clientY - d.y) > 4) d.moved = true;
    if (terrainMode !== 'off') { const p = clientToPct(e.clientX, e.clientY); paintCell(p.x, p.y); }
    else if (!placing && d.moved) setPan({ x: d.sp.x + (e.clientX - d.x), y: d.sp.y + (e.clientY - d.y) });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    const d = downRef.current; if (!d) return;
    if (pointersRef.current.size > 0) return; // still pinching / other finger down
    downRef.current = null;
    if (terrainMode !== 'off') return;
    if (!d.moved && placing) {
      const raw = clientToPct(e.clientX, e.clientY);
      const pct = snapPct(raw.x, raw.y);
      const tok: CampaignBattleToken = { id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`, name: placing.name, side: placing.side, x: pct.x, y: pct.y, ac: placing.ac, currentHp: placing.hp, maxHp: placing.hp };
      patchBoard((b) => ({ ...b, tokens: [...b.tokens, tok] }));
      setPlacing(null);
    } else if (d.moved) {
      patchBoard((b) => ({ ...b, view: { zoom, panX: d.sp.x + (e.clientX - d.x), panY: d.sp.y + (e.clientY - d.y) } }));
    }
  };

  // Drag a token with mouse OR touch, showing the live distance moved.
  const dragToken = (e: React.PointerEvent, id: string) => {
    if (terrainMode !== 'off' || isPlayer) return;
    e.stopPropagation();
    const el = e.currentTarget as HTMLElement;
    const pid = e.pointerId;
    try { el.setPointerCapture?.(pid); } catch { /* pointer not capturable — window listeners below still work */ }
    const tok = board.tokens.find((t) => t.id === id);
    const start = tok ? cellAt(tok.x, tok.y) : { col: 0, row: 0 };
    const move = (ev: PointerEvent) => {
      const pct = clientToPct(ev.clientX, ev.clientY);
      const cur = cellAt(pct.x, pct.y);
      const cells = Math.max(Math.abs(cur.col - start.col), Math.abs(cur.row - start.row));
      const vp = viewportRef.current; const rect = vp?.getBoundingClientRect();
      setMeasure({ cells, feet: cells * 5, sx: 0, sy: 0, ex: rect ? ev.clientX - rect.left : 0, ey: rect ? ev.clientY - rect.top : 0 });
      patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === id ? { ...t, x: pct.x, y: pct.y } : t) }));
    };
    const up = (ev: PointerEvent) => {
      try { el.releasePointerCapture?.(pid); } catch { /* already released */ }
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      const raw = clientToPct(ev.clientX, ev.clientY); const pct = snapPct(raw.x, raw.y);
      patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === id ? { ...t, x: pct.x, y: pct.y } : t) }));
      setMeasure(null);
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  };

  const selTok = board.tokens.find((t) => t.id === selected);
  // Initiative order — highest acts first (undefined sorts last), same rule as
  // the main campaign's battle. Rendered at the TOP of the panel.
  const ordered = [...board.tokens].sort((a, b) => (b.initiative ?? -999) - (a.initiative ?? -999) || a.name.localeCompare(b.name, 'ru'));
  const setInit = (id: string, v: number | undefined) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === id ? { ...t, initiative: v } : t) }));
  const rollAllInitiative = () => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => ({ ...t, initiative: 1 + Math.floor(Math.random() * 20) })) }));

  return (
    <div className="ucw" ref={rootRef} style={shellHeight ? { height: shellHeight } : undefined}>
      <div className="ucw-header">
        <div className="ucw-title">
          <button className="atlas-back-link" style={{ margin: 0 }} onClick={() => navigate(`/campaigns/${campaignId}/library/battle-maps`)}>← Карты боя</button>
          <span className="atlas-crumb-sep">→</span>
          <strong>{title}</strong>
          <span className="ucw-chip">{isCustom ? 'Своё поле · изолирован' : 'Бой · изолирован'}</span>
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
          {!isPlayer && campaignId && mapId && (
            <button
              className={`ucw-tbtn ${isPresented ? 'active' : ''}`}
              title={isPresented ? 'Игроки видят этот бой — нажмите, чтобы скрыть' : 'Открыть этот бой игрокам (появится у них)'}
              onClick={() => store.updateRuntime(campaignId, (p) => ({ ...p, presentedBattle: isPresented ? null : { mapId } }))}
            >
              {isPresented ? '● Показано игрокам' : '▶ Показать игрокам'}
            </button>
          )}
          {isPlayer && <span className="ucw-chip">Режим игрока — только просмотр</span>}
        </div>
      </div>

      <div className="ucw-toolbar">
        <button className="ucw-tbtn" onClick={() => setZoom((z) => Math.min(6, z * 1.2))}>+</button>
        <button className="ucw-tbtn" onClick={() => setZoom((z) => Math.max(0.15, z / 1.2))}>−</button>
        <span className="ucw-zoomreadout">{Math.round(zoom * 100)}%</span>
        <button className="ucw-tbtn" onClick={fit}>По размеру экрана</button>
        <span className="sep" />
        <span className="atlas-sub" style={{ margin: 0 }}>Раунд {board.round ?? 1}</span>
        {!isPlayer && <button className="ucw-tbtn" onClick={() => patchBoard((b) => ({ ...b, round: (b.round ?? 1) + 1 }))}>+ раунд</button>}
        {!isPlayer && <button className="ucw-tbtn" onClick={() => { if (window.confirm('Убрать все токены с поля?')) patchBoard((b) => ({ ...b, tokens: [] })); }}>Очистить токены</button>}
        <span className="sep" />
        <button className={`ucw-tbtn ${board.showGrid ? 'active' : ''}`} onClick={() => patchBoard((b) => ({ ...b, showGrid: !b.showGrid }))}>Сетка</button>
        {board.showGrid && !isPlayer && (
          <>
            <label style={{ fontSize: '0.8rem', color: 'var(--fg-dim)' }}>Клеток:
              <input type="number" min={4} max={80} value={columns} onChange={(e) => patchBoard((b) => ({ ...b, columns: Math.max(4, Math.min(80, Number(e.target.value) || 24)) }))}
                style={{ width: 56, marginLeft: 4, background: 'var(--bg-card)', border: '1px solid var(--border-soft)', color: 'var(--fg)', borderRadius: 6, padding: '3px 6px' }} />
            </label>
            <button className={`ucw-tbtn ${board.snap ? 'active' : ''}`} onClick={() => patchBoard((b) => ({ ...b, snap: !b.snap }))}>Привязка</button>
            <span className="sep" />
            <span style={{ fontSize: '0.78rem', color: 'var(--fg-faint)' }}>Террейн:</span>
            {(['off', 'blocked', 'difficult', 'erase'] as const).map((m) => (
              <button key={m} className={`ucw-tbtn ${terrainMode === m ? 'active' : ''}`} onClick={() => setTerrainMode(m)}>
                {m === 'off' ? 'Выкл' : m === 'blocked' ? 'Стена' : m === 'difficult' ? 'Трудно' : 'Стереть'}
              </button>
            ))}
          </>
        )}
        {placing && <span className="ucw-chip">Клик по карте — поставить: {placing.name}</span>}
      </div>

      <div className="ucw-body">
        <div className={`ucw-viewport${placing || terrainMode !== 'off' ? ' placing' : ''}`} ref={viewportRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onWheel={onWheel}>
          <div className="ucw-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <div className="ucw-mapstack">
              {imgUrl && <img ref={imgRef} className="ucw-mapimg" src={imgUrl} alt={title} draggable={false} onLoad={(e) => { const im = e.currentTarget; setNatural({ w: im.naturalWidth, h: im.naturalHeight }); if (!fitted) { fit(); setFitted(true); } }} />}
              {/* grid + terrain overlay */}
              {board.showGrid && (
                <svg className="ucw-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {Object.entries(board.terrain ?? {}).map(([key, type]) => {
                    const [r, c] = key.split(',').map(Number);
                    return <rect key={key} x={c * cellW} y={r * cellH} width={cellW} height={cellH}
                      fill={type === 'blocked' ? 'rgba(179,65,58,0.45)' : 'rgba(192,138,46,0.4)'} stroke="none" />;
                  })}
                  {Array.from({ length: columns + 1 }, (_, i) => <line key={`v${i}`} x1={i * cellW} y1={0} x2={i * cellW} y2={100} stroke="rgba(255,255,255,0.25)" strokeWidth={0.15} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1 } as React.CSSProperties} />)}
                  {Array.from({ length: rows + 1 }, (_, i) => <line key={`h${i}`} x1={0} y1={i * cellH} x2={100} y2={i * cellH} stroke="rgba(255,255,255,0.25)" strokeWidth={0.15} vectorEffect="non-scaling-stroke" style={{ strokeWidth: 1 } as React.CSSProperties} />)}
                </svg>
              )}
              <div className="ucw-markers">
                {board.tokens.map((t) => (
                  <div key={t.id} className={`ucw-btoken side-${t.side}${selected === t.id ? ' selected' : ''}`} style={{ left: `${t.x}%`, top: `${t.y}%` }}
                    onPointerDown={(e) => dragToken(e, t.id)} onClick={(e) => { e.stopPropagation(); setSelected(t.id); }} title={t.name}>
                    <span className="btoken-init">{t.name.slice(0, 2)}</span>
                    {(t.currentHp != null) && <span className="btoken-hp">{t.currentHp}{t.maxHp ? `/${t.maxHp}` : ''}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {measure && (
            <div className="ucw-measure" style={{ left: measure.ex, top: measure.ey }}>
              {measure.cells} кл · {measure.feet} фт
            </div>
          )}
          <div className="ucw-legend">
            <div><span className="dot" style={{ background: 'var(--danger)' }} />Враг</div>
            <div><span className="dot" style={{ background: '#4f7fd6' }} />Игрок</div>
            <div><span className="dot" style={{ background: 'var(--green)' }} />Союзник</div>
          </div>
        </div>

        <aside className="ucw-library">
          <h2 className="ucw-lib-heading">{isPlayer ? 'Бой' : 'Расстановка'}</h2>

          {/* INITIATIVE — always at the TOP (never under the enemy roster).
              Sorted highest-first, same rule as the main campaign. */}
          <div className="ucw-lib-group">
            <div className="label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Инициатива ({ordered.length})</span>
              {!isPlayer && ordered.length > 0 && <button className="ucw-tbtn" style={{ padding: '2px 8px', fontSize: '0.75rem' }} onClick={rollAllInitiative}>🎲 Бросить всем</button>}
            </div>
            {ordered.length === 0 ? <p className="ucw-empty-note">Пока пусто.</p> : ordered.map((t, i) => (
              <div key={t.id} className={`ucw-init-row side-${t.side}${selected === t.id ? ' selected' : ''}${i === 0 ? ' current' : ''}`} onClick={() => !isPlayer && setSelected(t.id)}>
                {!isPlayer
                  ? <input className="ucw-init-input" type="number" value={t.initiative ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => setInit(t.id, e.target.value === '' ? undefined : Number(e.target.value))} title="Инициатива" />
                  : <span className="ucw-init-badge">{t.initiative ?? '—'}</span>}
                <span className="ucw-init-name">{t.name}</span>
                {t.currentHp != null && <span className="ucw-init-hp">{t.currentHp}{t.maxHp ? `/${t.maxHp}` : ''}</span>}
                {!isPlayer && <button className="ucw-init-x" onClick={(e) => { e.stopPropagation(); patchBoard((b) => ({ ...b, tokens: b.tokens.filter((x) => x.id !== t.id) })); }}>✕</button>}
              </div>
            ))}
          </div>

          {!isPlayer && (
            <p className="atlas-sub" style={{ fontSize: '0.82rem', marginTop: 4 }}>Выберите токен и кликните по карте, чтобы поставить.</p>
          )}
          {!isPlayer && (
            <div className="ucw-add-grid">
              <button className="atlas-btn small" onClick={() => setPlacing({ side: 'player', name: 'Игрок' })}>+ Игрок</button>
              <button className="atlas-btn small" onClick={() => setPlacing({ side: 'ally', name: 'Союзник' })}>+ Союзник</button>
              <button className="atlas-btn small" onClick={() => setPlacing({ side: 'neutral', name: 'Нейтрал' })}>+ Нейтрал</button>
              <button className="atlas-btn small" onClick={() => { const n = window.prompt('Имя токена:'); if (n) setPlacing({ side: 'enemy', name: n }); }}>+ Свой</button>
            </div>
          )}

          {!isPlayer && (
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
          )}

          {!isPlayer && selTok && (
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

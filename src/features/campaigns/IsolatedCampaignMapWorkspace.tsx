import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getAtlasMapById } from '../../data/worldAtlasMaps';
import { getRegionById } from '../../data/worldRegions';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { USER_CAMPAIGN_TYPE_LABELS, type CampaignEntityType, type UserCampaignMode } from '../../types/userCampaign';
import type { WorldRegion } from '../../types/worldAtlas';

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 6;

type Placing = { entityType: CampaignEntityType; entityId: string; label: string } | null;

const PIN_ICON: Record<string, string> = { location: '⌂', npc: '🧑', quest: '📜', enemy: '☠', image: '🖼', party: '★', custom: '●' };

export function IsolatedCampaignMapWorkspace() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const data = campaignId ? store.getData(campaignId) : null;
  const runtime = campaignId ? store.getRuntime(campaignId) : null;

  const rootRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  // Auto-fit stays on (re-fitting as the flex layout settles) until the user
  // takes control by zooming/panning — then we stop overriding their view.
  const autoFitRef = useRef(true);

  // `.app-shell` is content-height (min-height:100vh), so `height:100%` would
  // collapse. Measure the space below the top chrome and size the workspace
  // explicitly so the map viewport gets a real height.
  const [shellHeight, setShellHeight] = useState<number>();

  const [zoom, setZoom] = useState(runtime?.mapViewState.zoom ?? 1);
  const [pan, setPan] = useState({ x: runtime?.mapViewState.panX ?? 0, y: runtime?.mapViewState.panY ?? 0 });
  const [panning, setPanning] = useState(false);
  const [placing, setPlacing] = useState<Placing>(null);
  const [routeEditId, setRouteEditId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ type: CampaignEntityType; id: string } | null>(null);
  const [search, setSearch] = useState('');
  const [layers, setLayers] = useState({ objects: true, routes: true, zones: true });

  const mode: UserCampaignMode = runtime?.mode ?? 'dmView';
  const isEdit = mode === 'dmEdit';
  const isPlayer = mode === 'playerView';

  const persistView = useCallback((z: number, p: { x: number; y: number }) => {
    if (!campaignId) return;
    store.updateRuntime(campaignId, (prev) => ({ ...prev, mapViewState: { zoom: z, panX: p.x, panY: p.y } }));
  }, [campaignId, store]);

  // Size the workspace to fill the viewport below the top chrome.
  useLayoutEffect(() => {
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top;
      setShellHeight(Math.max(320, window.innerHeight - top));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  const fitToScreen = useCallback((markManual = false) => {
    const vp = viewportRef.current, img = imgRef.current;
    if (!vp || !img || !img.naturalWidth || vp.clientWidth < 2 || vp.clientHeight < 2) return;
    if (markManual) autoFitRef.current = false;
    const scale = Math.min(vp.clientWidth / img.naturalWidth, vp.clientHeight / img.naturalHeight) * 0.98;
    const z = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, scale));
    const px = (vp.clientWidth - img.naturalWidth * z) / 2;
    const py = (vp.clientHeight - img.naturalHeight * z) / 2;
    setZoom(z); setPan({ x: px, y: py });
    // Only persist on an explicit user fit. Persisting during auto-fit would
    // update the store → re-render → re-fit → infinite loop.
    if (markManual) persistView(z, { x: px, y: py });
  }, [persistView]);

  // Keep the latest fit fn in a ref so the observer effect below doesn't depend
  // on its identity (which changes when the store re-renders).
  const fitRef = useRef(fitToScreen);
  fitRef.current = fitToScreen;

  // Fit the map after the flex layout settles. The viewport height arrives in
  // stages after first paint (the reason the map used to end up at ~15%/34%),
  // so we fit on a double-rAF, again on a short timeout as a safety net, and on
  // window resize — until the user takes control (autoFitRef → false). These
  // are discrete events (never observer feedback), so there is no render loop.
  useEffect(() => {
    if (!autoFitRef.current) return;
    const doFit = () => { if (autoFitRef.current) fitRef.current(false); };
    const raf = requestAnimationFrame(() => requestAnimationFrame(doFit));
    const t = setTimeout(doFit, 220);
    window.addEventListener('resize', doFit);
    return () => { cancelAnimationFrame(raf); clearTimeout(t); window.removeEventListener('resize', doFit); };
  }, [shellHeight]);

  if (!data || !runtime || !campaignId) {
    return (
      <div className="atlas-layer">
        <button className="atlas-back-link" onClick={() => navigate('/campaigns')}>← Кампании</button>
        <p className="atlas-empty">Кампания не найдена. Возможно, она была удалена.</p>
      </div>
    );
  }

  const map = getAtlasMapById(runtime.activeMapId) ?? getAtlasMapById(data.baseMapId);
  const region = data.regionIds[0] ? getRegionById(data.regionIds[0]) : undefined;

  // ── coordinate helpers ──────────────────────────────────────────────
  const clientToPct = (clientX: number, clientY: number) => {
    const img = imgRef.current;
    if (!img) return { x: 50, y: 50 };
    const r = img.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((clientY - r.top) / r.height) * 100)),
    };
  };

  const clampZoom = (z: number) => Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, z));
  const zoomBy = (factor: number) => {
    autoFitRef.current = false;
    const vp = viewportRef.current;
    const cx = vp ? vp.clientWidth / 2 : 0, cy = vp ? vp.clientHeight / 2 : 0;
    const nz = clampZoom(zoom * factor);
    const wx = (cx - pan.x) / zoom, wy = (cy - pan.y) / zoom;
    const np = { x: cx - wx * nz, y: cy - wy * nz };
    setZoom(nz); setPan(np); persistView(nz, np);
  };

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    autoFitRef.current = false;
    const vp = viewportRef.current; if (!vp) return;
    const rect = vp.getBoundingClientRect();
    const cx = e.clientX - rect.left, cy = e.clientY - rect.top;
    const nz = clampZoom(zoom * (e.deltaY < 0 ? 1.12 : 0.89));
    const wx = (cx - pan.x) / zoom, wy = (cy - pan.y) / zoom;
    const np = { x: cx - wx * nz, y: cy - wy * nz };
    setZoom(nz); setPan(np); persistView(nz, np);
  };

  // ── panning + click-to-place ────────────────────────────────────────
  const downRef = useRef<{ x: number; y: number; moved: boolean; startPan: { x: number; y: number } } | null>(null);

  const onViewportMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    downRef.current = { x: e.clientX, y: e.clientY, moved: false, startPan: { ...pan } };
    if (!placing && !routeEditId) setPanning(true);
    const onMove = (ev: MouseEvent) => {
      const d = downRef.current; if (!d) return;
      if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 4) d.moved = true;
      if (!placing && !routeEditId && d.moved) {
        autoFitRef.current = false;
        setPan({ x: d.startPan.x + (ev.clientX - d.x), y: d.startPan.y + (ev.clientY - d.y) });
      }
    };
    const onUp = (ev: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      setPanning(false);
      const d = downRef.current; downRef.current = null;
      if (!d) return;
      if (!d.moved) {
        // click — place or add route point
        const pct = clientToPct(ev.clientX, ev.clientY);
        if (placing) {
          store.addPlacement(campaignId, { mapId: runtime.activeMapId, entityType: placing.entityType, entityId: placing.entityId, x: pct.x, y: pct.y, visibleToPlayers: false });
          setPlacing(null);
        } else if (routeEditId) {
          const route = data.routes.find((r) => r.id === routeEditId);
          if (route) store.updateRoute(campaignId, routeEditId, { points: [...route.points, pct] });
        }
      } else {
        persistView(zoom, { x: d.startPan.x + (ev.clientX - d.x), y: d.startPan.y + (ev.clientY - d.y) });
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── marker drag ─────────────────────────────────────────────────────
  const startMarkerDrag = (e: React.MouseEvent, placementId: string) => {
    if (!isEdit) return;
    e.stopPropagation();
    const onMove = (ev: MouseEvent) => {
      const pct = clientToPct(ev.clientX, ev.clientY);
      store.updatePlacement(campaignId, placementId, { x: pct.x, y: pct.y });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const startPointDrag = (e: React.MouseEvent, routeId: string, index: number) => {
    if (!isEdit) return;
    e.stopPropagation();
    const onMove = (ev: MouseEvent) => {
      const pct = clientToPct(ev.clientX, ev.clientY);
      const route = data.routes.find((r) => r.id === routeId);
      if (!route) return;
      const points = route.points.map((p, i) => (i === index ? pct : p));
      store.updateRoute(campaignId, routeId, { points });
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // ── data views (respect Player View) ────────────────────────────────
  const visiblePlacements = data.mapPlacements.filter((mp) => mp.mapId === runtime.activeMapId && (!isPlayer || mp.visibleToPlayers));
  const visibleRoutes = data.routes.filter((r) => r.mapId === runtime.activeMapId && (!isPlayer || r.visibleToPlayers));

  const entityLabel = (type: CampaignEntityType, id: string): string => {
    if (type === 'location') return data.locations.find((l) => l.id === id)?.title ?? 'Локация';
    if (type === 'npc') return data.npcs.find((n) => n.id === id)?.name ?? 'NPC';
    if (type === 'quest') return data.quests.find((q) => q.id === id)?.title ?? 'Квест';
    if (type === 'enemy') return data.enemies.find((e) => e.id === id)?.title ?? 'Враг';
    return 'Объект';
  };

  const setMode = (m: UserCampaignMode) => store.setMode(campaignId, m);

  // ── entity CRUD helpers ─────────────────────────────────────────────
  const addAndSelect = (type: CampaignEntityType) => {
    let id = '';
    if (type === 'location') id = store.addLocation(campaignId, { title: 'Новая локация' });
    else if (type === 'npc') id = store.addNpc(campaignId, { name: 'Новый NPC' });
    else if (type === 'quest') id = store.addQuest(campaignId, { title: 'Новый квест', status: 'notStarted' });
    else if (type === 'enemy') id = store.addEnemy(campaignId, { title: 'Новый враг' });
    if (id) setSelected({ type, id });
  };

  const exportCampaign = () => {
    const json = store.exportCampaign(campaignId, window.confirm('Включить runtime (режим, вид карты, статусы) в экспорт?'));
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `campaign-${data.title.replace(/\s+/g, '-')}.json`; a.click();
    URL.revokeObjectURL(url);
  };
  const importCampaign = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const newId = store.importCampaign(String(reader.result));
      if (newId) navigate(`/campaigns/${newId}/map`); else window.alert('Не удалось импортировать кампанию.');
    };
    reader.readAsText(file); e.target.value = '';
  };

  const routeInEdit = routeEditId ? data.routes.find((r) => r.id === routeEditId) : undefined;

  return (
    <div className="ucw" ref={rootRef} style={shellHeight ? { height: shellHeight } : undefined}>
      {/* Header */}
      <div className="ucw-header">
        <div className="ucw-title">
          <button className="atlas-back-link" style={{ margin: 0 }} onClick={() => navigate('/')}>← Дом мира</button>
          <span className="atlas-crumb-sep">→</span>
          <strong>{data.title}</strong>
          <span className="ucw-chip">{USER_CAMPAIGN_TYPE_LABELS[data.type]} · изолирован</span>
        </div>
        <div className="ucw-header-actions">
          <div className="ucw-segmented" role="group" aria-label="Режим">
            {(['dmView', 'dmEdit', 'playerView'] as UserCampaignMode[]).map((m) => (
              <button key={m} className={mode === m ? 'active' : ''} onClick={() => setMode(m)}>
                {m === 'dmView' ? 'DM View' : m === 'dmEdit' ? 'DM Edit' : 'Player View'}
              </button>
            ))}
          </div>
          <button className="ucw-tbtn" onClick={exportCampaign}>Export</button>
          <button className="ucw-tbtn" onClick={() => fileInputRef.current?.click()}>Import</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={importCampaign} />
        </div>
      </div>

      {/* Toolbar */}
      <div className="ucw-toolbar">
        <button className="ucw-tbtn" onClick={() => zoomBy(1.2)} aria-label="Приблизить">+</button>
        <button className="ucw-tbtn" onClick={() => zoomBy(1 / 1.2)} aria-label="Отдалить">−</button>
        <span className="ucw-zoomreadout">{Math.round(zoom * 100)}%</span>
        <button className="ucw-tbtn" onClick={() => fitToScreen(true)}>По размеру экрана</button>
        <button className="ucw-tbtn" onClick={() => { autoFitRef.current = false; setZoom(1); setPan({ x: 0, y: 0 }); persistView(1, { x: 0, y: 0 }); }}>Сброс</button>
        <span className="sep" />
        <button className={`ucw-tbtn ${layers.objects ? 'active' : ''}`} onClick={() => setLayers((l) => ({ ...l, objects: !l.objects }))}>Объекты {layers.objects ? '(вкл)' : '(выкл)'}</button>
        <button className={`ucw-tbtn ${layers.routes ? 'active' : ''}`} onClick={() => setLayers((l) => ({ ...l, routes: !l.routes }))}>Маршруты {layers.routes ? '(вкл)' : '(выкл)'}</button>
        <span className="sep" />
        <input className="ucw-search" placeholder="Поиск объектов…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="ucw-body">
        {/* Map viewport */}
        <div
          ref={viewportRef}
          className={`ucw-viewport${panning ? ' panning' : ''}${placing || routeEditId ? ' placing' : ''}`}
          onMouseDown={onViewportMouseDown}
          onWheel={onWheel}
        >
          {(placing || routeEditId) && (
            <div className="ucw-hint">
              {placing ? `Кликните на карту, чтобы поставить: ${placing.label}` : 'Кликайте по карте, чтобы добавить точки маршрута'}
            </div>
          )}
          <div className="ucw-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <div className="ucw-mapstack">
              <img
                ref={imgRef}
                className="ucw-mapimg"
                src={map?.imageSrc}
                alt={map?.titleRu ?? map?.title ?? 'Карта'}
                draggable={false}
                onLoad={() => { if (autoFitRef.current) fitToScreen(); }}
              />
              {/* routes */}
              {layers.routes && (
                <svg className="ucw-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {visibleRoutes.map((r) => (
                    <polyline
                      key={r.id}
                      points={r.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill="none"
                      stroke={r.id === routeEditId ? 'var(--gold-soft)' : r.visibleToPlayers ? 'var(--gold)' : 'var(--fg-faint)'}
                      strokeWidth={r.id === routeEditId ? 0.6 : 0.45}
                      strokeDasharray={r.type === 'hidden' || r.type === 'trail' ? '1.4,1' : undefined}
                      vectorEffect="non-scaling-stroke"
                      style={{ strokeWidth: r.id === routeEditId ? 3 : 2 } as React.CSSProperties}
                    />
                  ))}
                  {isEdit && routeInEdit?.points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={0.8} className="ucw-routept"
                      onMouseDown={(e) => startPointDrag(e, routeInEdit.id, i)}
                      onDoubleClick={(e) => { e.stopPropagation(); store.updateRoute(campaignId, routeInEdit.id, { points: routeInEdit.points.filter((_, idx) => idx !== i) }); }} />
                  ))}
                </svg>
              )}
              {/* markers */}
              {layers.objects && (
                <div className="ucw-markers">
                  {visiblePlacements.map((mp) => {
                    const isSel = selected?.type === mp.entityType && selected?.id === mp.entityId;
                    return (
                      <div
                        key={mp.id}
                        className={`ucw-marker${isEdit ? ' edit' : ''}${isSel ? ' selected' : ''}${!mp.visibleToPlayers ? ' hidden-pin' : ''}`}
                        style={{ left: `${mp.x}%`, top: `${mp.y}%` }}
                        onMouseDown={(e) => startMarkerDrag(e, mp.id)}
                        onClick={(e) => { e.stopPropagation(); setSelected({ type: mp.entityType, id: mp.entityId }); }}
                        title={entityLabel(mp.entityType, mp.entityId)}
                      >
                        <div className={`ucw-pin ${mp.entityType}`}><span>{PIN_ICON[mp.entityType] ?? '●'}</span></div>
                        <div className="ucw-marker-label">{entityLabel(mp.entityType, mp.entityId)}</div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <div className="ucw-legend">
            <div><span className="dot" style={{ background: 'var(--gold)' }} />Локация</div>
            <div><span className="dot" style={{ background: 'var(--green)' }} />NPC</div>
            <div><span className="dot" style={{ background: 'var(--purple)' }} />Квест</div>
            <div><span className="dot" style={{ background: 'var(--danger)' }} />Враг</div>
          </div>
        </div>

        {/* Library */}
        <aside className="ucw-library">
          <LibraryPanel
            campaignId={campaignId}
            search={search}
            isEdit={isEdit}
            isPlayer={isPlayer}
            selected={selected}
            setSelected={setSelected}
            placing={placing}
            setPlacing={setPlacing}
            routeEditId={routeEditId}
            setRouteEditId={setRouteEditId}
            addAndSelect={addAndSelect}
            region={region}
          />
        </aside>
      </div>
    </div>
  );
}

/* ── Right library panel + entity editor ──────────────────────────────── */
function LibraryPanel(props: {
  campaignId: string;
  search: string;
  isEdit: boolean;
  isPlayer: boolean;
  selected: { type: CampaignEntityType; id: string } | null;
  setSelected: (s: { type: CampaignEntityType; id: string } | null) => void;
  placing: Placing;
  setPlacing: (p: Placing) => void;
  routeEditId: string | null;
  setRouteEditId: (id: string | null) => void;
  addAndSelect: (type: CampaignEntityType) => void;
  region?: WorldRegion;
}) {
  const { campaignId, search, isEdit, isPlayer, selected, setSelected, placing, setPlacing, routeEditId, setRouteEditId, addAndSelect, region } = props;
  const store = useUserCampaigns();
  const data = store.getData(campaignId);
  const runtime = store.getRuntime(campaignId);
  if (!data) return null;

  const q = search.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const isPlaced = (type: CampaignEntityType, id: string) => data.mapPlacements.some((mp) => mp.entityType === type && mp.entityId === id);

  if (selected) {
    return <EntityEditor campaignId={campaignId} selected={selected} onClose={() => setSelected(null)} isEdit={isEdit} isPlayer={isPlayer} setPlacing={setPlacing} />;
  }

  const groups: Array<{ type: CampaignEntityType; label: string; items: Array<{ id: string; label: string }> }> = [
    { type: 'location', label: 'Локации', items: data.locations.filter((l) => match(l.title)).map((l) => ({ id: l.id, label: l.title })) },
    { type: 'npc', label: 'NPC', items: data.npcs.filter((n) => match(n.name)).map((n) => ({ id: n.id, label: n.name })) },
    { type: 'quest', label: 'Квесты', items: data.quests.filter((qq) => match(qq.title) && (!isPlayer || qq.status !== 'hidden')).map((qq) => ({ id: qq.id, label: qq.title })) },
    { type: 'enemy', label: 'Враги', items: data.enemies.filter((e) => match(e.title)).map((e) => ({ id: e.id, label: e.title })) },
  ];

  const totalObjects = data.locations.length + data.npcs.length + data.quests.length + data.enemies.length;

  return (
    <div>
      <h2 className="ucw-lib-heading">Библиотека кампании</h2>
      {region && <p style={{ color: 'var(--fg-faint)', fontSize: '0.8rem', margin: '2px 0 0' }}>World info: {region.titleRu ?? region.title} · <a href={`/world/${region.id}`} onClick={(e) => { e.preventDefault(); window.open(`/world/${region.id}`, '_blank'); }} style={{ color: 'var(--gold)' }}>справка в Атласе</a></p>}

      {!isPlayer && isEdit && (
        <>
          <div className="ucw-add-grid">
            <button className="atlas-btn small" onClick={() => addAndSelect('location')}>+ Локация</button>
            <button className="atlas-btn small" onClick={() => addAndSelect('npc')}>+ NPC</button>
            <button className="atlas-btn small" onClick={() => addAndSelect('quest')}>+ Квест</button>
            <button className="atlas-btn small" onClick={() => addAndSelect('enemy')}>+ Враг</button>
          </div>
          <button
            className={`atlas-btn ${routeEditId ? '' : 'ghost'} small`}
            style={{ width: '100%' }}
            onClick={() => {
              if (routeEditId) { setRouteEditId(null); return; }
              const rid = store.addRoute(campaignId, { title: `Маршрут ${data.routes.length + 1}`, mapId: runtime.activeMapId, points: [], type: 'road', visibleToPlayers: false });
              setRouteEditId(rid);
            }}
          >
            {routeEditId ? '✓ Завершить маршрут' : '+ Маршрут'}
          </button>
        </>
      )}

      {totalObjects === 0 && (!isEdit || isPlayer)
        ? <p className="ucw-empty-note">Кампания пока пустая. Включите DM Edit, чтобы добавлять объекты.</p>
        : totalObjects === 0
          ? <p className="ucw-empty-note">Кампания пока пустая — добавьте первый объект кнопками выше.</p>
          : null}

      {groups.map((g) => g.items.length > 0 && (
        <div key={g.type} className="ucw-lib-group">
          <div className="label">{g.label} ({g.items.length})</div>
          {g.items.map((it) => (
            <div key={it.id} className="ucw-entity-row">
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {it.label} {isPlaced(g.type, it.id) && <span className="ucw-placed-badge">● на карте</span>}
              </span>
              <div className="row-actions">
                <button onClick={() => setSelected({ type: g.type, id: it.id })}>Открыть</button>
                {isEdit && !isPlaced(g.type, it.id) && (
                  <button onClick={() => setPlacing(placing?.entityId === it.id ? null : { entityType: g.type, entityId: it.id, label: it.label })}>
                    {placing?.entityId === it.id ? '…клик' : 'На карту'}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ))}

      {data.routes.length > 0 && (
        <div className="ucw-lib-group">
          <div className="label">Маршруты ({data.routes.length})</div>
          {data.routes.map((r) => (
            <div key={r.id} className={`ucw-entity-row${routeEditId === r.id ? ' selected' : ''}`}>
              <span>{r.title} <span className="ucw-placed-badge">{r.points.length} тчк</span></span>
              {isEdit && (
                <div className="row-actions">
                  <button onClick={() => setRouteEditId(routeEditId === r.id ? null : r.id)}>{routeEditId === r.id ? 'Готово' : 'Точки'}</button>
                  <button onClick={() => store.updateRoute(campaignId, r.id, { visibleToPlayers: !r.visibleToPlayers })}>{r.visibleToPlayers ? '👁' : '🚫'}</button>
                  <button onClick={() => { store.removeRoute(campaignId, r.id); if (routeEditId === r.id) setRouteEditId(null); }}>✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EntityEditor(props: {
  campaignId: string;
  selected: { type: CampaignEntityType; id: string };
  onClose: () => void;
  isEdit: boolean;
  isPlayer: boolean;
  setPlacing: (p: Placing) => void;
}) {
  const { campaignId, selected, onClose, isEdit, isPlayer, setPlacing } = props;
  const store = useUserCampaigns();
  const data = store.getData(campaignId);
  if (!data) return null;

  const placement = data.mapPlacements.find((mp) => mp.entityType === selected.type && mp.entityId === selected.id);
  const upd = (patch: Record<string, unknown>) => store.updateEntity(campaignId, selected.type, selected.id, patch);

  const location = selected.type === 'location' ? data.locations.find((l) => l.id === selected.id) : undefined;
  const npc = selected.type === 'npc' ? data.npcs.find((n) => n.id === selected.id) : undefined;
  const quest = selected.type === 'quest' ? data.quests.find((q) => q.id === selected.id) : undefined;
  const enemy = selected.type === 'enemy' ? data.enemies.find((e) => e.id === selected.id) : undefined;
  const entity = location ?? npc ?? quest ?? enemy;
  if (!entity) { onClose(); return null; }

  const readOnly = !isEdit;
  const title = location?.title ?? npc?.name ?? quest?.title ?? enemy?.title ?? '';

  return (
    <div>
      <button className="atlas-back-link" onClick={onClose}>← К библиотеке</button>
      <div className="ucw-card">
        {readOnly ? (
          <h3 style={{ margin: 0, color: 'var(--gold-soft)' }}>{title}</h3>
        ) : (
          <>
            <label>{selected.type === 'npc' ? 'Имя' : 'Название'}</label>
            <input value={title} onChange={(e) => upd(selected.type === 'npc' ? { name: e.target.value } : { title: e.target.value })} />
          </>
        )}

        {npc && (
          <>
            <label>Роль</label>
            {readOnly ? <p>{npc.role || '—'}</p> : <input value={npc.role ?? ''} onChange={(e) => upd({ role: e.target.value })} />}
            <label>Локация</label>
            {readOnly ? <p>{data.locations.find((l) => l.id === npc.locationId)?.title ?? '—'}</p> : (
              <select value={npc.locationId ?? ''} onChange={(e) => upd({ locationId: e.target.value || undefined })}>
                <option value="">— не привязан —</option>
                {data.locations.map((l) => <option key={l.id} value={l.id}>{l.title}</option>)}
              </select>
            )}
          </>
        )}

        {quest && (
          <>
            <label>Статус</label>
            {readOnly ? <p>{quest.status}</p> : (
              <select value={quest.status} onChange={(e) => upd({ status: e.target.value })}>
                {['notStarted', 'active', 'completed', 'failed', 'hidden'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </>
        )}

        {enemy && (
          <div style={{ display: 'flex', gap: 8 }}>
            <div style={{ flex: 1 }}><label>AC</label>{readOnly ? <p>{enemy.ac ?? '—'}</p> : <input type="number" value={enemy.ac ?? ''} onChange={(e) => upd({ ac: Number(e.target.value) })} />}</div>
            <div style={{ flex: 1 }}><label>HP</label>{readOnly ? <p>{enemy.hp ?? '—'}</p> : <input type="number" value={enemy.hp ?? ''} onChange={(e) => upd({ hp: Number(e.target.value) })} />}</div>
          </div>
        )}

        <label>Описание</label>
        {readOnly ? <p>{entity.description || '—'}</p> : <textarea value={entity.description ?? ''} onChange={(e) => upd({ description: e.target.value })} />}

        {!isPlayer && (
          <>
            <label>DM-заметки (скрыто от игроков)</label>
            {readOnly
              ? <p style={{ color: 'var(--gold-soft)' }}>{(entity as { dmNotes?: string }).dmNotes || '—'}</p>
              : <textarea value={(entity as { dmNotes?: string }).dmNotes ?? ''} onChange={(e) => upd({ dmNotes: e.target.value })} />}
          </>
        )}

        {isEdit && (
          <div className="ucw-card-actions">
            {placement ? (
              <>
                <button className="atlas-btn ghost small" onClick={() => store.updatePlacement(campaignId, placement.id, { visibleToPlayers: !placement.visibleToPlayers })}>
                  {placement.visibleToPlayers ? '👁 Видно игрокам' : '🚫 Скрыто от игроков'}
                </button>
                <button className="atlas-btn ghost small" onClick={() => store.removePlacement(campaignId, placement.id)}>Снять с карты</button>
              </>
            ) : (
              <button className="atlas-btn small" onClick={() => { setPlacing({ entityType: selected.type, entityId: selected.id, label: title }); onClose(); }}>Поставить на карту</button>
            )}
            <button className="atlas-btn danger small" onClick={() => { store.deleteEntity(campaignId, selected.type, selected.id); onClose(); }}>Удалить</button>
          </div>
        )}
      </div>
    </div>
  );
}

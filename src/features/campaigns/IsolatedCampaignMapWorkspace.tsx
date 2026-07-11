import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getAtlasMapById, WORLD_ATLAS_MAPS } from '../../data/worldAtlasMaps';
import { getRegionById } from '../../data/worldRegions';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { USER_CAMPAIGN_TYPE_LABELS, type CampaignEntityType, type UserCampaignMode } from '../../types/userCampaign';
import type { WorldRegion } from '../../types/worldAtlas';
import { CampaignEntityCard } from './CampaignEntityCard';
import '../../shared/entity/sharedEntity.css';
import { RichEntityDetail } from '../../shared/entity/RichEntityDetail';
import { buildDetail, type LibraryKind } from '../../shared/entity/userCampaignEntityVM';

/** CampaignEntityType → shared library kind (for the neutral VM mapper). */
const ENTITY_TO_LIBKIND: Partial<Record<CampaignEntityType, LibraryKind>> = {
  location: 'locations', npc: 'npc', quest: 'quests', enemy: 'enemies', party: 'players', faction: 'factions',
};

const ZOOM_MIN = 0.15;
const ZOOM_MAX = 6;

type Placing = { entityType: CampaignEntityType; entityId: string; label: string } | null;

const PIN_ICON: Record<string, string> = { location: '⌂', npc: '🧑', quest: '📜', enemy: '☠', image: '🖼', party: '★', custom: '●' };
const PARTY_ENTITY_ID = 'party';

export function IsolatedCampaignMapWorkspace() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const store = useUserCampaigns();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const data = campaignId ? store.getData(campaignId) : null;
  const runtime = campaignId ? store.getRuntime(campaignId) : null;
  const [searchParams, setSearchParams] = useSearchParams();

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
  const [placingParty, setPlacingParty] = useState(false);
  const [routeEditId, setRouteEditId] = useState<string | null>(null);
  const [zoneEditId, setZoneEditId] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ type: CampaignEntityType; id: string } | null>(null);
  const [editing, setEditing] = useState<{ type: CampaignEntityType; id: string } | null>(null);
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

  // Arriving from a library card's "Поставить на карту" (?place=type:id) —
  // start placement mode for that entity, then clear the query param.
  useEffect(() => {
    const place = searchParams.get('place');
    if (!place || !data) return;
    const [t, eid] = place.split(':');
    const label =
      t === 'location' ? data.locations.find((l) => l.id === eid)?.title
      : t === 'npc' ? data.npcs.find((n) => n.id === eid)?.name
      : t === 'quest' ? data.quests.find((q) => q.id === eid)?.title
      : t === 'enemy' ? data.enemies.find((e) => e.id === eid)?.title
      : undefined;
    if (label) setPlacing({ entityType: t as CampaignEntityType, entityId: eid, label });
    const next = new URLSearchParams(searchParams);
    next.delete('place');
    setSearchParams(next, { replace: true });
  }, [searchParams, data, setSearchParams]);

  // Declared before the early return below so hook order stays stable when
  // `data` is momentarily null (e.g. during async server hydration) and then
  // arrives — otherwise React sees a different hook count between renders.
  const downRef = useRef<{ x: number; y: number; moved: boolean; startPan: { x: number; y: number } } | null>(null);

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

  // Set (or repair) the campaign's base map. Some campaigns — imported, seeded
  // from an old scenario, or created before a map id was renamed — can hold a
  // `baseMapId` that no atlas map resolves, which would otherwise render a blank
  // "broken image" instead of a map. This lets the DM pick/replace the map right
  // in the workspace, keeping each campaign fully self-contained and isolated.
  const changeBaseMap = (newMapId: string) => {
    if (!newMapId || !getAtlasMapById(newMapId)) return;
    const newRegions = getAtlasMapById(newMapId)?.regionIds ?? data.regionIds;
    store.updateData(campaignId, (p) => ({
      ...p,
      baseMapId: newMapId,
      mapIds: p.mapIds.includes(newMapId) ? p.mapIds : [newMapId, ...p.mapIds],
      regionIds: p.regionIds.length ? p.regionIds : newRegions,
    }));
    store.updateRuntime(campaignId, (p) => ({ ...p, activeMapId: newMapId }));
    autoFitRef.current = true;
  };

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
  const onViewportMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const editingShape = placing || placingParty || routeEditId || zoneEditId;
    downRef.current = { x: e.clientX, y: e.clientY, moved: false, startPan: { ...pan } };
    if (!editingShape) setPanning(true);
    const onMove = (ev: MouseEvent) => {
      const d = downRef.current; if (!d) return;
      if (Math.abs(ev.clientX - d.x) + Math.abs(ev.clientY - d.y) > 4) d.moved = true;
      if (!editingShape && d.moved) {
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
        } else if (placingParty) {
          // Party is a singleton pin per map — drop any previous party placement
          // on this map before adding the new one.
          data.mapPlacements
            .filter((mp) => mp.entityType === 'party' && mp.mapId === runtime.activeMapId)
            .forEach((mp) => store.removePlacement(campaignId, mp.id));
          store.addPlacement(campaignId, { mapId: runtime.activeMapId, entityType: 'party', entityId: PARTY_ENTITY_ID, x: pct.x, y: pct.y, visibleToPlayers: true });
          setPlacingParty(false);
        } else if (routeEditId) {
          const route = data.routes.find((r) => r.id === routeEditId);
          if (route) store.updateRoute(campaignId, routeEditId, { points: [...route.points, pct] });
        } else if (zoneEditId) {
          const zone = data.zones.find((z) => z.id === zoneEditId);
          if (zone) store.updateData(campaignId, (p) => ({ ...p, zones: p.zones.map((z) => (z.id === zoneEditId ? { ...z, points: [...z.points, pct] } : z)) }));
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

  const startZonePointDrag = (e: React.MouseEvent, zoneId: string, index: number) => {
    if (!isEdit) return;
    e.stopPropagation();
    const onMove = (ev: MouseEvent) => {
      const pct = clientToPct(ev.clientX, ev.clientY);
      store.updateData(campaignId, (p) => ({ ...p, zones: p.zones.map((z) => (z.id === zoneId ? { ...z, points: z.points.map((pt, i) => (i === index ? pct : pt)) } : z)) }));
    };
    const onUp = () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  // Center the view on the party pin (main-campaign parity: "Партия" button).
  const focusParty = () => {
    const vp = viewportRef.current, img = imgRef.current;
    const party = data.mapPlacements.find((mp) => mp.entityType === 'party' && mp.mapId === runtime.activeMapId);
    if (!vp || !img || !img.naturalWidth || !party) return;
    autoFitRef.current = false;
    const np = { x: vp.clientWidth / 2 - (party.x / 100) * img.naturalWidth * zoom, y: vp.clientHeight / 2 - (party.y / 100) * img.naturalHeight * zoom };
    setPan(np); persistView(zoom, np);
  };

  // ── data views (respect Player View) ────────────────────────────────
  const visiblePlacements = data.mapPlacements.filter((mp) => mp.mapId === runtime.activeMapId && (!isPlayer || mp.visibleToPlayers));
  const visibleRoutes = data.routes.filter((r) => r.mapId === runtime.activeMapId && (!isPlayer || r.visibleToPlayers));
  const visibleZones = data.zones.filter((z) => z.mapId === runtime.activeMapId && (!isPlayer || z.visibleToPlayers));
  const hasParty = data.mapPlacements.some((mp) => mp.entityType === 'party' && mp.mapId === runtime.activeMapId);

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
  const zoneInEdit = zoneEditId ? data.zones.find((z) => z.id === zoneEditId) : undefined;

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
          <button className="ucw-tbtn" onClick={() => { const t = window.prompt('Новое название кампании:', data.title); if (t && t.trim()) store.renameCampaign(campaignId, t.trim()); }}>Переименовать</button>
          <button className="ucw-tbtn" onClick={exportCampaign}>Export</button>
          <button className="ucw-tbtn" onClick={() => fileInputRef.current?.click()}>Import</button>
          <input ref={fileInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={importCampaign} />
          <button className="ucw-tbtn" style={{ borderColor: 'var(--danger)', color: 'var(--danger)' }} onClick={() => { if (window.confirm(`Удалить кампанию «${data.title}»?`)) { store.deleteCampaign(campaignId); navigate('/'); } }}>Удалить</button>
        </div>
      </div>

      {/* Active battle the DM has opened to players — visible to everyone
          (players especially), links straight into the presented battle. */}
      {runtime.presentedBattle?.mapId && (
        <button
          type="button"
          className="ucw-battle-banner"
          onClick={() => navigate(`/campaigns/${campaignId}/battle/${encodeURIComponent(runtime.presentedBattle!.mapId)}`)}
        >
          ▶ Мастер открыл бой — нажмите, чтобы перейти на поле боя
        </button>
      )}

      {/* Toolbar */}
      <div className="ucw-toolbar">
        <button className="ucw-tbtn" onClick={() => zoomBy(1.2)} aria-label="Приблизить">+</button>
        <button className="ucw-tbtn" onClick={() => zoomBy(1 / 1.2)} aria-label="Отдалить">−</button>
        <span className="ucw-zoomreadout">{Math.round(zoom * 100)}%</span>
        <button className="ucw-tbtn" onClick={() => fitToScreen(true)}>По размеру экрана</button>
        <button className="ucw-tbtn" onClick={() => { autoFitRef.current = false; setZoom(1); setPan({ x: 0, y: 0 }); persistView(1, { x: 0, y: 0 }); }}>Сброс</button>
        <span className="sep" />
        <button className="ucw-tbtn" disabled={!hasParty} onClick={focusParty} title={hasParty ? 'Показать партию на карте' : 'Партия ещё не поставлена'}>Партия</button>
        {isEdit && (
          <button className={`ucw-tbtn ${placingParty ? 'active' : ''}`} onClick={() => { setPlacing(null); setRouteEditId(null); setZoneEditId(null); setPlacingParty((v) => !v); }}>
            {placingParty ? '…клик по карте' : 'Поставить партию'}
          </button>
        )}
        <span className="sep" />
        <button className={`ucw-tbtn ${layers.objects ? 'active' : ''}`} onClick={() => setLayers((l) => ({ ...l, objects: !l.objects }))}>Объекты {layers.objects ? '(вкл)' : '(выкл)'}</button>
        <button className={`ucw-tbtn ${layers.routes ? 'active' : ''}`} onClick={() => setLayers((l) => ({ ...l, routes: !l.routes }))}>Маршруты {layers.routes ? '(вкл)' : '(выкл)'}</button>
        <button className={`ucw-tbtn ${layers.zones ? 'active' : ''}`} onClick={() => setLayers((l) => ({ ...l, zones: !l.zones }))}>Зоны {layers.zones ? '(вкл)' : '(выкл)'}</button>
        <span className="sep" />
        <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.8rem', color: 'var(--fg-faint)' }}>
          Карта:
          <select
            className="atlas-select"
            value={map?.id ?? ''}
            onChange={(e) => changeBaseMap(e.target.value)}
            title="Базовая карта этой кампании"
          >
            {!map && <option value="">— выберите карту —</option>}
            {WORLD_ATLAS_MAPS.map((m) => (
              <option key={m.id} value={m.id}>{m.titleRu ?? m.title}</option>
            ))}
          </select>
        </label>
        <span className="sep" />
        <input className="ucw-search" placeholder="Поиск объектов…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div className="ucw-body">
        {/* Map viewport */}
        <div
          ref={viewportRef}
          className={`ucw-viewport${panning ? ' panning' : ''}${placing || placingParty || routeEditId || zoneEditId ? ' placing' : ''}`}
          onMouseDown={onViewportMouseDown}
          onWheel={onWheel}
        >
          {(placing || placingParty || routeEditId || zoneEditId) && (
            <div className="ucw-hint">
              {placing ? `Кликните на карту, чтобы поставить: ${placing.label}`
                : placingParty ? 'Кликните на карту, чтобы поставить партию'
                : zoneEditId ? 'Кликайте по карте, чтобы добавить точки зоны (замкните обход)'
                : 'Кликайте по карте, чтобы добавить точки маршрута'}
            </div>
          )}
          {!map && (
            <div className="ucw-nomap">
              <h3>У этой кампании не выбрана карта</h3>
              <p>Базовая карта не найдена{data.baseMapId ? ` (id: ${data.baseMapId})` : ''}. Выберите карту мира — она станет основой этой кампании. Данные основной кампании не затрагиваются.</p>
              <div className="ucw-nomap-grid">
                {WORLD_ATLAS_MAPS.map((m) => (
                  <button key={m.id} type="button" className="atlas-card" onClick={() => changeBaseMap(m.id)}>
                    <img className="atlas-map-img" src={m.imageSrc} alt={m.titleRu ?? m.title} loading="lazy" style={{ maxHeight: 110, objectFit: 'cover' }} />
                    <h4 style={{ margin: '6px 0 0' }}>{m.titleRu ?? m.title}</h4>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="ucw-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, display: map ? undefined : 'none' }}>
            <div className="ucw-mapstack">
              <img
                ref={imgRef}
                className="ucw-mapimg"
                src={map?.imageSrc}
                alt={map?.titleRu ?? map?.title ?? 'Карта'}
                draggable={false}
                onLoad={() => { if (autoFitRef.current) fitToScreen(); }}
              />
              {/* zones */}
              {layers.zones && (
                <svg className="ucw-overlay-svg" viewBox="0 0 100 100" preserveAspectRatio="none">
                  {visibleZones.map((z) => (
                    <polygon
                      key={z.id}
                      points={z.points.map((p) => `${p.x},${p.y}`).join(' ')}
                      fill={z.color ?? 'var(--gold)'}
                      fillOpacity={z.id === zoneEditId ? 0.28 : 0.16}
                      stroke={z.id === zoneEditId ? 'var(--gold-soft)' : z.color ?? 'var(--gold)'}
                      vectorEffect="non-scaling-stroke"
                      style={{ strokeWidth: z.id === zoneEditId ? 3 : 2 } as React.CSSProperties}
                    />
                  ))}
                  {isEdit && zoneInEdit?.points.map((p, i) => (
                    <circle key={i} cx={p.x} cy={p.y} r={0.8} className="ucw-routept"
                      onMouseDown={(e) => startZonePointDrag(e, zoneInEdit.id, i)}
                      onDoubleClick={(e) => { e.stopPropagation(); store.updateData(campaignId, (prev) => ({ ...prev, zones: prev.zones.map((zz) => (zz.id === zoneInEdit.id ? { ...zz, points: zz.points.filter((_, idx) => idx !== i) } : zz)) })); }} />
                  ))}
                </svg>
              )}
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

        {/* Library — or the rich detail card of the selected entity (parity
            with the main campaign's right-panel location/NPC card). */}
        <aside className="ucw-library">
          {(() => {
            const libKind = selected ? ENTITY_TO_LIBKIND[selected.type] : undefined;
            if (!selected || !libKind) {
              return (
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
                  zoneEditId={zoneEditId}
                  setZoneEditId={setZoneEditId}
                  addAndSelect={addAndSelect}
                  region={region}
                />
              );
            }
            const revealed = new Set(runtime.revealedToPlayers ?? []);
            const vm = buildDetail(libKind, selected.id, data, {
              imageUrl: (imageId?: string) => (imageId ? data.images.find((im) => im.id === imageId)?.src : undefined),
              onOpen: (_k, id) => { const t = data.locations.some((l) => l.id === id) ? 'location' : data.npcs.some((n) => n.id === id) ? 'npc' : data.quests.some((q) => q.id === id) ? 'quest' : 'enemy'; setSelected({ type: t as CampaignEntityType, id }); },
              isPlaced: (et, id) => data.mapPlacements.some((mp) => mp.entityType === et && mp.entityId === id),
              isRevealed: (id) => revealed.has(id),
              match: () => true,
              isPlayer,
            });
            const placement = data.mapPlacements.find((mp) => mp.entityType === selected.type && mp.entityId === selected.id);
            return (
              <div>
                <button className="atlas-back-link" style={{ margin: '0 0 8px' }} onClick={() => setSelected(null)}>← Библиотека кампании</button>
                {vm ? (
                  <RichEntityDetail
                    vm={vm}
                    isPlayer={isPlayer}
                    actions={{
                      onEdit: !isPlayer ? () => setEditing(selected) : undefined,
                      onPlace: !isPlayer && !placement ? () => setPlacing({ entityType: selected.type, entityId: selected.id, label: entityLabel(selected.type, selected.id) }) : undefined,
                      placed: !!placement,
                      onToggleReveal: !isPlayer ? () => store.toggleReveal(campaignId, selected.id) : undefined,
                      revealed: revealed.has(selected.id),
                      onDelete: !isPlayer ? () => { store.deleteEntity(campaignId, selected.type, selected.id); setSelected(null); } : undefined,
                    }}
                  />
                ) : <p className="atlas-empty">Карточка не найдена.</p>}
                {!isPlayer && placement && (
                  <button className="atlas-btn ghost small" style={{ marginTop: 8 }} onClick={() => store.removePlacement(campaignId, placement.id)}>Снять с карты</button>
                )}
              </div>
            );
          })()}
        </aside>
      </div>

      {editing && (
        <CampaignEntityCard
          campaignId={campaignId}
          type={editing.type}
          id={editing.id}
          canEdit={!isPlayer}
          isPlayer={isPlayer}
          onClose={() => setEditing(null)}
          onPlaceOnMap={() => setPlacing({ entityType: editing.type, entityId: editing.id, label: entityLabel(editing.type, editing.id) })}
        />
      )}
    </div>
  );
}

/* ── Right library panel ──────────────────────────────────────────────── */
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
  zoneEditId: string | null;
  setZoneEditId: (id: string | null) => void;
  addAndSelect: (type: CampaignEntityType) => void;
  region?: WorldRegion;
}) {
  const { campaignId, search, isEdit, isPlayer, setSelected, placing, setPlacing, routeEditId, setRouteEditId, zoneEditId, setZoneEditId, addAndSelect, region } = props;
  const store = useUserCampaigns();
  const data = store.getData(campaignId);
  const runtime = store.getRuntime(campaignId);
  if (!data) return null;

  const q = search.trim().toLowerCase();
  const match = (s: string) => !q || s.toLowerCase().includes(q);

  const isPlaced = (type: CampaignEntityType, id: string) => data.mapPlacements.some((mp) => mp.entityType === type && mp.entityId === id);
  // Player View lists only entities the DM has revealed; DM sees everything.
  const revealed = new Set(runtime?.revealedToPlayers ?? []);
  const shown = (id: string) => !isPlayer || revealed.has(id);

  const groups: Array<{ type: CampaignEntityType; label: string; items: Array<{ id: string; label: string }> }> = [
    { type: 'location', label: 'Локации', items: data.locations.filter((l) => match(l.title) && shown(l.id)).map((l) => ({ id: l.id, label: l.title })) },
    { type: 'npc', label: 'NPC', items: data.npcs.filter((n) => match(n.name) && shown(n.id)).map((n) => ({ id: n.id, label: n.name })) },
    { type: 'quest', label: 'Квесты', items: data.quests.filter((qq) => match(qq.title) && shown(qq.id) && (!isPlayer || qq.status !== 'hidden')).map((qq) => ({ id: qq.id, label: qq.title })) },
    { type: 'enemy', label: 'Враги', items: data.enemies.filter((e) => match(e.title) && shown(e.id)).map((e) => ({ id: e.id, label: e.title })) },
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
          <button
            className={`atlas-btn ${zoneEditId ? '' : 'ghost'} small`}
            style={{ width: '100%', marginTop: 6 }}
            onClick={() => {
              if (zoneEditId) { setZoneEditId(null); return; }
              const zid = `zone-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
              store.updateData(campaignId, (p) => ({ ...p, zones: [...p.zones, { id: zid, title: `Зона ${p.zones.length + 1}`, mapId: runtime.activeMapId, points: [], color: 'var(--gold)', visibleToPlayers: false }] }));
              setZoneEditId(zid);
            }}
          >
            {zoneEditId ? '✓ Завершить зону' : '+ Зона'}
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

      {data.zones.length > 0 && (
        <div className="ucw-lib-group">
          <div className="label">Зоны ({data.zones.length})</div>
          {data.zones.map((z) => (
            <div key={z.id} className={`ucw-entity-row${zoneEditId === z.id ? ' selected' : ''}`}>
              <span>{z.title} <span className="ucw-placed-badge">{z.points.length} тчк</span></span>
              {isEdit && (
                <div className="row-actions">
                  <button onClick={() => setZoneEditId(zoneEditId === z.id ? null : z.id)}>{zoneEditId === z.id ? 'Готово' : 'Точки'}</button>
                  <button onClick={() => store.updateData(campaignId, (p) => ({ ...p, zones: p.zones.map((zz) => (zz.id === z.id ? { ...zz, visibleToPlayers: !zz.visibleToPlayers } : zz)) }))}>{z.visibleToPlayers ? '👁' : '🚫'}</button>
                  <button onClick={() => { store.updateData(campaignId, (p) => ({ ...p, zones: p.zones.filter((zz) => zz.id !== z.id) })); if (zoneEditId === z.id) setZoneEditId(null); }}>✕</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

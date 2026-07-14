import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import '../world-atlas/atlasLayer.css';
import './campaignWorkspace.css';
import { getCampaignById } from '../../data/campaignModules';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { scenarioForCampaign } from '../../data/scenarioMerge';
import { getBattleMapCatalog, getBattleMapById, battleMapImageUrl, battleMapVariantTypes, BATTLE_VARIANT_LABEL } from '../../data/battleMapCatalog';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import type { CampaignBattleToken, BattleTokenSide, CampaignBattleBoard } from '../../types/userCampaign';
import { patchBattleBoardRemote } from '../../state/userCampaignSync';
import { ImageLightbox } from '../embedded-dm-companion/ImageLightbox';

const norm = (s: string) => s.trim().toLowerCase();
const FEET_PER_CELL = 5;
const DEFAULT_SPEED_FEET = 30;

export function CampaignBattlePage() {
  const { campaignId, mapId } = useParams<{ campaignId: string; mapId: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
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
  const asPlayer = searchParams.get('as') === 'player';
  const isPlayer = runtime?.mode === 'playerView' || asPlayer;
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
  const [placing, setPlacing] = useState<{ side: BattleTokenSide; name: string; ac?: number; hp?: number; speedFeet?: number; sourceEnemyId?: string; sourcePlayerId?: string; imageId?: string } | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fitted, setFitted] = useState(false);
  const [terrainMode, setTerrainMode] = useState<'off' | 'blocked' | 'difficult' | 'erase'>('off');
  const [hoverCell, setHoverCell] = useState<{ row: number; col: number } | null>(null);
  const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
  const [postMovePrompt, setPostMovePrompt] = useState<{ id: string; name: string } | null>(null);
  const [lightboxImage, setLightboxImage] = useState<{ src: string; title: string } | null>(null);
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

  useEffect(() => {
    if (!campaignId || !mapId || isPlayer || !(map || customMap)) return;
    if (runtime?.presentedBattle?.mapId === mapId) return;
    store.updateRuntime(campaignId, (p) => ({ ...p, presentedBattle: { mapId }, presentedCard: null }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, mapId, isPlayer, map?.id, customMap?.id]);

  useEffect(() => {
    return () => {
      if (!campaignId || !mapId || isPlayer) return;
      store.updateRuntime(campaignId, (p) => ({
        ...p,
        presentedBattle: p.presentedBattle?.mapId === mapId ? null : p.presentedBattle,
      }));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaignId, mapId, isPlayer]);

  const patchBoard = (updater: (b: CampaignBattleBoard) => CampaignBattleBoard, syncPlayerRemote = true) => {
    if (!campaignId || !mapId) return;
    let nextBoard: CampaignBattleBoard | null = null;
    store.updateRuntime(campaignId, (p) => {
      const prev = p.battleBoards?.[mapId]
        ?? (p.battleBoard && p.battleBoard.mapId === mapId ? p.battleBoard : { tokens: [], round: 1 });
      nextBoard = { ...updater(prev), mapId };
      return { ...p, battleBoards: { ...(p.battleBoards ?? {}), [mapId]: nextBoard } };
    });
    if (isPlayer && syncPlayerRemote && nextBoard) patchBattleBoardRemote(campaignId, mapId, nextBoard);
  };

  const fit = () => {
    const vp = viewportRef.current, img = imgRef.current;
    if (!vp || !img || !img.naturalWidth || vp.clientWidth < 2 || vp.clientHeight < 2) return false;
    const z = Math.min(vp.clientWidth / img.naturalWidth, vp.clientHeight / img.naturalHeight) * 0.98;
    setZoom(z);
    setPan({ x: (vp.clientWidth - img.naturalWidth * z) / 2, y: (vp.clientHeight - img.naturalHeight * z) / 2 });
    return true;
  };
  useEffect(() => {
    if (fitted) return;
    const tryFit = () => { if (fit()) setFitted(true); };
    const raf = requestAnimationFrame(() => requestAnimationFrame(tryFit));
    const t1 = setTimeout(tryFit, 180);
    const t2 = setTimeout(tryFit, 420);
    return () => { cancelAnimationFrame(raf); clearTimeout(t1); clearTimeout(t2); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitted, variant, map?.id, customMap?.id, shellHeight]);

  useEffect(() => {
    const isPhone = window.matchMedia?.('(max-width: 640px)').matches;
    if (isPhone) setFitted(false);
  }, [mapId, variant]);

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

  if (asPlayer && !isPresented) {
    return (
      <div className="ucw-lib-page">
        <button className="atlas-back-link" onClick={() => navigate(`/campaigns/${campaignId}/map?as=player`)}>← Карта</button>
        <p className="atlas-empty">Бой не открыт мастером.</p>
      </div>
    );
  }

  const imgUrl = isCustom
    ? (variant === 'night' && customMap?.nightImage ? customMap.nightImage : customMap?.dayImage)
    : battleMapImageUrl(map, variant);
  const scenario = scenarioForCampaign(data);
  const battleLocationKey = scenario?.battleMapLinks?.find((link) => link.battleMapId === mapId)?.locationKey;
  const battleScenarioLocation = battleLocationKey ? scenario?.locations.find((loc) => loc.key === battleLocationKey) : undefined;
  const battleLocation = battleScenarioLocation
    ? data.locations.find((loc) => norm(loc.title) === norm(battleScenarioLocation.title))
    : undefined;
  const battleLocationIds = new Set(battleLocation ? [battleLocation.id] : []);
  const locationEnemies = data.enemies.filter((enemy) => (enemy.locationIds ?? []).some((id) => battleLocationIds.has(id)));
  const otherEnemies = data.enemies.filter((enemy) => !locationEnemies.some((local) => local.id === enemy.id));
  const imageSrcById = (imageId?: string) => imageId ? data.images.find((image) => image.id === imageId)?.src : undefined;

  const clientToPct = (cx: number, cy: number) => {
    const img = imgRef.current; if (!img) return { x: 50, y: 50 };
    const r = img.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, ((cx - r.left) / r.width) * 100)), y: Math.max(0, Math.min(100, ((cy - r.top) / r.height) * 100)) };
  };
  const clientToPctInside = (cx: number, cy: number) => {
    const img = imgRef.current; if (!img) return null;
    const r = img.getBoundingClientRect();
    if (cx < r.left || cx > r.right || cy < r.top || cy > r.bottom) return null;
    return { x: ((cx - r.left) / r.width) * 100, y: ((cy - r.top) / r.height) * 100 };
  };

  // Grid geometry. Custom maps with a fixed NxN preset use those rows; otherwise
  // rows follow the image aspect so cells stay square.
  const rows = customMap?.rows
    ? customMap.rows
    : (natural ? Math.max(1, Math.round((natural.h / natural.w) * columns)) : columns);
  const cellW = 100 / columns;            // % of width
  const cellH = 100 / rows;               // % of height
  const cellAt = (pctX: number, pctY: number) => ({
    col: Math.max(0, Math.min(columns - 1, Math.floor(pctX / cellW))),
    row: Math.max(0, Math.min(rows - 1, Math.floor(pctY / cellH))),
  });
  const cellKey = (cell: { row: number; col: number }) => `${cell.row},${cell.col}`;
  const cellCenterPct = (cell: { row: number; col: number }) => ({ x: (cell.col + 0.5) * cellW, y: (cell.row + 0.5) * cellH });
  const terrainAt = (cell: { row: number; col: number }) => board.terrain?.[cellKey(cell)];
  const tokenAtCell = (cell: { row: number; col: number }, ignoreId?: string) => board.tokens.find((t) => {
    if (t.id === ignoreId) return false;
    const c = cellAt(t.x, t.y);
    return c.row === cell.row && c.col === cell.col;
  });
  const canStepDiagonal = (from: { row: number; col: number }, dr: number, dc: number) => {
    if (dr === 0 || dc === 0) return true;
    return !(terrainAt({ row: from.row + dr, col: from.col }) === 'blocked' && terrainAt({ row: from.row, col: from.col + dc }) === 'blocked');
  };
  const findRoute = (token: CampaignBattleToken, goal: { row: number; col: number }) => {
    const start = cellAt(token.x, token.y);
    const speedCells = Math.floor((token.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL);
    if (terrainAt(goal) === 'blocked') return { status: 'blocked' as const, cells: [] as Array<{ row: number; col: number }>, cost: 0, feet: 0 };
    if (tokenAtCell(goal, token.id)) return { status: 'occupied' as const, cells: [] as Array<{ row: number; col: number }>, cost: 0, feet: 0 };
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
    const dist = new Map<string, number>([[cellKey(start), 0]]);
    const prev = new Map<string, { row: number; col: number }>();
    const visited = new Set<string>();
    for (;;) {
      let curKey: string | null = null;
      let curDist = Infinity;
      for (const [k, d] of dist) {
        if (!visited.has(k) && d < curDist) { curDist = d; curKey = k; }
      }
      if (!curKey) return { status: 'blocked' as const, cells: [], cost: 0, feet: 0 };
      if (curKey === cellKey(goal)) break;
      visited.add(curKey);
      const [row, col] = curKey.split(',').map(Number);
      for (const [dr, dc] of dirs) {
        const next = { row: row + dr, col: col + dc };
        if (next.row < 0 || next.col < 0 || next.row >= rows || next.col >= columns) continue;
        if (!canStepDiagonal({ row, col }, dr, dc)) continue;
        const terrain = terrainAt(next);
        if (terrain === 'blocked') continue;
        if (tokenAtCell(next, token.id)) continue;
        const step = terrain === 'difficult' ? 2 : 1;
        const nk = cellKey(next);
        const nd = curDist + step;
        if (nd < (dist.get(nk) ?? Infinity)) {
          dist.set(nk, nd);
          prev.set(nk, { row, col });
        }
      }
    }
    const cells: Array<{ row: number; col: number }> = [];
    let walk = goal;
    while (cellKey(walk) !== cellKey(start)) {
      cells.push(walk);
      const p = prev.get(cellKey(walk));
      if (!p) break;
      walk = p;
    }
    cells.push(start);
    cells.reverse();
    const cost = dist.get(cellKey(goal)) ?? 0;
    return { status: cost <= speedCells ? 'valid' as const : 'too-far' as const, cells, cost, feet: cost * FEET_PER_CELL };
  };
  const snapPct = (pctX: number, pctY: number) => {
    if (!board.showGrid) return { x: pctX, y: pctY };
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
    patchBoard((b) => ({ ...b, view: { zoom: nz, panX: cx - wx * nz, panY: cy - wy * nz } }), !isPlayer);
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
    const pct = clientToPctInside(e.clientX, e.clientY);
    setHoverCell(pct ? cellAt(pct.x, pct.y) : null);
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
      const raw = clientToPctInside(e.clientX, e.clientY);
      if (!raw) return;
      const pct = snapPct(raw.x, raw.y);
      const tok: CampaignBattleToken = {
        id: `tok-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        name: placing.name,
        side: placing.side,
        sourceEnemyId: placing.sourceEnemyId,
        sourcePlayerId: placing.sourcePlayerId,
        imageId: placing.imageId,
        x: pct.x,
        y: pct.y,
        ac: placing.ac,
        currentHp: placing.hp,
        maxHp: placing.hp,
        speedFeet: placing.speedFeet ?? DEFAULT_SPEED_FEET,
      };
      patchBoard((b) => ({ ...b, tokens: [...b.tokens, tok], currentTurnTokenId: b.currentTurnTokenId ?? tok.id }));
      setSelected(tok.id);
      setPlacing(null);
    } else if (!d.moved && !placing && selTok && route?.status === 'valid' && selectedCanAct) {
      const center = cellCenterPct(route.cells[route.cells.length - 1]);
      patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, x: center.x, y: center.y } : t) }));
      setPostMovePrompt({ id: selTok.id, name: selTok.name });
      setHoverCell(null);
    } else if (d.moved) {
      patchBoard((b) => ({ ...b, view: { zoom, panX: d.sp.x + (e.clientX - d.x), panY: d.sp.y + (e.clientY - d.y) } }), !isPlayer);
    }
  };

  // Movement follows the main campaign's battle board: select the active
  // token, hover a destination to preview the route, then click the cell.
  // Tokens are not dragged around directly; that avoids teleporting and keeps
  // initiative/turn order meaningful.
  const dragToken = (e: React.PointerEvent, id: string) => {
    e.stopPropagation();
    const tok = board.tokens.find((t) => t.id === id);
    if (!tok) return;
    setSelected(id);
  };

  const selTok = board.tokens.find((t) => t.id === selected);
  const selectedEnemy = selTok?.sourceEnemyId
    ? data.enemies.find((enemy) => enemy.id === selTok.sourceEnemyId)
    : data.enemies.find((enemy) => selTok && norm(enemy.title) === norm(selTok.name));
  const partyPlayerForToken = (token?: CampaignBattleToken | null) => {
    if (!token) return undefined;
    if (token.sourcePlayerId) return (data.party ?? []).find((player) => player.id === token.sourcePlayerId);
    const direct = (data.party ?? []).find((player) => norm(player.name) === norm(token.name));
    if (direct) return direct;
    const generic = /^Игрок\s+(\d+)$/i.exec(token.name.trim());
    if (generic) return (data.party ?? [])[Math.max(0, Number(generic[1]) - 1)];
    return undefined;
  };
  const selectedPlayer = selTok?.sourcePlayerId
    ? (data.party ?? []).find((player) => player.id === selTok.sourcePlayerId)
    : partyPlayerForToken(selTok);
  const selectedImage = imageSrcById(selectedEnemy?.imageId ?? selectedPlayer?.imageId ?? selTok?.imageId);
  const selectedName = selectedEnemy?.title ?? selectedPlayer?.name ?? selTok?.name ?? '';
  const selectedHp = selTok?.currentHp ?? selectedPlayer?.hp ?? selectedPlayer?.maxHp ?? 0;
  const selectedMaxHp = selTok?.maxHp ?? selectedPlayer?.maxHp ?? selectedPlayer?.hp;
  const selectedIsPlayerControlled = !!selTok && (selTok.side === 'player' || selTok.side === 'ally');
  const ordered = [...board.tokens].sort((a, b) => (b.initiative ?? -999) - (a.initiative ?? -999) || a.name.localeCompare(b.name, 'ru'));
  const currentId = board.currentTurnTokenId && board.tokens.some((t) => t.id === board.currentTurnTokenId)
    ? board.currentTurnTokenId
    : ordered[0]?.id;
  const currentToken = board.tokens.find((t) => t.id === currentId);
  const selectedCell = selTok ? cellAt(selTok.x, selTok.y) : null;
  const selectedCanAct = !!selTok && selTok.id === currentId && terrainMode === 'off' && (!isPlayer || selectedIsPlayerControlled);
  const canPassTurn = !!currentToken && (!isPlayer || currentToken.side === 'player' || currentToken.side === 'ally');
  const route = selTok && selectedCell && hoverCell && postMovePrompt?.id !== selTok.id && cellKey(selectedCell) !== cellKey(hoverCell) && selectedCanAct ? findRoute(selTok, hoverCell) : null;
  const selectedRouteFeet = route?.feet ?? 0;
  const placeEnemy = (enemy: typeof data.enemies[number]) => setPlacing({
    side: 'enemy',
    name: enemy.title,
    ac: enemy.ac,
    hp: enemy.hp,
    sourceEnemyId: enemy.id,
    imageId: enemy.imageId,
  });
  const placePlayer = (player: NonNullable<typeof data.party>[number]) => setPlacing({
    side: 'player',
    name: player.name,
    ac: player.ac,
    hp: player.hp ?? player.maxHp,
    speedFeet: player.speedFeet ?? DEFAULT_SPEED_FEET,
    sourcePlayerId: player.id,
    imageId: player.imageId,
  });
  const fieldPlayers = board.tokens.filter((t) => t.side === 'player' || t.side === 'ally');
  const fieldEnemies = board.tokens.filter((t) => t.side === 'enemy' || t.side === 'neutral');
  const fieldPlayerLabel = (token: CampaignBattleToken) => partyPlayerForToken(token)?.name ?? token.name;
  const tokenImage = (token: CampaignBattleToken) => {
    const enemy = token.sourceEnemyId
      ? data.enemies.find((e) => e.id === token.sourceEnemyId)
      : data.enemies.find((e) => norm(e.title) === norm(token.name));
    const player = partyPlayerForToken(token);
    return imageSrcById(token.imageId ?? enemy?.imageId ?? player?.imageId);
  };
  const tokenShortLabel = (token: CampaignBattleToken, index: number) => {
    if (token.side === 'player') {
      const player = partyPlayerForToken(token);
      if (player) return player.name.split(/\s+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 3).toUpperCase() || 'ИГ';
      const sameSideIndex = board.tokens.filter((t) => t.side === token.side).findIndex((t) => t.id === token.id);
      return `И${sameSideIndex + 1}`;
    }
    if (token.side === 'ally') return 'С';
    if (token.side === 'neutral') return 'Н';
    const words = token.name.replace(/[«»"']/g, '').split(/\s+/).filter(Boolean);
    const base = (words[0]?.[0] ?? 'В') + (words[1]?.[0] ?? '');
    const duplicateIndex = board.tokens.filter((t) => t.side === token.side && t.name === token.name).findIndex((t) => t.id === token.id);
    return `${base.toUpperCase()}${duplicateIndex > 0 ? duplicateIndex + 1 : ''}`.slice(0, 3) || String(index + 1);
  };
  const setInit = (id: string, v: number | undefined) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === id ? { ...t, initiative: v } : t) }));
  const startPlacingNextPlayer = () => {
    const usedIds = new Set(fieldPlayers.map((token) => token.sourcePlayerId).filter(Boolean));
    const nextPlayer = (data.party ?? []).find((player) => !usedIds.has(player.id));
    if (nextPlayer) placePlayer(nextPlayer);
    else setPlacing({ side: 'player', name: `Игрок ${fieldPlayers.filter((t) => t.side === 'player').length + 1}` });
  };
  const rollAllInitiative = () => patchBoard((b) => {
    const tokens = b.tokens.map((t) => ({ ...t, initiative: 1 + Math.floor(Math.random() * 20) }));
    const first = [...tokens].sort((a, b) => (b.initiative ?? -999) - (a.initiative ?? -999) || a.name.localeCompare(b.name, 'ru'))[0];
    if (first) setSelected(first.id);
    setPostMovePrompt(null);
    return { ...b, tokens, currentTurnTokenId: first?.id };
  });
  const nextTurn = () => {
    if (!canPassTurn) return;
    if (!ordered.length) return;
    const idx = Math.max(0, ordered.findIndex((token) => token.id === currentId));
    const next = ordered[(idx + 1) % ordered.length];
    patchBoard((b) => ({ ...b, currentTurnTokenId: next.id, round: idx === ordered.length - 1 ? (b.round ?? 1) + 1 : (b.round ?? 1) }));
    setSelected(next.id);
    setPostMovePrompt(null);
    setHoverCell(null);
  };
  const finishBattle = () => {
    if (!window.confirm('Закончить бой? Токены и инициатива будут убраны, террейн и сетка останутся.')) return;
    patchBoard((b) => ({ ...b, tokens: [], round: 1, currentTurnTokenId: undefined }));
    store.updateRuntime(campaignId, (p) => ({ ...p, presentedBattle: p.presentedBattle?.mapId === mapId ? null : p.presentedBattle, presentedCard: null }));
    setSelected(null);
    setPostMovePrompt(null);
    if (window.history.length > 1) navigate(-1);
    else navigate(`/campaigns/${campaignId}/map`);
  };

  return (
    <div className="ucw" ref={rootRef} style={shellHeight ? { height: shellHeight } : undefined}>
      <div className="ucw-header">
        <div className="ucw-title">
          <button
            className="atlas-back-link"
            style={{ margin: 0 }}
            onClick={() => navigate(asPlayer ? `/campaigns/${campaignId}/map?as=player` : `/campaigns/${campaignId}/library/battle-maps`)}
          >
            ← {asPlayer ? 'Карта' : 'Карты боя'}
          </button>
          <span className="atlas-crumb-sep">→</span>
          <strong>{title}</strong>
          <span className="ucw-chip">{isCustom ? 'Своё поле · изолирован' : 'Бой · изолирован'}</span>
          {currentToken && <span className="ucw-chip">Ход: {currentToken.name}</span>}
        </div>
        <div className="ucw-header-actions">
          {variants.length > 1 && (
            <div className="ucw-segmented" role="group" aria-label="Время суток">
              {variants.map((v) => (
                <button key={v} className={variant === v ? 'active' : ''} onClick={() => patchBoard((b) => ({ ...b, variant: v }), !isPlayer)}>
                  {BATTLE_VARIANT_LABEL[v] ?? v}
                </button>
              ))}
            </div>
          )}
          {!isPlayer && campaignId && mapId && (
            <button
              className={`ucw-tbtn ${isPresented ? 'active' : ''}`}
              title={isPresented ? 'Игроки видят этот бой — нажмите, чтобы скрыть' : 'Открыть этот бой игрокам (появится у них)'}
              onClick={() => store.updateRuntime(campaignId, (p) => ({
                ...p,
                presentedBattle: isPresented ? null : { mapId },
                presentedCard: null,
              }))}
            >
              {isPresented ? '● Показано игрокам' : '▶ Показать игрокам'}
            </button>
          )}
          {isPlayer && <span className="ucw-chip">Режим игрока</span>}
        </div>
      </div>

      <div className="ucw-toolbar">
        <button className="ucw-tbtn" onClick={() => setZoom((z) => Math.min(6, z * 1.2))}>+</button>
        <button className="ucw-tbtn" onClick={() => setZoom((z) => Math.max(0.15, z / 1.2))}>−</button>
        <span className="ucw-zoomreadout">{Math.round(zoom * 100)}%</span>
        <button className="ucw-tbtn" onClick={() => { if (fit()) setFitted(true); }}>По размеру экрана</button>
        <span className="sep" />
        <span className="atlas-sub" style={{ margin: 0 }}>Раунд {board.round ?? 1}</span>
        <button className="ucw-tbtn" disabled={!ordered.length || !canPassTurn} onClick={nextTurn}>Закончить ход</button>
        {!isPlayer && <button className="ucw-tbtn" onClick={() => patchBoard((b) => ({ ...b, round: (b.round ?? 1) + 1 }))}>+ раунд</button>}
        {!isPlayer && <button className="ucw-tbtn" onClick={() => { if (window.confirm('Убрать все токены с поля? Террейн останется.')) { patchBoard((b) => ({ ...b, tokens: [], currentTurnTokenId: undefined })); setSelected(null); setPostMovePrompt(null); } }}>Очистить токены</button>}
        {!isPlayer && <button className="ucw-tbtn danger" onClick={finishBattle}>Закончить бой</button>}
        <span className="sep" />
        <button className={`ucw-tbtn ${board.showGrid ? 'active' : ''}`} onClick={() => patchBoard((b) => ({ ...b, showGrid: !b.showGrid }), !isPlayer)}>Сетка</button>
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
        <div className={`ucw-viewport${placing || terrainMode !== 'off' ? ' placing' : ''}`} ref={viewportRef} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onPointerLeave={() => setHoverCell(null)} onWheel={onWheel}>
          <div className="ucw-world" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})` }}>
            <div className="ucw-mapstack">
              {imgUrl && <img ref={imgRef} className="ucw-mapimg" src={imgUrl} alt={title} draggable={false} onLoad={(e) => { const im = e.currentTarget; setNatural({ w: im.naturalWidth, h: im.naturalHeight }); if (!fitted && fit()) setFitted(true); }} />}
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
                  {!placing && selTok && selectedCell && selectedCanAct && postMovePrompt?.id !== selTok.id && terrainMode === 'off' && Array.from({ length: Math.floor((selTok.speedFeet ?? selectedPlayer?.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL) * 2 + 1 }).flatMap((_, ri) => {
                    const speedCells = Math.floor((selTok.speedFeet ?? selectedPlayer?.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL);
                    const dr = ri - speedCells;
                    return Array.from({ length: speedCells * 2 + 1 }).map((__, ci) => {
                      const dc = ci - speedCells;
                      const cell = { row: selectedCell.row + dr, col: selectedCell.col + dc };
                      if (cell.row < 0 || cell.col < 0 || cell.row >= rows || cell.col >= columns) return null;
                      if (Math.max(Math.abs(dr), Math.abs(dc)) > speedCells) return null;
                      if (terrainAt(cell) === 'blocked' || tokenAtCell(cell, selTok.id)) return null;
                      return <rect key={`range-${cell.row}-${cell.col}`} x={cell.col * cellW} y={cell.row * cellH} width={cellW} height={cellH} className="ucw-cell-range" />;
                    });
                  })}
                  {route?.cells.map((cell, i) => {
                    if (i === 0) return null;
                    const a = cellCenterPct(route.cells[i - 1]);
                    const b = cellCenterPct(cell);
                    return <line key={`route-${i}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={route.status === 'valid' ? 'ucw-route-line' : 'ucw-route-line bad'} />;
                  })}
                </svg>
              )}
              <div className="ucw-markers">
                {board.tokens.map((t, index) => {
                  const img = tokenImage(t);
                  const label = tokenShortLabel(t, index);
                  return (
                  <div key={t.id} className={`ucw-btoken side-${t.side}${selected === t.id ? ' selected' : ''}${t.id === currentId ? ' current' : ''}`} style={{ left: `${t.x}%`, top: `${t.y}%` }}
                    onPointerDown={(e) => dragToken(e, t.id)} onClick={(e) => { e.stopPropagation(); setSelected(t.id); }} title={t.name}>
                    {img ? <img className="btoken-img" src={img} alt="" /> : <span className="btoken-init">{label}</span>}
                    <span className="btoken-name">{label}</span>
                    {(t.currentHp != null) && <span className="btoken-hp">{t.currentHp}{t.maxHp ? `/${t.maxHp}` : ''}</span>}
                  </div>
                  );
                })}
              </div>
            </div>
          </div>
          {route && <div className={`ucw-route-hud ${route.status}`}>{route.status === 'valid' ? `Маршрут: ${selectedRouteFeet} фт` : route.status === 'too-far' ? `Недостаточно движения: ${selectedRouteFeet} фт` : 'Маршрут недоступен'}</div>}
          {postMovePrompt && postMovePrompt.id === selTok?.id && (
            <div className="ucw-next-turn-popover" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => e.stopPropagation()}>
              <strong>{postMovePrompt.name} сделал ход</strong>
              <span>Можно передать ход следующему участнику.</span>
              <button type="button" className="atlas-btn small" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); nextTurn(); }}>Следующий юнит</button>
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
            {ordered.length === 0 ? <p className="ucw-empty-note">Пока пусто.</p> : ordered.map((t) => (
              <div key={t.id} className={`ucw-init-row side-${t.side}${selected === t.id ? ' selected' : ''}${t.id === currentId ? ' current' : ''}`} onClick={() => setSelected(t.id)}>
                {!isPlayer
                  ? <input className="ucw-init-input" type="number" value={t.initiative ?? ''} onClick={(e) => e.stopPropagation()} onChange={(e) => setInit(t.id, e.target.value === '' ? undefined : Number(e.target.value))} title="Инициатива" />
                  : <span className="ucw-init-badge">{t.initiative ?? '—'}</span>}
                <span className="ucw-init-name">{t.name}</span>
                {t.currentHp != null && <span className="ucw-init-hp">{t.currentHp}{t.maxHp ? `/${t.maxHp}` : ''}</span>}
                {!isPlayer && <button className="ucw-init-x" onClick={(e) => { e.stopPropagation(); patchBoard((b) => ({ ...b, tokens: b.tokens.filter((x) => x.id !== t.id) })); }}>✕</button>}
              </div>
            ))}
          </div>

          {selTok && (
            <div className="ucw-card ucw-token-card">
              <div className="ucw-token-card-head">
                {selectedImage ? (
                  <button type="button" className="ucw-image-button inline" onClick={() => setLightboxImage({ src: selectedImage, title: selectedName })}>
                    <img className="ucw-row-thumb large" src={selectedImage} alt="" />
                  </button>
                ) : <span className="ucw-row-thumb large fallback">{selectedName.slice(0, 2)}</span>}
                <div>
                  <strong>{selectedName}</strong>
                  <small>{isPlayer ? 'Карточка' : selectedEnemy ? 'Карточка врага' : selectedPlayer ? 'Карточка игрока' : 'Свободный токен'}</small>
                </div>
              </div>
              {isPlayer ? (
                selectedIsPlayerControlled ? (
                  <>
                    {selectedImage ? (
                      <button type="button" className="ucw-image-button block" onClick={() => setLightboxImage({ src: selectedImage, title: selectedName })}>
                        <img className="ucw-token-card-image compact" src={selectedImage} alt="" />
                      </button>
                    ) : <div className="ucw-token-card-fallback compact">{selectedName.slice(0, 2)}</div>}
                    <div className="ucw-player-hp-panel">
                      <div className="ucw-player-hp-value">HP {selectedHp}{selectedMaxHp != null ? ` / ${selectedMaxHp}` : ''}</div>
                      <div className="ucw-card-actions">
                        {[-5, -1, 1, 5].map((delta) => (
                          <button
                            key={delta}
                            className="atlas-btn ghost small"
                            onClick={() => patchBoard((b) => ({
                              ...b,
                              tokens: b.tokens.map((t) => t.id === selTok.id ? {
                                ...t,
                                currentHp: Math.max(0, Math.min(Math.max(t.maxHp ?? selectedMaxHp ?? 0, (t.currentHp ?? selectedHp) + delta), (t.currentHp ?? selectedHp) + delta)),
                                maxHp: t.maxHp ?? selectedMaxHp,
                              } : t),
                            }))}
                          >
                            {delta > 0 ? `+${delta}` : delta} HP
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : (
                  selectedImage ? (
                    <button type="button" className="ucw-image-button block" onClick={() => setLightboxImage({ src: selectedImage, title: selectedName })}>
                      <img className="ucw-token-card-image" src={selectedImage} alt="" />
                    </button>
                  ) : <div className="ucw-token-card-fallback">{selectedName.slice(0, 2)}</div>
                )
              ) : (
                <>
                  <label>Имя</label>
                  <input value={selTok.name} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, name: e.target.value } : t) }))} />
                  <div className="ucw-stat-row">
                    <div><label>HP</label><input type="number" value={selTok.currentHp ?? selectedPlayer?.hp ?? ''} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, currentHp: Number(e.target.value) } : t) }))} /></div>
                    <div><label>Макс HP</label><input type="number" value={selTok.maxHp ?? selectedPlayer?.maxHp ?? ''} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, maxHp: Number(e.target.value) } : t) }))} /></div>
                    <div><label>AC</label><input type="number" value={selTok.ac ?? selectedPlayer?.ac ?? ''} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, ac: Number(e.target.value) } : t) }))} /></div>
                    <div><label>Скор.</label><input type="number" value={selTok.speedFeet ?? selectedPlayer?.speedFeet ?? DEFAULT_SPEED_FEET} onChange={(e) => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, speedFeet: Math.max(5, Number(e.target.value) || DEFAULT_SPEED_FEET) } : t) }))} /></div>
                  </div>
                  <div className="ucw-card-actions">
                    <button className="atlas-btn ghost small" onClick={() => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, currentHp: (t.currentHp ?? 0) - 5 } : t) }))}>−5 HP</button>
                    <button className="atlas-btn ghost small" onClick={() => patchBoard((b) => ({ ...b, tokens: b.tokens.map((t) => t.id === selTok.id ? { ...t, currentHp: (t.currentHp ?? 0) + 5 } : t) }))}>+5 HP</button>
                    <button className="atlas-btn danger small" onClick={() => { patchBoard((b) => ({ ...b, tokens: b.tokens.filter((t) => t.id !== selTok.id) })); setSelected(null); }}>Убрать</button>
                  </div>
                  {selectedEnemy && (
                    <div className="ucw-token-source">
                      {selectedEnemy.description && <><h4>Описание</h4><p>{selectedEnemy.description}</p></>}
                      {selectedEnemy.tactics && <><h4>DM</h4><p>{selectedEnemy.tactics}</p></>}
                    </div>
                  )}
                  {selectedPlayer && (
                    <div className="ucw-token-source">
                      <h4>Лист персонажа</h4>
                      <div className="ucw-sheet-grid">
                        <span>Класс: {selectedPlayer.class || '—'}</span>
                        <span>Ур.: {selectedPlayer.level ?? '—'}</span>
                        <span>Мастерство: {selectedPlayer.proficiencyBonus ?? '—'}</span>
                        <span>Скор.: {selectedPlayer.speedFeet ?? selTok.speedFeet ?? DEFAULT_SPEED_FEET} фт</span>
                      </div>
                      <div className="ucw-ability-grid compact">
                        <span>СИЛ {selectedPlayer.str ?? '—'}</span>
                        <span>ЛОВ {selectedPlayer.dex ?? '—'}</span>
                        <span>ТЕЛ {selectedPlayer.con ?? '—'}</span>
                        <span>ИНТ {selectedPlayer.int ?? '—'}</span>
                        <span>МДР {selectedPlayer.wis ?? '—'}</span>
                        <span>ХАР {selectedPlayer.cha ?? '—'}</span>
                      </div>
                      {selectedPlayer.equipmentState && <><h4>Снаряжение</h4><p>{selectedPlayer.equipmentState}</p></>}
                      {selectedPlayer.attacks && <><h4>Атаки</h4><p>{selectedPlayer.attacks}</p></>}
                      {selectedPlayer.features && <><h4>Особенности</h4><p>{selectedPlayer.features}</p></>}
                      {selectedPlayer.inventory && <><h4>Инвентарь</h4><p>{selectedPlayer.inventory}</p></>}
                      {selectedPlayer.conditions && <><h4>Состояния</h4><p>{selectedPlayer.conditions}</p></>}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          <div className="ucw-battle-side-grid">
            <div className="ucw-lib-group">
              <div className="label">Игроки на поле ({fieldPlayers.length})</div>
              {fieldPlayers.length === 0 ? <p className="ucw-empty-note">Пока нет.</p> : fieldPlayers.map((t) => (
                <button key={t.id} type="button" className={`ucw-token-row side-${t.side}${selected === t.id ? ' selected' : ''}`} onClick={() => setSelected(t.id)}>
                  <span>{fieldPlayerLabel(t)}</span>
                  <small>{(t.ac ?? partyPlayerForToken(t)?.ac) != null ? `AC ${t.ac ?? partyPlayerForToken(t)?.ac} · ` : ''}{(t.currentHp ?? partyPlayerForToken(t)?.hp) != null ? `HP ${t.currentHp ?? partyPlayerForToken(t)?.hp}${(t.maxHp ?? partyPlayerForToken(t)?.maxHp) ? `/${t.maxHp ?? partyPlayerForToken(t)?.maxHp}` : ''} · ` : ''}{t.speedFeet ?? partyPlayerForToken(t)?.speedFeet ?? DEFAULT_SPEED_FEET} фт</small>
                </button>
              ))}
            </div>
            {!isPlayer && (
              <div className="ucw-lib-group">
                <div className="label">Враги на поле ({fieldEnemies.length})</div>
                {fieldEnemies.length === 0 ? <p className="ucw-empty-note">Пока нет.</p> : fieldEnemies.map((t) => (
                  <button key={t.id} type="button" className={`ucw-token-row side-${t.side}${selected === t.id ? ' selected' : ''}`} onClick={() => setSelected(t.id)}>
                    <span>{t.name}</span>
                    <small>{t.ac != null ? `AC ${t.ac} · ` : ''}{t.currentHp != null ? `HP ${t.currentHp}${t.maxHp ? `/${t.maxHp}` : ''} · ` : ''}{t.speedFeet ?? DEFAULT_SPEED_FEET} фт</small>
                  </button>
                ))}
              </div>
            )}
          </div>

          {!isPlayer && (
            <p className="atlas-sub" style={{ fontSize: '0.82rem', marginTop: 4 }}>Выберите токен и кликните по карте, чтобы поставить.</p>
          )}
          {!isPlayer && (
            <div className="ucw-add-grid">
              <button className="atlas-btn small" onClick={startPlacingNextPlayer}>+ Игрок</button>
              <button className="atlas-btn small" onClick={() => setPlacing({ side: 'ally', name: `Союзник ${fieldPlayers.filter((t) => t.side === 'ally').length + 1}` })}>+ Союзник</button>
              <button className="atlas-btn small" onClick={() => setPlacing({ side: 'neutral', name: `Нейтрал ${fieldEnemies.filter((t) => t.side === 'neutral').length + 1}` })}>+ Нейтрал</button>
              <button className="atlas-btn small" onClick={() => { const n = window.prompt('Имя токена:'); if (n) setPlacing({ side: 'enemy', name: n }); }}>+ Свой</button>
            </div>
          )}

          {!isPlayer && (data.party ?? []).length > 0 && (
            <div className="ucw-lib-group">
              <div className="label">Игроки партии</div>
              {(data.party ?? []).map((player) => (
                <div key={player.id} className="ucw-entity-row">
                  <span>{player.name}{player.hp ?? player.maxHp ? ` · HP ${player.hp ?? player.maxHp}` : ''}</span>
                  <div className="row-actions">
                    <button onClick={() => placePlayer(player)}>{placing?.sourcePlayerId === player.id ? '…клик' : 'На поле'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isPlayer && (
            <div className="ucw-lib-group">
              <div className="label">{battleLocation ? `Враги локации: ${battleLocation.title}` : 'Враги локации'}</div>
              {locationEnemies.length === 0 ? <p className="ucw-empty-note">Для этой карты нет связанных врагов.</p> : locationEnemies.map((e) => (
                <div key={e.id} className="ucw-entity-row priority">
                  {imageSrcById(e.imageId) ? <img className="ucw-row-thumb" src={imageSrcById(e.imageId)} alt="" /> : <span className="ucw-row-thumb fallback">{e.title.slice(0, 2)}</span>}
                  <span>{e.title}{e.hp ? ` · HP ${e.hp}` : ''}</span>
                  <div className="row-actions">
                    <button onClick={() => placeEnemy(e)}>{placing?.sourceEnemyId === e.id ? '…клик' : 'На поле'}</button>
                  </div>
                </div>
              ))}
              <div className="label" style={{ marginTop: 10 }}>Остальные враги кампании</div>
              {data.enemies.length === 0 ? <p className="ucw-empty-note">Нет врагов. Добавьте их в разделе «Враги».</p> : otherEnemies.map((e) => (
                <div key={e.id} className="ucw-entity-row">
                  {imageSrcById(e.imageId) ? <img className="ucw-row-thumb" src={imageSrcById(e.imageId)} alt="" /> : <span className="ucw-row-thumb fallback">{e.title.slice(0, 2)}</span>}
                  <span>{e.title}{e.hp ? ` · HP ${e.hp}` : ''}</span>
                  <div className="row-actions">
                    <button onClick={() => placeEnemy(e)}>{placing?.sourceEnemyId === e.id ? '…клик' : 'На поле'}</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </aside>
      </div>
      {lightboxImage && <ImageLightbox image={lightboxImage} onClose={() => setLightboxImage(null)} />}
    </div>
  );
}

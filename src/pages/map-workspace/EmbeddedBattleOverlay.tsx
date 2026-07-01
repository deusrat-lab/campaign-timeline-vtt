import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BATTLE_MAP_ASSET_ORIGIN } from '../../config';
import { useCampaignStore } from '../../state/campaignStore';
import type { ActiveBattleCombatant, ActiveBattleState } from '../../types';
import type { BattleMapManifestEntry } from '../../data/battleMapManifest';
import type { DmCustomEnemy, DmFaction, DmImageItem, DmLocation, DmPlayer, DmQuest } from '../../types/dmCompanion';

type BattleTokenDefinition = {
  id: string;
  name: string;
  side: 'enemy' | 'player' | 'ally' | 'neutral';
  armorClass?: number;
  maxHp?: number;
  speedFeet?: number;
  notes?: string;
  imageSourceUrl?: string;
};

type BattleCell = { row: number; column: number };
type BattleTerrainCell = { row: number; column: number; type: 'blocked' | 'difficult' };
type TerrainEditMode = 'off' | 'blocked' | 'difficult' | 'erase';
type PaletteItem = {
  kind: 'player' | 'enemy';
  sourceId: string;
  name: string;
  subtitle?: string;
  imageSrc?: string;
  tokenDefinitionId?: string;
  speedFeet: number;
  hp: number;
  ac?: number;
};

const FEET_PER_CELL = 5;
const DEFAULT_SPEED_FEET = 30;

function mapImageUrl(map: BattleMapManifestEntry | undefined, variantType: string): string | undefined {
  const variant = map?.variants?.find((v) => v.type === variantType && v.url) ?? map?.variants?.find((v) => v.url);
  return variant?.url ? `${BATTLE_MAP_ASSET_ORIGIN}${variant.url}` : undefined;
}

function battleVariantLabel(type: string): string {
  if (type === 'day') return 'День';
  if (type === 'evening') return 'Вечер';
  if (type === 'night') return 'Ночь';
  return type;
}

function imageForId(images: DmImageItem[], imageId?: string): string | undefined {
  if (!imageId) return undefined;
  const img = images.find((i) => i.id === imageId);
  return img?.thumbnailSrc ?? img?.src;
}

function heroTokenForPlayer(player: DmPlayer): string {
  if (player.id === 'player-olaf') return '/tokens/heroes/monk.svg';
  if (player.id === 'player-felix') return '/tokens/heroes/fighter.svg';
  if (player.id === 'player-finn') return '/tokens/heroes/rogue.svg';
  if (player.id === 'player-eliara') return '/tokens/heroes/cleric.svg';
  const cls = `${player.class} ${player.tags?.join(' ')}`.toLowerCase();
  if (cls.includes('монах') || cls.includes('monk')) return '/tokens/heroes/monk.svg';
  if (cls.includes('жрец') || cls.includes('cleric')) return '/tokens/heroes/cleric.svg';
  if (cls.includes('плут') || cls.includes('rogue')) return '/tokens/heroes/rogue.svg';
  return '/tokens/heroes/fighter.svg';
}

function parseSpeedFeet(speed?: string): number {
  const n = Number(String(speed ?? '').match(/\d+/)?.[0]);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SPEED_FEET;
}

function playerSpeedFeet(player: DmPlayer): number {
  const text = `${player.race ?? ''} ${player.class ?? ''}`.toLowerCase();
  if (text.includes('дварф') || text.includes('dwarf')) return 20;
  return DEFAULT_SPEED_FEET;
}

function fallbackHpForPlayer(player: DmPlayer): number {
  const level = Number.parseInt(player.level, 10);
  return Number.isFinite(level) && level > 0 ? 8 + level * 6 : 12;
}

function hpDelta(value: number, delta: number, maxHp: number): number {
  return Math.max(0, Math.min(Math.max(maxHp, value + delta), value + delta));
}

function sortedCombatants(combatants: ActiveBattleCombatant[]): ActiveBattleCombatant[] {
  return [...combatants].sort((a, b) => {
    const ai = a.initiative ?? -999;
    const bi = b.initiative ?? -999;
    return bi - ai || a.name.localeCompare(b.name, 'ru');
  });
}

function getGrid(map: BattleMapManifestEntry | undefined) {
  const gp = map?.gridProfile;
  const verticalLines = gp?.verticalLines?.filter((n) => Number.isFinite(n)) ?? [];
  const horizontalLines = gp?.horizontalLines?.filter((n) => Number.isFinite(n)) ?? [];
  if (verticalLines.length >= 2 && horizontalLines.length >= 2) {
    return {
      verticalLines,
      horizontalLines,
      columns: verticalLines.length - 1,
      rows: horizontalLines.length - 1,
      width: verticalLines[verticalLines.length - 1],
      height: horizontalLines[horizontalLines.length - 1],
    };
  }
  const columns = gp?.columns ?? 30;
  const rows = gp?.rows ?? 30;
  const width = 1200;
  const height = 1200;
  return {
    verticalLines: Array.from({ length: columns + 1 }, (_, i) => (i * width) / columns),
    horizontalLines: Array.from({ length: rows + 1 }, (_, i) => (i * height) / rows),
    columns,
    rows,
    width,
    height,
  };
}

function cellCenter(grid: ReturnType<typeof getGrid>, cell: BattleCell) {
  const x1 = grid.verticalLines[cell.column] ?? 0;
  const x2 = grid.verticalLines[cell.column + 1] ?? x1;
  const y1 = grid.horizontalLines[cell.row] ?? 0;
  const y2 = grid.horizontalLines[cell.row + 1] ?? y1;
  return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

function cellRect(grid: ReturnType<typeof getGrid>, cell: BattleCell) {
  const x = grid.verticalLines[cell.column] ?? 0;
  const y = grid.horizontalLines[cell.row] ?? 0;
  const width = (grid.verticalLines[cell.column + 1] ?? x) - x;
  const height = (grid.horizontalLines[cell.row + 1] ?? y) - y;
  return { x, y, width, height };
}

function cellFromImagePoint(grid: ReturnType<typeof getGrid>, x: number, y: number): BattleCell | null {
  const column = grid.verticalLines.findIndex((line, i) => i < grid.verticalLines.length - 1 && x >= line && x < grid.verticalLines[i + 1]);
  const row = grid.horizontalLines.findIndex((line, i) => i < grid.horizontalLines.length - 1 && y >= line && y < grid.horizontalLines[i + 1]);
  if (row < 0 || column < 0) return null;
  return { row, column };
}

function sameCell(a?: BattleCell | null, b?: BattleCell | null): boolean {
  return !!a && !!b && a.row === b.row && a.column === b.column;
}

function cellKey(cell: BattleCell): string {
  return `${cell.row},${cell.column}`;
}

function terrainAt(cells: BattleTerrainCell[] | undefined, cell: BattleCell) {
  return cells?.find((t) => t.row === cell.row && t.column === cell.column);
}

function tokenAt(combatants: ActiveBattleCombatant[], cell: BattleCell, ignoreId?: string) {
  return combatants.find((c) => c.id !== ignoreId && c.row === cell.row && c.column === cell.column);
}

function canStepDiagonal(terrainCells: BattleTerrainCell[] | undefined, from: BattleCell, dr: number, dc: number): boolean {
  if (dr === 0 || dc === 0) return true;
  const a = terrainAt(terrainCells, { row: from.row + dr, column: from.column })?.type === 'blocked';
  const b = terrainAt(terrainCells, { row: from.row, column: from.column + dc })?.type === 'blocked';
  return !(a && b);
}

function findRoute(
  terrainCells: BattleTerrainCell[] | undefined,
  grid: ReturnType<typeof getGrid>,
  combatants: ActiveBattleCombatant[],
  token: ActiveBattleCombatant,
  goal: BattleCell,
) {
  const start = { row: token.row ?? 0, column: token.column ?? 0 };
  const speedCells = Math.floor((token.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL);
  const goalTerrain = terrainAt(terrainCells, goal);
  if (goalTerrain?.type === 'blocked') return { status: 'blocked' as const, cells: [] as BattleCell[], cost: 0, feet: 0 };
  if (tokenAt(combatants, goal, token.id)) return { status: 'occupied' as const, cells: [] as BattleCell[], cost: 0, feet: 0 };

  const directions = [
    [-1, 0], [1, 0], [0, -1], [0, 1],
    [-1, -1], [-1, 1], [1, -1], [1, 1],
  ];
  const dist = new Map<string, number>([[cellKey(start), 0]]);
  const prev = new Map<string, BattleCell>();
  const visited = new Set<string>();

  for (;;) {
    let curKey: string | null = null;
    let curDist = Infinity;
    for (const [k, d] of dist) {
      if (!visited.has(k) && d < curDist) {
        curDist = d;
        curKey = k;
      }
    }
    if (!curKey) return { status: 'blocked' as const, cells: [] as BattleCell[], cost: 0, feet: 0 };
    if (curKey === cellKey(goal)) break;
    visited.add(curKey);
    const [row, column] = curKey.split(',').map(Number);
    for (const [dr, dc] of directions) {
      const next = { row: row + dr, column: column + dc };
      if (next.row < 0 || next.column < 0 || next.row >= grid.rows || next.column >= grid.columns) continue;
      if (!canStepDiagonal(terrainCells, { row, column }, dr, dc)) continue;
      const terrain = terrainAt(terrainCells, next);
      if (terrain?.type === 'blocked') continue;
      if (tokenAt(combatants, next, token.id)) continue;
      const step = terrain?.type === 'difficult' ? 2 : 1;
      const nk = cellKey(next);
      const nd = curDist + step;
      if (nd < (dist.get(nk) ?? Infinity)) {
        dist.set(nk, nd);
        prev.set(nk, { row, column });
      }
    }
  }

  const cells: BattleCell[] = [];
  let walk = goal;
  while (!sameCell(walk, start)) {
    cells.push(walk);
    walk = prev.get(cellKey(walk))!;
  }
  cells.push(start);
  cells.reverse();
  const cost = dist.get(cellKey(goal)) ?? 0;
  return { status: cost <= speedCells ? 'valid' as const : 'too-far' as const, cells, cost, feet: cost * FEET_PER_CELL };
}

export function createCombatantFromEnemy(enemy: DmCustomEnemy, index: number, cell?: BattleCell, tokenSrc?: string): ActiveBattleCombatant {
  const maxHp = enemy.hp ?? 8;
  return {
    id: `enemy-${enemy.id}-${Date.now()}-${index}`,
    side: 'enemy',
    sourceId: enemy.id,
    name: enemy.name,
    imageId: enemy.image,
    tokenSrc,
    currentHp: maxHp,
    maxHp,
    armorClass: enemy.ac,
    speedFeet: parseSpeedFeet(enemy.speed),
    row: cell?.row,
    column: cell?.column,
    x: 0,
    y: 0,
  };
}

export function createCombatantFromPlayer(player: DmPlayer, index: number, cell?: BattleCell): ActiveBattleCombatant {
  const maxHp = fallbackHpForPlayer(player);
  return {
    id: `player-${player.id}-${Date.now()}-${index}`,
    side: 'player',
    sourceId: player.id,
    name: player.characterName,
    imageId: player.image,
    tokenSrc: heroTokenForPlayer(player),
    currentHp: maxHp,
    maxHp,
    armorClass: 10,
    speedFeet: playerSpeedFeet(player),
    row: cell?.row,
    column: cell?.column,
    x: 0,
    y: 0,
  };
}

export function EmbeddedBattleOverlay({
  battle,
  battleMap,
  enemies,
  players,
  images,
  locations = [],
  quests = [],
  factions = [],
  isPlayerView,
}: {
  battle: ActiveBattleState;
  battleMap?: BattleMapManifestEntry;
  enemies: DmCustomEnemy[];
  players: DmPlayer[];
  images: DmImageItem[];
  locations?: DmLocation[];
  quests?: DmQuest[];
  factions?: DmFaction[];
  isPlayerView: boolean;
}) {
  const store = useCampaignStore();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const selectedPaletteRef = useRef<PaletteItem | null>(null);
  const terrainEditModeRef = useRef<TerrainEditMode>('off');
  const panToolRef = useRef(false);
  const isPlayerViewRef = useRef(isPlayerView);
  const [tokenDefs, setTokenDefs] = useState<BattleTokenDefinition[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>(battle.currentTurnCombatantId);
  const [selectedPalette, setSelectedPalette] = useState<PaletteItem | null>(null);
  const [enemySearch, setEnemySearch] = useState('');
  const [enemyFilter, setEnemyFilter] = useState('all');
  const [enemyRoleFilter, setEnemyRoleFilter] = useState('all');
  const [enemyLocationFilter, setEnemyLocationFilter] = useState('all');
  const [enemyQuestFilter, setEnemyQuestFilter] = useState('all');
  const [enemyFactionFilter, setEnemyFactionFilter] = useState('all');
  const [enemyCrFilter, setEnemyCrFilter] = useState('all');
  const [enemyTagFilter, setEnemyTagFilter] = useState('all');
  const [hoverCell, setHoverCell] = useState<BattleCell | null>(null);
  const [camera, setCamera] = useState({ scale: 1, x: 0, y: 0 });
  const [panning, setPanning] = useState<{ x: number; y: number; sx: number; sy: number } | null>(null);
  const [teleportMode, setTeleportMode] = useState(false);
  const [showTerrain, setShowTerrain] = useState(true);
  const [terrainEditMode, setTerrainEditMode] = useState<TerrainEditMode>('off');
  const [panTool, setPanTool] = useState(false);
  const [terrainPainting, setTerrainPainting] = useState(false);
  const [postMovePrompt, setPostMovePrompt] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    fetch('/data/battle-map-vtt/tokens.json')
      .then((res) => (res.ok ? res.json() : { tokens: [] }))
      .then((json) => setTokenDefs(json.tokens ?? []))
      .catch(() => setTokenDefs([]));
  }, []);

  const mapSrc = mapImageUrl(battleMap, battle.variantType);
  const grid = useMemo(() => getGrid(battleMap), [battleMap]);
  const terrainCells = (battle.terrainCells ?? battleMap?.navigationProfile?.terrainCells ?? []) as BattleTerrainCell[];
  const variantOptions = useMemo(() => {
    const seen = new Set<string>();
    return (battleMap?.variants ?? []).filter((variant) => {
      if (!variant.url || !variant.type || seen.has(variant.type)) return false;
      seen.add(variant.type);
      return true;
    }) as Array<NonNullable<BattleMapManifestEntry['variants']>[number] & { type: string }>;
  }, [battleMap]);
  const ordered = useMemo(() => sortedCombatants(battle.combatants), [battle.combatants]);
  const currentId = battle.currentTurnCombatantId ?? ordered[0]?.id;
  const currentCombatant = battle.combatants.find((c) => c.id === currentId);
  const selected = battle.combatants.find((c) => c.id === selectedId) ?? battle.combatants.find((c) => c.id === currentId);
  const selectedCanAct = !!selected && selected.id === currentId && (!isPlayerView || selected.side === 'player');
  const canPassTurn = !!currentCombatant && (!isPlayerView || currentCombatant.side === 'player');
  const selectedCell = selected?.row !== undefined && selected.column !== undefined ? { row: selected.row, column: selected.column } : null;
  const route = !selectedPalette && selected && selectedCell && hoverCell && !sameCell(selectedCell, hoverCell) && (selectedCanAct || (!isPlayerView && teleportMode)) && terrainEditMode === 'off' && !panTool
    ? findRoute(terrainCells, grid, battle.combatants, selected, hoverCell)
    : null;

  function fitCamera() {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect || !grid.width || !grid.height) return;
    const padding = 24;
    const scale = Math.max(0.2, Math.min(2.5, Math.min((rect.width - padding * 2) / grid.width, (rect.height - padding * 2) / grid.height)));
    setCamera({
      scale,
      x: (rect.width - grid.width * scale) / 2,
      y: (rect.height - grid.height * scale) / 2,
    });
  }

  useEffect(() => {
    fitCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [battleMap?.id, grid.width, grid.height]);

  useEffect(() => {
    if (!currentId) return;
    setSelectedId(currentId);
    setSelectedPalette(null);
    setPostMovePrompt(null);
  }, [currentId]);

  const enemyGroups = Array.from(new Set(enemies.flatMap((e) => [e.faction, ...(e.tags ?? [])]).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'ru'));
  const enemyRoleOptions = Array.from(new Set(enemies.map((enemy) => enemy.role).filter((role): role is string => Boolean(role)))).sort((a, b) => a.localeCompare(b, 'ru'));
  const enemyLocationOptions = Array.from(new Set(enemies.flatMap((enemy) => enemy.locationIds ?? [])))
    .map((id) => ({ id, name: locations.find((loc) => loc.id === id)?.name ?? id }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const enemyQuestOptions = Array.from(new Set(enemies.flatMap((enemy) => enemy.questIds ?? [])))
    .map((id) => ({ id, title: quests.find((quest) => quest.id === id)?.title ?? id }))
    .sort((a, b) => a.title.localeCompare(b.title, 'ru'));
  const enemyFactionOptions = Array.from(
    new Set(enemies.flatMap((enemy) => [enemy.primaryFactionId, ...(enemy.factionIds ?? []), enemy.faction]).filter(Boolean) as string[]),
  )
    .map((id) => {
      const faction = factions.find((f) => f.id === id || f.name === id || f.shortName === id);
      return { id, name: faction?.name ?? faction?.shortName ?? id };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const enemyCrOptions = Array.from(new Set(enemies.map((enemy) => enemy.cr).filter((cr): cr is string => Boolean(cr)))).sort((a, b) => a.localeCompare(b, 'ru', { numeric: true }));
  const enemyTagOptions = Array.from(new Set(enemies.flatMap((enemy) => enemy.tags ?? []))).sort((a, b) => a.localeCompare(b, 'ru'));
  const matchesEnemyFaction = (enemy: DmCustomEnemy, value: string) =>
    value === 'all' || enemy.primaryFactionId === value || enemy.factionIds?.includes(value) || enemy.faction === value;
  const matchingTokenForEnemy = (enemy: DmCustomEnemy) => {
    const byName = tokenDefs.find((t) => t.name.toLowerCase() === enemy.name.toLowerCase());
    const byBase = enemy.baseMonsterName ? tokenDefs.find((t) => t.name.toLowerCase() === enemy.baseMonsterName!.toLowerCase()) : undefined;
    return byName ?? byBase ?? tokenDefs.find((t) => t.side === 'enemy' && enemy.name.toLowerCase().includes(t.name.toLowerCase()));
  };
  const tokenDefinitionById = (id?: string) => (id ? tokenDefs.find((t) => t.id === id) : undefined);
  const tokenSrcForCombatant = (combatant: ActiveBattleCombatant) =>
    combatant.tokenSrc ?? tokenDefinitionById(combatant.tokenDefinitionId)?.imageSourceUrl ?? (combatant.side === 'player' ? imageForId(images, combatant.imageId) : undefined);
  const enemyForCombatant = (combatant: ActiveBattleCombatant) => {
    if (combatant.side !== 'enemy') return undefined;
    const tokenName = tokenDefinitionById(combatant.tokenDefinitionId)?.name;
    return (
      enemies.find((e) => e.id === combatant.sourceId) ??
      enemies.find((e) => e.name.toLowerCase() === combatant.name.toLowerCase()) ??
      (tokenName ? enemies.find((e) => e.name.toLowerCase() === tokenName.toLowerCase() || e.baseMonsterName?.toLowerCase() === tokenName.toLowerCase()) : undefined)
    );
  };

  const playerPalette: PaletteItem[] = players
    .filter((player) => !battle.combatants.some((combatant) => combatant.side === 'player' && combatant.sourceId === player.id))
    .map((player) => ({
      kind: 'player',
      sourceId: player.id,
      name: player.characterName,
      subtitle: `${player.playerName} · ${player.class}`,
      imageSrc: heroTokenForPlayer(player),
      speedFeet: playerSpeedFeet(player),
      hp: fallbackHpForPlayer(player),
      ac: 10,
    }));
  const enemyPalette: PaletteItem[] = enemies
    .filter((enemy) => {
      const q = enemySearch.trim().toLowerCase();
      if (q && ![enemy.name, enemy.role, enemy.faction, enemy.baseMonsterName, ...(enemy.tags ?? [])].filter(Boolean).join(' ').toLowerCase().includes(q)) return false;
      if (enemyFilter !== 'all' && enemy.faction !== enemyFilter && !enemy.tags?.includes(enemyFilter)) return false;
      if (enemyRoleFilter !== 'all' && enemy.role !== enemyRoleFilter) return false;
      if (enemyLocationFilter !== 'all' && !(enemy.locationIds ?? []).includes(enemyLocationFilter)) return false;
      if (enemyQuestFilter !== 'all' && !(enemy.questIds ?? []).includes(enemyQuestFilter)) return false;
      if (!matchesEnemyFaction(enemy, enemyFactionFilter)) return false;
      if (enemyCrFilter !== 'all' && enemy.cr !== enemyCrFilter) return false;
      if (enemyTagFilter !== 'all' && !enemy.tags?.includes(enemyTagFilter)) return false;
      return true;
    })
    .map((enemy) => {
      const token = matchingTokenForEnemy(enemy);
      return {
        kind: 'enemy',
        sourceId: enemy.id,
        name: enemy.name,
        subtitle: [enemy.cr ? `CR ${enemy.cr}` : undefined, enemy.faction, enemy.role].filter(Boolean).join(' · '),
        imageSrc: token?.imageSourceUrl ?? imageForId(images, enemy.image) ?? '/tokens/enemies/enemy-bandit.svg',
        tokenDefinitionId: token?.id,
        speedFeet: parseSpeedFeet(enemy.speed) || token?.speedFeet || DEFAULT_SPEED_FEET,
        hp: enemy.hp ?? token?.maxHp ?? 8,
        ac: enemy.ac ?? token?.armorClass,
      } satisfies PaletteItem;
    });

  const imagePointFromClient = useCallback((clientX: number, clientY: number) => {
    const rect = boardRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: (clientX - rect.left - camera.x) / camera.scale,
      y: (clientY - rect.top - camera.y) / camera.scale,
    };
  }, [camera.scale, camera.x, camera.y]);

  function imagePointFromEvent(e: React.PointerEvent<HTMLElement>) {
    return imagePointFromClient(e.clientX, e.clientY);
  }

  function cellFromEvent(e: React.PointerEvent<HTMLElement>) {
    const point = imagePointFromEvent(e);
    return point ? cellFromImagePoint(grid, point.x, point.y) : null;
  }

  function cellFromClick(e: React.MouseEvent<HTMLElement>) {
    const point = imagePointFromClient(e.clientX, e.clientY);
    return point ? cellFromImagePoint(grid, point.x, point.y) : null;
  }

  const placePaletteItem = useCallback((item: PaletteItem, cell: BattleCell) => {
    if (terrainAt(terrainCells, cell)?.type === 'blocked' || tokenAt(battle.combatants, cell)) return;
    const player = item.kind === 'player' ? players.find((p) => p.id === item.sourceId) : undefined;
    const enemy = item.kind === 'enemy' ? enemies.find((e) => e.id === item.sourceId) : undefined;
    const combatant = player
      ? createCombatantFromPlayer(player, battle.combatants.length, cell)
      : enemy
        ? createCombatantFromEnemy(enemy, battle.combatants.length, cell, item.imageSrc)
        : null;
    if (!combatant) return;
    combatant.speedFeet = item.speedFeet;
    combatant.maxHp = item.hp;
    combatant.currentHp = item.hp;
    combatant.armorClass = item.ac;
    combatant.tokenDefinitionId = item.tokenDefinitionId;
    store.updateActiveBattle({
      combatants: [...battle.combatants, combatant],
      currentTurnCombatantId: battle.currentTurnCombatantId ?? combatant.id,
    });
    setSelectedId(combatant.id);
    setSelectedPalette(null);
    setHoverCell(null);
  }, [battle.combatants, battle.currentTurnCombatantId, enemies, players, store, terrainCells]);

  function nextTurn() {
    if (!ordered.length) return;
    const idx = Math.max(0, ordered.findIndex((c) => c.id === currentId));
    const next = ordered[(idx + 1) % ordered.length];
    store.updateActiveBattle({ currentTurnCombatantId: next.id, round: idx === ordered.length - 1 ? battle.round + 1 : battle.round });
    setSelectedId(next.id);
    setPostMovePrompt(null);
  }

  function moveSelectedTo(cell: BattleCell, force = false) {
    if (!selected || selected.row === undefined || selected.column === undefined) return;
    if (isPlayerView && selected.side !== 'player') return;
    if (force && isPlayerView) return;
    if (!force && !selectedCanAct) return;
    if (!force) {
      const planned = findRoute(terrainCells, grid, battle.combatants, selected, cell);
      if (planned.status !== 'valid') return;
    }
    store.updateActiveBattleCombatant(selected.id, { row: cell.row, column: cell.column });
    if (!force) setPostMovePrompt({ id: selected.id, name: selected.name });
  }

  function handleBoardPointerDown(e: React.PointerEvent<HTMLElement>) {
    if (!isPlayerView && selectedPalette && terrainEditMode === 'off' && !panTool) {
      const cell = cellFromEvent(e);
      if (cell) {
        placePaletteItem(selectedPalette, cell);
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }
    if (terrainEditMode !== 'off' && !isPlayerView) {
      const cell = cellFromEvent(e);
      if (cell) {
        updateTerrainCell(cell);
        setTerrainPainting(true);
        e.currentTarget.setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
    if (panTool || e.button === 1 || e.button === 2 || e.shiftKey || (e.currentTarget === e.target && !selectedPalette && terrainEditMode === 'off')) {
      setPanning({ x: e.clientX, y: e.clientY, sx: camera.x, sy: camera.y });
      e.currentTarget.setPointerCapture(e.pointerId);
    }
  }

  function updateTerrainCell(cell: BattleCell) {
    if (terrainEditMode === 'off' || isPlayerView) return false;
    const existing = terrainCells.find((t) => t.row === cell.row && t.column === cell.column);
    if (terrainEditMode === 'erase' && !existing) return true;
    if (terrainEditMode !== 'erase' && existing?.type === terrainEditMode) return true;
    const next = terrainCells.filter((t) => !(t.row === cell.row && t.column === cell.column));
    if (terrainEditMode !== 'erase') next.push({ row: cell.row, column: cell.column, type: terrainEditMode });
    store.updateActiveBattle({ terrainCells: next });
    return true;
  }

  function renderCombatCard(combatant: ActiveBattleCombatant, compact = false) {
    const sourceEnemy = enemyForCombatant(combatant);
    const sourcePlayer = combatant.side === 'player' ? players.find((p) => p.id === combatant.sourceId) : undefined;
    const isCurrent = combatant.id === currentId;
    const canEdit = !isPlayerView || combatant.side === 'player';
    const tokenImgSrc = tokenSrcForCombatant(combatant) ?? imageForId(images, combatant.imageId);
    const portraitSrc = sourceEnemy ? imageForId(images, sourceEnemy.image) : imageForId(images, sourcePlayer?.image ?? combatant.imageId);
    const enemyPlayerView = isPlayerView && combatant.side === 'enemy';
    return (
      <article key={combatant.id} className={`battle-combat-card${isCurrent ? ' battle-combat-card--current' : ''}`} onClick={() => setSelectedId(combatant.id)}>
        <div className="battle-combat-card__head">
          {tokenImgSrc ? <img src={tokenImgSrc} alt={combatant.name} /> : <span className="battle-token-fallback">{combatant.name[0]}</span>}
          <div>
            <strong>{combatant.name}</strong>
            <span>{combatant.side === 'enemy' ? 'враг' : sourcePlayer?.class ?? 'игрок'}</span>
          </div>
        </div>
        {!enemyPlayerView && (
          <div className="battle-stat-grid">
            <label>Иниц.<input type="number" value={combatant.initiative ?? ''} disabled={isPlayerView} onChange={(e) => store.updateActiveBattleCombatant(combatant.id, { initiative: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
            <label>HP<input type="number" value={combatant.currentHp} disabled={!canEdit} onChange={(e) => store.updateActiveBattleCombatant(combatant.id, { currentHp: Number(e.target.value) || 0 })} /></label>
            <label>MAX<input type="number" value={combatant.maxHp} disabled={!canEdit} onChange={(e) => store.updateActiveBattleCombatant(combatant.id, { maxHp: Number(e.target.value) || combatant.maxHp })} /></label>
            <label>AC<input type="number" value={combatant.armorClass ?? ''} disabled={isPlayerView} onChange={(e) => store.updateActiveBattleCombatant(combatant.id, { armorClass: e.target.value === '' ? undefined : Number(e.target.value) })} /></label>
            <label>Скор.<input type="number" value={combatant.speedFeet ?? DEFAULT_SPEED_FEET} disabled={!canEdit} onChange={(e) => store.updateActiveBattleCombatant(combatant.id, { speedFeet: Math.max(5, Number(e.target.value) || DEFAULT_SPEED_FEET) })} /></label>
          </div>
        )}
        {canEdit && <div className="battle-hp-actions">{[-5, -1, 1, 5].map((delta) => <button key={delta} type="button" onClick={(e) => { e.stopPropagation(); store.updateActiveBattleCombatant(combatant.id, { currentHp: hpDelta(combatant.currentHp, delta, combatant.maxHp) }); }}>{delta > 0 ? `+${delta}` : delta}</button>)}</div>}
        {!compact && sourceEnemy && !isPlayerView && (
          <div className="battle-enemy-full-card">
            {portraitSrc && <img className="battle-enemy-full-card__image" src={portraitSrc} alt={sourceEnemy.name} />}
            <p className="muted">{[sourceEnemy.cr ? `CR ${sourceEnemy.cr}` : '', sourceEnemy.ac ? `AC ${sourceEnemy.ac}` : '', sourceEnemy.hp ? `HP ${sourceEnemy.hp}` : '', sourceEnemy.speed].filter(Boolean).join(' · ')}</p>
            {sourceEnemy.lore && <p>{sourceEnemy.lore}</p>}
            {!!sourceEnemy.features?.length && <><h4>Особенности</h4>{sourceEnemy.features.map((f) => <p key={f.name}><strong>{f.name}</strong> — {f.description}</p>)}</>}
            {!!sourceEnemy.attacks?.length && <><h4>Атаки</h4>{sourceEnemy.attacks.map((a) => <p key={a.name}><strong>{a.name}</strong> {a.toHit ? String(a.toHit) : ''} {a.damage ? `· ${a.damage}` : ''} — {a.description}</p>)}</>}
            {sourceEnemy.tactics && <><h4>Тактика</h4><p>{sourceEnemy.tactics}</p></>}
            {sourceEnemy.dmNotes && <p className="muted">DM: {sourceEnemy.dmNotes}</p>}
          </div>
        )}
        {!compact && sourceEnemy && isPlayerView && (
          <>
            {portraitSrc && <img className="battle-enemy-full-card__image" src={portraitSrc} alt={sourceEnemy.name} />}
            <p className="muted">{sourceEnemy.lore ?? sourceEnemy.role ?? 'Враг'}</p>
          </>
        )}
      </article>
    );
  }

  const visibleCombatants = isPlayerView ? battle.combatants : battle.combatants;
  const selectedRouteFeet = route ? route.feet : 0;

  useEffect(() => {
    selectedPaletteRef.current = selectedPalette;
    terrainEditModeRef.current = terrainEditMode;
    panToolRef.current = panTool;
    isPlayerViewRef.current = isPlayerView;
  }, [isPlayerView, panTool, selectedPalette, terrainEditMode]);

  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    const onBoardClick = (event: MouseEvent) => {
      const item = selectedPaletteRef.current;
      if (isPlayerViewRef.current || !item || terrainEditModeRef.current !== 'off' || panToolRef.current) return;
      const point = imagePointFromClient(event.clientX, event.clientY);
      const cell = point ? cellFromImagePoint(grid, point.x, point.y) : null;
      if (!cell) return;
      event.preventDefault();
      event.stopPropagation();
      placePaletteItem(item, cell);
    };
    board.addEventListener('click', onBoardClick, true);
    return () => board.removeEventListener('click', onBoardClick, true);
  }, [grid, imagePointFromClient, placePaletteItem]);

  return (
    <div className="embedded-battle-backdrop">
      <div className="embedded-battle-window embedded-battle-window--vtt" role="dialog" aria-label="Карта битвы">
        <header className="embedded-battle-header">
          <div>
            <h2>{battle.title}</h2>
            <p className="muted">
              Раунд {battle.round} · {grid.columns}×{grid.rows} · {isPlayerView ? 'вид игроков' : 'вид ДМ'} · Ход: <strong>{currentCombatant?.name ?? 'не задан'}</strong>
            </p>
          </div>
          <div className="embedded-battle-toolbar">
            {!isPlayerView && (
              <select value={battle.variantType} onChange={(e) => store.updateActiveBattle({ variantType: e.target.value })}>
                {(variantOptions.length ? variantOptions : [{ type: 'day' }, { type: 'night' }]).map((variant) => (
                  <option key={variant.type} value={variant.type}>{battleVariantLabel(variant.type)}</option>
                ))}
              </select>
            )}
              <button type="button" className={showTerrain ? 'active' : ''} onClick={() => setShowTerrain((v) => !v)}>
                {showTerrain ? 'Скрыть terrain' : 'Показать terrain'}
              </button>
            {!isPlayerView && (
              <>
              <button type="button" className={panTool ? 'active' : ''} onClick={() => setPanTool((v) => !v)}>
                Рука
              </button>
              <select value={terrainEditMode} onChange={(e) => setTerrainEditMode(e.target.value as TerrainEditMode)}>
                <option value="off">Террейн: игра</option>
                <option value="blocked">Стена</option>
                <option value="difficult">Трудно</option>
                <option value="erase">Стереть</option>
              </select>
              </>
            )}
              <button type="button" onClick={fitCamera}>По размеру</button>
              <button type="button" disabled={!canPassTurn} onClick={nextTurn}>
                {canPassTurn ? 'Следующий ход' : 'Ход ДМ'}
              </button>
            {!isPlayerView && (
              <button type="button" className="btn-danger" onClick={store.endActiveBattle}>Закончить бой</button>
            )}
          </div>
        </header>

        <aside className="embedded-battle-side embedded-battle-side--left embedded-battle-palette">
          {isPlayerView ? (
            <>
              <h3>Игроки</h3>
              {battle.combatants.filter((c) => c.side === 'player').map((c) => renderCombatCard(c, true))}
            </>
          ) : (
            <>
              <h3>Расстановка</h3>
              <p className="muted">Выбери героя или врага, затем кликни по клетке.</p>
              <h4>Герои</h4>
              <div className="battle-palette-grid">
                {playerPalette.map((item) => (
                  <button key={item.sourceId} className={`battle-palette-card${selectedPalette?.sourceId === item.sourceId ? ' active' : ''}`} onClick={() => { setSelectedPalette(item); setSelectedId(undefined); setHoverCell(null); }}>
                    {item.imageSrc && <img src={item.imageSrc} alt="" />}<span>{item.name}</span>
                  </button>
                ))}
              </div>
              <h4>Враги</h4>
              <input className="battle-palette-search" placeholder="Поиск врага, тег, фракция..." value={enemySearch} onChange={(e) => setEnemySearch(e.target.value)} />
              <div className="battle-enemy-filter-grid">
                <select value={enemyLocationFilter} onChange={(e) => setEnemyLocationFilter(e.target.value)}>
                  <option value="all">Локация: все</option>
                  {enemyLocationOptions.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
                </select>
                <select value={enemyQuestFilter} onChange={(e) => setEnemyQuestFilter(e.target.value)}>
                  <option value="all">Квест: все</option>
                  {enemyQuestOptions.map((quest) => <option key={quest.id} value={quest.id}>{quest.title}</option>)}
                </select>
                <select value={enemyFactionFilter} onChange={(e) => setEnemyFactionFilter(e.target.value)}>
                  <option value="all">Сторона: все</option>
                  {enemyFactionOptions.map((faction) => <option key={faction.id} value={faction.id}>{faction.name}</option>)}
                </select>
                <select value={enemyCrFilter} onChange={(e) => setEnemyCrFilter(e.target.value)}>
                  <option value="all">CR: все</option>
                  {enemyCrOptions.map((cr) => <option key={cr} value={cr}>{cr}</option>)}
                </select>
                <select value={enemyTagFilter} onChange={(e) => setEnemyTagFilter(e.target.value)}>
                  <option value="all">Тег: все</option>
                  {enemyTagOptions.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
                </select>
                <select value={enemyRoleFilter} onChange={(e) => setEnemyRoleFilter(e.target.value)}>
                  <option value="all">Роль: все</option>
                  {enemyRoleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
                </select>
                <select value={enemyFilter} onChange={(e) => setEnemyFilter(e.target.value)}>
                  <option value="all">Группа: все</option>
                  {enemyGroups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
                <button
                  type="button"
                  onClick={() => {
                    setEnemySearch('');
                    setEnemyFilter('all');
                    setEnemyRoleFilter('all');
                    setEnemyLocationFilter('all');
                    setEnemyQuestFilter('all');
                    setEnemyFactionFilter('all');
                    setEnemyCrFilter('all');
                    setEnemyTagFilter('all');
                  }}
                >
                  Сброс
                </button>
              </div>
              <p className="muted battle-palette-count">Показано: {enemyPalette.length} / {enemies.length}</p>
              <div className="battle-enemy-palette-list">
                {enemyPalette.slice(0, 80).map((item) => (
                  <button key={item.sourceId} className={`battle-palette-card${selectedPalette?.sourceId === item.sourceId ? ' active' : ''}`} onClick={() => { setSelectedPalette(item); setSelectedId(undefined); setHoverCell(null); }}>
                    {item.imageSrc && <img src={item.imageSrc} alt="" />}
                    <span><strong>{item.name}</strong><small>{item.subtitle}</small></span>
                  </button>
                ))}
              </div>
              <h4>Инициатива</h4>
              <div className="battle-initiative-list">
                {ordered.map((combatant) => (
                  <button
                    key={combatant.id}
                    type="button"
                    className={`battle-initiative-row${combatant.id === currentId ? ' active' : ''}`}
                    onClick={() => {
                      setSelectedId(combatant.id);
                      setSelectedPalette(null);
                    }}
                  >
                    <span>{combatant.side === 'enemy' ? 'В' : 'И'}</span>
                    <strong>{combatant.name}</strong>
                    <input
                      type="number"
                      value={combatant.initiative ?? ''}
                      placeholder="иниц."
                      onClick={(e) => e.stopPropagation()}
                      onChange={(e) => store.updateActiveBattleCombatant(combatant.id, { initiative: e.target.value === '' ? undefined : Number(e.target.value) })}
                    />
                  </button>
                ))}
              </div>
            </>
          )}
        </aside>

        <main
          ref={boardRef}
          className={`embedded-battle-board embedded-battle-board--vtt embedded-battle-board--${battle.variantType}`}
          onWheel={(e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            setCamera((c) => ({ ...c, scale: Math.max(0.25, Math.min(4, c.scale * factor)) }));
          }}
          onPointerDown={handleBoardPointerDown}
          onClick={(e) => {
            if (isPlayerView || !selectedPalette || terrainEditMode !== 'off' || panTool) return;
            const cell = cellFromClick(e);
            if (cell) placePaletteItem(selectedPalette, cell);
          }}
          onContextMenu={(e) => e.preventDefault()}
          onPointerMove={(e) => {
            if (panning) {
              setCamera((c) => ({ ...c, x: panning.sx + e.clientX - panning.x, y: panning.sy + e.clientY - panning.y }));
              return;
            }
            if (terrainPainting) {
              const cell = cellFromEvent(e);
              setHoverCell(cell);
              if (cell) updateTerrainCell(cell);
              return;
            }
            setHoverCell(cellFromEvent(e));
          }}
          onPointerUp={(e) => {
            if (terrainPainting) {
              setTerrainPainting(false);
              return;
            }
            if (panning) {
              setPanning(null);
              return;
            }
            const cell = cellFromEvent(e);
            if (!cell) return;
            if (updateTerrainCell(cell)) return;
            if (!isPlayerView && selectedPalette) {
              placePaletteItem(selectedPalette, cell);
              return;
            }
            if (!isPlayerView && teleportMode) {
              moveSelectedTo(cell, true);
              setTeleportMode(false);
              return;
            }
            if (route?.status === 'valid' && selectedCanAct) moveSelectedTo(cell);
          }}
          onPointerLeave={() => {
            setTerrainPainting(false);
            setHoverCell(null);
          }}
        >
          <div className="embedded-battle-scene" style={{ width: grid.width, height: grid.height, transform: `translate(${camera.x}px, ${camera.y}px) scale(${camera.scale})` }}>
            {mapSrc ? <img className="embedded-battle-map-img" src={mapSrc} alt={battle.title} draggable={false} /> : <div className="embedded-battle-map-missing">Изображение карты не найдено</div>}
            <svg className="embedded-battle-svg" viewBox={`0 0 ${grid.width} ${grid.height}`}>
              {showTerrain && terrainCells.map((cell) => {
                const r = cellRect(grid, cell);
                return <rect key={`${cell.row}-${cell.column}-${cell.type}`} x={r.x} y={r.y} width={r.width} height={r.height} className={`battle-terrain battle-terrain--${cell.type}`} />;
              })}
              {!selectedPalette && selected && selectedCell && selectedCanAct && terrainEditMode === 'off' && Array.from({ length: Math.floor((selected.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL) * 2 + 1 }).flatMap((_, ri) => {
                const dr = ri - Math.floor((selected.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL);
                return Array.from({ length: Math.floor((selected.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL) * 2 + 1 }).map((__, ci) => {
                  const dc = ci - Math.floor((selected.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL);
                  const cell = { row: selectedCell.row + dr, column: selectedCell.column + dc };
                  if (cell.row < 0 || cell.column < 0 || cell.row >= grid.rows || cell.column >= grid.columns) return null;
                  if (Math.max(Math.abs(dr), Math.abs(dc)) > Math.floor((selected.speedFeet ?? DEFAULT_SPEED_FEET) / FEET_PER_CELL)) return null;
                  if (terrainAt(terrainCells, cell)?.type === 'blocked' || tokenAt(battle.combatants, cell, selected.id)) return null;
                  const r = cellRect(grid, cell);
                  return <rect key={`range-${cell.row}-${cell.column}`} x={r.x} y={r.y} width={r.width} height={r.height} className="battle-cell-range" />;
                });
              })}
              {route?.cells.map((cell, i) => {
                const center = cellCenter(grid, cell);
                if (i === 0) return null;
                const prev = cellCenter(grid, route.cells[i - 1]);
                return <line key={`route-${i}`} x1={prev.x} y1={prev.y} x2={center.x} y2={center.y} className={route.status === 'valid' ? 'battle-route-line' : 'battle-route-line battle-route-line--bad'} />;
              })}
            </svg>
            {visibleCombatants.filter((c) => c.row !== undefined && c.column !== undefined).map((combatant) => {
              const center = cellCenter(grid, { row: combatant.row!, column: combatant.column! });
              const isCurrent = combatant.id === currentId;
              const imgSrc = tokenSrcForCombatant(combatant) ?? imageForId(images, combatant.imageId);
              return (
                <button
                  key={combatant.id}
                  className={`embedded-battle-token embedded-battle-token--${combatant.side}${isCurrent ? ' embedded-battle-token--current' : ''}`}
                  style={{ left: center.x, top: center.y }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedId(combatant.id);
                    setSelectedPalette(null);
                  }}
                >
                  {imgSrc ? <img src={imgSrc} alt={combatant.name} /> : <span>{combatant.name[0]}</span>}
                </button>
              );
            })}
          </div>
          {route && <div className={`battle-route-hud battle-route-hud--${route.status}`}>{route.status === 'valid' ? `Маршрут: ${selectedRouteFeet} фт` : route.status === 'too-far' ? `Недостаточно движения: ${selectedRouteFeet} фт` : 'Маршрут недоступен'}</div>}
          {postMovePrompt && postMovePrompt.id === selected?.id && (
            <div className="battle-next-turn-popover">
              <strong>{postMovePrompt.name} сделал ход</strong>
              <span>Можно передать ход следующему участнику.</span>
              <button type="button" disabled={!canPassTurn} onClick={nextTurn}>
                Следующий юнит
              </button>
            </div>
          )}
        </main>

        <aside className="embedded-battle-side embedded-battle-side--right">
          <h3>{isPlayerView ? 'Карточка' : 'Карточка / инициатива'}</h3>
          {selected ? renderCombatCard(selected) : <p className="muted">Выберите токен на карте.</p>}
          {selected && !isPlayerView && (
            <div className="battle-selected-actions">
              <button type="button" onClick={() => setTeleportMode((v) => !v)}>{teleportMode ? 'Отменить телепорт' : 'Телепорт'}</button>
              <button type="button" onClick={() => store.updateActiveBattleCombatant(selected.id, { speedFeet: (selected.speedFeet ?? DEFAULT_SPEED_FEET) + 5 })}>+5 фт</button>
              <button type="button" onClick={() => store.updateActiveBattleCombatant(selected.id, { speedFeet: Math.max(5, (selected.speedFeet ?? DEFAULT_SPEED_FEET) - 5) })}>-5 фт</button>
              <button type="button" className="btn-danger" onClick={() => store.updateActiveBattle({ combatants: battle.combatants.filter((c) => c.id !== selected.id) })}>Удалить</button>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/**
 * Multi-hop pathfinding over the existing MapRoute/MapHotspot data, scoped to
 * a single WorldMapState (one arc/timeline+map combination — routes never
 * cross maps, see MapRoute.mapStateId).
 *
 * WHY THIS EXISTS: previously, if the DM tried to move the party between two
 * hotspots with no SINGLE MapRoute directly connecting them, the app fell
 * back to a direct/teleport move — drawing an implicit straight line that
 * could cut straight through walls, gates, districts, etc. (e.g. Docks →
 * Temple Quarter in a walled city like Greyholm). This module builds a graph
 * out of the routes/hotspots that already exist on a map and finds an actual
 * multi-segment path through them (Dijkstra). If no path exists in the real
 * network, callers MUST treat that as "no path" and must never silently draw
 * a straight line instead — see the critical rule below.
 *
 * CRITICAL RULE: a direct straight line between two arbitrary points must
 * NEVER be presented or used as a valid travel path by this module or its
 * callers. findPathBetweenLocations/findPathBetweenPoints return an EMPTY
 * array when no real route chain exists — that is the correct "no path"
 * result, not a bug to work around with a fallback line.
 *
 * Deliberately deferred this pass (see also the spec): forbidden-area
 * polygons. There is no MapPolygon-style type anywhere in src/types.ts yet
 * (see the inline-points convention used by MapRoute.points and
 * MapObjectPlacement.position), so we do not invent one here. The natural
 * extension point for "this area is impassable even off-road" would be a
 * `forbiddenAreas` check inside findNearestRouteNode's off-road search and
 * inside a future off-road edge builder in buildRouteGraph — left as a
 * comment there, not as a no-op field on RoutePathfindingOptions.
 */
import type { MapHotspot, MapRoute } from '../types';

export interface RouteGraphNode {
  id: string;
  position: { x: number; y: number };
  hotspotId?: string;
  routeId?: string;
  pointIndex?: number;
  kind: 'hotspot' | 'route_point' | 'intersection' | 'virtual_entry';
}

export interface RouteGraphEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  routeId: string;
  distance: number;
  status?: MapRoute['status'];
  dangerLevel?: MapRoute['dangerLevel'];
  blocked?: boolean;
}

export interface RouteGraph {
  nodes: Map<string, RouteGraphNode>;
  edges: RouteGraphEdge[];
  /** Adjacency list: nodeId -> indices into `edges` that start at that node. */
  adjacency: Map<string, number[]>;
  /** hotspotId -> graph node id, for quick hotspot-to-node lookup. */
  hotspotNodeIds: Map<string, string>;
}

export interface RoutePathfindingOptions {
  /**
   * Allows a short off-road "virtual" hop to the nearest graph node when the
   * given point isn't itself on the network (e.g. pathing from/to a raw map
   * click rather than a hotspot). Off-road hops are flagged via
   * RoutePathResult.isOffRoad and bounded by maxOffRoadDistance — they are
   * NOT a general-purpose straight-line fallback between two arbitrary
   * far-apart locations; see findNearestRouteNode.
   */
  allowOffRoad?: boolean;
  /** Normalized (0..1) distance cap for an off-road hop. Defaults to a small value. */
  maxOffRoadDistance?: number;
  /** Default true — routes with status 'blocked' are excluded from the graph. */
  avoidBlockedRoutes?: boolean;
  /** Default false — dangerous routes are usable but cost more and get flagged. */
  avoidDangerousRoutes?: boolean;
  /** Default false unless the caller is in a DM-only context. */
  allowHiddenRoutes?: boolean;
  // TODO(forbidden-areas): once a polygon/area type exists in src/types.ts,
  // plug an `forbiddenAreas` check in here and consult it inside
  // findNearestRouteNode's off-road search (and any future off-road edge
  // builder in buildRouteGraph) to reject hops that cross an impassable area.
}

export interface RoutePathSegment {
  routeId: string;
  fromNodeId: string;
  toNodeId: string;
  /** Oriented in the direction of travel for this segment. */
  points: Array<{ x: number; y: number }>;
  distance: number;
  status?: MapRoute['status'];
  dangerLevel?: MapRoute['dangerLevel'];
}

export interface RoutePathResult {
  segments: RoutePathSegment[];
  totalDistance: number;
  hasDangerousSegments: boolean;
  /** True if any portion used a virtual/off-road shortcut. Should basically
   * never be true unless allowOffRoad was explicitly requested. */
  isOffRoad: boolean;
  /** Russian-language warnings surfaced to the DM (e.g. dangerous segments). */
  warnings: string[];
}

const DEFAULT_MAX_OFF_ROAD_DISTANCE = 0.05;
const DANGEROUS_COST_MULTIPLIER = 3;

function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Builds an undirected graph from the routes/hotspots scoped to a single
 * WorldMapState. Each route with >=2 points AND both fromHotspotId/
 * toHotspotId set contributes a chain of nodes (hotspot endpoints +
 * intermediate route points) and edges between consecutive points.
 *
 * Excluded from the graph:
 * - routes with status 'blocked' (unless a future caller explicitly wants to
 *   inspect them — buildRouteGraph itself always excludes them; pathfinding
 *   never needs to see blocked edges since there is no avoidBlockedRoutes:false
 *   use case in this app yet, but the edge is still tagged `blocked: true`
 *   in case some future caller wants to render it differently).
 * - routes with status 'hidden', unless options.allowHiddenRoutes is true.
 * - routes with fewer than 2 points (nothing to walk).
 * - routes missing one or both hotspot endpoints: their internal points still
 *   get nodes/edges (so a partially-connected freehand scribble doesn't
 *   crash anything), but since neither endpoint resolves to a hotspot node,
 *   they can never be chosen as part of a hotspot-to-hotspot path — which is
 *   the correct behavior, not a bug.
 */
export function buildRouteGraph(
  routes: MapRoute[],
  hotspots: MapHotspot[],
  options?: { allowHiddenRoutes?: boolean },
): RouteGraph {
  const nodes = new Map<string, RouteGraphNode>();
  const edges: RouteGraphEdge[] = [];
  const adjacency = new Map<string, number[]>();
  const hotspotNodeIds = new Map<string, string>();

  function ensureHotspotNode(hotspotId: string): string {
    const existing = hotspotNodeIds.get(hotspotId);
    if (existing) return existing;
    const hotspot = hotspots.find((h) => h.id === hotspotId);
    const nodeId = `hotspot:${hotspotId}`;
    nodes.set(nodeId, {
      id: nodeId,
      position: hotspot ? { x: hotspot.x, y: hotspot.y } : { x: 0, y: 0 },
      hotspotId,
      kind: 'hotspot',
    });
    hotspotNodeIds.set(hotspotId, nodeId);
    return nodeId;
  }

  function addEdge(fromNodeId: string, toNodeId: string, route: MapRoute, segmentDistance: number) {
    const edge: RouteGraphEdge = {
      id: `edge:${route.id}:${fromNodeId}->${toNodeId}`,
      fromNodeId,
      toNodeId,
      routeId: route.id,
      distance: segmentDistance,
      status: route.status,
      dangerLevel: route.dangerLevel,
      blocked: route.status === 'blocked',
    };
    const idx = edges.length;
    edges.push(edge);
    const list = adjacency.get(fromNodeId) ?? [];
    list.push(idx);
    adjacency.set(fromNodeId, list);
  }

  for (const route of routes) {
    const pts = route.points;
    if (!pts || pts.length < 2) continue;
    if (route.status === 'blocked') continue; // never part of the traversable graph
    if (route.status === 'hidden' && !options?.allowHiddenRoutes) continue;
    if (!route.fromHotspotId || !route.toHotspotId) continue; // can't anchor a hotspot-to-hotspot leg

    // Build the node chain: hotspot(from) -> point[1..n-2] -> hotspot(to).
    const chainNodeIds: string[] = [];
    const fromNodeId = ensureHotspotNode(route.fromHotspotId);
    chainNodeIds.push(fromNodeId);
    for (let i = 1; i < pts.length - 1; i++) {
      const nodeId = `routept:${route.id}:${i}`;
      nodes.set(nodeId, {
        id: nodeId,
        position: pts[i],
        routeId: route.id,
        pointIndex: i,
        kind: 'route_point',
      });
      chainNodeIds.push(nodeId);
    }
    const toNodeId = ensureHotspotNode(route.toHotspotId);
    chainNodeIds.push(toNodeId);

    // Edges both directions (route travel is bidirectional unless future data
    // says otherwise — nothing in MapRoute currently models one-way travel).
    for (let i = 0; i < chainNodeIds.length - 1; i++) {
      const a = chainNodeIds[i];
      const b = chainNodeIds[i + 1];
      const segDist = dist(pts[i], pts[i + 1]);
      addEdge(a, b, route, segDist);
      addEdge(b, a, route, segDist);
    }
  }

  return { nodes, edges, adjacency, hotspotNodeIds };
}

/**
 * Finds the nearest graph node to an arbitrary point, for off-road entry
 * points (e.g. pathing from a raw map click). Returns null if nothing is
 * within maxOffRoadDistance or if allowOffRoad is false and the point isn't
 * exactly on an existing node.
 */
export function findNearestRouteNode(
  position: { x: number; y: number },
  graph: RouteGraph,
  options?: RoutePathfindingOptions,
): RouteGraphNode | null {
  const maxDist = options?.maxOffRoadDistance ?? DEFAULT_MAX_OFF_ROAD_DISTANCE;
  let best: RouteGraphNode | null = null;
  let bestDist = Infinity;
  for (const node of graph.nodes.values()) {
    const d = dist(position, node.position);
    if (d < bestDist) {
      bestDist = d;
      best = node;
    }
  }
  if (!best) return null;
  if (bestDist === 0) return best;
  if (!options?.allowOffRoad) return null;
  if (bestDist > maxDist) return null;
  return best;
}

interface DijkstraResult {
  distances: Map<string, number>;
  previous: Map<string, { nodeId: string; edge: RouteGraphEdge } | null>;
}

/** Hand-written Dijkstra over the graph's adjacency list — no external graph
 * library needed for a network this small. Uses a simple array-backed
 * priority queue (fine at this scale; a binary heap would be premature). */
function dijkstra(
  graph: RouteGraph,
  startNodeId: string,
  options: RoutePathfindingOptions,
): DijkstraResult {
  const distances = new Map<string, number>();
  const previous = new Map<string, { nodeId: string; edge: RouteGraphEdge } | null>();
  const visited = new Set<string>();

  for (const nodeId of graph.nodes.keys()) {
    distances.set(nodeId, Infinity);
    previous.set(nodeId, null);
  }
  distances.set(startNodeId, 0);

  // Simple array-backed priority queue: O(n log n) overall for graphs this
  // small (a handful to a few dozen nodes per map) — a binary heap would be
  // overkill here.
  const queue: string[] = [startNodeId];

  while (queue.length > 0) {
    queue.sort((a, b) => (distances.get(a) ?? Infinity) - (distances.get(b) ?? Infinity));
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);

    const currentDist = distances.get(current) ?? Infinity;
    if (currentDist === Infinity) continue;

    const edgeIndices = graph.adjacency.get(current) ?? [];
    for (const idx of edgeIndices) {
      const edge = graph.edges[idx];
      if (options.avoidBlockedRoutes !== false && edge.blocked) continue;
      const isDangerous =
        edge.dangerLevel === 'dangerous' || edge.dangerLevel === 'deadly' || edge.status === 'dangerous';
      if (options.avoidDangerousRoutes && isDangerous) continue;

      const cost = edge.distance * (isDangerous ? DANGEROUS_COST_MULTIPLIER : 1);
      const candidate = currentDist + cost;
      if (candidate < (distances.get(edge.toNodeId) ?? Infinity)) {
        distances.set(edge.toNodeId, candidate);
        previous.set(edge.toNodeId, { nodeId: current, edge });
        if (!visited.has(edge.toNodeId)) queue.push(edge.toNodeId);
      }
    }
  }

  return { distances, previous };
}

function reconstructPath(
  result: DijkstraResult,
  graph: RouteGraph,
  startNodeId: string,
  endNodeId: string,
): RoutePathResult | null {
  if ((result.distances.get(endNodeId) ?? Infinity) === Infinity) return null;
  const edgesUsed: RouteGraphEdge[] = [];
  let cur = endNodeId;
  while (cur !== startNodeId) {
    const prev = result.previous.get(cur);
    if (!prev) return null;
    edgesUsed.unshift(prev.edge);
    cur = prev.nodeId;
  }

  const segments: RoutePathSegment[] = edgesUsed.map((edge) => {
    const fromNode = graph.nodes.get(edge.fromNodeId);
    const toNode = graph.nodes.get(edge.toNodeId);
    return {
      routeId: edge.routeId,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      points: [fromNode?.position ?? { x: 0, y: 0 }, toNode?.position ?? { x: 0, y: 0 }],
      distance: edge.distance,
      status: edge.status,
      dangerLevel: edge.dangerLevel,
    };
  });

  // Merge consecutive segments that share the same routeId into one segment
  // with the full point chain, so callers animate smoothly along each real
  // MapRoute instead of stuttering edge-by-edge.
  const merged: RoutePathSegment[] = [];
  for (const seg of segments) {
    const last = merged[merged.length - 1];
    if (last && last.routeId === seg.routeId && last.toNodeId === seg.fromNodeId) {
      last.toNodeId = seg.toNodeId;
      last.distance += seg.distance;
      const nextPoint = seg.points[seg.points.length - 1];
      last.points.push(nextPoint);
    } else {
      merged.push({ ...seg, points: [...seg.points] });
    }
  }

  const warnings: string[] = [];
  let hasDangerousSegments = false;
  for (const seg of merged) {
    const isDangerous = seg.dangerLevel === 'dangerous' || seg.dangerLevel === 'deadly' || seg.status === 'dangerous';
    if (isDangerous) {
      hasDangerousSegments = true;
      warnings.push('Путь проходит через опасный участок маршрута.');
    }
  }

  const totalDistance = merged.reduce((sum, s) => sum + s.distance, 0);

  return {
    segments: merged,
    totalDistance,
    hasDangerousSegments,
    isOffRoad: false,
    warnings,
  };
}

function defaultOptions(options?: RoutePathfindingOptions): RoutePathfindingOptions {
  return {
    allowOffRoad: false,
    maxOffRoadDistance: DEFAULT_MAX_OFF_ROAD_DISTANCE,
    avoidBlockedRoutes: true,
    avoidDangerousRoutes: false,
    allowHiddenRoutes: false,
    ...options,
  };
}

/**
 * Finds the best path(s) between two hotspots using only routes that
 * actually exist in the graph. Returns an EMPTY array if no path exists —
 * callers must treat that as "no valid path" and must never fall back to a
 * straight line between the hotspots.
 *
 * Returns more than one result only when a genuinely distinct second-best
 * path exists within a small margin of the best path's cost (no manufactured
 * alternatives) — for most maps this returns a single-element array.
 */
export function findPathBetweenLocations(
  fromHotspotId: string,
  toHotspotId: string,
  graph: RouteGraph,
  options?: RoutePathfindingOptions,
): RoutePathResult[] {
  const opts = defaultOptions(options);
  const startNodeId = graph.hotspotNodeIds.get(fromHotspotId);
  const endNodeId = graph.hotspotNodeIds.get(toHotspotId);
  if (!startNodeId || !endNodeId) return [];
  if (startNodeId === endNodeId) return [];

  const best = dijkstra(graph, startNodeId, opts);
  const bestPath = reconstructPath(best, graph, startNodeId, endNodeId);
  if (!bestPath) return [];

  const results: RoutePathResult[] = [bestPath];

  // Look for a genuinely distinct second-best path: re-run Dijkstra with the
  // best path's first edge removed (cheap, sound way to surface an
  // alternative without manufacturing a fake one) and only keep it if its
  // cost is within a small margin of the best path.
  const firstSeg = bestPath.segments[0];
  if (firstSeg) {
    const prunedGraph: RouteGraph = {
      ...graph,
      adjacency: new Map(graph.adjacency),
    };
    const fromAdj = (prunedGraph.adjacency.get(firstSeg.fromNodeId) ?? []).filter(
      (idx) => !(graph.edges[idx].routeId === firstSeg.routeId && graph.edges[idx].toNodeId === firstSeg.toNodeId),
    );
    prunedGraph.adjacency.set(firstSeg.fromNodeId, fromAdj);
    const alt = dijkstra(prunedGraph, startNodeId, opts);
    const altPath = reconstructPath(alt, prunedGraph, startNodeId, endNodeId);
    if (altPath && altPath.totalDistance <= bestPath.totalDistance * 1.35) {
      results.push(altPath);
    }
  }

  return results;
}

/** Same contract as findPathBetweenLocations — kept as a separate exported
 * name per the module's public contract; simply delegates. */
export function findRoutePathByHotspots(
  fromHotspotId: string,
  toHotspotId: string,
  graph: RouteGraph,
  options?: RoutePathfindingOptions,
): RoutePathResult[] {
  return findPathBetweenLocations(fromHotspotId, toHotspotId, graph, options);
}

/**
 * Same as findPathBetweenLocations but for arbitrary points (e.g. a raw map
 * click) rather than hotspot ids — snaps each point to the nearest graph
 * node via findNearestRouteNode (bounded off-road hop) before pathfinding.
 * Returns an empty array if either point can't reach the network or if no
 * path exists between the resulting nodes.
 */
export function findPathBetweenPoints(
  fromPoint: { x: number; y: number },
  toPoint: { x: number; y: number },
  graph: RouteGraph,
  options?: RoutePathfindingOptions,
): RoutePathResult[] {
  const opts = defaultOptions(options);
  const startNode = findNearestRouteNode(fromPoint, graph, opts);
  const endNode = findNearestRouteNode(toPoint, graph, opts);
  if (!startNode || !endNode) return [];
  if (startNode.id === endNode.id) return [];

  const best = dijkstra(graph, startNode.id, opts);
  const bestPath = reconstructPath(best, graph, startNode.id, endNode.id);
  if (!bestPath) return [];

  const usedOffRoad = dist(fromPoint, startNode.position) > 0 || dist(toPoint, endNode.position) > 0;
  return [{ ...bestPath, isOffRoad: usedOffRoad }];
}

/**
 * Small, pure helpers for reasoning about a MapRoute's drawability/validity
 * and (eventually) travel distance/duration. Nothing here mutates state or
 * touches the overlay — these are read-only projections used by the route
 * panel UI and the Travel Panel foundation (Etap G).
 *
 * IMPORTANT: party movement (teleport-vs-walk) requires BOTH fromHotspotId
 * and toHotspotId to be set on a route — see MapWorkspacePage.tsx's
 * startDrawingNewRoute() for the bug this enforces against (a route created
 * with empty-string endpoints can never be matched by the travel logic and
 * silently falls back to a direct teleport).
 */
import type { MapRoute, MapScaleConfig } from '../types';

export function getRoutePointCount(route: MapRoute | undefined | null): number {
  return route?.points?.length ?? 0;
}

/** True once a route has real waypoints drawn (>=2 points) — i.e. there is an
 * actual polyline to walk, as opposed to just metadata with no path yet. */
export function isRouteDrawable(route: MapRoute | undefined | null): boolean {
  return getRoutePointCount(route) >= 2;
}

/**
 * True when a route is fully usable for party movement: both endpoints are
 * set AND at least 2 points exist. This is exactly the condition the travel
 * logic in MapWorkspacePage.tsx checks before walking the marker instead of
 * teleporting it.
 */
export function isRouteValid(route: MapRoute | undefined | null): boolean {
  if (!route) return false;
  return !!route.fromHotspotId && !!route.toHotspotId && isRouteDrawable(route);
}

export function getRouteValidationWarnings(route: MapRoute | undefined | null): string[] {
  if (!route) return ['Маршрут не найден'];
  const warnings: string[] = [];
  if (!route.fromHotspotId || !route.toHotspotId) {
    warnings.push('Не заданы начальная и/или конечная точка — партия не сможет идти по этому маршруту, перемещение будет прямым.');
  }
  if (!isRouteDrawable(route)) {
    warnings.push('Путь не размечен (меньше двух точек) — нужно нарисовать маршрут по карте.');
  }
  return warnings;
}

/**
 * Sums the Euclidean length of the route's normalized (0..1) point sequence.
 * This is a unitless number — useful only for relative comparison between
 * routes on the SAME map, never as a real-world distance unless a scale is
 * supplied (see estimateRouteDistanceKm). Returns 0 for routes with <2 points.
 */
export function calculateRouteNormalizedDistance(route: MapRoute | undefined | null): number {
  const pts = route?.points;
  if (!pts || pts.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i].x - pts[i - 1].x;
    const dy = pts[i].y - pts[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  return total;
}

/**
 * Converts normalized route distance to kilometers ONLY if a map scale
 * (km represented by the full normalized-distance unit "1.0" across the map)
 * is explicitly supplied. We never invent a scale — if none is given, callers
 * should display "масштаб карты не задан" rather than fabricate a number.
 */
export function estimateRouteDistanceKm(route: MapRoute | undefined | null, mapScaleKmPerUnit?: number): number | null {
  if (!mapScaleKmPerUnit || mapScaleKmPerUnit <= 0) return null;
  const normalized = calculateRouteNormalizedDistance(route);
  if (normalized <= 0) return null;
  return normalized * mapScaleKmPerUnit;
}

/** Travel speed presets in km/day, for the Travel Panel foundation (Etap G).
 * Rough table-top-friendly defaults — not derived from any specific rules
 * system, intentionally conservative/generic. */
export const TRAVEL_SPEED_PRESETS = {
  walk_slow: { label: 'Пешком (медленно)', kmPerDay: 20 },
  walk_normal: { label: 'Пешком (обычно)', kmPerDay: 30 },
  walk_fast: { label: 'Пешком (быстро)', kmPerDay: 40 },
  horse: { label: 'Верхом', kmPerDay: 50 },
  caravan: { label: 'Караван', kmPerDay: 20 },
  army: { label: 'Армия/отряд', kmPerDay: 15 },
} as const;

export type TravelSpeedPresetKey = keyof typeof TRAVEL_SPEED_PRESETS;

/** Returns rough days-of-travel for a known distance, or null if either input is unknown. */
export function estimateTravelDays(distanceKm: number | null, presetKey: TravelSpeedPresetKey): number | null {
  if (distanceKm === null || distanceKm <= 0) return null;
  const preset = TRAVEL_SPEED_PRESETS[presetKey];
  return distanceKm / preset.kmPerDay;
}

// ---------- Time + Travel Engine MVP ----------

/**
 * Resolves a route's real-world distance using, in priority order: (1) an
 * explicit `route.distanceKm` the DM typed in directly (always wins — it's
 * an explicit override), (2) the map's `scale` config converting the route's
 * normalized polyline length, (3) null ("масштаб карты не задан" — never a
 * fabricated number). This is the single source of truth the Travel Panel,
 * the route list, and the staged-travel advancement below all read from.
 */
export function getRouteDistanceKm(route: MapRoute | undefined | null, scale: MapScaleConfig | undefined): number | null {
  if (!route) return null;
  if (route.distanceKm !== undefined) return route.distanceKm;
  if (!scale || scale.distancePerNormalizedUnit <= 0) return null;
  const normalized = calculateRouteNormalizedDistance(route);
  if (normalized <= 0) return null;
  return normalized * scale.distancePerNormalizedUnit;
}

/** 1 day = 4 phases (morning/noon/evening/night) — see TimeOfDay in types.ts. */
export const PHASES_PER_DAY = 4;

export interface RouteTravelEstimate {
  /** Real km, or null if no scale/override is configured ("scale missing"). */
  distanceKm: number | null;
  normalizedDistance: number;
  /** True when distanceKm is null purely because no scale exists (as opposed
   * to the route having no points at all) — drives the "масштаб карты не
   * задан" warning specifically. */
  scaleMissing: boolean;
  estimatedDays: number | null;
  estimatedPhases: number | null;
}

export function getRouteTravelEstimate(
  route: MapRoute | undefined | null,
  scale: MapScaleConfig | undefined,
  kmPerDay: number,
): RouteTravelEstimate {
  const normalizedDistance = calculateRouteNormalizedDistance(route);
  const distanceKm = getRouteDistanceKm(route, scale);
  const scaleMissing = distanceKm === null && normalizedDistance > 0;
  const estimatedDays = distanceKm !== null && distanceKm > 0 && kmPerDay > 0 ? distanceKm / kmPerDay : null;
  const estimatedPhases = estimatedDays !== null ? estimatedDays * PHASES_PER_DAY : null;
  return { distanceKm, normalizedDistance, scaleMissing, estimatedDays, estimatedPhases };
}

export interface RoutePosition {
  segmentIndex: number;
  segmentProgress: number;
  position: { x: number; y: number };
  completed: boolean;
}

/**
 * Walks forward along a route's polyline by `normalizedDistanceDelta` (same
 * unit as calculateRouteNormalizedDistance), starting from an existing
 * (segmentIndex, segmentProgress) position. The result's `position` is
 * always interpolated ON the polyline — there is no straight-line shortcut
 * between the start and end points, exactly like the existing
 * partyTravelAnim per-segment walk in MapWorkspacePage.tsx. Clamps at the
 * final point and sets `completed: true` once the whole route is walked.
 * A negative delta is rejected (returns the unchanged start position) —
 * this MVP only walks forward; backtracking is "Stop here" + manually
 * restarting, not a supported rewind.
 */
export function advanceAlongRoute(
  points: Array<{ x: number; y: number }>,
  fromSegmentIndex: number,
  fromSegmentProgress: number,
  normalizedDistanceDelta: number,
): RoutePosition {
  if (points.length < 2) {
    return { segmentIndex: 0, segmentProgress: 0, position: points[0] ?? { x: 0, y: 0 }, completed: true };
  }
  let segIdx = Math.min(Math.max(fromSegmentIndex, 0), points.length - 2);
  let segProgress = Math.min(Math.max(fromSegmentProgress, 0), 1);
  let remaining = Math.max(normalizedDistanceDelta, 0);

  while (remaining > 0) {
    const a = points[segIdx];
    const b = points[segIdx + 1];
    const segLength = Math.sqrt((b.x - a.x) ** 2 + (b.y - a.y) ** 2);
    const remainingInSegment = segLength * (1 - segProgress);
    if (remaining < remainingInSegment || segLength === 0) {
      segProgress += segLength > 0 ? remaining / segLength : 0;
      remaining = 0;
      break;
    }
    remaining -= remainingInSegment;
    if (segIdx >= points.length - 2) {
      // Reached the final point — clamp here, never overshoot past the route end.
      return { segmentIndex: points.length - 2, segmentProgress: 1, position: points[points.length - 1], completed: true };
    }
    segIdx += 1;
    segProgress = 0;
  }

  const a = points[segIdx];
  const b = points[segIdx + 1];
  const position = { x: a.x + (b.x - a.x) * segProgress, y: a.y + (b.y - a.y) * segProgress };
  return { segmentIndex: segIdx, segmentProgress: segProgress, position, completed: false };
}

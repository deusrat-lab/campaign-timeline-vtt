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
import type { MapRoute } from '../types';

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

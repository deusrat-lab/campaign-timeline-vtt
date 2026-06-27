/**
 * Restricted/Impassable Zones MVP — route-vs-zone geometry validation.
 *
 * Pure functions only: nothing here mutates the store or reads pixels off the
 * background map image. All geometry is done in the same normalized 0..1
 * `MapPoint` space already used for hotspots/routes/zone polygons elsewhere
 * (see MapWorkspacePage.tsx's `activeMapImageSize` conversion — that scaling
 * happens only at render time, never here), so this validation is correct
 * regardless of zoom/pan/letterboxing.
 *
 * Callers (MapWorkspacePage.tsx) are expected to pre-filter `zones` to the
 * route's own arcId/mapId scope (mirrors how `factionZonesForMap`/`routes`
 * are already scoped) — this module does not check timelineId/mapId itself,
 * to avoid depending on the page's specific scoping fields.
 */
import type { FactionZone, MapRoute } from '../types';

export interface MapPoint {
  x: number;
  y: number;
}

export type RouteValidationIssueType =
  | 'missing_points'
  | 'missing_name'
  | 'crosses_blocking_zone'
  | 'point_inside_blocking_zone'
  | 'crosses_danger_zone'
  | 'outside_map_bounds'
  | 'wrong_map'
  | 'wrong_arc';

export interface RouteValidationIssue {
  type: RouteValidationIssueType;
  severity: 'info' | 'warning' | 'error';
  segmentIndex?: number;
  pointIndex?: number;
  zoneId?: string;
  message: string;
}

export interface RouteValidationResult {
  routeId: string;
  status: 'valid' | 'warning' | 'invalid';
  issues: RouteValidationIssue[];
}

/** Ray-casting point-in-polygon test. Points exactly on an edge are treated
 * as outside (consistent, simple — good enough for an MVP warning system). */
export function isPointInPolygon(point: MapPoint, polygon: MapPoint[]): boolean {
  if (polygon.length < 3) return false;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersects =
      yi > point.y !== yj > point.y &&
      point.x < ((xj - xi) * (point.y - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/** Standard segment-segment intersection (excluding pure endpoint touches),
 * used to detect a route leg crossing a polygon edge. */
function segmentsIntersect(p1: MapPoint, p2: MapPoint, p3: MapPoint, p4: MapPoint): boolean {
  const d1x = p2.x - p1.x, d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x, d2y = p4.y - p3.y;
  const denom = d1x * d2y - d1y * d2x;
  if (denom === 0) return false; // parallel/collinear — ignore for MVP
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / denom;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / denom;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

/** True if the segment a→b crosses the polygon boundary OR either endpoint
 * lies inside it — the two ways a route leg can interact with a zone. */
export function doesSegmentIntersectPolygon(a: MapPoint, b: MapPoint, polygon: MapPoint[]): boolean {
  if (polygon.length < 3) return false;
  if (isPointInPolygon(a, polygon) || isPointInPolygon(b, polygon)) return true;
  for (let i = 0; i < polygon.length; i++) {
    const p3 = polygon[i];
    const p4 = polygon[(i + 1) % polygon.length];
    if (segmentsIntersect(a, b, p3, p4)) return true;
  }
  return false;
}

function zoneBlocksRoute(zone: FactionZone, route: MapRoute): boolean {
  if (!zone.blocksPartyMovement) return false;
  if (!zone.blocksRouteTypes || zone.blocksRouteTypes.length === 0) return true;
  return zone.blocksRouteTypes.includes(route.routeType);
}

/**
 * Validates a single route's points against every zone passed in (caller
 * already scoped `zones` to the route's map/arc). Severity rules follow the
 * spec exactly: impassable/restricted with blocksPartyMovement => error;
 * danger/increasesTravelRisk => warning; everything else informational only.
 * `status === 'hidden'` (DM-only) zones still participate — a hidden trap
 * zone should still block/warn the DM, it's only hidden from PLAYERS (see
 * playerSafeProjection.ts), never invisible to validation logic itself.
 */
export function validateRouteAgainstZones(route: MapRoute, zones: FactionZone[]): RouteValidationResult {
  const issues: RouteValidationIssue[] = [];
  const points = route.points ?? [];

  if (points.length < 2) {
    issues.push({
      type: 'missing_points',
      severity: 'warning',
      message: 'Маршрут не размечен (меньше двух точек) — проверка зон по геометрии невозможна.',
    });
    return { routeId: route.id, status: 'warning', issues };
  }

  const activeZones = zones.filter((z) => z.polygon.length >= 3);

  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    for (const zone of activeZones) {
      if (!doesSegmentIntersectPolygon(a, b, zone.polygon)) continue;
      const aInside = isPointInPolygon(a, zone.polygon);
      const bInside = isPointInPolygon(b, zone.polygon);
      const issueType: RouteValidationIssueType = aInside || bInside ? 'point_inside_blocking_zone' : 'crosses_blocking_zone';

      if (zoneBlocksRoute(zone, route)) {
        issues.push({
          type: issueType,
          severity: 'error',
          segmentIndex: i,
          pointIndex: aInside ? i : bInside ? i + 1 : undefined,
          zoneId: zone.id,
          message: `Маршрут пересекает непроходимую/запретную зону «${zone.name}» (сегмент ${i + 1}).`,
        });
      } else if (zone.increasesTravelRisk || zone.type === 'danger') {
        issues.push({
          type: 'crosses_danger_zone',
          severity: 'warning',
          segmentIndex: i,
          zoneId: zone.id,
          message: `Маршрут проходит через опасную зону «${zone.name}» (сегмент ${i + 1}) — повышенный риск, движение не блокируется.`,
        });
      } else if (zone.travelCostMultiplier && zone.travelCostMultiplier !== 1) {
        issues.push({
          type: 'crosses_danger_zone',
          severity: 'info',
          segmentIndex: i,
          zoneId: zone.id,
          message: `Маршрут проходит через зону «${zone.name}» — множитель времени в пути ×${zone.travelCostMultiplier}.`,
        });
      } else {
        issues.push({
          type: 'crosses_danger_zone',
          severity: 'info',
          segmentIndex: i,
          zoneId: zone.id,
          message: `Маршрут проходит через зону «${zone.name}».`,
        });
      }
    }
  }

  const hasError = issues.some((iss) => iss.severity === 'error');
  const hasWarning = issues.some((iss) => iss.severity === 'warning');
  const status: RouteValidationResult['status'] = hasError ? 'invalid' : hasWarning ? 'warning' : 'valid';
  return { routeId: route.id, status, issues };
}

/** Convenience: every zone (from a validation result) that has at least one
 * blocking ('error') issue, deduplicated — used by the party-movement guard
 * and the route panel's "Затронутые зоны" list. */
export function getBlockingZoneIds(result: RouteValidationResult): string[] {
  return Array.from(new Set(result.issues.filter((i) => i.severity === 'error' && i.zoneId).map((i) => i.zoneId!)));
}

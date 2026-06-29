import type { MouseEvent } from 'react';

/**
 * Pure presentational extraction of the party's on-map marker from
 * MapWorkspacePage's map canvas. Renders nothing if there's no resting point
 * to show (caller already guards `partyHotspot && partyMarkerPoint` before
 * mounting this). All animation/position math (partyTravelAnim stepping,
 * route-endpoint snapping) stays in MapWorkspacePage — this component only
 * ever renders whichever single {x,y} point it's given.
 */
export interface PartyMarkerProps {
  /** The point to render right now — either the live walk-animation point or
   * the resting partyMarkerPoint; the caller decides which each render. */
  point: { x: number; y: number };
  /** True while a route-walk animation is actively stepping (adds the CSS
   * transition class so the marker glides between points). */
  isWalking: boolean;
  /** Label of the route currently associated with the party, if any —
   * purely for the marker's title/tooltip text. */
  activeRouteLabel?: string;
  onMouseDown?: (e: MouseEvent<HTMLDivElement>) => void;
  onClick?: (e: MouseEvent<HTMLDivElement>) => void;
}

export function PartyMarker({ point, isWalking, activeRouteLabel, onMouseDown, onClick }: PartyMarkerProps) {
  return (
    <div
      className={`party-map-marker${isWalking ? ' party-map-marker-walking' : ''}`}
      style={{ left: `${point.x * 100}%`, top: `${point.y * 100}%` }}
      title={activeRouteLabel ? `Партия — идёт по маршруту «${activeRouteLabel}»` : 'Партия сейчас здесь'}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      <span className="party-map-marker-icon" aria-hidden="true">⚑</span>
      <span className="party-map-marker-label">Партия</span>
    </div>
  );
}

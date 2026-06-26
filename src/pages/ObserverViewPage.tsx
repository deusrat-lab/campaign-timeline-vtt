/**
 * Observer MVP (Etap C) — a full-screen, read-only map view meant for a
 * second screen/TV the players can see. No NavRail, no NavBar, no edit
 * controls, no DM notes panel. Renders ONLY the Player Safe Projection
 * (src/data/playerSafeProjection.ts) of whichever map/timeline the DM is
 * currently on, plus the party token if it's safe to show. Never mutates any
 * runtime state — every store call this page would need (setCurrentLocation,
 * patch*, add*) is intentionally absent from this file.
 *
 * Sync: the DM-side MapWorkspacePage can broadcast its current view via the
 * 'campaign-timeline-vtt:observer' BroadcastChannel (see
 * useObserverBroadcastChannel.ts) — this page listens and refocuses
 * accordingly. If the DM side never posts anything, Observer still works
 * fine on its own by reading the same localStorage-backed campaign store
 * (CampaignStoreProvider/CampaignDataProvider wrap the whole app in
 * App.tsx), it just won't auto-follow the DM's camera/selection — a manual
 * refresh (or any local store mutation, e.g. switching timeline from another
 * open DM tab that also posts) is enough to pick up new overlay data because
 * each tab reads localStorage fresh on its own.
 */
import { useEffect, useState } from 'react';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import {
  getPlayerSafeHotspots,
  getPlayerSafeRoutes,
  getPlayerSafePlacements,
  getPlayerSafeEvents,
  getPlayerSafeFactionZones,
  getPlayerSafeBattleEntries,
} from '../data/playerSafeProjection';
import { getLocationState, isLocationVisibleToPlayers } from '../data/selectors';
import {
  OBSERVER_CHANNEL_NAME,
  type ObserverBroadcastMessage,
} from './map-workspace/observerBroadcast';

export function ObserverViewPage() {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();

  // Local-only camera/focus state driven by BroadcastChannel messages from
  // the DM tab. Never written back anywhere — Observer is strictly a reader.
  const [focus, setFocus] = useState<ObserverBroadcastMessage | null>(null);

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(OBSERVER_CHANNEL_NAME);
    channel.onmessage = (e: MessageEvent<ObserverBroadcastMessage>) => setFocus(e.data);
    return () => channel.close();
  }, []);

  if (loading) return <div className="observer-shell observer-loading">Загрузка…</div>;
  if (error || !data) return <div className="observer-shell observer-loading">Ошибка загрузки: {error}</div>;

  const timelineId = focus?.timelineId ?? store.currentTimelineId;
  const scope = focus?.scope ?? 'city';
  const map = data.worldMaps.find((m) => m.scope === scope);
  const mapState = map ? data.worldMapStates.find((ms) => ms.mapId === map.id && ms.timelineId === timelineId) : undefined;

  const hotspotsRaw = mapState ? data.hotspots.filter((h) => mapState.hotspotIds.includes(h.id)) : [];
  const routesRaw = mapState ? data.routes.filter((r) => r.mapStateId === mapState.id) : [];
  const placementsRaw = map
    ? data.placements.filter(
        (p) => p.mapLevel === scope && (!p.mapId || p.mapId === map.id) && p.status !== 'archived',
      )
    : [];

  const hotspots = getPlayerSafeHotspots(data, store.progress, hotspotsRaw);
  const routes = getPlayerSafeRoutes(routesRaw);
  const placements = getPlayerSafePlacements(placementsRaw);

  // Faction Zones (Stage 4A) — Observer must NEVER read store.factionZonesById
  // directly; this is the only call site, exactly like eventsById above.
  const factionZonesRaw = mapState
    ? Object.values(store.factionZonesById).filter(
        (z) => z.timelineId === timelineId && (!z.mapLevel || z.mapLevel === scope) && (!z.mapId || !map || z.mapId === map.id),
      )
    : [];
  const factionZones = getPlayerSafeFactionZones(factionZonesRaw);

  // Player-visible CampaignEvents (Stage 3 closing pass) — ALWAYS sourced
  // from getPlayerSafeEvents(); Observer must never read store.eventsById
  // directly. Events with a position are placed as map markers; events with
  // no position (can't be placed on the map shell) fall back to a small
  // list below the map.
  const eventsRaw = Object.values(store.eventsById).filter(
    (ev) => ev.timelineId === timelineId && (!ev.mapLevel || ev.mapLevel === scope) && (!ev.mapId || !map || ev.mapId === map.id),
  );
  const playerSafeEvents = getPlayerSafeEvents(eventsRaw);
  const eventsWithPosition = playerSafeEvents.filter((ev) => !!ev.position);
  const eventsWithoutPosition = playerSafeEvents.filter((ev) => !ev.position);

  // Battle Entries (Stage 5A, Step 13) — Observer must NEVER read
  // store.battleEntriesById directly; this is the only call site, exactly
  // like factionZonesRaw/eventsRaw above. No launch button anywhere here —
  // Observer is strictly read-only by architecture (see file-level comment),
  // and getPlayerSafeBattleEntries() already strips linkedEnemyIds,
  // encounterPresetIds, dmNotes, and battleMapId/battleMapUrl/variant launch
  // wiring, so there is nothing launch-related left to accidentally expose.
  const battleEntriesRaw = mapState
    ? Object.values(store.battleEntriesById).filter(
        (be) => be.timelineId === timelineId && (!be.mapLevel || be.mapLevel === scope) && (!be.sourceMapId || !map || be.sourceMapId === map.id),
      )
    : [];
  const playerSafeBattleEntries = getPlayerSafeBattleEntries(battleEntriesRaw).filter((be) => !!be.position);

  const partyLocationState = store.party.currentLocationStateId
    ? getLocationState(data, store.party.currentLocationStateId)
    : undefined;
  const partyHotspot =
    partyLocationState && isLocationVisibleToPlayers(partyLocationState, store.progress)
      ? hotspots.find((h) => h.locationStateId === partyLocationState.id)
      : undefined;

  const showNoMap = !map || !mapState;

  return (
    <div className="observer-shell">
      {showNoMap ? (
        <div className="observer-no-map">Карта недоступна для отображения.</div>
      ) : (
        <div className="observer-map-canvas">
          {map.backgroundImageSrc ? (
            <img className="observer-map-image" src={map.backgroundImageSrc} alt={map.title} />
          ) : (
            <div className="observer-map-placeholder">{map.title}</div>
          )}
          <svg className="observer-route-layer" viewBox="0 0 1 1" preserveAspectRatio="none">
            {/* Faction Zones render first so they paint below routes/hotspots/
                party marker, same z-order as the DM-side canvas. Always
                sourced from getPlayerSafeFactionZones() above — never raw
                store.factionZonesById. */}
            {factionZones.map((z) =>
              z.polygon.length >= 3 ? (
                <polygon
                  key={z.id}
                  className={`faction-zone faction-zone--${z.status}`}
                  points={z.polygon.map((p) => `${p.x},${p.y}`).join(' ')}
                  style={{ opacity: z.opacity ?? 0.35, fill: z.color ?? undefined }}
                />
              ) : null,
            )}
            {routes.map((r) =>
              r.points && r.points.length >= 2 ? (
                <polyline
                  key={r.id}
                  className="observer-route-line"
                  points={r.points.map((p) => `${p.x},${p.y}`).join(' ')}
                  fill="none"
                />
              ) : null,
            )}
          </svg>
          {hotspots.map((h) => (
            <div key={h.id} className="observer-hotspot" style={{ left: `${h.x * 100}%`, top: `${h.y * 100}%` }}>
              {!h.labelHidden && <span className="observer-hotspot-label">{h.label}</span>}
            </div>
          ))}
          {placements.map((p) => (
            <div
              key={p.id}
              className="observer-placement"
              style={{ left: `${p.position.x * 100}%`, top: `${p.position.y * 100}%` }}
              title={p.title}
            />
          ))}
          {partyHotspot && (
            <div
              className="observer-party-marker"
              style={{ left: `${partyHotspot.x * 100}%`, top: `${partyHotspot.y * 100}%` }}
            >
              ⚔
            </div>
          )}
          {/* Battle Entry safe preview markers (Stage 5A, Step 13) — name +
              playerSafeDescription via title attribute only, no launch
              affordance. */}
          {playerSafeBattleEntries.map((be) => (
            <div
              key={be.id}
              className="battle-entry-marker battle-entry-marker--available"
              style={{ left: `${(be.position?.x ?? 0) * 100}%`, top: `${(be.position?.y ?? 0) * 100}%` }}
              title={be.playerSafeDescription ? `${be.name} — ${be.playerSafeDescription}` : be.name}
            >
              ⚔
            </div>
          ))}
          {eventsWithPosition.map((ev) => {
            const stateClass =
              ev.status === 'active'
                ? 'map-event-marker--active'
                : ev.status === 'planned'
                  ? 'map-event-marker--planned'
                  : '';
            return (
              <div
                key={ev.id}
                className={`map-event-marker map-event-marker--visible ${stateClass}`}
                style={{ left: `${(ev.position?.x ?? 0) * 100}%`, top: `${(ev.position?.y ?? 0) * 100}%` }}
                title={ev.name}
              />
            );
          })}
        </div>
      )}
      {eventsWithoutPosition.length > 0 && (
        <div className="observer-event-list-fallback">
          <p className="observer-event-list-heading">События</p>
          <ul>
            {eventsWithoutPosition.map((ev) => {
              const stateClass =
                ev.status === 'active'
                  ? 'map-event-marker--active'
                  : ev.status === 'planned'
                    ? 'map-event-marker--planned'
                    : '';
              return (
                <li key={ev.id}>
                  <span className={`map-event-marker map-event-marker--visible ${stateClass}`} /> {ev.name}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

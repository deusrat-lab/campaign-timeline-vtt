import { Link } from 'react-router-dom';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import { getPlayerSafeBattleEntries, getPlayerSafeHotspots, getPlayerSafeImages, getPlayerSafeNpcs, getPlayerSafePlacements, getPlayerSafeRoutes } from '../data/playerSafeProjection';
import type { CampaignData } from '../data/loadCampaignData';
import type { BattleEntry, LocationState, MapRoute } from '../types';
import type { DmNpc } from '../types/dmCompanion';

/**
 * Same fix as MapWorkspacePage's revealNpcAndItsImage/revealLocationAndItsImages
 * (see that file's comment for the full story): an image's own
 * `safeForPlayers` flag is independent of the NPC's/location's
 * `visibleToPlayers`, so a DM revealing an NPC/location here previously left
 * its already-attached portrait/art silently hidden. This is the DM's
 * dedicated "what's visible to players" audit page, so the gap was
 * especially easy to hit here — fix it here too, not just on the map.
 */
function revealNpcAndItsImage(store: ReturnType<typeof useCampaignStore>, data: CampaignData, npc: DmNpc) {
  store.patchNpc(npc.id, { visibleToPlayers: true });
  const image = npc.image ? data.images.find((img) => img.id === npc.image) : undefined;
  if (image && image.safeForPlayers === false) {
    store.patchImage(image.id, { safeForPlayers: true });
  }
}

function revealLocationAndItsImages(store: ReturnType<typeof useCampaignStore>, data: CampaignData, state: LocationState) {
  store.patchLocationState(state.id, { visibleToPlayers: true });
  for (const imageId of state.imageIds) {
    const image = data.images.find((img) => img.id === imageId);
    if (image && image.safeForPlayers === false) {
      store.patchImage(image.id, { safeForPlayers: true });
    }
  }
}

function locationLink(state: LocationState): string {
  return `/map?selected=${encodeURIComponent(state.id)}`;
}

function locationTitle(data: CampaignData, locationId?: string): string {
  return data.locations.find((location) => location.id === locationId)?.name ?? locationId ?? '';
}

function routeTitle(data: CampaignData, route: MapRoute): string {
  if (route.label) return route.label;
  const from = data.hotspots.find((hotspot) => hotspot.id === route.fromHotspotId);
  const to = data.hotspots.find((hotspot) => hotspot.id === route.toHotspotId);
  return [from?.label, to?.label].filter(Boolean).join(' -> ') || route.id;
}

function battleEntryLocation(data: CampaignData, entry: BattleEntry): string {
  if (!entry.sourceLocationStateId) return '';
  return data.locationStates.find((state) => state.id === entry.sourceLocationStateId)?.title ?? entry.sourceLocationStateId;
}

export function PlayerVisibilityPage() {
  const { data, loading, error } = useCampaignData();
  const store = useCampaignStore();

  if (loading) return <p className="page">Загрузка видимости...</p>;
  if (error || !data) return <p className="page">Ошибка загрузки: {error}</p>;

  const timelineId = store.currentTimelineId;
  const timeline = data.timelines.find((item) => item.id === timelineId);
  const currentLocationStates = data.locationStates.filter((state) => state.timelineId === timelineId);
  const safeLocationIds = new Set(currentLocationStates.filter((state) => state.visibleToPlayers !== false).map((state) => state.id));
  const mapStateIds = new Set(data.worldMapStates.filter((state) => state.timelineId === timelineId).map((state) => state.id));
  const routeItems = data.routes.filter((route) => mapStateIds.has(route.mapStateId));
  const battleEntries = Object.values(store.battleEntriesById).filter((entry) => entry.timelineId === timelineId);

  const safeHotspots = getPlayerSafeHotspots(data, store.progress, data.hotspots.filter((hotspot) => safeLocationIds.has(hotspot.locationStateId)));
  const safeRoutes = getPlayerSafeRoutes(routeItems);
  const safeNpcs = getPlayerSafeNpcs(data.npcs);
  const safeImages = getPlayerSafeImages(data.images);
  const safePlacements = getPlayerSafePlacements(data.placements);
  const safeBattleEntries = getPlayerSafeBattleEntries(battleEntries);

  return (
    <div className="page player-visibility-page">
      <header className="entity-library-header">
        <div>
          <h1>Показ игрокам</h1>
          <p className="muted">Аудит Player View для текущей арки: что будет видно на карте, в карточках и вокруг боевых сцен.</p>
        </div>
        <div className="entity-library-actions">
          <Link className="btn-secondary" to="/observer">Открыть Observer</Link>
          <button className="btn-primary" onClick={() => store.setMode('player-view')}>Player View</button>
        </div>
      </header>

      <section className="visibility-summary">
        <article>
          <strong>{timeline?.title ?? timelineId}</strong>
          <span>{timeline?.visibleToPlayers ? 'арка открыта игрокам' : 'арка скрыта от игроков'}</span>
          <button onClick={() => timeline && store.patchTimeline(timeline.id, { visibleToPlayers: !(timeline.visibleToPlayers ?? false) })}>
            {timeline?.visibleToPlayers ? 'Скрыть арку' : 'Открыть арку'}
          </button>
        </article>
        <article><strong>{safeHotspots.length}</strong><span>точек карты</span></article>
        <article><strong>{safeRoutes.length}</strong><span>маршрутов</span></article>
        <article><strong>{safeNpcs.length}</strong><span>NPC</span></article>
        <article><strong>{safeImages.length}</strong><span>картинок</span></article>
        <article><strong>{safeBattleEntries.length}</strong><span>боевых сцен</span></article>
      </section>

      <div className="visibility-grid">
        <section className="visibility-panel">
          <h2>Локации текущей арки</h2>
          <ul>
            {currentLocationStates.map((state) => {
              const visible = state.visibleToPlayers !== false;
              return (
                <li key={state.id}>
                  <span>
                    <strong>{state.title}</strong>
                    <small>{state.type ?? locationTitle(data, state.locationId)} · {state.status}</small>
                  </span>
                  <Link to={locationLink(state)}>карта</Link>
                  <button
                    onClick={() =>
                      visible
                        ? store.patchLocationState(state.id, { visibleToPlayers: false })
                        : revealLocationAndItsImages(store, data, state)
                    }
                  >
                    {visible ? 'Скрыть' : 'Показать'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="visibility-panel">
          <h2>Маршруты</h2>
          <ul>
            {routeItems.map((route) => {
              const visible = route.visibleInPlayerView === true && route.status !== 'hidden' && route.status !== 'blocked';
              return (
                <li key={route.id}>
                  <span>
                    <strong>{routeTitle(data, route)}</strong>
                    <small>{route.routeType ?? 'route'} · {route.status ?? 'active'}</small>
                  </span>
                  <button onClick={() => store.patchRoute(route.id, { visibleInPlayerView: !visible })}>
                    {visible ? 'Скрыть' : 'Показать'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="visibility-panel">
          <h2>NPC</h2>
          <ul>
            {data.npcs.map((npc) => {
              const visible = npc.visibleToPlayers === true;
              return (
                <li key={npc.id}>
                  <span>
                    <strong>{npc.name}</strong>
                    <small>{npc.role} · {locationTitle(data, npc.location)}</small>
                  </span>
                  <Link to={`/npc?selected=${encodeURIComponent(npc.id)}`}>карточка</Link>
                  <button
                    onClick={() =>
                      visible ? store.patchNpc(npc.id, { visibleToPlayers: false }) : revealNpcAndItsImage(store, data, npc)
                    }
                  >
                    {visible ? 'Скрыть' : 'Показать'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="visibility-panel">
          <h2>Картинки</h2>
          <ul>
            {data.images.map((image) => {
              const visible = image.safeForPlayers !== false;
              return (
                <li key={image.id}>
                  <span>
                    <strong>{image.title}</strong>
                    <small>{image.type}</small>
                  </span>
                  <Link to={`/images?selected=${encodeURIComponent(image.id)}`}>карточка</Link>
                  <button onClick={() => store.patchImage(image.id, { safeForPlayers: !visible })}>
                    {visible ? 'Скрыть' : 'Показать'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="visibility-panel">
          <h2>Боевые сцены</h2>
          <ul>
            {battleEntries.length === 0 ? (
              <li><span><strong>Нет локальных боевых сцен</strong><small>Сцены создаются на карте и остаются DM-controlled.</small></span></li>
            ) : battleEntries.map((entry) => {
              const visible = entry.visibleInPlayerView === true && entry.status !== 'hidden' && entry.status !== 'disabled';
              return (
                <li key={entry.id}>
                  <span>
                    <strong>{entry.name}</strong>
                    <small>{battleEntryLocation(data, entry) || entry.sceneSize} · {entry.status}</small>
                  </span>
                  <button onClick={() => store.updateBattleEntry(entry.id, { visibleInPlayerView: !visible })}>
                    {visible ? 'Скрыть' : 'Показать'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="visibility-panel">
          <h2>Метки и заметки</h2>
          <ul>
            {data.placements.map((placement) => {
              const visible = safePlacements.some((item) => item.id === placement.id);
              return (
                <li key={placement.id}>
                  <span>
                    <strong>{placement.title}</strong>
                    <small>{placement.entityKind} · {placement.status}</small>
                  </span>
                  <button onClick={() => store.patchPlacement(placement.id, { visibleInPlayerView: !visible })}>
                    {visible ? 'Скрыть' : 'Показать'}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}

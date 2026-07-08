import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useEffect, type ReactElement } from 'react';
import { NavBar } from './components/NavBar';
import { NavRail } from './components/NavRail';
import { MapWorkspacePage } from './pages/MapWorkspacePage';
import { HomePage } from './pages/HomePage';
import { EntityLibraryPage } from './pages/EntityLibraryPage';
import { EconomyPage } from './pages/EconomyPage';
import { ServicesPage } from './pages/ServicesPage';
import { ImagesPage } from './pages/ImagesPage';
import { SearchPage } from './pages/SearchPage';
import { PlayerVisibilityPage } from './pages/PlayerVisibilityPage';
import { CampaignDataProvider } from './state/campaignDataContext';
import { CampaignStoreProvider, useCampaignStore } from './state/campaignStore';
import { CampaignRuntimeProvider } from './state/campaignRuntimeStore';
import { WorldAtlasPage } from './features/world-atlas/WorldAtlasPage';
import { AtlasMapWorkspace } from './features/world-atlas/AtlasMapWorkspace';
import { WorldHomePage } from './features/world-home/WorldHomePage';
import { CampaignsPage } from './features/campaigns/CampaignsPage';
import { CampaignDashboardPage } from './features/campaigns/CampaignDashboardPage';
import { CampaignSessionPage } from './features/campaigns/CampaignSessionPage';

/** Legacy /location/:id deep links now resolve inside the Map Workspace instead of a standalone page. */
function LocationRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/map?selected=${encodeURIComponent(id ?? '')}`} replace />;
}

/**
 * Every route wrapped in this guard is a DM editing/reference surface
 * (EntityLibraryPage, EconomyPage, ImagesPage, PlayerVisibilityPage, the
 * admin report) that renders full campaign data — secrets, DM notes, hidden
 * quests/enemies — with no awareness of Player View itself. Before this
 * guard, the ONLY thing keeping a player off these pages was NavRail simply
 * not drawing a link to them (NavRail returns null entirely in player-view,
 * see components/NavRail.tsx) — a UI convenience, not an access boundary.
 * SearchPage could already navigate a player straight into `/npc?selected=…`
 * via a result link (closed alongside this guard, see SearchPage.tsx), and
 * any direct URL/bookmark/shared link always could. This makes the boundary
 * real: Player View only ever gets `/map`, `/search` (which itself degrades
 * to location-only results there), `/observer`, and the legacy location
 * redirect — every other route bounces to `/map`.
 *
 * This is also the enforcement point the eventual server-side DM/player
 * login is meant to plug into: once there's a real player token, the same
 * redirect condition becomes "no DM session" instead of a local mode flag.
 */
function DmOnlyRoute({ children }: { children: ReactElement }) {
  const store = useCampaignStore();
  if (store.mode === 'player-view') return <Navigate to="/map" replace />;
  return children;
}

function PlayerWorkspaceRoute() {
  const store = useCampaignStore();
  useEffect(() => {
    store.setMode('player-view');
    // mode is intentionally local to this tab; campaignStore does not persist it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <MapWorkspacePage />;
}

/** /observer opens the same usable workspace in Player View. */
function AppShell() {
  const location = useLocation();
  if (location.pathname === '/observer') {
    return (
      <div className="app-shell app-shell--observer-player">
        <NavRail />
        <div className="app-shell-main">
          <NavBar />
          <main>
            <Routes>
              <Route path="/observer" element={<PlayerWorkspaceRoute />} />
            </Routes>
          </main>
        </div>
      </div>
    );
  }
  return (
    <div className="app-shell">
      <NavRail />
      <div className="app-shell-main">
        <NavBar />
        <main>
          <Routes>
            {/* Start screen = World Home (DM). Players never reach it: DmOnlyRoute
               bounces player-view to the main-campaign map. */}
            <Route path="/" element={<DmOnlyRoute><WorldHomePage /></DmOnlyRoute>} />
            <Route path="/home" element={<DmOnlyRoute><WorldHomePage /></DmOnlyRoute>} />
            <Route path="/world-home" element={<DmOnlyRoute><WorldHomePage /></DmOnlyRoute>} />
            <Route path="/map" element={<MapWorkspacePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/location/:id" element={<LocationRedirect />} />
            <Route path="/visibility" element={<DmOnlyRoute><PlayerVisibilityPage /></DmOnlyRoute>} />
            <Route path="/quests" element={<DmOnlyRoute><EntityLibraryPage kind="quests" /></DmOnlyRoute>} />
            <Route path="/npc" element={<DmOnlyRoute><EntityLibraryPage kind="npc" /></DmOnlyRoute>} />
            <Route path="/enemies" element={<DmOnlyRoute><EntityLibraryPage kind="enemies" /></DmOnlyRoute>} />
            <Route path="/bestiary" element={<DmOnlyRoute><EntityLibraryPage kind="bestiary" /></DmOnlyRoute>} />
            <Route path="/players" element={<DmOnlyRoute><EntityLibraryPage kind="players" /></DmOnlyRoute>} />
            <Route path="/economy" element={<DmOnlyRoute><EconomyPage /></DmOnlyRoute>} />
            <Route path="/services" element={<DmOnlyRoute><ServicesPage /></DmOnlyRoute>} />
            <Route path="/shops" element={<DmOnlyRoute><ServicesPage initialKind="shop" /></DmOnlyRoute>} />
            <Route path="/taverns" element={<DmOnlyRoute><ServicesPage initialKind="tavern" /></DmOnlyRoute>} />
            <Route path="/images" element={<DmOnlyRoute><ImagesPage /></DmOnlyRoute>} />
            <Route path="/battle-maps" element={<DmOnlyRoute><EntityLibraryPage kind="battleMaps" /></DmOnlyRoute>} />
            <Route path="/factions" element={<DmOnlyRoute><EntityLibraryPage kind="factions" /></DmOnlyRoute>} />
            {/* New-location creation + the prefill/needs-review report still live here
               until they're migrated into the Map Workspace side panel. */}
            <Route path="/admin" element={<DmOnlyRoute><HomePage /></DmOnlyRoute>} />
            {/* Multi-campaign layer. DM-only surfaces; isolated runtime never
               touches the protected main-campaign state, arcs or session. */}
            <Route path="/world" element={<DmOnlyRoute><WorldAtlasPage /></DmOnlyRoute>} />
            <Route path="/world/:regionId" element={<DmOnlyRoute><WorldAtlasPage /></DmOnlyRoute>} />
            {/* Atlas Map Workspace — opens a canonical map as a full campaign-prep
               workspace (never a raw PNG). Shares the world atlas data only. */}
            <Route path="/atlas/maps/:mapId" element={<DmOnlyRoute><AtlasMapWorkspace /></DmOnlyRoute>} />
            <Route path="/campaigns" element={<DmOnlyRoute><CampaignsPage /></DmOnlyRoute>} />
            <Route path="/campaigns/:campaignId" element={<DmOnlyRoute><CampaignDashboardPage /></DmOnlyRoute>} />
            <Route path="/campaigns/:campaignId/session" element={<DmOnlyRoute><CampaignSessionPage /></DmOnlyRoute>} />
          </Routes>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <CampaignStoreProvider>
      <CampaignDataProvider>
        <CampaignRuntimeProvider>
          <AppShell />
        </CampaignRuntimeProvider>
      </CampaignDataProvider>
    </CampaignStoreProvider>
  );
}

export default App;

import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import { NavBar } from './components/NavBar';
import { NavRail } from './components/NavRail';
import { MapWorkspacePage } from './pages/MapWorkspacePage';
import { HomePage } from './pages/HomePage';
import { EntityLibraryPage } from './pages/EntityLibraryPage';
import { EconomyPage } from './pages/EconomyPage';
import { ServicesPage } from './pages/ServicesPage';
import { ImagesPage } from './pages/ImagesPage';
import { SearchPage } from './pages/SearchPage';
import { CampaignDataProvider } from './state/campaignDataContext';
import { CampaignStoreProvider, useCampaignStore } from './state/campaignStore';

/** Legacy /location/:id deep links now resolve inside the Map Workspace instead of a standalone page. */
function LocationRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/map?selected=${encodeURIComponent(id ?? '')}`} replace />;
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

/** /observer now opens the same usable workspace in Player View. */
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
            <Route path="/" element={<MapWorkspacePage />} />
            <Route path="/map" element={<MapWorkspacePage />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/location/:id" element={<LocationRedirect />} />
            <Route path="/quests" element={<EntityLibraryPage kind="quests" />} />
            <Route path="/npc" element={<EntityLibraryPage kind="npc" />} />
            <Route path="/enemies" element={<EntityLibraryPage kind="enemies" />} />
            <Route path="/bestiary" element={<EntityLibraryPage kind="bestiary" />} />
            <Route path="/players" element={<EntityLibraryPage kind="players" />} />
            <Route path="/economy" element={<EconomyPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/shops" element={<ServicesPage initialKind="shop" />} />
            <Route path="/taverns" element={<ServicesPage initialKind="tavern" />} />
            <Route path="/images" element={<ImagesPage />} />
            <Route path="/battle-maps" element={<EntityLibraryPage kind="battleMaps" />} />
            <Route path="/factions" element={<EntityLibraryPage kind="factions" />} />
            {/* New-location creation + the prefill/needs-review report still live here
               until they're migrated into the Map Workspace side panel. */}
            <Route path="/admin" element={<HomePage />} />
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
        <AppShell />
      </CampaignDataProvider>
    </CampaignStoreProvider>
  );
}

export default App;

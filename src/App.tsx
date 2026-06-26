import { Routes, Route, Navigate, useParams, useLocation } from 'react-router-dom';
import { NavBar } from './components/NavBar';
import { NavRail } from './components/NavRail';
import { MapWorkspacePage } from './pages/MapWorkspacePage';
import { HomePage } from './pages/HomePage';
import { QuestsPage } from './pages/QuestsPage';
import { ObserverViewPage } from './pages/ObserverViewPage';
import { CampaignDataProvider } from './state/campaignDataContext';
import { CampaignStoreProvider } from './state/campaignStore';

/** Legacy /location/:id deep links now resolve inside the Map Workspace instead of a standalone page. */
function LocationRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/map?selected=${encodeURIComponent(id ?? '')}`} replace />;
}

/** Observer (Etap C) is a deliberately bare full-screen route — no NavRail,
 * no NavBar, no app-shell chrome at all, so it's safe to project on a second
 * screen/TV the players can see. */
function AppShell() {
  const location = useLocation();
  if (location.pathname === '/observer') {
    return (
      <main>
        <Routes>
          <Route path="/observer" element={<ObserverViewPage />} />
        </Routes>
      </main>
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
            <Route path="/location/:id" element={<LocationRedirect />} />
            <Route path="/quests" element={<QuestsPage />} />
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

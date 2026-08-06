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
import { SettingsPage } from './pages/SettingsPage';
import { CampaignDataProvider } from './state/campaignDataContext';
import { CampaignStoreProvider, useCampaignStore } from './state/campaignStore';
import { UserCampaignProvider, useUserCampaigns } from './state/userCampaignStore';
import { isCapabilityEnabled, type UniversalCapabilityKey } from './domain/campaign/capabilities';
import { WorldAtlasPage } from './features/world-atlas/WorldAtlasPage';
import { AtlasMapWorkspace } from './features/world-atlas/AtlasMapWorkspace';
import { WorldHomePage } from './features/world-home/WorldHomePage';
import { CampaignsPage } from './features/campaigns/CampaignsPage';
import { NewCampaignWizard } from './features/campaigns/NewCampaignWizard';
import { IsolatedCampaignMapWorkspace } from './features/campaigns/IsolatedCampaignMapWorkspace';
import { CampaignLibraryPage } from './features/campaigns/CampaignLibraryPage';
import { CampaignBattleMapsPage } from './features/campaigns/CampaignBattleMapsPage';
import { CampaignBestiaryPage } from './features/campaigns/CampaignBestiaryPage';
import { CampaignBattlePage } from './features/campaigns/CampaignBattlePage';
import { CampaignEntryRedirect } from './features/campaigns/CampaignEntryRedirect';
import { CampaignSettingsPage } from './features/campaigns/CampaignSettingsPage';
import { canPlayerOpenCampaignPath } from './features/campaigns/playerSafe';
import { UniversalDiagnosticsPage } from './pages/UniversalDiagnosticsPage';
import { Stage17DiagnosticsPage } from './pages/Stage17DiagnosticsPage';
import { CampaignEngineProvider } from './features/campaign-engine/CampaignEngineProvider';
import { BattleAuthorityProvider } from './features/battle-authority/BattleAuthorityProvider';
import { ReadPathDiagnosticsPage } from './pages/ReadPathDiagnosticsPage';
import { ShadowIntegrationProvider } from './features/shadow-integration/ShadowIntegrationProvider';
import { ReadPathProvider } from './features/read-path/ReadPathProvider';
import { CommandShadowProvider } from './features/command-shadow/CommandShadowProvider';
import { CommandAuthorityProvider } from './features/command-authority/CommandAuthorityProvider';
import { DurableAuthorityProvider } from './features/durable-authority/DurableAuthorityProvider';
import { ComplexAuthorityProvider } from './features/complex-authority/ComplexAuthorityProvider';
import { MainCampaignShadowBridge } from './features/shadow-integration/MainCampaignShadowBridge';
import { UserCampaignShadowBridge } from './features/shadow-integration/UserCampaignShadowBridge';
import { GreyholmWorkspace } from './features/campaign-workspace/GreyholmWorkspace';
import { UserCampaignWorkspace } from './features/campaign-workspace/UserCampaignWorkspace';

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

function UserCampaignDmRoute({ children }: { children: ReactElement }) {
  const { campaignId } = useParams<{ campaignId: string }>();
  const location = useLocation();
  const observer = new URLSearchParams(location.search).get('observer') === '1';
  if (observer) return <Navigate to={`/campaigns/${campaignId ?? ''}/map?as=player&observer=1`} replace />;
  return <DmOnlyRoute>{children}</DmOnlyRoute>;
}

/**
 * Block D command-layer enforcement: a disabled capability blocks the whole
 * route, not just its nav link — so a direct URL/bookmark to a disabled
 * module's page (and every mutating action on it) is rejected the same way
 * DmOnlyRoute rejects a Player View direct hit, redirecting to `/map` rather
 * than throwing. Data is never touched by this — only reachability.
 */
function RequireCapability({ capability, children }: { capability: UniversalCapabilityKey; children: ReactElement }) {
  const store = useCampaignStore();
  if (!isCapabilityEnabled(store.capabilities, capability)) return <Navigate to="/map" replace />;
  return children;
}

function UserCampaignRequireCapability({ capability, children }: { capability: UniversalCapabilityKey; children: ReactElement }) {
  const { campaignId } = useParams<{ campaignId: string }>();
  const store = useUserCampaigns();
  const data = campaignId ? store.getData(campaignId) : null;
  if (data && !isCapabilityEnabled(data.capabilities, capability)) return <Navigate to={`/campaigns/${campaignId}/map`} replace />;
  return children;
}

/** Block D: which capability gates each `/campaigns/:id/library/:kind` page.
 * A kind with no entry here (e.g. 'notes') is not yet capability-gated. */
const LIBRARY_KIND_CAPABILITY: Record<string, UniversalCapabilityKey> = {
  locations: 'locations',
  npc: 'npc',
  quests: 'quests',
  enemies: 'enemies',
  factions: 'factions',
  images: 'images',
};

function UserCampaignLibraryRoute({ children }: { children: ReactElement }) {
  const { campaignId, kind } = useParams<{ campaignId: string; kind: string }>();
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const observer = params.get('observer') === '1';
  const asPlayer = params.get('as') === 'player' || observer;
  // Observer/player tabs may open and edit character sheets. Other campaign
  // libraries stay DM-only because they contain hidden notes and unrevealed
  // objects unless the page itself explicitly filters them.
  if (observer && !canPlayerOpenCampaignPath(kind)) return <Navigate to={`/campaigns/${campaignId ?? ''}/map?as=player&observer=1`} replace />;
  if (observer && params.get('as') !== 'player') return <Navigate to={`${location.pathname}?as=player&observer=1`} replace />;
  if (asPlayer) return children;
  const capability = kind ? LIBRARY_KIND_CAPABILITY[kind] : undefined;
  const gated = capability ? <UserCampaignRequireCapability capability={capability}>{children}</UserCampaignRequireCapability> : children;
  return <DmOnlyRoute>{gated}</DmOnlyRoute>;
}

function UserCampaignPlayerCapableRoute({ children }: { children: ReactElement }) {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const asPlayer = params.get('as') === 'player' || params.get('observer') === '1';
  if (asPlayer) return children;
  return <DmOnlyRoute>{children}</DmOnlyRoute>;
}

function PlayerWorkspaceRoute() {
  const store = useCampaignStore();
  useEffect(() => {
    store.setMode('player-view');
    // mode is intentionally local to this tab; campaignStore does not persist it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <GreyholmWorkspace
      activeRoute="/map"
      audience="player"
      bodyModuleId="map.workspace"
      legacyHeader={<></>}
      legacyBody={<MapWorkspacePage />}
    />
  );
}

/**
 * Block G — Greyholm's Maps route (which also hosts the embedded battle
 * overlay -- Greyholm has no separate battle route, see EmbeddedBattleOverlay
 * mounted conditionally inside MapWorkspacePage) now mounts through the same
 * GreyholmWorkspace shell EntityLibraryPage already uses. MapWorkspacePage's
 * own internal toolbar/header is untouched (passed whole as legacyBody); the
 * shell's default title line is the only thing layered above it. Audience is
 * derived from the store's own mode (DM/player), NOT hardcoded 'dm' -- unlike
 * the DM-only content routes, /map serves both.
 */
/**
 * Block G — Greyholm's Economy/Services reference pages (EconomyPage.tsx,
 * ServicesPage.tsx) are Greyholm-only (Caldran has no economy data model,
 * confirmed NOT_APPLICABLE_BY_SOURCE_DESIGN in the F: Timeline/Economy/Zones
 * bundle) and already DM-only-guarded (DmOnlyRoute + RequireCapability
 * "economy" wrap every caller). Audience is hardcoded 'dm' here (unlike
 * GreyholmMapRoute) because these routes cannot be reached by a player or
 * observer at all — DmOnlyRoute redirects them before this component mounts.
 */
function GreyholmEconomyRoute({ activeRoute, page }: { activeRoute: string; page: ReactElement }) {
  return (
    <GreyholmWorkspace
      activeRoute={activeRoute}
      audience="dm"
      bodyModuleId="economy"
      legacyHeader={<></>}
      legacyBody={page}
    />
  );
}

function GreyholmMapRoute() {
  const store = useCampaignStore();
  const audience: 'dm' | 'player' = store.mode === 'player-view' ? 'player' : 'dm';
  return (
    <GreyholmWorkspace
      activeRoute="/map"
      audience={audience}
      bodyModuleId="map.workspace"
      legacyHeader={<></>}
      legacyBody={<MapWorkspacePage />}
    />
  );
}

/**
 * Block G — Caldran's Maps and Battle routes now mount through the same
 * UserCampaignWorkspace shell CampaignLibraryPage already uses. Audience is
 * derived from the route the same way the existing pages already compute it
 * (as=player / observer=1 query params), so Player View / Observer framing
 * is unchanged.
 */
function CaldranMapRoute() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const location = useLocation();
  const store = useUserCampaigns();
  const data = campaignId ? store.getData(campaignId) : null;
  const params = new URLSearchParams(location.search);
  const observer = params.get('observer') === '1';
  const asPlayer = params.get('as') === 'player' || observer;
  const audience: 'dm' | 'player' | 'observer' = observer ? 'observer' : asPlayer ? 'player' : 'dm';
  return (
    <UserCampaignWorkspace
      legacyCampaignId={campaignId}
      title={data?.title ?? ''}
      kind="map"
      activeRoute={`/campaigns/${campaignId ?? ''}/map`}
      audience={audience}
      bodyModuleId="map.workspace"
      legacyHeader={<></>}
      legacyBody={<IsolatedCampaignMapWorkspace />}
    />
  );
}

function CaldranBattleRoute() {
  const { campaignId } = useParams<{ campaignId: string; mapId: string }>();
  const location = useLocation();
  const store = useUserCampaigns();
  const data = campaignId ? store.getData(campaignId) : null;
  const params = new URLSearchParams(location.search);
  const observer = params.get('observer') === '1';
  const asPlayer = params.get('as') === 'player' || observer;
  const audience: 'dm' | 'player' | 'observer' = observer ? 'observer' : asPlayer ? 'player' : 'dm';
  return (
    <UserCampaignWorkspace
      legacyCampaignId={campaignId}
      title={data?.title ?? ''}
      kind="battle"
      activeRoute={`/campaigns/${campaignId ?? ''}/battle`}
      audience={audience}
      bodyModuleId="battle.board"
      legacyHeader={<></>}
      legacyBody={<CampaignBattlePage />}
    />
  );
}

/** /observer opens the same usable workspace in Player View. */
function AppShell() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const embedded = params.get('embedded') === '1';
  const campaignMatch = location.pathname.match(/^\/campaigns\/([^/]+)/);
  const campaignPlayer = !!campaignMatch && params.get('observer') === '1';
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
    <div className={`app-shell${embedded ? ' app-shell--embedded' : ''}${campaignPlayer ? ' app-shell--campaign-player' : ''}`}>
      {!embedded && !campaignPlayer && <NavRail />}
      <div className="app-shell-main">
        {!embedded && !campaignPlayer && <NavBar />}
        <main>
          <Routes>
            {/* Start screen = World Home (DM). Players never reach it: DmOnlyRoute
               bounces player-view to the main-campaign map. */}
            <Route path="/" element={<DmOnlyRoute><WorldHomePage /></DmOnlyRoute>} />
            <Route path="/home" element={<DmOnlyRoute><WorldHomePage /></DmOnlyRoute>} />
            <Route path="/world-home" element={<DmOnlyRoute><WorldHomePage /></DmOnlyRoute>} />
            <Route path="/map" element={<GreyholmMapRoute />} />
            <Route path="/search" element={<SearchPage />} />
            <Route path="/location/:id" element={<LocationRedirect />} />
            <Route path="/visibility" element={<DmOnlyRoute><PlayerVisibilityPage /></DmOnlyRoute>} />
            <Route path="/settings" element={<DmOnlyRoute><SettingsPage /></DmOnlyRoute>} />
            <Route path="/quests" element={<DmOnlyRoute><RequireCapability capability="quests"><EntityLibraryPage kind="quests" /></RequireCapability></DmOnlyRoute>} />
            <Route path="/npc" element={<DmOnlyRoute><RequireCapability capability="npc"><EntityLibraryPage kind="npc" /></RequireCapability></DmOnlyRoute>} />
            <Route path="/enemies" element={<DmOnlyRoute><RequireCapability capability="enemies"><EntityLibraryPage kind="enemies" /></RequireCapability></DmOnlyRoute>} />
            <Route path="/bestiary" element={<DmOnlyRoute><RequireCapability capability="enemies"><EntityLibraryPage kind="bestiary" /></RequireCapability></DmOnlyRoute>} />
            <Route path="/players" element={<DmOnlyRoute><RequireCapability capability="party"><EntityLibraryPage kind="players" /></RequireCapability></DmOnlyRoute>} />
            <Route path="/economy" element={<DmOnlyRoute><RequireCapability capability="economy"><GreyholmEconomyRoute activeRoute="/economy" page={<EconomyPage />} /></RequireCapability></DmOnlyRoute>} />
            <Route path="/services" element={<DmOnlyRoute><RequireCapability capability="economy"><GreyholmEconomyRoute activeRoute="/services" page={<ServicesPage />} /></RequireCapability></DmOnlyRoute>} />
            <Route path="/shops" element={<DmOnlyRoute><RequireCapability capability="economy"><GreyholmEconomyRoute activeRoute="/shops" page={<ServicesPage initialKind="shop" />} /></RequireCapability></DmOnlyRoute>} />
            <Route path="/taverns" element={<DmOnlyRoute><RequireCapability capability="economy"><GreyholmEconomyRoute activeRoute="/taverns" page={<ServicesPage initialKind="tavern" />} /></RequireCapability></DmOnlyRoute>} />
            <Route path="/images" element={<DmOnlyRoute><RequireCapability capability="images"><ImagesPage /></RequireCapability></DmOnlyRoute>} />
            <Route path="/battle-maps" element={<DmOnlyRoute><RequireCapability capability="battleMaps"><EntityLibraryPage kind="battleMaps" /></RequireCapability></DmOnlyRoute>} />
            <Route path="/factions" element={<DmOnlyRoute><RequireCapability capability="factions"><EntityLibraryPage kind="factions" /></RequireCapability></DmOnlyRoute>} />
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
            <Route path="/diagnostics/universal" element={<DmOnlyRoute><UniversalDiagnosticsPage /></DmOnlyRoute>} />
            <Route path="/diagnostics/stage-17" element={<DmOnlyRoute><Stage17DiagnosticsPage /></DmOnlyRoute>} />
            <Route path="/diagnostics/read-path" element={<DmOnlyRoute><ReadPathDiagnosticsPage /></DmOnlyRoute>} />
            <Route path="/campaigns" element={<DmOnlyRoute><CampaignsPage /></DmOnlyRoute>} />
            <Route path="/campaigns/new" element={<DmOnlyRoute><NewCampaignWizard /></DmOnlyRoute>} />
            <Route path="/campaigns/:campaignId/map" element={<UserCampaignPlayerCapableRoute><CaldranMapRoute /></UserCampaignPlayerCapableRoute>} />
            <Route path="/campaigns/:campaignId/library/battle-maps" element={<UserCampaignDmRoute><UserCampaignRequireCapability capability="battleMaps"><CampaignBattleMapsPage /></UserCampaignRequireCapability></UserCampaignDmRoute>} />
            <Route path="/campaigns/:campaignId/settings" element={<UserCampaignDmRoute><CampaignSettingsPage /></UserCampaignDmRoute>} />
            <Route path="/campaigns/:campaignId/library/bestiary" element={<UserCampaignDmRoute><UserCampaignRequireCapability capability="enemies"><CampaignBestiaryPage /></UserCampaignRequireCapability></UserCampaignDmRoute>} />
            <Route path="/campaigns/:campaignId/library/:kind" element={<UserCampaignLibraryRoute><CampaignLibraryPage /></UserCampaignLibraryRoute>} />
            <Route path="/campaigns/:campaignId/battle/:mapId" element={<UserCampaignPlayerCapableRoute><CaldranBattleRoute /></UserCampaignPlayerCapableRoute>} />
            <Route path="/campaigns/:campaignId" element={<UserCampaignDmRoute><CampaignEntryRedirect /></UserCampaignDmRoute>} />
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
        <UserCampaignProvider>
          <ShadowIntegrationProvider>
            {/* Stage 9 — local shadow integration. Both bridges render null and
               self-disable when the default-off flag is unset. */}
            <MainCampaignShadowBridge />
            <UserCampaignShadowBridge />
            {/* Stage 10 — guarded universal read path. Provider is inert when its
               own default-off flag is unset; pilots mount only on the DM-only,
               flag-gated /diagnostics/read-path route. */}
            {/* Stage 13 — universal command-shadow. Inert (no coordinator, no
               sink) when its own default-off flag is unset. */}
            {/* Stage 14 — universal command authority. Inert (no router, no
               sink) when its own default-off flag is unset. Independent of the
               Stage 9/10/11/12/13 flags. */}
            <CommandShadowProvider>
              <CommandAuthorityProvider>
                {/* Stage 15 — universal durable authority. Inert (no router, no
                   sink, no production repository access) when its own default-off
                   flag is unset. Consulted before Stage 14 for its owned scopes.
                   Independent of the Stage 9/10/11/12/13/14 flags. */}
                <DurableAuthorityProvider>
                  {/* Stage 16.1 — universal COMPLEX (aggregate) authority. Inert
                     (no router, no sink, no production repository access) when its
                     own default-off flag is unset. Consulted before Stage 15 for
                     its owned aggregate scopes. Independent of every earlier flag. */}
                  <ComplexAuthorityProvider>
                    {/* Stage 17 — unified Campaign Engine ownership context.
                       Inert by default: describes ownership only; all four
                       Stage 17 flags default off, so `active` is false and the
                       resolved ownership equals the Stage 16 baseline. */}
                    <CampaignEngineProvider>
                      <BattleAuthorityProvider>
                        <ReadPathProvider>
                          <AppShell />
                        </ReadPathProvider>
                      </BattleAuthorityProvider>
                    </CampaignEngineProvider>
                  </ComplexAuthorityProvider>
                </DurableAuthorityProvider>
              </CommandAuthorityProvider>
            </CommandShadowProvider>
          </ShadowIntegrationProvider>
        </UserCampaignProvider>
      </CampaignDataProvider>
    </CampaignStoreProvider>
  );
}

export default App;

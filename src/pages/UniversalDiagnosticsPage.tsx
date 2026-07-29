import { Navigate } from 'react-router-dom';
import { UNIVERSAL_DIAGNOSTICS_ENABLED } from '../config';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import {
  adaptMainCampaignToUniversal,
  compareProjectionCounts,
  projectDMWorkspace,
  projectObserver,
  projectPlayerSafe,
} from '../domain';
import type { MainCampaignOverlayInput } from '../domain';

export function UniversalDiagnosticsPage() {
  const { data, loading, error } = useCampaignData();
  const overlay = useCampaignStore();

  if (!UNIVERSAL_DIAGNOSTICS_ENABLED) return <Navigate to="/map" replace />;
  if (loading) return <section className="page-panel"><h1>Universal diagnostics</h1><p>Loading campaign data...</p></section>;
  if (error || !data) return <section className="page-panel"><h1>Universal diagnostics</h1><p>{error ?? 'No campaign data.'}</p></section>;

  const adapted = adaptMainCampaignToUniversal({
    data,
    overlay: overlay.exportOverlay() as unknown as MainCampaignOverlayInput,
  });
  const snapshot = adapted.snapshot;
  if (!snapshot) {
    return (
      <section className="page-panel">
        <h1>Universal diagnostics</h1>
        <p>Adapter failed.</p>
        <pre>{JSON.stringify(adapted.diagnostics, null, 2)}</pre>
      </section>
    );
  }

  const dm = projectDMWorkspace(snapshot);
  const player = projectPlayerSafe(snapshot);
  const observer = projectObserver(snapshot);
  const parity = compareProjectionCounts(snapshot);

  return (
    <section className="page-panel universal-diagnostics">
      <h1>Universal diagnostics</h1>
      <div className="stats-grid">
        <article>
          <h2>Adapter</h2>
          <p>{adapted.source.kind} / {adapted.source.sourceId}</p>
          <p>{adapted.diagnostics.length} diagnostics</p>
        </article>
        <article>
          <h2>DM projection</h2>
          <p>{dm.entities.length} cards</p>
          <p>{dm.map.maps.length} maps / {dm.map.hotspots.length} hotspots</p>
        </article>
        <article>
          <h2>Player projection</h2>
          <p>{player.entities.length} cards</p>
          <p>{player.map.maps.length} maps / {player.map.hotspots.length} hotspots</p>
        </article>
        <article>
          <h2>Observer projection</h2>
          <p>{observer.entities.length} cards</p>
          <p>{observer.observerFocus ? 'focus set' : 'no focus'}</p>
        </article>
      </div>
      <h2>Parity</h2>
      <pre>{JSON.stringify(parity, null, 2)}</pre>
    </section>
  );
}

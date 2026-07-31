import { Navigate } from 'react-router-dom';
import { UNIVERSAL_DIAGNOSTICS_ENABLED } from '../config';
import { useCampaignData } from '../state/campaignDataContext';
import { useCampaignStore } from '../state/campaignStore';
import { useCampaignEngine } from '../features/campaign-engine/CampaignEngineProvider';
import {
  adaptMainCampaignToUniversal,
  projectDMWorkspace,
  projectPlayerSafe,
  projectObserver,
  snapshotHash,
  canonicalHash,
  reconcile,
  createBrowserRepositoryStorage,
  listBattleRecords,
  totalPendingCount,
  syncPending,
  remoteAppliedCount,
} from '../domain';
import type { MainCampaignOverlayInput } from '../domain';

/**
 * Stage 17 — DM-only, READ-ONLY diagnostics for the universal Campaign Engine.
 *
 * Shows the live Stage 17 flags, the resolved ownership registry (with a
 * no-dual-authority check), repository/battle/reconciliation summaries and the
 * three privacy projection hashes so a DM can confirm Player-Safe / Observer /
 * DM projections genuinely differ. No destructive actions are offered here.
 */
export function Stage17DiagnosticsPage() {
  const engine = useCampaignEngine();
  const { data, loading, error } = useCampaignData();
  const overlay = useCampaignStore();

  if (!UNIVERSAL_DIAGNOSTICS_ENABLED) return <Navigate to="/map" replace />;
  if (loading) return <section className="page-panel"><h1>Stage 17 diagnostics</h1><p>Loading campaign data…</p></section>;
  if (error || !data) return <section className="page-panel"><h1>Stage 17 diagnostics</h1><p>{error ?? 'No campaign data.'}</p></section>;

  const adapted = adaptMainCampaignToUniversal({
    data,
    overlay: overlay.exportOverlay() as unknown as MainCampaignOverlayInput,
  });
  const snapshot = adapted.snapshot;

  const dmHash = snapshot ? snapshotHash(snapshot) : '—';
  const psHash = snapshot ? hashOf(projectPlayerSafe(snapshot)) : '—';
  const obsHash = snapshot ? hashOf(projectObserver(snapshot)) : '—';
  const dmProjHash = snapshot ? hashOf(projectDMWorkspace(snapshot)) : '—';
  const battleCount = snapshot ? Object.keys(snapshot.runtime.battles ?? {}).length : 0;

  const reconcileState = snapshot
    ? reconcile({ revision: snapshot.revision, hash: dmHash }, { revision: snapshot.revision, hash: dmHash })
    : 'unknown';

  // Live durable battle state (read from the actual Stage 17 battle namespace).
  const battleStorage = typeof window !== 'undefined' ? createBrowserRepositoryStorage(window.localStorage) : null;
  const battleRecords = battleStorage ? listBattleRecords(battleStorage) : [];
  const pendingTotal = battleStorage ? totalPendingCount(battleStorage) : 0;
  const syncCampaigns = [...new Set(battleRecords.map((r) => r.campaignId))];
  const syncQueued = battleStorage ? syncCampaigns.reduce((s, cid) => s + syncPending(battleStorage, cid), 0) : 0;
  const syncRemoteApplied = battleStorage ? syncCampaigns.reduce((s, cid) => s + remoteAppliedCount(battleStorage, cid), 0) : 0;

  return (
    <section className="page-panel stage17-diagnostics">
      <h1>Stage 17 diagnostics — universal Campaign Engine</h1>

      <div className="stats-grid">
        <article>
          <h2>Flags (default off)</h2>
          <p data-testid="s17-active">engine active: <strong>{String(engine.active)}</strong></p>
          <p>battleAuthority: {String(engine.flags.battleAuthority)}</p>
          <p>importExport: {String(engine.flags.importExport)}</p>
          <p>sync: {String(engine.flags.sync)}</p>
          <p>localCutover: {String(engine.flags.localCutover)}</p>
        </article>
        <article>
          <h2>Ownership integrity</h2>
          <p data-testid="s17-dual">dual-authority violations: <strong>{engine.dualAuthorityViolations}</strong></p>
          <p>systems tracked: {engine.ownership.length}</p>
          <p>reconciliation: {reconcileState}</p>
        </article>
        <article>
          <h2>Battle / repository (live)</h2>
          <p>universal battles in snapshot: {battleCount}</p>
          <p data-testid="s17-durable-battles">durable battle records: <strong>{battleRecords.length}</strong></p>
          <p data-testid="s17-pending-total">pending projections: <strong>{pendingTotal}</strong></p>
          <p>adapter: {adapted.source.kind} / {adapted.diagnostics.length} diagnostics</p>
        </article>
        <article>
          <h2>Sync (live, local/mock)</h2>
          <p data-testid="s17-sync-queued">queued ops: <strong>{syncQueued}</strong></p>
          <p data-testid="s17-sync-applied">remote applied ops: <strong>{syncRemoteApplied}</strong></p>
          <p>sync flag: {String(engine.flags.sync)}</p>
        </article>
        <article>
          <h2>Privacy projection hashes</h2>
          <p data-testid="s17-dm-hash">DM: {dmProjHash}</p>
          <p data-testid="s17-ps-hash">Player-Safe: {psHash}</p>
          <p data-testid="s17-obs-hash">Observer: {obsHash}</p>
          <p>snapshot: {dmHash}</p>
        </article>
      </div>

      <h2>Durable battle records (live, campaign-scoped)</h2>
      {battleRecords.length === 0 ? (
        <p>No durable battle records yet.</p>
      ) : (
        <table className="stage17-battles">
          <thead>
            <tr><th>Campaign</th><th>Battle</th><th>Revision</th><th>Round</th><th>Tokens</th><th>Hash</th></tr>
          </thead>
          <tbody>
            {battleRecords.map((r) => (
              <tr key={`${r.campaignId}:${r.battleId}`} data-testid={`battle-${r.campaignId}-${r.battleId}`}>
                <td>{r.campaignId}</td>
                <td>{r.battleId}</td>
                <td>{r.revision}</td>
                <td>{r.round ?? '—'}</td>
                <td>{r.tokenCount}</td>
                <td>{r.hash}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2>Ownership registry</h2>
      <table className="stage17-ownership">
        <thead>
          <tr><th>System</th><th>Owner</th><th>Legacy role</th><th>Family</th><th>Note</th></tr>
        </thead>
        <tbody>
          {engine.ownership.map((entry) => (
            <tr key={entry.system} data-testid={`own-${entry.system}`}>
              <td>{entry.system}</td>
              <td>{entry.owner}</td>
              <td>{entry.legacyRole}</td>
              <td>{entry.family ?? '—'}</td>
              <td>{entry.note ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Stable hash of any JSON value, reusing the canonical FNV over sorted keys. */
function hashOf(value: unknown): string {
  return canonicalHash(value);
}

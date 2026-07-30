import { useCommandAuthority } from './CommandAuthorityProvider';
import type { CampaignId } from '../../domain';

/**
 * Stage 14 — DM-only, READ-ONLY diagnostics for universal command authority.
 *
 * Renders structured per-campaign authority status: current phase, last
 * decision (committed vs fallback), fallback reason, pre/candidate/predicted/
 * committed hashes, prediction + post-commit comparison summaries, and success/
 * fallback/mismatch counts. The only offered actions are clearing THIS stage's
 * diagnostics for one campaign and exporting the redacted records. There is
 * deliberately NO apply-candidate, replay-to-legacy, retry-command,
 * rollback, force-authority, edit, migrate or sync control — the universal
 * candidate is never written anywhere but the local diagnostics log, and the
 * committed legacy result is authoritative. Rendered inside the already-DM-
 * guarded, flag-gated UniversalDiagnosticsPage.
 */
export function CommandAuthorityDiagnostics() {
  const { enabled, router, statuses } = useCommandAuthority();

  if (!enabled || !router) {
    return (
      <section className="shadow-diagnostics">
        <h2>Stage 14 — universal command authority</h2>
        <p>
          Command authority is <strong>disabled</strong> (default). Legacy commands are the sole authoritative
          writers and no universal-first execution occurs.
        </p>
      </section>
    );
  }

  const exportRedacted = (campaignId: CampaignId) => {
    const records = router.readDiagnostics(campaignId);
    const blob = new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stage-14-authority-${campaignId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="shadow-diagnostics">
      <h2>Stage 14 — universal command authority</h2>
      <p>
        Enabled. The universal command runs first and, on proven parity, commits through the existing legacy
        action exactly once; the committed legacy result is verified against the universal candidate. Legacy
        remains the physical persistence backend — no production universal write, no server sync.
      </p>
      <p>Namespace: <code>{router.namespace}</code></p>
      {statuses.length === 0 ? (
        <p>No allowlisted authority commands have run yet.</p>
      ) : (
        <table className="shadow-diagnostics-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Kind</th>
              <th>Phase</th>
              <th>Decision</th>
              <th>Fallback reason</th>
              <th>Prediction</th>
              <th>Post-commit</th>
              <th>Success</th>
              <th>Fallback</th>
              <th>Mismatch</th>
              <th>Records</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((status) => (
              <tr key={status.campaignId}>
                <td><code>{status.campaignId}</code></td>
                <td>{status.campaignKind}</td>
                <td>
                  <span className={`shadow-status shadow-status--${status.phase}`}>{status.phase}</span>
                  {status.lastErrorMessage ? <div className="shadow-status-error">{status.lastErrorMessage}</div> : null}
                </td>
                <td>{status.lastDecision ?? '—'}</td>
                <td>{status.lastFallbackReason ?? '—'}</td>
                <td>{status.lastPredictionComparison ? status.lastPredictionComparison.classification : '—'}</td>
                <td>{status.lastPostCommitComparison ? status.lastPostCommitComparison.classification : '—'}</td>
                <td>{status.successCount}</td>
                <td>{status.fallbackCount}</td>
                <td>{status.mismatchCount}</td>
                <td>{status.recordCount}</td>
                <td className="shadow-actions">
                  <button type="button" onClick={() => router.clearDiagnostics(status.campaignId as CampaignId)}>Clear Stage 14 diagnostics</button>
                  <button type="button" onClick={() => exportRedacted(status.campaignId as CampaignId)}>Export redacted</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

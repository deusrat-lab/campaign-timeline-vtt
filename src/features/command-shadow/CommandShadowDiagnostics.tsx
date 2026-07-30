import { useCommandShadow } from './CommandShadowProvider';
import type { CampaignId } from '../../domain';

/**
 * Stage 13 — DM-only, READ-ONLY diagnostics for the universal command shadow.
 *
 * Renders structured per-campaign command-shadow status: last event, comparison
 * classification, success/mismatch counts, base/result revisions and the safe
 * (id/path/count-only) mismatch summary. The only offered action is clearing
 * THIS stage's diagnostics for one campaign. There is deliberately NO
 * apply-to-legacy, replay-against-legacy, save-to-production, repair, migrate,
 * sync or rollback control — the universal result is never written anywhere but
 * the local diagnostics log. Rendered inside the already-DM-guarded, flag-gated
 * UniversalDiagnosticsPage.
 */
export function CommandShadowDiagnostics() {
  const { enabled, coordinator, statuses } = useCommandShadow();

  if (!enabled || !coordinator) {
    return (
      <section className="shadow-diagnostics">
        <h2>Stage 13 — universal command shadow</h2>
        <p>Command shadow is <strong>disabled</strong> (default). Legacy commands are the sole authoritative writers.</p>
      </section>
    );
  }

  return (
    <section className="shadow-diagnostics">
      <h2>Stage 13 — universal command shadow</h2>
      <p>Enabled. Legacy commands remain authoritative — universal commands run only in an isolated shadow and are compared, never applied.</p>
      <p>Namespace: <code>{coordinator.namespace}</code></p>
      {statuses.length === 0 ? (
        <p>No allowlisted commands have been observed yet.</p>
      ) : (
        <table className="shadow-diagnostics-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Kind</th>
              <th>Status</th>
              <th>Last event</th>
              <th>Comparison</th>
              <th>Mismatch paths</th>
              <th>Success</th>
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
                  <span className={`shadow-status shadow-status--${status.status}`}>{status.status}</span>
                  {status.lastErrorMessage ? <div className="shadow-status-error">{status.lastErrorMessage}</div> : null}
                  {status.lastComparison && status.lastComparison.changedPaths.length > 0 ? (
                    <ul className="shadow-validation-errors">
                      {status.lastComparison.changedPaths.map((path, index) => (
                        <li key={index}><code>{path}</code></li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td><code>{status.lastEventId ? status.lastEventId.slice(0, 10) : '—'}</code></td>
                <td>{status.lastComparison ? status.lastComparison.classification : '—'}</td>
                <td>{status.lastComparison ? status.lastComparison.mismatchCount : '—'}</td>
                <td>{status.successCount}</td>
                <td>{status.mismatchCount}</td>
                <td>{status.recordCount}</td>
                <td className="shadow-actions">
                  <button type="button" onClick={() => coordinator.clearDiagnostics(status.campaignId as CampaignId)}>Clear Stage 13 diagnostics</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

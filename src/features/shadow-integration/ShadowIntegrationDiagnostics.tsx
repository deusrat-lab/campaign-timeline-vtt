import { useShadowIntegration } from './ShadowIntegrationProvider';
import type { CampaignId } from '../../domain';

/**
 * Stage 9 — DM-only, read-only diagnostics for the shadow integration. Shows
 * structured per-campaign shadow status and offers ONLY shadow-only / read-only
 * manual actions (run, reload+compare, clear shadow). Never renders secret
 * payloads — only IDs, paths, counts and statuses. This component is rendered
 * inside the already-DM-guarded, flag-gated UniversalDiagnosticsPage.
 */
export function ShadowIntegrationDiagnostics() {
  const { enabled, coordinator, namespace, statuses } = useShadowIntegration();

  if (!enabled || !coordinator) {
    return (
      <section className="shadow-diagnostics">
        <h2>Stage 9 — universal shadow integration</h2>
        <p>Shadow integration is <strong>disabled</strong> (default). Legacy stores are the sole source of truth.</p>
      </section>
    );
  }

  return (
    <section className="shadow-diagnostics">
      <h2>Stage 9 — universal shadow integration</h2>
      <p>Enabled. Legacy stores remain authoritative — this is a validated shadow copy only.</p>
      <p>Namespace: <code>{namespace}</code></p>
      {statuses.length === 0 ? (
        <p>No campaigns have produced a shadow snapshot yet.</p>
      ) : (
        <table className="shadow-diagnostics-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Source</th>
              <th>Status</th>
              <th>Cand. rev</th>
              <th>Persist. rev</th>
              <th>Valid. errors</th>
              <th>Mismatches</th>
              <th>Dropped</th>
              <th>Pending</th>
              <th>Last success</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {statuses.map((status) => (
              <tr key={status.campaignId}>
                <td><code>{status.campaignId}</code></td>
                <td>{status.sourceKind}</td>
                <td>
                  <span className={`shadow-status shadow-status--${status.status}`}>{status.status}</span>
                  {status.lastErrorMessage ? <div className="shadow-status-error">{status.lastErrorMessage}</div> : null}
                  {status.validationErrors.length > 0 ? (
                    <ul className="shadow-validation-errors">
                      {status.validationErrors.map((issue, index) => (
                        <li key={index}><code>{issue.path}</code>: {issue.message}</li>
                      ))}
                    </ul>
                  ) : null}
                </td>
                <td>{status.candidateRevision ?? '—'}</td>
                <td>{status.persistedRevision ?? '—'}</td>
                <td>{status.validationErrorCount}</td>
                <td>{status.comparison ? status.comparison.mismatchCount : '—'}</td>
                <td>{status.droppedCollections.length}</td>
                <td>{status.running ? 'running' : status.pending ? 'scheduled' : 'idle'}</td>
                <td>{status.lastSuccessAt ?? '—'}</td>
                <td className="shadow-actions">
                  <button type="button" onClick={() => void coordinator.runNow(status.campaignId as CampaignId)}>Run now</button>
                  <button type="button" onClick={() => void coordinator.reloadAndCompare(status.campaignId as CampaignId)}>Reload &amp; compare</button>
                  <button type="button" onClick={() => void coordinator.clearCampaign(status.campaignId as CampaignId)}>Clear shadow</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

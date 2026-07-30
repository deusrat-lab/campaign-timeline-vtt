import { useDurableAuthority } from './DurableAuthorityProvider';
import type { CampaignId } from '../../domain';

/**
 * Stage 15 — DM-only, READ-ONLY diagnostics for universal DURABLE authority.
 *
 * Renders structured per-campaign durable status: current phase, last decision
 * (durable-committed vs fallback), current production revision, reconciliation
 * status, pending recovery count, durable-commit / fallback / mismatch counts,
 * and the redacted hash/comparison summaries. The only offered actions are
 * clearing THIS stage's diagnostics for one campaign and exporting the redacted
 * records. There is deliberately NO force-apply, replay, retry-command,
 * rollback, overwrite-universal, overwrite-legacy, edit, migrate, sync or
 * conflict-resolve control — the durable universal write is authoritative and a
 * failed legacy projection is only ever resolved by idempotent recovery.
 * Rendered inside the already-DM-guarded, flag-gated UniversalDiagnosticsPage.
 */
export function DurableAuthorityDiagnostics() {
  const { enabled, router, statuses } = useDurableAuthority();

  if (!enabled || !router) {
    return (
      <section className="shadow-diagnostics">
        <h2>Stage 15 — universal durable authority</h2>
        <p>
          Durable authority is <strong>disabled</strong> (default). The production universal repository is not
          used as a source of truth; the Stage 14 / legacy command path runs exactly as baseline.
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
    a.download = `stage-15-durable-${campaignId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="shadow-diagnostics">
      <h2>Stage 15 — universal durable authority</h2>
      <p>
        Enabled. For an allowlisted safe field the universal command is committed to the production universal
        repository first (expected-revision guard, read-after-write verified), then the existing legacy action
        runs once as a compatibility projection. Legacy-owned data is composed fresh and never overwritten; a
        failed projection becomes a pending, idempotent recovery record. No server sync, no migration.
      </p>
      <p>
        Diagnostics namespace: <code>{router.namespace}</code> · production namespace:{' '}
        <code>{router.productionNamespace}</code>
      </p>
      {statuses.length === 0 ? (
        <p>No allowlisted durable commands have run yet.</p>
      ) : (
        <table className="shadow-diagnostics-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Kind</th>
              <th>Phase</th>
              <th>Decision</th>
              <th>Fallback reason</th>
              <th>Revision</th>
              <th>Reconciliation</th>
              <th>Pending recovery</th>
              <th>Durable</th>
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
                <td>{status.currentRevision ?? '—'}</td>
                <td>{status.lastReconciliationStatus ?? '—'}</td>
                <td>{status.pendingRecoveryCount}</td>
                <td>{status.durableCommitCount}</td>
                <td>{status.fallbackCount}</td>
                <td>{status.mismatchCount}</td>
                <td>{status.recordCount}</td>
                <td className="shadow-actions">
                  <button type="button" onClick={() => router.clearDiagnostics(status.campaignId as CampaignId)}>Clear Stage 15 diagnostics</button>
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

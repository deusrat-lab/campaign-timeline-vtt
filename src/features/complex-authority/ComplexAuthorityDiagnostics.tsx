import { useComplexAuthority } from './ComplexAuthorityProvider';
import { allAggregateDescriptors, type CampaignId } from '../../domain';

/**
 * Stage 16.1 — DM-only, READ-ONLY diagnostics for universal COMPLEX (aggregate)
 * authority. Renders per-campaign status: phase, last decision, aggregate,
 * current production revision, reconciliation, pending recovery, durable /
 * fallback / mismatch counts. The only offered actions are clearing THIS stage's
 * diagnostics for one campaign and exporting the redacted records. There is
 * deliberately NO force-apply, replay, retry-command, rollback, overwrite,
 * migrate, sync or conflict-resolve control. Rendered inside the already-DM-
 * guarded, flag-gated UniversalDiagnosticsPage.
 */
export function ComplexAuthorityDiagnostics() {
  const { enabled, router, statuses } = useComplexAuthority();

  if (!enabled || !router) {
    return (
      <section className="shadow-diagnostics">
        <h2>Stage 16 — universal complex (aggregate) authority</h2>
        <p>
          Complex authority is <strong>disabled</strong> (default). No complex router is created, the production
          universal repository is not used for aggregate transitions, and the Stage 15 / legacy path runs exactly as
          baseline.
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
    a.download = `stage-16-complex-${campaignId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="shadow-diagnostics">
      <h2>Stage 16 — universal complex (aggregate) authority</h2>
      <p>
        Enabled. For an allowlisted aggregate transition (reveal / presented card / party location / route progress /
        placement) the typed universal command is committed to the production universal repository first (expected-
        revision guard, read-after-write verified, invariants + scope + independent legacy parity checked), then the
        existing legacy action runs once as a compatibility projection. Legacy-owned data (maps, geometry, timeline,
        battles, entity content) is composed fresh and never overwritten; a failed projection becomes a pending,
        idempotent recovery record. No server sync, no migration, <code>userCampaignSync</code> unchanged.
      </p>
      <p>
        Diagnostics namespace: <code>{router.namespace}</code> · production namespace:{' '}
        <code>{router.productionNamespace}</code>
      </p>
      <details>
        <summary>Aggregate ownership registry (typed, campaign + system scoped)</summary>
        <ul>
          {allAggregateDescriptors().map((d) => (
            <li key={d.scope}>
              <code>{d.scope}</code> → engine: {d.ownership} · <strong>UI: {d.uiStatus}</strong>
              {d.uiStatus === 'wired' ? ' ✅' : ' (legacy-owned in UI)'} · {d.uiNote}
            </li>
          ))}
        </ul>
        <p>
          The app router owns only <strong>UI-wired</strong> scopes; every other scope is engine-capable (proven in the
          core harness) but legacy-owned in the real UI — the store never routes it, so there is no permanent Stage 16
          fallback.
        </p>
      </details>
      {statuses.length === 0 ? (
        <p>No allowlisted complex commands have run yet.</p>
      ) : (
        <table className="shadow-diagnostics-table">
          <thead>
            <tr>
              <th>Campaign</th>
              <th>Kind</th>
              <th>Aggregate</th>
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
                <td>{status.lastAggregateKind ?? '—'}</td>
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
                  <button type="button" onClick={() => router.clearDiagnostics(status.campaignId as CampaignId)}>Clear Stage 16 diagnostics</button>
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

import { getPilotScope } from './pilotScopes';
import type { ReadDecision, ReadDecisionInput, ReadDecisionMetadata, ShadowFreshnessView } from './readPathTypes';

/** Schema versions this read gateway is allowed to project from. */
export const SUPPORTED_READ_SCHEMA_VERSIONS: ReadonlySet<string> = new Set(['1.0.0']);

/** Shadow statuses that mean "a newer legacy state is still being processed". */
function isPendingNewer(status: ShadowFreshnessView): boolean {
  return status.pending || status.running || status.status === 'scheduled' || status.status === 'running';
}

/**
 * Stage 10 freshness policy — deterministic, never a bare timeout.
 *
 * The universal shadow snapshot may serve a pilot read ONLY when every one of
 * these holds; otherwise the caller falls back to the legacy read path with a
 * specific, non-secret reason:
 *   - the read flag is on and the scope is in the pilot allowlist;
 *   - a concrete campaign is requested;
 *   - the read-back snapshot belongs to exactly that campaign;
 *   - the snapshot schema version is supported;
 *   - Stage 9's last run for this campaign reached `success`;
 *   - no newer legacy state is pending/running (debounce/coordinator idle);
 *   - the reload comparison is equal (or differs only by persisted revision).
 *
 * `decideReadSource` is a PURE function: no I/O, no async, no globals. The React
 * hook feeds it the already-read status + snapshot facts. This keeps the policy
 * exhaustively testable in the Stage 10 harness and identical in the browser.
 */
export function decideReadSource(input: ReadDecisionInput): ReadDecision {
  const definition = getPilotScope(input.scope);
  const metadata: ReadDecisionMetadata = {
    scope: input.scope,
    requestedProjection: definition ? definition.projection : null,
    requestedCampaignId: input.requestedCampaignId,
    snapshotCampaignId: input.snapshotCampaignId,
    shadowRevision: input.status?.persistedRevision ?? null,
    legacyPendingNewer: input.status ? isPendingNewer(input.status) : false,
    lastShadowSuccess: input.status?.lastSuccessAt ?? null,
    comparisonEqual: input.status?.comparison ? input.status.comparison.equal : null,
  };

  const decide = (source: ReadDecision['source'], fallbackReason: string | null): ReadDecision => ({
    source,
    useUniversal: source === 'universal',
    fallbackReason,
    metadata,
  });

  // 1. Flag / allowlist gate. A non-pilot or disabled scope is never universal.
  if (!input.enabled) return decide('disabled', 'read-path flag is off');
  if (!definition) return decide('disabled', 'scope is not in the pilot allowlist');
  if (!input.allowedScopes.has(input.scope)) return decide('disabled', 'scope not enabled by pilot allowlist config');

  // 2. Campaign identity must be concrete and must match the snapshot exactly.
  if (!input.requestedCampaignId) return decide('wrong_campaign', 'no campaign id resolved for consumer');
  if (input.snapshotPresent && input.snapshotCampaignId !== input.requestedCampaignId) {
    return decide('wrong_campaign', `snapshot campaign ${input.snapshotCampaignId ?? 'null'} != requested ${input.requestedCampaignId}`);
  }

  // 3. Nothing observed yet (initial load / hydration / shadow flag off).
  if (!input.status && !input.snapshotPresent) return decide('waiting_for_shadow', 'no shadow status or snapshot yet');

  // 4. Classify the last Stage 9 outcome. Any non-success maps to a specific
  //    safe fallback — the legacy path always remains usable.
  const status = input.status;
  if (status) {
    switch (status.status) {
      case 'validation_failed':
        return decide('validation_fallback', 'last shadow candidate failed blocking validation');
      case 'persistence_failed':
      case 'conflict':
        return decide('repository_failed', `shadow persistence status: ${status.status}`);
      case 'reload_mismatch':
        return decide('mismatch_fallback', 'shadow reload diverged from candidate');
      case 'adapter_failed':
        return decide('legacy_fallback', 'shadow adapter failed');
      default:
        break;
    }
    if (isPendingNewer(status)) return decide('stale_fallback', 'newer legacy state pending shadow rebuild');
    if (status.status !== 'success') return decide('stale_fallback', `shadow not at success (status: ${status.status})`);
  } else {
    // Snapshot present but no live status (e.g. read flag on, shadow flag off in
    // this tab): we cannot confirm freshness -> never blindly use universal.
    return decide('waiting_for_shadow', 'snapshot present but no live shadow status to confirm freshness');
  }

  // 5. Snapshot must actually be readable and schema-supported.
  if (!input.snapshotPresent) return decide('unavailable', 'shadow reported success but snapshot missing');
  if (!input.snapshotSchemaVersion || !SUPPORTED_READ_SCHEMA_VERSIONS.has(input.snapshotSchemaVersion)) {
    return decide('repository_failed', `unsupported snapshot schema version: ${input.snapshotSchemaVersion ?? 'null'}`);
  }

  // 6. Reload comparison must be clean (equal, or revision-only which is expected).
  if (status.comparison && !(status.comparison.equal || status.comparison.revisionOnly)) {
    return decide('mismatch_fallback', 'reload comparison not equal');
  }

  // 7. Fresh, valid, campaign-matched -> serve from the universal snapshot.
  return decide('universal', null);
}

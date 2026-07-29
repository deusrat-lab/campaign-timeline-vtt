import { useEffect, useMemo, useState } from 'react';
import {
  decideReadSource,
  getPilotScope,
} from '../../domain';
import type {
  CampaignId,
  CampaignSnapshot,
  ReadDecision,
  ShadowFreshnessView,
} from '../../domain';
import { useShadowIntegration } from '../shadow-integration/ShadowIntegrationProvider';
import { useReadPath } from './ReadPathProvider';

interface SnapshotFacts {
  present: boolean;
  campaignId: string | null;
  schemaVersion: string | null;
  snapshot: CampaignSnapshot | null;
}

const ABSENT: SnapshotFacts = { present: false, campaignId: null, schemaVersion: null, snapshot: null };

/**
 * Stage 10 — the single hook a pilot consumer uses to obtain a guarded read.
 *
 * It reads the (already-persisted, already-reload-verified) Stage 9 shadow
 * snapshot for `campaignId` READ-ONLY, folds in the live Stage 9 status, and
 * runs the pure freshness policy (`decideReadSource`). It returns a structured
 * decision plus — only when the decision is `universal` — the snapshot to
 * project from. On every fallback outcome the snapshot is withheld so the caller
 * renders legacy data. It never writes, never mutates, never calls commands.
 *
 * Re-evaluates when the campaign's shadow status changes (new revision, pending,
 * failure) so a mutation temporarily drops to legacy and a later success resumes
 * universal — without any visual flash of the wrong campaign's data.
 */
export function useUniversalRead(scope: string, campaignId: CampaignId | null): {
  decision: ReadDecision;
  snapshot: CampaignSnapshot | null;
} {
  const { enabled, allowedScopes, readShadowSnapshot } = useReadPath();
  const { statuses } = useShadowIntegration();
  const definition = getPilotScope(scope);

  const status: ShadowFreshnessView | null = useMemo(() => {
    if (!campaignId) return null;
    const found = statuses.find((entry) => entry.campaignId === campaignId);
    if (!found) return null;
    return {
      status: found.status,
      pending: found.pending,
      running: found.running,
      candidateRevision: found.candidateRevision,
      persistedRevision: found.persistedRevision,
      lastSuccessAt: found.lastSuccessAt,
      comparison: found.comparison ? { equal: found.comparison.equal, revisionOnly: found.comparison.revisionOnly } : null,
    };
  }, [statuses, campaignId]);

  // Read the persisted shadow snapshot (read-only). Re-run when identity of the
  // campaign or its persisted revision/status changes.
  const revisionKey = status ? `${status.status}:${status.persistedRevision ?? 'none'}` : 'no-status';
  const [facts, setFacts] = useState<SnapshotFacts>(ABSENT);

  useEffect(() => {
    let cancelled = false;
    if (!enabled || !readShadowSnapshot || !campaignId) {
      setFacts(ABSENT);
      return () => {
        cancelled = true;
      };
    }
    void readShadowSnapshot(campaignId)
      .then((snapshot) => {
        if (cancelled) return;
        if (!snapshot) {
          setFacts(ABSENT);
          return;
        }
        setFacts({
          present: true,
          campaignId: snapshot.metadata.campaignId,
          schemaVersion: snapshot.schemaVersion,
          snapshot,
        });
      })
      .catch(() => {
        if (!cancelled) setFacts(ABSENT);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled, readShadowSnapshot, campaignId, revisionKey]);

  const decision = useMemo(
    () =>
      decideReadSource({
        enabled,
        allowedScopes,
        scope,
        requestedCampaignId: campaignId,
        status,
        snapshotPresent: facts.present,
        snapshotCampaignId: facts.campaignId,
        snapshotSchemaVersion: facts.schemaVersion,
      }),
    [enabled, allowedScopes, scope, campaignId, status, facts],
  );

  // Guard: only ever hand back a snapshot whose campaign matches AND that the
  // scope is entitled to project (belt-and-braces on the pure decision above).
  const snapshot = useMemo(() => {
    if (!decision.useUniversal || !definition) return null;
    if (!facts.snapshot || facts.snapshot.metadata.campaignId !== campaignId) return null;
    return facts.snapshot;
  }, [decision.useUniversal, definition, facts.snapshot, campaignId]);

  return { decision, snapshot };
}

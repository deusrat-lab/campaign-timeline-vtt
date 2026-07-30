import { useMemo } from 'react';
import { buildScopeViewModel, getPilotScope } from '../../domain';
import type {
  CampaignId,
  CampaignSnapshot,
  CampaignSummaryViewModel,
  EntityListViewModel,
  ObserverStatusViewModel,
  ReadDecision,
  RuntimePresentationViewModel,
} from '../../domain';
import { useUniversalRead } from '../read-path/useUniversalRead';

/**
 * Stage 11 — the single hook a REAL application read-only section uses to obtain
 * a normalized view model, sourced from either the validated universal shadow
 * snapshot (when the Stage 10 gateway decides `universal`) or the live legacy
 * snapshot passed in (every fallback outcome). It reuses the exact Stage 10
 * gateway (`useUniversalRead`) and the exact shared view-model builders
 * (`buildScopeViewModel`), so the domain-level Stage 10/11 harness and the
 * browser build the identical model from the identical projection.
 *
 * It NEVER writes, NEVER mutates, NEVER invokes universal commands. The section
 * presentational component only ever receives a finished, immutable view model —
 * it does not know or care whether the source was universal or legacy.
 */
export type UniversalSectionViewModel =
  | CampaignSummaryViewModel
  | EntityListViewModel
  | ObserverStatusViewModel
  | RuntimePresentationViewModel;

export interface UniversalSectionResult {
  /** Structured read decision (source + non-secret metadata + fallback reason). */
  decision: ReadDecision;
  /** True when the section is actually reading the universal shadow snapshot. */
  useUniversal: boolean;
  /** The normalized, immutable view model, or null while no source is available. */
  viewModel: UniversalSectionViewModel | null;
  /** True when a source snapshot (universal or legacy) exists for this render. */
  hasSource: boolean;
}

export function useUniversalSection(
  scope: string,
  campaignId: CampaignId | null,
  legacySnapshot: CampaignSnapshot | null,
): UniversalSectionResult {
  const definition = getPilotScope(scope);
  const { decision, snapshot: universalSnapshot } = useUniversalRead(scope, campaignId);

  // Fallback identity is always legacy — the universal snapshot is only ever the
  // source when the pure gateway decided `universal` AND handed one back.
  const sourceSnapshot = decision.useUniversal ? universalSnapshot : legacySnapshot;

  const viewModel = useMemo<UniversalSectionViewModel | null>(() => {
    if (!definition || !sourceSnapshot) return null;
    try {
      return buildScopeViewModel(definition.projection, definition.variant, sourceSnapshot);
    } catch {
      // A projection failure must degrade to "no data", never to a wrong-audience
      // or partially-built model. Stage 10 already re-routes such scopes to a
      // legacy fallback; this is the last belt-and-braces guard.
      return null;
    }
  }, [definition, sourceSnapshot]);

  return {
    decision,
    useUniversal: decision.useUniversal && universalSnapshot != null,
    viewModel,
    hasSource: sourceSnapshot != null,
  };
}

import { getPilotScope } from '../../domain';
import type { CampaignId, CampaignSnapshot } from '../../domain';
import { UNIVERSAL_READ_PATH_ENABLED } from '../../config';
import { useUniversalSection } from './useUniversalSection';
import { SectionBody } from './SectionBodies';
import './universalSections.css';

/**
 * Stage 11 — a single REAL, in-workflow read-only section backed by the guarded
 * universal read path, with a deterministic legacy fallback. It is ADDITIVE: it
 * is a new band mounted inside an existing page (the Greyholm entity library, the
 * user-campaign library). When the Stage 10 read flag is OFF it renders NOTHING,
 * so the host page is visually identical to its pre-Stage-11 baseline in both the
 * "both flags off" and "shadow on + read off" combinations.
 *
 * When the flag is ON it renders the shared presentational body from the shared
 * view model — sourced from the universal shadow snapshot only when it is fresh,
 * valid and campaign-matched; otherwise from the live legacy snapshot passed in.
 * It carries NO write handlers and never mutates anything.
 */
export function UniversalSection({
  scope,
  campaignId,
  legacySnapshot,
  heading,
  compact = false,
}: {
  scope: string;
  campaignId: CampaignId | null;
  legacySnapshot: CampaignSnapshot | null;
  /** Optional override for the band heading; defaults to the scope label. */
  heading?: string;
  compact?: boolean;
}) {
  const definition = getPilotScope(scope);
  // Hooks must run unconditionally; the gateway is inert when the flag is off.
  const { decision, useUniversal, viewModel, hasSource } = useUniversalSection(
    scope,
    campaignId,
    legacySnapshot,
  );

  // Additive invisibility at baseline: no flag, no section, no DOM change.
  if (!UNIVERSAL_READ_PATH_ENABLED || !definition) return null;

  return (
    <section
      className={`usec-band${compact ? ' usec-band--compact' : ''}`}
      data-scope={scope}
      data-source={decision.source}
      data-projection={definition.projection}
    >
      <header className="usec-band-head">
        <h3>{heading ?? definition.label}</h3>
        <span className={`usec-source usec-source--${useUniversal ? 'universal' : 'legacy'}`}>
          {useUniversal ? 'universal' : 'legacy'} · {decision.source}
          {decision.fallbackReason ? ` · ${decision.fallbackReason}` : ''}
        </span>
      </header>
      <SectionBody variant={definition.variant} viewModel={viewModel} hasSource={hasSource} />
    </section>
  );
}

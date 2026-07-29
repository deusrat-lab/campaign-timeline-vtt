import { useMemo } from 'react';
import {
  buildScopeViewModel,
  getPilotScope,
} from '../../domain';
import type {
  CampaignId,
  CampaignSnapshot,
  CampaignSummaryViewModel,
  EntityListViewModel,
  ObserverStatusViewModel,
  RuntimePresentationViewModel,
} from '../../domain';
import { useUniversalRead } from './useUniversalRead';

/**
 * Stage 10 — a single read-only pilot consumer.
 *
 * It asks the guarded gateway (`useUniversalRead`) whether it may read the
 * universal shadow snapshot for this campaign+scope. When the answer is
 * `universal` it projects the SHADOW snapshot through the scope's audience
 * projection; otherwise it renders the identical view model derived from the
 * live LEGACY snapshot passed in as `legacySnapshot` (the real legacy read
 * path). Either way it renders the SAME presentational view model, so the only
 * thing that changes is the data source — never the write path, never privacy.
 *
 * The component never mutates anything and carries no write handlers.
 */
export function PilotCard({
  scope,
  campaignId,
  legacySnapshot,
}: {
  scope: string;
  campaignId: CampaignId | null;
  legacySnapshot: CampaignSnapshot | null;
}) {
  const definition = getPilotScope(scope);
  const { decision, snapshot: universalSnapshot } = useUniversalRead(scope, campaignId);

  const sourceSnapshot = decision.useUniversal ? universalSnapshot : legacySnapshot;

  const viewModel = useMemo(() => {
    if (!definition || !sourceSnapshot) return null;
    try {
      return buildScopeViewModel(definition.projection, definition.variant, sourceSnapshot);
    } catch {
      return null;
    }
  }, [definition, sourceSnapshot]);

  if (!definition) return null;

  return (
    <article className="readpath-pilot" data-scope={scope} data-source={decision.source}>
      <header className="readpath-pilot-head">
        <h3>{definition.label}</h3>
        <span className={`readpath-source readpath-source--${decision.useUniversal ? 'universal' : 'legacy'}`}>
          {decision.useUniversal ? 'universal' : 'legacy'} · {decision.source}
        </span>
      </header>
      <dl className="readpath-meta">
        <div><dt>projection</dt><dd>{definition.projection}</dd></div>
        <div><dt>campaign</dt><dd><code>{campaignId ?? '—'}</code></dd></div>
        <div><dt>shadow rev</dt><dd>{decision.metadata.shadowRevision ?? '—'}</dd></div>
        <div><dt>pending newer</dt><dd>{decision.metadata.legacyPendingNewer ? 'yes' : 'no'}</dd></div>
        <div><dt>fallback reason</dt><dd>{decision.fallbackReason ?? '—'}</dd></div>
      </dl>
      <PilotBody variant={definition.variant} viewModel={viewModel} hasSource={!!sourceSnapshot} />
    </article>
  );
}

function PilotBody({
  variant,
  viewModel,
  hasSource,
}: {
  variant: string;
  viewModel:
    | CampaignSummaryViewModel
    | EntityListViewModel
    | ObserverStatusViewModel
    | RuntimePresentationViewModel
    | null;
  hasSource: boolean;
}) {
  if (!viewModel) {
    return <p className="readpath-empty">{hasSource ? 'No data.' : 'Loading campaign data…'}</p>;
  }
  if (variant === 'summary') {
    const vm = viewModel as CampaignSummaryViewModel;
    return (
      <ul className="readpath-counts">
        <li>entities <strong>{vm.entityCount}</strong></li>
        <li>npc <strong>{vm.npcCount}</strong></li>
        <li>enemies <strong>{vm.enemyCount}</strong></li>
        <li>maps <strong>{vm.mapCount}</strong></li>
        <li>hotspots <strong>{vm.hotspotCount}</strong></li>
        <li>routes <strong>{vm.routeCount}</strong></li>
        <li>battle maps <strong>{vm.battleMapCount}</strong></li>
      </ul>
    );
  }
  if (variant === 'npcList' || variant === 'entities') {
    const vm = viewModel as EntityListViewModel;
    return (
      <div className="readpath-list">
        <p>{vm.items.length} item(s)</p>
        <ul>
          {vm.items.slice(0, 8).map((item) => (
            <li key={item.id}><code>{item.id}</code> — {item.title}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (variant === 'observer') {
    const vm = viewModel as ObserverStatusViewModel;
    return (
      <ul className="readpath-counts">
        <li>visible entities <strong>{vm.visibleEntityCount}</strong></li>
        <li>focus <strong>{vm.focusSet ? 'set' : 'none'}</strong></li>
      </ul>
    );
  }
  if (variant === 'runtime') {
    const vm = viewModel as RuntimePresentationViewModel;
    return (
      <ul className="readpath-counts">
        <li>presented card <strong>{vm.presentedCardTitle ?? '—'}</strong></li>
        <li>active battles <strong>{vm.activeBattleCount}</strong></li>
      </ul>
    );
  }
  return null;
}

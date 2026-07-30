import type {
  CampaignSummaryViewModel,
  EntityListViewModel,
  ObserverStatusViewModel,
  RuntimePresentationViewModel,
} from '../../domain';
import type { UniversalSectionViewModel } from './useUniversalSection';

/**
 * Stage 11 — SHARED, pure presentational bodies for universal read-only sections.
 *
 * These are used by BOTH the Greyholm and the user-campaign section shells, so
 * the two stacks render the same normalized data through the same components
 * without duplicated logic. They receive a finished view model and nothing else:
 * no store, no repository, no snapshot, no command callbacks, no knowledge of
 * whether the source was universal or legacy. They never mutate anything.
 *
 * They intentionally do NOT restyle the host page's own cards — they are a
 * compact, additive read-only summary band. When the section is disabled (read
 * flag off) the shell renders nothing at all, so the host page is byte-identical
 * to its pre-Stage-11 baseline.
 */

export function SummaryBandBody({ vm }: { vm: CampaignSummaryViewModel }) {
  return (
    <ul className="usec-counts">
      <li>объектов <strong>{vm.entityCount}</strong></li>
      <li>NPC <strong>{vm.npcCount}</strong></li>
      <li>врагов <strong>{vm.enemyCount}</strong></li>
      <li>карт <strong>{vm.mapCount}</strong></li>
      <li>точек <strong>{vm.hotspotCount}</strong></li>
      <li>маршрутов <strong>{vm.routeCount}</strong></li>
      <li>боевых карт <strong>{vm.battleMapCount}</strong></li>
    </ul>
  );
}

export function EntityListBody({ vm }: { vm: EntityListViewModel }) {
  if (vm.items.length === 0) {
    return <p className="usec-empty">Нет объектов.</p>;
  }
  return (
    <div className="usec-list">
      <p className="usec-list-count">{vm.items.length} объект(ов)</p>
      <ul>
        {vm.items.slice(0, 8).map((item) => (
          <li key={item.id} className="usec-list-item">
            {item.imageSrc ? (
              <img className="usec-thumb" src={item.imageSrc} alt="" loading="lazy" />
            ) : (
              <span className="usec-thumb usec-thumb--empty" aria-hidden="true" />
            )}
            <span className="usec-list-title">{item.title}</span>
          </li>
        ))}
      </ul>
      {vm.items.length > 8 && <p className="usec-more">…и ещё {vm.items.length - 8}</p>}
    </div>
  );
}

export function ObserverBody({ vm }: { vm: ObserverStatusViewModel }) {
  return (
    <ul className="usec-counts">
      <li>видимых объектов <strong>{vm.visibleEntityCount}</strong></li>
      <li>фокус <strong>{vm.focusSet ? 'задан' : 'нет'}</strong></li>
    </ul>
  );
}

export function RuntimeBody({ vm }: { vm: RuntimePresentationViewModel }) {
  return (
    <ul className="usec-counts">
      <li>показанная карточка <strong>{vm.presentedCardTitle ?? '—'}</strong></li>
      <li>активных боёв <strong>{vm.activeBattleCount}</strong></li>
    </ul>
  );
}

/** Route a view model to its body by variant. Pure and exhaustive. */
export function SectionBody({
  variant,
  viewModel,
  hasSource,
}: {
  variant: 'summary' | 'npcList' | 'entities' | 'observer' | 'runtime';
  viewModel: UniversalSectionViewModel | null;
  hasSource: boolean;
}) {
  if (!viewModel) {
    return <p className="usec-empty">{hasSource ? 'Нет данных.' : 'Загрузка данных кампании…'}</p>;
  }
  switch (variant) {
    case 'summary':
      return <SummaryBandBody vm={viewModel as CampaignSummaryViewModel} />;
    case 'npcList':
    case 'entities':
      return <EntityListBody vm={viewModel as EntityListViewModel} />;
    case 'observer':
      return <ObserverBody vm={viewModel as ObserverStatusViewModel} />;
    case 'runtime':
      return <RuntimeBody vm={viewModel as RuntimePresentationViewModel} />;
    default:
      return null;
  }
}

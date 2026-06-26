import type { BattleEntry, TimeOfDay } from '../../types';
import type { CampaignData } from '../../data/loadCampaignData';
import { BattleEntryPanel } from '../../pages/map-workspace/BattleEntryPanel';

/**
 * BattleEntry is MAP-NATIVE, not ported from dm-companion — dm-companion has
 * no concept of a "battle entry" (that's a campaign-timeline-vtt-specific
 * entity tying a map location to a launchable battle map). There is
 * therefore nothing to port; the real, already-DM-gated
 * `BattleEntryPanel` (src/pages/map-workspace/BattleEntryPanel.tsx) is
 * reused as-is inside the embedded host instead of duplicating its logic.
 *
 * This is a THIN WRAPPER, not a new implementation: it just adapts
 * BattleEntryPanel's props to the embedded host's calling convention
 * (no onEdit/onOpenConsequences/onCreateEvent routing here — those open
 * MapWorkspacePage's own existing drawers/state, which the embedded host
 * doesn't have direct access to without threading a lot of additional
 * plumbing through `openCompanion`. Documented limitation: edit/
 * consequences/create-event actions are not available from inside the
 * embedded companion window for battle entries; open the entry from the
 * main battle-entry marker layer instead for those actions).
 */
export function CompanionBattleEntryCard({
  entry,
  data,
  sourceLocationTitle,
  currentTimeOfDay,
  onClose,
}: {
  entry: BattleEntry;
  data: CampaignData;
  sourceLocationTitle?: string;
  currentTimeOfDay?: TimeOfDay;
  onClose: () => void;
}) {
  return (
    <BattleEntryPanel
      entry={entry}
      data={data}
      sourceLocationTitle={sourceLocationTitle}
      currentTimeOfDay={currentTimeOfDay}
      onClose={onClose}
      onEdit={() => {
        window.alert(
          'Редактирование боевой записи доступно из основного маркера боевой записи на карте, а не из встроенного окна компаньона.',
        );
      }}
      onOpenConsequences={() => {
        window.alert(
          'Последствия боя доступны из основного маркера боевой записи на карте, а не из встроенного окна компаньона.',
        );
      }}
      onCreateEvent={() => {
        window.alert(
          'Создание события из боевой записи доступно из основного маркера на карте, а не из встроенного окна компаньона.',
        );
      }}
    />
  );
}

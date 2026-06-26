/**
 * Time Engine topbar chip — pure presentational extraction from
 * MapWorkspacePage's workspace-topbar. Receives the resolved calendar and the
 * advance callbacks as props; never reads the store directly so it stays
 * trivially testable/reusable. Hidden controls (no automation, no triggers —
 * just manual +фаза/+день/Долгий отдых/Custom Advance/Отменить buttons) only
 * render when `!isPlayerView`.
 *
 * "+1 час" is intentionally omitted rather than forced: the underlying
 * CampaignCalendar model is phase-only (morning/noon/evening/night, no hour
 * granularity) — see src/types.ts's TimeOfDay. Adding a fake hour counter on
 * top of a phase-only model would invent precision the data doesn't have.
 */
import { useState } from 'react';
import type { CampaignCalendar, TimeOfDay } from '../../types';

const TIME_OF_DAY_LABELS: Record<TimeOfDay, string> = {
  morning: 'Утро',
  noon: 'День',
  evening: 'Вечер',
  night: 'Ночь',
};

export interface CalendarChipProps {
  calendar: CampaignCalendar;
  isPlayerView: boolean;
  onAdvancePhase: () => void;
  onAdvanceDay: () => void;
  /** Long Rest = +1 day, reset to morning (standard 5e-flavored convention,
   * not a rules engine — purely a calendar convenience). */
  onLongRest: () => void;
  /** Custom advance: DM picks how many whole days to skip ahead. */
  onCustomAdvance: (days: number) => void;
  /** Undo the last advance (phase/day/long rest/custom) — restores the exact
   * previous calendar snapshot. Disabled when there's nothing to undo. */
  onUndo: () => void;
  canUndo: boolean;
  /** Count of armed DelayedTriggers whose date has already been reached
   * (src/data/triggerUtils.ts's getPendingDateTriggers) — purely a count for
   * a subtle badge, never evaluated here. 0/undefined renders no badge. */
  pendingTriggerCount?: number;
  /** Clicking the badge should reveal/scroll to the Pending Triggers panel. */
  onPendingTriggerClick?: () => void;
}

export function CalendarChip({
  calendar,
  isPlayerView,
  onAdvancePhase,
  onAdvanceDay,
  onLongRest,
  onCustomAdvance,
  onUndo,
  canUndo,
  pendingTriggerCount = 0,
  onPendingTriggerClick,
}: CalendarChipProps) {
  const [customOpen, setCustomOpen] = useState(false);
  const [customDays, setCustomDays] = useState('1');

  return (
    <span className="calendar-chip" title="Календарь кампании (текущая арка)">
      День {calendar.currentDay} · {calendar.currentMonth} · {calendar.currentYear} ·{' '}
      {TIME_OF_DAY_LABELS[calendar.currentTimeOfDay]}
      {!isPlayerView && pendingTriggerCount > 0 && (
        <button
          className="calendar-trigger-badge"
          onClick={onPendingTriggerClick}
          title="Есть ожидающие проверки триггеры — нажмите, чтобы открыть «Ожидающие триггеры»"
        >
          ⏰ {pendingTriggerCount}
        </button>
      )}
      {!isPlayerView && (
        <>
          <button onClick={onAdvancePhase} title="Перейти к следующей фазе суток">
            + фаза
          </button>
          <button onClick={onAdvanceDay} title="Перейти к следующему дню">
            + день
          </button>
          <button onClick={onLongRest} title="Долгий отдых: +1 день, время суток сбрасывается на утро">
            Долгий отдых
          </button>
          <button
            disabled
            title="Часовая точность недоступна — календарь кампании оперирует фазами суток (утро/день/вечер/ночь), а не часами"
          >
            + час
          </button>
          <button onClick={() => setCustomOpen((v) => !v)} title="Произвольный сдвиг календаря на N дней">
            Свой сдвиг…
          </button>
          {customOpen && (
            <span className="calendar-chip-custom">
              <input
                type="number"
                min={1}
                value={customDays}
                onChange={(e) => setCustomDays(e.target.value)}
                style={{ width: '3.5em' }}
              />
              <button
                onClick={() => {
                  const days = Math.max(1, Math.floor(Number(customDays) || 1));
                  onCustomAdvance(days);
                  setCustomOpen(false);
                }}
              >
                Применить
              </button>
              <button onClick={() => setCustomOpen(false)}>Отмена</button>
            </span>
          )}
          <button onClick={onUndo} disabled={!canUndo} title="Отменить последний сдвиг календаря">
            Отменить
          </button>
        </>
      )}
    </span>
  );
}

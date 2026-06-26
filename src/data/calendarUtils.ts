/**
 * Calendar month-ordering MVP (Stage 3 closing pass). There is no existing
 * month-name-to-index lookup anywhere in the codebase — CampaignCalendar's
 * `currentMonth` and CampaignEvent/DelayedTrigger `date.month` fields are
 * plain free-text strings (see src/types.ts), and the only concrete month
 * name that appears anywhere in code, data, or docs is the default
 * 'Незериум' (src/state/overlay.ts DEFAULT_CALENDAR). This module gives the
 * DM-authored campaign calendar a SAFE ordering mechanism without inventing
 * any names: only months explicitly listed below are ever compared against
 * each other; everything else falls back to the old conservative
 * same-month-only behavior (see compareCampaignDates).
 *
 * IMPORTANT: do not guess additional fantasy month names. If/when the real
 * campaign calendar's full month list becomes known (e.g. the DM documents
 * it), extend CAMPAIGN_MONTH_ORDER below — nothing else in the app needs to
 * change, since every lookup goes through getMonthOrder().
 */
import type { CampaignCalendar, TimeOfDay } from '../types';

/**
 * Known campaign month names in their correct in-fiction order, 0-indexed.
 * TODO(calendar): extend this array if the campaign introduces/reveals more
 * named months — only 'Незериум' (the DEFAULT_CALENDAR seed value) is
 * confirmed today, so the rest are clearly-labeled placeholders that must be
 * replaced with the real names before they're trusted for cross-month
 * comparisons. Placeholder entries are intentionally commented out so
 * getMonthOrder() never silently treats a guessed name as authoritative.
 */
export const CAMPAIGN_MONTH_ORDER: string[] = [
  'Незериум',
  // TODO(calendar): add the next confirmed month name here, in order, e.g.:
  // 'Имя следующего месяца',
];

const TIME_OF_DAY_ORDER: TimeOfDay[] = ['morning', 'noon', 'evening', 'night'];

/** Returns the 0-based index of a month name in CAMPAIGN_MONTH_ORDER, or
 * null when the name isn't recognized — callers must treat null as "unknown
 * ordering", never as 0. */
export function getMonthOrder(monthName: string): number | null {
  const idx = CAMPAIGN_MONTH_ORDER.indexOf(monthName);
  return idx === -1 ? null : idx;
}

export interface CampaignDateLike {
  day: number;
  month: string;
  year: number;
}

/**
 * Total-ordering compare for two campaign dates, safe under unknown month
 * names. Returns negative if a < b, positive if a > b, 0 if equal/
 * incomparable-but-equal-looking.
 *
 * - Year is always compared first (always safe — years are plain numbers).
 * - If the years differ, that's decisive.
 * - If the years match: when BOTH months resolve via getMonthOrder(), compare
 *   month order, then day. This is the new capability over the old MVP.
 * - When either month is unrecognized, fall back to the original
 *   conservative behavior: only compare by day if the month STRINGS are
 *   identical; otherwise treat them as incomparable (returns 0 — "not
 *   provably ordered either way"), exactly matching the previous
 *   triggerUtils.ts behavior of never claiming a cross-month date is reached
 *   when there's no ordering data.
 */
export function compareCampaignDates(a: CampaignDateLike, b: CampaignDateLike): number {
  if (a.year !== b.year) return a.year - b.year;

  const aMonthIdx = getMonthOrder(a.month);
  const bMonthIdx = getMonthOrder(b.month);

  if (aMonthIdx !== null && bMonthIdx !== null) {
    if (aMonthIdx !== bMonthIdx) return aMonthIdx - bMonthIdx;
    return a.day - b.day;
  }

  // Conservative fallback: identical month string within the same year still
  // compares by day; anything else is not provably ordered.
  if (a.month === b.month) return a.day - b.day;
  return 0;
}

function isTimeOfDayReached(triggerPhase: TimeOfDay | undefined, currentPhase: TimeOfDay): boolean {
  if (!triggerPhase) return true;
  return TIME_OF_DAY_ORDER.indexOf(currentPhase) >= TIME_OF_DAY_ORDER.indexOf(triggerPhase);
}

/**
 * Whether `triggerDate` (and `triggerTimeOfDay`, if supplied) has been
 * reached or passed by `calendar`'s current date/time. Mirrors (and now
 * subsumes) triggerUtils.ts's old isDateReached(), but additionally resolves
 * cross-month-same-year dates when both months are in CAMPAIGN_MONTH_ORDER.
 * When the months involved are NOT both recognized, this preserves the old
 * conservative guarantee: a cross-month date within the same year is never
 * claimed "reached" — the DM can always use the manual Apply button.
 */
export function isCampaignDateReached(
  triggerDate: CampaignDateLike,
  calendar: CampaignCalendar,
  triggerTimeOfDay?: TimeOfDay,
): boolean {
  const current: CampaignDateLike = {
    day: calendar.currentDay,
    month: calendar.currentMonth,
    year: calendar.currentYear,
  };

  const aMonthIdx = getMonthOrder(triggerDate.month);
  const bMonthIdx = getMonthOrder(current.month);
  const bothMonthsKnown = aMonthIdx !== null && bMonthIdx !== null;
  const sameMonthString = triggerDate.month === current.month;

  if (!bothMonthsKnown && !sameMonthString) {
    // Conservative legacy behavior: only a strictly earlier year counts as
    // definitely reached when the months can't be compared at all.
    if (triggerDate.year < current.year) return true;
    return false;
  }

  const cmp = compareCampaignDates(triggerDate, current);
  if (cmp > 0) return false; // trigger date is still in the future
  if (cmp < 0) return true; // trigger date is unambiguously in the past

  // cmp === 0: exact same day (or, in the legacy fallback path, "equal" only
  // means same month string + same day, which compareCampaignDates already
  // guarantees here) — now also check time-of-day.
  return isTimeOfDayReached(triggerTimeOfDay, calendar.currentTimeOfDay);
}

/** True when a date trigger's month (or the calendar's current month) isn't
 * in CAMPAIGN_MONTH_ORDER, i.e. cross-month comparisons for this pair fall
 * back to the conservative legacy behavior. Used purely for the DM-facing
 * "order not fully known" inline note — never affects evaluation itself. */
export function isMonthOrderUnknownForDate(triggerDate: CampaignDateLike, calendar: CampaignCalendar): boolean {
  return getMonthOrder(triggerDate.month) === null || getMonthOrder(calendar.currentMonth) === null;
}

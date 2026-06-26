/**
 * Delayed Trigger MVP evaluation helpers (Stage 3). These functions only ever
 * compute which triggers are PENDING for DM review — nothing here applies an
 * effect or mutates store state. The DM always reviews and clicks "Apply" /
 * "Resolve" / "Cancel" manually (see the Pending Triggers panel in
 * MapWorkspacePage.tsx). The free-text `condition` field is never parsed.
 */
import type { CampaignCalendar, DelayedTrigger } from '../types';
import { isCampaignDateReached } from './calendarUtils';

export function getTriggersForTimeline(
  triggersById: Record<string, DelayedTrigger>,
  timelineId: string,
): DelayedTrigger[] {
  return Object.values(triggersById).filter((t) => t.timelineId === timelineId);
}

export function getArmedTriggersForTimeline(
  triggersById: Record<string, DelayedTrigger>,
  timelineId: string,
): DelayedTrigger[] {
  return getTriggersForTimeline(triggersById, timelineId).filter((t) => t.status === 'armed');
}

/** Date triggers (`triggerType === 'date'`) that are armed and whose date (and
 * time-of-day, if set) has been reached or passed by the given calendar. */
export function getPendingDateTriggers(
  triggers: DelayedTrigger[],
  calendar: CampaignCalendar,
): DelayedTrigger[] {
  return triggers.filter((t) => {
    if (t.status !== 'armed' || t.triggerType !== 'date' || !t.date) return false;
    // isCampaignDateReached already folds in the time-of-day check for the
    // exact-day case (via compareCampaignDates' equality branch), including
    // for cross-month-same-year dates now that both months are known.
    return isCampaignDateReached(t.date, calendar, t.timeOfDay);
  });
}

/** `party_completes_route` triggers pending for a just-completed route, plus
 * `party_reaches_route_point` triggers — MVP only evaluates the latter when
 * `routePointIndex` is explicitly supplied (no partial-travel simulation). */
export function getPendingRouteTriggers(
  triggers: DelayedTrigger[],
  routeId: string,
  routePointIndex?: number,
): DelayedTrigger[] {
  return triggers.filter((t) => {
    if (t.status !== 'armed' || t.routeId !== routeId) return false;
    if (t.triggerType === 'party_completes_route') return true;
    if (t.triggerType === 'party_reaches_route_point') {
      return routePointIndex !== undefined && t.routePointIndex === routePointIndex;
    }
    return false;
  });
}

export interface EvaluatePendingTriggersInput {
  triggers: DelayedTrigger[];
  calendar?: CampaignCalendar;
  routeId?: string;
  routePointIndex?: number;
  /** Reserved for future filtering by the event that just happened — unused
   * in this MVP, kept optional so callers can pass it without effect. */
  eventType?: string;
}

/**
 * Convenience combinator: runs whichever of the date/route checks are
 * applicable given the supplied context and returns the union (deduped) of
 * pending triggers. `manual` triggers never appear here — they only ever
 * show up in the full armed list for the DM to fire by hand. Quest-status
 * auto-evaluation is intentionally NOT implemented: QuestStatus overrides
 * live in CampaignProgress keyed by quest id with no "just changed" signal
 * available at trigger-evaluation time, so wiring it up safely is non-trivial
 * for this MVP and is left as a follow-up (see TODO in MapWorkspacePage.tsx
 * near the Pending Triggers panel).
 */
export function evaluatePendingTriggers(input: EvaluatePendingTriggersInput): DelayedTrigger[] {
  const seen = new Set<string>();
  const result: DelayedTrigger[] = [];

  if (input.calendar) {
    for (const t of getPendingDateTriggers(input.triggers, input.calendar)) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        result.push(t);
      }
    }
  }

  if (input.routeId) {
    for (const t of getPendingRouteTriggers(input.triggers, input.routeId, input.routePointIndex)) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        result.push(t);
      }
    }
  }

  return result;
}

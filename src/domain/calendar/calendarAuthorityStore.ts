/**
 * Block I — durable timeline-calendar authority.
 *
 * Promotes Greyholm's per-timeline calendar state (`calendarsByTimelineId` /
 * `CampaignCalendar` — day/month/year/time-of-day, mutated by the
 * SET_CALENDAR / ADVANCE_TIME_PHASE / ADVANCE_DAY reducer cases in
 * `campaignStore.tsx`, driven by the map toolbar's +phase / +day / "Долгий
 * отдых" (long rest, repeated phase-advance) / "Свой сдвиг" (custom
 * day/phase shift) / undo controls in `MapWorkspacePage.tsx`) to the SOLE,
 * unconditional active authority for this concern, following the exact
 * discipline Decision 2 established for battles and this Block I's
 * `fieldAuthorityStore.ts` established for entity-keyed values: a candidate
 * WHOLE calendar snapshot for a given timelineId is committed to an
 * isolated, campaign-scoped, expected-revision-guarded universal namespace,
 * verified read-after-write, and only THEN is the committed snapshot
 * projected into the existing legacy dispatch as a deterministic
 * compatibility write. There is never an independent legacy business
 * decision and never a second universal write.
 *
 * This is an ENTITY-KEYED whole-object commit (mirrors `fieldAuthorityStore.ts`,
 * keyed by timelineId the same way that module is keyed by entityId), not a
 * whole-collection commit (`arcAuthorityStore.ts` / `zoneAuthorityStore.ts`),
 * because each timeline owns exactly one independent `CampaignCalendar` and
 * every legacy mutation (SET_CALENDAR/ADVANCE_TIME_PHASE/ADVANCE_DAY) always
 * replaces that one timeline's calendar whole, never diffs across timelines.
 *
 * Greyholm-only: Caldran (`userCampaignStore.tsx` / `src/types/userCampaign.ts`)
 * has NO calendar/timeline data model at all (confirmed by grep — no
 * `calendarsByTimelineId`, `CampaignCalendar`, or any `calendar`-named field
 * anywhere in that store or its types) — same asymmetry precedent as
 * `partyPositionAuthorityStore.ts`.
 *
 * Plain, always-on module — no feature flag, no diagnostics namespace, no
 * recovery queue, no React provider — imported and called directly and
 * unconditionally from `campaignStore.tsx`, exactly like
 * `fieldAuthorityStore.ts` / `presentedCardAuthorityStore.ts` /
 * `battleAuthorityStore.ts` / `revealAuthorityStore.ts` /
 * `partyPositionAuthorityStore.ts` / `arcAuthorityStore.ts`.
 */
import type { CampaignId } from '../campaign/ids';
import type { RepositoryStorage } from '../repository/shadowRepository';

export const UNIVERSAL_CALENDAR_NAMESPACE = 'campaign-timeline-vtt:universal-calendar:v1';

export type CalendarAuthorityKind = 'greyholm.calendar';

const TIME_OF_DAY_VALUES = ['morning', 'noon', 'evening', 'night'] as const;
export type CalendarTimeOfDay = (typeof TIME_OF_DAY_VALUES)[number];

/** Plain mirror of `CampaignCalendar` (this module must not depend on
 * app-level types). */
export interface CalendarSnapshot {
  currentDay: number;
  currentMonth: string;
  currentYear: number;
  currentTimeOfDay: CalendarTimeOfDay;
}

export interface StoredCalendar {
  calendar: CalendarSnapshot;
  revision: number;
}

function calendarKey(campaignId: CampaignId, kind: CalendarAuthorityKind, timelineId: string): string {
  return `${UNIVERSAL_CALENDAR_NAMESPACE}:${campaignId}:${kind}:${timelineId}`;
}

function isValidCalendar(value: unknown): value is CalendarSnapshot {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.currentDay === 'number' && Number.isFinite(v.currentDay) &&
    typeof v.currentMonth === 'string' && v.currentMonth.length > 0 &&
    typeof v.currentYear === 'number' && Number.isFinite(v.currentYear) &&
    typeof v.currentTimeOfDay === 'string' &&
    (TIME_OF_DAY_VALUES as readonly string[]).includes(v.currentTimeOfDay)
  );
}

/** Invariant: field shapes must be exactly as declared above. Reject before
 * persisting, never after — mirrors `checkFieldInvariant`/`checkZonesInvariant`. */
function checkCalendarInvariant(calendar: CalendarSnapshot): string | null {
  if (!isValidCalendar(calendar)) {
    return 'calendar must be a well-formed {currentDay, currentMonth, currentYear, currentTimeOfDay}';
  }
  return null;
}

export function readStoredCalendar(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: CalendarAuthorityKind,
  timelineId: string,
): StoredCalendar | null {
  const raw = storage.getItem(calendarKey(campaignId, kind, timelineId));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredCalendar;
    if (typeof parsed?.revision !== 'number') return null;
    if (!isValidCalendar(parsed.calendar)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export interface CalendarCommitOutcome {
  ok: boolean;
  newRevision?: number;
  /** The durably-committed calendar, read back — always what the caller
   * should project into the legacy compatibility write, never its own
   * candidate. */
  calendar?: CalendarSnapshot;
  error?: string;
}

/**
 * Atomically commit a whole calendar snapshot for one timeline under an
 * expected-revision guard (current stored revision, or 0 when never
 * committed), verify it read-after-write, and return the committed
 * snapshot for the caller's legacy compatibility projection.
 */
export function commitCalendar(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: CalendarAuthorityKind,
  timelineId: string,
  calendar: CalendarSnapshot,
): CalendarCommitOutcome {
  const invariant = checkCalendarInvariant(calendar);
  if (invariant) return { ok: false, error: invariant };

  const existing = readStoredCalendar(storage, campaignId, kind, timelineId);
  const expectedRevision = existing?.revision ?? 0;
  const newRevision = expectedRevision + 1;
  const record: StoredCalendar = { calendar, revision: newRevision };
  storage.setItem(calendarKey(campaignId, kind, timelineId), JSON.stringify(record));

  const readBack = readStoredCalendar(storage, campaignId, kind, timelineId);
  if (!readBack || readBack.revision !== newRevision) {
    return { ok: false, error: 'commit not visible read-after-write' };
  }
  return { ok: true, newRevision, calendar: readBack.calendar };
}

/** Current durable revision for a timeline's calendar (0 when never
 * committed). */
export function calendarRevision(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: CalendarAuthorityKind,
  timelineId: string,
): number {
  return readStoredCalendar(storage, campaignId, kind, timelineId)?.revision ?? 0;
}

/** Reload/bootstrap: the durably-committed calendar if one exists, else null
 * (caller falls back to its own legacy seed — the one allowed migration
 * boundary, for a timeline that predates this cutover / was never
 * committed). */
export function readCalendar(
  storage: RepositoryStorage,
  campaignId: CampaignId,
  kind: CalendarAuthorityKind,
  timelineId: string,
): CalendarSnapshot | null {
  return readStoredCalendar(storage, campaignId, kind, timelineId)?.calendar ?? null;
}

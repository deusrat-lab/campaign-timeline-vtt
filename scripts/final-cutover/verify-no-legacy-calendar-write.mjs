// Block I anti-legacy guard for the timeline-calendar authority cutover
// (Greyholm setCalendar/advanceTimePhase/advanceDay): fails if
// campaignStore.tsx stops routing every calendar write through the
// unconditional `commitCalendar` whole-snapshot sole-authority choke point,
// or if a bypass path (a direct `dispatch({ type: 'SET_CALENDAR', ...})` /
// `dispatch({ type: 'ADVANCE_TIME_PHASE', ...})` / `dispatch({ type:
// 'ADVANCE_DAY', ...})` outside the three store methods) is reintroduced.
// Greyholm-only subsystem -- Caldran (userCampaignStore.tsx) has no
// calendar/timeline data model at all (see
// src/domain/calendar/calendarAuthorityStore.ts header).
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
let failed = [];

function read(path) {
  return readFileSync(resolve(root, path), 'utf8');
}

// --- Greyholm: campaignStore.tsx --------------------------------------------
{
  const file = 'src/state/campaignStore.tsx';
  const text = read(file);

  const commitCount = (text.match(/commitCalendar\(greyholmBattleStorage\(\),\s*GREYHOLM_UNIVERSAL_CAMPAIGN_ID,\s*'greyholm\.calendar'/g) ?? []).length;
  if (commitCount < 3) {
    failed.push(`${file}: expected 3 calls to commitCalendar (setCalendar/advanceTimePhase/advanceDay), found ${commitCount} -- Greyholm calendar no longer routes through universal calendar authority for all three action creators`);
  }

  // Every dispatch of the three calendar action types must occur only
  // inside the three converted store methods, always projecting the
  // committed value (dispatch({ type: 'SET_CALENDAR', timelineId, calendar:
  // outcome.calendar })) -- a bare ADVANCE_TIME_PHASE/ADVANCE_DAY dispatch,
  // or a SET_CALENDAR dispatch not sourced from outcome.calendar, would mean
  // a write bypassing the universal commit.
  const bareAdvancePhase = /dispatch\(\{\s*type:\s*'ADVANCE_TIME_PHASE'/.test(text);
  if (bareAdvancePhase) {
    failed.push(`${file}: forbidden direct dispatch of ADVANCE_TIME_PHASE reintroduced -- must go through commitCalendar and project as SET_CALENDAR`);
  }
  const bareAdvanceDay = /dispatch\(\{\s*type:\s*'ADVANCE_DAY'/.test(text);
  if (bareAdvanceDay) {
    failed.push(`${file}: forbidden direct dispatch of ADVANCE_DAY reintroduced -- must go through commitCalendar and project as SET_CALENDAR`);
  }

  const setCalendarDispatchCount = (text.match(/dispatch\(\{\s*type:\s*'SET_CALENDAR'/g) ?? []).length;
  const projectedFromOutcomeCount = (text.match(/dispatch\(\{\s*type:\s*'SET_CALENDAR',\s*timelineId,\s*calendar:\s*outcome\.calendar\s*\}\)/g) ?? []).length;
  if (setCalendarDispatchCount !== 3 || projectedFromOutcomeCount !== 3) {
    failed.push(`${file}: expected exactly 3 SET_CALENDAR dispatches, all projecting outcome.calendar (found ${setCalendarDispatchCount} total, ${projectedFromOutcomeCount} projecting outcome.calendar) -- calendar writes must always project the durably-committed value, never a raw candidate`);
  }
}

if (failed.length) {
  console.error('LEGACY_CALENDAR_WRITE_GUARD_FAIL:');
  for (const f of failed) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(JSON.stringify({ ok: true, filesChecked: 1, verdict: 'NO_LEGACY_CALENDAR_WRITE_PATH_FOUND' }));

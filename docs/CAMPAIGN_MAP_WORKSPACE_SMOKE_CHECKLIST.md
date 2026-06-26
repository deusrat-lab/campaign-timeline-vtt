# Campaign Map Workspace — Smoke Checklist

Practical, short checklist for verifying the app actually *runs* after a change —
not a product spec. Run this whenever touching `MapWorkspacePage.tsx` or any
`src/pages/map-workspace/*` file, especially before trusting `typecheck`/`build`
alone.

**Why this exists**: a Rules-of-Hooks violation (a `useState` declared after the
`if (loading) return` / `if (error || !data) return` guards in
`MapWorkspacePage.tsx`) shipped silently for several stages and rendered the
entire app blank on every load. `npm run typecheck` and `npm run build` both
passed the whole time — neither can catch this class of bug. It was only found
once someone actually opened the app in a browser.

## Gate levels

**Required before every stage report — no exceptions, takes seconds:**
```bash
npm run typecheck
npm run build
npm run lint:hooks
```
`lint:hooks` runs the full ESLint pass but only fails on
`react-hooks/rules-of-hooks` — the one category that can crash the app to a
blank screen (see "Why this exists" above). It ignores every other lint rule
on purpose; see `docs/TECH_DEBT.md` for what's still red in plain `npm run lint`
and why. There's also `npm run lint:runtime`, which just chains
`lint:hooks && typecheck && build` for convenience.

**Required before any report touching `MapWorkspacePage.tsx`, `src/pages/map-workspace/*`,
or anything map/battle/UI-facing:**
```bash
npm run dev        # or the preview tool, campaign-timeline-vtt entry on port 5175
```
Then actually do the reload smoke (§1), a console check (§2), and whichever
of §3–§8 are relevant to what you changed. A green `lint:hooks`/`typecheck`/
`build` is necessary but not sufficient — none of them open a browser.

**Full lint status**: `npm run lint` (no suffix) currently still reports a
handful of errors — these are real findings, not ignored, but deliberately
not fixed yet because doing so safely would mean touching the two most
central state files in the app. See `docs/TECH_DEBT.md` for the exact list,
why each one is there, and the recommended approach if anyone tackles them
later. Rule of thumb: if you touch a file that already has lint debt, don't
make it worse; if you can fix one trivially and safely while you're already
in that file for an unrelated reason, do — but don't go looking for this work
on its own.

## 1. App load smoke
- [ ] Run `npm run dev` (or use the preview tool with the `campaign-timeline-vtt`
      entry in `.claude/launch.json`, port 5175).
- [ ] Load `/` — page is **not** blank.
- [ ] NavBar renders (arc switcher, mode switcher, "Открыть Observer" button).
- [ ] Map canvas, location markers, layer selector all render.
- [ ] Calendar chip renders (день/месяц/год + фаза controls).
- [ ] Reload the page — it still renders (this is the case that catches hook-order bugs:
      the first render has `loading=true`, the second has real data).
- [ ] Switch DM View → DM Edit → Player View and back — no blank screen on any switch.

## 2. Hooks/runtime smoke
- [ ] `npm run lint:hooks` is **mandatory**, not optional — run it alongside
      `typecheck`/`build` every time, not just when something looks wrong
      (see "Gate levels" above). A different, lower-severity category like
      `react-hooks/set-state-in-effect` or `react-refresh/only-export-components`
      failing in plain `npm run lint` is documented pre-existing technical
      debt (`docs/TECH_DEBT.md`), not a release blocker — `rules-of-hooks`
      failing IS a blocker, it means the app can crash to a blank screen.
      `eslint-plugin-react-hooks` (already in `eslint.config.js`) **will**
      catch "hook after early return" and "hook called inside a callback" —
      but only if someone runs it.
- [ ] If `npm run lint` ever flags an unused/dead file (e.g. a page component
      not referenced by any `<Route>` in `App.tsx`), confirm it's truly
      unrouted with `grep -rn "ComponentName" src/` before fixing its hooks —
      deleting a genuinely-dead file is often the safer fix over patching code
      nobody runs.
- [ ] In the running browser, open devtools console and look for:
      `React has detected a change in the order of Hooks` — if present, the
      page is silently broken even if it looks fine on the very first paint.
- [ ] Grep check (cheap, no browser needed): every `if (...) return ...;` /
      `if (...) return null;` inside a component function must come **after**
      every hook call in that same function. `MapWorkspacePage`'s main early
      returns are at the top of the function body (`if (loading) return`,
      `if (error || !data) return`) — anything declared as a hook below those
      two lines is a bug. Don't add new `useState`/`useEffect`/etc. calls below
      them; add them up near the other hooks instead.
- [ ] Watch for hooks named `useSomething` that aren't real hooks (a plain
      helper function named with a `use` prefix trips the lint rule even when
      it calls no hooks itself) — rename rather than disable the lint rule.

## 3. Route editor smoke
- [ ] Create a new route by clicking the map (≥2 points required to save).
- [ ] Drag a route point, delete a route point (blocked below the minimum).
- [ ] Party moves along `route.points` when travelling a route — never a
      straight diagonal line.

## 4. Party token smoke
- [ ] Party marker is visible, distinct from location/route/quick-pin markers.
- [ ] Manual party movement only available in the correct mode.
- [ ] Reload — party position persists.

## 5. Player Safe / Observer smoke
- [ ] Switch to Player View — DM notes, hidden routes/zones/events/battle
      entries are not visible.
- [ ] Open `/observer` — no NavRail/NavBar, no edit controls, only player-safe
      projected data.
- [ ] Confirm in devtools that Observer never reads a raw `*ById` map directly
      (it should always go through a `getPlayerSafe*` function).

## 6. BattleEntry launch smoke
- [ ] **Don't fight the map canvas for this.** The canvas uses pan/zoom
      transforms, so synthetic/automated clicks at computed coordinates are
      unreliable — they tend to land on whatever hotspot happens to be
      underneath rather than an empty point. For smoke-testing, use the
      DM Edit toolbar's **"Тестовая боевая сцена"** button instead — it
      creates a `BattleEntry` directly (named `Smoke Test Battle Entry`, at the
      party's position or map center, `status: 'available'`,
      `visibleInPlayerView: false`) with no map click required. Click the new
      `.battle-entry-marker` it produces to open its panel.
      Only use real map-click creation ("Новая боевая сцена") when you
      actually need to verify *that* flow specifically.
- [ ] **Archive the smoke-test entry when done** ("Архивировать / скрыть" in
      its panel) so it doesn't linger as clutter in DM Full view.
- [ ] DM Edit mode → "Новая боевая сцена" → click map → fill form → save →
      reload → entry persists.
- [ ] Select the entry, open its panel — no crash even with no linked
      enemies/quests/NPCs/battle map configured.
- [ ] `BattleMapLaunchPanel` shows: resolved battle map or a clear "не
      настроена" warning, selected variant or fallback, encounter preset chip
      or missing-warning, linked entity labels or missing fallback, return-URL
      status.
- [ ] Inspect the generated launch URL (don't necessarily click it) — confirm
      it includes `battleEntryId`, `battleMapId` (if set), `variant` (if
      selected), `encounterPresetId` (if selected), and an encoded `returnUrl`.

## 7. Battle return/consequences smoke
- [ ] Manually edit the URL to add
      `?battleEntryId=<id>&battleResult=completed&battleSummary=Test&completed=true`
      (or use the "Симулировать возврат боя" button if present).
- [ ] Confirm the entry's panel opens and the consequences draft is **prefilled**
      — nothing is written to the store yet.
- [ ] Click "Применить последствия боя".
- [ ] Confirm: entry status → completed, a `battle` CampaignEvent appears in
      `BattleHistoryPanel` with `linkedBattleEntryIds` set, location status
      updates only if the entry has a linked location, `playerSafeSummary` is
      set only if the visibility toggle was checked, URL return params are
      cleared.
- [ ] Reload — all of the above persists.

## 8. Reload persistence smoke
- [ ] After any create/edit/archive action above, reload the page and confirm
      nothing reverted.
- [ ] Export overlay JSON, then import it back — no crash, no data loss.
- [ ] If you have an overlay JSON saved from before a recent stage, import it
      and confirm it still loads (legacy-safe defaults for new `*ById` fields).

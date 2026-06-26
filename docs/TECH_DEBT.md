# Tech Debt

Short, living list of known-real-but-deliberately-deferred issues. Not a
product backlog — just things a future pass should know about before
assuming the codebase is clean.

## Lint debt

`npm run lint` is **not** fully green, and that's an intentional, documented
choice as of Stage 5G — not an oversight. `npm run lint:hooks` (only
`react-hooks/rules-of-hooks`) IS green and is the mandatory gate; see
`docs/CAMPAIGN_MAP_WORKSPACE_SMOKE_CHECKLIST.md` for gate levels.

**Remaining rules** (7 errors as of Stage 5G):

- `react-hooks/set-state-in-effect` — `src/pages/MapWorkspacePage.tsx` (4
  instances), `src/state/campaignStore.tsx` (1 instance).
- `react-refresh/only-export-components` — `src/state/campaignDataContext.tsx`
  (1), `src/state/campaignStore.tsx` (1).

**Why not fixed**: every flagged instance is a legitimate "sync state with an
external system" effect — URL search params (battle-return-flow detection),
localStorage (camera position, save status), a tool-state reset tied to
arc/map switching, and a BroadcastChannel push to the Observer tab. These are
exactly the pattern React's own docs describe as a correct use of `useEffect`
(https://react.dev/learn/you-might-not-need-an-effect) — the lint rule (part
of the React Compiler's stricter "purity" preset bundled into
`eslint-plugin-react-hooks` v7) flags them anyway, but "fixing" them would
mean restructuring real data flow in `MapWorkspacePage.tsx` and the two most
central state files in the app (`campaignStore.tsx`,
`campaignDataContext.tsx` — literally every page imports these). The
`react-refresh/only-export-components` pair has the same root cause: both
files export a Provider component alongside its companion `useX` hook in one
file, which is the standard React Context pattern but trips Vite's
fast-refresh-only-exports-components heuristic.

**Recommended future cleanup**: if these ever get addressed, do
`campaignStore.tsx` and `campaignDataContext.tsx` as two *separate*,
low-traffic sessions (one Context+Provider file, one
hook-that-imports-the-context file each) — not bundled with any product
work, and with a full live browser smoke pass (see the checklist doc)
immediately after, since these are the highest-blast-radius files in the
codebase. The `set-state-in-effect` instances likely aren't worth "fixing" at
all — they're correct code being flagged by an overly strict experimental
rule, not bugs.

**What's NOT debt**: `react-hooks/rules-of-hooks` must always be at zero. If
you ever see that rule fire, it's a real, crash-causing bug — see the "Why
this exists" note at the top of `docs/CAMPAIGN_MAP_WORKSPACE_SMOKE_CHECKLIST.md`
for the incident that motivated this whole document.

**Already cleaned up in Stage 5G** (for history, not still-open items):
`src/pages/LocationPage.tsx` was deleted (genuinely unrouted, only its
`CheckboxList` export was actually used — that's now `src/components/CheckboxList.tsx`),
which also removed a `react-hooks/purity` (impure `Date.now()` during render)
error that lived inside it. `@typescript-eslint/no-unused-vars` was given a
narrow `^_`-prefix ignore pattern in `eslint.config.js`, matching this
codebase's existing convention of naming an intentionally-unused
parameter/destructured binding with a leading underscore (e.g.
`getPlayerSafeTriggers(_triggers)` always returns `[]` by design — see
`src/data/playerSafeProjection.ts`).

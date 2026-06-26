# Campaign Map Workspace — Visual Improvement & Implementation Plan

Scope: CSS-only / low-risk visual foundation work done alongside the
architecture-hardening pass. This is intentionally conservative — anything
that risked making the existing map canvas harder to read (re-theming, layout
restructuring, animation changes) was left out of scope and is listed under
"Deferred" below.

## 1. CSS token cleanup

`src/index.css`'s `:root` block defines the actual palette
(`--bg`, `--bg-deep`, `--bg-card`, `--fg`, `--fg-dim`, `--gold`, `--gold-soft`,
`--gold-dim`, `--border`, `--accent`, `--danger`, `--green`, `--amber`,
`--purple`, `--shadow`). An audit (`grep -oE 'var\(--[a-z0-9-]+' src/index.css`
diffed against defined custom properties) found two **previously undefined**
custom properties referenced elsewhere in the file with no fallback:
`--text-muted` (used in 3 places, battle-map thumbnail/drawer subtext) and
`--bg-dark` (used once, already had an inline fallback `var(--bg-dark,
#1a1410)` so it never actually broke, but was still undefined at `:root`).

Fix — added to `:root`:

```css
--bg-dark: #1a1410;
--bg-elevated: #1c1914;
--text-muted: var(--fg-dim);
```

`--bg-elevated` was added because the new `.calendar-chip` (see §2) needed an
"elevated surface" token and none existed under that name — aliased to the
existing `--bg-card-raised` value rather than inventing a new color.

## 2. New UI surfaces and their classes

| Surface | Class | Notes |
| --- | --- | --- |
| Calendar chip (topbar) | `.calendar-chip` | Pill-shaped, gold-dim border, matches `.party-marker`'s text size/color family. |
| Travel panel | `.travel-panel` (modifier on the existing `.route-edit-toolbar.route-edit-form`) | Reuses existing route-edit-toolbar visual language rather than inventing a new panel style. |
| Observer shell | `.observer-shell`, `.observer-map-canvas`, `.observer-map-image`, `.observer-map-placeholder`, `.observer-route-layer`, `.observer-route-line`, `.observer-hotspot`, `.observer-hotspot-label`, `.observer-placement`, `.observer-party-marker` | Full-bleed, larger marker/label sizes than the DM canvas (designed for a second screen/TV at a distance). |

## 3. Route/party visual states

Added to `src/index.css`, additive only (no existing rule was changed in a
way that alters current rendering):

- `.route-invalid` — dashed stroke + reduced opacity. Intended for a route
  missing an endpoint or a drawn path (`!isRouteValid(route)`); **not yet
  wired into the SVG route renderer's className** (the renderer computes
  per-route-type stroke color inline via `ROUTE_TYPE_COLORS` rather than
  className-based styling — wiring this in would mean touching the route
  rendering loop, deferred, see below). The class exists and is documented so
  a follow-up pass can apply it via `className={isRouteValid(r) ? '' :
  'route-invalid'}` on the relevant `<polyline>`/`<path>`.
- `.route-hidden-dm-only` — dashed, very low opacity. Same deferred-wiring
  note as `.route-invalid`.
- `.route-selected` — **pre-existing**, unchanged (`drop-shadow` glow), kept
  as the canonical "this route is highlighted" treatment.
- `.route-point-handle` — gold-soft fill, dark stroke, `grab`/`grabbing`
  cursor. Documents the intended waypoint-handle look; the actual waypoint
  markers in MapWorkspacePage currently use `.waypoint-dot` (pre-existing,
  unchanged) — this class is provided for a future pass that wants a more
  SVG-native circle handle instead of the current absolutely-positioned div.

## 4. What changed vs. what's documented-but-not-wired

To stay inside "safe visual foundation only," some classes above were added
to the stylesheet and documented here, but **not yet applied** to JSX in
MapWorkspacePage.tsx, specifically `.route-invalid`, `.route-hidden-dm-only`,
and `.route-point-handle`. Applying them touches the route-rendering loop
(`ROUTE_TYPE_COLORS`-based inline styling, `ms` of SVG path generation, and
the existing `.waypoint-dot` markup) closely enough that doing it under this
task's time budget risked an unintended visual regression on the one part of
the app explicitly called out as must-not-break ("route editor, route-point
dragging... must not be broken"). They're ready for a follow-up pass to wire
in incrementally, one route-type at a time, with a visual diff check each
step.

What **was** wired end-to-end and is live: the calendar chip, the Travel
Panel, Quick Pin's form, the route list panel's new status/distance/warning
line, the Observer page's entire visual surface, and the `--bg-dark`/
`--text-muted`/`--bg-elevated` token fixes.

## 5. Deferred (explicitly out of scope for this pass)

- Re-theming or palette changes — none were made; every new class reuses
  existing tokens.
- Any change to the zoom/pan math, the SVG route-point drag math, or the
  party-marker walk animation timing — all untouched.
- Wiring `.route-invalid`/`.route-hidden-dm-only`/`.route-point-handle` into
  the actual route-rendering JSX (see §4).
- A dedicated `src/styles/tokens.css` file — the task allowed either
  creating one or "fixing existing CSS var organization" in place; given
  `index.css` is a single 1.6k-line file already organized top-down with
  `:root` at the very top, splitting tokens into a second file risked import-
  order bugs (Vite doesn't guarantee CSS file concatenation order matches
  import statement order without explicit `@import`) for a purely cosmetic
  reorganization benefit. Tokens were fixed in place instead.
- Battle-map drawer / EntityDrawer visual polish — untouched, out of scope.
- Observer page polish beyond the MVP rendering (e.g. a DM-camera-following
  smooth pan/zoom, a "connection lost" indicator if BroadcastChannel has no
  sender) — the BroadcastChannel skeleton works but has no visual affordance
  for "Observer is currently following the DM" vs. "Observer is on its own
  default view."

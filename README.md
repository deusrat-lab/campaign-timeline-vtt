# campaign-timeline-vtt

A standalone DM-facing app for tracking the campaign's timeline (Arc 1 — peace, Arc 2 — war), world/region/city maps with clickable hotspots, location state, and quest progress. It is a sibling to `dm-companion/` and `battle-map-vtt/` at the repo root — it does not modify either app.

## Relationship to the other apps

- **dm-companion**: this app reads a one-time *copy* of dm-companion's static seed JSON (`public/data/dm-companion/*.json`: locations, npcs, quests, custom-enemies, images, factions). The copies are not kept in sync automatically — re-run the copy step if dm-companion's seed data changes.
- **battle-map-vtt**: there is currently no real linkage. battle-map-vtt only persists its maps/tokens/scenes in IndexedDB (no JSON export), so this app cannot read it directly. Each location card has an "Open in Battle Map VTT" button that links out to a separate instance of that app (origin configurable via `VITE_BATTLE_MAP_VTT_ORIGIN`, see `.env.example` — unset on a server deployment shows "Боевая карта не настроена" instead of a dead `localhost` link); it's disabled until a real link is added to `src/data/battle-maps-index.json`. Combat itself normally runs through this app's own embedded battle overlay instead, which needs neither app.

## Run

```
npm install
npm run dev      # http://localhost:5175
npm run build
npx tsc -b       # typecheck
```

On macOS you can also just double-click `start-campaign-vtt.command` in Finder — it `cd`s into this folder, runs `npm install` only if `node_modules` is missing, then runs `npm run dev:open` (opens the browser automatically).

## Known limitations / TODOs

- **Battle map linkage**: `src/data/battle-maps-index.json` is an empty placeholder array. No filename-to-location mapping for `battle-map-vtt/public/battle-maps/*.jpg` could be reliably inferred — fill it in by hand as real links are confirmed.
- **Hotspot coordinates**: `src/data/hotspots.json` is empty. World maps currently render as plain placeholders (no real map images). Use the in-app "Редактор хотспотов" (hotspot editor) toggle on the Map page: click on the map to place a draft hotspot, then "Скопировать JSON" to copy the resulting array and hand-paste it into `hotspots.json` (with `locationStateId` filled in, format: `<dmCompanionLocationId>__<timelineId>`, e.g. `loc-greyholm__arc-1-peace`).
- **Arc 2 coverage**: Arc 2 only shows locations whose `arcId === 'arc-2'` in the original `locations.json` seed. Locations without an `arcId`, or with `arcId === 'arc-1'`, only appear in Arc 1 — content is never invented for Arc 2.
- **The 2 already-completed Arc 1 mini-quests**: all quests in the seed data are `status: 'active'`. The DM must manually mark the 2 mini-quests the party has already finished as "Завершённые" via the Quests panel (`/quests`) — this is intentionally not guessed/auto-marked anywhere in the code (see the `TODO(DM)` comments in `src/data/loadCampaignData.ts` and `src/pages/QuestsPage.tsx`).

## Architecture notes

- Types in `src/types/dmCompanion.ts` are a trimmed, copied mirror of the relevant interfaces from `dm-companion/src/types/index.ts` — not an import, so this app stays fully standalone.
- `src/types.ts` defines this app's own model: `Timeline`, `WorldMap`, `WorldMapState`, `Location`-derived `LocationState`, `MapHotspot`, `PartyState`, `CampaignProgress`.
- `src/data/loadCampaignData.ts` fetches the copied JSON at runtime and derives `LocationState[]` per (location, timeline) pair.
- `src/state/campaignStore.tsx` is a Context + `useReducer` store, holding `PartyState`, `CampaignProgress` (quest/location status overrides + per-location DM notes), current timeline id, DM/Player view mode, and the "reveal Arc 2 to players" flag. Persistence goes through the pluggable `OverlayStorageAdapter` in `src/state/persistence/overlayStorage.ts` — plain `localStorage` by default (unchanged from before that file existed), or a server-synced HTTP+WebSocket adapter once `VITE_API_BASE_URL` is configured (see "Deploying to a server" below).
- Player View hides `dmNotes`, any `hidden`-status locations/quests, and the entire Arc 2 timeline unless the DM has explicitly toggled "Открыть Арку 2 игрокам". Every DM-only editing route (`/npc`, `/quests`, `/enemies`, etc.) is also blocked outright in Player View by `DmOnlyRoute` in `App.tsx`, not just hidden from navigation.

## Deploying to a server

Full plan and rationale: [`docs/SERVER_ROADMAP.md`](docs/SERVER_ROADMAP.md). Short version:

1. `server/` is a separate, self-contained Node+SQLite sync backend — see [`server/README.md`](server/README.md) for local dev and Railway deploy steps. It's the only piece that needs a persistent volume.
2. This frontend needs `VITE_API_BASE_URL` set (see `.env.example`) to a deployed `server/` instance's URL, then rebuilt — without it, the app keeps working exactly as a local-only, single-browser tool (no code changes needed to "opt out").
3. Access is by link, not accounts: the DM opens `https://your-frontend/?token=<DM_TOKEN>` once and shares `https://your-frontend/?token=<PLAYER_TOKEN>` with players — each browser captures its token into `localStorage` on first visit (`src/state/persistence/authToken.ts`) and the server enforces what that token may do, not the client.
4. `railway.json` at the repo root (frontend) and inside `server/` (backend) are ready for a two-service Railway project; a free static host (Vercel/Netlify/Cloudflare Pages) works just as well for the frontend if preferred, since it's a plain Vite build with no server-side rendering.

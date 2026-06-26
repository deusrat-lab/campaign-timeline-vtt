# campaign-timeline-vtt

A standalone DM-facing app for tracking the campaign's timeline (Arc 1 — peace, Arc 2 — war), world/region/city maps with clickable hotspots, location state, and quest progress. It is a sibling to `dm-companion/` and `battle-map-vtt/` at the repo root — it does not modify either app.

## Relationship to the other apps

- **dm-companion**: this app reads a one-time *copy* of dm-companion's static seed JSON (`public/data/dm-companion/*.json`: locations, npcs, quests, custom-enemies, images, factions). The copies are not kept in sync automatically — re-run the copy step if dm-companion's seed data changes.
- **battle-map-vtt**: there is currently no real linkage. battle-map-vtt only persists its maps/tokens/scenes in IndexedDB (no JSON export), so this app cannot read it directly. Each location card has an "Open in Battle Map VTT" button that links to `http://localhost:5174` (configurable via `src/config.ts`'s `BATTLE_MAP_VTT_BASE_URL`); it's disabled until a real link is added to `src/data/battle-maps-index.json`.

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
- `src/state/campaignStore.tsx` is a Context + `useReducer` store, persisted to `localStorage`, holding `PartyState`, `CampaignProgress` (quest/location status overrides + per-location DM notes), current timeline id, DM/Player view mode, and the "reveal Arc 2 to players" flag.
- Player View hides `dmNotes`, any `hidden`-status locations/quests, and the entire Arc 2 timeline unless the DM has explicitly toggled "Открыть Арку 2 игрокам".

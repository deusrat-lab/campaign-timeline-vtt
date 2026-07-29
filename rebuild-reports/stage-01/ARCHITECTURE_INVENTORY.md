# Stage 01 Architecture Inventory

## Stack

- React `^19.2.6`
- Vite `^8.0.12`
- React Router DOM `^7.18.0`
- TypeScript `~6.0.2`
- Node engine declared: `>=20.19`
- Current runtime observed: Node `v23.11.0`, npm `10.9.2`
- TypeScript settings include `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noUnusedLocals`, `noUnusedParameters`.

## Application Shell

`src/App.tsx` mounts three nested providers:

- `CampaignStoreProvider`
- `CampaignDataProvider`
- `UserCampaignProvider`

Routes split main campaign surfaces from user campaign surfaces:

- Main workspace: `/map`
- Main observer/player workspace: `/observer`
- Main libraries: `/quests`, `/npc`, `/enemies`, `/bestiary`, `/players`, `/economy`, `/services`, `/shops`, `/taverns`, `/images`, `/battle-maps`, `/factions`
- World/atlas: `/world`, `/world/:regionId`, `/atlas/maps/:mapId`
- User campaigns: `/campaigns`, `/campaigns/new`, `/campaigns/:campaignId/map`, `/campaigns/:campaignId/library/*`, `/campaigns/:campaignId/battle/:mapId`

## Main Campaign / Greyholm

Core files:

- `src/state/campaignStore.tsx`
- `src/state/campaignDataContext.tsx`
- `src/state/overlay.ts`
- `src/state/persistence/overlayStorage.ts`
- `src/pages/MapWorkspacePage.tsx`
- `src/pages/PlayerVisibilityPage.tsx`
- `src/pages/ObserverViewPage.tsx`
- `src/data/loadCampaignData.ts`
- `src/data/playerSafeProjection.ts`

Characteristics:

- Single implicit campaign, no first-class `campaignId`.
- Read-only seed/base layer loaded from DM Companion JSON and repo TS/JSON.
- DM edits stored as overlay patches.
- Rich workspace includes maps, timelines, map states, hotspots, routes, placements, overlays, movable entities, events, delayed triggers, faction zones, battle entries, active battle, presented cards, and Player View mode.

## User Campaigns

Core files:

- `src/state/userCampaignStore.tsx`
- `src/state/userCampaignSync.ts`
- `src/types/userCampaign.ts`
- `src/features/campaigns/IsolatedCampaignMapWorkspace.tsx`
- `src/features/campaigns/CampaignLibraryPage.tsx`
- `src/features/campaigns/CampaignBattlePage.tsx`
- `src/features/campaigns/playerSafe.ts`

Characteristics:

- First-class `campaignId` exists inside `UserCampaignData` and `UserCampaignRuntime`.
- Local storage is namespaced by campaign id.
- Runtime includes revealed ids, map view state, per-map battle boards, presented battle, and presented card.
- Workspace is separate from the rich main Greyholm workspace.

## Persistence and Sync

Main campaign:

- Local adapter key: `campaign-timeline-vtt:overlay:v2`
- Legacy key: `campaign-timeline-vtt:state:v1`
- HTTP API: `GET /api/overlay`, `PUT /api/overlay`
- WebSocket: `/ws`
- Server DB row id: `default`

User campaigns:

- Registry key: `dmCompanion.userCampaigns.registry.v1`
- Data key: `dmCompanion.userCampaignData.${id}.v1`
- Runtime key: `dmCompanion.userCampaignRuntime.${id}.v1`
- HTTP API: `GET /api/campaigns`, `GET /api/campaigns/:id`, `PUT /api/campaigns/:id`, `DELETE /api/campaigns/:id`
- Player write APIs: `PATCH /api/campaigns/:id/players/:playerId`, `PATCH /api/campaigns/:id/battle/:mapId`
- WebSocket: `/ws-uc`
- Server DB row id prefix: `uc:`

Server persistence is blob-oriented and uses SQLite upsert without revision checks.

## Major Risk Areas

- `src/pages/MapWorkspacePage.tsx` is 13,443 lines and owns a large amount of main campaign behavior.
- Greyholm functionality is richer than user campaigns and cannot be replaced by the isolated workspace without feature loss.
- Server reads expose raw blobs publicly and rely on client-side projection for privacy.
- No canonical universal snapshot or lossless adapter exists in baseline.
- No optimistic concurrency exists in baseline.

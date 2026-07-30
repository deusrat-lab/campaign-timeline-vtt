# Stage 11 — read-only consumer coverage matrix

Investigated the real routes/workspaces of both legacy stacks. Legend for
**Universal**: `wired` = now reads through the guarded gateway (Stage 11);
`candidate` = read-only and gateway-eligible but left legacy this stage;
`mixed` = read+write, only a pure read-only child could be extracted.

## Greyholm (main campaign)

| Route / component | Legacy source | Reads | Mutates directly | Privacy | campaignId | Universal | Notes |
|---|---|---|---|---|---|---|---|
| `/npc` `/enemies` `/quests` `/factions` `/players` `/battle-maps` — `EntityLibraryPage` header | `campaignDataContext` + `campaignStore` | counts, entity lists, images | list/detail edit below | DM | `greyholm:main` | **wired** | 5 additive sections mounted after the header (summary, NPC list, Player-Safe, Observer, runtime) |
| `EntityLibraryPage` list + detail cards | same | full entity, DM notes | yes (edit/save/place) | DM | `greyholm:main` | mixed | write surface — left legacy |
| `MapWorkspacePage` (`/map`, `/observer`) | `campaignDataContext` + `campaignStore` | map, hotspots, routes, cards | yes (reveal, move, present) | DM / player | `greyholm:main` | mixed (13k LOC) | too entangled with writes to wire this stage |
| `SearchPage` `ImagesPage` `EconomyPage` `ServicesPage` | same | read-only lists | some open editors | DM | `greyholm:main` | candidate | eligible next stage |
| `ObserverViewPage` / `/observer` | same (player-view) | player-safe map/cards | presents cards | player/observer | `greyholm:main` | mixed | player runtime surface |

## User campaigns

| Route / component | Legacy source | Reads | Mutates directly | Privacy | campaignId | Universal | Notes |
|---|---|---|---|---|---|---|---|
| `/campaigns/:id/library/:kind` — `CampaignLibraryPage` head | `userCampaignStore.getData/getRuntime` | counts, entities, images | create/edit below | DM / player / observer | `user:<id>` | **wired** | DM summary + Player-Safe + Observer sections; player/observer audiences get only the Player-Safe section |
| `CampaignLibraryPage` `RichEntityLibrary` | same | entity cards | yes (create/edit/reveal) | DM / player | `user:<id>` | mixed | write surface — left legacy |
| `CampaignsPage` list | `userCampaignStore.registry` | campaign cards | rename/delete | DM | n/a | candidate | registry-level, not snapshot-backed |
| `CampaignBestiaryPage` `CampaignBattleMapsPage` | same | read-only lists | open battle | DM | `user:<id>` | candidate | eligible next stage |
| `IsolatedCampaignMapWorkspace` `CampaignBattlePage` | same + runtime | map / battle | yes (move, initiative) | DM / player | `user:<id>` | mixed | battle mutation — out of scope |

## Selected Stage 11 scope (all `wired` above)

- **Greyholm real sections (≥2):** `greyholm.dm.summary`, `greyholm.dm.npcList` (+ Player-Safe, Observer, runtime).
- **User-campaign real sections (≥2):** `userCampaign.dm.summary`, `userCampaign.playerSafe.entities` (+ Observer).
- **Shared section for both stacks:** the `UniversalSection` shell + `SectionBodies` render both stacks from one view-model contract.
- **Player-Safe / Observer real consumers:** `greyholm.playerSafe.entities`, `greyholm.observer.status`, `userCampaign.playerSafe.entities`, `userCampaign.observer.status`.
- **Image / card consumer:** the Player-Safe / NPC entity lists render `imageSrc` thumbnails.
- **Reference collection:** the NPC / entity list collections.
- **Runtime read-only element:** `greyholm.runtime.presentation` (presented card + active battle count), controls stay legacy.

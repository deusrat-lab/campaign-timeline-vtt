# Stage 15 — Safe entity-field update coverage matrix

Universal durable authority is granted ONLY to scalar/text fields that map 1:1
to a single normalised universal field, are deterministic, reversible, and carry
no cascade / reference / visibility / runtime / geometry side effects.

Key insight enabling parity: `normalizeTechnical` (command comparison) strips the
verbatim `extensions.original` echo, `durable.extensions.overlayRemainder` and
`runtime.extensions`. So for any legacy field the adapter maps as identity into a
single normalised field, the universal candidate equals `adapter(legacyPost)` at
semantic parity — the echo is irrelevant to the comparison.

## Included fields (universal-owned, Stage 15 allowlist)

| Scope | Stack | Entity | Universal field | Legacy field | Type | Empty ok | Adapter mapping | UI editor | Reversible |
|---|---|---|---|---|---|---|---|---|---|
| greyholm.npc.role.update | greyholm | npc | role | role | text | no | `role: npc.role` (main adapter) | EntityLibraryPage NPC editor (role-only save) | yes |
| greyholm.npc.name.update | greyholm | npc | title | name | text | no | `title: npc.name` | EntityLibraryPage NPC editor (harness-covered; UI sends single-field only for role) | yes |
| userCampaign.npc.role.update | userCampaign | npc | role | role | text | no | `role: npc.role` (uc adapter) | UC NPC editor (updateEntity) | yes |
| userCampaign.npc.name.update | userCampaign | npc | title | name | text | no | `title: npc.name` | UC NPC editor | yes |
| userCampaign.npc.description.update | userCampaign | npc | publicDescription | description | text | yes | `publicDescription: npc.description` | UC NPC editor | yes |
| userCampaign.quest.title.update | userCampaign | quest | title | title | text | no | `title: quest.title` | UC quest editor | yes |
| userCampaign.quest.description.update | userCampaign | quest | publicDescription | description | text | yes | `publicDescription: quest.description` | UC quest editor | yes |
| userCampaign.faction.name.update | userCampaign | faction | title | name | text | no | `title: faction.name` | UC faction editor | yes |
| userCampaign.faction.description.update | userCampaign | faction | publicDescription | description | text | yes | `publicDescription: faction.description` | UC faction editor | yes |
| userCampaign.location.description.update | userCampaign | location | publicDescription | description | text | yes | `publicDescription: location.description` | UC location editor | yes |

Ownership registry (`safeFieldRegistry.ownershipOf`): each `(entityKind, universalField)` above is `universal-owned`; every other field is `legacy-owned` (composed fresh from the exact current legacy state).

## Excluded fields and reasons

| Field family | Reason for exclusion |
|---|---|
| any id / campaignId / slug | identity; never mutated |
| references (locationRef, imageRef, npcRefs, factionRefs, questRefs…) | reference/relation change — cascade risk |
| Greyholm npc/enemy/faction `dmNotes` | COMPOSED (`[dmNotes, secrets, notes].join('\n\n')`) — not a 1:1 single-field map, so `adapter(legacyPost)` would not equal a single-field universal write |
| Greyholm npc `description`, `personality`, `secrets`, `notes` | either composed into dmNotes or not a clean 1:1 normalised field via the main adapter |
| enemy `ac`/`hp`/`cr` | numeric stat, not requested; kept legacy-owned |
| quest `status` | excluded to avoid any perception of progression / reveal / event triggering, per stage guardrails |
| faction `attitude` | enum-ish; deferred (safe but not needed for coverage) — kept legacy-owned |
| visibility / reveal / presented / active state | visibility semantics — out of Stage 15 scope |
| coordinates / placements / hotspots / routes / maps | geometry / map authority — out of Stage 15 scope |
| images (src/binary) | asset payload — out of scope |
| party / player sheet | `party` triggers `patchPlayerRemote` (server sync) — excluded |
| create / delete | not a scalar update — out of scope |
| campaign metadata title | touches registry / routing identity — deferred |

## Mutation & persistence boundaries

- Greyholm: `patchNpc` → reducer overlay `npcPatches`, folded into merged `data` by `campaignDataContext`; persistence = `campaign-timeline-vtt:overlay:v2`.
- User campaign: `updateEntity` → `patchData` → `dmCompanion.userCampaignData.<id>.v1` (+ existing `pushBlob` sync, unchanged). `userCampaignSync` NOT modified.
- Stage 15 durable target: production universal namespace `campaign-timeline-vtt:universal:v1:campaign:<campaignId>` (byte-compatible with the async production repository record shape).

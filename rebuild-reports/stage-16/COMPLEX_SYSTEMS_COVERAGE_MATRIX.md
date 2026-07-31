# Stage 16 — Complex Campaign Systems Coverage Matrix

Baseline: `campaign-timeline-vtt-universal-rebuild` @ `0937c74` (Stage 15 durable
authority for safe scalar/text fields). Stage 16 extends durable universal
authority from *field-level* ownership to *aggregate-level* transition ownership
for a proven allowlist, keeping everything else legacy-owned and composed fresh.

Two **real** campaigns are covered independently:

- **Greyholm** — rich historical DM Companion / main-campaign stack
  (`campaignId = campaignIdFromLegacy('greyholm','main')`, `campaignKind = greyholm`).
- **Caldran** — real separate user campaign / one-shot
  (`campaignKind = userCampaign`, its own `campaignId`, storage lifecycle and
  battle boards). Never a fixture, never Greyholm fallback, never active-campaign
  substitution.

Data model anchors used below (from the real universal adapters):

| Aggregate region | Snapshot path |
| --- | --- |
| reveal | `visibility.entities[universalId] : VisibilityState` |
| presented card | `runtime.presentation.presentedCard : { entityRef, kind } \| null` |
| placements | `durable.placements[] : UniversalPlacement` |
| party location | `runtime.party.{currentLocationRef,currentMapId,currentMapPosition}` |
| visited locations | `runtime.locationStatuses[id]` |
| route progress | `runtime.party.routeProgress` |
| routes (definitions) | `durable.routes[]` (legacy-owned; used read-only for identity) |
| maps / hotspots / geometry | `durable.maps[]`, `durable.hotspots[]` (legacy-owned) |
| timeline / calendar / travel | `durable.timeline`, `durable.calendar`, `durable.travel` |
| faction zones | `durable.extensions` / map `zones` layer (legacy-owned) |
| battles | `durable.battleMaps/battleEntries`, `runtime.battles` (legacy-owned) |

## System-by-system classification

Legend for **Stage 16**: `included` = universal durable authority in Stage 16;
`deferred` = remains legacy-owned this stage (reason given); Stage 17 will
consider the deferred set.

| System | Greyholm | Caldran | Universal model | Transition boundary | Reversible | Stage 16 | Reason |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **reveal** | yes (`revealedLocationStateIds` → `visibility.entities`) | yes (8 reveals) | `visibility.entities[id]` VisibilityState | Visibility aggregate | yes (hide) | **included** | Clean 1:region owned slot, resolves to exactly one entity, Player-Safe/Observer relevant, both campaigns. |
| **presented cards** | yes (`overlay.presentedCard`) | yes (`runtime.presentedCard`) | `runtime.presentation.presentedCard` | Visibility aggregate | yes (dismiss) | **included** | Single owned runtime slot; Observer-relevant. |
| **placements** | yes (`data.placements`) | yes (17 placements) | `durable.placements[]` | Map-interaction aggregate | yes (remove/restore) | **included** | Add / move / remove one placement; identity = placement id; geometry validated. |
| **party location** | yes (`overlay.party`) | n/a (no party runtime) | `runtime.party.*` | Navigation aggregate | yes (previous location) | **included (Greyholm)** | Owned runtime slot. Caldran has no party runtime → campaign capability difference, not missing support. |
| **route progress** | yes (`overlay.partyRouteProgress`) | route defs only (1 route) | `runtime.party.routeProgress` | Navigation aggregate | yes (clear) | **included (Greyholm)** | Owned runtime slot; Caldran carries route *definitions* but no runtime progress. |
| **visited locations** | yes (`locationStatuses`) | partial | `runtime.locationStatuses` | Navigation aggregate | idempotent | **deferred** | Coupled to party-location transition side effects; folded into party aggregate's owned region only as read; standalone command deferred to keep the boundary tight. |
| **routes (definitions)** | yes (88) | yes (1) | `durable.routes[]` | Map-interaction | — | **deferred** | Geometry/definition editing is legacy-owned; only *progress* (runtime) is owned. |
| **timeline / calendar** | yes (`durable.timeline`) | minimal | `durable.timeline`, `durable.calendar` | Timeline aggregate | conditional | **deferred** | Legacy timeline model is opaque `Record<string,unknown>`; no typed transition proven for both stacks. Contracts scoped for Stage 17. |
| **campaign events** | yes (1 event) | n/a | `durable.extensions.events` | Timeline aggregate | conditional | **deferred** | Only 1 real event; delayed-trigger ordering not provable for both stacks yet. |
| **faction zones** | yes (2 zones) | yes (12 factions) | `durable.extensions` / zones layer | Map-interaction | yes | **deferred** | Zone geometry lives in legacy extensions with no normalized universal model; keeping geometry legacy-owned per spec. |
| **movable entities** | yes (2) | via placements | `durable.placements[]` (movable layer) | Map-interaction | yes | **covered via placements** | Modelled as placements on a movable layer; same owned region + identity path. |
| **hotspots (runtime)** | yes (69) | n/a | `durable.hotspots[].visibility` | Map-interaction | yes | **deferred** | Hotspot *geometry* is legacy-owned; runtime activation overlaps reveal semantics; deferred to avoid double authority. |
| **location runtime state** | yes (140) | 17 locations | `runtime.locationStatuses` | Navigation | deterministic | **deferred** | Coupled with party/visited; deferred with visited. |
| **maps** | 4 world maps | 4 battle boards | `durable.maps[]` | — | — | **deferred (legacy-owned)** | Definitions/assets never universal-owned in Stage 16 (explicit spec constraint). |
| **battles** | 139 battle maps | 4 boards / 16 tokens | `durable.battle*`, `runtime.battles` | — | — | **deferred (Stage 17)** | Full battle authority is Stage 17; preserved read-only here. |
| **controlled destructive ops** | remove placement, hide reveal, dismiss card, clear route progress | remove placement, hide reveal, dismiss card | inverse-metadata-bearing commands | per aggregate | yes | **included (reversible subset)** | Only fully reversible, single-aggregate-scoped removals. No delete campaign/entity/map/battle. |

## Included Stage 16 aggregate families (durable authority)

1. **Visibility** — `reveal` (RevealEntity/HideEntity), `presentedCard`
   (PresentCard/DismissCard). Greyholm + Caldran.
2. **Map interaction** — `placement` (PlaceEntity/MovePlacement/RemovePlacement),
   also the representation for movable entities. Greyholm + Caldran.
3. **Navigation** — `partyLocation` (MoveParty), `routeProgress`
   (AdvanceRoute/ClearRouteProgress). Greyholm (Caldran lacks the runtime →
   documented capability difference).

Everything else stays legacy-owned and is composed fresh from the exact current
legacy state on every transaction, so a stale universal snapshot can never
overwrite maps, battle state, timeline, hotspot geometry or faction geometry.

## Ownership summary (typed, campaign + system scoped)

| Owned aggregate | Owner | Owned region (changed-path prefix) |
| --- | --- | --- |
| `reveal` | universal | `visibility.entities:<universalId>` |
| `presentedCard` | universal | `runtime.presentation.presentedCard` |
| `placement` | universal | `durable.placements:<placementId>` |
| `partyLocation` | universal | `runtime.party` |
| `routeProgress` | universal | `runtime.party.routeProgress` |
| maps, hotspots geometry, routes defs, timeline, calendar, travel, faction geometry, battles, entity content | legacy | composed fresh every transaction |

A durable universal write may only change paths inside the owned region of the
command's aggregate for the exact resolved target; any other changed path forces
a pre-commit fallback (`candidate_scope_violation`).

---

## Stage 16 Completion addendum — truthful UI ownership (formalized)

Each scope now carries a `uiStatus` in the ownership registry, and the app router
narrows its owned scopes to the UI-wired set. Browser-proven durable commits:
Greyholm `reveal.entity`, Caldran `placement.remove` (see
`rebuild-reports/stage-16-completion/BROWSER_COMPLETION_VERIFICATION.md`).

| Scope | Engine | uiStatus | Durable from real UI |
| --- | --- | --- | --- |
| `greyholm.reveal` | universal | **wired** | ✅ browser-proven |
| `greyholm.presentedCard` | universal | **wired** | ✅ (resolvable entity) |
| `userCampaign.placement` (move/remove) | universal | **wired** | ✅ browser-proven |
| `greyholm.placement` | universal | patch-merge-deferred | — not routed |
| `greyholm.partyLocation` | universal | excluded-coupled | — legacy-owned in UI |
| `greyholm.routeProgress` | universal | excluded-coupled | — legacy-owned in UI |
| `userCampaign.reveal` | universal | excluded-coupled | — legacy-owned in UI |
| `userCampaign.presentedCard` | universal | no-ui-action | — no store action |
| `userCampaign.placement` **create** | universal | excluded (id coordination) | — legacy-owned in UI |

Excluded scopes are engine-capable (proven in the 397-assertion core harness) but
NOT owned by the app router — the store never routes them, so there is no
permanent Stage 16 fallback. They stay legacy-owned until a later stage.

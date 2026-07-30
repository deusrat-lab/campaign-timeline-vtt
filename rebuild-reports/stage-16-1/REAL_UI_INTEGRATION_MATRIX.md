# Stage 16.1 — Real UI Integration Matrix

Baseline: `campaign-timeline-vtt-universal-rebuild` @ `131da95` (Stage 16 core
authority proven, 397/397). Stage 16.1 connects the ALREADY-BUILT Stage 16 engine
to real, existing UI actions of both campaigns via a provider + sink + bridge —
no second engine, no second repository, no new universal-only controls.

## Integration architecture (one path, reused)

- `src/state/complexAuthoritySink.ts` — dependency-light state-layer registry
  (`routeMainComplex` / `routeUserComplex`); the store passes LEGACY identifiers
  only (a `ComplexActionDescriptor`).
- `src/features/complex-authority/complexRouteBridge.ts` — the PURE translation +
  routing bridge (descriptor → typed `ComplexCommand` with resolved universal ids
  → Stage 16 router with adapter closures). Shared by the React provider AND the
  Node integration harness, so the harness exercises the exact production path.
- `src/features/complex-authority/ComplexAuthorityProvider.tsx` — creates ONE
  campaign-scoped router when the default-off flag is on, registers the sink,
  bridges live status, bootstraps reload recovery. Inert when the flag is off.
- Store hooks: `campaignStore.tsx` (Greyholm) + `userCampaignStore.tsx` (Caldran).
- Diagnostics UI: `ComplexAuthorityDiagnostics.tsx` inside the DM-only
  `UniversalDiagnosticsPage`.

Routing precedence per event: normal UI action → **Stage 16** (owns whole
aggregates) → falls through to Stage 15 durable → Stage 14 → legacy. Stage 16
aggregate scopes are DISJOINT from the Stage 15 safe scalar fields, so there is
never double authority for one event. When Stage 16 is off or does not own the
scope, the store dispatches exactly as before.

## Key finding — real UI actions bundle multiple slots

Stage 16 takes a durable universal commit ONLY when the legacy action's effect
equals its single typed aggregate command (independent legacy prediction +
parity). Several real UI actions bundle side effects across multiple owned/legacy
regions; for those Stage 16 **safely falls back** to the unchanged legacy action
(no durable commit, no data risk). This is correct, honest behaviour and is
verified in the integration harness.

## Greyholm (`camp:greyholm:main`, kind `greyholm`)

| UI control | Store action | Aggregate | Legacy effect | Stage 16 result | Wired |
| --- | --- | --- | --- | --- | --- |
| reveal location to players | `setRevealed` (`SET_REVEALED`) | reveal | single slot: `revealedLocationStateIds += id` | **durable** (identity resolves) / safe fallback (unresolved id) | ✅ |
| hide location | `unsetRevealed` (`UNSET_REVEALED`) | reveal | single slot | **durable** | ✅ |
| “Показать эту карточку игрокам” | `presentCard` (`SET_PRESENTED_CARD`) | presentedCard | single slot: `presentedCard = {type,id}` | **durable** when the card id resolves to a universal entity of that kind; **safe fallback** (`mapping_failed`) otherwise | ✅ |
| clear presented card | `clearPresentedCard` | presentedCard | single slot | **durable** | ✅ |
| move party to location | `setCurrentLocation` (`SET_CURRENT_LOCATION`) | partyLocation | MULTI-slot: also clears `currentMapPosition` **and** `partyRouteProgress` | safe fallback (`prediction_mismatch`) | ❌ (documented coupling) |
| set route progress (advance) | `setPartyRouteProgress` | routeProgress | MULTI-slot: advance also clears `currentMapPosition` | safe fallback | ❌ (advance) / clear is clean |
| move placement | `patchPlacement` (overlay patch-merge) | placement | overlay `placementPatches` (not folded by the adapter) | not wired — patch-merge coupling | ❌ (deferred, core proven) |

Wired & durable-capable Greyholm flows: **reveal, hide, presentedCard present,
presentedCard dismiss**. Party/route/placement UI actions are documented couplings
(safe fallback / deferred); the Stage 16 core authority for them is proven in the
397-assertion core harness.

## Caldran (`camp:user:camp-mrfalp9g-kp7qp`, kind `userCampaign`)

Note: the local browser fixture contains a *different* user campaign id; the
Caldran export used by the harness is `camp-mrfalp9g-kp7qp`. The store always uses
the EXACT route/campaign id (never the active campaign, never Greyholm).

| UI control | Store action | Aggregate | Legacy effect | Stage 16 result | Wired |
| --- | --- | --- | --- | --- | --- |
| move placement pin | `updatePlacement` (pure x/y) | placement | single slot: `mapPlacements[id].{x,y}` | **durable** | ✅ |
| remove placement pin | `removePlacement` | placement | single slot: filter `mapPlacements` | **durable** | ✅ |
| create placement pin | `addPlacement` | placement | id generated INSIDE the reducer (`uid('pin')`) | not wired — id must be coordinated before dispatch | ❌ (documented) |
| reveal entity to players | `toggleReveal` | reveal | MULTI-slot: also flips `mapPlacements[e].visibleToPlayers` + `images[i].playerSafe` | safe fallback | ❌ (documented coupling) |
| presented card | — | presentedCard | no user-campaign store action exists | n/a | — (capability/UI gap) |
| route | `updateRoute` | routeProgress | Stage 16 core does not own `userCampaign.route` | n/a | — (scope not extended) |

Wired & durable-capable Caldran flows: **placement move, placement remove**.

## Capability / UI gaps (honest)

- Greyholm party/route/placement UI actions bundle multiple slots (or use the
  overlay patch-merge) → safe fallback / deferred; core authority proven.
- Caldran `toggleReveal` couples placement+image visibility → safe fallback.
- Caldran placement CREATE needs id coordination (store-generated id).
- Caldran has no presented-card store action (UI/capability gap, not an engine gap).
- `userCampaign.route`, `greyholm.partyLocation`, `greyholm.routeProgress` remain
  Stage 16 scopes but are not wired to a clean single-slot UI action; not silently
  extended.

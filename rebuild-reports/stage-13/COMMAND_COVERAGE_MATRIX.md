# Stage 13 — command coverage matrix

Legacy commands remain the sole authoritative writers. Each allowlisted mutation
below additionally emits an already-committed command event; an isolated
universal command is replayed against the exact captured pre-state and compared
to the adapter-derived post-state. The universal result is never applied.

## Greyholm (main campaign) — `campaignStore.tsx`

| Family | Legacy action | Mutation boundary | Universal command | Persistence | campaignId | Suitable | In allowlist |
|---|---|---|---|---|---|---|---|
| durable entity update | `patchNpc(id, {role})` | `SET`→reducer (overlay npc override) | `greyholm.npc.update` → `entity.role` (+`extensions.original.role` echo) | localStorage overlay (sync) | `camp:greyholm:main` | ✅ clean 1:1 | ✅ |
| runtime update | `presentCard(card)` | `SET_PRESENTED_CARD` | `greyholm.presentedCard.set` → `runtime.presentation.presentedCard` | localStorage overlay | `camp:greyholm:main` | ✅ clean 1:1 | ✅ |
| reference/visibility | `setRevealed(locationStateId)` | `SET_REVEALED` (party.revealedLocationStateIds) | `greyholm.reveal.update` → `visibility.entities[loc]` | localStorage overlay | `camp:greyholm:main` | ✅ clean 1:1 | ✅ |

## User campaigns — `userCampaignStore.tsx`

| Family | Legacy action | Mutation boundary | Universal command | Persistence | campaignId | Suitable | In allowlist |
|---|---|---|---|---|---|---|---|
| entity update | `updateEntity(id,'npc',eid,{role})` | `patchData` (data.npcs) | `userCampaign.npc.update` → `entity.role` | per-campaign localStorage (sync) | `camp:user:<id>` | ✅ clean 1:1 | ✅ |
| map/placement update | `updatePlacement(id,pid,{x,y})` | `patchData` (data.mapPlacements) | `userCampaign.mapPlacement.update` → `placement.position` | per-campaign localStorage | `camp:user:<id>` | ✅ clean 1:1 | ✅ |
| reference/reveal | `toggleReveal(id,eid)` (add only) | `patchRuntime` (+data side-effects) | `userCampaign.reveal.update` → `visibility.entities[e]` | per-campaign localStorage | `camp:user:<id>` | ⚠️ runtime delta clean; when the legacy toggle also flips a placement/image visibility the comparison honestly reports the wider legacy effect | ✅ |

## Deliberately EXCLUDED (high-risk, first-stage)

campaign delete · full import · full restore · battle lifecycle (start/update/end)
· complex timeline mutation · large map-geometry replacement · multi-step
transactions · server sync · destructive bulk actions.

## Emission boundary notes

- Greyholm: exact post-overlay is recomputed from the pure `reducer(state, action)`
  — never a delayed read — so pre/post are captured precisely and synchronously.
- User campaigns: `patchData`/`patchRuntime` persist synchronously to
  localStorage, so the exact post `data`/`runtime` is read straight back.
- Both emissions are best-effort and fully guarded; a shadow consumer can never
  block, delay, or fail the legacy action, and is a no-op when the default-off
  flag is unset.

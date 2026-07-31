# Stage 17 — Browser Evidence (local, real)

Captured locally against `npm run dev` (vite, port 5175) with
`VITE_UNIVERSAL_DIAGNOSTICS=1` and **all four Stage 17 flags unset (default off)**.
No production, no deploy, no network — pure local dev server.

## 1. OFF-state baseline unchanged (Stage 16 preserved)
- `/map` (Greyholm main) renders the full Map Workspace: day/phase controls, layer
  toggles (DM/Session/Players-safe/Observer), the real location list (Рыночная
  площадь, Речные доки, Гильдия авантюристов Грейхольма, …), party/point/library panels.
- **Zero console errors** after adding the `CampaignEngineProvider` and the
  `/diagnostics/stage-17` route to the app tree.
- The existing DM toolbar (Export JSON / Import JSON / Reset Local Edits) is intact —
  these are the legacy import/export entry points a later sub-stage would route
  through the universal pipeline.

## 2. Stage 17 diagnostics route (`/diagnostics/stage-17`) — real Greyholm data
| Field | Observed value |
|---|---|
| engine active | **false** (all flags default off) |
| battleAuthority / importExport / sync / localCutover | false / false / false / false |
| dual-authority violations | **0** |
| systems tracked | 23 |
| reconciliation | equal |
| universal battles in snapshot | 0 |
| adapter | legacy-main / 0 diagnostics |

### Privacy projection hashes (all distinct → projections genuinely differ)
| Projection | Hash |
|---|---|
| DM workspace | `e14c82fa` |
| Player-Safe | `de1cce1f` |
| Observer | `fb602370` |
| full snapshot | `b4e34609` |

### Ownership registry (rendered live from resolved flags)
23 rows shown; universal = campaign-metadata, npc, placements, reveal, presented-cards
(Stage 15/16); deferred = party, routes (honest); legacy = everything else incl.
battle-definitions/runtime, imports/exports/backup/restore, sync (all awaiting cutover).

## What this evidence does and does NOT establish
**Establishes (real):** the Stage 17 application-integration foundation is wired and
inert by default; the DM-only diagnostics route works on live data; ownership has no
dual authority; the three privacy projections produce distinct hashes on real Greyholm.

**Does NOT establish (still pending, honestly):** battle-command cutover through the
Greyholm/Caldran battle UIs; import/export/backup/restore UI round-trips; sync lifecycle
integration; pending-recovery browser failure injection; Caldran board/token browser
flows; second-UC isolation in-browser. These require the deeper wiring described in
STAGE_17_STATUS.md and are not claimed as done.

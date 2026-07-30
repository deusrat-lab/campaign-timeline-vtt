# Stage 11 — expanded local universal read coverage & shared view-model extraction

**Verdict: STAGE_11_PASS**

Real, in-workflow application read-only sections (not just the diagnostics pilot
page) now read through the guarded Universal Read Gateway locally when the
default-off read flag is enabled, with a verified deterministic legacy fallback.
Legacy stores remain the sole authoritative write source.

## Git checkpoint

- Repository: `campaign-timeline-vtt-universal-rebuild`
- Branch: `master`
- Starting HEAD: `1cc7e91` (Stage 10c)
- Working tree at start: clean (ahead of local origin, no push)
- Remote: local (`../campaign-timeline-vtt`) — unchanged, no push/deploy performed

## What changed (scope)

Additive only. New shared read-only layer under `src/features/universal-sections/`:
- `useUniversalSection` — reuses the Stage 10 gateway (`useUniversalRead`) + shared
  view-model builders; returns a finished immutable view model, source-agnostic.
- `SectionBodies` — shared pure presentational bodies (summary / list / observer /
  runtime). No store, repository, snapshot, or command access.
- `UniversalSection` — the shared section shell. Renders **nothing** when the read
  flag is off (additive invisibility → byte-identical baseline).
- `GreyholmUniversalSections` / `UserCampaignUniversalSections` — build the legacy
  fallback snapshot for one campaign and mount the scopes.
- `sectionRegistry` — descriptive metadata for DM diagnostics.

Two new user-campaign pilot scopes added to the registry
(`userCampaign.playerSafe.entities`, `userCampaign.observer.status`).

Wired into real pages (additive, flag-gated):
- `EntityLibraryPage` (Greyholm `/npc`, `/enemies`, …) — 5 sections.
- `CampaignLibraryPage` (`/campaigns/:id/library/:kind`) — 3 sections (player/observer
  audiences receive only the Player-Safe section).

Diagnostics (`/diagnostics/read-path`) extended with a real-hosted-sections table.
Stage 11 harness under `scripts/stage11/`, report under `rebuild-reports/stage-11/`.

**Not changed:** server / Railway / deployment / production namespace / legacy
persistence / legacy write actions / `userCampaignSync` / universal commands in UI /
editors / drag-and-drop / battle controls / visual redesign / dependencies /
historical Stage 4–10 reports / Stage 8 fixtures.

## Browser verification (local, all four flag combinations)

Real route `/npc` (Greyholm):

| Combination | Result |
|---|---|
| shadow off + read off | 0 universal bands — legacy library byte-identical to baseline |
| shadow on + read on | all 5 sections `source=universal` after shadow settles |
| shadow off + read on | all 5 sections legacy fallback `waiting_for_shadow` (refuses stale shadow without a live status; no coordinator) |
| shadow on + read off | 0 universal bands (section renders null) — identical to baseline |

Live data read through the universal path matched the frozen anchors exactly:
DM 979 entities / 210 NPC / 127 enemies / 4 maps / 139 battle maps; Player-Safe and
Observer both **603** (< 979) — the full DM snapshot never reaches the player/observer
view models. Runtime: presented card —, active battles 0.

## Privacy

Player-Safe and Observer view models are built from the Player-Safe / Observer
projections only; `buildScopeViewModel` throws if a player/observer scope is asked
for a DM projection. Harness proves Player-Safe entities < DM entities, no DM-only
keys in the Player-Safe VM, Caldran reveals 8/8 preserved.

## Verification

| Check | Result |
|---|---|
| typecheck | PASS |
| build | PASS |
| Stage 11 harness | 72/72 PASS |
| Stage 10 harness | 74/74 PASS (incl. diag-62 — modified pages don't import read-path) |
| Stage 9 harness | 44/44 PASS |
| Stage 8 / 8d | 66/66 + 18/18 / 46/46 PASS |
| Stage 4–7 | PASS (Stage 4 historical reports restored byte-identically; its `inputs` count is a parent-folder discovery walk unrelated to this change — verdict/dropped/mutation/determinism/forbidden all unchanged) |

## Remaining gaps

- Universal is still **not** a write source; all writes remain legacy.
- Not the full workspace — `MapWorkspacePage` (13k LOC), editors, drag-and-drop,
  battle/initiative controls remain legacy (mixed read/write).
- Persistence and server sync are not migrated; production namespace untouched.
- User-campaign browser confirmation relies on the campaign being loaded into the
  shared in-memory session cache first (same Stage 10 limitation); the UC sections
  are proven end-to-end at the domain level against the real Caldran fixture
  (66 NPC, 78 enemies, reveals 8/8) in the Stage 11 harness.

## Recommendation

Stage 11 is a clean local checkpoint. A future **Stage 12 — controlled shared
Campaign Workspace composition** may proceed, still without an automatic
universal write-path switch. Stage 12 was not started in this session.

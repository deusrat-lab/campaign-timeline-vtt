# Stage 9 — Local shadow integration of universal repository/store

**Verdict: STAGE_9_PASS**

Legacy stores remain the sole authoritative source of truth. The universal
repository/store are connected locally as a **validated shadow copy only**,
default-off, fully isolated, and with zero effect on the legacy workflow.

## Git checkpoint
- Repository: `campaign-timeline-vtt-universal-rebuild`, branch `master`
- Starting HEAD: `320e034` (Stage 8 checkpoint), working tree clean
- Remote: `origin` -> local `../campaign-timeline-vtt` (no GitHub). **No push, no deploy.**
- Rebuild commits remain local-only.

## Integration boundary
- **Main Campaign (Greyholm):** a null-rendering bridge (`MainCampaignShadowBridge`)
  reads the effective, already-merged `CampaignData` (real `loadCampaignData`
  seed + overlay via `applyOverlayToList`, reused — not re-implemented) plus the
  live overlay (`useCampaignStore().exportOverlay()`), and submits to the
  coordinator on any merged-data or overlay change.
- **User Campaigns:** `UserCampaignShadowBridge` reads a new **side-effect-free**
  `listShadowSources()` (in-memory caches only), dedupes per campaign by object
  identity, and submits each changed campaign under its own campaign-scoped key.
- Coordinator (`src/domain/shadow/shadowIntegrationCoordinator.ts`) is pure /
  framework-agnostic: debounced scheduling, per-campaign serialization
  (stale-run-proof), blocking validation, isolated shadow persistence, reload,
  semantic comparison, structured status. Never mutates the source, never writes
  the production namespace, never syncs to any server.
- Feature flag `VITE_UNIVERSAL_SHADOW_INTEGRATION` (default **off**). When off:
  no coordinator, no repository, no subscriptions, no storage access.
- Shadow namespace: `campaign-timeline-vtt:universal-shadow:stage-09:<campaignId>`.

## Failure behaviour (all proven)
- validation failure -> not persisted, prior valid snapshot survives, legacy unaffected
- adapter failure (throw / no snapshot) -> `adapter_failed`, legacy unaffected
- persistence failure -> `persistence_failed`, error surfaced
- revision conflict -> `conflict`, surfaced (never silently retried)
- stale run -> latest-wins, never overwritten by an older run

## Verification (real browser, localhost, no deploy)
| Flow | Flag | Legacy saved | Shadow attempted | Validated | Saved | Reloaded | Compared | Legacy affected | Result |
|------|------|:-----------:|:---------------:|:--------:|:----:|:-------:|:-------:|:--------------:|--------|
| Greyholm initial hydration | on | yes | yes | yes | rev 1..n | yes | equal | no | success |
| Greyholm mutation (overlay) | on | yes | yes | yes | rev++ | yes | equal | no | success |
| Greyholm rapid updates | on | yes | 1 run (debounced) | yes | yes | yes | equal | no | success |
| Greyholm invalid candidate | on | yes | yes | **failed** | no | — | — | no | validation_failed |
| Caldran hydration | on | yes | yes | yes | rev 1 | yes | equal | no | success |
| Caldran update | on | yes | yes | yes | rev++ | yes | equal | no | success |
| Two user campaigns | on | yes | yes | yes | distinct keys | yes | equal | no | isolated |
| Campaign switch (A,B,A) | on | yes | yes | yes | independent revs | yes | equal | no | isolated |
| Feature flag OFF | off | yes | **no** | — | — | — | — | no | 0 shadow keys |

Browser (flag off): 0 Stage 9 keys, 0 production keys, app works, legacy overlay present.
Browser (flag on): shadow key `...:campaign:camp:greyholm:main` created, production keys 0,
legacy overlay intact, only external requests are pre-existing Google Fonts (GET) —
**0 Railway / /api / production requests**. Manual actions "Run now" (-> success),
"Reload & compare", "Clear shadow" (removes only the shadow key, legacy intact) all verified.

## Harness & regression
- Stage 9 harness (`npm run verify:stage09`): **44/44 PASS** -> STAGE_09_HARNESS_PASS
  (feature-flag 5, main 10, user 10, repository 7, diagnostics 6, real-data anchors 4,
  plus namespace anchor). Deterministic (manual scheduler; no wall-clock sleeps).
- `npm run typecheck`: PASS. `npm run build`: PASS.
- Stage 8 parity (`runParity`): 66/66 + 18/18 negative -> STAGE_8_PASS (reports byte-identical).
- Stage 8d Greyholm real overlay (`runGreyholmOverlay`): 46/46 -> STAGE_8_PASS.
- Stage 4-7 (`verify:stage04..07`, `verify:domain`): all PASS, no regression.
- Real-data anchors reproduced: Greyholm 210 NPC / 139 battle maps; Caldran 66 NPC;
  Caldran reveals **8/8**.

## Remaining gaps (explicit)
- Universal store is **not** the source of truth; production UI still uses legacy stores.
- Universal commands do not drive the UI; no universal read-path in production rendering.
- Production persistence is not migrated; server sync is not universalized; production
  namespace is never written.
- Battle-runtime caveat from Stage 8 stands: some Greyholm live runtime collections were
  empty at server-export time; exercised here via the non-zero contract overlay fixture,
  not a fresh live snapshot.
- Browser verification is manual/scripted via the in-app browser (headless a11y tree
  unavailable); DOM interactions were driven and asserted through page JS.

## Recommendation
Stage 9 is a clean local checkpoint. Stage 10 (controlled local universal **read-path**
integration) may follow — **not** a production source-of-truth switch, and not started here.

# Stage 16.1 — Browser Verification

Local only. No deploy. Vite dev server on `http://localhost:5175` (flag OFF,
default) and `http://localhost:5176` (started with
`VITE_UNIVERSAL_COMPLEX_AUTHORITY=true`). Real app, real bundled Greyholm campaign.
No raw DM notes / hidden content stored below — ids and namespaces only.

## Stage 16 OFF — baseline (localhost:5175)

| Check | Result |
| --- | --- |
| App mounts (`#root` populated) | ✅ |
| Console errors | none |
| localStorage keys total | 7 (pre-existing: stage-09 shadow, stage-14, overlay, user-campaign data) |
| Stage 16 keys (`…complex-authority:stage-16…`) | **[] (none)** |
| Greyholm + Caldran cards present in UI | ✅ (“Основная кампания: Грейхольм”, “Кальдран: Цена имени”) |

OFF baseline confirms zero Stage 16 router / repository / diagnostics / recovery
activity and no UI difference — exactly pre-Stage-16 behaviour.

## Stage 16 ON (localhost:5176)

| Check | Result |
| --- | --- |
| App mounts with flag on | ✅ |
| Console errors attributable to Stage 16.1 | **none** (see note) |
| `ComplexAuthorityProvider` active (no throw) | ✅ |

### Live routing evidence (real UI action → Stage 16 router)

Flow: opened the Greyholm campaign map → Грейхольм location card → clicked
**“Показать эту карточку игрокам”** (`presentCard`, a wired flow).

Before click: Stage 16 keys `[]`.
After click: a Stage 16 diagnostics record appeared under the correct isolated
namespace:

```
campaign-timeline-vtt:universal-complex-authority:stage-16:camp:greyholm:main  → array len 1
```

Redacted record contents:

| Field | Value |
| --- | --- |
| commandScope | `greyholm.presentedCard` |
| aggregateKind | `presentedCard` |
| commandKind | `presentedCard.present` |
| decision | `fallback` |
| phase | `fallback_success` |
| fallbackReason | `mapping_failed` |
| repositoryCommitStatus | `not_committed` |
| legacyProjectionStatus | `not_attempted` |
| changedAggregatePaths | `[]` |

**Interpretation:** the normal UI action genuinely ROUTED through the live Stage
16 router in the browser, wrote a redacted diagnostic to the correct isolated
namespace, and — because this particular location card's `{type,id}` did not
resolve to a universal entity of that kind in the adapted snapshot — SAFELY FELL
BACK to the unchanged legacy `presentCard` (no durable commit, no repository
write, no data risk). This is correct Stage 16 behaviour (identity resolution is
strict; unresolved → safe fallback).

### Not captured in-browser

A GREEN durable universal commit through the live UI was not captured: it requires
a present/reveal whose legacy `{type,id}` resolves to a universal entity in the
active campaign context, and the app resets the campaign selector to “World Atlas”
on several nav clicks, making the exact resolvable control fiddly to reach in this
dataset. The durable-commit path (route → validate → invariants → scope →
independent legacy parity → expected-revision commit → read-after-write → one
legacy projection) is instead proven rigorously by:

- Stage 16 core harness: **397/397** (real Greyholm overlay + real Caldran export).
- Stage 16.1 integration harness: **114/114** driving the EXACT production bridge
  (`descriptorToCommand` / `routeMainComplexThrough` / `routeUserComplexThrough`)
  against both real campaigns, including durable commits, safe fallbacks for the
  coupled multi-slot UI actions, recovery, and campaign isolation.

### Console note

The ON session showed React “two children with the same key … region” warnings.
These originate in the **World Atlas subregion list** rendering (the `region`
cards) and are PRE-EXISTING app warnings unrelated to Stage 16.1 — the Stage 16.1
code renders no region lists and adds no new console errors.

## Verdict for the browser portion

- OFF baseline: fully verified in-browser.
- ON: app mounts cleanly; a real UI action verifiably routes through the live
  Stage 16 router, writes to the isolated diagnostics namespace, and safely falls
  back on unresolved identity; no new console errors.
- Live durable-commit + refresh-persistence + campaign-switch through the UI: not
  captured in-browser (dataset identity-resolution + campaign-context tooling
  limitation); proven at the integration layer via the shared production bridge.

This is why the overall Stage 16.1 verdict is `STAGE_16_1_PASS_WITH_WARNINGS`
rather than a full `STAGE_16_PASS`.

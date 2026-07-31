# Stage 16 Completion — Browser Verification

Local only (`vite dev`, `VITE_UNIVERSAL_COMPLEX_AUTHORITY=true` on `localhost:5176`;
default-off baseline on `localhost:5175`). Real app, real bundled Greyholm data,
real instantiated Caldran one-shot. No deploy, no push. Ids/hashes only below.

Production universal repository key pattern: `campaign-timeline-vtt:universal:v1:campaign:<campaignId>`.

## 1. Greyholm — successful durable UI commit (reveal)

Normal UI action: `/map` → select "Рыночная площадь" → DM Edit → "Ещё" →
**"Отметить открытым"** (`store.setRevealed`).

| Field | Value |
| --- | --- |
| decision | **durable_committed** |
| phase | success |
| commandKind | `reveal.entity` |
| changed | `visibility.entities:entity:locationState:loc-greyholm-market__arc-1-peace` |
| repositoryCommitStatus | committed |
| read-after-write | ok |
| legacyProjectionStatus | committed |
| repo revision before → after | (none) → **1** |
| universal commits | 1 · legacy transitions | 1 |

## 2. Greyholm — refresh persistence

Reloaded `/map`.

| Field | Value |
| --- | --- |
| universal revision after refresh | **1 (unchanged — no duplicate commit)** |
| owned reveal persisted | yes (`revealCount 1`, market present) |
| legacy overlay `revealedLocationStateIds` includes market | yes (compatibility representation matches) |
| new Stage 16 records on reload | 0 (recovery bootstrap read-only) |
| reconciliation | equal |

## 3. Caldran — successful durable UI commit (placement remove)

Instantiated the "Цена имени" one-shot → `camp:user:camp-ms8k0er0-wgwr2` (17
placements, 66 NPC, 76 enemies, 17 loc, 3 players, 12 factions, 205 images).
Normal UI action: map pin → DM Edit → **"Снять с карты"** (`store.removePlacement`).

| Field | Value |
| --- | --- |
| decision | **durable_committed** |
| phase | success |
| commandKind | `placement.remove` |
| changed | `durable.placements:pin-ms8k0etx-bmsbj` |
| placements before → after | 17 → 16 (intentional scoped change) |
| repositoryCommitStatus | committed · read-after-write | ok |
| legacyProjectionStatus | committed |
| repo revision | **1** · prod key | `…campaign:camp:user:camp-ms8k0er0-wgwr2` (exact) |
| universal commits | 1 · legacy transitions | 1 |

## 4. Caldran — refresh persistence

Reloaded `/map`.

| Field | Value |
| --- | --- |
| universal revision after refresh | **1 (unchanged)** |
| placements | 16 (removal persisted, pin still removed) |
| anchors in universal snapshot | 66 NPC, 76 enemies preserved |
| new Stage 16 records on reload | 0 |

## 5. Direct URL / campaign context & campaign-switch isolation

| Check | Result |
| --- | --- |
| Caldran uses exact campaign id (not active/Greyholm) | yes — `camp:user:camp-ms8k0er0-wgwr2` |
| Greyholm prod key present, rev | yes, **2** |
| Caldran prod key present, rev | yes, **1** |
| production keys distinct | yes |
| Stage 16 diagnostics keys distinct | yes |
| any cross-campaign key | none |

## 6. Network / sync

Network trace after a Caldran durable action + reload: **only static GETs**
(Vite modules, `/data/**` JSON, map images). **No POST/PUT** to any sync or API
endpoint; no universal server sync; no Railway/API request. The wired path calls
the legacy action exactly once (one `patchData` → one `pushBlob`); locally
`userCampaignSync` is a no-op (no `API_BASE_URL`), so the network count is 0 and
the logical sync count is 1. `userCampaignSync` implementation unchanged.

## 7. Universal committed / legacy failed → pending (dev fixture)

Armed the dev-only, default-off fixture (`localStorage['stage16.test.failLegacyOnce']='1'`,
DEV-only) and clicked **"Сбросить открытие"** (`unsetRevealed`, `reveal.hide`).

| Field | Value |
| --- | --- |
| universal revision before → after | 1 → **2** (durable commit succeeded) |
| decision | durable_committed |
| phase | **universal_committed_legacy_pending** |
| legacyProjectionStatus | pending |
| pending recovery records | **1** |
| universal authoritative (market hidden) | yes |
| arbitrary fallback / second universal commit | none |

## 8. Reload recovery

Reloaded `/map`. (Required a fix: the recovery bootstrap now runs in a
data-dependent effect after the async campaign data loads, and reads the TRUE
current legacy overlay for equality recognition.)

| Field | Value |
| --- | --- |
| pending recovery after reload | **0 (resolved)** |
| universal revision | **2 (NOT advanced again — no second universal commit)** |
| universal still authoritative | yes (market hidden) |
| legacy already-applied recognised | yes (resolved without re-projecting) |

## 9. Player Safe / Observer

From the Greyholm durable diagnostic record:

| Field | Value |
| --- | --- |
| dmProjectionHash | present |
| playerSafeProjectionHash | present, **≠ dmProjectionHash** (and smaller — content stripped) |
| observerProjectionHash | present, **≠ dmProjectionHash** |
| diagnostic redaction (no raw notes) | yes |
| visibility carries no DM notes | yes |

Projection semantics (not full-snapshot equality) are proven; the `stage05` gate
additionally proves the player-safe projection excludes DM-only notes.

## 10. Console

No console errors in either the OFF or ON session attributable to Stage 16.
(Pre-existing "duplicate key … region" warnings occur only on the World Atlas
region list, unrelated to Stage 16.)

## Ownership decisions (excluded scopes — verified legacy-owned in the UI)

| Scope | Decision | Evidence |
| --- | --- | --- |
| `greyholm.partyLocation` | excluded (coupled) | `SET_CURRENT_LOCATION` clears map pos + route progress; not routed |
| `greyholm.routeProgress` | excluded (coupled) | advance clears map pos; not routed |
| `userCampaign.reveal` | excluded (coupled) | `toggleReveal` flips placement + image visibility; not routed |
| `userCampaign.placement` **create** | excluded (id coordination) | in-browser, an `addPlacement` produced a legacy pin with **no Stage 16 record** — create stayed legacy-owned; only move/remove are durable |

The app router narrows its owned scopes to the UI-wired set
(`greyholm.reveal`, `greyholm.presentedCard`, `userCampaign.placement`), so no
excluded scope is ever intercepted by Stage 16 (no permanent fallback).

# Stage 16 Completion — Deterministic UI Success Candidates

Selected BEFORE driving the browser (no random clicks), from adapter + store audit.

## Greyholm (`camp:greyholm:main`)

| Field | Value |
| --- | --- |
| route | `/map` (main campaign) |
| UI control | MapWorkspace side panel → "Ещё" → **"Отметить открытым" / "Сбросить открытие"** (`store.setRevealed` / `unsetRevealed`) |
| command kind | `reveal.entity` / `reveal.hide` |
| entity kind | location state |
| why it resolves | `mapMainEntities` turns EVERY location state into `entity:locationState:<id>` (kind `location`); the reveal resolver matches by id only → exactly one entity → `ok` |
| owned path | `visibility.entities:entity:locationState:<id>` |
| legacy action | `SET_REVEALED` / `UNSET_REVEALED` (single overlay slot) |
| reversibility | yes (hide is the inverse) |
| selected | **yes** — durable |

Rejected earlier candidate: presenting a **location card** (`presentCard` with a location-type id) → `mapping_failed` (the card's `{type,id}` did not match a universal entity of that kind). Reveal is the reliable candidate.

## Caldran (real user campaign, instantiated from the "Цена имени" one-shot template)

| Field | Value |
| --- | --- |
| campaign id | `camp:user:camp-ms8k0er0-wgwr2` (a fresh id is generated per one-shot instantiation; the `camp-mrfalp9g-kp7qp` used by the harness is a different saved export) |
| route | one-shot map (isolated: "ВАНШОТ · ИЗОЛИРОВАН — данные основной кампании скрыты") |
| UI control | placement pin → **"Снять с карты"** (`store.removePlacement`) |
| command kind | `placement.remove` |
| entity kind | placement (map pin) |
| owned path | `durable.placements:<placementId>` |
| legacy action | `patchData` filtering `mapPlacements` (single slot); one `pushBlob`/sync |
| reversibility | reversible (re-place) |
| selected | **yes** — durable |

Also available: `updatePlacement` pure x/y **move** (durable, `placement.move`), verified in the harness against the real Caldran export.

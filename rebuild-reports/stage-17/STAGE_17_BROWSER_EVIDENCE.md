# Stage 17 — Browser Evidence (local, real)

Captured locally against `npm run dev` (vite, port 5175). No production, no deploy, no network.

## Fixture provenance (honest)
Three distinct things must not be conflated:
- **Canonical archived Caldran fixture** — 66 NPC / 78 enemies / 4 boards / 16 tokens etc. (used by the
  Node harness via `scripts/stage16/lib.mjs` `caldranComplex()`).
- **Current instantiated Caldran template** — the local User Campaign "Stage14 UC Test"
  (`camp-ms7krgk7-einpb`); as instantiated it had **0 battle boards**.
- **Browser-seeded battle setup** — for Part B/C I seeded, *in the in-app browser's localStorage only*,
  4 custom boards × 4 tokens (Caldran) and one active battle `gb-test-1` (Greyholm), as the DM-setup
  precondition. The MUTATIONS (token move, turn advance) then ran through the real UI. This seed is NOT
  in production code (`grep` for the literals in `src/` finds only the dev-only fixture flag), is not a
  hidden runtime dependency, and the app after reload needs no re-seed (durable + legacy state persist).

---

## PART A — OFF state (all Stage 17 flags unset)
- `/map` (Greyholm) renders the full workspace; **zero console errors** with the new providers/route.
- `/diagnostics/stage-17`: engine **active=false**, all flags false, **0 dual-authority violations**,
  23 systems, three distinct privacy hashes (DM `e14c82fa` / Player-Safe `de1cce1f` / Observer `fb602370`).

---

## PART B — Local cutover ON + real Caldran battle token move
Flags: `VITE_UNIVERSAL_DIAGNOSTICS=1 VITE_UNIVERSAL_BATTLE_AUTHORITY=1 VITE_UNIVERSAL_LOCAL_CUTOVER=1`.
Real campaign: **Stage14 UC Test** (Кальдран), campaignId `camp-ms7krgk7-einpb`.
Set up 4 custom battle boards × 4 tokens = **4 boards / 16 tokens** (Caldran anchor), then drove the
**normal battle UI** (select token → Телепорт → click destination cell).

### Cutover ON diagnostics (real browser)
engine **active=true**, battleAuthority=true, localCutover=true, **0 dual-authority violations**.

### Real token-move vertical slice (Goblin alpha, token `t1`, board `custom-alpha`)
| Step | durable key `universal-battle:v1:camp-ms7krgk7-einpb:custom-alpha` | legacy board | universal runtime |
|---|---|---|---|
| before | (none) | t1 @ (20,20) | — |
| move #1 | **revision 1** | t1 @ (85, 7.1) | t1 @ (85, 7.1) — **match** |
| refresh | revision 1 (persisted) | t1 @ (85, 7.1) (persisted, renders in UI) | — |
| move #2 | **revision 2** | t1 @ (15, 79) | t1 @ (15, 79) — **match** |

Proven: normal UI action → typed universal `move-token` command → exact campaignId + battleId +
tokenId → expected-revision durable commit → **exactly one** revision increment per move →
compatibility projection (legacy board == universal durable state) → read-after-write → refresh
persistence. No Greyholm/active-campaign fallback (durable key is campaign+board scoped).

### Battle recovery (real browser failure injection)
Set dev fixture `localStorage['stage17.test.failBattleCompatOnce']='1'`, then moved t1:
- **universal committed** (revision **3**, universal t1 @ (75,79)) but legacy stayed @ (15,79)
  → `universal_committed_legacy_pending`; a pending record `{tokenId:t1, committedRevision:3}` was written.
- **reload** → recovery applied the compatibility transition: legacy t1 → (75,79) == universal;
  **pending count 0**; durable revision **unchanged at 3** (no second universal commit, no duplicate action).

---

---

## PART C — real Greyholm battle mutation (advance turn)
Greyholm's single `ActiveBattleState` via the normal embedded battle overlay's **"Следующий ход"**
button. Battle *setup* seeded (a DM-started battle `gb-test-1`, 3 combatants) as the precondition —
the MUTATION runs through the real button. campaignId `camp:greyholm:main`.

| Step | durable key `universal-battle:v1:camp:greyholm:main:gb-test-1` | legacy overlay activeBattle | universal runtime |
|---|---|---|---|
| before | (none) | turn=gc-hero, round 1 | — |
| "Следующий ход" #1 | **revision 1** | turn=gc-bandit1, round 1 | turn=gc-bandit1, round 1 — **match** |
| "Следующий ход" #2 | **revision 2** | turn=gc-bandit2, round 1 | round 1 — match |
| refresh | revision 2 (persisted) | UI shows "Ход: Бандит 2" | — |

Proven: normal Greyholm UI → typed universal `set-turn` command → exact greyholm campaignId + battleId
→ expected-revision durable commit → **one commit per advance** → compatibility projection (legacy
overlay == universal durable state) → read-after-write → refresh persistence. No active-campaign /
first-battle fallback, no guessed battleId, no debug button.

### Greyholm battle recovery (real browser failure injection)
Fixture `stage17.test.failBattleCompatOnce`, then "Следующий ход":
- **universal committed** (revision **3**, turn=gc-hero, round 2 wrapped) but legacy stayed at
  gc-bandit2/round1 → `universal_committed_legacy_pending`, pending record written.
- **reload** → recovery applied the legacy transition (turn→gc-hero, round 2 == universal); **pending 0**;
  durable revision **unchanged at 3** (no second universal commit, no duplicate advance).

---

---

## PART D — live diagnostics + campaign isolation
`/diagnostics/stage-17` with cutover ON reads the **real** Stage 17 battle namespace (no placeholders):
- engine active=true, 0 dual-authority, **2 durable battle records**, 0 pending.
- Two distinct campaign-scoped rows coexisting: `camp-ms7krgk7-einpb / custom-alpha` rev 3 (4 tokens,
  hash `b21e19ca`) and `camp:greyholm:main / bm-market` rev 3 (3 tokens, hash `47ecef61`).
- Distinct hashes per campaign → genuine Greyholm/Caldran durable isolation, live.

---

## What this establishes (real, non-fabricated)
The **#1 mandatory vertical slice is done and browser-proven**: a real Caldran battle token move runs
universal-first with a durable expected-revision commit, a matching legacy compatibility projection,
refresh persistence, and full pending-recovery on compatibility failure — under local cutover ON with
zero dual-authority. Backed by 258 Node assertions (incl. 27 on the durable battle move path over real
Caldran fixtures).

## Still pending (honest)
Greyholm battle mutation flow; import/export & backup/restore UI round-trips; application sync
lifecycle; Player-Safe/Observer battle-specific browser proof; second-UC in-browser isolation;
diagnostics live battle/sync counters.

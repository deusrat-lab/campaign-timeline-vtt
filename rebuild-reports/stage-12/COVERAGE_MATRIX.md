# Stage 12 — Module classification & verification coverage

## Module classification (registry: `src/domain/workspace/moduleRegistry.ts`)

| Module | Greyholm | User Campaign | Classification | Projection / read source | Write owner | Result |
| --- | --- | --- | --- | --- | --- | --- |
| campaign.summary | ✓ (DM) | ✓ (DM) | shared-read-only | dm · `<kind>.dm.summary` | — | universal-when-fresh, else legacy |
| library.dmList | ✓ (DM) | — | shared-read-only | dm · `greyholm.dm.npcList` | — | universal-when-fresh, else legacy |
| library.playerSafe | ✓ (all) | ✓ (all) | shared-read-only | playerSafe · `<kind>.playerSafe.entities` | — | universal-when-fresh, else legacy |
| observer.status | ✓ (DM/obs) | ✓ (DM/obs) | shared-read-only | observer · `<kind>.observer.status` | — | universal-when-fresh, else legacy |
| runtime.presentation | ✓ (all) | — | shared-read-only | playerSafe · `greyholm.runtime.presentation` | — | universal-when-fresh, else legacy |
| library.body | ✓ | ✓ | legacy-mixed | — | campaignStore / userCampaignStore | legacy (unchanged) |
| map.workspace | ✓ | ✓ | legacy-mixed | — | MapWorkspacePage / IsolatedCampaignMapWorkspace | legacy (not composed) |
| battle.board | ✓ | ✓ | legacy-write | — | battle stores | legacy (not composed) |
| settings | — | ✓ | legacy-write | — | userCampaignStore | legacy (not composed) |
| importExport | ✓ | ✓ | legacy-write | — | overlayStorage / userCampaignSync | legacy (not composed) |

Invariant asserted by harness (C6): **no write-capable module is classified
shared/universal**.

## Browser verification table (local dev only, no deploy)

| Flow | Shadow | Read | Workspace | Campaign | Workspace source | Read modules | Write modules | Result |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Greyholm all off | off | off | off | greyholm | none (baseline) | none | legacy | baseline UI, no shell |
| Greyholm shared shell + legacy reads | on | off | on | greyholm | shared shell | legacy (bands hidden) | legacy | shell + body, no empty bands |
| Greyholm shared shell + universal reads | on | on | on | greyholm | shared shell | 5 shared-read-only + legacy fallback | legacy | shell + 5 sections + legacy body ✓ |
| Greyholm flag-off baseline | on | on | off | greyholm | none | Stage 11 band (5) | legacy | no shell, Stage 11 intact ✓ |
| UC normal DM route | on | on | on | camp-caldran-a | shared shell (same contract) | summary+playerSafe+observer | legacy body | kind=userCampaign, scoped id ✓ |
| UC player view (privacy) | on | on | on | camp-caldran-a | shared shell | playerSafe only | legacy body | DM slots + DM nav absent from DOM ✓ |

## Regression (local)

| Check | Result |
| --- | --- |
| typecheck (`tsc --noEmit`) | PASS |
| build (`tsc -b && vite build`) | PASS |
| Stage 12 harness | 97/97 PASS |
| Stage 11 | 72/72 PASS |
| Stage 10 | 74/74 PASS |
| Stage 9 | 44/44 PASS |
| Stage 8 / negative | 66/66 + 18/18 PASS |
| Stage 8d | 46/46 PASS |
| Stage 4 / 5 / 6 / 7 | PASS (parity, projections, repository, migration) |
| domain no-`any` gate | PASS |
| Anchors | Greyholm DM 979 / player-safe 603 / observer 603; battle maps 139 — unchanged |
| Network | local only; no production/Railway host; no write methods |
| Console | no errors |

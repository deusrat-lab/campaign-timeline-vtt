# Server roadmap

Written 2026-07-02, before any backend existed. Updated the same day once
Phases 0–2 below were actually built — see each phase's status. Based on the
constraints given at the time: no server yet ("куплю сервер позже"), no
budget for a paid backend service on top of it, want it comfortable to keep
developing locally, and eventually — not necessarily now — a single DM login
and a single shared player login (possibly a public release later, e.g. via
Steam, which is explicitly out of scope for this plan).

**Status: Phases 0–2 are built and locally verified (backend, HTTP adapter,
deploy config). Phase 3 — actually deploying — needs a real Railway project
and hasn't run against a live deployment yet. The app still runs exactly as
a local-only, single-browser tool when `VITE_API_BASE_URL` is unset; nothing
about local dev changed.**

## Why this shape, not a BaaS

Supabase/Firebase-style backends were considered and rejected for this
project specifically because of the budget constraint: free tiers exist, but
they're a second thing to manage and a future cost driver once campaign data
or traffic grows, for no benefit this app actually needs (no need for their
auth systems, row-level security, or scaling — it's one DM and one shared
player session). A self-hosted Node.js service is the cheaper, simpler fit:
it runs entirely on the one server being bought anyway, at zero additional
recurring cost, with no third-party account to manage.

## Recommended stack

- **Node.js + Express (or Fastify)** — same language as the frontend, one
  runtime to deploy.
- **SQLite via `better-sqlite3`** — a single file on disk, zero setup, zero
  monthly cost, trivially backed up (`cp campaign.db campaign.db.bak`). No
  separate database server/process to run or pay for. Comfortably handles a
  personal campaign's write volume (a few writes per minute during a
  session, at most).
- **Hosting: Railway** (Hobby plan, $5/mo minimum usage) — chosen over a
  raw VPS because it removes the reverse-proxy/TLS/process-supervisor work
  entirely (HTTPS, restarts, and the domain are handled by the platform),
  which matters more here than the few dollars a bare VPS might save. Two
  services in one Railway project: `server/` (backend, needs a persistent
  Volume for the SQLite file) and the repo root (frontend static build).
  `railway.json` is already in both locations — see `server/README.md` for
  the exact dashboard steps. If Railway ever stops fitting, the backend has
  zero Railway-specific code — a plain VPS with Caddy (free automatic HTTPS)
  + systemd works identically, since it's just a Node process reading
  `PORT`/`DB_PATH`/`DM_TOKEN`/`PLAYER_TOKEN` from the environment.

Total recurring cost: the Railway Hobby plan itself (~$5/mo) — nothing
else. The frontend's static build can also go on Vercel/Netlify/Cloudflare
Pages for free instead of a second Railway service, if preferred.

## Data model: don't normalize, lift-and-shift the overlay

The client already has one JSON blob — `CampaignOverlay`
(`src/state/overlay.ts`) — that represents the entire DM edit state. Resist
the urge to design a proper relational schema for it; that's a large rewrite
for no near-term benefit with one DM and one campaign. Instead:

```sql
CREATE TABLE campaigns (
  id TEXT PRIMARY KEY,          -- e.g. 'default' for a single-campaign server
  overlay_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

The server's job is to store and hand back this blob, and broadcast it to
other connected clients — not to understand its contents. This keeps the
backend tiny and means the server never needs to change when overlay fields
change on the client.

## Auth: two static tokens, not accounts

Per the current decision (one DM login, one player login, no per-player
accounts): the server reads two secrets from its own environment —
`DM_TOKEN` and `PLAYER_TOKEN` — generated once (e.g. a random UUID each) and
given out as part of the URL the DM/players open, or entered once and stored
in `localStorage` on that device. No password hashing, no sessions, no user
table.

- Requests carrying `DM_TOKEN` may read and write.
- Requests carrying `PLAYER_TOKEN` may only read, and only ever receive
  whatever the existing player-safe projection logic
  (`src/data/playerSafeProjection.ts`, `PlayerSafeCompanionWindow`) already
  computes client-side — the server should not need to re-implement that
  filtering itself if the client only ever sends/receives the full overlay
  and the CLIENT enforces what a player-mode session renders (as it now does
  via `DmOnlyRoute` in `App.tsx`, added this session). If the client is ever
  fully untrusted (e.g. a public release), that filtering needs to move
  server-side too — flagged under "Later / only if this goes public" below.

This is intentionally the same two-tier model the client already uses
(`AppMode`: `dm-view`/`dm-edit` vs `player-view`) — the server boundary
mirrors, not replaces, the client one.

## API surface (minimal)

- `GET /api/overlay` — returns the current `overlay_json`. Requires either token.
- `PUT /api/overlay` — replaces `overlay_json`. Requires `DM_TOKEN`.
- A realtime channel (WebSocket, or Server-Sent Events if simpler) that
  pushes the new overlay to every other connected client whenever `PUT`
  succeeds — this is what makes multi-device sync actually work (DM's
  laptop, a player's phone), replacing the same-browser-only
  `window.addEventListener('storage', …)` mechanism the app uses today.

## Client integration point (already prepared this session)

`src/state/persistence/overlayStorage.ts` defines `OverlayStorageAdapter`
(`load`/`save`/`subscribe`) and `campaignStore.tsx` already calls through it
instead of touching `localStorage` directly. The only new client work when
the server exists:

1. Write `createHttpOverlayAdapter(apiBaseUrl, token)` in that same file,
   implementing the same three methods against the API above (`subscribe`
   opens the WebSocket/SSE connection).
2. In `campaignStore.tsx`, pick the adapter based on whether
   `API_BASE_URL` (from `src/config.ts`, reads `VITE_API_BASE_URL`) is set —
   local dev with no env var keeps working exactly as it does today.
3. Handle `load()` being async now (see the long comment already sitting at
   the top of `overlayStorage.ts` for the recommended approach: local-first,
   apply the server's response once it arrives via the same
   `IMPORT_OVERLAY` path `subscribe()` already uses today for cross-tab
   sync — no new dispatch type needed).
4. Reuse `lastSyncedJsonRef`'s dedupe-by-exact-JSON guard in
   `campaignStore.tsx` as-is — it exists specifically to stop the
   save→broadcast→re-import→save loop that happened once already this
   session with cross-tab sync, and a server introduces the exact same
   hazard with more clients.

## Suggested phase order

- **Phase 0 — done (2026-07-02):** `DmOnlyRoute` guard, the
  `OverlayStorageAdapter` extraction, `.env`/`config.ts` scaffolding. The
  app behaves identically to before; this phase only made the next ones
  cheaper.
- **Phase 1 — done (2026-07-02):** `server/` — Express + better-sqlite3 +
  `ws`, exactly the API below. Verified locally with curl and a raw
  WebSocket client: token auth (401/403 on bad/player-write), PUT persists
  and broadcasts to other connected sockets, GET reads it back.
- **Phase 2 — done (2026-07-02):** `createHttpOverlayAdapter` in
  `overlayStorage.ts` (local-first cache + one-shot reconcile + WebSocket
  push, per the design above), wired into `campaignStore.tsx` behind
  `API_BASE_URL && token`. Token capture-from-URL in
  `src/state/persistence/authToken.ts`, called once at boot in `main.tsx`.
  `npm run typecheck`/`build`/`lint:hooks` all clean; behavior with no env
  vars set is unchanged (still plain localStorage, confirmed no new network
  calls fire in that case).
- **Phase 3 — not done, needs an actual server:** deploy `server/` and the
  built frontend to Railway (`railway.json` at repo root and in `server/`
  are ready — see `server/README.md` for the exact dashboard steps: two
  services, a volume on the backend, `DM_TOKEN`/`PLAYER_TOKEN`/
  `ALLOWED_ORIGINS` variables, `VITE_API_BASE_URL` on the frontend build).
  Once live: open `https://<frontend>/?token=<DM_TOKEN>` once, open a second
  browser/device with `?token=<PLAYER_TOKEN>`, confirm a change made as DM
  shows up on the player device without a manual reload.
- **Phase 4 — later, only if this ever goes public (Steam or similar):**
  real accounts, per-campaign ownership/isolation, rate limiting, and moving
  player-safe filtering server-side so a malicious client can't just request
  the full overlay with a player token. None of this is needed for a home
  campaign with a DM you trust holding the DM token.

## Explicitly not doing (avoid scope creep)

No Postgres, no Redis, no Docker/Kubernetes, no CI/CD pipeline, no
BaaS/SaaS subscription. All of these solve problems this app doesn't have
yet — a single campaign, a DM, and a handful of players. Revisit only if
Phase 4 (public release) actually happens.

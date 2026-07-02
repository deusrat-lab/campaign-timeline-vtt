# campaign-timeline-vtt-server

Self-hosted sync backend for the campaign app one directory up. Full design
rationale lives in [`../docs/SERVER_ROADMAP.md`](../docs/SERVER_ROADMAP.md) —
read that first if anything here needs changing.

One campaign, one SQLite file, two static tokens (DM / player). No accounts,
no ORM, no external database service — everything runs in this one process.

## Local dev

```bash
cd server
npm install
cp .env.example .env
# fill in DM_TOKEN / PLAYER_TOKEN in .env (node -e "console.log(crypto.randomUUID())")
npm run dev
```

Server listens on `:8080` (`PORT` env to change). `GET /health` should
return `{"ok":true}` once it's up.

## API

- `GET /api/overlay` — `Authorization: Bearer <DM_TOKEN or PLAYER_TOKEN>`.
  Returns `{ "overlay": <object|null> }`.
- `PUT /api/overlay` — `Authorization: Bearer <DM_TOKEN>` only. Body
  `{ "overlay": <object> }`. Broadcasts the new overlay to every other
  connected WebSocket client.
- `wss://.../ws?token=<token>&clientId=<anything>` — receive-only stream of
  overlay updates saved by OTHER clients. `clientId` is whatever the
  connecting tab wants to call itself; the server never echoes an update
  back to the socket that carries the same `clientId` as the `PUT` that
  triggered it (see `broadcast()` in `src/index.js`).

## Deploying (Railway)

1. Push this repo to GitHub, create a Railway project from it, set the
   **root directory to `server/`** (or deploy it as its own Railway service
   pointed at this subfolder — either works, the important part is Railway
   runs `npm install && npm start` from inside `server/`, not the repo root).
2. **Attach a Volume** to the service, mounted at e.g. `/data`, and set
   `DB_PATH=/data/campaign.db`. Without this, every redeploy wipes the
   campaign — Railway's container disk is otherwise ephemeral.
3. Set `DM_TOKEN`, `PLAYER_TOKEN`, and `ALLOWED_ORIGINS` (your deployed
   frontend's origin) as Railway Variables.
4. Railway sets `PORT` itself — don't hardcode it, the app already reads
   `process.env.PORT`.
5. On the frontend, set `VITE_API_BASE_URL` to this service's Railway URL
   (see the repo root's `.env.example`) and rebuild.

See `../railway.json` at the repo root for the matching frontend static-site
config, if the frontend is deployed as a second Railway service rather than
somewhere like Vercel/Netlify.

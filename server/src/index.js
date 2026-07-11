import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { loadOverlay, saveOverlay, loadUserCampaign, saveUserCampaign, deleteUserCampaign, listUserCampaigns } from './db.js';
import { assertTokensConfigured, requireDm, roleForToken } from './auth.js';

assertTokensConfigured();

const PORT = process.env.PORT || 8080;
// Comma-separated list of allowed origins for CORS, e.g.
// "https://your-frontend.example.com,http://localhost:5175". No default —
// an empty/unset value means same-origin only (safe default when the
// frontend is served BY this same service, see server/README.md).
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

const app = express();
app.use(express.json({ limit: '10mb' })); // the overlay can legitimately be a few MB (see docs/campaign-vtt-localstorage-overlay memory)

app.use((req, res, next) => {
  const origin = req.get('origin');
  if (origin && (ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin))) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  }
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Railway (and most hosts) hit this to confirm the container is alive —
// deliberately unauthenticated, returns nothing about campaign data.
app.get('/health', (_req, res) => res.json({ ok: true }));

// PUBLIC read, on purpose. Players open a plain link the DM shares (e.g.
// .../observer) with no token — a fresh incognito session has no stored
// token, so if reading required auth the player would silently fall back to
// the empty baked-in snapshot and see none of the DM's edits (this was the
// real "no sync / half the locations missing / battle map never appears"
// bug). The client still runs its player-safe projection so the UI hides
// DM-only fields; the trade-off is that the raw overlay (incl. dmNotes) is
// readable by anyone with the URL, which is acceptable for a home campaign
// and deliberately deprioritized (see docs/SERVER_ROADMAP.md, Phase 4).
// WRITES still require the DM token (requireDm below).
app.get('/api/overlay', (_req, res) => {
  const json = loadOverlay();
  res.json({ overlay: json ? JSON.parse(json) : null });
});

// Lets a client ask the server what role its token grants, WITHOUT trying a
// destructive write. The DM UI uses this to show an honest "syncing / NOT
// syncing" indicator: a browser that never captured the DM token (opened the
// plain link instead of the ?token=... one) is silently read-only, which was
// exactly why a DM's battle map / edits never reached players. Returns
// { role: 'dm' | 'player' | null }.
app.get('/api/whoami', (req, res) => {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  res.json({ role: roleForToken(token) });
});

app.put('/api/overlay', requireDm, (req, res) => {
  const { overlay } = req.body;
  if (!overlay || typeof overlay !== 'object') {
    res.status(400).json({ error: 'Body must be { overlay: <object> }' });
    return;
  }
  const json = JSON.stringify(overlay);
  saveOverlay(json);
  broadcast(json, req.query.clientId);
  res.json({ ok: true });
});

// ── User campaigns (multi-campaign) ────────────────────────────────────────
// Fully additive to the single-overlay main-campaign flow above: separate
// routes, separate `uc:` DB rows, separate `/ws-uc` socket. Reads are public
// (players open a tokenless link, same rationale as GET /api/overlay); writes
// and deletes require the DM token.
app.get('/api/campaigns', (_req, res) => {
  res.json({ campaigns: listUserCampaigns() });
});

app.get('/api/campaigns/:id', (req, res) => {
  const json = loadUserCampaign(req.params.id);
  res.json({ campaign: json ? JSON.parse(json) : null });
});

app.put('/api/campaigns/:id', requireDm, (req, res) => {
  const { campaign } = req.body;
  if (!campaign || typeof campaign !== 'object') {
    res.status(400).json({ error: 'Body must be { campaign: { data, runtime } }' });
    return;
  }
  const json = JSON.stringify(campaign);
  saveUserCampaign(req.params.id, json);
  broadcastUc(req.params.id, JSON.stringify({ campaignId: req.params.id, payload: campaign }), req.query.clientId);
  res.json({ ok: true });
});

app.delete('/api/campaigns/:id', requireDm, (req, res) => {
  deleteUserCampaign(req.params.id);
  broadcastUc(req.params.id, JSON.stringify({ campaignId: req.params.id, deleted: true }), req.query.clientId);
  res.json({ ok: true });
});

const httpServer = createServer(app);
// Two independent sockets on one HTTP server. `{ server, path }` can't be used
// for both (the first WSS aborts upgrades for the other's path with 400), so
// we run both in `noServer` mode and route the HTTP upgrade by pathname
// ourselves. `/ws` is the untouched main-campaign socket; `/ws-uc` carries
// per-user-campaign messages so they never reach the main `/ws` listener
// (which applies any message verbatim as the overlay).
const wss = new WebSocketServer({ noServer: true });
const wssUc = new WebSocketServer({ noServer: true });
httpServer.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/ws') {
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  } else if (pathname === '/ws-uc') {
    wssUc.handleUpgrade(req, socket, head, (ws) => wssUc.emit('connection', ws, req));
  } else {
    socket.destroy();
  }
});

/** Broadcasts the new overlay JSON to every connected client except the one
 * that just wrote it (identified by the same `clientId` query param it
 * connected its websocket with) — this is the server-side half of the exact
 * echo-loop guard `campaignStore.tsx`'s `lastSyncedJsonRef` already relies
 * on for cross-tab localStorage sync; skipping the origin socket here means
 * the client doesn't need to also dedupe an identical JSON string it just
 * sent itself. */
function broadcast(json, originClientId) {
  for (const client of wss.clients) {
    if (client.readyState !== client.OPEN) continue;
    if (originClientId && client.clientId === originClientId) continue;
    client.send(json);
  }
}

/** Same echo-loop guard as `broadcast`, but for the user-campaign socket. */
function broadcastUc(_campaignId, json, originClientId) {
  for (const client of wssUc.clients) {
    if (client.readyState !== client.OPEN) continue;
    if (originClientId && client.clientId === originClientId) continue;
    client.send(json);
  }
}

wssUc.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  ws.clientId = url.searchParams.get('clientId') || undefined;
  ws.role = roleForToken(url.searchParams.get('token'));
});

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  // Tokenless connections are allowed and are the normal case for players
  // (their shared link carries no token). The socket is receive-only from
  // every client's perspective — it only pushes OTHER clients' saves to this
  // one — so an unauthenticated listener can do nothing but receive the same
  // public overlay it could already GET. All writes still go through the
  // DM-token-gated PUT /api/overlay.
  ws.clientId = url.searchParams.get('clientId') || undefined;
  ws.role = roleForToken(url.searchParams.get('token'));
});

httpServer.listen(PORT, () => {
  console.log(`campaign-timeline-vtt-server listening on :${PORT}`);
});

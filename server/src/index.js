import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { loadOverlay, saveOverlay } from './db.js';
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
    res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
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

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

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

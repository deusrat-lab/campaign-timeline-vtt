import express from 'express';
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { loadOverlay, saveOverlay } from './db.js';
import { assertTokensConfigured, requireAuth, requireDm, roleForToken } from './auth.js';

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

app.get('/api/overlay', requireAuth, (_req, res) => {
  const json = loadOverlay();
  res.json({ overlay: json ? JSON.parse(json) : null });
});

app.put('/api/overlay', requireAuth, requireDm, (req, res) => {
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
  const token = url.searchParams.get('token');
  const role = roleForToken(token);
  if (!role) {
    ws.close(4401, 'Invalid or missing token');
    return;
  }
  ws.clientId = url.searchParams.get('clientId') || undefined;
  ws.role = role;
  // Receive-only from the client's perspective, on purpose: all writes go
  // through PUT /api/overlay (one write path, easy to reason about); this
  // socket exists solely to push OTHER clients' saves to this one. See
  // SERVER_ROADMAP.md's API surface section.
});

httpServer.listen(PORT, () => {
  console.log(`campaign-timeline-vtt-server listening on :${PORT}`);
});

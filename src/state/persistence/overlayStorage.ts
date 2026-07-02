/**
 * Persistence adapter boundary for the campaign overlay (all DM edits:
 * NPC/quest/location patches, active battle, party position, etc — see
 * CampaignOverlay in campaignStore.tsx).
 *
 * Today there is exactly one implementation, `localStorageOverlayAdapter`,
 * and campaignStore.tsx behaves EXACTLY as before this file existed — this
 * is a pure extraction, not a behavior change. The point is that
 * campaignStore.tsx (and loadPersisted's reducer-init call in particular)
 * now talks to `OverlayStorageAdapter`, never to `localStorage` directly, so
 * swapping in a server-backed adapter later is a one-file change instead of
 * a rewrite of the store.
 *
 * ROADMAP for a server-backed adapter (see docs/SERVER_ROADMAP.md for the
 * full plan) — read this before writing one:
 *
 * 1. `load()` here is SYNCHRONOUS because `useReducer(reducer, undefined,
 *    loadPersisted)` needs its initializer to return a value immediately —
 *    React can't await inside it. A network-backed adapter can't satisfy
 *    that: fetching the overlay from a server is inherently async. Two
 *    ways to bridge this, pick when you get there:
 *      a) Keep `load()` synchronous and have it return whatever's in a
 *         local cache (e.g. IndexedDB read hydrated at app boot, or the
 *         last localStorage snapshot) as a fast first paint, then apply the
 *         real server response once it arrives via `subscribe()` or a
 *         one-shot IMPORT_OVERLAY dispatch — i.e. local-first with the
 *         server treated as just another "remote tab" pushing updates.
 *      b) Add a loading gate above CampaignStoreProvider (a top-level
 *         `await fetch(...)` before the provider mounts at all) and only
 *         change `loadPersisted`'s DEFAULT when nothing was cached yet.
 *    (a) is less invasive and matches the "local-first, sync opportunistically"
 *    model implied by keeping the app usable offline — recommended.
 * 2. `save()` becomes a debounced POST/PATCH to the backend instead of a
 *    synchronous write. The store's own `saveStatus` ('idle'/'saved'/'error')
 *    plumbing already expects save() to be able to fail — a network
 *    adapter's `save()` should reject/throw on failure exactly like the
 *    current implementation's try/catch around a quota error, so no
 *    campaignStore.tsx changes are needed there.
 * 3. `subscribe()` currently listens to the browser's cross-tab `storage`
 *    event (fires when ANOTHER tab of the same browser writes the same
 *    key). A server adapter's `subscribe()` is where a WebSocket/SSE
 *    listener would live, calling `onRemoteChange` whenever another
 *    connected client (DM's laptop, a player's phone) saves a change —
 *    this is the actual mechanism multi-device sync hangs off. The
 *    dedupe-by-last-synced-JSON logic in campaignStore.tsx (see
 *    `lastSyncedJsonRef`) already exists BECAUSE of a real bug this session
 *    where naive re-import-on-every-remote-write caused a feedback loop —
 *    a server adapter inherits that same hazard and should reuse the exact
 *    same "did I already write this exact JSON" guard.
 * 4. Auth: per this campaign's current plan (one DM token, one shared
 *    player token, no per-player accounts), `save()`/`load()` on a server
 *    adapter should send whichever token is held for the active `AppMode`
 *    ('dm-view'/'dm-edit' vs 'player-view') and the backend should reject
 *    writes from the player token outright — mirroring the client-side
 *    DmOnlyRoute guard in App.tsx, but as a REAL boundary instead of a
 *    convenience one.
 */

export interface OverlayStorageAdapter {
  /** Synchronous read of the last-persisted overlay JSON, or null if none exists yet. */
  load(): string | null;
  /** Persist the given overlay JSON. Throws (synchronously, for the current
   * localStorage adapter) on failure — callers already handle this via try/catch. */
  save(json: string): void;
  /** Subscribe to overlay changes that happened OUTSIDE this call site (a
   * different tab today; a different device once there's a server). Returns
   * an unsubscribe function. */
  subscribe(onRemoteChange: (json: string) => void): () => void;
}

export function createLocalStorageOverlayAdapter(storageKey: string): OverlayStorageAdapter {
  return {
    load() {
      return localStorage.getItem(storageKey);
    },
    save(json: string) {
      localStorage.setItem(storageKey, json);
    },
    subscribe(onRemoteChange) {
      function onStorage(event: StorageEvent) {
        if (event.key !== storageKey || !event.newValue) return;
        onRemoteChange(event.newValue);
      }
      window.addEventListener('storage', onStorage);
      return () => window.removeEventListener('storage', onStorage);
    },
  };
}

/** Raw read of a second, unrelated storage key — used once, at startup, to
 * migrate the old pre-v2 overlay shape. Not part of OverlayStorageAdapter
 * because it is a one-time migration path, not a thing a future backend
 * needs to implement. */
export function readLegacyOverlayRaw(storageKey: string): string | null {
  return localStorage.getItem(storageKey);
}

/**
 * Server-backed adapter — implements option (a) from the ROADMAP comment
 * above: `load()` stays synchronous by reading a local cache (the SAME
 * localStorage key the plain localStorage adapter would use, so a
 * server-configured browser is never worse off than local-only if the
 * network is down), and the real server state is reconciled asynchronously
 * once `subscribe()` runs — both the one-shot initial fetch and every
 * later WebSocket push go through the same `onRemoteChange` path
 * campaignStore.tsx already wired up for cross-tab localStorage sync, so no
 * new dispatch type or dedupe logic was needed there.
 *
 * Auth: see authToken.ts for why the token is read from localStorage
 * (captured from a `?token=` URL param) rather than baked into the build —
 * this file just uses whatever token it's given and lets the server decide
 * what that token is allowed to do.
 */
export function createHttpOverlayAdapter(options: {
  baseUrl: string;
  token: string;
  cacheKey: string;
}): OverlayStorageAdapter {
  const { baseUrl, token, cacheKey } = options;
  // Per-tab id so the server never echoes a save back to the exact tab that
  // made it (see server/src/index.js's broadcast()) — random per page load
  // is fine, it only needs to be unique for the lifetime of one connection.
  const clientId = Math.random().toString(36).slice(2);
  const authHeaders = { Authorization: `Bearer ${token}` };

  function loadLocalCache(): string | null {
    return localStorage.getItem(cacheKey);
  }
  function saveLocalCache(json: string) {
    localStorage.setItem(cacheKey, json);
  }

  return {
    load() {
      return loadLocalCache();
    },
    save(json: string) {
      // Synchronous local write happens regardless of network state, so the
      // existing try/catch-around-save() in campaignStore.tsx still reports
      // an honest "Сохранено" for at least the local copy even if the
      // network PUT below fails; the network failure itself is logged, not
      // thrown, since fetch is inherently async and save()'s contract here
      // is synchronous (matching the localStorage adapter it's standing in
      // for).
      saveLocalCache(json);
      fetch(`${baseUrl}/api/overlay?clientId=${encodeURIComponent(clientId)}`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ overlay: JSON.parse(json) }),
      }).catch((err) => {
        console.error('[overlayStorage] failed to sync overlay to server:', err);
      });
    },
    subscribe(onRemoteChange) {
      let cancelled = false;

      // One-shot reconciliation on mount: pick up whatever the server had
      // that this browser's local cache doesn't (e.g. a DM's other device
      // saved something while this tab was closed).
      fetch(`${baseUrl}/api/overlay`, { headers: authHeaders })
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`GET /api/overlay ${res.status}`))))
        .then((body: { overlay: unknown }) => {
          if (cancelled || !body.overlay) return;
          const json = JSON.stringify(body.overlay);
          if (json === loadLocalCache()) return;
          saveLocalCache(json);
          onRemoteChange(json);
        })
        .catch((err) => {
          console.error('[overlayStorage] failed to fetch overlay from server:', err);
        });

      const wsUrl = `${baseUrl.replace(/^http/, 'ws')}/ws?token=${encodeURIComponent(token)}&clientId=${encodeURIComponent(clientId)}`;
      const ws = new WebSocket(wsUrl);
      ws.addEventListener('message', (event) => {
        if (cancelled) return;
        const json = String(event.data);
        saveLocalCache(json);
        onRemoteChange(json);
      });
      ws.addEventListener('error', () => {
        // The server push channel is best-effort — losing it just means this
        // tab falls back to whatever it last had until the connection (or a
        // future manual reload) recovers; it never blocks local editing.
        console.error('[overlayStorage] WebSocket connection error');
      });

      return () => {
        cancelled = true;
        ws.close();
      };
    },
  };
}

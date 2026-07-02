/**
 * Reads/persists the DM-or-player token used against the future HTTP
 * overlay backend (see docs/SERVER_ROADMAP.md's "two static tokens"
 * section). Deliberately NOT read from an env var / config.ts constant:
 * this is one built JS bundle served to both the DM and every player, so
 * baking the DM's write-access token into it would let any player read it
 * straight out of devtools. Instead each person's own browser captures
 * whichever token was in the URL the DM handed them (`?token=...`) once,
 * stores it locally, and every request after that carries THAT token — the
 * server (not this file) is what decides whether it grants read-only
 * (player) or read-write (DM) access.
 */

const TOKEN_STORAGE_KEY = 'campaign-timeline-vtt:auth-token';

/** Call once at app boot, before anything reads the token. If the current
 * URL carries `?token=...`, persists it and strips it from the visible URL
 * (so it doesn't linger in browser history / get shared by accident when
 * someone copies the address bar). */
export function captureTokenFromUrl(): void {
  const url = new URL(window.location.href);
  const token = url.searchParams.get('token');
  if (!token) return;
  try {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } catch {
    // localStorage unavailable (private mode / quota) — the token still
    // works for this page load via the URL param itself; it just won't
    // persist across reloads. Not worth failing app boot over.
  }
  url.searchParams.delete('token');
  window.history.replaceState({}, '', url.toString());
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

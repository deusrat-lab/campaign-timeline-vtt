/**
 * Server sync for user (non-main) campaigns.
 *
 * Mirrors the main campaign's overlay sync (see persistence/overlayStorage.ts)
 * but for the multi-campaign endpoints added to the server:
 *   GET    /api/campaigns          → registry list (public read)
 *   GET    /api/campaigns/:id      → { data, runtime } (public read)
 *   PUT    /api/campaigns/:id      → save (DM token required)
 *   DELETE /api/campaigns/:id      → remove (DM token required)
 *   ws://…/ws-uc                   → per-campaign push to other clients
 *
 * Reuses the SAME DM/player token as the main campaign (authToken.ts): a DM
 * (token present) writes; players (tokenless link) read and receive pushes.
 * When `API_BASE_URL` is empty (pure-local build / dev) every function no-ops,
 * so the store falls back to localStorage exactly as before.
 */
import { API_BASE_URL } from '../config';
import { getStoredToken } from './persistence/authToken';
import type { UserCampaignData, UserCampaignRuntime, UserCampaignRegistryEntry } from '../types/userCampaign';

export interface CampaignBlob { data: UserCampaignData; runtime?: UserCampaignRuntime }
export interface UcMessage { campaignId: string; payload?: CampaignBlob; deleted?: boolean }

/** Stable per-tab id so the server can skip echoing our own writes back to us
 * over the websocket (same guard the overlay sync relies on). */
const clientId = Math.random().toString(36).slice(2);

export const syncEnabled = (): boolean => !!API_BASE_URL;

const pushTimers: Record<string, ReturnType<typeof setTimeout>> = {};

/** Debounced DM write of a campaign's `{ data, runtime }` blob. No token →
 * read-only (players): silently skips, exactly like the overlay adapter. */
export function pushCampaign(id: string, getBlob: () => CampaignBlob | null): void {
  if (!API_BASE_URL) return;
  const token = getStoredToken();
  if (!token) return;
  clearTimeout(pushTimers[id]);
  pushTimers[id] = setTimeout(() => {
    const blob = getBlob();
    if (!blob?.data) return;
    fetch(`${API_BASE_URL}/api/campaigns/${encodeURIComponent(id)}?clientId=${clientId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ campaign: blob }),
    }).catch(() => { /* best-effort; local cache is the source of truth offline */ });
  }, 350);
}

export function deleteCampaignRemote(id: string): void {
  if (!API_BASE_URL) return;
  const token = getStoredToken();
  if (!token) return;
  fetch(`${API_BASE_URL}/api/campaigns/${encodeURIComponent(id)}?clientId=${clientId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  }).catch(() => { /* best-effort */ });
}

/** Narrow, tokenless player-sheet write. The server accepts only party sheet
 * fields, so Observer tabs can maintain their character sheets without gaining
 * DM write access to the campaign. */
export function patchPlayerRemote(campaignId: string, playerId: string, patch: Record<string, unknown>): void {
  if (!API_BASE_URL) return;
  fetch(`${API_BASE_URL}/api/campaigns/${encodeURIComponent(campaignId)}/players/${encodeURIComponent(playerId)}?clientId=${clientId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patch }),
  }).catch(() => { /* best-effort; local cache still updates immediately */ });
}

export async function fetchRegistry(): Promise<UserCampaignRegistryEntry[]> {
  if (!API_BASE_URL) return [];
  try {
    const r = await fetch(`${API_BASE_URL}/api/campaigns`);
    if (!r.ok) return [];
    const j = await r.json();
    return Array.isArray(j.campaigns) ? j.campaigns : [];
  } catch {
    return [];
  }
}

export async function fetchCampaign(id: string): Promise<CampaignBlob | null> {
  if (!API_BASE_URL) return null;
  try {
    const r = await fetch(`${API_BASE_URL}/api/campaigns/${encodeURIComponent(id)}`);
    if (!r.ok) return null;
    const j = await r.json();
    return j.campaign ?? null;
  } catch {
    return null;
  }
}

/** Subscribe to per-campaign pushes. Returns an unsubscribe fn. Best-effort:
 * a dropped socket just means this tab stops receiving live updates until a
 * reload; it never blocks local editing. */
export function subscribeUc(onMessage: (m: UcMessage) => void): () => void {
  if (!API_BASE_URL) return () => {};
  const token = getStoredToken();
  const tokenParam = token ? `&token=${encodeURIComponent(token)}` : '';
  const wsUrl = `${API_BASE_URL.replace(/^http/, 'ws')}/ws-uc?clientId=${clientId}${tokenParam}`;
  let ws: WebSocket | null = null;
  try {
    ws = new WebSocket(wsUrl);
    ws.addEventListener('message', (e) => {
      try { onMessage(JSON.parse(String(e.data)) as UcMessage); } catch { /* ignore malformed */ }
    });
    ws.addEventListener('error', () => { /* best-effort push channel */ });
  } catch {
    /* WebSocket unavailable — offline / blocked; local editing still works */
  }
  return () => { try { ws?.close(); } catch { /* noop */ } };
}

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

// Single-campaign tool (per SERVER_ROADMAP.md) — one fixed row id, not a
// real multi-tenant table. Path is env-configurable because Railway (and
// any other host) needs the DB file to live on a MOUNTED VOLUME, not the
// container's own ephemeral filesystem, or every redeploy wipes the
// campaign. See server/README.md for the volume setup.
const DB_PATH = process.env.DB_PATH || './data/campaign.db';
const CAMPAIGN_ID = 'default';

mkdirSync(dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id TEXT PRIMARY KEY,
    overlay_json TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`);

const selectStmt = db.prepare('SELECT overlay_json, updated_at FROM campaigns WHERE id = ?');
const upsertStmt = db.prepare(`
  INSERT INTO campaigns (id, overlay_json, updated_at) VALUES (?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET overlay_json = excluded.overlay_json, updated_at = excluded.updated_at
`);

/** Returns the stored overlay JSON string, or null if nothing saved yet
 * (matches the client's own OverlayStorageAdapter.load() contract). */
export function loadOverlay() {
  const row = selectStmt.get(CAMPAIGN_ID);
  return row ? row.overlay_json : null;
}

/** Persists the overlay JSON string as-is — this server never parses or
 * understands the overlay's shape, exactly like the roadmap's "don't
 * normalize, lift-and-shift" design. */
export function saveOverlay(json) {
  upsertStmt.run(CAMPAIGN_ID, json, new Date().toISOString());
}

// ── User campaigns (multi-campaign) ────────────────────────────────────────
// User-created campaigns are stored as their OWN rows in the SAME table, under
// a namespaced id `uc:<campaignId>`, so they never collide with the main
// campaign's fixed `default` row and the existing /api/overlay flow is 100%
// untouched. Each row's blob is `{ data, runtime }` JSON — the server never
// parses its shape (lift-and-shift), it only stores/serves/lists it.
const UC_PREFIX = 'uc:';
const listUcStmt = db.prepare("SELECT id, overlay_json, updated_at FROM campaigns WHERE id LIKE 'uc:%'");
const deleteStmt = db.prepare('DELETE FROM campaigns WHERE id = ?');

/** Returns the stored `{ data, runtime }` JSON string for a user campaign, or
 * null if none saved yet. */
export function loadUserCampaign(campaignId) {
  const row = selectStmt.get(UC_PREFIX + campaignId);
  return row ? row.overlay_json : null;
}

/** Persists a user campaign's `{ data, runtime }` JSON string as-is. */
export function saveUserCampaign(campaignId, json) {
  upsertStmt.run(UC_PREFIX + campaignId, json, new Date().toISOString());
}

/** Removes a user campaign row entirely. */
export function deleteUserCampaign(campaignId) {
  deleteStmt.run(UC_PREFIX + campaignId);
}

/** Lightweight registry: one entry per stored user campaign with just enough
 * to render the list without shipping every blob. Parses each row defensively;
 * a malformed blob is skipped rather than breaking the whole list. */
export function listUserCampaigns() {
  const out = [];
  for (const row of listUcStmt.all()) {
    const campaignId = row.id.slice(UC_PREFIX.length);
    try {
      const parsed = JSON.parse(row.overlay_json);
      const d = parsed?.data ?? {};
      out.push({
        campaignId,
        title: d.title ?? 'Без названия',
        type: d.type ?? 'campaign',
        baseMapId: d.baseMapId ?? '',
        regionIds: Array.isArray(d.regionIds) ? d.regionIds : [],
        updatedAt: row.updated_at,
      });
    } catch {
      out.push({ campaignId, title: 'Без названия', type: 'campaign', baseMapId: '', regionIds: [], updatedAt: row.updated_at });
    }
  }
  return out;
}

export default db;

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

export default db;

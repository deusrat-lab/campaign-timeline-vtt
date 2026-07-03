// One static DM bearer token gates WRITES; reads are public (see index.js's
// GET /api/overlay comment for why — players use a tokenless link). The
// PLAYER_TOKEN is still accepted where a role is computed, for compatibility
// with links that carry it, but nothing requires it anymore. Startup fails
// loudly only if the DM token is missing — without it, no one could ever
// write, which would silently break the DM.

const DM_TOKEN = process.env.DM_TOKEN;
const PLAYER_TOKEN = process.env.PLAYER_TOKEN;

export function assertTokensConfigured() {
  if (!DM_TOKEN) {
    throw new Error(
      'DM_TOKEN must be set (see server/.env.example). Generate a long random string, ' +
        'e.g. `node -e "console.log(crypto.randomUUID())"`, and never commit it.',
    );
  }
}

/** 'dm' | 'player' | null (unrecognized/missing token). */
export function roleForToken(token) {
  if (!token) return null;
  if (token === DM_TOKEN) return 'dm';
  if (PLAYER_TOKEN && token === PLAYER_TOKEN) return 'player';
  return null;
}

/** Express middleware — reject anything that isn't the DM token. Reads the
 * `Authorization: Bearer <token>` header itself (no separate auth middleware
 * runs first anymore, since reads are public). Used only on write routes. */
export function requireDm(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (roleForToken(token) !== 'dm') {
    res.status(403).json({ error: 'DM token required' });
    return;
  }
  next();
}

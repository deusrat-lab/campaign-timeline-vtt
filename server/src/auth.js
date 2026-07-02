// Two static bearer tokens, no accounts — see SERVER_ROADMAP.md's "Auth: two
// static tokens, not accounts" section for why. Mirrors the client's own
// AppMode split (dm-view/dm-edit vs player-view): DM_TOKEN can read+write,
// PLAYER_TOKEN can only read. Startup fails loudly if either is missing —
// silently running with no auth would be worse than refusing to start.

const DM_TOKEN = process.env.DM_TOKEN;
const PLAYER_TOKEN = process.env.PLAYER_TOKEN;

export function assertTokensConfigured() {
  if (!DM_TOKEN || !PLAYER_TOKEN) {
    throw new Error(
      'DM_TOKEN and PLAYER_TOKEN must both be set (see server/.env.example). Generate two long random ' +
        'strings, e.g. `node -e "console.log(crypto.randomUUID())"`, and never commit them.',
    );
  }
}

/** 'dm' | 'player' | null (unrecognized/missing token). */
export function roleForToken(token) {
  if (!token) return null;
  if (token === DM_TOKEN) return 'dm';
  if (token === PLAYER_TOKEN) return 'player';
  return null;
}

/** Express middleware — reads `Authorization: Bearer <token>`, sets
 * `req.role`, and rejects with 401 if the token doesn't match either one. */
export function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  const role = roleForToken(token);
  if (!role) {
    res.status(401).json({ error: 'Invalid or missing token' });
    return;
  }
  req.role = role;
  next();
}

/** Express middleware — call AFTER requireAuth. Rejects player-role
 * requests, for routes only the DM may use (writes). */
export function requireDm(req, res, next) {
  if (req.role !== 'dm') {
    res.status(403).json({ error: 'DM token required' });
    return;
  }
  next();
}

/**
 * Plain origin of the separate, standalone Battle Map VTT app (a different
 * project, not vendored into this one) — for building a link to LAUNCH its
 * maps screen when a BattleEntry has no in-app battle map configured (see
 * BATTLE_MAP_VTT_BASE_URL below and battleMapLaunch.ts). This app's own
 * embedded battle overlay (EmbeddedBattleOverlay.tsx) is the primary way to
 * run combat now, so this is a secondary/legacy escape hatch, not something
 * every deployment needs.
 *
 * Read from VITE_BATTLE_MAP_VTT_ORIGIN (see .env.example) so a server/prod
 * build never silently points at a `localhost` port that only exists on the
 * DM's own machine. In local dev (`vite dev`, `import.meta.env.DEV`), falls
 * back to the historical `http://localhost:4174` so `npm run dev` keeps
 * working unconfigured, exactly as before this change.
 */
export const BATTLE_MAP_VTT_ORIGIN: string | undefined =
  import.meta.env.VITE_BATTLE_MAP_VTT_ORIGIN || (import.meta.env.DEV ? 'http://localhost:4174' : undefined);

/**
 * Battle-map image assets are vendored into this campaign app's own
 * /public/battle-maps folder, so embedded previews and combat overlays do
 * not depend on the separate Battle Map VTT dev server.
 */
export const BATTLE_MAP_ASSET_ORIGIN = '';

/**
 * URL to open to LAUNCH the separate Battle Map VTT app's maps screen, or
 * undefined when BATTLE_MAP_VTT_ORIGIN isn't configured — callers (see
 * battleMapLaunch.ts) must treat undefined the same as "no battle map
 * configured at all" and fall back to their existing null-handling instead
 * of opening a dead link. Uses hash-based routing (`/#/maps?arc=...`) —
 * see `battleMapLaunch.ts`'s `appendContextParams` for how query params are
 * appended inside the hash for this kind of URL.
 */
export const BATTLE_MAP_VTT_BASE_URL: string | undefined = BATTLE_MAP_VTT_ORIGIN ? `${BATTLE_MAP_VTT_ORIGIN}/#/maps` : undefined;

/**
 * Base URL of this campaign's own future backend API (see
 * docs/SERVER_ROADMAP.md). Empty string today — every persistence call goes
 * through the localStorage-backed adapter in
 * src/state/persistence/overlayStorage.ts, which never reads this constant.
 * Reserved so a network adapter added later has one obvious place to read
 * its endpoint from, configured the same way as everything else here (see
 * .env.example).
 */
export const API_BASE_URL: string = import.meta.env.VITE_API_BASE_URL ?? '';

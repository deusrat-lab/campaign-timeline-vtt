/**
 * Plain origin of the separate Battle Map VTT app's dev server (or deployed
 * instance), with no path/hash — for building STATIC ASSET urls (battle map
 * preview images served from its manifest, e.g.
 * `${BATTLE_MAP_VTT_ORIGIN}/battle-maps/foo.png`). Stage 6C.4: split out
 * from BATTLE_MAP_VTT_BASE_URL below because that constant now points at a
 * hash route, not a plain origin — concatenating an asset path onto it
 * would land inside the hash fragment and 404.
 */
export const BATTLE_MAP_VTT_ORIGIN = 'http://localhost:4174';

/**
 * Battle-map image assets are vendored into this campaign app's own
 * /public/battle-maps folder, so embedded previews and combat overlays do
 * not depend on the separate Battle Map VTT dev server.
 */
export const BATTLE_MAP_ASSET_ORIGIN = '';

/**
 * URL to open to LAUNCH the separate Battle Map VTT app's maps screen.
 * Stage 6C.4: corrected from the stale `:5174` placeholder to the real
 * running dev server, which uses hash-based routing (`/#/maps?arc=...`)
 * rather than a plain path — see `battleMapLaunch.ts`'s
 * `appendContextParams` for how query params are appended inside the hash
 * for this kind of URL.
 */
export const BATTLE_MAP_VTT_BASE_URL = `${BATTLE_MAP_VTT_ORIGIN}/#/maps`;

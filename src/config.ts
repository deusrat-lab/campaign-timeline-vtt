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

export const UNIVERSAL_DIAGNOSTICS_ENABLED: boolean =
  import.meta.env.VITE_UNIVERSAL_DIAGNOSTICS === '1' ||
  import.meta.env.VITE_UNIVERSAL_DIAGNOSTICS === 'true';

/**
 * Stage 9 — local-only universal *shadow* integration (see
 * rebuild-reports/stage-09). When enabled, legacy campaign state changes are
 * additionally projected into an isolated universal snapshot that is validated
 * and written to a separate, campaign-scoped SHADOW localStorage namespace
 * (never the production universal namespace, never the server). Legacy stores
 * remain the sole authoritative source of truth; a shadow failure never blocks
 * a legacy save. Default OFF — the flag must be explicitly opted into via
 * VITE_UNIVERSAL_SHADOW_INTEGRATION and must NOT be set in any committed env
 * file or production/Railway environment. When OFF, zero shadow subscriptions,
 * reads, or writes occur (proven by the Stage 9 harness feature-flag checks).
 */
export const UNIVERSAL_SHADOW_INTEGRATION_ENABLED: boolean =
  import.meta.env.VITE_UNIVERSAL_SHADOW_INTEGRATION === '1' ||
  import.meta.env.VITE_UNIVERSAL_SHADOW_INTEGRATION === 'true';

/**
 * Stage 10 — controlled local universal READ path (see rebuild-reports/stage-10).
 * SEPARATE and INDEPENDENT from the Stage 9 shadow flag above. When enabled, a
 * small allowlist of read-only pilot UI consumers may read from the validated
 * Stage 9 shadow snapshot (through the guarded Universal Read Gateway) instead
 * of the legacy read path — but ONLY when the snapshot is fresh, valid and
 * campaign-matched; otherwise every consumer deterministically falls back to
 * legacy. Legacy stores remain authoritative for ALL writes; this flag never
 * changes any write path, never calls universal commands, and never reads or
 * writes the production universal namespace.
 *
 * Default OFF. Must NOT be set in any committed env file or production/Railway
 * environment. All four flag combinations are defined and safe:
 *   shadow off + read off  -> fully legacy
 *   shadow on  + read off  -> shadow updates, UI stays legacy
 *   shadow on  + read on   -> allowlisted pilots read universal when fresh
 *   shadow off + read on   -> safe legacy fallback (no coordinator auto-created;
 *                             no live status to confirm freshness -> legacy)
 */
export const UNIVERSAL_READ_PATH_ENABLED: boolean =
  import.meta.env.VITE_UNIVERSAL_READ_PATH === '1' ||
  import.meta.env.VITE_UNIVERSAL_READ_PATH === 'true';

/**
 * Optional pilot-scope narrowing for the Stage 10 read path. Comma/space
 * separated list of KNOWN pilot scope ids (see src/domain/readpath/pilotScopes).
 * Empty / unset / "all" / "*" means "all pilot scopes" (when the flag is on).
 * Unknown tokens are ignored — this can only ever narrow the built-in pilot
 * allowlist, never widen it to a non-pilot consumer.
 */
export const UNIVERSAL_READ_PATH_SCOPES: string =
  import.meta.env.VITE_UNIVERSAL_READ_PATH_SCOPES ?? '';

/**
 * Stage 12 — shared Campaign Workspace composition (see rebuild-reports/stage-12).
 * SEPARATE and INDEPENDENT from the Stage 9 shadow and Stage 10 read flags. When
 * enabled, the real Greyholm and user-campaign routes compose their existing
 * header + read-only sections + legacy body through ONE shared workspace shell +
 * descriptor + module registry, instead of ad-hoc per-page layout. It is a
 * COMPOSITION layer only: it never changes any write path, never calls universal
 * commands, never reads/writes the production universal namespace, and does not
 * enable the Stage 9/10 read flags — a shared-read-only module still only reads
 * universal data when the Stage 10 flag independently allows it, else legacy.
 *
 * Default OFF. Must NOT be set in any committed env file or production/Railway
 * environment. When OFF, the host routes render their exact pre-Stage-12 baseline
 * composition (same header, same Stage 11 sections, same legacy body) — zero DOM
 * or layout change, no added subscriptions/reads/writes.
 */
export const SHARED_CAMPAIGN_WORKSPACE_ENABLED: boolean =
  import.meta.env.VITE_SHARED_CAMPAIGN_WORKSPACE === '1' ||
  import.meta.env.VITE_SHARED_CAMPAIGN_WORKSPACE === 'true';

/**
 * Optional stack allowlist for the Stage 12 workspace. Comma/space separated
 * subset of {greyholm, userCampaign}. Empty / unset / "all" / "*" means both
 * stacks (when the flag is on). Unknown tokens are ignored — can only narrow.
 */
export const SHARED_CAMPAIGN_WORKSPACE_SCOPES: string =
  import.meta.env.VITE_SHARED_CAMPAIGN_WORKSPACE_SCOPES ?? '';

/** Resolve whether the shared workspace is enabled for a given campaign kind. */
export function isSharedWorkspaceEnabledForKind(kind: 'greyholm' | 'userCampaign'): boolean {
  if (!SHARED_CAMPAIGN_WORKSPACE_ENABLED) return false;
  const trimmed = SHARED_CAMPAIGN_WORKSPACE_SCOPES.trim().toLowerCase();
  if (trimmed === '' || trimmed === '*' || trimmed === 'all') return true;
  const tokens = trimmed.split(/[\s,]+/).filter(Boolean);
  return tokens.includes(kind.toLowerCase());
}

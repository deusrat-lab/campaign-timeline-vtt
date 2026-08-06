import type { CampaignId } from '../campaign/ids';
import type { ReadPathProjectionKind } from '../readpath/readPathTypes';

/**
 * Stage 12 — shared Campaign Workspace composition contracts.
 *
 * These are PURE, React-free, I/O-free types + builders describing a single
 * workspace *composition* contract that BOTH legacy stacks (Greyholm and user
 * campaigns) can use to lay out an existing route: a campaign identity/header,
 * a shared navigation view model, a status region, and a set of ordered module
 * slots. It is a composition/layout contract only — it carries NO store, NO
 * repository, NO full snapshot, and NO write behaviour. Every mutation stays in
 * the existing legacy pages; a module slot can be a legacy-owned region, but the
 * descriptor only *classifies* it, it never routes writes through the universal
 * store or commands.
 *
 * Principle: "Share workspace composition. Keep mutations legacy."
 *
 * See rebuild-reports/stage-12.
 */

/** The two legacy stacks that share the workspace composition contract. */
export type CampaignWorkspaceKind = 'greyholm' | 'userCampaign';

/** Audience the current workspace is being rendered for. */
export type CampaignWorkspaceAudience = 'dm' | 'player' | 'observer';

/**
 * How a workspace module is owned/served. This is an HONEST classification —
 * only `shared-read-only` modules are served by the Stage 10/11 universal read
 * path (through the guarded gateway, with legacy fallback). Everything that can
 * mutate campaign state is explicitly a legacy-owned classification and is never
 * marked universal.
 */
export type WorkspaceModuleClassification =
  | 'shared-read-only' // served by the shared universal read path (Stage 11 sections), legacy fallback
  | 'legacy-read-only' // read-only, but still rendered by the legacy page (not universalised)
  | 'legacy-mixed' // reads + writes, legacy-owned (e.g. entity library body)
  | 'legacy-write' // primarily a write surface, legacy-owned (e.g. editors)
  | 'unsupported'; // known module that is not composed in this workspace kind

/** Stable module ids classified by the registry. */
export type WorkspaceModuleId =
  | 'campaign.summary'
  | 'library.dmList'
  | 'library.playerSafe'
  | 'observer.status'
  | 'runtime.presentation'
  | 'library.body'
  | 'map.workspace'
  | 'battle.board'
  | 'economy'
  | 'settings'
  | 'importExport';

/** A stable, campaign-scoped navigation item (adapter view model). */
export interface CampaignWorkspaceNavItem {
  /** Stable id (does not change across renders/campaign switches). */
  readonly id: string;
  readonly label: string;
  /** Resolved route path for this campaign. */
  readonly path: string;
  readonly active: boolean;
  /** Audience allowed to see this nav item. */
  readonly audience: CampaignWorkspaceAudience;
}

/**
 * A single composed module slot inside the workspace. The descriptor carries
 * only the classification + metadata; the React shell attaches the actual
 * render node by slot id. No store/snapshot/handlers live here.
 */
export interface CampaignWorkspaceModuleSlot {
  readonly moduleId: WorkspaceModuleId;
  readonly label: string;
  readonly classification: WorkspaceModuleClassification;
  /** Audiences allowed to mount this slot. */
  readonly audiences: readonly CampaignWorkspaceAudience[];
  /** For shared-read-only slots: which read-path pilot scope backs it. */
  readonly readScope: string | null;
  /** For shared-read-only slots: the projection it is entitled to. */
  readonly projection: ReadPathProjectionKind | null;
  /** For legacy slots: which legacy store owns the writes. `null` = pure read. */
  readonly writeOwner: string | null;
}

/**
 * A minimal, non-secret snapshot of workspace status for the status region and
 * diagnostics. Counts are aggregate/derived and never include DM secret payload.
 */
export interface CampaignWorkspaceStatus {
  /** True once the underlying legacy data for this campaign is available. */
  readonly hydrated: boolean;
  /** True when the workspace is running a safe legacy fallback (no fresh universal). */
  readonly usingLegacyFallback: boolean;
  /** Optional short, non-secret status note. */
  readonly note: string | null;
}

/**
 * The immutable composition descriptor shared by both stacks. Deliberately
 * contains NO store instance, NO repository, and NO full campaign snapshot —
 * only identity, a navigation view model, status, and classified module slots.
 */
export interface CampaignWorkspaceDescriptor {
  readonly campaignId: CampaignId;
  readonly campaignKind: CampaignWorkspaceKind;
  readonly title: string;
  readonly subtitle: string | null;
  readonly audience: CampaignWorkspaceAudience;
  /** The currently active route path (for nav active-state + diagnostics). */
  readonly activeRoute: string;
  readonly navigationItems: readonly CampaignWorkspaceNavItem[];
  readonly moduleSlots: readonly CampaignWorkspaceModuleSlot[];
  readonly status: CampaignWorkspaceStatus;
  /**
   * Explicit, honest record that ALL write capabilities remain legacy-owned in
   * this workspace. Used by diagnostics/harness to assert no write was routed
   * through the universal store/commands.
   */
  readonly legacyActionCapabilities: {
    readonly writesRemainLegacy: true;
    readonly universalCommandsInvoked: false;
  };
}

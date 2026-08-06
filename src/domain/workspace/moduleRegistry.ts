import type { ReadPathProjectionKind } from '../readpath/readPathTypes';
import type {
  CampaignWorkspaceAudience,
  CampaignWorkspaceKind,
  WorkspaceModuleClassification,
  WorkspaceModuleId,
} from './workspaceTypes';

/**
 * Stage 12 — the static, honest classification of every workspace module that
 * either stack can compose. This is the single source of truth for:
 *   - which modules are `shared-read-only` (served by the universal read path);
 *   - which modules are legacy-owned (read-only, mixed, or write);
 *   - which audiences may mount a module;
 *   - which campaign kinds compose a module, and on which routes;
 *   - the required read scope + projection for shared-read-only modules;
 *   - the owning legacy store for anything that can write.
 *
 * The registry grants NO capability. A `shared-read-only` module still only
 * reads universal data when the Stage 10 read flag + pilot allowlist allow it
 * (via the guarded gateway) — otherwise it falls back to legacy. And NO module
 * that can write is ever classified as universal (asserted by the harness).
 */
export interface WorkspaceModuleRegistryEntry {
  readonly moduleId: WorkspaceModuleId;
  readonly label: string;
  readonly classification: WorkspaceModuleClassification;
  readonly audiences: readonly CampaignWorkspaceAudience[];
  readonly campaignKinds: readonly CampaignWorkspaceKind[];
  /** Route fragments (for diagnostics; not a router). */
  readonly routes: readonly string[];
  /** Pilot read-path scope backing a shared-read-only module (else null). */
  readonly readScope: string | null;
  readonly projection: ReadPathProjectionKind | null;
  /** Owning legacy store for write-capable modules (else null). */
  readonly writeOwner: string | null;
}

const ALL_AUDIENCES: readonly CampaignWorkspaceAudience[] = ['dm', 'player', 'observer'];
const DM_ONLY: readonly CampaignWorkspaceAudience[] = ['dm'];
const DM_OBSERVER: readonly CampaignWorkspaceAudience[] = ['dm', 'observer'];
const BOTH_KINDS: readonly CampaignWorkspaceKind[] = ['greyholm', 'userCampaign'];

/**
 * The registry. Read scopes reference the Stage 10 pilot allowlist
 * (src/domain/readpath/pilotScopes.ts); the concrete scope id is resolved per
 * stack by the descriptor builder, so entries carry the stack-agnostic *shape*.
 */
export const WORKSPACE_MODULE_REGISTRY: readonly WorkspaceModuleRegistryEntry[] = Object.freeze([
  {
    moduleId: 'campaign.summary',
    label: 'Сводка кампании',
    classification: 'shared-read-only',
    audiences: DM_ONLY,
    campaignKinds: BOTH_KINDS,
    routes: ['library', 'entity-library'],
    readScope: '<kind>.dm.summary',
    projection: 'dm',
    writeOwner: null,
  },
  {
    moduleId: 'library.dmList',
    label: 'NPC (DM)',
    classification: 'shared-read-only',
    audiences: DM_ONLY,
    campaignKinds: ['greyholm'],
    routes: ['entity-library'],
    readScope: 'greyholm.dm.npcList',
    projection: 'dm',
    writeOwner: null,
  },
  {
    moduleId: 'library.playerSafe',
    label: 'Объекты (вид игрока)',
    classification: 'shared-read-only',
    audiences: ALL_AUDIENCES,
    campaignKinds: BOTH_KINDS,
    routes: ['library', 'entity-library'],
    readScope: '<kind>.playerSafe.entities',
    projection: 'playerSafe',
    writeOwner: null,
  },
  {
    moduleId: 'observer.status',
    label: 'Статус наблюдателя',
    classification: 'shared-read-only',
    audiences: DM_OBSERVER,
    campaignKinds: BOTH_KINDS,
    routes: ['library', 'entity-library'],
    readScope: '<kind>.observer.status',
    projection: 'observer',
    writeOwner: null,
  },
  {
    moduleId: 'runtime.presentation',
    label: 'Рантайм (показ/бои)',
    classification: 'shared-read-only',
    audiences: ALL_AUDIENCES,
    campaignKinds: ['greyholm'],
    routes: ['entity-library'],
    readScope: 'greyholm.runtime.presentation',
    projection: 'playerSafe',
    writeOwner: null,
  },
  {
    moduleId: 'library.body',
    label: 'Библиотека (правка карточек)',
    classification: 'legacy-mixed',
    audiences: ALL_AUDIENCES,
    campaignKinds: BOTH_KINDS,
    routes: ['library', 'entity-library'],
    readScope: null,
    projection: null,
    writeOwner: 'legacy: campaignStore / userCampaignStore',
  },
  {
    moduleId: 'map.workspace',
    label: 'Карта (workspace)',
    classification: 'legacy-mixed',
    audiences: ALL_AUDIENCES,
    campaignKinds: BOTH_KINDS,
    routes: ['map'],
    readScope: null,
    projection: null,
    writeOwner: 'legacy: MapWorkspacePage / IsolatedCampaignMapWorkspace',
  },
  {
    moduleId: 'battle.board',
    label: 'Боевая доска',
    classification: 'legacy-write',
    audiences: ALL_AUDIENCES,
    campaignKinds: BOTH_KINDS,
    routes: ['battle'],
    readScope: null,
    projection: null,
    writeOwner: 'legacy: battle stores',
  },
  {
    moduleId: 'economy',
    label: 'Экономика (цены/услуги)',
    classification: 'legacy-write',
    audiences: DM_ONLY,
    campaignKinds: ['greyholm'],
    routes: ['economy', 'services', 'shops', 'taverns'],
    readScope: null,
    projection: null,
    writeOwner: 'legacy: campaignStore (economy/services reference pages)',
  },
  {
    moduleId: 'settings',
    label: 'Настройки кампании',
    classification: 'legacy-write',
    audiences: DM_ONLY,
    campaignKinds: ['userCampaign'],
    routes: ['settings'],
    readScope: null,
    projection: null,
    writeOwner: 'legacy: userCampaignStore',
  },
  {
    moduleId: 'importExport',
    label: 'Импорт / экспорт',
    classification: 'legacy-write',
    audiences: DM_ONLY,
    campaignKinds: BOTH_KINDS,
    routes: ['settings'],
    readScope: null,
    projection: null,
    writeOwner: 'legacy: overlayStorage / userCampaignSync',
  },
]);

const BY_ID = new Map(WORKSPACE_MODULE_REGISTRY.map((entry) => [entry.moduleId, entry]));

export function getWorkspaceModule(moduleId: WorkspaceModuleId): WorkspaceModuleRegistryEntry | undefined {
  return BY_ID.get(moduleId);
}

/** True only for the one classification served by the universal read path. */
export function isSharedReadOnly(entry: WorkspaceModuleRegistryEntry): boolean {
  return entry.classification === 'shared-read-only';
}

/** True when a module can mutate campaign state (must stay legacy). */
export function isWriteCapable(entry: WorkspaceModuleRegistryEntry): boolean {
  return entry.classification === 'legacy-mixed' || entry.classification === 'legacy-write';
}

export function moduleAllowsAudience(
  entry: WorkspaceModuleRegistryEntry,
  audience: CampaignWorkspaceAudience,
): boolean {
  return entry.audiences.includes(audience);
}

export function moduleAllowsKind(
  entry: WorkspaceModuleRegistryEntry,
  kind: CampaignWorkspaceKind,
): boolean {
  return entry.campaignKinds.includes(kind);
}

/**
 * Resolve the stack-agnostic `<kind>.…` read scope template into the concrete
 * pilot scope id for a stack. Non-templated scopes are returned unchanged.
 */
export function resolveModuleReadScope(
  entry: WorkspaceModuleRegistryEntry,
  kind: CampaignWorkspaceKind,
): string | null {
  if (!entry.readScope) return null;
  return entry.readScope.replace('<kind>', kind);
}

/**
 * Integrity invariant used by the harness: no write-capable module may ever be
 * classified as shared/universal. Returns the offending ids (empty = OK).
 */
export function findWriteModulesMarkedUniversal(): WorkspaceModuleId[] {
  return WORKSPACE_MODULE_REGISTRY.filter(
    (entry) => isSharedReadOnly(entry) && entry.writeOwner !== null,
  ).map((entry) => entry.moduleId);
}

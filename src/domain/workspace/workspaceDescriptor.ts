import type { CampaignId } from '../campaign/ids';
import {
  WORKSPACE_MODULE_REGISTRY,
  getWorkspaceModule,
  moduleAllowsAudience,
  moduleAllowsKind,
  resolveModuleReadScope,
  type WorkspaceModuleRegistryEntry,
} from './moduleRegistry';
import type {
  CampaignWorkspaceAudience,
  CampaignWorkspaceDescriptor,
  CampaignWorkspaceKind,
  CampaignWorkspaceModuleSlot,
  CampaignWorkspaceNavItem,
  CampaignWorkspaceStatus,
  WorkspaceModuleId,
} from './workspaceTypes';

/**
 * Stage 12 — pure builders for the shared workspace descriptor + navigation
 * view models. No React, no store, no I/O. Both stacks call these with their own
 * identity + route context; the result is an immutable, audience-filtered
 * descriptor that the shared React shell renders.
 */

export interface WorkspaceDescriptorInput {
  campaignId: CampaignId;
  campaignKind: CampaignWorkspaceKind;
  title: string;
  subtitle?: string | null;
  audience: CampaignWorkspaceAudience;
  activeRoute: string;
  navigationItems: readonly CampaignWorkspaceNavItem[];
  /** Module ids the host wants to compose (order preserved). */
  requestedModules: readonly WorkspaceModuleId[];
  status: CampaignWorkspaceStatus;
}

function toModuleSlot(
  entry: WorkspaceModuleRegistryEntry,
  kind: CampaignWorkspaceKind,
): CampaignWorkspaceModuleSlot {
  return Object.freeze({
    moduleId: entry.moduleId,
    label: entry.label,
    classification: entry.classification,
    audiences: entry.audiences,
    readScope: resolveModuleReadScope(entry, kind),
    projection: entry.projection,
    writeOwner: entry.writeOwner,
  });
}

/**
 * Build the immutable descriptor. Module slots are filtered to those that the
 * registry actually allows for this campaign kind AND this audience — privacy is
 * applied HERE, before the shell ever mounts a slot, so a DM-only module is
 * absent from a player descriptor entirely (not merely CSS-hidden).
 */
export function buildCampaignWorkspaceDescriptor(
  input: WorkspaceDescriptorInput,
): CampaignWorkspaceDescriptor {
  if (!input.campaignId) {
    throw new Error('buildCampaignWorkspaceDescriptor: campaignId is required');
  }

  const navigationItems = Object.freeze(
    input.navigationItems.filter((item) => isNavVisible(item, input.audience)),
  );

  const moduleSlots: CampaignWorkspaceModuleSlot[] = [];
  for (const moduleId of input.requestedModules) {
    const entry = getWorkspaceModule(moduleId);
    if (!entry) continue;
    if (!moduleAllowsKind(entry, input.campaignKind)) continue;
    if (!moduleAllowsAudience(entry, input.audience)) continue;
    moduleSlots.push(toModuleSlot(entry, input.campaignKind));
  }

  return Object.freeze({
    campaignId: input.campaignId,
    campaignKind: input.campaignKind,
    title: input.title,
    subtitle: input.subtitle ?? null,
    audience: input.audience,
    activeRoute: input.activeRoute,
    navigationItems,
    moduleSlots: Object.freeze(moduleSlots),
    status: Object.freeze({ ...input.status }),
    legacyActionCapabilities: Object.freeze({
      writesRemainLegacy: true as const,
      universalCommandsInvoked: false as const,
    }),
  });
}

/** DM sees everything; player/observer only see items marked for their audience. */
function isNavVisible(item: CampaignWorkspaceNavItem, audience: CampaignWorkspaceAudience): boolean {
  if (audience === 'dm') return true;
  return item.audience === audience;
}

/**
 * Greyholm navigation adapter — maps the fixed Greyholm entity-library routes
 * into the shared nav view model. Stable ids, real existing paths.
 */
export function buildGreyholmNavigation(
  activeRoute: string,
  audience: CampaignWorkspaceAudience,
): CampaignWorkspaceNavItem[] {
  const items: Array<Omit<CampaignWorkspaceNavItem, 'active'>> = [
    { id: 'gh.map', label: 'Карта', path: '/map', audience: 'player' },
    { id: 'gh.npc', label: 'NPC', path: '/npc', audience: 'dm' },
    { id: 'gh.enemies', label: 'Враги', path: '/enemies', audience: 'dm' },
    { id: 'gh.quests', label: 'Квесты', path: '/quests', audience: 'dm' },
    { id: 'gh.factions', label: 'Фракции', path: '/factions', audience: 'dm' },
    { id: 'gh.players', label: 'Игроки', path: '/players', audience: 'dm' },
    { id: 'gh.observer', label: 'Наблюдатель', path: '/observer', audience: 'observer' },
  ];
  return items
    .filter((item) => audience === 'dm' || item.audience === audience || item.audience === 'player')
    .map((item) => Object.freeze({ ...item, active: item.path === activeRoute }));
}

/**
 * User-campaign navigation adapter — maps the campaign-scoped library routes.
 * Requires a campaignId so paths are strictly scoped (NO Greyholm fallback).
 */
export function buildUserCampaignNavigation(
  legacyCampaignId: string,
  kind: string,
  activeRoute: string,
  audience: CampaignWorkspaceAudience,
): CampaignWorkspaceNavItem[] {
  if (!legacyCampaignId) {
    throw new Error('buildUserCampaignNavigation: legacyCampaignId is required (no Greyholm fallback)');
  }
  const base = `/campaigns/${legacyCampaignId}`;
  const suffix = audience === 'observer' ? '?as=player&observer=1' : audience === 'player' ? '?as=player' : '';
  const items: Array<Omit<CampaignWorkspaceNavItem, 'active'>> = [
    { id: 'uc.map', label: 'Карта', path: `${base}/map${suffix}`, audience: 'player' },
    { id: 'uc.npc', label: 'NPC', path: `${base}/library/npc${suffix}`, audience: 'dm' },
    { id: 'uc.locations', label: 'Локации', path: `${base}/library/locations${suffix}`, audience: 'player' },
    { id: 'uc.quests', label: 'Квесты', path: `${base}/library/quests${suffix}`, audience: 'dm' },
    { id: 'uc.players', label: 'Персонажи', path: `${base}/library/players${suffix}`, audience: 'player' },
    { id: 'uc.enemies', label: 'Враги', path: `${base}/library/enemies${suffix}`, audience: 'dm' },
  ];
  const activePath = `${base}/library/${kind}`;
  return items
    .filter((item) => audience === 'dm' || item.audience === audience || item.audience === 'player')
    .map((item) => Object.freeze({ ...item, active: item.path.startsWith(activePath) || item.path === activeRoute }));
}

/** All module ids known to the registry (diagnostics helper). */
export function allWorkspaceModuleIds(): WorkspaceModuleId[] {
  return WORKSPACE_MODULE_REGISTRY.map((entry) => entry.moduleId);
}

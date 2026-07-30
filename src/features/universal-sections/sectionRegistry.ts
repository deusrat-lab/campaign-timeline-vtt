import type { ReadPathProjectionKind } from '../../domain';

/**
 * Stage 11 — the registry of REAL application read-only sections that host the
 * guarded universal read path (as opposed to the Stage 10 diagnostics-only
 * pilots). This is descriptive metadata for the DM diagnostics surface so a DM
 * can see, per real section: which route hosts it, which pilot scope it uses,
 * which projection it is entitled to, and which legacy source it falls back to.
 * It grants NO capability by itself — the pilot allowlist in pilotScopes.ts is
 * still the only thing that can enable a universal read.
 */
export interface HostedSectionInfo {
  scope: string;
  route: string;
  component: string;
  legacySource: string;
  projection: ReadPathProjectionKind;
  audience: 'dm' | 'player' | 'observer';
}

export const STAGE_11_HOSTED_SECTIONS: readonly HostedSectionInfo[] = Object.freeze([
  {
    scope: 'greyholm.dm.summary',
    route: '/npc, /enemies, /quests, /factions … (Entity Library)',
    component: 'GreyholmUniversalSections',
    legacySource: 'campaignDataContext + campaignStore (adaptMainCampaignToUniversal)',
    projection: 'dm',
    audience: 'dm',
  },
  {
    scope: 'greyholm.dm.npcList',
    route: '/npc, /enemies, /quests, /factions … (Entity Library)',
    component: 'GreyholmUniversalSections',
    legacySource: 'campaignDataContext + campaignStore (adaptMainCampaignToUniversal)',
    projection: 'dm',
    audience: 'dm',
  },
  {
    scope: 'greyholm.playerSafe.entities',
    route: '/npc, /enemies, … (Entity Library)',
    component: 'GreyholmUniversalSections',
    legacySource: 'campaignDataContext + campaignStore (Player-Safe projection)',
    projection: 'playerSafe',
    audience: 'player',
  },
  {
    scope: 'greyholm.observer.status',
    route: '/npc, /enemies, … (Entity Library)',
    component: 'GreyholmUniversalSections',
    legacySource: 'campaignDataContext + campaignStore (Observer projection)',
    projection: 'observer',
    audience: 'observer',
  },
  {
    scope: 'greyholm.runtime.presentation',
    route: '/npc, /enemies, … (Entity Library)',
    component: 'GreyholmUniversalSections',
    legacySource: 'campaignDataContext + campaignStore (runtime; Player-Safe projection)',
    projection: 'playerSafe',
    audience: 'player',
  },
  {
    scope: 'userCampaign.dm.summary',
    route: '/campaigns/:id/library/:kind (Campaign Library, DM)',
    component: 'UserCampaignUniversalSections',
    legacySource: 'userCampaignStore.getData/getRuntime (adaptUserCampaignToUniversal)',
    projection: 'dm',
    audience: 'dm',
  },
  {
    scope: 'userCampaign.playerSafe.entities',
    route: '/campaigns/:id/library/:kind (Campaign Library, player/observer)',
    component: 'UserCampaignUniversalSections',
    legacySource: 'userCampaignStore.getData/getRuntime (Player-Safe projection)',
    projection: 'playerSafe',
    audience: 'player',
  },
  {
    scope: 'userCampaign.observer.status',
    route: '/campaigns/:id/library/:kind (Campaign Library, DM)',
    component: 'UserCampaignUniversalSections',
    legacySource: 'userCampaignStore.getData/getRuntime (Observer projection)',
    projection: 'observer',
    audience: 'observer',
  },
]);

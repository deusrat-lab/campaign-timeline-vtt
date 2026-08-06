/**
 * Block I — universal campaign configuration contract.
 *
 * A single typed shape both legacy stacks (Greyholm, Caldran/UC) and any new
 * campaign can read to answer "what does this campaign support" without any
 * `if campaignId === 'greyholm'` branch in runtime code. Read-only for now:
 * nothing in this file mutates store state or is wired into UI yet. It exists
 * so the next blocks (unified workspace, battle authority cutover) have one
 * place to consult instead of re-deriving campaign-specific defaults again.
 *
 * Existing `CapabilityToggles` (./capabilities.ts) already covers per-feature
 * on/off — this contract wraps it with the other pieces the task's
 * "Universal campaign configuration" block calls for: metadata, content
 * policies, battle capabilities, projection capabilities, schema version.
 */
import type { CampaignId } from './ids';
import { makeSchemaVersion, type UniversalSchemaVersion } from './ids';
import { defaultCapabilities, type CampaignCapabilities, type UniversalCapabilityKey } from './capabilities';

export const CONFIGURATION_SCHEMA_VERSION: UniversalSchemaVersion = makeSchemaVersion('1.0.0');

export type CampaignStack = 'greyholm' | 'user-campaign';

export interface CampaignMetadata {
  campaignId: CampaignId;
  stack: CampaignStack;
  title: string;
}

export type RelationDeletePolicy = 'BLOCK_DELETE' | 'DETACH_REFERENCES';

/**
 * Per-entity-kind create/edit/delete support, mirroring the content kinds
 * `contentDeletePolicy.ts` already scans relations for. `deletable: false`
 * documents a genuine gap (e.g. Greyholm locations/factions today) rather
 * than silently allowing a delete action that doesn't exist yet.
 */
export interface ContentKindPolicy {
  creatable: boolean;
  editable: boolean;
  deletable: boolean;
  relationDeletePolicy: RelationDeletePolicy;
}

export const CONTENT_KINDS = ['locations', 'npc', 'quests', 'enemies', 'factions'] as const;
export type ContentKind = typeof CONTENT_KINDS[number];

export type ContentPolicies = Record<ContentKind, ContentKindPolicy>;

/**
 * Mirrors the capability keys a real battle board needs a yes/no answer for,
 * per the task's battle-capabilities list. These are distinct from the
 * generic `battleMaps`/`battleRuntime` on/off switches in capabilities.ts —
 * they describe what a campaign's battle board supports once battles are on.
 */
export interface BattleCapabilities {
  grid: boolean;
  terrain: boolean;
  dayNight: boolean;
  handMode: boolean;
  initiative: boolean;
  manualCombatants: boolean;
  playerProjection: boolean;
  observerProjection: boolean;
}

export interface ProjectionCapabilities {
  playerView: boolean;
  observer: boolean;
}

export interface CampaignConfiguration {
  schemaVersion: UniversalSchemaVersion;
  metadata: CampaignMetadata;
  capabilities: CampaignCapabilities;
  contentPolicies: ContentPolicies;
  battleCapabilities: BattleCapabilities;
  projectionCapabilities: ProjectionCapabilities;
}

function blockDeletePolicy(overrides: Partial<ContentKindPolicy> = {}): ContentKindPolicy {
  return {
    creatable: true,
    editable: true,
    deletable: true,
    relationDeletePolicy: 'BLOCK_DELETE',
    ...overrides,
  };
}

/**
 * Greyholm today: no delete action exists for ANY Group A content kind
 * (confirmed by exhaustive grep — see CONTINUATION_STATE.json "Decision 1"
 * block). `deletable: false` here documents that real gap; it is not this
 * contract's job to fix it, only to describe current behavior accurately so
 * a future UI wiring pass can diff "policy says creatable+editable only" vs
 * "route already has a delete button" and catch drift.
 */
function greyholmContentPolicies(): ContentPolicies {
  const noDelete = blockDeletePolicy({ deletable: false });
  return {
    locations: noDelete,
    npc: noDelete,
    quests: noDelete,
    enemies: noDelete,
    factions: { creatable: false, editable: false, deletable: false, relationDeletePolicy: 'BLOCK_DELETE' },
  };
}

/**
 * Caldran/UC today: full create/edit/delete lifecycle proven for npc/quests/
 * enemies (Decision 1), factions is a read-only derived roster (no create/
 * edit either), locations follow the same pattern as npc/quests/enemies.
 */
function userCampaignContentPolicies(): ContentPolicies {
  const full = blockDeletePolicy();
  return {
    locations: full,
    npc: full,
    quests: full,
    enemies: full,
    factions: { creatable: false, editable: false, deletable: false, relationDeletePolicy: 'BLOCK_DELETE' },
  };
}

function fullBattleCapabilities(): BattleCapabilities {
  return {
    grid: true,
    terrain: true,
    dayNight: true,
    handMode: false,
    initiative: true,
    manualCombatants: true,
    playerProjection: true,
    observerProjection: true,
  };
}

function withCapabilityOverrides(
  overrides: Partial<Record<UniversalCapabilityKey, boolean>>,
): CampaignCapabilities {
  const base = defaultCapabilities(true);
  for (const [key, enabled] of Object.entries(overrides) as [UniversalCapabilityKey, boolean][]) {
    base[key] = { enabled };
  }
  return base;
}

/**
 * Greyholm's real current defaults: timeline+economy ON (calendar, prices,
 * services all live features), matching FINAL_FUNCTIONAL_PARITY_REPORT.md's
 * "Timeline/Economy bundle" finding.
 */
export function greyholmDefaultConfiguration(campaignId: CampaignId, title = 'Greyholm'): CampaignConfiguration {
  return {
    schemaVersion: CONFIGURATION_SCHEMA_VERSION,
    metadata: { campaignId, stack: 'greyholm', title },
    capabilities: withCapabilityOverrides({ timeline: true, calendar: true, economy: true }),
    contentPolicies: greyholmContentPolicies(),
    battleCapabilities: fullBattleCapabilities(),
    projectionCapabilities: { playerView: true, observer: true },
  };
}

/**
 * Caldran/UC's real current defaults: NO Timeline/calendar/Economy data
 * model exists at all today (confirmed by grep — see "Timeline/Economy/Zones
 * bundle" finding, scored NOT_APPLICABLE_BY_SOURCE_DESIGN). Off here means
 * "route/UI hidden, data absent", matching migration default = current
 * behavior, not a new restriction.
 */
export function caldranDefaultConfiguration(campaignId: CampaignId, title: string): CampaignConfiguration {
  return {
    schemaVersion: CONFIGURATION_SCHEMA_VERSION,
    metadata: { campaignId, stack: 'user-campaign', title },
    capabilities: withCapabilityOverrides({ timeline: false, calendar: false, economy: false }),
    contentPolicies: userCampaignContentPolicies(),
    battleCapabilities: fullBattleCapabilities(),
    projectionCapabilities: { playerView: true, observer: true },
  };
}

/**
 * A brand-new campaign gets every module available and switched on by
 * default (the task's "new campaigns: модули включаются через capabilities"
 * requirement) — the DM can turn timeline/economy off later via the existing
 * CapabilityToggles UI, same mechanism as everything else.
 */
export function newCampaignDefaultConfiguration(campaignId: CampaignId, title: string): CampaignConfiguration {
  return {
    schemaVersion: CONFIGURATION_SCHEMA_VERSION,
    metadata: { campaignId, stack: 'user-campaign', title },
    capabilities: defaultCapabilities(true),
    contentPolicies: userCampaignContentPolicies(),
    battleCapabilities: fullBattleCapabilities(),
    projectionCapabilities: { playerView: true, observer: true },
  };
}

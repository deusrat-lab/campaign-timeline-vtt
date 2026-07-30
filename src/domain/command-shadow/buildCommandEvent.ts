import type { CampaignId } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import type { CampaignSourceKind } from '../campaign/source';
import { redactCommandInput, type CommandInput } from './commandRegistry';
import { stableHash } from './commandShadowCoordinator';
import type {
  CommandCampaignKind,
  CommandShadowEvent,
  CommandShadowScope,
} from './commandShadowTypes';

export interface BuildCommandEventArgs {
  campaignId: CampaignId;
  campaignKind: CommandCampaignKind;
  sourceKind: CampaignSourceKind;
  commandScope: CommandShadowScope;
  input: CommandInput;
  /** Adapter-projected universal snapshot of the captured legacy PRE-state. */
  preSnapshot: CampaignSnapshot;
  /** Adapter-projected universal snapshot of the captured legacy POST-state. */
  postSnapshot: CampaignSnapshot;
  occurredAt: string;
  sourceIdentity: string;
}

/**
 * Build the immutable, redacted command event from captured pre/post universal
 * snapshots. The eventId is DETERMINISTIC — derived from the campaign, scope,
 * occurredAt and the pre/post hashes — so re-processing the same event is
 * idempotent and can never yield two different semantic outcomes.
 */
export function buildCommandEvent(args: BuildCommandEventArgs): CommandShadowEvent {
  const legacyPreHash = stableHash(args.preSnapshot);
  const legacyPostHash = stableHash(args.postSnapshot);
  const commandPayload = redactCommandInput(args.input);
  const eventId = stableHash({
    c: args.campaignId,
    s: args.commandScope,
    t: args.occurredAt,
    pre: legacyPreHash,
    post: legacyPostHash,
    ids: commandPayload.targetIds,
  });
  return Object.freeze({
    eventId,
    campaignId: args.campaignId,
    campaignKind: args.campaignKind,
    sourceKind: args.sourceKind,
    commandScope: args.commandScope,
    commandType: args.commandScope,
    occurredAt: args.occurredAt,
    legacyPreHash,
    legacyPostHash,
    commandPayload: Object.freeze({
      targetIds: Object.freeze([...commandPayload.targetIds]),
      changedFieldPaths: Object.freeze([...commandPayload.changedFieldPaths]),
      summary: Object.freeze({ ...commandPayload.summary }),
    }),
    sourceIdentity: args.sourceIdentity,
  });
}

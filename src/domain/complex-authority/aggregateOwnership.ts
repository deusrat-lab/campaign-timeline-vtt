import type { CommandCampaignKind } from '../command-shadow/commandShadowTypes';
import {
  ALL_COMPLEX_AUTHORITY_SCOPES,
  type ComplexAggregateKind,
  type ComplexAuthorityScope,
  type ComplexCommandKind,
} from './complexAuthorityTypes';

export type AggregateOwnership = 'universal-owned' | 'legacy-owned';

/**
 * One row of the aggregate ownership registry. Ownership is campaign-scoped
 * (`campaignKind`) AND system-scoped (`aggregateKind`) AND versioned by the
 * closed scope union. Each aggregate declares the deterministic set of command
 * kinds it accepts and the single owned changed-path *prefix* a candidate is
 * allowed to touch for a resolved target.
 */
export interface AggregateOwnershipDescriptor {
  scope: ComplexAuthorityScope;
  campaignKind: CommandCampaignKind;
  aggregateKind: ComplexAggregateKind;
  ownership: AggregateOwnership;
  commandKinds: readonly ComplexCommandKind[];
  /** Reversible destructive command kinds within this aggregate. */
  destructiveCommandKinds: readonly ComplexCommandKind[];
}

const DESCRIPTORS: readonly AggregateOwnershipDescriptor[] = [
  {
    scope: 'greyholm.reveal',
    campaignKind: 'greyholm',
    aggregateKind: 'reveal',
    ownership: 'universal-owned',
    commandKinds: ['reveal.entity', 'reveal.hide'],
    destructiveCommandKinds: ['reveal.hide'],
  },
  {
    scope: 'greyholm.presentedCard',
    campaignKind: 'greyholm',
    aggregateKind: 'presentedCard',
    ownership: 'universal-owned',
    commandKinds: ['presentedCard.present', 'presentedCard.dismiss'],
    destructiveCommandKinds: ['presentedCard.dismiss'],
  },
  {
    scope: 'greyholm.placement',
    campaignKind: 'greyholm',
    aggregateKind: 'placement',
    ownership: 'universal-owned',
    commandKinds: ['placement.place', 'placement.move', 'placement.remove'],
    destructiveCommandKinds: ['placement.remove'],
  },
  {
    scope: 'greyholm.partyLocation',
    campaignKind: 'greyholm',
    aggregateKind: 'partyLocation',
    ownership: 'universal-owned',
    commandKinds: ['partyLocation.move'],
    destructiveCommandKinds: [],
  },
  {
    scope: 'greyholm.routeProgress',
    campaignKind: 'greyholm',
    aggregateKind: 'routeProgress',
    ownership: 'universal-owned',
    commandKinds: ['routeProgress.advance', 'routeProgress.clear'],
    destructiveCommandKinds: ['routeProgress.clear'],
  },
  {
    scope: 'userCampaign.reveal',
    campaignKind: 'userCampaign',
    aggregateKind: 'reveal',
    ownership: 'universal-owned',
    commandKinds: ['reveal.entity', 'reveal.hide'],
    destructiveCommandKinds: ['reveal.hide'],
  },
  {
    scope: 'userCampaign.presentedCard',
    campaignKind: 'userCampaign',
    aggregateKind: 'presentedCard',
    ownership: 'universal-owned',
    commandKinds: ['presentedCard.present', 'presentedCard.dismiss'],
    destructiveCommandKinds: ['presentedCard.dismiss'],
  },
  {
    scope: 'userCampaign.placement',
    campaignKind: 'userCampaign',
    aggregateKind: 'placement',
    ownership: 'universal-owned',
    commandKinds: ['placement.place', 'placement.move', 'placement.remove'],
    destructiveCommandKinds: ['placement.remove'],
  },
];

const BY_SCOPE = new Map<ComplexAuthorityScope, AggregateOwnershipDescriptor>(
  DESCRIPTORS.map((descriptor) => [descriptor.scope, descriptor]),
);

const KNOWN_SCOPES = new Set<string>(ALL_COMPLEX_AUTHORITY_SCOPES);

// Sanity: the descriptor table must stay 1:1 with the scope union.
if (BY_SCOPE.size !== ALL_COMPLEX_AUTHORITY_SCOPES.length) {
  throw new Error('Stage 16 aggregate ownership table is out of sync with ComplexAuthorityScope.');
}

export function isKnownComplexScope(scope: string): scope is ComplexAuthorityScope {
  return KNOWN_SCOPES.has(scope);
}

export function aggregateDescriptor(scope: ComplexAuthorityScope): AggregateOwnershipDescriptor {
  const descriptor = BY_SCOPE.get(scope);
  if (!descriptor) throw new Error(`Unknown complex-authority scope: ${scope}`);
  return descriptor;
}

export function allAggregateDescriptors(): readonly AggregateOwnershipDescriptor[] {
  return DESCRIPTORS;
}

/** Ownership lookup by (campaignKind, aggregateKind). Only allowlisted pairs are
 * universal-owned; everything else (maps, geometry, timeline, battles, entity
 * content) is legacy-owned by construction. */
export function aggregateOwnershipOf(campaignKind: CommandCampaignKind, aggregateKind: ComplexAggregateKind): AggregateOwnership {
  for (const descriptor of DESCRIPTORS) {
    if (descriptor.campaignKind === campaignKind && descriptor.aggregateKind === aggregateKind) {
      return descriptor.ownership;
    }
  }
  return 'legacy-owned';
}

/** The set of universal-owned aggregate kinds for a campaign kind, deterministic. */
export function universalOwnedAggregates(campaignKind: CommandCampaignKind): ComplexAggregateKind[] {
  return DESCRIPTORS.filter((d) => d.campaignKind === campaignKind && d.ownership === 'universal-owned').map(
    (d) => d.aggregateKind,
  );
}

/** Resolve the active complex scopes from a (narrowing-only) config string. */
export function resolveComplexScopes(configValue: string): Set<ComplexAuthorityScope> {
  const trimmed = configValue.trim().toLowerCase();
  if (trimmed === '' || trimmed === '*' || trimmed === 'all') {
    return new Set(ALL_COMPLEX_AUTHORITY_SCOPES);
  }
  const tokens = new Set(trimmed.split(/[\s,]+/).filter(Boolean));
  return new Set(ALL_COMPLEX_AUTHORITY_SCOPES.filter((scope) => tokens.has(scope.toLowerCase())));
}

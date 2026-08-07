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
/**
 * Whether a real, normal UI action durably routes through Stage 16 for this
 * scope (Stage 16.1 completion). `engine-capable` scopes are proven durable in
 * the core harness in isolation but have no clean single-aggregate UI action, so
 * they are EXCLUDED from the app's UI ownership (the store never routes them —
 * no permanent fallback) and remain legacy-owned in practice until a later stage.
 */
export type AggregateUiStatus =
  | 'wired' // a normal UI action durably commits through Stage 16
  | 'excluded-coupled' // real UI action bundles multiple slots -> legacy-owned in the UI
  | 'excluded-id-coordination' // real UI action generates its own id -> legacy-owned in the UI
  | 'no-ui-action' // no normal UI control exists for this scope
  | 'patch-merge-deferred' // real UI action uses the overlay patch-merge -> not wired
  | 'superseded-by-authority-store'; // was wired in Stage 16.1; the real UI action has since been
  // re-routed to a dedicated Block I authority store (durableAuthoritySink /
  // commandAuthoritySink) instead. No live call site passes this scope to
  // routeGreyComplex/routeUserComplex any more (verified by grep, Block L
  // cleanup). Kept as an engine-capable, proven-in-harness row — NOT wired
  // in the real app, so it is excluded from UI_OWNED_COMPLEX_SCOPES and the
  // store never routes it.

export interface AggregateOwnershipDescriptor {
  scope: ComplexAuthorityScope;
  campaignKind: CommandCampaignKind;
  aggregateKind: ComplexAggregateKind;
  ownership: AggregateOwnership;
  commandKinds: readonly ComplexCommandKind[];
  /** Reversible destructive command kinds within this aggregate. */
  destructiveCommandKinds: readonly ComplexCommandKind[];
  /** Real-UI wiring status (Stage 16.1 completion). */
  uiStatus: AggregateUiStatus;
  /** Short honest note about the UI wiring decision. */
  uiNote: string;
}

const DESCRIPTORS: readonly AggregateOwnershipDescriptor[] = [
  {
    scope: 'greyholm.reveal',
    campaignKind: 'greyholm',
    aggregateKind: 'reveal',
    ownership: 'universal-owned',
    commandKinds: ['reveal.entity', 'reveal.hide'],
    destructiveCommandKinds: ['reveal.hide'],
    uiStatus: 'superseded-by-authority-store',
    uiNote: 'Was wired (MapWorkspace "Отметить открытым/Сбросить открытие" -> setRevealed/unsetRevealed) in Stage 16.1; the real UI action has since been re-routed to the Block I durable reveal authority store — no live call site passes this scope to routeGreyComplex any more (verified Block L).',
  },
  {
    scope: 'greyholm.presentedCard',
    campaignKind: 'greyholm',
    aggregateKind: 'presentedCard',
    ownership: 'universal-owned',
    commandKinds: ['presentedCard.present', 'presentedCard.dismiss'],
    destructiveCommandKinds: ['presentedCard.dismiss'],
    uiStatus: 'superseded-by-authority-store',
    uiNote: 'Was wired (MapWorkspace "Показать карточку игрокам" -> presentCard) in Stage 16.1; re-routed to a Block I durable authority store since — no live call site passes this scope to routeGreyComplex any more (verified Block L).',
  },
  {
    scope: 'greyholm.placement',
    campaignKind: 'greyholm',
    aggregateKind: 'placement',
    ownership: 'universal-owned',
    commandKinds: ['placement.place', 'placement.move', 'placement.remove'],
    destructiveCommandKinds: ['placement.remove'],
    uiStatus: 'superseded-by-authority-store',
    uiNote: 'Was wired (addPlacement/patchPlacement(pure position)/deletePlacement -> place/move/remove via routeGreyComplex) through Stage 16.1/Block L; re-routed to the Block L `greyholmPlacementAuthorityStore` durable, always-on, unconditional whole-collection authority since — this was the LAST scope with a live routeGreyComplex call site (all others were already superseded); no live call site passes any scope to routeGreyComplex any more (verified Block L — the function itself was removed from campaignStore.tsx).',
  },
  {
    scope: 'greyholm.partyLocation',
    campaignKind: 'greyholm',
    aggregateKind: 'partyLocation',
    ownership: 'universal-owned',
    commandKinds: ['partyLocation.move'],
    destructiveCommandKinds: [],
    uiStatus: 'superseded-by-authority-store',
    uiNote: 'Was wired (setCurrentLocation/setPartyMapPosition -> partyLocation.move) in Stage 16.1; re-routed to a Block I durable authority store since — no live call site passes this scope to routeGreyComplex any more (verified Block L).',
  },
  {
    scope: 'greyholm.routeProgress',
    campaignKind: 'greyholm',
    aggregateKind: 'routeProgress',
    ownership: 'universal-owned',
    commandKinds: ['routeProgress.advance', 'routeProgress.clear'],
    destructiveCommandKinds: ['routeProgress.clear'],
    uiStatus: 'superseded-by-authority-store',
    uiNote: 'Was wired (setPartyRouteProgress -> routeProgress.advance/clear) in Stage 16.1; re-routed to a Block I durable authority store since — no live call site passes this scope to routeGreyComplex any more (verified Block L).',
  },
  {
    scope: 'userCampaign.reveal',
    campaignKind: 'userCampaign',
    aggregateKind: 'reveal',
    ownership: 'universal-owned',
    commandKinds: ['reveal.entity', 'reveal.hide'],
    destructiveCommandKinds: ['reveal.hide'],
    uiStatus: 'superseded-by-authority-store',
    uiNote: 'Was wired (toggleReveal -> reveal.entity/hide) in Stage 16.1; re-routed to the Block I `revealAuthorityStore` durable store since — `routeUserComplex` is never called by any live app code path any more (verified Block L; the only real caller is the Stage 16.1 Node integration harness via routeUserComplexThrough directly, proving engine capability, not app wiring).',
  },
  {
    scope: 'userCampaign.presentedCard',
    campaignKind: 'userCampaign',
    aggregateKind: 'presentedCard',
    ownership: 'universal-owned',
    commandKinds: ['presentedCard.present', 'presentedCard.dismiss'],
    destructiveCommandKinds: ['presentedCard.dismiss'],
    uiStatus: 'superseded-by-authority-store',
    uiNote: 'Was wired (togglePresentedCard -> presentedCard.present/dismiss via routeUserComplex) in Stage 16.1; re-routed to the Block I `presentedCardAuthorityStore` durable store since — `routeUserComplex` is never called by any live app code path any more (verified Block L).',
  },
  {
    scope: 'userCampaign.placement',
    campaignKind: 'userCampaign',
    aggregateKind: 'placement',
    ownership: 'universal-owned',
    commandKinds: ['placement.place', 'placement.move', 'placement.remove'],
    destructiveCommandKinds: ['placement.remove'],
    uiStatus: 'superseded-by-authority-store',
    uiNote: 'Was wired (addPlacement/updatePlacement/removePlacement -> place/move/remove via routeUserComplex) in Stage 16.1; re-routed to the Block I `mapPlacementAuthorityStore` durable store since — `routeUserComplex` is never called by any live app code path any more (verified Block L).',
  },
];

/**
 * The scopes a real, normal UI action durably routes through Stage 16 (uiStatus
 * === 'wired'). This is the app's TRUTHFUL ownership allowlist: the store only
 * routes these through the complex sink, and the provider narrows the router's
 * owned scopes to this set. Every other scope is engine-capable (proven in the
 * core harness in isolation) but legacy-owned in the real UI — the store never
 * routes it, so there is no permanent Stage 16 fallback.
 */
export const UI_OWNED_COMPLEX_SCOPES: readonly ComplexAuthorityScope[] = DESCRIPTORS
  .filter((d) => d.uiStatus === 'wired')
  .map((d) => d.scope);

/** Narrow an arbitrary allowlist to only the truthfully UI-owned scopes. */
export function narrowToUiOwned(scopes: Iterable<ComplexAuthorityScope>): Set<ComplexAuthorityScope> {
  const uiOwned = new Set<ComplexAuthorityScope>(UI_OWNED_COMPLEX_SCOPES);
  const out = new Set<ComplexAuthorityScope>();
  for (const s of scopes) if (uiOwned.has(s)) out.add(s);
  return out;
}

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

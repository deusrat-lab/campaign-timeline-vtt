import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  DurableAuthorityRouter,
  resolveDurableScopes,
  isKnownDurableScope,
  safeFieldDescriptor,
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  createBrowserRepositoryStorage,
  type SafeFieldCommand,
  type DurableAuthorityScope,
  type DurableAuthorityCampaignStatus,
} from '../../domain';
import type { MainCampaignDataInput, MainCampaignOverlayInput } from '../../domain';
import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import { useCampaignData } from '../../state/campaignDataContext';
import {
  setDurableAuthoritySink,
  type MainDurableRequest,
  type UserDurableRequest,
} from '../../state/durableAuthoritySink';
import { UNIVERSAL_DURABLE_AUTHORITY_ENABLED, UNIVERSAL_DURABLE_AUTHORITY_SCOPES } from '../../config';

interface DurableAuthorityContextValue {
  enabled: boolean;
  router: DurableAuthorityRouter | null;
  statuses: DurableAuthorityCampaignStatus[];
}

const DurableAuthorityContext = createContext<DurableAuthorityContextValue>({ enabled: false, router: null, statuses: [] });

export function resolveActiveDurableScopes(): Set<DurableAuthorityScope> {
  return resolveDurableScopes(UNIVERSAL_DURABLE_AUTHORITY_SCOPES);
}

/**
 * Stage 15 — hosts the universal DURABLE-authority router and registers the ONE
 * durable sink the legacy stores consult (BEFORE the Stage 14 sink) for an
 * allowlisted safe-field edit.
 *
 * When the (default-off) flag is disabled this renders its children and does
 * nothing else: no router, no sink, no storage access — the stores' durable
 * routes return `false` and behaviour is exactly as before Stage 15. When
 * enabled, the universal command is durably committed to the production
 * repository first and the existing legacy action runs once as the compatibility
 * projection. It never adds network / server sync and never changes
 * `userCampaignSync`.
 */
export function DurableAuthorityProvider({ children }: { children: ReactNode }) {
  if (!UNIVERSAL_DURABLE_AUTHORITY_ENABLED) {
    return <DurableAuthorityContext.Provider value={DISABLED}>{children}</DurableAuthorityContext.Provider>;
  }
  return <EnabledDurableAuthorityProvider>{children}</EnabledDurableAuthorityProvider>;
}

const DISABLED: DurableAuthorityContextValue = { enabled: false, router: null, statuses: [] };

function EnabledDurableAuthorityProvider({ children }: { children: ReactNode }) {
  const [router, setRouter] = useState<DurableAuthorityRouter | null>(null);
  const { data } = useCampaignData();
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const instance = new DurableAuthorityRouter({
      repositoryStorage: createBrowserRepositoryStorage(window.localStorage),
      diagnosticsStorage: window.localStorage,
      recoveryStorage: window.localStorage,
      allowedScopes: resolveActiveDurableScopes(),
      enabled: true,
    });
    setRouter(instance);

    const routeMain = (req: MainDurableRequest): boolean => {
      if (!isKnownDurableScope(req.durableScope) || !instance.isAllowlisted(req.durableScope)) return false;
      const current = dataRef.current;
      if (!current) return false; // no merged Greyholm data yet → caller falls through
      const scope = req.durableScope as DurableAuthorityScope;
      const descriptor = safeFieldDescriptor(scope);
      if (descriptor.campaignKind !== 'greyholm') return false;
      const command: SafeFieldCommand = { scope, legacyEntityId: req.legacyEntityId, value: req.value };
      const adaptData = (d: unknown) =>
        adaptMainCampaignToUniversal({ data: d as MainCampaignDataInput, overlay: req.preOverlay as MainCampaignOverlayInput });
      const withField = applyLegacyField(current, req.legacyEntityId, descriptor.legacyField, req.value);
      const outcome = instance.route({
        campaignId: campaignIdFromLegacy('greyholm', 'main'),
        campaignKind: 'greyholm',
        sourceKind: 'legacy-main',
        scope,
        command,
        sourceIdentity: 'greyholm:dm',
        previousValue: req.previousValue,
        nextValue: req.value,
        buildPre: () => adaptData(current),
        predictPost: () => adaptData(withField),
        commit: () => {
          req.commit(); // the ONE real legacy dispatch (compatibility projection)
          return adaptData(withField);
        },
        fallback: req.fallback,
      });
      return outcome.handled;
    };

    const routeUser = (req: UserDurableRequest): boolean => {
      if (!isKnownDurableScope(req.durableScope) || !instance.isAllowlisted(req.durableScope)) return false;
      if (!req.legacyCampaignId || !req.preData) return false;
      const scope = req.durableScope as DurableAuthorityScope;
      const command: SafeFieldCommand = { scope, legacyEntityId: req.legacyEntityId, value: req.value };
      const adaptDR = (dr: { data: unknown; runtime: unknown }) =>
        adaptUserCampaignToUniversal({ data: dr.data as UserCampaignData, runtime: (dr.runtime ?? undefined) as UserCampaignRuntime | undefined });
      const outcome = instance.route({
        campaignId: campaignIdFromLegacy('user', req.legacyCampaignId),
        campaignKind: 'userCampaign',
        sourceKind: 'legacy-user-campaign',
        scope,
        command,
        sourceIdentity: `userCampaign:${req.legacyCampaignId}`,
        previousValue: req.previousValue,
        nextValue: req.value,
        buildPre: () => adaptDR({ data: req.preData, runtime: req.preRuntime }),
        predictPost: () => adaptDR(req.predict()),
        commit: () => adaptDR(req.commit()),
        fallback: req.fallback,
      });
      return outcome.handled;
    };

    setDurableAuthoritySink({ routeMain, routeUser });

    return () => {
      setDurableAuthoritySink(null);
      instance.dispose();
      setRouter((cur) => (cur === instance ? null : cur));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <DurableStatusBridge router={router}>{children}</DurableStatusBridge>;
}

const EMPTY: DurableAuthorityCampaignStatus[] = [];

function DurableStatusBridge({ router, children }: { router: DurableAuthorityRouter | null; children: ReactNode }) {
  const statuses = useSyncExternalStore(
    (onChange) => (router ? router.subscribe(onChange) : () => {}),
    () => (router ? router.getAllStatuses() : EMPTY),
    () => (router ? router.getAllStatuses() : EMPTY),
  );
  const value = useMemo<DurableAuthorityContextValue>(() => ({ enabled: true, router, statuses }), [router, statuses]);
  return <DurableAuthorityContext.Provider value={value}>{children}</DurableAuthorityContext.Provider>;
}

/** Apply a single legacy field to a clone of the merged Greyholm `data` (mirrors
 * what `campaignDataContext` produces once the reducer overlay is folded in).
 * Pure — never mutates the input. */
function applyLegacyField(data: unknown, npcId: string, legacyField: string, value: unknown): unknown {
  const d = data as { npcs?: Array<{ id: string }> };
  if (!Array.isArray(d.npcs)) return data;
  return { ...d, npcs: d.npcs.map((npc) => (npc.id === npcId ? { ...npc, [legacyField]: value } : npc)) };
}

export function useDurableAuthority(): DurableAuthorityContextValue {
  return useContext(DurableAuthorityContext);
}

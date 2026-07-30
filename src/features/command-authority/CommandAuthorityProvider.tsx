import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  CommandAuthorityRouter,
  ALL_COMMAND_AUTHORITY_SCOPES,
  resolveAuthorityScopes,
  isKnownAuthorityScope,
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  type CommandInput,
  type CommandAuthorityScope,
  type CommandAuthorityCampaignStatus,
} from '../../domain';
import type { MainCampaignDataInput, MainCampaignOverlayInput } from '../../domain';
import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import { useCampaignData } from '../../state/campaignDataContext';
import {
  setCommandAuthoritySink,
  type MainAuthorityRequest,
  type UserAuthorityRequest,
} from '../../state/commandAuthoritySink';
import { UNIVERSAL_COMMAND_AUTHORITY_ENABLED, UNIVERSAL_COMMAND_AUTHORITY_SCOPES } from '../../config';

interface CommandAuthorityContextValue {
  enabled: boolean;
  router: CommandAuthorityRouter | null;
  statuses: CommandAuthorityCampaignStatus[];
}

const CommandAuthorityContext = createContext<CommandAuthorityContextValue>({ enabled: false, router: null, statuses: [] });

/** Resolve the active authority scopes from the (narrowing-only) config allowlist. */
export function resolveActiveAuthorityScopes(): Set<CommandAuthorityScope> {
  return resolveAuthorityScopes(UNIVERSAL_COMMAND_AUTHORITY_SCOPES);
}

/**
 * Stage 14 — hosts the universal command-authority router and registers the ONE
 * authority sink the legacy stores consult before committing an allowlisted
 * single-field NPC edit.
 *
 * When the (default-off) flag is disabled, this renders its children and does
 * nothing else: no router, no sink registration, no storage access — the stores'
 * `routeMainAuthority` / `routeUserAuthority` return `false` and the stores commit
 * exactly as before Stage 14. When enabled, the universal command runs first and
 * commits through the existing legacy action only on proven parity; it NEVER
 * writes the production universal namespace and NEVER performs network / server
 * sync.
 */
export function CommandAuthorityProvider({ children }: { children: ReactNode }) {
  if (!UNIVERSAL_COMMAND_AUTHORITY_ENABLED) {
    return <CommandAuthorityContext.Provider value={DISABLED}>{children}</CommandAuthorityContext.Provider>;
  }
  return <EnabledCommandAuthorityProvider>{children}</EnabledCommandAuthorityProvider>;
}

const DISABLED: CommandAuthorityContextValue = { enabled: false, router: null, statuses: [] };

function EnabledCommandAuthorityProvider({ children }: { children: ReactNode }) {
  const [router, setRouter] = useState<CommandAuthorityRouter | null>(null);
  const { data } = useCampaignData();
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const instance = new CommandAuthorityRouter({
      diagnosticsStorage: window.localStorage,
      allowedScopes: resolveActiveAuthorityScopes(),
      enabled: true,
    });
    setRouter(instance);

    const routeMain = (req: MainAuthorityRequest): boolean => {
      if (!isKnownAuthorityScope(req.scope) || !instance.isAllowlisted(req.scope)) return false;
      const current = dataRef.current;
      if (!current) return false; // no merged Greyholm data yet → store commits itself
      const input = req.input as CommandInput;
      // Stage 14 only handles single-field npc updates. Greyholm's npc field lives
      // in the MERGED `data.npcs` (the reducer records an overlay `npcPatches`
      // entry which `campaignDataContext` folds into `data` via
      // `applyOverlayToList`; the universal adapter reads the field from `data`,
      // not the overlay arg). So the correct, independent legacy transition
      // prediction is: apply the same single field change to the merged npc in a
      // clone of `data` and adapt — exactly what the legacy merge will produce —
      // rather than adapting the post-overlay (which the adapter ignores for npc
      // fields). The real legacy dispatch still happens once via `req.commit`.
      if (input.scope !== 'greyholm.npc.update') return false;
      const adaptData = (data: unknown) =>
        adaptMainCampaignToUniversal({ data: data as MainCampaignDataInput, overlay: req.preOverlay as MainCampaignOverlayInput });
      const withField = applyNpcField(current, input.legacyNpcId, input.field, input.value);
      const outcome = instance.route({
        campaignId: campaignIdFromLegacy('greyholm', 'main'),
        campaignKind: 'greyholm',
        sourceKind: 'legacy-main',
        scope: req.scope,
        input,
        sourceIdentity: 'greyholm:dm',
        previousValue: req.previousValue,
        nextValue: req.nextValue,
        buildPre: () => adaptData(current),
        predictPost: () => adaptData(withField),
        commit: () => {
          req.commit(); // the ONE real legacy dispatch
          return adaptData(withField);
        },
        fallback: req.fallback,
      });
      return outcome.handled;
    };

    const routeUser = (req: UserAuthorityRequest): boolean => {
      if (!isKnownAuthorityScope(req.scope) || !instance.isAllowlisted(req.scope)) return false;
      if (!req.legacyCampaignId || !req.preData) return false;
      const adaptDR = (dr: { data: unknown; runtime: unknown }) =>
        adaptUserCampaignToUniversal({ data: dr.data as UserCampaignData, runtime: (dr.runtime ?? undefined) as UserCampaignRuntime | undefined });
      const outcome = instance.route({
        campaignId: campaignIdFromLegacy('user', req.legacyCampaignId),
        campaignKind: 'userCampaign',
        sourceKind: 'legacy-user-campaign',
        scope: req.scope,
        input: req.input as CommandInput,
        sourceIdentity: `userCampaign:${req.legacyCampaignId}`,
        previousValue: req.previousValue,
        nextValue: req.nextValue,
        buildPre: () => adaptDR({ data: req.preData, runtime: req.preRuntime }),
        predictPost: () => adaptDR(req.predict()),
        commit: () => adaptDR(req.commit()),
        fallback: req.fallback,
      });
      return outcome.handled;
    };

    setCommandAuthoritySink({ routeMain, routeUser });

    return () => {
      setCommandAuthoritySink(null);
      instance.dispose();
      setRouter((current) => (current === instance ? null : current));
    };
  }, []);

  return <AuthorityStatusBridge router={router}>{children}</AuthorityStatusBridge>;
}

const EMPTY: CommandAuthorityCampaignStatus[] = [];

function AuthorityStatusBridge({ router, children }: { router: CommandAuthorityRouter | null; children: ReactNode }) {
  const statuses = useSyncExternalStore(
    (onChange) => (router ? router.subscribe(onChange) : () => {}),
    () => (router ? router.getAllStatuses() : EMPTY),
    () => (router ? router.getAllStatuses() : EMPTY),
  );
  const value = useMemo<CommandAuthorityContextValue>(
    () => ({ enabled: true, router, statuses }),
    [router, statuses],
  );
  return <CommandAuthorityContext.Provider value={value}>{children}</CommandAuthorityContext.Provider>;
}

/**
 * Apply a single npc field change to a clone of the merged Greyholm `data`,
 * mirroring exactly what `campaignDataContext` produces once the reducer's
 * `npcPatches` entry is folded in (a shallow field merge on the matching npc).
 * Pure — never mutates the input.
 */
function applyNpcField(data: unknown, npcId: string, field: string, value: unknown): unknown {
  const d = data as { npcs?: Array<{ id: string }> };
  if (!Array.isArray(d.npcs)) return data;
  return {
    ...d,
    npcs: d.npcs.map((npc) => (npc.id === npcId ? { ...npc, [field]: value } : npc)),
  };
}

export function useCommandAuthority(): CommandAuthorityContextValue {
  return useContext(CommandAuthorityContext);
}

export { ALL_COMMAND_AUTHORITY_SCOPES };

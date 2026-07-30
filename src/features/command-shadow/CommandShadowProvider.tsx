import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  CommandShadowCoordinator,
  buildCommandEvent,
  isKnownCommandScope,
  ALL_COMMAND_SHADOW_SCOPES,
  adaptMainCampaignToUniversal,
  adaptUserCampaignToUniversal,
  campaignIdFromLegacy,
  type CommandInput,
  type CommandShadowScope,
  type CommandShadowCampaignStatus,
} from '../../domain';
import type { MainCampaignDataInput, MainCampaignOverlayInput } from '../../domain';
import type { UserCampaignData, UserCampaignRuntime } from '../../types/userCampaign';
import { useCampaignData } from '../../state/campaignDataContext';
import {
  setCommandShadowSink,
  type MainCommandEmission,
  type UserCommandEmission,
} from '../../state/commandShadowSink';
import { UNIVERSAL_COMMAND_SHADOW_ENABLED, UNIVERSAL_COMMAND_SHADOW_SCOPES } from '../../config';

interface CommandShadowContextValue {
  enabled: boolean;
  coordinator: CommandShadowCoordinator | null;
  statuses: CommandShadowCampaignStatus[];
}

const CommandShadowContext = createContext<CommandShadowContextValue>({ enabled: false, coordinator: null, statuses: [] });

/** Resolve the active command scopes from the (narrowing-only) config allowlist. */
export function resolveAllowedScopes(): Set<CommandShadowScope> {
  const trimmed = UNIVERSAL_COMMAND_SHADOW_SCOPES.trim().toLowerCase();
  if (trimmed === '' || trimmed === '*' || trimmed === 'all') return new Set(ALL_COMMAND_SHADOW_SCOPES);
  const tokens = new Set(trimmed.split(/[\s,]+/).filter(Boolean));
  return new Set(ALL_COMMAND_SHADOW_SCOPES.filter((scope) => tokens.has(scope.toLowerCase())));
}

/**
 * Stage 13 — hosts the isolated universal command-shadow coordinator and wires
 * it to the legacy stores' command emissions.
 *
 * When the (default-off) flag is disabled, this renders its children and does
 * nothing else: no coordinator, no sink registration, no storage access. When
 * enabled, it registers ONE sink so already-committed allowlisted legacy
 * mutations replay an isolated universal command whose result is compared to
 * the adapter-derived post-state and recorded as bounded, redacted, DM-only
 * diagnostics. It NEVER mutates legacy state, writes the production namespace,
 * or performs any network / server sync.
 */
export function CommandShadowProvider({ children }: { children: ReactNode }) {
  if (!UNIVERSAL_COMMAND_SHADOW_ENABLED) {
    return <CommandShadowContext.Provider value={DISABLED}>{children}</CommandShadowContext.Provider>;
  }
  return <EnabledCommandShadowProvider>{children}</EnabledCommandShadowProvider>;
}

const DISABLED: CommandShadowContextValue = { enabled: false, coordinator: null, statuses: [] };

function EnabledCommandShadowProvider({ children }: { children: ReactNode }) {
  const [coordinator, setCoordinator] = useState<CommandShadowCoordinator | null>(null);
  const { data } = useCampaignData();
  // Latest merged Greyholm data, read lazily at emit time (never mutated).
  const dataRef = useRef(data);
  dataRef.current = data;

  useEffect(() => {
    const instance = new CommandShadowCoordinator({
      diagnosticsStorage: window.localStorage,
      allowedScopes: resolveAllowedScopes(),
    });
    setCoordinator(instance);

    const submitMain = (emission: MainCommandEmission) => {
      if (!isKnownCommandScope(emission.scope) || !instance.isAllowlisted(emission.scope)) return;
      const current = dataRef.current;
      if (!current) return;
      const preRes = adaptMainCampaignToUniversal({ data: current as unknown as MainCampaignDataInput, overlay: emission.preOverlay as MainCampaignOverlayInput });
      const postRes = adaptMainCampaignToUniversal({ data: current as unknown as MainCampaignDataInput, overlay: emission.postOverlay as MainCampaignOverlayInput });
      if (!preRes.snapshot || !postRes.snapshot) return;
      const event = buildCommandEvent({
        campaignId: campaignIdFromLegacy('greyholm', 'main'),
        campaignKind: 'greyholm',
        sourceKind: 'legacy-main',
        commandScope: emission.scope,
        input: emission.input as CommandInput,
        preSnapshot: preRes.snapshot,
        postSnapshot: postRes.snapshot,
        occurredAt: new Date().toISOString(),
        sourceIdentity: 'greyholm:dm',
      });
      instance.submit({ event, input: emission.input as CommandInput, buildPre: () => preRes, buildPost: () => postRes });
    };

    const submitUser = (emission: UserCommandEmission) => {
      if (!isKnownCommandScope(emission.scope) || !instance.isAllowlisted(emission.scope)) return;
      if (!emission.legacyCampaignId || !emission.preData || !emission.postData) return;
      const preRes = adaptUserCampaignToUniversal({ data: emission.preData as UserCampaignData, runtime: (emission.preRuntime ?? undefined) as UserCampaignRuntime | undefined });
      const postRes = adaptUserCampaignToUniversal({ data: emission.postData as UserCampaignData, runtime: (emission.postRuntime ?? undefined) as UserCampaignRuntime | undefined });
      if (!preRes.snapshot || !postRes.snapshot) return;
      const event = buildCommandEvent({
        campaignId: campaignIdFromLegacy('user', emission.legacyCampaignId),
        campaignKind: 'userCampaign',
        sourceKind: 'legacy-user-campaign',
        commandScope: emission.scope,
        input: emission.input as CommandInput,
        preSnapshot: preRes.snapshot,
        postSnapshot: postRes.snapshot,
        occurredAt: new Date().toISOString(),
        sourceIdentity: `userCampaign:${emission.legacyCampaignId}`,
      });
      instance.submit({ event, input: emission.input as CommandInput, buildPre: () => preRes, buildPost: () => postRes });
    };

    setCommandShadowSink({ emitMain: submitMain, emitUser: submitUser });

    return () => {
      setCommandShadowSink(null);
      instance.dispose();
      setCoordinator((current) => (current === instance ? null : current));
    };
  }, []);

  return <CommandStatusBridge coordinator={coordinator}>{children}</CommandStatusBridge>;
}

const EMPTY: CommandShadowCampaignStatus[] = [];

function CommandStatusBridge({ coordinator, children }: { coordinator: CommandShadowCoordinator | null; children: ReactNode }) {
  const statuses = useSyncExternalStore(
    (onChange) => (coordinator ? coordinator.subscribe(onChange) : () => {}),
    () => (coordinator ? coordinator.getAllStatuses() : EMPTY),
    () => (coordinator ? coordinator.getAllStatuses() : EMPTY),
  );
  const value = useMemo<CommandShadowContextValue>(
    () => ({ enabled: true, coordinator, statuses }),
    [coordinator, statuses],
  );
  return <CommandShadowContext.Provider value={value}>{children}</CommandShadowContext.Provider>;
}

export function useCommandShadow(): CommandShadowContextValue {
  return useContext(CommandShadowContext);
}

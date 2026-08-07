import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
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
import { UNIVERSAL_COMMAND_SHADOW_SCOPES } from '../../config';
import { CommandShadowContext, type CommandShadowContextValue } from './commandShadowContext';

/**
 * Block L — the heavy, domain-consuming half of the Stage 13 command-shadow
 * provider, split into its own module so it is a SEPARATE bundle chunk from
 * the thin `CommandShadowProvider` shell. The shell only `import()`s this
 * module when `UNIVERSAL_COMMAND_SHADOW_ENABLED` is actually true, so the
 * common (flag-off) production graph never pulls in `CommandShadowCoordinator`
 * or the `domain` adapters through this path — a diagnostics-only, default-off
 * side-channel is not reachable from the active graph at all in the normal
 * case, per the Block L architecture guard (`scripts/final-cutover/verify-*`).
 */

/** Resolve the active command scopes from the (narrowing-only) config allowlist. */
export function resolveAllowedScopes(): Set<CommandShadowScope> {
  const trimmed = UNIVERSAL_COMMAND_SHADOW_SCOPES.trim().toLowerCase();
  if (trimmed === '' || trimmed === '*' || trimmed === 'all') return new Set(ALL_COMMAND_SHADOW_SCOPES);
  const tokens = new Set(trimmed.split(/[\s,]+/).filter(Boolean));
  return new Set(ALL_COMMAND_SHADOW_SCOPES.filter((scope) => tokens.has(scope.toLowerCase())));
}

export function EnabledCommandShadowProvider({ children }: { children: ReactNode }) {
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

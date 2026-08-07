import { createContext, useContext } from 'react';
import type { CommandShadowCoordinator, CommandShadowCampaignStatus } from '../../domain';

/**
 * The React context shared by the thin `CommandShadowProvider` shell and the
 * lazily-loaded `EnabledCommandShadowProvider` (see CommandShadowProviderEnabled.tsx).
 * Split out so the shell can provide the disabled default WITHOUT statically
 * importing the heavy domain-consuming provider module.
 */
export interface CommandShadowContextValue {
  enabled: boolean;
  coordinator: CommandShadowCoordinator | null;
  statuses: CommandShadowCampaignStatus[];
}

export const DISABLED_COMMAND_SHADOW: CommandShadowContextValue = { enabled: false, coordinator: null, statuses: [] };

export const CommandShadowContext = createContext<CommandShadowContextValue>(DISABLED_COMMAND_SHADOW);

export function useCommandShadow(): CommandShadowContextValue {
  return useContext(CommandShadowContext);
}

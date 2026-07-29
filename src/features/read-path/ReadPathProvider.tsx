import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  STAGE_09_SHADOW_NAMESPACE,
  createBrowserRepositoryStorage,
  createShadowCampaignRepository,
  resolvePilotAllowlist,
} from '../../domain';
import type { CampaignId, CampaignSnapshot } from '../../domain';
import { UNIVERSAL_READ_PATH_ENABLED, UNIVERSAL_READ_PATH_SCOPES } from '../../config';

/**
 * Stage 10 — hosts the guarded universal READ path.
 *
 * When the (default-off) read flag is disabled this provides an inert context:
 * no repository, no allowlist, no localStorage access. When enabled it exposes
 * a strictly READ-ONLY handle to the Stage 9 shadow namespace (only
 * `readCampaign` is ever called) plus the resolved pilot allowlist. It NEVER
 * writes, NEVER calls the network, NEVER invokes universal commands, and NEVER
 * touches the production universal namespace. It also never constructs a shadow
 * coordinator — so "read on + shadow off" simply finds no live status and every
 * pilot falls back to legacy (see decideReadSource).
 */
export interface ReadPathContextValue {
  enabled: boolean;
  allowedScopes: ReadonlySet<string>;
  /** Read-only snapshot fetch from the Stage 9 shadow namespace, or null when disabled. */
  readShadowSnapshot: ((campaignId: CampaignId) => Promise<CampaignSnapshot | null>) | null;
  namespace: string;
}

const DISABLED_VALUE: ReadPathContextValue = {
  enabled: false,
  allowedScopes: new Set(),
  readShadowSnapshot: null,
  namespace: STAGE_09_SHADOW_NAMESPACE,
};

const ReadPathContext = createContext<ReadPathContextValue>(DISABLED_VALUE);

export function ReadPathProvider({ children }: { children: ReactNode }) {
  const value = useMemo<ReadPathContextValue>(() => {
    if (!UNIVERSAL_READ_PATH_ENABLED || typeof window === 'undefined') return DISABLED_VALUE;
    const allowedScopes = resolvePilotAllowlist(true, UNIVERSAL_READ_PATH_SCOPES);
    // Read-only repository handle. We only ever call readCampaign on it.
    const repository = createShadowCampaignRepository(
      createBrowserRepositoryStorage(window.localStorage),
      STAGE_09_SHADOW_NAMESPACE,
    );
    return {
      enabled: true,
      allowedScopes,
      readShadowSnapshot: (campaignId: CampaignId) => repository.readCampaign(campaignId),
      namespace: STAGE_09_SHADOW_NAMESPACE,
    };
  }, []);

  return <ReadPathContext.Provider value={value}>{children}</ReadPathContext.Provider>;
}

export function useReadPath(): ReadPathContextValue {
  return useContext(ReadPathContext);
}

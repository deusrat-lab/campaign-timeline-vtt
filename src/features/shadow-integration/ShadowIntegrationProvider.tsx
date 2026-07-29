import { createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ShadowIntegrationCoordinator,
  STAGE_09_SHADOW_NAMESPACE,
  createBrowserRepositoryStorage,
  createShadowCampaignRepository,
} from '../../domain';
import type { ShadowCampaignStatus } from '../../domain';
import { UNIVERSAL_SHADOW_INTEGRATION_ENABLED } from '../../config';

interface ShadowIntegrationContextValue {
  enabled: boolean;
  coordinator: ShadowIntegrationCoordinator | null;
  namespace: string | null;
  statuses: ShadowCampaignStatus[];
}

const ShadowIntegrationContext = createContext<ShadowIntegrationContextValue>({
  enabled: false,
  coordinator: null,
  namespace: null,
  statuses: [],
});

/**
 * Stage 9 — hosts the local universal shadow-integration coordinator.
 *
 * When the (default-off) flag is disabled, this renders its children and does
 * absolutely nothing else: no coordinator, no repository, no localStorage
 * access, no subscriptions. When enabled, it creates ONE coordinator backed by
 * an isolated, campaign-scoped SHADOW localStorage namespace (Stage 9 prefix),
 * kept strictly separate from every legacy key and from the production
 * universal namespace. The coordinator is disposed on unmount, cancelling any
 * pending debounced work.
 */
export function ShadowIntegrationProvider({ children }: { children: ReactNode }) {
  if (!UNIVERSAL_SHADOW_INTEGRATION_ENABLED) {
    return (
      <ShadowIntegrationContext.Provider value={DISABLED_VALUE}>{children}</ShadowIntegrationContext.Provider>
    );
  }
  return <EnabledShadowIntegrationProvider>{children}</EnabledShadowIntegrationProvider>;
}

const DISABLED_VALUE: ShadowIntegrationContextValue = {
  enabled: false,
  coordinator: null,
  namespace: null,
  statuses: [],
};

function EnabledShadowIntegrationProvider({ children }: { children: ReactNode }) {
  // Own the coordinator's lifecycle inside the effect so React StrictMode's
  // dev double-mount (setup -> cleanup -> setup) disposes the first instance
  // and installs a fresh live one, instead of leaving a disposed coordinator.
  const [coordinator, setCoordinator] = useState<ShadowIntegrationCoordinator | null>(null);

  useEffect(() => {
    const repository = createShadowCampaignRepository(
      createBrowserRepositoryStorage(window.localStorage),
      STAGE_09_SHADOW_NAMESPACE,
    );
    const instance = new ShadowIntegrationCoordinator({ repository });
    setCoordinator(instance);
    return () => {
      instance.dispose();
      setCoordinator((current) => (current === instance ? null : current));
    };
  }, []);

  return (
    <ShadowStatusBridge coordinator={coordinator}>{children}</ShadowStatusBridge>
  );
}

function ShadowStatusBridge({
  coordinator,
  children,
}: {
  coordinator: ShadowIntegrationCoordinator | null;
  children: ReactNode;
}) {
  const statuses = useSyncExternalStore(
    (onChange) => (coordinator ? coordinator.subscribe(onChange) : () => {}),
    () => (coordinator ? coordinator.getAllStatuses() : EMPTY_STATUSES),
    () => (coordinator ? coordinator.getAllStatuses() : EMPTY_STATUSES),
  );

  const value = useMemo<ShadowIntegrationContextValue>(
    () => ({
      enabled: true,
      coordinator,
      namespace: coordinator ? coordinator.namespace : STAGE_09_SHADOW_NAMESPACE,
      statuses,
    }),
    [coordinator, statuses],
  );

  return <ShadowIntegrationContext.Provider value={value}>{children}</ShadowIntegrationContext.Provider>;
}

const EMPTY_STATUSES: ShadowCampaignStatus[] = [];

export function useShadowIntegration(): ShadowIntegrationContextValue {
  return useContext(ShadowIntegrationContext);
}

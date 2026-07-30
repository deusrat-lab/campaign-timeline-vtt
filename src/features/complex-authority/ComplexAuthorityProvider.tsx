import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ComplexAuthorityRouter,
  resolveComplexScopes,
  createBrowserRepositoryStorage,
  adaptMainCampaignToUniversal,
  campaignIdFromLegacy,
  readAggregateSlot,
  type ComplexAuthorityScope,
  type ComplexAuthorityCampaignStatus,
  type MainCampaignDataInput,
  type MainCampaignOverlayInput,
} from '../../domain';
import { useCampaignData } from '../../state/campaignDataContext';
import { setComplexAuthoritySink } from '../../state/complexAuthoritySink';
import { routeMainComplexThrough, routeUserComplexThrough } from './complexRouteBridge';
import { UNIVERSAL_COMPLEX_AUTHORITY_ENABLED, UNIVERSAL_COMPLEX_AUTHORITY_SCOPES } from '../../config';

interface ComplexAuthorityContextValue {
  enabled: boolean;
  router: ComplexAuthorityRouter | null;
  statuses: ComplexAuthorityCampaignStatus[];
}

const ComplexAuthorityContext = createContext<ComplexAuthorityContextValue>({ enabled: false, router: null, statuses: [] });

export function resolveActiveComplexScopes(): Set<ComplexAuthorityScope> {
  return resolveComplexScopes(UNIVERSAL_COMPLEX_AUTHORITY_SCOPES);
}

/**
 * Stage 16.1 — hosts the universal COMPLEX-authority router and registers the ONE
 * complex sink the legacy stores consult (BEFORE the Stage 15 durable sink) for
 * an allowlisted aggregate transition (reveal / presented card / party location /
 * route progress / placement).
 *
 * Default OFF: renders children and does nothing else — no router, no sink, no
 * storage access; the stores' complex routes return `false` and behaviour is
 * exactly pre-Stage-16. When enabled the universal aggregate command is durably
 * committed to the production repository first and the existing legacy action
 * runs once as the compatibility projection. Never adds network / server sync,
 * never changes `userCampaignSync`, never falls back to the active campaign or
 * Greyholm for a user campaign.
 */
export function ComplexAuthorityProvider({ children }: { children: ReactNode }) {
  if (!UNIVERSAL_COMPLEX_AUTHORITY_ENABLED) {
    return <ComplexAuthorityContext.Provider value={DISABLED}>{children}</ComplexAuthorityContext.Provider>;
  }
  return <EnabledComplexAuthorityProvider>{children}</EnabledComplexAuthorityProvider>;
}

const DISABLED: ComplexAuthorityContextValue = { enabled: false, router: null, statuses: [] };

function EnabledComplexAuthorityProvider({ children }: { children: ReactNode }) {
  const [router, setRouter] = useState<ComplexAuthorityRouter | null>(null);
  const { data } = useCampaignData();
  const dataRef = useRef(data);
  dataRef.current = data;
  const recoveredRef = useRef(false);

  useEffect(() => {
    const instance = new ComplexAuthorityRouter({
      repositoryStorage: createBrowserRepositoryStorage(window.localStorage),
      diagnosticsStorage: window.localStorage,
      recoveryStorage: window.localStorage,
      allowedScopes: resolveActiveComplexScopes(),
      enabled: true,
    });
    setRouter(instance);

    setComplexAuthoritySink({
      routeMain: (req) =>
        routeMainComplexThrough(instance, () => dataRef.current, req.complexScope as ComplexAuthorityScope, req),
      routeUser: (req) => routeUserComplexThrough(instance, req.complexScope as ComplexAuthorityScope, req),
    });

    // Reload recovery for Greyholm (guarded against StrictMode double-run). Only
    // resolves already-applied pending projections (idempotent recognition); a
    // genuinely universal-ahead record is left pending safely — never a second
    // universal commit, never a fabricated projection.
    if (!recoveredRef.current) {
      recoveredRef.current = true;
      const greyId = campaignIdFromLegacy('greyholm', 'main');
      const merged = dataRef.current;
      if (merged) {
        try {
          instance.runRecovery(greyId, {
            readLegacySlot: (aggregateKind, targetId) => {
              const snap = adaptMainCampaignToUniversal({ data: merged as MainCampaignDataInput, overlay: {} as MainCampaignOverlayInput }).snapshot;
              return snap ? readAggregateSlot(snap, aggregateKind, targetId) : undefined;
            },
            project: () => ({ snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'no_auto_project', path: '<root>', message: 'aggregate auto-reprojection deferred to a real store dispatch' }] }),
          });
        } catch {
          /* recovery must never break startup */
        }
      }
    }

    return () => {
      setComplexAuthoritySink(null);
      instance.dispose();
      setRouter((cur) => (cur === instance ? null : cur));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <ComplexStatusBridge router={router}>{children}</ComplexStatusBridge>;
}

const EMPTY: ComplexAuthorityCampaignStatus[] = [];

function ComplexStatusBridge({ router, children }: { router: ComplexAuthorityRouter | null; children: ReactNode }) {
  const statuses = useSyncExternalStore(
    (onChange) => (router ? router.subscribe(onChange) : () => {}),
    () => (router ? router.getAllStatuses() : EMPTY),
    () => (router ? router.getAllStatuses() : EMPTY),
  );
  const value = useMemo<ComplexAuthorityContextValue>(() => ({ enabled: true, router, statuses }), [router, statuses]);
  return <ComplexAuthorityContext.Provider value={value}>{children}</ComplexAuthorityContext.Provider>;
}

export function useComplexAuthority(): ComplexAuthorityContextValue {
  return useContext(ComplexAuthorityContext);
}

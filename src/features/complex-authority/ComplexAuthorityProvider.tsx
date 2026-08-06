import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import {
  ComplexAuthorityRouter,
  resolveComplexScopes,
  narrowToUiOwned,
  createBrowserRepositoryStorage,
  adaptMainCampaignToUniversal,
  campaignIdFromLegacy,
  readAggregateSlot,
  type ComplexAuthorityScope,
  type ComplexAuthorityCampaignStatus,
  type MainCampaignDataInput,
  type MainCampaignOverlayInput,
} from '../../domain';
import { useCampaignData, useBaseCampaignData } from '../../state/campaignDataContext';
import { setComplexAuthoritySink } from '../../state/complexAuthoritySink';
import { routeMainComplexThrough, routeUserComplexThrough } from './complexRouteBridge';
import { UNIVERSAL_COMPLEX_AUTHORITY_ENABLED, UNIVERSAL_COMPLEX_AUTHORITY_SCOPES } from '../../config';

interface ComplexAuthorityContextValue {
  enabled: boolean;
  router: ComplexAuthorityRouter | null;
  statuses: ComplexAuthorityCampaignStatus[];
}

const ComplexAuthorityContext = createContext<ComplexAuthorityContextValue>({ enabled: false, router: null, statuses: [] });

/**
 * The scopes the APP router actually owns: the configured (narrowing) scopes
 * intersected with the truthfully UI-owned scopes. This guarantees the app never
 * claims durable ownership of a scope no real UI action durably routes (party /
 * route / user-campaign reveal / placement-create are engine-capable but
 * excluded from UI ownership — see the ownership registry `uiStatus`).
 */
export function resolveActiveComplexScopes(): Set<ComplexAuthorityScope> {
  return narrowToUiOwned(resolveComplexScopes(UNIVERSAL_COMPLEX_AUTHORITY_SCOPES));
}

/**
 * Dev/test-only, default-off legacy-failure fixture. When the DM sets
 * `localStorage['stage16.test.failLegacyOnce'] = '1'` in a local dev build, the
 * NEXT durable compatibility projection throws once AFTER dispatching the legacy
 * action — exercising the real "universal committed / legacy failed" pending
 * path in the live provider, then reload-recovery recognises the already-applied
 * legacy state. Never present in a production build (guarded by import.meta.env.DEV)
 * and never a UI control or server contract.
 */
const FAIL_LEGACY_ONCE_KEY = 'stage16.test.failLegacyOnce';
function consumeFailLegacyOnce(): boolean {
  if (!import.meta.env.DEV) return false;
  try {
    if (window.localStorage.getItem(FAIL_LEGACY_ONCE_KEY) === '1') {
      window.localStorage.removeItem(FAIL_LEGACY_ONCE_KEY);
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
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
  const { data: baseData } = useBaseCampaignData();
  const basePlacementsRef = useRef(baseData?.placements);
  basePlacementsRef.current = baseData?.placements;
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
        routeMainComplexThrough(
          instance,
          () => dataRef.current,
          req.complexScope as ComplexAuthorityScope,
          withFailFixture(req),
          () => basePlacementsRef.current ?? [],
        ),
      routeUser: (req) => routeUserComplexThrough(instance, req.complexScope as ComplexAuthorityScope, withFailFixture(req)),
    });

    return () => {
      setComplexAuthoritySink(null);
      instance.dispose();
      setRouter((cur) => (cur === instance ? null : cur));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload recovery for Greyholm — runs ONCE, but only after both the router and
  // the (async-loaded) merged campaign data are available (guarded against
  // StrictMode double-run). Resolves an already-applied pending projection
  // (idempotent recognition against the REAL current legacy overlay); a genuinely
  // universal-ahead record is left pending safely — never a second universal
  // commit, never a fabricated projection.
  useEffect(() => {
    if (!router || recoveredRef.current) return;
    const merged = dataRef.current;
    if (!merged) return; // wait until the campaign data has loaded
    recoveredRef.current = true;
    const greyId = campaignIdFromLegacy('greyholm', 'main');
    try {
      router.runRecovery(greyId, {
        readLegacySlot: (aggregateKind, targetId) => {
          // Read the TRUE current legacy overlay (reveal / presented-card runtime
          // lives there, not in the merged base data) so equality recognition is
          // accurate.
          let overlay: unknown = {};
          try {
            overlay = JSON.parse(window.localStorage.getItem('campaign-timeline-vtt:overlay:v2') || '{}');
          } catch {
            overlay = {};
          }
          const snap = adaptMainCampaignToUniversal({ data: merged as MainCampaignDataInput, overlay: overlay as MainCampaignOverlayInput }).snapshot;
          return snap ? readAggregateSlot(snap, aggregateKind, targetId) : undefined;
        },
        project: () => ({ snapshot: null, source: { kind: 'synthetic' }, classifications: [], diagnostics: [{ severity: 'error', code: 'no_auto_project', path: '<root>', message: 'aggregate auto-reprojection deferred to a real store dispatch' }] }),
      });
    } catch {
      /* recovery must never break startup */
    }
  }, [router, data]);

  return <ComplexStatusBridge router={router}>{children}</ComplexStatusBridge>;
}

/** Wrap a sink request so the compatibility projection throws ONCE after
 * applying the legacy action, when the dev-only fixture flag is set. The universal
 * commit has already happened by the time `commit` runs, so this yields the real
 * "universal committed / legacy failed" pending path (with the legacy action
 * actually applied, so reload-recovery recognises equality). Identity of the
 * object is preserved for every other field. */
function withFailFixture<T extends { commit: () => unknown }>(req: T): T {
  if (!import.meta.env.DEV) return req;
  const original = req.commit;
  return {
    ...req,
    commit: () => {
      const result = original();
      if (consumeFailLegacyOnce()) throw new Error('stage16.test: legacy projection failed once (after apply)');
      return result;
    },
  };
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

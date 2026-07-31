import { createContext, useContext, useMemo, type ReactNode } from 'react';
import {
  resolveOwnership,
  baselineOwnership,
  findDualAuthority,
  type OwnershipEntry,
  type Stage17Flags,
} from '../../domain';
import { stage17Flags, stage17Active } from '../../config';

/**
 * Stage 17 — unified Campaign Engine context.
 *
 * This is the single place the application asks "who owns writes for system X"
 * under the current Stage 17 flags. It is intentionally INERT by default: when
 * the Stage 17 flags are all off, `active` is false and the resolved ownership
 * is exactly the Stage 16 baseline (universal already owns the Stage 15 scalar
 * scopes + Stage 16 aggregates; everything else legacy/deferred). No battle
 * cutover, no universal sync, no cutover initialization happens here — the
 * provider only *describes* ownership; the individual owned-scope sinks (added
 * incrementally, exactly like Stage 15/16) are what actually route writes.
 *
 * The provider never issues a network request, never mutates production, and
 * never demotes a legacy writer to a compatibility view unless BOTH the master
 * cutover switch and the relevant family flag are on (enforced by
 * `resolveOwnership`, which also guarantees no ambiguous dual authority).
 */
export interface CampaignEngineContextValue {
  active: boolean;
  flags: Stage17Flags;
  ownership: OwnershipEntry[];
  /** Convenience: no system is universal-owned while legacy is still authoritative. */
  dualAuthorityViolations: number;
}

const CampaignEngineContext = createContext<CampaignEngineContextValue>({
  active: false,
  flags: { battleAuthority: false, importExport: false, sync: false, localCutover: false },
  ownership: baselineOwnership(),
  dualAuthorityViolations: 0,
});

export function CampaignEngineProvider({ children }: { children: ReactNode }) {
  const value = useMemo<CampaignEngineContextValue>(() => {
    const flags = stage17Flags();
    const ownership = resolveOwnership(flags);
    return {
      active: stage17Active(),
      flags,
      ownership,
      dualAuthorityViolations: findDualAuthority(ownership).length,
    };
  }, []);
  return <CampaignEngineContext.Provider value={value}>{children}</CampaignEngineContext.Provider>;
}

export function useCampaignEngine(): CampaignEngineContextValue {
  return useContext(CampaignEngineContext);
}

import type { CampaignId } from '../campaign/ids';
import type { CampaignSnapshot } from '../campaign/snapshot';
import type { CampaignRuntime } from '../runtime/types';
import type { ValidationResult } from '../validation/validateCampaignSnapshot';
import type { CampaignSummary, RepositoryError } from '../repository/types';

export interface UniversalPermissionsState {
  canEdit: boolean;
  canPresent: boolean;
  canRunBattle: boolean;
  audience: 'dm' | 'player' | 'observer';
}

export interface UniversalMigrationState {
  running: boolean;
  lastSourceId?: string;
  lastResult?: 'dry-run' | 'committed' | 'rolled-back' | 'failed' | 'already-migrated';
}

export interface UniversalCampaignStoreState {
  registry: CampaignSummary[];
  activeCampaignId?: CampaignId;
  durableSnapshot?: CampaignSnapshot;
  runtime?: CampaignRuntime;
  dirty: boolean;
  saveState: 'idle' | 'saving' | 'saved' | 'error';
  conflictState?: RepositoryError;
  permissions: UniversalPermissionsState;
  validationState?: ValidationResult;
  migrationState: UniversalMigrationState;
  selectedEntityId?: string;
}

export function createInitialUniversalStoreState(audience: UniversalPermissionsState['audience'] = 'dm'): UniversalCampaignStoreState {
  return {
    registry: [],
    dirty: false,
    saveState: 'idle',
    permissions: {
      audience,
      canEdit: audience === 'dm',
      canPresent: audience === 'dm',
      canRunBattle: audience === 'dm',
    },
    migrationState: { running: false },
  };
}

export function activateUniversalCampaign(
  state: UniversalCampaignStoreState,
  snapshot: CampaignSnapshot,
): UniversalCampaignStoreState {
  return {
    ...state,
    activeCampaignId: snapshot.metadata.campaignId,
    durableSnapshot: structuredClone(snapshot),
    runtime: structuredClone(snapshot.runtime),
    dirty: false,
    saveState: 'idle',
    conflictState: undefined,
    selectedEntityId: undefined,
  };
}

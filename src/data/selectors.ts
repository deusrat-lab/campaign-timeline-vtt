import type { CampaignData } from './loadCampaignData';
import type { CampaignProgress, LocationState, QuestStatus } from '../types';

export function effectiveQuestStatus(questId: string, baseStatus: QuestStatus, progress: CampaignProgress): QuestStatus {
  return progress.questStatusOverrides[questId] ?? baseStatus;
}

export function effectiveLocationStatus(locationState: LocationState, progress: CampaignProgress) {
  return progress.locationStatusOverrides[locationState.id] ?? locationState.status;
}

export function getLocationStatesForTimeline(data: CampaignData, timelineId: string): LocationState[] {
  return data.locationStates.filter((ls) => ls.timelineId === timelineId);
}

export function getLocationState(data: CampaignData, id: string): LocationState | undefined {
  return data.locationStates.find((ls) => ls.id === id);
}

export function getRootLocationStates(data: CampaignData, timelineId: string): LocationState[] {
  return getLocationStatesForTimeline(data, timelineId).filter((ls) => !ls.parentLocationStateId);
}

/** Player-facing map policy: locations are visible by default so players can
 * use the same geography as the DM. Only an explicit DM hide flag removes a
 * location from Player View/Observer; status remains campaign state, not a
 * map-visibility gate. */
export function isLocationVisibleToPlayers(ls: LocationState, progress: CampaignProgress): boolean {
  void progress;
  if (ls.visibleToPlayers === false) return false;
  return true;
}

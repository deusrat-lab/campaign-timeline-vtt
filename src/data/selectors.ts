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

/** Player View must never see hidden-status locations, dmNotes, or Arc 2 unless revealed. */
export function isLocationVisibleToPlayers(ls: LocationState, progress: CampaignProgress): boolean {
  if (ls.visibleToPlayers === false) return false;
  return effectiveLocationStatus(ls, progress) !== 'hidden';
}

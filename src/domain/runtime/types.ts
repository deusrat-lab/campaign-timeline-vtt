import type { CampaignId, UniversalEntityId, UniversalMapId } from '../campaign/ids';
import type { BattleRuntime } from '../battles/types';
import type { UniversalPoint } from '../maps/types';

export interface PartyRuntime {
  currentLocationRef?: UniversalEntityId;
  currentMapId?: UniversalMapId;
  currentMapPosition?: UniversalPoint;
  routeProgress?: Record<string, unknown> | null;
}

export interface PresentationRuntime {
  presentedCard?: { entityRef: UniversalEntityId; kind: string } | null;
  observerFocus?: { mapId?: UniversalMapId; entityRef?: UniversalEntityId; point?: UniversalPoint } | null;
}

export interface CampaignRuntime {
  campaignId: CampaignId;
  activeMapId?: UniversalMapId;
  party: PartyRuntime;
  presentation: PresentationRuntime;
  battles: Record<string, BattleRuntime>;
  questStatuses: Record<string, string>;
  locationStatuses: Record<string, string>;
  extensions?: Record<string, unknown>;
}

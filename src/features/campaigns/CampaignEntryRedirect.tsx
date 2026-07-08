import { Navigate, useParams } from 'react-router-dom';
import { MAIN_CAMPAIGN_ID } from '../../data/campaignModules';

/**
 * `/campaigns/:campaignId` entry point. The protected main campaign opens the
 * legacy `/map` flow; every other id is a user campaign → its isolated map
 * workspace. No dashboards or pre-seeded content.
 */
export function CampaignEntryRedirect() {
  const { campaignId } = useParams<{ campaignId: string }>();
  if (!campaignId) return <Navigate to="/campaigns" replace />;
  if (campaignId === MAIN_CAMPAIGN_ID) return <Navigate to="/map" replace />;
  return <Navigate to={`/campaigns/${campaignId}/map`} replace />;
}

import { useParams } from 'react-router-dom';
import { useUserCampaigns } from '../../state/userCampaignStore';
import { CapabilitiesPanel } from '../settings/CapabilitiesPanel';

/** Block D — user-campaign (Caldran / new campaigns) settings route. Thin
 * route adapter around the SAME CapabilitiesPanel Greyholm's SettingsPage
 * uses — no campaign-specific UI, only the campaignId-scoped data source
 * differs. */
export function CampaignSettingsPage() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const store = useUserCampaigns();
  const data = campaignId ? store.getData(campaignId) : null;
  const runtime = campaignId ? store.getRuntime(campaignId) : null;
  const readOnly = runtime?.mode !== 'dmEdit';

  if (!campaignId || !data) {
    return (
      <main className="settings-page">
        <h1>Настройки</h1>
        <p>Кампания не найдена.</p>
      </main>
    );
  }

  return (
    <main className="settings-page">
      <h1>Настройки — {data.title}</h1>
      {readOnly && <p className="settings-page-readonly-hint">Переключитесь в режим «DM Edit», чтобы изменять модули.</p>}
      <CapabilitiesPanel
        capabilities={data.capabilities ?? {}}
        onToggle={(key, enabled) => store.setCapability(campaignId, key, enabled)}
        readOnly={readOnly}
      />
    </main>
  );
}

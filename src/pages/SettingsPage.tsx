import { useCampaignStore } from '../state/campaignStore';
import { CapabilitiesPanel } from '../features/settings/CapabilitiesPanel';

/** Block D — Greyholm (main campaign) settings route. Thin route adapter:
 * all the actual toggle logic lives in the shared CapabilitiesPanel + the
 * store's `capabilities`/`setCapability`. */
export function SettingsPage() {
  const store = useCampaignStore();
  const readOnly = store.mode !== 'dm-edit';
  return (
    <main className="settings-page">
      <h1>Настройки — Грейхольм</h1>
      {readOnly && <p className="settings-page-readonly-hint">Переключитесь в режим «DM Edit», чтобы изменять модули.</p>}
      <CapabilitiesPanel capabilities={store.capabilities} onToggle={store.setCapability} readOnly={readOnly} />
    </main>
  );
}

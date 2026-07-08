import { useLocation, useNavigate } from 'react-router-dom';
import { MAIN_CAMPAIGN_ID } from '../data/campaignModules';
import { useUserCampaigns } from '../state/userCampaignStore';

/**
 * Campaign Switcher — a lightweight context switch in the top bar.
 *
 * Switching only NAVIGATES; it never migrates or mixes state. The protected
 * main campaign routes to the legacy `/map` flow; user campaigns route to their
 * isolated map workspace. Each campaign keeps its own runtime.
 */
export function CampaignSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();
  const { registry } = useUserCampaigns();

  let current = 'atlas';
  const campaignMatch = location.pathname.match(/^\/campaigns\/([^/]+)/);
  if (campaignMatch && campaignMatch[1] !== 'new') current = campaignMatch[1];
  else if (location.pathname.startsWith('/map') || location.pathname === '/' || location.pathname === '/home') current = MAIN_CAMPAIGN_ID;
  else if (location.pathname.startsWith('/world') || location.pathname.startsWith('/atlas')) current = 'atlas';

  function onChange(value: string) {
    if (value === 'atlas') navigate('/world');
    else if (value === 'home') navigate('/');
    else if (value === 'new') navigate('/campaigns/new');
    else if (value === MAIN_CAMPAIGN_ID) navigate('/map');
    else navigate(`/campaigns/${value}/map`);
  }

  return (
    <select
      className="campaign-switcher"
      aria-label="Контекст игры"
      value={registry.some((r) => r.campaignId === current) || current === MAIN_CAMPAIGN_ID || current === 'atlas' ? current : 'home'}
      onChange={(e) => onChange(e.target.value)}
      title="Переключить контекст: кампания / ваншот / атлас"
    >
      <option value="home">🌍 Дом мира</option>
      <option value={MAIN_CAMPAIGN_ID}>★ Основная кампания: Грейхольм</option>
      {registry.length > 0 && (
        <optgroup label="Мои кампании">
          {registry.map((c) => <option key={c.campaignId} value={c.campaignId}>{c.title}</option>)}
        </optgroup>
      )}
      <option value="new">＋ Новая кампания…</option>
      <option value="atlas">📖 World Atlas</option>
    </select>
  );
}

import { useLocation, useNavigate } from 'react-router-dom';
import { CAMPAIGN_MODULES, MAIN_CAMPAIGN_ID } from '../data/campaignModules';

/**
 * Campaign Switcher — a lightweight context switch shown in the top bar.
 *
 * Switching only NAVIGATES; it never migrates or mixes state. The protected
 * main campaign routes to the legacy `/map` flow; every other campaign routes
 * to its isolated dashboard. Each campaign keeps its own runtime, so nothing
 * bleeds across contexts.
 */
export function CampaignSwitcher() {
  const navigate = useNavigate();
  const location = useLocation();

  // Derive the current context from the URL.
  let current = 'atlas';
  const campaignMatch = location.pathname.match(/^\/campaigns\/([^/]+)/);
  if (campaignMatch) current = campaignMatch[1];
  else if (location.pathname.startsWith('/map') || location.pathname === '/') current = MAIN_CAMPAIGN_ID;
  else if (location.pathname.startsWith('/world')) current = 'atlas';

  function onChange(value: string) {
    if (value === 'atlas') navigate('/world');
    else if (value === 'home') navigate('/');
    else if (value === MAIN_CAMPAIGN_ID) navigate('/map');
    else navigate(`/campaigns/${value}`);
  }

  return (
    <select
      className="campaign-switcher"
      aria-label="Контекст игры"
      value={current}
      onChange={(e) => onChange(e.target.value)}
      title="Переключить контекст: кампания / ваншот / атлас"
    >
      <option value="home">🌍 Дом мира</option>
      <optgroup label="Кампании">
        {CAMPAIGN_MODULES.map((c) => (
          <option key={c.id} value={c.id}>
            {c.protected ? '★ ' : ''}{c.titleRu ?? c.title}
          </option>
        ))}
      </optgroup>
      <option value="atlas">📖 World Atlas</option>
    </select>
  );
}

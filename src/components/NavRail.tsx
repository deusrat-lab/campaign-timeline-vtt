import { Link, useLocation } from 'react-router-dom';
import { useCampaignStore } from '../state/campaignStore';
import { useUserCampaigns } from '../state/userCampaignStore';
import { isCapabilityEnabled, type UniversalCapabilityKey } from '../domain/campaign/capabilities';

interface RailItem {
  key: string;
  label: string;
  icon: string;
  to?: string;
  /** Block D — when set, this nav item is hidden if the campaign's
   * capability is disabled. Proof-of-wiring case: 'economy' gates the
   * Greyholm and UC "Экономика"/"Торговля" links; the rest of the rail is
   * unaffected until the same one-line addition is made per item. */
  capability?: UniversalCapabilityKey;
}

const RAIL_ITEMS: RailItem[] = [
  { key: 'home', label: 'Дом мира', icon: '🌍', to: '/' },
  { key: 'campaigns', label: 'Кампании', icon: '🎲', to: '/campaigns' },
  { key: 'world', label: 'Атлас', icon: '📖', to: '/world', capability: 'atlas' },
  { key: 'map', label: 'Карта', icon: '🗺', to: '/map', capability: 'maps' },
  { key: 'search', label: 'Поиск', icon: '🔎', to: '/search' },
  { key: 'timeline', label: 'Таймлайн', icon: '⏳', capability: 'timeline' },
  { key: 'quests', label: 'Квесты', icon: '📜', to: '/quests', capability: 'quests' },
  { key: 'npc', label: 'NPC', icon: '🧑', to: '/npc', capability: 'npc' },
  { key: 'enemies', label: 'Враги', icon: '☠', to: '/enemies', capability: 'enemies' },
  { key: 'players', label: 'Игроки', icon: '🎭', to: '/players', capability: 'party' },
  { key: 'visibility', label: 'Показ', icon: '👁', to: '/visibility' },
  { key: 'economy', label: 'Экономика', icon: '💰', to: '/economy', capability: 'economy' },
  { key: 'services', label: 'Торговля', icon: '🛒', to: '/services', capability: 'economy' },
  { key: 'images', label: 'Картинки', icon: '🖼', to: '/images', capability: 'images' },
  { key: 'battle-maps', label: 'Карты боя', icon: '▦', to: '/battle-maps', capability: 'battleMaps' },
  { key: 'bestiary', label: 'Бестиарий', icon: '📖', to: '/bestiary', capability: 'enemies' },
  { key: 'factions', label: 'Фракции', icon: '⚔', to: '/factions', capability: 'factions' },
  { key: 'notes', label: 'Заметки', icon: '📝' },
  { key: 'calendar', label: 'Календарь', icon: '📅' },
  { key: 'resources', label: 'Ресурсы', icon: '🎒' },
  { key: 'settings', label: 'Настройки', icon: '⚙', to: '/settings' },
];

export function NavRail() {
  const location = useLocation();
  const store = useCampaignStore();
  const userStore = useUserCampaigns();
  if (store.mode === 'player-view') return null;
  // Inside a user campaign, swap the main-campaign library items for THIS
  // campaign's own sections (map + locations/NPC/quests/enemies/images/notes),
  // scoped to the open campaign — same structure as the main campaign, but
  // isolated data. Outside a campaign, show the normal rail.
  const campaignMatch = location.pathname.match(/^\/campaigns\/(?!new(?:$|\/))([^/]+)/);
  const campaignId = campaignMatch?.[1];
  if (campaignId) {
    // Player View gets a reduced rail: only the map and the card sections the
    // DM can reveal — no DM tools (battle maps, bestiary, factions, players,
    // images, notes). Matches "у игроков меньше панелей — только карта и карточки".
    const asPlayer = new URLSearchParams(location.search).get('as') === 'player';
    // Separate-tab Observer (?as=player): hide the rail entirely — same clean,
    // full-screen player experience as the main campaign's «Открыть Observer».
    if (asPlayer) return null;
    const isPlayerView = userStore.getRuntime(campaignId).mode === 'playerView';
    if (isPlayerView) return null;
    const campaignData = userStore.getData(campaignId);
    const cItemsAll: RailItem[] = [
      { key: 'home', label: 'Дом мира', icon: '🌍', to: '/' },
      { key: 'campaigns', label: 'Кампании', icon: '🎲', to: '/campaigns' },
      { key: 'c-map', label: 'Карта', icon: '🗺', to: `/campaigns/${campaignId}/map`, capability: 'maps' },
      { key: 'c-locations', label: 'Локации', icon: '⌂', to: `/campaigns/${campaignId}/library/locations`, capability: 'locations' },
      { key: 'c-npc', label: 'NPC', icon: '🧑', to: `/campaigns/${campaignId}/library/npc`, capability: 'npc' },
      { key: 'c-quests', label: 'Квесты', icon: '📜', to: `/campaigns/${campaignId}/library/quests`, capability: 'quests' },
      { key: 'c-enemies', label: 'Враги', icon: '☠', to: `/campaigns/${campaignId}/library/enemies`, capability: 'enemies' },
      { key: 'c-bestiary', label: 'Бестиарий', icon: '📖', to: `/campaigns/${campaignId}/library/bestiary`, capability: 'enemies' },
      { key: 'c-players', label: 'Игроки', icon: '🎭', to: `/campaigns/${campaignId}/library/players`, capability: 'party' },
      { key: 'c-factions', label: 'Фракции', icon: '⚔', to: `/campaigns/${campaignId}/library/factions`, capability: 'factions' },
      { key: 'c-battle', label: 'Карты боя', icon: '▦', to: `/campaigns/${campaignId}/library/battle-maps`, capability: 'battleMaps' },
      { key: 'c-images', label: 'Картинки', icon: '🖼', to: `/campaigns/${campaignId}/library/images`, capability: 'images' },
      { key: 'c-notes', label: 'Заметки', icon: '📝', to: `/campaigns/${campaignId}/library/notes` },
      { key: 'c-settings', label: 'Настройки', icon: '⚙', to: `/campaigns/${campaignId}/settings` },
      { key: 'world', label: 'Атлас', icon: '📖', to: '/world', capability: 'atlas' },
    ];
    const cItems = cItemsAll.filter((item) => !item.capability || !campaignData || isCapabilityEnabled(campaignData.capabilities, item.capability));
    return (
      <nav className="nav-rail" aria-label="Навигация кампании">
        {cItems.map((item) => {
          const isActive = !!item.to && (location.pathname + location.search === item.to || location.pathname === item.to);
          return (
            <Link key={item.key} to={item.to!} className={`nav-rail-item${isActive ? ' active' : ''}`}>
              <span className="nav-rail-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-rail-label">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    );
  }
  const items = RAIL_ITEMS.filter((item) => !item.capability || isCapabilityEnabled(store.capabilities, item.capability));

  return (
    <nav className="nav-rail" aria-label="Основная навигация">
      {items.map((item) => {
        const isActive =
          !!item.to &&
          (location.pathname + location.search === item.to ||
            location.pathname === item.to ||
            (item.to === '/services' && (location.pathname === '/shops' || location.pathname === '/taverns')) ||
            (item.to === '/map' && location.pathname === '/'));
        if (item.to) {
          return (
            <Link
              key={item.key}
              to={item.to}
              className={`nav-rail-item${isActive ? ' active' : ''}`}
            >
              <span className="nav-rail-icon" aria-hidden="true">{item.icon}</span>
              <span className="nav-rail-label">{item.label}</span>
            </Link>
          );
        }
        return (
          <button
            key={item.key}
            type="button"
            className="nav-rail-item nav-rail-item-disabled"
            disabled
            aria-disabled="true"
            aria-label={`${item.label} — скоро`}
            title="Скоро"
          >
            <span className="nav-rail-icon" aria-hidden="true">{item.icon}</span>
            <span className="nav-rail-label">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

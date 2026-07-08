import { Link, useLocation } from 'react-router-dom';
import { useCampaignStore } from '../state/campaignStore';

interface RailItem {
  key: string;
  label: string;
  icon: string;
  to?: string;
}

const RAIL_ITEMS: RailItem[] = [
  { key: 'home', label: 'Дом мира', icon: '🌍', to: '/' },
  { key: 'campaigns', label: 'Кампании', icon: '🎲', to: '/campaigns' },
  { key: 'world', label: 'Атлас', icon: '📖', to: '/world' },
  { key: 'map', label: 'Карта', icon: '🗺', to: '/map' },
  { key: 'search', label: 'Поиск', icon: '🔎', to: '/search' },
  { key: 'timeline', label: 'Таймлайн', icon: '⏳' },
  { key: 'quests', label: 'Квесты', icon: '📜', to: '/quests' },
  { key: 'npc', label: 'NPC', icon: '🧑', to: '/npc' },
  { key: 'enemies', label: 'Враги', icon: '☠', to: '/enemies' },
  { key: 'players', label: 'Игроки', icon: '🎭', to: '/players' },
  { key: 'visibility', label: 'Показ', icon: '👁', to: '/visibility' },
  { key: 'economy', label: 'Экономика', icon: '💰', to: '/economy' },
  { key: 'services', label: 'Торговля', icon: '🛒', to: '/services' },
  { key: 'images', label: 'Картинки', icon: '🖼', to: '/images' },
  { key: 'battle-maps', label: 'Карты боя', icon: '▦', to: '/battle-maps' },
  { key: 'bestiary', label: 'Бестиарий', icon: '📖', to: '/bestiary' },
  { key: 'factions', label: 'Фракции', icon: '⚔', to: '/factions' },
  { key: 'notes', label: 'Заметки', icon: '📝' },
  { key: 'calendar', label: 'Календарь', icon: '📅' },
  { key: 'resources', label: 'Ресурсы', icon: '🎒' },
  { key: 'settings', label: 'Настройки', icon: '⚙' },
];

export function NavRail() {
  const location = useLocation();
  const store = useCampaignStore();
  if (store.mode === 'player-view') return null;
  // Inside a user campaign, only world-level navigation is relevant — the
  // main-campaign library items (map, quests, NPC, …) show main data, so hide
  // them to avoid mixing contexts.
  const inUserCampaign = /^\/campaigns\/(?!new(?:$|\/))[^/]+/.test(location.pathname);
  const WORLD_KEYS = new Set(['home', 'campaigns', 'world']);
  const items = inUserCampaign ? RAIL_ITEMS.filter((i) => WORLD_KEYS.has(i.key)) : RAIL_ITEMS;

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

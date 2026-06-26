import { Link, useLocation } from 'react-router-dom';

interface RailItem {
  key: string;
  label: string;
  icon: string;
  to?: string;
}

const RAIL_ITEMS: RailItem[] = [
  { key: 'map', label: 'Карта', icon: '🗺', to: '/map' },
  { key: 'timeline', label: 'Таймлайн', icon: '⏳' },
  { key: 'quests', label: 'Квесты', icon: '📜', to: '/quests' },
  { key: 'npc', label: 'NPC', icon: '🧑' },
  { key: 'factions', label: 'Фракции', icon: '⚔' },
  { key: 'notes', label: 'Заметки', icon: '📝' },
  { key: 'calendar', label: 'Календарь', icon: '📅' },
  { key: 'resources', label: 'Ресурсы', icon: '🎒' },
  { key: 'settings', label: 'Настройки', icon: '⚙' },
];

export function NavRail() {
  const location = useLocation();

  return (
    <nav className="nav-rail" aria-label="Основная навигация">
      {RAIL_ITEMS.map((item) => {
        const isActive = !!item.to && (location.pathname === item.to || (item.to === '/map' && location.pathname === '/'));
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

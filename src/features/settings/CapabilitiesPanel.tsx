import { UNIVERSAL_CAPABILITY_KEYS, isCapabilityEnabled, type CapabilityToggles, type UniversalCapabilityKey } from '../../domain/campaign/capabilities';

/**
 * Block D — shared presentational capabilities toggle grid, used by BOTH the
 * Greyholm settings route and every user-campaign settings route. The single
 * source of truth for which keys exist is `UNIVERSAL_CAPABILITY_KEYS`
 * (src/domain/campaign/capabilities.ts) — this component renders whatever
 * that list contains and nothing else, so there is never a second UI-only
 * capability list to fall out of sync.
 *
 * Disabling a capability here only flips a persisted boolean; it never
 * deletes or touches any entity data, so re-enabling always shows exactly
 * what was there before (see `CapabilityToggles` doc comment).
 */
const CAPABILITY_LABELS: Record<UniversalCapabilityKey, string> = {
  maps: 'Карты',
  timeline: 'Таймлайн',
  calendar: 'Календарь',
  travel: 'Путешествия',
  events: 'События',
  delayedTriggers: 'Триггеры',
  factionZones: 'Зоны фракций',
  dynamicOverlays: 'Наложения карты',
  movableEntities: 'Подвижные сущности',
  economy: 'Экономика',
  battleMaps: 'Карты боя',
  battleRuntime: 'Бои',
  playerSafe: 'Player View',
  observer: 'Observer',
  serverSync: 'Синхронизация с сервером',
  arcs: 'Арки',
  atlas: 'Атлас',
  locations: 'Локации',
  placements: 'Размещения на карте',
  party: 'Партия',
  routes: 'Маршруты',
  npc: 'NPC',
  quests: 'Квесты',
  enemies: 'Враги',
  factions: 'Фракции',
  images: 'Изображения',
  importExport: 'Импорт/экспорт',
};

export interface CapabilitiesPanelProps {
  capabilities: CapabilityToggles;
  onToggle: (key: UniversalCapabilityKey, enabled: boolean) => void;
  readOnly?: boolean;
}

export function CapabilitiesPanel({ capabilities, onToggle, readOnly }: CapabilitiesPanelProps) {
  return (
    <div className="capabilities-panel">
      <p className="capabilities-panel-hint">
        Отключение модуля скрывает его в навигации и запрещает связанные действия — данные не удаляются и
        появятся снова при повторном включении.
      </p>
      <ul className="capabilities-panel-grid" data-testid="capabilities-panel-grid">
        {UNIVERSAL_CAPABILITY_KEYS.map((key) => {
          const enabled = isCapabilityEnabled(capabilities, key);
          return (
            <li key={key} className="capabilities-panel-row">
              <label>
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={readOnly}
                  data-testid={`capability-toggle-${key}`}
                  onChange={(event) => onToggle(key, event.target.checked)}
                />
                {CAPABILITY_LABELS[key] ?? key}
              </label>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

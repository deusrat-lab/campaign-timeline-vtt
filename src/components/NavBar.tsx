import { useEffect, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useCampaignStore } from '../state/campaignStore';
import { useCampaignData } from '../state/campaignDataContext';
import { getLocationState } from '../data/selectors';
import { API_BASE_URL } from '../config';
import { getStoredToken, setStoredToken } from '../state/persistence/authToken';
import type { AppMode } from '../types';
import { CampaignSwitcher } from './CampaignSwitcher';

/** DM-facing sync-connection indicator. The critical, repeatedly-hit failure
 * mode: a DM opens the plain app URL (or a fresh browser/device) without ever
 * capturing the `?token=...` DM code, so the HTTP adapter has no token, every
 * save() skips its PUT, and NOTHING the DM does (opening a battle map,
 * revealing a location, adding art) ever reaches the server — players see a
 * frozen campaign while the DM sees their own local edits and assumes all is
 * well. This asks the server (`/api/whoami`) what the stored token actually
 * grants and surfaces it, with a one-click way to paste the DM code in place.
 * Only rendered when a server backend is configured (API_BASE_URL set); the
 * pure-local build has nothing to sync and shows nothing. */
function DmSyncIndicator() {
  const [role, setRole] = useState<'dm' | 'player' | null | 'loading'>('loading');

  useEffect(() => {
    let cancelled = false;
    const token = getStoredToken();
    fetch(`${API_BASE_URL}/api/whoami`, token ? { headers: { Authorization: `Bearer ${token}` } } : undefined)
      .then((r) => (r.ok ? r.json() : { role: null }))
      .then((body: { role: 'dm' | 'player' | null }) => {
        if (!cancelled) setRole(body.role ?? null);
      })
      .catch(() => {
        if (!cancelled) setRole(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function enterCode() {
    const entered = window.prompt(
      'Вставьте DM-код для синхронизации с сервером (игроки увидят ваши правки).\n' +
        'Это тот же код, что в ссылке ?token=… которую вам выдали.',
    );
    if (entered == null) return;
    const stored = setStoredToken(entered);
    if (!stored) return;
    // Adapters read the token once at module init, so a reload is the simplest
    // correct way to re-create the HTTP adapter WITH the new token.
    window.location.reload();
  }

  if (role === 'loading') return null;
  if (role === 'dm') {
    return <span className="sync-indicator sync-indicator--ok" title="Правки ДМ сохраняются на сервер и видны игрокам">🟢 Синхронизация</span>;
  }
  return (
    <button
      type="button"
      className="sync-indicator sync-indicator--off"
      onClick={enterCode}
      title="Ваши правки НЕ доходят до игроков — нет DM-кода. Нажмите, чтобы ввести."
    >
      🔴 Нет синхронизации — ввести DM-код
    </button>
  );
}

/** Opens the Observer view in a new tab, correctly resolving the app's base
 * path (Vite `base` config) instead of assuming it's deployed at root. A bare
 * `window.open('/observer', ...)` would 404 under any non-root deploy. */
function openObserverWindow(selectedLocationStateId?: string) {
  const url = new URL(window.location.href);
  url.hash = '';
  url.pathname = `${import.meta.env.BASE_URL}observer`.replace(/\/+/g, '/');
  if (selectedLocationStateId) url.searchParams.set('selected', selectedLocationStateId);
  window.open(url.toString(), '_blank', 'noopener,noreferrer');
}

const MODE_LABELS: Record<AppMode, string> = {
  'dm-view': 'Режим: ДМ — просмотр',
  'dm-edit': 'Режим: ДМ — редактирование',
  'player-view': 'Режим: Игрок',
};

export function NavBar() {
  const { data } = useCampaignData();
  const store = useCampaignStore();
  const location = useLocation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const observerLocked = location.pathname === '/observer';
  // Inside a user campaign (or its map), hide all main-campaign controls (arc
  // toggles, DM/Player mode, Observer, export/import, party) — they belong to
  // the protected main campaign and must not bleed into another context.
  const inUserCampaign = /^\/campaigns\/(?!new(?:$|\/))[^/]+/.test(location.pathname);

  const currentLocation =
    data && store.party.currentLocationStateId ? getLocationState(data, store.party.currentLocationStateId) : undefined;

  function downloadExport() {
    const json = JSON.stringify(store.exportOverlay(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `campaign-timeline-vtt-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function triggerImport() {
    fileInputRef.current?.click();
  }

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const overlay = JSON.parse(String(reader.result));
        if (
          !window.confirm(
            'Импорт заменит ВСЕ текущие правки ДМ (локации, хотспоты, квесты, партию и т.д.) в этом приложении. Это действие не затрагивает dm-companion или battle-map-vtt. Продолжить?',
          )
        ) {
          return;
        }
        store.importOverlay(overlay);
        alert('Импорт завершён.');
      } catch (err) {
        alert(`Не удалось прочитать файл: ${String(err)}`);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  function handleReset() {
    if (
      window.confirm(
        'Это очистит ТОЛЬКО локальные правки данной кампании (campaign-timeline-vtt) в этом браузере: локации, хотспоты, квесты, положение партии и т.д. Данные dm-companion и battle-map-vtt не затрагиваются и не изменяются. Продолжить?',
      )
    ) {
      store.resetOverlay();
    }
  }

  const MODE_SHORT: Record<AppMode, string> = {
    'dm-view': 'DM View',
    'dm-edit': 'DM Edit',
    'player-view': 'Player View',
  };

  const isEditMode = store.mode === 'dm-edit';

  return (
    <>
      {store.mode === 'dm-edit' && <div className="edit-mode-banner">РЕЖИМ РЕДАКТИРОВАНИЯ (DM EDIT MODE)</div>}
      <nav className="navbar">
        <div className="navbar-left">
          <Link to="/" className="brand">
            <span className="brand-mark">⟡</span> Campaign Timeline VTT
          </Link>
          {!observerLocked && store.mode !== 'player-view' && (
            <>
              <Link to="/home" className="navbar-text-link" title="Стартовый экран: карта мира, кампании, атлас">🏠 Дом мира</Link>
              <CampaignSwitcher />
            </>
          )}
          {isEditMode && (
            <>
              <Link to="/admin" className="navbar-text-link">+ Локация</Link>
              <span className="navbar-text-link navbar-text-link-hint" title="Выберите локацию в редакторе хотспотов и кликните на карту">
                Создать hotspot
              </span>
            </>
          )}
        </div>
        <div className="navbar-center">
          {inUserCampaign && (
            <span className="navbar-text-link navbar-text-link-hint" title="Открыта отдельная кампания">
              Отдельная кампания — данные основной кампании скрыты
            </span>
          )}
          {!inUserCampaign && data && (
            <div className="segmented" role="group" aria-label="Текущая арка">
              {data.timelines.map((t) => {
                const disabled = t.arcId === 'arc-2' && store.mode === 'player-view' && !store.arc2RevealedToPlayers;
                return (
                  <button
                    key={t.id}
                    type="button"
                    className={`segmented-option${t.id === store.currentTimelineId ? ' active' : ''}`}
                    disabled={disabled}
                    onClick={() => store.setTimeline(t.id)}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
          )}
          {!inUserCampaign && observerLocked ? (
            <div className="segmented" role="group" aria-label="Режим приложения">
              <button type="button" title={MODE_LABELS['player-view']} className="segmented-option active" disabled>
                {MODE_SHORT['player-view']}
              </button>
            </div>
          ) : inUserCampaign ? null : (
            <div className="segmented" role="group" aria-label="Режим приложения">
              {(['dm-view', 'dm-edit', 'player-view'] as AppMode[]).map((m) => (
                <button
                  key={m}
                  type="button"
                  title={MODE_LABELS[m]}
                  className={`segmented-option${m === store.mode ? ' active' : ''}`}
                  onClick={() => store.setMode(m)}
                >
                  {MODE_SHORT[m]}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="navbar-right">
          {((!inUserCampaign && store.mode !== 'player-view' && !observerLocked) || inUserCampaign) && API_BASE_URL && <DmSyncIndicator />}
          {!inUserCampaign && store.mode === 'dm-edit' && store.saveStatus !== 'idle' && (
            <span className={`save-status save-status-${store.saveStatus}`}>
              {store.saveStatus === 'saved' ? 'Сохранено' : 'Ошибка сохранения'}
            </span>
          )}
          {!inUserCampaign && currentLocation && (
            <span className="party-marker" title="Текущее положение партии">
              Партия: <Link to={`/map?selected=${currentLocation.id}`}>{currentLocation.title}</Link>
            </span>
          )}
          {!inUserCampaign && store.mode !== 'player-view' && (
            <label className="reveal-toggle">
              <input
                type="checkbox"
                checked={store.arc2RevealedToPlayers}
                onChange={(e) => store.setArc2Revealed(e.target.checked)}
              />
              Открыть Арку 2 игрокам
            </label>
          )}
          {!inUserCampaign && !observerLocked && (
            <button
              type="button"
              onClick={() => openObserverWindow(currentLocation?.id)}
              title="Открыть полноэкранный вид для игроков (Observer) в новой вкладке"
            >
              Открыть Observer
            </button>
          )}
          {!inUserCampaign && store.mode !== 'player-view' && (
            <div className="navbar-menu">
              <button onClick={downloadExport}>Export JSON</button>
              <button onClick={triggerImport}>Import JSON</button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                style={{ display: 'none' }}
                onChange={handleImportFile}
              />
              <button onClick={handleReset}>Reset Local Edits</button>
            </div>
          )}
          <button type="button" className="navbar-avatar" aria-label="Меню пользователя" title="Меню пользователя">
            {observerLocked ? 'Иг' : 'ДМ'}
          </button>
        </div>
      </nav>
    </>
  );
}

import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { detectPlatform, isStandalone, usePwaUpdate } from './usePwa';

const INSTALL_DISMISS_KEY = 'pwa-install-dismissed';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** Банер оновлення (контрольований) + ненав'язлива підказка встановлення. */
export function PwaBanners() {
  const { needRefresh, update } = usePwaUpdate();
  const location = useLocation();
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstall, setShowInstall] = useState(false);
  const [platform] = useState(detectPlatform);
  // Підказку встановлення показуємо лише на головному екрані, щоб вона не
  // перекривала кнопки у майстрі/формах. Банер оновлення показуємо всюди.
  const onHome = location.pathname === '/';

  useEffect(() => {
    if (isStandalone()) return; // вже встановлено
    if (localStorage.getItem(INSTALL_DISMISS_KEY) === '1') return;

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
      setShowInstall(true);
    };
    window.addEventListener('beforeinstallprompt', onBeforeInstall);

    // iOS не підтримує beforeinstallprompt — показуємо інструкцію лише на iOS Safari.
    if (platform === 'ios') setShowInstall(true);

    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstall);
  }, [platform]);

  function dismissInstall() {
    setShowInstall(false);
    localStorage.setItem(INSTALL_DISMISS_KEY, '1');
  }

  async function doInstall() {
    if (installEvent) {
      await installEvent.prompt();
      await installEvent.userChoice;
      setInstallEvent(null);
    }
    dismissInstall();
  }

  return (
    <>
      {needRefresh && (
        <div className="pwa-banner update" role="alert">
          <span>Доступна нова версія застосунку.</span>
          <button className="btn primary" onClick={update}>Оновити</button>
        </div>
      )}

      {showInstall && onHome && !needRefresh && (
        <div className="pwa-banner install">
          <div style={{ flex: 1 }}>
            {platform === 'ios' ? (
              <span className="small">
                Щоб встановити: відкрийте меню «Поділитися» → «На екран “Початковий”».
              </span>
            ) : platform === 'android' ? (
              <span className="small">
                Встановіть застосунок: меню браузера → «Встановити застосунок».
              </span>
            ) : (
              <span className="small">Встановіть застосунок із меню браузера для офлайн-доступу.</span>
            )}
          </div>
          {installEvent && (
            <button className="btn primary" onClick={doInstall}>Встановити</button>
          )}
          <button className="btn" onClick={dismissInstall} aria-label="Сховати">✕</button>
        </div>
      )}
    </>
  );
}

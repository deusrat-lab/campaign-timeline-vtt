/**
 * Реєстрація service worker з контрольованим оновленням та перевіркою
 * встановлюваності. Дані IndexedDB при оновленні НЕ очищаються — SW лише
 * оновлює статичну оболонку.
 */
import { useEffect, useState } from 'react';
import { registerSW } from 'virtual:pwa-register';

export interface PwaState {
  needRefresh: boolean;
  offlineReady: boolean;
  update: () => void;
}

export function usePwaUpdate(): PwaState {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [offlineReady, setOfflineReady] = useState(false);
  const [updateFn, setUpdateFn] = useState<() => void>(() => () => {});

  useEffect(() => {
    const updateSW = registerSW({
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onOfflineReady() {
        setOfflineReady(true);
      },
    });
    setUpdateFn(() => () => updateSW(true));
  }, []);

  return { needRefresh, offlineReady, update: updateFn };
}

/** Спробувати ввімкнути постійне сховище, щоб браузер не витирав дані. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      const already = await navigator.storage.persisted?.();
      if (already) return true;
      return await navigator.storage.persist();
    }
  } catch {
    // ігноруємо — застосунок працює й без persistent storage
  }
  return false;
}

/** Визначення платформи для підказки встановлення PWA. */
export function detectPlatform(): 'ios' | 'android' | 'desktop' {
  const ua = navigator.userAgent || '';
  if (/iphone|ipad|ipod/i.test(ua)) return 'ios';
  if (/android/i.test(ua)) return 'android';
  return 'desktop';
}

/** Чи запущено вже як встановлена PWA (standalone). */
export function isStandalone(): boolean {
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    // @ts-expect-error — нестандартна властивість Safari iOS
    window.navigator.standalone === true
  );
}

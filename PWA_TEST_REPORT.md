# PWA_TEST_REPORT

Дата: 2026-08-04. Перевірено на production `dist`, який віддається реальним
HTTP-сервером (`vite preview`, не `file://`).

## Автоматична перевірка артефактів (`scripts/check-pwa.mjs`)

```
✓ index.html присутній, підключає скрипт і manifest
✓ manifest знайдено, валідний JSON
✓ manifest.name/short_name/start_url/scope/icons/display присутні
✓ manifest.lang = 'uk'
✓ усі іконки (192, 512, maskable) фізично присутні
✓ service worker (sw.js) присутній
✓ registerSW.js присутній
✅ PWA-артефакти в порядку
```

Виконується також у CI (workflow, крок «Verify PWA artifacts»).

## HTTP-перевірка (vite preview, порт 4173)

| Ресурс | Код |
|--------|-----|
| `/` (index) | 200 |
| `/manifest.webmanifest` | 200 |
| `/sw.js` | 200 |
| `/pwa-192x192.png` | 200 |
| `/settings/categories` (глибокий маршрут) | 200 |

Прямий маршрут повертає застосунок (SPA-fallback працює).

## Base path (корінь і підпапка)

- `npm run build` → `base '/'`; `start_url:"/"`, `scope:"/"`, ассети `/assets/…`.
- `VITE_BASE_PATH=/budget-pwa/ npm run build:pages` → `start_url:"/budget-pwa/"`,
  `scope:"/budget-pwa/"`, ассети `/budget-pwa/assets/…`. Перевірено збіркою.

## Офлайн та оновлення (реалізація)

- Workbox precache усіх статичних ассетів; `navigateFallback` на `index.html`
  (з урахуванням base) — оболонка доступна офлайн після першого відкриття.
- `registerType: 'prompt'` + `usePwaUpdate`/`PwaBanners`: банер «Доступна нова
  версія» → кнопка «Оновити» (контрольоване оновлення, `updateSW(true)`).
- `cleanupOutdatedCaches`, `clientsClaim` увімкнено.
- **IndexedDB не очищається** оновленням SW (SW кешує лише статику; дані — окремо).
- `navigator.storage.persist()` викликається при старті (де підтримується), щоб
  зменшити ризик витирання даних.

## Встановлюваність

- Manifest `display: standalone`, portrait, теми, іконки 192/512 + maskable,
  `id`/`scope`/`start_url` узгоджені з base — умови встановлюваності виконані.
- Підказка встановлення: Android/desktop — через `beforeinstallprompt` (кнопка
  «Встановити»); iOS — текстова інструкція (Safari не підтримує подію). Показ —
  лише на головному екрані та лише якщо користувач не сховав підказку й ще не
  встановив (standalone).

## Перевірено емуляцією (не на фізичних пристроях)

- Немає горизонтального скролу при 375×812, 430×932, 1440×900.
- Нижня навігація, FAB, safe-area (`env(safe-area-inset-*)`, `viewport-fit=cover`).

## Обмеження (чесно)

- **Фізичні iPhone 15 Plus / OnePlus 13 недоступні** в середовищі — реальне
  встановлення, Dynamic Island, системна кнопка «назад», повернення з фону
  апаратно не перевірялися. Конфігурація відповідає вимогам; апаратний тест — за
  користувачем.
- Реальний офлайн-режим (Service Worker fetch) найкраще перевіряти у браузері
  вручну: відкрити застосунок, потім у DevTools → Network поставити «Offline» і
  перезавантажити — оболонка має відкритися. Це ручний крок для користувача.

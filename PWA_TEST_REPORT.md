# PWA_TEST_REPORT

Дата: 2026-08-04. Перевірено на production `dist` та на **опублікованій
HTTPS-версії** https://deusrat-lab.github.io/campaign-timeline-vtt/.

## Перевірка на опублікованій версії (LIVE)

| Ресурс (https://deusrat-lab.github.io/campaign-timeline-vtt) | Код |
|---|---|
| `/` , `/index.html` | 200 |
| `/manifest.webmanifest` | 200 |
| `/sw.js` | 200 |
| `/assets/index-*.js` , `/assets/index-*.css` | 200 |
| `/pwa-192x192.png`, `/pwa-512x512.png`, `/apple-touch-icon.png`, `/favicon.svg` | 200 |
| `/registerSW.js` | 404 (очікувано: `registerType: 'prompt'` не емітує окремий файл; SW реєструється з бандла) |

У браузері на LIVE-URL підтверджено:
- застосунок рендериться (головний екран «Ще немає активного місяця»);
- **service worker зареєстровано**, scope `…/campaign-timeline-vtt/`, керує сторінкою;
- workbox-precache містить оболонку (index.html + JS + CSS) → офлайн-shell;
- **немає помилок у консолі**, немає 404 у застосунку;
- **HashRouter**: прямий вхід на `…/#/settings/categories` рендерить редактор категорій;
- **IndexedDB**: створена категорія зберігається й **лишається після перезавантаження**;
- `navigator.storage.persist` доступний.

## Автоматична офлайн-перевірка (Playwright, production build)

`playwright.offline.config.ts` + `e2e/offline.spec.ts`, статичний сервер із base
`/campaign-timeline-vtt/`. **2/2 passed** (Desktop Chrome, Mobile Chrome):
онлайн-запуск → реєстрація SW → **офлайн reload відкриває оболонку з кешу** →
дані збережені офлайн → маршрути працюють офлайн → нова операція офлайн
зберігається → повернення онлайн працює.

> WebKit (Mobile Safari) виключено з офлайн-автотесту: у Playwright емуляція
> офлайн + service worker для WebKit ненадійна (це не справжній Safari).
> Реальний офлайн на iOS Safari — перевіряти на пристрої.

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

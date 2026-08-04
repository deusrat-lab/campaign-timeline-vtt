import { defineConfig, devices } from '@playwright/test';

/**
 * Окремий конфіг для перевірки PWA-офлайн на PRODUCTION-збірці (з service worker).
 * Обслуговує зібраний dist із base '/campaign-timeline-vtt/' через vite preview.
 * Запуск: npm run build (з VITE_BASE_PATH) → npx playwright test -c playwright.offline.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: 'offline.spec.ts',
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4188/campaign-timeline-vtt/',
  },
  // Офлайн-SW перевіряємо на Chromium-рушіях: у Playwright WebKit емуляція
  // офлайн + service worker ненадійна (це не справжній Safari). Реальний
  // офлайн на iOS Safari — перевіряти на пристрої.
  projects: [
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 7'] } },
  ],
  // Обслуговуємо зібраний dist ПЛОСКИМ статичним сервером — точно як GitHub Pages
  // (структура /campaign-timeline-vtt/*). vite preview тут не підходить (артефакт 404).
  webServer: {
    command:
      'VITE_BASE_PATH=/campaign-timeline-vtt/ npm run build && rm -rf .pages-serve && mkdir -p .pages-serve/campaign-timeline-vtt && cp -R dist/. .pages-serve/campaign-timeline-vtt/ && cd .pages-serve && python3 -m http.server 4188',
    url: 'http://localhost:4188/campaign-timeline-vtt/',
    reuseExistingServer: false,
    timeout: 120000,
  },
});

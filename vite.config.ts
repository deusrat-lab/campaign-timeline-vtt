/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';

/**
 * Base path. Для кореня домену — '/'. Для GitHub Pages у підпапці —
 * '/repository-name/'. Задається через env VITE_BASE_PATH (єдиний механізм,
 * без хардкоду імені репозиторію у файлах).
 */
function resolveBase(): string {
  const raw = process.env.VITE_BASE_PATH ?? '/';
  const withLead = raw.startsWith('/') ? raw : `/${raw}`;
  return withLead.endsWith('/') ? withLead : `${withLead}/`;
}

const base = resolveBase();

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      // 'prompt' — показуємо користувачу контрольоване оновлення (не автозаміна).
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Мій бюджет',
        short_name: 'Бюджет',
        description: 'Локальний застосунок для особистого бюджету та фінансової грамотності',
        lang: 'uk',
        dir: 'ltr',
        theme_color: '#0f766e',
        background_color: '#0b0f14',
        display: 'standalone',
        orientation: 'portrait',
        // start_url/scope відносні до base — коректно і в корені, і в підпапці.
        start_url: base,
        scope: base,
        id: base,
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ico}'],
        navigateFallback: `${base}index.html`,
        cleanupOutdatedCaches: true,
        clientsClaim: true,
      },
    }),
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/tests/setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**'],
  },
});

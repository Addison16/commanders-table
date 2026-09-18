import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Command Table',
        short_name: 'Command Table',
        description: 'A little magic for your table.',
        theme_color: '#090d14',
        background_color: '#090d14',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        navigateFallbackDenylist: [/^\/api\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/cards\.scryfall\.io\/(?:normal|large)\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'commander-cards-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 32, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
          {
            urlPattern: /^https:\/\/cards\.scryfall\.io\/art_crop\//,
            handler: 'CacheFirst',
            options: {
              cacheName: 'commander-art-v1',
              cacheableResponse: { statuses: [200] },
              expiration: { maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60, purgeOnQuotaError: true },
            },
          },
        ],
      },
    }),
  ],
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    proxy: { '/api': { target: `http://127.0.0.1:${process.env.PORT ?? 8080}`, ws: true } },
  },
  build: { outDir: 'dist/client', target: ['es2022', 'safari16.4'], chunkSizeWarningLimit: 650 },
});

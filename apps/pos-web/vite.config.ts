import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['logo.png', 'pos-version.json', 'currency/**/*'],
      manifest: {
        name: 'Bake & Grill — POS',
        short_name: 'B&G POS',
        description: 'Point-of-sale terminal for Bake & Grill cashiers.',
        start_url: '/pos/',
        scope: '/pos/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        background_color: '#0F172A',
        theme_color: '#D4813A',
        orientation: 'any',
        lang: 'en',
        dir: 'ltr',
        icons: [
          {
            src: '/pos/logo.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pos/logo.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: '/pos/logo.png',
            sizes: '1080x1080',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        categories: ['business', 'productivity'],
      },
      workbox: {
        navigateFallback: '/pos/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/pos-version\.json$/],
        // Do NOT precache index.html — iPad PWAs kept serving the old shell
        // from Workbox even after "Update Now". Hashed JS/CSS can stay cached.
        globPatterns: ['**/*.{js,css,ico,png,svg,webp,woff2,webmanifest,json}'],
        // HEIC converter (heic-to / libheif) is ~3MB and loaded on demand — do not precache.
        globIgnores: ['**/index.html', '**/prepareUpload-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'pos-nav-v5',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 10 },
            },
          },
          {
            /*
             * Owner-uploaded media — the currency note photos above all.
             *
             * Owner, 2026-09-04: "still iphone pos is getting stuck right after
             * updating. But ipad is ok" … "only on 1st charge".
             *
             * The BUNDLED note photos are precached (see includeAssets), but an
             * owner who uploads their own in Admin → Currency Photos gets
             * /storage/ URLs instead, and nothing cached those. A service-worker
             * update drops the old precache and re-downloads 1.4MB, and the very
             * next Charge screen asks the same saturated connection for five
             * uncached photos. That is the stall — first Charge only, because
             * afterwards the browser has them; and not on the iPad, which has
             * the cache headroom and usually the wifi.
             *
             * CacheFirst in a runtime cache of its own: it is not revisioned by
             * the precache, so it SURVIVES an update. Photos change when someone
             * uploads a new one, which is rare and worth a month's staleness
             * against a till that stops during a payment.
             */
            urlPattern: ({ url, request }) =>
              request.destination === 'image' && /\/storage\//.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'pos-media-v1',
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  base: '/pos/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 3001,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
  },
});

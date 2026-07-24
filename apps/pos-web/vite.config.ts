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
      includeAssets: ['logo.png', 'pos-version.json'],
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
        globPatterns: ['**/*.{js,css,ico,png,svg,woff2,webmanifest,json}'],
        globIgnores: ['**/index.html'],
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

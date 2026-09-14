import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/__tests__/setup.ts'],
    testTimeout: 15000,
  },
  plugins: [
    tailwindcss(),
    react(),
    /*
     * The admin as a home-screen app, the way the POS is. Owner, 2026-09-14:
     * "enhance the mobile pwa for admin … same as pos." Same shape as the POS
     * config: prompt-style updates the app decides when to take, the shell
     * never precached (an iPad kept serving the old one after "Update"),
     * hashed assets cached for good.
     */
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      filename: 'sw.js',
      manifestFilename: 'manifest.webmanifest',
      includeAssets: ['logo.png', 'favicon.ico', 'favicon-*.png', 'apple-touch-icon.png', 'icon-maskable-512.png', 'theme-init.js'],
      manifest: {
        name: 'Bake & Grill — Admin',
        short_name: 'B&G Admin',
        description: 'Back office for Bake & Grill — orders, stock, purchasing, staff and money.',
        start_url: '/admin/',
        scope: '/admin/',
        display: 'standalone',
        display_override: ['standalone', 'minimal-ui', 'browser'],
        background_color: '#F8F6F3',
        theme_color: '#D4813A',
        orientation: 'any',
        lang: 'en',
        dir: 'ltr',
        // Sizes that are true: the manifest used to point every entry at
        // the 1080px logo, and an installer that checks finds no 192 or 512.
        icons: [
          { src: '/admin/favicon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/admin/favicon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/admin/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        categories: ['business', 'productivity'],
      },
      workbox: {
        navigateFallback: '/admin/index.html',
        // The API, the version stamp, Sanctum's cookie dance, the site's CSS
        // routes and uploaded files are all the server's to answer.
        navigateFallbackDenylist: [/^\/api\//, /^\/sanctum\//, /^\/css\//, /^\/storage\//, /admin-version\.json$/],
        globPatterns: ['**/*.{js,css,ico,png,svg,webp,woff2,webmanifest,json}'],
        // The HEIC converter (heic-to / libheif) is ~3MB and loaded on demand.
        globIgnores: ['**/index.html', '**/prepareUpload-*.js'],
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'admin-nav-v1',
              networkTimeoutSeconds: 3,
              expiration: { maxEntries: 2, maxAgeSeconds: 60 * 10 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  base: '/admin/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 3004,
    proxy: {
      '/api': { target: 'http://localhost:8000', changeOrigin: true },
      '/sanctum': { target: 'http://localhost:8000', changeOrigin: true },
      '/css': { target: 'http://localhost:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: { vendor: ['react', 'react-dom', 'react-router-dom'] },
      },
    },
  },
});

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

/**
 * Stamp the built asset hashes into the service worker.
 *
 * `sw.js` lives in `public/` and is copied byte-for-byte, and its
 * CACHE_VERSION was a hand-edited constant. A browser only treats a service
 * worker as new when its bytes change — so every deploy that did not happen to
 * edit sw.js left installed apps on the worker they already had, holding the
 * app shell and the cached menu API responses they installed with. Nothing on
 * the server could dislodge them.
 *
 * Hashing the emitted filenames means a deploy that changes any code changes
 * sw.js, the worker updates, its old caches are purged on activate, and the
 * page's existing controllerchange handler reloads once into the new build.
 */
function stampServiceWorkerVersion() {
  return {
    name: 'stamp-sw-version',
    apply: 'build' as const,
    writeBundle(_options: unknown, bundle: Record<string, unknown>) {
      const swPath = path.resolve(__dirname, 'dist/sw.js');
      if (!fs.existsSync(swPath)) return;
      const buildId = crypto
        .createHash('sha256')
        .update(Object.keys(bundle).sort().join('|'))
        .digest('hex')
        .slice(0, 12);
      const src = fs.readFileSync(swPath, 'utf8');
      if (!src.includes('__SW_BUILD_ID__')) {
        throw new Error('sw.js no longer contains __SW_BUILD_ID__ — the cache version would stop tracking the build.');
      }
      fs.writeFileSync(swPath, src.replace(/__SW_BUILD_ID__/g, buildId));
    },
  };
}

export default defineConfig({
  plugins: [react(), stampServiceWorkerVersion()],
  base: '/order/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 3003,
    host: 'localhost',
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      '/css': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // SECURITY: Disable sourcemaps in production
    minify: 'terser',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
  },
});

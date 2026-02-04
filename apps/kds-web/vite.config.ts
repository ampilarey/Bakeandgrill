import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  base: '/kds/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@shared': path.resolve(__dirname, '../../packages/shared/src'),
    },
  },
  server: {
    port: 3002,
    host: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false, // SECURITY: Disable sourcemaps in production
    minify: 'terser',
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/setupTests.ts',
    globals: true,
  },
});

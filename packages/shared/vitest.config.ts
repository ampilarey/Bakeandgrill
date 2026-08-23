import { defineConfig } from 'vitest/config';

/**
 * The shared package had no tests of its own — every app aliases @shared and
 * exercised it only indirectly. Code that several apps depend on deserves to
 * be tested where it lives, not wherever it happens to be imported.
 */
export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});

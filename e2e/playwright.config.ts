/**
 * Playwright config for runs started inside e2e/ (e.g. cd e2e && npx playwright test).
 * Repo-root runs should use ../playwright.config.ts instead.
 */
import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env.test') });

const sharedBaseURL = process.env.BASE_URL ?? 'https://test.bakeandgrill.mv';
const localBaseURL = process.env.LOCAL_BASE_URL ?? 'http://127.0.0.1:8000';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: sharedBaseURL,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Indian/Maldives',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [
        '**/mobile-ordering.spec.ts',
        '**/accessibility.spec.ts',
        '**/go-live/**',
      ],
    },
    {
      name: 'mobile',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
        userAgent: devices['iPhone 14'].userAgent,
      },
      testMatch: ['**/mobile.spec.ts', '**/mobile-ordering.spec.ts'],
    },
    {
      name: 'accessibility',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/accessibility.spec.ts',
    },
    {
      name: 'local',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: localBaseURL,
      },
      testMatch: ['**/go-live/**/*.spec.ts'],
    },
  ],

  reporter: [
    ['list'],
    ['html', { outputFolder: './report/html', open: 'never' }],
    ['json', { outputFile: './report/results.json' }],
    ['junit', { outputFile: './report/junit.xml' }],
  ],

  outputDir: './test-results',
});

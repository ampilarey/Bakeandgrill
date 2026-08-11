import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, 'e2e/.env.test') });

const sharedBaseURL = process.env.BASE_URL ?? 'https://test.bakeandgrill.mv';
const localBaseURL = process.env.LOCAL_BASE_URL ?? 'http://127.0.0.1:8000';

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,   // serial within each file
  workers: 1,             // one file at a time — staging auth is rate-limited
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
    // Desktop Chromium — existing shared-server suite (excludes go-live + mobile/a11y)
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: [
        '**/mobile-ordering.spec.ts',
        '**/accessibility.spec.ts',
        '**/go-live/**',
      ],
    },
    // Mobile viewport — Chromium (avoids WebKit install requirement on CI/dev)
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
    // Accessibility — desktop Chromium, axe-core scans
    {
      name: 'accessibility',
      use: { ...devices['Desktop Chrome'] },
      testMatch: '**/accessibility.spec.ts',
    },
    /**
     * LOCAL ONLY — go-live checklist specs that may move stock, raise invoices,
     * refund money, or touch SMS. Hard-fails inside helpers if baseURL is remote.
     * Run: npx playwright test --project=local
     */
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
    ['html',  { outputFolder: 'e2e/report/html',  open: 'never' }],
    ['json',  { outputFile:   'e2e/report/results.json' }],
    ['junit', { outputFile:   'e2e/report/junit.xml' }],
  ],

  outputDir: 'e2e/test-results',
});

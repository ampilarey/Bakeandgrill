import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, 'e2e/.env.test') });

export default defineConfig({
  testDir: './e2e/tests',
  fullyParallel: false,   // sequential — staging has rate limits
  retries: 1,
  timeout: 45_000,
  expect: { timeout: 10_000 },

  use: {
    baseURL: process.env.BASE_URL ?? 'https://test.bakeandgrill.mv',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Indian/Maldives',
  },

  projects: [
    // Desktop Chromium — runs all specs except mobile-only and accessibility
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: ['**/mobile-ordering.spec.ts'],
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
  ],

  reporter: [
    ['list'],
    ['html',  { outputFolder: 'e2e/report/html',  open: 'never' }],
    ['json',  { outputFile:   'e2e/report/results.json' }],
    ['junit', { outputFile:   'e2e/report/junit.xml' }],
  ],

  outputDir: 'e2e/test-results',
});

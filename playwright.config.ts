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
    baseURL: 'https://test.bakeandgrill.mv',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
    locale: 'en-US',
    timezoneId: 'Indian/Maldives',
  },

  projects: [
    // Desktop Chromium
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // iPhone 14 (mobile)
    {
      name: 'mobile',
      use: { ...devices['iPhone 14'] },
      testMatch: '**/mobile.spec.ts',
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

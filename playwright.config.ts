import { defineConfig } from 'playwright/test';

const { PLAYWRIGHT_CONTEXT_OPTIONS } = require('./scripts/performance/playwrightMobileProfile.js');

const headless = process.env.E2E_HEADLESS !== '0';

export default defineConfig({
  testDir: './tests/e2e/specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  timeout: 90_000,
  expect: {
    timeout: 10_000
  },
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
    ['junit', { outputFile: 'test-results/e2e-junit.xml' }]
  ],
  use: {
    ...PLAYWRIGHT_CONTEXT_OPTIONS,
    baseURL: process.env.E2E_BASE_URL,
    browserName: 'chromium',
    headless,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure'
  },
  grepInvert: process.env.CI ? /@quarantine/ : undefined,
  projects: [
    {
      name: 'chromium-mobile'
    }
  ]
});

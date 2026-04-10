import { defineConfig } from 'playwright/test';
import { loadE2eEnv, readBooleanEnv, readListEnv } from './tests/e2e/loadEnv';

const { PLAYWRIGHT_CONTEXT_OPTIONS } = require('./scripts/performance/playwrightMobileProfile.js');

loadE2eEnv();

const configuredProjects = [
  ...readListEnv('E2E_PROJECT'),
  ...readListEnv('E2E_PROJECTS')
].filter((projectName, index, allProjects) => allProjects.indexOf(projectName) === index);
const headless = process.env.E2E_HEADLESS !== '0';
const captureSuccessfulRuns = readBooleanEnv('E2E_CAPTURE_SUCCESS_ARTIFACTS');
const traceMode = captureSuccessfulRuns ? 'on' : 'retain-on-failure';
const videoMode = captureSuccessfulRuns ? 'on' : 'retain-on-failure';
const projects = [
  {
    name: 'chromium-mobile',
    use: {
      browserName: 'chromium' as const
    }
  },
  {
    name: 'firefox-mobile',
    use: {
      browserName: 'firefox' as const
    }
  },
  {
    name: 'webkit-mobile',
    use: {
      browserName: 'webkit' as const
    }
  }
];
const selectedProjects = configuredProjects.length
  ? projects.filter(project => configuredProjects.includes(project.name))
  : projects;

if (configuredProjects.length && selectedProjects.length !== configuredProjects.length) {
  const unknownProjects = configuredProjects.filter(projectName => !projects.some(project => project.name === projectName));
  throw new Error(`Unknown E2E_PROJECTS value(s): ${unknownProjects.join(', ')}`);
}

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
    headless,
    ignoreHTTPSErrors: true,
    trace: traceMode,
    screenshot: 'only-on-failure',
    video: videoMode
  },
  grepInvert: process.env.CI ? /@quarantine/ : undefined,
  projects: selectedProjects
});

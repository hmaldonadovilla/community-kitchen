import { expect, test } from 'playwright/test';

import { e2eEnv, requireBaseUrl } from '../fixtures/env';
import { waitForAppFrame } from '../helpers/appFrame';

const buildAnalyticsUrl = (): string => {
  const url = new URL(requireBaseUrl());
  url.searchParams.set('app', 'analytics');
  if (e2eEnv.adminEnabled) {
    url.searchParams.set('admin', 'true');
  }
  return url.toString();
};

test('queues the ingredients analysis pipeline from the centralized analytics page', async ({ page }) => {
  await page.goto(buildAnalyticsUrl(), {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });

  const appFrame = await waitForAppFrame(page);

  await expect(appFrame.getByRole('heading', { level: 1, name: 'Analytics' })).toBeVisible({ timeout: 30_000 });
  await expect(appFrame.getByRole('heading', { level: 3, name: 'Ingredients analysis' })).toBeVisible({
    timeout: 30_000
  });

  const startDateInput = appFrame.getByLabel('Start date');
  await startDateInput.fill('2026-04-01');

  await appFrame.getByRole('button', { name: 'Email ingredients report' }).click();

  await expect(
    appFrame.getByText('The ingredients report has been queued. The spreadsheet will be sent by email to hmaldonadovilla@outlook.com.')
  ).toBeVisible();
});

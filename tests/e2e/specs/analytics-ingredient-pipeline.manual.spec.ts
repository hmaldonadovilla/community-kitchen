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

test('queues the ingredients used report from the Reports page', async ({ page }) => {
  await page.goto(buildAnalyticsUrl(), {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });

  const appFrame = await waitForAppFrame(page);

  await expect(appFrame.getByRole('heading', { level: 1, name: 'Reports' })).toBeVisible({ timeout: 30_000 });
  await expect(appFrame.getByRole('heading', { level: 3, name: 'Ingredients used' })).toBeVisible({
    timeout: 30_000
  });

  const startDateInput = appFrame.getByLabel('Date');
  await startDateInput.fill('2026-04-01');

  await appFrame.getByRole('button', { name: 'Send report' }).click();

  await expect(appFrame.getByText("Report request sent. We'll email it to the Operations Manager.")).toBeVisible();
});

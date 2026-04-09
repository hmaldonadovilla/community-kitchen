import type { Page } from 'playwright/test';

import { buildFormUrl, e2eEnv } from '../fixtures/env';
import { waitForAppFrame, waitForHomeReady } from './appFrame';
import { applyMobileThrottling } from './throttling';

export async function openMealProductionHome(page: Page) {
  await applyMobileThrottling(page.context(), page, e2eEnv.mobilePreset);
  await page.goto(buildFormUrl(), {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });

  const frame = await waitForAppFrame(page);
  await waitForHomeReady(frame);
  return frame;
}

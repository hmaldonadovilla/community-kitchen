import { expect, test } from 'playwright/test';

import { e2eEnv } from '../fixtures/env';
import { runAppsScript } from '../helpers/appsScript';
import { openMealProductionHome } from '../helpers/navigation';

test.describe('Meal Production staging smoke', () => {
  test('@smoke loads the meal production home in the mobile perf profile', async ({ page }) => {
    const frame = await openMealProductionHome(page);

    await expect
      .poll(async () => frame.url().length > 0, {
        timeout: 10_000,
        message: 'Expected the embedded app frame to have a URL after home load.'
      })
      .toBe(true);
  });

  test('@smoke exposes the Apps Script transport in the embedded app frame', async ({ page }) => {
    const frame = await openMealProductionHome(page);

    const transportAvailable = await frame.evaluate(
      () => typeof globalThis?.google?.script?.run?.withSuccessHandler === 'function'
    );

    expect(transportAvailable).toBe(true);
  });

  test('@smoke can fetch the meal production form config from staging', async ({ page }) => {
    const frame = await openMealProductionHome(page);

    const config = await runAppsScript<Record<string, unknown>>(frame, 'fetchFormConfig', e2eEnv.mealProductionFormKey);

    expect(config).toBeTruthy();
    expect(typeof config).toBe('object');
  });
});

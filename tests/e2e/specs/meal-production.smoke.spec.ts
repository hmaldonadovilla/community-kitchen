import { expect, test } from 'playwright/test';

import { e2eEnv } from '../fixtures/env';
import { mealProductionFixtures } from '../fixtures/mealProduction';
import { runAppsScript } from '../helpers/appsScript';
import {
  dismissIntroIfPresent,
  expectMealTypesHidden,
  expectMealTypesVisible,
  fillFirstOrderedPortions,
  openNewOrderFromPreset,
  selectFirstCook,
  selectService,
  setProductionDate
} from '../helpers/mealProduction';
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

  test('@smoke opens a new Hub order and shows only the Vegetarian meal type', async ({ page }) => {
    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.hub);

    await setProductionDate(frame);
    await selectService(frame, mealProductionFixtures.services.lunch);
    await selectFirstCook(frame);

    await expectMealTypesVisible(frame, [mealProductionFixtures.mealTypes.vegetarian]);
    await expectMealTypesHidden(frame, [
      mealProductionFixtures.mealTypes.diabetic,
      mealProductionFixtures.mealTypes.noSalt,
      mealProductionFixtures.mealTypes.standard,
      mealProductionFixtures.mealTypes.vegan
    ]);

    await expect(frame.getByRole('button', { name: 'Next' })).toBeDisabled();
  });

  test('@smoke opens a new Belliard dinner order and shows the full dinner meal set', async ({ page }) => {
    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.belliard);

    await setProductionDate(frame);
    await dismissIntroIfPresent(frame);
    await selectService(frame, mealProductionFixtures.services.dinner);

    await expectMealTypesVisible(frame, [
      mealProductionFixtures.mealTypes.diabetic,
      mealProductionFixtures.mealTypes.noSalt,
      mealProductionFixtures.mealTypes.standard,
      mealProductionFixtures.mealTypes.vegan,
      mealProductionFixtures.mealTypes.vegetarian
    ]);
  });

  test('@smoke detects a duplicate Hub lunch record and offers to open the existing record', async ({ page }) => {
    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.hub);

    await setProductionDate(frame);
    await selectService(frame, mealProductionFixtures.services.lunch);
    await selectFirstCook(frame);
    await fillFirstOrderedPortions(frame, '10');

    await expect(frame.getByText('Creating duplicate record for the same customer, service and date is not allowed.')).toBeVisible({
      timeout: 15_000
    });
    await expect(frame.getByRole('button', { name: 'Change customer, service or date' })).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Open existing record' })).toBeVisible();
  });
});

import { expect, test } from 'playwright/test';

import { buildFormUrl } from '../fixtures/env';
import { mealProductionFixtures } from '../fixtures/mealProduction';
import { nextSunday, uniqueFutureDate } from '../helpers/dates';
import {
  chooseDuplicateChangeOption,
  confirmDialog,
  expectDialogCopy,
  expectMealTypesHidden,
  expectMealTypesVisible,
  expectTotalOrdered,
  fillFirstOrderedPortions,
  fillOrderedPortions,
  openDuplicateRecord,
  openNewOrderFromPreset,
  openSummary,
  prepareMinimalHubLunchOrder,
  selectFirstCook,
  selectService,
  setProductionDate
} from '../helpers/mealProduction';
import { openMealProductionHome } from '../helpers/navigation';

test.describe('@regression Meal Production regression', () => {
  test('@regression preserves the form and timing query parameters in the staging target URL', async () => {
    const parsed = new URL(buildFormUrl());

    expect(parsed.searchParams.get('form')).toBeTruthy();
    expect(parsed.searchParams.get('timing')).toBe('1');
  });

  test('@regression loads in mobile viewport and renders the app frame', async ({ page }) => {
    const frame = await openMealProductionHome(page);

    const viewport = page.viewportSize();

    expect(frame).toBeTruthy();
    expect(viewport?.width).toBeLessThanOrEqual(393);
  });

  test('@regression shows the weekday Belliard lunch meal set without Standard', async ({ page }) => {
    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.belliard);

    await setProductionDate(frame);
    await selectService(frame, mealProductionFixtures.services.lunch);

    await expectMealTypesVisible(frame, [
      mealProductionFixtures.mealTypes.diabetic,
      mealProductionFixtures.mealTypes.noSalt,
      mealProductionFixtures.mealTypes.vegan,
      mealProductionFixtures.mealTypes.vegetarian
    ]);
    await expectMealTypesHidden(frame, [mealProductionFixtures.mealTypes.standard]);
  });

  test('@regression shows Standard for Belliard Sunday lunch', async ({ page }) => {
    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.belliard);

    await setProductionDate(frame, nextSunday());
    await selectService(frame, mealProductionFixtures.services.lunch);

    await expectMealTypesVisible(frame, [
      mealProductionFixtures.mealTypes.diabetic,
      mealProductionFixtures.mealTypes.noSalt,
      mealProductionFixtures.mealTypes.standard,
      mealProductionFixtures.mealTypes.vegan,
      mealProductionFixtures.mealTypes.vegetarian
    ]);
  });

  test('@regression lets the duplicate dialog return to order editing', async ({ page }) => {
    const frame = await prepareMinimalHubLunchOrder(page);

    await fillFirstOrderedPortions(frame, '10');
    await expectDialogCopy(frame, 'Creating duplicate record for the same customer, service and date is not allowed.');
    await chooseDuplicateChangeOption(frame);
    await expect(frame.getByRole('button', { name: 'Open existing record' })).toBeHidden();
    await expect(frame.locator('input[aria-label="Ordered"]').first()).toBeVisible();
  });

  test('@regression warns before changing service after ordered portions have been entered', async ({ page }) => {
    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.belliard);
    const serviceChangeDate = uniqueFutureDate(1);

    await setProductionDate(frame, serviceChangeDate);
    await selectService(frame, mealProductionFixtures.services.lunch);
    await selectFirstCook(frame);
    await fillOrderedPortions(frame, [0, 0, 10, 0]);
    await expectTotalOrdered(frame, 10);

    await selectService(frame, mealProductionFixtures.services.dinner);
    await expectDialogCopy(frame, 'Changing the service will permanently delete any data or photos entered after the service.');
    await expect(frame.getByRole('button', { name: 'Cancel — Keep current service' })).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Continue — Delete subsequent data' })).toBeVisible();
    await confirmDialog(frame, 'Cancel — Keep current service');
    await expect(frame.getByRole('button', { name: 'Continue — Delete subsequent data' })).toBeHidden();
  });

  test('@regression allows future-dated Hub lunch orders to capture ordered portions', async ({ page }) => {
    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.hub);

    await setProductionDate(frame, uniqueFutureDate(10));
    await selectService(frame, mealProductionFixtures.services.lunch);
    await selectFirstCook(frame);
    await fillFirstOrderedPortions(frame, '10');
    await expectTotalOrdered(frame, 10);
    await expect(frame.getByRole('button', { name: 'Next' })).toBeEnabled();
  });

  test('@regression reflects the current Hub order draft in Summary view', async ({ page }) => {
    const frame = await prepareMinimalHubLunchOrder(page);

    await fillFirstOrderedPortions(frame, '10');
    await expectDialogCopy(frame, 'Creating duplicate record for the same customer, service and date is not allowed.');
    await openDuplicateRecord(frame);
    await openSummary(frame);

    await expect(frame.getByText(mealProductionFixtures.customers.hub)).toBeVisible({ timeout: 15_000 });
    await expect(frame.getByText(mealProductionFixtures.services.lunch)).toBeVisible();
    await expect(frame.getByText(mealProductionFixtures.mealTypes.vegetarian)).toBeVisible();
  });
});

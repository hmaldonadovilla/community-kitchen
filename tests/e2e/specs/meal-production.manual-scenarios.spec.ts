import { expect, test, type Frame } from 'playwright/test';

import { e2eEnv } from '../fixtures/env';
import { mealProductionFixtures } from '../fixtures/mealProduction';
import { expectAnyVisible } from '../helpers/assertions';
import { futureDate, nextSunday, today } from '../helpers/dates';
import {
  checkAllVisibleBoxes,
  chooseDuplicateChangeOption,
  cleanupMealProductionRecordInFrameBestEffort,
  clickHome,
  clickNext,
  cleanupMealProductionRecordBestEffort,
  confirmDialog,
  createMealProductionDraftRecord,
  dismissAutosaveReminderIfPresent,
  expectDialogCopy,
  expectMealTypesHidden,
  expectMealTypesVisible,
  expectTotalOrdered,
  findDedupConflictRecordId,
  fillFirstOrderedPortions,
  fillOrderedPortions,
  openNewOrderFromPreset,
  openExistingRecordIfDuplicatePresent,
  openSummary,
  openRecipeEditor,
  prepareHubLunchOrderForDate,
  selectCook,
  selectFirstAvailableRecipes,
  selectRecipes,
  selectService,
  setProductionDate,
  uploadVisibleFiles,
  waitForSaved,
  waitForLoadingToSettle
} from '../helpers/mealProduction';
import { openMealProductionHome } from '../helpers/navigation';

function pendingScenario(id: string, title: string): void {
  test.skip(`Scenario ${id} - ${title}`, async () => {});
}

async function advanceToFoodSafetyAfterDraftSave(frame: Frame): Promise<void> {
  const foodSafetyPrompt = frame.getByText('Confirm that all pots reached at least 63°C');
  const draftError = frame.getByRole('alert').filter({ hasText: 'Failed to create draft record.' });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await clickNext(frame);
    await waitForLoadingToSettle(frame);
    if (await foodSafetyPrompt.isVisible().catch(() => false)) {
      return;
    }
    if (!(await draftError.isVisible().catch(() => false))) {
      break;
    }
    await waitForSaved(frame);
  }

  await expect(foodSafetyPrompt).toBeVisible({ timeout: 15_000 });
}

test.describe('Meal Production manual script scenarios', () => {
  test('@smoke Scenario 01 - home page exposes meal production entry points and navigation', async ({ page }) => {
    const frame = await openMealProductionHome(page);

    await expect(frame.getByRole('button', { name: /^Belliard$/ })).toBeVisible();
    await expect(frame.getByRole('button', { name: /^Hub$/ })).toBeVisible();
    await expect(frame.getByRole('button', { name: /^Le Phare$/ })).toBeVisible();
    await expect(frame.getByText('Meal Production Procedure')).toBeVisible();
    await expect(frame.getByText('Hygiene rules')).toBeVisible();
    await expect(frame.getByText(/portions delivered/i).first()).toBeVisible({ timeout: 60_000 });
    await expect(frame.locator('input[type="date"]')).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Last 7 days' })).toBeVisible();
    await expect(frame.getByRole('button', { name: 'Next 7 days' })).toBeVisible();
    const iconCount = await frame.locator('button[title="Edit"], button[title="View"], button[title="Copy"]').count();
    if (iconCount > 0) {
      await expectAnyVisible(frame, ['button[title="Edit"]', 'button[title="View"]', 'button[title="Copy"]']);
    }
  });

  test('@regression Scenario 02 - changing service preserves production date and rebuilds the dinner meal set', async ({
    page
  }) => {
    test.setTimeout(300_000);
    const serviceChangeDate = today();
    const pastDate = (() => {
      const date = new Date(`${serviceChangeDate}T12:00:00Z`);
      date.setUTCDate(date.getUTCDate() - 1);
      return date.toISOString().slice(0, 10);
    })();
    const futureProductionDate = futureDate(4);
    const lunchKey = {
      customerValue: mealProductionFixtures.customerValues.belliard,
      service: mealProductionFixtures.services.lunch,
      date: serviceChangeDate
    };
    const dinnerKey = {
      customerValue: mealProductionFixtures.customerValues.belliard,
      service: mealProductionFixtures.services.dinner,
      date: serviceChangeDate
    };
    const futureDinnerKey = {
      customerValue: mealProductionFixtures.customerValues.belliard,
      service: mealProductionFixtures.services.dinner,
      date: futureProductionDate
    };
    const cleanupFrame = await openMealProductionHome(page);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, lunchKey);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, dinnerKey);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, futureDinnerKey);

    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.belliard);

    try {
      const dateInput = frame.locator('input[aria-label="Date"]').first();
      await expect(frame.getByText('Date is required.')).toBeVisible();
      await dismissAutosaveReminderIfPresent(frame);
      await dateInput.click();
      await dateInput.fill(pastDate);
      await dateInput.dispatchEvent('change');
      await expect(frame.getByText('Past dates are not allowed. Select today or a future date.')).toBeVisible();
      await setProductionDate(frame, futureProductionDate);
      await expect(dateInput).toHaveValue(futureProductionDate);
      await setProductionDate(frame, serviceChangeDate);

      const cookSelect = frame.locator('select').first();
      await cookSelect.selectOption({ index: 1 });
      await expect(cookSelect).toHaveValue('');

      await selectService(frame, mealProductionFixtures.services.lunch);
      await expectMealTypesVisible(frame, [
        mealProductionFixtures.mealTypes.diabetic,
        mealProductionFixtures.mealTypes.vegan,
        mealProductionFixtures.mealTypes.vegetarian
      ]);
      await expectMealTypesHidden(frame, [mealProductionFixtures.mealTypes.standard]);
      const ordered = frame.locator('input[aria-label="Ordered"]');
      await expect(cookSelect).toHaveValue('');
      await ordered.first().fill('12');
      await ordered.first().dispatchEvent('change');
      await expect(ordered.first()).toHaveValue('');
      await expect(frame.getByText('Responsible cook is required.')).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Next' })).toBeDisabled();

      await selectCook(frame, mealProductionFixtures.cooks.aline);
      await fillFirstOrderedPortions(frame, '-2');
      await expect(frame.getByText('Ordered portions must be 0 or more')).toBeVisible();
      await fillFirstOrderedPortions(frame, '2.5');
      await expect(frame.getByText('Enter a whole number')).toBeVisible();
      await fillOrderedPortions(frame, [15, 0, 3]);
      await expectTotalOrdered(frame, 18);
      await expect(frame.getByRole('button', { name: 'Next' })).toBeDisabled();
      await ordered.nth(1).fill('57');
      await ordered.nth(1).dispatchEvent('change');
      await expectTotalOrdered(frame, 75);
      await fillFirstOrderedPortions(frame, '16');
      await expectTotalOrdered(frame, 76);
      await fillFirstOrderedPortions(frame, '15');
      await expectTotalOrdered(frame, 75);

      await selectService(frame, mealProductionFixtures.services.dinner);
      await expectDialogCopy(frame, 'Changing the service will permanently delete any data or photos entered after the service.');
      await expect(frame.getByRole('button', { name: 'Cancel — Keep current service' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Continue — Delete subsequent data' })).toBeVisible();
      await confirmDialog(frame, 'Continue — Delete subsequent data');

      await expect(frame.getByLabel('Date')).toHaveValue(serviceChangeDate);
      await expect(frame.locator('button[title="Dinner"]')).toHaveAttribute('aria-checked', 'true');
      await expectMealTypesVisible(frame, [
        mealProductionFixtures.mealTypes.diabetic,
        mealProductionFixtures.mealTypes.standard,
        mealProductionFixtures.mealTypes.vegan,
        mealProductionFixtures.mealTypes.vegetarian
      ]);

      await selectCook(frame, mealProductionFixtures.cooks.aline);
      await fillOrderedPortions(frame, [15, 57, 3, 3]);
      await expectTotalOrdered(frame, 78);
      await waitForSaved(frame);
      await clickNext(frame);
      await expect
        .poll(
          async () => {
            const bodyText = await frame.locator('body').innerText();
            return bodyText.includes('There is currently no leftover.');
          },
          {
            timeout: 60_000,
            message: 'Expected Leftover bank to show the no-leftover message after changing service to dinner.'
          }
        )
        .toBe(true);
      await expect(frame.getByRole('button', { name: 'Leftover bank' })).toBeVisible();

      await clickNext(frame);
      await waitForLoadingToSettle(frame);
      const productionBody = await frame.locator('body').innerText();
      expect(productionBody).toMatch(/Diabetic\s*\|\s*To cook:\s*15/);
      expect(productionBody).toMatch(/Standard\s*\|\s*To cook:\s*57/);
      expect(productionBody).toMatch(/Vegan\s*\|\s*To cook:\s*3/);
      expect(productionBody).toMatch(/Vegetarian\s*\|\s*To cook:\s*3/);

      await selectFirstAvailableRecipes(frame);
      await waitForSaved(frame);
      await frame.getByRole('button', { name: 'Order' }).click();
      await waitForLoadingToSettle(frame);

      await setProductionDate(frame, futureProductionDate);
      await expectDialogCopy(frame, 'Changing the production date will permanently delete service as well as any data or photos entered after service.');
      await expect(frame.getByRole('button', { name: 'Cancel and keep current production date' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Continue and delete subsequent data.' })).toBeVisible();
      await confirmDialog(frame, 'Continue and delete subsequent data.');
      await expect(dateInput).toHaveValue(futureProductionDate);
      await expect(frame.locator('button[title="Lunch"]')).not.toHaveAttribute('aria-checked', 'true');
      await expect(frame.locator('button[title="Dinner"]')).not.toHaveAttribute('aria-checked', 'true');
      await expect(cookSelect.locator('option:checked')).toHaveText(/Select…/);

      await setProductionDate(frame, serviceChangeDate);
      await clickHome(frame);
      await expectDialogCopy(frame, 'A meal production record can only exist when customer, production date, and service are all filled in.');
      await expect(frame.getByText('Leaving this page now will permanently delete this record and all data and photos already entered.')).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Cancel — Continue editing' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Continue — Delete the record' })).toBeVisible();
      await confirmDialog(frame, 'Continue — Delete the record');
      await waitForLoadingToSettle(frame);
      await expect(frame.getByText('Belliard')).toBeVisible();
      expect(await findDedupConflictRecordId(frame, lunchKey)).toBeNull();
      expect(await findDedupConflictRecordId(frame, dinnerKey)).toBeNull();
      expect(await findDedupConflictRecordId(frame, futureDinnerKey)).toBeNull();
    } finally {
      await cleanupMealProductionRecordBestEffort(page, futureDinnerKey);
      await cleanupMealProductionRecordBestEffort(page, lunchKey);
      await cleanupMealProductionRecordInFrameBestEffort(frame, dinnerKey);
    }
  });

  test('@regression Scenario 03 - Belliard lunch can progress from production through create report', async ({ page }) => {
    test.setTimeout(180_000);
    const lunchKey = {
      customerValue: mealProductionFixtures.customerValues.belliard,
      service: mealProductionFixtures.services.lunch,
      date: today()
    };
    const cleanupFrame = await openMealProductionHome(page);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, lunchKey);

    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.belliard);

    try {
      await setProductionDate(frame, today());
      await selectService(frame, mealProductionFixtures.services.lunch);
      if (await openExistingRecordIfDuplicatePresent(frame)) {
        await frame.getByRole('button', { name: 'Order' }).click();
        await waitForLoadingToSettle(frame);
      }
      await selectCook(frame, mealProductionFixtures.cooks.akkara);
      await fillOrderedPortions(frame, [15, 0, 3, 57]);
      await expectTotalOrdered(frame, 75);

      await clickNext(frame);
      await waitForLoadingToSettle(frame);
      await expect(frame.getByRole('button', { name: 'Leftover bank' })).toBeVisible({ timeout: 15_000 });
      await clickNext(frame);
      await waitForLoadingToSettle(frame);

      await selectRecipes(frame, ['One pot creamy pasta', 'One pot creamy pasta', 'One pot creamy pasta']);

      await openRecipeEditor(frame, 0);
      await expect(frame.getByRole('button', { name: /Back to Production/i })).toBeVisible();
      await frame.getByRole('button', { name: /Back to Production/i }).click();

      await expect(frame.getByRole('button', { name: 'Next' })).toBeDisabled();
      await uploadVisibleFiles(frame, ['ingredient-receipt-1.svg']);
      await expect(frame.getByRole('button', { name: /Open Photos 1\/10|1\/10/ })).toBeVisible({ timeout: 15_000 });
      await waitForSaved(frame);
      await expect(frame.getByRole('alert').filter({ hasText: 'Failed to create draft record.' })).toBeHidden({
        timeout: 15_000
      });
      await advanceToFoodSafetyAfterDraftSave(frame);
      await expect(frame.getByText('Confirm that all pots reached at least 63°C')).toBeVisible({ timeout: 15_000 });
      await checkAllVisibleBoxes(frame, 'All pots ≥63°C');
      await uploadVisibleFiles(frame, ['pot-photo-1.svg', 'pot-photo-2.svg', 'pot-photo-1.svg']);
      await waitForSaved(frame);
      if (!(await frame.getByRole('button', { name: 'Create report' }).isVisible().catch(() => false))) {
        await clickNext(frame);
        await waitForLoadingToSettle(frame);
      }

      const delivered = frame.getByLabel('Delivered Portions');
      await expect(delivered.first()).toHaveValue('15');
      await expect(frame.getByRole('button', { name: 'Create report' })).toBeVisible();
      await frame.getByRole('button', { name: 'Create report' }).click();
      await expect(frame.getByText('Please confirm')).toBeVisible({ timeout: 10_000 });
      await confirmDialog(frame, 'Yes, create final report');
      await waitForLoadingToSettle(frame);
      await expect(frame.getByRole('button', { name: 'Leftovers' })).toBeVisible({ timeout: 60_000 });
    } finally {
      await cleanupMealProductionRecordInFrameBestEffort(frame, lunchKey);
    }
  });

  test('@regression Scenario 12 - recipe ingredient overlay copy and record identity stay visible', async ({ page }) => {
    test.setTimeout(180_000);
    const productionDate = today();
    const orderKey = {
      customerValue: mealProductionFixtures.customerValues.hub,
      service: mealProductionFixtures.services.lunch,
      date: productionDate
    };
    const cleanupFrame = await openMealProductionHome(page);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, orderKey);

    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.hub);

    try {
      await setProductionDate(frame, productionDate);
      await selectService(frame, mealProductionFixtures.services.lunch);
      await selectCook(frame, mealProductionFixtures.cooks.akkara);
      await fillFirstOrderedPortions(frame, '15');

      await clickNext(frame);
      await waitForLoadingToSettle(frame);
      await clickNext(frame);
      await waitForLoadingToSettle(frame);

      await selectFirstAvailableRecipes(frame);
      await openRecipeEditor(frame, 0);

      const recordReference = frame.locator('.ck-record-reference').filter({ hasText: 'HUB' }).filter({ hasText: 'Lunch' }).first();
      await expect(recordReference).toBeVisible();
      const viewHelperFrame = frame.locator('.ck-helper-frame').filter({ hasText: "Review recipe ingredients for today's dish." }).first();
      await expect(viewHelperFrame).toBeVisible();
      await expect(viewHelperFrame).toContainText('Tap to adjust ingredients if needed.');
      await expect(viewHelperFrame.locator('.ck-inline-pencil-icon svg')).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Edit ingredients' })).toBeVisible();

      await frame.getByRole('button', { name: 'Edit ingredients' }).click();
      await expect(
        frame.getByText(
          'Adjust ingredients to match today’s dish. Add, update, or remove ingredients as needed. At least one ingredient must remain.'
        )
      ).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Add ingredients' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Back to View Recipe' })).toBeVisible();
      const editActions = frame.locator('.ck-overlay-detail-edit-actions').first();
      const editHeader = frame.locator('.ck-overlay-detail-edit-layout .ck-line-item-table thead th').first();
      await frame.locator('[data-overlay-scroll-container="true"]').first().evaluate(element => {
        element.scrollTop = 160;
        element.dispatchEvent(new Event('scroll', { bubbles: true }));
      });
      await expect
        .poll(
          async () => {
            const actionsBox = await editActions.boundingBox();
            const headerBox = await editHeader.boundingBox();
            if (!actionsBox || !headerBox) return false;
            return headerBox.y >= actionsBox.y + actionsBox.height - 1;
          },
          {
            timeout: 10_000,
            message: 'Expected ingredient table header to remain visible below sticky edit actions.'
          }
        )
        .toBe(true);

      await frame.getByRole('button', { name: 'Add ingredients' }).click();
      await expect(frame.getByText('Search and select ingredients to adjust today’s dish recipe.')).toBeVisible();
      await expect(frame.getByText('Enter exact ingredient name (example: tomato, not tom).')).toBeVisible();
      await expect(recordReference).toBeVisible();
      await frame.getByRole('button', { name: 'Back', exact: true }).first().click();

      await frame.getByRole('button', { name: 'Back to View Recipe' }).click();
      await expect(viewHelperFrame).toBeVisible();
      await expect(viewHelperFrame.locator('.ck-inline-pencil-icon svg')).toBeVisible();
      await frame.getByRole('button', { name: /Back to Production/i }).click();
    } finally {
      await cleanupMealProductionRecordInFrameBestEffort(frame, orderKey);
    }
  });
  pendingScenario('04', 'leftovers confirmations, label dialog and return to home');
  pendingScenario('05', 'Hub lunch leftover bank assignment and to-cook adjustments');
  pendingScenario('06', 'customer change destructive reset and applicability filtering');

  test('@regression Scenario 07 - duplicate Le Phare records offer change or open existing record', async ({ page }) => {
    const homeFrame = await openMealProductionHome(page);
    const duplicateKey = {
      customerValue: mealProductionFixtures.customerValues.lePhare,
      service: mealProductionFixtures.services.lunch,
      date: futureDate(45)
    };
    await cleanupMealProductionRecordInFrameBestEffort(homeFrame, duplicateKey);
    const seededRecord = await createMealProductionDraftRecord(homeFrame, duplicateKey);

    try {
      const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.lePhare);
      await setProductionDate(frame, duplicateKey.date);
      await selectService(frame, duplicateKey.service);

      await expectDialogCopy(frame, 'Creating duplicate record for the same customer, service and date is not allowed.');
      await expect(frame.getByRole('button', { name: 'Change customer, service or date' })).toBeVisible();
      await expect(frame.getByRole('button', { name: 'Open existing record' })).toBeVisible();

      await chooseDuplicateChangeOption(frame);
      await expect(frame.getByText('Customer is required.')).toBeVisible();
      await expect(frame.getByLabel('Date')).toHaveValue('');
      await expect(frame.locator(`button[title="${duplicateKey.service}"]`)).not.toHaveAttribute('aria-checked', 'true');
    } finally {
      await cleanupMealProductionRecordBestEffort(page, seededRecord.key);
    }
  });

  test('@regression Scenario 08 - future-dated Hub planning hides expired leftovers and execution-only capture', async ({
    page
  }) => {
    const productionDate = futureDate(4);
    const orderKey = {
      customerValue: mealProductionFixtures.customerValues.hub,
      service: mealProductionFixtures.services.lunch,
      date: productionDate
    };
    const cleanupFrame = await openMealProductionHome(page);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, orderKey);

    const frame = await prepareHubLunchOrderForDate(page, productionDate);

    try {
      await selectCook(frame, mealProductionFixtures.cooks.akkara);
      await fillFirstOrderedPortions(frame, '450');
      await clickNext(frame);
      await expect(frame.getByText('There is currently no leftover.')).toBeVisible({ timeout: 15_000 });
      await clickNext(frame);
      await waitForLoadingToSettle(frame);
      await selectRecipes(frame, ['Adassi']);
      await waitForSaved(frame);
      const notice = frame.getByText('Ingredients receipt photo, food safety and portioning can only be recorded on the day of production.');
      await expect(notice).toBeVisible({ timeout: 15_000 });
      await expect(frame.getByRole('button', { name: 'Next' })).toBeDisabled();
    } finally {
      await cleanupMealProductionRecordInFrameBestEffort(frame, orderKey);
    }
  });

  test('@regression Scenario 09 - ready for production lock and summary unlock flow', async ({ page }) => {
    test.skip(!e2eEnv.adminEnabled, 'Unlock for Editing is only visible in admin mode.');
    test.setTimeout(180_000);
    const productionDate = futureDate(31);
    const orderKey = {
      customerValue: mealProductionFixtures.customerValues.lePhare,
      service: mealProductionFixtures.services.lunch,
      date: productionDate
    };
    const cleanupFrame = await openMealProductionHome(page);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, orderKey);

    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.lePhare);

    try {
      await setProductionDate(frame, productionDate);
      await selectService(frame, mealProductionFixtures.services.lunch);
      await selectCook(frame, mealProductionFixtures.cooks.aline);
      await fillFirstOrderedPortions(frame, '50');

      const readyButton = frame.getByRole('button', { name: /Lock Order information/i });
      await expect(readyButton).toBeVisible({ timeout: 15_000 });
      await readyButton.click();
      await expect(frame.getByRole('button', { name: 'Yes, lock order details' })).toBeVisible({ timeout: 10_000 });
      await confirmDialog(frame, 'Yes, lock order details');
      await waitForLoadingToSettle(frame);
      await waitForSaved(frame);

      await expect(frame.getByText('In progress')).toBeVisible({ timeout: 15_000 });
      await expect(readyButton).toBeHidden({ timeout: 10_000 });
      await frame.getByRole('button', { name: /^Order$/ }).click();
      await waitForLoadingToSettle(frame);
      await expect(frame.locator('input[aria-label="Date"]').first()).toBeDisabled();
      await expect(frame.locator('input[aria-label="Ordered"]').first()).toBeDisabled();

      await openSummary(frame);
      const unlockButton = frame.getByRole('button', { name: /Unlock for Editing/i });
      await expect(unlockButton).toBeVisible({ timeout: 15_000 });
      await unlockButton.click();
      await expect(frame.getByRole('button', { name: 'Yes, unlock and allow changes' })).toBeVisible({ timeout: 10_000 });
      await confirmDialog(frame, 'Yes, unlock and allow changes');
      await waitForLoadingToSettle(frame);
      await waitForSaved(frame);

      await expect(frame.getByText('In progress')).toBeVisible({ timeout: 15_000 });
      await frame.getByRole('button', { name: /^Order$/ }).click();
      await waitForLoadingToSettle(frame);
      await expect(frame.locator('input[aria-label="Date"]').first()).toBeEnabled();
      await expect(frame.locator('input[aria-label="Ordered"]').first()).toBeEnabled();
      await expect(readyButton).toBeVisible({ timeout: 15_000 });
    } finally {
      await cleanupMealProductionRecordInFrameBestEffort(frame, orderKey);
    }
  });

  test('@smoke Scenario 10 - Belliard Sunday lunch includes Standard', async ({ page }) => {
    const productionDate = nextSunday();
    const orderKey = {
      customerValue: mealProductionFixtures.customerValues.belliard,
      service: mealProductionFixtures.services.lunch,
      date: productionDate
    };
    const cleanupFrame = await openMealProductionHome(page);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, orderKey);

    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.belliard);

    try {
      await setProductionDate(frame, productionDate);
      await selectService(frame, mealProductionFixtures.services.lunch);

      await expectMealTypesVisible(frame, [
        mealProductionFixtures.mealTypes.diabetic,
        mealProductionFixtures.mealTypes.standard,
        mealProductionFixtures.mealTypes.vegan,
        mealProductionFixtures.mealTypes.vegetarian
      ]);
    } finally {
      await cleanupMealProductionRecordInFrameBestEffort(frame, orderKey);
    }
  });

  test('@smoke Scenario 11 - Le Phare meal types stay limited to Vegetarian', async ({ page }) => {
    const orderKey = {
      customerValue: mealProductionFixtures.customerValues.lePhare,
      service: mealProductionFixtures.services.lunch,
      date: today()
    };
    const cleanupFrame = await openMealProductionHome(page);
    await cleanupMealProductionRecordInFrameBestEffort(cleanupFrame, orderKey);

    const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.lePhare);

    try {
      await setProductionDate(frame, today());
      await selectService(frame, mealProductionFixtures.services.lunch);

      await expectMealTypesVisible(frame, [mealProductionFixtures.mealTypes.vegetarian]);
      await expectMealTypesHidden(frame, [
        mealProductionFixtures.mealTypes.diabetic,
        mealProductionFixtures.mealTypes.standard,
        mealProductionFixtures.mealTypes.vegan
      ]);
    } finally {
      await cleanupMealProductionRecordInFrameBestEffort(frame, orderKey);
    }
  });

  pendingScenario('12', 'production helper and leftover summary details');
  pendingScenario('13', 'reheat leftovers reduce to-cook quantities and summary ingredients');
  pendingScenario('14', 'changing recipe refreshes ingredients and clears photo evidence');
  pendingScenario('15', 'production blocks next without all recipes and ingredient receipt photos');
  pendingScenario('16', 'food safety confirmation and per-pot photo requirements');
  pendingScenario('17', 'portioning defaults to ordered portions and disallows under-delivery');
  pendingScenario('18', 'summary renders record, leftovers and ingredients details');
  pendingScenario('19', 'final report renders expected production and leftovers content');
  pendingScenario('20', 'future-dated records block execution data capture after production');
  pendingScenario('21', 'changing production date after portioning prompts destructive reset');
  pendingScenario('22', 'customer, production date and service changes delete subsequent data');
  pendingScenario('23', 'edited Belliard leftovers are available to future records');
  pendingScenario('24', 'Hub dinner leftovers are available to tomorrow Hub lunch');
  pendingScenario('25', 'completed Hub record can be copied into a future production plan');
});

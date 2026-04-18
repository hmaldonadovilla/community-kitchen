import path from 'node:path';

import { expect, type Frame, type Locator, type Page } from 'playwright/test';

import { e2eEnv } from '../fixtures/env';
import { mealProductionFixtures } from '../fixtures/mealProduction';
import { today, uniqueFutureDate } from './dates';
import { runAppsScript, runAppsScriptWithTimeout } from './appsScript';
import { openMealProductionHome } from './navigation';

const DUPLICATE_CHECK_COPY = 'Checking duplicates…';

type MealProductionRecordKey = {
  customerValue: string;
  service: string;
  date: string;
};

type DuplicateOpenArgs = {
  customerPreset: string;
  customerValue: string;
  service: string;
  date: string;
};

type SaveSubmissionResult = {
  success?: boolean;
  message?: string;
  meta?: {
    id?: string;
  };
};

type DedupConflictResult = {
  success?: boolean;
  conflict?: {
    existingRecordId?: string;
  };
};

export async function dismissIntroIfPresent(frame: Frame): Promise<void> {
  const gotIt = frame.getByRole('button', { name: 'Got it' });
  if (await gotIt.isVisible().catch(() => false)) {
    await gotIt.click();
    await expect(gotIt).toBeHidden({ timeout: 10_000 });
  }
}

export async function waitForDuplicateCheckToFinish(frame: Frame): Promise<void> {
  await expect
    .poll(
      async () => {
        const bodyText = await frame.locator('body').innerText();
        return !bodyText.includes(DUPLICATE_CHECK_COPY);
      },
      {
        timeout: 15_000,
        message: 'Expected duplicate checking state to settle before continuing.'
      }
    )
    .toBe(true);
}

export async function openNewOrderFromPreset(page: Page, customer: string): Promise<Frame> {
  const frame = await openMealProductionHome(page);
  await dismissIntroIfPresent(frame);
  await frame.getByRole('button', { name: customer }).click();
  await expect(frame.getByRole('button', { name: 'Order' })).toBeVisible({ timeout: 10_000 });
  await dismissIntroIfPresent(frame);
  await waitForDuplicateCheckToFinish(frame);
  return frame;
}

export async function setProductionDate(frame: Frame, dateValue = today()): Promise<void> {
  const input = frame.locator('input[aria-label="Date"]').first();
  await input.fill(dateValue);
  await input.dispatchEvent('change');
  await waitForDuplicateCheckToFinish(frame);
}

export async function selectService(frame: Frame, service: string): Promise<void> {
  await frame.locator(`button[title="${service}"]`).click();
  await waitForDuplicateCheckToFinish(frame);
}

export async function selectCook(frame: Frame, cookIndex: number): Promise<void> {
  await frame.locator('select').nth(1).selectOption({ index: cookIndex });
}

export async function selectFirstCook(frame: Frame): Promise<void> {
  await selectCook(frame, mealProductionFixtures.cooks.akkara);
}

export async function getOrderBodyText(frame: Frame): Promise<string> {
  return frame.locator('body').innerText();
}

export async function fillFirstOrderedPortions(frame: Frame, value: string): Promise<void> {
  const ordered = frame.locator('input[aria-label="Ordered"]').first();
  await ordered.fill(value);
  await ordered.dispatchEvent('change');
  await waitForDuplicateCheckToFinish(frame);
}

export async function fillOrderedPortions(frame: Frame, values: Array<string | number>): Promise<void> {
  const ordered = frame.locator('input[aria-label="Ordered"]');

  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    await ordered.nth(index).fill(String(value));
    await ordered.nth(index).dispatchEvent('change');
  }

  await waitForDuplicateCheckToFinish(frame);
}

export async function clickNext(frame: Frame): Promise<void> {
  await frame.getByRole('button', { name: 'Next' }).click();
}

export async function clickBack(frame: Frame): Promise<void> {
  await frame.getByRole('button', { name: 'Back' }).click();
}

export async function clickHome(frame: Frame): Promise<void> {
  await frame.getByRole('button', { name: 'Home' }).click();
}

export async function waitForLoadingToSettle(frame: Frame): Promise<void> {
  const loading = frame.getByText(/Loading…|Loading\.\.\./);
  if (await loading.first().isVisible().catch(() => false)) {
    await expect(loading.first()).toBeHidden({ timeout: 30_000 });
  }
}

export async function waitForSaved(frame: Frame): Promise<void> {
  await expect
    .poll(
      async () => {
        const bodyText = await frame.locator('body').innerText().catch(() => '');
        const hasUnsaved = bodyText.includes('Unsaved changes');
        const hasSaving = bodyText.includes('Saving…') || bodyText.includes('Saving...');
        const hasSaved = bodyText.includes('Saved');
        return hasSaved && !hasUnsaved && !hasSaving;
      },
      {
        timeout: 30_000,
        message: 'Expected form save state to settle to Saved.'
      }
    )
    .toBe(true);
}

export async function expectTotalOrdered(frame: Frame, total: number): Promise<void> {
  await expect
    .poll(() => getOrderBodyText(frame), {
      timeout: 10_000,
      message: `Expected total ordered to resolve to ${total}.`
    })
    .toContain(`Total\t${total}`);
}

export async function openDuplicateRecord(frame: Frame): Promise<void> {
  await frame.getByRole('button', { name: 'Open existing record' }).click();
  await waitForDuplicateCheckToFinish(frame);
}

export async function openExistingRecordFromDuplicate(page: Page, args: DuplicateOpenArgs): Promise<Frame> {
  const frame = await openNewOrderFromPreset(page, args.customerPreset);
  await setProductionDate(frame, args.date);
  await selectService(frame, args.service);
  await expectDialogCopy(frame, 'Creating duplicate record for the same customer, service and date is not allowed.');
  await openDuplicateRecord(frame);
  await waitForLoadingToSettle(frame);
  return frame;
}

export async function chooseDuplicateChangeOption(frame: Frame): Promise<void> {
  await frame.getByRole('button', { name: 'Change customer, service or date' }).click();
  await expect(frame.getByRole('button', { name: 'Open existing record' })).toBeHidden({ timeout: 10_000 });
}

export async function openExistingRecordIfDuplicatePresent(frame: Frame): Promise<boolean> {
  const hasDuplicateDialog = await expect
    .poll(
      async () => {
        const bodyText = await frame.locator('body').innerText().catch(() => '');
        return bodyText.includes('Creating duplicate record for the same customer, service and date is not allowed.');
      },
      { timeout: 3_000 }
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);

  if (!hasDuplicateDialog) {
    return false;
  }
  await openDuplicateRecord(frame);
  await waitForLoadingToSettle(frame);
  return true;
}

export async function openSummary(frame: Frame): Promise<void> {
  await frame.getByRole('button', { name: 'Summary' }).click();
}

export async function confirmDialog(frame: Frame, buttonName: string): Promise<void> {
  await frame.getByRole('button', { name: buttonName }).click();
}

export async function expectDialogCopy(frame: Frame, copy: string): Promise<void> {
  await expect(frame.getByText(copy)).toBeVisible({ timeout: 10_000 });
}

export async function prepareMinimalHubLunchOrder(page: Page): Promise<Frame> {
  return prepareHubLunchOrderForDate(page, today());
}

export async function prepareHubLunchOrderForDate(page: Page, productionDate: string): Promise<Frame> {
  const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.hub);
  await setProductionDate(frame, productionDate);
  await selectService(frame, mealProductionFixtures.services.lunch);
  await selectFirstCook(frame);
  return frame;
}

function buildMealProductionKeyPayload(args: MealProductionRecordKey): Record<string, unknown> {
  const payloadFields = {
    [mealProductionFixtures.fieldIds.customer]: args.customerValue,
    [mealProductionFixtures.fieldIds.service]: args.service,
    [mealProductionFixtures.fieldIds.productionDate]: args.date
  };

  return {
    formKey: e2eEnv.mealProductionFormKey,
    language: 'EN',
    values: payloadFields,
    ...payloadFields
  };
}

export function buildUniqueHubLunchKey(seed = 0): MealProductionRecordKey {
  return {
    customerValue: mealProductionFixtures.customerValues.hub,
    service: mealProductionFixtures.services.lunch,
    date: uniqueFutureDate(seed)
  };
}

export async function createMealProductionDraftRecord(
  frame: Frame,
  args: MealProductionRecordKey
): Promise<{ id: string; key: MealProductionRecordKey }> {
  const payload = {
    ...buildMealProductionKeyPayload(args),
    __ckSaveMode: 'draft',
    __ckStatus: 'In progress',
    __ckCreateFlow: '1'
  };

  const result = await runAppsScript<SaveSubmissionResult>(frame, 'saveSubmissionWithId', payload);
  const recordId = (result?.meta?.id || '').toString().trim();
  if (!result?.success || !recordId) {
    throw new Error(`Failed to create seeded meal production record. ${result?.message || ''}`.trim());
  }

  return { id: recordId, key: args };
}

export async function expectDedupConflictForKey(frame: Frame, args: MealProductionRecordKey): Promise<void> {
  const result = await runAppsScript<DedupConflictResult>(frame, 'checkDedupConflict', buildMealProductionKeyPayload(args));

  expect(result?.success).toBe(true);
  expect((result?.conflict?.existingRecordId || '').toString().trim()).not.toBe('');
}

export async function findDedupConflictRecordId(frame: Frame, args: MealProductionRecordKey): Promise<string | null> {
  const result = await runAppsScript<DedupConflictResult>(frame, 'checkDedupConflict', buildMealProductionKeyPayload(args));
  if (!result?.success) {
    throw new Error(`Dedup conflict check failed for ${args.customerValue} ${args.service} ${args.date}.`);
  }
  const recordId = (result?.conflict?.existingRecordId || '').toString().trim();
  return recordId || null;
}

export async function purgeMealProductionRecordIfPresent(frame: Frame, args: MealProductionRecordKey): Promise<boolean> {
  const recordId = await findDedupConflictRecordId(frame, args);
  if (!recordId) return false;
  await deleteMealProductionRecord(frame, recordId, args);
  return true;
}

export async function cleanupMealProductionRecordBestEffort(page: Page, args: MealProductionRecordKey): Promise<boolean> {
  let cleanupPage: Page | null = null;
  try {
    cleanupPage = await page.context().newPage();
    const frame = await openMealProductionHome(cleanupPage);
    await cleanupPage.waitForTimeout(1_000);
    return await cleanupMealProductionRecordInFrameBestEffort(frame, args);
  } catch {
    return false;
  } finally {
    await cleanupPage?.close().catch(() => undefined);
  }
}

export async function cleanupMealProductionRecordInFrameBestEffort(
  frame: Frame,
  args: MealProductionRecordKey
): Promise<boolean> {
  try {
    const recordId = await runAppsScriptWithTimeout<DedupConflictResult>(
      frame,
      'checkDedupConflict',
      8_000,
      buildMealProductionKeyPayload(args)
    )
      .then(result => {
        if (!result?.success) return '';
        return (result?.conflict?.existingRecordId || '').toString().trim();
      })
      .catch(() => '');

    if (!recordId) return false;

    const result = await runAppsScriptWithTimeout<SaveSubmissionResult>(frame, 'saveSubmissionWithId', 8_000, {
      formKey: e2eEnv.mealProductionFormKey,
      language: 'EN',
      __ckDeleteRecordId: recordId
    }).catch(() => undefined);

    return Boolean(result?.success);
  } catch {
    return false;
  }
}

export async function deleteMealProductionRecord(frame: Frame, recordId: string, args: MealProductionRecordKey): Promise<void> {
  const payload = {
    formKey: e2eEnv.mealProductionFormKey,
    language: 'EN',
    __ckDeleteRecordId: recordId
  };

  const result = await runAppsScript<SaveSubmissionResult>(frame, 'saveSubmissionWithId', payload);
  if (!result?.success) {
    throw new Error(`Failed to delete seeded meal production record ${recordId}. ${result?.message || ''}`.trim());
  }

  const dedupResult = await runAppsScript<{ success?: boolean; conflict?: { existingRecordId?: string } }>(
    frame,
    'checkDedupConflict',
    buildMealProductionKeyPayload(args)
  );

  expect(dedupResult?.success).toBe(true);
  expect((dedupResult?.conflict?.existingRecordId || '').toString().trim()).toBe('');
}

export async function expectMealTypesVisible(frame: Frame, mealTypes: string[]): Promise<void> {
  const bodyText = await getOrderBodyText(frame);
  for (const mealType of mealTypes) {
    expect(bodyText).toContain(mealType);
  }
}

export async function expectMealTypesHidden(frame: Frame, mealTypes: string[]): Promise<void> {
  const bodyText = await getOrderBodyText(frame);
  for (const mealType of mealTypes) {
    expect(bodyText).not.toContain(mealType);
  }
}

export async function selectRecipe(frame: Frame, index: number, recipeName: string): Promise<void> {
  const recipeSelects = frame.locator('select').filter({
    has: frame.locator('option').filter({ hasText: 'Select…' })
  });
  await recipeSelects.nth(index).selectOption({ label: recipeName });
}

export async function selectRecipes(frame: Frame, recipeNames: string[]): Promise<void> {
  for (let index = 0; index < recipeNames.length; index += 1) {
    await selectRecipe(frame, index, recipeNames[index]);
  }
}

export async function selectFirstAvailableRecipes(frame: Frame): Promise<void> {
  const recipeSelects = frame.locator('select').filter({
    has: frame.locator('option').filter({ hasText: 'Select…' })
  });
  const count = await recipeSelects.count();
  for (let index = 0; index < count; index += 1) {
    const selected = await recipeSelects
      .nth(index)
      .evaluate((el: HTMLSelectElement) => {
        const options = Array.from(el.options).map(option => ({
          value: option.value,
          label: option.label
        }));
        const firstReal = options.find(option => option.label.trim() !== 'Select…' && option.value.trim() !== '');
        return firstReal?.label || '';
      })
      .catch(() => '');

    if (!selected) {
      throw new Error(`No selectable recipe option found for recipe row ${index}.`);
    }
    await recipeSelects.nth(index).selectOption({ label: selected });
  }
}

export async function openRecipeEditor(frame: Frame, index: number): Promise<void> {
  await frame.getByRole('button', { name: 'View/Edit' }).nth(index).click();
}

export async function getAttachableFileInputs(frame: Frame): Promise<Locator[]> {
  const all = frame.locator('input[type="file"]');
  const count = await all.count();
  const out: Locator[] = [];
  for (let index = 0; index < count; index += 1) {
    const candidate = all.nth(index);
    const isDisabled = await candidate.evaluate((el: HTMLInputElement) => el.disabled).catch(() => true);
    if (isDisabled) continue;
    const isFileInput = await candidate
      .evaluate((el: HTMLInputElement) => {
        return el.type === 'file';
      })
      .catch(() => false);
    if (isFileInput) out.push(candidate);
  }
  return out;
}

export async function uploadVisibleFiles(frame: Frame, uploadNames: string[]): Promise<void> {
  let fileInputs = await getAttachableFileInputs(frame);
  if (!fileInputs.length) {
    const addButtons = frame.getByRole('button', { name: /Add photo/i });
    const buttonCount = await addButtons.count();
    for (let index = 0; index < buttonCount; index += 1) {
      const button = addButtons.nth(index);
      if (await button.isVisible().catch(() => false)) {
        await button.click();
        await frame.page().waitForTimeout(250);
      }
    }
    fileInputs = await getAttachableFileInputs(frame);
  }
  const resolved = uploadNames.map(name => path.resolve(__dirname, '..', 'data', 'uploads', name));
  const limit = Math.min(fileInputs.length, resolved.length);
  for (let index = 0; index < limit; index += 1) {
    await fileInputs[index].setInputFiles(resolved[index]);
  }
}

export async function checkAllVisibleBoxes(frame: Frame, label: string): Promise<void> {
  const boxes = frame.getByLabel(label);
  const count = await boxes.count();
  for (let index = 0; index < count; index += 1) {
    const box = boxes.nth(index);
    if ((await box.isVisible().catch(() => false)) && !(await box.isChecked().catch(() => false))) {
      await box.scrollIntoViewIfNeeded().catch(() => undefined);
      await box.click({ force: true }).catch(() => undefined);

      if (!(await box.isChecked().catch(() => false))) {
        await box
          .evaluate((el: HTMLInputElement) => {
            el.checked = true;
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          })
          .catch(() => undefined);
      }

      await expect(box).toBeChecked({ timeout: 5_000 });
    }
  }
}

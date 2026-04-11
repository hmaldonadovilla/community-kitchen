import { expect, type Frame, type Page } from 'playwright/test';

import { e2eEnv } from '../fixtures/env';
import { mealProductionFixtures } from '../fixtures/mealProduction';
import { today, uniqueFutureDate } from './dates';
import { runAppsScript } from './appsScript';
import { openMealProductionHome } from './navigation';

const DUPLICATE_CHECK_COPY = 'Checking duplicates…';

type MealProductionRecordKey = {
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
  await expect(frame.getByText('Order', { exact: false })).toBeVisible({ timeout: 10_000 });
  await dismissIntroIfPresent(frame);
  await waitForDuplicateCheckToFinish(frame);
  return frame;
}

export async function setProductionDate(frame: Frame, dateValue = today()): Promise<void> {
  const input = frame.getByLabel('Date');
  await input.fill(dateValue);
  await input.dispatchEvent('change');
  await waitForDuplicateCheckToFinish(frame);
}

export async function selectService(frame: Frame, service: string): Promise<void> {
  await frame.locator(`button[title="${service}"]`).click();
  await waitForDuplicateCheckToFinish(frame);
}

export async function selectFirstCook(frame: Frame): Promise<void> {
  await frame.locator('select').nth(1).selectOption({ index: mealProductionFixtures.cooks.akkara });
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

export async function chooseDuplicateChangeOption(frame: Frame): Promise<void> {
  await frame.getByRole('button', { name: 'Change customer, service or date' }).click();
  await expect(frame.getByRole('button', { name: 'Open existing record' })).toBeHidden({ timeout: 10_000 });
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
  const result = await runAppsScript<{ success?: boolean; conflict?: { existingRecordId?: string } }>(
    frame,
    'checkDedupConflict',
    buildMealProductionKeyPayload(args)
  );

  expect(result?.success).toBe(true);
  expect((result?.conflict?.existingRecordId || '').toString().trim()).not.toBe('');
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

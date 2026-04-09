import { expect, type Frame, type Page } from 'playwright/test';

import { mealProductionFixtures } from '../fixtures/mealProduction';
import { today } from './dates';
import { openMealProductionHome } from './navigation';

export async function dismissIntroIfPresent(frame: Frame): Promise<void> {
  const gotIt = frame.getByRole('button', { name: 'Got it' });
  if (await gotIt.isVisible().catch(() => false)) {
    await gotIt.click();
    await expect(gotIt).toBeHidden({ timeout: 10_000 });
  }
}

export async function openNewOrderFromPreset(page: Page, customer: string): Promise<Frame> {
  const frame = await openMealProductionHome(page);
  await dismissIntroIfPresent(frame);
  await frame.getByRole('button', { name: customer }).click();
  await expect(frame.getByText('1. Order', { exact: false })).toBeVisible({ timeout: 10_000 });
  await dismissIntroIfPresent(frame);
  return frame;
}

export async function setProductionDate(frame: Frame, dateValue = today()): Promise<void> {
  const input = frame.getByLabel('Date');
  await input.fill(dateValue);
  await input.dispatchEvent('change');
}

export async function selectService(frame: Frame, service: string): Promise<void> {
  await frame.locator(`button[title="${service}"]`).click();
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
}

export async function prepareMinimalHubLunchOrder(page: Page): Promise<Frame> {
  const frame = await openNewOrderFromPreset(page, mealProductionFixtures.customers.hub);
  await setProductionDate(frame);
  await selectService(frame, mealProductionFixtures.services.lunch);
  await selectFirstCook(frame);
  return frame;
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

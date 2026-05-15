import { expect, test, type Frame, type Page } from 'playwright/test';

import { buildFormUrl, e2eEnv } from '../fixtures/env';
import { displayDate, today } from '../helpers/dates';
import { applyMobileThrottling } from '../helpers/throttling';

async function waitForFormFrame(page: Page, titleText: string, timeoutMs = 90_000): Promise<Frame> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const frame = page.frames().find(candidate => candidate.name() === 'userHtmlFrame') || page.mainFrame();
    try {
      await frame.waitForSelector('body', { timeout: 1_000 });
      const bodyText = await frame.locator('body').innerText().catch(() => '');
      if (bodyText.includes(titleText)) {
        return frame;
      }
    } catch {
      // Keep polling until the app iframe is ready.
    }
    await page.waitForTimeout(500);
  }

  throw new Error(`Timed out waiting for ${titleText} home frame.`);
}

async function openFormHome(page: Page, formKey: string, titleText: string): Promise<Frame> {
  await applyMobileThrottling(page.context(), page, e2eEnv.mobilePreset);
  await page.goto(buildFormUrl(formKey), {
    waitUntil: 'domcontentloaded',
    timeout: 120_000
  });
  return waitForFormFrame(page, titleText);
}

test.describe('Date-mode home bootstrap', () => {
  test('@smoke meal production home bootstraps the configured search date', async ({ page }) => {
    const frame = await openFormHome(page, 'Config: Meal Production', 'Meal Production');
    const expectedIsoDate = today();
    const expectedDisplayDate = displayDate(expectedIsoDate);

    await expect(frame.locator('input[aria-label="Filter by date"]')).toHaveValue(expectedIsoDate);
    await expect(frame.getByText(`${expectedDisplayDate} Meal Productions`)).toBeVisible({ timeout: 60_000 });
    await expect
      .poll(async () => (await frame.locator('table tbody tr').count()) > 0, {
        timeout: 60_000,
        message: 'Expected meal production home rows for the configured search date.'
      })
      .toBe(true);

    await frame.getByRole('button', { name: 'Last 7 days' }).click();
    await expect(frame.getByText('Last 7 days activities')).toBeVisible({ timeout: 10_000 });
  });

  test('@smoke checklist home stays on the first recent-activity page', async ({ page }) => {
    const frame = await openFormHome(page, 'Config: Checklist', 'Storage & cleaning checks');

    await expect(frame.locator('input[aria-label="Filter by date"]')).toHaveValue('');
    await expect(frame.getByText('Recent activity')).toBeVisible();
    await expect
      .poll(() => frame.locator('table tbody tr').count(), {
        timeout: 60_000,
        message: 'Expected checklist home to render exactly the first 7 recent records.'
      })
      .toBe(7);
  });
});

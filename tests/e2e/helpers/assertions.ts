import { expect, type Frame } from 'playwright/test';

export async function isAnyVisible(frame: Frame, selectors: string[]): Promise<boolean> {
  for (const selector of selectors) {
    if (await frame.locator(selector).first().isVisible().catch(() => false)) {
      return true;
    }
  }
  return false;
}

export async function expectAnyVisible(frame: Frame, selectors: string[], timeoutMs = 10_000): Promise<void> {
  await expect
    .poll(async () => isAnyVisible(frame, selectors), {
      timeout: timeoutMs,
      message: `Expected one of these selectors to become visible: ${selectors.join(', ')}`
    })
    .toBe(true);
}

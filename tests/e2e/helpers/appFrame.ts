import type { Frame, Page } from 'playwright/test';

import { expectAnyVisible, isAnyVisible } from './assertions';

const APP_FRAME_MARKERS = [
  'button:has-text("View")',
  'button[title="View"]',
  'button[aria-label="View"]',
  'text=Meal Productions',
  'text=Last 7 days',
  'button:has-text("Open menu")',
  '[aria-label="Open menu"]',
  'text=Loading…',
  'text=Loading...'
];

const HOME_READY_MARKERS = [
  'button:has-text("View")',
  'button[title="View"]',
  'button[aria-label="View"]',
  'button:has-text("Copy")',
  'table button',
  'text=Meal Productions',
  'text=Last 7 days'
];

export async function frameLooksLikeApp(frame: Frame): Promise<boolean> {
  return isAnyVisible(frame, APP_FRAME_MARKERS);
}

export async function waitForAppFrame(page: Page, timeoutMs = 60_000): Promise<Frame> {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    const namedFrame = page.frames().find(frame => frame.name() === 'userHtmlFrame');
    if (namedFrame) {
      try {
        await namedFrame.waitForSelector('body', { timeout: 500 });
        if (await frameLooksLikeApp(namedFrame)) {
          return namedFrame;
        }
      } catch {
        // Fall through to the generic scan while the iframe is still warming up.
      }
    }

    const main = page.mainFrame();
    const frames = page.frames().sort((a, b) => {
      if (a === main) return 1;
      if (b === main) return -1;
      return b.url().length - a.url().length;
    });

    for (const candidate of frames) {
      try {
        await candidate.waitForSelector('body', { timeout: 500 });
        if (await frameLooksLikeApp(candidate)) {
          return candidate;
        }
      } catch {
        // Keep scanning frames until the app iframe is ready.
      }
    }

    await page.waitForTimeout(300);
  }

  throw new Error('Timed out waiting for app iframe.');
}

export async function waitForHomeReady(frame: Frame, timeoutMs = 90_000): Promise<void> {
  await expectAnyVisible(frame, HOME_READY_MARKERS, timeoutMs);
}

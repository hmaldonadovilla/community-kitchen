import { expect, test } from 'playwright/test';

import { buildFormUrl } from '../fixtures/env';
import { openMealProductionHome } from '../helpers/navigation';

test.describe('Meal Production regression scaffolding', () => {
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
});

# E2E Automation

This directory contains the Playwright-based frontend regression framework for staging verification.

## Runtime inputs

- `E2E_BASE_URL`
- `E2E_FORM_KEY_MEAL_PRODUCTION`
- `E2E_MOBILE_PRESET`
- `E2E_ADMIN_ENABLED`
- `E2E_HEADLESS`

Default form key:

- `Config: Meal Production`

Default mobile preset:

- `mobile-4g`

The mobile viewport, locale, timezone, and network throttling are aligned with `scripts/performance/scenario-runner.js` through the shared profile module in `scripts/performance/playwrightMobileProfile.js`.

## Commands

```bash
npm run test:e2e -- --list
E2E_BASE_URL="https://script.google.com/macros/s/<deployment>/exec" npm run test:e2e:smoke
E2E_BASE_URL="https://script.google.com/macros/s/<deployment>/exec" npm run test:e2e:regression -- --project=chromium-mobile
E2E_BASE_URL="https://script.google.com/macros/s/<deployment>/exec" npm run test:e2e:nightly
```

## Notes

- The checked-in suite now separates fast staging smoke coverage from broader `@regression` coverage.
- `npm run test:e2e:nightly` is intended for non-blocking Chromium, Firefox, and WebKit runs against staging.
- Business scenario expansion should follow the mapping in `docs/test-automation/automation-backlog.md`.

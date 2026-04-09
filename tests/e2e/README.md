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
```

## Notes

- The current checked-in specs are the first staging smoke checks and framework scaffolding.
- Business scenario expansion should follow the mapping in `docs/test-automation/automation-backlog.md`.

# E2E Automation

This directory contains the Playwright-based frontend regression framework for staging verification.
The Meal Production suite mirrors the workbook at:

- `/Users/a57321/Library/CloudStorage/OneDrive-Personal/Que et Moi/community-kitchen/feedback/CK Meal Production - Updated Test scenari.xlsx`

## Runtime inputs

- `.env` is loaded automatically for local runs.
- Shell-exported variables still win over `.env`.
- Optional `.env.<env>` overrides are also supported when `E2E_ENV`, `CK_CONFIG_ENV`, `CK_ENV`, or `DEPLOY_ENV` is set.

- `E2E_BASE_URL`
- `E2E_FORM_KEY_MEAL_PRODUCTION`
- `E2E_MOBILE_PRESET`
- `E2E_ADMIN_ENABLED`
- `E2E_HEADLESS`
- `E2E_CAPTURE_SUCCESS_ARTIFACTS`
- `E2E_PROJECT`
- `E2E_PROJECTS`

Default form key:

- `Config: Meal Production`

Default mobile preset:

- `mobile-4g`

The mobile viewport, locale, timezone, and network throttling are aligned with `scripts/performance/scenario-runner.js` through the shared profile module in `scripts/performance/playwrightMobileProfile.js`.

Example `.env`:

```bash
E2E_BASE_URL="https://script.google.com/macros/s/<deployment-id>/exec"
E2E_CAPTURE_SUCCESS_ARTIFACTS=1
E2E_PROJECT=chromium-mobile
E2E_HEADLESS=1
```

## Commands

```bash
npm run test:e2e -- --list
npm run test:e2e:smoke
npm run test:e2e:regression -- --project=chromium-mobile
npm run test:e2e:nightly
```

When `E2E_CAPTURE_SUCCESS_ARTIFACTS=1`, Playwright keeps `trace` and `video` even for passing tests. The default remains `retain-on-failure`.
When `E2E_PROJECT=chromium-mobile`, local smoke runs stay on Chromium without needing `--project=chromium-mobile`.

## Notes

- `tests/e2e/specs/meal-production.manual-scenarios.spec.ts` is the source of truth for Meal Production automation.
- Scenario titles map to the workbook scenario numbers so manual and automated coverage stay aligned.
- Implemented scenarios keep `@smoke` / `@regression` tags for targeted runs.
- Remaining workbook scenarios are kept as explicit pending tests instead of separate ad hoc spec files.
- `npm run test:e2e:nightly` is intended for non-blocking Chromium, Firefox, and WebKit runs against staging.

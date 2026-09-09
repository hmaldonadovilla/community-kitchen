# Community Café staging onboarding

## Design and scope

Production already contains an active Customer Management record named Community Café with nickname `Café`. The Meal Production customer field loads active customers from `Distributor Data`, while its creation shortcuts are separate configured `BUTTON` questions. Its automatic choice layout renders four customers as radio buttons.

Use the existing configuration mechanisms: add a `createRecordPreset` shortcut with `MP_DISTRIBUTOR: "Café"` and set `MP_DISTRIBUTOR.ui.control` to `select`. Keep the customer data source, validation, change confirmation, and later-step clearing behavior intact. No new runtime feature or schema property is required.

The existing dietary-category filters also require a customer entry: unmatched customers receive no meal options. Enable all four existing categories (Standard, Vegetarian, Vegan, Diabetic) for Café for both services, including leftover capture, because no Café-specific restriction was requested. Update the normalized filters and their raw configuration representations together.

## Implementation slices

1. Inspect the production customer without modifying it, then create an equivalent active customer through staging Customer Management, preserving the supplied contact details and empty optional fields.
2. Update both question representations in the staging Meal Production export. Add the Café shortcut after Le Phare and select the dropdown control for Customer.
3. Run the required lint, TypeScript, test, and build gates. Deploy through `DEPLOY_ENV=staging CK_CONFIG_ENV=staging npm run deploy:firebase-web-app` using the existing deployment configuration.
4. Refresh staging and use Playwright to verify the customer, all four shortcuts, Café preselection, customer switching, and advancement from Order into the leftover workflow. Check desktop and narrow-screen layouts. Do not trigger report emails as part of this onboarding check.

## Promotion gate

Production configuration and deployment remain unchanged until the user confirms successful staging testing and explicitly requests promotion. The production customer already exists and must not be duplicated during promotion.

## Deployment and validation

- Work branch: `codex/community-cafe-staging`.
- Staging customer created through Customer Management and confirmed Active. Its name, nickname, email, phone, address, city, postal code, and empty optional fields match the production record.
- Required changed-line lint and TypeScript checks passed. The full suite passed with 345 suites and 1,999 tests before the dietary-filter addition; the final relevant regression run passed all 28 tests, including the four new configuration/runtime checks. The full suite emitted the pre-existing worker-teardown warning.
- Final staging deployment: existing Apps Script deployment version 669, with Firebase assets deployed first. Build, bundle-size, and all 11 browser-bundle compatibility checks passed. The deploy reused the completed test run with `SKIP_TESTS=1`; deployment lint and builds ran normally.
- Staging's initial page definition retained the previous dietary filters after deployment even though `fetchFormConfig` returned the updated filters. Called the existing staging `invalidateWebAppCache` operation and verified the refreshed initial definition contains the Café categories.
- Playwright verified all four shortcuts, Café preselection, a native Customer dropdown containing all four customers, switching before date entry, and cancellation of the guarded customer change after saving. Cancelling preserved Café and the order quantities.
- Saved and reopened test order `MP-AA001785` (record `e5f88fe1-9ced-4bac-a667-13ccc2c64b67`), Café / Dinner / 2026-09-09, with 10 Standard portions and zero in other categories. The order advanced to Leftover bank. No available leftovers existed, so allocation was not exercised. No report or email was generated.

## Separate date-list issue observed during validation

The saved record returns the correct form date `2026-09-09`. The list API returns its spreadsheet date as `2026-09-08T22:00:00.000Z` (midnight in Brussels). The existing client-side date filtering interprets this timestamp in the browser's timezone: the record is hidden for September 9 in America/Bogota, but appears as Café / Dinner with an Edit action in Europe/Brussels. This was verified by changing only the isolated Playwright session's timezone, including the app iframe's process.

No date-handling runtime code was changed as part of this onboarding. When reviewing from Bogotá, the saved test order can also be reopened through Café, date September 9, Dinner, then Open existing record in the duplicate dialog.

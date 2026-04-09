# Frontend Test Automation Design

## Purpose

This document defines the recommended frontend automation framework, test authoring procedure, and CI/CD integration for Community Kitchen staging deployments.

The design is based on the current codebase and on the reviewed manual script catalog in `docs/test-automation/test_scripts.csv`.

## Reviewed input

Source reviewed:

- `docs/test-automation/test_scripts.csv`
- `.github/workflows/deploy-apps-script.yml`
- `scripts/deploy-apps-script.sh`
- `scripts/performance/scenario-runner.js`

Summary of the reviewed CSV:

- `41` scenarios are listed.
- `29` scenarios are marked `OK`.
- `1` scenario is marked `Script is outdated`.
- `5` scenarios are marked `OK but Script is outdated`.
- `6` scenarios are marked `Not run because script is outdated`.
- Scenario IDs `26` and `28` are missing from the numbering.

## Key findings from the script review

The current script list is a strong business test catalog, but it is not yet in a shape that should be automated one-to-one.

Main findings:

- The scenarios are concentrated on the `Meal Production` flow and represent the right business-critical area for release gating.
- Many rows contain several separate assertions across multiple screens. They should be decomposed into smaller automated cases.
- Several scripts explicitly say they are outdated, especially in the `Leftover` area. Those should not be used as release-gating acceptance criteria until they are rewritten.
- A number of scripts depend on relative dates like `today`, `future date`, and `Sunday`. The automated suite should resolve these at runtime into concrete dates.
- Some scenarios require seeded data, cleanup, or both. This must be designed into the framework rather than handled ad hoc.
- Some current browser automation in `scripts/performance/scenario-runner.js` relies on brittle text probing and fallback selectors. The regression suite should use stricter locators and dedicated test hooks where needed.

## Executive decision

The recommended frontend automation stack is:

- `Playwright Test`
- `TypeScript`
- `Chromium` as the release gate browser
- optional `WebKit` and `Firefox` for nightly or non-blocking coverage

This is the correct default for this repository because:

- the repo already uses `playwright`
- the existing performance automation already runs through Playwright
- the project is Node-based end to end
- CI setup is already centered on `npm ci`

The recommendation is to keep performance scripts and frontend regression scripts in the same browser ecosystem, but not in the same test runner layer.

That means:

- keep `scripts/performance/*.js` for performance measurements
- add a separate `Playwright Test` suite for functional and UX regression checks
- share small helper utilities only where the code is truly generic

## Scope of the automated suite

The new suite should cover frontend regression risks that are meaningful for staging release decisions:

- page loads and core navigation
- field visibility and editability rules
- destructive-change warnings
- deduplication flows
- progression gates between Order, Production, Food Safety, Portioning, Summary, and Final Report
- required uploads and required confirmations
- report and summary correctness for key fields
- future-date restrictions

The suite should not try to automate everything on day one.

The first release-gating scope should be a compact smoke pack built from stable, high-value scenarios. Broader coverage can run nightly or as a non-blocking post-deploy job.

## Test tiers

### Tier 1: release-gating smoke tests

These tests run after every staging deployment and must pass before the deployment is considered healthy.

Recommended initial coverage from the CSV:

- `1` order page calculations and destructive-change dialogs
- `5` duplicate record detection
- `9` ready-for-production lock behavior
- `13` negative requested portions blocked
- `14` cannot progress without ordered portions
- `32` cannot proceed without recipes and ingredient receipt evidence
- `33` food safety confirmation and photo requirements
- `34` delivered portions default to ordered portions
- `35` delivered portions cannot be below ordered portions
- `36` summary view shows expected record data
- `37` final report shows expected rendered output
- `38` future-dated records cannot capture production evidence or be submitted
- `39` changing production date after later steps deletes subsequent data
- `41` changing service after later steps deletes subsequent data

### Tier 2: broader regression tests

These tests should run on a schedule, on demand, or after high-risk changes. They are useful, but they should not block every staging deployment at the start.

Recommended candidates:

- `2`, `3`, `6`, `10`, `11`, `12`, `18`, `19`, `20`, `21`, `22`, `23`, `31`, `40`, `42`

### Tier 3: remediation backlog

These scenarios should be rewritten before automation because the CSV explicitly marks them outdated or not currently runnable:

- `4`, `7`, `8`, `15`, `16`, `17`, `24`, `25`, `27`, `29`, `30`, `43`

## Framework design

### Proposed repository structure

```text
playwright.config.ts
tests/e2e/
  fixtures/
    env.ts
    mealProduction.ts
  helpers/
    appFrame.ts
    dates.ts
    uploads.ts
    assertions.ts
    cleanup.ts
  specs/
    meal-production.smoke.spec.ts
    meal-production.regression.spec.ts
    reports.spec.ts
    navigation.spec.ts
  data/
    uploads/
      ingredient-receipt-1.jpg
      pot-photo-1.jpg
      pot-photo-2.jpg
  README.md
playwright-report/
test-results/
```

### Test design principles

Use these rules consistently:

- Prefer `getByRole`, `getByLabel`, and explicit accessible names.
- Add `data-testid` only where the UI is dynamic enough that role and label selectors are not stable.
- Keep locators close to the behavior under test. Do not build one massive global page object.
- Extract reusable flow helpers for repeated business steps such as:
  - create meal production record
  - enter ordered portions
  - lock record for production
  - upload ingredient receipt evidence
  - complete food safety step
  - complete portioning step
- Keep assertions business-facing. Verify outcomes, not implementation details.
- Record Playwright traces, screenshots, and video on failure.

### Selector strategy

The current codebase has many accessible labels and ARIA hooks already, especially in the React form and list views. That is a good base. Even so, a few controls in the most complex flows will likely need dedicated test hooks.

Recommended selector policy:

- first choice: accessible role + name
- second choice: field label text
- third choice: `data-testid`
- avoid raw CSS selectors tied to styling classes
- avoid text fragments for controls whose copy is likely to change often

Recommended convention for any newly added hooks:

- `data-testid="order-customer"`
- `data-testid="order-service"`
- `data-testid="ready-for-production"`
- `data-testid="ingredient-receipt-upload"`
- `data-testid="summary-panel"`
- `data-testid="final-report"`

### Environment model

The suite should run against a deployed staging URL, not against a local mock.

Required runtime inputs:

- `E2E_BASE_URL`
- `E2E_FORM_KEY_MEAL_PRODUCTION`
- `E2E_HEADLESS`
- `E2E_ADMIN_ENABLED` if admin mode is required for stable navigation

Optional runtime inputs:

- `E2E_USERNAME` and `E2E_PASSWORD` only if the staging front door becomes authenticated later
- `E2E_ARTIFACT_DIR`
- `E2E_DEBUG`

### Test data strategy

This is the most important operational part of the design.

Rules:

- Use a dedicated staging dataset.
- Use deterministic seed records where the scenario needs an existing record.
- Use unique runtime suffixes for records created by automation.
- Always clean up records created by tests where the flow allows deletion.
- Where direct cleanup is difficult, isolate test data by staging workbook, customer, or tagged record fields.

Recommended approach:

- maintain one staging-only workbook and config export for automation
- use a dedicated set of known customers and recipes for E2E
- keep one helper responsible for locating and deleting test-created records
- reuse ideas from the current performance runner teardown, but keep the E2E cleanup code independent from the performance harness

### Date handling

The manual scripts use relative dates. Automation must resolve those at runtime.

Required helpers:

- `today()`
- `futureDate(daysAhead)`
- `nextSunday()`

The test report should log the absolute date used in each run so failures are diagnosable.

### Upload handling

Several scenarios require ingredient receipt and food safety photos.

Recommended approach:

- store small static fixture images in `tests/e2e/data/uploads/`
- use Playwright file upload APIs
- verify both upload success and the gating behavior that depends on the upload

## Authoring and maintenance procedure

### Step 1: normalize the manual catalog

Keep `docs/test-automation/test_scripts.csv` as the business input, but do not automate directly from it.

Create a maintained automation backlog with these fields:

- script ID
- business title
- current manual status
- automation tier
- automation status
- blocking dependencies
- notes on stale wording

The main goal is to separate:

- approved release-gating scenarios
- broader regression scenarios
- outdated scenarios that need business review first

### Step 2: decompose each script

Any script that spans several screens should be broken into smaller executable cases.

Example:

- script `1` should become separate tests for:
  - requested portions total calculation
  - service-change destructive warning
  - date-change destructive warning
  - incomplete record home-navigation warning

This gives better failure isolation and lower rerun cost.

### Step 3: implement helpers before broad coverage

Build reusable helpers for:

- open landing page
- enter a meal production order
- navigate between steps
- handle confirmation dialogs
- upload fixture files
- open summary and final report
- clean up created records

Do this before building many spec files. Without these helpers, the suite will become repetitive and fragile.

### Step 4: stabilize selectors where needed

If an important flow cannot be targeted reliably with accessible locators, add minimal `data-testid` hooks in the UI. Do not work around unstable selectors with long CSS chains.

### Step 5: keep release gates small

The smoke pack should stay small enough to finish quickly on every staging deployment.

Target:

- under `10` minutes total runtime
- parallel execution where safe
- one browser for gating

### Step 6: use nightly regression for depth

Longer and more stateful flows should run on schedule or on demand:

- leftover scenarios
- report-content combinations
- multi-record workflows
- wider cross-browser coverage

## CI/CD integration design

### Current state

The current deployment workflow is in `.github/workflows/deploy-apps-script.yml`.

Today it:

- checks out the repo
- runs `npm ci`
- configures `clasp`
- runs `bash scripts/deploy-apps-script.sh`

The deployment script already runs lint and unit tests before deploy, and it prints the deployed web app URL after deployment.

### Recommended pipeline shape

The frontend regression suite should run after deployment to staging and before any later promotion decision.

Recommended job order:

1. `build-and-unit-test`
2. `deploy-staging`
3. `e2e-smoke-staging`
4. `performance-staging`
5. optional `promote` or manual approval

Rules:

- if `e2e-smoke-staging` fails, the deployment is marked unhealthy
- if `performance-staging` fails agreed thresholds, the deployment is marked unhealthy
- artifacts from both jobs must be uploaded

### Recommended GitHub Actions behavior

Post-deploy E2E job should:

- install Playwright browser dependencies
- run the smoke suite against the deployed staging URL
- upload `playwright-report` and `test-results`
- keep traces and screenshots for failed tests

Post-deploy performance job should:

- run the existing Lighthouse script
- run the existing scenario performance script
- upload JSON result files as artifacts

### Proposed workflow responsibilities

`deploy-apps-script.yml` can either be extended or split into a reusable staging workflow.

The cleaner long-term shape is:

- keep deployment in one job
- add separate post-deploy jobs with `needs: deploy`
- pass the deployed URL as a job output

### Example workflow outline

```yaml
jobs:
  deploy:
    runs-on: ubuntu-latest
    outputs:
      webapp_url: ${{ steps.deploy.outputs.webapp_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: bash scripts/deploy-apps-script.sh
      - id: deploy
        run: echo "webapp_url=https://script.google.com/macros/s/${CLASP_DEPLOYMENT_ID}/exec" >> "$GITHUB_OUTPUT"

  e2e-smoke:
    runs-on: ubuntu-latest
    needs: deploy
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run test:e2e:staging
        env:
          E2E_BASE_URL: ${{ needs.deploy.outputs.webapp_url }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: playwright-report
          path: |
            playwright-report
            test-results

  performance:
    runs-on: ubuntu-latest
    needs: deploy
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npm run perf:lighthouse -- --url="$E2E_BASE_URL" --runs=3 --preset=mobile-4g --output=perf-results/lighthouse-staging.json
        env:
          E2E_BASE_URL: ${{ needs.deploy.outputs.webapp_url }}
      - run: npm run perf:scenario -- --url="$E2E_BASE_URL" --formKey="Config: Meal Production" --runs=3 --preset=mobile-4g --output=perf-results/scenario-staging.json
        env:
          E2E_BASE_URL: ${{ needs.deploy.outputs.webapp_url }}
      - uses: actions/upload-artifact@v4
        if: always()
        with:
          name: perf-results
          path: perf-results
```

### Release policy

Recommended initial release rule:

- unit tests must pass before deploy
- staging deploy must succeed
- Tier 1 Playwright smoke tests must pass
- performance thresholds must remain within agreed limits

If any of the above fail:

- do not promote automatically
- keep artifacts
- require investigation before rerun or rollback

## Proposed npm scripts

Recommended additions to `package.json`:

```json
{
  "scripts": {
    "test:e2e": "playwright test",
    "test:e2e:headed": "playwright test --headed",
    "test:e2e:smoke": "playwright test --grep @smoke",
    "test:e2e:staging": "playwright test --grep @smoke",
    "test:e2e:nightly": "playwright test"
  }
}
```

Tagging guidance:

- mark release-gating tests with `@smoke`
- mark outdated or unstable coverage with `@quarantine` only if there is a short-term reason to keep the code checked in but non-blocking

## Implementation phases

### Phase 1

Deliver the minimum viable release gate:

- add `playwright.config.ts`
- add `tests/e2e` framework skeleton
- add fixture upload assets
- automate Tier 1 smoke coverage for the most stable scenarios
- add post-deploy E2E smoke job in GitHub Actions

### Phase 2

Expand regression depth:

- automate Tier 2 scenarios
- add cross-browser non-blocking runs
- improve cleanup and test-data seeding
- add targeted `data-testid` hooks where required

### Phase 3

Remediate outdated business scripts:

- rewrite stale leftover scenarios with product owners
- replace obsolete wording in the CSV
- decide which leftover paths become gating and which remain nightly-only

## Open items that should be resolved before implementation

- confirm the exact staging URL source for the post-deploy job
- confirm whether the staging environment has a dedicated data set for automation
- confirm whether automation is allowed to create and delete records freely in staging
- confirm whether the release gate should be `Chromium only` at first
- review the outdated leftover scenarios with the business owner before automating them

## Final recommendation

Implement a Playwright Test suite in TypeScript as a post-deploy staging gate, keep the current performance scripts in place, and use the CSV as a business backlog rather than as a direct test specification.

The correct first milestone is not full coverage. It is a stable smoke pack for the `Meal Production` flow that fails fast when a deployment breaks the user journey.
